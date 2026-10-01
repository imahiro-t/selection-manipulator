import * as assert from 'assert';
import { LineOutputTooLargeError, lineWiseWith } from '../../handler/lineTransforms';
import { graphemes } from '../../handler/uniCommon';
import {
  combineSelections,
  isSingleUnitGraphemeLine,
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
      assert.strictEqual(run('cut-chars', 'a👨\u200D👩\u200D👧bc', { range: [2, 3] }), '👨\u200D👩\u200D👧b');
      assert.strictEqual(run('cut-chars', 'éa', { range: [1, 1] }), 'é');
      // The ASCII fast path gives the same result as the grapheme walk.
      assert.strictEqual(run('cut-chars', 'ab\tcd⏎xyz', { range: [2, 4] }), 'b\tc\nyz');
      assert.strictEqual(run('cut-chars', 'abc', { range: [4, 9] }), '');
      assert.strictEqual(run('cut-chars', 'abcdé', { range: [4, 5] }), 'dé');
      // The fast path for BMP characters that are graphemes of their own (Japanese, Hangul syllables, Cyrillic).
      assert.strictEqual(run('cut-chars', 'あいうえお', { range: [3, 4] }), 'うえ');
      assert.strictEqual(run('cut-chars', '가각나', { range: [2, 3] }), '각나');
      assert.strictEqual(run('cut-chars', 'привет', { range: [2, 4] }), 'рив');
      // Lines that need the grapheme walk: halfwidth voiced marks, Thai SARA AM, characters outside the BMP.
      assert.strictEqual(run('cut-chars', 'ｶﾞｷﾞ', { range: [2, 2] }), 'ｷﾞ');
      assert.strictEqual(run('cut-chars', 'ก\u0E33x', { range: [1, 1] }), 'ก\u0E33');
      assert.strictEqual(run('cut-chars', 'a\u{20BB7}b', { range: [2, 2] }), '\u{20BB7}');
      assert.strictEqual(run('cut-chars', 'あ\u{20BB7}い', { range: [1, 2] }), 'あ\u{20BB7}');
      assert.strictEqual(run('cut-chars', 'x\u{1F600}y', { range: [2, 3] }), '\u{1F600}y');
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
      assert.strictEqual(run('number-nonblank', 'a⏎\uFEFF⏎b'), '1 a\n2 \uFEFF\n3 b');
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
      assert.strictEqual(run('fold-to-columns', 'e\u0301⏎b⏎c⏎d', { n: 2 }), t('e\u0301··c⏎b···d'));
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

  suite('LINEX-005 cut-chars: the single-code-unit fast path', () => {
    const hex = (code: number): string => `U+${code.toString(16).toUpperCase().padStart(4, '0')}`;
    const segmenter = new Intl.Segmenter(undefined, { granularity: 'grapheme' });
    const segmentCount = (text: string): number => {
      let count = 0;
      for (const _ of segmenter.segment(text)) {
        count++;
      }
      return count;
    };

    /** The implementation before the fast paths: every line walked grapheme by grapheme. */
    const referenceCutChars = (text: string, range: [number, number], eol: string): string =>
      lineWiseWith(text, { eol }, false, (lines) => lines.map((line) => {
        let kept = '';
        let position = 0;
        for (const grapheme of graphemes(line)) {
          position++;
          if (position > range[1]) {
            break;
          }
          if (position >= range[0]) {
            kept += grapheme;
          }
        }
        return kept;
      })) ?? text;

    test('every BMP character the fast path allows is a grapheme of its own next to anything allowed', function () {
      this.timeout(60_000);
      const isSyllable = (code: number): boolean => code >= 0xac00 && code <= 0xd7a3;
      const representatives = ['a', 'あ', '가', '각', '©', '\t'];
      const failures: string[] = [];
      let allowed = 0;
      for (let code = 0; code <= 0xffff; code++) {
        if (code >= 0xd800 && code <= 0xdfff) {
          continue;
        }
        const c = String.fromCharCode(code);
        if (!isSingleUnitGraphemeLine(c)) {
          continue;
        }
        allowed++;
        const check = (pair: string, kind: string, joinAllowed = false): void => {
          const count = segmentCount(pair);
          if (count !== 2 && !(joinAllowed && count === 1)) {
            failures.push(`${hex(code)} ${kind}: ${count} segments`);
          }
        };
        check('a' + c, "'a' + c");
        check(c + 'a', "c + 'a'");
        check(c + 'ᅡ', 'c + U+1161', isSyllable(code));
        check(c + 'ᆨ', 'c + U+11A8', isSyllable(code));
        for (const r of representatives) {
          check(r + c, `${hex(r.charCodeAt(0))} + c`);
          check(c + r, `c + ${hex(r.charCodeAt(0))}`);
        }
      }
      assert.deepStrictEqual(failures.slice(0, 20), [], `${failures.length} unexpected joins`);
      // Sanity: the fast path covers most of the BMP (CJK, Hangul syllables, Latin, Cyrillic, ...).
      assert.ok(allowed > 50_000, `${allowed} allowed characters`);
    });

    test('no character outside the BMP and no lone surrogate takes the fast path', function () {
      this.timeout(60_000);
      const leaks: string[] = [];
      for (let code = 0x10000; code <= 0x10ffff; code++) {
        const c = String.fromCodePoint(code);
        if (isSingleUnitGraphemeLine(c) || isSingleUnitGraphemeLine('a' + c + 'あ')) {
          leaks.push(hex(code));
        }
      }
      for (let code = 0xd800; code <= 0xdfff; code++) {
        const s = String.fromCharCode(code);
        if (isSingleUnitGraphemeLine(s) || isSingleUnitGraphemeLine('a' + s + 'あ')) {
          leaks.push(`lone ${hex(code)}`);
        }
      }
      if (isSingleUnitGraphemeLine('\uDC00\uD800')) {
        leaks.push('U+DC00 U+D800');
      }
      assert.deepStrictEqual(leaks.slice(0, 20), [], `${leaks.length} leaks`);
    });

    test('lines with astral characters, emoji sequences and tags take the grapheme walk and give its result', () => {
      const lines = [
        'a\u{20BB7}bc',
        '\u{1F1EF}\u{1F1F5}あい',
        'x\u{1F1EF}yz',
        '\u{1F44D}\u{1F3FB}ok',
        'a\u{1F468}\u200D\u{1F469}\u200D\u{1F467}b',
        '\u{1F3F4}\u{E0067}\u{E0062}\u{E0073}\u{E0063}\u{E0074}\u{E007F}flag',
      ];
      for (const line of lines) {
        assert.strictEqual(isSingleUnitGraphemeLine(line), false, line);
        for (const range of [[1, 1], [2, 2], [2, 3], [1, 10]] as [number, number][]) {
          assert.strictEqual(line2Transforms['cut-chars'](line, options({ range })), referenceCutChars(line, range, '\n'),
            `${line} ${range.join('-')}`);
        }
      }
      for (const line of ['あいう', '가각', '\t©', 'Ελληνικά', 'ｱｲｳ']) {
        assert.strictEqual(isSingleUnitGraphemeLine(line), true, line);
      }
    });

    test('pseudo-random lines give the same result as the grapheme walk', function () {
      this.timeout(60_000);
      const pieces = [
        'a', 'Z', '7', ' ', '\t', 'あ', '漢', 'カ', 'ー', '가', '한', 'ᄀ', 'ᅡ', 'ᆨ',
        'e\u0301', 'o\u0308\u0323\u0301\u0300', '\u0301', '\u{1F468}\u200D\u{1F469}\u200D\u{1F467}', '\u200D',
        '❤\uFE0F', '\uFE0F', '\u{1F44D}\u{1F3FB}', '\u{1F3FB}', '\u{20BB7}', '\u{1F600}', '\u{1F1EF}\u{1F1F5}',
        '\u{1F1EF}', '\uD800', '\uDC00', 'ｶﾞ', 'ﾟ', 'ก\u0E33', '\u0E33', '\u0600', '\u200C',
        '©', 'п', 'λ',
      ];
      const ranges: [number, number][] = [[1, 1], [2, 3], [3, 10], [1, 1_000_000], [40, 50]];
      let seed = 11;
      const next = (): number => {
        seed = (seed * 1103515245 + 12345) % 2147483648;
        return seed;
      };
      for (let round = 0; round < 400; round++) {
        const eol = round % 2 === 0 ? '\n' : '\r\n';
        const lineCount = 1 + (next() % 8);
        const lines: string[] = [];
        for (let i = 0; i < lineCount; i++) {
          let line = '';
          const length = next() % 12;
          for (let k = 0; k < length; k++) {
            line += pieces[next() % pieces.length];
          }
          lines.push(line);
        }
        const text = lines.join(eol) + (round % 5 === 0 ? eol : '');
        for (const range of ranges) {
          assert.strictEqual(line2Transforms['cut-chars'](text, options({ eol, range })),
            referenceCutChars(text, range, eol), `${JSON.stringify(text)} ${range.join('-')}`);
        }
      }
    });

    test('performance: 1,000,000 short Japanese lines in 2 seconds or less', function () {
      this.timeout(60_000);
      const words = ['あいう', '漢字か', 'カタナ', '日本語'];
      const text = Array.from({ length: 1_000_000 }, (_value, i) => words[i % words.length]).join('\n');
      assert.strictEqual(text.length, 3_999_999);
      const start = Date.now();
      const result = line2Transforms['cut-chars'](text, options({ range: [2, 3] }));
      const elapsed = Date.now() - start;
      assert.strictEqual(result.slice(0, 11), 'いう\n字か\nタナ\n本語');
      assert.ok(elapsed <= 2000, `took ${elapsed} ms (limit 2000 ms)`);
    });
  });

  test('no command throws LineInputTooLargeError: only LINEX-008 has an input limit (in the handler)', () => {
    const long = 'a\n'.repeat(1_000_000);
    assert.strictEqual(run('drop-first-n', long, { n: 1 }).length, long.length - 2);
  });
});
