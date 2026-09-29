/**
 * Pure (vscode-independent) implementations of the WRAP-001..WRAP-030 enclose / quote commands.
 *
 * Every transform takes the selected text and the document's end-of-line sequence and returns
 * the transformed text. The rules shared by all commands are:
 * - Command names are the command IDs without the `selection-manipulator.` prefix.
 * - Lines are split on /\r\n|\r|\n/ and joined with the document's EOL. Line-wise commands drop
 *   ONE trailing line break before splitting and append the document's EOL again afterwards, so
 *   the empty string after a final line break is never treated as a line.
 * - Widths (WRAP-025) are counted in code points: a tab and a full-width character are 1 column.
 * - No regular expression has a quantified repetition followed by a condition that can fail
 *   (to avoid ReDoS); trimming and bracket matching are done with plain loops.
 * - Every command counts the characters it adds before building the result and throws
 *   `WrapOutputTooLargeError` when the count exceeds the limit, so a small selection (or a long
 *   prefix repeated on many lines) can never blow up into hundreds of megabytes.
 */

/** The 30 commands in ROADMAP order (WRAP-001..WRAP-030). */
export const WRAP_COMMANDS = [
  'enclose.custom',
  'enclose.each-line.custom',
  'quote.each-line.double',
  'quote.each-line.single',
  'quote.each-word.double',
  'quote.list.sql-in',
  'quote.list.array',
  'quote.triple-double',
  'quote.guillemets',
  'quote.smart-double',
  'quote.smart-single',
  'quote.double-escaped',
  'unquote.each-line',
  'enclose.japanese.white-lenticular',
  'enclose.japanese.tortoise-shell',
  'enclose.japanese.double-angle',
  'enclose.japanese.single-angle',
  'enclose.html-tag',
  'enclose.html-comment',
  'enclose.block-comment',
  'enclose.placeholder',
  'enclose.mustache',
  'enclose.percent',
  'enclose.pipes',
  'enclose.ascii-box',
  'enclose.each-word.paren',
  'enclose.lines-block',
  'enclose.cycle-brackets',
  'enclose.remove-outer-brackets',
  'enclose.markdown-inline-code',
] as const;

export type WrapCommand = typeof WRAP_COMMANDS[number];

/** Commands that ask the user for values (WRAP-001, WRAP-002, WRAP-018, WRAP-027). */
export const WRAP_INPUT_COMMANDS = [
  'enclose.custom',
  'enclose.each-line.custom',
  'enclose.html-tag',
  'enclose.lines-block',
] as const;

export type WrapInputCommand = typeof WRAP_INPUT_COMMANDS[number];

/**
 * Commands that analyse the selected content (lines, words, brackets). They leave empty
 * selections alone (and input commands among them do not ask anything). All other commands
 * enclose the whole selection like the existing Enclose / Quote commands, so an empty
 * selection gets the pair inserted at the cursor.
 */
export const WRAP_CONTENT_COMMANDS: readonly WrapCommand[] = [
  'enclose.each-line.custom',
  'quote.each-line.double',
  'quote.each-line.single',
  'quote.each-word.double',
  'quote.list.sql-in',
  'quote.list.array',
  'unquote.each-line',
  'enclose.ascii-box',
  'enclose.each-word.paren',
  'enclose.lines-block',
  'enclose.cycle-brackets',
  'enclose.remove-outer-brackets',
];

export const isWrapContentCommand = (command: WrapCommand): boolean =>
  WRAP_CONTENT_COMMANDS.includes(command);

export const isWrapInputCommand = (command: WrapCommand): command is WrapInputCommand =>
  (WRAP_INPUT_COMMANDS as readonly WrapCommand[]).includes(command);

export interface WrapOptions {
  /** End-of-line sequence of the document ('\n' or '\r\n'). */
  eol: string;
  /** WRAP-001 / WRAP-002: text put before the selection / each line. */
  prefix?: string;
  /** WRAP-001 / WRAP-002: text put after the selection / each line. */
  suffix?: string;
  /** WRAP-018: tag name (letters, digits and hyphens). */
  tagName?: string;
  /** WRAP-027: line inserted before the selection. */
  before?: string;
  /** WRAP-027: line inserted after the selection. */
  after?: string;
  /**
   * Maximum number of characters the command may add (defaults to MAX_ADDED_LENGTH).
   * The handler lowers it so that all selections share one budget.
   */
  maxAddedLength?: number;
}

export type WrapTransform = (text: string, options: WrapOptions) => string;

// ---------------------------------------------------------------------------
// Output size limit (SECURITY.md: expanding operations must cap their output)
// ---------------------------------------------------------------------------

/** Maximum number of characters one command run may add (shared by all selections). */
export const MAX_ADDED_LENGTH = 10_000_000;

/**
 * Describes an output that is too large, e.g.
 * `the result would add 12,345 characters (limit: 10,000,000)`.
 */
export const describeAddedLength = (added: number, limit: number): string =>
  `the result would add ${added.toLocaleString('en-US')} characters (limit: ${limit.toLocaleString('en-US')})`;

/** Thrown (before the result is built) when a command would add more characters than allowed. */
export class WrapOutputTooLargeError extends Error {
  constructor(readonly added: number, readonly limit: number) {
    const description = describeAddedLength(added, limit);
    super(description.charAt(0).toUpperCase() + description.slice(1));
    this.name = 'WrapOutputTooLargeError';
  }
}

const ensureAddedLength = (added: number, options: WrapOptions): void => {
  const limit = options.maxAddedLength ?? MAX_ADDED_LENGTH;
  if (added > limit) {
    throw new WrapOutputTooLargeError(added, limit);
  }
};

// ---------------------------------------------------------------------------
// Input validation (WRAP-001 / WRAP-002 / WRAP-018 / WRAP-027)
// ---------------------------------------------------------------------------

/** Maximum length of a prefix, suffix or inserted line. */
export const AFFIX_MAX_LENGTH = 1000;
/** Maximum length of a WRAP-018 tag name. */
export const TAG_NAME_MAX_LENGTH = 64;

/**
 * WRAP-001 / WRAP-002 prefix and suffix, WRAP-027 lines: 0 to 1,000 characters without line
 * breaks. Returns an error message, or undefined when valid.
 */
export const validateAffixInput = (value: string): string | undefined => {
  if (value.length > AFFIX_MAX_LENGTH) {
    return `Enter at most ${AFFIX_MAX_LENGTH.toLocaleString('en-US')} characters`;
  }
  if (value.includes('\n') || value.includes('\r')) {
    return 'The text must not contain line breaks';
  }
  return undefined;
};

/**
 * WRAP-018: a tag name of 1 to 64 letters (A-Z, a-z), digits and hyphens. Attributes are not
 * supported. Returns an error message, or undefined when valid.
 */
export const validateTagNameInput = (value: string): string | undefined => {
  if (value.length === 0) {
    return 'Enter a tag name';
  }
  if (value.length > TAG_NAME_MAX_LENGTH) {
    return `The tag name must be at most ${TAG_NAME_MAX_LENGTH} characters`;
  }
  if (!/^[A-Za-z0-9-]+$/.test(value)) {
    return 'The tag name may contain only letters, digits and hyphens';
  }
  return undefined;
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const LINE_BREAK = /\r\n|\r|\n/;

interface SplitText {
  lines: string[];
  /** True when one trailing line break was removed before splitting. */
  trailingBreak: boolean;
}

/** Drops one trailing line break and splits the rest into lines. */
const splitLines = (text: string): SplitText => {
  let body = text;
  let trailingBreak = false;
  if (body.endsWith('\r\n')) {
    body = body.slice(0, -2);
    trailingBreak = true;
  } else if (body.endsWith('\n') || body.endsWith('\r')) {
    body = body.slice(0, -1);
    trailingBreak = true;
  }
  return { lines: body.split(LINE_BREAK), trailingBreak };
};

const joinLines = ({ lines, trailingBreak }: SplitText, eol: string): string =>
  lines.join(eol) + (trailingBreak ? eol : '');

/** Characters that can be added by re-joining with `eol` (CRLF documents with LF text). */
const eolGrowth = (split: SplitText, eol: string): number =>
  (split.lines.length - 1 + (split.trailingBreak ? 1 : 0)) * Math.max(0, eol.length - 1);

const countChar = (text: string, ch: string): number => {
  let count = 0;
  for (let i = 0; i < text.length; i++) {
    if (text[i] === ch) {
      count++;
    }
  }
  return count;
};

const isWhitespace = (ch: string): boolean => /^\s$/.test(ch);

/** Number of runs of non-whitespace characters (the "words" of WRAP-005 / WRAP-026). */
const countWords = (text: string): number => {
  let count = 0;
  let inWord = false;
  for (let i = 0; i < text.length; i++) {
    const word = !isWhitespace(text[i]);
    if (word && !inWord) {
      count++;
    }
    inWord = word;
  }
  return count;
};

/** Number of code points (a surrogate pair is 1). */
const codePointLength = (s: string): number => {
  let count = 0;
  for (let i = 0; i < s.length; i++) {
    const code = s.charCodeAt(i);
    if (code >= 0xd800 && code <= 0xdbff && i + 1 < s.length) {
      const next = s.charCodeAt(i + 1);
      if (next >= 0xdc00 && next <= 0xdfff) {
        i++;
      }
    }
    count++;
  }
  return count;
};

/** Encloses the whole text in a fixed pair. */
const enclose = (open: string, close: string): WrapTransform => (text, options) => {
  ensureAddedLength(open.length + close.length, options);
  return `${open}${text}${close}`;
};

/** Encloses every non-empty line in a pair (empty lines are kept as they are). */
const encloseEachLine = (text: string, open: string, close: string, options: WrapOptions): string => {
  const split = splitLines(text);
  const nonEmpty = split.lines.filter((line) => line.length > 0).length;
  ensureAddedLength(nonEmpty * (open.length + close.length) + eolGrowth(split, options.eol), options);
  return joinLines(
    { ...split, lines: split.lines.map((line) => (line.length > 0 ? `${open}${line}${close}` : line)) },
    options.eol
  );
};

/** Encloses every run of non-whitespace characters; whitespace and line breaks are kept. */
const encloseEachWord = (open: string, close: string): WrapTransform => (text, options) => {
  ensureAddedLength(countWords(text) * (open.length + close.length), options);
  return text.replace(/\S+/g, (word) => `${open}${word}${close}`);
};

/**
 * WRAP-006 / WRAP-007: the lines that are not blank, each quoted, joined with `, ` in one line.
 * One trailing line break of the selection is kept after the list. Unchanged when every line is
 * blank.
 */
const quoteList = (
  open: string,
  close: string,
  escape: (line: string) => string,
  extraPerLine: (line: string) => number
): WrapTransform => (text, options) => {
  const split = splitLines(text);
  const items = split.lines.filter((line) => line.trim() !== '');
  if (items.length === 0) {
    return text;
  }
  // Quotes (2) and separator (2) per item, the brackets, the escapes and the final EOL.
  const added = items.reduce((total, line) => total + 4 + extraPerLine(line), 2) + options.eol.length;
  ensureAddedLength(added, options);
  const list = `${open}${items.map(escape).join(', ')}${close}`;
  return split.trailingBreak ? list + options.eol : list;
};

const QUOTE_CHARACTERS = ['"', "'", '`'];

/** WRAP-013: removes one pair of matching quotes around the trimmed content of a line. */
const unquoteLine = (line: string): string => {
  let start = 0;
  while (start < line.length && isWhitespace(line[start])) {
    start++;
  }
  let end = line.length;
  while (end > start && isWhitespace(line[end - 1])) {
    end--;
  }
  if (end - start < 2) {
    return line;
  }
  const first = line[start];
  if (!QUOTE_CHARACTERS.includes(first) || line[end - 1] !== first) {
    return line;
  }
  return line.slice(0, start) + line.slice(start + 1, end - 1) + line.slice(end);
};

/**
 * True when `text` starts with `open`, ends with `close`, and the outer pair matches: counting
 * only this kind of bracket, the depth first returns to 0 at the last character. So `(a)(b)` and
 * `(a` are not enclosed, `((a))` and `(a(b)c)` are. Brackets inside quotes are counted too.
 */
const hasMatchingOuterPair = (text: string, open: string, close: string): boolean => {
  if (text.length < 2 || text[0] !== open || text[text.length - 1] !== close) {
    return false;
  }
  let depth = 0;
  for (let i = 0; i < text.length; i++) {
    if (text[i] === open) {
      depth++;
    } else if (text[i] === close) {
      depth--;
      if (depth === 0) {
        return i === text.length - 1;
      }
    }
  }
  return false;
};

/** WRAP-028: () -> [] -> {} -> (). */
const CYCLE_BRACKETS: [string, string, string, string][] = [
  ['(', ')', '[', ']'],
  ['[', ']', '{', '}'],
  ['{', '}', '(', ')'],
];

/** WRAP-029: the pairs whose outer match is removed (all are single BMP code units). */
export const REMOVABLE_BRACKETS: [string, string][] = [
  ['(', ')'],
  ['[', ']'],
  ['{', '}'],
  ['<', '>'],
  ['「', '」'],
  ['『', '』'],
  ['【', '】'],
  ['（', '）'],
  ['［', '］'],
  ['｛', '｝'],
  ['＜', '＞'],
  ['〔', '〕'],
  ['〖', '〗'],
  ['《', '》'],
  ['〈', '〉'],
];

/** Length of the longest run of backticks in `text`. */
const longestBacktickRun = (text: string): number => {
  let longest = 0;
  let run = 0;
  for (let i = 0; i < text.length; i++) {
    run = text[i] === '`' ? run + 1 : 0;
    longest = Math.max(longest, run);
  }
  return longest;
};

/** A space or a line break: CommonMark code spans treat line breaks like spaces. */
const isCodeSpanSpace = (ch: string): boolean => ch === ' ' || ch === '\n' || ch === '\r';

/**
 * WRAP-030: a Markdown code span. The fence is one backtick longer than the longest run inside.
 * A space is added on both sides when the content starts or ends with a backtick, or when it
 * starts and ends with a space but is not all spaces (CommonMark strips one such space).
 */
const inlineCode: WrapTransform = (text, options) => {
  const fence = '`'.repeat(longestBacktickRun(text) + 1);
  let pad = false;
  if (text.length > 0) {
    const first = text[0];
    const last = text[text.length - 1];
    if (first === '`' || last === '`') {
      pad = true;
    } else if (isCodeSpanSpace(first) && isCodeSpanSpace(last)) {
      let allSpaces = true;
      for (let i = 0; i < text.length && allSpaces; i++) {
        allSpaces = isCodeSpanSpace(text[i]);
      }
      pad = !allSpaces;
    }
  }
  ensureAddedLength(fence.length * 2 + (pad ? 2 : 0), options);
  const space = pad ? ' ' : '';
  return `${fence}${space}${text}${space}${fence}`;
};

/** WRAP-025: an ASCII box around the lines, as wide as the longest line (in code points). */
const asciiBox: WrapTransform = (text, options) => {
  const split = splitLines(text);
  const widths = split.lines.map(codePointLength);
  // reduce, not Math.max(...widths): spreading a huge array overflows the call stack.
  const width = widths.reduce((max, w) => Math.max(max, w), 0);
  const eol = options.eol;
  // Border lines and their line breaks, then `| ` + padding + ` |` for every line.
  const added = 2 * (width + 4 + eol.length)
    + widths.reduce((total, w) => total + 4 + (width - w), 0)
    + eolGrowth(split, eol);
  ensureAddedLength(added, options);
  const border = `+${'-'.repeat(width + 2)}+`;
  const body = split.lines.map((line, i) => `| ${line}${' '.repeat(width - widths[i])} |`);
  return joinLines({ lines: [border, ...body, border], trailingBreak: split.trailingBreak }, eol);
};

/** WRAP-027: `before` on its own line before the selection and `after` on its own line after it. */
const linesBlock: WrapTransform = (text, options) => {
  const before = options.before ?? '';
  const after = options.after ?? '';
  const eol = options.eol;
  ensureAddedLength(before.length + after.length + 2 * eol.length, options);
  const endsWithBreak = text.endsWith('\n') || text.endsWith('\r');
  return endsWithBreak
    ? `${before}${eol}${text}${after}${eol}`
    : `${before}${eol}${text}${eol}${after}`;
};

const escapeDoubleQuoted = (text: string): string => text.replace(/\\/g, '\\\\').replace(/"/g, '\\"');

// ---------------------------------------------------------------------------
// Transforms
// ---------------------------------------------------------------------------

export const wrapTransforms: Record<WrapCommand, WrapTransform> = {
  'enclose.custom': (text, options) => {
    const prefix = options.prefix ?? '';
    const suffix = options.suffix ?? '';
    if (prefix === '' && suffix === '') {
      return text;
    }
    return enclose(prefix, suffix)(text, options);
  },
  'enclose.each-line.custom': (text, options) => {
    const prefix = options.prefix ?? '';
    const suffix = options.suffix ?? '';
    if (prefix === '' && suffix === '') {
      return text;
    }
    return encloseEachLine(text, prefix, suffix, options);
  },
  'quote.each-line.double': (text, options) => encloseEachLine(text, '"', '"', options),
  'quote.each-line.single': (text, options) => encloseEachLine(text, "'", "'", options),
  'quote.each-word.double': encloseEachWord('"', '"'),
  'quote.list.sql-in': quoteList('(', ')', (line) => `'${line.replace(/'/g, "''")}'`, (line) => countChar(line, "'")),
  'quote.list.array': quoteList(
    '[',
    ']',
    (line) => `"${escapeDoubleQuoted(line)}"`,
    (line) => countChar(line, '\\') + countChar(line, '"')
  ),
  'quote.triple-double': enclose('"""', '"""'),
  'quote.guillemets': enclose('«', '»'),
  'quote.smart-double': enclose('“', '”'),
  'quote.smart-single': enclose('‘', '’'),
  'quote.double-escaped': (text, options) => {
    ensureAddedLength(countChar(text, '\\') + countChar(text, '"') + 2, options);
    return `"${escapeDoubleQuoted(text)}"`;
  },
  'unquote.each-line': (text, options) => {
    const split = splitLines(text);
    ensureAddedLength(eolGrowth(split, options.eol), options);
    return joinLines({ ...split, lines: split.lines.map(unquoteLine) }, options.eol);
  },
  'enclose.japanese.white-lenticular': enclose('〖', '〗'),
  'enclose.japanese.tortoise-shell': enclose('〔', '〕'),
  'enclose.japanese.double-angle': enclose('《', '》'),
  'enclose.japanese.single-angle': enclose('〈', '〉'),
  'enclose.html-tag': (text, options) => {
    const tagName = options.tagName ?? '';
    // Checked again here: the tag name ends up in markup (SECURITY.md).
    const error = validateTagNameInput(tagName);
    if (error !== undefined) {
      throw new Error(error);
    }
    return enclose(`<${tagName}>`, `</${tagName}>`)(text, options);
  },
  'enclose.html-comment': enclose('<!-- ', ' -->'),
  'enclose.block-comment': enclose('/* ', ' */'),
  'enclose.placeholder': enclose('${', '}'),
  'enclose.mustache': enclose('{{ ', ' }}'),
  'enclose.percent': enclose('%', '%'),
  'enclose.pipes': enclose('|', '|'),
  'enclose.ascii-box': asciiBox,
  'enclose.each-word.paren': encloseEachWord('(', ')'),
  'enclose.lines-block': linesBlock,
  'enclose.cycle-brackets': (text) => {
    for (const [open, close, nextOpen, nextClose] of CYCLE_BRACKETS) {
      if (hasMatchingOuterPair(text, open, close)) {
        return `${nextOpen}${text.slice(1, -1)}${nextClose}`;
      }
    }
    return text;
  },
  'enclose.remove-outer-brackets': (text) => {
    for (const [open, close] of REMOVABLE_BRACKETS) {
      if (hasMatchingOuterPair(text, open, close)) {
        return text.slice(1, -1);
      }
    }
    return text;
  },
  'enclose.markdown-inline-code': inlineCode,
};
