/**
 * Shared, vscode-independent helpers of the GEN-001..030 generator commands: the errors, the
 * limits, the checks of the typed values, the output budget and the source of random values.
 *
 * Every random value of these commands comes from `crypto` (`randomBytes`, `randomInt`,
 * `randomUUID`) through `GenRandom`; `Math.random` is never used, not even for dummy names or
 * dice, so that there is one simple rule. Tests replace `GenRandom` with a fixed sequence.
 *
 * Security rules (SECURITY.md): nothing here evaluates code, no regular expression is built from
 * the user's text, every loop is linear in the input (or bounded by a constant), and the results
 * are counted against the output limit while they are built.
 */
import * as crypto from 'crypto';
import { quoteForDisplay } from '../textFormat';
import { daysFromCivil, isBlank, isValidDate } from './dateCommon';
import { EncOutputTooLargeError, MAX_OUTPUT_LENGTH } from './encodeTransforms';

export { isBlank, MAX_OUTPUT_LENGTH };

/** The selected text or a typed value cannot be used; the message is shown to the user as it is. */
export class GenInputError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'GenInputError';
  }
}

/**
 * A value exceeds a limit of a command (DATEX-016..024: a count, a size or a depth), checked
 * before anything is generated. The handler shows it as a warning (nothing is changed). It is a
 * `GenInputError`, so everything that accepts an input error accepts it too: `findGenPromptProblem`
 * turns it into a sentence (an input box never throws), and it is never logged.
 */
export class GenLimitError extends GenInputError {
  constructor(message: string) {
    super(message);
    this.name = 'GenLimitError';
  }
}

/** Upper limit of the length (UTF-16 code units) of one selection used as input (GEN-008 / 009 / 019). */
export const GEN_MAX_INPUT_LENGTH = 1_000_000;
/** Upper limit of the length of a value typed into an input box. */
export const GEN_MAX_PROMPT_LENGTH = 100;
/** Upper limit of the number of selections and cursors of one run. */
export const GEN_MAX_TARGETS = 100_000;
/** Maximum number of characters of the selected text quoted in a message. */
export const GEN_MESSAGE_TEXT_LIMIT = 60;
/**
 * Upper limit of the number of values one random choice is made from: `crypto.randomInt(min, max)`
 * needs `max - min < 2^48`.
 */
export const GEN_MAX_RANDOM_COUNT = 2 ** 48 - 1;

/** GEN-004 / 005: the number of random bytes. */
export const GEN_MIN_BYTES = 1;
export const GEN_MAX_BYTES = 1_024;
/** GEN-007: the largest absolute value of either end of the range. */
export const GEN_FLOAT_MAX_ABS = 1_000_000_000;
/** GEN-007: the largest number of decimal places. */
export const GEN_FLOAT_MAX_DIGITS = 10;
/** GEN-009: the largest number of lines picked. */
export const GEN_MAX_SAMPLE_LINES = 10_000;
/** GEN-017: the largest number of sentences. */
export const GEN_MAX_SENTENCES = 1_000;
/** GEN-019: the limits of `NdM`. */
export const GEN_MAX_DICE_COUNT = 100;
export const GEN_MIN_DICE_SIDES = 2;
export const GEN_MAX_DICE_SIDES = 1_000_000;
/** GEN-021: the largest Roman numeral (MMMCMXCIX). */
export const GEN_MAX_ROMAN = 3_999;
/** GEN-023: the largest number of terms of a number range. */
export const GEN_MAX_RANGE_TERMS = 100_000;
/** GEN-024: the largest number of characters (code points) repeated, and the largest width. */
export const GEN_MAX_REPEAT_PATTERN = 16;
export const GEN_MAX_REPEAT_WIDTH = 10_000;
/** GEN-025: the largest number of hexadecimal digits of the first value. */
export const GEN_MAX_HEX_DIGITS = 13;
/** GEN-027: the largest circled number (㊿). */
export const GEN_MAX_CIRCLED = 50;
/** GEN-028: the largest width of the column ruler. */
export const GEN_MAX_RULER_WIDTH = 1_000;

/** `text` quoted like JSON and cut to GEN_MESSAGE_TEXT_LIMIT characters (for messages). */
export const quoteText = (text: string): string => quoteForDisplay(text, GEN_MESSAGE_TEXT_LIMIT);

/** `n` with thousands separators (`1,000,000`), for messages. */
export const formatCount = (n: number): string => n.toLocaleString('en-US');

/** Refuses a selection longer than GEN_MAX_INPUT_LENGTH (checked before the text is split or parsed). */
export const assertGenInputLength = (text: string): void => {
  if (text.length > GEN_MAX_INPUT_LENGTH) {
    throw new GenInputError(`the selection is longer than ${formatCount(GEN_MAX_INPUT_LENGTH)} characters`);
  }
};

/** Refuses more than GEN_MAX_TARGETS selections and cursors. */
export const assertGenTargetCount = (count: number): void => {
  if (count > GEN_MAX_TARGETS) {
    throw new GenInputError(`there are more than ${formatCount(GEN_MAX_TARGETS)} selections and cursors`);
  }
};

const CIVIL_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

/** Whether the text is in the form `YYYY-MM-DD` (it may still not be a valid date; see parseCivilDay). */
export const isCivilDayForm = (text: string): boolean => CIVIL_DATE.test(text);

/**
 * Reads one date `YYYY-MM-DD` (0001-01-01 to 9999-12-31) as a day number (days from 1970-01-01).
 * Returns `undefined` when the text is not in that form (the caller says which form it expects)
 * and throws a `GenInputError` when it is, but is not a valid date (GEN-012 / 022).
 */
export const parseCivilDay = (text: string): number | undefined => {
  const match = CIVIL_DATE.exec(text);
  if (!match) {
    return undefined;
  }
  const [year, month, day] = match.slice(1).map(Number);
  if (!isValidDate(year, month, day)) {
    throw new GenInputError('the date must be a valid date from 0001-01-01 to 9999-12-31');
  }
  return daysFromCivil(year, month, day);
};

/** The lines of a text (split at `\r\n`, `\n` or `\r`; the line breaks are dropped). */
export const splitLines = (text: string): string[] => text.split(/\r\n|\r|\n/);

/**
 * Calls `visit` for every line of the text with the line, the line break after it (`''` for the
 * last line) and its number (from 1). LF, CRLF and CR are recognised.
 */
export const forEachLine = (text: string, visit: (line: string, lineBreak: string, lineNumber: number) => void): void => {
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

/**
 * Collects pieces of a result and throws `EncOutputTooLargeError` as soon as their total length
 * exceeds `budget` (what is left of MAX_OUTPUT_LENGTH for this selection).
 */
export class GenOutputBuffer {
  private readonly parts: string[] = [];
  private total = 0;

  constructor(private readonly budget: number) { }

  get length(): number {
    return this.total;
  }

  /** Throws when `length` more characters would exceed the budget (nothing is added). */
  reserve(length: number): void {
    if (this.total + length > this.budget) {
      throw new EncOutputTooLargeError(this.total + length, MAX_OUTPUT_LENGTH);
    }
  }

  push(part: string): void {
    this.reserve(part.length);
    this.total += part.length;
    this.parts.push(part);
  }

  join(separator = ''): string {
    return this.parts.join(separator);
  }
}

// ---------------------------------------------------------------------------------------------
// Random values
// ---------------------------------------------------------------------------------------------

/** Where the random values come from: `crypto` in the extension, a fixed sequence in tests. */
export interface GenRandom {
  /** `n` random bytes. */
  bytes(n: number): Uint8Array;
  /**
   * A uniformly distributed integer from 0 to `count - 1`. `count` must be a safe integer from 1
   * to GEN_MAX_RANDOM_COUNT; anything else is a programming error (thrown as `RangeError`).
   */
  below(count: number): number;
  /** A random (version 4) UUID, lower case. */
  uuid(): string;
}

/** Throws unless `count` can be passed to `GenRandom.below`. */
export const assertRandomCount = (count: number): void => {
  if (!Number.isSafeInteger(count) || count < 1 || count > GEN_MAX_RANDOM_COUNT) {
    throw new RangeError(`the number of values to choose from must be an integer from 1 to ${GEN_MAX_RANDOM_COUNT}`);
  }
};

/**
 * The random values of the extension. `crypto.randomInt` rejects values unbiased (rejection
 * sampling) and is always called as `randomInt(0, count)` with 1 ≤ count ≤ 2^48 − 1.
 */
export const cryptoRandom: GenRandom = {
  bytes: (n) => {
    if (!Number.isSafeInteger(n) || n < 0 || n > MAX_OUTPUT_LENGTH) {
      throw new RangeError('invalid number of random bytes');
    }
    return new Uint8Array(crypto.randomBytes(n));
  },
  below: (count) => {
    assertRandomCount(count);
    return crypto.randomInt(0, count);
  },
  uuid: () => crypto.randomUUID(),
};

/**
 * True when the range `lo..hi` (both ends included, safe integers, lo ≤ hi) holds more than
 * GEN_MAX_RANDOM_COUNT values. `hi − lo + 1` is not computed: for ends near ±(2^53 − 1) it cannot
 * be represented exactly, while `hi − lo` compared with GEN_MAX_RANDOM_COUNT − 1 is always right
 * (any difference that is rounded is far above 2^48).
 */
export const rangeTooWide = (lo: number, hi: number): boolean => hi - lo > GEN_MAX_RANDOM_COUNT - 1;

/**
 * A uniformly distributed integer from `lo` to `hi` (both included) = `lo + below(hi − lo + 1)`.
 * `hi + 1` is never computed, so `hi = Number.MAX_SAFE_INTEGER` works. The ends must be safe
 * integers with lo ≤ hi and at most GEN_MAX_RANDOM_COUNT values between them (checked by the
 * callers when they read the input; a violation here is a programming error).
 */
export const pickInclusive = (random: GenRandom, lo: number, hi: number): number => {
  if (!Number.isSafeInteger(lo) || !Number.isSafeInteger(hi) || lo > hi || rangeTooWide(lo, hi)) {
    throw new RangeError('invalid range of random values');
  }
  return lo + random.below(hi - lo + 1);
};

/** One element of `items`, chosen uniformly. */
export const pickOne = <T>(random: GenRandom, items: readonly T[]): T => items[random.below(items.length)];

// ---------------------------------------------------------------------------------------------
// Values typed into the input boxes
// ---------------------------------------------------------------------------------------------

/**
 * How a typed value is checked:
 * - `integer`: a decimal integer from `min` to `max`;
 * - `parse`: `parse` (the same function the command uses to read the value) must not throw a
 *   `GenInputError`; it also gets the (trimmed) answers of the earlier prompts of the command.
 *   With `keepSpaces`, the spaces around the value are part of it (GEN-024: the characters to
 *   repeat may be or contain spaces); otherwise they are ignored.
 */
export type GenPromptRule =
  | { kind: 'integer'; min: number; max: number }
  | { kind: 'parse'; parse: (value: string, previous: readonly string[]) => unknown; keepSpaces?: boolean };

/** The value a command gets from what was typed: trimmed unless the rule keeps the spaces. */
export const genPromptValue = (value: string, rule: GenPromptRule): string =>
  rule.kind === 'parse' && rule.keepSpaces ? value : value.trim();

const INTEGER = /^[-+]?\d{1,15}$/;

/** `message` as a sentence (capital first letter, full stop). */
export const toSentence = (message: string): string =>
  `${message[0].toUpperCase()}${message.slice(1)}${message.endsWith('.') ? '' : '.'}`;

/**
 * Why a value typed into an input box cannot be used (a sentence), or `undefined`. Spaces around
 * the value are ignored (unless the rule keeps them). Used as `validateInput` and checked again
 * before running. A `GenLimitError` thrown by `parse` is a `GenInputError` and becomes a sentence
 * too (it never escapes from `validateInput`).
 */
export const findGenPromptProblem = (value: string, rule: GenPromptRule, previous: readonly string[] = []): string | undefined => {
  if (value.length > GEN_MAX_PROMPT_LENGTH) {
    return `The value is longer than ${GEN_MAX_PROMPT_LENGTH} characters.`;
  }
  const trimmed = genPromptValue(value, rule);
  if (rule.kind === 'integer') {
    const ok = INTEGER.test(trimmed) && Number(trimmed) >= rule.min && Number(trimmed) <= rule.max;
    return ok ? undefined : `Enter an integer from ${formatCount(rule.min)} to ${formatCount(rule.max)}.`;
  }
  try {
    rule.parse(trimmed, previous);
    return undefined;
  } catch (error) {
    if (error instanceof GenInputError) {
      return toSentence(error.message);
    }
    throw error;
  }
};
