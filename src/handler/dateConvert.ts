/**
 * Pure (vscode-independent) conversions of one value of the DATE-001..024 date commands (the cron
 * commands are in dateCron.ts). Every function takes one value (a line without the spaces around
 * it) and throws `DateInputError` when it cannot be converted.
 *
 * Calendar arithmetic uses day numbers (`daysFromCivil`), so it does not depend on the time zone
 * of the environment; only the values that stand for an instant (DATE-001/002/003/011) read a date
 * and time without an offset as local time. Only `Date` and `Intl` are used.
 */
import {
  addDaysToCivil,
  CivilDate,
  civilFromDays,
  compilePattern,
  DATE_EXCEL_MAX_SERIAL,
  DATE_MAX_RANGE_ENTRIES,
  DateInputError,
  DateOutputBuffer,
  DateValue,
  daysFromCivil,
  daysInMonth,
  formatCivil,
  instantOfValue,
  isLeapYear,
  isTimestamp,
  isValidDate,
  localCivilOf,
  MAX_YEAR,
  MIN_YEAR,
  MS_PER_DAY,
  pad2,
  pad4,
  parseDateValue,
  parseInstant,
  quoteText,
  utcMillis,
  wallMillis,
  weekdayOf,
  WEEKDAYS_JA,
  WeekdayLanguage,
} from './dateCommon';

const WEEKDAYS_EN = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const WEEKDAYS_EN_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

const daysOf = (date: CivilDate): number => daysFromCivil(date.year, date.month, date.day);

// ---------------------------------------------------------------------------------------------
// DATE-001: UTC string
// ---------------------------------------------------------------------------------------------

/** Checks that an instant can be written (JavaScript's `Date` range). */
const dateOfInstant = (millis: number, value: string): Date => {
  const date = new Date(millis);
  if (Number.isNaN(date.getTime())) {
    throw new DateInputError(`${quoteText(value)} is out of range`);
  }
  return date;
};

export const toUtcString = (value: string): string => dateOfInstant(parseInstant(value), value).toUTCString();

// ---------------------------------------------------------------------------------------------
// DATE-002 / 003 / 026 / 027: time zones
// ---------------------------------------------------------------------------------------------

/** One `Intl.DateTimeFormat` per time zone, made once per run (never kept between runs). */
export type TimeZoneCache = Map<string, Intl.DateTimeFormat>;

const formatterOf = (cache: TimeZoneCache, timeZone: string): Intl.DateTimeFormat => {
  let formatter = cache.get(timeZone);
  if (formatter === undefined) {
    formatter = new Intl.DateTimeFormat('en-US', {
      timeZone,
      hourCycle: 'h23',
      era: 'short',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
    cache.set(timeZone, formatter);
  }
  return formatter;
};

interface ZonedTime extends CivilDate {
  hour: number;
  minute: number;
  second: number;
  /** Offset from UTC in seconds. */
  offsetSeconds: number;
}

/** The calendar date and time of an instant in a time zone, with the offset of that zone then. */
export const zonedTime = (millis: number, timeZone: string, cache: TimeZoneCache): ZonedTime => {
  const parts: Record<string, string> = {};
  for (const part of formatterOf(cache, timeZone).formatToParts(new Date(millis))) {
    parts[part.type] = part.value;
  }
  const zoned = {
    year: Number(parts.year),
    month: Number(parts.month),
    day: Number(parts.day),
    hour: Number(parts.hour) % 24,
    minute: Number(parts.minute),
    second: Number(parts.second),
  };
  // Before the year 1 the formatter gives the era BC (and a year counted backwards).
  if ((parts.era !== undefined && !/^A/.test(parts.era)) || zoned.year < MIN_YEAR || zoned.year > MAX_YEAR) {
    throw new DateInputError('the result is outside the years 0001 to 9999');
  }
  const wholeSeconds = Math.floor(millis / 1000) * 1000;
  const offsetSeconds = Math.round((utcMillis(zoned, zoned.hour, zoned.minute, zoned.second) - wholeSeconds) / 1000);
  return { ...zoned, offsetSeconds };
};

/** `+09:00`, `-08:00`, `+05:45` (`+09:18:59` for an offset with seconds). */
export const formatOffset = (offsetSeconds: number): string => {
  const sign = offsetSeconds < 0 ? '-' : '+';
  const abs = Math.abs(offsetSeconds);
  const seconds = abs % 60;
  const text = `${sign}${pad2(Math.floor(abs / 3600))}:${pad2(Math.floor(abs / 60) % 60)}`;
  return seconds === 0 ? text : `${text}:${pad2(seconds)}`;
};

/** DATE-002: `2026-09-28 09:00:00 +09:00`. */
export const toTimeZone = (value: string, timeZone: string, cache: TimeZoneCache): string => {
  const millis = parseInstant(value);
  dateOfInstant(millis, value);
  const t = zonedTime(millis, timeZone, cache);
  return `${formatCivil(t)} ${pad2(t.hour)}:${pad2(t.minute)}:${pad2(t.second)} ${formatOffset(t.offsetSeconds)}`;
};

/** DATE-003: one line per time zone, `Asia/Tokyo 09:00`, with ` (前日)` / ` (翌日)` against the UTC date. */
export const toTimeZones = (value: string, timeZones: readonly string[], cache: TimeZoneCache): string[] => {
  const millis = parseInstant(value);
  dateOfInstant(millis, value);
  const utcDay = Math.floor(millis / MS_PER_DAY);
  return timeZones.map((timeZone) => {
    const t = zonedTime(millis, timeZone, cache);
    const diff = daysOf(t) - utcDay;
    const note = diff < 0 ? ' (前日)' : diff > 0 ? ' (翌日)' : '';
    return `${timeZone} ${pad2(t.hour)}:${pad2(t.minute)}${note}`;
  });
};

// ---------------------------------------------------------------------------------------------
// DATE-004 / 005: weekday
// ---------------------------------------------------------------------------------------------

/** DATE-004: `Monday（月）`. */
export const weekdayName = (value: string): string => {
  const w = weekdayOf(daysOf(parseDateValue(value)));
  return `${WEEKDAYS_EN[w]}（${WEEKDAYS_JA[w]}）`;
};

/** DATE-005: the value followed by ` (月)` or ` (Mon)`. */
export const appendWeekday = (value: string, language: WeekdayLanguage): string => {
  const w = weekdayOf(daysOf(parseDateValue(value)));
  return `${value} (${language === 'ja' ? WEEKDAYS_JA[w] : WEEKDAYS_EN_SHORT[w]})`;
};

// ---------------------------------------------------------------------------------------------
// DATE-006 / 007: ISO week and day of year
// ---------------------------------------------------------------------------------------------

/** DATE-006: `2026-W40` (ISO 8601 week-numbering year and week). */
export const isoWeek = (value: string): string => {
  const days = daysOf(parseDateValue(value));
  const isoWeekday = weekdayOf(days) === 0 ? 7 : weekdayOf(days);
  const thursday = days + (4 - isoWeekday);
  const year = civilFromDays(thursday).year;
  const week = Math.floor((thursday - daysFromCivil(year, 1, 1)) / 7) + 1;
  return `${pad4(year)}-W${pad2(week)}`;
};

/** DATE-007: the day of the year (1..366). */
export const dayOfYear = (value: string): string => {
  const date = parseDateValue(value);
  return String(daysOf(date) - daysFromCivil(date.year, 1, 1) + 1);
};

// ---------------------------------------------------------------------------------------------
// DATE-008: difference
// ---------------------------------------------------------------------------------------------

const DIFF_SEPARATORS = ['\t', ' / ', '..', '~', '〜', '～', ','];

/** Splits `a / b` (or `..`, `~`, `〜`, `～`, `,`, a tab) at the first separator found, or `undefined`. */
export const splitPair = (value: string): [string, string] | undefined => {
  for (const separator of DIFF_SEPARATORS) {
    const at = value.indexOf(separator);
    if (at !== -1) {
      return [value.slice(0, at).trim(), value.slice(at + separator.length).trim()];
    }
  }
  return undefined;
};

const unit = (n: number, singular: string, plural: string): string => `${n} ${n === 1 ? singular : plural}`;

/** DATE-008: `later − earlier` of two values, `270 days` or `1 day 2 hours 30 minutes`. */
export const dateDiff = (first: string, second: string): string => {
  const a = parseDateValue(first);
  const b = parseDateValue(second);
  if (!a.hasTime && !b.hasTime) {
    const days = daysOf(b) - daysOf(a);
    return days === 1 || days === -1 ? `${days} day` : `${days} days`;
  }
  if ((a.offsetMinutes === undefined) !== (b.offsetMinutes === undefined)) {
    throw new DateInputError('write a time zone offset on both dates or on neither');
  }
  const millisOf = (v: DateValue): number => (v.offsetMinutes === undefined ? wallMillis(v) : instantOfValue(v));
  const diff = millisOf(b) - millisOf(a);
  const totalMinutes = Math.floor(Math.abs(diff) / 60_000);
  const days = Math.floor(totalMinutes / 1440);
  const hours = Math.floor(totalMinutes / 60) % 24;
  const minutes = totalMinutes % 60;
  const sign = diff < 0 && totalMinutes > 0 ? '-' : '';
  return `${sign}${unit(days, 'day', 'days')} ${unit(hours, 'hour', 'hours')} ${unit(minutes, 'minute', 'minutes')}`;
};

// ---------------------------------------------------------------------------------------------
// DATE-009 / 010: adding days and months
// ---------------------------------------------------------------------------------------------

const writeBack = (value: DateValue, date: CivilDate): string => `${formatCivil(date, value.separator)}${value.rest}`;

/** DATE-009: the date part moved by `days`, written back with its separator and its time part as written. */
export const addDays = (value: string, days: number): string => {
  const date = parseDateValue(value);
  return writeBack(date, addDaysToCivil(date, days));
};

/** DATE-010: the date part moved by `months` (a day past the end of the month becomes its last day). */
export const addMonths = (value: string, months: number): string => {
  const date = parseDateValue(value);
  const total = date.year * 12 + (date.month - 1) + months;
  const year = Math.floor(total / 12);
  const month = total - year * 12 + 1;
  if (year < MIN_YEAR || year > MAX_YEAR) {
    throw new DateInputError('the result is outside the years 0001 to 9999');
  }
  return writeBack(date, { year, month, day: Math.min(date.day, daysInMonth(year, month)) });
};

// ---------------------------------------------------------------------------------------------
// DATE-011: relative time
// ---------------------------------------------------------------------------------------------

/** Whole months from `from` to `to` (calendar months; a month is counted once its day is reached). */
const monthsBetween = (from: CivilDate, to: CivilDate): number => {
  let months = (to.year * 12 + to.month) - (from.year * 12 + from.month);
  if (months > 0 && to.day < from.day) {
    months--;
  } else if (months < 0 && to.day > from.day) {
    months++;
  }
  return months;
};

let relativeFormat: Intl.RelativeTimeFormat | undefined;

const relative = (value: number, unitName: Intl.RelativeTimeFormatUnit): string => {
  relativeFormat ??= new Intl.RelativeTimeFormat('ja', { numeric: 'always' });
  return relativeFormat.format(value, unitName);
};

/** The day / month / year stage of a relative time between two calendar dates. */
const relativeDays = (days: number, today: CivilDate, target: CivilDate): string => {
  if (Math.abs(days) < 30) {
    return relative(days, 'day');
  }
  const months = monthsBetween(today, target);
  if (months === 0) {
    return relative(days, 'day');
  }
  if (Math.abs(months) < 12) {
    return relative(months, 'month');
  }
  return relative(Math.trunc(months / 12), 'year');
};

/**
 * DATE-011: `3 日前`. A date alone is compared with the local date of `now` by calendar days
 * (`今日` when it is today); a date and time or a timestamp is compared with `now` as an instant.
 */
export const toRelative = (value: string, now: Date): string => {
  const today = localCivilOf(now);
  if (!isTimestamp(value)) {
    const parsed = parseDateValue(value);
    if (!parsed.hasTime) {
      const days = daysOf(parsed) - daysOf(today);
      return days === 0 ? '今日' : relativeDays(days, today, parsed);
    }
  }
  const millis = parseInstant(value);
  const target = dateOfInstant(millis, value);
  const seconds = Math.trunc((millis - now.getTime()) / 1000);
  const abs = Math.abs(seconds);
  if (abs < 60) {
    return relative(seconds, 'second');
  }
  if (abs < 3600) {
    return relative(Math.trunc(seconds / 60), 'minute');
  }
  if (abs < 86_400) {
    return relative(Math.trunc(seconds / 3600), 'hour');
  }
  return relativeDays(Math.trunc(seconds / 86_400), today, localCivilOf(target));
};

// ---------------------------------------------------------------------------------------------
// DATE-012: pattern
// ---------------------------------------------------------------------------------------------

/** DATE-012: the written date and time (no time zone conversion; a date alone is 00:00:00) in the pattern. */
export const formatPattern = (value: string, pattern: string): string => {
  const pieces = compilePattern(pattern);
  const v = parseDateValue(value);
  const w = weekdayOf(daysOf(v));
  const hour12 = v.hour % 12 === 0 ? 12 : v.hour % 12;
  const tokens: Record<string, string> = {
    yyyy: pad4(v.year),
    yy: pad2(v.year % 100),
    MM: pad2(v.month),
    M: String(v.month),
    dd: pad2(v.day),
    d: String(v.day),
    HH: pad2(v.hour),
    H: String(v.hour),
    hh: pad2(hour12),
    h: String(hour12),
    mm: pad2(v.minute),
    m: String(v.minute),
    ss: pad2(v.second),
    s: String(v.second),
    SSS: String(v.millisecond).padStart(3, '0'),
    a: v.hour < 12 ? 'AM' : 'PM',
    EEEE: WEEKDAYS_EN[w],
    E: WEEKDAYS_EN_SHORT[w],
  };
  return pieces.map((piece) => ('token' in piece ? tokens[piece.token] : piece.literal)).join('');
};

// ---------------------------------------------------------------------------------------------
// DATE-013 / 014 / 021: compact and Japanese forms
// ---------------------------------------------------------------------------------------------

/** DATE-013: `20260928` (the time part is dropped). */
export const toCompact = (value: string): string => formatCivil(parseDateValue(value), '');

/** DATE-014: `2026-09-28` from `20260928`. */
export const fromCompact = (value: string): string => {
  if (!/^\d{8}$/.test(value)) {
    throw new DateInputError(`${quoteText(value)} is not a date of 8 digits (YYYYMMDD)`);
  }
  const date = { year: Number(value.slice(0, 4)), month: Number(value.slice(4, 6)), day: Number(value.slice(6)) };
  if (!isValidDate(date.year, date.month, date.day)) {
    throw new DateInputError(`${quoteText(value)} is not a valid date`);
  }
  return formatCivil(date);
};

/** DATE-021: `2026年9月28日` (the time part is dropped). */
export const toJapanese = (value: string): string => {
  const date = parseDateValue(value);
  return `${date.year}年${date.month}月${date.day}日`;
};

// ---------------------------------------------------------------------------------------------
// DATE-015: month calendar
// ---------------------------------------------------------------------------------------------

const YEAR_MONTH = /^(\d{4})[-/](\d{1,2})$/;

/** DATE-015: the month of `YYYY-MM` (or of a date) as a `cal`-like calendar starting on Sunday. */
export const monthCalendar = (value: string): string[] => {
  let year: number;
  let month: number;
  const match = YEAR_MONTH.exec(value);
  if (match) {
    year = Number(match[1]);
    month = Number(match[2]);
    if (!isValidDate(year, month, 1)) {
      throw new DateInputError(`${quoteText(value)} is not a valid month`);
    }
  } else {
    let date: DateValue;
    try {
      date = parseDateValue(value);
    } catch {
      throw new DateInputError(`${quoteText(value)} is not a month (YYYY-MM) or a date`);
    }
    year = date.year;
    month = date.month;
  }
  const lines = ['Su Mo Tu We Th Fr Sa'];
  const first = weekdayOf(daysFromCivil(year, month, 1));
  let cells: string[] = new Array<string>(first).fill('  ');
  for (let day = 1; day <= daysInMonth(year, month); day++) {
    cells.push(String(day).padStart(2, ' '));
    if (cells.length === 7) {
      lines.push(cells.join(' ').trimEnd());
      cells = [];
    }
  }
  if (cells.length > 0) {
    lines.push(cells.join(' ').trimEnd());
  }
  return lines;
};

// ---------------------------------------------------------------------------------------------
// DATE-016: ISO 8601 duration
// ---------------------------------------------------------------------------------------------

const NUMBER_PART = '(\\d{1,15}(?:[.,]\\d{1,15})?)';
const DURATION = new RegExp(
  `^P(?:${NUMBER_PART}Y)?(?:${NUMBER_PART}M)?(?:${NUMBER_PART}W)?(?:${NUMBER_PART}D)?`
  + `(?:T(?:${NUMBER_PART}H)?(?:${NUMBER_PART}M)?(?:${NUMBER_PART}S)?)?$`
);
const DURATION_UNITS = ['年', 'か月', '週', '日', '時間', '分', '秒'];

/** A number of the duration written without leading / trailing zeros (`,` becomes `.`), or `''` for zero. */
const durationNumber = (text: string): string => {
  const [integer, fraction = ''] = text.replace(',', '.').split('.');
  const int = integer.replace(/^0+(?=\d)/, '');
  const frac = fraction.replace(/0+$/, '');
  if (int === '0' && frac === '') {
    return '';
  }
  return frac === '' ? int : `${int}.${frac}`;
};

/** DATE-016: `PT1H30M` → `1 時間 30 分`. */
export const durationToHuman = (value: string): string => {
  const match = DURATION.exec(value);
  const invalid = () => new DateInputError(`${quoteText(value)} is not an ISO 8601 duration`);
  if (!match || value === 'P' || value.endsWith('T')) {
    throw invalid();
  }
  const numbers = match.slice(1, 8);
  const present = numbers.map((n, i) => (n === undefined ? -1 : i)).filter((i) => i >= 0);
  if (present.length === 0) {
    throw invalid();
  }
  // Only the last element may have a fraction.
  if (present.slice(0, -1).some((i) => /[.,]/.test(numbers[i]!))) {
    throw new DateInputError(`${quoteText(value)}: only the last element of a duration may have a fraction`);
  }
  const parts = present
    .map((i) => ({ n: durationNumber(numbers[i]!), unit: DURATION_UNITS[i] }))
    .filter(({ n }) => n !== '')
    .map(({ n, unit: u }) => `${n} ${u}`);
  return parts.length === 0 ? '0 秒' : parts.join(' ');
};

// ---------------------------------------------------------------------------------------------
// DATE-017 / 018: seconds and HH:MM:SS
// ---------------------------------------------------------------------------------------------

/** DATE-017: `3661` → `01:01:01` (hours of 2 or more digits, `-` for a negative number). */
export const secondsToHms = (value: string): string => {
  if (!/^-?\d{1,16}$/.test(value) || !Number.isSafeInteger(Number(value))) {
    throw new DateInputError(`${quoteText(value)} is not an integer number of seconds`);
  }
  const total = Number(value);
  const abs = Math.abs(total);
  const text = `${pad2(Math.floor(abs / 3600))}:${pad2(Math.floor(abs / 60) % 60)}:${pad2(abs % 60)}`;
  return total < 0 ? `-${text}` : text;
};

const HMS = /^(-?)(\d{1,15}):(\d{2}):(\d{2})$/;
const MS = /^(-?)(\d{1,2}):(\d{2})$/;

/** DATE-018: `01:01:01` → `3661` (also `M:SS`). */
export const hmsToSeconds = (value: string): string => {
  const hms = HMS.exec(value);
  const ms = hms ? undefined : MS.exec(value);
  const invalid = () => new DateInputError(`${quoteText(value)} is not a time of H:MM:SS or M:SS`);
  if (!hms && !ms) {
    throw invalid();
  }
  const [sign, hours, minutes, seconds] = hms ? [hms[1], Number(hms[2]), Number(hms[3]), Number(hms[4])] : [ms![1], 0, Number(ms![2]), Number(ms![3])];
  if (minutes > 59 || seconds > 59) {
    throw invalid();
  }
  const total = hours * 3600 + minutes * 60 + seconds;
  if (!Number.isSafeInteger(total)) {
    throw new DateInputError(`${quoteText(value)} is out of range`);
  }
  return String(sign === '-' && total !== 0 ? -total : total);
};

// ---------------------------------------------------------------------------------------------
// DATE-019 / 020: Excel serial (1900 date system, with its 1900-02-29)
// ---------------------------------------------------------------------------------------------

const EXCEL_EPOCH = daysFromCivil(1899, 12, 30);
const EXCEL_EARLY_EPOCH = daysFromCivil(1899, 12, 31);
const EXCEL_MARCH_1900 = daysFromCivil(1900, 3, 1);
const EXCEL_FIRST_DAY = daysFromCivil(1900, 1, 1);

/** DATE-019: `2026-09-28` → `46293` (a time adds the fraction of the day, up to 10 decimals). */
export const toExcelSerial = (value: string): string => {
  const date = parseDateValue(value);
  const days = daysOf(date);
  if (days < EXCEL_FIRST_DAY) {
    throw new DateInputError(`${quoteText(value)} is before 1900-01-01`);
  }
  const serial = days >= EXCEL_MARCH_1900 ? days - EXCEL_EPOCH : days - EXCEL_EARLY_EPOCH;
  if (!date.hasTime) {
    return String(serial);
  }
  const fraction = (((date.hour * 60 + date.minute) * 60 + date.second) * 1000 + date.millisecond) / MS_PER_DAY;
  if (fraction === 0) {
    return String(serial);
  }
  // The largest fraction, 86,399,999 / 86,400,000 (about 0.9999999884), stays below 1 at 10
  // decimals, so the text always starts with `0.`.
  const text = fraction.toFixed(10).replace(/0+$/, '');
  return `${serial}${text.slice(1)}`;
};

const EXCEL_SERIAL = /^(\d{1,7})(?:\.(\d{1,15}))?$/;

/**
 * DATE-020: `46293` → `2026-09-28`; a fraction adds ` HH:mm:ss` (rounded to the second). When
 * the rounding gives 86,400 seconds (`24:00:00`), the date moves to the next calendar day at
 * `00:00:00`; after 9999-12-31 that is an error. The serial 60 (Excel's 1900-02-29) is an error.
 */
export const fromExcelSerial = (value: string): string => {
  const match = EXCEL_SERIAL.exec(value);
  if (!match) {
    throw new DateInputError(`${quoteText(value)} is not an Excel serial number`);
  }
  const integer = Number(match[1]);
  if (integer < 1 || integer > DATE_EXCEL_MAX_SERIAL) {
    throw new DateInputError(`${value} is out of range (1 to ${DATE_EXCEL_MAX_SERIAL.toLocaleString('en-US')})`);
  }
  if (integer === 60) {
    throw new DateInputError(`${value} is 1900-02-29, which does not exist`);
  }
  let days = integer < 60 ? EXCEL_EARLY_EPOCH + integer : EXCEL_EPOCH + integer;
  const fractionDigits = match[2] ?? '';
  if (/^0*$/.test(fractionDigits)) {
    return formatCivil(civilFromDays(days));
  }
  let seconds = Math.round(Number(`0.${fractionDigits}`) * 86_400);
  if (seconds === 86_400) {
    if (days === daysFromCivil(MAX_YEAR, 12, 31)) {
      throw new DateInputError(`${value} is after 9999-12-31`);
    }
    days++;
    seconds = 0;
  }
  return `${formatCivil(civilFromDays(days))} ${pad2(Math.floor(seconds / 3600))}:${pad2(Math.floor(seconds / 60) % 60)}:${pad2(seconds % 60)}`;
};

// ---------------------------------------------------------------------------------------------
// DATE-022: range
// ---------------------------------------------------------------------------------------------

const RANGE_SEPARATORS = ['..', '~', '〜', '～'];

/**
 * DATE-022: every date from the start to the end, both included (descending when the start is
 * later), in the form of the start. At most DATE_MAX_RANGE_ENTRIES dates; the output budget is
 * checked before the dates are made.
 */
export const dateRange = (value: string, output: DateOutputBuffer, eolLength: number): string[] => {
  let pair: [string, string] | undefined;
  for (const separator of RANGE_SEPARATORS) {
    const at = value.indexOf(separator);
    if (at !== -1) {
      pair = [value.slice(0, at).trim(), value.slice(at + separator.length).trim()];
      break;
    }
  }
  if (pair === undefined) {
    throw new DateInputError(`${quoteText(value)} is not a range such as 2026-09-28..2026-09-30`);
  }
  const start = parseDateValue(pair[0]);
  const end = parseDateValue(pair[1]);
  if (start.hasTime || end.hasTime) {
    throw new DateInputError(`${quoteText(value)}: a range takes dates without a time`);
  }
  const from = daysOf(start);
  const to = daysOf(end);
  const count = Math.abs(to - from) + 1;
  if (count > DATE_MAX_RANGE_ENTRIES) {
    throw new DateInputError(`the range has more than ${DATE_MAX_RANGE_ENTRIES.toLocaleString('en-US')} dates`);
  }
  // Every date has the same length (10 characters); the budget is checked before they are made.
  output.reserve(count * 10 + (count - 1) * eolLength);
  const step = to >= from ? 1 : -1;
  const dates: string[] = [];
  for (let days = from; ; days += step) {
    dates.push(formatCivil(civilFromDays(days), start.separator));
    if (days === to) {
      break;
    }
  }
  return dates;
};

// ---------------------------------------------------------------------------------------------
// DATE-023 / 024: age and quarter
// ---------------------------------------------------------------------------------------------

/** DATE-023: the age on the local date of `now` (born on 2/29: the birthday is 3/1 in other years). */
export const age = (value: string, now: Date): string => {
  const birth = parseDateValue(value);
  const today = localCivilOf(now);
  if (daysOf(birth) > daysOf(today)) {
    throw new DateInputError(`${quoteText(value)} is in the future`);
  }
  let years = today.year - birth.year;
  const [month, day] = birth.month === 2 && birth.day === 29 && !isLeapYear(today.year) ? [3, 1] : [birth.month, birth.day];
  if (today.month < month || (today.month === month && today.day < day)) {
    years--;
  }
  return String(years);
};

/** DATE-024: `2026 Q3 / FY2026 上期` (the fiscal year is named after the year it starts in). */
export const quarter = (value: string, fiscalYearStartMonth: number): string => {
  const date = parseDateValue(value);
  const q = Math.floor((date.month - 1) / 3) + 1;
  const fiscalYear = date.month >= fiscalYearStartMonth ? date.year : date.year - 1;
  const monthOfYear = (date.month - fiscalYearStartMonth + 12) % 12;
  return `${date.year} Q${q} / FY${fiscalYear} ${monthOfYear < 6 ? '上期' : '下期'}`;
};

