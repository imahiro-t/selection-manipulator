/**
 * Pure (vscode-independent) implementations of the WS-001..WS-035 whitespace commands.
 *
 * Every transform takes the selected text and the document's end-of-line sequence
 * and returns the transformed text. The rules shared by all commands are:
 * - Lines are split on /\r\n|\r|\n/ and joined with the document's EOL.
 * - Line-wise commands drop ONE trailing line break before splitting and append the
 *   document's EOL again afterwards, so the empty string after a final line break is
 *   never treated as a line (WS-025 is the documented exception).
 * - Widths are counted in code points (a tab and a full-width character are 1 column),
 *   except for WS-033 / WS-034 where tabs advance to the next tab stop.
 * - No regular expression has a quantified repetition followed by a condition that can
 *   fail (to avoid ReDoS); trimming is done with plain loops.
 */

export type WhitespaceCommand =
  | 'tabs-to-spaces-2'
  | 'tabs-to-spaces-4'
  | 'spaces-to-tabs-2'
  | 'spaces-to-tabs-4'
  | 'reindent-2-to-4'
  | 'reindent-4-to-2'
  | 'dedent'
  | 'trim-leading'
  | 'collapse-blank-lines'
  | 'remove-all'
  | 'unwrap-paragraphs'
  | 'hard-wrap-80'
  | 'hard-wrap-n'
  | 'nbsp-to-space'
  | 'visualize'
  | 'unvisualize'
  | 'center-align'
  | 'right-align'
  | 'pad-to-longest'
  | 'align-equals'
  | 'align-colon'
  | 'align-comma'
  | 'align-custom'
  | 'blank-line-between'
  | 'remove-trailing-blank-lines'
  | 'remove-leading-blank-lines'
  | 'collapse-inline'
  | 'space-around-operators'
  | 'remove-space-before-punctuation'
  | 'space-after-comma'
  | 'indent-n'
  | 'outdent-n'
  | 'expand-tabs'
  | 'unexpand-tabs'
  | 'clear-blank-only-lines';

/** Commands that ask the user for a value (WS-013, WS-023, WS-031, WS-032). */
export type WhitespaceInputCommand = 'hard-wrap-n' | 'align-custom' | 'indent-n' | 'outdent-n';

export interface WhitespaceOptions {
  /** End-of-line sequence of the document ('\n' or '\r\n'). */
  eol: string;
  /** Column count (WS-013) or number of spaces (WS-031 / WS-032). */
  n?: number;
  /** Literal delimiter (WS-023). */
  delimiter?: string;
}

export type WhitespaceTransform = (text: string, options: WhitespaceOptions) => string;

// ---------------------------------------------------------------------------
// Input validation (WS-013 / WS-023 / WS-031 / WS-032)
// ---------------------------------------------------------------------------

export const COLUMN_MIN = 1;
export const COLUMN_MAX = 1000;
export const INDENT_MIN = 1;
export const INDENT_MAX = 100;
export const DELIMITER_MAX_LENGTH = 100;

const validateInteger = (value: string, min: number, max: number): string | undefined => {
  const trimmed = value.trim();
  if (!/^[0-9]{1,7}$/.test(trimmed)) {
    return `Enter an integer from ${min} to ${max}`;
  }
  const n = Number(trimmed);
  if (n < min || n > max) {
    return `Enter an integer from ${min} to ${max}`;
  }
  return undefined;
};

/** WS-013: column count, an integer from 1 to 1000. Returns an error message, or undefined when valid. */
export const validateColumnInput = (value: string): string | undefined =>
  validateInteger(value, COLUMN_MIN, COLUMN_MAX);

/** WS-031 / WS-032: number of spaces, an integer from 1 to 100. Returns an error message, or undefined when valid. */
export const validateIndentInput = (value: string): string | undefined =>
  validateInteger(value, INDENT_MIN, INDENT_MAX);

/** WS-023: a literal delimiter of 1 to 100 characters, without line breaks and not whitespace only. */
export const validateDelimiterInput = (value: string): string | undefined => {
  if (value.length === 0) {
    return 'Enter a delimiter';
  }
  if (value.length > DELIMITER_MAX_LENGTH) {
    return `The delimiter must be at most ${DELIMITER_MAX_LENGTH} characters`;
  }
  if (value.includes('\n') || value.includes('\r')) {
    return 'The delimiter must not contain line breaks';
  }
  if (value.trim() === '') {
    return 'The delimiter must not be whitespace only';
  }
  return undefined;
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const LINE_BREAK = /\r\n|\r|\n/;

/** Space or tab. */
const isSpaceOrTab = (ch: string): boolean => ch === ' ' || ch === '\t';

/** Unicode whitespace other than line breaks ([^\S\r\n]). All such characters are in the BMP. */
const isHorizontalWs = (ch: string): boolean =>
  ch !== '\n' && ch !== '\r' && /^\s$/.test(ch);

/** Number of leading code units of `s` satisfying `pred`. */
const leadingLength = (s: string, pred: (ch: string) => boolean): number => {
  let i = 0;
  while (i < s.length && pred(s[i])) {
    i++;
  }
  return i;
};

/** Number of trailing code units of `s` satisfying `pred`. */
const trailingStart = (s: string, pred: (ch: string) => boolean): number => {
  let i = s.length;
  while (i > 0 && pred(s[i - 1])) {
    i--;
  }
  return i;
};

const trimStartWs = (s: string): string => s.slice(leadingLength(s, isHorizontalWs));
const trimEndWs = (s: string): string => s.slice(0, trailingStart(s, isHorizontalWs));
const trimWs = (s: string): string => trimEndWs(trimStartWs(s));

/** Leading spaces and tabs of a line. */
const leadingSpaceTab = (s: string): string => s.slice(0, leadingLength(s, isSpaceOrTab));

/** A line that is empty or only contains (non line-break) whitespace. */
const isBlankLine = (s: string): boolean => leadingLength(s, isHorizontalWs) === s.length;

/** Width of a string in code points. */
export const codePointWidth = (s: string): number => {
  let n = 0;
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    // Count a surrogate pair once (skip the low surrogate following a high surrogate).
    if (c >= 0xdc00 && c <= 0xdfff && i > 0) {
      const p = s.charCodeAt(i - 1);
      if (p >= 0xd800 && p <= 0xdbff) {
        continue;
      }
    }
    n++;
  }
  return n;
};

const spaces = (n: number): string => (n > 0 ? ' '.repeat(n) : '');

/** Length of the single trailing line break of `text` (0, 1 or 2). */
const trailingBreakLength = (text: string): number => {
  if (text.endsWith('\r\n')) {
    return 2;
  }
  if (text.endsWith('\n') || text.endsWith('\r')) {
    return 1;
  }
  return 0;
};

/**
 * Applies a line-wise transformation. One trailing line break is removed before
 * splitting and the document EOL is appended again afterwards.
 */
const lineWise = (text: string, eol: string, fn: (lines: string[]) => string[]): string => {
  if (text === '') {
    return text;
  }
  const breakLength = trailingBreakLength(text);
  const body = breakLength > 0 ? text.slice(0, text.length - breakLength) : text;
  const lines = fn(body.split(LINE_BREAK));
  return lines.join(eol) + (breakLength > 0 ? eol : '');
};

const mapLines = (fn: (line: string) => string): WhitespaceTransform => (text, { eol }) =>
  lineWise(text, eol, (lines) => lines.map(fn));

// ---------------------------------------------------------------------------
// A. Indent / tabs
// ---------------------------------------------------------------------------

/** WS-001 / WS-002: tabs inside the leading whitespace become `n` spaces each. */
const leadingTabsToSpaces = (n: number): WhitespaceTransform => mapLines((line) => {
  const indent = leadingSpaceTab(line);
  return indent.split('\t').join(spaces(n)) + line.slice(indent.length);
});

/** WS-003 / WS-004: every run of `n` spaces (left to right) in the leading whitespace becomes a tab. */
const leadingSpacesToTabs = (n: number): WhitespaceTransform => mapLines((line) => {
  const indent = leadingSpaceTab(line);
  return indent.split(spaces(n)).join('\t') + line.slice(indent.length);
});

/** WS-005 / WS-006: leading spaces k become floor(k/from)*to + k%from. Lines starting with a tab are unchanged. */
const reindent = (from: number, to: number): WhitespaceTransform => mapLines((line) => {
  const k = leadingLength(line, (ch) => ch === ' ');
  if (k === 0) {
    return line;
  }
  return spaces(Math.floor(k / from) * to + (k % from)) + line.slice(k);
});

/** WS-007: removes the longest leading whitespace prefix shared by every non-blank line. */
const dedent: WhitespaceTransform = (text, { eol }) => lineWise(text, eol, (lines) => {
  let prefix: string | undefined;
  for (const line of lines) {
    if (isBlankLine(line)) {
      continue;
    }
    const indent = leadingSpaceTab(line);
    if (prefix === undefined) {
      prefix = indent;
    } else {
      let i = 0;
      while (i < prefix.length && i < indent.length && prefix[i] === indent[i]) {
        i++;
      }
      prefix = prefix.slice(0, i);
    }
    if (prefix === '') {
      break;
    }
  }
  if (!prefix) {
    return lines;
  }
  const p = prefix;
  return lines.map((line) => (line.startsWith(p) ? line.slice(p.length) : line));
});

/** WS-031: adds `n` spaces to the start of every line that is not blank. */
const indentN: WhitespaceTransform = (text, options) => {
  const pad = spaces(options.n ?? 4);
  return mapLines((line) => (isBlankLine(line) ? line : pad + line))(text, options);
};

/** WS-032: removes up to `n` leading spaces (stops at a tab). */
const outdentN: WhitespaceTransform = (text, options) => {
  const n = options.n ?? 4;
  return mapLines((line) => {
    let i = 0;
    while (i < n && i < line.length && line[i] === ' ') {
      i++;
    }
    return line.slice(i);
  })(text, options);
};

const TAB_STOP = 4;

/** WS-033: expands every tab to spaces up to the next tab stop (4). */
const expandTabs: WhitespaceTransform = mapLines((line) => {
  if (!line.includes('\t')) {
    return line;
  }
  const out: string[] = [];
  let col = 0;
  for (const ch of line) {
    if (ch === '\t') {
      const width = TAB_STOP - (col % TAB_STOP);
      out.push(spaces(width));
      col += width;
    } else {
      out.push(ch);
      col++;
    }
  }
  return out.join('');
});

/**
 * WS-034: replaces runs of spaces that end on a tab stop (4) with tabs. A segment of a
 * single space ending on a tab stop is kept as a space when the run does not continue
 * beyond that tab stop (so an ordinary word separator such as `abc d` is not changed).
 */
const unexpandTabs: WhitespaceTransform = mapLines((line) => {
  if (!line.includes(' ')) {
    return line;
  }
  const chars = Array.from(line);
  const out: string[] = [];
  let col = 0;
  let i = 0;
  while (i < chars.length) {
    const ch = chars[i];
    if (ch === ' ') {
      let j = i;
      while (j < chars.length && chars[j] === ' ') {
        j++;
      }
      const start = col;
      const end = col + (j - i);
      let p = start;
      for (;;) {
        const stop = (Math.floor(p / TAB_STOP) + 1) * TAB_STOP;
        if (stop > end) {
          break;
        }
        const segment = stop - p;
        out.push(segment >= 2 || stop < end ? '\t' : ' ');
        p = stop;
      }
      out.push(spaces(end - p));
      col = end;
      i = j;
    } else if (ch === '\t') {
      out.push(ch);
      col = (Math.floor(col / TAB_STOP) + 1) * TAB_STOP;
      i++;
    } else {
      out.push(ch);
      col++;
      i++;
    }
  }
  return out.join('');
});

// ---------------------------------------------------------------------------
// B. Lines / blank lines
// ---------------------------------------------------------------------------

/** WS-008: removes the leading whitespace of every line (trailing whitespace is kept). */
const trimLeading: WhitespaceTransform = mapLines(trimStartWs);

/** WS-009: two or more consecutive blank lines become one empty line. A single blank line is kept as is. */
const collapseBlankLines: WhitespaceTransform = (text, { eol }) => lineWise(text, eol, (lines) => {
  const out: string[] = [];
  let i = 0;
  while (i < lines.length) {
    if (!isBlankLine(lines[i])) {
      out.push(lines[i]);
      i++;
      continue;
    }
    let j = i;
    while (j < lines.length && isBlankLine(lines[j])) {
      j++;
    }
    out.push(j - i >= 2 ? '' : lines[i]);
    i = j;
  }
  return out;
});

/** WS-024: inserts an empty line between two adjacent non-blank lines. */
const blankLineBetween: WhitespaceTransform = (text, { eol }) => lineWise(text, eol, (lines) => {
  const out: string[] = [];
  lines.forEach((line, i) => {
    if (i > 0 && !isBlankLine(lines[i - 1]) && !isBlankLine(line)) {
      out.push('');
    }
    out.push(line);
  });
  return out;
});

/**
 * WS-025: removes the blank lines at the end of the selection together with the line
 * break before them. Unlike the other line-wise commands, the empty string after a final
 * line break counts as a blank line, so `a⏎b⏎⏎⏎` becomes `a⏎b`.
 */
const removeTrailingBlankLines: WhitespaceTransform = (text, { eol }) => {
  if (text === '') {
    return text;
  }
  const lines = text.split(LINE_BREAK);
  let end = lines.length;
  while (end > 0 && isBlankLine(lines[end - 1])) {
    end--;
  }
  if (end === lines.length) {
    return text;
  }
  return lines.slice(0, end).join(eol);
};

/** WS-026: removes the blank lines at the start of the selection together with the line break after them. */
const removeLeadingBlankLines: WhitespaceTransform = (text, { eol }) => {
  if (text === '') {
    return text;
  }
  const breakLength = trailingBreakLength(text);
  const body = breakLength > 0 ? text.slice(0, text.length - breakLength) : text;
  const lines = body.split(LINE_BREAK);
  let start = 0;
  while (start < lines.length && isBlankLine(lines[start])) {
    start++;
  }
  if (start === 0) {
    return text;
  }
  if (start === lines.length) {
    return '';
  }
  return lines.slice(start).join(eol) + (breakLength > 0 ? eol : '');
};

/** WS-035: whitespace-only lines become empty lines (the number of lines does not change). */
const clearBlankOnlyLines: WhitespaceTransform = mapLines((line) => (isBlankLine(line) ? '' : line));

// ---------------------------------------------------------------------------
// C. Whitespace characters / visualisation
// ---------------------------------------------------------------------------

/** WS-010: removes every whitespace character (JavaScript \s), including line breaks. */
const removeAll: WhitespaceTransform = (text) => text.replace(/\s+/g, '');

/**
 * WS-014: special spaces become a normal space. Targets: U+00A0, U+1680, U+2000..U+200A,
 * U+202F, U+205F. The ideographic space (U+3000) and zero-width characters (U+200B, U+FEFF)
 * are intentionally left alone.
 */
export const SPECIAL_SPACES = /[   -   ]/g;
const nbspToSpace: WhitespaceTransform = (text) => text.replace(SPECIAL_SPACES, ' ');

/** WS-015: space → "·" (U+00B7), tab → "→" (U+2192). */
const visualize: WhitespaceTransform = (text) => text.replace(/ /g, '·').replace(/\t/g, '→');

/** WS-016: "·" (U+00B7) → space, "→" (U+2192) → tab. Not reversible if the text already contained these characters. */
const unvisualize: WhitespaceTransform = (text) => text.replace(/·/g, ' ').replace(/→/g, '\t');

/** WS-027: keeps the indent and collapses runs of 2+ spaces/tabs after it into one space. */
const collapseInline: WhitespaceTransform = mapLines((line) => {
  const indent = leadingSpaceTab(line);
  return indent + line.slice(indent.length).replace(/[ \t]{2,}/g, ' ');
});

// ---------------------------------------------------------------------------
// D. Wrapping
// ---------------------------------------------------------------------------

/** WS-011: joins the lines of each paragraph (separated by blank lines) with one space. */
const unwrapParagraphs: WhitespaceTransform = (text, { eol }) => lineWise(text, eol, (lines) => {
  const out: string[] = [];
  let paragraph: string[] = [];
  const flush = () => {
    if (paragraph.length > 0) {
      out.push(paragraph.join(' '));
      paragraph = [];
    }
  };
  for (const line of lines) {
    if (isBlankLine(line)) {
      flush();
      out.push(line);
    } else {
      paragraph.push(paragraph.length === 0 ? trimEndWs(line) : trimWs(line));
    }
  }
  flush();
  return out;
});

/** WS-012 / WS-013: greedy word wrap at `width` columns, keeping the indent of the line. */
const hardWrapLine = (line: string, width: number): string[] => {
  if (codePointWidth(line) <= width) {
    return [line];
  }
  const indent = leadingSpaceTab(line);
  const words = line.slice(indent.length).split(/[ \t]+/).filter((word) => word !== '');
  if (words.length === 0) {
    return [line];
  }
  const indentWidth = codePointWidth(indent);
  const out: string[] = [];
  let current = indent + words[0];
  let currentWidth = indentWidth + codePointWidth(words[0]);
  for (let i = 1; i < words.length; i++) {
    const w = codePointWidth(words[i]);
    if (currentWidth + 1 + w <= width) {
      current += ' ' + words[i];
      currentWidth += 1 + w;
    } else {
      out.push(current);
      current = indent + words[i];
      currentWidth = indentWidth + w;
    }
  }
  out.push(current);
  return out;
};

const hardWrap = (fixedWidth?: number): WhitespaceTransform => (text, options) => {
  const width = fixedWidth ?? options.n ?? 80;
  return lineWise(text, options.eol, (lines) => lines.flatMap((line) => hardWrapLine(line, width)));
};

// ---------------------------------------------------------------------------
// E. Alignment
// ---------------------------------------------------------------------------

const maxOf = (values: number[]): number => values.reduce((a, b) => Math.max(a, b), 0);

/** WS-017 / WS-018: trims each line and pads it on the left to center / right align it. */
const alignLines = (mode: 'center' | 'right'): WhitespaceTransform => (text, { eol }) =>
  lineWise(text, eol, (lines) => {
    const trimmed = lines.map(trimWs);
    const widths = trimmed.map(codePointWidth);
    const max = maxOf(widths);
    return trimmed.map((line, i) => {
      if (line === '') {
        return '';
      }
      const gap = max - widths[i];
      return spaces(mode === 'center' ? Math.floor(gap / 2) : gap) + line;
    });
  });

/** WS-019: pads the end of every line with spaces to the width of the longest line. */
const padToLongest: WhitespaceTransform = (text, { eol }) => lineWise(text, eol, (lines) => {
  const widths = lines.map(codePointWidth);
  const max = maxOf(widths);
  return lines.map((line, i) => line + spaces(max - widths[i]));
});

/**
 * Aligns the lines on which `split` finds a split point: the left part (trailing whitespace
 * removed) is padded to the widest left part, followed by one space and the right part.
 * Lines without a split point (or with only whitespace before it) are unchanged and do not
 * take part in the width.
 */
const alignBy = (split: (line: string) => [string, string] | undefined): WhitespaceTransform =>
  (text, { eol }) => lineWise(text, eol, (lines) => {
    const parts = lines.map((line) => {
      const found = split(line);
      if (!found) {
        return undefined;
      }
      const left = trimEndWs(found[0]);
      if (left === '') {
        // Nothing (or only indentation) before the split point: leave the line alone.
        return undefined;
      }
      return { left, width: codePointWidth(left), right: found[1] };
    });
    const max = maxOf(parts.map((part) => (part ? part.width : 0)));
    return lines.map((line, i) => {
      const part = parts[i];
      return part ? part.left + spaces(max - part.width) + ' ' + part.right : line;
    });
  });

/** Characters that can precede `=` inside a compound operator (`+=`, `!=`, `<=`, `??=`, `:=` ...). */
const OPERATOR_PREFIX_CHARS = '+-*/%!<>&|^?:';

/**
 * WS-020: aligns on the start of the operator that contains the first `=` of the line,
 * so compound operators (`+=`, `!=`, `<=`, `==`, `=>` ...) are never split.
 */
const alignEquals: WhitespaceTransform = alignBy((line) => {
  const index = line.indexOf('=');
  if (index < 0) {
    return undefined;
  }
  let start = index;
  while (start > 0 && OPERATOR_PREFIX_CHARS.includes(line[start - 1])) {
    start--;
  }
  return [line.slice(0, start), line.slice(start)];
});

/** Index of the first `:` that is not part of `::`, or -1. */
const findStandaloneColon = (line: string): number => {
  for (let i = 0; i < line.length; i++) {
    if (line[i] === ':' && line[i - 1] !== ':' && line[i + 1] !== ':') {
      return i;
    }
  }
  return -1;
};

/** WS-021: aligns the start of the value after the first standalone `:`. */
const alignColon: WhitespaceTransform = (text, { eol }) => lineWise(text, eol, (lines) => {
  const parts = lines.map((line) => {
    const index = findStandaloneColon(line);
    if (index < 0) {
      return undefined;
    }
    const left = trimEndWs(line.slice(0, index));
    if (left === '') {
      return undefined;
    }
    const key = left + ':';
    return { key, width: codePointWidth(key), value: trimStartWs(line.slice(index + 1)) };
  });
  const max = maxOf(parts.map((part) => (part ? part.width : 0)));
  return lines.map((line, i) => {
    const part = parts[i];
    if (!part) {
      return line;
    }
    return part.value === '' ? part.key : part.key + spaces(max - part.width) + ' ' + part.value;
  });
});

/**
 * WS-022: aligns comma separated columns. The width of column i is taken only from rows in
 * which column i is not the last one (the last cell of a row is never padded).
 */
const alignComma: WhitespaceTransform = (text, { eol }) => lineWise(text, eol, (lines) => {
  const rows = lines.map((line) => {
    if (!line.includes(',')) {
      return undefined;
    }
    return line.split(',').map((cell, i) => (i === 0 ? trimEndWs(cell) : trimWs(cell)));
  });
  const widths: number[] = [];
  rows.forEach((cells) => {
    if (!cells) {
      return;
    }
    for (let i = 0; i < cells.length - 1; i++) {
      widths[i] = Math.max(widths[i] ?? 0, codePointWidth(cells[i]));
    }
  });
  return lines.map((line, r) => {
    const cells = rows[r];
    if (!cells) {
      return line;
    }
    const last = cells.length - 1;
    return cells
      .map((cell, i) => (i === last ? cell : cell + ',' + spaces(widths[i] - codePointWidth(cell))))
      .join('');
  });
});

/** WS-023: aligns the first occurrence of a literal delimiter. */
const alignCustom: WhitespaceTransform = (text, options) => {
  const delimiter = options.delimiter ?? '';
  if (delimiter === '') {
    return text;
  }
  return alignBy((line) => {
    const index = line.indexOf(delimiter);
    return index < 0 ? undefined : [line.slice(0, index), line.slice(index)];
  })(text, options);
};

// ---------------------------------------------------------------------------
// F. Spaces around symbols
// ---------------------------------------------------------------------------

/** Multi-character punctuators, longest first, so that e.g. `<<=` is never read as `<` + `<=`. */
const PUNCTUATORS = [
  '>>>=', '...', '===', '!==', '**=', '<<=', '>>=', '>>>', '&&=', '||=', '??=',
  '==', '!=', '<=', '>=', '+=', '-=', '*=', '/=', '%=', '&=', '|=', '^=', '=>',
  '&&', '||', '??', '?.', '++', '--', '->', '::', '**', '<<', '>>',
];

/** Operators that WS-028 surrounds with spaces. */
const SPACED_OPERATORS = new Set([
  '===', '!==', '**=', '==', '!=', '<=', '>=', '+=', '-=', '*=', '/=', '%=', '=>',
  '&&', '||', '**', '=', '+', '-', '*', '/', '%',
]);

/** Operators that are unary when they do not follow a value (`-1`, `*args`, `**kwargs`). */
const MAYBE_UNARY = new Set(['+', '-', '*', '**']);

/** Keywords after which `+ - * **` are treated as unary even though the keyword is an identifier. */
const UNARY_KEYWORDS = new Set([
  'return', 'case', 'typeof', 'void', 'delete', 'throw', 'yield', 'await',
  'in', 'of', 'instanceof', 'new', 'else', 'do',
]);

/** Identifier / number character. Surrogate halves are treated as word characters (non-BMP letters). */
const isWordChar = (ch: string): boolean =>
  (ch >= '\ud800' && ch <= '\udfff') || /^[\p{L}\p{N}_$]$/u.test(ch);
const isDigit = (ch: string | undefined): boolean => ch !== undefined && ch >= '0' && ch <= '9';

/** Scanner state carried from one line to the next (within one selection). */
type TemplateFrame = 'template' | { depth: number };
interface ScanState {
  blockComment: boolean;
  templates: TemplateFrame[];
}

/**
 * Copies a (possibly nested) template literal starting at `i` until it is closed or the
 * line ends. Returns the index after the copied part. `state.templates` holds the stack.
 */
const scanTemplate = (line: string, i: number, state: ScanState, out: string[]): number => {
  const start = i;
  while (i < line.length && state.templates.length > 0) {
    const frame = state.templates[state.templates.length - 1];
    const ch = line[i];
    if (frame === 'template') {
      if (ch === '\\') {
        i += 2;
      } else if (ch === '`') {
        state.templates.pop();
        i++;
      } else if (ch === '$' && line[i + 1] === '{') {
        state.templates.push({ depth: 0 });
        i += 2;
      } else {
        i++;
      }
    } else if (ch === '`') {
      state.templates.push('template');
      i++;
    } else if (ch === '{') {
      frame.depth++;
      i++;
    } else if (ch === '}') {
      if (frame.depth === 0) {
        state.templates.pop();
      } else {
        frame.depth--;
      }
      i++;
    } else if (ch === '"' || ch === '\'') {
      i = skipString(line, i);
    } else {
      i++;
    }
  }
  i = Math.min(i, line.length);
  out.push(line.slice(start, i));
  return i;
};

/** Returns the index after the '…' / "…" string starting at `i` (or the line end if unclosed). */
const skipString = (line: string, i: number): number => {
  const quote = line[i];
  i++;
  while (i < line.length) {
    if (line[i] === '\\') {
      i += 2;
      continue;
    }
    if (line[i] === quote) {
      return i + 1;
    }
    i++;
  }
  return line.length;
};

/** Reads a word (identifier or number) starting at `i`; handles exponents such as `1e-5`. */
const readWord = (line: string, i: number): number => {
  const start = i;
  const numeric = isDigit(line[i]);
  const hex = numeric && line[i] === '0' && (line[i + 1] === 'x' || line[i + 1] === 'X');
  while (i < line.length) {
    const ch = line[i];
    if (isWordChar(ch) || (numeric && ch === '.')) {
      i++;
      continue;
    }
    if (numeric && !hex && (ch === '+' || ch === '-') && i > start
      && (line[i - 1] === 'e' || line[i - 1] === 'E') && isDigit(line[i + 1])) {
      i++;
      continue;
    }
    break;
  }
  return Math.max(i, start + 1);
};

const spaceAroundOperatorsLine = (line: string, state: ScanState): string => {
  const out: string[] = [];
  let i = 0;
  let pendingWs = '';
  let lineStart = true; // nothing significant has been written on this line yet
  let prevValue = false;
  let lastWord = '';
  const flush = () => {
    out.push(pendingWs);
    pendingWs = '';
  };

  if (state.blockComment) {
    const end = line.indexOf('*/');
    if (end < 0) {
      return line;
    }
    out.push(line.slice(0, end + 2));
    i = end + 2;
    state.blockComment = false;
    lineStart = false;
  } else if (state.templates.length > 0) {
    i = scanTemplate(line, 0, state, out);
    if (state.templates.length > 0) {
      return out.join('');
    }
    lineStart = false;
    prevValue = true;
  }

  while (i < line.length) {
    const ch = line[i];
    if (isSpaceOrTab(ch)) {
      pendingWs += ch;
      i++;
      continue;
    }
    if (ch === '/' && line[i + 1] === '/') {
      flush();
      out.push(line.slice(i));
      i = line.length;
      break;
    }
    if (ch === '/' && line[i + 1] === '*') {
      flush();
      const end = line.indexOf('*/', i + 2);
      if (end < 0) {
        out.push(line.slice(i));
        state.blockComment = true;
        i = line.length;
        break;
      }
      out.push(line.slice(i, end + 2));
      i = end + 2;
      lineStart = false;
      continue;
    }
    if (ch === '"' || ch === '\'') {
      flush();
      const end = skipString(line, i);
      out.push(line.slice(i, end));
      i = end;
      lineStart = false;
      prevValue = true;
      lastWord = '';
      continue;
    }
    if (ch === '`') {
      flush();
      state.templates.push('template');
      out.push('`');
      i = scanTemplate(line, i + 1, state, out);
      lineStart = false;
      prevValue = true;
      lastWord = '';
      continue;
    }
    if (isWordChar(ch)) {
      flush();
      const end = readWord(line, i);
      const word = line.slice(i, end);
      out.push(word);
      i = end;
      lineStart = false;
      prevValue = true;
      lastWord = word;
      continue;
    }
    if (ch === ')' || ch === ']' || ch === '}') {
      flush();
      out.push(ch);
      i++;
      lineStart = false;
      prevValue = true;
      lastWord = '';
      continue;
    }
    const punctuator = PUNCTUATORS.find((p) => line.startsWith(p, i)) ?? ch;
    const unary = MAYBE_UNARY.has(punctuator) && (!prevValue || UNARY_KEYWORDS.has(lastWord));
    if (SPACED_OPERATORS.has(punctuator) && !unary) {
      if (lineStart) {
        flush();
      } else {
        pendingWs = '';
        out.push(' ');
      }
      out.push(punctuator);
      i += punctuator.length;
      const wsStart = i;
      while (i < line.length && isSpaceOrTab(line[i])) {
        i++;
      }
      if (i >= line.length) {
        out.push(line.slice(wsStart));
      } else {
        pendingWs = ' ';
      }
      lineStart = false;
      prevValue = false;
      lastWord = '';
      continue;
    }
    flush();
    out.push(punctuator);
    i += punctuator.length;
    lineStart = false;
    if (punctuator !== '++' && punctuator !== '--') {
      prevValue = false;
    }
    lastWord = '';
  }
  flush();
  return out.join('');
};

/**
 * WS-028: puts exactly one space around the operators in SPACED_OPERATORS. String literals,
 * template literals (also across lines), line comments and block comments (also across
 * lines) are left untouched. Unary `+ - * **` are left as they are.
 */
const spaceAroundOperators: WhitespaceTransform = (text, { eol }) => lineWise(text, eol, (lines) => {
  const state: ScanState = { blockComment: false, templates: [] };
  return lines.map((line) => spaceAroundOperatorsLine(line, state));
});

const PUNCTUATION_BEFORE = new Set([',', '.', '!', '?', ';', ':']);

/** WS-029: removes the spaces/tabs right before `, . ! ? ; :` (indentation is kept). */
const removeSpaceBeforePunctuation: WhitespaceTransform = (text) =>
  text.replace(/[ \t]+/g, (match: string, offset: number, whole: string) => {
    if (offset === 0) {
      return match;
    }
    const before = whole[offset - 1];
    if (before === '\n' || before === '\r') {
      return match;
    }
    return PUNCTUATION_BEFORE.has(whole[offset + match.length]) ? '' : match;
  });

/** WS-030: inserts a space after a comma that is directly followed by a non-whitespace character. */
const spaceAfterComma: WhitespaceTransform = (text) => text.replace(/,(?=\S)/g, ', ');

// ---------------------------------------------------------------------------
// Command table
// ---------------------------------------------------------------------------

export const whitespaceTransforms: Record<WhitespaceCommand, WhitespaceTransform> = {
  'tabs-to-spaces-2': leadingTabsToSpaces(2),
  'tabs-to-spaces-4': leadingTabsToSpaces(4),
  'spaces-to-tabs-2': leadingSpacesToTabs(2),
  'spaces-to-tabs-4': leadingSpacesToTabs(4),
  'reindent-2-to-4': reindent(2, 4),
  'reindent-4-to-2': reindent(4, 2),
  'dedent': dedent,
  'trim-leading': trimLeading,
  'collapse-blank-lines': collapseBlankLines,
  'remove-all': removeAll,
  'unwrap-paragraphs': unwrapParagraphs,
  'hard-wrap-80': hardWrap(80),
  'hard-wrap-n': hardWrap(),
  'nbsp-to-space': nbspToSpace,
  'visualize': visualize,
  'unvisualize': unvisualize,
  'center-align': alignLines('center'),
  'right-align': alignLines('right'),
  'pad-to-longest': padToLongest,
  'align-equals': alignEquals,
  'align-colon': alignColon,
  'align-comma': alignComma,
  'align-custom': alignCustom,
  'blank-line-between': blankLineBetween,
  'remove-trailing-blank-lines': removeTrailingBlankLines,
  'remove-leading-blank-lines': removeLeadingBlankLines,
  'collapse-inline': collapseInline,
  'space-around-operators': spaceAroundOperators,
  'remove-space-before-punctuation': removeSpaceBeforePunctuation,
  'space-after-comma': spaceAfterComma,
  'indent-n': indentN,
  'outdent-n': outdentN,
  'expand-tabs': expandTabs,
  'unexpand-tabs': unexpandTabs,
  'clear-blank-only-lines': clearBlankOnlyLines,
};

/** Every command, in ROADMAP order (WS-001..WS-035). */
export const WHITESPACE_COMMANDS: WhitespaceCommand[] = [
  'tabs-to-spaces-2', 'tabs-to-spaces-4', 'spaces-to-tabs-2', 'spaces-to-tabs-4',
  'reindent-2-to-4', 'reindent-4-to-2', 'dedent', 'trim-leading', 'collapse-blank-lines',
  'remove-all', 'unwrap-paragraphs', 'hard-wrap-80', 'hard-wrap-n', 'nbsp-to-space',
  'visualize', 'unvisualize', 'center-align', 'right-align', 'pad-to-longest',
  'align-equals', 'align-colon', 'align-comma', 'align-custom', 'blank-line-between',
  'remove-trailing-blank-lines', 'remove-leading-blank-lines', 'collapse-inline',
  'space-around-operators', 'remove-space-before-punctuation', 'space-after-comma',
  'indent-n', 'outdent-n', 'expand-tabs', 'unexpand-tabs', 'clear-blank-only-lines',
];

export const WHITESPACE_INPUT_COMMANDS: WhitespaceInputCommand[] = ['hard-wrap-n', 'align-custom', 'indent-n', 'outdent-n'];
