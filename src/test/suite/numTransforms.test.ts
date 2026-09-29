import * as assert from 'assert';
import { EncOutputTooLargeError, MAX_OUTPUT_LENGTH } from '../../handler/encodeTransforms';
import { NumInputError, NumNoNumbersError, NUM_MAX_INPUT_LENGTH } from '../../handler/numCommon';
import { NUM_COMMAND_ENTRIES } from '../../handler/numTransforms';
import { NUM_ROADMAP_EXAMPLES } from './numExamples';

const transformOf = (id: string) => {
  const entry = NUM_COMMAND_ENTRIES.find((candidate) => candidate.id === id);
  assert.ok(entry, id);
  return (text: string, inputs: string[] = []) => entry.transform(text, inputs, MAX_OUTPUT_LENGTH);
};

/** Checks every `input → output` pair of a command (`inputs` are the typed values). */
const expectAll = (id: string, pairs: [string, string][], inputs: string[] = []) => {
  const transform = transformOf(id);
  pairs.forEach(([input, output]) => assert.strictEqual(transform(input, inputs), output, `${id}: ${JSON.stringify(input)}`));
};

/** Checks that every input is refused with a message matching `message`. */
const expectErrors = (id: string, inputs: string[], message: RegExp, typed: string[] = []) => {
  const transform = transformOf(id);
  inputs.forEach((input) => assert.throws(() => transform(input, typed),
    (error: Error) => error instanceof NumInputError && message.test(error.message), `${id}: ${JSON.stringify(input.slice(0, 50))}`));
};

suite('Number Commands transforms (NUM-001..040) Test Suite', () => {

  test('every ROADMAP example', () => {
    NUM_COMMAND_ENTRIES.forEach((entry) => {
      const example = NUM_ROADMAP_EXAMPLES[entry.id];
      assert.strictEqual(transformOf(entry.id)(example.input, example.inputs), example.expected, entry.id);
    });
  });

  suite('statistics (NUM-001..009)', () => {
    test('NUM-001 median: odd and even counts, unsorted, rule A', () => {
      expectAll('NUM-001', [['5 1 3', '3'], ['1\n3\n2\n10', '2.5'], ['0.1 0.2', '0.15'], ['7', '7'], ['-1 -3', '-2']]);
    });

    test('NUM-002 mode: ties in ascending order, one number, no mode', () => {
      expectAll('NUM-002', [['3 1 1 3 2', '1, 3'], ['5', '5'], ['1.0 1 2', '1']]);
      expectErrors('NUM-002', ['1 2 3'], /^every number appears once, so there is no mode$/);
    });

    test('NUM-003 / 004: rule B and n/a for one number', () => {
      expectAll('NUM-003', [['5', 'σ=0, s=n/a'], ['1 2 3', 'σ=0.8165, s=1']]);
      expectAll('NUM-004', [['5', '0 / n/a'], ['2\n4\n4\n4\n5\n5\n7\n9', '4 / 4.5714']]);
    });

    test('NUM-005 count: 0 when there is no number (not an error)', () => {
      expectAll('NUM-005', [['abc', '0'], ['10px 1,234 2026-09-29', '3'], ['1e3 -2 +.5', '3']]);
    });

    test('NUM-006 product / NUM-007 range: rule A; overflow is an error', () => {
      expectAll('NUM-006', [['0.1 3', '0.3'], ['-2 3', '-6'], ['0 -1', '0']]);
      expectAll('NUM-007', [['0.3 0.1', '0.2'], ['4', '0']]);
      expectErrors('NUM-006', ['1e200 1e200'], /^the result is out of range$/);
    });

    test('NUM-008 percentile: linear interpolation (PERCENTILE.INC), 0 and 100', () => {
      expectAll('NUM-008', [['1 2 3 4 5', '1']], ['0']);
      expectAll('NUM-008', [['1 2 3 4 5', '5']], ['100']);
      expectAll('NUM-008', [['10 20', '11.25']], ['12.5']);
      expectAll('NUM-008', [['7', '7']], ['50']);
    });

    test('NUM-009 summary: one number', () => {
      expectAll('NUM-009', [['4', 'count=1, sum=4, mean=4, min=4, max=4, median=4, σ=0, s=n/a'],
        ['0.1 0.2', 'count=2, sum=0.3, mean=0.15, min=0.1, max=0.2, median=0.15, σ=0.05, s=0.0707']]);
    });

    test('no number is NumNoNumbersError (except count); a number out of range is an error', () => {
      ['NUM-001', 'NUM-002', 'NUM-003', 'NUM-004', 'NUM-006', 'NUM-007', 'NUM-009'].forEach((id) =>
        assert.throws(() => transformOf(id)('abc 10px'), NumNoNumbersError, id));
      assert.throws(() => transformOf('NUM-008')('abc', ['50']), NumNoNumbersError);
      expectErrors('NUM-005', ['1 1e400'], /^"1e400" is out of range$/);
    });
  });

  suite('line conversions: shared rules', () => {
    test('empty lines, spaces around values and CRLF are kept', () => {
      expectAll('NUM-013', [['1.2\r\n\r\n  2.5\t\n', '2\r\n\r\n  3\t\n']]);
      expectAll('NUM-020', [[' 255 \n\n16', ' 0xff \n\n0x10']]);
    });

    test('an invalid line names its line number', () => {
      expectErrors('NUM-012', ['1\n2\nabc'], /^line 3: "abc" is not a number$/);
      expectErrors('NUM-012', ['Infinity', 'NaN', '0x10', '1,000', '1 2'], /^line 1: ".*" is not a number$/);
      expectErrors('NUM-012', ['1e400'], /^line 1: "1e400" is out of range$/);
    });

    test('a selection longer than 5,000,000 characters is refused', () => {
      expectErrors('NUM-015', ['1'.repeat(NUM_MAX_INPUT_LENGTH + 1)], /longer than 5,000,000 characters/);
    });
  });

  suite('NUM-010..014', () => {
    test('NUM-010 cumulative sum: rule A, empty lines not added', () => {
      expectAll('NUM-010', [['0.1\n0.2', '0.1\n0.3'], ['1\n\n2\n-4', '1\n\n3\n-1'], ['-0.5\n0.5', '-0.5\n0']]);
    });

    test('NUM-011 round: half away from zero on the decimal form, no trailing zeros', () => {
      expectAll('NUM-011', [['1.005', '1.01'], ['1.2', '1.2'], ['-1.005', '-1.01'], ['2.675', '2.68']], ['2']);
      expectAll('NUM-011', [['-2.5', '-3'], ['2.5', '3'], ['-0.4', '0'], ['1e21', '1e+21']], ['0']);
      expectAll('NUM-011', [['0.1234567890123456', '0.123456789012346']], ['15']);
    });

    test('NUM-012..014: -0 is 0', () => {
      expectAll('NUM-012', [['-0.5', '-1'], ['0.5', '0']]);
      expectAll('NUM-013', [['-0.5', '0'], ['-2.1', '-2']]);
      expectAll('NUM-014', [['-0.5', '0'], ['2.9', '2'], ['1e3', '1000']]);
    });
  });

  suite('NUM-015 / 016 signs', () => {
    test('abs keeps the digits', () => {
      expectAll('NUM-015', [['-1.50', '1.50'], ['+5', '5'], ['5', '5'], ['-0.00', '0.00'], ['-0', '0'], ['-1e5', '1e5'], ['007', '007']]);
    });

    test('negate: a zero only loses its sign', () => {
      expectAll('NUM-016', [['-0.00', '0.00'], ['0.00', '0.00'], ['+0.0', '0.0'], ['-0', '0'], ['0e5', '0e5'],
        ['1.50', '-1.50'], ['+5', '-5'], ['007', '-007'], ['-3', '3'], ['.5', '-.5']]);
    });

    test('invalid values', () => {
      expectErrors('NUM-015', ['--1', '1-', 'Infinity'], /is not a number/);
    });
  });

  suite('NUM-017..019 separators and locales', () => {
    test('NUM-017 add: idempotent, sign and fraction kept', () => {
      expectAll('NUM-017', [['1,234,567.89', '1,234,567.89'], ['-1234', '-1,234'], ['123', '123'], ['1000000', '1,000,000'], ['+1234.5', '+1,234.5']]);
      expectErrors('NUM-017', ['1e5', '1.2.3', '.5'], /is not a number/);
      expectErrors('NUM-017', ['12,34'], /misplaced thousands separators/);
    });

    test('NUM-018 remove: wrong separators are an error', () => {
      expectAll('NUM-018', [['-1,234.5', '-1234.5'], ['1234', '1234'], ['999', '999']]);
      expectErrors('NUM-018', ['12,34', '1,2345', ',123', '1,,234'], /misplaced thousands separators/);
    });

    test('NUM-019 locale: stable locales, exactly what Intl writes for others', () => {
      expectAll('NUM-019', [['1234.5', '1.234,5'], ['-0.125', '-0,125']], ['de-DE']);
      expectAll('NUM-019', [['1234567.891', '1,234,567.891']], ['en-US']);
      expectAll('NUM-019', [['1234.5', '1,234.5']], ['ja-JP']);
      expectAll('NUM-019', [['1234.5', new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 20 }).format(1234.5)]], ['fr-FR']);
    });
  });

  suite('NUM-020..026 bases', () => {
    test('decimal to hex / binary / octal: sign, zero, BigInt', () => {
      expectAll('NUM-020', [['-255', '-0xff'], ['0', '0x0'], ['-0', '0x0'], ['18446744073709551616', '0x10000000000000000']]);
      expectAll('NUM-022', [['-5', '-0b101']]);
      expectAll('NUM-024', [['+64', '0o100']]);
      expectErrors('NUM-020', ['1.5', '0xff', '1e3'], /is not a decimal integer/);
    });

    test('hex / binary / octal to decimal: with or without the prefix, any case', () => {
      expectAll('NUM-021', [['FF', '255'], ['-0XfF', '-255'], ['0x0', '0'], ['0x10000000000000000', '18446744073709551616']]);
      expectAll('NUM-023', [['1010', '10'], ['0B11', '3']]);
      expectAll('NUM-025', [['777', '511'], ['0O10', '8']]);
      expectErrors('NUM-021', ['0xg', '0x', 'x10'], /is not a hexadecimal integer/);
      expectErrors('NUM-023', ['0b102'], /is not a binary integer/);
      expectErrors('NUM-025', ['0o8'], /is not an octal integer/);
    });

    test('1,000 digits are accepted, 1,001 are refused before any BigInt is built', () => {
      assert.strictEqual(transformOf('NUM-020')('1'.repeat(1_000)).startsWith('0x'), true);
      expectErrors('NUM-020', ['1'.repeat(1_001)], /more than 1,000 digits/);
      expectErrors('NUM-021', [`0x${'f'.repeat(1_001)}`], /more than 1,000 digits/);
      expectErrors('NUM-026', ['1'.repeat(1_001)], /more than 1,000 digits/, ['10', '2']);
    });

    test('NUM-026 convert base: digits of the source base only, lower case, no leading zeros', () => {
      expectAll('NUM-026', [['ZZ', '1295'], ['-10', '-36'], ['000z', '35']], ['36', '10']);
      expectAll('NUM-026', [['255', 'ff'], ['0', '0']], ['10', '16']);
      expectAll('NUM-026', [['11111111', '255']], ['2', '10']);
      expectErrors('NUM-026', ['12', '0b1', '1.5'], /is not a base-2 integer/, ['2', '10']);
    });
  });

  suite('NUM-027..029 notation', () => {
    test('NUM-027 to scientific (rule A first)', () => {
      expectAll('NUM-027', [['12300', '1.23e+4'], ['0.00015', '1.5e-4'], ['-0', '0e+0'], ['1', '1e+0']]);
    });

    test('NUM-028 from scientific: the digits are kept, exponent up to 1,000', () => {
      expectAll('NUM-028', [['1.5e-3', '0.0015'], ['-1.23E4', '-12300'], ['1.50e1', '15.0'], ['.5e+1', '5'], ['-0e5', '0'], ['12e-1', '1.2'], ['1e0005', '100000']]);
      assert.strictEqual(transformOf('NUM-028')('1e1000'), `1${'0'.repeat(1000)}`);
      expectErrors('NUM-028', ['1e1001', '1e99999999999'], /exponent of .* is larger than 1,000/);
      expectErrors('NUM-028', ['123', '1e', 'e5', '1e5.5'], /is not a number in scientific notation/);
    });

    test('NUM-029 to percent: the point moves 2 places (string arithmetic)', () => {
      expectAll('NUM-029', [['1', '100%'], ['0.5', '50%'], ['-0.25', '-25%'], ['0.1250', '12.50%'], ['0.001', '0.1%'], ['-0', '0%'], ['0.07', '7%']]);
      expectErrors('NUM-029', ['1e2', '50%'], /is not a number/);
    });
  });

  suite('NUM-030 / 031 bytes', () => {
    test('NUM-030 bytes to human: 2 decimals at most, rounding moves to the next unit', () => {
      expectAll('NUM-030', [['0', '0 B'], ['1023', '1023 B'], ['1024', '1 KiB'], ['1048575', '1 MiB'], ['1073741824', '1 GiB'],
        ['1099511627776', '1 TiB'], ['1234567', '1.18 MiB'], [`${2n ** 90n}`, '1024 YiB']]);
      expectErrors('NUM-030', ['-1', '1.5', 'abc'], /is not a non-negative integer/);
      expectErrors('NUM-030', ['1'.repeat(31)], /more than 30 digits/);
    });

    test('NUM-031 human to bytes: SI and IEC units, any case, rounded half up', () => {
      expectAll('NUM-031', [['1.5 MiB', '1572864'], ['200 KB', '200000'], ['1kb', '1000'], ['1 KiB', '1024'], ['512 B', '512'],
        ['1.5 b', '2'], ['0.0001 KB', '0'], ['1 EiB', '1152921504606846976'], ['.5GB', '500000000']]);
      expectErrors('NUM-031', ['1.5', '1 XB', '-1 KB', '1 kbit'], /is not a size/);
      expectErrors('NUM-031', [`${'1'.repeat(31)} B`], /more than 30 digits/);
    });
  });

  suite('NUM-032 / 033 English', () => {
    test('NUM-032 to words: American style, minus, zero, up to 36 digits', () => {
      expectAll('NUM-032', [['0', 'zero'], ['-0', 'zero'], ['13', 'thirteen'], ['100', 'one hundred'], ['123', 'one hundred twenty-three'],
        ['-1000001', 'minus one million one'], ['2000000000', 'two billion'], ['0042', 'forty-two']]);
      assert.match(transformOf('NUM-032')('1'.repeat(36)), /^one hundred eleven decillion /);
      expectErrors('NUM-032', ['1'.repeat(37)], /more than 36 digits/);
      expectErrors('NUM-032', ['1.5', 'x'], /is not an integer/);
    });

    test('NUM-033 ordinal: 11..13 take th, the digits are kept', () => {
      expectAll('NUM-033', [['1', '1st'], ['2', '2nd'], ['3', '3rd'], ['4', '4th'], ['11', '11th'], ['12', '12th'], ['13', '13th'],
        ['21', '21st'], ['111', '111th'], ['-1', '-1st'], ['0', '0th'], ['102', '102nd']]);
      expectErrors('NUM-033', ['1.5'], /is not an integer/);
    });
  });

  suite('NUM-034 fractions', () => {
    test('finite decimals are reduced exactly', () => {
      expectAll('NUM-034', [['0.1', '1/10'], ['0.3', '3/10'], ['0.7', '7/10'], ['0.8', '4/5'], ['0.9', '9/10'], ['0.125', '1/8'],
        ['0.75', '3/4'], ['1.5', '3/2'], ['-0.5', '-1/2'], ['3', '3'], ['3.0', '3'], ['0', '0'], ['-0.0', '0'], ['0.500000', '1/2']]);
    });

    test('with 6 or more decimals, a repeating fraction with a denominator up to 99 is used', () => {
      expectAll('NUM-034', [['0.333333', '1/3'], ['0.142857', '1/7'], ['0.666666', '2/3'], ['0.666667', '2/3'], ['0.833333', '5/6'],
        ['0.090909', '1/11'], ['0.123456', '10/81'], ['1.333333', '4/3'], ['-0.333333', '-1/3']]);
    });

    test('otherwise the exact fraction is kept', () => {
      expectAll('NUM-034', [['0.314159', '314159/1000000'], ['0.33333', '33333/100000']]);
    });

    test('30 digits at most, no exponent', () => {
      assert.strictEqual(transformOf('NUM-034')(`0.${'5'.repeat(29)}`).includes('/'), true);
      expectErrors('NUM-034', [`0.${'5'.repeat(30)}`], /more than 30 digits/);
      expectErrors('NUM-034', ['1e-3', 'x'], /is not a number/);
    });
  });

  suite('NUM-035..040 units', () => {
    test('rule B, no unit symbol', () => {
      expectAll('NUM-035', [['0', '32'], ['-40', '-40'], ['36.6', '97.88']]);
      expectAll('NUM-036', [['32', '0'], ['100', '37.7778'], ['-40', '-40']]);
      expectAll('NUM-037', [['1', '0.6214'], ['0', '0']]);
      expectAll('NUM-038', [['10', '16.0934']]);
      expectAll('NUM-039', [['1', '0.3937'], ['100', '39.3701']]);
      expectAll('NUM-040', [['0.1', '0.254'], ['-2', '-5.08']]);
    });
  });

  suite('output limit', () => {
    test('NUM-028: 5,000,000 characters of 1e1000 stop at the budget without a RangeError', () => {
      const text = '1e1000\n'.repeat(Math.floor(NUM_MAX_INPUT_LENGTH / 7));
      assert.throws(() => transformOf('NUM-028')(text), EncOutputTooLargeError);
    });

    test('every line conversion stops at the budget given by the handler', () => {
      NUM_COMMAND_ENTRIES.filter((entry) => entry.output === 'replace').forEach((entry) => {
        const example = NUM_ROADMAP_EXAMPLES[entry.id];
        assert.throws(() => entry.transform(example.input, example.inputs, example.expected.length - 1), EncOutputTooLargeError, entry.id);
        assert.strictEqual(entry.transform(example.input, example.inputs, example.expected.length), example.expected, entry.id);
      });
    });

    test('statistics count their line too', () => {
      assert.throws(() => NUM_COMMAND_ENTRIES[0].transform('1 3', [], 0), EncOutputTooLargeError);
      assert.strictEqual(NUM_COMMAND_ENTRIES[0].transform('1 3', [], 1), '2');
    });
  });
});
