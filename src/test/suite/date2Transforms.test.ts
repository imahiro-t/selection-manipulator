import * as assert from 'assert';
import { DateInputError, findDatePromptProblem } from '../../handler/dateCommon';
import {
  addBusinessDays,
  addBusinessDaysTo,
  addIsoDuration,
  businessDaysBetween,
  businessDaysBetweenDays,
  endOfMonth,
  eto,
  hasWeek53,
  isoWeekToRange,
  objectIdToDate,
  parseIsoDuration,
  secondsToIsoDuration,
  snowflakeToDate,
  startOfMonth,
  to12Hour,
  to24Hour,
  toRfc3339Offset,
  ulidToDate,
  uuidV7ToDate,
} from '../../handler/date2Convert';
import { daysFromCivil } from '../../handler/dateCommon';
import { DATE2_COMMAND_ENTRIES } from '../../handler/date2Transforms';

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

const add = (value: string, duration: string) => addIsoDuration(value, parseIsoDuration(duration));

suite('Extended Date Conversions (DATEX-001..015) Test Suite', () => {

  suite('DATEX-001 add-iso-duration', () => {
    test('date, time and mixed elements; the offset and the joiner are written back', () => {
      assert.strictEqual(add('2026-10-01T00:00Z', 'P1DT2H'), '2026-10-02T02:00:00Z');
      assert.strictEqual(add('2026-10-01', 'P1D'), '2026-10-02');
      assert.strictEqual(add('2026/10/01', 'P2W'), '2026/10/15');
      assert.strictEqual(add('2026-10-01', 'PT1H'), '2026-10-01T01:00:00');
      assert.strictEqual(add('2026-10-01 09:00+0900', 'PT1.5S'), '2026-10-01 09:00:01.500+09:00');
      assert.strictEqual(add('2026-10-01T23:30:00-05:00', 'PT45M'), '2026-10-02T00:15:00-05:00');
      assert.strictEqual(add('2026-10-01T00:00', 'p1y2m3w4dt5h6m7.89s'), '2027-12-26T05:06:07.890');
    });

    test('months keep the day or clamp it to the end of the month (leap years); a leading - subtracts', () => {
      assert.strictEqual(add('2026-01-31', 'P1M'), '2026-02-28');
      assert.strictEqual(add('2024-01-31', 'P1M'), '2024-02-29');
      assert.strictEqual(add('2024-02-29', 'P1Y'), '2025-02-28');
      assert.strictEqual(add('2026-03-31', '-P1M'), '2026-02-28');
      assert.strictEqual(add('2026-10-01', '-PT1H'), '2026-09-30T23:00:00');
      assert.strictEqual(add('2026-10-01T00:00:00.250Z', '-PT0.5S'), '2026-09-30T23:59:59.750Z');
      assert.strictEqual(add('2026-10-01', '+P1D'), '2026-10-02');
    });

    test('large elements are exact; a result outside 0001..9999 is an error', () => {
      assert.strictEqual(add('2026-10-01', 'PT999999999S'), '2058-06-09T01:46:39');
      throwsInput(() => add('9999-12-31', 'P1D'), 'the result is outside the years 0001 to 9999');
      throwsInput(() => add('0001-01-01', '-PT1S'), 'the result is outside the years 0001 to 9999');
      throwsInput(() => add('2026-01-01', 'P999999999Y'), 'the result is outside the years 0001 to 9999');
      throwsInput(() => add('2026-01-01', 'P999999999W'), 'the result is outside the years 0001 to 9999');
    });

    test('invalid durations are refused (elements of up to 9 digits, a fraction only on the seconds)', () => {
      for (const bad of ['', 'P', 'PT', '1D', 'P1DT', 'P1.5D', 'PT1.5M', 'P1234567890D', 'PT1.2345S', 'P1D2Y', '--P1D', 'P 1D']) {
        throwsInput(() => parseIsoDuration(bad), /is not an ISO 8601 duration such as P1DT2H/);
      }
      assert.deepStrictEqual(parseIsoDuration('PT1,5S'), {
        negative: false, years: 0, months: 0, weeks: 0, days: 0, hours: 0, minutes: 0, seconds: 1, milliseconds: 500, hasTime: true,
      });
    });

    test('the prompt checks the duration with the same parser (a sentence, never an exception)', () => {
      const rule = DATE2_COMMAND_ENTRIES.find((entry) => entry.id === 'DATEX-001')!.prompts[0].rule;
      assert.strictEqual(findDatePromptProblem(' P1DT2H ', rule), undefined);
      assert.strictEqual(findDatePromptProblem('1 day', rule), '"1 day" is not an ISO 8601 duration such as P1DT2H (elements of up to 9 digits).');
    });
  });

  suite('DATEX-002 seconds-to-iso-duration', () => {
    test('days, hours, minutes and seconds; zero elements are left out', () => {
      const cases: [string, string][] = [
        ['5400', 'PT1H30M'], ['0', 'PT0S'], ['0.000', 'PT0S'], ['59', 'PT59S'], ['60', 'PT1M'], ['86400', 'P1D'],
        ['90061.250', 'P1DT1H1M1.25S'], ['0.5', 'PT0.5S'], ['9007199254740991', 'P104249991374DT7H36M31S'],
      ];
      cases.forEach(([input, expected]) => assert.strictEqual(secondsToIsoDuration(input), expected, input));
    });

    test('negative, unsafe and malformed numbers are refused', () => {
      for (const bad of ['-1', '9007199254740992', '1.2345', '1e3', 'abc', '1.']) {
        throwsInput(() => secondsToIsoDuration(bad), /is not a number of seconds of 0 or more$/);
      }
    });
  });

  suite('DATEX-003 / 004 start-of-month / end-of-month', () => {
    test('the separator and the time part are kept; leap years are known', () => {
      assert.strictEqual(startOfMonth('2026-10-15'), '2026-10-01');
      assert.strictEqual(startOfMonth('2026/10/15 09:30'), '2026/10/01 09:30');
      assert.strictEqual(endOfMonth('2026-02-10'), '2026-02-28');
      assert.strictEqual(endOfMonth('2024-02-10'), '2024-02-29');
      assert.strictEqual(endOfMonth('1900-02-01'), '1900-02-28');
      assert.strictEqual(endOfMonth('2000-02-01'), '2000-02-29');
      assert.strictEqual(endOfMonth('2026-04-01T12:00:00Z'), '2026-04-30T12:00:00Z');
      throwsInput(() => endOfMonth('2026-02-30'), '"2026-02-30" is not a valid date');
    });
  });

  suite('DATEX-005 add-business-days', () => {
    test('Excel WORKDAY rules: weekends, 0, forwards and backwards over several weeks', () => {
      const cases: [string, number, string][] = [
        ['2026-10-02', 1, '2026-10-05'], // Friday + 1 = Monday
        ['2026-10-03', 1, '2026-10-05'], // Saturday + 1 = Monday
        ['2026-10-04', 1, '2026-10-05'], // Sunday + 1 = Monday
        ['2026-10-03', -1, '2026-10-02'], // Saturday - 1 = Friday
        ['2026-10-05', -1, '2026-10-02'], // Monday - 1 = Friday
        ['2026-10-03', 0, '2026-10-03'],
        ['2026-10-01', 10, '2026-10-15'],
        ['2026-10-01', -10, '2026-09-17'],
        ['2026-10-01', 4, '2026-10-07'],
        ['2026-10-01T09:00', 1, '2026-10-02T09:00'],
      ];
      cases.forEach(([input, n, expected]) => assert.strictEqual(addBusinessDays(input, n), expected, `${input} ${n}`));
    });

    test('the arithmetic agrees with counting day by day', () => {
      const start = daysFromCivil(2026, 9, 26);
      for (let offset = 0; offset < 7; offset++) {
        for (const n of [-23, -12, -6, -5, -4, -1, 1, 2, 4, 5, 6, 12, 23]) {
          let day = start + offset;
          let left = Math.abs(n);
          while (left > 0) {
            day += Math.sign(n);
            const weekday = (((day + 4) % 7) + 7) % 7;
            if (weekday !== 0 && weekday !== 6) {
              left--;
            }
          }
          assert.strictEqual(addBusinessDaysTo(start + offset, n), day, `${offset} ${n}`);
        }
      }
    });

    test('a result outside 0001..9999 is an error', () => {
      throwsInput(() => addBusinessDays('9999-12-31', 1), 'the result is outside the years 0001 to 9999');
    });
  });

  suite('DATEX-006 business-days-between', () => {
    test('start included, end not; reversed is negative; the separators of Difference or spaces', () => {
      const cases: [string, string][] = [
        ['2026-10-01 2026-10-08', '5'], ['2026-10-08..2026-10-01', '-5'], ['2026-10-03 2026-10-04', '0'],
        ['2026-10-03\t2026-10-06', '1'], ['2026-10-01 / 2026-10-01', '0'], ['2026-01-01   2026-12-31', '260'],
        ['2026-10-01T09:00~2026-10-02', '1'],
      ];
      cases.forEach(([input, expected]) => assert.strictEqual(businessDaysBetween(input), expected, input));
    });

    test('the arithmetic agrees with counting day by day', () => {
      const base = daysFromCivil(2026, 9, 1);
      for (let a = 0; a < 15; a++) {
        for (let b = 0; b < 15; b++) {
          let count = 0;
          for (let d = Math.min(a, b); d < Math.max(a, b); d++) {
            const weekday = (((base + d + 4) % 7) + 7) % 7;
            count += weekday !== 0 && weekday !== 6 ? 1 : 0;
          }
          assert.strictEqual(businessDaysBetweenDays(base + a, base + b), (a <= b ? count : -count) + 0, `${a} ${b}`);
        }
      }
    });

    test('one date or an invalid date is an error', () => {
      throwsInput(() => businessDaysBetween('2026-10-01'), /is not two dates/);
      throwsInput(() => businessDaysBetween('2026-10-01 2026-13-01'), '"2026-13-01" is not a valid date');
    });
  });

  suite('DATEX-007 to-rfc3339-offset', () => {
    test('the offset of the zone at that instant; milliseconds when not 0', () => {
      const cache = new Map();
      assert.strictEqual(toRfc3339Offset('2026-10-01T00:00Z', 'Asia/Tokyo', cache), '2026-10-01T09:00:00+09:00');
      assert.strictEqual(toRfc3339Offset('2026-10-01T00:00:00.5Z', 'America/New_York', cache), '2026-09-30T20:00:00.500-04:00');
      assert.strictEqual(toRfc3339Offset('2026-01-01T00:00Z', 'America/New_York', cache), '2025-12-31T19:00:00-05:00');
      assert.strictEqual(toRfc3339Offset('2026-10-01T00:00Z', 'UTC', cache), '2026-10-01T00:00:00+00:00');
      assert.strictEqual(toRfc3339Offset('1759276800', 'Asia/Kolkata', cache), '2025-10-01T05:30:00+05:30');
    });

    test('an offset with seconds cannot be written in RFC 3339', () => {
      throwsInput(() => toRfc3339Offset('1880-01-01T00:00Z', 'Asia/Tokyo', new Map()),
        'the offset of Asia/Tokyo then (+09:18:59) has seconds, which RFC 3339 cannot write');
    });

    test('the years 0001..9999 are judged on the time in the zone, not on the input instant in UTC', () => {
      const cache = new Map();
      // The input instant is in 10000 / 0000 (UTC) but the converted time is in range.
      assert.strictEqual(toRfc3339Offset('9999-12-31T23:30-01:00', 'America/New_York', cache), '9999-12-31T19:30:00-05:00');
      assert.strictEqual(toRfc3339Offset('0001-01-01T05:00+14:00', 'Etc/GMT-14', cache), '0001-01-01T05:00:00+14:00');
      // The edges in UTC itself.
      assert.strictEqual(toRfc3339Offset('9999-12-31T23:59:59.999Z', 'UTC', cache), '9999-12-31T23:59:59.999+00:00');
      assert.strictEqual(toRfc3339Offset('0001-01-01T00:00Z', 'UTC', cache), '0001-01-01T00:00:00+00:00');
      // The input instant is in range but the converted time is not.
      throwsInput(() => toRfc3339Offset('9999-12-31T23:30Z', 'Asia/Tokyo', cache), 'the result is outside the years 0001 to 9999');
      throwsInput(() => toRfc3339Offset('0001-01-01T05:00Z', 'Etc/GMT+12', cache), 'the result is outside the years 0001 to 9999');
    });
  });

  suite('DATEX-008 iso-week-to-range', () => {
    test('Monday to Sunday, across years; week 53 only when the year has one', () => {
      assert.strictEqual(isoWeekToRange('2026-W40'), '2026-09-28 – 2026-10-04');
      assert.strictEqual(isoWeekToRange('2026w01'), '2025-12-29 – 2026-01-04');
      assert.strictEqual(isoWeekToRange('2020-W53'), '2020-12-28 – 2021-01-03');
      assert.strictEqual(isoWeekToRange('2026-W53'), '2026-12-28 – 2027-01-03');
      assert.strictEqual(isoWeekToRange('0001-W01'), '0001-01-01 – 0001-01-07');
      assert.deepStrictEqual([2015, 2020, 2021, 2025, 2026, 2032].map(hasWeek53), [true, true, false, false, true, true]);
      throwsInput(() => isoWeekToRange('2025-W53'), '"2025-W53" is not a week of that year');
      throwsInput(() => isoWeekToRange('2026-W00'), '"2026-W00" is not a week of that year');
      throwsInput(() => isoWeekToRange('9999-W52'), 'the result is outside the years 0001 to 9999');
      throwsInput(() => isoWeekToRange('2026-W4'), /is not an ISO week/);
    });
  });

  suite('DATEX-009 eto', () => {
    test('the stem and the branch of the calendar year (a year, a year with 年, or a date)', () => {
      const cases: [string, string][] = [['2026', '丙午'], ['1984', '甲子'], ['1983年', '癸亥'], ['2024-02-03', '甲辰'], ['4', '甲子'], ['1', '辛酉'], ['9999', '己亥']];
      cases.forEach(([input, expected]) => assert.strictEqual(eto(input), expected, input));
      throwsInput(() => eto('0'), '"0" is not a year from 1 to 9999');
      throwsInput(() => eto('二〇二六'), '"二〇二六" is not a date');
    });
  });

  suite('DATEX-010 / 011 to-12h / to-24h', () => {
    test('midnight and noon, seconds, case and spaces', () => {
      const to12: [string, string][] = [['14:30', '2:30 PM'], ['0:05', '12:05 AM'], ['00:00', '12:00 AM'], ['12:00', '12:00 PM'], ['11:59:59', '11:59:59 AM'], ['23:59', '11:59 PM']];
      to12.forEach(([input, expected]) => assert.strictEqual(to12Hour(input), expected, input));
      const to24: [string, string][] = [['2:30 PM', '14:30'], ['12:05 AM', '00:05'], ['12:00 PM', '12:00'], ['11:59:59pm', '23:59:59'], ['1:00 am', '01:00'], ['09:15 Pm', '21:15']];
      to24.forEach(([input, expected]) => assert.strictEqual(to24Hour(input), expected, input));
      for (const bad of ['24:00', '9:60', '9', '9:5', 'noon']) {
        throwsInput(() => to12Hour(bad), /is not a time from 0:00 to 23:59$/);
      }
      for (const bad of ['0:30 AM', '13:00 PM', '2:30  PM', '2:30', '2:30 P.M.']) {
        throwsInput(() => to24Hour(bad), /is not a 12-hour time such as 2:30 PM$/);
      }
    });
  });

  suite('DATEX-012..015 IDs to dates', () => {
    test('Snowflake: Discord and Twitter epochs; digits counted before BigInt; 64 bits at most', () => {
      assert.strictEqual(snowflakeToDate('175928847299117063', 'discord'), '2016-04-30T11:18:25.796Z');
      assert.strictEqual(snowflakeToDate('175928847299117063', 'DISCORD'), '2016-04-30T11:18:25.796Z');
      assert.strictEqual(snowflakeToDate('1541815603606036480', 'twitter'), '2022-06-28T16:07:40.105Z');
      assert.strictEqual(snowflakeToDate('0', 'discord'), '2015-01-01T00:00:00.000Z');
      assert.strictEqual(snowflakeToDate('18446744073709551615', 'discord'), '2154-05-15T07:35:11.103Z');
      throwsInput(() => snowflakeToDate('18446744073709551616', 'discord'), '"18446744073709551616" is larger than 64 bits');
      throwsInput(() => snowflakeToDate('1'.repeat(21), 'discord'), /is not a Snowflake ID \(1 to 20 digits\)$/);
      throwsInput(() => snowflakeToDate('-1', 'discord'), /is not a Snowflake ID/);
    });

    test('ULID: Crockford Base32, the first character 0 to 7, case ignored; after 9999 is an error', () => {
      assert.strictEqual(ulidToDate('01ARZ3NDEKTSV4RRFFQ69G5FAV'), '2016-07-30T23:54:10.259Z');
      assert.strictEqual(ulidToDate('01arz3ndektsv4rrffq69g5fav'), '2016-07-30T23:54:10.259Z');
      assert.strictEqual(ulidToDate('00000000000000000000000000'), '1970-01-01T00:00:00.000Z');
      throwsInput(() => ulidToDate('7ZZZZZZZZZZZZZZZZZZZZZZZZZ'), 'the result is outside the years 0001 to 9999');
      throwsInput(() => ulidToDate('81ARZ3NDEKTSV4RRFFQ69G5FAV'), /is not a ULID/);
      throwsInput(() => ulidToDate('01ARZ3NDEKTSV4RRFFQ69G5FAI'), /is not a ULID/);
      throwsInput(() => ulidToDate('01ARZ3NDEKTSV4RRFFQ69G5FA'), /is not a ULID/);
    });

    test('UUID v7: with or without hyphens; another version or variant is an error', () => {
      assert.strictEqual(uuidV7ToDate('0190163d-8694-739b-aea5-966c26f8ad91'), '2024-06-14T10:14:09.300Z');
      assert.strictEqual(uuidV7ToDate('0190163D8694739BAEA5966C26F8AD91'), '2024-06-14T10:14:09.300Z');
      throwsInput(() => uuidV7ToDate('3f2504e0-4f89-41d3-9a0c-0305e82c3301'), '"3f2504e0-4f89-41d3-9a0c-0305e82c3301" is a UUID of version 4, not 7');
      throwsInput(() => uuidV7ToDate('0190163d-8694-739b-cea5-966c26f8ad91'), /does not have the RFC 9562 variant$/);
      throwsInput(() => uuidV7ToDate('ffffffff-ffff-7fff-bfff-ffffffffffff'), 'the result is outside the years 0001 to 9999');
      throwsInput(() => uuidV7ToDate('{0190163d-8694-739b-aea5-966c26f8ad91}'), /is not a UUID$/);
    });

    test('ObjectId: seconds without milliseconds', () => {
      assert.strictEqual(objectIdToDate('507f1f77bcf86cd799439011'), '2012-10-17T21:13:27Z');
      assert.strictEqual(objectIdToDate('FFFFFFFF0000000000000000'), '2106-02-07T06:28:15Z');
      throwsInput(() => objectIdToDate('507f1f77bcf86cd79943901'), /is not an ObjectId \(24 hexadecimal digits\)$/);
    });
  });
});
