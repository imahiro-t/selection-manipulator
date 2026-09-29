/**
 * Pure (vscode-independent) part of DATE-025: reading a cron expression of 5 fields (minute, hour,
 * day of month, month, day of week), explaining it in Japanese and finding its next runs.
 *
 * Supported: `*`, numbers, `,`, `a-b`, `*` + `/n`, `a-b/n`, `a/n`, month names JAN..DEC and day
 * names SUN..SAT (any case), day of week 0..7 (0 and 7 are Sunday). When both the day of month and
 * the day of week are restricted (neither starts with `*`), a day matches either (as Vixie cron).
 * Not supported (errors): `L`, `W`, `#`, `?`, macros such as `@daily`, 6 or more fields.
 *
 * The next runs are searched day by day (at most DATE_CRON_SEARCH_YEARS years ahead) in the local
 * calendar, ignoring daylight saving time; on a matching day only the hours and minutes of the
 * expression are listed, and the search stops at DATE_CRON_RUNS runs. So one expression costs at
 * most about 2,923 day checks, each a lookup in the expanded sets.
 */
import {
  CivilDate,
  civilFromDays,
  DATE_CRON_RUNS,
  DATE_CRON_SEARCH_YEARS,
  DATE_MAX_CRON_LENGTH,
  DATE_MAX_CRON_LINES,
  DateInputError,
  daysFromCivil,
  formatCivil,
  localCivilOf,
  localMillisOfDay,
  MAX_YEAR,
  pad2,
  quoteText,
  weekdayOf,
  WEEKDAYS_JA,
} from './dateCommon';

interface FieldSpec {
  name: string;
  min: number;
  max: number;
  names?: readonly string[];
  /** The value of `names[0]` (month: 1 for JAN, day of week: 0 for SUN). */
  nameBase?: number;
}

const FIELDS: readonly FieldSpec[] = [
  { name: '分', min: 0, max: 59 },
  { name: '時', min: 0, max: 23 },
  { name: '日', min: 1, max: 31 },
  { name: '月', min: 1, max: 12, names: ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'], nameBase: 1 },
  { name: '曜日', min: 0, max: 7, names: ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'], nameBase: 0 },
];

/** One field expanded to the values it allows. */
interface CronField {
  /** The field as written (upper case). */
  text: string;
  /** `allowed[v]` for every value of the field (day of week: 0..6, 7 folded into 0). */
  allowed: boolean[];
  /** The field starts with `*` (it does not restrict the day for the OR rule). */
  star: boolean;
  /** The allowed values in ascending order. */
  values: number[];
}

export interface CronExpression {
  minute: CronField;
  hour: CronField;
  dayOfMonth: CronField;
  month: CronField;
  dayOfWeek: CronField;
}

const cronError = (message: string): DateInputError => new DateInputError(message);

/**
 * Unsupported cron syntax (`L`, `W`, `#`, `?`) in a token that is neither a number nor a name.
 * Names are matched first, so `JUL` and `WED` are not mistaken for `L` and `W`.
 */
const assertSupported = (token: string, expression: string): void => {
  const unsupported = /[LW#?]/.exec(token);
  if (unsupported) {
    throw cronError(`${quoteText(expression)}: "${unsupported[0]}" is not supported`);
  }
};

const valueOf = (text: string, spec: FieldSpec, expression: string): number => {
  if (/^\d{1,2}$/.test(text)) {
    return Number(text);
  }
  const index = spec.names?.indexOf(text) ?? -1;
  if (index === -1) {
    assertSupported(text, expression);
    throw cronError(`${quoteText(expression)}: ${quoteText(text)} is not a valid value of the ${spec.name} field`);
  }
  return index + (spec.nameBase ?? 0);
};

const parseField = (raw: string, spec: FieldSpec, expression: string): CronField => {
  const text = raw.toUpperCase();
  const allowed = new Array<boolean>(spec.max + 1).fill(false);
  for (const item of text.split(',')) {
    const match = /^(\*|[0-9A-Z]+(?:-[0-9A-Z]+)?)(?:\/(\d{1,2}))?$/.exec(item);
    if (!match) {
      assertSupported(item, expression);
      throw cronError(`${quoteText(expression)}: ${quoteText(item)} is not a valid ${spec.name} field`);
    }
    let from: number;
    let to: number;
    if (match[1] === '*') {
      from = spec.min;
      to = spec.max === 7 ? 6 : spec.max;
    } else {
      const [a, b] = match[1].split('-');
      from = valueOf(a, spec, expression);
      // `a/n` runs from a to the end of the field.
      to = b !== undefined ? valueOf(b, spec, expression) : match[2] !== undefined ? spec.max : from;
    }
    const step = match[2] === undefined ? 1 : Number(match[2]);
    if (from < spec.min || to > spec.max || from > to || step < 1 || step > spec.max) {
      throw cronError(`${quoteText(expression)}: ${quoteText(item)} is out of range for the ${spec.name} field (${spec.min}-${spec.max})`);
    }
    for (let v = from; v <= to; v += step) {
      allowed[spec.max === 7 && v === 7 ? 0 : v] = true;
    }
  }
  if (spec.max === 7) {
    allowed.length = 7;
  }
  const values = allowed.map((ok, v) => (ok ? v : -1)).filter((v) => v >= 0);
  return { text, allowed, star: text.startsWith('*'), values };
};

/** Reads a cron expression of 5 fields separated by spaces or tabs. */
export const parseCron = (expression: string): CronExpression => {
  if (expression.length > DATE_MAX_CRON_LENGTH) {
    throw cronError(`the cron expression is longer than ${DATE_MAX_CRON_LENGTH} characters`);
  }
  if (expression.startsWith('@')) {
    throw cronError(`${quoteText(expression)}: macros such as @daily are not supported`);
  }
  const fields = expression.split(/[ \t]+/);
  if (fields.length !== 5) {
    throw cronError(`${quoteText(expression)} is not a cron expression of 5 fields (minute hour day month weekday)`);
  }
  const [minute, hour, dayOfMonth, month, dayOfWeek] = fields.map((field, i) => parseField(field, FIELDS[i], expression));
  return { minute, hour, dayOfMonth, month, dayOfWeek };
};

/** True when the cron runs on the date. */
const matchesDay = (cron: CronExpression, date: CivilDate, weekday: number): boolean => {
  if (!cron.month.allowed[date.month]) {
    return false;
  }
  const dom = cron.dayOfMonth.allowed[date.day];
  const dow = cron.dayOfWeek.allowed[weekday];
  return cron.dayOfMonth.star || cron.dayOfWeek.star ? dom && dow : dom || dow;
};

/**
 * The next `DATE_CRON_RUNS` runs strictly after `now` (local calendar, no daylight saving time),
 * searched day by day up to DATE_CRON_SEARCH_YEARS years ahead. Fewer are returned when fewer exist.
 */
export const nextRuns = (cron: CronExpression, now: Date): string[] => {
  const today = localCivilOf(now);
  const nowMillis = localMillisOfDay(now);
  const first = daysFromCivil(today.year, today.month, today.day);
  const last = Math.min(daysFromCivil(today.year + DATE_CRON_SEARCH_YEARS, today.month, 1) + 31, daysFromCivil(MAX_YEAR, 12, 31));
  const runs: string[] = [];
  for (let days = first; days <= last && runs.length < DATE_CRON_RUNS; days++) {
    const date = civilFromDays(days);
    if (!matchesDay(cron, date, weekdayOf(days))) {
      continue;
    }
    for (const hour of cron.hour.values) {
      for (const minute of cron.minute.values) {
        if (days === first && (hour * 60 + minute) * 60_000 <= nowMillis) {
          continue;
        }
        runs.push(`${formatCivil(date)} ${pad2(hour)}:${pad2(minute)}`);
        if (runs.length === DATE_CRON_RUNS) {
          return runs;
        }
      }
    }
  }
  return runs;
};

const isAll = (field: CronField): boolean => field.text === '*';
const single = (field: CronField): number | undefined => (/^\d{1,2}$/.test(field.text) ? field.values[0] : undefined);

/** The explanation: a common pattern in words, or `分: …, 時: …, 日: …, 月: …, 曜日: …`. */
export const describeCron = (cron: CronExpression): string => {
  const minute = single(cron.minute);
  const hour = single(cron.hour);
  const time = minute !== undefined && hour !== undefined ? `${pad2(hour)}:${pad2(minute)}` : undefined;
  const everyDay = isAll(cron.dayOfMonth) && isAll(cron.month);
  if (time !== undefined && everyDay && isAll(cron.dayOfWeek)) {
    return `毎日 ${time}`;
  }
  if (time !== undefined && everyDay && !cron.dayOfWeek.star) {
    return `毎週${cron.dayOfWeek.values.map((w) => `${WEEKDAYS_JA[w]}曜`).join('・')} ${time}`;
  }
  if (time !== undefined && isAll(cron.month) && isAll(cron.dayOfWeek) && !cron.dayOfMonth.star) {
    return `毎月${cron.dayOfMonth.values.join('・')}日 ${time}`;
  }
  const everyHourDay = isAll(cron.hour) && everyDay && isAll(cron.dayOfWeek);
  if (everyHourDay && minute !== undefined) {
    return `毎時 ${minute} 分`;
  }
  if (everyHourDay && isAll(cron.minute)) {
    return '毎分';
  }
  const step = /^\*\/(\d{1,2})$/.exec(cron.minute.text);
  if (everyHourDay && step) {
    return `${Number(step[1])} 分ごと`;
  }
  const describe = (field: CronField) => (isAll(field) ? 'すべて' : field.text);
  return [cron.minute, cron.hour, cron.dayOfMonth, cron.month, cron.dayOfWeek]
    .map((field, i) => `${FIELDS[i].name}: ${describe(field)}`)
    .join(', ');
};

/** DATE-025: `毎週月曜 09:00（次回: 2026-10-05 09:00, …）`. */
export const explainCron = (expression: string, now: Date): string => {
  const cron = parseCron(expression);
  const runs = nextRuns(cron, now);
  return `${describeCron(cron)}（次回: ${runs.length === 0 ? 'なし' : runs.join(', ')}）`;
};

/**
 * Checked before any search: the selections hold at most DATE_MAX_CRON_LINES cron expressions
 * (non-blank lines) in total.
 */
export const assertCronLineCount = (lineCounts: readonly number[]): void => {
  const total = lineCounts.reduce((sum, n) => sum + n, 0);
  if (total > DATE_MAX_CRON_LINES) {
    throw new DateInputError(`too many cron expressions: at most ${DATE_MAX_CRON_LINES.toLocaleString('en-US')} lines can be explained at once`);
  }
};
