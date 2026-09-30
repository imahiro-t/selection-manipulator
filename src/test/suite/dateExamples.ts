/**
 * The input / output examples of the DATE commands of the showcase data (scripts/showcase-data/DATE.json) (`⏎` expanded, `·` = space),
 * with the exact results of the commands, the values typed into the input boxes and the current
 * time the tests fix.
 */
export interface DateExample {
  /** The selected text (one selection). */
  input: string;
  /** The answers to the input boxes, in order. */
  inputs: string[];
  /** The `（…）` note after the ROADMAP input that stands for the typed values. */
  note?: string;
  /** The exact result (new editor / replacement / clipboard / notification). */
  expected: string;
}

/** The current time of the tests: 2026-09-28 (Monday) 12:00:00.000 local time. */
export const DATE_TEST_NOW = (): Date => new Date(2026, 8, 28, 12, 0, 0, 0);

const TZ_EXAMPLE: DateExample = { input: '2026-09-28T00:00:00Z', inputs: ['Asia/Tokyo'], note: 'Asia/Tokyo', expected: '2026-09-28 09:00:00 +09:00' };
const PATTERN_EXAMPLE: DateExample = { input: '2026-09-28T09:05:00', inputs: ['yyyy/MM/dd HH:mm'], note: 'yyyy/MM/dd HH:mm', expected: '2026/09/28 09:05' };

export const DATE_ROADMAP_EXAMPLES: Record<string, DateExample> = {
  'DATE-001': { input: '2026-09-28', inputs: [], expected: 'Mon, 28 Sep 2026 00:00:00 GMT' },
  'DATE-002': TZ_EXAMPLE,
  'DATE-003': { input: '2026-09-28T00:00:00Z', inputs: [], expected: 'UTC 00:00\nAsia/Tokyo 09:00\nAmerica/Los_Angeles 17:00 (前日)' },
  'DATE-004': { input: '2026-09-28', inputs: [], expected: 'Monday（月）' },
  'DATE-005': { input: '2026-09-28', inputs: [], expected: '2026-09-28 (月)' },
  'DATE-006': { input: '2026-09-28', inputs: [], expected: '2026-W40' },
  'DATE-007': { input: '2026-09-28', inputs: [], expected: '271' },
  'DATE-008': { input: '2026-01-01 / 2026-09-28', inputs: [], expected: '270 days' },
  'DATE-009': { input: '2026-09-28', inputs: ['+5'], note: '+5', expected: '2026-10-03' },
  'DATE-010': { input: '2026-01-31', inputs: ['+1'], note: '+1', expected: '2026-02-28' },
  'DATE-011': { input: '2026-09-25', inputs: [], expected: '3 日前' },
  'DATE-012': PATTERN_EXAMPLE,
  'DATE-013': { input: '2026-09-28', inputs: [], expected: '20260928' },
  'DATE-014': { input: '20260928', inputs: [], expected: '2026-09-28' },
  'DATE-015': {
    input: '2026-09',
    inputs: [],
    expected: [
      'Su Mo Tu We Th Fr Sa',
      '       1  2  3  4  5',
      ' 6  7  8  9 10 11 12',
      '13 14 15 16 17 18 19',
      '20 21 22 23 24 25 26',
      '27 28 29 30',
    ].join('\n'),
  },
  'DATE-016': { input: 'PT1H30M', inputs: [], expected: '1 時間 30 分' },
  'DATE-017': { input: '3661', inputs: [], expected: '01:01:01' },
  'DATE-018': { input: '01:01:01', inputs: [], expected: '3661' },
  'DATE-019': { input: '2026-09-28', inputs: [], expected: '46293' },
  'DATE-020': { input: '46293', inputs: [], expected: '2026-09-28' },
  'DATE-021': { input: '2026-09-28', inputs: [], expected: '2026年9月28日' },
  'DATE-022': { input: '2026-09-28..2026-09-30', inputs: [], expected: '2026-09-28\n2026-09-29\n2026-09-30' },
  'DATE-023': { input: '1990-04-01', inputs: [], expected: '36' },
  'DATE-024': { input: '2026-09-28', inputs: [], expected: '2026 Q3 / FY2026 上期' },
  'DATE-025': {
    input: '0 9 * * 1',
    inputs: [],
    expected: '毎週月曜 09:00（次回: 2026-10-05 09:00, 2026-10-12 09:00, 2026-10-19 09:00, 2026-10-26 09:00, 2026-11-02 09:00）',
  },
  'DATE-026': TZ_EXAMPLE,
  'DATE-027': TZ_EXAMPLE,
  'DATE-028': PATTERN_EXAMPLE,
  'DATE-029': { input: '2026-09-28', inputs: [], expected: '20260928' },
  'DATE-030': { input: '20260928', inputs: [], expected: '2026-09-28' },
};

/** Text that no command accepts. */
export const DATE_INVALID_INPUT = 'abc';
