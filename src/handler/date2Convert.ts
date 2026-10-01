/**
 * Pure (vscode-independent) conversions of one value of the DATEX-001..015 extended date commands
 * (group DATE2). Every function takes one value (a line without the spaces around it) and throws
 * `DateInputError` when it cannot be converted.
 *
 * Calendar arithmetic uses day numbers (`daysFromCivil`), so it does not depend on the time zone
 * of the environment. `new Date(text)` is never used: the values are read with fixed regular
 * expressions (no nested quantifiers) and digits are counted before `BigInt` is used.
 *
 * Only local processing: no network, files or processes, no `eval` / `new Function`, no new
 * dependency (`Date`, `Intl` and `BigInt` only).
 */
import {
  CivilDate,
  civilFromDays,
  DateInputError,
  DateValue,
  daysFromCivil,
  daysInMonth,
  formatCivil,
  isLeapYear,
  MAX_YEAR,
  MIN_YEAR,
  MS_PER_DAY,
  pad2,
  parseDateValue,
  parseInstant,
  quoteText,
  weekdayOf,
} from './dateCommon';
import { formatOffset, splitPair, TimeZoneCache, zonedTime } from './dateConvert';

const OUT_OF_RANGE = 'the result is outside the years 0001 to 9999';

/** The first and the last day numbers of the years 0001..9999. */
const FIRST_DAY = daysFromCivil(MIN_YEAR, 1, 1);
const LAST_DAY = daysFromCivil(MAX_YEAR, 12, 31);
/** The last millisecond of 9999-12-31 (UTC). */
const LAST_MILLIS = (LAST_DAY + 1) * MS_PER_DAY - 1;

const daysOf = (date: CivilDate): number => daysFromCivil(date.year, date.month, date.day);

const checkedCivil = (days: number): CivilDate => {
  if (days < FIRST_DAY || days > LAST_DAY) {
    throw new DateInputError(OUT_OF_RANGE);
  }
  return civilFromDays(days);
};

/** The date part replaced, written back with its separator and its time part as written. */
const writeBack = (value: DateValue, date: CivilDate): string => `${formatCivil(date, value.separator)}${value.rest}`;

/** ISO weekday: 1 = Monday … 7 = Sunday. */
const isoWeekdayOf = (days: number): number => (weekdayOf(days) === 0 ? 7 : weekdayOf(days));

const pad3 = (n: number): string => String(n).padStart(3, '0');

/** The instant itself when it is in the years 0001..9999 (UTC); OUT_OF_RANGE otherwise. */
const checkedMillis = (millis: number): number => {
  if (!Number.isSafeInteger(millis) || millis < FIRST_DAY * MS_PER_DAY || millis > LAST_MILLIS) {
    throw new DateInputError(OUT_OF_RANGE);
  }
  return millis;
};

/** `2016-07-30T23:54:10.259Z` for an instant in 0001..9999 (checked). */
const isoOfMillis = (millis: number): string => new Date(checkedMillis(millis)).toISOString();

// ---------------------------------------------------------------------------------------------
// DATEX-001 / 002: ISO 8601 durations
// ---------------------------------------------------------------------------------------------

/** An ISO 8601 duration; every element is 0 or more (the sign applies to all of them). */
export interface IsoDuration {
  negative: boolean;
  years: number;
  months: number;
  weeks: number;
  days: number;
  hours: number;
  minutes: number;
  /** Whole seconds. */
  seconds: number;
  /** Milliseconds of the seconds element (0..999). */
  milliseconds: number;
  /** Whether a time element (H, M or S after T) is written. */
  hasTime: boolean;
}

/** Elements of up to 9 digits (only the seconds may have up to 3 decimals). */
const ISO_DURATION = /^([-+]?)P(?:(\d{1,9})Y)?(?:(\d{1,9})M)?(?:(\d{1,9})W)?(?:(\d{1,9})D)?(?:T(?:(\d{1,9})H)?(?:(\d{1,9})M)?(?:(\d{1,9})(?:[.,](\d{1,3}))?S)?)?$/;

/**
 * DATEX-001: reads `P1DT2H`, `-P1M`, `PT1.5S`, `P1Y2M3W4DT5H6M7.890S` (case is ignored; a leading
 * `-` subtracts). Every element is an integer of up to 9 digits; only the seconds may have up to 3
 * decimals. At least one element must be written and `T` must be followed by one.
 */
export const parseIsoDuration = (text: string): IsoDuration => {
  const upper = text.toUpperCase();
  const match = ISO_DURATION.exec(upper);
  const invalid = () => new DateInputError(`${quoteText(text)} is not an ISO 8601 duration such as P1DT2H (elements of up to 9 digits)`);
  if (!match || upper.endsWith('T') || match.slice(2, 9).every((n) => n === undefined)) {
    throw invalid();
  }
  const n = (index: number): number => (match[index] === undefined ? 0 : Number(match[index]));
  return {
    negative: match[1] === '-',
    years: n(2),
    months: n(3),
    weeks: n(4),
    days: n(5),
    hours: n(6),
    minutes: n(7),
    seconds: n(8),
    milliseconds: match[9] === undefined ? 0 : Number(match[9].padEnd(3, '0')),
    hasTime: match[6] !== undefined || match[7] !== undefined || match[8] !== undefined,
  };
};

/** `T09:00:00` (`T09:00:00.500` when the milliseconds are not 0), with the joiner given. */
const formatTime = (joiner: string, millisOfDay: number): string => {
  const ms = millisOfDay % 1000;
  const totalSeconds = Math.floor(millisOfDay / 1000);
  const text = `${joiner}${pad2(Math.floor(totalSeconds / 3600))}:${pad2(Math.floor(totalSeconds / 60) % 60)}:${pad2(totalSeconds % 60)}`;
  return ms === 0 ? text : `${text}.${pad3(ms)}`;
};

/** `Z` when written so, otherwise `±HH:MM` (`''` without an offset). */
const offsetText = (value: DateValue): string => {
  if (value.offsetMinutes === undefined) {
    return '';
  }
  return value.rest.endsWith('Z') ? 'Z' : formatOffset(value.offsetMinutes * 60);
};

/**
 * DATEX-001: adds (or subtracts) a duration to a date or a date and time. The years and months
 * move the calendar month (a day past the end of the month becomes its last day, as Add Months),
 * the weeks and days move the calendar day, the hours, minutes and seconds move the time. The
 * written date and time are used as they are (no time zone conversion) and the offset is written
 * back. A date alone with only Y / M / W / D stays a date; otherwise the result is
 * `YYYY-MM-DDTHH:MM:SS` (`.sss` when the milliseconds are not 0) followed by the offset.
 */
export const addIsoDuration = (value: string, duration: IsoDuration): string => {
  const date = parseDateValue(value);
  const sign = duration.negative ? -1 : 1;
  // Calendar months first.
  const totalMonths = date.year * 12 + (date.month - 1) + sign * (duration.years * 12 + duration.months);
  const year = Math.floor(totalMonths / 12);
  const month = totalMonths - year * 12 + 1;
  if (year < MIN_YEAR || year > MAX_YEAR) {
    throw new DateInputError(OUT_OF_RANGE);
  }
  let days = daysFromCivil(year, month, Math.min(date.day, daysInMonth(year, month)));
  // Then calendar days (at most about 8e9: exact).
  days += sign * (duration.weeks * 7 + duration.days);
  // Then the time (at most about 3.7e15 ms: exact).
  const millisOfDay = ((date.hour * 60 + date.minute) * 60 + date.second) * 1000 + date.millisecond;
  const timeMillis = ((duration.hours * 60 + duration.minutes) * 60 + duration.seconds) * 1000 + duration.milliseconds;
  const totalMillis = millisOfDay + sign * timeMillis;
  const carry = Math.floor(totalMillis / MS_PER_DAY);
  days += carry;
  const result = checkedCivil(days);
  const dateText = formatCivil(result, date.separator);
  if (!date.hasTime && !duration.hasTime) {
    return dateText;
  }
  // The joiner as written (`T` or a space); `T` for a date alone.
  const joiner = date.hasTime ? date.rest[0] : 'T';
  return `${dateText}${formatTime(joiner, totalMillis - carry * MS_PER_DAY)}${offsetText(date)}`;
};

const SECONDS = /^(\d{1,16})(?:\.(\d{1,3}))?$/;

/**
 * DATEX-002: `5400` → `PT1H30M`. A number of seconds of 0 or more (a safe integer, up to 3
 * decimals) as days, hours, minutes and seconds; the elements that are 0 are left out (`PT0S` for
 * 0). Years and months are never used (their length is not fixed).
 */
export const secondsToIsoDuration = (value: string): string => {
  const match = SECONDS.exec(value);
  if (!match || !Number.isSafeInteger(Number(match[1]))) {
    throw new DateInputError(`${quoteText(value)} is not a number of seconds of 0 or more`);
  }
  const total = Number(match[1]);
  const fraction = (match[2] ?? '').replace(/0+$/, '');
  const days = Math.floor(total / 86_400);
  const hours = Math.floor(total / 3600) % 24;
  const minutes = Math.floor(total / 60) % 60;
  const seconds = total % 60;
  const datePart = days > 0 ? `${days}D` : '';
  let time = '';
  if (hours > 0) {
    time += `${hours}H`;
  }
  if (minutes > 0) {
    time += `${minutes}M`;
  }
  if (seconds > 0 || fraction !== '') {
    time += `${seconds}${fraction === '' ? '' : `.${fraction}`}S`;
  }
  if (datePart === '' && time === '') {
    return 'PT0S';
  }
  return `P${datePart}${time === '' ? '' : `T${time}`}`;
};

// ---------------------------------------------------------------------------------------------
// DATEX-003 / 004: start and end of the month
// ---------------------------------------------------------------------------------------------

/** DATEX-003: the first day of the month (the time part is kept as written). */
export const startOfMonth = (value: string): string => {
  const date = parseDateValue(value);
  return writeBack(date, { year: date.year, month: date.month, day: 1 });
};

/** DATEX-004: the last day of the month (leap years included; the time part is kept as written). */
export const endOfMonth = (value: string): string => {
  const date = parseDateValue(value);
  return writeBack(date, { year: date.year, month: date.month, day: daysInMonth(date.year, date.month) });
};

// ---------------------------------------------------------------------------------------------
// DATEX-005 / 006: business days (Monday to Friday; holidays are not known)
// ---------------------------------------------------------------------------------------------

/** DATEX-005: the largest number of business days added or subtracted. */
export const DATE2_MAX_BUSINESS_DAYS = 100_000;

/**
 * The day number `n` business days after (before, when negative) `days`, as Excel's WORKDAY: a
 * weekend start counts from the Friday before (adding) or the Monday after (subtracting), so
 * Saturday + 1 is Monday and Saturday − 1 is Friday. Computed in weeks and a remainder (no loop
 * over the days).
 */
export const addBusinessDaysTo = (days: number, n: number): number => {
  if (n === 0) {
    return days;
  }
  let start = days;
  const weekday = isoWeekdayOf(start);
  if (weekday >= 6) {
    start += n > 0 ? 5 - weekday : 8 - weekday;
  }
  const w = isoWeekdayOf(start) - 1; // 0 = Monday … 4 = Friday
  const count = Math.abs(n);
  const weeks = Math.floor(count / 5);
  const rest = count % 5;
  if (n > 0) {
    return start + weeks * 7 + (w + rest >= 5 ? rest + 2 : rest);
  }
  return start - weeks * 7 - (w - rest < 0 ? rest + 2 : rest);
};

/** DATEX-005: the date part moved by `n` business days (the time part is kept as written). */
export const addBusinessDays = (value: string, n: number): string => {
  const date = parseDateValue(value);
  return writeBack(date, checkedCivil(addBusinessDaysTo(daysOf(date), n)));
};

/** A Monday (1970-01-05): the weekdays are counted from it. */
const BASE_MONDAY = daysFromCivil(1970, 1, 5);

/** The number of weekdays before the day `days`, counted from BASE_MONDAY (negative before it). */
const weekdaysBefore = (days: number): number => {
  const k = days - BASE_MONDAY;
  const weeks = Math.floor(k / 7);
  return weeks * 5 + Math.min(k - weeks * 7, 5);
};

/** DATEX-006: weekdays from `from` (included) to `to` (not included); negative when `to` is earlier. */
export const businessDaysBetweenDays = (from: number, to: number): number => weekdaysBefore(to) - weekdaysBefore(from);

const WHITESPACE_PAIR = /^(\S+)[ \t]+(\S+)$/;

/** `2026-10-01 2026-10-08` → the two values separated by spaces or tabs; `undefined` otherwise. */
const splitWhitespacePair = (value: string): [string, string] | undefined => {
  const match = WHITESPACE_PAIR.exec(value);
  return match ? [match[1], match[2]] : undefined;
};

/**
 * DATEX-006: `2026-10-01 2026-10-08` → `5`. Two dates on one line, separated as by Difference
 * Between Two Dates (` / `, `..`, `~`, `〜`, `～`, `,`, a tab) or by spaces; only the dates are
 * used (a time part is ignored).
 */
export const businessDaysBetween = (value: string): string => {
  const pair = splitPair(value) ?? splitWhitespacePair(value);
  if (pair === undefined) {
    throw new DateInputError(`${quoteText(value)} is not two dates (write them as 2026-10-01 2026-10-08)`);
  }
  const [from, to] = pair.map((text) => daysOf(parseDateValue(text)));
  return String(businessDaysBetweenDays(from, to));
};

// ---------------------------------------------------------------------------------------------
// DATEX-007: RFC 3339 with the offset of a time zone
// ---------------------------------------------------------------------------------------------

/**
 * DATEX-007: `2026-10-01T00:00Z` (Asia/Tokyo) → `2026-10-01T09:00:00+09:00`. The instant (a value
 * without an offset is local time, a timestamp is accepted) in the time zone typed, with the
 * offset of that zone at that instant; the milliseconds are written when they are not 0. An offset
 * with seconds (local mean time before about 1900) cannot be written in RFC 3339 and is an error.
 */
export const toRfc3339Offset = (value: string, timeZone: string, cache: TimeZoneCache): string => {
  const millis = parseInstant(value);
  // Only an instant a Date cannot hold (beyond ±8.64e15 ms) is refused here: the years 0001..9999
  // are checked by zonedTime on the time in the zone (with the same message), so an input whose
  // UTC year is outside them but whose zoned time is inside is accepted.
  if (!Number.isFinite(millis) || Number.isNaN(new Date(millis).getTime())) {
    throw new DateInputError(OUT_OF_RANGE);
  }
  const t = zonedTime(millis, timeZone, cache);
  if (t.offsetSeconds % 60 !== 0) {
    throw new DateInputError(`the offset of ${timeZone} then (${formatOffset(t.offsetSeconds)}) has seconds, which RFC 3339 cannot write`);
  }
  const ms = ((millis % 1000) + 1000) % 1000;
  const time = `${pad2(t.hour)}:${pad2(t.minute)}:${pad2(t.second)}${ms === 0 ? '' : `.${pad3(ms)}`}`;
  return `${formatCivil(t)}T${time}${formatOffset(t.offsetSeconds)}`;
};

// ---------------------------------------------------------------------------------------------
// DATEX-008: ISO week to a range of dates
// ---------------------------------------------------------------------------------------------

const ISO_WEEK = /^(\d{4})-?[Ww](\d{2})$/;

/** Whether the ISO week-numbering year has 53 weeks (it starts on a Thursday, or on a Wednesday in a leap year). */
export const hasWeek53 = (year: number): boolean => {
  const jan1 = isoWeekdayOf(daysFromCivil(year, 1, 1));
  return jan1 === 4 || (jan1 === 3 && isLeapYear(year));
};

/** DATEX-008: `2026-W40` → `2026-09-28 – 2026-10-04` (Monday to Sunday). */
export const isoWeekToRange = (value: string): string => {
  const match = ISO_WEEK.exec(value);
  if (!match) {
    throw new DateInputError(`${quoteText(value)} is not an ISO week such as 2026-W40`);
  }
  const year = Number(match[1]);
  const week = Number(match[2]);
  if (year < MIN_YEAR || week < 1 || week > 53 || (week === 53 && !hasWeek53(year))) {
    throw new DateInputError(`${quoteText(value)} is not a week of that year`);
  }
  const jan4 = daysFromCivil(year, 1, 4);
  const monday = jan4 - (isoWeekdayOf(jan4) - 1) + (week - 1) * 7;
  return `${formatCivil(checkedCivil(monday))} – ${formatCivil(checkedCivil(monday + 6))}`;
};

// ---------------------------------------------------------------------------------------------
// DATEX-009: sexagenary cycle (干支)
// ---------------------------------------------------------------------------------------------

const STEMS = ['甲', '乙', '丙', '丁', '戊', '己', '庚', '辛', '壬', '癸'];
const BRANCHES = ['子', '丑', '寅', '卯', '辰', '巳', '午', '未', '申', '酉', '戌', '亥'];
const YEAR = /^(\d{1,4})年?$/;

/**
 * DATEX-009: `2026` → `丙午`. A year (1 to 9999, `年` may follow) or a date (its year): the
 * heavenly stem and the earthly branch of the calendar year (1984 = 甲子; the start of spring is
 * not considered).
 */
export const eto = (value: string): string => {
  const match = YEAR.exec(value);
  const year = match ? Number(match[1]) : parseDateValue(value).year;
  if (year < MIN_YEAR || year > MAX_YEAR) {
    throw new DateInputError(`${quoteText(value)} is not a year from 1 to 9999`);
  }
  const index = (((year - 4) % 60) + 60) % 60;
  return `${STEMS[index % 10]}${BRANCHES[index % 12]}`;
};

// ---------------------------------------------------------------------------------------------
// DATEX-010 / 011: 12-hour and 24-hour clocks
// ---------------------------------------------------------------------------------------------

const TIME_24 = /^(\d{1,2}):(\d{2})(?::(\d{2}))?$/;
const TIME_12 = /^(\d{1,2}):(\d{2})(?::(\d{2}))? ?([AaPp][Mm])$/;

/** DATEX-010: `14:30` → `2:30 PM` (`0:05` → `12:05 AM`, `12:00` → `12:00 PM`; seconds are kept). */
export const to12Hour = (value: string): string => {
  const match = TIME_24.exec(value);
  const hour = match ? Number(match[1]) : NaN;
  if (!match || hour > 23 || Number(match[2]) > 59 || (match[3] !== undefined && Number(match[3]) > 59)) {
    throw new DateInputError(`${quoteText(value)} is not a time from 0:00 to 23:59`);
  }
  const seconds = match[3] === undefined ? '' : `:${match[3]}`;
  return `${hour % 12 === 0 ? 12 : hour % 12}:${match[2]}${seconds} ${hour < 12 ? 'AM' : 'PM'}`;
};

/** DATEX-011: `2:30 PM` → `14:30` (`12:05 AM` → `00:05`; AM / PM in any case, one space or none). */
export const to24Hour = (value: string): string => {
  const match = TIME_12.exec(value);
  const hour = match ? Number(match[1]) : NaN;
  if (!match || hour < 1 || hour > 12 || Number(match[2]) > 59 || (match[3] !== undefined && Number(match[3]) > 59)) {
    throw new DateInputError(`${quoteText(value)} is not a 12-hour time such as 2:30 PM`);
  }
  const pm = match[4].toUpperCase() === 'PM';
  const seconds = match[3] === undefined ? '' : `:${match[3]}`;
  return `${pad2((hour % 12) + (pm ? 12 : 0))}:${match[2]}${seconds}`;
};

// ---------------------------------------------------------------------------------------------
// DATEX-012..015: the time in IDs
// ---------------------------------------------------------------------------------------------

/** DATEX-012: the epochs of the Snowflake IDs (milliseconds from 1970). */
export const SNOWFLAKE_EPOCHS: Readonly<Record<string, number>> = { discord: 1_420_070_400_000, twitter: 1_288_834_974_657 };

const SNOWFLAKE = /^\d{1,20}$/;
const MAX_UINT64 = (1n << 64n) - 1n;

/** DATEX-012: the creation time of a Snowflake ID (Discord or Twitter / X epoch), ISO 8601 with milliseconds. */
export const snowflakeToDate = (value: string, epochName: string): string => {
  const epoch = SNOWFLAKE_EPOCHS[epochName.toLowerCase()];
  if (epoch === undefined) {
    throw new DateInputError(`unknown epoch ${quoteText(epochName)}`);
  }
  // The digits are counted (1 to 20) before BigInt is used.
  if (!SNOWFLAKE.test(value)) {
    throw new DateInputError(`${quoteText(value)} is not a Snowflake ID (1 to 20 digits)`);
  }
  const id = BigInt(value);
  if (id > MAX_UINT64) {
    throw new DateInputError(`${quoteText(value)} is larger than 64 bits`);
  }
  return isoOfMillis(Number(id >> 22n) + epoch);
};

const CROCKFORD = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
const ULID = /^[0-7][0-9A-HJKMNP-TV-Z]{25}$/;

/** DATEX-013: the time of a ULID (its first 10 characters, 48 bits of milliseconds), ISO 8601. */
export const ulidToDate = (value: string): string => {
  const upper = value.toUpperCase();
  if (!ULID.test(upper)) {
    throw new DateInputError(`${quoteText(value)} is not a ULID (26 Crockford Base32 characters, the first 0 to 7)`);
  }
  let millis = 0;
  for (const ch of upper.slice(0, 10)) {
    millis = millis * 32 + CROCKFORD.indexOf(ch);
  }
  return isoOfMillis(millis);
};

const UUID_HYPHENATED = /^[0-9A-Fa-f]{8}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{12}$/;
const UUID_PLAIN = /^[0-9A-Fa-f]{32}$/;

/** DATEX-014: the time of a UUID v7 (its first 48 bits), ISO 8601. Another version or variant is an error. */
export const uuidV7ToDate = (value: string): string => {
  if (!UUID_HYPHENATED.test(value) && !UUID_PLAIN.test(value)) {
    throw new DateInputError(`${quoteText(value)} is not a UUID`);
  }
  const hex = value.replace(/-/g, '').toLowerCase();
  if (hex[12] !== '7') {
    throw new DateInputError(`${quoteText(value)} is a UUID of version ${parseInt(hex[12], 16)}, not 7`);
  }
  if (!'89ab'.includes(hex[16])) {
    throw new DateInputError(`${quoteText(value)} does not have the RFC 9562 variant`);
  }
  return isoOfMillis(parseInt(hex.slice(0, 12), 16));
};

const OBJECT_ID = /^[0-9A-Fa-f]{24}$/;

/** DATEX-015: the time of a MongoDB ObjectId (its first 4 bytes, seconds), `YYYY-MM-DDTHH:MM:SSZ`. */
export const objectIdToDate = (value: string): string => {
  if (!OBJECT_ID.test(value)) {
    throw new DateInputError(`${quoteText(value)} is not an ObjectId (24 hexadecimal digits)`);
  }
  const iso = isoOfMillis(parseInt(value.slice(0, 8), 16) * 1000);
  // An ObjectId has no milliseconds: `.000` is left out.
  return `${iso.slice(0, 19)}Z`;
};
