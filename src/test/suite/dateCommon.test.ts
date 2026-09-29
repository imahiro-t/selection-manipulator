import * as assert from 'assert';
import {
  civilFromDays,
  compilePattern,
  DATE_MAX_INPUT_LENGTH,
  DateInputError,
  DateSettingError,
  daysFromCivil,
  daysInMonth,
  DEFAULT_DATE_SETTINGS,
  findDatePromptProblem,
  instantOfValue,
  isLeapYear,
  isSupportedTimeZone,
  isValidDate,
  mapDateLines,
  parseDateValue,
  parseInstant,
  readDateSettings,
  truncateText,
  weekdayOf,
} from '../../handler/dateCommon';
import { EncOutputTooLargeError } from '../../handler/encodeTransforms';

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

suite('Date Commands - common helpers (dateCommon)', () => {
  suite('calendar', () => {
    test('leap years (1900 is not, 2000 is)', () => {
      assert.deepStrictEqual([1900, 2000, 2024, 2026, 4, 1].map(isLeapYear), [false, true, true, false, true, false]);
      assert.deepStrictEqual([daysInMonth(2024, 2), daysInMonth(2026, 2), daysInMonth(1900, 2), daysInMonth(2026, 9), daysInMonth(2026, 12)], [29, 28, 28, 30, 31]);
    });

    test('day numbers round-trip from 0001-01-01 to 9999-12-31', () => {
      assert.strictEqual(daysFromCivil(1970, 1, 1), 0);
      assert.strictEqual(daysFromCivil(2026, 9, 28), Date.UTC(2026, 8, 28) / 86_400_000);
      for (const [y, m, d] of [[1, 1, 1], [1900, 2, 28], [1900, 3, 1], [2000, 2, 29], [9999, 12, 31], [1969, 12, 31]]) {
        assert.deepStrictEqual(civilFromDays(daysFromCivil(y, m, d)), { year: y, month: m, day: d });
      }
      assert.strictEqual(daysFromCivil(1, 1, 1), -719_162);
    });

    test('weekdays (0 = Sunday)', () => {
      assert.strictEqual(weekdayOf(daysFromCivil(2026, 9, 28)), 1);
      assert.strictEqual(weekdayOf(daysFromCivil(1970, 1, 1)), 4);
      assert.strictEqual(weekdayOf(daysFromCivil(1, 1, 1)), 1);
      assert.strictEqual(weekdayOf(daysFromCivil(1969, 12, 28)), 0);
    });

    test('valid dates', () => {
      assert.strictEqual(isValidDate(2024, 2, 29), true);
      assert.strictEqual(isValidDate(2026, 2, 29), false);
      assert.strictEqual(isValidDate(0, 1, 1), false);
      assert.strictEqual(isValidDate(10000, 1, 1), false);
      assert.strictEqual(isValidDate(2026, 13, 1), false);
    });
  });

  suite('parsing', () => {
    test('accepted forms', () => {
      const v = parseDateValue('2026/9/8');
      assert.deepStrictEqual([v.year, v.month, v.day, v.hasTime, v.separator, v.rest, v.offsetMinutes], [2026, 9, 8, false, '/', '', undefined]);
      const t = parseDateValue('2026-09-28T09:05:07.5+09:00');
      assert.deepStrictEqual([t.hour, t.minute, t.second, t.millisecond, t.offsetMinutes, t.rest], [9, 5, 7, 500, 540, 'T09:05:07.5+09:00']);
      assert.strictEqual(parseDateValue('2026-09-28 09:05').hasTime, true);
      assert.strictEqual(parseDateValue('2026-09-28T09:05Z').offsetMinutes, 0);
      assert.strictEqual(parseDateValue('2026-09-28T09:05-0530').offsetMinutes, -330);
      assert.strictEqual(parseDateValue('0001-01-01').year, 1);
    });

    test('refused forms and dates that do not exist', () => {
      throwsInput(() => parseDateValue('abc'), '"abc" is not a date');
      throwsInput(() => parseDateValue('2026-02-30'), '"2026-02-30" is not a valid date');
      throwsInput(() => parseDateValue('2026-13-01'), '"2026-13-01" is not a valid date');
      throwsInput(() => parseDateValue('0000-01-01'), '"0000-01-01" is not a valid date');
      throwsInput(() => parseDateValue('2026-09-28T24:00'), '"2026-09-28T24:00" is not a valid time');
      throwsInput(() => parseDateValue('2026-09-28T09:60'), /is not a valid time/);
      throwsInput(() => parseDateValue('2026-09/28'), /is not a date/);
      throwsInput(() => parseDateValue('2026-09-28Z'), /is not a date/);
      throwsInput(() => parseDateValue('2026-09-28T09:00+24:00'), /invalid time zone offset/);
      throwsInput(() => parseDateValue('Sep 28 2026'), /is not a date/);
      throwsInput(() => parseDateValue('20260928'), /is not a date/);
    });

    test('instants: offset as written, a date alone at UTC midnight, no offset as local time', () => {
      assert.strictEqual(parseInstant('2026-09-28'), Date.UTC(2026, 8, 28));
      assert.strictEqual(parseInstant('2026-09-28T09:00:00+09:00'), Date.UTC(2026, 8, 28));
      assert.strictEqual(parseInstant('2026-09-28T09:00:00'), new Date(2026, 8, 28, 9, 0, 0).getTime());
      assert.strictEqual(instantOfValue(parseDateValue('0001-01-01')), daysFromCivil(1, 1, 1) * 86_400_000);
    });

    test('instants: Unix timestamps in seconds or milliseconds (as the existing date commands)', () => {
      assert.strictEqual(parseInstant('1790553600'), Date.UTC(2026, 8, 28));
      assert.strictEqual(parseInstant('1790553600000'), Date.UTC(2026, 8, 28));
      assert.strictEqual(parseInstant('0'), 0);
      assert.strictEqual(parseInstant('-86400'), -86_400_000);
      throwsInput(() => parseInstant('12345678901234'), /is not a date/);
      throwsInput(() => parseInstant('now'), /is not a date/);
    });
  });

  suite('mapDateLines', () => {
    const upper = (value: string) => value.toUpperCase();

    test('keeps the spaces around each value, blank lines and CRLF', () => {
      assert.strictEqual(mapDateLines('  a \r\n\r\n \t\nb', 1_000, '\r\n', upper), '  A \r\n\r\n \t\nB');
      assert.strictEqual(mapDateLines('a\n', 1_000, '\n', upper), 'A\n');
    });

    test('a result of several lines is joined with the EOL and the indentation of the value', () => {
      assert.strictEqual(mapDateLines('  x \ny', 1_000, '\r\n', (value) => [value, value]), '  x\r\n  x \ny\r\ny');
    });

    test('an error names the line', () => {
      throwsInput(() => mapDateLines('a\n\nbad', 1_000, '\n', (value) => {
        if (value === 'bad') {
          throw new DateInputError('"bad" is not a date');
        }
        return value;
      }), 'line 3: "bad" is not a date');
    });

    test('the budget stops the output early', () => {
      assert.throws(() => mapDateLines('aaaa\nbbbb', 6, '\n', upper), EncOutputTooLargeError);
      assert.strictEqual(mapDateLines('aaaa\nb', 6, '\n', upper), 'AAAA\nB');
    });

    test('a selection longer than the limit is refused', () => {
      throwsInput(() => mapDateLines('1'.repeat(DATE_MAX_INPUT_LENGTH + 1), Infinity, '\n', upper), 'the selection is longer than 1,000,000 characters');
    });
  });

  suite('messages', () => {
    test('values in a notification are cut to 60 characters', () => {
      assert.strictEqual(truncateText('a'.repeat(60)), 'a'.repeat(60));
      assert.strictEqual(truncateText('a'.repeat(61)), `${'a'.repeat(60)}…`);
      assert.strictEqual(truncateText('😀'.repeat(61)), `${'😀'.repeat(60)}…`);
    });

    test('quoted text in an error is cut to 60 characters', () => {
      throwsInput(() => parseDateValue('x'.repeat(200)), `"${'x'.repeat(60)}…" is not a date`);
    });
  });

  suite('patterns (DATE-012)', () => {
    test('runs of the same letter are one unit', () => {
      assert.deepStrictEqual(compilePattern('yyyyMMdd'), [{ token: 'yyyy' }, { token: 'MM' }, { token: 'dd' }]);
      assert.deepStrictEqual(compilePattern('HH:mm'), [{ token: 'HH' }, { literal: ':' }, { token: 'mm' }]);
    });

    test("quotes: '…' is literal, '' is one quote; undefined letters stay as they are", () => {
      assert.deepStrictEqual(compilePattern("yyyy'T'QZ''"), [{ token: 'yyyy' }, { literal: "TQZ'" }]);
      assert.deepStrictEqual(compilePattern("'it''s'"), [{ literal: "it's" }]);
      throwsInput(() => compilePattern("yyyy'T"), 'the pattern has an unterminated quote');
    });

    test('a defined letter with an undefined length is an error', () => {
      for (const token of ['yyy', 'y', 'yyyyy', 'EE', 'EEE', 'MMM', 'SS', 'aa', 'ddd']) {
        throwsInput(() => compilePattern(`${token}-dd`), `unsupported pattern token "${token}"`);
      }
    });
  });

  suite('typed values', () => {
    test('integers within the range, spaces ignored', () => {
      const rule = { kind: 'integer', min: -10, max: 10 } as const;
      assert.strictEqual(findDatePromptProblem(' +5 ', rule), undefined);
      assert.strictEqual(findDatePromptProblem('-10', rule), undefined);
      for (const bad of ['11', '1.5', '', 'x', '1e1']) {
        assert.strictEqual(findDatePromptProblem(bad, rule), 'Enter an integer from -10 to 10.', bad);
      }
    });

    test('time zones: checked for their form, then by Intl', () => {
      assert.strictEqual(isSupportedTimeZone('Asia/Tokyo'), true);
      assert.strictEqual(isSupportedTimeZone('UTC'), true);
      assert.strictEqual(isSupportedTimeZone('Etc/GMT+9'), true);
      assert.strictEqual(isSupportedTimeZone('Mars/Olympus'), false);
      assert.strictEqual(isSupportedTimeZone('Asia/Tokyo; rm'), false);
      assert.strictEqual(isSupportedTimeZone('A'.repeat(65)), false);
      assert.notStrictEqual(findDatePromptProblem('Nowhere/City', { kind: 'timeZone' }), undefined);
      assert.strictEqual(findDatePromptProblem(' Asia/Tokyo ', { kind: 'timeZone' }), undefined);
    });

    test('patterns: checked when typed; too long values are refused', () => {
      const rule = { kind: 'pattern' } as const;
      assert.strictEqual(findDatePromptProblem('yyyy/MM/dd HH:mm', rule), undefined);
      assert.strictEqual(findDatePromptProblem('EEE', rule), 'Unsupported pattern token "EEE".');
      assert.strictEqual(findDatePromptProblem("'x", rule), 'The pattern has an unterminated quote.');
      assert.strictEqual(findDatePromptProblem('  ', rule), 'Enter a pattern such as yyyy/MM/dd HH:mm.');
      assert.strictEqual(findDatePromptProblem('d'.repeat(101), rule), 'The value is longer than 100 characters.');
    });
  });

  suite('settings', () => {
    test('defaults when not set', () => {
      assert.deepStrictEqual(readDateSettings({}, ['timeZones', 'weekdayLanguage', 'fiscalYearStartMonth']), DEFAULT_DATE_SETTINGS);
    });

    test('valid values are used', () => {
      const settings = readDateSettings({ timeZones: ['Europe/Paris'], weekdayLanguage: 'en', fiscalYearStartMonth: 1 },
        ['timeZones', 'weekdayLanguage', 'fiscalYearStartMonth']);
      assert.deepStrictEqual(settings, { timeZones: ['Europe/Paris'], weekdayLanguage: 'en', fiscalYearStartMonth: 1 });
    });

    test('invalid values are errors naming the setting', () => {
      const cases: [Record<string, unknown>, string][] = [
        [{ timeZones: [] }, 'timeZones'],
        [{ timeZones: 'UTC' }, 'timeZones'],
        [{ timeZones: ['UTC', 'Nowhere/City'] }, 'timeZones'],
        [{ timeZones: new Array(21).fill('UTC') }, 'timeZones'],
        [{ timeZones: [1] }, 'timeZones'],
        [{ weekdayLanguage: 'fr' }, 'weekdayLanguage'],
        [{ fiscalYearStartMonth: 0 }, 'fiscalYearStartMonth'],
        [{ fiscalYearStartMonth: 13 }, 'fiscalYearStartMonth'],
        [{ fiscalYearStartMonth: 4.5 }, 'fiscalYearStartMonth'],
        [{ fiscalYearStartMonth: '4' }, 'fiscalYearStartMonth'],
      ];
      for (const [raw, key] of cases) {
        assert.throws(() => readDateSettings(raw, ['timeZones', 'weekdayLanguage', 'fiscalYearStartMonth']), (error: unknown) => {
          assert.ok(error instanceof DateSettingError);
          assert.strictEqual(error.message, `the setting selection-manipulator.date.${key} is invalid`);
          return true;
        }, JSON.stringify(raw));
      }
    });

    test('only the settings a command uses are checked', () => {
      assert.deepStrictEqual(readDateSettings({ timeZones: [], weekdayLanguage: 'fr' }, ['fiscalYearStartMonth']), DEFAULT_DATE_SETTINGS);
    });
  });
});
