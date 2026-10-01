/**
 * Pure (vscode-independent) command table of the DATEX-001..015 extended date commands (group
 * DATE2). They use the DATE command handler with this table, so the selections, the prompts, the
 * output limit, the notifications and the logging (never the selected text) are those of the DATE
 * commands: one value per line, blank lines and the spaces around each value are kept, and a value
 * that cannot be converted stops everything with its line number.
 *
 * Only local processing: no network, files or processes, no `eval` / `new Function`, no new
 * dependency (`Date`, `Intl` and `BigInt` only).
 */
import { mapDateLines } from './dateCommon';
import { DateCommandEntry, DateContext, DatePrompt, DateTransform } from './dateTransforms';
import {
  addBusinessDays,
  addIsoDuration,
  businessDaysBetween,
  DATE2_MAX_BUSINESS_DAYS,
  endOfMonth,
  eto,
  isoWeekToRange,
  objectIdToDate,
  parseIsoDuration,
  secondsToIsoDuration,
  snowflakeToDate,
  SNOWFLAKE_EPOCHS,
  startOfMonth,
  to12Hour,
  to24Hour,
  toRfc3339Offset,
  ulidToDate,
  uuidV7ToDate,
} from './date2Convert';

/** A transform that converts every line with `convert`. */
const lines = (convert: (value: string, inputs: readonly string[], context: DateContext) => string): DateTransform =>
  (text, inputs, context, budget) => mapDateLines(text, budget, context.eol, (value) => convert(value, inputs, context));

const DURATION_PROMPT: DatePrompt = {
  prompt: 'ISO 8601 duration to add (e.g. P1DT2H, PT90M, P1Y2M; a leading - subtracts)',
  placeHolder: 'P1DT2H',
  rule: { kind: 'parse', parse: (value) => parseIsoDuration(value) },
};

const TIME_ZONE_PROMPT: DatePrompt = {
  prompt: 'IANA time zone of the offset (e.g. Asia/Tokyo, UTC, America/New_York)',
  placeHolder: 'Asia/Tokyo',
  rule: { kind: 'timeZone' },
};

const EPOCH_PROMPT: DatePrompt = {
  prompt: 'Epoch of the Snowflake IDs: discord, or twitter for Twitter / X',
  placeHolder: 'discord',
  rule: { kind: 'choice', values: Object.keys(SNOWFLAKE_EPOCHS) },
};

/** The 15 commands in the order of the DATEX commands of the showcase data (scripts/showcase-data/DATEX.json). */
export const DATE2_COMMAND_ENTRIES: readonly DateCommandEntry[] = [
  {
    id: 'DATEX-001', name: 'date.add-iso-duration', title: 'Date - Add ISO 8601 Duration', output: 'replace', prompts: [DURATION_PROMPT], settings: [],
    transform: lines((value, inputs) => addIsoDuration(value, parseIsoDuration(inputs[0]))),
  },
  {
    id: 'DATEX-002', name: 'date.seconds-to-iso-duration', title: 'Date - Seconds to ISO 8601 Duration', output: 'new-tab', prompts: [], settings: [],
    transform: lines((value) => secondsToIsoDuration(value)),
  },
  {
    id: 'DATEX-003', name: 'date.start-of-month', title: 'Date - Start of Month', output: 'replace', prompts: [], settings: [],
    transform: lines((value) => startOfMonth(value)),
  },
  {
    id: 'DATEX-004', name: 'date.end-of-month', title: 'Date - End of Month', output: 'replace', prompts: [], settings: [],
    transform: lines((value) => endOfMonth(value)),
  },
  {
    id: 'DATEX-005', name: 'date.add-business-days', title: 'Date - Add Business Days', output: 'replace', settings: [],
    prompts: [{
      prompt: 'Number of business days (Monday to Friday; holidays are not known) to add (negative to subtract)',
      placeHolder: '1',
      rule: { kind: 'integer', min: -DATE2_MAX_BUSINESS_DAYS, max: DATE2_MAX_BUSINESS_DAYS },
    }],
    transform: lines((value, inputs) => addBusinessDays(value, Number(inputs[0]))),
  },
  {
    id: 'DATEX-006', name: 'date.business-days-between', title: 'Date - Count Business Days Between', output: 'new-tab', prompts: [], settings: [],
    transform: lines((value) => businessDaysBetween(value)),
  },
  {
    id: 'DATEX-007', name: 'date.to-rfc3339-offset', title: 'Date - Convert to RFC 3339 with Local Offset', output: 'new-tab', prompts: [TIME_ZONE_PROMPT], settings: [],
    transform: lines((value, inputs, context) => toRfc3339Offset(value, inputs[0], context.timeZones)),
  },
  {
    id: 'DATEX-008', name: 'date.iso-week-to-range', title: 'Date - ISO Week to Date Range', output: 'new-tab', prompts: [], settings: [],
    transform: lines((value) => isoWeekToRange(value)),
  },
  {
    id: 'DATEX-009', name: 'date.eto', title: 'Date - Sexagenary Cycle (Eto, 干支)', output: 'new-tab', prompts: [], settings: [],
    transform: lines((value) => eto(value)),
  },
  {
    id: 'DATEX-010', name: 'date.to-12h', title: 'Date - Convert Time to 12-hour', output: 'replace', prompts: [], settings: [],
    transform: lines((value) => to12Hour(value)),
  },
  {
    id: 'DATEX-011', name: 'date.to-24h', title: 'Date - Convert Time to 24-hour', output: 'replace', prompts: [], settings: [],
    transform: lines((value) => to24Hour(value)),
  },
  {
    id: 'DATEX-012', name: 'date.snowflake-to-date', title: 'Date - Snowflake ID to Date', output: 'new-tab', prompts: [EPOCH_PROMPT], settings: [],
    transform: lines((value, inputs) => snowflakeToDate(value, inputs[0])),
  },
  {
    id: 'DATEX-013', name: 'date.ulid-to-date', title: 'Date - ULID to Date', output: 'new-tab', prompts: [], settings: [],
    transform: lines((value) => ulidToDate(value)),
  },
  {
    id: 'DATEX-014', name: 'date.uuid-v7-to-date', title: 'Date - UUID v7 to Date', output: 'new-tab', prompts: [], settings: [],
    transform: lines((value) => uuidV7ToDate(value)),
  },
  {
    id: 'DATEX-015', name: 'date.objectid-to-date', title: 'Date - MongoDB ObjectId to Date', output: 'new-tab', prompts: [], settings: [],
    transform: lines((value) => objectIdToDate(value)),
  },
];
