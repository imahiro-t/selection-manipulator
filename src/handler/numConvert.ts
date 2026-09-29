/**
 * Pure (vscode-independent) conversions of one number of the NUM commands that work on the digits
 * as text or as BigInt, never through a double: signs, thousands separators, percent, scientific
 * notation, bases 2..36, bytes, English words, ordinals and fractions.
 *
 * Every function takes one value (a line without its surrounding spaces) and returns the converted
 * value, or throws `NumInputError`. The number of digits is checked before any BigInt is built,
 * so that no input can make a conversion slow.
 */
import {
  allZeros,
  joinDecimal,
  notANumber,
  NumInputError,
  NUM_MAX_BASE_DIGITS,
  NUM_MAX_EXACT_DIGITS,
  NUM_MAX_EXPONENT,
  NUM_MAX_WORDS_DIGITS,
  parsePlainDecimal,
  quoteText,
  shiftDecimal,
  trimLeadingZeros,
  trimTrailingZeros,
} from './numCommon';

const tooManyDigits = (limit: number): NumInputError =>
  new NumInputError(`the number has more than ${limit.toLocaleString('en-US')} digits`);

/** A value of the basic form split into sign, mantissa and exponent text (`undefined` when not a number). */
const SIGNED_MANTISSA = /^([-+]?)((?:\d+(?:\.\d*)?|\.\d+)(?:[eE][-+]?\d+)?)$/;

// ---------------------------------------------------------------------------------------------
// NUM-015 / 016: signs (the digits are kept as typed)
// ---------------------------------------------------------------------------------------------

const splitSign = (value: string): { sign: string; body: string; zero: boolean } => {
  const match = SIGNED_MANTISSA.exec(value);
  if (!match) {
    throw notANumber(value);
  }
  const mantissa = match[2].split(/[eE]/)[0];
  return { sign: match[1], body: match[2], zero: allZeros(mantissa) };
};

/** NUM-015: removes the sign (`-1.50` → `1.50`, `+5` → `5`). */
export const absolute = (value: string): string => splitSign(value).body;

/** NUM-016: `-` is removed, otherwise added (`+` replaced); a zero only loses its sign. */
export const negate = (value: string): string => {
  const { sign, body, zero } = splitSign(value);
  if (zero || sign === '-') {
    return body;
  }
  return `-${body}`;
};

// ---------------------------------------------------------------------------------------------
// NUM-017 / 018: thousands separators
// ---------------------------------------------------------------------------------------------

const GROUPED = /^([-+]?)(\d{1,3}(?:,\d{3})+)(\.\d+)?$/;
const UNGROUPED = /^([-+]?)(\d+)(\.\d+)?$/;

/** Separates the digits of an integer part with a comma every 3 digits from the right. */
const group = (digits: string): string => {
  const head = digits.length % 3 === 0 ? 3 : digits.length % 3;
  const parts = [digits.slice(0, head)];
  for (let i = head; i < digits.length; i += 3) {
    parts.push(digits.slice(i, i + 3));
  }
  return parts.join(',');
};

const readGrouping = (value: string): { sign: string; digits: string; fraction: string } => {
  const match = GROUPED.exec(value) ?? UNGROUPED.exec(value);
  if (!match) {
    if (/^[-+]?[\d,]+(\.\d+)?$/.test(value) && value.includes(',')) {
      throw new NumInputError(`${quoteText(value)} has misplaced thousands separators`);
    }
    throw notANumber(value);
  }
  return { sign: match[1], digits: match[2].replace(/,/g, ''), fraction: match[3] ?? '' };
};

/**
 * NUM-017: `1234567.89` → `1,234,567.89` (already separated input is accepted as it is). The
 * leading zeros of the integer part are removed (`0012345` → `12,345`, `000.5` → `0.5`), since
 * grouping them (`0,012,345`) makes no sense.
 */
export const addSeparator = (value: string): string => {
  const { sign, digits, fraction } = readGrouping(value);
  return `${sign}${group(trimLeadingZeros(digits))}${fraction}`;
};

/** NUM-018: `1,234,567` → `1234567`; separators in wrong places are an error. */
export const removeSeparator = (value: string): string => {
  const { sign, digits, fraction } = readGrouping(value);
  return `${sign}${digits}${fraction}`;
};

// ---------------------------------------------------------------------------------------------
// NUM-028 / 029: moving the decimal point
// ---------------------------------------------------------------------------------------------

const SCIENTIFIC = /^([-+]?)(?:(\d+)(?:\.(\d*))?|\.(\d+))[eE]([-+]?)(\d+)$/;

/** NUM-028: `1.5e-3` → `0.0015`, `1.23e+4` → `12300` (the digits of the mantissa are kept). */
export const fromScientific = (value: string): string => {
  const match = SCIENTIFIC.exec(value);
  if (!match) {
    throw new NumInputError(`${quoteText(value)} is not a number in scientific notation`);
  }
  const exponentDigits = trimLeadingZeros(match[6]);
  if (exponentDigits.length > 4 || Number(exponentDigits) > NUM_MAX_EXPONENT) {
    throw new NumInputError(`the exponent of ${quoteText(value)} is larger than ${NUM_MAX_EXPONENT.toLocaleString('en-US')}`);
  }
  const exponent = (match[5] === '-' ? -1 : 1) * Number(exponentDigits);
  const shifted = shiftDecimal(match[2] ?? '', match[3] ?? match[4] ?? '', exponent);
  const zero = allZeros(shifted.integer + shifted.fraction);
  return joinDecimal(match[1] === '-' && !zero ? '-' : '', shifted.integer, shifted.fraction);
};

/** NUM-029: `0.125` → `12.5%` (the point moved 2 places right, digits kept). */
export const toPercent = (value: string): string => {
  const parts = parsePlainDecimal(value);
  if (!parts) {
    throw notANumber(value);
  }
  const shifted = shiftDecimal(parts.integer, parts.fraction, 2);
  const zero = allZeros(shifted.integer + shifted.fraction);
  return `${joinDecimal(parts.sign === '-' && !zero ? '-' : '', shifted.integer, shifted.fraction)}%`;
};

// ---------------------------------------------------------------------------------------------
// NUM-020..026: bases
// ---------------------------------------------------------------------------------------------

const DECIMAL_INTEGER = /^([-+]?)(\d+)$/;

const withSign = (negative: boolean, magnitude: bigint, text: string): string =>
  negative && magnitude !== 0n ? `-${text}` : text;

const PREFIX: Record<number, string> = { 16: '0x', 2: '0b', 8: '0o' };

/** NUM-020 / 022 / 024: a decimal integer to `0x…` / `0b…` / `0o…` (lower case, `-0xff`). */
export const decimalToBase = (base: 16 | 2 | 8) => (value: string): string => {
  const match = DECIMAL_INTEGER.exec(value);
  if (!match) {
    throw new NumInputError(`${quoteText(value)} is not a decimal integer`);
  }
  if (match[2].length > NUM_MAX_BASE_DIGITS) {
    throw tooManyDigits(NUM_MAX_BASE_DIGITS);
  }
  const magnitude = BigInt(match[2]);
  return withSign(match[1] === '-', magnitude, `${PREFIX[base]}${magnitude.toString(base)}`);
};

const BASE_DIGITS: Record<number, RegExp> = {
  16: /^([-+]?)(?:0x)?([0-9a-f]+)$/i,
  2: /^([-+]?)(?:0b)?([01]+)$/i,
  8: /^([-+]?)(?:0o)?([0-7]+)$/i,
};
const BASE_NAME: Record<number, string> = { 16: 'a hexadecimal', 2: 'a binary', 8: 'an octal' };

/** NUM-021 / 023 / 025: `0xff` / `ff` / `-0XFF` … to decimal. */
export const baseToDecimal = (base: 16 | 2 | 8) => (value: string): string => {
  const match = BASE_DIGITS[base].exec(value);
  if (!match) {
    throw new NumInputError(`${quoteText(value)} is not ${BASE_NAME[base]} integer`);
  }
  if (match[2].length > NUM_MAX_BASE_DIGITS) {
    throw tooManyDigits(NUM_MAX_BASE_DIGITS);
  }
  const magnitude = BigInt(`${PREFIX[base]}${match[2]}`);
  return withSign(match[1] === '-', magnitude, magnitude.toString());
};

const DIGIT_CHARS = '0123456789abcdefghijklmnopqrstuvwxyz';

/** NUM-026: an integer in base `from` (2..36, no prefix, any case) to base `to` (lower case). */
export const convertBase = (from: number, to: number) => (value: string): string => {
  const match = /^([-+]?)([0-9A-Za-z]+)$/.exec(value);
  if (!match) {
    throw new NumInputError(`${quoteText(value)} is not a base-${from} integer`);
  }
  const digits = match[2].toLowerCase();
  for (const ch of digits) {
    const digit = DIGIT_CHARS.indexOf(ch);
    if (digit < 0 || digit >= from) {
      throw new NumInputError(`${quoteText(value)} is not a base-${from} integer`);
    }
  }
  if (digits.length > NUM_MAX_BASE_DIGITS) {
    throw tooManyDigits(NUM_MAX_BASE_DIGITS);
  }
  const base = BigInt(from);
  let magnitude = 0n;
  for (const ch of digits) {
    magnitude = magnitude * base + BigInt(DIGIT_CHARS.indexOf(ch));
  }
  return withSign(match[1] === '-', magnitude, magnitude.toString(to));
};

// ---------------------------------------------------------------------------------------------
// NUM-030 / 031: bytes
// ---------------------------------------------------------------------------------------------

const BYTE_UNITS = ['B', 'KiB', 'MiB', 'GiB', 'TiB', 'PiB', 'EiB', 'ZiB', 'YiB'];

/** `numerator / denominator` rounded half up (both non-negative). */
const divideRounded = (numerator: bigint, denominator: bigint): bigint => (numerator * 2n + denominator) / (denominator * 2n);

/** NUM-030: `1536` → `1.5 KiB` (at most 2 decimals; a value that rounds to 1024 moves to the next unit). */
export const bytesToHuman = (value: string): string => {
  const match = /^\+?(\d+)$/.exec(value);
  if (!match) {
    throw new NumInputError(`${quoteText(value)} is not a non-negative integer`);
  }
  if (match[1].length > NUM_MAX_EXACT_DIGITS) {
    throw tooManyDigits(NUM_MAX_EXACT_DIGITS);
  }
  const bytes = BigInt(match[1]);
  if (bytes < 1024n) {
    return `${bytes} B`;
  }
  let unit = 1;
  while (unit < BYTE_UNITS.length - 1 && bytes >= 1024n ** BigInt(unit + 1)) {
    unit++;
  }
  let hundredths = divideRounded(bytes * 100n, 1024n ** BigInt(unit));
  if (hundredths >= 102_400n && unit < BYTE_UNITS.length - 1) {
    unit++;
    hundredths = divideRounded(bytes * 100n, 1024n ** BigInt(unit));
  }
  const whole = hundredths / 100n;
  const fraction = trimTrailingZeros((hundredths % 100n).toString().padStart(2, '0'));
  return `${joinDecimal('', whole.toString(), fraction)} ${BYTE_UNITS[unit]}`;
};

const HUMAN = /^(?:(\d+)(?:\.(\d*))?|\.(\d+))[ \t]*([KMGTPEZY]i?B|B)$/i;
const SI_POWER: Record<string, number> = { K: 1, M: 2, G: 3, T: 4, P: 5, E: 6, Z: 7, Y: 8 };

/**
 * NUM-031: `1.5 MiB` → `1572864` (KB…YB = powers of 1000, KiB…YiB = powers of 1024; rounded half
 * up). Every unit NUM-030 writes (up to YiB) is read back.
 */
export const humanToBytes = (value: string): string => {
  const match = HUMAN.exec(value);
  if (!match) {
    throw new NumInputError(`${quoteText(value)} is not a size such as 1.5 MiB or 200 KB`);
  }
  const integer = match[1] ?? '';
  const fraction = match[2] ?? match[3] ?? '';
  if (integer.length + fraction.length > NUM_MAX_EXACT_DIGITS) {
    throw tooManyDigits(NUM_MAX_EXACT_DIGITS);
  }
  const unit = match[4].toUpperCase();
  let multiplier = 1n;
  if (unit !== 'B') {
    const power = BigInt(SI_POWER[unit[0]]);
    multiplier = unit[1] === 'I' ? 1024n ** power : 1000n ** power;
  }
  const scaled = BigInt(`${integer}${fraction}` || '0');
  return divideRounded(scaled * multiplier, 10n ** BigInt(fraction.length)).toString();
};

// ---------------------------------------------------------------------------------------------
// NUM-032 / 033: English
// ---------------------------------------------------------------------------------------------

const ONES = ['', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve',
  'thirteen', 'fourteen', 'fifteen', 'sixteen', 'seventeen', 'eighteen', 'nineteen'];
const TENS = ['', '', 'twenty', 'thirty', 'forty', 'fifty', 'sixty', 'seventy', 'eighty', 'ninety'];
const SCALES = ['', 'thousand', 'million', 'billion', 'trillion', 'quadrillion', 'quintillion', 'sextillion',
  'septillion', 'octillion', 'nonillion', 'decillion'];

/** 1..999 in words (`one hundred twenty-three`). */
const hundredsInWords = (n: number): string => {
  const words: string[] = [];
  if (n >= 100) {
    words.push(`${ONES[Math.floor(n / 100)]} hundred`);
  }
  const rest = n % 100;
  if (rest >= 20) {
    words.push(rest % 10 === 0 ? TENS[rest / 10] : `${TENS[Math.floor(rest / 10)]}-${ONES[rest % 10]}`);
  } else if (rest > 0) {
    words.push(ONES[rest]);
  }
  return words.join(' ');
};

/** NUM-032: an integer in American English words (`42` → `forty-two`, `-7` → `minus seven`). */
export const toWordsEn = (value: string): string => {
  const match = DECIMAL_INTEGER.exec(value);
  if (!match) {
    throw new NumInputError(`${quoteText(value)} is not an integer`);
  }
  const digits = trimLeadingZeros(match[2]);
  if (digits.length > NUM_MAX_WORDS_DIGITS) {
    throw tooManyDigits(NUM_MAX_WORDS_DIGITS);
  }
  if (digits === '0') {
    return 'zero';
  }
  const words: string[] = [];
  const groups = Math.ceil(digits.length / 3);
  const padded = digits.padStart(groups * 3, '0');
  for (let i = 0; i < groups; i++) {
    const n = Number(padded.slice(i * 3, i * 3 + 3));
    if (n > 0) {
      const scale = SCALES[groups - 1 - i];
      words.push(scale === '' ? hundredsInWords(n) : `${hundredsInWords(n)} ${scale}`);
    }
  }
  return `${match[1] === '-' ? 'minus ' : ''}${words.join(' ')}`;
};

/** NUM-033: `1` → `1st`, `12` → `12th`, `-22` → `-22nd` (the digits are kept). */
export const ordinalEn = (value: string): string => {
  const match = DECIMAL_INTEGER.exec(value);
  if (!match) {
    throw new NumInputError(`${quoteText(value)} is not an integer`);
  }
  const lastTwo = Number(match[2].slice(-2));
  const last = lastTwo % 10;
  let suffix = 'th';
  if (lastTwo < 11 || lastTwo > 13) {
    suffix = last === 1 ? 'st' : last === 2 ? 'nd' : last === 3 ? 'rd' : 'th';
  }
  return `${value}${suffix}`;
};

// ---------------------------------------------------------------------------------------------
// NUM-034: fractions
// ---------------------------------------------------------------------------------------------

/** NUM-034: the largest denominator of an approximated repeating decimal. */
export const NUM_FRACTION_MAX_DENOMINATOR = 99;
/** NUM-034: the fewest decimals for which a repeating decimal is looked for. */
export const NUM_FRACTION_MIN_REPEATING_DECIMALS = 6;

const gcd = (a: bigint, b: bigint): bigint => {
  while (b !== 0n) {
    [a, b] = [b, a % b];
  }
  return a;
};

/** True when `q` has a prime factor other than 2 and 5 (1/q is a repeating decimal). */
const repeats = (q: number): boolean => {
  let rest = q;
  while (rest % 2 === 0) {
    rest /= 2;
  }
  while (rest % 5 === 0) {
    rest /= 5;
  }
  return rest > 1;
};

/** The greatest common divisor of two small non-negative integers. */
const smallGcd = (a: number, b: number): number => {
  while (b !== 0) {
    [a, b] = [b, a % b];
  }
  return a;
};

/**
 * The fraction with the smallest denominator (up to NUM_FRACTION_MAX_DENOMINATOR) in
 * [n/10^d − 0.5×10^-d, n/10^d + 10^-d), i.e. a fraction whose expansion rounds or truncates to
 * the d typed decimals (d ≥ 6). Trying every denominator from 1 up gives the same answer as a
 * Stern-Brocot search, in at most 99 steps whatever the input.
 *
 * Most denominators are ruled out with doubles, and only the rest is checked exactly with BigInt:
 * - `fraction` is the typed decimals as a double in [0, 1). Adding an integer to a fraction keeps
 *   its denominator, so only the decimals matter.
 * - A fraction p/q of the interval is within 10^-d (≤ 10^-6) of them, so p is
 *   `Math.round(fraction × q)` (q × 10^-6 < 0.5) and the double differs by at most 10^-d plus the
 *   error of the double (about 10^-16); a q whose nearest fraction is farther is skipped.
 * - When p/q is not reduced, the same value was already checked with a smaller denominator.
 */
const smallestFractionNear = (n: bigint, d: number, fraction: number): [bigint, bigint] | undefined => {
  const tolerance = 10 ** -d + 1e-12;
  const scale = 10n ** BigInt(d);
  const twiceScale = 2n * scale;
  const low = 2n * n - 1n;
  const high = n + 1n;
  for (let q = 1; q <= NUM_FRACTION_MAX_DENOMINATOR; q++) {
    const nearest = Math.round(fraction * q);
    if (Math.abs(nearest / q - fraction) > tolerance || (q > 1 && smallGcd(nearest, q) > 1)) {
      continue;
    }
    const big = BigInt(q);
    // The smallest p with p/q >= (2n − 1) / (2 × 10^d).
    const p = (low * big + twiceScale - 1n) / twiceScale;
    if (p * scale < high * big) {
      return [p, big];
    }
  }
  return undefined;
};

/**
 * NUM-034: a decimal to its reduced fraction (`0.75` → `3/4`). A decimal is exact (`0.1` →
 * `1/10`); only with 6 or more decimals, a fraction with a denominator up to 99 that really
 * repeats (`0.333333` → `1/3`, `0.142857` → `1/7`) is used instead.
 */
export const toFraction = (value: string): string => {
  const parts = parsePlainDecimal(value);
  if (!parts) {
    throw notANumber(value);
  }
  if (parts.integer.length + parts.fraction.length > NUM_MAX_EXACT_DIGITS) {
    throw tooManyDigits(NUM_MAX_EXACT_DIGITS);
  }
  const d = parts.fraction.length;
  const n = BigInt(`${parts.integer}${parts.fraction}` || '0');
  if (n === 0n) {
    return '0';
  }
  const sign = parts.sign === '-' ? '-' : '';
  let numerator = n;
  let denominator = 10n ** BigInt(d);
  const divisor = gcd(numerator, denominator);
  numerator /= divisor;
  denominator /= divisor;
  if (d >= NUM_FRACTION_MIN_REPEATING_DECIMALS) {
    const near = smallestFractionNear(n, d, Number(`0.${parts.fraction}`));
    if (near !== undefined && repeats(Number(near[1]))) {
      [numerator, denominator] = near;
    }
  }
  return denominator === 1n ? `${sign}${numerator}` : `${sign}${numerator}/${denominator}`;
};
