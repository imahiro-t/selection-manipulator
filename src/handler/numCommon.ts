/**
 * Shared, vscode-independent helpers of the NUM-001..040 number commands: the errors, the limits,
 * the reading of numbers (tokens of the statistics commands, one number per line of the
 * conversions), the two rounding rules, decimal string arithmetic and the checks of the values
 * typed into the input boxes.
 *
 * Security rules (SECURITY.md): nothing here evaluates code, no regular expression is built from
 * the user's text, every loop is linear in the input (or bounded by a constant), and the results
 * are counted against the output limit while they are built.
 */
import { quoteForDisplay } from '../textFormat';
import { EncOutputTooLargeError, MAX_OUTPUT_LENGTH } from './encodeTransforms';

export { MAX_OUTPUT_LENGTH };

/** The selected text or a typed value cannot be used; the message is shown to the user as it is. */
export class NumInputError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'NumInputError';
  }
}

/** A statistics command found no number in a selection (reported as a warning, nothing shown). */
export class NumNoNumbersError extends NumInputError {
  constructor() {
    super('no numbers found');
    this.name = 'NumNoNumbersError';
  }
}

/** Upper limit of the length (UTF-16 code units) of one selection (the same as the TABLE / DATA commands). */
export const NUM_MAX_INPUT_LENGTH = 5_000_000;
/** Upper limit of the length of a value typed into an input box. */
export const NUM_MAX_PROMPT_LENGTH = 1_000;
/** Maximum number of characters of the selected text quoted in a message. */
export const NUM_MESSAGE_TEXT_LIMIT = 60;
/** NUM-020..026: upper limit of the digits of an integer converted between bases. */
export const NUM_MAX_BASE_DIGITS = 1_000;
/** NUM-028: upper limit of the absolute value of the exponent expanded. */
export const NUM_MAX_EXPONENT = 1_000;
/** NUM-030 / 031 / 034: upper limit of the digits of the number. */
export const NUM_MAX_EXACT_DIGITS = 30;
/** NUM-032: upper limit of the digits of the integer (short scale up to decillion). */
export const NUM_MAX_WORDS_DIGITS = 36;
/** Rule B: digits after the decimal point. */
export const NUM_ROUNDED_DECIMALS = 4;

/** `text` quoted like JSON and cut to NUM_MESSAGE_TEXT_LIMIT characters (for messages). */
export const quoteText = (text: string): string => quoteForDisplay(text, NUM_MESSAGE_TEXT_LIMIT);

export const assertNumInputLength = (text: string): void => {
  if (text.length > NUM_MAX_INPUT_LENGTH) {
    throw new NumInputError(`the selection is longer than ${NUM_MAX_INPUT_LENGTH.toLocaleString('en-US')} characters`);
  }
};

/** True when the text holds only spaces, tabs and line breaks (or nothing). */
export const isBlank = (text: string): boolean => !/[^ \t\r\n]/.test(text);

/**
 * Collects pieces of a result and throws `EncOutputTooLargeError` as soon as their total length
 * exceeds `budget` (what is left of MAX_OUTPUT_LENGTH for this selection), so that a result that
 * grows much faster than its input is never built in full.
 */
export class NumOutputBuffer {
  private readonly parts: string[] = [];
  private total = 0;

  constructor(private readonly budget: number) { }

  get length(): number {
    return this.total;
  }

  push(part: string): void {
    this.total += part.length;
    if (this.total > this.budget) {
      throw new EncOutputTooLargeError(this.total, MAX_OUTPUT_LENGTH);
    }
    this.parts.push(part);
  }

  /** The pieces joined without a separator (their total length is already within the budget). */
  join(): string {
    return this.parts.join('');
  }
}

// ---------------------------------------------------------------------------------------------
// Reading numbers
// ---------------------------------------------------------------------------------------------

/**
 * A number token of the statistics commands (NUM-001..009): not preceded by a letter, a digit,
 * `_`, `.`, `+` or `-` and not followed by a letter, a digit, `_` or `.` + digit. So `10px`, `a1`
 * and the `09` / `29` of `2026-09-29` are not numbers, and `1,234` is the two numbers 1 and 234.
 */
const TOKEN = /(?<![A-Za-z0-9_.+-])[-+]?(?:\d+(?:\.\d+)?|\.\d+)(?:[eE][-+]?\d+)?(?![A-Za-z0-9_]|\.\d)/g;

/** The number tokens of a selection, in order. A token out of the range of a double is an error. */
export const extractNumbers = (text: string): number[] => {
  assertNumInputLength(text);
  const numbers: number[] = [];
  for (const match of text.matchAll(TOKEN)) {
    const value = Number(match[0]);
    if (!Number.isFinite(value)) {
      throw new NumInputError(`${quoteText(match[0])} is out of range`);
    }
    numbers.push(value);
  }
  return numbers;
};

/** The basic form of a number: sign, digits with an optional decimal point, optional exponent. */
export const BASIC_NUMBER = /^[-+]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][-+]?\d+)?$/;
/** The basic form without an exponent; groups: sign, integer digits, fraction digits. */
export const PLAIN_DECIMAL = /^([-+]?)(?:(\d+)(?:\.(\d*))?|\.(\d+))$/;

export const notANumber = (value: string): NumInputError => new NumInputError(`${quoteText(value)} is not a number`);

/** A value of the basic form as a finite double. */
export const parseBasicNumber = (value: string): number => {
  if (!BASIC_NUMBER.test(value)) {
    throw notANumber(value);
  }
  const number = Number(value);
  if (!Number.isFinite(number)) {
    throw new NumInputError(`${quoteText(value)} is out of range`);
  }
  return number;
};

/** A decimal without an exponent split into its sign ('' / '-' / '+'), integer and fraction digits. */
export interface DecimalParts {
  sign: string;
  integer: string;
  fraction: string;
}

export const parsePlainDecimal = (value: string): DecimalParts | undefined => {
  const match = PLAIN_DECIMAL.exec(value);
  if (!match) {
    return undefined;
  }
  return { sign: match[1], integer: match[2] ?? '', fraction: match[3] ?? match[4] ?? '' };
};

const SPACE_TAB = /^[ \t]*/;

/**
 * Applies `convert` to every line of the selection (NUM-010..040). The line breaks (LF / CRLF)
 * and the spaces / tabs around each value are kept; an empty (or blank) line stays as it is and
 * is not passed to `convert`. A value that cannot be converted stops everything with
 * `line N: <reason>`. The result is counted against `budget` line by line.
 */
export const mapLines = (text: string, budget: number, convert: (value: string) => string): string => {
  assertNumInputLength(text);
  const output = new NumOutputBuffer(budget);
  let start = 0;
  let lineNumber = 1;
  for (;;) {
    const newline = text.indexOf('\n', start);
    let end = newline === -1 ? text.length : newline;
    const breakStart = end > start && text.charCodeAt(end - 1) === 0x0d ? end - 1 : end;
    const line = text.slice(start, breakStart);
    const lead = SPACE_TAB.exec(line)![0];
    let trailStart = line.length;
    while (trailStart > lead.length && (line.charCodeAt(trailStart - 1) === 0x20 || line.charCodeAt(trailStart - 1) === 0x09)) {
      trailStart--;
    }
    const value = line.slice(lead.length, trailStart);
    if (value === '') {
      output.push(line);
    } else {
      let converted: string;
      try {
        converted = convert(value);
      } catch (error) {
        if (error instanceof NumInputError) {
          throw new NumInputError(`line ${lineNumber}: ${error.message}`);
        }
        throw error;
      }
      output.push(lead);
      output.push(converted);
      output.push(line.slice(trailStart));
    }
    if (newline === -1) {
      break;
    }
    end = newline + 1;
    output.push(text.slice(breakStart, end));
    start = end;
    lineNumber++;
  }
  return output.join();
};

// ---------------------------------------------------------------------------------------------
// Decimal strings
// ---------------------------------------------------------------------------------------------

/** Removes the leading zeros of an integer part (keeps one digit). */
export const trimLeadingZeros = (digits: string): string => {
  let i = 0;
  while (i < digits.length - 1 && digits.charCodeAt(i) === 0x30) {
    i++;
  }
  return digits.slice(i);
};

/** Removes the trailing zeros of a fraction part. */
export const trimTrailingZeros = (digits: string): string => {
  let end = digits.length;
  while (end > 0 && digits.charCodeAt(end - 1) === 0x30) {
    end--;
  }
  return digits.slice(0, end);
};

/** True when every digit is 0. */
export const allZeros = (digits: string): boolean => !/[1-9]/.test(digits);

/**
 * Moves the decimal point of `integer.fraction` by `shift` places (right when positive), keeping
 * every digit and padding with zeros. The integer part loses its leading zeros; the fraction part
 * keeps its trailing zeros.
 */
export const shiftDecimal = (integer: string, fraction: string, shift: number): { integer: string; fraction: string } => {
  let digits = integer + fraction;
  let point = integer.length + shift;
  if (point < 0) {
    digits = '0'.repeat(-point) + digits;
    point = 0;
  } else if (point > digits.length) {
    digits += '0'.repeat(point - digits.length);
  }
  return { integer: trimLeadingZeros(digits.slice(0, point) || '0'), fraction: digits.slice(point) };
};

/** `integer.fraction` written with a point only when there is a fraction. */
export const joinDecimal = (sign: string, integer: string, fraction: string): string =>
  `${sign}${integer}${fraction === '' ? '' : `.${fraction}`}`;

/** Adds one to a string of decimal digits (`999` → `1000`). */
const incrementDigits = (digits: string): string => {
  const chars = digits.split('');
  let i = chars.length - 1;
  while (i >= 0 && chars[i] === '9') {
    chars[i] = '0';
    i--;
  }
  if (i < 0) {
    return `1${chars.join('')}`;
  }
  chars[i] = String.fromCharCode(chars[i].charCodeAt(0) + 1);
  return chars.join('');
};

/**
 * Rounds `integer.fraction` (no sign) to `decimals` digits after the point, half away from zero,
 * and removes the trailing zeros.
 */
export const roundDecimalDigits = (integer: string, fraction: string, decimals: number): { integer: string; fraction: string } => {
  if (fraction.length <= decimals) {
    return { integer: trimLeadingZeros(integer || '0'), fraction: trimTrailingZeros(fraction) };
  }
  const kept = (integer || '0') + fraction.slice(0, decimals);
  const roundUp = fraction.charCodeAt(decimals) >= 0x35;
  const digits = roundUp ? incrementDigits(kept) : kept;
  const point = digits.length - decimals;
  return { integer: trimLeadingZeros(digits.slice(0, point)), fraction: trimTrailingZeros(digits.slice(point)) };
};

/** A finite double written without an exponent (`1e-7` → `0.0000001`), with its sign. */
export const plainDecimalOf = (value: number): DecimalParts => {
  const text = String(Math.abs(value));
  const sign = value < 0 ? '-' : '';
  const match = /^(\d+)(?:\.(\d+))?(?:e([-+]\d+))?$/.exec(text);
  if (!match) {
    throw new NumInputError('the result is out of range');
  }
  const shifted = shiftDecimal(match[1], match[2] ?? '', match[3] === undefined ? 0 : Number(match[3]));
  return { sign, integer: shifted.integer, fraction: shifted.fraction };
};

// ---------------------------------------------------------------------------------------------
// Writing numbers
// ---------------------------------------------------------------------------------------------

const assertFinite = (value: number): void => {
  if (!Number.isFinite(value)) {
    throw new NumInputError('the result is out of range');
  }
};

/** Rule A: the floating-point error removed with 15 significant digits (`0.1 + 0.2` → `0.3`, `-0` → `0`). */
export const formatA = (value: number): string => {
  assertFinite(value);
  const cleaned = Number(value.toPrecision(15));
  return String(cleaned === 0 ? 0 : cleaned);
};

/** Rounds a double to `decimals` digits after the point, half away from zero (on its decimal form). */
export const roundNumber = (value: number, decimals: number): number => {
  assertFinite(value);
  const { sign, integer, fraction } = plainDecimalOf(value);
  const rounded = roundDecimalDigits(integer, fraction, decimals);
  const result = Number(joinDecimal(sign, rounded.integer, rounded.fraction));
  return result === 0 ? 0 : result;
};

/**
 * Rule B (values with a division, a square root or a conversion factor): the error removed as in
 * rule A, then rounded to 4 digits after the point, half away from zero, without trailing zeros.
 */
export const formatB = (value: number): string => {
  assertFinite(value);
  return String(roundNumber(Number(value.toPrecision(15)), NUM_ROUNDED_DECIMALS));
};

// ---------------------------------------------------------------------------------------------
// Values typed into the input boxes
// ---------------------------------------------------------------------------------------------

/** How a typed value is checked. */
export type NumPromptRule =
  | { kind: 'integer'; min: number; max: number }
  | { kind: 'number'; min: number; max: number }
  | { kind: 'locale' };

const INTEGER = /^[-+]?\d+$/;
const LOCALE = /^[A-Za-z0-9-]{1,35}$/;

/** True when `Intl.NumberFormat` supports the locale (a malformed tag is refused, never thrown). */
export const isSupportedLocale = (locale: string): boolean => {
  if (!LOCALE.test(locale)) {
    return false;
  }
  try {
    return Intl.NumberFormat.supportedLocalesOf([locale]).length > 0;
  } catch {
    return false;
  }
};

/**
 * Why a value typed into an input box cannot be used, or `undefined`. Spaces around a number are
 * ignored. Used as `validateInput` and checked again before running.
 */
export const findNumPromptProblem = (value: string, rule: NumPromptRule): string | undefined => {
  if (value.length > NUM_MAX_PROMPT_LENGTH) {
    return `The value is longer than ${NUM_MAX_PROMPT_LENGTH.toLocaleString('en-US')} characters.`;
  }
  const trimmed = value.trim();
  if (rule.kind === 'locale') {
    return isSupportedLocale(trimmed) ? undefined : 'Enter a supported locale such as en-US, de-DE or ja-JP.';
  }
  if (rule.kind === 'integer') {
    const ok = INTEGER.test(trimmed) && Number(trimmed) >= rule.min && Number(trimmed) <= rule.max;
    return ok ? undefined : `Enter an integer from ${rule.min} to ${rule.max}.`;
  }
  const ok = BASIC_NUMBER.test(trimmed) && Number(trimmed) >= rule.min && Number(trimmed) <= rule.max;
  return ok ? undefined : `Enter a number from ${rule.min} to ${rule.max}.`;
};
