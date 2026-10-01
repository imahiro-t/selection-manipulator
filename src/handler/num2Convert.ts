/**
 * Pure (vscode-independent) conversions of one number of the NUMX-001..011 commands (group NUM2):
 * significant figures, rounding to a multiple, clamping, Roman numerals, English number words,
 * fractions, IEEE 754 bits and two's complement.
 *
 * Every function takes one value (a line without its surrounding spaces) and the typed values it
 * needs, and returns the converted value or throws `NumInputError`. Only fixed regular expressions
 * (linear time) are used; the number of digits is checked before any BigInt is built, so that no
 * input can make a conversion slow. Only local processing (`Math`, `BigInt`, `DataView`).
 */
import {
  cleanNumber,
  formatA,
  NumInputError,
  NUM_MAX_EXACT_DIGITS,
  parseBasicNumber,
  quoteText,
  trimLeadingZeros,
} from './numCommon';

/** NUMX-006: upper limit of the words of a number in English words. */
export const NUM2_MAX_WORDS = 100;

const outOfRange = (): NumInputError => new NumInputError('the result is out of range');

// ---------------------------------------------------------------------------------------------
// NUMX-001..003: rounding and clamping (the typed values are already checked by the handler)
// ---------------------------------------------------------------------------------------------

/** NUMX-001: rounds to `digits` significant figures (1-21) (`123456` with 2 → `120000`). */
export const roundToSignificant = (value: string, digits: number): string => {
  const rounded = Number(parseBasicNumber(value).toPrecision(digits));
  return String(rounded === 0 ? 0 : rounded);
};

/**
 * NUMX-002: rounds to the nearest multiple of `step` (≠ 0), half away from zero. The quotient is
 * cleaned to 15 significant digits before rounding, so that a boundary written in decimal is not
 * missed through floating-point error (`0.15 / 0.1` = 1.4999999999999998 → 1.5 → `0.2`).
 */
export const roundToMultiple = (value: string, step: number): string => {
  const quotient = cleanNumber(parseBasicNumber(value) / step);
  const k = Math.sign(quotient) * Math.floor(Math.abs(quotient) + 0.5);
  const result = k * step;
  if (!Number.isFinite(result)) {
    throw outOfRange();
  }
  return formatA(result);
};

/** NUMX-003: a value below `min` / above `max` becomes the bound (rule A); a value in range is kept as written. */
export const clamp = (value: string, min: number, max: number): string => {
  const number = parseBasicNumber(value);
  if (number < min) {
    return formatA(min);
  }
  if (number > max) {
    return formatA(max);
  }
  return value;
};

/** NUMX-003: why the typed minimum and maximum cannot be used together, or `undefined`. */
export const findClampProblem = (min: number, max: number): string | undefined =>
  min > max ? `The minimum (${formatA(min)}) is greater than the maximum (${formatA(max)}).` : undefined;

/** NUMX-008: `value × factor` written with rule A; a result beyond the range of a double is an error. */
export const multiplyBy = (value: string, factor: number): string => formatA(parseBasicNumber(value) * factor);

// ---------------------------------------------------------------------------------------------
// NUMX-004 / 005: Roman numerals
// ---------------------------------------------------------------------------------------------

const ROMAN: readonly [number, string][] = [
  [1000, 'M'], [900, 'CM'], [500, 'D'], [400, 'CD'], [100, 'C'], [90, 'XC'],
  [50, 'L'], [40, 'XL'], [10, 'X'], [9, 'IX'], [5, 'V'], [4, 'IV'], [1, 'I'],
];
const ROMAN_DIGIT_VALUES: Readonly<Record<string, number>> = { I: 1, V: 5, X: 10, L: 50, C: 100, D: 500, M: 1000 };
const ROMAN_LETTERS = /^[IVXLCDM]+$/i;
/** The standard (subtractive) form of 1..3999. */
const STANDARD_ROMAN = /^M{0,3}(?:CM|CD|D?C{0,3})(?:XC|XL|L?X{0,3})(?:IX|IV|V?I{0,3})$/;
const UNSIGNED_DIGITS = /^\d+$/;

/** NUMX-004: an integer from 1 to 3999 (no sign) in upper-case Roman numerals (`2026` → `MMXXVI`). */
export const toRoman = (value: string): string => {
  const digits = UNSIGNED_DIGITS.test(value) ? trimLeadingZeros(value) : '';
  const n = digits.length > 0 && digits.length <= 4 ? Number(digits) : 0;
  if (n < 1 || n > 3999) {
    throw new NumInputError(`${quoteText(value)} is not an integer from 1 to 3999`);
  }
  let rest = n;
  let result = '';
  for (const [unit, letters] of ROMAN) {
    while (rest >= unit) {
      result += letters;
      rest -= unit;
    }
  }
  return result;
};

/** NUMX-005: Roman numerals of the standard form (any case) as an integer (`MMXXVI` → `2026`). */
export const fromRoman = (value: string): string => {
  // The letters are checked before upper-casing (`ı`.toUpperCase() is `I`).
  const upper = ROMAN_LETTERS.test(value) ? value.toUpperCase() : '';
  if (upper === '' || !STANDARD_ROMAN.test(upper)) {
    throw new NumInputError(`${quoteText(value)} is not a Roman numeral in standard form (I to MMMCMXCIX)`);
  }
  let total = 0;
  for (let i = 0; i < upper.length; i++) {
    const current = ROMAN_DIGIT_VALUES[upper[i]];
    const next = i + 1 < upper.length ? ROMAN_DIGIT_VALUES[upper[i + 1]] : 0;
    total += current < next ? -current : current;
  }
  return String(total);
};

// ---------------------------------------------------------------------------------------------
// NUMX-006: English number words (the reverse of NUM-032 `number.to-words-en`)
// ---------------------------------------------------------------------------------------------

const ONES = ['', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve',
  'thirteen', 'fourteen', 'fifteen', 'sixteen', 'seventeen', 'eighteen', 'nineteen'];
const TENS = ['', '', 'twenty', 'thirty', 'forty', 'fifty', 'sixty', 'seventy', 'eighty', 'ninety'];
const SCALES = ['', 'thousand', 'million', 'billion', 'trillion', 'quadrillion', 'quintillion', 'sextillion',
  'septillion', 'octillion', 'nonillion', 'decillion'];

const isLetter = (code: number): boolean => (code >= 0x61 && code <= 0x7a);

/**
 * The words of a number in lower case. Words are runs of ASCII letters; spaces, tabs and commas
 * separate them, and a hyphen is accepted only between two letters (`twenty-three`). Anything else
 * is not a number in words. More than NUM2_MAX_WORDS words is an error (checked while reading).
 */
const englishWords = (value: string): string[] => {
  const text = value.toLowerCase();
  const notWords = (): NumInputError => new NumInputError(`${quoteText(value)} is not a number in English words`);
  const words: string[] = [];
  let i = 0;
  while (i < text.length) {
    const code = text.charCodeAt(i);
    if (isLetter(code)) {
      const start = i;
      while (i < text.length && isLetter(text.charCodeAt(i))) {
        i++;
      }
      words.push(text.slice(start, i));
      if (words.length > NUM2_MAX_WORDS) {
        throw new NumInputError(`the text has more than ${NUM2_MAX_WORDS} words`);
      }
    } else if (code === 0x20 || code === 0x09 || code === 0x2c) {
      i++;
    } else if (code === 0x2d && i > 0 && isLetter(text.charCodeAt(i - 1)) && i + 1 < text.length && isLetter(text.charCodeAt(i + 1))) {
      i++;
    } else {
      throw notWords();
    }
  }
  return words;
};

/**
 * NUMX-006: a number in English words as an integer (`one hundred twenty-three` → `123`, `minus
 * five` → `-5`). The words are those of NUM-032: `minus`, `zero` (alone), 1-19, the tens, `hundred`
 * and the short scales up to decillion, each scale at most once and in descending order with a
 * group of 1-999 before it. Case is ignored, `and` and commas are ignored. The result is exact (BigInt).
 */
export const fromEnglishWords = (value: string): string => {
  const notWords = (): NumInputError => new NumInputError(`${quoteText(value)} is not a number in English words`);
  const words = englishWords(value).filter((word) => word !== 'and');
  let i = 0;
  const negative = words[0] === 'minus';
  if (negative) {
    i++;
  }
  if (words.length === 1 && words[0] === 'zero') {
    return '0';
  }
  if (i >= words.length) {
    throw notWords();
  }
  let total = 0n;
  let lastScale = SCALES.length;
  while (i < words.length) {
    let group = 0;
    const hundreds = ONES.indexOf(words[i]);
    if (hundreds >= 1 && hundreds <= 9 && words[i + 1] === 'hundred') {
      group = hundreds * 100;
      i += 2;
    }
    const tens = i < words.length ? TENS.indexOf(words[i]) : -1;
    if (tens >= 2) {
      group += tens * 10;
      i++;
      const ones = i < words.length ? ONES.indexOf(words[i]) : -1;
      if (ones >= 1 && ones <= 9) {
        group += ones;
        i++;
      }
    } else {
      const ones = i < words.length ? ONES.indexOf(words[i]) : -1;
      if (ones >= 1) {
        group += ones;
        i++;
      }
    }
    if (group === 0) {
      throw notWords();
    }
    const scale = i < words.length ? SCALES.indexOf(words[i]) : -1;
    if (scale >= 1) {
      if (scale >= lastScale) {
        throw notWords();
      }
      lastScale = scale;
      total += BigInt(group) * 1000n ** BigInt(scale);
      i++;
    } else {
      // A group without a scale (the units) must be the last.
      if (i < words.length) {
        throw notWords();
      }
      total += BigInt(group);
    }
  }
  return `${negative ? '-' : ''}${total.toString()}`;
};

// ---------------------------------------------------------------------------------------------
// NUMX-007: fractions
// ---------------------------------------------------------------------------------------------

/** `a/b` or `w a/b` (a mixed number); groups: sign, whole, numerator, denominator. */
const FRACTION = /^([-+]?)(?:(\d+)[ \t]+)?(\d+)[ \t]*\/[ \t]*(\d+)$/;

/** NUMX-007: a fraction or mixed number as a decimal, rule A (`1 3/4` → `1.75`, `-1 3/4` → `-1.75`). */
export const fromFraction = (value: string): string => {
  const match = FRACTION.exec(value);
  if (!match) {
    throw new NumInputError(`${quoteText(value)} is not a fraction such as 3/4 or 1 3/4`);
  }
  const [whole, numerator, denominator] = [match[2] ?? '0', match[3], match[4]].map(trimLeadingZeros);
  if ([whole, numerator, denominator].some((digits) => digits.length > NUM_MAX_EXACT_DIGITS)) {
    throw new NumInputError(`the number has more than ${NUM_MAX_EXACT_DIGITS} digits`);
  }
  if (denominator === '0') {
    throw new NumInputError(`${quoteText(value)} has the denominator 0`);
  }
  const over = BigInt(whole) * BigInt(denominator) + BigInt(numerator);
  const result = Number(over) / Number(denominator);
  return formatA(match[1] === '-' ? -result : result);
};

// ---------------------------------------------------------------------------------------------
// NUMX-009 / 010: IEEE 754
// ---------------------------------------------------------------------------------------------

/** NUMX-009: the IEEE 754 bits of a number in hex (`1.5` with 64 → `0x3FF8000000000000`). */
export const toIeee754 = (value: string, bits: 64 | 32): string => {
  const number = parseBasicNumber(value);
  const view = new DataView(new ArrayBuffer(8));
  if (bits === 64) {
    view.setFloat64(0, number);
    return `0x${view.getBigUint64(0).toString(16).toUpperCase().padStart(16, '0')}`;
  }
  if (!Number.isFinite(Math.fround(number))) {
    throw new NumInputError(`${quoteText(value)} is out of the range of a 32-bit float`);
  }
  view.setFloat32(0, number);
  return `0x${view.getUint32(0).toString(16).toUpperCase().padStart(8, '0')}`;
};

const IEEE_HEX = /^(?:0[xX])?([0-9A-Fa-f]+)$/;

/** A special value or -0 written as JavaScript writes it, or `undefined` for any other value. */
const specialOf = (number: number): string | undefined => {
  if (Number.isNaN(number) || !Number.isFinite(number)) {
    return String(number);
  }
  return Object.is(number, -0) ? '-0' : undefined;
};

/**
 * NUMX-010: IEEE 754 bits in hex (16 digits: double, 8 digits: single; `0x` optional, any case) as
 * a number: the shortest decimal that reads back to the same value (`0x3FF8000000000000` → `1.5`).
 */
export const fromIeee754 = (value: string): string => {
  const match = IEEE_HEX.exec(value);
  if (!match || (match[1].length !== 16 && match[1].length !== 8)) {
    throw new NumInputError(`${quoteText(value)} is not 16 (double) or 8 (single) hex digits`);
  }
  const view = new DataView(new ArrayBuffer(8));
  if (match[1].length === 16) {
    view.setBigUint64(0, BigInt(`0x${match[1]}`));
    const number = view.getFloat64(0);
    return specialOf(number) ?? String(number);
  }
  view.setUint32(0, parseInt(match[1], 16));
  const number = view.getFloat32(0);
  const special = specialOf(number);
  if (special !== undefined) {
    return special;
  }
  for (let precision = 1; precision < 9; precision++) {
    const shortest = Number(number.toPrecision(precision));
    if (Math.fround(shortest) === number) {
      return String(shortest);
    }
  }
  return String(Number(number.toPrecision(9)));
};

// ---------------------------------------------------------------------------------------------
// NUMX-011: two's complement
// ---------------------------------------------------------------------------------------------

const DECIMAL_INTEGER = /^([-+]?)(\d+)$/;
/** The digits of 2^64 − 1, the largest value of any accepted width. */
const MAX_TWOS_COMPLEMENT_DIGITS = 20;

/** NUMX-011: a decimal integer from −2^(w−1) to 2^w − 1 as w-bit two's complement hex (`-1` with 32 → `0xFFFFFFFF`). */
export const toTwosComplement = (value: string, width: 8 | 16 | 32 | 64): string => {
  const match = DECIMAL_INTEGER.exec(value);
  if (!match) {
    throw new NumInputError(`${quoteText(value)} is not an integer`);
  }
  const min = -(2n ** BigInt(width - 1));
  const max = 2n ** BigInt(width) - 1n;
  const outOfWidth = (): NumInputError =>
    new NumInputError(`${quoteText(value)} is out of the range of ${width} bits (${min} to ${max})`);
  const digits = trimLeadingZeros(match[2]);
  // Counted before BigInt reads the digits, so that a huge value is never parsed.
  if (digits.length > MAX_TWOS_COMPLEMENT_DIGITS) {
    throw outOfWidth();
  }
  const magnitude = BigInt(digits);
  const number = match[1] === '-' ? -magnitude : magnitude;
  if (number < min || number > max) {
    throw outOfWidth();
  }
  return `0x${BigInt.asUintN(width, number).toString(16).toUpperCase().padStart(width / 4, '0')}`;
};
