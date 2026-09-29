import * as assert from 'assert';
import { EncOutputTooLargeError, MAX_OUTPUT_LENGTH } from '../../handler/encodeTransforms';
import {
  cleanNumber,
  extractNumbers,
  findNumPromptProblem,
  formatA,
  formatB,
  formatInteger,
  isBlank,
  isSupportedLocale,
  mapLines,
  NumInputError,
  NumOutputBuffer,
  NUM_MAX_INPUT_LENGTH,
  parseBasicNumber,
  roundDecimalDigits,
  roundNumber,
  shiftDecimal,
} from '../../handler/numCommon';

suite('Number Commands common helpers (NUM) Test Suite', () => {

  suite('number tokens (statistics)', () => {
    test('numbers among words; signs, decimals and exponents', () => {
      assert.deepStrictEqual(extractNumbers('a 1 b 2.5'), [1, 2.5]);
      assert.deepStrictEqual(extractNumbers('-3 +4 .5 1e3 2.5E-1'), [-3, 4, 0.5, 1000, 0.25]);
      assert.deepStrictEqual(extractNumbers('x=-5; (7)'), [-5, 7]);
    });

    test('numbers glued to letters, `_`, `.`, `+` or `-` are not numbers', () => {
      assert.deepStrictEqual(extractNumbers('10px a1 1a v_2 2_'), []);
      assert.deepStrictEqual(extractNumbers('2026-09-29'), [2026]);
      assert.deepStrictEqual(extractNumbers('1+2'), [1]);
      assert.deepStrictEqual(extractNumbers('1.5.3'), []);
    });

    test('a final period is not part of the number; commas separate numbers', () => {
      assert.deepStrictEqual(extractNumbers('It is 1.5.'), [1.5]);
      assert.deepStrictEqual(extractNumbers('1,234'), [1, 234]);
      assert.deepStrictEqual(extractNumbers('1, 2,3'), [1, 2, 3]);
    });

    test('a number out of the range of a double is an error', () => {
      assert.throws(() => extractNumbers('1 1e400'), (error: Error) => error instanceof NumInputError && error.message === '"1e400" is out of range');
    });

    test('a selection longer than 5,000,000 characters is refused', () => {
      assert.throws(() => extractNumbers('1'.repeat(NUM_MAX_INPUT_LENGTH + 1)), /longer than 5,000,000 characters/);
    });
  });

  suite('rule A (floating-point error removed)', () => {
    test('0.1 + 0.2 and similar results', () => {
      assert.strictEqual(formatA(0.1 + 0.2), '0.3');
      assert.strictEqual(formatA(0.07 * 100), '7');
      assert.strictEqual(formatA(1.1 * 3), '3.3');
    });

    test('-0 is 0; big and tiny values use the exponent of String()', () => {
      assert.strictEqual(formatA(-0), '0');
      assert.strictEqual(formatA(1e21), '1e+21');
      assert.strictEqual(formatA(1e-7), '1e-7');
      assert.strictEqual(formatA(123456789), '123456789');
    });

    test('Infinity and NaN are errors', () => {
      assert.throws(() => formatA(Infinity), /the result is out of range/);
      assert.throws(() => formatA(NaN), /the result is out of range/);
    });
  });

  suite('cleanNumber / formatInteger (16-digit integers are exact)', () => {
    test('a safe integer is kept, other values are cut to 15 significant digits', () => {
      assert.strictEqual(cleanNumber(9007199254740991), 9007199254740991);
      assert.strictEqual(cleanNumber(-1234567890123456), -1234567890123456);
      assert.strictEqual(cleanNumber(0.1 + 0.2), 0.3);
      assert.strictEqual(cleanNumber(1234567890123456.2), 1234567890123460);
      assert.ok(Object.is(cleanNumber(-0), 0));
      assert.throws(() => cleanNumber(Infinity), /the result is out of range/);
    });

    test('formatA keeps a 16-digit safe integer', () => {
      assert.strictEqual(formatA(9007199254740991), '9007199254740991');
      assert.strictEqual(formatA(1727612345678901), '1727612345678901');
      assert.strictEqual(formatA(2 ** 53), '9007199254740990');
    });

    test('formatInteger writes the double as it is', () => {
      assert.strictEqual(formatInteger(12345678901234567890), '12345678901234567000');
      assert.strictEqual(formatInteger(-0), '0');
      assert.strictEqual(formatInteger(1e21), '1e+21');
      assert.throws(() => formatInteger(NaN), /the result is out of range/);
    });
  });

  suite('rule B (4 decimals, half away from zero)', () => {
    test('rounds to 4 decimals and drops trailing zeros', () => {
      assert.strictEqual(formatB(2 / 3), '0.6667');
      assert.strictEqual(formatB(Math.sqrt(32 / 7)), '2.1381');
      assert.strictEqual(formatB(1.5), '1.5');
      assert.strictEqual(formatB(2), '2');
    });

    test('halves are rounded away from zero on the decimal form', () => {
      assert.strictEqual(formatB(1.00005), '1.0001');
      assert.strictEqual(formatB(-1.00005), '-1.0001');
      assert.strictEqual(formatB(1.00004999), '1');
      assert.strictEqual(formatB(0.99995), '1');
    });

    test('tiny values become 0 (never -0)', () => {
      assert.strictEqual(formatB(0.00001), '0');
      assert.strictEqual(formatB(-0.00001), '0');
    });
  });

  suite('decimal strings', () => {
    test('shiftDecimal keeps the digits', () => {
      assert.deepStrictEqual(shiftDecimal('1', '5', -3), { integer: '0', fraction: '0015' });
      assert.deepStrictEqual(shiftDecimal('1', '23', 4), { integer: '12300', fraction: '' });
      assert.deepStrictEqual(shiftDecimal('0', '1250', 2), { integer: '12', fraction: '50' });
    });

    test('roundDecimalDigits rounds half up and carries', () => {
      assert.deepStrictEqual(roundDecimalDigits('1', '005', 2), { integer: '1', fraction: '01' });
      assert.deepStrictEqual(roundDecimalDigits('9', '995', 2), { integer: '10', fraction: '' });
      assert.deepStrictEqual(roundDecimalDigits('2', '5', 0), { integer: '3', fraction: '' });
      assert.deepStrictEqual(roundDecimalDigits('1', '2', 2), { integer: '1', fraction: '2' });
    });

    test('roundNumber: 1.005 (2) → 1.01, -2.5 (0) → -3, -0.4 (0) → 0', () => {
      assert.strictEqual(roundNumber(1.005, 2), 1.01);
      assert.strictEqual(roundNumber(-2.5, 0), -3);
      assert.strictEqual(Object.is(roundNumber(-0.4, 0), 0), true);
      assert.strictEqual(roundNumber(1e-7, 15), 1e-7);
    });

    test('parseBasicNumber accepts the basic form only', () => {
      assert.strictEqual(parseBasicNumber('1.'), 1);
      assert.strictEqual(parseBasicNumber('-.5e1'), -5);
      ['Infinity', 'NaN', '0x10', '1,000', '1 2', '--1', ''].forEach((value) =>
        assert.throws(() => parseBasicNumber(value), /is not a number/, value));
      assert.throws(() => parseBasicNumber('1e400'), /is out of range/);
    });

    test('isBlank: spaces, tabs and line breaks only', () => {
      assert.strictEqual(isBlank(' \t\r\n'), true);
      assert.strictEqual(isBlank(''), true);
      assert.strictEqual(isBlank(' 1 '), false);
    });
  });

  suite('lines', () => {
    const double = (value: string) => String(Number(value) * 2);

    test('keeps LF / CRLF, the spaces around each value and empty lines', () => {
      assert.strictEqual(mapLines('1\r\n  2\t\n\n \t\n3', MAX_OUTPUT_LENGTH, double), '2\r\n  4\t\n\n \t\n6');
      assert.strictEqual(mapLines('1\n', MAX_OUTPUT_LENGTH, double), '2\n');
    });

    test('an invalid line stops everything with its line number', () => {
      assert.throws(() => mapLines('1\n2\nx', MAX_OUTPUT_LENGTH, (value) => String(parseBasicNumber(value))),
        (error: Error) => error instanceof NumInputError && error.message === 'line 3: "x" is not a number');
    });

    test('long values are shortened in the message', () => {
      const long = 'S'.repeat(200);
      assert.throws(() => mapLines(long, MAX_OUTPUT_LENGTH, (value) => String(parseBasicNumber(value))),
        (error: Error) => !error.message.includes(long) && error.message.includes('…'));
    });

    test('the budget: exactly the budget passes, one more character fails, later lines are not converted', () => {
      assert.strictEqual(mapLines('1\n2', 3, (value) => value), '1\n2');
      let calls = 0;
      assert.throws(() => mapLines('1\n2\n3\n4', 3, (value) => {
        calls++;
        return `${value}0`;
      }), EncOutputTooLargeError);
      assert.strictEqual(calls, 2);
    });
  });

  suite('output buffer', () => {
    test('exactly the budget is accepted, one more character is refused', () => {
      const buffer = new NumOutputBuffer(5);
      buffer.push('ab');
      buffer.push('cde');
      assert.strictEqual(buffer.join(), 'abcde');
      assert.throws(() => buffer.push('f'), (error: Error) =>
        error instanceof EncOutputTooLargeError && error.message.includes(MAX_OUTPUT_LENGTH.toLocaleString('en-US')));
    });
  });

  suite('prompt values', () => {
    test('integers in a range', () => {
      const rule = { kind: 'integer', min: 2, max: 36 } as const;
      assert.strictEqual(findNumPromptProblem('2', rule), undefined);
      assert.strictEqual(findNumPromptProblem(' 36 ', rule), undefined);
      ['1', '37', '2.5', '', 'x', '1e1'].forEach((value) =>
        assert.strictEqual(findNumPromptProblem(value, rule), 'Enter an integer from 2 to 36.', value));
    });

    test('numbers in a range', () => {
      const rule = { kind: 'number', min: 0, max: 100 } as const;
      ['0', '100', '12.5', '.5'].forEach((value) => assert.strictEqual(findNumPromptProblem(value, rule), undefined, value));
      ['-1', '101', '100.01', 'NaN', 'Infinity', ''].forEach((value) =>
        assert.strictEqual(findNumPromptProblem(value, rule), 'Enter a number from 0 to 100.', value));
    });

    test('locales', () => {
      const rule = { kind: 'locale' } as const;
      ['en-US', 'de-DE', 'ja-JP', 'fr'].forEach((value) => assert.strictEqual(findNumPromptProblem(value, rule), undefined, value));
      ['', 'en_US', 'x-'.repeat(20), 'en US', '!!', 'en-US-u-nu-'].forEach((value) =>
        assert.match(String(findNumPromptProblem(value, rule)), /Enter a supported locale/, value));
      assert.strictEqual(isSupportedLocale('not-a-real-locale-tag-at-all'), false);
    });

    test('too long values are refused', () => {
      assert.match(String(findNumPromptProblem('1'.repeat(1_001), { kind: 'integer', min: 0, max: 15 })), /longer than 1,000 characters/);
    });
  });
});
