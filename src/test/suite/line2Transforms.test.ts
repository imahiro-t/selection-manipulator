import * as assert from 'assert';
import { LineOutputTooLargeError } from '../../handler/lineTransforms';
import {
  combineSelections,
  LINE2_ANCHORED_COMMANDS,
  LINE2_COMMAND_ENTRIES,
  Line2InputError,
  Line2Options,
  line2Transforms,
  splitAtMatches,
  validateCharRangeInput,
  validateColumnsInput,
  validateLineRangeInput,
  validateListLocaleInput,
} from '../../handler/line2Transforms';

/** `⏎` = line break, `·` = space, `→` = tab, `　` = U+3000 (as in the specification). */
const t = (value: string, eol = '\n'): string => value.replace(/⏎/g, eol).replace(/·/g, ' ').replace(/→/g, '\t');

const options = (extra: Partial<Line2Options> = {}): Line2Options => ({ eol: '\n', ...extra });

const run = (name: keyof typeof line2Transforms, input: string, extra: Partial<Line2Options> = {}): string =>
  line2Transforms[name](t(input), options(extra));

suite('LINE2 Line Transforms (LINEX-001..014) Test Suite', () => {

  test('the command table: LINEX-001..014 in order, all with "Line: " titles', () => {
    assert.deepStrictEqual(LINE2_COMMAND_ENTRIES.map((entry) => entry.id),
      Array.from({ length: 14 }, (_value, i) => `LINEX-${String(i + 1).padStart(3, '0')}`));
    assert.ok(LINE2_COMMAND_ENTRIES.every((entry) => entry.title.startsWith('Line: ') && entry.name === `line.${entry.command}`));
    assert.deepStrictEqual(LINE2_COMMAND_ENTRIES.filter((entry) => entry.inputs !== undefined).map((entry) => entry.id),
      ['LINEX-001', 'LINEX-002', 'LINEX-003', 'LINEX-004', 'LINEX-005', 'LINEX-006', 'LINEX-008', 'LINEX-009', 'LINEX-014']);
  });

  suite('input validation', () => {
    test('LINEX-001: N-M with 1 <= N <= M <= 1,000,000', () => {
      for (const valid of ['2-3', '1-1', '4-10', ' 1 - 1000000 ']) {
        assert.strictEqual(validateLineRangeInput(valid), undefined, valid);
      }
      for (const invalid of ['3-2', '0-2', '1-1000001', 'abc', '', '3', '-1-2', '1-2-3']) {
        assert.ok(validateLineRangeInput(invalid), invalid);
      }
    });

    test('LINEX-005: M-N or N', () => {
      for (const valid of ['3-5', '3', '1-1000000']) {
        assert.strictEqual(validateCharRangeInput(valid), undefined, valid);
      }
      for (const invalid of ['5-3', '0', '1-1000001', '', 'x']) {
        assert.ok(validateCharRangeInput(invalid), invalid);
      }
    });

    test('LINEX-014: N from 1 to 100', () => {
      assert.strictEqual(validateColumnsInput('1'), undefined);
      assert.strictEqual(validateColumnsInput('100'), undefined);
      for (const invalid of ['0', '101', '', '2.5', 'x']) {
        assert.ok(validateColumnsInput(invalid), invalid);
      }
    });

    test('LINEX-009: a supported locale; empty, malformed and too long values are errors (RangeError is caught)', () => {
      assert.strictEqual(validateListLocaleInput('en'), undefined);
      assert.strictEqual(validateListLocaleInput('ja'), undefined);
      assert.strictEqual(validateListLocaleInput(' fr-CA '), undefined);
      // Review carry-over 2: an emptied box is an error, not the default `en`.
      assert.strictEqual(validateListLocaleInput(''), 'Enter a locale such as en or ja');
      assert.strictEqual(validateListLocaleInput('   '), 'Enter a locale such as en or ja');
      assert.strictEqual(validateListLocaleInput('not a locale!'), 'Enter a valid locale such as en or ja');
      assert.ok(validateListLocaleInput('en-'.padEnd(65, 'x')));
    });
  });

  suite('LINEX-001..005', () => {
    test('LINEX-001 keep-range', () => {
      assert.strictEqual(run('keep-range', '1⏎2⏎3⏎4⏎5', { range: [2, 3] }), '2\n3');
      assert.strictEqual(run('keep-range', '1⏎2⏎3⏎4⏎5', { range: [1, 1] }), '1');
      assert.strictEqual(run('keep-range', '1⏎2⏎3⏎4⏎5', { range: [4, 10] }), '4\n5');
      assert.strictEqual(run('keep-range', '1⏎2⏎3⏎4⏎5', { range: [1, 5] }), '1\n2\n3\n4\n5');
      assert.strictEqual(run('keep-range', '1⏎2⏎3⏎4⏎5', { range: [7, 9] }), '');
      assert.strictEqual(run('keep-range', '1⏎2⏎3⏎', { range: [2, 2] }), '2\n');
      assert.throws(() => run('keep-range', 'a', { range: [3, 2] }), Line2InputError);
    });

    test('LINEX-002 / 003 drop-first-n / drop-last-n', () => {
      assert.strictEqual(run('drop-first-n', 'a⏎b⏎c', { n: 1 }), 'b\nc');
      assert.strictEqual(run('drop-last-n', 'a⏎b⏎c', { n: 1 }), 'a\nb');
      assert.strictEqual(run('drop-first-n', 'a⏎b⏎c', { n: 3 }), '');
      assert.strictEqual(run('drop-last-n', 'a⏎b⏎c', { n: 5 }), '');
      assert.strictEqual(line2Transforms['drop-first-n']('a\r\nb\r\nc\r\n', { eol: '\r\n', n: 1 }), 'b\r\nc\r\n');
      assert.throws(() => run('drop-first-n', 'a', { n: 0 }), Line2InputError);
    });

    test('LINEX-004 blank-every-n (not after the last line)', () => {
      assert.strictEqual(run('blank-every-n', '1⏎2⏎3⏎4⏎5⏎6', { n: 2 }), t('1⏎2⏎⏎3⏎4⏎⏎5⏎6'));
      assert.strictEqual(run('blank-every-n', '1⏎2⏎3⏎4⏎5', { n: 2 }), t('1⏎2⏎⏎3⏎4⏎⏎5'));
      assert.strictEqual(run('blank-every-n', '1⏎2', { n: 5 }), '1\n2');
      assert.strictEqual(run('blank-every-n', '1⏎2⏎3', { n: 1, maxAddedLength: 2 }), '1\n\n2\n\n3');
      assert.throws(() => run('blank-every-n', '1⏎2⏎3', { n: 1, maxAddedLength: 1 }), LineOutputTooLargeError);
    });

    test('LINEX-005 cut-chars (grapheme clusters)', () => {
      assert.strictEqual(run('cut-chars', 'abcdefgh', { range: [3, 5] }), 'cde');
      assert.strictEqual(run('cut-chars', 'abcdef⏎ab', { range: [3, 3] }), 'c\n');
      assert.strictEqual(run('cut-chars', 'a👨‍👩‍👧bc', { range: [2, 3] }), '👨‍👩‍👧b');
      assert.strictEqual(run('cut-chars', 'éa', { range: [1, 1] }), 'é');
      // The ASCII fast path gives the same result as the grapheme walk.
      assert.strictEqual(run('cut-chars', 'ab\tcd⏎xyz', { range: [2, 4] }), 'b\tc\nyz');
      assert.strictEqual(run('cut-chars', 'abc', { range: [4, 9] }), '');
      assert.strictEqual(run('cut-chars', 'abcdé', { range: [4, 5] }), 'dé');
    });
  });

  suite('LINEX-007, 008, 009', () => {
    test('LINEX-007 dedupe-keep-last', () => {
      assert.strictEqual(run('dedupe-keep-last', 'a⏎b⏎a'), 'b\na');
      assert.strictEqual(run('dedupe-keep-last', 'a⏎b⏎c⏎a⏎b'), 'c\na\nb');
    });

    test('LINEX-008 split-by-regex: the matches given by the worker become line breaks', () => {
      assert.strictEqual(splitAtMatches('a1b22c', options({ regexSplits: [[1, 2], [3, 5]] })), 'a\nb\nc');
      assert.strictEqual(splitAtMatches('abc', options({ regexSplits: [] })), 'abc');
      assert.strictEqual(splitAtMatches('a1b', { eol: '\r\n', regexSplits: [[1, 2]] }), 'a\r\nb');
      assert.throws(() => splitAtMatches('a1b1', { eol: '\r\n', regexSplits: [[1, 2], [3, 4]], maxAddedLength: 1 }), LineOutputTooLargeError);
      assert.throws(() => splitAtMatches('abc', options()), /missing/);
      assert.throws(() => splitAtMatches('abc', options({ regexSplits: [[2, 5]] })), /do not match/);
    });

    test('LINEX-009 join-natural-list (en / ja; blank lines left out)', () => {
      assert.strictEqual(run('join-natural-list', 'a⏎b⏎c', { locale: 'en' }), 'a, b, and c');
      assert.strictEqual(run('join-natural-list', 'a⏎b⏎c', { locale: 'ja' }), 'a、b、c');
      assert.strictEqual(run('join-natural-list', 'a⏎⏎b', { locale: 'en' }), 'a and b');
      assert.strictEqual(run('join-natural-list', 'a⏎··⏎b', { locale: 'en' }), 'a and b');
      assert.strictEqual(run('join-natural-list', 'a⏎　⏎b', { locale: 'en' }), 'a and b');
      assert.strictEqual(run('join-natural-list', 'a⏎b⏎', { locale: 'en' }), 'a and b\n');
      assert.strictEqual(run('join-natural-list', 'a', { locale: 'en' }), 'a');
      assert.throws(() => run('join-natural-list', 'a⏎b', { locale: 'not a locale!' }), Line2InputError);
      assert.throws(() => run('join-natural-list', 'a⏎b⏎c', { locale: 'en', maxAddedLength: 3 }), LineOutputTooLargeError);
    });
  });

  suite('LINEX-013 number-nonblank', () => {
    test('`number space line`, no colon, no padding (the example a⏎⏎b → 1 a⏎⏎2 b)', () => {
      assert.strictEqual(run('number-nonblank', 'a⏎⏎b'), t('1·a⏎⏎2·b'));
    });

    test('lines of spaces, tabs or full-width spaces are blank: no number, content kept, no number used (unlike nl -b t)', () => {
      assert.strictEqual(run('number-nonblank', 'a⏎··⏎b'), t('1·a⏎··⏎2·b'));
      assert.strictEqual(run('number-nonblank', 'a⏎→⏎b'), t('1·a⏎→⏎2·b'));
      assert.strictEqual(run('number-nonblank', 'a⏎　⏎b'), t('1·a⏎　⏎2·b'));
    });

    test('a line of only U+FEFF is not blank', () => {
      assert.strictEqual(run('number-nonblank', 'a⏎﻿⏎b'), '1 a\n2 ﻿\n3 b');
    });

    test('the numbers grow without zero padding', () => {
      const result = run('number-nonblank', 'a⏎b⏎c⏎d⏎e⏎f⏎g⏎h⏎i⏎j').split('\n');
      assert.strictEqual(result[8], '9 i');
      assert.strictEqual(result[9], '10 j');
      assert.strictEqual(result[0], '1 a');
    });

    test('the added length is counted before the result is built; the budget is shared by the handler', () => {
      // "1 " .. "4 " add 8 characters.
      assert.throws(() => run('number-nonblank', 'a⏎b⏎c⏎d', { maxAddedLength: 6 }), (error: unknown) =>
        error instanceof LineOutputTooLargeError && error.added === 8 && error.limit === 6);
      assert.strictEqual(run('number-nonblank', 'a⏎b⏎c⏎d', { maxAddedLength: 8 }), '1 a\n2 b\n3 c\n4 d');
    });
  });

  suite('LINEX-014 fold-to-columns', () => {
    test('the example and the alignment (two spaces between columns, no trailing spaces)', () => {
      assert.strictEqual(run('fold-to-columns', 'a⏎b⏎c⏎d', { n: 2 }), t('a··c⏎b··d'));
      assert.strictEqual(run('fold-to-columns', 'aaa⏎b⏎cc', { n: 2 }), t('aaa··cc⏎b'));
      assert.strictEqual(run('fold-to-columns', 'a⏎b⏎c', { n: 1 }), 'a\nb\nc');
      assert.strictEqual(run('fold-to-columns', 'a⏎b⏎c⏎d⏎e', { n: 2 }), t('a··d⏎b··e⏎c'));
      assert.strictEqual(run('fold-to-columns', 'a·⏎b⏎c', { n: 5 }), t('a···b··c'));
    });

    test('widths are code points: a full-width character and a surrogate pair are 1, a combining mark is 1 more', () => {
      assert.strictEqual(run('fold-to-columns', 'あ⏎b⏎c⏎d', { n: 2 }), t('あ··c⏎b··d'));
      assert.strictEqual(run('fold-to-columns', '👍⏎b⏎c⏎d', { n: 2 }), t('👍··c⏎b··d'));
      assert.strictEqual(run('fold-to-columns', 'é⏎b⏎c⏎d', { n: 2 }), t('é··c⏎b···d'));
    });

    test('a result over the budget is refused before it is built', () => {
      assert.throws(() => run('fold-to-columns', 'aaaaaaaaaa⏎b⏎c⏎d', { n: 2, maxAddedLength: 5 }), LineOutputTooLargeError);
    });
  });

  test('the anchored commands keep a partial first / last line (as head / tail)', () => {
    assert.deepStrictEqual(LINE2_ANCHORED_COMMANDS, ['keep-range', 'drop-first-n', 'drop-last-n', 'blank-every-n', 'dedupe-keep-last', 'number-nonblank']);
    assert.strictEqual(run('drop-first-n', 'x⏎a⏎b⏎y', { n: 1, precededByText: true, followedByText: true }), 'x\nb\ny');
    assert.strictEqual(run('number-nonblank', 'x⏎a⏎y', { precededByText: true, followedByText: true }), 'x\n1 a\ny');
    // The other commands treat a partial line as a line.
    assert.strictEqual(run('cut-chars', 'xy⏎ab', { range: [1, 1], precededByText: true }), 'x\na');
  });

  suite('several selections (LINEX-006, 010..012)', () => {
    const combine = (command: Parameters<typeof combineSelections>[0], texts: string[], extra: { delimiter?: string; maxAddedLength?: number } = {}) =>
      combineSelections(command, texts.map((text) => t(text)), { eol: '\n', ...extra });

    test('LINEX-006 paste-columns: an empty delimiter is a tab; short selections give empty strings', () => {
      assert.strictEqual(combine('paste-columns', ['a⏎b', '1⏎2']), 'a\t1\nb\t2');
      assert.strictEqual(combine('paste-columns', ['a⏎b', '1⏎2', 'x⏎y']), 'a\t1\tx\nb\t2\ty');
      assert.strictEqual(combine('paste-columns', ['a⏎b⏎c', '1'], { delimiter: ',' }), 'a,1\nb,\nc,');
      assert.throws(() => combine('paste-columns', ['a', 'b'], { delimiter: 'x'.repeat(101) }), Line2InputError);
      assert.throws(() => combine('paste-columns', ['aaaa', 'bbbb'], { delimiter: ',', maxAddedLength: 4 }), LineOutputTooLargeError);
      // Review round 1: more than about 120,000 selections used to overflow the stack (Math.max(...)).
      const many = combineSelections('paste-columns', Array.from({ length: 200_000 }, (_, i) => (i === 7 ? 'a\nb' : 'x')), { eol: '\n' });
      assert.strictEqual(many.split('\n').length, 2);
    });

    test('the trailing line break follows the first selection; no lines give an empty result', () => {
      assert.strictEqual(combine('paste-columns', ['a⏎b⏎', '1⏎2']), 'a\t1\nb\t2\n');
      assert.strictEqual(combine('paste-columns', ['a⏎b', '1⏎2⏎']), 'a\t1\nb\t2');
      assert.strictEqual(combine('subtract-selections', ['a⏎b⏎c⏎', 'b']), 'a\nc\n');
      assert.strictEqual(combine('intersect-selections', ['a⏎b⏎', 'c']), '');
      assert.strictEqual(combineSelections('paste-columns', ['a\r\nb\r\n', '1\r\n2'], { eol: '\r\n' }), 'a\t1\r\nb\t2\r\n');
    });

    test('LINEX-010..012: exact matches, each line once, in the order of the first', () => {
      assert.strictEqual(combine('intersect-selections', ['a⏎b⏎c', 'b⏎c⏎d']), 'b\nc');
      assert.strictEqual(combine('subtract-selections', ['a⏎b⏎c', 'b']), 'a\nc');
      assert.strictEqual(combine('symmetric-difference', ['a⏎b', 'b⏎c']), 'a\nc');
      assert.strictEqual(combine('intersect-selections', ['c⏎a⏎c⏎b', 'a⏎c⏎c']), 'c\na');
      assert.strictEqual(combine('symmetric-difference', ['b⏎a⏎x', 'x⏎d⏎c']), 'b\na\nd\nc');
      assert.strictEqual(combine('subtract-selections', ['a⏎A⏎a·', 'a']), t('A⏎a·'));
    });

    test('the number of selections is checked', () => {
      assert.throws(() => combine('paste-columns', ['a']), Line2InputError);
      assert.throws(() => combine('intersect-selections', ['a', 'b', 'c']), Line2InputError);
    });
  });

  test('no command throws LineInputTooLargeError: only LINEX-008 has an input limit (in the handler)', () => {
    const long = 'a\n'.repeat(1_000_000);
    assert.strictEqual(run('drop-first-n', long, { n: 1 }).length, long.length - 2);
  });
});
