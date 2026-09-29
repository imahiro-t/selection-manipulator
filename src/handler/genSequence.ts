/**
 * Pure (vscode-independent) part of the GEN-020..030 sequence and generator commands: one
 * function per command and the parsers of the values typed into the input boxes.
 *
 * A sequence is made as "the value of the `index`-th target" (0 for the first in document order),
 * so the value of every target is known without the others. Whether the sequence is long enough
 * for all targets is checked before anything is generated (`check…` functions, used as the
 * `precheck` of the command table), so that an overflow changes nothing.
 *
 * Only local processing: no network, files or processes, no `eval` / `new Function`, no new
 * dependency, no floating-point arithmetic on the values (all are safe integers). GEN-029 takes
 * its UUID from `GenRandom` (crypto in the extension).
 */
import { civilFromDays, daysFromCivil, formatCivil, isValidDate, localCivilOf, MAX_YEAR } from './dateCommon';
import {
  formatCount,
  GEN_MAX_CIRCLED,
  GEN_MAX_HEX_DIGITS,
  GEN_MAX_RANGE_TERMS,
  GEN_MAX_REPEAT_PATTERN,
  GEN_MAX_REPEAT_WIDTH,
  GEN_MAX_ROMAN,
  GEN_MAX_RULER_WIDTH,
  GenInputError,
  GenOutputBuffer,
  GenRandom,
} from './genCommon';

/** Refuses more targets than a sequence has values; `what` names the sequence. */
const assertSequenceLength = (count: number, max: number, what: string): void => {
  if (count > max) {
    throw new GenInputError(`there are ${formatCount(count)} selections and cursors, but ${what} has only ${formatCount(max)} values`);
  }
};

// ---------------------------------------------------------------------------------------------
// GEN-020 Alphabet Sequence
// ---------------------------------------------------------------------------------------------

/** GEN-020: `a, b, …, z, aa, ab, …` (bijective base 26, lower case) for index 0, 1, 2, … */
export const alphaSequence = (index: number): string => {
  let n = index + 1;
  let result = '';
  while (n > 0) {
    n -= 1;
    result = String.fromCharCode(0x61 + (n % 26)) + result;
    n = Math.floor(n / 26);
  }
  return result;
};

// ---------------------------------------------------------------------------------------------
// GEN-021 Roman Numeral Sequence
// ---------------------------------------------------------------------------------------------

const ROMAN: readonly [number, string][] = [
  [1000, 'M'], [900, 'CM'], [500, 'D'], [400, 'CD'], [100, 'C'], [90, 'XC'],
  [50, 'L'], [40, 'XL'], [10, 'X'], [9, 'IX'], [5, 'V'], [4, 'IV'], [1, 'I'],
];

/** The Roman numeral of `n` (1 to 3,999). */
export const toRoman = (n: number): string => {
  if (!Number.isInteger(n) || n < 1 || n > GEN_MAX_ROMAN) {
    throw new RangeError('Roman numerals are made for 1 to 3999 only');
  }
  let rest = n;
  let result = '';
  for (const [value, symbol] of ROMAN) {
    while (rest >= value) {
      result += symbol;
      rest -= value;
    }
  }
  return result;
};

/** GEN-021: `I, II, III, …` for index 0, 1, 2, … */
export const romanSequence = (index: number): string => toRoman(index + 1);

/** GEN-021: at most 3,999 targets. */
export const checkRomanCount = (count: number): void =>
  assertSequenceLength(count, GEN_MAX_ROMAN, 'the Roman numeral sequence (I to MMMCMXCIX)');

// ---------------------------------------------------------------------------------------------
// GEN-022 Date Sequence
// ---------------------------------------------------------------------------------------------

const DATE = /^(\d{4})-(\d{2})-(\d{2})$/;
const LAST_DAY = daysFromCivil(MAX_YEAR, 12, 31);

/** GEN-022: reads the first date `YYYY-MM-DD` (0001-01-01 to 9999-12-31) as a day number. */
export const parseStartDate = (text: string): number => {
  const match = DATE.exec(text.trim());
  if (!match) {
    throw new GenInputError('enter a date such as 2026-09-28 (YYYY-MM-DD)');
  }
  const [year, month, day] = match.slice(1).map(Number);
  if (!isValidDate(year, month, day)) {
    throw new GenInputError('the date must be a valid date from 0001-01-01 to 9999-12-31');
  }
  return daysFromCivil(year, month, day);
};

/** GEN-022: the default first date, today (local time). */
export const defaultStartDate = (now: Date): string => formatCivil(localCivilOf(now));

/** GEN-022: the last date of `count` targets must not be after 9999-12-31. */
export const checkDateSequence = (first: number, count: number): void => {
  if (count > 0 && first + count - 1 > LAST_DAY) {
    throw new GenInputError(`the dates would go past 9999-12-31 (${formatCount(count)} selections and cursors from ${formatCivil(civilFromDays(first))})`);
  }
};

/** GEN-022: the date `index` days after the first. */
export const dateSequence = (first: number, index: number): string => formatCivil(civilFromDays(first + index));

// ---------------------------------------------------------------------------------------------
// GEN-023 Number Range
// ---------------------------------------------------------------------------------------------

export interface NumberRange {
  start: number;
  step: number;
  /** The number of terms (1 to GEN_MAX_RANGE_TERMS). */
  terms: number;
}

const NUMBER_RANGE = /^([-+]?\d+)\s*\.\.\s*([-+]?\d+)(?:\s*step\s*([-+]?\d+))?$/i;

const safeInteger = (digits: string, what: string): number => {
  const value = Number(digits);
  if (!Number.isSafeInteger(value)) {
    throw new GenInputError(`${what} must be an integer from -${Number.MAX_SAFE_INTEGER} to ${Number.MAX_SAFE_INTEGER}`);
  }
  return value === 0 ? 0 : value;
};

/**
 * GEN-023: reads `start..end` or `start..end step s` (integers; `step` in any case, spaces
 * allowed). Without a step the numbers go up by 1, or down by 1 when start > end; a step of 0 or
 * one that goes the other way is an error. The last term is the last one not beyond `end`.
 */
export const parseNumberRange = (text: string): NumberRange => {
  const match = NUMBER_RANGE.exec(text.trim());
  if (!match) {
    throw new GenInputError('enter a range of integers such as 1..10 or 1..10 step 3');
  }
  const start = safeInteger(match[1], 'the start');
  const end = safeInteger(match[2], 'the end');
  const step = match[3] === undefined ? (start > end ? -1 : 1) : safeInteger(match[3], 'the step');
  if (step === 0) {
    throw new GenInputError('the step must not be 0');
  }
  if ((end > start && step < 0) || (end < start && step > 0)) {
    throw new GenInputError(`the step must be ${end > start ? 'positive' : 'negative'} to go from ${start} to ${end}`);
  }
  // |end − start| may be rounded when it is above 2^53, but then the count is far above the limit.
  const terms = Math.floor(Math.abs(end - start) / Math.abs(step)) + 1;
  if (terms > GEN_MAX_RANGE_TERMS) {
    throw new GenInputError(`the range has more than ${formatCount(GEN_MAX_RANGE_TERMS)} numbers`);
  }
  return { start, step, terms };
};

/** GEN-023: the numbers of the range, one per line (joined with `eol`), within `budget`. */
export const numberRange = (range: NumberRange, eol: string, budget: number): string => {
  const output = new GenOutputBuffer(budget);
  for (let i = 0; i < range.terms; i++) {
    // Every term lies between start and end (safe integers), so it is exact.
    output.push(`${i === 0 ? '' : eol}${range.start + i * range.step}`);
  }
  return output.join();
};

// ---------------------------------------------------------------------------------------------
// GEN-024 Repeat Character to Width
// ---------------------------------------------------------------------------------------------

/** Line breaks, other control characters and lone surrogates cannot be repeated. */
const NOT_REPEATABLE = /[\u0000-\u001f\u007f-\u009f\u2028\u2029]|[\ud800-\udbff](?![\udc00-\udfff])|(?<![\ud800-\udbff])[\udc00-\udfff]/;

/**
 * GEN-024: reads the characters to repeat, as typed (spaces included): 1 to 16 characters (code
 * points), no line breaks or control characters. Returns them as code points.
 */
export const parseRepeatPattern = (text: string): string[] => {
  const chars = Array.from(text);
  if (chars.length < 1 || chars.length > GEN_MAX_REPEAT_PATTERN) {
    throw new GenInputError(`enter 1 to ${GEN_MAX_REPEAT_PATTERN} characters to repeat`);
  }
  if (NOT_REPEATABLE.test(text)) {
    throw new GenInputError('the characters must not include line breaks, tabs or other control characters');
  }
  return chars;
};

/** GEN-024: `pattern` repeated and cut to exactly `width` characters (code points). */
export const repeatToWidth = (pattern: readonly string[], width: number): string => {
  if (!Number.isSafeInteger(width) || width < 1 || width > GEN_MAX_REPEAT_WIDTH || pattern.length === 0) {
    throw new RangeError('invalid width or pattern');
  }
  let result = pattern.join('').repeat(Math.floor(width / pattern.length));
  for (let i = 0; i < width % pattern.length; i++) {
    result += pattern[i];
  }
  return result;
};

// ---------------------------------------------------------------------------------------------
// GEN-025 Hex Sequence
// ---------------------------------------------------------------------------------------------

export interface HexStart {
  value: number;
  /** `0x`, `0X` or ''. */
  prefix: string;
  /** The number of digits typed (the zero-padded width). */
  width: number;
  upper: boolean;
}

const HEX = /^(0[xX])?([0-9A-Fa-f]+)$/;

/**
 * GEN-025: reads the first value (`0x0A`, `0A`, `ff`, …; 1 to 13 digits). The prefix, the width and
 * the case of the letters are kept: lower case only when the value has lower-case letters and no
 * upper-case ones, upper case otherwise (also when it has no letters).
 */
export const parseHexStart = (text: string): HexStart => {
  const match = HEX.exec(text.trim());
  if (!match) {
    throw new GenInputError('enter a hexadecimal number such as 0x0A, 0A or ff');
  }
  const digits = match[2];
  if (digits.length > GEN_MAX_HEX_DIGITS) {
    throw new GenInputError(`the number must have at most ${GEN_MAX_HEX_DIGITS} hexadecimal digits`);
  }
  const lower = /[a-f]/.test(digits) && !/[A-F]/.test(digits);
  return { value: parseInt(digits, 16), prefix: match[1] ?? '', width: digits.length, upper: !lower };
};

/** GEN-025: the last value of `count` targets must not exceed 2^53 − 1. */
export const checkHexSequence = (start: HexStart, count: number): void => {
  if (count > 0 && start.value > Number.MAX_SAFE_INTEGER - (count - 1)) {
    throw new GenInputError(`the numbers would exceed ${Number.MAX_SAFE_INTEGER.toString(16).toUpperCase()} (hexadecimal)`);
  }
};

/** GEN-025: the value `index` after the first, in the format of the first. */
export const hexSequence = (start: HexStart, index: number): string => {
  const digits = (start.value + index).toString(16).padStart(start.width, '0');
  return `${start.prefix}${start.upper ? digits.toUpperCase() : digits}`;
};

// ---------------------------------------------------------------------------------------------
// GEN-026 Kana Sequence
// ---------------------------------------------------------------------------------------------

/** The 46 basic hiragana in gojūon order (with を and ん, without ゐ ゑ, small, voiced or semi-voiced kana). */
export const GOJUON = 'あいうえおかきくけこさしすせそたちつてとなにぬねのはひふへほまみむめもやゆよらりるれろわをん';
/** The 47 katakana of the iroha (with ヰ and ヱ, without ン). */
export const IROHA = 'イロハニホヘトチリヌルヲワカヨタレソツネナラムウヰノオクヤマケフコエテアサキユメミシヱヒモセス';

export type KanaOrder = 'gojuon' | 'iroha';

/** The kana of an order (one string per character). */
export const kanaOf = (order: string): readonly string[] => {
  if (order === 'gojuon') {
    return Array.from(GOJUON);
  }
  if (order === 'iroha') {
    return Array.from(IROHA);
  }
  throw new GenInputError('choose the gojūon or the iroha order');
};

/** GEN-026: at most as many targets as the order has kana (the sequence does not wrap around). */
export const checkKanaCount = (order: string, count: number): void => {
  const kana = kanaOf(order);
  assertSequenceLength(count, kana.length, order === 'gojuon' ? 'the gojūon order (あ to ん)' : 'the iroha order (イ to ス)');
};

/** GEN-026: the `index`-th kana of the order. */
export const kanaSequence = (order: string, index: number): string => {
  const kana = kanaOf(order);
  if (index < 0 || index >= kana.length) {
    throw new RangeError('no kana for this index');
  }
  return kana[index];
};

// ---------------------------------------------------------------------------------------------
// GEN-027 Circled Number Sequence
// ---------------------------------------------------------------------------------------------

/** The circled number of `n` (1 to 50): ①..⑳ U+2460.., ㉑..㉟ U+3251.., ㊱..㊿ U+32B1.. */
export const toCircled = (n: number): string => {
  if (!Number.isInteger(n) || n < 1 || n > GEN_MAX_CIRCLED) {
    throw new RangeError('circled numbers are made for 1 to 50 only');
  }
  if (n <= 20) {
    return String.fromCharCode(0x2460 + n - 1);
  }
  if (n <= 35) {
    return String.fromCharCode(0x3251 + n - 21);
  }
  return String.fromCharCode(0x32b1 + n - 36);
};

/** GEN-027: `①, ②, ③, …` for index 0, 1, 2, … */
export const circledSequence = (index: number): string => toCircled(index + 1);

/** GEN-027: at most 50 targets. */
export const checkCircledCount = (count: number): void =>
  assertSequenceLength(count, GEN_MAX_CIRCLED, 'the circled number sequence (① to ㊿)');

// ---------------------------------------------------------------------------------------------
// GEN-028 Column Ruler
// ---------------------------------------------------------------------------------------------

/**
 * GEN-028: two lines of `width` columns (joined with `eol`). The first has the tens digit of
 * every tenth column (`(column / 10) % 10`, so column 100 shows 0) and `·` elsewhere; the second
 * has the last digit of every column.
 */
export const columnRuler = (width: number, eol: string): string => {
  if (!Number.isSafeInteger(width) || width < 1 || width > GEN_MAX_RULER_WIDTH) {
    throw new RangeError('invalid ruler width');
  }
  let tens = '';
  let ones = '';
  for (let column = 1; column <= width; column++) {
    tens += column % 10 === 0 ? String((column / 10) % 10) : '·';
    ones += String(column % 10);
  }
  return `${tens}${eol}${ones}`;
};

// ---------------------------------------------------------------------------------------------
// GEN-029 GUID (Braced Uppercase)
// ---------------------------------------------------------------------------------------------

/** GEN-029: a random (version 4) UUID in upper case between braces, as Windows / .NET write it. */
export const bracedGuid = (random: GenRandom): string => `{${random.uuid().toUpperCase()}}`;

// ---------------------------------------------------------------------------------------------
// GEN-030 IPv4 Sequence
// ---------------------------------------------------------------------------------------------

const IPV4 = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/;
const MAX_IPV4 = 0xffffffff;

/** GEN-030: reads a dotted-decimal IPv4 address (0 to 255 each, no leading zeros) as a 32-bit number. */
export const parseIpv4 = (text: string): number => {
  const match = IPV4.exec(text.trim());
  if (!match) {
    throw new GenInputError('enter an IPv4 address such as 192.0.2.1');
  }
  const parts = match.slice(1);
  if (parts.some((part) => (part.length > 1 && part.startsWith('0')) || Number(part) > 255)) {
    throw new GenInputError('each part of the address must be a number from 0 to 255 without leading zeros');
  }
  return parts.reduce((value, part) => value * 256 + Number(part), 0);
};

/** GEN-030: the last address of `count` targets must not exceed 255.255.255.255. */
export const checkIpv4Sequence = (first: number, count: number): void => {
  if (count > 0 && first + count - 1 > MAX_IPV4) {
    throw new GenInputError(`the addresses would go past 255.255.255.255 (${formatCount(count)} selections and cursors from ${formatIpv4(first)})`);
  }
};

/** A 32-bit number as a dotted-decimal address. */
export const formatIpv4 = (value: number): string =>
  [Math.floor(value / 2 ** 24) % 256, Math.floor(value / 2 ** 16) % 256, Math.floor(value / 2 ** 8) % 256, value % 256].join('.');

/** GEN-030: the address `index` after the first. */
export const ipv4Sequence = (first: number, index: number): string => formatIpv4(first + index);
