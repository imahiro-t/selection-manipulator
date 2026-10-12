/**
 * Pure (vscode-independent) generators of the DATEX-016..020 commands (group DATE2): brace
 * expansion, multiplication table, Fibonacci numbers, prime numbers and time sequences.
 *
 * Security rules (SECURITY.md): every count and size is estimated BEFORE anything is generated and
 * a value over a limit throws `GenLimitError` (a warning, nothing is changed); the results are then
 * counted against the output budget while they are built. The brace expansion is a hand-written
 * parser: the braces of a line are matched in two linear passes into typed-array tables sized by
 * the number of braces, commas and escapes (not by the length of the line), then one recursive
 * pass (bounded by the nesting limit) goes from brace to brace, builds the pieces and, at the same
 * time, counts the strings and measures their total length (no second walk to estimate the
 * size). The tables are scratch arrays reused from line to line. A range is plain data (no
 * closure, read by hand): its terms are only made when the line is expanded, except the only term
 * of a one-term range, which is folded into the text around it while parsing. Parsing stops as
 * soon as the count of the line passes the limit; no shell is run and no regular expression is
 * built from the text. The expansion builds no intermediate product: only the pieces with two
 * strings or more are left between literal texts, and their combinations are emitted one by one
 * (a mixed-radix counter) and joined once per line, so that the time and memory follow the length
 * of the result. Only `BigInt` and typed arrays are used.
 */
import { pad2 } from './dateCommon';
import { forEachLine, formatCount, GenInputError, GenLimitError, GenOutputBuffer, quoteText } from './genCommon';

// ---------------------------------------------------------------------------------------------
// Lines
// ---------------------------------------------------------------------------------------------

/** Prefixes the message of an input error with `line N: ` (a limit stays a limit). */
const atLine = (lineNumber: number, error: unknown): unknown => {
  if (error instanceof GenLimitError) {
    return new GenLimitError(`line ${lineNumber}: ${error.message}`);
  }
  if (error instanceof GenInputError) {
    return new GenInputError(`line ${lineNumber}: ${error.message}`);
  }
  return error;
};

// ---------------------------------------------------------------------------------------------
// DATEX-016 Brace Expansion
// ---------------------------------------------------------------------------------------------

/** DATEX-016: the deepest nesting of braces. */
export const BRACE_MAX_DEPTH = 10;
/** DATEX-016: the most strings one line expands to. */
export const BRACE_MAX_PER_LINE = 10_000;
/** DATEX-016: the most strings one selection expands to (all its lines). */
export const BRACE_MAX_PER_SELECTION = 100_000;
/** DATEX-016: the most terms of one range (`{1..10000}`). */
export const BRACE_MAX_RANGE_TERMS = 10_000;

/**
 * A range (`{1..3}`, `{01..10..3}`, `{a..e}`) as plain data: the term `i` is
 * `from + direction × i × step`, a character code for a letter range, a number zero-padded to
 * `width` otherwise (see `rangeTerm`). Nothing is built for it before the line has been counted.
 */
interface RangeNode {
  kind: 'range';
  count: number;
  letter: boolean;
  from: number;
  step: number;
  direction: number;
  width: number;
}

/**
 * A piece of a parsed line: literal text, alternatives (`{a,b}`) or a range of two terms or more.
 * A parsed line is already folded: the texts next to each other are one text, and a range of one
 * term is part of the text. Exported (as a type) for the tests only.
 */
export type BraceNode =
  | { kind: 'text'; text: string }
  | { kind: 'alternatives'; options: BraceNode[][] }
  | RangeNode;

/** The number of terms from `from` to `to` by `step` (> 0), refused over BRACE_MAX_RANGE_TERMS. */
const rangeTermCount = (from: number, to: number, step: number): number => {
  const terms = Math.floor(Math.abs(to - from) / step) + 1;
  if (terms > BRACE_MAX_RANGE_TERMS) {
    throw new GenLimitError(`a range has more than ${formatCount(BRACE_MAX_RANGE_TERMS)} terms`);
  }
  return terms;
};

const BACKSLASH = 0x5c;
const OPEN = 0x7b;
const CLOSE = 0x7d;
const COMMA = 0x2c;
const PLUS = 0x2b;
const MINUS = 0x2d;
const DOT = 0x2e;
const ZERO = 0x30;
const NINE = 0x39;

/** The most digits of an end or a step of a range. */
const RANGE_MAX_DIGITS = 15;

/** What `readInteger` read (one shared object: the parser reads one integer at a time). */
const integer = { value: 0, length: 0, padded: false };

/**
 * Reads `[-+]?\d{1,15}` at `line[i]` (followed by `..` or the end `to`, checked by the caller):
 * its value (`Number` of the text, `-0` included), its length without a `+` and whether it is
 * zero-padded (`[-+]?0\d`). Returns the offset after it, or -1 when there is no such integer.
 */
const readInteger = (line: string, i: number, to: number): number => {
  let p = i;
  const sign = p < to ? line.charCodeAt(p) : 0;
  const negative = sign === MINUS;
  if (negative || sign === PLUS) {
    p++;
  }
  const digitsStart = p;
  let value = 0;
  while (p < to) {
    const code = line.charCodeAt(p);
    if (code < ZERO || code > NINE) {
      break;
    }
    if (p - digitsStart === RANGE_MAX_DIGITS) {
      return -1;
    }
    value = value * 10 + (code - ZERO);
    p++;
  }
  const digits = p - digitsStart;
  if (digits === 0) {
    return -1;
  }
  integer.value = negative ? -value : value;
  integer.length = (negative ? 1 : 0) + digits;
  integer.padded = digits >= 2 && line.charCodeAt(digitsStart) === ZERO;
  return p;
};

/** Whether `line[i, i + 2)` (before `to`) is `..`. */
const isDots = (line: string, i: number, to: number): boolean =>
  i + 1 < to && line.charCodeAt(i) === DOT && line.charCodeAt(i + 1) === DOT;

const isLetter = (code: number): boolean => (code >= 0x41 && code <= 0x5a) || (code >= 0x61 && code <= 0x7a);

/**
 * The step of a range after its second end at `i` (`..[-+]?\d{1,15}` up to `to`, or nothing): a
 * step of 0 counts as 1 (as in bash) and its sign is ignored (the direction comes from the ends).
 * Returns -1 when the rest is not a step.
 */
const readStep = (line: string, i: number, to: number): number => {
  if (i === to) {
    return 1;
  }
  if (!isDots(line, i, to) || readInteger(line, i + 2, to) !== to) {
    return -1;
  }
  const step = Math.abs(integer.value);
  return step === 0 ? 1 : step;
};

/** What `parseRange` read (one shared object: a node is made of it only for a range of two terms or more). */
const scannedRange: RangeNode = { kind: 'range', count: 0, letter: false, from: 0, step: 1, direction: 1, width: 0 };

/**
 * Reads the content `line[from, to)` of a pair of braces as a range into `scannedRange` (no term
 * is made here) and returns whether it is one. It reads exactly what these expressions match:
 * `^([-+]?\d{1,15})\.\.([-+]?\d{1,15})(?:\.\.([-+]?\d{1,15}))?$` (`{1..3}`, `{01..10}` zero-padded
 * to the longer end, `{10..1..3}`) and `^([A-Za-z])\.\.([A-Za-z])(?:\.\.([-+]?\d{1,15}))?$`
 * (`{a..e}`), by hand and without cutting the content out of the line.
 */
const parseRange = (line: string, from: number, to: number): boolean => {
  const first = readInteger(line, from, to);
  if (first >= 0) {
    const start = integer.value;
    const startLength = integer.length;
    const startPadded = integer.padded;
    if (!isDots(line, first, to)) {
      return false;
    }
    const second = readInteger(line, first + 2, to);
    if (second < 0) {
      return false;
    }
    const end = integer.value;
    const endLength = integer.length;
    const endPadded = integer.padded;
    const step = readStep(line, second, to);
    if (step < 0) {
      return false;
    }
    scannedRange.count = rangeTermCount(start, end, step);
    scannedRange.letter = false;
    scannedRange.from = start;
    scannedRange.step = step;
    scannedRange.direction = end >= start ? 1 : -1;
    scannedRange.width = startPadded || endPadded ? Math.max(startLength, endLength) : 0;
    return true;
  }
  if (to - from >= 4 && isLetter(line.charCodeAt(from)) && isDots(line, from + 1, to) && isLetter(line.charCodeAt(from + 3))) {
    const start = line.charCodeAt(from);
    const end = line.charCodeAt(from + 3);
    const step = readStep(line, from + 4, to);
    if (step < 0) {
      return false;
    }
    scannedRange.count = rangeTermCount(start, end, step);
    scannedRange.letter = true;
    scannedRange.from = start;
    scannedRange.step = step;
    scannedRange.direction = end >= start ? 1 : -1;
    scannedRange.width = 0;
    return true;
  }
  return false;
};

/** The term `i` of a range. */
const rangeTerm = (range: RangeNode, i: number): string => {
  const n = range.from + range.direction * i * range.step;
  if (range.letter) {
    return String.fromCharCode(n);
  }
  if (range.width === 0) {
    // Not zero-padded.
    return String(n);
  }
  const sign = n < 0 ? '-' : '';
  return `${sign}${String(Math.abs(n)).padStart(range.width - sign.length, '0')}`;
};

/** The number of decimal digits of a non-negative integer (at most 16 here: the ends have 15 digits or less). */
const digitCount = (n: number): number => {
  let digits = 1;
  for (let power = 10; n >= power; power *= 10) {
    digits++;
  }
  return digits;
};

/**
 * The total length of the terms of a range, computed without making them (the length of a term
 * is the sign, then the digits padded to `width`). Called only once the count of the range has
 * passed the limit of the line, so that it is at most BRACE_MAX_RANGE_TERMS steps.
 */
const rangeLength = (range: RangeNode): number => {
  if (range.letter) {
    return range.count;
  }
  let length = 0;
  for (let i = 0; i < range.count; i++) {
    const n = range.from + range.direction * i * range.step;
    const signed = (n < 0 ? 1 : 0) + digitCount(Math.abs(n));
    length += signed > range.width ? signed : range.width;
  }
  return length;
};

/**
 * The braces of a line matched in two linear passes (the first one counts the braces, the commas
 * and the escapes, the second one fills the tables). The tables are sized by those counts, not
 * by the length of the line. The opening braces (not escaped) are numbered in the order of the
 * line; the parser meets them, and the escapes, in that order, so that it goes from one to the
 * next without looking at the characters in between.
 *
 * The tables are scratch arrays shared by every line (a selection of many short lines would
 * otherwise allocate a few typed arrays per line): only their first `braces`, commas and `escapes`
 * entries belong to the line, and they are valid until the next call of `matchBraces`. They grow
 * to what a line needs (at least twice what they were) and `releaseBraceTables` drops large ones
 * after a selection, so that one long line does not keep its tables for the next selections.
 */
export interface BraceTable {
  /** Brace number → offset of the opening brace (increasing). */
  readonly openAt: Int32Array;
  /** Brace number → offset of its closing brace, -1 for a brace that is never closed. */
  readonly closeAt: Int32Array;
  /** Brace number → the index (in `commaAt`) of its first comma, -1 for none. */
  readonly firstComma: Int32Array;
  /** Comma index → offset of the comma. */
  readonly commaAt: Int32Array;
  /** Comma index → index of the next comma of the same brace, -1 for the last one. */
  readonly nextComma: Int32Array;
  /** Offsets of the backslashes that escape the next character (`\{`, `\}`, `\,`, `\\`), increasing. */
  readonly escapeAt: Int32Array;
  /** The number of opening braces of the line (the entries of `openAt`, `closeAt` and `firstComma`). */
  readonly braces: number;
  /** The number of escapes of the line (the entries of `escapeAt`). */
  readonly escapes: number;
  /** The number of braces that are closed (0: the line is literal text, if it has no escape either). */
  readonly closed: number;
}

/** The size the scratch tables start with and keep between selections (larger ones are dropped). */
const TABLE_SCRATCH = 256;

// The scratch tables (see `BraceTable`), by what sizes them: the braces, the commas, the escapes
// and the deepest nesting (the open braces and the last comma found directly inside each of them).
let braceTables = { openAt: new Int32Array(TABLE_SCRATCH), closeAt: new Int32Array(TABLE_SCRATCH), firstComma: new Int32Array(TABLE_SCRATCH) };
let commaTables = { commaAt: new Int32Array(TABLE_SCRATCH), nextComma: new Int32Array(TABLE_SCRATCH) };
let escapeTable = new Int32Array(TABLE_SCRATCH);
let depthTables = { stack: new Int32Array(TABLE_SCRATCH), lastComma: new Int32Array(TABLE_SCRATCH) };

/** The new size of a scratch table of `size` entries that must hold `needed` (at least twice the size). */
const grownSize = (size: number, needed: number): number => Math.max(needed, size * 2);

/** Drops the scratch tables grown past TABLE_SCRATCH entries (called after every selection). */
const releaseBraceTables = (): void => {
  if (braceTables.openAt.length > TABLE_SCRATCH) {
    braceTables = { openAt: new Int32Array(TABLE_SCRATCH), closeAt: new Int32Array(TABLE_SCRATCH), firstComma: new Int32Array(TABLE_SCRATCH) };
  }
  if (commaTables.commaAt.length > TABLE_SCRATCH) {
    commaTables = { commaAt: new Int32Array(TABLE_SCRATCH), nextComma: new Int32Array(TABLE_SCRATCH) };
  }
  if (escapeTable.length > TABLE_SCRATCH) {
    escapeTable = new Int32Array(TABLE_SCRATCH);
  }
  if (depthTables.stack.length > TABLE_SCRATCH) {
    depthTables = { stack: new Int32Array(TABLE_SCRATCH), lastComma: new Int32Array(TABLE_SCRATCH) };
  }
};

/** Whether the character at `i` can be escaped with a backslash (`{`, `}`, `,`, `\`). */
const escapable = (line: string, i: number): boolean => {
  const code = line.charCodeAt(i);
  return code === OPEN || code === CLOSE || code === COMMA || code === BACKSLASH;
};

/** Exported for the tests only (with `parseSequence`, to hand a parsed line to `emitSequence`). */
export const matchBraces = (line: string): BraceTable => {
  const length = line.length;
  // First pass: the number of opening braces, of the commas inside an open brace and of the escapes.
  let braces = 0;
  let commas = 0;
  let escapes = 0;
  let closed = 0;
  let open = 0;
  let deepest = 0;
  for (let i = 0; i < length; i++) {
    const code = line.charCodeAt(i);
    if (code === BACKSLASH) {
      if (i + 1 < length && escapable(line, i + 1)) {
        escapes++;
        i++;
      }
    } else if (code === OPEN) {
      braces++;
      open++;
      if (open > deepest) {
        deepest = open;
      }
    } else if (code === CLOSE) {
      if (open > 0) {
        open--;
        closed++;
      }
    } else if (code === COMMA && open > 0) {
      commas++;
    }
  }
  if (braces > braceTables.openAt.length) {
    const size = grownSize(braceTables.openAt.length, braces);
    braceTables = { openAt: new Int32Array(size), closeAt: new Int32Array(size), firstComma: new Int32Array(size) };
  }
  if (commas > commaTables.commaAt.length) {
    const size = grownSize(commaTables.commaAt.length, commas);
    commaTables = { commaAt: new Int32Array(size), nextComma: new Int32Array(size) };
  }
  if (escapes > escapeTable.length) {
    escapeTable = new Int32Array(grownSize(escapeTable.length, escapes));
  }
  if (deepest > depthTables.stack.length) {
    const size = grownSize(depthTables.stack.length, deepest);
    depthTables = { stack: new Int32Array(size), lastComma: new Int32Array(size) };
  }
  const { openAt, closeAt, firstComma } = braceTables;
  const { commaAt, nextComma } = commaTables;
  const escapeAt = escapeTable;
  const { stack, lastComma } = depthTables;
  // Second pass: the same walk, filling the tables (every entry of the line is written: the
  // scratch tables still hold those of the lines before).
  let top = 0;
  let brace = 0;
  let comma = 0;
  let escape = 0;
  for (let i = 0; i < length; i++) {
    const code = line.charCodeAt(i);
    if (code === BACKSLASH) {
      if (i + 1 < length && escapable(line, i + 1)) {
        escapeAt[escape++] = i;
        i++;
      }
    } else if (code === OPEN) {
      openAt[brace] = i;
      closeAt[brace] = -1;
      firstComma[brace] = -1;
      lastComma[top] = -1;
      stack[top++] = brace++;
    } else if (code === CLOSE) {
      if (top > 0) {
        closeAt[stack[--top]] = i;
      }
    } else if (code === COMMA && top > 0) {
      commaAt[comma] = i;
      nextComma[comma] = -1;
      if (lastComma[top - 1] < 0) {
        firstComma[stack[top - 1]] = comma;
      } else {
        nextComma[lastComma[top - 1]] = comma;
      }
      lastComma[top - 1] = comma;
      comma++;
    }
  }
  // A brace that is never closed is literal text; so are the commas recorded for it.
  return { openAt, closeAt, firstComma, commaAt, nextComma, escapeAt, braces, escapes, closed };
};

/** The number of commas directly inside the brace `brace`. */
const commaCountOf = (table: BraceTable, brace: number): number => {
  let commas = 0;
  for (let comma = table.firstComma[brace]; comma >= 0; comma = table.nextComma[comma]) {
    commas++;
  }
  return commas;
};

/** The index of the first of the first `count` values of the increasing `values` that is `offset` or more. */
const firstAtOrAfter = (values: Int32Array, count: number, offset: number): number => {
  let low = 0;
  let high = count;
  while (low < high) {
    const middle = (low + high) >> 1;
    if (values[middle] < offset) {
      low = middle + 1;
    } else {
      high = middle;
    }
  }
  return low;
};

/** Refuses a number of strings over BRACE_MAX_PER_LINE; returns it otherwise. */
const checkLineCount = (count: number): number => {
  if (count > BRACE_MAX_PER_LINE) {
    throw new GenLimitError(`the line expands to more than ${formatCount(BRACE_MAX_PER_LINE)} strings`);
  }
  return count;
};

/** Counts and lengths are computed saturated at this value (far above every limit). */
const SATURATED = 1e15;
const cap = (n: number): number => (n > SATURATED ? SATURATED : n);

/** Pieces of a line, the number of strings they expand to (at most BRACE_MAX_PER_LINE) and the total length of those strings. */
export interface ParsedSequence {
  nodes: BraceNode[];
  count: number;
  length: number;
}

// The buffers of the parser, shared by the whole parse of one line (and emptied after it), so
// that a sequence allocates little more than what it keeps: the literal texts not yet joined into
// one text piece (the first `pendingCount` of `pendingTexts`, `pendingLength` characters in all),
// the pieces of the sequences being parsed (each one cut out at its end as an array of its own
// size), and the count and the length of the sequence parsed last.
const pendingTexts: string[] = [];
let pendingCount = 0;
let pendingLength = 0;
const pendingNodes: BraceNode[] = [];
let parsedCount = 0;
let parsedLength = 0;
// The number of the next brace and the index of the next escape the parser has not met yet.
let nextBrace = 0;
let nextEscape = 0;

/**
 * Pending texts shorter than this are joined with `+`, the cheapest for the short lines: V8 copies
 * such a short concatenation into a flat string of its own (a longer one is a tree of the pieces,
 * and a longer piece may be a slice that keeps the whole line alive).
 */
const FLAT_CONCAT = 13;
/** Pending texts up to this length are joined through their character codes (nothing but the text is made). */
const SHORT_TEXT = 256;
const textCodes: number[] = [];

/** Adds a literal text to the pending texts. */
const pushPending = (text: string): void => {
  pendingTexts[pendingCount++] = text;
  pendingLength += text.length;
};

/** Adds the literal text `line[start, end)` (if any) to the pending texts; returns its length. */
const pushText = (line: string, start: number, end: number): number => {
  if (end <= start) {
    return 0;
  }
  pushPending(line.slice(start, end));
  return end - start;
};

/** Cuts the pieces from `mark` on out of `pendingNodes` (as an array of their own). */
const cutNodes = (mark: number): BraceNode[] => {
  const nodes = pendingNodes.slice(mark);
  pendingNodes.length = mark;
  return nodes;
};

/** Joins the pending literal texts into one text piece (none when they are empty). */
const flushTexts = (): void => {
  if (pendingCount === 0) {
    return;
  }
  let text: string;
  if (pendingCount === 1) {
    text = pendingTexts[0];
  } else if (pendingLength < FLAT_CONCAT) {
    text = pendingTexts[0];
    for (let k = 1; k < pendingCount; k++) {
      text += pendingTexts[k];
    }
  } else if (pendingLength <= SHORT_TEXT) {
    textCodes.length = pendingLength;
    let n = 0;
    for (let k = 0; k < pendingCount; k++) {
      const piece = pendingTexts[k];
      for (let c = 0; c < piece.length; c++) {
        textCodes[n++] = piece.charCodeAt(c);
      }
    }
    text = String.fromCharCode.apply(null, textCodes);
  } else {
    pendingTexts.length = pendingCount;
    text = pendingTexts.join('');
  }
  pendingCount = 0;
  pendingLength = 0;
  if (text !== '') {
    pendingNodes.push({ kind: 'text', text });
  }
};

/**
 * Parses `line[from, to)`, adding its pieces to `pendingNodes` and `pendingTexts`, and sets
 * `parsedCount` and `parsedLength` to the number of strings it expands to and their total length.
 * A matched pair of braces with top-level commas is a list of alternatives, one with a range
 * inside is a range, anything else (`{a}`, `{}`, an unmatched brace) is literal text whose inside
 * is still parsed (into the same pieces, so that its texts join those around it). `depth` is the
 * nesting of the braces around. Only the opening braces and the escapes are visited (from the
 * table, in the order of the line); the text between them is cut out of the line at once.
 *
 * The strings are counted while parsing: a sequence multiplies the counts of its pieces and
 * alternatives add those of their options. Every count is 1 or more, so the count of any part is
 * not more than that of the whole line: parsing stops with GenLimitError as soon as one passes
 * BRACE_MAX_PER_LINE, and alternatives with more options than that are refused before any of them
 * is parsed. The work done before a refusal is therefore bounded by the limit, not by the input.
 * The length is measured with the count: a piece of `c` strings of total length `l` after pieces
 * of `count` strings of total length `length` makes `length × c + l × count` (every string of a
 * piece is combined with every string of the others).
 */
const parseInto = (line: string, table: BraceTable, from: number, to: number, depth: number): void => {
  const { openAt, escapeAt, braces, escapes } = table;
  let count = 1;
  let length = 0;
  // The literal text not yet added to `pendingTexts` starts at `start`.
  let start = from;
  for (;;) {
    const brace = nextBrace;
    const escape = nextEscape;
    const braceAt = brace < braces ? openAt[brace] : to;
    const escapeOffset = escape < escapes ? escapeAt[escape] : to;
    if (escapeOffset < braceAt && escapeOffset < to) {
      // The backslash is dropped; the escaped character starts the next literal text.
      nextEscape++;
      length = cap(length + cap(pushText(line, start, escapeOffset) * count));
      start = escapeOffset + 1;
      continue;
    }
    if (braceAt >= to) {
      break;
    }
    const i = braceAt;
    nextBrace++;
    const end = table.closeAt[brace];
    if (end < 0 || end >= to) {
      // A brace that is not closed (here) is literal text.
      continue;
    }
    if (depth + 1 > BRACE_MAX_DEPTH) {
      throw new GenLimitError(`the braces are nested more than ${BRACE_MAX_DEPTH} deep`);
    }
    if (table.firstComma[brace] >= 0) {
      const commas = commaCountOf(table, brace);
      length = cap(length + cap(pushText(line, start, i) * count));
      flushTexts();
      // Every option expands to one string or more.
      checkLineCount(commas + 1);
      const options: BraceNode[][] = [];
      let optionsCount = 0;
      let optionsLength = 0;
      let optionStart = i;
      let comma = table.firstComma[brace];
      for (let k = 0; k <= commas; k++) {
        const stop = k < commas ? table.commaAt[comma] : end;
        const mark = pendingNodes.length;
        parseInto(line, table, optionStart + 1, stop, depth + 1);
        flushTexts();
        options.push(cutNodes(mark));
        optionsCount = checkLineCount(optionsCount + parsedCount);
        optionsLength = cap(optionsLength + parsedLength);
        optionStart = stop;
        if (k < commas) {
          comma = table.nextComma[comma];
        }
      }
      pendingNodes.push({ kind: 'alternatives', options });
      const total = checkLineCount(count * optionsCount);
      length = cap(cap(length * optionsCount) + cap(optionsLength * count));
      count = total;
      start = end + 1;
      continue;
    }
    // A range has no brace and no backslash inside: none of them is skipped below.
    if (parseRange(line, i + 1, end)) {
      const range = scannedRange;
      length = cap(length + cap(pushText(line, start, i) * count));
      const total = checkLineCount(count * range.count);
      if (range.count === 1) {
        // A range of one term is one more literal text (its term is made here, once).
        const term = rangeTerm(range, 0);
        pushPending(term);
        length = cap(length + cap(term.length * count));
      } else {
        flushTexts();
        pendingNodes.push({ ...range });
        length = cap(cap(length * range.count) + cap(rangeLength(range) * count));
        count = total;
      }
      start = end + 1;
      continue;
    }
    // `{a}`: the braces stay (the `{` ends the text before, the `}` starts the text after); what
    // is inside them is still expanded, into the same pieces.
    length = cap(length + cap(pushText(line, start, i + 1) * count));
    parseInto(line, table, i + 1, end, depth + 1);
    const total = checkLineCount(count * parsedCount);
    length = cap(cap(length * parsedCount) + cap(parsedLength * count));
    count = total;
    start = end;
  }
  length = cap(length + cap(pushText(line, start, to) * count));
  parsedCount = count;
  parsedLength = length;
};

/**
 * Parses `line[from, to)` into pieces (see `parseInto`), counted and measured. Exported for the
 * tests only.
 */
export const parseSequence = (line: string, table: BraceTable, from: number, to: number, depth: number): ParsedSequence => {
  nextBrace = firstAtOrAfter(table.openAt, table.braces, from);
  nextEscape = firstAtOrAfter(table.escapeAt, table.escapes, from);
  // The buffers are empty here: they are emptied after every line (also when it is refused).
  try {
    parseInto(line, table, from, to, depth);
    flushTexts();
    return { nodes: cutNodes(0), count: parsedCount, length: parsedLength };
  } finally {
    // Nothing of a line is kept in the buffers after it.
    if (pendingTexts.length !== 0) {
      pendingTexts.length = 0;
    }
    pendingCount = 0;
    pendingLength = 0;
    if (pendingNodes.length !== 0) {
      pendingNodes.length = 0;
    }
  }
};

/** The strings of one piece (at most BRACE_MAX_PER_LINE of them, no longer in all than the line). */
const piecesOf = (node: BraceNode): string[] => {
  switch (node.kind) {
    case 'text':
      return [node.text];
    case 'range':
      return Array.from({ length: node.count }, (_, i) => rangeTerm(node, i));
    default: {
      const pieces: string[] = [];
      for (const option of node.options) {
        emitSequence(option, (piece) => pieces.push(piece));
      }
      return pieces;
    }
  }
};

/**
 * Emits the strings a parsed line (or part of one) expands to, one by one in the order of the
 * expansion, without building the intermediate products. The pieces of one string are already
 * folded into the text around them by the parser, so that only the pieces with two strings or
 * more are left between literal texts (at most log2(BRACE_MAX_PER_LINE) of them). The strings of
 * each piece are made once, and a mixed-radix counter (one digit per piece, the last piece moving
 * fastest) walks their combinations. Only the prefixes of the current combination are kept
 * (`prefixes[j]` is its first `j` strings concatenated) and only those after the digit that moved
 * are made again, so that the strings share their prefixes (nothing is copied until the result is
 * joined). No piece at all (an empty option) emits one empty string. Only the nesting of the
 * alternatives recurses (bounded by BRACE_MAX_DEPTH). Exported for the tests only (they check that
 * the strings come out one by one); it is not part of the command.
 */
export const emitSequence = (nodes: readonly BraceNode[], emit: (expanded: string) => void): void => {
  const pieces = nodes.map(piecesOf);
  const n = pieces.length;
  const digits = pieces.map(() => 0);
  const prefixes = [''];
  for (let j = 0; j < n; j++) {
    prefixes.push(prefixes[j] + pieces[j][0]);
  }
  for (;;) {
    emit(prefixes[n]);
    // Advances the counter: the last digit first, carrying into the one before it on a wrap.
    let k = n - 1;
    for (; k >= 0; k--) {
      digits[k]++;
      if (digits[k] < pieces[k].length) {
        break;
      }
      digits[k] = 0;
    }
    // Every digit wrapped (or there is none): every string has been emitted.
    if (k < 0) {
      return;
    }
    for (let j = k; j < n; j++) {
      prefixes[j + 1] = prefixes[j] + pieces[j][digits[j]];
    }
  }
};

/**
 * DATEX-016: expands the braces of every line of the selection (`file{1..3}.txt` → 3 lines). The
 * strings of one line are joined with `eol`; the line breaks of the selection are kept. Every
 * line is parsed, counted and measured before anything is expanded: more than BRACE_MAX_PER_LINE
 * strings for one line, BRACE_MAX_PER_SELECTION for the selection, or a longer result than the
 * budget stops everything. The strings of each line are then emitted one by one (`emitSequence`)
 * and joined once, without building the intermediate products of the expansion.
 */
export const braceExpansion = (text: string, eol: string, budget: number): string => {
  const parsed: { nodes: BraceNode[] | undefined; line: string; lineBreak: string; lineNumber: number }[] = [];
  let total = 0;
  let length = 0;
  try {
    forEachLine(text, (line, lineBreak, lineNumber) => {
      try {
        const table = line.includes('{') ? matchBraces(line) : undefined;
        if (table === undefined || (table.closed === 0 && table.escapes === 0)) {
          // No brace, or none closed and no escape: the line is kept as it is.
          parsed.push({ nodes: undefined, line, lineBreak, lineNumber });
          total += 1;
          length += line.length + lineBreak.length;
          return;
        }
        // Refused while it is parsed as soon as the count passes BRACE_MAX_PER_LINE; measured at the same time.
        const size = parseSequence(line, table, 0, line.length, 0);
        parsed.push({ nodes: size.nodes, line, lineBreak, lineNumber });
        total += size.count;
        length = cap(length + size.length + (size.count - 1) * eol.length + lineBreak.length);
      } catch (error) {
        throw atLine(lineNumber, error);
      }
      if (total > BRACE_MAX_PER_SELECTION) {
        throw new GenLimitError(`the selection expands to more than ${formatCount(BRACE_MAX_PER_SELECTION)} strings`);
      }
    });
  } finally {
    releaseBraceTables();
  }
  const output = new GenOutputBuffer(budget);
  // The whole result is checked against the budget before it is built.
  output.reserve(length);
  for (const { nodes, line, lineBreak } of parsed) {
    if (nodes === undefined) {
      output.push(line);
    } else {
      // Only the strings of the line itself are kept (no intermediate product), then joined once.
      const strings: string[] = [];
      emitSequence(nodes, (expanded) => strings.push(expanded));
      output.push(strings.join(eol));
    }
    output.push(lineBreak);
  }
  return output.join();
};


// ---------------------------------------------------------------------------------------------
// DATEX-017 Multiplication Table
// ---------------------------------------------------------------------------------------------

/** DATEX-017: the largest number of rows and of columns. */
export const MULTIPLICATION_MAX = 100;

const TABLE_SIZE = /^(\d{1,9})(?:\s*[xX×*]\s*(\d{1,9})|\s+(\d{1,9}))?$/;

export interface TableSize {
  rows: number;
  columns: number;
}

/** DATEX-017: `N` (N × N), `NxM`, `N×M`, `N*M` or `N M` (N rows, M columns, each 1 to 100). */
export const parseTableSize = (text: string): TableSize => {
  const match = TABLE_SIZE.exec(text.trim());
  if (!match) {
    throw new GenInputError(`${quoteText(text.trim())} is not a size: enter N or NxM (such as 9 or 3x4)`);
  }
  const rows = Number(match[1]);
  const columns = Number(match[2] ?? match[3] ?? match[1]);
  if (rows < 1 || columns < 1) {
    throw new GenInputError('the numbers of rows and columns must be 1 or more');
  }
  if (rows > MULTIPLICATION_MAX || columns > MULTIPLICATION_MAX) {
    throw new GenLimitError(`the numbers of rows and columns must be at most ${MULTIPLICATION_MAX}`);
  }
  return { rows, columns };
};

/** DATEX-017: `3` → `1 2 3⏎2 4 6⏎3 6 9`; every column is right-aligned to its widest value. */
export const multiplicationTable = (size: TableSize, eol: string, budget: number): string => {
  const output = new GenOutputBuffer(budget);
  const widths = Array.from({ length: size.columns }, (_, j) => String(size.rows * (j + 1)).length);
  for (let i = 1; i <= size.rows; i++) {
    const row = widths.map((width, j) => String(i * (j + 1)).padStart(width, ' ')).join(' ');
    output.push(i === 1 ? row : eol + row);
  }
  return output.join();
};

// ---------------------------------------------------------------------------------------------
// DATEX-018 Fibonacci / DATEX-019 Primes (a number from the selection or an input box)
// ---------------------------------------------------------------------------------------------

/** DATEX-018: the largest number of terms. */
export const FIBONACCI_MAX_TERMS = 1_000;
/** DATEX-019: the largest N (primes up to N). */
export const PRIMES_MAX = 1_000_000;

const COUNT = /^\d{1,9}$/;

/** A whole number from `min` to `max` read from the selection: below is an input error, above a limit. */
export const parseBoundedCount = (text: string, min: number, max: number, what: string): number => {
  const trimmed = text.trim();
  if (!COUNT.test(trimmed)) {
    throw new GenInputError(`${quoteText(trimmed)} is not a whole number: enter ${what} from ${formatCount(min)} to ${formatCount(max)}`);
  }
  const n = Number(trimmed);
  if (n < min) {
    throw new GenInputError(`${what} must be ${formatCount(min)} or more`);
  }
  if (n > max) {
    throw new GenLimitError(`${what} must be at most ${formatCount(max)}`);
  }
  return n;
};

/** DATEX-018: the first `terms` Fibonacci numbers from 0, one per line (BigInt, exact). */
export const fibonacci = (terms: number, eol: string, budget: number): string => {
  const output = new GenOutputBuffer(budget);
  let a = 0n;
  let b = 1n;
  for (let i = 0; i < terms; i++) {
    output.push(i === 0 ? String(a) : eol + String(a));
    [a, b] = [b, a + b];
  }
  return output.join();
};

/** The sieve of Eratosthenes up to `n` (`1` = composite); at most PRIMES_MAX + 1 bytes. */
export const primeSieve = (n: number): Uint8Array => {
  if (!Number.isSafeInteger(n) || n < 1 || n > PRIMES_MAX) {
    throw new RangeError('invalid size of the sieve');
  }
  const composite = new Uint8Array(n + 1);
  composite[0] = 1;
  composite[1] = 1;
  for (let p = 2; p * p <= n; p++) {
    if (composite[p] === 0) {
      for (let k = p * p; k <= n; k += p) {
        composite[k] = 1;
      }
    }
  }
  return composite;
};

/** DATEX-019: the primes up to `n`, separated by a space, read from `sieve` (made for `n` or more). */
export const primesUpTo = (n: number, sieve: Uint8Array, budget: number): string => {
  if (sieve.length < n + 1) {
    throw new RangeError('the sieve is too small');
  }
  const output = new GenOutputBuffer(budget);
  let first = true;
  for (let k = 2; k <= n; k++) {
    if (sieve[k] === 0) {
      output.push(first ? String(k) : ` ${k}`);
      first = false;
    }
  }
  return output.join();
};

// ---------------------------------------------------------------------------------------------
// DATEX-020 Time Sequence
// ---------------------------------------------------------------------------------------------

/** DATEX-020: the largest interval (minutes) and number of times. */
export const TIME_SEQUENCE_MAX_INTERVAL = 1_440;
export const TIME_SEQUENCE_MAX_COUNT = 10_000;

const TIME = /^(\d{1,2}):(\d{2})(?::(\d{2}))?$/;

export interface StartTime {
  /** Seconds from 00:00:00. */
  seconds: number;
  /** Whether the hour was written with two digits (`09:00`) or one (`9:00`). */
  padHour: boolean;
  withSeconds: boolean;
}

/** DATEX-020: `HH:MM` or `HH:MM:SS` (0:00 to 23:59:59; the hour may have one digit). */
export const parseStartTime = (text: string): StartTime => {
  const trimmed = text.trim();
  const match = TIME.exec(trimmed);
  if (!match || Number(match[1]) > 23 || Number(match[2]) > 59 || (match[3] !== undefined && Number(match[3]) > 59)) {
    throw new GenInputError(`${quoteText(trimmed)} is not a time: enter HH:MM or HH:MM:SS (such as 09:00)`);
  }
  return {
    seconds: (Number(match[1]) * 60 + Number(match[2])) * 60 + (match[3] === undefined ? 0 : Number(match[3])),
    padHour: match[1].length === 2,
    withSeconds: match[3] !== undefined,
  };
};

/**
 * DATEX-020: `count` times from `start`, `interval` minutes apart, one per line, in the form of
 * the start; past 24:00 the times start again from 00:00 (no dates).
 */
export const timeSequence = (start: StartTime, interval: number, count: number, eol: string, budget: number): string => {
  const output = new GenOutputBuffer(budget);
  for (let i = 0; i < count; i++) {
    const seconds = (start.seconds + i * interval * 60) % 86_400;
    const hour = Math.floor(seconds / 3600);
    const text = `${start.padHour ? pad2(hour) : hour}:${pad2(Math.floor(seconds / 60) % 60)}${start.withSeconds ? `:${pad2(seconds % 60)}` : ''}`;
    output.push(i === 0 ? text : eol + text);
  }
  return output.join();
};
