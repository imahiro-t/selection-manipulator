/**
 * Shared, vscode-independent helpers of the DATE-001..030 date commands: the errors, the limits,
 * the calendar arithmetic (proleptic Gregorian calendar on day numbers, independent of the time
 * zone of the environment), the strict parsing of dates, the line-by-line processing and the
 * checks of the typed values and of the settings.
 *
 * Security rules (SECURITY.md): nothing here evaluates code, no regular expression is built from
 * the user's text, every loop is linear in the input (or bounded by a constant), and the results
 * are counted against the output limit while they are built. Only `Date` and `Intl` are used.
 */
import { quoteForDisplay } from '../textFormat';
import { parseDate } from './dateUtils';
import { EncOutputTooLargeError, MAX_OUTPUT_LENGTH } from './encodeTransforms';

export { MAX_OUTPUT_LENGTH };

/** The selected text or a typed value cannot be used; the message is shown to the user as it is. */
export class DateInputError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'DateInputError';
  }
}

/** A setting of the date commands has a value that cannot be used. */
export class DateSettingError extends DateInputError {
  constructor(key: string) {
    super(`the setting selection-manipulator.date.${key} is invalid`);
    this.name = 'DateSettingError';
  }
}

/** Upper limit of the length (UTF-16 code units) of one selection. */
export const DATE_MAX_INPUT_LENGTH = 1_000_000;
/** Upper limit of the length of a value typed into an input box. */
export const DATE_MAX_PROMPT_LENGTH = 100;
/** Upper limit of the length of a time zone name. */
export const DATE_MAX_TIMEZONE_LENGTH = 64;
/** DATE-003: upper limit of the number of time zones in the setting. */
export const DATE_MAX_TIMEZONES = 20;
/** DATE-022: upper limit of the number of dates of one range. */
export const DATE_MAX_RANGE_ENTRIES = 10_000;
/** DATE-025: number of next runs shown. */
export const DATE_CRON_RUNS = 5;
/** DATE-025: how many years ahead the next runs are searched. */
export const DATE_CRON_SEARCH_YEARS = 8;
/** DATE-025: upper limit of the length of one cron expression. */
export const DATE_MAX_CRON_LENGTH = 200;
/** DATE-025: upper limit of the number of cron expressions (non-blank lines) of one run. */
export const DATE_MAX_CRON_LINES = 1_000;
/** DATE-004: number of values shown in the notification. */
export const DATE_NOTIFY_ITEMS = 20;
/** DATE-019 / 020: the Excel serial of 9999-12-31. */
export const DATE_EXCEL_MAX_SERIAL = 2_958_465;
/** Maximum number of characters of the selected text quoted in a message. */
export const DATE_MESSAGE_TEXT_LIMIT = 60;

/** `text` quoted like JSON and cut to DATE_MESSAGE_TEXT_LIMIT characters (for messages). */
export const quoteText = (text: string): string => quoteForDisplay(text, DATE_MESSAGE_TEXT_LIMIT);

/**
 * `text` without quotes, cut to DATE_MESSAGE_TEXT_LIMIT characters with `…` (for a notification
 * that shows values rather than errors). Surrogate pairs are never split.
 */
export const truncateText = (text: string): string => {
  let shown = '';
  let count = 0;
  for (const ch of text) {
    if (count === DATE_MESSAGE_TEXT_LIMIT) {
      return `${shown}…`;
    }
    shown += ch;
    count++;
  }
  return shown;
};

export const assertDateInputLength = (text: string): void => {
  if (text.length > DATE_MAX_INPUT_LENGTH) {
    throw new DateInputError(`the selection is longer than ${DATE_MAX_INPUT_LENGTH.toLocaleString('en-US')} characters`);
  }
};

/** True when the text holds only spaces, tabs and line breaks (or nothing). */
export const isBlank = (text: string): boolean => !/[^ \t\r\n]/.test(text);

export const notADate = (value: string): DateInputError => new DateInputError(`${quoteText(value)} is not a date`);

/**
 * Collects pieces of a result and throws `EncOutputTooLargeError` as soon as their total length
 * exceeds `budget` (what is left of MAX_OUTPUT_LENGTH for this selection).
 */
export class DateOutputBuffer {
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

  join(): string {
    return this.parts.join('');
  }
}

// ---------------------------------------------------------------------------------------------
// Calendar (proleptic Gregorian, day numbers counted from 1970-01-01)
// ---------------------------------------------------------------------------------------------

export const MS_PER_DAY = 86_400_000;
export const MIN_YEAR = 1;
export const MAX_YEAR = 9999;

/** Japanese weekday names, Sunday first (index = day of week 0..6). */
export const WEEKDAYS_JA: readonly string[] = ['日', '月', '火', '水', '木', '金', '土'];

export interface CivilDate {
  year: number;
  month: number;
  day: number;
}

export const isLeapYear = (year: number): boolean => (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;

export const daysInMonth = (year: number, month: number): number =>
  month === 2 ? (isLeapYear(year) ? 29 : 28) : [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][month - 1];

export const isValidDate = (year: number, month: number, day: number): boolean =>
  Number.isInteger(year) && Number.isInteger(month) && Number.isInteger(day)
  && year >= MIN_YEAR && year <= MAX_YEAR && month >= 1 && month <= 12 && day >= 1 && day <= daysInMonth(year, month);

/** Days from 1970-01-01 to the date (negative before it); H. Hinnant's algorithm, exact for any year. */
export const daysFromCivil = (year: number, month: number, day: number): number => {
  const y = month <= 2 ? year - 1 : year;
  const era = Math.floor(y / 400);
  const yoe = y - era * 400;
  const mp = (month + 9) % 12;
  const doy = Math.floor((153 * mp + 2) / 5) + day - 1;
  const doe = yoe * 365 + Math.floor(yoe / 4) - Math.floor(yoe / 100) + doy;
  return era * 146_097 + doe - 719_468;
};

/** The date of a day number (the inverse of `daysFromCivil`). */
export const civilFromDays = (days: number): CivilDate => {
  const z = days + 719_468;
  const era = Math.floor(z / 146_097);
  const doe = z - era * 146_097;
  const yoe = Math.floor((doe - Math.floor(doe / 1460) + Math.floor(doe / 36_524) - Math.floor(doe / 146_096)) / 365);
  const doy = doe - (365 * yoe + Math.floor(yoe / 4) - Math.floor(yoe / 100));
  const mp = Math.floor((5 * doy + 2) / 153);
  const day = doy - Math.floor((153 * mp + 2) / 5) + 1;
  const month = mp < 10 ? mp + 3 : mp - 9;
  return { year: yoe + era * 400 + (month <= 2 ? 1 : 0), month, day };
};

/** 0 = Sunday … 6 = Saturday. */
export const weekdayOf = (days: number): number => (((days + 4) % 7) + 7) % 7;

/** Milliseconds from the epoch of a calendar date and time read as UTC (no `Date` quirks for years < 100). */
export const utcMillis = (date: CivilDate, hour = 0, minute = 0, second = 0, millisecond = 0): number =>
  daysFromCivil(date.year, date.month, date.day) * MS_PER_DAY + ((hour * 60 + minute) * 60 + second) * 1000 + millisecond;

/** The local calendar date of a `Date` (the time zone of the environment). */
export const localCivilOf = (date: Date): CivilDate => ({ year: date.getFullYear(), month: date.getMonth() + 1, day: date.getDate() });

/** Milliseconds from local midnight of a `Date`. */
export const localMillisOfDay = (date: Date): number =>
  ((date.getHours() * 60 + date.getMinutes()) * 60 + date.getSeconds()) * 1000 + date.getMilliseconds();

export const pad2 = (n: number): string => String(n).padStart(2, '0');
export const pad4 = (n: number): string => String(n).padStart(4, '0');

/** `YYYY-MM-DD` (or with `/`), zero-padded. */
export const formatCivil = (date: CivilDate, separator = '-'): string =>
  `${pad4(date.year)}${separator}${pad2(date.month)}${separator}${pad2(date.day)}`;

/** The date `days` days after `date`; a result outside 0001..9999 is an error. */
export const addDaysToCivil = (date: CivilDate, days: number): CivilDate => {
  const result = civilFromDays(daysFromCivil(date.year, date.month, date.day) + days);
  if (result.year < MIN_YEAR || result.year > MAX_YEAR) {
    throw new DateInputError('the result is outside the years 0001 to 9999');
  }
  return result;
};

// ---------------------------------------------------------------------------------------------
// Parsing
// ---------------------------------------------------------------------------------------------

/** A date or a date and time as written, with what is needed to write it back. */
export interface DateValue extends CivilDate {
  hasTime: boolean;
  hour: number;
  minute: number;
  second: number;
  millisecond: number;
  /** Offset from UTC in minutes (`Z` = 0), or `undefined` when none is written. */
  offsetMinutes: number | undefined;
  /** The separator of the date part. */
  separator: '-' | '/';
  /** Everything after the date part as written (`T09:00+09:00`), `''` for a date. */
  rest: string;
}

const DATE_VALUE = /^(\d{4})([-/])(\d{1,2})\2(\d{1,2})((?:[T ])(\d{2}):(\d{2})(?::(\d{2})(?:\.(\d{1,3}))?)?(Z|[+-]\d{2}:?\d{2})?)?$/;

/**
 * Parses `YYYY-MM-DD` / `YYYY/MM/DD` (month and day of 1 or 2 digits, year 0001..9999), optionally
 * followed by `T` or one space and `HH:mm`, `HH:mm:ss` or `HH:mm:ss.SSS`, optionally followed by
 * `Z`, `±HH:MM` or `±HHMM`. A date that does not exist is an error. `new Date(text)` is never used.
 */
export const parseDateValue = (text: string): DateValue => {
  const match = DATE_VALUE.exec(text);
  if (!match) {
    throw notADate(text);
  }
  const year = Number(match[1]);
  const month = Number(match[3]);
  const day = Number(match[4]);
  if (!isValidDate(year, month, day)) {
    throw new DateInputError(`${quoteText(text)} is not a valid date`);
  }
  const hasTime = match[5] !== undefined;
  const hour = hasTime ? Number(match[6]) : 0;
  const minute = hasTime ? Number(match[7]) : 0;
  const second = match[8] === undefined ? 0 : Number(match[8]);
  const millisecond = match[9] === undefined ? 0 : Number(match[9].padEnd(3, '0'));
  if (hour > 23 || minute > 59 || second > 59) {
    throw new DateInputError(`${quoteText(text)} is not a valid time`);
  }
  let offsetMinutes: number | undefined;
  const offset = match[10];
  if (offset !== undefined) {
    if (offset === 'Z') {
      offsetMinutes = 0;
    } else {
      const digits = offset.slice(1).replace(':', '');
      const offsetHours = Number(digits.slice(0, 2));
      const offsetMins = Number(digits.slice(2));
      if (offsetHours > 23 || offsetMins > 59) {
        throw new DateInputError(`${quoteText(text)} has an invalid time zone offset`);
      }
      offsetMinutes = (offset[0] === '-' ? -1 : 1) * (offsetHours * 60 + offsetMins);
    }
  }
  return {
    year, month, day, hasTime, hour, minute, second, millisecond, offsetMinutes,
    separator: match[2] as '-' | '/',
    rest: match[5] ?? '',
  };
};

/** Milliseconds from the epoch of the written calendar date and time (the offset is ignored). */
export const wallMillis = (value: DateValue): number => utcMillis(value, value.hour, value.minute, value.second, value.millisecond);

/** A local date and time of the environment as a `Date` (years below 100 included). */
export const localDate = (date: CivilDate, hour = 0, minute = 0, second = 0, millisecond = 0): Date => {
  const result = new Date(0);
  result.setFullYear(date.year, date.month - 1, date.day);
  result.setHours(hour, minute, second, millisecond);
  return result;
};

/**
 * The instant of a parsed value: with an offset, that instant; a date alone, UTC midnight; a date
 * and time without an offset, the local time of the environment (as JavaScript's `Date`).
 */
export const instantOfValue = (value: DateValue): number => {
  if (value.offsetMinutes !== undefined) {
    return wallMillis(value) - value.offsetMinutes * 60_000;
  }
  if (!value.hasTime) {
    return wallMillis(value);
  }
  return localDate(value, value.hour, value.minute, value.second, value.millisecond).getTime();
};

const TIMESTAMP = /^-?\d{1,13}$/;

/** True when the value is a Unix timestamp accepted by the commands that need an instant. */
export const isTimestamp = (text: string): boolean => TIMESTAMP.test(text);

/**
 * The instant (milliseconds from the epoch) of a value of the commands that need one (DATE-001,
 * 002, 003, 011, 026, 027): a Unix timestamp (seconds or milliseconds, decided as by the existing
 * date commands) or a date / date and time (see `instantOfValue`).
 */
export const parseInstant = (text: string): number => {
  if (isTimestamp(text)) {
    const date = parseDate(text);
    if (date === null || Number.isNaN(date.getTime())) {
      throw notADate(text);
    }
    return date.getTime();
  }
  return instantOfValue(parseDateValue(text));
};

// ---------------------------------------------------------------------------------------------
// Lines
// ---------------------------------------------------------------------------------------------

const SPACE_TAB = /^[ \t]*/;

/** One line of a selection split into its parts. */
interface LineParts {
  line: string;
  lead: string;
  value: string;
  trail: string;
}

const splitLine = (line: string): LineParts => {
  const lead = SPACE_TAB.exec(line)![0];
  let trailStart = line.length;
  while (trailStart > lead.length && (line.charCodeAt(trailStart - 1) === 0x20 || line.charCodeAt(trailStart - 1) === 0x09)) {
    trailStart--;
  }
  return { line, lead, value: line.slice(lead.length, trailStart), trail: line.slice(trailStart) };
};

/**
 * Calls `visit` for every line of the text with the line itself and the line break after it
 * (`''` for the last line). LF and CRLF are recognised.
 */
const forEachLine = (text: string, visit: (line: string, lineBreak: string, lineNumber: number) => void): void => {
  let start = 0;
  let lineNumber = 1;
  for (;;) {
    const newline = text.indexOf('\n', start);
    const end = newline === -1 ? text.length : newline;
    const breakStart = end > start && text.charCodeAt(end - 1) === 0x0d ? end - 1 : end;
    visit(text.slice(start, breakStart), newline === -1 ? '' : text.slice(breakStart, newline + 1), lineNumber);
    if (newline === -1) {
      return;
    }
    start = newline + 1;
    lineNumber++;
  }
};

/** Prefixes the message of an input error with `line N: `. */
const atLine = (lineNumber: number, error: unknown): unknown =>
  error instanceof DateInputError ? new DateInputError(`line ${lineNumber}: ${error.message}`) : error;

/** The values (lines without the spaces and tabs around them) of a text, skipping blank lines. */
export const dateLineValues = (text: string): { value: string; lineNumber: number }[] => {
  assertDateInputLength(text);
  const values: { value: string; lineNumber: number }[] = [];
  forEachLine(text, (line, _lineBreak, lineNumber) => {
    const { value } = splitLine(line);
    if (value !== '') {
      values.push({ value, lineNumber });
    }
  });
  return values;
};

/**
 * Applies `convert` to every line of the selection. The line breaks (LF / CRLF) and the spaces /
 * tabs around each value are kept; an empty (or blank) line stays as it is and is not passed to
 * `convert`. A result of several lines (an array) is joined with `eol` and the indentation of the
 * value. A value that cannot be converted stops everything with `line N: <reason>`. The result is
 * counted against `budget` piece by piece.
 */
export const mapDateLines = (
  text: string,
  budget: number,
  eol: string,
  convert: (value: string, output: DateOutputBuffer) => string | readonly string[]
): string => {
  assertDateInputLength(text);
  const output = new DateOutputBuffer(budget);
  forEachLine(text, (line, lineBreak, lineNumber) => {
    const { lead, value, trail } = splitLine(line);
    if (value === '') {
      output.push(line);
    } else {
      let converted: string | readonly string[];
      try {
        converted = convert(value, output);
      } catch (error) {
        throw atLine(lineNumber, error);
      }
      output.push(lead);
      if (typeof converted === 'string') {
        output.push(converted);
      } else {
        converted.forEach((piece, i) => {
          if (i > 0) {
            output.push(eol);
            output.push(lead);
          }
          output.push(piece);
        });
      }
      output.push(trail);
    }
    output.push(lineBreak);
  });
  return output.join();
};

// ---------------------------------------------------------------------------------------------
// Values typed into the input boxes
// ---------------------------------------------------------------------------------------------

/** How a typed value is checked. */
export type DatePromptRule =
  | { kind: 'integer'; min: number; max: number }
  | { kind: 'timeZone' }
  | { kind: 'pattern' };

const INTEGER = /^[-+]?\d{1,15}$/;
const TIME_ZONE = /^[A-Za-z0-9_+\-/]{1,64}$/;

/** True when `Intl.DateTimeFormat` accepts the IANA time zone name (checked for its form first, never thrown). */
export const isSupportedTimeZone = (timeZone: string): boolean => {
  if (timeZone.length > DATE_MAX_TIMEZONE_LENGTH || !TIME_ZONE.test(timeZone)) {
    return false;
  }
  try {
    new Intl.DateTimeFormat('en-US', { timeZone });
    return true;
  } catch {
    return false;
  }
};

// ---------------------------------------------------------------------------------------------
// DATE-012 patterns
// ---------------------------------------------------------------------------------------------

/** The pattern letters and the run lengths they accept. */
const PATTERN_LETTERS: Record<string, readonly number[]> = {
  y: [2, 4], M: [1, 2], d: [1, 2], H: [1, 2], h: [1, 2], m: [1, 2], s: [1, 2], S: [3], a: [1], E: [1, 4],
};

/** A piece of a compiled pattern: a token (`yyyy`, `MM`, …) or literal text. */
export type PatternPiece = { token: string } | { literal: string };

const isAsciiLetter = (ch: string): boolean => /^[A-Za-z]$/.test(ch);

/**
 * Splits a DATE-012 pattern, scanning once from the left: `'…'` is literal text (`''` is one `'`,
 * inside or outside quotes), a run of the same letter is one unit (a token when the letter is
 * defined and the run has a defined length, an error when the letter is defined but the length is
 * not, literal text otherwise), anything else is literal text.
 */
export const compilePattern = (pattern: string): PatternPiece[] => {
  const pieces: PatternPiece[] = [];
  let literal = '';
  let i = 0;
  while (i < pattern.length) {
    const ch = pattern[i];
    if (ch === "'") {
      if (pattern[i + 1] === "'") {
        literal += "'";
        i += 2;
        continue;
      }
      i++;
      for (;;) {
        if (i >= pattern.length) {
          throw new DateInputError('the pattern has an unterminated quote');
        }
        if (pattern[i] === "'") {
          if (pattern[i + 1] === "'") {
            literal += "'";
            i += 2;
            continue;
          }
          i++;
          break;
        }
        literal += pattern[i];
        i++;
      }
      continue;
    }
    if (isAsciiLetter(ch)) {
      let end = i + 1;
      while (end < pattern.length && pattern[end] === ch) {
        end++;
      }
      const run = pattern.slice(i, end);
      const lengths = PATTERN_LETTERS[ch];
      if (lengths === undefined) {
        literal += run;
      } else if (lengths.includes(run.length)) {
        if (literal !== '') {
          pieces.push({ literal });
          literal = '';
        }
        pieces.push({ token: run });
      } else {
        throw new DateInputError(`unsupported pattern token ${quoteText(run)}`);
      }
      i = end;
      continue;
    }
    literal += ch;
    i++;
  }
  if (literal !== '') {
    pieces.push({ literal });
  }
  return pieces;
};

/** Why a pattern cannot be used (a sentence for the input box), or `undefined`. */
const findPatternProblem = (pattern: string): string | undefined => {
  try {
    compilePattern(pattern);
    return undefined;
  } catch (error) {
    if (error instanceof DateInputError) {
      const message = error.message;
      return `${message[0].toUpperCase()}${message.slice(1)}.`;
    }
    throw error;
  }
};

/**
 * Why a value typed into an input box cannot be used, or `undefined`. Spaces around the value are
 * ignored. Used as `validateInput` and checked again before running.
 */
export const findDatePromptProblem = (value: string, rule: DatePromptRule): string | undefined => {
  if (value.length > DATE_MAX_PROMPT_LENGTH) {
    return `The value is longer than ${DATE_MAX_PROMPT_LENGTH} characters.`;
  }
  const trimmed = value.trim();
  if (rule.kind === 'timeZone') {
    return isSupportedTimeZone(trimmed) ? undefined : 'Enter an IANA time zone such as Asia/Tokyo, UTC or America/New_York.';
  }
  if (rule.kind === 'pattern') {
    if (trimmed === '') {
      return 'Enter a pattern such as yyyy/MM/dd HH:mm.';
    }
    return findPatternProblem(trimmed);
  }
  const ok = INTEGER.test(trimmed) && Number(trimmed) >= rule.min && Number(trimmed) <= rule.max;
  return ok ? undefined : `Enter an integer from ${rule.min.toLocaleString('en-US')} to ${rule.max.toLocaleString('en-US')}.`;
};

// ---------------------------------------------------------------------------------------------
// Settings
// ---------------------------------------------------------------------------------------------

export type WeekdayLanguage = 'ja' | 'en';

export interface DateSettings {
  timeZones: readonly string[];
  weekdayLanguage: WeekdayLanguage;
  fiscalYearStartMonth: number;
}

export type DateSettingKey = keyof DateSettings;

export const DEFAULT_DATE_SETTINGS: DateSettings = {
  timeZones: ['UTC', 'Asia/Tokyo', 'America/Los_Angeles'],
  weekdayLanguage: 'ja',
  fiscalYearStartMonth: 4,
};

/** The raw values of the settings (`undefined` = not set). */
export type RawDateSettings = Partial<Record<DateSettingKey, unknown>>;

/**
 * The settings used by a command, checked (a value that is not set takes the default). Only the
 * settings named in `keys` are checked, so a broken setting only stops the commands that use it.
 */
export const readDateSettings = (raw: RawDateSettings, keys: readonly DateSettingKey[]): DateSettings => {
  const settings: DateSettings = { ...DEFAULT_DATE_SETTINGS };
  if (keys.includes('timeZones') && raw.timeZones !== undefined) {
    const value = raw.timeZones;
    if (!Array.isArray(value) || value.length === 0 || value.length > DATE_MAX_TIMEZONES
      || !value.every((zone) => typeof zone === 'string' && isSupportedTimeZone(zone))) {
      throw new DateSettingError('timeZones');
    }
    settings.timeZones = [...value] as string[];
  }
  if (keys.includes('weekdayLanguage') && raw.weekdayLanguage !== undefined) {
    if (raw.weekdayLanguage !== 'ja' && raw.weekdayLanguage !== 'en') {
      throw new DateSettingError('weekdayLanguage');
    }
    settings.weekdayLanguage = raw.weekdayLanguage;
  }
  if (keys.includes('fiscalYearStartMonth') && raw.fiscalYearStartMonth !== undefined) {
    const value = raw.fiscalYearStartMonth;
    if (typeof value !== 'number' || !Number.isInteger(value) || value < 1 || value > 12) {
      throw new DateSettingError('fiscalYearStartMonth');
    }
    settings.fiscalYearStartMonth = value;
  }
  return settings;
};
