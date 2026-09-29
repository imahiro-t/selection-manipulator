import * as assert from 'assert';
import {
  DATE_MAX_CRON_LINES,
  DATE_MAX_RANGE_ENTRIES,
  DateInputError,
  DateSettings,
  DEFAULT_DATE_SETTINGS,
  MAX_OUTPUT_LENGTH,
} from '../../handler/dateCommon';
import { toTimeZones } from '../../handler/dateConvert';
import { assertCronLineCount, explainCron, parseCron } from '../../handler/dateCron';
import { DATE_COMMAND_ENTRIES, DateCommandEntry, DateContext } from '../../handler/dateTransforms';
import { EncOutputTooLargeError } from '../../handler/encodeTransforms';
import { DATE_INVALID_INPUT, DATE_ROADMAP_EXAMPLES, DATE_TEST_NOW } from './dateExamples';

const contextOf = (settings: Partial<DateSettings> = {}, now = DATE_TEST_NOW(), eol = '\n'): DateContext =>
  ({ settings: { ...DEFAULT_DATE_SETTINGS, ...settings }, now, eol, timeZones: new Map() });

const entryOf = (id: string): DateCommandEntry => {
  const found = DATE_COMMAND_ENTRIES.find((entry) => entry.id === id);
  assert.ok(found, id);
  return found;
};

/** Runs the command on one selection. */
const run = (id: string, text: string, inputs: string[] = [], context = contextOf()): string => {
  const entry = entryOf(id);
  return entry.combine ? entry.combine([text], inputs, context, MAX_OUTPUT_LENGTH) : entry.transform(text, inputs, context, MAX_OUTPUT_LENGTH);
};

const throwsInput = (run: () => unknown, message: string | RegExp) =>
  assert.throws(run, (error: unknown) => {
    assert.ok(error instanceof DateInputError, String(error));
    if (typeof message === 'string') {
      assert.strictEqual(error.message, message);
    } else {
      assert.match(error.message, message);
    }
    return true;
  });

const pad = (n: number) => String(n).padStart(2, '0');

suite('Date Commands - transforms (DATE-001..030)', () => {
  suite('ROADMAP examples', () => {
    DATE_COMMAND_ENTRIES.forEach((entry) => {
      test(`${entry.id} ${entry.name}`, () => {
        const example = DATE_ROADMAP_EXAMPLES[entry.id];
        assert.strictEqual(run(entry.id, example.input, example.inputs), example.expected);
      });
    });
  });

  suite('invalid input', () => {
    DATE_COMMAND_ENTRIES.forEach((entry) => {
      test(`${entry.id} ${entry.name}: "${DATE_INVALID_INPUT}" is refused`, () => {
        const example = DATE_ROADMAP_EXAMPLES[entry.id];
        if (entry.id === 'DATE-008') {
          throwsInput(() => run(entry.id, DATE_INVALID_INPUT), 'select two dates, or write two dates on each line');
        } else {
          throwsInput(() => run(entry.id, `${example.input}\n${DATE_INVALID_INPUT}`, example.inputs), /^line 2: "abc" is (not|out)/);
        }
      });
    });
  });

  suite('lines', () => {
    test('blank lines and the spaces around the values are kept; CRLF output for multi-line results', () => {
      assert.strictEqual(run('DATE-013', '  2026-09-28 \n\n\t2026/1/2'), '  20260928 \n\n\t20260102');
      assert.strictEqual(run('DATE-022', ' 2026-09-28..2026-09-29', [], contextOf({}, DATE_TEST_NOW(), '\r\n')), ' 2026-09-28\r\n 2026-09-29');
    });
  });

  suite('DATE-001 / 002 / 003: instants and time zones', () => {
    test('DATE-001: offsets, local time and timestamps', () => {
      assert.strictEqual(run('DATE-001', '2026-09-28T09:00:00+09:00'), 'Mon, 28 Sep 2026 00:00:00 GMT');
      assert.strictEqual(run('DATE-001', '2026-09-28T09:00:00'), new Date(2026, 8, 28, 9).toUTCString());
      assert.strictEqual(run('DATE-001', '1790553600'), 'Mon, 28 Sep 2026 00:00:00 GMT');
      assert.strictEqual(run('DATE-001', '1790553600000'), 'Mon, 28 Sep 2026 00:00:00 GMT');
    });

    test('DATE-002: daylight saving time and offsets that are not whole hours', () => {
      assert.strictEqual(run('DATE-002', '2026-07-01T00:00:00Z', ['America/New_York']), '2026-06-30 20:00:00 -04:00');
      assert.strictEqual(run('DATE-002', '2026-01-01T00:00:00Z', ['America/New_York']), '2025-12-31 19:00:00 -05:00');
      assert.strictEqual(run('DATE-002', '2026-09-28T00:00:00Z', ['Asia/Kathmandu']), '2026-09-28 05:45:00 +05:45');
      assert.strictEqual(run('DATE-002', '2026-09-28T00:00:00Z', ['Asia/Kolkata']), '2026-09-28 05:30:00 +05:30');
      assert.strictEqual(run('DATE-002', '2026-09-28T23:59:59.999Z', ['UTC']), '2026-09-28 23:59:59 +00:00');
      assert.strictEqual(run('DATE-002', '2026-09-28T00:00:00Z', ['Etc/GMT+12']), '2026-09-27 12:00:00 -12:00');
    });

    test('DATE-002 / 003 / 026 / 027: results outside the years 0001..9999 are errors', () => {
      assert.strictEqual(run('DATE-002', '9999-12-31T14:59:59Z', ['Asia/Tokyo']), '9999-12-31 23:59:59 +09:00');
      assert.strictEqual(run('DATE-002', '0001-01-01T05:00:00Z', ['Etc/GMT+5']), '0001-01-01 00:00:00 -05:00');
      for (const id of ['DATE-002', 'DATE-026', 'DATE-027']) {
        throwsInput(() => run(id, '9999-12-31T23:00:00Z', ['Asia/Tokyo']), 'line 1: the result is outside the years 0001 to 9999');
        throwsInput(() => run(id, '9999-12-31T23:00-05:00', ['UTC']), 'line 1: the result is outside the years 0001 to 9999');
        throwsInput(() => run(id, '0001-01-01T00:00:00Z', ['America/New_York']), 'line 1: the result is outside the years 0001 to 9999');
      }
      throwsInput(() => run('DATE-003', '9999-12-31T23:00:00Z', [], contextOf({ timeZones: ['Asia/Tokyo'] })),
        'line 1: the result is outside the years 0001 to 9999');
    });

    test('DATE-002: a date and time without an offset is local time', () => {
      const local = new Date(2026, 8, 28, 9, 30);
      const utc = `${local.getUTCFullYear()}-${pad(local.getUTCMonth() + 1)}-${pad(local.getUTCDate())} ${pad(local.getUTCHours())}:${pad(local.getUTCMinutes())}:00 +00:00`;
      assert.strictEqual(run('DATE-002', '2026-09-28 09:30', ['UTC']), utc);
    });

    test('DATE-003: next day and several time zones; the formatters are made once per time zone', () => {
      const cache = new Map<string, Intl.DateTimeFormat>();
      assert.deepStrictEqual(toTimeZones('2026-09-28T20:00:00Z', ['UTC', 'Asia/Tokyo', 'Pacific/Kiritimati'], cache),
        ['UTC 20:00', 'Asia/Tokyo 05:00 (翌日)', 'Pacific/Kiritimati 10:00 (翌日)']);
      const first = cache.get('Asia/Tokyo');
      toTimeZones('2026-09-29T20:00:00Z', ['Asia/Tokyo'], cache);
      assert.strictEqual(cache.get('Asia/Tokyo'), first);
      assert.strictEqual(cache.size, 3);
      assert.strictEqual(run('DATE-003', '2026-09-28T12:00:00Z', [], contextOf({ timeZones: ['Europe/London'] })), 'Europe/London 13:00');
    });
  });

  suite('DATE-004 / 005: weekday', () => {
    test('DATE-004: one value, several values in document order, blank lines not counted', () => {
      const weekday = entryOf('DATE-004').combine!;
      assert.strictEqual(weekday(['2026-09-28'], [], contextOf(), MAX_OUTPUT_LENGTH), 'Monday（月）');
      assert.strictEqual(weekday(['2026-09-28\n\n2026-09-29', ' 2026/10/4 '], [], contextOf(), MAX_OUTPUT_LENGTH),
        '2026-09-28: Monday（月）, 2026-09-29: Tuesday（火）, 2026/10/4: Sunday（日）');
    });

    test('DATE-004: at most 20 values are shown, then the number of the others', () => {
      const weekday = entryOf('DATE-004').combine!;
      const text = Array.from({ length: 25 }, (_, i) => `2026-10-${pad(i + 1)}`).join('\n');
      const result = weekday([text], [], contextOf(), MAX_OUTPUT_LENGTH);
      assert.ok(result.startsWith('2026-10-01: Thursday（木）, 2026-10-02: Friday（金）'), result);
      assert.ok(result.endsWith('2026-10-20: Tuesday（火）, … and 5 more'), result);
      assert.strictEqual(result.split(': ').length - 1, 20);
    });

    test('DATE-004: an invalid line names the selection and the line', () => {
      const weekday = entryOf('DATE-004').combine!;
      throwsInput(() => weekday(['2026-09-28', '2026-09-28\nabc', '2026-09-28'], [], contextOf(), MAX_OUTPUT_LENGTH),
        'selection 2 of 3: line 2: "abc" is not a date');
      throwsInput(() => weekday(['2026-09-28\nabc'], [], contextOf(), MAX_OUTPUT_LENGTH), 'line 2: "abc" is not a date');
    });

    test('DATE-005: Japanese or English, time parts and trailing spaces kept', () => {
      assert.strictEqual(run('DATE-005', '2026-09-28T10:00 '), '2026-09-28T10:00 (月) ');
      assert.strictEqual(run('DATE-005', '2026/10/04', [], contextOf({ weekdayLanguage: 'en' })), '2026/10/04 (Sun)');
    });
  });

  suite('DATE-006 / 007: ISO week and day of year', () => {
    test('weeks across the year boundary', () => {
      assert.strictEqual(run('DATE-006', '2027-01-01'), '2026-W53');
      assert.strictEqual(run('DATE-006', '2026-01-01'), '2026-W01');
      assert.strictEqual(run('DATE-006', '2024-12-30'), '2025-W01');
      assert.strictEqual(run('DATE-006', '2021-01-03'), '2020-W53');
      assert.strictEqual(run('DATE-006', '2026-01-05'), '2026-W02');
    });

    test('day of year in leap and common years', () => {
      assert.strictEqual(run('DATE-007', '2024-12-31\n2026-12-31\n2026-01-01\n2024-03-01'), '366\n365\n1\n61');
    });
  });

  suite('DATE-008: difference', () => {
    const diff = (texts: string[]) => entryOf('DATE-008').combine!(texts, [], contextOf(), MAX_OUTPUT_LENGTH);

    test('every separator, one difference per line, signed', () => {
      assert.strictEqual(diff(['2026-09-28 / 2026-09-29\n2026-09-28..2026-09-25\n2026-01-01~2026-01-01\n2026-01-01〜2027-01-01\n2026-01-01,2026-01-03\n2026-01-01\t2026-01-02\n2026-01-01～2026-01-05']),
        '1 day\n-3 days\n0 days\n365 days\n2 days\n1 day\n4 days');
    });

    test('with a time: days, hours and minutes (seconds dropped)', () => {
      assert.strictEqual(diff(['2026-09-27T08:30 / 2026-09-28T10:00:59']), '1 day 1 hour 30 minutes');
      assert.strictEqual(diff(['2026-09-28T10:00 / 2026-09-27T08:30']), '-1 day 1 hour 30 minutes');
      assert.strictEqual(diff(['2026-09-28 / 2026-09-28T02:05']), '0 days 2 hours 5 minutes');
      assert.strictEqual(diff(['2026-09-28T10:00+09:00 / 2026-09-28T01:30Z']), '0 days 0 hours 30 minutes');
    });

    test('an offset on only one of the dates is an error', () => {
      throwsInput(() => diff(['2026-09-28T10:00+09:00 / 2026-09-28T10:00']), 'line 1: write a time zone offset on both dates or on neither');
    });

    test('two selections of one date each', () => {
      assert.strictEqual(diff(['2026-01-01', '2026-09-28']), '270 days');
    });

    test('several pairs in several selections, joined with the EOL; errors name the selection', () => {
      assert.strictEqual(diff(['2026-01-01 / 2026-01-02', '2026-01-01 / 2026-01-04']), '1 day\n3 days');
      throwsInput(() => diff(['2026-01-01 / 2026-01-02', '2026-01-01 / x']), 'selection 2 of 2: line 1: "x" is not a date');
    });

    test('anything else is an error', () => {
      throwsInput(() => diff(['2026-01-01', '2026-01-02', '2026-01-03']), 'select two dates, or write two dates on each line');
      throwsInput(() => diff(['2026-01-01\n2026-01-02']), 'select two dates, or write two dates on each line');
      throwsInput(() => diff(['2026-01-01 / 2026-01-02\n2026-01-03']), 'select two dates, or write two dates on each line');
    });
  });

  suite('DATE-009 / 010: adding days and months', () => {
    test('the form of the value is kept', () => {
      assert.strictEqual(run('DATE-009', '2026/9/28 10:00+09:00', ['-30']), '2026/08/29 10:00+09:00');
      assert.strictEqual(run('DATE-009', '2024-02-28', ['1']), '2024-02-29');
      assert.strictEqual(run('DATE-009', '2026-12-31T23:59:59.999Z', ['1']), '2027-01-01T23:59:59.999Z');
    });

    test('month ends are rounded down, leap years included', () => {
      assert.strictEqual(run('DATE-010', '2024-01-31', ['1']), '2024-02-29');
      assert.strictEqual(run('DATE-010', '2024-02-29', ['12']), '2025-02-28');
      assert.strictEqual(run('DATE-010', '2026-03-31', ['-1']), '2026-02-28');
      assert.strictEqual(run('DATE-010', '2026-11-15', ['2']), '2027-01-15');
      assert.strictEqual(run('DATE-010', '2026-01-15', ['-13']), '2024-12-15');
    });

    test('results outside the years 0001..9999 are errors', () => {
      throwsInput(() => run('DATE-009', '9999-12-31', ['1']), 'line 1: the result is outside the years 0001 to 9999');
      throwsInput(() => run('DATE-009', '0001-01-01', ['-1']), 'line 1: the result is outside the years 0001 to 9999');
      throwsInput(() => run('DATE-010', '9999-12-01', ['1']), 'line 1: the result is outside the years 0001 to 9999');
      throwsInput(() => run('DATE-010', '2026-01-01', ['-120000']), 'line 1: the result is outside the years 0001 to 9999');
    });
  });

  suite('DATE-011: relative time', () => {
    const relative = (value: string) => run('DATE-011', value);

    test('a date alone is compared by calendar days with today', () => {
      assert.strictEqual(relative('2026-09-28'), '今日');
      assert.strictEqual(relative('2026-09-29'), '1 日後');
      assert.strictEqual(relative('2026-08-30'), '29 日前');
      assert.strictEqual(relative('2026-10-28'), '1 か月後');
      assert.strictEqual(relative('2026-03-01'), '6 か月前');
      assert.strictEqual(relative('2027-09-28'), '1 年後');
      assert.strictEqual(relative('2016-01-01'), '10 年前');
    });

    test('a date and time is compared with the current time as an instant', () => {
      assert.strictEqual(relative('2026-09-28T11:59:30'), '30 秒前');
      assert.strictEqual(relative('2026-09-28T12:30'), '30 分後');
      assert.strictEqual(relative('2026-09-28T09:00'), '3 時間前');
      assert.strictEqual(relative('2026-09-30T12:00'), '2 日後');
      assert.strictEqual(relative('2026-09-28 00:00'), '12 時間前');
    });

    test('offsets and timestamps are instants', () => {
      const now = DATE_TEST_NOW().getTime();
      const iso = new Date(now - 5 * 60_000).toISOString();
      assert.strictEqual(relative(iso), '5 分前');
      assert.strictEqual(relative(String(Math.floor(now / 1000) + 7200)), '2 時間後');
    });
  });

  suite('DATE-012: pattern', () => {
    const format = (value: string, pattern: string) => run('DATE-012', value, [pattern]);

    test('tokens', () => {
      assert.strictEqual(format('2026-09-28', 'yyyyMMdd'), '20260928');
      assert.strictEqual(format('2026-09-28T09:05', 'HHmm'), '0905');
      assert.strictEqual(format('2026-09-28T09:05:07.042', "yy/M/d H:m:s.SSS 'T'"), '26/9/28 9:5:7.042 T');
      assert.strictEqual(format('2026-09-28T21:05', 'h:mm a (hh) E EEEE'), '9:05 PM (09) Mon Monday');
      assert.strictEqual(format('2026-09-28T00:00', 'h a'), '12 AM');
      assert.strictEqual(format('2026-09-28', "yyyy'T'HH''Q"), "2026T00'Q");
    });

    test('the written date and time are used as they are (no time zone conversion)', () => {
      assert.strictEqual(format('2026-09-28T09:05+05:00', 'HH:mm'), '09:05');
    });

    test('unsupported tokens and unterminated quotes are errors', () => {
      throwsInput(() => format('2026-09-28', 'EEE'), 'line 1: unsupported pattern token "EEE"');
      throwsInput(() => format('2026-09-28', 'MMM'), 'line 1: unsupported pattern token "MMM"');
      throwsInput(() => format('2026-09-28', "'x"), 'line 1: the pattern has an unterminated quote');
    });
  });

  suite('DATE-013 / 014 / 021: compact and Japanese forms', () => {
    test('conversions', () => {
      assert.strictEqual(run('DATE-013', '2026/1/2T10:00'), '20260102');
      assert.strictEqual(run('DATE-014', '00010101'), '0001-01-01');
      assert.strictEqual(run('DATE-021', '2026-01-02 10:00'), '2026年1月2日');
    });

    test('invalid compact dates', () => {
      throwsInput(() => run('DATE-014', '20260230'), 'line 1: "20260230" is not a valid date');
      throwsInput(() => run('DATE-014', '00000101'), 'line 1: "00000101" is not a valid date');
      throwsInput(() => run('DATE-014', '2026092'), /is not a date of 8 digits/);
    });
  });

  suite('DATE-015: month calendar', () => {
    test('the example month: 2 columns per day, right-aligned, no trailing spaces, at most 20 characters', () => {
      const lines = run('DATE-015', '2026-09').split('\n');
      assert.strictEqual(lines[1], '       1  2  3  4  5');
      lines.forEach((line) => {
        assert.ok(line.length <= 20, line);
        assert.strictEqual(line, line.trimEnd());
      });
    });

    test('a month starting on Sunday and one starting on Saturday; a date selects its month', () => {
      assert.strictEqual(run('DATE-015', '2026-02'), 'Su Mo Tu We Th Fr Sa\n 1  2  3  4  5  6  7\n 8  9 10 11 12 13 14\n15 16 17 18 19 20 21\n22 23 24 25 26 27 28');
      assert.strictEqual(run('DATE-015', '2026/8/15'), 'Su Mo Tu We Th Fr Sa\n                   1\n 2  3  4  5  6  7  8\n 9 10 11 12 13 14 15\n16 17 18 19 20 21 22\n23 24 25 26 27 28 29\n30 31');
    });

    test('invalid months', () => {
      throwsInput(() => run('DATE-015', '2026-13'), 'line 1: "2026-13" is not a valid month');
      throwsInput(() => run('DATE-015', 'Sep 2026'), /is not a month \(YYYY-MM\) or a date/);
    });
  });

  suite('DATE-016: ISO 8601 durations', () => {
    test('conversions', () => {
      assert.strictEqual(run('DATE-016', 'P1Y2M3W4DT5H6M7S'), '1 年 2 か月 3 週 4 日 5 時間 6 分 7 秒');
      assert.strictEqual(run('DATE-016', 'PT1.50S'), '1.5 秒');
      assert.strictEqual(run('DATE-016', 'PT0,5H'), '0.5 時間');
      assert.strictEqual(run('DATE-016', 'P0DT0H'), '0 秒');
      assert.strictEqual(run('DATE-016', 'P1DT0H30M'), '1 日 30 分');
    });

    test('invalid durations', () => {
      for (const value of ['P', 'PT', 'P1DT', 'P1H', 'PT1D', 'P1M1Y', '-P1D', 'P1234567890123456D']) {
        throwsInput(() => run('DATE-016', value), /is not an ISO 8601 duration/);
      }
      throwsInput(() => run('DATE-016', 'P1.5DT1H'), /only the last element of a duration may have a fraction/);
    });
  });

  suite('DATE-017 / 018: seconds and HH:MM:SS', () => {
    test('conversions', () => {
      assert.strictEqual(run('DATE-017', '0\n59\n-3600\n360000'), '00:00:00\n00:00:59\n-01:00:00\n100:00:00');
      assert.strictEqual(run('DATE-018', '0:59\n-1:00:00\n100:00:00\n00:00'), '59\n-3600\n360000\n0');
    });

    test('invalid values', () => {
      throwsInput(() => run('DATE-017', '1.5'), /is not an integer number of seconds/);
      throwsInput(() => run('DATE-017', '9007199254740992'), /is not an integer number of seconds/);
      throwsInput(() => run('DATE-018', '1:60:00'), /is not a time of H:MM:SS or M:SS/);
      throwsInput(() => run('DATE-018', '1:5'), /is not a time of H:MM:SS or M:SS/);
      throwsInput(() => run('DATE-018', '999999999999999:00:00'), /is out of range/);
    });
  });

  suite('DATE-019 / 020: Excel serials', () => {
    test('the 1900 boundary (Excel counts 1900-02-29)', () => {
      assert.strictEqual(run('DATE-019', '1900-01-01\n1900-02-28\n1900-03-01\n9999-12-31'), '1\n59\n61\n2958465');
      assert.strictEqual(run('DATE-020', '1\n59\n61\n2958465'), '1900-01-01\n1900-02-28\n1900-03-01\n9999-12-31');
      throwsInput(() => run('DATE-019', '1899-12-31'), 'line 1: "1899-12-31" is before 1900-01-01');
    });

    test('times are fractions of the day', () => {
      assert.strictEqual(run('DATE-019', '2026-09-28T12:00'), '46293.5');
      assert.strictEqual(run('DATE-019', '2026-09-28T06:00:00Z'), '46293.25');
      assert.strictEqual(run('DATE-020', '46293.5\n46293.25\n46293.0'), '2026-09-28 12:00:00\n2026-09-28 06:00:00\n2026-09-28');
    });

    test('round trips', () => {
      for (const serial of ['1', '59', '61', '366', '46293', '2958465']) {
        assert.strictEqual(run('DATE-019', run('DATE-020', serial)), serial);
      }
    });

    test('rounding to 24:00:00 moves to the next calendar day', () => {
      assert.strictEqual(run('DATE-020', '46293.999995'), '2026-09-29 00:00:00');
      assert.strictEqual(run('DATE-020', '59.999999'), '1900-03-01 00:00:00');
      assert.strictEqual(run('DATE-020', '2958465.99999'), '9999-12-31 23:59:59');
      // 86399.5 / 86400 ≈ 0.99999421: the last fraction that stays on the day.
      assert.strictEqual(run('DATE-020', '2958465.999994'), '9999-12-31 23:59:59');
      throwsInput(() => run('DATE-020', '2958465.9999943'), 'line 1: 2958465.9999943 is after 9999-12-31');
      throwsInput(() => run('DATE-020', '2958465.999995'), 'line 1: 2958465.999995 is after 9999-12-31');
    });

    test('60 (1900-02-29) and values out of range are errors', () => {
      throwsInput(() => run('DATE-020', '60'), 'line 1: 60 is 1900-02-29, which does not exist');
      throwsInput(() => run('DATE-020', '60.5'), 'line 1: 60.5 is 1900-02-29, which does not exist');
      throwsInput(() => run('DATE-020', '0.5'), /is out of range/);
      throwsInput(() => run('DATE-020', '2958466'), /is out of range/);
      throwsInput(() => run('DATE-020', '-1'), /is not an Excel serial number/);
      throwsInput(() => run('DATE-020', '1e3'), /is not an Excel serial number/);
    });
  });

  suite('DATE-022: range', () => {
    test('descending ranges, other separators and the form of the start', () => {
      assert.strictEqual(run('DATE-022', '2026/03/01 ~ 2026-02-27'), '2026/03/01\n2026/02/28\n2026/02/27');
      assert.strictEqual(run('DATE-022', '2026-09-28〜2026-09-28'), '2026-09-28');
      assert.strictEqual(run('DATE-022', '2026-09-28～2026-09-29'), '2026-09-28\n2026-09-29');
    });

    test('at most 10,000 dates per range', () => {
      const start = new Date(Date.UTC(2000, 0, 1));
      const end = new Date(start.getTime() + (DATE_MAX_RANGE_ENTRIES - 1) * 86_400_000);
      const iso = (date: Date) => date.toISOString().slice(0, 10);
      const result = run('DATE-022', `${iso(start)}..${iso(end)}`);
      assert.strictEqual(result.split('\n').length, DATE_MAX_RANGE_ENTRIES);
      const over = new Date(end.getTime() + 86_400_000);
      throwsInput(() => run('DATE-022', `${iso(start)}..${iso(over)}`), 'line 1: the range has more than 10,000 dates');
    });

    test('the output budget is checked before the dates are made', () => {
      const entry = entryOf('DATE-022');
      assert.throws(() => entry.transform('2026-01-01..2026-12-31', [], contextOf(), 1_000), EncOutputTooLargeError);
    });

    test('ranges take dates without a time', () => {
      throwsInput(() => run('DATE-022', '2026-09-28T10:00..2026-09-29'), /a range takes dates without a time/);
      throwsInput(() => run('DATE-022', '2026-09-28'), /is not a range/);
    });
  });

  suite('DATE-023 / 024: age and quarter', () => {
    test('age on the fixed date (2026-09-28)', () => {
      assert.strictEqual(run('DATE-023', '1990-09-28\n1990-09-29\n2026-09-28'), '36\n35\n0');
      throwsInput(() => run('DATE-023', '2026-09-29'), 'line 1: "2026-09-29" is in the future');
    });

    test('born on 2/29: the birthday is 3/1 in common years', () => {
      assert.strictEqual(run('DATE-023', '2000-02-29', [], contextOf({}, new Date(2027, 1, 28, 12))), '26');
      assert.strictEqual(run('DATE-023', '2000-02-29', [], contextOf({}, new Date(2027, 2, 1, 12))), '27');
      assert.strictEqual(run('DATE-023', '2000-02-29', [], contextOf({}, new Date(2028, 1, 29, 12))), '28');
    });

    test('quarters and fiscal years starting in January, April and October', () => {
      const q = (value: string, month: number) => run('DATE-024', value, [], contextOf({ fiscalYearStartMonth: month }));
      assert.strictEqual(q('2027-03-31', 4), '2027 Q1 / FY2026 下期');
      assert.strictEqual(q('2026-04-01', 4), '2026 Q2 / FY2026 上期');
      assert.strictEqual(q('2026-12-31', 1), '2026 Q4 / FY2026 下期');
      assert.strictEqual(q('2026-06-30', 1), '2026 Q2 / FY2026 上期');
      assert.strictEqual(q('2026-09-30', 10), '2026 Q3 / FY2025 下期');
      assert.strictEqual(q('2026-10-01', 10), '2026 Q4 / FY2026 上期');
    });
  });

  suite('DATE-025: cron', () => {
    const now = DATE_TEST_NOW();

    test('common patterns in words; the fixed time (Monday 12:00) itself is not a next run', () => {
      assert.strictEqual(explainCron('0 12 * * *', now), '毎日 12:00（次回: 2026-09-29 12:00, 2026-09-30 12:00, 2026-10-01 12:00, 2026-10-02 12:00, 2026-10-03 12:00）');
      assert.strictEqual(explainCron('1 12 * * *', now).split('（')[1].slice(0, 20), '次回: 2026-09-28 12:01');
      assert.strictEqual(explainCron('*/20 * * * *', now), '20 分ごと（次回: 2026-09-28 12:20, 2026-09-28 12:40, 2026-09-28 13:00, 2026-09-28 13:20, 2026-09-28 13:40）');
      assert.strictEqual(explainCron('5 * * * *', now).split('（')[0], '毎時 5 分');
      assert.strictEqual(explainCron('* * * * *', now).split('（')[0], '毎分');
      assert.strictEqual(explainCron('0 9 1,15 * *', now).split('（')[0], '毎月1・15日 09:00');
      assert.strictEqual(explainCron('30 8 * * mon-fri', now).split('（')[0], '毎週月曜・火曜・水曜・木曜・金曜 08:30');
    });

    test('day of week 7 is Sunday; names in any case', () => {
      assert.strictEqual(explainCron('0 0 * * 7', now), explainCron('0 0 * * SUN', now));
      assert.strictEqual(explainCron('0 0 * * 7', now).split('（')[0], '毎週日曜 00:00');
      assert.strictEqual(explainCron('0 0 1 jan *', now), '分: 0, 時: 0, 日: 1, 月: JAN, 曜日: すべて（次回: 2027-01-01 00:00, 2028-01-01 00:00, 2029-01-01 00:00, 2030-01-01 00:00, 2031-01-01 00:00）');
    });

    test('every month name and day name (any case) equals its number, also in ranges and steps', () => {
      const months = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
      months.forEach((name, i) => {
        for (const written of [name, name.toLowerCase()]) {
          assert.deepStrictEqual(parseCron(`0 0 1 ${written} *`).month.values, [i + 1], written);
          assert.strictEqual(explainCron(`0 0 1 ${written} *`, now).split('（')[1], explainCron(`0 0 1 ${i + 1} *`, now).split('（')[1], written);
        }
      });
      const days = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];
      days.forEach((name, i) => {
        for (const written of [name, name.toLowerCase()]) {
          assert.deepStrictEqual(parseCron(`0 9 * * ${written}`).dayOfWeek.values, [i], written);
          assert.strictEqual(explainCron(`0 9 * * ${written}`, now), explainCron(`0 9 * * ${i}`, now), written);
        }
      });
      assert.strictEqual(explainCron('0 9 * * WED', now).split('（')[0], '毎週水曜 09:00');
      assert.deepStrictEqual(parseCron('* * * * MON-WED').dayOfWeek.values, [1, 2, 3]);
      assert.deepStrictEqual(parseCron('* * * * sat,wed').dayOfWeek.values, [3, 6]);
      assert.deepStrictEqual(parseCron('* * * jun-jul *').month.values, [6, 7]);
      assert.deepStrictEqual(parseCron('* * * JUL/2 *').month.values, [7, 9, 11]);
      assert.deepStrictEqual(parseCron('* * * APR-JUL/3 *').month.values, [4, 7]);
    });

    test('day of month and day of week both restricted: either matches (OR)', () => {
      assert.strictEqual(explainCron('0 9 1 * 1', now), '分: 0, 時: 9, 日: 1, 月: すべて, 曜日: 1（次回: 2026-10-01 09:00, 2026-10-05 09:00, 2026-10-12 09:00, 2026-10-19 09:00, 2026-10-26 09:00）');
      // With `*` in the day of month, only the day of week restricts.
      assert.strictEqual(explainCron('0 9 */2 * 1', now).includes('2026-10-12 09:00'), false);
      assert.strictEqual(explainCron('0 9 */2 * 1', now).includes('2026-10-05 09:00'), true);
    });

    test('steps and ranges', () => {
      assert.deepStrictEqual(parseCron('0-10/5 1/8 * * *').minute.values, [0, 5, 10]);
      assert.deepStrictEqual(parseCron('0-10/5 1/8 * * *').hour.values, [1, 9, 17]);
      assert.deepStrictEqual(parseCron('* * * * */2').dayOfWeek.values, [0, 2, 4, 6]);
      assert.deepStrictEqual(parseCron('* * * * 5-7').dayOfWeek.values, [0, 5, 6]);
    });

    test('only on 2/29, and never (February 30th)', () => {
      assert.strictEqual(explainCron('0 0 29 2 *', now), '分: 0, 時: 0, 日: 29, 月: 2, 曜日: すべて（次回: 2028-02-29 00:00, 2032-02-29 00:00）');
      assert.strictEqual(explainCron('0 0 30 2 *', now), '分: 0, 時: 0, 日: 30, 月: 2, 曜日: すべて（次回: なし）');
    });

    test('unsupported syntax', () => {
      throwsInput(() => explainCron('0 0 L * *', now), /"L" is not supported/);
      throwsInput(() => explainCron('0 0 ? * 1', now), /"\?" is not supported/);
      throwsInput(() => explainCron('0 0 * * 1#2', now), /"#" is not supported/);
      throwsInput(() => explainCron('0 0 15W * *', now), /"W" is not supported/);
      throwsInput(() => explainCron('0 0 1,L * *', now), /"L" is not supported/);
      throwsInput(() => explainCron('0 0 LW * *', now), /"L" is not supported/);
      throwsInput(() => explainCron('0 0 W * *', now), /"W" is not supported/);
      throwsInput(() => explainCron('0 0 * * 5L', now), /"L" is not supported/);
      throwsInput(() => explainCron('0 0 * * fri#3', now), /"#" is not supported/);
      throwsInput(() => explainCron('0 0 * * ?', now), /"\?" is not supported/);
      throwsInput(() => explainCron('0 0 * * MON-L', now), /"L" is not supported/);
      throwsInput(() => explainCron('0 0 5L * *', now), /"L" is not supported/);
      throwsInput(() => explainCron('* * * * FOO', now), /is not a valid value of the 曜日 field/);
      throwsInput(() => explainCron('* * * * JAN', now), /is not a valid value of the 曜日 field/);
      throwsInput(() => explainCron('@daily', now), /macros such as @daily are not supported/);
      throwsInput(() => explainCron('0 0 0 * * *', now), /is not a cron expression of 5 fields/);
      throwsInput(() => explainCron('60 * * * *', now), /is out of range for the 分 field/);
      throwsInput(() => explainCron('* * 0 * *', now), /is out of range for the 日 field/);
      throwsInput(() => explainCron('5-1 * * * *', now), /is out of range/);
      throwsInput(() => explainCron('*/0 * * * *', now), /is out of range/);
      throwsInput(() => explainCron('* * * FOO *', now), /is not a valid value of the 月 field/);
      throwsInput(() => explainCron(`${'0,'.repeat(100)}0 * * * *`, now), 'the cron expression is longer than 200 characters');
    });

    test('invalid names are invalid values, not unsupported syntax', () => {
      const invalid = (expression: string, token: string, field: string): void => {
        assert.throws(
          () => explainCron(expression, now),
          (e: unknown) =>
            e instanceof DateInputError &&
            e.message.includes(`"${token}" is not a valid value of the ${field} field`) &&
            !e.message.includes('is not supported'),
          expression,
        );
      };
      invalid('* * * JULY *', 'JULY', '月');
      invalid('* * * july *', 'JULY', '月');
      invalid('* * * * WEDS', 'WEDS', '曜日');
      invalid('* * * * LUN', 'LUN', '曜日');
      invalid('* * * * JUL', 'JUL', '曜日');
      invalid('* * * * MON-WEDS', 'WEDS', '曜日');
      invalid('* * 1L5 * *', '1L5', '日');
      invalid('* * L5 * *', 'L5', '日');
      invalid('* * WL * *', 'WL', '日');
    });

    test('the forms of L, W, # and ? stay unsupported', () => {
      throwsInput(() => explainCron('0 0 L * *', now), /"L" is not supported/);
      throwsInput(() => explainCron('0 0 * * 5L', now), /"L" is not supported/);
      throwsInput(() => explainCron('0 0 15W * *', now), /"W" is not supported/);
      throwsInput(() => explainCron('0 0 * * 1#2', now), /"#" is not supported/);
      throwsInput(() => explainCron('0 0 * * ?', now), /"\?" is not supported/);
      throwsInput(() => explainCron('0 0 L-3 * *', now), /"L" is not supported/);
    });

    test('at most 1,000 expressions in one run (checked before any search)', () => {
      assertCronLineCount([DATE_MAX_CRON_LINES]);
      assertCronLineCount([600, 400]);
      throwsInput(() => assertCronLineCount([DATE_MAX_CRON_LINES + 1]), 'too many cron expressions: at most 1,000 lines can be explained at once');
      throwsInput(() => assertCronLineCount([600, 401]), /too many cron expressions/);
      const precheck = entryOf('DATE-025').precheck!;
      precheck(['0 0 30 2 *\n\n'.repeat(DATE_MAX_CRON_LINES)]);
      throwsInput(() => precheck(['* * * * *\n'.repeat(500), '* * * * *\n'.repeat(501)]), /too many cron expressions/);
    });

    test('1,000 expressions that never run finish in reasonable time', function () {
      this.timeout(30_000);
      const text = Array.from({ length: DATE_MAX_CRON_LINES }, () => '0 0 30 2 *').join('\n');
      const result = run('DATE-025', text);
      assert.strictEqual(result.split('\n').length, DATE_MAX_CRON_LINES);
    });
  });

  suite('derived commands share the transform and prompts of their base', () => {
    const pairs: [string, string][] = [['DATE-026', 'DATE-002'], ['DATE-027', 'DATE-002'], ['DATE-028', 'DATE-012'], ['DATE-029', 'DATE-013'], ['DATE-030', 'DATE-014']];
    pairs.forEach(([derived, base]) => {
      test(`${derived} = ${base}`, () => {
        assert.strictEqual(entryOf(derived).transform, entryOf(base).transform);
        assert.deepStrictEqual(entryOf(derived).prompts, entryOf(base).prompts);
      });
    });
  });
});
