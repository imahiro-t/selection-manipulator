/**
 * Pure (vscode-independent) generators of the DATEX-016..020 commands (group DATE2): brace
 * expansion, multiplication table, Fibonacci numbers, prime numbers and time sequences.
 *
 * Security rules (SECURITY.md): every count and size is estimated BEFORE anything is generated and
 * a value over a limit throws `GenLimitError` (a warning, nothing is changed); the results are then
 * counted against the output budget while they are built. The brace expansion is a hand-written
 * parser (one linear pass to match the braces, recursion bounded by the nesting limit); no shell is
 * run and no regular expression is built from the text. Only `BigInt` and typed arrays are used.
 */
import { formatCount, GenInputError, GenLimitError, GenOutputBuffer, quoteText } from './genCommon';

// ---------------------------------------------------------------------------------------------
// Lines
// ---------------------------------------------------------------------------------------------

/**
 * Calls `visit` for every line of the text with the line and the line break after it (`''` for
 * the last line). LF, CRLF and CR are recognised.
 */
const forEachLine = (text: string, visit: (line: string, lineBreak: string, lineNumber: number) => void): void => {
  let start = 0;
  let lineNumber = 1;
  for (let i = 0; i < text.length; i++) {
    const code = text.charCodeAt(i);
    if (code === 0x0a || code === 0x0d) {
      const breakLength = code === 0x0d && text.charCodeAt(i + 1) === 0x0a ? 2 : 1;
      visit(text.slice(start, i), text.slice(i, i + breakLength), lineNumber);
      i += breakLength - 1;
      start = i + 1;
      lineNumber++;
    }
  }
  visit(text.slice(start), '', lineNumber);
};

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

/** Counts and lengths are computed saturated at this value (far above every limit). */
const SATURATED = 1e15;
const cap = (n: number): number => (n > SATURATED ? SATURATED : n);

/** A piece of a parsed line: literal text, alternatives (`{a,b}`) or a range (`{1..3}`). */
type BraceNode =
  | { kind: 'text'; text: string }
  | { kind: 'alternatives'; options: BraceNode[][] }
  | { kind: 'range'; terms: string[] };

const NUMBER_RANGE = /^([-+]?\d{1,15})\.\.([-+]?\d{1,15})(?:\.\.([-+]?\d{1,15}))?$/;
const LETTER_RANGE = /^([A-Za-z])\.\.([A-Za-z])(?:\.\.([-+]?\d{1,15}))?$/;

/** The number of terms from `from` to `to` by `step` (> 0), refused over BRACE_MAX_RANGE_TERMS before any is made. */
const rangeTermCount = (from: number, to: number, step: number): number => {
  const terms = Math.floor(Math.abs(to - from) / step) + 1;
  if (terms > BRACE_MAX_RANGE_TERMS) {
    throw new GenLimitError(`a range has more than ${formatCount(BRACE_MAX_RANGE_TERMS)} terms`);
  }
  return terms;
};

/** A step of 0 counts as 1 (as in bash); the sign of the step is ignored (the direction comes from the ends). */
const stepOf = (text: string | undefined): number => {
  const step = text === undefined ? 1 : Math.abs(Number(text));
  return step === 0 ? 1 : step;
};

/** `{1..3}`, `{01..10}` (zero-padded to the longer end), `{10..1..3}`, `{a..e}`; `undefined` when the text is not a range. */
const parseRange = (content: string): string[] | undefined => {
  const number = NUMBER_RANGE.exec(content);
  if (number) {
    const from = Number(number[1]);
    const to = Number(number[2]);
    const step = stepOf(number[3]);
    const terms = rangeTermCount(from, to, step);
    const padded = [number[1], number[2]].some((end) => /^[-+]?0\d/.test(end));
    const width = padded ? Math.max(number[1].replace('+', '').length, number[2].replace('+', '').length) : 0;
    const direction = to >= from ? 1 : -1;
    const result: string[] = [];
    for (let i = 0; i < terms; i++) {
      const n = from + direction * i * step;
      const digits = String(Math.abs(n));
      const sign = n < 0 ? '-' : '';
      result.push(`${sign}${digits.padStart(width - sign.length, '0')}`);
    }
    return result;
  }
  const letter = LETTER_RANGE.exec(content);
  if (letter) {
    const from = letter[1].charCodeAt(0);
    const to = letter[2].charCodeAt(0);
    const step = stepOf(letter[3]);
    const terms = rangeTermCount(from, to, step);
    const direction = to >= from ? 1 : -1;
    return Array.from({ length: terms }, (_, i) => String.fromCharCode(from + direction * i * step));
  }
  return undefined;
};

/** The braces of a line matched in one pass: the closing brace and the top-level commas of each opening brace. */
interface BraceTable {
  /** Opening brace offset → its closing brace offset (unmatched braces are not in it). */
  close: Map<number, number>;
  /** Opening brace offset → the offsets of the commas directly inside it. */
  commas: Map<number, number[]>;
  /** Offsets of the characters escaped with a backslash (`\{`, `\}`, `\,`, `\\`). */
  escaped: Set<number>;
}

const ESCAPABLE = '{},\\';

const matchBraces = (line: string): BraceTable => {
  const close = new Map<number, number>();
  const commas = new Map<number, number[]>();
  const escaped = new Set<number>();
  const stack: number[] = [];
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '\\' && i + 1 < line.length && ESCAPABLE.includes(line[i + 1])) {
      escaped.add(i + 1);
      i++;
      continue;
    }
    if (ch === '{') {
      stack.push(i);
      commas.set(i, []);
    } else if (ch === '}' && stack.length > 0) {
      close.set(stack.pop()!, i);
    } else if (ch === ',' && stack.length > 0) {
      commas.get(stack[stack.length - 1])!.push(i);
    }
  }
  // A brace that is never closed is literal text; so are the commas recorded for it.
  return { close, commas, escaped };
};

/**
 * Parses `line[from, to)` into pieces. A matched pair of braces with top-level commas is a list of
 * alternatives, one with a range inside is a range, anything else (`{a}`, `{}`, an unmatched brace)
 * is literal text whose inside is still parsed. `depth` is the nesting of the braces around.
 */
const parseSequence = (line: string, table: BraceTable, from: number, to: number, depth: number): BraceNode[] => {
  const nodes: BraceNode[] = [];
  let text = '';
  const flush = () => {
    if (text !== '') {
      nodes.push({ kind: 'text', text });
      text = '';
    }
  };
  let i = from;
  while (i < to) {
    const ch = line[i];
    if (ch === '\\' && table.escaped.has(i + 1)) {
      text += line[i + 1];
      i += 2;
      continue;
    }
    const end = ch === '{' && !table.escaped.has(i) ? table.close.get(i) : undefined;
    if (end === undefined || end >= to) {
      text += ch;
      i++;
      continue;
    }
    if (depth + 1 > BRACE_MAX_DEPTH) {
      throw new GenLimitError(`the braces are nested more than ${BRACE_MAX_DEPTH} deep`);
    }
    const commas = table.commas.get(i)!;
    if (commas.length > 0) {
      flush();
      const bounds = [i, ...commas, end];
      const options = bounds.slice(0, -1).map((start, k) => parseSequence(line, table, start + 1, bounds[k + 1], depth + 1));
      nodes.push({ kind: 'alternatives', options });
    } else {
      const content = line.slice(i + 1, end);
      const range = content.includes('{') || content.includes('\\') ? undefined : parseRange(content);
      if (range !== undefined) {
        flush();
        nodes.push({ kind: 'range', terms: range });
      } else {
        // `{a}`: the braces stay; what is inside them is still expanded.
        text += '{';
        flush();
        nodes.push(...parseSequence(line, table, i + 1, end, depth + 1));
        text += '}';
      }
    }
    i = end + 1;
  }
  flush();
  return nodes;
};

/** The number of strings and their total length (both saturated) of a sequence of pieces. */
interface Size {
  count: number;
  length: number;
}

const sizeOfNode = (node: BraceNode): Size => {
  switch (node.kind) {
    case 'text':
      return { count: 1, length: node.text.length };
    case 'range':
      return { count: node.terms.length, length: node.terms.reduce((sum, term) => sum + term.length, 0) };
    default: {
      let count = 0;
      let length = 0;
      for (const option of node.options) {
        const size = sizeOfSequence(option);
        count = cap(count + size.count);
        length = cap(length + size.length);
      }
      return { count, length };
    }
  }
};

/** count = Π countᵢ; length = Σ lengthᵢ × Π_{j≠i} countⱼ (every string of a piece is combined with every string of the others). */
const sizeOfSequence = (nodes: readonly BraceNode[]): Size => {
  let count = 1;
  let length = 0;
  for (const node of nodes) {
    const size = sizeOfNode(node);
    length = cap(cap(length * size.count) + cap(size.length * count));
    count = cap(count * size.count);
  }
  return { count, length };
};

const expandNode = (node: BraceNode): string[] => {
  switch (node.kind) {
    case 'text':
      return [node.text];
    case 'range':
      return node.terms;
    default:
      return node.options.flatMap((option) => expandSequence(option));
  }
};

const expandSequence = (nodes: readonly BraceNode[]): string[] => {
  let results = [''];
  for (const node of nodes) {
    const pieces = expandNode(node);
    const next: string[] = [];
    for (const prefix of results) {
      for (const piece of pieces) {
        next.push(prefix + piece);
      }
    }
    results = next;
  }
  return results;
};

/**
 * DATEX-016: expands the braces of every line of the selection (`file{1..3}.txt` → 3 lines). The
 * strings of one line are joined with `eol`; the line breaks of the selection are kept. Every
 * line is parsed and counted before anything is expanded: more than BRACE_MAX_PER_LINE strings
 * for one line, BRACE_MAX_PER_SELECTION for the selection, or a longer result than the budget
 * stops everything.
 */
export const braceExpansion = (text: string, eol: string, budget: number): string => {
  const parsed: { nodes: BraceNode[] | undefined; line: string; lineBreak: string; lineNumber: number }[] = [];
  let total = 0;
  let length = 0;
  forEachLine(text, (line, lineBreak, lineNumber) => {
    try {
      if (!line.includes('{')) {
        parsed.push({ nodes: undefined, line, lineBreak, lineNumber });
        total += 1;
        length += line.length + lineBreak.length;
        return;
      }
      const nodes = parseSequence(line, matchBraces(line), 0, line.length, 0);
      const size = sizeOfSequence(nodes);
      if (size.count > BRACE_MAX_PER_LINE) {
        throw new GenLimitError(`the line expands to more than ${formatCount(BRACE_MAX_PER_LINE)} strings`);
      }
      parsed.push({ nodes, line, lineBreak, lineNumber });
      total += size.count;
      length = cap(length + size.length + (size.count - 1) * eol.length + lineBreak.length);
    } catch (error) {
      throw atLine(lineNumber, error);
    }
    if (total > BRACE_MAX_PER_SELECTION) {
      throw new GenLimitError(`the selection expands to more than ${formatCount(BRACE_MAX_PER_SELECTION)} strings`);
    }
  });
  const output = new GenOutputBuffer(budget);
  // The whole result is checked against the budget before it is built.
  output.reserve(length);
  for (const { nodes, line, lineBreak } of parsed) {
    output.push(nodes === undefined ? line : expandSequence(nodes).join(eol));
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

const pad2 = (n: number): string => String(n).padStart(2, '0');

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
