/**
 * Helpers shared by the Markdown commands (MD-001..025) and the Markdown -> HTML subset
 * (MD-019): lines and line breaks, code fences, headings, list markers, code spans, inline
 * links, GitHub-style slugs and HTML escaping.
 *
 * Every helper is linear (or close to it) in the length of its input: the only regular
 * expressions are fixed, anchored and without nested quantifiers; brackets, parentheses and
 * backtick runs are matched with loops and stacks.
 *
 * Only local processing: no network, files or processes, no `eval` / `new Function`, no new
 * dependency.
 */

/** The line break of the document (`TextDocument.eol`). */
export type MdEol = '\n' | '\r\n';

/** Splits lines at any line break (LF, CRLF or CR). */
export const LINE_BREAK = /\r\n|\r|\n/;

/** The lines of a text; one line break at the end is not a line and is kept in `trailing`. */
export interface MdLines {
  lines: string[];
  /** The line break that ended the text (`''` when it did not end with one). */
  trailing: string;
}

/** The line break at the end of `text` (`''` if none). */
export const trailingBreakOf = (text: string): string => {
  if (text.endsWith('\r\n')) {
    return '\r\n';
  }
  if (text.endsWith('\n') || text.endsWith('\r')) {
    return text[text.length - 1];
  }
  return '';
};

export const splitLines = (text: string): MdLines => {
  const trailing = trailingBreakOf(text);
  return { lines: text.slice(0, text.length - trailing.length).split(LINE_BREAK), trailing };
};

/** The inverse of `splitLines`, with the lines joined by the document's line break. */
export const joinLines = (lines: readonly string[], eol: MdEol, trailing: string): string => lines.join(eol) + trailing;

export const isBlank = (line: string): boolean => line.trim() === '';

/** A line of a text as offsets: `[start, end)` without its line break; `next` is where the next line starts. */
export interface LineSpan {
  start: number;
  end: number;
  next: number;
}

/** The lines of `text` as offsets (a text ending with a line break has an empty last line). */
export const lineSpans = (text: string): LineSpan[] => {
  const spans: LineSpan[] = [];
  let start = 0;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (c === '\n' || c === '\r') {
      const next = c === '\r' && text[i + 1] === '\n' ? i + 2 : i + 1;
      spans.push({ start, end: i, next });
      start = next;
      i = next - 1;
    }
  }
  spans.push({ start, end: text.length, next: text.length });
  return spans;
};

/** The whitespace at both ends of a text and what is between (found with loops, not a regular expression). */
export const splitEdges = (value: string): [string, string, string] => {
  let start = 0;
  while (start < value.length && /\s/.test(value[start])) {
    start++;
  }
  let end = value.length;
  while (end > start && /\s/.test(value[end - 1])) {
    end--;
  }
  return [value.slice(0, start), value.slice(start, end), value.slice(end)];
};

/** Removes every line break at the end of a text: `[text, removed line breaks]`. */
export const splitTrailingBreaks = (value: string): [string, string] => {
  let end = value.length;
  while (end > 0 && (value[end - 1] === '\n' || value[end - 1] === '\r')) {
    end--;
  }
  return [value.slice(0, end), value.slice(end)];
};

// ---------------------------------------------------------------------------
// Code fences
// ---------------------------------------------------------------------------

export interface FenceOpening {
  char: '`' | '~';
  length: number;
  /** Spaces before the fence (0 to 3). */
  indent: number;
  /** The info string (trimmed). */
  info: string;
}

/** Spaces at the start of `line`, up to `max + 1`. */
const leadingSpaces = (line: string, max = 3): number => {
  let i = 0;
  while (i < line.length && i <= max && line[i] === ' ') {
    i++;
  }
  return i;
};

/** The opening fence of a fenced code block (```` ``` ```` or `~~~`, at most 3 spaces of indentation). */
export const fenceOpening = (line: string): FenceOpening | undefined => {
  const indent = leadingSpaces(line);
  if (indent > 3) {
    return undefined;
  }
  const char = line[indent];
  if (char !== '`' && char !== '~') {
    return undefined;
  }
  let end = indent;
  while (end < line.length && line[end] === char) {
    end++;
  }
  if (end - indent < 3) {
    return undefined;
  }
  const info = line.slice(end).trim();
  if (char === '`' && info.includes('`')) {
    return undefined;
  }
  return { char, length: end - indent, indent, info };
};

/** Whether `line` closes the fence opened by `opening`. */
export const isFenceClosing = (line: string, opening: FenceOpening): boolean => {
  const indent = leadingSpaces(line);
  if (indent > 3) {
    return false;
  }
  let end = indent;
  while (end < line.length && line[end] === opening.char) {
    end++;
  }
  return end - indent >= opening.length && line.slice(end).trim() === '';
};

/** Where each line is relative to fenced code blocks. */
export type FenceRole = 'text' | 'fence' | 'code';

/**
 * The role of every line: `fence` for an opening or closing fence, `code` for a line inside a
 * fenced code block, `text` otherwise. A fence that is never closed runs to the last line.
 */
export const fenceRoles = (lines: readonly string[]): FenceRole[] => {
  const roles: FenceRole[] = [];
  let open: FenceOpening | undefined;
  for (const line of lines) {
    if (open === undefined) {
      open = fenceOpening(line);
      roles.push(open === undefined ? 'text' : 'fence');
    } else if (isFenceClosing(line, open)) {
      open = undefined;
      roles.push('fence');
    } else {
      roles.push('code');
    }
  }
  return roles;
};

/** The longest language (info string word) of a code fence that the commands write. */
export const FENCE_LANGUAGE_MAX_LENGTH = 50;

const FENCE_LANGUAGE_CHARACTERS = /^[A-Za-z0-9_+#.-]*$/;

/**
 * Whether `value` is a safe code fence language: letters, digits and `_ + # . -` only, at most
 * `FENCE_LANGUAGE_MAX_LENGTH` characters (empty is allowed). Used for the input of MD-014 and for
 * the `class` that MD-019 writes: nothing else can reach the fence line or the attribute.
 */
export const isFenceLanguage = (value: string): boolean =>
  value.length <= FENCE_LANGUAGE_MAX_LENGTH && FENCE_LANGUAGE_CHARACTERS.test(value);

// ---------------------------------------------------------------------------
// Headings, thematic breaks, list items
// ---------------------------------------------------------------------------

export interface AtxHeading {
  level: number;
  /** Offset of the first `#` in the line. */
  hashStart: number;
  /** Offset after the last opening `#`. */
  hashEnd: number;
  /** The heading text without the opening and closing `#` sequences (trimmed). */
  text: string;
}

/** An ATX heading line (`# a` … `###### a`, at most 3 spaces of indentation). */
export const parseAtxHeading = (line: string): AtxHeading | undefined => {
  const hashStart = leadingSpaces(line);
  if (hashStart > 3) {
    return undefined;
  }
  let hashEnd = hashStart;
  while (hashEnd < line.length && line[hashEnd] === '#') {
    hashEnd++;
  }
  const level = hashEnd - hashStart;
  if (level < 1 || level > 6) {
    return undefined;
  }
  if (hashEnd < line.length && line[hashEnd] !== ' ' && line[hashEnd] !== '\t') {
    return undefined;
  }
  let text = line.slice(hashEnd).trim();
  // An optional closing sequence of `#` preceded by a space (or making up the whole text).
  let end = text.length;
  while (end > 0 && text[end - 1] === '#') {
    end--;
  }
  if (end === 0) {
    text = '';
  } else if (end < text.length && (text[end - 1] === ' ' || text[end - 1] === '\t')) {
    text = text.slice(0, end).trimEnd();
  }
  return { level, hashStart, hashEnd, text };
};

const QUOTE_MARKER = /^ {0,3}>/;

/** Whether `line` starts with a block quote marker (`>` after at most 3 spaces). */
export const isQuoteLine = (line: string): boolean => QUOTE_MARKER.test(line);

/** A thematic break: 3 or more `-`, `*` or `_` (the same character), optionally with spaces between. */
export const isThematicBreak = (line: string): boolean => {
  const indent = leadingSpaces(line);
  if (indent > 3) {
    return false;
  }
  const char = line[indent];
  if (char !== '-' && char !== '*' && char !== '_') {
    return false;
  }
  let count = 0;
  for (let i = indent; i < line.length; i++) {
    const c = line[i];
    if (c === char) {
      count++;
    } else if (c !== ' ' && c !== '\t') {
      return false;
    }
  }
  return count >= 3;
};

/** A setext underline: `=` or `-` only (at most 3 spaces of indentation, trailing spaces allowed). */
export const setextLevel = (line: string): 1 | 2 | undefined => {
  const indent = leadingSpaces(line);
  if (indent > 3) {
    return undefined;
  }
  const trimmed = line.slice(indent).trimEnd();
  if (trimmed.length === 0) {
    return undefined;
  }
  const char = trimmed[0];
  if (char !== '=' && char !== '-') {
    return undefined;
  }
  for (const c of trimmed) {
    if (c !== char) {
      return undefined;
    }
  }
  return char === '=' ? 1 : 2;
};

export interface ListItemLine {
  /** The whitespace before the marker. */
  indent: string;
  /** The marker as written (`-`, `*`, `+`, `1.`, `1)`). */
  marker: string;
  ordered: boolean;
  /** Ordered items: the number as written and the delimiter (`.` or `)`). */
  number?: string;
  delimiter?: string;
  /** The whitespace after the marker (`''` when nothing follows it). */
  spacing: string;
  /** `[ ]`, `[x]` or `[X]` when the item is a task. */
  checkbox?: string;
  /** The whitespace after the checkbox. */
  checkboxSpacing?: string;
  /** The text after the marker (and the checkbox). */
  rest: string;
}

const LIST_ITEM = /^([ \t]*)([-*+]|(\d{1,9})([.)]))([ \t]+|$)/;
const CHECKBOX = /^\[([ xX])\]([ \t]+|$)/;

/** A list item line (bullet or ordered, with an optional task checkbox). */
export const parseListItem = (line: string): ListItemLine | undefined => {
  const match = LIST_ITEM.exec(line);
  if (match === null) {
    return undefined;
  }
  const item: ListItemLine = {
    indent: match[1],
    marker: match[2],
    ordered: match[3] !== undefined,
    number: match[3],
    delimiter: match[4],
    spacing: match[5],
    rest: line.slice(match[0].length),
  };
  const checkbox = CHECKBOX.exec(item.rest);
  if (checkbox !== null && item.spacing !== '') {
    item.checkbox = `[${checkbox[1]}]`;
    item.checkboxSpacing = checkbox[2];
    item.rest = item.rest.slice(checkbox[0].length);
  }
  return item;
};

/** The width of leading whitespace, a tab advancing to the next multiple of 4. */
export const indentWidth = (whitespace: string): number => {
  let width = 0;
  for (const c of whitespace) {
    width = c === '\t' ? width + 4 - (width % 4) : width + 1;
  }
  return width;
};

// ---------------------------------------------------------------------------
// Code spans, parentheses and inline links
// ---------------------------------------------------------------------------

const isEscapedAt = (text: string, index: number): boolean => {
  let backslashes = 0;
  for (let i = index - 1; i >= 0 && text[i] === '\\'; i--) {
    backslashes++;
  }
  return backslashes % 2 === 1;
};

/**
 * The code spans of `text` as `[start, end)` (backticks included), in order. A run of N backticks
 * opens a span that the next run of exactly N backticks closes; a backslash-escaped run cannot
 * open one. Linear: the next run of the same length is found for every run in one pass.
 */
export const codeSpans = (text: string): [number, number][] => {
  const runs: { start: number; length: number; escaped: boolean }[] = [];
  for (let i = text.indexOf('`'); i !== -1; i = text.indexOf('`', i)) {
    let end = i;
    while (end < text.length && text[end] === '`') {
      end++;
    }
    runs.push({ start: i, length: end - i, escaped: isEscapedAt(text, i) });
    i = end;
  }
  const next: number[] = new Array(runs.length).fill(-1);
  const lastOfLength = new Map<number, number>();
  for (let k = runs.length - 1; k >= 0; k--) {
    next[k] = lastOfLength.get(runs[k].length) ?? -1;
    lastOfLength.set(runs[k].length, k);
  }
  const spans: [number, number][] = [];
  for (let k = 0; k < runs.length;) {
    const closer = next[k];
    if (runs[k].escaped || closer === -1) {
      k++;
      continue;
    }
    spans.push([runs[k].start, runs[closer].start + runs[closer].length]);
    k = closer + 1;
  }
  return spans;
};

/**
 * For every `(`, the offset of its matching `)` on the same line (nested pairs balanced,
 * backslash-escaped parentheses ignored). One pass with a stack that is emptied at line breaks.
 */
export const matchParentheses = (text: string): Map<number, number> => {
  const matches = new Map<number, number>();
  const stack: number[] = [];
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (c === '\\') {
      i++;
    } else if (c === '(') {
      stack.push(i);
    } else if (c === ')') {
      const open = stack.pop();
      if (open !== undefined) {
        matches.set(open, i);
      }
    } else if (c === '\n' || c === '\r') {
      stack.length = 0;
    }
  }
  return matches;
};

const ASCII_PUNCTUATION = '!"#$%&\'()*+,-./:;<=>?@[\\]^_`{|}~';

export const isAsciiPunctuation = (c: string): boolean => c.length === 1 && ASCII_PUNCTUATION.includes(c);

/** Removes the backslash of backslash escapes (`\*` -> `*`). */
export const unescapeMarkdown = (text: string): string => {
  if (!text.includes('\\')) {
    return text;
  }
  let result = '';
  for (let i = 0; i < text.length; i++) {
    if (text[i] === '\\' && i + 1 < text.length && isAsciiPunctuation(text[i + 1])) {
      result += text[i + 1];
      i++;
    } else {
      result += text[i];
    }
  }
  return result;
};

/** The `(destination "title")` part of an inline link. */
export interface LinkTail {
  /** Offset after the closing `)`. */
  end: number;
  /** The destination as written (without `<` `>`), backslash escapes kept. */
  destination: string;
  /** The destination as written in the source, `<…>` included. */
  destinationSource: string;
  /** The title as written, without its quotes (backslash escapes kept). */
  title?: string;
  /** The title as written in the source, quotes included. */
  titleSource?: string;
}

export const isSpaceOrTab = (c: string | undefined): boolean => c === ' ' || c === '\t';

/**
 * The first offset at or after `from` where `stop` holds (the text length if none). The last
 * search is remembered: a search from inside the range it covered returns the same offset without
 * reading the text again, so searches from increasing offsets are linear in the text overall.
 */
export class ForwardSearch {
  private from = -1;
  private found = -1;

  constructor(private readonly text: string, private readonly stop: (c: string) => boolean) {}

  find(from: number): number {
    if (from >= this.from && from <= this.found) {
      return this.found;
    }
    let i = from;
    while (i < this.text.length && !this.stop(this.text[i])) {
      i++;
    }
    this.from = from;
    this.found = i;
    return i;
  }
}

export const isLineBreak = (c: string | undefined): boolean => c === '\n' || c === '\r';

/**
 * Reads the `(destination "title")` parts of the inline links of one text. Linear over all the
 * links of the text: the matching `)` comes from one table (`matchParentheses`), the runs of
 * spaces and of destination characters are found with `ForwardSearch`, and a `<…>` destination is
 * searched only up to the next `<` or `>` (so no character is read for two `<…>` destinations).
 */
export class LinkTailParser {
  private readonly parentheses: Map<number, number>;
  /** The end of a run of spaces / tabs (after `(`). */
  private readonly leadingSpaces: ForwardSearch;
  /** The end of a run of spaces / tabs (after the destination). */
  private readonly spacesAfterDestination: ForwardSearch;
  /** The end of a destination that is not in `<…>`. */
  private readonly destinationEnd: ForwardSearch;

  constructor(private readonly text: string) {
    this.parentheses = matchParentheses(text);
    const notSpace = (c: string): boolean => !isSpaceOrTab(c);
    this.leadingSpaces = new ForwardSearch(text, notSpace);
    this.spacesAfterDestination = new ForwardSearch(text, notSpace);
    this.destinationEnd = new ForwardSearch(text, (c) => isSpaceOrTab(c) || isLineBreak(c));
  }

  /** The link tail starting at the `(` at `open`, or `undefined` when it is not a valid one. */
  parse(open: number): LinkTail | undefined {
    const text = this.text;
    const close = this.parentheses.get(open);
    if (text[open] !== '(' || close === undefined) {
      return undefined;
    }
    let i = Math.min(this.leadingSpaces.find(open + 1), close);
    let destination: string;
    let destinationSource: string;
    if (text[i] === '<') {
      let end = i + 1;
      while (end < close && text[end] !== '>' && text[end] !== '<') {
        end++;
      }
      if (end >= close || text[end] !== '>') {
        return undefined;
      }
      destination = text.slice(i + 1, end);
      destinationSource = text.slice(i, end + 1);
      i = end + 1;
    } else {
      const start = i;
      i = Math.min(this.destinationEnd.find(start), close);
      destination = text.slice(start, i);
      destinationSource = destination;
    }
    const afterDestination = i;
    i = Math.min(this.spacesAfterDestination.find(i), close);
    if (i === close) {
      return { end: close + 1, destination, destinationSource };
    }
    if (i === afterDestination) {
      // The title must be separated from the destination by whitespace.
      return undefined;
    }
    const quote = text[i];
    if (quote !== '"' && quote !== '\'') {
      return undefined;
    }
    let titleEnd = close - 1;
    while (titleEnd > i && isSpaceOrTab(text[titleEnd])) {
      titleEnd--;
    }
    if (titleEnd === i || text[titleEnd] !== quote || isEscapedAt(text, titleEnd)) {
      return undefined;
    }
    return {
      end: close + 1,
      destination,
      destinationSource,
      title: text.slice(i + 1, titleEnd),
      titleSource: text.slice(i, titleEnd + 1),
    };
  }
}

/**
 * What is around offsets of a text on their lines (for the commands that write whole-line blocks
 * around or after a selection).
 *
 * Every method expects its offsets in increasing order (the order of the selections, which the
 * callers keep): each one remembers how far it has read, so that all the calls together read the
 * text about once. An offset that goes back is still answered correctly, but `textBefore` and
 * `textOnPreviousLine` then look back without remembering (so a caller that does not sort its
 * offsets can be as slow as the number of offsets times the line length).
 */
export class LineContext {
  /** How far `textBefore` / `textOnPreviousLine` have read. */
  private sweep = 0;
  /** Whether the line `sweep` is on has text other than spaces and tabs before `sweep`. */
  private currentLineText = false;
  /** Whether the line before the one `sweep` is on has text other than spaces and tabs. */
  private previousLineText = false;
  private readonly nextSignificant: ForwardSearch;
  private readonly nextLineBreak: ForwardSearch;
  /** A separate search for `textOnNextLine`, so that its offsets stay in increasing order too. */
  private readonly nextSignificantOnNextLine: ForwardSearch;

  constructor(private readonly text: string) {
    const significant = (c: string): boolean => !isSpaceOrTab(c);
    this.nextSignificant = new ForwardSearch(text, significant);
    this.nextLineBreak = new ForwardSearch(text, isLineBreak);
    this.nextSignificantOnNextLine = new ForwardSearch(text, significant);
  }

  /** Reads on to `offset`; false when `offset` is behind what has been read. */
  private advance(offset: number): boolean {
    const text = this.text;
    if (offset < this.sweep) {
      return false;
    }
    for (; this.sweep < offset; this.sweep++) {
      const c = text[this.sweep];
      if (isLineBreak(c)) {
        // "\r\n" is one line break.
        if (c !== '\n' || text[this.sweep - 1] !== '\r') {
          this.previousLineText = this.currentLineText;
          this.currentLineText = false;
        }
      } else if (!isSpaceOrTab(c)) {
        this.currentLineText = true;
      }
    }
    return true;
  }

  /** Whether there is text other than spaces and tabs before `offset` on its line (looking back). */
  private lookBack(offset: number): boolean {
    let i = offset - 1;
    while (i >= 0 && isSpaceOrTab(this.text[i])) {
      i--;
    }
    return i >= 0 && !isLineBreak(this.text[i]);
  }

  /** Whether there is text other than spaces and tabs before `offset` on its line. */
  textBefore(offset: number): boolean {
    return this.advance(offset) ? this.currentLineText : this.lookBack(offset);
  }

  /** Whether the line before the line of `offset` has text other than spaces and tabs. */
  textOnPreviousLine(offset: number): boolean {
    if (this.advance(offset)) {
      return this.previousLineText;
    }
    const text = this.text;
    let lineStart = offset;
    while (lineStart > 0 && !isLineBreak(text[lineStart - 1])) {
      lineStart--;
    }
    if (lineStart === 0) {
      return false;
    }
    // The previous line ends where the line break before lineStart starts ("\r\n" is one).
    return this.lookBack(text[lineStart - 1] === '\n' && text[lineStart - 2] === '\r' ? lineStart - 2 : lineStart - 1);
  }

  /** Whether there is text other than spaces and tabs from `offset` to the end of its line. */
  textAfter(offset: number): boolean {
    const i = this.nextSignificant.find(offset);
    return i < this.text.length && !isLineBreak(this.text[i]);
  }

  /** Whether the line after the line of `offset` has text other than spaces and tabs. */
  textOnNextLine(offset: number): boolean {
    const text = this.text;
    const lineEnd = this.lineEnd(offset);
    if (lineEnd >= text.length) {
      return false;
    }
    const next = lineEnd + (text[lineEnd] === '\r' && text[lineEnd + 1] === '\n' ? 2 : 1);
    const i = this.nextSignificantOnNextLine.find(next);
    return i < text.length && !isLineBreak(text[i]);
  }

  /** The end of the line of `offset`: the offset of its line break, or the text length. */
  lineEnd(offset: number): number {
    return this.nextLineBreak.find(offset);
  }
}

/** An inline link `[text](destination "title")` or image `![alt](…)` in a text. */
export interface InlineLink {
  /** Offset of `[` (or of `!` for an image). */
  start: number;
  /** Offset after the closing `)`. */
  end: number;
  /** The link text (or alt text) as `[textStart, textEnd)`. */
  textStart: number;
  textEnd: number;
  image: boolean;
  tail: LinkTail;
}

/**
 * The inline links and images of `text`, in the order they close, outside code spans. A link
 * cannot contain another link (the `[` before a link that was made are then plain text), but it
 * may contain images. Linear: brackets are kept on a stack, and "every earlier `[` is inactive"
 * is kept as one index instead of marking each of them.
 */
export const findInlineLinks = (text: string, spans: readonly [number, number][] = codeSpans(text)): InlineLink[] => {
  const tails = new LinkTailParser(text);
  const links: InlineLink[] = [];
  const openers: { start: number; textStart: number; image: boolean }[] = [];
  let inactiveBelow = 0;
  let span = 0;
  for (let i = 0; i < text.length; i++) {
    while (span < spans.length && spans[span][1] <= i) {
      span++;
    }
    if (span < spans.length && spans[span][0] <= i) {
      i = spans[span][1] - 1;
      continue;
    }
    const c = text[i];
    if (c === '\\') {
      i++;
    } else if (c === '!' && text[i + 1] === '[') {
      openers.push({ start: i, textStart: i + 2, image: true });
      i++;
    } else if (c === '[') {
      openers.push({ start: i, textStart: i + 1, image: false });
    } else if (c === ']') {
      const opener = openers.pop();
      if (opener === undefined) {
        continue;
      }
      const active = opener.image || openers.length >= inactiveBelow;
      inactiveBelow = Math.min(inactiveBelow, openers.length);
      const tail = active && text[i + 1] === '(' ? tails.parse(i + 1) : undefined;
      if (tail === undefined) {
        continue;
      }
      links.push({ start: opener.start, end: tail.end, textStart: opener.textStart, textEnd: i, image: opener.image, tail });
      if (!opener.image) {
        inactiveBelow = openers.length;
      }
      i = tail.end - 1;
    }
  }
  return links;
};

// ---------------------------------------------------------------------------
// Slugs and escaping
// ---------------------------------------------------------------------------

const SLUG_REMOVED = /[^\p{L}\p{M}\p{N}\p{Pc} -]/gu;

/**
 * A GitHub-style heading anchor: lower case, every character other than a letter, a mark, a
 * number, a connector (`_`), a space or `-` removed, and every space replaced with `-`.
 */
export const githubSlug = (text: string): string => text.toLowerCase().replace(SLUG_REMOVED, '').replace(/ /g, '-');

/** Makes repeated slugs unique the GitHub way: `a`, `a-1`, `a-2`… (in document order). */
export class SlugCounter {
  private readonly seen = new Map<string, number>();

  unique(slug: string): string {
    let count = this.seen.get(slug);
    if (count === undefined) {
      this.seen.set(slug, 0);
      return slug;
    }
    let candidate: string;
    do {
      count++;
      candidate = `${slug}-${count}`;
    } while (this.seen.has(candidate));
    this.seen.set(slug, count);
    this.seen.set(candidate, 0);
    return candidate;
  }
}

const HTML_ESCAPES: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', '\'': '&#39;' };

/** Escapes `& < > " '` for HTML text and attribute values. */
export const escapeHtml = (text: string): string => text.replace(/[&<>"']/g, (c) => HTML_ESCAPES[c]);

/**
 * Escapes the `[` and `]` that are not escaped yet, so that a text can be the text of a Markdown
 * link (existing backslash escapes are kept as they are).
 */
export const escapeLinkText = (text: string): string => {
  let result = '';
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (c === '\\' && i + 1 < text.length) {
      result += c + text[i + 1];
      i++;
    } else {
      result += c === '[' || c === ']' ? `\\${c}` : c;
    }
  }
  return result;
};
