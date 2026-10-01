/**
 * Pure (vscode-independent) implementations of the MSEL-001..030 multi-cursor and selection
 * commands, and their command table.
 *
 * Every command works on the text of the whole document and the selections as offset ranges
 * (`{ start, end }`, `start <= end`) in document order, and returns what to do: new selections,
 * an edit (with the selections to set after it), a notification, a warning, or nothing.
 *
 * The rules shared by all commands are:
 * - The selections are counted in document order ("first", "last", "odd"… are 1-based).
 * - An operation that would leave no selection changes nothing and warns (VS Code cannot have
 *   zero selections). An operation whose result is the same as before changes nothing.
 * - A command never creates more than `MSEL_MAX_SELECTIONS` selections.
 * - "One character" is one code point, and a CRLF line break is one character: a surrogate
 *   pair or a CRLF is never split.
 * - The user's regular expressions (MSEL-006 / 007 / 018) are NOT executed here: the handler
 *   runs them in the worker thread of `lineRegex.ts` (time and size limits) and passes the
 *   results in the context. Every other regular expression is fixed and has no nested
 *   quantifier; brackets and quotes are matched with loops.
 * - User input (delimiters) is matched literally with `indexOf`, never embedded into a regular
 *   expression.
 *
 * Only local processing: no network, files or processes, no `eval` / `new Function`, no new
 * dependency.
 */
import {
  formatNumber,
  LINE_JOIN_DELIMITER_MAX_LENGTH,
  LINE_REGEX_PATTERN_MAX_LENGTH,
  validateLineCountInput,
  validateLineDelimiterInput,
  validateLineRegexInput,
  validateLineWidthInput,
} from './lineTransforms';
import { MAX_OUTPUT_LENGTH } from './encodeTransforms';

// ---------------------------------------------------------------------------
// Types, limits and errors
// ---------------------------------------------------------------------------

/** A selection as offsets into the document text (`start <= end`). */
export interface MselRange {
  start: number;
  end: number;
  /** The cursor (active end) is at `start` (a selection made from right to left). */
  reversed?: boolean;
}

/** Replaces `[start, end)` of the document (before the edit) with `text`. */
export interface MselEdit {
  start: number;
  end: number;
  text: string;
}

export type MselResult =
  /** Sets the selections (and shows `message` as an information, if any). */
  | { kind: 'select'; ranges: MselRange[]; message?: string }
  /** Applies the edits in one step, then sets the selections (offsets after the edit). */
  | { kind: 'edit'; edits: MselEdit[]; ranges: MselRange[] }
  /** Shows an information message and changes nothing. */
  | { kind: 'info'; message: string }
  /** Shows a warning and changes nothing. */
  | { kind: 'warn'; message: string }
  /** Changes nothing and says nothing (the result would be the same as before). */
  | { kind: 'unchanged' };

/**
 * The most selections a command may create. VS Code keeps at most `editor.multiCursorLimit`
 * (10,000 by default) of the selections it is given; see the README limitations.
 */
export const MSEL_MAX_SELECTIONS = 100_000;
/** MSEL-013: how far before and after a selection a bracket may be (characters). */
export const MSEL_BRACKET_SEARCH_LIMIT = 1_000_000;
/** MSEL-029: how many selections the notification lists. */
export const MSEL_INFO_MAX_LISTED = 50;
/** MSEL-021: the column number N. */
export const MSEL_COLUMN_MIN = 1;
export const MSEL_COLUMN_MAX = 1000;

/** An input that a command cannot use (reported as a warning; nothing is changed). */
export class MselInputError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'MselInputError';
  }
}

/** Thrown when a command would create more than `MSEL_MAX_SELECTIONS` selections. */
export class MselTooManySelectionsError extends MselInputError {
  constructor() {
    super(`more than ${formatNumber(MSEL_MAX_SELECTIONS)} selections would be made; select less text`);
    this.name = 'MselTooManySelectionsError';
  }
}

export const MSEL_NEED_TWO = 'Add at least two selections (cursors) first.';
export const MSEL_NEED_EXACTLY_TWO = 'Swap Two Selections needs exactly two selections.';

/**
 * Delimiter of MSEL-016 / 017 / 021: 1 to 100 characters without line breaks. Unlike the
 * delimiter of LINE-027 (which may be empty), an empty delimiter is rejected.
 */
export const validateMselDelimiterInput = (value: string): string | undefined => {
  if (value.length === 0) {
    return 'Enter a delimiter';
  }
  return validateLineDelimiterInput(value);
};

/** The same rule inside the transforms (a second check, independent of the input box). */
const assertDelimiter = (delimiter: string): void => {
  const problem = validateMselDelimiterInput(delimiter);
  if (problem !== undefined) {
    throw new MselInputError(problem);
  }
};

/** Collects ranges and throws `MselTooManySelectionsError` as soon as there are too many. */
export class RangeCollector {
  readonly ranges: MselRange[] = [];

  constructor(private readonly limit: number = MSEL_MAX_SELECTIONS) {}

  push(start: number, end: number): void {
    if (this.ranges.length >= this.limit) {
      throw new MselTooManySelectionsError();
    }
    this.ranges.push({ start, end });
  }
}

// ---------------------------------------------------------------------------
// Characters and lines
// ---------------------------------------------------------------------------

const isHighSurrogate = (code: number): boolean => code >= 0xd800 && code <= 0xdbff;
const isLowSurrogate = (code: number): boolean => code >= 0xdc00 && code <= 0xdfff;

/** The offset after the character at `offset` (a CRLF and a surrogate pair are one character). */
export const nextCharEnd = (text: string, offset: number): number => {
  if (offset >= text.length) {
    return text.length;
  }
  if (text[offset] === '\r' && text[offset + 1] === '\n') {
    return offset + 2;
  }
  if (isHighSurrogate(text.charCodeAt(offset)) && isLowSurrogate(text.charCodeAt(offset + 1))) {
    return offset + 2;
  }
  return offset + 1;
};

/** The offset of the character that ends at `offset` (a CRLF and a surrogate pair are one character). */
export const prevCharStart = (text: string, offset: number): number => {
  if (offset <= 0) {
    return 0;
  }
  if (text[offset - 1] === '\n' && text[offset - 2] === '\r') {
    return offset - 2;
  }
  if (isLowSurrogate(text.charCodeAt(offset - 1)) && isHighSurrogate(text.charCodeAt(offset - 2))) {
    return offset - 2;
  }
  return offset - 1;
};

/** The number of characters of `text` (code points; a CRLF counts as one). */
export const countChars = (text: string): number => {
  let count = 0;
  for (let i = 0; i < text.length; i = nextCharEnd(text, i)) {
    count++;
  }
  return count;
};

/** The line starts of a document text (line breaks are `\n` or `\r\n`). */
export class MselLines {
  private readonly starts: number[] = [0];

  constructor(private readonly text: string) {
    for (let i = text.indexOf('\n'); i !== -1; i = text.indexOf('\n', i + 1)) {
      this.starts.push(i + 1);
    }
  }

  get count(): number {
    return this.starts.length;
  }

  /** The 0-based line of an offset. */
  lineOf(offset: number): number {
    let low = 0;
    let high = this.starts.length - 1;
    while (low < high) {
      const middle = (low + high + 1) >> 1;
      if (this.starts[middle] <= offset) {
        low = middle;
      } else {
        high = middle - 1;
      }
    }
    return low;
  }

  start(line: number): number {
    return this.starts[line];
  }

  /** The end of the text of a line (before its line break). */
  contentEnd(line: number): number {
    if (line + 1 >= this.starts.length) {
      return this.text.length;
    }
    const breakStart = this.starts[line + 1] - 1;
    return breakStart > this.starts[line] && this.text[breakStart - 1] === '\r' ? breakStart - 1 : breakStart;
  }
}

/**
 * The lines a selection covers: its first to its last line, without the last line when a
 * selection of several lines ends at the start of it. An empty selection covers its line.
 */
const coveredLines = (lines: MselLines, range: MselRange): [number, number] => {
  const first = lines.lineOf(range.start);
  let last = lines.lineOf(range.end);
  if (last > first && range.end === lines.start(last)) {
    last--;
  }
  return [first, last];
};

/** The lines covered by any of the selections, each once, in document order. */
const uniqueCoveredLines = (lines: MselLines, ranges: readonly MselRange[]): number[] => {
  const result: number[] = [];
  let previous = -1;
  for (const range of ranges) {
    const [first, last] = coveredLines(lines, range);
    for (let line = Math.max(first, previous + 1); line <= last; line++) {
      result.push(line);
    }
    previous = Math.max(previous, last);
  }
  return result;
};

const sameRanges = (a: readonly MselRange[], b: readonly MselRange[]): boolean =>
  a.length === b.length && a.every((range, i) => range.start === b[i].start && range.end === b[i].end);

/** A select result, or `unchanged` when the ranges are the same as before. */
export const selectOrUnchanged = (before: readonly MselRange[], after: MselRange[], message?: string): MselResult => {
  if (sameRanges(before, after)) {
    return message === undefined ? { kind: 'unchanged' } : { kind: 'info', message };
  }
  return message === undefined ? { kind: 'select', ranges: after } : { kind: 'select', ranges: after, message };
};

export const textOf = (text: string, range: MselRange): string => text.slice(range.start, range.end);

// ---------------------------------------------------------------------------
// A: filtering the selections (MSEL-001..009)
// ---------------------------------------------------------------------------

/** Keeps the selections for which `keep(index)` is true (the original objects, directions kept). */
const keepWhere = (ranges: readonly MselRange[], keep: (range: MselRange, index: number) => boolean, noneLeft: string): MselResult => {
  const kept = ranges.filter(keep);
  if (kept.length === 0) {
    return { kind: 'warn', message: noneLeft };
  }
  return kept.length === ranges.length ? { kind: 'unchanged' } : { kind: 'select', ranges: kept };
};

export const needTwo = (ranges: readonly MselRange[]): MselResult | undefined =>
  ranges.length < 2 ? { kind: 'warn', message: MSEL_NEED_TWO } : undefined;

/** MSEL-001: keeps the 1st, 3rd, 5th… selection. */
export const keepOdd = (ranges: readonly MselRange[]): MselResult =>
  needTwo(ranges) ?? keepWhere(ranges, (_range, i) => i % 2 === 0, MSEL_NEED_TWO);

/** MSEL-002: keeps the 2nd, 4th, 6th… selection. */
export const keepEven = (ranges: readonly MselRange[]): MselResult =>
  needTwo(ranges) ?? keepWhere(ranges, (_range, i) => i % 2 === 1, MSEL_NEED_TWO);

/** MSEL-003: keeps the Nth, 2Nth, 3Nth… selection. */
export const keepEveryNth = (ranges: readonly MselRange[], n: number): MselResult => {
  if (!Number.isInteger(n) || n < 1) {
    throw new MselInputError('N must be a positive integer');
  }
  const tooFew = needTwo(ranges);
  if (tooFew) {
    return tooFew;
  }
  if (n > ranges.length) {
    return { kind: 'warn', message: `There is no selection number ${formatNumber(n)}: there are only ${formatNumber(ranges.length)} selections.` };
  }
  return keepWhere(ranges, (_range, i) => (i + 1) % n === 0, MSEL_NEED_TWO);
};

/** MSEL-004: removes the first selection. */
export const removeFirst = (ranges: readonly MselRange[]): MselResult =>
  needTwo(ranges) ?? { kind: 'select', ranges: ranges.slice(1) };

/** MSEL-005: removes the last selection. */
export const removeLast = (ranges: readonly MselRange[]): MselResult =>
  needTwo(ranges) ?? { kind: 'select', ranges: ranges.slice(0, -1) };

/** MSEL-006 / 007: keeps (or removes) the selections whose text matched (`matches`, one per selection). */
export const filterByMatches = (ranges: readonly MselRange[], matches: readonly boolean[], keepMatching: boolean): MselResult => {
  if (matches.length !== ranges.length) {
    throw new Error('The regular expression results do not match the selections');
  }
  return keepWhere(ranges, (_range, i) => matches[i] === keepMatching, keepMatching
    ? 'No selection matches the regular expression.'
    : 'Every selection matches the regular expression; at least one selection must remain.');
};

/** MSEL-008: removes the empty selections (cursors). */
export const removeEmpty = (ranges: readonly MselRange[]): MselResult =>
  keepWhere(ranges, (range) => range.end > range.start, 'Every selection is empty; at least one selection must remain.');

/** MSEL-009: keeps only the first selection of every text (case-sensitive). */
export const removeDuplicateText = (text: string, ranges: readonly MselRange[]): MselResult => {
  const tooFew = needTwo(ranges);
  if (tooFew) {
    return tooFew;
  }
  const seen = new Set<string>();
  return keepWhere(ranges, (range) => {
    const value = textOf(text, range);
    if (seen.has(value)) {
      return false;
    }
    seen.add(value);
    return true;
  }, MSEL_NEED_TWO);
};

// ---------------------------------------------------------------------------
// B: aligning, expanding and shrinking (MSEL-010..016)
// ---------------------------------------------------------------------------

/**
 * MSEL-010: inserts spaces before the start of every selection so that all starts are at the
 * same display column (the rightmost one). With several selections on one line, the k-th
 * selections of all lines are aligned together, for k = 1, 2, … in turn. Widths are kept.
 *
 * The display columns are counted incrementally: every line remembers how far (in the original
 * text) it has been counted and the display column there (spaces inserted so far included), so
 * each line is read once however many selections it has (O(document length + selections)).
 */
export const alignCursors = (text: string, ranges: readonly MselRange[], tabSize: number): MselResult => {
  const tooFew = needTwo(ranges);
  if (tooFew) {
    return tooFew;
  }
  const size = Number.isInteger(tabSize) && tabSize > 0 ? tabSize : 4;
  const lines = new MselLines(text);
  // For every line: its selections in order, and the counting position (a column of the
  // original line) with the display column there after the spaces inserted so far.
  const byLine = new Map<number, { lineStart: number; indices: number[]; position: number; display: number }>();
  ranges.forEach((range, index) => {
    const line = lines.lineOf(range.start);
    let entry = byLine.get(line);
    if (entry === undefined) {
      entry = { lineStart: lines.start(line), indices: [], position: 0, display: 0 };
      byLine.set(line, entry);
    }
    entry.indices.push(index);
  });
  const spaces = new Array<number>(ranges.length).fill(0);
  // rounds[k]: the lines that have a (k+1)-th selection.
  const rounds: number[][] = [];
  for (const [lineNumber, entry] of byLine) {
    entry.indices.forEach((_index, k) => {
      (rounds[k] ??= []).push(lineNumber);
    });
  }
  let total = 0;
  for (const [k, roundLines] of rounds.entries()) {
    if (roundLines.length < 2) {
      continue;
    }
    const current = roundLines.map((lineNumber) => {
      const entry = byLine.get(lineNumber)!;
      const index = entry.indices[k];
      const column = ranges[index].start - entry.lineStart;
      let display = entry.display;
      for (let i = entry.position; i < column; i++) {
        display = text[entry.lineStart + i] === '\t' ? (Math.floor(display / size) + 1) * size : display + 1;
      }
      entry.position = column;
      entry.display = display;
      return { entry, index, display };
    });
    const target = current.reduce((max, { display }) => Math.max(max, display), 0);
    for (const { entry, index, display } of current) {
      const count = target - display;
      if (count > 0) {
        total += count;
        if (total > MAX_OUTPUT_LENGTH) {
          throw new MselInputError(`more than ${formatNumber(MAX_OUTPUT_LENGTH)} spaces would be inserted`);
        }
        // The spaces go right before `position`, so the character there moves right by `count`.
        entry.display += count;
        spaces[index] = count;
      }
    }
  }
  if (spaces.every((count) => count === 0)) {
    return { kind: 'unchanged' };
  }
  const edits: MselEdit[] = [];
  const after: MselRange[] = [];
  let shift = 0;
  ranges.forEach((range, index) => {
    if (spaces[index] > 0) {
      edits.push({ start: range.start, end: range.start, text: ' '.repeat(spaces[index]) });
    }
    shift += spaces[index];
    after.push({ start: range.start + shift, end: range.end + shift, reversed: range.reversed });
  });
  return { kind: 'edit', edits, ranges: after };
};

/** The word at an offset (`document.getWordRangeAtPosition` in VS Code), if any. */
export type MselWordAt = (offset: number) => { start: number; end: number } | undefined;

/**
 * MSEL-011: expands the start of every selection to the start of the word it is in and the end
 * to the end of the word it is in; a cursor becomes the whole word. An end that is not in a
 * word does not move.
 */
export const expandToWord = (ranges: readonly MselRange[], wordAt: MselWordAt): MselResult => {
  const after = ranges.map((range): MselRange => {
    if (range.start === range.end) {
      const word = wordAt(range.start);
      return word === undefined ? range : { start: word.start, end: word.end, reversed: range.reversed };
    }
    const startWord = wordAt(range.start);
    const endWord = wordAt(range.end);
    const start = startWord !== undefined && startWord.end > range.start ? Math.min(range.start, startWord.start) : range.start;
    const end = endWord !== undefined && endWord.start < range.end ? Math.max(range.end, endWord.end) : range.end;
    return { start, end, reversed: range.reversed };
  });
  return selectOrUnchanged(ranges, after);
};

const QUOTES = new Set(['"', "'", '`']);

/** Pairs the quotes of one line from left to right (escaped quotes are skipped): [open, close] offsets in the line. */
const quotePairs = (line: string): [number, number][] => {
  const pairs: [number, number][] = [];
  let open = -1;
  let quote = '';
  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (char === '\\') {
      i++;
      continue;
    }
    if (!QUOTES.has(char)) {
      continue;
    }
    if (open === -1) {
      open = i;
      quote = char;
    } else if (char === quote) {
      pairs.push([open, i]);
      open = -1;
    }
  }
  return pairs;
};

/**
 * MSEL-012: selects the inside of the quotes (`"`, `'` or `` ` `` on the same line) around every
 * selection. A selection that is not inside quotes on one line does not change.
 */
export const expandToQuotes = (text: string, ranges: readonly MselRange[]): MselResult => {
  const lines = new MselLines(text);
  const cache = new Map<number, [number, number][]>();
  const after = ranges.map((range): MselRange => {
    const line = lines.lineOf(range.start);
    if (lines.lineOf(range.end) !== line) {
      return range;
    }
    const lineStart = lines.start(line);
    let pairs = cache.get(line);
    if (pairs === undefined) {
      pairs = quotePairs(text.slice(lineStart, lines.contentEnd(line)));
      cache.set(line, pairs);
    }
    // The pairs are in order and do not overlap, so only the last pair that opens before the
    // selection can contain it (binary search: O(log pairs) per selection).
    const relativeStart = range.start - lineStart;
    let low = 0;
    let high = pairs.length;
    while (low < high) {
      const middle = (low + high) >> 1;
      if (pairs[middle][0] + 1 <= relativeStart) {
        low = middle + 1;
      } else {
        high = middle;
      }
    }
    const candidate = low > 0 ? pairs[low - 1] : undefined;
    const pair = candidate !== undefined && range.end <= lineStart + candidate[1] ? candidate : undefined;
    return pair === undefined ? range : { start: lineStart + pair[0] + 1, end: lineStart + pair[1], reversed: range.reversed };
  });
  return selectOrUnchanged(ranges, after);
};

const BRACKETS: readonly [string, string][] = [['(', ')'], ['[', ']'], ['{', '}']];

/**
 * The brackets of one type in a document, indexed once so that every selection is answered
 * without scanning the text around it (MSEL-013).
 *
 * The brackets are numbered in document order ("events"). A forward pass with a stack gives,
 * after every event, the innermost opener that is still open there (unmatched in the text
 * before it: a closer closes the innermost open opener, a closer with nothing open is ignored),
 * and for every opener the opener that was open around it. A backward pass gives the same for
 * the closers of the text after a position. The openers open at an offset are then a chain
 * (innermost first) found by a binary search and followed through the parents, and the same
 * for the closers. Building is O(document length); a query is O(log brackets + steps taken).
 *
 * This gives the same brackets as scanning from the offset outward with a depth counter.
 */
class BracketIndex {
  private readonly positions: number[];
  /** Forward: the innermost open opener (event) after event `e`, or -1. */
  private readonly openAfter: Int32Array;
  /** Forward: for an opener event, the opener (event) that was open around it, or -1. */
  private readonly openerParent: Int32Array;
  /** Backward: the innermost unmatched closer (event) of the text from event `e` on, or -1. */
  private readonly closeFrom: Int32Array;
  /** Backward: for a closer event, the closer (event) unmatched around it, or -1. */
  private readonly closerParent: Int32Array;

  constructor(text: string, positions: number[], open: string) {
    this.positions = positions;
    const count = positions.length;
    const isOpen = new Uint8Array(count);
    positions.forEach((position, e) => {
      isOpen[e] = text[position] === open ? 1 : 0;
    });
    this.openAfter = new Int32Array(count);
    this.openerParent = new Int32Array(count).fill(-1);
    const stack: number[] = [];
    for (let e = 0; e < count; e++) {
      if (isOpen[e]) {
        this.openerParent[e] = stack.length > 0 ? stack[stack.length - 1] : -1;
        stack.push(e);
      } else if (stack.length > 0) {
        stack.pop();
      }
      this.openAfter[e] = stack.length > 0 ? stack[stack.length - 1] : -1;
    }
    this.closeFrom = new Int32Array(count);
    this.closerParent = new Int32Array(count).fill(-1);
    stack.length = 0;
    for (let e = count - 1; e >= 0; e--) {
      if (!isOpen[e]) {
        this.closerParent[e] = stack.length > 0 ? stack[stack.length - 1] : -1;
        stack.push(e);
      } else if (stack.length > 0) {
        stack.pop();
      }
      this.closeFrom[e] = stack.length > 0 ? stack[stack.length - 1] : -1;
    }
  }

  /** The number of events before `offset`. */
  private eventsBefore(offset: number): number {
    let low = 0;
    let high = this.positions.length;
    while (low < high) {
      const middle = (low + high) >> 1;
      if (this.positions[middle] < offset) {
        low = middle + 1;
      } else {
        high = middle;
      }
    }
    return low;
  }

  /**
   * The offsets of the openers open at `offset` (unmatched in the text before it), innermost
   * first: `count` of them after skipping `skip`, and none before `minOffset`.
   */
  openers(offset: number, skip: number, count: number, minOffset: number): number[] {
    const before = this.eventsBefore(offset);
    let e = before > 0 ? this.openAfter[before - 1] : -1;
    for (let k = 0; k < skip && e !== -1; k++) {
      e = this.openerParent[e];
    }
    const result: number[] = [];
    for (; e !== -1 && result.length < count && this.positions[e] >= minOffset; e = this.openerParent[e]) {
      result.push(this.positions[e]);
    }
    return result;
  }

  /**
   * The offsets of the closers unmatched in the text from `offset` on, innermost first: `count`
   * of them after skipping `skip`, and none at or after `maxOffset`.
   */
  closers(offset: number, skip: number, count: number, maxOffset: number): number[] {
    const from = this.eventsBefore(offset);
    let e = from < this.positions.length ? this.closeFrom[from] : -1;
    for (let k = 0; k < skip && e !== -1; k++) {
      e = this.closerParent[e];
    }
    const result: number[] = [];
    for (; e !== -1 && result.length < count && this.positions[e] < maxOffset; e = this.closerParent[e]) {
      result.push(this.positions[e]);
    }
    return result;
  }
}

/** The bracket indexes of all types (`BRACKETS` order), from one pass over the text. */
const bracketIndexes = (text: string): BracketIndex[] => {
  const positions: number[][] = BRACKETS.map(() => []);
  for (let i = 0; i < text.length; i++) {
    switch (text[i]) {
      case '(':
      case ')':
        positions[0].push(i);
        break;
      case '[':
      case ']':
        positions[1].push(i);
        break;
      case '{':
      case '}':
        positions[2].push(i);
        break;
    }
  }
  return BRACKETS.map(([open], type) => new BracketIndex(text, positions[type], open));
};

/**
 * MSEL-013: expands every selection to the inside of the innermost `()`, `[]` or `{}` around it
 * that is not the selection itself (so running it again goes one level out). Each bracket type
 * is matched on its own; brackets in strings and comments are not told apart. Brackets farther
 * than `limit` characters before the start or after the end of a selection are not used.
 *
 * The text is indexed once (`BracketIndex`), so a run is O(document length + total selected
 * length + selections × log brackets) however many selections there are.
 */
export const expandToBrackets = (text: string, ranges: readonly MselRange[], limit: number = MSEL_BRACKET_SEARCH_LIMIT): MselResult => {
  if (ranges.length === 0) {
    return { kind: 'unchanged' };
  }
  const indexes = bracketIndexes(text);
  const after = ranges.map((range): MselRange => {
    let best: [number, number] | undefined;
    BRACKETS.forEach(([open, close], type) => {
      // Brackets inside the selection: closers without an opener use up openers before it, and
      // openers without a closer use up closers after it.
      let unmatchedClosers = 0;
      let unmatchedOpeners = 0;
      for (let i = range.start; i < range.end; i++) {
        if (text[i] === open) {
          unmatchedOpeners++;
        } else if (text[i] === close) {
          if (unmatchedOpeners > 0) {
            unmatchedOpeners--;
          } else {
            unmatchedClosers++;
          }
        }
      }
      const openers = indexes[type].openers(range.start, unmatchedClosers, 2, range.start - limit);
      const closers = indexes[type].closers(range.end, unmatchedOpeners, 2, range.end + limit);
      for (let k = 0; k < Math.min(openers.length, closers.length); k++) {
        const opener = openers[k];
        const closer = closers[k];
        if (opener + 1 === range.start && closer === range.end) {
          continue;
        }
        if (best === undefined || opener > best[0]) {
          best = [opener, closer];
        }
        break;
      }
    });
    return best === undefined ? range : { start: best[0] + 1, end: best[1], reversed: range.reversed };
  });
  return selectOrUnchanged(ranges, after);
};

const WHITESPACE = /^\s$/u;
const isWhitespaceAt = (text: string, offset: number): boolean => {
  const code = text.codePointAt(offset);
  return code !== undefined && WHITESPACE.test(String.fromCodePoint(code));
};

/** MSEL-014: removes the whitespace (spaces, tabs, line breaks…) at both ends of every selection. */
export const trimSelections = (text: string, ranges: readonly MselRange[]): MselResult => {
  const after = ranges.map((range): MselRange => {
    let start = range.start;
    while (start < range.end && isWhitespaceAt(text, start)) {
      start = nextCharEnd(text, start);
    }
    if (start >= range.end) {
      return { start: range.start, end: range.start };
    }
    let end = range.end;
    while (end > start && isWhitespaceAt(text, prevCharStart(text, end))) {
      end = prevCharStart(text, end);
    }
    return { start, end, reversed: range.reversed };
  });
  return selectOrUnchanged(ranges, after);
};

/** MSEL-015: moves both ends of every selection of 2 or more characters one character inward. */
export const shrinkBothSides = (text: string, ranges: readonly MselRange[]): MselResult => {
  const after = ranges.map((range): MselRange => {
    const start = nextCharEnd(text, range.start);
    const end = prevCharStart(text, range.end);
    return start <= end && start <= range.end ? { start, end, reversed: range.reversed } : range;
  });
  return selectOrUnchanged(ranges, after);
};

/**
 * The first `delimiter` that starts at or after `from` and ends at or before `to`, or -1. Only
 * `[from, to)` is searched (a line or a part of it), never the rest of the document.
 */
const indexOfWithin = (text: string, delimiter: string, from: number, to: number): number => {
  if (to - from < delimiter.length) {
    return -1;
  }
  const found = text.slice(from, to).indexOf(delimiter);
  return found === -1 ? -1 : from + found;
};

/**
 * MSEL-016: extends the end of every selection up to (not including) the next `delimiter` on the
 * same line. Selections without a delimiter after them do not change; their number is told.
 */
export const extendToDelimiter = (text: string, ranges: readonly MselRange[], delimiter: string): MselResult => {
  assertDelimiter(delimiter);
  const lines = new MselLines(text);
  // The last search, reused while the selections move forward on one line: with no delimiter
  // from `searchFrom` to the line end there is none from a later offset either, and a delimiter
  // at `searchFound` is also the first one from any offset up to it. So many selections on one
  // long line read it about once (the selections are in document order).
  let searchFrom = -1;
  let searchLineEnd = -1;
  let searchFound = -1;
  const find = (from: number, lineEnd: number): number => {
    if (lineEnd !== searchLineEnd || from < searchFrom || (searchFound !== -1 && from > searchFound)) {
      searchFrom = from;
      searchLineEnd = lineEnd;
      searchFound = indexOfWithin(text, delimiter, from, lineEnd);
    }
    return searchFound;
  };
  let notFound = 0;
  const after = ranges.map((range): MselRange => {
    const found = find(range.end, lines.contentEnd(lines.lineOf(range.end)));
    if (found === -1) {
      notFound++;
      return range;
    }
    return { start: range.start, end: found, reversed: range.reversed };
  });
  if (notFound === ranges.length) {
    return { kind: 'warn', message: 'The delimiter was not found after any selection on its line.' };
  }
  const message = notFound > 0
    ? `The delimiter was not found after ${formatNumber(notFound)} of ${formatNumber(ranges.length)} selections; they were not changed.`
    : undefined;
  return selectOrUnchanged(ranges, after, message);
};

// ---------------------------------------------------------------------------
// C: splitting the selections (MSEL-017..019)
// ---------------------------------------------------------------------------

/** Adds the parts of `range` between the `cuts` (sorted, non-overlapping ranges relative to the range). */
const pushParts = (collector: RangeCollector, range: MselRange, cuts: readonly [number, number][]): void => {
  if (cuts.length === 0) {
    collector.push(range.start, range.end);
    return;
  }
  let position = range.start;
  for (const [cutStart, cutEnd] of cuts) {
    collector.push(position, range.start + cutStart);
    position = range.start + cutEnd;
  }
  collector.push(position, range.end);
};

/**
 * MSEL-017: splits every selection at `delimiter` (literal text) into the parts between the
 * delimiters. Empty parts become cursors (so the columns stay in place); a selection without the
 * delimiter stays as it is.
 */
export const splitByDelimiter = (text: string, ranges: readonly MselRange[], delimiter: string): MselResult => {
  assertDelimiter(delimiter);
  const collector = new RangeCollector();
  for (const range of ranges) {
    const value = textOf(text, range);
    const cuts: [number, number][] = [];
    for (let i = value.indexOf(delimiter); i !== -1; i = value.indexOf(delimiter, i + delimiter.length)) {
      if (cuts.length >= MSEL_MAX_SELECTIONS) {
        throw new MselTooManySelectionsError();
      }
      cuts.push([i, i + delimiter.length]);
    }
    pushParts(collector, range, cuts);
  }
  return selectOrUnchanged(ranges, collector.ranges);
};

/**
 * MSEL-018: splits every selection at the matches of the user's regular expression (found by the
 * worker: `[start, end)` per selection, relative to the selection, empty matches excluded).
 */
export const splitByMatches = (ranges: readonly MselRange[], matches: readonly (readonly [number, number][])[]): MselResult => {
  if (matches.length !== ranges.length) {
    throw new Error('The regular expression results do not match the selections');
  }
  const collector = new RangeCollector();
  ranges.forEach((range, i) => pushParts(collector, range, matches[i].filter(([start, end]) => end > start)));
  return selectOrUnchanged(ranges, collector.ranges);
};

const WORD = /[\p{L}\p{M}\p{N}_]+/gu;

/** MSEL-019: splits every selection into one selection per word; selections without words are dropped. */
export const splitWords = (text: string, ranges: readonly MselRange[]): MselResult => {
  const collector = new RangeCollector();
  for (const range of ranges) {
    for (const match of textOf(text, range).matchAll(WORD)) {
      collector.push(range.start + match.index!, range.start + match.index! + match[0].length);
    }
  }
  if (collector.ranges.length === 0) {
    return { kind: 'warn', message: 'No words were found in the selections.' };
  }
  return selectOrUnchanged(ranges, collector.ranges);
};

// ---------------------------------------------------------------------------
// D: cursors on every line (MSEL-020, 021, 030)
// ---------------------------------------------------------------------------

/** The length of the spaces and tabs at the start of `line`. */
const indentLength = (line: string): number => {
  let i = 0;
  while (i < line.length && (line[i] === ' ' || line[i] === '\t')) {
    i++;
  }
  return i;
};

/**
 * MSEL-020: puts a cursor before the first character that is not a space or a tab on every line
 * of the selections. Empty lines and lines of only spaces and tabs are skipped.
 */
export const cursorsToLineContentStart = (text: string, ranges: readonly MselRange[]): MselResult => {
  const lines = new MselLines(text);
  const collector = new RangeCollector();
  for (const line of uniqueCoveredLines(lines, ranges)) {
    const start = lines.start(line);
    const content = text.slice(start, lines.contentEnd(line));
    const indent = indentLength(content);
    if (indent < content.length) {
      collector.push(start + indent, start + indent);
    }
  }
  if (collector.ranges.length === 0) {
    return { kind: 'warn', message: 'No line with text other than spaces and tabs was found.' };
  }
  return selectOrUnchanged(ranges, collector.ranges);
};

/** MSEL-030: selects the spaces and tabs at the start of every line of the selections. */
export const selectIndentation = (text: string, ranges: readonly MselRange[]): MselResult => {
  const lines = new MselLines(text);
  const collector = new RangeCollector();
  for (const line of uniqueCoveredLines(lines, ranges)) {
    const start = lines.start(line);
    const indent = indentLength(text.slice(start, lines.contentEnd(line)));
    if (indent > 0) {
      collector.push(start, start + indent);
    }
  }
  if (collector.ranges.length === 0) {
    return { kind: 'warn', message: 'No indented line was found.' };
  }
  return selectOrUnchanged(ranges, collector.ranges);
};

/**
 * MSEL-021: on every line of the selections, splits the selected part of the line (the whole
 * line for a cursor) at `delimiter` (literal text) and selects column `column` (1-based). Lines
 * with fewer columns are skipped; an empty column becomes a cursor. Quoted CSV is not parsed.
 */
export const selectColumn = (text: string, ranges: readonly MselRange[], delimiter: string, column: number): MselResult => {
  assertDelimiter(delimiter);
  if (!Number.isInteger(column) || column < MSEL_COLUMN_MIN || column > MSEL_COLUMN_MAX) {
    throw new MselInputError(`The column must be an integer from ${formatNumber(MSEL_COLUMN_MIN)} to ${formatNumber(MSEL_COLUMN_MAX)}`);
  }
  const lines = new MselLines(text);
  const collector = new RangeCollector();
  // The lines already done as a whole line (for a cursor): more cursors on it give the same column.
  const wholeLinesDone = new Set<number>();
  for (const range of ranges) {
    const [first, last] = coveredLines(lines, range);
    for (let line = first; line <= last; line++) {
      const isCursor = range.start === range.end;
      if (isCursor) {
        if (wholeLinesDone.has(line)) {
          continue;
        }
        wholeLinesDone.add(line);
      }
      const lineStart = lines.start(line);
      const lineEnd = lines.contentEnd(line);
      const segmentStart = isCursor ? lineStart : Math.max(lineStart, range.start);
      const segmentEnd = isCursor ? lineEnd : Math.min(lineEnd, range.end);
      if (segmentStart > segmentEnd) {
        continue;
      }
      // Every search stays inside the segment, so a line is read at most once.
      let columnStart = segmentStart;
      let index = 1;
      while (index < column) {
        const found = indexOfWithin(text, delimiter, columnStart, segmentEnd);
        if (found === -1) {
          break;
        }
        columnStart = found + delimiter.length;
        index++;
      }
      if (index < column) {
        continue;
      }
      const next = indexOfWithin(text, delimiter, columnStart, segmentEnd);
      collector.push(columnStart, next === -1 ? segmentEnd : next);
    }
  }
  if (collector.ranges.length === 0) {
    return { kind: 'warn', message: `No line has column ${formatNumber(column)}.` };
  }
  return selectOrUnchanged(ranges, dedupeRanges(collector.ranges));
};

/** Sorts ranges and drops exact duplicates (two cursors on one line give the same column). */
const dedupeRanges = (ranges: MselRange[]): MselRange[] => {
  const sorted = [...ranges].sort((a, b) => a.start - b.start || a.end - b.end);
  return sorted.filter((range, i) => i === 0 || range.start !== sorted[i - 1].start || range.end !== sorted[i - 1].end);
};

// ---------------------------------------------------------------------------
// E: selecting inside the selections (MSEL-022..024)
// ---------------------------------------------------------------------------

const NUMBER = /\d+(?:\.\d+)?/g;
/** Characters before a `-` that make it a minus operator rather than a sign. */
const OPERAND_END = /[A-Za-z0-9_)\]]/;

/**
 * MSEL-022: selects every number (`123`, `1.5`) in the selections. A `-` right before the number
 * is included as its sign unless it follows a letter, a digit, `_`, `)` or `]` (`a-1` is a minus).
 */
export const selectNumbers = (text: string, ranges: readonly MselRange[]): MselResult => {
  const collector = new RangeCollector();
  for (const range of ranges) {
    for (const match of textOf(text, range).matchAll(NUMBER)) {
      let start = range.start + match.index!;
      if (start > range.start && text[start - 1] === '-' && (start - 1 === 0 || !OPERAND_END.test(text[start - 2]))) {
        start--;
      }
      collector.push(start, range.start + match.index! + match[0].length);
    }
  }
  if (collector.ranges.length === 0) {
    return { kind: 'warn', message: 'No numbers were found in the selections.' };
  }
  return selectOrUnchanged(ranges, collector.ranges);
};

/**
 * The contents of the quoted strings in `value`: `"…"` and `'…'` on one line, `` `…` `` across
 * lines; a backslash escapes the next character; an unclosed quote is ignored.
 */
export const quotedStrings = (value: string): [number, number][] => {
  const found: [number, number][] = [];
  let i = 0;
  while (i < value.length) {
    const char = value[i];
    if (char === '\\') {
      i += 2;
      continue;
    }
    if (!QUOTES.has(char)) {
      i++;
      continue;
    }
    let j = i + 1;
    let closed = -1;
    while (j < value.length) {
      const inner = value[j];
      if (inner === '\\') {
        j += 2;
        continue;
      }
      if (inner === char) {
        closed = j;
        break;
      }
      if (char !== '`' && (inner === '\n' || inner === '\r')) {
        break;
      }
      j++;
    }
    if (closed === -1) {
      i++;
      continue;
    }
    found.push([i + 1, closed]);
    i = closed + 1;
  }
  return found;
};

/** MSEL-023: selects the contents of every quoted string in the selections. */
export const selectStrings = (text: string, ranges: readonly MselRange[]): MselResult => {
  const collector = new RangeCollector();
  for (const range of ranges) {
    for (const [start, end] of quotedStrings(textOf(text, range))) {
      collector.push(range.start + start, range.start + end);
    }
  }
  if (collector.ranges.length === 0) {
    return { kind: 'warn', message: 'No quoted strings were found in the selections.' };
  }
  return selectOrUnchanged(ranges, collector.ranges);
};

/** The same URL pattern as Extract URL (`dataExtractionHandler.ts`). */
const URL_PATTERN = /https?:\/\/[^\s$.?#].[^\s]*/g;
const TRAILING_PUNCTUATION = new Set(['.', ',', ';', ':', '!', '?', "'", '"']);
const CLOSING_BRACKETS: Record<string, string> = { ')': '(', ']': '[', '}': '{', '>': '<' };
const BRACKET_OPENERS = new Set(Object.values(CLOSING_BRACKETS));

/**
 * The length of `url` without trailing punctuation and closing brackets that have no opener in it.
 * The brackets are counted once and the counts updated as characters are removed (O(length)).
 */
export const trimUrl = (url: string): number => {
  const counts = new Map<string, number>();
  for (const char of url) {
    if (CLOSING_BRACKETS[char] !== undefined || BRACKET_OPENERS.has(char)) {
      counts.set(char, (counts.get(char) ?? 0) + 1);
    }
  }
  let end = url.length;
  while (end > 0) {
    const last = url[end - 1];
    if (TRAILING_PUNCTUATION.has(last)) {
      end--;
      continue;
    }
    const opener = CLOSING_BRACKETS[last];
    const closers = counts.get(last) ?? 0;
    if (opener !== undefined && closers > (counts.get(opener) ?? 0)) {
      counts.set(last, closers - 1);
      end--;
      continue;
    }
    break;
  }
  return end;
};

/** MSEL-024: selects every `http(s)://` URL in the selections (without trailing punctuation). */
export const selectUrls = (text: string, ranges: readonly MselRange[]): MselResult => {
  const collector = new RangeCollector();
  for (const range of ranges) {
    for (const match of textOf(text, range).matchAll(URL_PATTERN)) {
      const length = trimUrl(match[0]);
      const start = range.start + match.index!;
      if (length > 'http://'.length) {
        collector.push(start, start + length);
      }
    }
  }
  if (collector.ranges.length === 0) {
    return { kind: 'warn', message: 'No URLs were found in the selections.' };
  }
  return selectOrUnchanged(ranges, collector.ranges);
};

// ---------------------------------------------------------------------------
// F: exchanging the texts (MSEL-025..028)
// ---------------------------------------------------------------------------

/** Replaces the text of every selection with `texts[i]` in one edit and selects the new texts. */
const replaceTexts = (text: string, ranges: readonly MselRange[], texts: readonly string[]): MselResult => {
  if (ranges.every((range, i) => textOf(text, range) === texts[i])) {
    return { kind: 'unchanged' };
  }
  const total = texts.reduce((sum, value) => sum + value.length, 0);
  if (total > MAX_OUTPUT_LENGTH) {
    return { kind: 'warn', message: `The text was not changed: the result would be longer than ${formatNumber(MAX_OUTPUT_LENGTH)} characters. Select less text.` };
  }
  const edits: MselEdit[] = [];
  const after: MselRange[] = [];
  let shift = 0;
  ranges.forEach((range, i) => {
    edits.push({ start: range.start, end: range.end, text: texts[i] });
    const start = range.start + shift;
    after.push({ start, end: start + texts[i].length });
    shift += texts[i].length - (range.end - range.start);
  });
  return { kind: 'edit', edits, ranges: after };
};

/** MSEL-025: moves every text to the next selection (the last one to the first). */
export const rotateForward = (text: string, ranges: readonly MselRange[]): MselResult => {
  const tooFew = needTwo(ranges);
  if (tooFew) {
    return tooFew;
  }
  const texts = ranges.map((range) => textOf(text, range));
  return replaceTexts(text, ranges, texts.map((_value, i) => texts[(i - 1 + texts.length) % texts.length]));
};

/** MSEL-026: moves every text to the previous selection (the first one to the last). */
export const rotateBackward = (text: string, ranges: readonly MselRange[]): MselResult => {
  const tooFew = needTwo(ranges);
  if (tooFew) {
    return tooFew;
  }
  const texts = ranges.map((range) => textOf(text, range));
  return replaceTexts(text, ranges, texts.map((_value, i) => texts[(i + 1) % texts.length]));
};

/** MSEL-027: exchanges the texts of exactly two selections. */
export const swapTwo = (text: string, ranges: readonly MselRange[]): MselResult => {
  if (ranges.length !== 2) {
    return { kind: 'warn', message: MSEL_NEED_EXACTLY_TWO };
  }
  return replaceTexts(text, ranges, [textOf(text, ranges[1]), textOf(text, ranges[0])]);
};

/** MSEL-028: writes the text of the first selection into every other selection. */
export const copyFirstToAll = (text: string, ranges: readonly MselRange[]): MselResult => {
  const tooFew = needTwo(ranges);
  if (tooFew) {
    return tooFew;
  }
  const first = textOf(text, ranges[0]);
  return replaceTexts(text, ranges, ranges.map(() => first));
};

// ---------------------------------------------------------------------------
// G: information (MSEL-029)
// ---------------------------------------------------------------------------

/**
 * MSEL-029: `N selections: L<line> (<characters>), …` (lines 1-based, characters in code points
 * with a CRLF as one). At most `MSEL_INFO_MAX_LISTED` selections are listed.
 */
export const selectionInfo = (text: string, ranges: readonly MselRange[]): MselResult => {
  const lines = new MselLines(text);
  const listed = ranges.slice(0, MSEL_INFO_MAX_LISTED)
    .map((range) => `L${formatNumber(lines.lineOf(range.start) + 1)} (${formatNumber(countChars(textOf(text, range)))})`);
  const more = ranges.length > MSEL_INFO_MAX_LISTED ? `, … (+${formatNumber(ranges.length - MSEL_INFO_MAX_LISTED)} more)` : '';
  const count = ranges.length === 1 ? '1 selection' : `${formatNumber(ranges.length)} selections`;
  return { kind: 'info', message: `${count}: ${listed.join(', ')}${more}` };
};

// ---------------------------------------------------------------------------
// Command table
// ---------------------------------------------------------------------------

/** Everything a command may use: made once per run by the handler. */
export interface MselContext {
  /** The whole document text. */
  text: string;
  /** The selections in document order. */
  ranges: readonly MselRange[];
  /** The values entered, in the order of the command's `inputs` (validated). */
  inputs: readonly string[];
  /** `editor.options.tabSize` (MSEL-010). */
  tabSize: number;
  /** MSEL-011: the word at an offset. */
  wordAt: MselWordAt;
  /** MSEL-006 / 007: whether each selection's text matched the user's regular expression. */
  regexMatches?: readonly boolean[];
  /** MSEL-018: the non-empty matches in each selection's text (relative offsets). */
  regexSplits?: readonly (readonly [number, number][])[];
}

/** One input box of a command. */
export interface MselInputStep {
  prompt: string;
  placeHolder?: string;
  value?: string;
  validate: (value: string) => string | undefined;
}

/** When the command appears in the command palette and the context submenu. */
export type MselWhen = 'multi' | 'selection' | 'always';

export const MSEL_WHEN_CLAUSES: Record<MselWhen, string | undefined> = {
  multi: 'editorHasMultipleSelections',
  selection: 'editorHasSelection',
  always: undefined,
};

export interface MselCommandEntry {
  /** ROADMAP ID (MSEL-001…). */
  id: string;
  /** Command name without `selection-manipulator.`. */
  name: string;
  title: string;
  when: MselWhen;
  /** Whether the command edits the text (the rest only change the selections or notify). */
  edits?: boolean;
  /** The command needs two or more selections (checked before any input box). */
  needsTwo?: boolean;
  /** Input boxes shown before running, in order. */
  inputs?: MselInputStep[];
  /** The user's regular expression is the first input and is run in the worker in this mode. */
  regex?: 'test' | 'split';
  run: (context: MselContext) => MselResult;
}

const regexStep = (prompt: string): MselInputStep => ({
  prompt: `${prompt} (JavaScript syntax with the "u" flag, case-sensitive, up to ${formatNumber(LINE_REGEX_PATTERN_MAX_LENGTH)} characters)`,
  placeHolder: 'e.g. \\d+',
  validate: validateLineRegexInput,
});

const delimiterStep = (prompt: string, value?: string): MselInputStep => ({
  prompt: `${prompt} (literal text, 1 to ${formatNumber(LINE_JOIN_DELIMITER_MAX_LENGTH)} characters)`,
  value,
  validate: validateMselDelimiterInput,
});

const integerOf = (value: string): number => Number(value.trim());

export const MSEL_COMMAND_ENTRIES: readonly MselCommandEntry[] = [
  {
    id: 'MSEL-001', name: 'selection.keep-odd', title: 'Selection - Keep Odd Selections', when: 'multi', needsTwo: true,
    run: ({ ranges }) => keepOdd(ranges),
  },
  {
    id: 'MSEL-002', name: 'selection.keep-even', title: 'Selection - Keep Even Selections', when: 'multi', needsTwo: true,
    run: ({ ranges }) => keepEven(ranges),
  },
  {
    id: 'MSEL-003', name: 'selection.keep-every-nth', title: 'Selection - Keep Every Nth Selection', when: 'multi', needsTwo: true,
    inputs: [{ prompt: 'Keep every Nth selection: N (1-1,000,000)', value: '2', validate: validateLineCountInput }],
    run: ({ ranges, inputs }) => keepEveryNth(ranges, integerOf(inputs[0])),
  },
  {
    id: 'MSEL-004', name: 'selection.remove-first', title: 'Selection - Remove First Selection', when: 'multi', needsTwo: true,
    run: ({ ranges }) => removeFirst(ranges),
  },
  {
    id: 'MSEL-005', name: 'selection.remove-last', title: 'Selection - Remove Last Selection', when: 'multi', needsTwo: true,
    run: ({ ranges }) => removeLast(ranges),
  },
  {
    id: 'MSEL-006', name: 'selection.keep-matching', title: 'Selection - Keep Selections Matching Regex', when: 'multi',
    inputs: [regexStep('Keep the selections matching this regular expression')], regex: 'test',
    run: ({ ranges, regexMatches }) => filterByMatches(ranges, regexMatches ?? [], true),
  },
  {
    id: 'MSEL-007', name: 'selection.remove-matching', title: 'Selection - Remove Selections Matching Regex', when: 'multi',
    inputs: [regexStep('Remove the selections matching this regular expression')], regex: 'test',
    run: ({ ranges, regexMatches }) => filterByMatches(ranges, regexMatches ?? [], false),
  },
  {
    id: 'MSEL-008', name: 'selection.remove-empty', title: 'Selection - Remove Empty Selections', when: 'multi',
    run: ({ ranges }) => removeEmpty(ranges),
  },
  {
    id: 'MSEL-009', name: 'selection.remove-duplicate-text', title: 'Selection - Deselect Duplicate Texts', when: 'multi', needsTwo: true,
    run: ({ text, ranges }) => removeDuplicateText(text, ranges),
  },
  {
    id: 'MSEL-010', name: 'selection.align-cursors', title: 'Selection - Align Cursors', when: 'multi', needsTwo: true, edits: true,
    run: ({ text, ranges, tabSize }) => alignCursors(text, ranges, tabSize),
  },
  {
    id: 'MSEL-011', name: 'selection.expand-to-word', title: 'Selection - Expand to Word', when: 'always',
    run: ({ ranges, wordAt }) => expandToWord(ranges, wordAt),
  },
  {
    id: 'MSEL-012', name: 'selection.expand-to-quotes', title: 'Selection - Expand to Inside Quotes', when: 'always',
    run: ({ text, ranges }) => expandToQuotes(text, ranges),
  },
  {
    id: 'MSEL-013', name: 'selection.expand-to-brackets', title: 'Selection - Expand to Inside Brackets', when: 'always',
    run: ({ text, ranges }) => expandToBrackets(text, ranges),
  },
  {
    id: 'MSEL-014', name: 'selection.trim', title: 'Selection - Trim Whitespace from Selections', when: 'selection',
    run: ({ text, ranges }) => trimSelections(text, ranges),
  },
  {
    id: 'MSEL-015', name: 'selection.shrink-both-sides', title: 'Selection - Shrink Selections by One Character', when: 'selection',
    run: ({ text, ranges }) => shrinkBothSides(text, ranges),
  },
  {
    id: 'MSEL-016', name: 'selection.extend-to-delimiter', title: 'Selection - Extend to Next Delimiter', when: 'selection',
    inputs: [delimiterStep('Extend each selection up to this delimiter on its line')],
    run: ({ text, ranges, inputs }) => extendToDelimiter(text, ranges, inputs[0]),
  },
  {
    id: 'MSEL-017', name: 'selection.split-by-delimiter', title: 'Selection - Split Selections by Delimiter', when: 'selection',
    inputs: [delimiterStep('Split the selections at this delimiter')],
    run: ({ text, ranges, inputs }) => splitByDelimiter(text, ranges, inputs[0]),
  },
  {
    id: 'MSEL-018', name: 'selection.split-by-regex', title: 'Selection - Split Selections by Regex', when: 'selection',
    inputs: [regexStep('Split the selections at the matches of this regular expression')], regex: 'split',
    run: ({ ranges, regexSplits }) => splitByMatches(ranges, regexSplits ?? []),
  },
  {
    id: 'MSEL-019', name: 'selection.split-words', title: 'Selection - Split into Words', when: 'selection',
    run: ({ text, ranges }) => splitWords(text, ranges),
  },
  {
    id: 'MSEL-020', name: 'selection.cursor-to-line-content-start', title: 'Selection - Cursors to First Non-whitespace', when: 'always',
    run: ({ text, ranges }) => cursorsToLineContentStart(text, ranges),
  },
  {
    id: 'MSEL-021', name: 'selection.select-column', title: 'Selection - Select Column N', when: 'selection',
    inputs: [
      delimiterStep('Column delimiter', ','),
      {
        prompt: `Column number N (${formatNumber(MSEL_COLUMN_MIN)}-${formatNumber(MSEL_COLUMN_MAX)})`,
        value: '1',
        validate: validateLineWidthInput,
      },
    ],
    run: ({ text, ranges, inputs }) => selectColumn(text, ranges, inputs[0], integerOf(inputs[1])),
  },
  {
    id: 'MSEL-022', name: 'selection.select-numbers', title: 'Selection - Select All Numbers', when: 'selection',
    run: ({ text, ranges }) => selectNumbers(text, ranges),
  },
  {
    id: 'MSEL-023', name: 'selection.select-strings', title: 'Selection - Select All Quoted Strings', when: 'selection',
    run: ({ text, ranges }) => selectStrings(text, ranges),
  },
  {
    id: 'MSEL-024', name: 'selection.select-urls', title: 'Selection - Select All URLs', when: 'selection',
    run: ({ text, ranges }) => selectUrls(text, ranges),
  },
  {
    id: 'MSEL-025', name: 'selection.rotate-forward', title: 'Selection - Rotate Texts Forward', when: 'multi', needsTwo: true, edits: true,
    run: ({ text, ranges }) => rotateForward(text, ranges),
  },
  {
    id: 'MSEL-026', name: 'selection.rotate-backward', title: 'Selection - Rotate Texts Backward', when: 'multi', needsTwo: true, edits: true,
    run: ({ text, ranges }) => rotateBackward(text, ranges),
  },
  {
    id: 'MSEL-027', name: 'selection.swap-two', title: 'Selection - Swap Two Selections', when: 'multi', needsTwo: true, edits: true,
    run: ({ text, ranges }) => swapTwo(text, ranges),
  },
  {
    id: 'MSEL-028', name: 'selection.copy-first-to-all', title: 'Selection - Copy First Selection to All', when: 'multi', needsTwo: true, edits: true,
    run: ({ text, ranges }) => copyFirstToAll(text, ranges),
  },
  {
    id: 'MSEL-029', name: 'selection.info', title: 'Selection - Show Selection Info', when: 'always',
    run: ({ text, ranges }) => selectionInfo(text, ranges),
  },
  {
    id: 'MSEL-030', name: 'selection.select-indentation', title: 'Selection - Select Leading Indentation', when: 'always',
    run: ({ text, ranges }) => selectIndentation(text, ranges),
  },
];
