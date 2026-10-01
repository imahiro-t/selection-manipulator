import * as assert from 'assert';
import { EncOutputTooLargeError } from '../../handler/encodeTransforms';
import {
  clamp,
  findClampProblem,
  fromEnglishWords,
  fromFraction,
  fromIeee754,
  fromRoman,
  multiplyBy,
  NUM2_MAX_WORDS,
  roundToMultiple,
  roundToSignificant,
  toIeee754,
  toRoman,
  toTwosComplement,
} from '../../handler/num2Convert';
import {
  collapseRanges,
  differences,
  expandRanges,
  greatestCommonDivisor,
  leastCommonMultiple,
  NUM2_MAX_EXPANDED,
  NUM2_MAX_FACTOR_WORK,
  NUM2_MAX_LCM_DIGITS,
  primeFactors,
} from '../../handler/num2Math';
import { NUM2_COMMAND_ENTRIES } from '../../handler/num2Transforms';
import { NumInputError, NumLimitError, NumNoNumbersError, MAX_OUTPUT_LENGTH } from '../../handler/numCommon';
import { toWordsEn } from '../../handler/numConvert';
import { NumCommandEntry } from '../../handler/numTransforms';
import { NUM2_EXAMPLES } from './num2Examples';

const BUDGET = MAX_OUTPUT_LENGTH;

const entryOf = (id: string): NumCommandEntry => {
  const found = NUM2_COMMAND_ENTRIES.find((entry) => entry.id === id);
  assert.ok(found, id);
  return found;
};

/** Runs the transform of a command on one selection. */
const run = (id: string, text: string, inputs: string[] = []): string => entryOf(id).transform(text, inputs, BUDGET, { work: 0 });

/** Asserts that `fn` throws a NumInputError (not a subclass unless `kind` says so) with `message`. */
const throwsInput = (fn: () => unknown, message: string | RegExp, kind: new (...args: never[]) => Error = NumInputError): void => {
  assert.throws(fn, (error: Error) => {
    assert.ok(error instanceof kind, `${error.name}: ${error.message}`);
    if (typeof message === 'string') {
      assert.strictEqual(error.message, message);
    } else {
      assert.match(error.message, message);
    }
    return true;
  });
};

suite('Extended Number Commands (NUMX-001..023) transforms Test Suite', () => {

  suite('showcase examples', () => {
    NUM2_COMMAND_ENTRIES.forEach((entry) => {
      const example = NUM2_EXAMPLES[entry.id];
      test(`${entry.id} ${entry.name}: ${JSON.stringify(example.input)}`, () => {
        assert.strictEqual(entry.transform(example.input, example.inputs, BUDGET, { work: 0 }), example.expected);
      });
    });
  });

  suite('NUMX-001 round-to-significant', () => {
    test('rounds to significant figures, half away from zero', () => {
      assert.strictEqual(roundToSignificant('123456', 2), '120000');
      assert.strictEqual(roundToSignificant('0.00123456', 3), '0.00123');
      assert.strictEqual(roundToSignificant('-2.5', 1), '-3');
      assert.strictEqual(roundToSignificant('9.99', 2), '10');
      assert.strictEqual(roundToSignificant('-0', 3), '0');
      assert.strictEqual(roundToSignificant('1.5', 21), '1.5');
    });

    test('not a number is an error with the line number', () => {
      throwsInput(() => run('NUMX-001', '1\nx', ['2']), 'line 2: "x" is not a number');
    });
  });

  suite('NUMX-002 round-to-multiple', () => {
    test('floating-point error does not move a boundary', () => {
      const cases: [string, number, string][] = [
        ['17', 5, '15'], ['0.15', 0.1, '0.2'], ['0.35', 0.1, '0.4'], ['1.005', 0.01, '1.01'], ['2.5', 1, '3'],
        ['-2.5', 1, '-3'], ['-17', -5, '-15'], ['7', 0.3, '6.9'], ['18', 5, '20'], ['0', 7, '0'], ['-1', 5, '0'],
      ];
      for (const [value, step, expected] of cases) {
        assert.strictEqual(roundToMultiple(value, step), expected, `${value} / ${step}`);
      }
    });

    test('a quotient or result beyond the range of a double is an error', () => {
      throwsInput(() => roundToMultiple('1e308', 1e-308), 'the result is out of range');
      throwsInput(() => run('NUMX-002', '1e308', ['1e-308']), 'line 1: the result is out of range');
    });
  });

  suite('NUMX-003 clamp', () => {
    test('values out of range become the bound, values in range stay as written', () => {
      assert.strictEqual(clamp('120', 0, 100), '100');
      assert.strictEqual(clamp('-5', 0, 100), '0');
      assert.strictEqual(clamp('050.0', 0, 100), '050.0');
      assert.strictEqual(clamp('1e3', 0.5, 2.5), '2.5');
      assert.strictEqual(run('NUMX-003', ' 120 \n\n7', ['0', '5']), ' 5 \n\n5');
    });

    test('the minimum must not be greater than the maximum', () => {
      assert.strictEqual(findClampProblem(0, 100), undefined);
      assert.strictEqual(findClampProblem(5, 5), undefined);
      assert.strictEqual(findClampProblem(10, 0), 'The minimum (10) is greater than the maximum (0).');
      assert.strictEqual(entryOf('NUMX-003').validateInputs!(['10', '0']), 'The minimum (10) is greater than the maximum (0).');
      assert.strictEqual(entryOf('NUMX-003').validateInputs!(['0', '10']), undefined);
    });
  });

  suite('NUMX-004 / 005 Roman numerals', () => {
    test('1..3999 make a round trip', () => {
      for (let n = 1; n <= 3999; n++) {
        const roman = toRoman(String(n));
        assert.strictEqual(fromRoman(roman), String(n), roman);
        assert.strictEqual(fromRoman(roman.toLowerCase()), String(n), roman);
      }
      assert.strictEqual(toRoman('3999'), 'MMMCMXCIX');
      assert.strictEqual(toRoman('0004'), 'IV');
    });

    test('to-roman: 0, 4000, decimals and signs are errors', () => {
      for (const value of ['0', '4000', '1.5', '+5', '-1', '1e3', '99999999999999999999']) {
        throwsInput(() => toRoman(value), `${JSON.stringify(value)} is not an integer from 1 to 3999`);
      }
    });

    test('from-roman: non-standard forms, empty text and other letters are errors', () => {
      for (const value of ['IIII', 'VX', 'IC', 'MMMM', 'XM', 'VV', '', 'ABC', 'X I', 'ıı', 'Ⅻ']) {
        throwsInput(() => fromRoman(value), `${JSON.stringify(value)} is not a Roman numeral in standard form (I to MMMCMXCIX)`);
      }
    });
  });

  suite('NUMX-006 from-english-words', () => {
    test('the words of to-words-en make a round trip', () => {
      const values = ['0', '7', '13', '20', '42', '100', '101', '999', '1000', '1001', '100000', '1000000', '1002003',
        '-5', '-1000000000', '999999999999999999999999999999999999', '100000000000000000000000000000000000'];
      for (let n = 0; n <= 2000; n++) {
        values.push(String(n));
      }
      for (const value of values) {
        assert.strictEqual(fromEnglishWords(toWordsEn(value)), value, toWordsEn(value));
      }
    });

    test('case, `and`, commas and missing hyphens are accepted', () => {
      assert.strictEqual(fromEnglishWords('One Hundred and Twenty-Three'), '123');
      assert.strictEqual(fromEnglishWords('two million, three hundred and five'), '2000305');
      assert.strictEqual(fromEnglishWords('twenty three'), '23');
      assert.strictEqual(fromEnglishWords('MINUS FIVE'), '-5');
    });

    test('wrong orders, unknown words and other characters are errors', () => {
      for (const value of ['one thousand thousand', 'one million one billion', 'hundred', 'twenty twelve', 'one two', 'zero one',
        'minus', 'minus zero', 'and', 'eleventy', '-five', 'five-', 'one, 2', 'twenty--one', 'one thousand hundred', 'ten hundred']) {
        throwsInput(() => fromEnglishWords(value), `${JSON.stringify(value)} is not a number in English words`);
      }
    });

    test('more than 100 words is an error', () => {
      assert.strictEqual(NUM2_MAX_WORDS, 100);
      throwsInput(() => fromEnglishWords('one '.repeat(101)), 'the text has more than 100 words');
      throwsInput(() => fromEnglishWords('and '.repeat(101)), 'the text has more than 100 words');
    });
  });

  suite('NUMX-007 from-fraction', () => {
    test('fractions and mixed numbers', () => {
      assert.strictEqual(fromFraction('3/4'), '0.75');
      assert.strictEqual(fromFraction('1 3/4'), '1.75');
      assert.strictEqual(fromFraction('-1 3/4'), '-1.75');
      assert.strictEqual(fromFraction('+1/2'), '0.5');
      assert.strictEqual(fromFraction('1/3'), '0.333333333333333');
      assert.strictEqual(fromFraction('5 / 4'), '1.25');
      assert.strictEqual(fromFraction('-0/5'), '0');
    });

    test('a denominator of 0, too many digits and other text are errors', () => {
      throwsInput(() => fromFraction('1/0'), '"1/0" has the denominator 0');
      throwsInput(() => fromFraction('2 1/000'), '"2 1/000" has the denominator 0');
      throwsInput(() => fromFraction(`1/${'9'.repeat(31)}`), 'the number has more than 30 digits');
      for (const value of ['1.5/2', '1/2/3', '1 -1/2', 'a/b', '5']) {
        throwsInput(() => fromFraction(value), `${JSON.stringify(value)} is not a fraction such as 3/4 or 1 3/4`);
      }
    });
  });

  suite('NUMX-008 multiply-by-n', () => {
    test('rule A and overflow', () => {
      assert.strictEqual(multiplyBy('12', 1.1), '13.2');
      assert.strictEqual(multiplyBy('-3', 0), '0');
      assert.strictEqual(multiplyBy('0.1', 3), '0.3');
      throwsInput(() => multiplyBy('1e308', 10), 'the result is out of range');
    });
  });

  suite('NUMX-009 / 010 IEEE 754', () => {
    test('known bit patterns', () => {
      assert.strictEqual(toIeee754('1.5', 64), '0x3FF8000000000000');
      assert.strictEqual(toIeee754('-0', 64), '0x8000000000000000');
      assert.strictEqual(toIeee754('-0', 32), '0x80000000');
      assert.strictEqual(toIeee754('0.1', 32), '0x3DCCCCCD');
      assert.strictEqual(toIeee754('1', 32), '0x3F800000');
      assert.strictEqual(fromIeee754('0x3FF8000000000000'), '1.5');
      assert.strictEqual(fromIeee754('3dcccccd'), '0.1');
      assert.strictEqual(fromIeee754('0X8000000000000000'), '-0');
      assert.strictEqual(fromIeee754('80000000'), '-0');
      assert.strictEqual(fromIeee754('7FF0000000000000'), 'Infinity');
      assert.strictEqual(fromIeee754('FFF0000000000000'), '-Infinity');
      assert.strictEqual(fromIeee754('7FF8000000000000'), 'NaN');
      assert.strictEqual(fromIeee754('7fc00000'), 'NaN');
      assert.strictEqual(fromIeee754('ff800000'), '-Infinity');
      assert.strictEqual(fromIeee754('00000001'), '1e-45');
    });

    test('round trips of doubles and singles', () => {
      const doubles = [0, 1, -1, 0.1, 1 / 3, Math.PI, 1e-310, 5e-324, Number.MAX_VALUE, -123456.789, 2 ** 53 + 2];
      for (let i = 0; i < 200; i++) {
        doubles.push((Math.random() - 0.5) * 10 ** Math.floor(Math.random() * 40 - 20));
      }
      for (const x of doubles) {
        assert.strictEqual(fromIeee754(toIeee754(String(x), 64)), String(x), String(x));
        const single = Math.fround(x);
        if (Number.isFinite(single)) {
          // The shortest decimal of a single reads back to the same single (not to the same double).
          assert.strictEqual(Math.fround(Number(fromIeee754(toIeee754(String(single), 32)))), single, String(single));
        }
      }
    });

    test('a single overflow and wrong hex lengths are errors', () => {
      throwsInput(() => toIeee754('1e39', 32), '"1e39" is out of the range of a 32-bit float');
      throwsInput(() => toIeee754('x', 64), '"x" is not a number');
      for (const value of ['0x123', '123456789', 'G0000000', '0x', '0x3FF80000000000000']) {
        throwsInput(() => fromIeee754(value), `${JSON.stringify(value)} is not 16 (double) or 8 (single) hex digits`);
      }
    });
  });

  suite('NUMX-011 to-twos-complement', () => {
    test('the bounds of every width', () => {
      const cases: [string, 8 | 16 | 32 | 64, string][] = [
        ['-128', 8, '0x80'], ['255', 8, '0xFF'], ['127', 8, '0x7F'], ['0', 8, '0x00'], ['-1', 8, '0xFF'],
        ['-32768', 16, '0x8000'], ['65535', 16, '0xFFFF'],
        ['-2147483648', 32, '0x80000000'], ['4294967295', 32, '0xFFFFFFFF'], ['-1', 32, '0xFFFFFFFF'],
        ['-9223372036854775808', 64, '0x8000000000000000'], ['18446744073709551615', 64, '0xFFFFFFFFFFFFFFFF'],
        ['-000001', 32, '0xFFFFFFFF'], ['+5', 16, '0x0005'],
      ];
      for (const [value, width, expected] of cases) {
        assert.strictEqual(toTwosComplement(value, width), expected, `${value} (${width})`);
      }
    });

    test('values out of the width are errors', () => {
      throwsInput(() => toTwosComplement('256', 8), '"256" is out of the range of 8 bits (-128 to 255)');
      throwsInput(() => toTwosComplement('-129', 8), '"-129" is out of the range of 8 bits (-128 to 255)');
      throwsInput(() => toTwosComplement('18446744073709551616', 64), /is out of the range of 64 bits \(-9223372036854775808 to 18446744073709551615\)$/);
      throwsInput(() => toTwosComplement('1.5', 8), '"1.5" is not an integer');
    });

    test('more than 20 digits (leading zeros not counted) is refused before BigInt reads it', () => {
      throwsInput(() => toTwosComplement('1'.repeat(21), 64), /is out of the range of 64 bits/);
      assert.strictEqual(toTwosComplement(`${'0'.repeat(30)}1`, 8), '0x01');
      const start = Date.now();
      throwsInput(() => toTwosComplement('9'.repeat(5_000_000), 64), /is out of the range of 64 bits/);
      assert.ok(Date.now() - start < 1_000, 'no BigInt of 5,000,000 digits is built');
    });
  });

  suite('NUMX-012 / 013 gcd and lcm', () => {
    test('gcd: negatives, zeros and one integer', () => {
      assert.strictEqual(greatestCommonDivisor('12 18 24', BUDGET), '6');
      assert.strictEqual(greatestCommonDivisor('-12 18', BUDGET), '6');
      assert.strictEqual(greatestCommonDivisor('0 0', BUDGET), '0');
      assert.strictEqual(greatestCommonDivisor('0 5', BUDGET), '5');
      assert.strictEqual(greatestCommonDivisor('-7', BUDGET), '7');
      assert.strictEqual(greatestCommonDivisor('7 11 x 1000', BUDGET), '1');
      assert.strictEqual(greatestCommonDivisor(`${'9'.repeat(1000)} ${'3'.repeat(1000)}`, BUDGET), '3'.repeat(1000));
    });

    test('lcm: negatives, zeros and one integer', () => {
      assert.strictEqual(leastCommonMultiple('4 6', BUDGET), '12');
      assert.strictEqual(leastCommonMultiple('-4 6', BUDGET), '12');
      assert.strictEqual(leastCommonMultiple('0 0', BUDGET), '0');
      assert.strictEqual(leastCommonMultiple('0 5', BUDGET), '0');
      assert.strictEqual(leastCommonMultiple('-7', BUDGET), '7');
      assert.strictEqual(leastCommonMultiple('2 3 4 5 6 7 8 9 10', BUDGET), '2520');
    });

    test('decimals, too many digits and no integers', () => {
      throwsInput(() => greatestCommonDivisor('1.5 3', BUDGET), '"1.5" is not an integer');
      throwsInput(() => leastCommonMultiple('2 1e3', BUDGET), '"1e3" is not an integer');
      throwsInput(() => greatestCommonDivisor(`1${'0'.repeat(1000)}`, BUDGET), 'the number has more than 1,000 digits');
      assert.strictEqual(greatestCommonDivisor(`${'0'.repeat(5)}${'1'.repeat(1000)}`, BUDGET), '1'.repeat(1000));
      throwsInput(() => greatestCommonDivisor('abc', BUDGET), 'no numbers found', NumNoNumbersError);
      throwsInput(() => leastCommonMultiple('', BUDGET), 'no numbers found', NumNoNumbersError);
    });

    test('△ the lcm stops as soon as it has more than 1,000 digits', () => {
      assert.strictEqual(NUM2_MAX_LCM_DIGITS, 1_000);
      // 999 nines and 1 + 999 zeros are coprime: the lcm has 1,999 digits.
      throwsInput(() => leastCommonMultiple(`${'9'.repeat(999)} 1${'0'.repeat(999)}`, BUDGET), 'the result has more than 1,000 digits');
      // The product of the first primes grows past 1,000 digits after a few hundred of them.
      const primes: number[] = [];
      for (let n = 2; primes.length < 2_000; n++) {
        if (primes.every((p) => p * p > n || n % p !== 0)) {
          primes.push(n);
        }
      }
      throwsInput(() => leastCommonMultiple(primes.join(' '), BUDGET), 'the result has more than 1,000 digits');
      assert.strictEqual(leastCommonMultiple(`${'9'.repeat(1000)} 3`, BUDGET), '9'.repeat(1000));
    });
  });

  suite('NUMX-014 prime-factors', () => {
    test('factorizations', () => {
      const cases: [string, string][] = [
        ['2', '2'], ['4', '2^2'], ['360', '2^3 × 3^2 × 5'], ['97', '97'], ['1024', '2^10'], ['+12', '2^2 × 3'],
        ['600851475143', '71 × 839 × 1471 × 6857'], ['9007199254740991', '6361 × 69431 × 20394401'],
        ['9007199254740990', '2 × 3 × 5 × 53 × 157 × 1613 × 2731 × 8191'], ['2251799813685248', '2^51'],
      ];
      for (const [value, expected] of cases) {
        assert.strictEqual(primeFactors(value, { work: 0 }), expected, value);
      }
    });

    test('the product of the factors is the number', () => {
      for (let n = 2; n < 5_000; n++) {
        let product = 1;
        for (const part of primeFactors(String(n), { work: 0 }).split(' × ')) {
          const [base, exponent] = part.split('^');
          product *= Number(base) ** Number(exponent ?? '1');
        }
        assert.strictEqual(product, n);
      }
    });

    test('only integers from 2 to 2^53 − 1', () => {
      for (const value of ['0', '1', '-4', '1.5', '9007199254740992', '1'.repeat(30), 'x']) {
        throwsInput(() => primeFactors(value, { work: 0 }), `${JSON.stringify(value)} is not an integer from 2 to 9007199254740991`);
      }
    });

    test('△ the worst case (a large prime) ends within seconds', function () {
      this.timeout(10_000);
      const start = Date.now();
      const work = { work: 0 };
      assert.strictEqual(primeFactors('9007199254740881', work), '9007199254740881');
      assert.ok(Date.now() - start < 5_000, `${Date.now() - start} ms`);
      assert.ok(work.work > 30_000_000 && work.work < NUM2_MAX_FACTOR_WORK, String(work.work));
    });

    test('△ the trial divisions of one run are limited (many large primes)', function () {
      this.timeout(20_000);
      const start = Date.now();
      throwsInput(() => run('NUMX-014', '9007199254740881\n'.repeat(10)),
        'line 4: the factorization needs more than 100,000,000 trial divisions; select fewer or smaller numbers');
      assert.ok(Date.now() - start < 10_000, `${Date.now() - start} ms`);
      // Small numbers barely count.
      assert.strictEqual(run('NUMX-014', '360\n'.repeat(10_000)), '2^3 × 3^2 × 5\n'.repeat(10_000));
    });
  });

  suite('NUMX-015 diff-consecutive', () => {
    test('separators follow the selection', () => {
      assert.strictEqual(differences('1 4 9', BUDGET), '3 5');
      assert.strictEqual(differences('1\n4\n9', BUDGET), '3\n5');
      assert.strictEqual(differences('1\r\n4\r\n9\r\n', BUDGET), '3\r\n5');
      assert.strictEqual(differences('10, 7.5, -2', BUDGET), '-2.5 -9.5');
      assert.strictEqual(differences('0.1 0.3', BUDGET), '0.2');
    });

    test('fewer than 2 numbers is an error', () => {
      throwsInput(() => differences('5', BUDGET), 'at least 2 numbers are needed (found 1)');
      throwsInput(() => differences('abc', BUDGET), 'at least 2 numbers are needed (found 0)');
    });
  });

  suite('NUMX-016 / 017 ranges', () => {
    test('collapse: separators, sorting and duplicates', () => {
      assert.strictEqual(collapseRanges('1 2 3 5 7 8', BUDGET), '1-3, 5, 7-8');
      assert.strictEqual(collapseRanges(' 8,7\r\n1\t2 3,,5\n', BUDGET), '1-3, 5, 7-8');
      assert.strictEqual(collapseRanges('3 3 2 2', BUDGET), '2-3');
      assert.strictEqual(collapseRanges('0', BUDGET), '0');
      assert.strictEqual(collapseRanges('9007199254740991 9007199254740990', BUDGET), '9007199254740990-9007199254740991');
    });

    test('collapse: negatives, decimals, ranges and empty input are errors', () => {
      throwsInput(() => collapseRanges('1 -2', BUDGET), '"-2" is not an integer of 0 or more');
      throwsInput(() => collapseRanges('1.5', BUDGET), '"1.5" is not an integer of 0 or more');
      throwsInput(() => collapseRanges('1-3', BUDGET), '"1-3" is not an integer of 0 or more');
      throwsInput(() => collapseRanges('9007199254740992', BUDGET), '"9007199254740992" is larger than 9007199254740991');
      throwsInput(() => collapseRanges(' ,\n', BUDGET), 'no integers found');
    });

    test('expand: separators, spaces around the dash, order and duplicates', () => {
      assert.strictEqual(expandRanges('1-3, 5', BUDGET), '1, 2, 3, 5');
      assert.strictEqual(expandRanges('1 - 3 5', BUDGET), '1, 2, 3, 5');
      assert.strictEqual(expandRanges('1 -3', BUDGET), '1, 2, 3');
      assert.strictEqual(expandRanges('1- 3', BUDGET), '1, 2, 3');
      assert.strictEqual(expandRanges('1\t-\t3', BUDGET), '1, 2, 3');
      assert.strictEqual(expandRanges('5, 1-2, 2', BUDGET), '5, 1, 2, 2');
      assert.strictEqual(expandRanges(',7\r\n2-2,,\n0\t', BUDGET), '7, 2, 0');
    });

    test('expand: malformed items are errors', () => {
      for (const [value, item] of [['-3', '-3'], ['1-', '1-'], ['1--3', '1--3'], ['1-3-5', '1-3-5'], ['1\n-3', '-3'], ['1-\n3', '1-'], ['a', 'a'], ['1.5', '1.5'], ['2 x', 'x']]) {
        throwsInput(() => expandRanges(value, BUDGET), `${JSON.stringify(item)} is not an integer or a range such as 1-3`);
      }
      throwsInput(() => expandRanges('3-1', BUDGET), '"3-1" starts after it ends');
      throwsInput(() => expandRanges('', BUDGET), 'no integers or ranges found');
      throwsInput(() => expandRanges(' , ', BUDGET), 'no integers or ranges found');
    });

    test('△ expand: more than 10,000 integers is refused before anything is generated (a warning)', () => {
      assert.strictEqual(NUM2_MAX_EXPANDED, 10_000);
      assert.strictEqual(expandRanges('1-10000', BUDGET).split(', ').length, 10_000);
      throwsInput(() => expandRanges('0-10000', BUDGET), 'the ranges expand to more than 10,000 integers', NumLimitError);
      throwsInput(() => expandRanges('1-5000, 1-5001', BUDGET), 'the ranges expand to more than 10,000 integers', NumLimitError);
      const start = Date.now();
      throwsInput(() => expandRanges('0-9007199254740991', BUDGET), 'the ranges expand to more than 10,000 integers', NumLimitError);
      assert.ok(Date.now() - start < 1_000);
    });

    test('expand: the output is counted against the budget', () => {
      assert.throws(() => expandRanges('1-10000', 100), EncOutputTooLargeError);
    });
  });

  suite('NUMX-018..023 units', () => {
    test('conversions (rule B)', () => {
      const cases: [string, string, string][] = [
        ['NUMX-018', '1', '3.2808'], ['NUMX-018', '0.3048', '1'], ['NUMX-019', '10', '3.048'], ['NUMX-019', '1', '0.3048'],
        ['NUMX-020', '100', '30.25'], ['NUMX-020', '1', '0.3025'], ['NUMX-021', '30.25', '100'], ['NUMX-021', '1', '3.3058'],
        ['NUMX-022', '180', '3.1416'], ['NUMX-022', '-90', '-1.5708'], ['NUMX-023', '3.14159265', '180'], ['NUMX-023', '1', '57.2958'],
      ];
      for (const [id, value, expected] of cases) {
        assert.strictEqual(run(id, value), expected, `${id} ${value}`);
      }
    });

    test('not a number and overflow are errors', () => {
      throwsInput(() => run('NUMX-018', '1 m'), 'line 1: "1 m" is not a number');
      throwsInput(() => run('NUMX-021', '1e308'), 'line 1: the result is out of range');
    });
  });
});
