/**
 * Pure (vscode-independent) integer and list functions of the NUMX-012..017 commands (group NUM2):
 * the greatest common divisor and the least common multiple (BigInt), prime factorization, the
 * differences between consecutive numbers, and collapsing / expanding integer ranges.
 *
 * Limits (SECURITY.md, output and computation bounds): each integer of gcd / lcm has at most
 * NUM_MAX_BASE_DIGITS digits (counted before BigInt reads it) and the lcm stops as soon as it has
 * more than NUM2_MAX_LCM_DIGITS digits; prime factorization only takes safe integers and stops
 * when the trial divisions of one run exceed NUM2_MAX_FACTOR_WORK; a range list is refused before
 * anything is generated when it expands to more than NUM2_MAX_EXPANDED integers. The range lists
 * are read with a linear scan, never with a regular expression built from the text.
 */
import {
  assertNumInputLength,
  extractNumbers,
  extractNumberTokens,
  formatA,
  NumInputError,
  NumLimitError,
  NumNoNumbersError,
  NumOutputBuffer,
  NUM_MAX_BASE_DIGITS,
  quoteText,
  trimLeadingZeros,
} from './numCommon';
import { NumRun } from './numTransforms';

/** NUMX-013: upper limit of the digits of the least common multiple. */
export const NUM2_MAX_LCM_DIGITS = 1_000;
/** NUMX-014: upper limit of the trial divisions of one run (all selections and lines together). */
export const NUM2_MAX_FACTOR_WORK = 100_000_000;
/** NUMX-017: upper limit of the integers a range list expands to. */
export const NUM2_MAX_EXPANDED = 10_000;

const SIGNED_INTEGER = /^[-+]?(\d+)$/;

// ---------------------------------------------------------------------------------------------
// NUMX-012 / 013: greatest common divisor and least common multiple
// ---------------------------------------------------------------------------------------------

/**
 * The absolute values of the integer tokens of a selection (`NumNoNumbersError` without any). A
 * decimal or exponent token is not an integer; the digits are counted before BigInt reads them.
 */
const integersOf = (text: string): bigint[] => {
  const tokens = extractNumberTokens(text);
  if (tokens.length === 0) {
    throw new NumNoNumbersError();
  }
  return tokens.map((token) => {
    const match = SIGNED_INTEGER.exec(token);
    if (!match) {
      throw new NumInputError(`${quoteText(token)} is not an integer`);
    }
    const digits = trimLeadingZeros(match[1]);
    if (digits.length > NUM_MAX_BASE_DIGITS) {
      throw new NumInputError(`the number has more than ${NUM_MAX_BASE_DIGITS.toLocaleString('en-US')} digits`);
    }
    return BigInt(digits);
  });
};

const gcdOf = (a: bigint, b: bigint): bigint => {
  let [x, y] = [a, b];
  while (y !== 0n) {
    [x, y] = [y, x % y];
  }
  return x;
};

/** NUMX-012: the greatest common divisor of the integers (absolute values; gcd(0, a) = |a|, all 0 → 0). */
export const greatestCommonDivisor = (text: string): string => {
  let result = 0n;
  for (const n of integersOf(text)) {
    if (result === 1n) {
      break;
    }
    result = gcdOf(result, n);
  }
  return result.toString();
};

const LCM_LIMIT = 10n ** BigInt(NUM2_MAX_LCM_DIGITS);

/** NUMX-013: the least common multiple of the integers (absolute values; any 0 → 0), at most NUM2_MAX_LCM_DIGITS digits. */
export const leastCommonMultiple = (text: string): string => {
  const integers = integersOf(text);
  if (integers.some((n) => n === 0n)) {
    return '0';
  }
  let result = 1n;
  for (const n of integers) {
    // A divisor of the result so far (often the case with many small integers) changes nothing:
    // skip the gcd, division and multiplication of a large result.
    if (result % n === 0n) {
      continue;
    }
    result = result / gcdOf(result, n) * n;
    if (result >= LCM_LIMIT) {
      throw new NumInputError(`the result has more than ${NUM2_MAX_LCM_DIGITS.toLocaleString('en-US')} digits`);
    }
  }
  return result.toString();
};

// ---------------------------------------------------------------------------------------------
// NUMX-014: prime factorization
// ---------------------------------------------------------------------------------------------

const UNSIGNED_INTEGER = /^\+?(\d+)$/;

/**
 * NUMX-014: the prime factors of an integer from 2 to 2^53 − 1 (`360` → `2^3 × 3^2 × 5`, a prime
 * as it is). Trial division by 2, 3 and 6k ± 1 up to √n; every division is counted in `run.work`,
 * and more than NUM2_MAX_FACTOR_WORK divisions in one run is an error.
 *
 * `Number.isInteger(rest / p)` is an exact divisibility test here: when p does not divide rest,
 * rest / p is at least 1/p away from an integer, more than half a unit in the last place of the
 * quotient for any rest < 2^53, so the division cannot round to an integer. It is much faster than
 * the floating-point `%`.
 */
export const primeFactors = (value: string, run: NumRun): string => {
  const match = UNSIGNED_INTEGER.exec(value);
  const digits = match ? trimLeadingZeros(match[1]) : '';
  const n = digits.length > 0 && digits.length <= 16 ? Number(digits) : 0;
  if (n < 2 || !Number.isSafeInteger(n)) {
    throw new NumInputError(`${quoteText(value)} is not an integer from 2 to ${Number.MAX_SAFE_INTEGER}`);
  }
  const factors: string[] = [];
  let rest = n;
  const divideOut = (p: number): void => {
    let exponent = 0;
    while (Number.isInteger(rest / p)) {
      rest /= p;
      exponent++;
    }
    if (exponent > 0) {
      factors.push(exponent === 1 ? String(p) : `${p}^${exponent}`);
    }
  };
  const tooMuchWork = (): NumInputError => new NumInputError(
    `the factorization needs more than ${NUM2_MAX_FACTOR_WORK.toLocaleString('en-US')} trial divisions; select fewer or smaller numbers`);
  divideOut(2);
  divideOut(3);
  // Two divisions per step; the limit is checked every 65,536 steps so that it costs nothing in the loop.
  let steps = 0;
  for (let p = 5; p * p <= rest; p += 6) {
    steps++;
    if ((steps & 0xffff) === 0 && run.work + 2 + steps * 2 > NUM2_MAX_FACTOR_WORK) {
      throw tooMuchWork();
    }
    if (Number.isInteger(rest / p)) {
      divideOut(p);
    }
    if (Number.isInteger(rest / (p + 2))) {
      divideOut(p + 2);
    }
  }
  run.work += 2 + steps * 2;
  if (run.work > NUM2_MAX_FACTOR_WORK) {
    throw tooMuchWork();
  }
  if (rest > 1) {
    factors.push(String(rest));
  }
  return factors.join(' × ');
};

// ---------------------------------------------------------------------------------------------
// NUMX-015: differences between consecutive numbers
// ---------------------------------------------------------------------------------------------

/**
 * NUMX-015: the differences between consecutive number tokens (rule A), separated by the first line
 * break of the selection (CRLF / LF) when it has one, otherwise by a space (`1 4 9` → `3 5`).
 */
export const differences = (text: string, budget: number): string => {
  const numbers = extractNumbers(text);
  if (numbers.length < 2) {
    throw new NumInputError(`at least 2 numbers are needed (found ${numbers.length})`);
  }
  const newline = text.indexOf('\n');
  const separator = newline === -1 ? ' ' : newline > 0 && text.charCodeAt(newline - 1) === 0x0d ? '\r\n' : '\n';
  const output = new NumOutputBuffer(budget);
  for (let i = 1; i < numbers.length; i++) {
    if (i > 1) {
      output.push(separator);
    }
    output.push(formatA(numbers[i] - numbers[i - 1]));
  }
  return output.join();
};

// ---------------------------------------------------------------------------------------------
// NUMX-016 / 017: integer ranges
// ---------------------------------------------------------------------------------------------

/** Space, tab, comma, CR and LF separate the items of a range list. */
const isSeparator = (code: number): boolean => code === 0x20 || code === 0x09 || code === 0x2c || code === 0x0d || code === 0x0a;
const isSpaceOrTab = (code: number): boolean => code === 0x20 || code === 0x09;
const isDigit = (code: number): boolean => code >= 0x30 && code <= 0x39;

/** A run of digits as a safe integer (or an error naming `item`). */
const safeIntegerOf = (digits: string, item: string): number => {
  const trimmed = trimLeadingZeros(digits);
  const n = trimmed.length <= 16 ? Number(trimmed) : Infinity;
  if (!Number.isSafeInteger(n)) {
    throw new NumInputError(`${quoteText(item)} is larger than ${Number.MAX_SAFE_INTEGER}`);
  }
  return n;
};

/** The end of the item that goes on at `from`: the index of the next separator (or the end of the text). */
const itemEnd = (text: string, from: number): number => {
  let end = from;
  while (end < text.length && !isSeparator(text.charCodeAt(end))) {
    end++;
  }
  return end;
};

/** The item that starts at `start`: everything up to the next separator (for messages). */
const itemAt = (text: string, start: number): string => text.slice(start, itemEnd(text, start));

/** NUMX-016: integers ≥ 0 separated by spaces, tabs, commas or line breaks, sorted, unique, as ranges (`1 2 3 5 7 8` → `1-3, 5, 7-8`). */
export const collapseRanges = (text: string, budget: number): string => {
  assertNumInputLength(text);
  const values: number[] = [];
  let i = 0;
  while (i < text.length) {
    if (isSeparator(text.charCodeAt(i))) {
      i++;
      continue;
    }
    const item = itemAt(text, i);
    if (!/^\d+$/.test(item)) {
      throw new NumInputError(`${quoteText(item)} is not an integer of 0 or more`);
    }
    values.push(safeIntegerOf(item, item));
    i += item.length;
  }
  if (values.length === 0) {
    throw new NumInputError('no integers found');
  }
  const sorted = Float64Array.from(values).sort();
  const output = new NumOutputBuffer(budget);
  let start = 0;
  for (let j = 1; j <= sorted.length; j++) {
    if (j < sorted.length && sorted[j] - sorted[j - 1] <= 1) {
      continue;
    }
    if (start > 0) {
      output.push(', ');
    }
    output.push(sorted[j - 1] === sorted[start] ? String(sorted[start]) : `${sorted[start]}-${sorted[j - 1]}`);
    start = j;
  }
  return output.join();
};

/**
 * NUMX-017: integers and ranges `a-b` (0 ≤ a ≤ b, spaces / tabs allowed around the dash) separated
 * by spaces, tabs, commas or line breaks, expanded in the order written (duplicates kept) and joined
 * with `, ` (`1-3, 5` → `1, 2, 3, 5`). Read with one linear scan. More than NUM2_MAX_EXPANDED
 * integers is refused (a warning) before anything is generated.
 */
export const expandRanges = (text: string, budget: number): string => {
  assertNumInputLength(text);
  const ranges: [number, number][] = [];
  let total = 0;
  let i = 0;
  /**
   * The item from `start` up to the next separator at or after `at`, where the reading failed: a
   * range with spaces around its dash (`1 - x`, `1 -`, `1 - 3x`) is quoted whole, not just `1`.
   */
  const notARange = (start: number, at: number): NumInputError => {
    let end = itemEnd(text, at);
    // Trailing spaces / tabs (`1 - ` before a comma) are left out with a loop, not a regular expression.
    while (end > start && isSpaceOrTab(text.charCodeAt(end - 1))) {
      end--;
    }
    return new NumInputError(`${quoteText(text.slice(start, end))} is not an integer or a range such as 1-3`);
  };
  const readDigits = (): string => {
    const start = i;
    while (i < text.length && isDigit(text.charCodeAt(i))) {
      i++;
    }
    return text.slice(start, i);
  };
  while (i < text.length) {
    if (isSeparator(text.charCodeAt(i))) {
      i++;
      continue;
    }
    const itemStart = i;
    if (!isDigit(text.charCodeAt(i))) {
      throw notARange(itemStart, i);
    }
    const first = readDigits();
    let j = i;
    while (j < text.length && isSpaceOrTab(text.charCodeAt(j))) {
      j++;
    }
    let range: [number, number];
    if (j < text.length && text.charCodeAt(j) === 0x2d) {
      i = j + 1;
      while (i < text.length && isSpaceOrTab(text.charCodeAt(i))) {
        i++;
      }
      if (i >= text.length || !isDigit(text.charCodeAt(i))) {
        throw notARange(itemStart, i);
      }
      const last = readDigits();
      const item = text.slice(itemStart, i);
      range = [safeIntegerOf(first, item), safeIntegerOf(last, item)];
      if (range[0] > range[1]) {
        throw new NumInputError(`${quoteText(item)} starts after it ends`);
      }
    } else {
      const n = safeIntegerOf(first, first);
      range = [n, n];
    }
    if (i < text.length && !isSeparator(text.charCodeAt(i))) {
      throw notARange(itemStart, i);
    }
    total += range[1] - range[0] + 1;
    if (total > NUM2_MAX_EXPANDED) {
      throw new NumLimitError(`the ranges expand to more than ${NUM2_MAX_EXPANDED.toLocaleString('en-US')} integers`);
    }
    ranges.push(range);
  }
  if (ranges.length === 0) {
    throw new NumInputError('no integers or ranges found');
  }
  const output = new NumOutputBuffer(budget);
  let first = true;
  for (const [start, end] of ranges) {
    for (let n = start; n <= end; n++) {
      output.push(first ? String(n) : `, ${n}`);
      first = false;
    }
  }
  return output.join();
};
