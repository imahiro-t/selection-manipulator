/**
 * Pure (vscode-independent) implementations of the Markdown commands MD-001..025 and their
 * command table (MD-019 is in `mdToHtml.ts`).
 *
 * The rules shared by all commands are:
 * - Every command works on the text of the whole document and the selections as offset ranges
 *   in document order, and returns the edits to make in one step (with the selections to set
 *   after them), an information message, or nothing. A command that fails for one selection
 *   throws `MdInputError`, and nothing is changed.
 * - Most commands transform the text of each selection independently (multiple cursors). Three
 *   commands look at the whole document: MD-003 (the anchors of repeated headings are numbered
 *   over the whole document; a cursor inserts the table of contents of the whole document),
 *   MD-022 (the footnote definitions go to the end of the document, numbered after the existing
 *   ones) and MD-023 (the reference numbers follow the existing numeric definitions). Their
 *   numbers run in document order over all selections.
 * - Empty selections are ignored, except by MD-003. A selection whose text would not change is
 *   not edited. After the edit, each edited selection selects its new text (MD-022: the new
 *   `[^n]`), the others stay as they were.
 * - Lines are split at LF, CRLF or CR and joined with the document's line break; every line
 *   break a command writes is the document's. The line commands do not count one line break at
 *   the end of a selection as a line and keep it as it is.
 * - What a command writes as a block never shares a line with other text, even when a selection
 *   starts or ends inside a line: line breaks are added around MD-003's list, MD-014's fences and
 *   MD-024's tags, and MD-023 writes its definitions after the end of the line (see each). The
 *   spaces and tabs where a line is split are dropped. A block that the next line would
 *   otherwise continue (MD-003's list, MD-024's HTML block) is followed by a blank line when
 *   text follows it on its line or on the next line, and MD-003's list also has a blank line
 *   before it when text comes before it (MD-014's closing fence and MD-023's definitions end by
 *   themselves).
 * - The heading and list commands (MD-001..003, 009, 013, 020, 021) leave the lines of fenced
 *   code blocks alone.
 * - The results of all selections together may be at most `MAX_OUTPUT_LENGTH` characters.
 * - The regular expressions are fixed, anchored or simple, without nested quantifiers; brackets,
 *   emphasis and code spans are matched with loops (see `mdCommon.ts` / `mdInline.ts`). User
 *   input (language, alt text, summary) is validated and escaped, and never used as a regular
 *   expression.
 *
 * Only local processing: no network, files or processes, no `eval` / `new Function`, no new
 * dependency (`js-yaml` was already used by other commands).
 */
import * as yaml from 'js-yaml';
import {
  assertInputLength,
  DataInputError,
  inspectGraph,
  JsonValue,
  stringifyCompact,
} from './dataCommon';
import { YAML_MAX_ALIAS_WORK } from './dataTransforms';
import { EncOutputTooLargeError, MAX_OUTPUT_LENGTH } from './encodeTransforms';
import { formatNumber } from './lineTransforms';
import {
  codeSpans,
  escapeHtml,
  escapeLinkText,
  FENCE_LANGUAGE_MAX_LENGTH,
  fenceRoles,
  findInlineLinks,
  githubSlug,
  indentWidth,
  InlineLink,
  isBlank,
  isFenceLanguage,
  isLineBreak,
  isQuoteLine,
  isSpaceOrTab,
  isThematicBreak,
  joinLines,
  LineContext,
  lineSpans,
  ListItemLine,
  MdEol,
  parseAtxHeading,
  parseListItem,
  setextLevel,
  SlugCounter,
  splitEdges,
  splitLines,
  splitTrailingBreaks,
} from './mdCommon';
import { inlineToPlain, parseInline } from './mdInline';
import { mdToHtml } from './mdToHtml';
import { trimUrl } from './mselTransforms';
import { codePointWidth } from './whitespaceTransforms';

// ---------------------------------------------------------------------------
// Types, limits and errors
// ---------------------------------------------------------------------------

/** A selection as offsets into the document text (`start <= end`). */
export interface MdRange {
  start: number;
  end: number;
  /** The cursor (active end) is at `start`. */
  reversed?: boolean;
}

/** Replaces `[start, end)` of the document (before the edit) with `text`. */
export interface MdEdit {
  start: number;
  end: number;
  text: string;
}

export type MdResult =
  /** Applies the edits in one step, then sets the selections (offsets after the edit). */
  | { kind: 'edit'; edits: MdEdit[]; ranges: MdRange[] }
  /** Shows an information message and changes nothing. */
  | { kind: 'info'; message: string }
  /** Changes nothing and says nothing. */
  | { kind: 'unchanged' };

/** An input or a selection that a command cannot use (reported as a warning; nothing is changed). */
export class MdInputError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'MdInputError';
  }
}

/** MD-016 / 024: the alt text and the summary. */
export const MD_LABEL_MAX_LENGTH = 1000;

export const MD_NO_HEADINGS = 'No headings were found.';

const UNCHANGED: MdResult = { kind: 'unchanged' };

const assertOutputLength = (length: number): void => {
  if (length > MAX_OUTPUT_LENGTH) {
    throw new MdInputError(`the result would be longer than ${formatNumber(MAX_OUTPUT_LENGTH)} characters; select less text`);
  }
};

/**
 * Replaces the text of each selection with `replacements[i]` (`undefined` = leave it) in one edit;
 * the replaced selections then select their new text.
 */
export const replaceSelections = (text: string, ranges: readonly MdRange[], replacements: readonly (string | undefined)[]): MdResult => {
  const edits: MdEdit[] = [];
  const after: MdRange[] = [];
  let shift = 0;
  let total = 0;
  ranges.forEach((range, i) => {
    const value = replacements[i];
    if (value === undefined || value === text.slice(range.start, range.end)) {
      after.push({ start: range.start + shift, end: range.end + shift, reversed: range.reversed });
      return;
    }
    total += value.length;
    edits.push({ start: range.start, end: range.end, text: value });
    const start = range.start + shift;
    after.push({ start, end: start + value.length });
    shift += value.length - (range.end - range.start);
  });
  if (edits.length === 0) {
    return UNCHANGED;
  }
  assertOutputLength(total);
  return { kind: 'edit', edits, ranges: after };
};

/** What shares the lines of a selection's ends (for the commands that write whole-line blocks). */
export interface LineEdges {
  /** There is text other than spaces and tabs before the selection on the line where it starts. */
  textBefore: boolean;
  /**
   * There is text other than spaces and tabs after the selection on the line where it ends (for a
   * selection that ends with a line break, that is the next line).
   */
  textAfter: boolean;
  /** The line after the line where the selection ends has text other than spaces and tabs. */
  textOnNextLine: boolean;
}

const NO_LINE_EDGES: LineEdges = { textBefore: false, textAfter: false, textOnNextLine: false };

/** A command that transforms the text of every non-empty selection on its own. */
type SelectionTransform = (value: string, eol: MdEol, inputs: readonly string[], edges: LineEdges) => string;

/**
 * Whether a selection `[start, end)` ends inside a line (so that a line break written after it
 * splits the line): it does not end with a line break, and it is not a cursor at a line start.
 */
const endsInsideLine = (text: string, end: number): boolean => end > 0 && !isLineBreak(text[end - 1]);

/**
 * Where to edit a selection `[start, end)` whose result starts a new line before it
 * (`breakBefore`) or splits its line after it (`breakAfter`): the spaces and tabs at the split
 * are taken into the edit, so that the split lines do not keep them at their end or start. The
 * edit does not reach before `floor` (the end of the previous selection's edit) or after
 * `ceiling` (the start of the next selection). The spaces read are next to one selection each,
 * so this is linear over all the selections.
 */
const editRange = (text: string, range: MdRange, breakBefore: boolean, breakAfter: boolean, floor: number, ceiling: number): MdRange => {
  let start = range.start;
  if (breakBefore) {
    while (start > floor && isSpaceOrTab(text[start - 1])) {
      start--;
    }
  }
  let end = range.end;
  if (breakAfter) {
    while (end < ceiling && isSpaceOrTab(text[end])) {
      end++;
    }
  }
  return start === range.start && end === range.end ? range : { start, end, reversed: range.reversed };
};

/**
 * Where the spaces and tabs right before `offset` start (not before `floor`): with no text
 * before `offset` on its line, that is the indentation of the line.
 */
const indentStart = (text: string, offset: number, floor: number): number => {
  let start = offset;
  while (start > floor && isSpaceOrTab(text[start - 1])) {
    start--;
  }
  return start;
};

/**
 * Runs `transform` on every non-empty selection (with `lineEdges`, it is told what shares the
 * lines of the selection's ends, and the spaces and tabs where it splits a line are taken into
 * the edit; otherwise it gets `NO_LINE_EDGES`). With `lineEdges`, when nothing precedes the
 * selection on its line and the indentation there is 4 columns or more (a tab counts to the next
 * multiple of 4), that indentation is taken into the edit too (not before the previous
 * selection's edit), so that the block written does not start with it and is not read as an
 * indented code block; up to 3 columns stay. The changed results are counted as they are made,
 * so that the output limit stops a run before all of them are built.
 */
const perSelection = (transform: SelectionTransform, lineEdges = false) => ({ text, ranges, eol, inputs }: MdContext): MdResult => {
  const lines = lineEdges ? new LineContext(text) : undefined;
  let total = 0;
  let floor = 0;
  const edited: MdRange[] = [];
  const replacements = ranges.map((range, i) => {
    edited.push(range);
    if (range.start === range.end) {
      floor = range.end;
      return undefined;
    }
    const value = text.slice(range.start, range.end);
    const edges = lines === undefined
      ? NO_LINE_EDGES
      : { textBefore: lines.textBefore(range.start), textAfter: lines.textAfter(range.end), textOnNextLine: lines.textOnNextLine(range.end) };
    const replacement = transform(value, eol, inputs, edges);
    if (replacement !== value) {
      total += replacement.length;
      assertOutputLength(total);
      if (lines !== undefined) {
        const ceiling = i + 1 < ranges.length ? ranges[i + 1].start : text.length;
        const breakBefore = edges.textBefore || indentWidth(text.slice(indentStart(text, range.start, floor), range.start)) >= 4;
        edited[i] = editRange(text, range, breakBefore, edges.textAfter && endsInsideLine(text, range.end), floor, ceiling);
      }
    }
    floor = edited[i].end;
    return replacement;
  });
  return replaceSelections(text, edited, replacements);
};

/** Applies `transform` to the lines of `value` (one trailing line break kept as it is). */
const mapLines = (value: string, eol: MdEol, transform: (lines: string[]) => string[]): string => {
  const { lines, trailing } = splitLines(value);
  return joinLines(transform(lines), eol, trailing);
};

/** Applies `transform` to every line that is not part of a fenced code block. */
const mapTextLines = (value: string, eol: MdEol, transform: (line: string) => string): string =>
  mapLines(value, eol, (lines) => {
    const roles = fenceRoles(lines);
    return lines.map((line, i) => (roles[i] === 'text' ? transform(line) : line));
  });

/** The plain text of a heading (for its slug): the inline markup removed. */
const plainText = (markdown: string): string => inlineToPlain(parseInline(markdown));

// ---------------------------------------------------------------------------
// MD-001, 002, 013, 021: headings
// ---------------------------------------------------------------------------

/** MD-001: one more `#` (`######` stays); a non-heading line becomes a level-1 heading. */
export const increaseHeadingLevel: SelectionTransform = (value, eol) => mapTextLines(value, eol, (line) => {
  if (isBlank(line)) {
    return line;
  }
  const heading = parseAtxHeading(line);
  if (heading === undefined) {
    return `# ${line.trimStart()}`;
  }
  return heading.level >= 6 ? line : `${line.slice(0, heading.hashStart)}#${line.slice(heading.hashStart)}`;
});

/** MD-002: one `#` less; a level-1 heading becomes its text. Other lines stay. */
export const decreaseHeadingLevel: SelectionTransform = (value, eol) => mapTextLines(value, eol, (line) => {
  const heading = parseAtxHeading(line);
  if (heading === undefined) {
    return line;
  }
  return heading.level === 1 ? line.slice(0, heading.hashStart) + heading.text : line.slice(0, heading.hashStart) + line.slice(heading.hashStart + 1);
});

/**
 * MD-013: a paragraph underlined with `===` becomes `# …`, with `---` `## …` (the lines of a
 * multi-line paragraph are joined with a space). A `---` without a paragraph above it is a
 * thematic break and stays.
 */
export const setextToAtx: SelectionTransform = (value, eol) => mapLines(value, eol, (lines) => {
  const roles = fenceRoles(lines);
  const out: string[] = [];
  let paragraph: string[] = [];
  const flush = (): void => {
    for (const line of paragraph) {
      out.push(line);
    }
    paragraph = [];
  };
  lines.forEach((line, i) => {
    if (roles[i] !== 'text' || isBlank(line)) {
      flush();
      out.push(line);
      return;
    }
    const level = setextLevel(line);
    if (level !== undefined && paragraph.length > 0) {
      out.push(`${'#'.repeat(level)} ${paragraph.map((part) => part.trim()).join(' ')}`);
      paragraph = [];
      return;
    }
    if (parseAtxHeading(line) !== undefined || isThematicBreak(line) || isQuoteLine(line) || parseListItem(line) !== undefined) {
      flush();
      out.push(line);
      return;
    }
    paragraph.push(line);
  });
  flush();
  return out;
});

/** The text of a heading line (a line without `#` is a heading as a whole). */
const headingTextOf = (line: string): string => parseAtxHeading(line)?.text ?? line.trim();

/** A link to the GitHub-style anchor of a heading text. */
const anchorLink = (text: string, slug: string): string => `[${escapeLinkText(text)}](#${slug})`;

/** MD-021: every heading line (or any non-blank line) becomes `[text](#slug)`. */
export const headingToAnchor: SelectionTransform = (value, eol) => mapTextLines(value, eol, (line) => {
  const text = headingTextOf(line);
  return text === '' ? line : anchorLink(text, githubSlug(plainText(text)));
});

// ---------------------------------------------------------------------------
// MD-003: table of contents
// ---------------------------------------------------------------------------

interface DocumentHeading {
  /** The line of the heading as offsets. */
  start: number;
  end: number;
  level: number;
  text: string;
  /** The anchor, unique in the document. */
  slug: string;
  /** Its entry in a table of contents (without the indentation): `- [text](#slug)`. */
  entry: string;
}

/** The ATX headings of the document (outside fenced code) with their unique anchors, in order. */
export const documentHeadings = (text: string): DocumentHeading[] => {
  const spans = lineSpans(text);
  const roles = fenceRoles(spans.map(({ start, end }) => text.slice(start, end)));
  const slugs = new SlugCounter();
  const headings: DocumentHeading[] = [];
  spans.forEach(({ start, end }, i) => {
    if (roles[i] !== 'text') {
      return;
    }
    const heading = parseAtxHeading(text.slice(start, end));
    if (heading === undefined || heading.text === '') {
      return;
    }
    const slug = slugs.unique(githubSlug(plainText(heading.text)));
    headings.push({ start, end, level: heading.level, text: heading.text, slug, entry: `- ${anchorLink(heading.text, slug)}` });
  });
  return headings;
};

/**
 * The table of contents of some headings (in document order). An entry is nested under the
 * nearest earlier entry of a lower level, and only one step (2 spaces) deeper than it, however
 * many levels are skipped: deeper indentation would make CommonMark read the line as a
 * continuation of the item above. `used` characters of output are already made: the output
 * limit is checked before the text is built.
 */
const tableOfContents = (headings: readonly DocumentHeading[], eol: MdEol, used: number): string => {
  const open: number[] = [];
  const depths = headings.map((heading) => {
    while (open.length > 0 && open[open.length - 1] >= heading.level) {
      open.pop();
    }
    open.push(heading.level);
    return open.length - 1;
  });
  const length = headings.reduce((sum, heading, i) => sum + 2 * depths[i] + heading.entry.length, 0) + (headings.length - 1) * eol.length;
  assertOutputLength(used + length);
  return headings.map((heading, i) => `${'  '.repeat(depths[i])}${heading.entry}`).join(eol);
};

/** The line break that ends `text` ("\r\n" is one), or '' when it does not end with one. */
const finalLineBreak = (text: string): string =>
  text.endsWith('\r\n') ? '\r\n' : isLineBreak(text[text.length - 1]) ? text[text.length - 1] : '';

/**
 * MD-003: a selection is replaced with the table of contents of the headings in it (a selection
 * without headings is left); a cursor inserts the table of contents of the whole document. The
 * anchors of repeated headings are numbered over the whole document. The list is a block of its
 * own, with a blank line (or the start / end of the text) before and after it: a blank line is
 * added before it when text comes before it on its line or on the line before, and after it when
 * text follows it on its line or on the line after (a text line right after the list would
 * continue its last item, and a list item right before it would take it into its list). The
 * spaces and tabs where a line is split are dropped. When nothing comes before the list on its
 * line and the indentation there is 4 columns or more (a tab counting to the next multiple of 4),
 * the indentation is dropped too, so that the first entry is not read as an indented code block.
 * When the edit reaches the end of a text that ends with a line break, that line break is kept
 * after the list. When nothing but spaces, tabs and line breaks comes between the table of contents
 * of the previous selection and this one (the same line, or a nearby line of spaces), the two lists
 * are separated by one blank line (none is added when one is already there), and the indentation
 * before this one is dropped whatever its width, so that it is read neither as a continuation of
 * the previous list nor as a list nested in it. A selection without headings that holds nothing but
 * spaces, tabs and line breaks is seen through for this separation and for the dropped indentation
 * (as if it were not there): its spaces may be taken into the edit of the next table of contents,
 * and then it is left as a cursor at the start of what replaces them (the line breaks written
 * before that list, if any, come first). The headings of a selection are found by walking the
 * headings and the selections (both in document order) together, and the whole table of contents
 * is made once for all cursors.
 */
export const generateToc = (text: string, ranges: readonly MdRange[], eol: MdEol): MdResult => {
  const headings = documentHeadings(text);
  const lines = new LineContext(text);
  let whole: string | undefined;
  let total = 0;
  let next = 0;
  /** The table of contents for one selection (in order), or undefined when it has no headings. */
  const tocOf = (range: MdRange): string | undefined => {
    let toc: string | undefined;
    if (range.start === range.end) {
      whole ??= headings.length === 0 ? undefined : tableOfContents(headings, eol, 0);
      toc = whole;
    } else {
      // The first heading that ends after this selection starts (the selections are in order).
      while (next < headings.length && headings[next].end <= range.start) {
        next++;
      }
      let last = next;
      while (last < headings.length && headings[last].start < range.end) {
        last++;
      }
      toc = last === next ? undefined : tableOfContents(headings.slice(next, last), eol, total);
    }
    return toc;
  };
  let floor = 0;
  /** What was written after the table of contents of the previous selection (undefined when it had none). */
  let previousAfter: string | undefined;
  const edited: MdRange[] = [];
  /** The selections of only spaces, tabs and line breaks without a table of contents since the last one that had one or had other text. */
  let blanks: number[] = [];
  const replacements = ranges.map((range, i) => {
    edited.push(range);
    const toc = tocOf(range);
    if (toc === undefined) {
      if (/^[ \t\r\n]*$/.test(text.slice(range.start, range.end))) {
        // Seen through: the previous table of contents (or the start of the text) stays the limit.
        blanks.push(i);
      } else {
        floor = range.end;
        previousAfter = undefined;
        blanks = [];
      }
      return undefined;
    }
    const textBefore = lines.textBefore(range.start);
    const textAfter = lines.textAfter(range.end);
    let before = textBefore ? eol + eol : lines.textOnPreviousLine(range.start) ? eol : '';
    let after = textAfter ? eol + eol : lines.textOnNextLine(range.end) ? eol : '';
    // Only spaces, tabs and line breaks since the previous table of contents: one blank line between
    // the two lists (counting the line breaks already there), and no indentation before this one.
    let adjacent = false;
    if (previousAfter !== undefined) {
      const gap = text.slice(floor, range.start);
      if (/^[ \t\r\n]*$/.test(gap)) {
        adjacent = true;
        before = eol.repeat(Math.max(0, 2 - lineBreakCount(gap.replace(/[ \t]/g, '')) - lineBreakCount(previousAfter)));
      }
    }
    const ceiling = i + 1 < ranges.length ? ranges[i + 1].start : text.length;
    const breakBefore = adjacent || before !== '' || (!textBefore && indentWidth(text.slice(indentStart(text, range.start, floor), range.start)) >= 4);
    edited[i] = editRange(text, range, breakBefore, textAfter && endsInsideLine(text, range.end), floor, ceiling);
    // The spaces taken into this edit leave the selections of them: they end where the edit starts.
    const editStart = edited[i].start;
    blanks.forEach((j) => {
      const blank = edited[j];
      if (blank.end > editStart) {
        edited[j] = { start: Math.min(blank.start, editStart), end: editStart, reversed: blank.reversed };
      }
    });
    blanks = [];
    if (after === '' && edited[i].end === text.length) {
      after = finalLineBreak(text);
    }
    total += before.length + toc.length + after.length;
    assertOutputLength(total);
    floor = edited[i].end;
    previousAfter = after;
    return before + toc + after;
  });
  if (replacements.every((replacement) => replacement === undefined)) {
    return { kind: 'info', message: MD_NO_HEADINGS };
  }
  return replaceSelections(text, edited, replacements);

};

// ---------------------------------------------------------------------------
// MD-004..009, 015: lists and quotes
// ---------------------------------------------------------------------------

const leadingWhitespace = (line: string): string => line.slice(0, line.length - line.trimStart().length);

/** The parts of a line that the list commands rebuild: indentation, checkbox and text. */
const listParts = (line: string): { indent: string; checkbox?: string; rest: string; item?: ListItemLine } => {
  const item = parseListItem(line);
  return item === undefined
    ? { indent: leadingWhitespace(line), rest: line.trimStart() }
    : { indent: item.indent, checkbox: item.checkbox, rest: item.rest, item };
};

const joinParts = (...parts: (string | undefined)[]): string => parts.filter((part) => part !== undefined && part !== '').join(' ');

/** MD-004: `- ` before every non-blank line; an existing marker becomes `-`, a checkbox stays. */
export const toBulletList: SelectionTransform = (value, eol) => mapLines(value, eol, (lines) => lines.map((line) => {
  if (isBlank(line)) {
    return line;
  }
  const { indent, checkbox, rest } = listParts(line);
  return indent + joinParts('-', checkbox, rest);
}));

/** MD-005: `1. `, `2. `… before the non-blank lines (numbered through the selection); a checkbox stays. */
export const toNumberedList: SelectionTransform = (value, eol) => {
  let number = 0;
  return mapLines(value, eol, (lines) => lines.map((line) => {
    if (isBlank(line)) {
      return line;
    }
    const { indent, checkbox, rest } = listParts(line);
    number++;
    return indent + joinParts(`${number}.`, checkbox, rest);
  }));
};

/** MD-006: `- [ ] ` before every non-blank line (an existing checkbox keeps its state). */
export const toTaskList: SelectionTransform = (value, eol) => mapLines(value, eol, (lines) => lines.map((line) => {
  if (isBlank(line)) {
    return line;
  }
  const { indent, checkbox, rest } = listParts(line);
  return indent + joinParts('-', checkbox ?? '[ ]', rest);
}));

/** MD-007: `[ ]` <-> `[x]` (`[X]` counts as done); other lines stay. */
export const toggleTask: SelectionTransform = (value, eol) => mapLines(value, eol, (lines) => lines.map((line) => {
  const item = parseListItem(line);
  if (item?.checkbox === undefined) {
    return line;
  }
  const toggled = item.checkbox === '[ ]' ? '[x]' : '[ ]';
  return `${item.indent}${item.marker}${item.spacing}${toggled}${item.checkboxSpacing ?? ''}${item.rest}`;
}));

/** MD-008: removes list markers, numbers and checkboxes (the indentation stays). */
export const removeListMarkers: SelectionTransform = (value, eol) => mapLines(value, eol, (lines) => lines.map((line) => {
  const item = parseListItem(line);
  return item === undefined ? line : item.indent + item.rest;
}));

/**
 * MD-009: numbers the ordered items from 1 again, per nesting level (the indentation width). A
 * shallower item ends the deeper levels, a bullet item ends an ordered list at its level, a
 * non-list line without indentation ends every list; blank lines end nothing.
 */
export const renumberList: SelectionTransform = (value, eol) => mapLines(value, eol, (lines) => {
  const roles = fenceRoles(lines);
  const levels: { width: number; count: number }[] = [];
  return lines.map((line, i) => {
    if (roles[i] !== 'text' || isBlank(line)) {
      return line;
    }
    const item = parseListItem(line);
    if (item === undefined) {
      if (indentWidth(leadingWhitespace(line)) === 0) {
        levels.length = 0;
      }
      return line;
    }
    const width = indentWidth(item.indent);
    while (levels.length > 0 && levels[levels.length - 1].width > width) {
      levels.pop();
    }
    const current = levels.length > 0 && levels[levels.length - 1].width === width ? levels[levels.length - 1] : undefined;
    if (!item.ordered) {
      if (current !== undefined) {
        levels.pop();
      }
      return line;
    }
    if (current === undefined) {
      levels.push({ width, count: 1 });
    } else {
      current.count++;
    }
    const number = levels[levels.length - 1].count;
    return `${item.indent}${number}${item.delimiter}${item.spacing}${item.checkbox === undefined ? '' : item.checkbox + (item.checkboxSpacing ?? '')}${item.rest}`;
  });
});

/** MD-015: `> ` before every line (`>` for a blank line). */
export const toBlockquote: SelectionTransform = (value, eol) => mapLines(value, eol, (lines) =>
  lines.map((line) => (isBlank(line) ? '>' : `> ${line}`)));

// ---------------------------------------------------------------------------
// MD-010..012, 014, 016, 024: wrapping
// ---------------------------------------------------------------------------

/**
 * MD-010..012: surrounds the selection with `marker`; the whitespace at both ends stays outside
 * (CommonMark does not emphasize text that starts or ends with a space). A selection of
 * whitespace only is left.
 */
export const wrapInline = (marker: string): SelectionTransform => (value) => {
  const [before, core, after] = splitEdges(value);
  return core === '' ? value : `${before}${marker}${core}${marker}${after}`;
};

const hasLineBreak = (value: string): boolean => value.includes('\n') || value.includes('\r');

/** MD-014: the language may be empty, or up to 50 letters, digits and `_ + # . -`. */
export const validateLanguageInput = (value: string): string | undefined => {
  if (value.length > FENCE_LANGUAGE_MAX_LENGTH) {
    return `Enter at most ${FENCE_LANGUAGE_MAX_LENGTH} characters`;
  }
  if (!isFenceLanguage(value)) {
    return 'Use only letters, digits and _ + # . - (or leave it empty)';
  }
  return undefined;
};

/** MD-016 / 024: any text on one line, at most 1,000 characters. */
export const validateLabelInput = (value: string): string | undefined => {
  if (hasLineBreak(value)) {
    return 'Enter the text on one line';
  }
  if (value.length > MD_LABEL_MAX_LENGTH) {
    return `Enter at most ${formatNumber(MD_LABEL_MAX_LENGTH)} characters`;
  }
  return undefined;
};

/** The same rules inside the transforms (a second check, independent of the input box). */
const assertValid = (validate: (value: string) => string | undefined, value: string): void => {
  const problem = validate(value);
  if (problem !== undefined) {
    throw new MdInputError(problem);
  }
};

/**
 * MD-014: a code fence longer than any backtick run in the selection (at least 3), with the
 * language. The fences are always on lines of their own: a line break is added before the
 * opening fence when the selection starts after other text on its line, and after the closing
 * fence when other text follows the selection on its line (the spaces and tabs at such a split
 * are dropped by `perSelection`). Indentation of 4 columns or more before the opening fence is
 * dropped by `perSelection` too (it would make the fence part of an indented code block). The
 * closing fence ends the block, so text on the next line needs no blank line.
 */
export const wrapInCodeFence = (value: string, eol: MdEol, language: string, edges: LineEdges = NO_LINE_EDGES): string => {
  assertValid(validateLanguageInput, language);
  let longest = 0;
  let run = 0;
  for (const c of value) {
    run = c === '`' ? run + 1 : 0;
    longest = Math.max(longest, run);
  }
  const fence = '`'.repeat(Math.max(3, longest + 1));
  const [body, trailing] = splitTrailingBreaks(value);
  const before = edges.textBefore ? eol : '';
  const after = trailing === '' && edges.textAfter ? eol : '';
  return `${before}${fence}${language}${eol}${body}${eol}${fence}${trailing}${after}`;
};

/** Whether the parentheses of a URL are balanced (so that it can stay a bare link destination). */
const balancedParentheses = (url: string): boolean => {
  let depth = 0;
  for (const c of url) {
    if (c === '(') {
      depth++;
    } else if (c === ')') {
      depth--;
      if (depth < 0) {
        return false;
      }
    }
  }
  return depth === 0;
};

/** MD-016: `![alt](url)`; the alt text's `\ [ ]` are escaped, an unusual URL is written as `<url>`. */
export const toImage = (value: string, alt: string): string => {
  assertValid(validateLabelInput, alt);
  const [before, url, after] = splitEdges(value);
  if (url === '') {
    return value;
  }
  if (hasLineBreak(url)) {
    throw new MdInputError('the URL contains a line break; select one URL');
  }
  const escapedAlt = alt.replace(/[\\[\]]/g, (c) => `\\${c}`);
  const destination = /[\s<>]/.test(url) || !balancedParentheses(url)
    ? `<${url.replace(/</g, '%3C').replace(/>/g, '%3E')}>`
    : url;
  return `${before}![${escapedAlt}](${destination})${after}`;
};

/** The number of line breaks in a text of line breaks only. */
const lineBreakCount = (breaks: string): number => (breaks.length === 0 ? 0 : lineSpans(breaks).length - 1);

/**
 * MD-024: `<details><summary>…</summary>`, a blank line, the selection, a blank line,
 * `</details>`. The tags are always on lines of their own: a line break is added before
 * `<details>` when the selection starts after other text on its line. `</details>` is always
 * followed by a blank line (or by the end of the text) when text comes after it, whether on the
 * rest of its line or on the next line: an HTML block runs to the next blank line, so that text
 * would otherwise be part of it. Indentation of 4 columns or more before `<details>` is dropped
 * by `perSelection` (it would make the tag part of an indented code block).
 */
export const toDetails = (value: string, eol: MdEol, summary: string, edges: LineEdges = NO_LINE_EDGES): string => {
  assertValid(validateLabelInput, summary);
  const label = summary.trim() === '' ? 'Details' : escapeHtml(summary);
  const [body, trailing] = splitTrailingBreaks(value);
  const before = edges.textBefore ? eol : '';
  let after = '';
  if (trailing === '') {
    // Text on the rest of the line: split it off with a blank line. The line ends here and the
    // next line has text: make the end of this line a blank line.
    after = edges.textAfter ? eol + eol : edges.textOnNextLine ? eol : '';
  } else if (lineBreakCount(trailing) === 1 && edges.textAfter) {
    // The selection ends with its line break and the next line has text.
    after = eol;
  }
  return `${before}<details><summary>${label}</summary>${eol}${eol}${body}${eol}${eol}</details>${trailing}${after}`;
};

// ---------------------------------------------------------------------------
// MD-017: linkify URLs
// ---------------------------------------------------------------------------

const BARE_URL = /https?:\/\/[^\s<>`]+/g;
const REFERENCE_DEFINITION = /^ {0,3}\[[^\]]*\]:/;

/** Sorts and merges `[start, end)` ranges. */
const mergeRanges = (ranges: [number, number][]): [number, number][] => {
  ranges.sort((a, b) => a[0] - b[0]);
  const merged: [number, number][] = [];
  for (const range of ranges) {
    const last = merged[merged.length - 1];
    if (last !== undefined && range[0] <= last[1]) {
      last[1] = Math.max(last[1], range[1]);
    } else {
      merged.push([range[0], range[1]]);
    }
  }
  return merged;
};

/** The ranges of `value` in fenced code blocks (whole lines) and, if asked, reference definition lines. */
const blockProtectedRanges = (value: string, definitions: boolean): [number, number][] => {
  const spans = lineSpans(value);
  const roles = fenceRoles(spans.map(({ start, end }) => value.slice(start, end)));
  const ranges: [number, number][] = [];
  spans.forEach(({ start, end }, i) => {
    if (roles[i] !== 'text' || (definitions && REFERENCE_DEFINITION.test(value.slice(start, end)))) {
      ranges.push([start, end]);
    }
  });
  return ranges;
};

/** `<` … `>` on one line (autolinks and HTML tags). */
const angleRanges = (value: string): [number, number][] => {
  const ranges: [number, number][] = [];
  for (let i = value.indexOf('<'); i !== -1; i = value.indexOf('<', i + 1)) {
    for (let j = i + 1; j < value.length; j++) {
      const c = value[j];
      if (c === '>') {
        ranges.push([i, j + 1]);
        i = j;
        break;
      }
      if (c === '<' || c === '\n' || c === '\r') {
        i = j - 1;
        break;
      }
    }
  }
  return ranges;
};

/**
 * MD-017: every bare `http(s)://` URL becomes `<URL>` (without trailing punctuation and closing
 * brackets that have no opener, like Select All URLs). URLs in fenced code, code spans, `<…>`,
 * inline links and images, and reference definitions are left.
 */
export const linkifyUrls: SelectionTransform = (value) => {
  const fenced = blockProtectedRanges(value, true);
  const spans = mergeRanges([...codeSpans(value), ...fenced]);
  const links = findInlineLinks(value, spans).map((link): [number, number] => [link.start, link.end]);
  const protectedRanges = mergeRanges([...spans, ...links, ...angleRanges(value)]);
  let result = '';
  let position = 0;
  let next = 0;
  for (const match of value.matchAll(BARE_URL)) {
    const start = match.index!;
    const end = start + trimUrl(match[0]);
    while (next < protectedRanges.length && protectedRanges[next][1] <= start) {
      next++;
    }
    const schemeLength = match[0].startsWith('https') ? 'https://'.length : 'http://'.length;
    if (end - start <= schemeLength || (next < protectedRanges.length && protectedRanges[next][0] < end)) {
      continue;
    }
    result += `${value.slice(position, start)}<${value.slice(start, end)}>`;
    position = end;
  }
  return result + value.slice(position);
};

// ---------------------------------------------------------------------------
// MD-018: format table
// ---------------------------------------------------------------------------

type Alignment = 'none' | 'left' | 'center' | 'right';

const DELIMITER_CELL = /^:?-+:?$/;

/** The cells of a table row: split at `|` that is not escaped and not in a code span, trimmed. */
const tableCells = (line: string): string[] => {
  const row = line.trim();
  const spans = codeSpans(row);
  const cells: string[] = [];
  let start = 0;
  let span = 0;
  let endsWithPipe = false;
  for (let i = 0; i < row.length; i++) {
    while (span < spans.length && spans[span][1] <= i) {
      span++;
    }
    if (span < spans.length && spans[span][0] <= i) {
      i = spans[span][1] - 1;
      continue;
    }
    if (row[i] === '\\') {
      i++;
    } else if (row[i] === '|') {
      cells.push(row.slice(start, i));
      start = i + 1;
      endsWithPipe = i === row.length - 1;
    }
  }
  cells.push(row.slice(start));
  if (row.startsWith('|')) {
    cells.shift();
  }
  if (endsWithPipe && cells.length > 0) {
    cells.pop();
  }
  return cells.map((cell) => cell.trim());
};

const alignmentOf = (cell: string): Alignment => {
  const left = cell.startsWith(':');
  const right = cell.endsWith(':');
  return left && right ? 'center' : left ? 'left' : right ? 'right' : 'none';
};

const NOT_A_TABLE = 'the selection is not a Markdown table: every line needs a "|" and the second line must be the delimiter row (like |---|---|)';

/**
 * MD-018: pads the cells to the width of their column (code points; a column with an alignment
 * is at least 3 wide) and rewrites the delimiter row, keeping the alignments. Missing cells
 * become empty cells. The indentation of the first row is used for every row.
 */
export const formatTable: SelectionTransform = (value, eol) => mapLines(value, eol, (lines) => {
  if (lines.length < 2 || lines.some((line) => isBlank(line) || !line.includes('|'))) {
    throw new MdInputError(NOT_A_TABLE);
  }
  const rows = lines.map(tableCells);
  const delimiter = rows[1];
  if (delimiter.length === 0 || !delimiter.every((cell) => DELIMITER_CELL.test(cell))) {
    throw new MdInputError(NOT_A_TABLE);
  }
  const columns = rows.reduce((max, row) => Math.max(max, row.length), 0);
  const alignments: Alignment[] = Array.from({ length: columns }, (_value, i) => (i < delimiter.length ? alignmentOf(delimiter[i]) : 'none'));
  const widths: number[] = alignments.map((alignment) => (alignment === 'none' ? 1 : 3));
  // The UTF-16 units that surrogate pairs add to the cells (widths count code points).
  let surrogates = 0;
  rows.forEach((row, r) => {
    if (r !== 1) {
      row.forEach((cell, c) => {
        const width = codePointWidth(cell);
        widths[c] = Math.max(widths[c], width);
        surrogates += cell.length - width;
      });
    }
  });
  const indent = leadingWhitespace(lines[0]);
  // The length of the result is known before it is built: refuse it here rather than pad the
  // cells of a huge column first. Every row is `indent| cell | … | cell |`, every cell as wide
  // as its column (plus the UTF-16 units of its surrogate pairs).
  const rowLength = indent.length + 4 + 3 * (columns - 1) + widths.reduce((sum, width) => sum + width, 0);
  assertOutputLength(rows.length * rowLength + surrogates + (rows.length - 1) * eol.length);
  const pad = (cell: string, c: number): string => {
    const space = widths[c] - codePointWidth(cell);
    switch (alignments[c]) {
      case 'right':
        return ' '.repeat(space) + cell;
      case 'center': {
        const left = Math.floor(space / 2);
        return ' '.repeat(left) + cell + ' '.repeat(space - left);
      }
      default:
        return cell + ' '.repeat(space);
    }
  };
  const rule = (c: number): string => {
    const width = widths[c];
    switch (alignments[c]) {
      case 'left':
        return `:${'-'.repeat(width - 1)}`;
      case 'right':
        return `${'-'.repeat(width - 1)}:`;
      case 'center':
        return `:${'-'.repeat(width - 2)}:`;
      default:
        return '-'.repeat(width);
    }
  };
  return rows.map((row, r) => {
    const cells = Array.from({ length: columns }, (_value, c) => (r === 1 ? rule(c) : pad(row[c] ?? '', c)));
    return `${indent}| ${cells.join(' | ')} |`;
  });
});

// ---------------------------------------------------------------------------
// MD-020: strip formatting
// ---------------------------------------------------------------------------

/** One line without its block markup: `>` markers, heading `#`s, list markers and checkboxes. */
const stripBlockMarkup = (line: string): string => {
  let rest = line;
  while (isQuoteLine(rest)) {
    const content = rest.slice(rest.indexOf('>') + 1);
    rest = content.startsWith(' ') ? content.slice(1) : content;
  }
  const heading = parseAtxHeading(rest);
  if (heading !== undefined) {
    return heading.text;
  }
  const item = parseListItem(rest);
  return item === undefined ? rest : item.indent + item.rest;
};

/**
 * MD-020: the text without Markdown markup: heading, quote and list markers, checkboxes,
 * thematic breaks, setext underlines and fence lines are removed; emphasis, strikethrough and
 * code span markers go; links become their text, images their alt text; backslash escapes are
 * resolved. The lines of fenced code blocks are kept as they are.
 */
export const stripFormatting: SelectionTransform = (value, eol) => mapLines(value, eol, (lines) => {
  const roles = fenceRoles(lines);
  const out: string[] = [];
  let paragraph: string[] = [];
  const flush = (): void => {
    if (paragraph.length > 0) {
      // Inline markup may span lines: the lines of a run are parsed together.
      for (const line of plainText(paragraph.join('\n')).split('\n')) {
        out.push(line);
      }
      paragraph = [];
    }
  };
  lines.forEach((line, i) => {
    if (roles[i] === 'fence') {
      flush();
      return;
    }
    if (roles[i] === 'code' || isBlank(line)) {
      flush();
      out.push(line);
      return;
    }
    if (isThematicBreak(line) || (setextLevel(line) !== undefined && paragraph.length > 0)) {
      return;
    }
    paragraph.push(stripBlockMarkup(line));
  });
  flush();
  return out;
});

// ---------------------------------------------------------------------------
// MD-022, 023: footnotes and reference links
// ---------------------------------------------------------------------------

/** The largest number `n` of the matches of `pattern` (group 1), or 0. */
const largestNumber = (text: string, pattern: RegExp): number => {
  let largest = 0;
  for (const match of text.matchAll(pattern)) {
    largest = Math.max(largest, Number(match[1]));
  }
  return largest;
};

const FOOTNOTE_LABEL = /\[\^(\d{1,9})\]/g;

/** What to append at the end of the document so that `block` starts after a blank line. */
const appendBlock = (text: string, block: string, eol: MdEol): string => {
  const [, breaks] = splitTrailingBreaks(text);
  const count = lineBreakCount(breaks);
  if (count === 0) {
    return `${eol}${eol}${block}`;
  }
  return count === 1 ? `${eol}${block}${eol}` : `${block}${eol}`;
};

/**
 * MD-022: every selection becomes `[^n]` and `[^n]: text` is added at the end of the document
 * (after a blank line). `n` continues from the largest numeric footnote label in the document, in
 * document order. The lines after the first of a definition are indented with 4 spaces.
 */
export const toFootnotes = (text: string, ranges: readonly MdRange[], eol: MdEol): MdResult => {
  let number = largestNumber(text, FOOTNOTE_LABEL);
  const definitions: string[] = [];
  const edits: MdEdit[] = [];
  const after: MdRange[] = [];
  let shift = 0;
  for (const range of ranges) {
    const [body, trailing] = splitTrailingBreaks(text.slice(range.start, range.end));
    if (body.trim() === '') {
      after.push({ start: range.start + shift, end: range.end + shift, reversed: range.reversed });
      continue;
    }
    number++;
    const label = `[^${number}]`;
    const lines = splitLines(body).lines;
    definitions.push([`${label}: ${lines[0]}`, ...lines.slice(1).map((line) => (isBlank(line) ? '' : `    ${line}`))].join(eol));
    edits.push({ start: range.start, end: range.end, text: label + trailing });
    const start = range.start + shift;
    after.push({ start, end: start + label.length });
    shift += label.length + trailing.length - (range.end - range.start);
  }
  if (edits.length === 0) {
    return UNCHANGED;
  }
  const appended = appendBlock(text, definitions.join(eol), eol);
  const last = edits[edits.length - 1];
  if (last.end === text.length) {
    // The insertion at the end and this replacement touch: one edit.
    last.text += appended;
  } else {
    edits.push({ start: text.length, end: text.length, text: appended });
  }
  assertOutputLength(edits.reduce((sum, edit) => sum + edit.text.length, 0));
  return { kind: 'edit', edits, ranges: after };
};

const REFERENCE_LABEL = /^ {0,3}\[(\d{1,9})\]:/gm;

/**
 * The inline links of `value` that MD-023 converts, in order: not images, not in an image (the
 * image ranges are merged and walked together with the links), not in code, and with a
 * destination.
 */
const convertibleLinks = (value: string): InlineLink[] => {
  const spans = mergeRanges([...codeSpans(value), ...blockProtectedRanges(value, false)]);
  const found = findInlineLinks(value, spans);
  const images = mergeRanges(found.filter((link) => link.image).map((link): [number, number] => [link.start, link.end]));
  // Links cannot contain links: in order of their start, they are also in order of their end.
  const links = found.filter((link) => !link.image && link.tail.destination !== '').sort((a, b) => a.start - b.start);
  let image = 0;
  return links.filter((link) => {
    while (image < images.length && images[image][1] < link.end) {
      image++;
    }
    return !(image < images.length && images[image][0] <= link.start);
  });
};

/**
 * MD-023: the inline links `[t](url "title")` of every selection become `[t][n]`, and the
 * definitions `[n]: url "title"` are added after a blank line: at the end of the selection when
 * it ends at the end of a line (or with a line break), otherwise after the end of the line where
 * it ends, so that no text is joined to a definition line. The definitions of selections that
 * end on the same line are written together after the last of them. The same URL and title get
 * the same number; `n` continues from the largest numeric reference definition in the document,
 * in document order. Images and links in code are left.
 *
 * After the edit, a changed selection selects its new text, with the definitions when they were
 * written at its end.
 */
export const toReferenceLinks = (text: string, ranges: readonly MdRange[], eol: MdEol): MdResult => {
  const lines = new LineContext(text);
  let number = largestNumber(text, REFERENCE_LABEL);
  const numbers = new Map<string, number>();
  const edits: MdEdit[] = [];
  const after: MdRange[] = [];
  let shift = 0;
  let total = 0;
  const addEdit = (edit: MdEdit): void => {
    edits.push(edit);
    total += edit.text.length;
    assertOutputLength(total);
  };
  // Definitions waiting for the end of the line at `pendingAt` (-1: none), where a selection
  // ended in the middle of the line.
  let pending: string[] = [];
  let pendingAt = -1;
  const flush = (): void => {
    if (pending.length > 0) {
      const insertion = `${eol}${eol}${pending.join(eol)}`;
      addEdit({ start: pendingAt, end: pendingAt, text: insertion });
      shift += insertion.length;
    }
    pending = [];
    pendingAt = -1;
  };
  for (const range of ranges) {
    if (pendingAt !== -1 && range.start > pendingAt) {
      flush();
    }
    if (range.start === range.end) {
      // A cursor (also one at the end of a line with pending definitions: it stays before them).
      after.push({ start: range.start + shift, end: range.end + shift, reversed: range.reversed });
      continue;
    }
    // Here nothing is pending, or this selection starts on the line of the pending definitions:
    // they then go after this selection.
    const value = text.slice(range.start, range.end);
    let converted = '';
    let position = 0;
    for (const link of convertibleLinks(value)) {
      const key = `${link.tail.destinationSource}\u0000${link.tail.titleSource ?? ''}`;
      let n = numbers.get(key);
      if (n === undefined) {
        n = ++number;
        numbers.set(key, n);
        pending.push(`[${n}]: ${link.tail.destinationSource}${link.tail.titleSource === undefined ? '' : ` ${link.tail.titleSource}`}`);
      }
      converted += `${value.slice(position, link.textStart - 1)}[${value.slice(link.textStart, link.textEnd)}][${n}]`;
      position = link.end;
    }
    converted += value.slice(position);
    const [body, trailing] = splitTrailingBreaks(converted);
    let replacement = converted;
    if (trailing !== '' || !lines.textAfter(range.end)) {
      if (pending.length > 0) {
        replacement = `${body}${eol}${eol}${pending.join(eol)}${trailing}`;
      }
      pending = [];
      pendingAt = -1;
    } else {
      pendingAt = lines.lineEnd(range.end);
    }
    if (replacement === value) {
      after.push({ start: range.start + shift, end: range.end + shift, reversed: range.reversed });
      continue;
    }
    addEdit({ start: range.start, end: range.end, text: replacement });
    const start = range.start + shift;
    after.push({ start, end: start + replacement.length });
    shift += replacement.length - (range.end - range.start);
  }
  if (pendingAt !== -1) {
    flush();
  }
  return edits.length === 0 ? UNCHANGED : { kind: 'edit', edits, ranges: after };
};

// ---------------------------------------------------------------------------
// MD-025: front matter to JSON
// ---------------------------------------------------------------------------

const isEmptyYamlLine = (line: string): boolean => {
  const trimmed = line.trim();
  return trimmed === '' || trimmed.startsWith('#');
};

/** Rethrows the errors of the shared data helpers as warnings of this command. */
const asInputError = (error: unknown): Error => {
  if (error instanceof yaml.YAMLException) {
    const mark = error.mark as { line?: number; column?: number } | undefined;
    // +2: the YAML starts on the line after "---" (1-based).
    const where = mark && typeof mark.line === 'number' && typeof mark.column === 'number'
      ? `line ${mark.line + 2}, column ${mark.column + 1}: `
      : '';
    return new MdInputError(`invalid YAML: ${where}${error.reason}`);
  }
  if (error instanceof DataInputError || error instanceof EncOutputTooLargeError) {
    return new MdInputError(error.message);
  }
  if (error instanceof RangeError) {
    return new MdInputError('the YAML is nested too deeply');
  }
  return error instanceof Error ? error : new Error(String(error));
};

/**
 * MD-025: the front matter at the start of the selection (from a `---` line to the next `---`
 * or `...` line) is read with js-yaml (YAML 1.2 Core schema: no code is run, `!!js/function`
 * and other unknown tags are rejected) and replaced with one line of JSON; the text after it
 * (from the line break of the closing line) stays. Anchors and aliases that would make the JSON
 * too large are rejected like in Format YAML.
 */
export const frontMatterToJson: SelectionTransform = (value) => {
  const spans = lineSpans(value);
  const lineOf = (i: number): string => value.slice(spans[i].start, spans[i].end);
  if (lineOf(0).trimEnd() !== '---') {
    throw new MdInputError('the selection does not start with front matter (a "---" line)');
  }
  let close = -1;
  for (let i = 1; i < spans.length; i++) {
    const line = lineOf(i).trimEnd();
    if (line === '---' || line === '...') {
      close = i;
      break;
    }
  }
  if (close === -1) {
    throw new MdInputError('the front matter has no closing "---" line');
  }
  const yamlLines = spans.slice(1, close).map((_span, i) => lineOf(i + 1));
  const source = yamlLines.join('\n');
  try {
    assertInputLength(source);
    let data: unknown = yaml.load(source, { schema: yaml.CORE_SCHEMA });
    if ((data === undefined || data === null) && yamlLines.every(isEmptyYamlLine)) {
      data = {};
    }
    const graph = inspectGraph(data);
    if (graph.shared && graph.containers * graph.references > YAML_MAX_ALIAS_WORK) {
      throw new MdInputError(
        `YAML with anchors and aliases is too large: ${formatNumber(graph.containers)} mappings and sequences`
        + ` x ${formatNumber(graph.references)} references to them is more than the limit of ${formatNumber(YAML_MAX_ALIAS_WORK)}`
      );
    }
    return stringifyCompact((data ?? null) as JsonValue) + value.slice(spans[close].end);
  } catch (error) {
    throw error instanceof MdInputError ? error : asInputError(error);
  }
};

// ---------------------------------------------------------------------------
// Command table
// ---------------------------------------------------------------------------

/** Everything a command may use: made once per run by the handler. */
export interface MdContext {
  /** The whole document text. */
  text: string;
  /** The selections in document order. */
  ranges: readonly MdRange[];
  /** The document's line break. */
  eol: MdEol;
  /** The values entered, in the order of the command's `inputs` (validated). */
  inputs: readonly string[];
}

/** One input box of a command. */
export interface MdInputStep {
  prompt: string;
  placeHolder?: string;
  value?: string;
  validate: (value: string) => string | undefined;
}

/** The `when` clause of the commands that need a selection (all but MD-003). */
export const MD_WHEN_SELECTION = 'editorHasSelection';

export interface MdCommandEntry {
  /** ROADMAP ID (MD-001…). */
  id: string;
  /** Command name without `selection-manipulator.`. */
  name: string;
  title: string;
  /** The command also works with cursors only (no `when` clause). */
  cursor?: boolean;
  /** Input boxes shown before running (only when some selection is not empty). */
  inputs?: MdInputStep[];
  run: (context: MdContext) => MdResult;
}

export const MD_COMMAND_ENTRIES: readonly MdCommandEntry[] = [
  {
    id: 'MD-001', name: 'markdown.heading-increase', title: 'Markdown: Increase Heading Level',
    run: perSelection(increaseHeadingLevel),
  },
  {
    id: 'MD-002', name: 'markdown.heading-decrease', title: 'Markdown: Decrease Heading Level',
    run: perSelection(decreaseHeadingLevel),
  },
  {
    id: 'MD-003', name: 'markdown.toc', title: 'Markdown: Generate Table of Contents', cursor: true,
    run: ({ text, ranges, eol }) => generateToc(text, ranges, eol),
  },
  {
    id: 'MD-004', name: 'markdown.bullet-list', title: 'Markdown: Convert Lines to Bullet List',
    run: perSelection(toBulletList),
  },
  {
    id: 'MD-005', name: 'markdown.numbered-list', title: 'Markdown: Convert Lines to Numbered List',
    run: perSelection(toNumberedList),
  },
  {
    id: 'MD-006', name: 'markdown.task-list', title: 'Markdown: Convert Lines to Task List',
    run: perSelection(toTaskList),
  },
  {
    id: 'MD-007', name: 'markdown.toggle-task', title: 'Markdown: Toggle Task Checkbox',
    run: perSelection(toggleTask),
  },
  {
    id: 'MD-008', name: 'markdown.remove-list-markers', title: 'Markdown: Remove List Markers',
    run: perSelection(removeListMarkers),
  },
  {
    id: 'MD-009', name: 'markdown.renumber-list', title: 'Markdown: Renumber Ordered List',
    run: perSelection(renumberList),
  },
  {
    id: 'MD-010', name: 'markdown.bold', title: 'Markdown: Bold',
    run: perSelection(wrapInline('**')),
  },
  {
    id: 'MD-011', name: 'markdown.italic', title: 'Markdown: Italic',
    run: perSelection(wrapInline('_')),
  },
  {
    id: 'MD-012', name: 'markdown.strikethrough', title: 'Markdown: Strikethrough',
    run: perSelection(wrapInline('~~')),
  },
  {
    id: 'MD-013', name: 'markdown.setext-to-atx', title: 'Markdown: Convert Setext Headings to ATX',
    run: perSelection(setextToAtx),
  },
  {
    id: 'MD-014', name: 'markdown.code-block', title: 'Markdown: Wrap in Code Fence',
    inputs: [{
      prompt: `Language of the code fence (optional; up to ${FENCE_LANGUAGE_MAX_LENGTH} letters, digits and _ + # . -)`,
      placeHolder: 'e.g. python',
      validate: validateLanguageInput,
    }],
    run: perSelection((value, eol, inputs, edges) => wrapInCodeFence(value, eol, inputs[0], edges), true),
  },
  {
    id: 'MD-015', name: 'markdown.blockquote', title: 'Markdown: Blockquote',
    run: perSelection(toBlockquote),
  },
  {
    id: 'MD-016', name: 'markdown.image', title: 'Markdown: Image',
    inputs: [{
      prompt: `Alt text of the image (optional, one line, up to ${formatNumber(MD_LABEL_MAX_LENGTH)} characters)`,
      validate: validateLabelInput,
    }],
    run: perSelection((value, _eol, inputs) => toImage(value, inputs[0])),
  },
  {
    id: 'MD-017', name: 'markdown.linkify-urls', title: 'Markdown: Linkify URLs',
    run: perSelection(linkifyUrls),
  },
  {
    id: 'MD-018', name: 'markdown.format-table', title: 'Markdown: Format Table',
    run: perSelection(formatTable),
  },
  {
    id: 'MD-019', name: 'markdown.to-html', title: 'Markdown: Convert to HTML',
    run: perSelection((value, eol) => mdToHtml(value, eol)),
  },
  {
    id: 'MD-020', name: 'markdown.strip', title: 'Markdown: Strip Formatting',
    run: perSelection(stripFormatting),
  },
  {
    id: 'MD-021', name: 'markdown.heading-to-anchor', title: 'Markdown: Heading to Anchor Link',
    run: perSelection(headingToAnchor),
  },
  {
    id: 'MD-022', name: 'markdown.footnote', title: 'Markdown: Convert to Footnote',
    run: ({ text, ranges, eol }) => toFootnotes(text, ranges, eol),
  },
  {
    id: 'MD-023', name: 'markdown.reference-links', title: 'Markdown: Inline Links to Reference Links',
    run: ({ text, ranges, eol }) => toReferenceLinks(text, ranges, eol),
  },
  {
    id: 'MD-024', name: 'markdown.details', title: 'Markdown: Wrap in Details Block',
    inputs: [{
      prompt: `Summary of the details block (optional, one line, up to ${formatNumber(MD_LABEL_MAX_LENGTH)} characters; empty: "Details")`,
      validate: validateLabelInput,
    }],
    run: perSelection((value, eol, inputs, edges) => toDetails(value, eol, inputs[0], edges), true),
  },
  {
    id: 'MD-025', name: 'markdown.front-matter-to-json', title: 'Markdown: Front Matter to JSON',
    run: perSelection(frontMatterToJson),
  },
];
