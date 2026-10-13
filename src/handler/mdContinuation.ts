/**
 * Paragraph continuation lines after a block that a Markdown command writes (SELEC-00146,
 * SELEC-00150, SELEC-00151).
 *
 * When MD-003 (table of contents), MD-014 (code fence), MD-024 (details block) or JAUNIX-020
 * (GitHub alert) replaces a selection that ends a paragraph line L part way (or right after L's line
 * break), the next line N stays after the block the command wrote. If N was a continuation line of
 * L's paragraph, it may then be read as something else: indented by 4 columns or more, as an
 * indented code block or as a paragraph of the last item of the table of contents; indented by 1
 * to 3 columns, as a paragraph of that item; and when its text may start a block that cannot
 * interrupt a paragraph (`2. x`, an empty `*`), as that block. This module tells whether N is such
 * a continuation line and how to keep it a paragraph of its own: its indentation is dropped, and
 * when its text would then start a block, one backslash escape is put before the character that
 * starts it (which does not change how the line is shown). The lines that cannot stay a paragraph
 * shown as before (fences, HTML blocks, link reference definitions, tables) are left as they are.
 *
 * SELEC-00151 adds what the same commands need around that line: every later line of the
 * paragraph after a list item or a quote line written in place of its first line part
 * (`writtenEdits`), the end of a paragraph (MD-023's definitions, `topParagraphEnd`), a one-line
 * block indented by 1 to 3 columns and a list item after a lazy paragraph that a table of contents
 * leaves (`interruptingLine`, `lazyListAfter`), and the line after an HTML block that MD-019 leaves
 * open (`afterHtmlBlock`, `htmlBlockOpenAfter`).
 *
 * What is judged follows CommonMark 0.31 (and GFM tables). Every form that is not certain is left
 * as it is (as before): nested containers, a list item or quote whose content may start a block,
 * blocks inside containers, and so on.
 *
 * Only pure functions and classes on the text: no vscode, no regular expression with nested
 * quantifiers; the lines are read forward once (linear in the text over all the selections).
 */
import {
  FenceOpening,
  fenceOpening,
  ForwardSearch,
  indentWidth,
  isBlank,
  isDelimiterRow,
  isFenceClosing,
  isSpaceOrTab,
  isThematicBreak,
  LineSpan,
  lineSpans,
  ListItemLine,
  parseAtxHeading,
  parseListItem,
  setextLevel,
} from './mdCommon';

/**
 * Whether a line whose text (after its indentation) starts with `c` may start a block: an ATX
 * heading (`#`), a list item or a thematic break (`-`, `+`, `*`, `_`, a digit), a block quote
 * (`>`), a code fence (`` ` ``, `~`), an HTML block (`<`), a link reference or footnote definition
 * (`[`), a table (`|`) or a setext underline (`=`). This is wider than the blocks themselves (`#x`
 * starts none): such a line is looked at more closely (`blockAt`).
 */
export const mayStartBlock = (c: string | undefined): boolean =>
  c !== undefined && c.length === 1 && ('#-+*_>`~<[|='.includes(c) || (c >= '0' && c <= '9'));

// ---------------------------------------------------------------------------
// HTML blocks
// ---------------------------------------------------------------------------

/** The kinds of HTML block of CommonMark 0.31 (4.6), numbered as there. */
export type HtmlBlockKind = 1 | 2 | 3 | 4 | 5 | 6 | 7;

const RAW_TAGS = ['pre', 'script', 'style', 'textarea'];

/**
 * The tag names of kind 6 (CommonMark 0.31; `source`, which 0.31 dropped, is kept: a line read as
 * kind 6 instead of 7 only makes this module leave more lines as they are).
 */
const BLOCK_TAGS = new Set([
  'address', 'article', 'aside', 'base', 'basefont', 'blockquote', 'body', 'caption', 'center', 'col', 'colgroup', 'dd',
  'details', 'dialog', 'dir', 'div', 'dl', 'dt', 'fieldset', 'figcaption', 'figure', 'footer', 'form', 'frame', 'frameset',
  'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'head', 'header', 'hr', 'html', 'iframe', 'legend', 'li', 'link', 'main', 'menu',
  'menuitem', 'nav', 'noframes', 'ol', 'optgroup', 'option', 'p', 'param', 'search', 'section', 'source', 'summary',
  'table', 'tbody', 'td', 'tfoot', 'th', 'thead', 'title', 'tr', 'track', 'ul',
]);

const isAsciiLetter = (c: string | undefined): boolean => c !== undefined && /^[A-Za-z]$/.test(c);
const isTagNameChar = (c: string | undefined): boolean => c !== undefined && /^[A-Za-z0-9-]$/.test(c);
const isAttributeNameStart = (c: string | undefined): boolean => c !== undefined && /^[A-Za-z_:]$/.test(c);
const isAttributeNameChar = (c: string | undefined): boolean => c !== undefined && /^[A-Za-z0-9_.:-]$/.test(c);
const isUnquotedValueChar = (c: string | undefined): boolean => c !== undefined && !/^[\s"'=<>`]$/.test(c);

const skipSpaces = (s: string, from: number): number => {
  let i = from;
  while (i < s.length && isSpaceOrTab(s[i])) {
    i++;
  }
  return i;
};

/**
 * Whether `s` (starting with `<`) is a complete open tag or closing tag followed only by spaces and
 * tabs, as the start of a kind 7 HTML block: `<name attr="v" …>`, `<name/>`, `</name>`. The tag is
 * read by a scanner that follows the grammar of CommonMark 0.31 (6.6) on one line: tag name,
 * attributes with an unquoted, single-quoted or double-quoted value, and `>` or `/>`. Each character
 * is read once.
 */
const completeTagLine = (s: string): boolean => {
  let i = 1;
  const closing = s[i] === '/';
  if (closing) {
    i++;
  }
  if (!isAsciiLetter(s[i])) {
    return false;
  }
  while (isTagNameChar(s[i])) {
    i++;
  }
  if (closing) {
    i = skipSpaces(s, i);
    if (s[i] !== '>') {
      return false;
    }
    return s.slice(i + 1).trim() === '';
  }
  for (;;) {
    const next = skipSpaces(s, i);
    if (s[next] === '>') {
      i = next + 1;
      break;
    }
    if (s[next] === '/' && s[next + 1] === '>') {
      i = next + 2;
      break;
    }
    // An attribute: after whitespace, a name, then optionally `=` and a value.
    if (next === i || !isAttributeNameStart(s[next])) {
      return false;
    }
    i = next + 1;
    while (isAttributeNameChar(s[i])) {
      i++;
    }
    const equals = skipSpaces(s, i);
    if (s[equals] === '=') {
      let value = skipSpaces(s, equals + 1);
      const quote = s[value];
      if (quote === '"' || quote === "'") {
        const close = s.indexOf(quote, value + 1);
        if (close < 0) {
          return false;
        }
        i = close + 1;
      } else {
        const start = value;
        while (isUnquotedValueChar(s[value])) {
          value++;
        }
        if (value === start) {
          return false;
        }
        i = value;
      }
    }
  }
  return s.slice(i).trim() === '';
};

/**
 * The kind of HTML block that a line starts (`content`: the line without its indentation of at
 * most 3 columns), following the start conditions of CommonMark 0.31 (4.6), or undefined:
 * 1. `<pre`, `<script`, `<style` or `<textarea` (any case) followed by a space, a tab, `>` or the
 *    end of the line;
 * 2. `<!--`; 3. `<?`; 4. `<!` and an ASCII letter; 5. `<![CDATA[`;
 * 6. `<` or `</` and one of the block tag names, followed by a space, a tab, the end of the line,
 *    `>` or `/>`;
 * 7. a complete open or closing tag (another name) followed only by spaces and tabs (it cannot
 *    interrupt a paragraph).
 * Text after a tag (`<b>x</b> foo`) and an autolink (`<http://x>`) start none.
 */
export const htmlBlockStart = (content: string): HtmlBlockKind | undefined => {
  if (content[0] !== '<') {
    return undefined;
  }
  const raw = /^<([A-Za-z]+)(?:[ \t>]|$)/.exec(content);
  if (raw !== null && RAW_TAGS.includes(raw[1].toLowerCase())) {
    return 1;
  }
  if (content.startsWith('<!--')) {
    return 2;
  }
  if (content.startsWith('<?')) {
    return 3;
  }
  if (content.startsWith('<![CDATA[')) {
    return 5;
  }
  if (content.startsWith('<!') && isAsciiLetter(content[2])) {
    return 4;
  }
  const tag = /^<\/?([A-Za-z][A-Za-z0-9-]*)/.exec(content);
  if (tag === null) {
    return undefined;
  }
  const name = tag[1].toLowerCase();
  const after = content.slice(tag[0].length);
  if (BLOCK_TAGS.has(name) && (after === '' || isSpaceOrTab(after[0]) || after[0] === '>' || after.startsWith('/>'))) {
    return 6;
  }
  return !RAW_TAGS.includes(name) && completeTagLine(content) ? 7 : undefined;
};

/** Whether `line` ends an HTML block of kind 1 to 5 (the line that starts it counts too). */
export const htmlBlockEnds = (kind: HtmlBlockKind, line: string): boolean => {
  switch (kind) {
    case 1:
      return /<\/(?:pre|script|style|textarea)>/i.test(line);
    case 2:
      return line.includes('-->');
    case 3:
      return line.includes('?>');
    case 4:
      return line.includes('>');
    case 5:
      return line.includes(']]>');
    default:
      return isBlank(line);
  }
};

// ---------------------------------------------------------------------------
// What a line starts
// ---------------------------------------------------------------------------

/**
 * Whether a line starting with `[` may be (the start of) a link reference or footnote definition:
 * the first `]` that is not escaped is followed by `:`, or there is none on the line (the label may
 * go on on the next line).
 */
const mayBeDefinition = (t: string): boolean => {
  for (let i = 1; i < t.length; i++) {
    if (t[i] === '\\') {
      i++;
    } else if (t[i] === ']') {
      return t[i + 1] === ':';
    }
  }
  return true;
};

/** What a line's text starts, as far as an open paragraph is concerned. */
type BlockStart =
  /** Paragraph text: it starts a paragraph or continues the open one. */
  | { type: 'none' }
  | { type: 'fence'; opening: FenceOpening }
  | { type: 'html'; kind: HtmlBlockKind }
  /** An ATX heading, a thematic break or a setext underline: one line, not a paragraph. */
  | { type: 'line' }
  | { type: 'quote' }
  | { type: 'list'; item: ListItemLine }
  /** Not certain (a table, a definition, a lazy setext-like line): left as before. */
  | { type: 'uncertain' };

const NONE: BlockStart = { type: 'none' };
const ONE_LINE: BlockStart = { type: 'line' };
const UNCERTAIN: BlockStart = { type: 'uncertain' };

/** The text after a list item's marker and the spaces after it. */
const itemContent = (t: string, item: ListItemLine): string => t.slice(item.marker.length + item.spacing.length);

/**
 * What the text `t` of a line (without its indentation, at most 3 columns, relative to its
 * container) starts. `paragraph`: a paragraph is open right before the line. `lazy`: the line is
 * outside the container of that paragraph (a lazy continuation line: no `>` for a quote, less
 * indentation than the content of a list item); then the paragraph is not the innermost open
 * block, so any list item starts a new list (not only a non-empty one starting with 1), a kind 7
 * HTML block may start, and a setext underline does not apply.
 */
const blockAt = (t: string, paragraph: boolean, lazy: boolean): BlockStart => {
  const opening = fenceOpening(t);
  if (opening !== undefined) {
    return { type: 'fence', opening };
  }
  if (t[0] === '<') {
    const kind = htmlBlockStart(t);
    if (kind !== undefined) {
      if (kind === 7 && paragraph) {
        return lazy ? UNCERTAIN : NONE;
      }
      return { type: 'html', kind };
    }
  }
  if (parseAtxHeading(t) !== undefined) {
    return ONE_LINE;
  }
  if (paragraph && !lazy && setextLevel(t) !== undefined) {
    return ONE_LINE;
  }
  if (isThematicBreak(t)) {
    return ONE_LINE;
  }
  if (t[0] === '>') {
    return { type: 'quote' };
  }
  const item = parseListItem(t);
  if (item !== undefined) {
    // Only a non-empty item starting with 1 interrupts a paragraph.
    if (paragraph && !lazy && (isBlank(itemContent(t, item)) || (item.ordered && Number(item.number) !== 1))) {
      return NONE;
    }
    return { type: 'list', item };
  }
  if (lazy && setextLevel(t) !== undefined) {
    return UNCERTAIN;
  }
  if (t[0] === '|') {
    return UNCERTAIN;
  }
  if (t[0] === '[') {
    // A definition cannot interrupt a paragraph.
    return (paragraph && !lazy) || !mayBeDefinition(t) ? NONE : UNCERTAIN;
  }
  return NONE;
};

/**
 * How the text `t` of a line is read at the start of a block (right after a blank line, a closing
 * fence, or the start of the text), with `nextLine` after it:
 * - `plain`: as a paragraph;
 * - `escape`: as a block that one backslash at `at` makes a paragraph shown the same way: an ATX
 *   heading (`\#`), a thematic break (`\***`, `\- - -`), a bullet list item (`\-`, `\+`, `\*`,
 *   empty ones included), a block quote (`\>`), an ordered list item (`12\.`, `3\)`: the backslash
 *   goes before the delimiter, since `\1` is no escape). The escaped character is shown as it is,
 *   and it cannot pair with anything (it was not a delimiter run before either: at the start of a
 *   line, followed by a space or alone);
 * - `unsafe`: as a block that no escape keeps shown the same way, so the line is left as before:
 *   a code fence (`` \``` `` may pair with backticks later on the line as a new code span), an
 *   HTML block of any kind (`\<div>` shows the tag as text, where it was inline HTML before), a link
 *   reference or footnote definition (escaping `[` turns the definition's later uses into plain
 *   text), a line starting with `|` or followed by a table delimiter row (whether it becomes a table
 *   row depends on the lines around it and on how far a renderer lets a table interrupt a
 *   paragraph; an escaped `\|` also changes how the cells of a table are split).
 */
export type FreshBlock = { kind: 'plain' } | { kind: 'escape'; at: number } | { kind: 'unsafe' };

const PLAIN: FreshBlock = { kind: 'plain' };
const UNSAFE: FreshBlock = { kind: 'unsafe' };
const ESCAPE_FIRST: FreshBlock = { kind: 'escape', at: 0 };

export const freshBlock = (t: string, nextLine?: string): FreshBlock => {
  if (nextLine !== undefined && isDelimiterRow(nextLine)) {
    return UNSAFE;
  }
  if (t[0] === '|' || fenceOpening(t) !== undefined || htmlBlockStart(t) !== undefined || (t[0] === '[' && mayBeDefinition(t))) {
    return UNSAFE;
  }
  // A thematic break is looked at before a list item (`* * *`, `- - -`); a setext underline needs a
  // paragraph before it, and there is none at the start of a block (`===` is plain).
  if (parseAtxHeading(t) !== undefined || isThematicBreak(t) || t[0] === '>') {
    return ESCAPE_FIRST;
  }
  const item = parseListItem(t);
  if (item !== undefined) {
    return item.ordered && item.number !== undefined ? { kind: 'escape', at: item.number.length } : ESCAPE_FIRST;
  }
  return PLAIN;
};

// ---------------------------------------------------------------------------
// The paragraph context of each line
// ---------------------------------------------------------------------------

/**
 * The container of a paragraph line: none (`top`), a list item whose content starts at column
 * `content` (not nested), or a block quote (not nested).
 */
export type ParagraphContainer = { kind: 'top' } | { kind: 'list'; content: number } | { kind: 'quote' };

const TOP: ParagraphContainer = { kind: 'top' };
const QUOTE: ParagraphContainer = { kind: 'quote' };

/** A line that is not a paragraph line, or one that is not certainly one. */
const OTHER = undefined;

type Mode =
  | 'normal'
  /** In a fenced code block at the top level, up to its closing fence. */
  | 'fence'
  /** In an HTML block at the top level, up to its end condition. */
  | 'html'
  /** In something not certain at the top level (a table, a definition), up to a blank line. */
  | 'untilBlank'
  /** In something not certain in a container: up to a line with text at column 0 after a blank line (which closes every container). */
  | 'unknown';

/**
 * Whether each line is a paragraph line and in which container, read forward from the first line
 * once (each line is judged once, when it or a later line is first asked for). Only what is
 * certain is a paragraph line; every other form is `undefined` (as before):
 * - fenced code and HTML blocks (each of the 7 kinds up to its own end) at the top level; blank
 *   lines; ATX headings, thematic breaks, setext underlines; tables and what may be a definition;
 * - a list item line whose marker is followed by a tab, by 5 columns or more (indented code) or by
 *   nothing, or whose content may start a block (for a task list item, the text after its
 *   checkbox: `- [ ] foo` is a paragraph line, `- [ ]` and `- [ ] # x` are not); a quote line followed by a tab, or whose content
 *   is indented code or may start a block; any block that starts inside a list item or a quote
 *   (nested lists and quotes, fences, headings…): from there on, every line up to a line with text
 *   at column 0 after a blank line (which closes every container) is `undefined`.
 * A paragraph line is the first line of a paragraph or a continuation line (a lazy one included:
 * `- foo⏎bar`, `> foo⏎bar`).
 */
export class ParagraphContext {
  private readonly judged: (ParagraphContainer | undefined)[] = [];
  private mode: Mode = 'normal';
  private fence: FenceOpening | undefined;
  private htmlKind: HtmlBlockKind = 1;
  private sawBlank = false;
  /** The open list item or quote (undefined: none). */
  private container: ParagraphContainer | undefined;
  /** Whether a paragraph is open (in `container`, or at the top level). */
  private paragraph = false;

  constructor(private readonly text: string, private readonly spans: readonly LineSpan[]) {}

  /** The container of line `k` when it is a paragraph line, otherwise undefined. */
  at(k: number): ParagraphContainer | undefined {
    while (this.judged.length <= k && this.judged.length < this.spans.length) {
      this.judged.push(this.judge(this.judged.length));
    }
    return this.judged[k];
  }

  private lineText(k: number): string {
    return this.text.slice(this.spans[k].start, this.spans[k].end);
  }

  private judge(k: number): ParagraphContainer | undefined {
    const line = this.lineText(k);
    switch (this.mode) {
      case 'fence':
        if (this.fence !== undefined && isFenceClosing(line, this.fence)) {
          this.mode = 'normal';
        }
        return OTHER;
      case 'html':
        if (htmlBlockEnds(this.htmlKind, line)) {
          this.mode = 'normal';
        }
        return OTHER;
      case 'untilBlank':
        if (isBlank(line)) {
          this.mode = 'normal';
        }
        return OTHER;
      case 'unknown':
        if (isBlank(line)) {
          this.sawBlank = true;
          return OTHER;
        }
        if (!this.sawBlank || isSpaceOrTab(line[0])) {
          this.sawBlank = false;
          return OTHER;
        }
        this.mode = 'normal';
        this.container = undefined;
        this.paragraph = false;
        break;
      default:
        break;
    }
    return this.normal(k, line);
  }

  private unknown(): undefined {
    this.mode = 'unknown';
    this.sawBlank = false;
    this.container = undefined;
    this.paragraph = false;
    return OTHER;
  }

  /** Line `k` is paragraph text in `container` (unless the next line makes it a table's header row). */
  private paragraphLine(k: number, container: ParagraphContainer): ParagraphContainer | undefined {
    if (k + 1 < this.spans.length && isDelimiterRow(this.lineText(k + 1))) {
      return this.unknown();
    }
    this.container = container.kind === 'top' ? undefined : container;
    this.paragraph = true;
    return container;
  }

  private normal(k: number, line: string): ParagraphContainer | undefined {
    if (isBlank(line)) {
      this.paragraph = false;
      // A quote ends at a blank line; a list item stays open, and the next line with text decides.
      if (this.container?.kind === 'quote') {
        this.container = undefined;
      }
      return OTHER;
    }
    let indent = 0;
    while (isSpaceOrTab(line[indent])) {
      indent++;
    }
    const width = indentWidth(line.slice(0, indent));
    const t = line.slice(indent);
    const container = this.container;
    if (container?.kind === 'list') {
      if (width >= container.content) {
        return this.inListItem(k, container, width - container.content, t);
      }
      if (this.paragraph) {
        const lazy = this.lazyLine(k, container, width, t);
        if (lazy !== 'closes') {
          return lazy;
        }
      }
    } else if (container?.kind === 'quote') {
      if (width <= 3 && t[0] === '>') {
        return this.quoteLine(k, t);
      }
      if (this.paragraph) {
        const lazy = this.lazyLine(k, container, width, t);
        if (lazy !== 'closes') {
          return lazy;
        }
      }
    }
    // The container (if any) ends here.
    if (container !== undefined) {
      this.container = undefined;
      this.paragraph = false;
    }
    return this.topLine(k, width, t);
  }

  /** A line outside the container of an open paragraph: a lazy continuation line, or what closes the container. */
  private lazyLine(k: number, container: ParagraphContainer, width: number, t: string): ParagraphContainer | undefined | 'closes' {
    if (width >= 4 || !mayStartBlock(t[0])) {
      return this.paragraphLine(k, container);
    }
    const block = blockAt(t, true, true);
    if (block.type === 'none') {
      return this.paragraphLine(k, container);
    }
    return block.type === 'uncertain' ? this.unknown() : 'closes';
  }

  /** A line in a list item (indented by `r` columns from the item's content). */
  private inListItem(k: number, container: ParagraphContainer, r: number, t: string): ParagraphContainer | undefined {
    if (r >= 4) {
      // A continuation line, or an indented code block in the item.
      return this.paragraph ? this.paragraphLine(k, container) : OTHER;
    }
    if (!mayStartBlock(t[0]) || (this.paragraph && blockAt(t, true, false).type === 'none')) {
      return this.paragraphLine(k, container);
    }
    return this.unknown();
  }

  /** A line starting with `>` (`t`: from the `>`). */
  private quoteLine(k: number, t: string): ParagraphContainer | undefined {
    let rest = t.slice(1);
    if (rest[0] === '\t') {
      return this.unknown();
    }
    if (rest[0] === ' ') {
      rest = rest.slice(1);
    }
    let w = 0;
    while (isSpaceOrTab(rest[w])) {
      if (rest[w] === '\t') {
        return this.unknown();
      }
      w++;
    }
    const u = rest.slice(w);
    const continuing = this.container?.kind === 'quote' && this.paragraph;
    this.container = QUOTE;
    if (u === '') {
      this.paragraph = false;
      return OTHER;
    }
    if (mayStartBlock(u[0])) {
      return this.unknown();
    }
    if (!continuing && w >= 4) {
      // An indented code block in the quote.
      this.paragraph = false;
      return OTHER;
    }
    return this.paragraphLine(k, QUOTE);
  }

  /** A line outside any container (`width`: its indentation, `t`: its text). */
  private topLine(k: number, width: number, t: string): ParagraphContainer | undefined {
    if (width >= 4) {
      // A continuation line, or an indented code block.
      return this.paragraph ? this.paragraphLine(k, TOP) : OTHER;
    }
    if (t[0] === '>') {
      return this.quoteLine(k, t);
    }
    if (!mayStartBlock(t[0])) {
      return this.paragraphLine(k, TOP);
    }
    const block = blockAt(t, this.paragraph, false);
    switch (block.type) {
      case 'none':
        return this.paragraphLine(k, TOP);
      case 'fence':
        this.paragraph = false;
        this.mode = 'fence';
        this.fence = block.opening;
        return OTHER;
      case 'html':
        this.paragraph = false;
        if (block.kind > 5 || !htmlBlockEnds(block.kind, t)) {
          this.mode = 'html';
          this.htmlKind = block.kind;
        }
        return OTHER;
      case 'line':
        this.paragraph = false;
        return OTHER;
      case 'list': {
        const item = block.item;
        // A task list item (`- [ ] foo`, SELEC-00151) is judged by the text after its checkbox: the
        // checkbox is paragraph text (followed by a space, a tab or the end of the line, it is no
        // definition), and the item's content column depends only on the marker and the spaces
        // after it. `[x]: foo` has no checkbox and stays a possible definition.
        const content = item.checkbox === undefined ? itemContent(t, item) : item.rest;
        if (item.spacing.includes('\t') || item.spacing.length >= 5 || isBlank(content) || mayStartBlock(content[0])) {
          return this.unknown();
        }
        return this.paragraphLine(k, { kind: 'list', content: width + item.marker.length + item.spacing.length });
      }
      case 'quote':
        return this.quoteLine(k, t);
      default:
        this.paragraph = false;
        this.mode = 'untilBlank';
        return OTHER;
    }
  }
}

// ---------------------------------------------------------------------------
// The continuation line after a block
// ---------------------------------------------------------------------------

/** How a continuation line N is kept a paragraph of its own (offsets in the line). */
export interface LineContinuation {
  /** Where N's text starts (after its indentation). */
  body: number;
  /** The width of N's indentation (a tab counting to the next multiple of 4). */
  width: number;
  /** `[body, end)` is replaced with `insert`: '' (only the indentation is dropped), `\` or the number and `\`. */
  end: number;
  insert: string;
  /** Whether a backslash is put in. */
  escaped: boolean;
}

/**
 * Whether `line` (N) is a continuation line of the paragraph whose last line (L) is in `container`,
 * and how it is kept a paragraph of its own after a block written in place of (the end of) L, or
 * undefined when it is not, or when it cannot be (`freshBlock` is `unsafe`). N's indentation `r`
 * is measured from the start of the line, or from the content of L's list item when N is in it.
 * - N with a `>` (3 columns or less) after a quote line is not looked at (it stays in the quote);
 * - indented by 4 columns or more from there, N is a continuation line (an indented code block
 *   cannot interrupt a paragraph);
 * - otherwise N is one unless its text starts a block that interrupts the paragraph (`blockAt`) or
 *   may be a table or a definition: `2. x`, an empty `*`, `#x`, `*emph*`, a kind 7 HTML tag are
 *   continuation lines; `# x`, `- x`, `1. x`, `> x`, `---`, `===`, a fence are not. Outside L's
 *   container (a lazy line), any list item and a kind 7 tag are not.
 */
export const lineContinuation = (container: ParagraphContainer, line: string, nextLine?: string): LineContinuation | undefined => {
  let body = 0;
  while (isSpaceOrTab(line[body])) {
    body++;
  }
  const t = line.slice(body);
  if (t === '') {
    return undefined;
  }
  const width = indentWidth(line.slice(0, body));
  let r = width;
  let lazy = false;
  if (container.kind === 'list') {
    if (width >= container.content) {
      r = width - container.content;
    } else {
      lazy = true;
    }
  } else if (container.kind === 'quote') {
    if (width <= 3 && t[0] === '>') {
      return undefined;
    }
    lazy = true;
  }
  if (r <= 3 && mayStartBlock(t[0])) {
    if (t[0] === '|' || (t[0] === '[' && mayBeDefinition(t)) || blockAt(t, true, lazy).type !== 'none') {
      return undefined;
    }
  }
  const fresh = freshBlock(t, nextLine);
  if (fresh.kind === 'unsafe') {
    return undefined;
  }
  if (fresh.kind === 'plain') {
    return { body, width, end: body, insert: '', escaped: false };
  }
  return { body, width, end: body + fresh.at, insert: `${t.slice(0, fresh.at)}\\`, escaped: true };
};

/** A continuation line N found by `ContinuationLines` (offsets in the text). */
export interface Continuation extends LineContinuation {
  /** The container of L (the line before N). */
  container: ParagraphContainer;
}

/**
 * The paragraph continuation lines after the selections of one command run. The lines and their
 * paragraph context are made once, when first needed, and all the lookups move forward (the
 * selections are in document order), so a whole run reads the text about once.
 */
export class ContinuationLines {
  private readonly spans: LineSpan[];
  private readonly context: ParagraphContext;
  private lineAt = 0;
  /** `plainFrom` up to (not including) `plainStop`: lines with text that do not start with a character that may start a block. */
  private plainFrom = -1;
  private plainStop = -1;

  private readonly nextText: ForwardSearch;

  constructor(private readonly text: string) {
    this.spans = lineSpans(text);
    this.context = new ParagraphContext(text, this.spans);
    this.nextText = new ForwardSearch(text, (c) => !isSpaceOrTab(c));
  }

  /**
   * The line N after a selection that ends at `end` (asked for in increasing order): the next line
   * when the selection ends inside a line with only spaces and tabs after it on that line
   * (`inside`), or the line at `end` when the selection ends right after a line break; undefined
   * otherwise.
   */
  lineAfter(end: number): { n: number; inside: boolean } | undefined {
    const k = this.lineOf(end);
    if (end > 0 && end === this.spans[k].start) {
      return { n: k, inside: false };
    }
    return this.nextText.find(end) >= this.spans[k].end ? { n: k + 1, inside: true } : undefined;
  }

  /** Where line `k` starts. */
  lineStart(k: number): number {
    return this.spans[k].start;
  }

  /** Where line `k` ends (before its line break). */
  lineEnd(k: number): number {
    return this.spans[k].end;
  }

  /** The text of line `k` from `from` (an offset in it) to its end. */
  restOfLine(k: number, from: number): string {
    return this.text.slice(from, this.spans[k].end);
  }

  /**
   * The indentation at the start of line `k` that is exactly `columns` wide (a tab counting to the
   * next multiple of 4), or undefined when the line has less indentation or a tab goes past it.
   */
  indentPrefix(k: number, columns: number): string | undefined {
    const { start, end } = this.spans[k];
    let width = 0;
    let i = start;
    while (width < columns && i < end && isSpaceOrTab(this.text[i])) {
      width = this.text[i] === '\t' ? width + 4 - (width % 4) : width + 1;
      i++;
    }
    return width === columns ? this.text.slice(start, i) : undefined;
  }

  /** The line of `offset` (the offsets asked for do not go back). */
  lineOf(offset: number): number {
    while (this.lineAt < this.spans.length - 1 && this.spans[this.lineAt].next <= offset) {
      this.lineAt++;
    }
    return this.lineAt;
  }

  private lineText(k: number): string {
    return this.text.slice(this.spans[k].start, this.spans[k].end);
  }

  /**
   * Whether every line from `from` up to the end of the paragraph (a blank line or the end of the
   * text) has text that does not start with a character that may start a block after its
   * indentation. When L is in a list item or a quote, N without its indentation becomes a paragraph
   * at the top level, and the lines after it go with it: a line that was a nested list in the item
   * (`    - x`) or a quote line (`> baz`) would be read differently, so N is left as before then.
   * (After a list item or a quote line written in place of L, the later lines are looked at one by
   * one instead: `writtenEdits`, SELEC-00151.) Asked for with `from` mostly increasing, the lines
   * are read about once.
   */
  restIsPlain(from: number): boolean {
    if (from < this.plainFrom || from > this.plainStop) {
      let k = from;
      for (; k < this.spans.length; k++) {
        const line = this.lineText(k);
        let i = 0;
        while (isSpaceOrTab(line[i])) {
          i++;
        }
        if (i === line.length || mayStartBlock(line[i])) {
          break;
        }
      }
      this.plainFrom = from;
      this.plainStop = k;
    }
    return this.plainStop >= this.spans.length || isBlank(this.lineText(this.plainStop));
  }

  /**
   * Line `n` (N) as a continuation line of the paragraph line `n - 1` (L), or undefined (see
   * `lineContinuation`; when L is in a list item or a quote, also `restIsPlain`).
   */
  at(n: number): Continuation | undefined {
    const found = this.continuationOf(n);
    if (found === undefined || (found.container.kind !== 'top' && !this.restIsPlain(n + 1))) {
      return undefined;
    }
    return found;
  }

  /** `at` without the look at the later lines of the paragraph. */
  private continuationOf(n: number): Continuation | undefined {
    if (n < 1 || n >= this.spans.length) {
      return undefined;
    }
    const container = this.context.at(n - 1);
    if (container === undefined) {
      return undefined;
    }
    return this.continuationIn(container, n);
  }

  private continuationIn(container: ParagraphContainer, n: number): Continuation | undefined {
    const next = n + 1 < this.spans.length ? this.lineText(n + 1) : undefined;
    const found = lineContinuation(container, this.lineText(n), next);
    if (found === undefined) {
      return undefined;
    }
    const start = this.spans[n].start;
    return { ...found, body: start + found.body, end: start + found.end, container };
  }

  /** The number of lines. */
  get lineCount(): number {
    return this.spans.length;
  }

  /** The text of line `k` (without its line break). */
  textOf(k: number): string {
    return this.lineText(k);
  }

  /** The container of line `k` when it is certainly a paragraph line (`ParagraphContext`), otherwise undefined. */
  containerOf(k: number): ParagraphContainer | undefined {
    return k >= 0 && k < this.spans.length ? this.context.at(k) : undefined;
  }

  // -------------------------------------------------------------------------
  // The rest of a paragraph at the top level (SELEC-00151)
  // -------------------------------------------------------------------------

  /** The paragraph walked last (`topParagraph`), with the edits worked out for each content column. */
  private walked: TopParagraph | undefined;

  /**
   * The lines of the paragraph at the top level from line `n` (N, after the paragraph line `n - 1`
   * at the top level) up to its end, read forward once: each line of the paragraph as a
   * continuation line (`lineContinuation`, or undefined when it is one that cannot be kept shown
   * the same way, or not certainly one), and what ends the paragraph. A later `n` in the same
   * paragraph reuses the walk, so asked for with `n` increasing, every line is read about once.
   */
  private topParagraph(n: number): TopParagraph {
    const walked = this.walked;
    if (walked !== undefined && n >= walked.from && n <= walked.stop) {
      return walked;
    }
    const lines: (Continuation | undefined)[] = [];
    let m = n;
    // After a paragraph line at the top level, a line with text is a continuation line exactly
    // when `ParagraphContext` makes it a paragraph line at the top level too.
    while (m < this.spans.length && !isBlank(this.lineText(m)) && this.context.at(m)?.kind === 'top') {
      lines.push(this.continuationIn(TOP, m));
      m++;
    }
    const paragraph: TopParagraph = { from: n, stop: m, lines, end: this.paragraphEnd(m), edits: new Map() };
    this.walked = paragraph;
    return paragraph;
  }

  /** What line `m` is when it ends a paragraph at the top level (see `ParagraphEnd`). */
  private paragraphEnd(m: number): ParagraphEnd {
    if (m >= this.spans.length || isBlank(this.lineText(m))) {
      return END_OF_PARAGRAPH;
    }
    const line = this.lineText(m);
    let indent = 0;
    while (isSpaceOrTab(line[indent])) {
      indent++;
    }
    const width = indentWidth(line.slice(0, indent));
    const t = line.slice(indent);
    // A line that would continue the paragraph but is not a paragraph line (a table's header row)
    // or that is not certain (a table, a definition) is not certain either.
    if (width >= 4) {
      return UNCERTAIN_END;
    }
    const block = blockAt(t, true, false);
    return block.type === 'none' || block.type === 'uncertain' ? UNCERTAIN_END : { kind: 'block', width, text: t };
  }

  /**
   * After a list item or a quote line written in place of (the end of) the paragraph line `n - 1`
   * (L) at the top level, the backslashes that keep every later line of L's paragraph (from N, line
   * `n`) read as before (`writtenLineChange`), in order, or undefined when the paragraph is left as
   * before: some line of it cannot be kept shown the same way or is not certain, or the line that
   * ends it would be read differently after the line written (`keepsEnd`). An empty list: nothing
   * to change. Each content column is worked out once for the whole paragraph, so this stays
   * linear over the selections.
   */
  writtenEdits(n: number, written: WrittenLine & { kind: 'lazy' }): LineEdit[] | undefined {
    const paragraph = this.topParagraph(n);
    let edits = paragraph.edits.get(written.content);
    if (edits === undefined) {
      edits = this.editsFor(paragraph, written);
      paragraph.edits.set(written.content, edits);
    }
    if (edits === 'unchanged' || edits.lastUnsafe >= n) {
      return undefined;
    }
    // The first edit at or after line `n` (the edits are in line order).
    let low = 0;
    let high = edits.edits.length;
    while (low < high) {
      const middle = (low + high) >> 1;
      if (edits.edits[middle].line < n) {
        low = middle + 1;
      } else {
        high = middle;
      }
    }
    return edits.edits.slice(low);
  }

  private editsFor(paragraph: TopParagraph, written: WrittenLine & { kind: 'lazy' }): ParagraphEdits {
    if (!keepsEnd(written, paragraph.end)) {
      return 'unchanged';
    }
    const edits: LineEdit[] = [];
    let lastUnsafe = -1;
    paragraph.lines.forEach((found, j) => {
      const line = paragraph.from + j;
      const change = found === undefined ? 'unsafe' : writtenLineChange(written, found, this.text.slice(found.body, this.spans[line].end));
      if (change === 'unsafe') {
        lastUnsafe = line;
      } else if (change !== 'none' && found !== undefined) {
        edits.push({ line, start: found.body, end: found.body + change.at, insert: change.insert });
      }
    });
    return { edits, lastUnsafe };
  }

  /**
   * The end of the last line of the paragraph at the top level that line `k` is a line of (`k`
   * itself when the next line does not continue it), or undefined when `k` is not certainly a
   * paragraph line at the top level, when some later line of the paragraph is not certain, or when
   * the line after the paragraph is a setext underline (the paragraph is a heading). MD-023 writes
   * its definitions there (SELEC-00151).
   */
  topParagraphEnd(k: number): number | undefined {
    if (this.context.at(k)?.kind !== 'top') {
      return undefined;
    }
    if (k + 1 >= this.spans.length) {
      return this.spans[k].end;
    }
    // Every line walked is certainly a paragraph line (`ParagraphContext`), whether or not it could
    // be kept a paragraph of its own: only the line after the paragraph matters here.
    const paragraph = this.topParagraph(k + 1);
    const end = paragraph.end;
    if (end.kind === 'uncertain' || (end.kind === 'block' && setextLevel(end.text) !== undefined)) {
      return undefined;
    }
    return this.spans[paragraph.stop - 1].end;
  }

  // -------------------------------------------------------------------------
  // MD-003: what follows the table of contents (SELEC-00151)
  // -------------------------------------------------------------------------

  /**
   * Line `n` (N) when it is indented by 1 to 3 columns after a paragraph line at the top level and
   * starts a block of one line that interrupts the paragraph and is read the same way without its
   * indentation: an ATX heading (`  # x`), a thematic break that is no setext underline (`  ***`,
   * `  - - -`), or a block quote line (`  > x`: the later lines of the quote stay in it with or
   * without their own 0 to 3 columns, and its lazy continuation lines too). Then only its
   * indentation is to be taken (`insert` ''), so that it is not taken into the last item of a table
   * of contents written before it. Other blocks (a list item, whose content column would move, a
   * fence or an HTML block, whose lines are read relative to that indentation, a table or a
   * definition) give undefined.
   */
  interruptingLine(n: number): Continuation | undefined {
    if (n < 1 || n >= this.spans.length || this.context.at(n - 1)?.kind !== 'top') {
      return undefined;
    }
    const line = this.lineText(n);
    let body = 0;
    while (isSpaceOrTab(line[body])) {
      body++;
    }
    const width = indentWidth(line.slice(0, body));
    const t = line.slice(body);
    if (width < 1 || width > 3 || t === '') {
      return undefined;
    }
    const block = blockAt(t, true, false);
    const oneLine = block.type === 'line' && setextLevel(t) === undefined && (parseAtxHeading(t) !== undefined || isThematicBreak(t));
    if (!oneLine && block.type !== 'quote') {
      return undefined;
    }
    const start = this.spans[n].start;
    return { body: start + body, width, end: start + body, insert: '', escaped: false, container: TOP };
  }

  /**
   * When L (line `n - 1`) is in a list item or a quote and its paragraph goes to the top level
   * after a table of contents written in place of the paragraph's start (`# A⏎> foo⏎bar⏎2. x`):
   * N (line `n`) as a continuation line, and the line T after the paragraph's last line that was a
   * list item interrupting it only as a lazy line (an ordered item not starting with 1, or an empty
   * item: they cannot interrupt a paragraph at the top level, so T would become paragraph text).
   * A blank line is then written before T so that it still starts a list. Every line between N and
   * T must have text that does not start with a character that may start a block (as with
   * `restIsPlain`), T must be outside the container (no `>`, or less indented than the item's
   * content) and indented by 3 columns or less. Otherwise undefined.
   */
  lazyListAfter(n: number): { found: Continuation; before: number } | undefined {
    const found = this.continuationOf(n);
    if (found === undefined || found.container.kind === 'top') {
      return undefined;
    }
    let m = n + 1;
    for (; m < this.spans.length; m++) {
      const line = this.lineText(m);
      let i = 0;
      while (isSpaceOrTab(line[i])) {
        i++;
      }
      if (i === line.length || mayStartBlock(line[i])) {
        break;
      }
    }
    if (m >= this.spans.length || isBlank(this.lineText(m))) {
      return undefined;
    }
    const line = this.lineText(m);
    let body = 0;
    while (isSpaceOrTab(line[body])) {
      body++;
    }
    const width = indentWidth(line.slice(0, body));
    const t = line.slice(body);
    const lazy = found.container.kind === 'quote' ? t[0] !== '>' : width < found.container.content;
    if (!lazy || width > 3 || parseListItem(t) === undefined
      || blockAt(t, true, false).type !== 'none' || blockAt(t, true, true).type !== 'list') {
      return undefined;
    }
    return { found, before: this.spans[m].start };
  }
}

/** What ends a paragraph at the top level (the line after its last line). */
type ParagraphEnd =
  /** A blank line or the end of the text. */
  | { kind: 'end' }
  /** A block that interrupts the paragraph, indented by `width` (3 columns or less), with its text `text`. */
  | { kind: 'block'; width: number; text: string }
  /** A line that is not certain (a table, a definition…). */
  | { kind: 'uncertain' };

const END_OF_PARAGRAPH: ParagraphEnd = { kind: 'end' };
const UNCERTAIN_END: ParagraphEnd = { kind: 'uncertain' };

/** One line changed: `[start, end)` of the text is replaced with `insert`. */
export interface LineEdit {
  line: number;
  start: number;
  end: number;
  insert: string;
}

/** The edits for one content column, and the last line that cannot be kept shown the same way (-1: none). */
type ParagraphEdits = { edits: LineEdit[]; lastUnsafe: number } | 'unchanged';

interface TopParagraph {
  /** The first line walked (N) and the line that ends the paragraph. */
  from: number;
  stop: number;
  /** The lines `from` up to `stop` (exclusive) as continuation lines. */
  lines: (Continuation | undefined)[];
  end: ParagraphEnd;
  edits: Map<number, ParagraphEdits>;
}

/**
 * Whether the line that ends the paragraph (`end`) is read as before after a list item or a quote
 * line written in place of its first line part: a blank line or the end of the text are; a block
 * that interrupted the paragraph still interrupts it as a lazy line (outside the item written),
 * except a `>` line after a quote (the quote would take it in), a setext underline (the paragraph
 * was a heading) and a block indented as far as the content of the item written (by 3 columns or
 * less from there: it would be a block in the item, `  # x` after `- foo`). A line that is not
 * certain is not.
 */
const keepsEnd = (written: WrittenLine & { kind: 'lazy' }, end: ParagraphEnd): boolean => {
  if (end.kind !== 'block') {
    return end.kind === 'end';
  }
  if (setextLevel(end.text) !== undefined) {
    return false;
  }
  if (written.content === Number.POSITIVE_INFINITY) {
    return end.text[0] !== '>';
  }
  return end.width < written.content;
};

/**
 * How the last line a command writes in place of (the end of) a paragraph line L at the top level
 * changes the reading of the continuation line N after it, for the commands that write no line
 * after the selection (MD-001, MD-004..006, MD-015):
 * - `block`: an ATX heading or a thematic break, a block of one line. N then starts a new block, as
 *   after MD-014's closing fence: indented by 4 columns or more, it is an indented code block, and
 *   a text that starts a block (`2. x`, an empty `*`) starts it.
 * - `lazy`: a list item whose content starts at column `content`, or a block quote (`content`
 *   infinite). N stays a lazy continuation line of the paragraph in it, except when it is less
 *   indented than the content and is a list item of any kind: the list (or the document) is then
 *   the innermost open block, not the paragraph, so even `2. x` or an empty `*` starts a new list or
 *   item (as CommonMark's reference implementations read it). Indented as far as the content of a
 *   list item or further (by 3 columns or less from there), N is a line of the item instead, where a
 *   text that interrupts a paragraph starts a block in it (`    - x` a nested list).
 * - undefined: anything else (a paragraph line, inline markup…; a list item with a tab after its
 *   marker, empty, or indented by 4 columns or more), after which N is read as before.
 */
export type WrittenLine = { kind: 'block' } | { kind: 'lazy'; content: number };

export const writtenLine = (line: string): WrittenLine | undefined => {
  let indent = 0;
  while (isSpaceOrTab(line[indent])) {
    indent++;
  }
  const width = indentWidth(line.slice(0, indent));
  const t = line.slice(indent);
  if (width >= 4 || t === '') {
    return undefined;
  }
  if (parseAtxHeading(t) !== undefined || isThematicBreak(t)) {
    return { kind: 'block' };
  }
  if (t[0] === '>') {
    return { kind: 'lazy', content: Number.POSITIVE_INFINITY };
  }
  const item = parseListItem(t);
  if (item === undefined || item.spacing.includes('\t') || isBlank(itemContent(t, item))) {
    return undefined;
  }
  // With 5 columns or more after the marker, the content starts 1 column after it (indented code).
  const spacing = item.spacing.length >= 5 ? 1 : item.spacing.length;
  return { kind: 'lazy', content: width + item.marker.length + spacing };
};

/** How N is changed after the line written: `[body, body + at)` is replaced with `insert`. */
export interface WrittenLineEdit {
  at: number;
  insert: string;
}

/**
 * How the continuation line N (`found`, with its text from its body `rest`) is changed so that it is
 * read as before after the line written (`written`), or undefined when it is read as before already
 * (or cannot be kept a paragraph shown the same way):
 * - after a `block`, when it is indented by 4 columns or more or needs a backslash: `found`'s own
 *   edit (its indentation is taken by the caller);
 * - after a `lazy` line, when it is indented by less than the content (and 3 columns or less) and
 *   is a list item: `found`'s backslash before the list marker;
 * - after a `lazy` list item, when it is indented as far as the content or further, by 3 columns or
 *   less from there: N is then a line of the item, where the paragraph is the innermost open block,
 *   so a text that interrupts a paragraph (`blockAt`) starts a block in the item (`    - x` a nested
 *   list, `    # x` a heading, `    > x` a quote, `    ***` a thematic break, `    ---` /
 *   `    ===` / `    -` a setext underline that makes L a heading). Its indentation is kept and one
 *   backslash is put in with the same rule as `freshBlock`'s `escape` (`\===` for a setext
 *   underline that is no thematic break or list item, which `freshBlock` calls plain since nothing
 *   precedes a fresh block). Text that does not interrupt a paragraph (`2. x`, an empty `*`, `#x`)
 *   needs nothing. A text that no escape keeps shown the same way (a fence, an HTML block of kind 1
 *   to 6: `freshBlock`'s `unsafe`) is left as before, for the reasons given there (`found`, made
 *   with `freshBlock` too, already leaves such a line out; the check here keeps that so whatever
 *   `found` is); the lines that may be a table or a definition (and a line followed by a delimiter
 *   row) are not continuation lines (`found`) in the first place either.
 */
export const writtenLineEdit = (written: WrittenLine, found: LineContinuation, rest: string): WrittenLineEdit | undefined => {
  const change = writtenLineChange(written, found, rest);
  return typeof change === 'string' ? undefined : change;
};

/**
 * `writtenLineEdit`, telling a line read as before already (`none`) from one that would be read
 * differently but cannot be kept shown the same way (`unsafe`: a fence or an HTML block in the
 * item's content), which leaves a whole paragraph as before when a later line of it is changed
 * (SELEC-00151).
 */
export const writtenLineChange = (written: WrittenLine, found: LineContinuation, rest: string): WrittenLineEdit | 'none' | 'unsafe' => {
  const own: WrittenLineEdit = { at: found.end - found.body, insert: found.insert };
  if (written.kind === 'block') {
    return found.width >= 4 || found.escaped ? own : 'none';
  }
  if (found.width < written.content) {
    return found.width <= 3 && parseListItem(rest) !== undefined ? own : 'none';
  }
  if (found.width - written.content > 3 || blockAt(rest, true, false).type === 'none') {
    return 'none';
  }
  const fresh = freshBlock(rest);
  if (fresh.kind === 'escape') {
    return { at: fresh.at, insert: `${rest.slice(0, fresh.at)}\\` };
  }
  return fresh.kind === 'plain' && setextLevel(rest) !== undefined ? { at: 0, insert: '\\' } : 'unsafe';
};

// ---------------------------------------------------------------------------
// The line after an HTML block (MD-019, SELEC-00151)
// ---------------------------------------------------------------------------

/** How the line N after a blank line written before it is changed: `[start, end)` of N is replaced with `insert`. */
export interface LineChange {
  start: number;
  end: number;
  insert: string;
}

const BLOCK_LINE: WrittenLine = { kind: 'block' };

/**
 * How a line read at the start of a block (`line`, after a blank line written before it) is kept
 * read as it was after the paragraph line L before it: `keep` (it is read the same way as it is),
 * the change to make, or undefined when it cannot be (everything is then left as before).
 * - A continuation line of L's paragraph (`lineContinuation`) becomes a paragraph of its own: with
 *   the same rule as after MD-014's closing fence, indented by 4 columns or more it loses its
 *   indentation (otherwise an indented code block), and a text that would start a block gets one
 *   backslash. A continuation line that no backslash keeps shown the same way (an HTML block's tag,
 *   a definition, indented code that starts a fence) is left as before: after the blank line, it
 *   would start an HTML block or a definition (whose text is not shown at all) or a code block,
 *   which is no closer to how it was shown than being raw HTML in the block before.
 * - A block that interrupted L's paragraph (a heading, a list item, a quote, a fence, an HTML block
 *   of kind 1 to 6, a thematic break) is read the same way after the blank line: `keep`. A setext
 *   underline is not (L's paragraph was a heading): undefined.
 */
const freshLineChange = (line: string, nextLine: string | undefined): LineChange | 'keep' | undefined => {
  const found = lineContinuation(TOP, line, nextLine);
  if (found !== undefined) {
    const change = writtenLineChange(BLOCK_LINE, found, line.slice(found.body));
    // After the blank line, N's indentation is taken (from its start) when it is changed.
    return typeof change === 'string' ? 'keep' : { start: 0, end: found.body + change.at, insert: change.insert };
  }
  let body = 0;
  while (isSpaceOrTab(line[body])) {
    body++;
  }
  const t = line.slice(body);
  if (indentWidth(line.slice(0, body)) > 3 || setextLevel(t) !== undefined) {
    return undefined;
  }
  const block = blockAt(t, true, false);
  return block.type === 'none' || block.type === 'uncertain' ? undefined : 'keep';
};

/**
 * MD-019: how the line N after an HTML block that the output left open is changed, once a blank
 * line is written between the output and N so that the block does not take N in as raw HTML. L,
 * the paragraph line where the output ends, is at the top level (`marker` undefined) or in a block
 * quote whose marker (L's indentation and `>`) is `marker`. Returns `keep`, the change to make in N
 * (offsets in N's line), or undefined when N cannot be kept read as before (then nothing is written).
 * - At the top level, N gets `freshLineChange`.
 * - In a quote, the blank line is a line with the quote's marker only, so that the quote goes on. A
 *   line N with its own `>` (3 columns or less) is read from after its `>` and the one space after
 *   it, with the same rule (`>     bar` loses the indentation after `> `, `> 2. x` gets
 *   `> 2\. x`); a tab right after `>` or in that indentation is not certain. A blank quote line ends
 *   the HTML block by itself, so nothing is needed (undefined). A lazy continuation line N (without
 *   `>`) would be outside the quote after the blank line: it gets the quote's marker and a space in
 *   place of its indentation (`bar` → `> bar`) when its text is plain (not starting with a
 *   character that may start a block) and indented by 3 columns or less; such a line that may start
 *   a block or is indented further is not certain (undefined), and one that interrupts the
 *   paragraph (and closed the quote) is read the same way after the blank line (`keep`).
 */
export const afterHtmlBlock = (line: string, nextLine: string | undefined, marker: string | undefined): LineChange | 'keep' | undefined => {
  if (marker === undefined) {
    return freshLineChange(line, nextLine);
  }
  let indent = 0;
  while (isSpaceOrTab(line[indent])) {
    indent++;
  }
  const width = indentWidth(line.slice(0, indent));
  const t = line.slice(indent);
  if (width <= 3 && t[0] === '>') {
    let from = indent + 1;
    if (line[from] === ' ') {
      from++;
    }
    let i = from;
    while (isSpaceOrTab(line[i])) {
      if (line[i] === '\t') {
        return undefined;
      }
      i++;
    }
    if (line[indent + 1] === '\t' || i === line.length) {
      return undefined;
    }
    const change = freshLineChange(line.slice(from), undefined);
    return change === undefined || change === 'keep' ? change : { start: from + change.start, end: from + change.end, insert: change.insert };
  }
  if (t === '') {
    return undefined;
  }
  if (!mayStartBlock(t[0])) {
    return width <= 3 ? { start: 0, end: indent, insert: `${marker} ` } : undefined;
  }
  const block = blockAt(t, true, true);
  return width > 3 || block.type === 'none' || block.type === 'uncertain' ? undefined : 'keep';
};

/**
 * Whether the HTML block that the lines of `output` (MD-019's result, written at the start of a
 * line's content) start is still open after its last line, so that the next line would be taken
 * into it: a block of kind 1 to 5 not closed by its end condition, or one of kind 6 (a block tag:
 * `<p>`, `<h1>`, `<ul>`…) that runs up to the next blank line. A line that starts no HTML block
 * outside one (or a kind 7 tag, which MD-019 does not write) leaves nothing open.
 */
export const htmlBlockOpenAfter = (output: string): boolean => {
  let open: HtmlBlockKind | undefined;
  for (const { start, end } of lineSpans(output)) {
    const line = output.slice(start, end);
    if (open === undefined) {
      let indent = 0;
      while (line[indent] === ' ') {
        indent++;
      }
      const kind = indent <= 3 ? htmlBlockStart(line.slice(indent)) : undefined;
      open = kind === undefined || kind === 7 || (kind <= 5 && htmlBlockEnds(kind, line)) ? undefined : kind;
    } else if (htmlBlockEnds(open, line)) {
      open = undefined;
    }
  }
  return open !== undefined;
};
