import * as assert from 'assert';
import { EncOutputTooLargeError } from '../../handler/encodeTransforms';
import { GEN_MAX_INPUT_LENGTH, GenInputError } from '../../handler/genCommon';
import {
  candidateLines,
  CROCKFORD_BASE32,
  defaultDateRange,
  EMAIL_WORDS,
  FIRST_NAMES,
  formatScaled,
  JA_FAMILY_NAMES,
  JA_GIVEN_NAMES,
  JA_SENTENCES,
  LAST_NAMES,
  NANOID_ALPHABET,
  nanoid,
  parseDateRange,
  parseDice,
  parseFloatDigits,
  parseFloatRange,
  parseIntegerRange,
  pickLine,
  randomBase64Url,
  randomBoolean,
  randomColor,
  randomDate,
  randomEmail,
  randomFloat,
  randomHex,
  randomInteger,
  randomMac,
  randomName,
  randomNameJa,
  randomPhoneJp,
  randomTextJa,
  rollDice,
  sampleLines,
  ulid,
  uuidV7,
} from '../../handler/genRandom';
import { fakeRandom } from './genTestUtils';

const BUDGET = 10_000_000;
const MS = Date.UTC(2026, 8, 29, 3, 4, 5, 678);

const throwsInput = (run: () => unknown, message: string | RegExp) =>
  assert.throws(run, (error: unknown) => {
    assert.ok(error instanceof GenInputError, String(error));
    if (typeof message === 'string') {
      assert.strictEqual(error.message, message);
    } else {
      assert.match(error.message, message);
    }
    return true;
  });

const repeat = (value: number, n: number): number[] => new Array<number>(n).fill(value);

suite('Generator Commands - random values (GEN-001..019)', () => {
  suite('GEN-001 UUID v7', () => {
    const FORM = /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

    test('the first 48 bits are the time, then version 7 and variant 10', () => {
      const random = fakeRandom([], [repeat(0xff, 10)]);
      const value = uuidV7(random, MS);
      assert.match(value, FORM);
      assert.strictEqual(value.replace(/-/g, '').slice(0, 12), MS.toString(16).padStart(12, '0'));
      assert.strictEqual(value.slice(14, 18), '7fff');
      assert.strictEqual(value.slice(19, 23), 'bfff');
      assert.strictEqual(value.slice(24), 'ffffffffffff');
      assert.deepStrictEqual(random.byteCounts, [10]);
      assert.strictEqual(uuidV7(fakeRandom([], [repeat(0, 10)]), 0), '00000000-0000-7000-8000-000000000000');
    });

    test('the random bits come from the bytes', () => {
      const value = uuidV7(fakeRandom([], [[0x12, 0x34, 0x56, 0x78, 0x9a, 0xbc, 0xde, 0xf0, 0x11, 0x22]]), MS);
      assert.strictEqual(value.slice(14), '7234-9678-9abcdef01122');
    });
  });

  suite('GEN-002 ULID', () => {
    test('10 characters of time and 16 of randomness in Crockford Base32', () => {
      // The example of the ULID specification: 1469918176385 → 01ARYZ6S41.
      assert.strictEqual(ulid(fakeRandom([], [repeat(0, 10)]), 1469918176385), '01ARYZ6S410000000000000000');
      assert.strictEqual(ulid(fakeRandom([], [repeat(0xff, 10)]), 2 ** 48 - 1), '7ZZZZZZZZZZZZZZZZZZZZZZZZZ');
      const value = ulid(fakeRandom(), MS);
      assert.match(value, /^[0-9A-HJKMNP-TV-Z]{26}$/);
      assert.strictEqual(CROCKFORD_BASE32.length, 32);
      // 0x08 0x42 … = 00001 00001 00001 …
      assert.strictEqual(ulid(fakeRandom([], [[0x08, 0x42, 0x10, 0x84, 0x21]]), 0).slice(10), '1111111111111111');
    });

    test('a later time sorts after an earlier one', () => {
      assert.ok(ulid(fakeRandom([], [repeat(0xff, 10)]), MS) < ulid(fakeRandom([], [repeat(0, 10)]), MS + 1));
    });
  });

  suite('GEN-003..005 tokens', () => {
    test('NanoID: 21 characters of A-Za-z0-9_- from the low 6 bits of each byte', () => {
      assert.strictEqual(NANOID_ALPHABET.length, 64);
      assert.strictEqual(new Set(NANOID_ALPHABET).size, 64);
      assert.strictEqual(nanoid(fakeRandom()), 'ABCDEFGHIJKLMNOPQRSTU');
      assert.strictEqual(nanoid(fakeRandom([], [[63, 64, 255, 62]])), '-A-_-A-_-A-_-A-_-A-_-');
      assert.match(nanoid(fakeRandom([], [[7, 200, 13]])), /^[A-Za-z0-9_-]{21}$/);
    });

    test('Hex: the bytes in lower-case hexadecimal (twice as many characters)', () => {
      const random = fakeRandom([], [[0x9f, 0x86, 0xd0, 0x81]]);
      assert.strictEqual(randomHex(random, 4), '9f86d081');
      assert.deepStrictEqual(random.byteCounts, [4]);
      assert.strictEqual(randomHex(fakeRandom(), 1024).length, 2048);
    });

    test('Base64: Base64URL without padding', () => {
      assert.strictEqual(randomBase64Url(fakeRandom([], [[0xfb, 0xff]]), 2), '-_8');
      assert.match(randomBase64Url(fakeRandom(), 24), /^[A-Za-z0-9_-]{32}$/);
      assert.strictEqual(randomBase64Url(fakeRandom(), 1).length, 2);
    });
  });

  suite('GEN-006 Integer in Range', () => {
    test('both ends can be chosen', () => {
      const range = parseIntegerRange('1..6');
      const random = fakeRandom([0, 'max', 3]);
      assert.deepStrictEqual([randomInteger(random, range), randomInteger(random, range), randomInteger(random, range)], ['1', '6', '4']);
      assert.deepStrictEqual(random.counts, [6, 6, 6]);
      assert.deepStrictEqual(parseIntegerRange(' -5 .. -5 '), { min: -5, max: -5 });
      assert.deepStrictEqual(parseIntegerRange('-0..0'), { min: 0, max: 0 });
    });

    test('ends at ±(2^53 − 1) work without an exception', () => {
      const top = parseIntegerRange('9007199254740990..9007199254740991');
      assert.deepStrictEqual([randomInteger(fakeRandom([0]), top), randomInteger(fakeRandom(['max']), top)], ['9007199254740990', '9007199254740991']);
      const bottom = parseIntegerRange('-9007199254740991..-9007199254740990');
      assert.deepStrictEqual([randomInteger(fakeRandom([0]), bottom), randomInteger(fakeRandom(['max']), bottom)], ['-9007199254740991', '-9007199254740990']);
    });

    test('2^48 − 1 values are accepted, 2^48 are refused', () => {
      assert.deepStrictEqual(parseIntegerRange('0..281474976710654'), { min: 0, max: 281474976710654 });
      assert.strictEqual(randomInteger(fakeRandom(['max']), parseIntegerRange('0..281474976710654')), '281474976710654');
      throwsInput(() => parseIntegerRange('0..281474976710655'), 'the range holds more than 281,474,976,710,655 integers');
      throwsInput(() => parseIntegerRange('-9007199254740991..9007199254740991'), /more than 281,474,976,710,655/);
    });

    test('unsafe integers, reversed ranges and other forms are refused', () => {
      throwsInput(() => parseIntegerRange('0..9007199254740992'), /the ends must be integers from -9007199254740991 to 9007199254740991/);
      throwsInput(() => parseIntegerRange('-9007199254740992..0'), /the ends must be integers/);
      throwsInput(() => parseIntegerRange('6..1'), 'the first number must not be greater than the second');
      for (const text of ['', '1', '1..', '..6', '1.5..2', '1e3..2e3', '0x1..0x2', '1 .. 6 .. 7', 'a..b', '+1..6', '１..６']) {
        throwsInput(() => parseIntegerRange(text), 'enter a range of integers such as 1..100');
      }
    });
  });

  suite('GEN-007 Float in Range', () => {
    test('decimals are scaled exactly, without floating-point errors', () => {
      const range = parseFloatRange('0.1..0.3', '3');
      assert.deepStrictEqual(range, { lo: 100, hi: 300, digits: 3 });
      assert.deepStrictEqual([randomFloat(fakeRandom([0]), range), randomFloat(fakeRandom(['max']), range)], ['0.100', '0.300']);
      assert.deepStrictEqual(parseFloatRange('0..1', '3'), { lo: 0, hi: 1000, digits: 3 });
      assert.strictEqual(randomFloat(fakeRandom([582]), parseFloatRange('0..1', '3')), '0.582');
    });

    test('0 is written without a minus sign; negative values keep their zeros', () => {
      assert.strictEqual(randomFloat(fakeRandom([1000]), parseFloatRange('-1..1', '3')), '0.000');
      assert.strictEqual(randomFloat(fakeRandom([0]), parseFloatRange('-0.05..0', '3')), '-0.050');
      assert.strictEqual(randomFloat(fakeRandom([0]), parseFloatRange('-0..-0.0', '2')), '0.00');
      assert.deepStrictEqual([formatScaled(-5, 3), formatScaled(5, 3), formatScaled(0, 3), formatScaled(-1234, 2), formatScaled(-7, 0)],
        ['-0.005', '0.005', '0.000', '-12.34', '-7']);
    });

    test('0 decimal places give integers without a decimal point', () => {
      const range = parseFloatRange('1..6', '0');
      assert.deepStrictEqual([randomFloat(fakeRandom([0]), range), randomFloat(fakeRandom(['max']), range)], ['1', '6']);
    });

    test('|ends| × 10^digits up to 2^53 − 1 is accepted; more is refused', () => {
      const exact = parseFloatRange('900719925.4740991..900719925.4740991', '7');
      assert.deepStrictEqual(exact, { lo: 9007199254740991, hi: 9007199254740991, digits: 7 });
      assert.strictEqual(randomFloat(fakeRandom(), exact), '900719925.4740991');
      assert.strictEqual(randomFloat(fakeRandom(), parseFloatRange('-900719925.4740991..-900719925.4740991', '7')), '-900719925.4740991');
      throwsInput(() => parseFloatRange('900719925.4740992..900719925.4740992', '7'), /times 10\^7 must be at most 9007199254740991/);
      throwsInput(() => parseFloatRange('1000000000..1000000000', '10'), /times 10\^10 must be at most/);
    });

    test('more than 2^48 − 1 values at the precision are refused', () => {
      throwsInput(() => parseFloatRange('0..100000', '10'), /more than 281,474,976,710,655 values at 10 decimal places/);
      assert.deepStrictEqual(parseFloatRange('0..28147.4976710654', '10'), { lo: 0, hi: 281474976710654, digits: 10 });
      throwsInput(() => parseFloatRange('0..28147.4976710655', '10'), /more than 281,474,976,710,655 values/);
    });

    test('|ends| up to 1,000,000,000; other forms and extra decimal places are refused', () => {
      assert.deepStrictEqual(parseFloatRange('-1000000000..1000000000', '0'), { lo: -1_000_000_000, hi: 1_000_000_000, digits: 0 });
      throwsInput(() => parseFloatRange('0..1000000000.5', '1'), 'the ends must be from -1,000,000,000 to 1,000,000,000');
      throwsInput(() => parseFloatRange('0..1000000001', '0'), 'the ends must be from -1,000,000,000 to 1,000,000,000');
      throwsInput(() => parseFloatRange('0.1234..1', '3'), 'the ends have more than 3 decimal places');
      throwsInput(() => parseFloatRange('0..1.000', '2'), 'the ends have more than 2 decimal places');
      throwsInput(() => parseFloatRange('1..0', '3'), 'the first number must not be greater than the second');
      for (const text of ['1e3..2', '0..Infinity', 'NaN..1', '.5..1', '1...2', '0..1..2', '+1..2', '1.', '']) {
        throwsInput(() => parseFloatRange(text, '3'), 'enter a range of decimal numbers such as 0..1');
      }
      for (const digits of ['11', '-1', '1.5', '', 'x', '100']) {
        throwsInput(() => parseFloatDigits(digits), 'enter a number of decimal places from 0 to 10');
      }
      assert.deepStrictEqual(['0', '10', ' 3 '].map(parseFloatDigits), [0, 10, 3]);
    });
  });

  suite('GEN-008 / 009 lines', () => {
    test('Pick One Line: blank lines are skipped, spaces around a line are kept', () => {
      const random = fakeRandom([1]);
      assert.strictEqual(pickLine(random, 'a\nb\nc'), 'b');
      assert.deepStrictEqual(random.counts, [3]);
      assert.deepStrictEqual(candidateLines('  \na\r\n\n  b  \r\t'), ['a', '  b  ']);
      assert.strictEqual(pickLine(fakeRandom(['max']), '  \na\r\n\n  b  \r\t'), '  b  ');
      throwsInput(() => pickLine(fakeRandom(), ' \n\t'), 'the selection has no lines to pick from');
    });

    test('Pick N Lines: the ROADMAP example, random order, joined with the given line break', () => {
      const random = fakeRandom([3, 2]);
      assert.strictEqual(sampleLines(random, 'a\nb\nc\nd', 2, '\n', BUDGET), 'd\na');
      assert.deepStrictEqual(random.counts, [4, 3]);
      assert.strictEqual(sampleLines(fakeRandom([1]), 'x\r\ny\n\nz', 2, '\r\n', BUDGET), 'y\r\nx');
    });

    test('Pick N Lines: no line position twice, equal lines may both be picked', () => {
      const text = Array.from({ length: 50 }, (_, i) => `line ${i}`).join('\n');
      const picked = sampleLines(fakeRandom([7, 7, 7, 'max', 0, 3]), text, 50, '\n', BUDGET).split('\n');
      assert.strictEqual(new Set(picked).size, 50);
      assert.deepStrictEqual([...picked].sort(), text.split('\n').sort());
      assert.strictEqual(sampleLines(fakeRandom(), 'same\nsame', 2, '\n', BUDGET), 'same\nsame');
    });

    test('Pick N Lines: N over the number of lines is refused; the output limit applies', () => {
      throwsInput(() => sampleLines(fakeRandom(), 'a\n\nb', 3, '\n', BUDGET), 'the selection has only 2 non-blank lines; cannot pick 3');
      throwsInput(() => sampleLines(fakeRandom(), 'a', 2, '\n', BUDGET), 'the selection has only 1 non-blank line; cannot pick 2');
      assert.throws(() => sampleLines(fakeRandom(), 'aaa\nbbb', 2, '\n', 5), EncOutputTooLargeError);
    });

    test('a selection of 1,000,001 characters is refused before it is split', () => {
      const long = 'a'.repeat(GEN_MAX_INPUT_LENGTH + 1);
      throwsInput(() => pickLine(fakeRandom(), long), 'the selection is longer than 1,000,000 characters');
      throwsInput(() => sampleLines(fakeRandom(), long, 1, '\n', BUDGET), 'the selection is longer than 1,000,000 characters');
      assert.strictEqual(pickLine(fakeRandom(), 'a'.repeat(GEN_MAX_INPUT_LENGTH)).length, GEN_MAX_INPUT_LENGTH);
    });
  });

  suite('GEN-010..012', () => {
    test('MAC Address: unicast, locally administered, lower case with colons', () => {
      assert.strictEqual(randomMac(fakeRandom([], [repeat(0xff, 6)])), 'fe:ff:ff:ff:ff:ff');
      assert.strictEqual(randomMac(fakeRandom([], [repeat(0, 6)])), '02:00:00:00:00:00');
      assert.strictEqual(randomMac(fakeRandom([], [[0x5d, 0x5e, 0xa1, 0x3c, 0x77, 0x0b]])), '5e:5e:a1:3c:77:0b');
      for (let b = 0; b < 256; b++) {
        const first = parseInt(randomMac(fakeRandom([], [[b]])).slice(0, 2), 16);
        assert.strictEqual(first & 0x03, 0x02, String(b));
      }
    });

    test('Hex Color: #rrggbb', () => {
      assert.strictEqual(randomColor(fakeRandom([], [[0x3f, 0xa2, 0xc8]])), '#3fa2c8');
      assert.match(randomColor(fakeRandom()), /^#[0-9a-f]{6}$/);
    });

    test('Date in Range: both ends can be chosen; the default range is the current year', () => {
      const range = parseDateRange('2026-01-01..2026-12-31');
      const random = fakeRandom([0, 'max', 136]);
      assert.deepStrictEqual([randomDate(random, range), randomDate(random, range), randomDate(random, range)], ['2026-01-01', '2026-12-31', '2026-05-17']);
      assert.deepStrictEqual(random.counts, [365, 365, 365]);
      const all = parseDateRange('0001-01-01 .. 9999-12-31');
      assert.deepStrictEqual([randomDate(fakeRandom([0]), all), randomDate(fakeRandom(['max']), all)], ['0001-01-01', '9999-12-31']);
      assert.strictEqual(randomDate(fakeRandom(['max']), parseDateRange('2024-02-29..2024-02-29')), '2024-02-29');
      assert.strictEqual(defaultDateRange(new Date(2026, 8, 29)), '2026-01-01..2026-12-31');
    });

    test('Date in Range: invalid dates, reversed ranges and other forms are refused', () => {
      throwsInput(() => parseDateRange('2026-02-29..2026-03-01'), 'the date must be a valid date from 0001-01-01 to 9999-12-31');
      throwsInput(() => parseDateRange('2026-01-01..2026-02-29'), /valid date/);
      throwsInput(() => parseDateRange('0000-12-31..2026-01-01'), /valid date/);
      throwsInput(() => parseDateRange('2026-12-31..2026-01-01'), 'the first date must not be after the second');
      for (const text of ['2026-01-01', '2026/01/01..2026/12/31', '26-01-01..26-12-31', '2026-1-1..2026-12-31', '', '2026-01-01...2026-12-31', '2026-01-01..2026-06-01..2026-12-31']) {
        throwsInput(() => parseDateRange(text), 'enter a range of dates such as 2026-01-01..2026-12-31');
      }
    });

    test('Date in Range: a form error is reported before an invalid date', () => {
      throwsInput(() => parseDateRange('2026-02-30..2026-02-31'), 'the date must be a valid date from 0001-01-01 to 9999-12-31');
      throwsInput(() => parseDateRange('2026-02-30 .. 2026-12-31'), /valid date/);
      for (const text of ['2026-02-30..abc', 'abc..2026-02-30', '2026-02-30..2026/03/01', '2026-02-30..2026-12-31..2026-12-31', '2026-02-30...2026-12-31', '2026-02-30']) {
        throwsInput(() => parseDateRange(text), 'enter a range of dates such as 2026-01-01..2026-12-31');
      }
    });
  });

  suite('GEN-013..017 dummy data', () => {
    test('Dummy Email: word, 4 digits, example.com only', () => {
      assert.strictEqual(randomEmail(fakeRandom([0, 4821])), 'user4821@example.com');
      assert.strictEqual(randomEmail(fakeRandom(['max', 7])), `${EMAIL_WORDS[EMAIL_WORDS.length - 1]}0007@example.com`);
      EMAIL_WORDS.forEach((word) => assert.match(word, /^[a-z]+$/));
    });

    test('Dummy Name and Dummy Japanese Name', () => {
      assert.strictEqual(randomName(fakeRandom([0, 17])), 'Emily Clark');
      assert.strictEqual(randomNameJa(fakeRandom([0, 0])), '佐藤 花子');
      const random = fakeRandom();
      randomName(random);
      randomNameJa(random);
      assert.deepStrictEqual(random.counts, [FIRST_NAMES.length, LAST_NAMES.length, JA_FAMILY_NAMES.length, JA_GIVEN_NAMES.length]);
    });

    test('the built-in lists hold about 30 distinct entries each', () => {
      for (const list of [EMAIL_WORDS, FIRST_NAMES, LAST_NAMES, JA_FAMILY_NAMES, JA_GIVEN_NAMES]) {
        assert.ok(list.length >= 25, String(list.length));
        assert.strictEqual(new Set(list).size, list.length);
        list.forEach((entry) => assert.ok(!/\s/.test(entry), entry));
      }
    });

    test('Dummy Phone Number (JP): 090-0xxx-xxxx', () => {
      assert.strictEqual(randomPhoneJp(fakeRandom([123, 4567])), '090-0123-4567');
      assert.strictEqual(randomPhoneJp(fakeRandom([0, 0])), '090-0000-0000');
      assert.strictEqual(randomPhoneJp(fakeRandom(['max', 'max'])), '090-0999-9999');
    });

    test('Japanese Dummy Text: sentences end with 。 and hold no other 。', () => {
      assert.ok(JA_SENTENCES.length >= 15);
      assert.strictEqual(new Set(JA_SENTENCES).size, JA_SENTENCES.length);
      JA_SENTENCES.forEach((sentence) => {
        assert.ok(sentence.endsWith('。'), sentence);
        assert.strictEqual(sentence.split('。').length - 1, 1, sentence);
        assert.ok(!/[\r\n]/.test(sentence));
      });
    });

    test('Japanese Dummy Text: each sentence is chosen independently, repeats allowed', () => {
      const random = fakeRandom([0, 0, 5]);
      assert.strictEqual(randomTextJa(random, 3, BUDGET), JA_SENTENCES[0] + JA_SENTENCES[0] + JA_SENTENCES[5]);
      assert.deepStrictEqual(random.counts, repeat(JA_SENTENCES.length, 3));
      assert.strictEqual(randomTextJa(fakeRandom(), 1, BUDGET), JA_SENTENCES[0]);
      const long = randomTextJa(fakeRandom([3, 'max', 1]), 1000, BUDGET);
      assert.strictEqual(long.split('。').length - 1, 1000);
      assert.ok(!/[\r\n]/.test(long));
      assert.throws(() => randomTextJa(fakeRandom(), 3, 20), EncOutputTooLargeError);
    });
  });

  suite('GEN-018 / 019', () => {
    test('Boolean', () => {
      assert.deepStrictEqual([randomBoolean(fakeRandom([0])), randomBoolean(fakeRandom([1]))], ['false', 'true']);
      const random = fakeRandom();
      randomBoolean(random);
      assert.deepStrictEqual(random.counts, [2]);
    });

    test('Dice Roll: total and each die, from 1 to M', () => {
      const random = fakeRandom([2, 3]);
      assert.strictEqual(rollDice(random, parseDice('2d6')), '7 (3+4)');
      assert.deepStrictEqual(random.counts, [6, 6]);
      assert.strictEqual(rollDice(fakeRandom([2]), parseDice(' 1D6\n')), '3 (3)');
      assert.strictEqual(rollDice(fakeRandom(['max']), parseDice('1d1000000')), '1000000 (1000000)');
      assert.strictEqual(rollDice(fakeRandom([0, 0]), parseDice('2d2')), '2 (1+1)');
      const hundred = rollDice(fakeRandom(repeat(5, 100)), parseDice('100d6'));
      assert.strictEqual(hundred, `600 (${repeat(6, 100).join('+')})`);
    });

    test('Dice Roll: limits and other forms are refused; the selection is quoted', () => {
      throwsInput(() => parseDice('0d6'), 'the number of dice must be from 1 to 100');
      throwsInput(() => parseDice('101d6'), 'the number of dice must be from 1 to 100');
      throwsInput(() => parseDice('1d1'), 'the number of sides must be from 2 to 1,000,000');
      throwsInput(() => parseDice('1d1000001'), 'the number of sides must be from 2 to 1,000,000');
      for (const text of ['', 'd6', '2d', '2x6', '2d6+1', '-1d6', '2 d 6', '1.5d6']) {
        throwsInput(() => parseDice(text), 'enter dice such as 2d6 (N dice with M sides)');
      }
      throwsInput(() => parseDice('abc', 'abc'), '"abc" is not a dice roll: enter dice such as 2d6 (N dice with M sides)');
      throwsInput(() => parseDice('0d6', '0d6'), '"0d6" is not a dice roll: the number of dice must be from 1 to 100');
      throwsInput(() => parseDice('2d6'.padEnd(GEN_MAX_INPUT_LENGTH + 1, ' ')), 'the selection is longer than 1,000,000 characters');
    });
  });
});
