import * as assert from 'assert';
import { EncOutputTooLargeError, MAX_OUTPUT_LENGTH } from '../../handler/encodeTransforms';
import { GenInputError, GenLimitError } from '../../handler/genCommon';
import {
  braceExpansion,
  fibonacci,
  multiplicationTable,
  parseBoundedCount,
  parseStartTime,
  parseTableSize,
  primeSieve,
  primesUpTo,
  timeSequence,
} from '../../handler/gen2Generate';
import {
  fisherYates,
  parseCharset,
  parsePassphraseSeparator,
  passphrase,
  shuffleLineWords,
  shuffleWords,
  stringFromCharset,
} from '../../handler/gen2Random';
import { PASSPHRASE_WORDS } from '../../handler/gen2Words';
import { cartesianProduct, CARTESIAN_MAX_COMBINATIONS } from '../../handler/gen2Cartesian';
import { MselRange } from '../../handler/mselTransforms';
import { fakeRandom } from './genTestUtils';

const BUDGET = MAX_OUTPUT_LENGTH;

const throwsKind = (run: () => unknown, kind: typeof GenInputError, message: string | RegExp) =>
  assert.throws(run, (error: unknown) => {
    assert.ok(error instanceof kind, String(error));
    if (kind === GenInputError) {
      assert.ok(!(error instanceof GenLimitError), `${String(error)} is a limit`);
    }
    if (typeof message === 'string') {
      assert.strictEqual((error as Error).message, message);
    } else {
      assert.match((error as Error).message, message);
    }
    return true;
  });

const expand = (text: string, eol = '\n') => braceExpansion(text, eol, BUDGET);

/** The selections of `a|b|…` (the `|` between them is not selected). */
const selectionsOf = (parts: string[]): { text: string; ranges: MselRange[] } => {
  const ranges: MselRange[] = [];
  let offset = 0;
  parts.forEach((part) => {
    ranges.push({ start: offset, end: offset + part.length });
    offset += part.length + 1;
  });
  return { text: parts.join('|'), ranges };
};

suite('Extended Generators and Random (DATEX-016..024) Test Suite', () => {

  suite('DATEX-016 brace expansion', () => {
    test('lists, numeric and letter ranges, padding, steps, nesting and order', () => {
      assert.strictEqual(expand('file{1..3}.txt'), 'file1.txt\nfile2.txt\nfile3.txt');
      assert.strictEqual(expand('x{a,b}{c,d}'), 'xac\nxad\nxbc\nxbd');
      assert.strictEqual(expand('{01..10..3}'), '01\n04\n07\n10');
      assert.strictEqual(expand('{3..1}'), '3\n2\n1');
      assert.strictEqual(expand('{-1..1}'), '-1\n0\n1');
      assert.strictEqual(expand('{-02..1}'), '-02\n-01\n000\n001');
      assert.strictEqual(expand('{1..10..-4}'), '1\n5\n9');
      assert.strictEqual(expand('{1..3..0}'), '1\n2\n3');
      assert.strictEqual(expand('{a..e..2}'), 'a\nc\ne');
      assert.strictEqual(expand('{C..A}'), 'C\nB\nA');
      assert.strictEqual(expand('{a,{b,c}d}e'), 'ae\nbde\ncde');
      assert.strictEqual(expand('{,x}y'), 'y\nxy');
    });

    test('literal braces: one element, empty, unmatched, escaped; the rest of the line still expands', () => {
      assert.strictEqual(expand('{a}'), '{a}');
      assert.strictEqual(expand('{}'), '{}');
      assert.strictEqual(expand('{x'), '{x');
      assert.strictEqual(expand('x}'), 'x}');
      assert.strictEqual(expand('{a,{b,c}'), '{a,b\n{a,c');
      assert.strictEqual(expand('\\{a,b\\}'), '{a,b}');
      assert.strictEqual(expand('{a\\,b,c}'), 'a,b\nc');
      assert.strictEqual(expand('\\\\{a,b}'), '\\a\n\\b');
      assert.strictEqual(expand('a\\b{1..2}'), 'a\\b1\na\\b2');
      assert.strictEqual(expand('{{1..2}}'), '{1}\n{2}');
      assert.strictEqual(expand('{1..2..x}'), '{1..2..x}');
    });

    test('every line on its own; lines without braces, blank lines and the line breaks are kept', () => {
      assert.strictEqual(expand('a{1,2}\r\n\r\n  plain  \r\nb{x,y}', '\r\n'), 'a1\r\na2\r\n\r\n  plain  \r\nbx\r\nby');
      assert.strictEqual(expand('a{1,2}\n', '\r\n'), 'a1\r\na2\n');
    });

    test('limits: nesting deeper than 10, a range of more than 10,000 terms, more than 10,000 strings for a line or 100,000 for the selection', () => {
      const nested = (depth: number) => `${'{x,'.repeat(depth)}y${'}'.repeat(depth)}`;
      assert.strictEqual(expand(nested(10)).split('\n').length, 11);
      throwsKind(() => expand(nested(11)), GenLimitError, 'line 1: the braces are nested more than 10 deep');
      throwsKind(() => expand(`${'{'.repeat(11)}a${'}'.repeat(11)}`), GenLimitError, 'line 1: the braces are nested more than 10 deep');
      assert.strictEqual(expand('{1..10000}').split('\n').length, 10_000);
      throwsKind(() => expand('{1..10001}'), GenLimitError, 'line 1: a range has more than 10,000 terms');
      throwsKind(() => expand('{a..z..0}{1..999999999999999}'), GenLimitError, 'line 1: a range has more than 10,000 terms');
      assert.strictEqual(expand('{1..100}{1..100}').split('\n').length, 10_000);
      throwsKind(() => expand('x\n{1..100}{1..101}'), GenLimitError, 'line 2: the line expands to more than 10,000 strings');
      // Counted (saturated) before anything is built: 10^40 strings is refused at once.
      throwsKind(() => expand('{0,1,2,3,4,5,6,7,8,9}'.repeat(40)), GenLimitError, 'line 1: the line expands to more than 10,000 strings');
      const ten = Array.from({ length: 10 }, () => '{1..100}{1..100}').join('\n');
      assert.strictEqual(expand(ten).split('\n').length, 100_000);
      throwsKind(() => expand(`${ten}\n{1,2}`), GenLimitError, 'the selection expands to more than 100,000 strings');
    });

    test('the length is checked against the budget before the result is built', () => {
      assert.throws(() => braceExpansion(`${'x'.repeat(1000)}{1..10000}`, '\n', 1_000_000), EncOutputTooLargeError);
      assert.strictEqual(braceExpansion('{a,b}', '\n', 3), 'a\nb');
      assert.throws(() => braceExpansion('{a,b}', '\n', 2), EncOutputTooLargeError);
    });
  });

  suite('DATEX-017 multiplication table', () => {
    test('sizes N, NxM, N×M, N*M, N M; columns right-aligned', () => {
      assert.strictEqual(multiplicationTable(parseTableSize('3'), '\n', BUDGET), '1 2 3\n2 4 6\n3 6 9');
      assert.strictEqual(multiplicationTable(parseTableSize(' 2x4 '), '\r\n', BUDGET), '1 2 3 4\r\n2 4 6 8');
      assert.strictEqual(multiplicationTable(parseTableSize('4×3'), '\n', BUDGET), '1 2  3\n2 4  6\n3 6  9\n4 8 12');
      assert.deepStrictEqual(parseTableSize('3 * 5'), { rows: 3, columns: 5 });
      assert.deepStrictEqual(parseTableSize('3 5'), { rows: 3, columns: 5 });
      const big = multiplicationTable(parseTableSize('100'), '\n', BUDGET).split('\n');
      assert.strictEqual(big.length, 100);
      assert.ok(big[99].endsWith(' 10000') && big[0].startsWith('  1   2'), big[0]);
    });

    test('0 and malformed sizes are input errors; more than 100 is a limit', () => {
      throwsKind(() => parseTableSize('0'), GenInputError, 'the numbers of rows and columns must be 1 or more');
      throwsKind(() => parseTableSize('3x'), GenInputError, '"3x" is not a size: enter N or NxM (such as 9 or 3x4)');
      throwsKind(() => parseTableSize('101'), GenLimitError, 'the numbers of rows and columns must be at most 100');
      throwsKind(() => parseTableSize('3x101'), GenLimitError, 'the numbers of rows and columns must be at most 100');
    });
  });

  suite('DATEX-018 / 019 Fibonacci and primes', () => {
    test('Fibonacci numbers are exact (BigInt)', () => {
      assert.strictEqual(fibonacci(7, '\n', BUDGET), '0\n1\n1\n2\n3\n5\n8');
      assert.strictEqual(fibonacci(1, '\n', BUDGET), '0');
      const terms = fibonacci(1000, '\n', BUDGET).split('\n');
      assert.strictEqual(terms.length, 1000);
      assert.strictEqual(terms[100], '354224848179261915075');
      assert.strictEqual(terms[999].length, 209);
    });

    test('the primes up to N, from a sieve made for N or more', () => {
      assert.strictEqual(primesUpTo(20, primeSieve(20), BUDGET), '2 3 5 7 11 13 17 19');
      assert.strictEqual(primesUpTo(2, primeSieve(100), BUDGET), '2');
      assert.strictEqual(primesUpTo(10, primeSieve(100), BUDGET), '2 3 5 7');
      const all = primesUpTo(1_000_000, primeSieve(1_000_000), BUDGET).split(' ');
      assert.strictEqual(all.length, 78_498);
      assert.strictEqual(all[all.length - 1], '999983');
      assert.throws(() => primesUpTo(30, primeSieve(20), BUDGET), RangeError);
      assert.throws(() => primeSieve(1_000_001), RangeError);
    });

    test('the number read from the selection: below the range is an input error, above it a limit', () => {
      assert.strictEqual(parseBoundedCount(' 7\n', 1, 1000, 'the number of terms'), 7);
      throwsKind(() => parseBoundedCount('0', 1, 1000, 'the number of terms'), GenInputError, 'the number of terms must be 1 or more');
      throwsKind(() => parseBoundedCount('1001', 1, 1000, 'the number of terms'), GenLimitError, 'the number of terms must be at most 1,000');
      throwsKind(() => parseBoundedCount('1000001', 2, 1_000_000, 'N'), GenLimitError, 'N must be at most 1,000,000');
      throwsKind(() => parseBoundedCount('7.5', 1, 1000, 'the number of terms'), GenInputError, '"7.5" is not a whole number: enter the number of terms from 1 to 1,000');
    });
  });

  suite('DATEX-020 time sequence', () => {
    test('the form of the start is kept; past 24:00 the times start again from 00:00', () => {
      assert.strictEqual(timeSequence(parseStartTime('09:00'), 30, 3, '\n', BUDGET), '09:00\n09:30\n10:00');
      assert.strictEqual(timeSequence(parseStartTime('9:00'), 90, 3, '\n', BUDGET), '9:00\n10:30\n12:00');
      assert.strictEqual(timeSequence(parseStartTime('23:30:15'), 45, 3, '\r\n', BUDGET), '23:30:15\r\n00:15:15\r\n01:00:15');
      assert.strictEqual(timeSequence(parseStartTime('00:00'), 1440, 2, '\n', BUDGET), '00:00\n00:00');
      assert.strictEqual(timeSequence(parseStartTime('00:00'), 1, 10_000, '\n', BUDGET).split('\n')[9999], '22:39');
      for (const bad of ['24:00', '9:60', '9', '09:00:60', '9am']) {
        throwsKind(() => parseStartTime(bad), GenInputError, /is not a time: enter HH:MM or HH:MM:SS \(such as 09:00\)$/);
      }
    });
  });

  suite('DATEX-021 Cartesian product', () => {
    test('the first selection varies slowest; blank lines are skipped; the delimiter is literal', () => {
      const { text, ranges } = selectionsOf(['a\nb', '1\n\n2', 'x']);
      assert.deepStrictEqual(cartesianProduct(text, ranges, ''), {
        kind: 'edit',
        edits: [{ start: 0, end: 3, text: 'a1x\na2x\nb1x\nb2x' }, { start: 4, end: 8, text: '' }, { start: 9, end: 10, text: '' }],
        ranges: [{ start: 0, end: 15 }],
      });
      const two = selectionsOf(['a\r\nb', '$1']);
      const result = cartesianProduct(two.text, two.ranges, ' + ');
      assert.strictEqual(result.kind === 'edit' && result.edits[0].text, 'a + $1\r\nb + $1');
    });

    test('limits are computed before anything is built and only warn', () => {
      const lines = (n: number, width = 1) => Array.from({ length: n }, (_, i) => String(i).padStart(width, '0')).join('\n');
      const ok = selectionsOf([lines(100), lines(100)]);
      const result = cartesianProduct(ok.text, ok.ranges, '');
      assert.strictEqual(result.kind === 'edit' && result.edits[0].text.split('\n').length, CARTESIAN_MAX_COMBINATIONS);
      const tooMany = selectionsOf([lines(100), lines(101)]);
      assert.deepStrictEqual(cartesianProduct(tooMany.text, tooMany.ranges, ''),
        { kind: 'warn', message: 'The text was not changed: the selections make more than 10,000 combinations. Select fewer lines.' });
      const tooLong = selectionsOf([lines(100, 600), lines(100, 600)]);
      assert.deepStrictEqual(cartesianProduct(tooLong.text, tooLong.ranges, ''),
        { kind: 'warn', message: 'The text was not changed: the result would be longer than 10,000,000 characters. Select fewer lines.' });
      const blank = selectionsOf(['a', '  \n\t']);
      assert.deepStrictEqual(cartesianProduct(blank.text, blank.ranges, ''),
        { kind: 'warn', message: 'The text was not changed: selection 2 of 2 has no non-blank line.' });
      assert.throws(() => cartesianProduct(ok.text, ok.ranges, 'a\nb'), /line breaks/);
      assert.strictEqual(cartesianProduct('a', [{ start: 0, end: 1 }], '').kind, 'warn');
    });
  });

  suite('DATEX-022..024 random', () => {
    test('the word list: at least 1,024 words of 3 to 8 lower-case letters, sorted, without repeats', () => {
      assert.ok(PASSPHRASE_WORDS.length >= 1024, String(PASSPHRASE_WORDS.length));
      assert.strictEqual(new Set(PASSPHRASE_WORDS).size, PASSPHRASE_WORDS.length);
      PASSPHRASE_WORDS.forEach((word) => assert.match(word, /^[a-z]{3,8}$/));
      assert.deepStrictEqual([...PASSPHRASE_WORDS].sort(), PASSPHRASE_WORDS);
    });

    test('passphrase: one below(word count) per word', () => {
      const random = fakeRandom([0, 'max', 5]);
      assert.strictEqual(passphrase(random, 3, ' '), `${PASSPHRASE_WORDS[0]} ${PASSPHRASE_WORDS[PASSPHRASE_WORDS.length - 1]} ${PASSPHRASE_WORDS[5]}`);
      assert.deepStrictEqual(random.counts, [PASSPHRASE_WORDS.length, PASSPHRASE_WORDS.length, PASSPHRASE_WORDS.length]);
      assert.strictEqual(parsePassphraseSeparator(' . '), ' . ');
      assert.strictEqual(parsePassphraseSeparator(''), '');
      throwsKind(() => parsePassphraseSeparator('12345678901'), GenInputError, 'the separator must be at most 10 characters');
      throwsKind(() => parsePassphraseSeparator('\t'), GenInputError, /must not include line breaks/);
    });

    test('string from custom characters: distinct code points in order, one below(size) per character', () => {
      assert.deepStrictEqual(parseCharset('ABCA 😀😀'), ['A', 'B', 'C', ' ', '😀']);
      const random = fakeRandom([4, 0, 'max']);
      assert.strictEqual(stringFromCharset(random, parseCharset('ABCA 😀'), 3, BUDGET), '😀A😀');
      assert.deepStrictEqual(random.counts, [5, 5, 5]);
      throwsKind(() => parseCharset(''), GenInputError, 'enter the characters to use, such as ABC123');
      throwsKind(() => parseCharset('a\nb'), GenInputError, /must not include line breaks/);
      const many = Array.from({ length: 101 }, (_, i) => String.fromCodePoint(0x4e00 + i)).join('');
      throwsKind(() => parseCharset(many), GenInputError, 'enter at most 100 different characters');
      assert.throws(() => stringFromCharset(fakeRandom(), ['a'], 11, 10), EncOutputTooLargeError);
    });

    test('shuffle words: Fisher–Yates with below(i + 1); spaces, indentation and line breaks stay in place', () => {
      const random = fakeRandom([1, 1, 0]);
      assert.strictEqual(shuffleLineWords(random, 'a b c d'), 'c a d b');
      assert.deepStrictEqual(random.counts, [4, 3, 2]);
      const kept = fakeRandom(['max', 'max', 'max']);
      assert.strictEqual(shuffleWords(kept, '  one\ttwo   three \r\nsolo\n\n x  y ', BUDGET), '  one\ttwo   three \r\nsolo\n\n x  y ');
      assert.deepStrictEqual(kept.counts, [3, 2, 2], 'a line of one word or none uses no random value');
      assert.strictEqual(shuffleWords(fakeRandom([0]), 'p　q', BUDGET), 'q　p');
      assert.deepStrictEqual(fisherYates(fakeRandom([0, 0, 0]), [1, 2, 3, 4]), [2, 3, 4, 1]);
      assert.throws(() => shuffleWords(fakeRandom(), 'a b', 2), EncOutputTooLargeError);
    });
  });
});
