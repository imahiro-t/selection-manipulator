import * as assert from 'assert';
import { EncOutputTooLargeError, MAX_OUTPUT_LENGTH } from '../../handler/encodeTransforms';
import {
  assertGenInputLength,
  assertGenTargetCount,
  cryptoRandom,
  findGenPromptProblem,
  GEN_MAX_INPUT_LENGTH,
  GEN_MAX_RANDOM_COUNT,
  GEN_MAX_TARGETS,
  GenInputError,
  GenOutputBuffer,
  isBlank,
  pickInclusive,
  quoteText,
  rangeTooWide,
  splitLines,
} from '../../handler/genCommon';
import { fakeRandom } from './genTestUtils';

const MAX = Number.MAX_SAFE_INTEGER;

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

suite('Generator Commands - common helpers (genCommon)', () => {
  suite('limits of the selections', () => {
    test('a selection of 1,000,000 characters is accepted, 1,000,001 is refused', () => {
      assertGenInputLength('a'.repeat(GEN_MAX_INPUT_LENGTH));
      throwsInput(() => assertGenInputLength('a'.repeat(GEN_MAX_INPUT_LENGTH + 1)), 'the selection is longer than 1,000,000 characters');
    });

    test('100,000 selections and cursors are accepted, 100,001 are refused', () => {
      assert.strictEqual(GEN_MAX_TARGETS, 100_000);
      assertGenTargetCount(GEN_MAX_TARGETS);
      throwsInput(() => assertGenTargetCount(GEN_MAX_TARGETS + 1), 'there are more than 100,000 selections and cursors');
    });

    test('blank text, line splitting and quoting', () => {
      assert.deepStrictEqual(['', ' \t\r\n', ' a '].map(isBlank), [true, true, false]);
      assert.deepStrictEqual(splitLines('a\r\nb\nc\rd'), ['a', 'b', 'c', 'd']);
      assert.strictEqual(quoteText('x'.repeat(100)), `"${'x'.repeat(60)}…"`);
    });
  });

  suite('output buffer', () => {
    test('stops as soon as the budget is exceeded', () => {
      const buffer = new GenOutputBuffer(5);
      buffer.push('abc');
      buffer.push('de');
      assert.strictEqual(buffer.join(), 'abcde');
      assert.throws(() => buffer.push('f'), (error: unknown) => error instanceof EncOutputTooLargeError && error.limit === MAX_OUTPUT_LENGTH);
      assert.strictEqual(buffer.length, 5);
    });
  });

  suite('prompt values', () => {
    const integer = { kind: 'integer', min: 1, max: 1_024 } as const;

    test('integers: both limits pass, one beyond fails, spaces are ignored', () => {
      assert.strictEqual(findGenPromptProblem('1', integer), undefined);
      assert.strictEqual(findGenPromptProblem(' 1024 ', integer), undefined);
      assert.strictEqual(findGenPromptProblem('0', integer), 'Enter an integer from 1 to 1,024.');
      assert.strictEqual(findGenPromptProblem('1025', integer), 'Enter an integer from 1 to 1,024.');
      for (const value of ['', '1.5', '1e3', 'abc', '0x10', '１']) {
        assert.strictEqual(findGenPromptProblem(value, integer), 'Enter an integer from 1 to 1,024.', value);
      }
    });

    test('a value longer than 100 characters is refused before it is read', () => {
      let called = false;
      const rule = { kind: 'parse', parse: () => { called = true; } } as const;
      assert.strictEqual(findGenPromptProblem(' '.repeat(100), rule), undefined);
      called = false;
      assert.strictEqual(findGenPromptProblem(' '.repeat(101), rule), 'The value is longer than 100 characters.');
      assert.strictEqual(called, false);
    });

    test('parse rules: the input error becomes a sentence; the earlier answers are passed on', () => {
      const seen: unknown[] = [];
      const rule = {
        kind: 'parse',
        parse: (value: string, previous: readonly string[]) => {
          seen.push([value, previous]);
          if (value !== 'ok') {
            throw new GenInputError('enter ok');
          }
        },
      } as const;
      assert.strictEqual(findGenPromptProblem('  ok ', rule, ['a']), undefined);
      assert.strictEqual(findGenPromptProblem('no', rule), 'Enter ok.');
      assert.deepStrictEqual(seen, [['ok', ['a']], ['no', []]]);
      // Anything but an input error is a bug and is not hidden.
      assert.throws(() => findGenPromptProblem('x', { kind: 'parse', parse: () => { throw new TypeError('bug'); } }), TypeError);
    });
  });

  suite('random values', () => {
    test('pickInclusive: one value, both ends, and ends at ±(2^53 − 1) without an exception', () => {
      assert.strictEqual(pickInclusive(fakeRandom(), 5, 5), 5);
      assert.strictEqual(pickInclusive(fakeRandom([0]), -3, 3), -3);
      assert.strictEqual(pickInclusive(fakeRandom(['max']), -3, 3), 3);
      const random = fakeRandom([0, 'max']);
      assert.strictEqual(pickInclusive(random, MAX - 1, MAX), MAX - 1);
      assert.strictEqual(pickInclusive(random, MAX - 1, MAX), MAX);
      assert.deepStrictEqual(random.counts, [2, 2]);
      assert.strictEqual(pickInclusive(fakeRandom([0]), -MAX, -MAX + 1), -MAX);
      assert.strictEqual(pickInclusive(fakeRandom(['max']), 0, GEN_MAX_RANDOM_COUNT - 1), GEN_MAX_RANDOM_COUNT - 1);
    });

    test('pickInclusive refuses what is a programming error (unsafe, reversed or too wide ranges)', () => {
      for (const [lo, hi] of [[0, MAX + 1], [-MAX - 1, 0], [0.5, 1], [2, 1], [0, GEN_MAX_RANDOM_COUNT], [-MAX, MAX], [NaN, 1]]) {
        assert.throws(() => pickInclusive(fakeRandom(), lo, hi), RangeError, `${lo}..${hi}`);
      }
    });

    test('rangeTooWide compares without computing hi − lo + 1', () => {
      assert.strictEqual(GEN_MAX_RANDOM_COUNT, 2 ** 48 - 1);
      assert.strictEqual(rangeTooWide(0, 2 ** 48 - 2), false);
      assert.strictEqual(rangeTooWide(0, 2 ** 48 - 1), true);
      assert.strictEqual(rangeTooWide(-MAX, MAX), true);
      assert.strictEqual(rangeTooWide(MAX - 2 ** 48 + 2, MAX), false);
    });

    test('crypto: below checks its argument (0, 2^48, fractions and unsafe integers are programming errors)', () => {
      for (const count of [0, -1, 2 ** 48, 1.5, MAX, NaN, Infinity]) {
        assert.throws(() => cryptoRandom.below(count), RangeError, String(count));
      }
      assert.strictEqual(cryptoRandom.below(1), 0);
      const big = cryptoRandom.below(GEN_MAX_RANDOM_COUNT);
      assert.ok(Number.isSafeInteger(big) && big >= 0 && big < GEN_MAX_RANDOM_COUNT);
      const seen = new Set<number>();
      for (let i = 0; i < 200; i++) {
        const value = cryptoRandom.below(3);
        assert.ok(value >= 0 && value < 3);
        seen.add(value);
      }
      assert.strictEqual(seen.size, 3);
    });

    test('crypto: bytes and uuid', () => {
      const bytes = cryptoRandom.bytes(32);
      assert.ok(bytes instanceof Uint8Array);
      assert.strictEqual(bytes.length, 32);
      assert.match(cryptoRandom.uuid(), /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
      assert.throws(() => cryptoRandom.bytes(-1), RangeError);
    });
  });
});
