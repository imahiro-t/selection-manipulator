/**
 * Pure (vscode-independent) part of the DATE-001..030 date commands: the command table and one
 * transform per command.
 *
 * Every transform takes the selected text, the values typed into the input boxes, the context of
 * the run (settings, current time, line break of the document, time zone cache) and the output
 * budget (what is left of MAX_OUTPUT_LENGTH), converts one value per line (blank lines and the
 * spaces around each value are kept) and throws `DateInputError` with the line number when a value
 * cannot be converted. Two commands work on all selections together: DATE-004 (one notification)
 * and DATE-008 (two selections may make one pair); they have a `combine` function instead.
 *
 * Only local processing: no network, files or processes, no `eval` / `new Function`, no new
 * dependency (`Date` and `Intl` only).
 */
import {
  DATE_NOTIFY_ITEMS,
  DateInputError,
  DatePromptRule,
  DateSettingKey,
  DateSettings,
  dateLineValues,
  mapDateLines,
  truncateText,
} from './dateCommon';
import {
  addDays,
  addMonths,
  age,
  appendWeekday,
  dateDiff,
  dateRange,
  dayOfYear,
  durationToHuman,
  formatPattern,
  fromCompact,
  fromExcelSerial,
  hmsToSeconds,
  isoWeek,
  monthCalendar,
  quarter,
  secondsToHms,
  splitPair,
  TimeZoneCache,
  toCompact,
  toExcelSerial,
  toJapanese,
  toRelative,
  toTimeZone,
  toTimeZones,
  toUtcString,
  weekdayName,
} from './dateConvert';
import { assertCronLineCount, explainCron } from './dateCron';

/** Where a command puts its result. */
export type DateOutput = 'new-tab' | 'replace' | 'clipboard' | 'notify';

/** One question asked before running. */
export interface DatePrompt {
  prompt: string;
  placeHolder: string;
  rule: DatePromptRule;
}

/** What a transform may use besides the text: made once per run by the handler. */
export interface DateContext {
  settings: DateSettings;
  /** The current time (fixed in tests). */
  now: Date;
  /** The line break of the document (`\n` or `\r\n`). */
  eol: string;
  /** One `Intl.DateTimeFormat` per time zone for this run. */
  timeZones: TimeZoneCache;
}

/**
 * A transform of one selection. `inputs` are the answers to the prompts, in order, already checked
 * with `findDatePromptProblem` and trimmed by the caller (the handler).
 */
export type DateTransform = (text: string, inputs: readonly string[], context: DateContext, budget: number) => string;

/**
 * A transform of all selections together (in document order). A failure names the selection
 * (`selection 2 of 3: `) itself when there are several.
 */
export type DateCombine = (texts: readonly string[], inputs: readonly string[], context: DateContext, budget: number) => string;

export interface DateCommandEntry {
  /** ROADMAP ID, e.g. `DATE-001`. */
  id: string;
  /** Command ID without the `selection-manipulator.` prefix. */
  name: string;
  /** Title in package.json / ROADMAP. */
  title: string;
  output: DateOutput;
  /** Questions asked once before running (answered for all selections). */
  prompts: readonly DatePrompt[];
  /** The settings the command uses (only these are read and checked). */
  settings: readonly DateSettingKey[];
  transform: DateTransform;
  /** Used instead of `transform` when present. */
  combine?: DateCombine;
  /** Checked on all selections before anything is converted. */
  precheck?: (texts: readonly string[]) => void;
  /** New editor: results of several selections are separated by an empty line. */
  blankLineBetween?: boolean;
}

const TIME_ZONE_PROMPT: DatePrompt = {
  prompt: 'IANA time zone to convert to (e.g. Asia/Tokyo, UTC, America/New_York)',
  placeHolder: 'Asia/Tokyo',
  rule: { kind: 'timeZone' },
};

const PATTERN_PROMPT: DatePrompt = {
  prompt: "Pattern (yyyy yy MM M dd d HH H hh h mm m ss s SSS a EEEE E; text in '…')",
  placeHolder: 'yyyy/MM/dd HH:mm',
  rule: { kind: 'pattern' },
};

/** A transform that converts every line with `convert`. */
const lines = (convert: (value: string, inputs: readonly string[], context: DateContext) => string | readonly string[]): DateTransform =>
  (text, inputs, context, budget) => mapDateLines(text, budget, context.eol, (value) => convert(value, inputs, context));

const where = (index: number, count: number): string => (count > 1 ? `selection ${index + 1} of ${count}: ` : '');

/** Runs `run` for the selection `index`, naming the selection in an input error when there are several. */
const inSelection = <T>(index: number, count: number, run: () => T): T => {
  try {
    return run();
  } catch (error) {
    if (error instanceof DateInputError && count > 1) {
      throw new DateInputError(`${where(index, count)}${error.message}`);
    }
    throw error;
  }
};

/**
 * DATE-004: the weekdays of every value (every non-blank line of every selection, in document
 * order) in one notification: `Monday（月）` for one value, `2026-09-28: Monday（月）, …` for more
 * (the first DATE_NOTIFY_ITEMS values, then `, … and N more`; each value cut to 60 characters).
 */
export const weekdayNotification: DateCombine = (texts) => {
  const items: { value: string; weekday: string }[] = [];
  let total = 0;
  texts.forEach((text, index) => inSelection(index, texts.length, () => {
    for (const { value, lineNumber } of dateLineValues(text)) {
      let weekday: string;
      try {
        weekday = weekdayName(value);
      } catch (error) {
        if (error instanceof DateInputError) {
          throw new DateInputError(`line ${lineNumber}: ${error.message}`);
        }
        throw error;
      }
      total++;
      if (items.length < DATE_NOTIFY_ITEMS) {
        items.push({ value, weekday });
      }
    }
  }));
  if (total === 1) {
    return items[0].weekday;
  }
  const shown = items.map(({ value, weekday }) => `${truncateText(value)}: ${weekday}`).join(', ');
  return total > items.length ? `${shown}, … and ${total - items.length} more` : shown;
};

/**
 * DATE-008: when every value line of every selection holds two dates (`a / b`, `a..b`, `a~b`,
 * `a〜b`, `a,b` or a tab), one difference per line; otherwise, when there are exactly two
 * selections of one value each, the difference between them; anything else is an error.
 */
export const diffSelections: DateCombine = (texts, _inputs, context, budget) => {
  const values = texts.map((text) => dateLineValues(text));
  const allPairs = values.every((list) => list.every(({ value }) => splitPair(value) !== undefined));
  if (allPairs) {
    let used = 0;
    return texts.map((text, index) => inSelection(index, texts.length, () => {
      const result = mapDateLines(text, budget - used, context.eol, (value) => {
        const [a, b] = splitPair(value)!;
        return dateDiff(a, b);
      });
      used += result.length + context.eol.length;
      return result;
    })).join(context.eol);
  }
  if (texts.length === 2 && values.every((list) => list.length === 1)) {
    return dateDiff(values[0][0].value, values[1][0].value);
  }
  throw new DateInputError('select two dates, or write two dates on each line');
};

/** Counts the cron expressions of all selections before any is explained (DATE-025). */
const cronPrecheck = (texts: readonly string[]): void => assertCronLineCount(texts.map((text) => dateLineValues(text).length));

const integerOf = (inputs: readonly string[]): number => Number(inputs[0]);

const timeZone = lines((value, inputs, context) => toTimeZone(value, inputs[0], context.timeZones));
const pattern = lines((value, inputs) => formatPattern(value, inputs[0]));
const compact = lines((value) => toCompact(value));
const fromCompactLines = lines((value) => fromCompact(value));

const unused: DateTransform = () => {
  throw new Error('this command uses its combine function');
};

/** The 30 commands in the order of the DATE table of docs/ROADMAP.md. */
export const DATE_COMMAND_ENTRIES: readonly DateCommandEntry[] = [
  {
    id: 'DATE-001', name: 'date.to-utc-string', title: 'Date - Convert to UTC String (RFC 7231)', output: 'new-tab', prompts: [], settings: [],
    transform: lines((value) => toUtcString(value)),
  },
  {
    id: 'DATE-002', name: 'date.to-timezone', title: 'Date - Convert to Time Zone', output: 'new-tab', prompts: [TIME_ZONE_PROMPT], settings: [],
    transform: timeZone,
  },
  {
    id: 'DATE-003', name: 'date.to-timezones', title: 'Date - Show in Multiple Time Zones', output: 'new-tab', prompts: [], settings: ['timeZones'],
    transform: lines((value, _inputs, context) => toTimeZones(value, context.settings.timeZones, context.timeZones)),
    blankLineBetween: true,
  },
  {
    id: 'DATE-004', name: 'date.weekday', title: 'Date - Show Weekday', output: 'notify', prompts: [], settings: [],
    transform: unused, combine: weekdayNotification,
  },
  {
    id: 'DATE-005', name: 'date.append-weekday', title: 'Date - Append Weekday', output: 'replace', prompts: [], settings: ['weekdayLanguage'],
    transform: lines((value, _inputs, context) => appendWeekday(value, context.settings.weekdayLanguage)),
  },
  {
    id: 'DATE-006', name: 'date.iso-week', title: 'Date - ISO Week Number', output: 'new-tab', prompts: [], settings: [],
    transform: lines((value) => isoWeek(value)),
  },
  {
    id: 'DATE-007', name: 'date.day-of-year', title: 'Date - Day of Year', output: 'new-tab', prompts: [], settings: [],
    transform: lines((value) => dayOfYear(value)),
  },
  {
    id: 'DATE-008', name: 'date.diff', title: 'Date - Difference Between Two Dates', output: 'new-tab', prompts: [], settings: [],
    transform: unused, combine: diffSelections,
  },
  {
    id: 'DATE-009', name: 'date.add-days', title: 'Date - Add Days', output: 'replace', settings: [],
    prompts: [{ prompt: 'Number of days to add (negative to subtract)', placeHolder: '7', rule: { kind: 'integer', min: -1_000_000, max: 1_000_000 } }],
    transform: lines((value, inputs) => addDays(value, integerOf(inputs))),
  },
  {
    id: 'DATE-010', name: 'date.add-months', title: 'Date - Add Months', output: 'replace', settings: [],
    prompts: [{ prompt: 'Number of months to add (negative to subtract)', placeHolder: '1', rule: { kind: 'integer', min: -120_000, max: 120_000 } }],
    transform: lines((value, inputs) => addMonths(value, integerOf(inputs))),
  },
  {
    id: 'DATE-011', name: 'date.to-relative', title: 'Date - Convert to Relative Time', output: 'new-tab', prompts: [], settings: [],
    transform: lines((value, _inputs, context) => toRelative(value, context.now)),
  },
  {
    id: 'DATE-012', name: 'date.format-pattern', title: 'Date - Format with Pattern', output: 'new-tab', prompts: [PATTERN_PROMPT], settings: [],
    transform: pattern,
  },
  {
    id: 'DATE-013', name: 'date.to-compact', title: 'Date - Convert to Compact (YYYYMMDD)', output: 'new-tab', prompts: [], settings: [],
    transform: compact,
  },
  {
    id: 'DATE-014', name: 'date.from-compact', title: 'Date - Convert from Compact (YYYYMMDD)', output: 'new-tab', prompts: [], settings: [],
    transform: fromCompactLines,
  },
  {
    id: 'DATE-015', name: 'date.month-calendar', title: 'Date - Insert Month Calendar', output: 'replace', prompts: [], settings: [],
    transform: lines((value) => monthCalendar(value)),
  },
  {
    id: 'DATE-016', name: 'date.duration-to-human', title: 'Date - ISO 8601 Duration to Human', output: 'new-tab', prompts: [], settings: [],
    transform: lines((value) => durationToHuman(value)),
  },
  {
    id: 'DATE-017', name: 'date.seconds-to-hms', title: 'Date - Seconds to HH:MM:SS', output: 'new-tab', prompts: [], settings: [],
    transform: lines((value) => secondsToHms(value)),
  },
  {
    id: 'DATE-018', name: 'date.hms-to-seconds', title: 'Date - HH:MM:SS to Seconds', output: 'new-tab', prompts: [], settings: [],
    transform: lines((value) => hmsToSeconds(value)),
  },
  {
    id: 'DATE-019', name: 'date.to-excel-serial', title: 'Date - Convert to Excel Serial', output: 'new-tab', prompts: [], settings: [],
    transform: lines((value) => toExcelSerial(value)),
  },
  {
    id: 'DATE-020', name: 'date.from-excel-serial', title: 'Date - Convert from Excel Serial', output: 'new-tab', prompts: [], settings: [],
    transform: lines((value) => fromExcelSerial(value)),
  },
  {
    id: 'DATE-021', name: 'date.to-japanese', title: 'Date - Convert to Japanese Format', output: 'new-tab', prompts: [], settings: [],
    transform: lines((value) => toJapanese(value)),
  },
  {
    id: 'DATE-022', name: 'date.range', title: 'Date - Generate Date Range', output: 'replace', prompts: [], settings: [],
    transform: (text, _inputs, context, budget) =>
      mapDateLines(text, budget, context.eol, (value, output) => dateRange(value, output, context.eol.length)),
  },
  {
    id: 'DATE-023', name: 'date.age', title: 'Date - Calculate Age', output: 'new-tab', prompts: [], settings: [],
    transform: lines((value, _inputs, context) => age(value, context.now)),
  },
  {
    id: 'DATE-024', name: 'date.quarter', title: 'Date - Show Quarter and Fiscal Year', output: 'new-tab', prompts: [], settings: ['fiscalYearStartMonth'],
    transform: lines((value, _inputs, context) => quarter(value, context.settings.fiscalYearStartMonth)),
  },
  {
    id: 'DATE-025', name: 'date.cron-explain', title: 'Date - Explain Cron Expression', output: 'new-tab', prompts: [], settings: [],
    transform: lines((value, _inputs, context) => explainCron(value, context.now)),
    precheck: cronPrecheck,
    blankLineBetween: true,
  },
  {
    id: 'DATE-026', name: 'date.to-timezone.replace', title: 'Date - Convert to Time Zone (Replace)', output: 'replace', prompts: [TIME_ZONE_PROMPT], settings: [],
    transform: timeZone,
  },
  {
    id: 'DATE-027', name: 'date.to-timezone.clipboard', title: 'Date - Convert to Time Zone (Clipboard)', output: 'clipboard', prompts: [TIME_ZONE_PROMPT], settings: [],
    transform: timeZone,
  },
  {
    id: 'DATE-028', name: 'date.format-pattern.replace', title: 'Date - Format with Pattern (Replace)', output: 'replace', prompts: [PATTERN_PROMPT], settings: [],
    transform: pattern,
  },
  {
    id: 'DATE-029', name: 'date.to-compact.replace', title: 'Date - Convert to Compact (YYYYMMDD) (Replace)', output: 'replace', prompts: [], settings: [],
    transform: compact,
  },
  {
    id: 'DATE-030', name: 'date.from-compact.replace', title: 'Date - Convert from Compact (YYYYMMDD) (Replace)', output: 'replace', prompts: [], settings: [],
    transform: fromCompactLines,
  },
];

