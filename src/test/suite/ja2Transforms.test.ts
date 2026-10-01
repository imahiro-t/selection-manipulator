import * as assert from 'assert';
import { EncOutputTooLargeError } from '../../handler/encodeTransforms';
import { JaInputError, JaLimitError } from '../../handler/jaCommon';
import { composeDakuten } from '../../handler/jaConvert';
import {
  corporateNumberCheck,
  corporateNumberMessage,
  decomposeDakuten,
  gojuonRow,
  manOkuNotation,
  normalizeForSearch,
  parenReadingToRuby,
  VERTICAL_FORMS,
  verticalText,
} from '../../handler/ja2Convert';
import { JA2_COMMAND_ENTRIES } from '../../handler/ja2Transforms';

const BUDGET = 10_000_000;

const transformOf = (id: string) => {
  const entry = JA2_COMMAND_ENTRIES.find((candidate) => candidate.id === id);
  assert.ok(entry?.transform, id);
  return (text: string, choice?: string) => entry.transform!(text, { eol: '\n', choice }, BUDGET);
};

suite('Extended Japanese Conversions (JAUNIX-001..007) Test Suite', () => {
  suite('JAUNIX-001 vertical text', () => {
    test('each line is a column from the right; short columns are padded with ideographic spaces', () => {
      assert.strictEqual(verticalText('あい\nう', '\n', BUDGET), 'うあ\n　い');
      assert.strictEqual(verticalText('一二三\n四\n五六', '\r\n', BUDGET), '五四一\r\n六　二\r\n　　三');
      assert.strictEqual(verticalText('あ', '\n', BUDGET), 'あ');
    });

    test('a line break at the end makes no column; an empty line inside is an empty column', () => {
      assert.strictEqual(verticalText('あい\r\nう\r\n', '\n', BUDGET), 'うあ\n　い');
      assert.strictEqual(verticalText('あ\n\nい', '\n', BUDGET), 'い　あ');
    });

    test('the vertical presentation forms (fixed character by character)', () => {
      assert.deepStrictEqual([...VERTICAL_FORMS.entries()], [
        ['ー', '｜'], ['（', '︵'], ['）', '︶'], ['｛', '︷'], ['｝', '︸'], ['〔', '︹'], ['〕', '︺'],
        ['【', '︻'], ['】', '︼'], ['《', '︽'], ['》', '︾'], ['〈', '︿'], ['〉', '﹀'], ['「', '﹁'], ['」', '﹂'],
        ['『', '﹃'], ['』', '﹄'], ['［', '﹇'], ['］', '﹈'], ['、', '︑'], ['。', '︒'], ['…', '︙'], ['‥', '︰'],
        [' ', '　'],
      ]);
      const codes = [...VERTICAL_FORMS.values()].map((ch) => ch.codePointAt(0)!.toString(16).toUpperCase());
      assert.deepStrictEqual(codes, ['FF5C', 'FE35', 'FE36', 'FE37', 'FE38', 'FE39', 'FE3A', 'FE3B', 'FE3C', 'FE3D', 'FE3E',
        'FE3F', 'FE40', 'FE41', 'FE42', 'FE43', 'FE44', 'FE47', 'FE48', 'FE11', 'FE12', 'FE19', 'FE30', '3000']);
      assert.strictEqual(verticalText('「ラーメン」、\n食べた。', '\n', BUDGET), '食﹁\nべラ\nた｜\n︒メ\n　ン\n　﹂\n　︑');
    });

    test('graphemes stay whole (a base and its combining mark, emoji sequences)', () => {
      assert.strictEqual(verticalText('が👍🏽\nえ', '\n', BUDGET), 'えが\n　👍🏽');
    });

    test('more than 1,000 lines or 1,000 characters in a line is a limit error (a warning)', () => {
      assert.doesNotThrow(() => verticalText(Array.from({ length: 1000 }, () => 'あ').join('\n'), '\n', BUDGET));
      assert.throws(() => verticalText(Array.from({ length: 1001 }, () => 'あ').join('\n'), '\n', BUDGET),
        (error: unknown) => error instanceof JaLimitError && error.message === 'the selection has more than 1,000 lines');
      assert.doesNotThrow(() => verticalText('あ'.repeat(1000), '\n', BUDGET));
      assert.throws(() => verticalText(`あ\n${'い'.repeat(1001)}`, '\n', BUDGET),
        (error: unknown) => error instanceof JaLimitError && error.message === 'line 2 has more than 1,000 characters');
      assert.ok(new JaLimitError('x') instanceof JaInputError);
    });

    test('the length of the result is checked against the budget before it is built', () => {
      // 2 columns x 1,000 rows = 2,000 cells + 999 line breaks.
      const text = `${'あ'.repeat(1000)}\nい`;
      assert.strictEqual(verticalText(text, '\n', 2999).length, 2999);
      assert.throws(() => verticalText(text, '\n', 2998), EncOutputTooLargeError);
    });
  });

  suite('JAUNIX-002 gojuon row', () => {
    test('the row of the first kana (plain, voiced, semi-voiced, small, katakana, half-width)', () => {
      const cases: [string, string][] = [
        ['あさひ', 'あ'], ['いぬ', 'あ'], ['ゔぃ', 'あ'], ['ぁ', 'あ'], ['かき', 'か'], ['がっこう', 'か'], ['ゖ', 'か'],
        ['さとう', 'さ'], ['じしょ', 'さ'], ['たなか', 'た'], ['っ', 'た'], ['づ', 'た'], ['なまえ', 'な'], ['はる', 'は'],
        ['ばら', 'は'], ['ぱん', 'は'], ['まち', 'ま'], ['やま', 'や'], ['ゃ', 'や'], ['らくだ', 'ら'], ['わに', 'わ'],
        ['を', 'わ'], ['ん', 'わ'], ['ゎ', 'わ'],
        ['サトウ', 'さ'], ['ガイド', 'か'], ['ヴィ', 'あ'], ['ヷ', 'わ'], ['ヺ', 'わ'], ['ヵ', 'か'], ['ｻﾄｳ', 'さ'], ['ｶﾞｲﾄﾞ', 'か'],
        ['ﾊﾟﾝ', 'は'], ['ｬ', 'や'],
      ];
      for (const [value, row] of cases) {
        assert.strictEqual(gojuonRow(value), `${row}行\t${value}`, value);
      }
    });

    test('a line that does not start with kana is an error with the line number; blank lines and spaces stay', () => {
      assert.throws(() => gojuonRow('漢字'), (error: unknown) => error instanceof JaInputError && error.message === '"漢字" does not start with kana');
      assert.throws(() => gojuonRow('ー'), JaInputError);
      assert.throws(() => gojuonRow('ゝ'), JaInputError);
      const run = transformOf('JAUNIX-002');
      assert.strictEqual(run('  さとう \n\nいとう'), '  さ行\tさとう \n\nあ行\tいとう');
      assert.throws(() => run('さとう\nabc'), (error: unknown) => error instanceof JaInputError && error.message === 'line 2: "abc" does not start with kana');
    });
  });

  suite('JAUNIX-003 normalize for search', () => {
    test('NFKC, katakana to hiragana, lower case and long vowel marks in one step', () => {
      assert.strictEqual(normalizeForSearch('ｶﾞｲﾄﾞＡＢＣ'), 'がいどabc');
      assert.strictEqual(normalizeForSearch('ラ－メン コ‐ヒ―'), 'らーめん こーひー');
      assert.strictEqual(normalizeForSearch('すご〜〜い ｽｺﾞｰｲ'), 'すごーーい すごーい');
      assert.strictEqual(normalizeForSearch('Hello ＷＯＲＬＤ ①'), 'hello world 1');
    });

    test('dashes not after kana stay; ヵ ヶ become ゕ ゖ, ヷ..ヺ (no hiragana) are left', () => {
      assert.strictEqual(normalizeForSearch('03-1234 a—b'), '03-1234 a—b');
      assert.strictEqual(normalizeForSearch('ヵヶヷ'), 'ゕゖヷ');
      assert.strictEqual(normalizeForSearch('漢字-かな'), '漢字-かな');
    });

    test('an ASCII - or ~ right after kana becomes ー too (judged after NFKC, unlike JA-017)', () => {
      assert.strictEqual(normalizeForSearch('コード-A1'), 'こーどーa1');
      assert.strictEqual(normalizeForSearch('すご~い'), 'すごーい');
      assert.strictEqual(normalizeForSearch('コード－Ａ１'), normalizeForSearch('コード-A1'));
    });
  });

  suite('JAUNIX-004 man / oku notation', () => {
    test('units of 万 億 兆 京; zero groups are left out', () => {
      const cases: [string, string][] = [
        ['123456789', '1億2345万6789'], ['100010000', '1億1万'], ['0', '0'], ['000', '0'], ['9999', '9999'], ['10000', '1万'],
        ['-1,234,567,890,123', '-1兆2345億6789万123'], ['+５００００', '5万'], ['−20000', '-2万'],
        ['99999999999999999999', '9999京9999兆9999億9999万9999'], ['000100000000', '1億'],
      ];
      for (const [value, expected] of cases) {
        assert.strictEqual(manOkuNotation(value), expected, value);
      }
    });

    test('the sign and the comma may be full-width too', () => {
      const cases: [string, string][] = [
        ['－１２３', '-123'], ['＋５', '5'], ['１，２３４', '1234'], ['－１，２３４，５６７', '-123万4567'],
        ['12，345', '1万2345'], ['＋１０００００', '10万'],
      ];
      for (const [value, expected] of cases) {
        assert.strictEqual(manOkuNotation(value), expected, value);
      }
      for (const value of ['１，２３', '－－１', '１．５']) {
        assert.throws(() => manOkuNotation(value), JaInputError, value);
      }
    });

    test('too large and unreadable values are errors (the digits are counted first)', () => {
      assert.throws(() => manOkuNotation('100000000000000000000'), /is larger than 99999999999999999999/);
      assert.throws(() => manOkuNotation('9'.repeat(5000)), JaInputError);
      for (const value of ['1.5', '1,23', 'abc', '', '--1', '1e5']) {
        assert.throws(() => manOkuNotation(value), JaInputError, value);
      }
      assert.strictEqual(transformOf('JAUNIX-004')('1000\n\n 20000 '), '1000\n\n 2万 ');
    });
  });

  suite('JAUNIX-005 corporate number', () => {
    test('the check digit is verified; spaces and hyphens are ignored', () => {
      assert.deepStrictEqual(corporateNumberCheck('7000012050002'), { verdict: 'valid' });
      assert.deepStrictEqual(corporateNumberCheck(' 7-0000-1205-0002\n'), { verdict: 'valid' });
      assert.deepStrictEqual(corporateNumberCheck('8000012050002'), { verdict: 'invalid' });
      assert.deepStrictEqual(corporateNumberCheck('700001205000'), { verdict: 'not-a-corporate-number', reason: 'wrong-length' });
      assert.deepStrictEqual(corporateNumberCheck('7000O12050002'), { verdict: 'not-a-corporate-number', reason: 'invalid-character' });
    });

    test('full-width digits and full-width or Unicode hyphens are accepted', () => {
      assert.deepStrictEqual(corporateNumberCheck('７００００１２０５０００２'), { verdict: 'valid' });
      assert.deepStrictEqual(corporateNumberCheck('７000012050002'), { verdict: 'valid' });
      assert.deepStrictEqual(corporateNumberCheck('7－0000－1205－0002'), { verdict: 'valid' });
      assert.deepStrictEqual(corporateNumberCheck('７－００００－１２０５－０００２'), { verdict: 'valid' });
      assert.deepStrictEqual(corporateNumberCheck('7‐0000‑1205−0002'), { verdict: 'valid' });
      assert.deepStrictEqual(corporateNumberCheck('７　００００１２０５０００２'), { verdict: 'valid' });
      assert.deepStrictEqual(corporateNumberCheck('８００００１２０５０００２'), { verdict: 'invalid' });
      assert.deepStrictEqual(corporateNumberCheck('７００００１２０５０００'), { verdict: 'not-a-corporate-number', reason: 'wrong-length' });
      for (const value of ['７００００１２０５０００Ｏ', '7ー0000ー1205ー0002', '7_000012050002']) {
        assert.deepStrictEqual(corporateNumberCheck(value), { verdict: 'not-a-corporate-number', reason: 'invalid-character' }, value);
      }
      assert.strictEqual(corporateNumberMessage(['７００００１２０５０００２']), 'Corporate number: valid');
    });

    test('a check digit of 9 (remainder 0) and every first digit', () => {
      // 1000000000000: 12 zeros after the first digit give 9 - 0 = 9.
      assert.deepStrictEqual(corporateNumberCheck('9000000000000'), { verdict: 'valid' });
      for (let digit = 0; digit <= 9; digit++) {
        assert.strictEqual(corporateNumberCheck(`${digit}000012050002`).verdict, digit === 7 ? 'valid' : 'invalid', String(digit));
      }
    });

    test('the notification never contains the selected text', () => {
      assert.strictEqual(corporateNumberMessage(['7000012050002']), 'Corporate number: valid');
      assert.strictEqual(corporateNumberMessage(['12']), 'Corporate number: not a corporate number (it must have 13 digits)');
      assert.strictEqual(corporateNumberMessage(['abc']), 'Corporate number: not a corporate number (only digits, spaces and hyphens are allowed)');
      assert.strictEqual(corporateNumberMessage(['7000012050002', '8000012050002', 'x']),
        'Corporate number: #1 valid, #2 invalid, #3 not a corporate number');
      const many = Array.from({ length: 11 }, (_value, i) => (i < 5 ? '7000012050002' : i < 9 ? '8000012050002' : '1'));
      const message = corporateNumberMessage(many);
      assert.strictEqual(message, 'Corporate number: 11 selections: 5 valid, 4 invalid, 2 not a corporate number');
      assert.ok(!message.includes('7000012050002'));
    });
  });

  suite('JAUNIX-006 decompose dakuten', () => {
    test('spacing or combining marks; only kana with a mark are split', () => {
      assert.strictEqual(decomposeDakuten('がぱヴゞ', 'spacing'), 'か゛は゜ウ゛ゝ゛');
      assert.strictEqual(decomposeDakuten('ガパゔヷヺ', 'combining'), 'ガパゔヷヺ');
      assert.strictEqual(decomposeDakuten('かなｶﾞ漢字é', 'spacing'), 'かなｶﾞ漢字é');
    });

    test('Compose Dakuten gives the text back', () => {
      const text = 'がぎぐげござじずぜぞだぢづでどばびぶべぼぱぴぷぺぽゔガギグゲゴヴヷヸヹヺパピプペポ';
      assert.strictEqual(composeDakuten(decomposeDakuten(text, 'spacing')), text);
      assert.strictEqual(composeDakuten(decomposeDakuten(text, 'combining')), text);
      const run = transformOf('JAUNIX-006');
      assert.strictEqual(run('が', 'spacing'), 'か゛');
      assert.strictEqual(run('が', 'combining'), 'が');
    });
  });

  suite('JAUNIX-007 parenthesized reading to ruby', () => {
    test('a kana reading in parentheses after kanji becomes ruby notation', () => {
      assert.strictEqual(parenReadingToRuby('漢字（かんじ）'), '｜漢字《かんじ》');
      assert.strictEqual(parenReadingToRuby('この日本語(にほんご)と東京（トウキョウ）'), 'この｜日本語《にほんご》と｜東京《トウキョウ》');
      assert.strictEqual(parenReadingToRuby('𠮷野家（よしのや）'), '｜𠮷野家《よしのや》');
    });

    test('a ｜ (or |) already before the base is not doubled', () => {
      assert.strictEqual(parenReadingToRuby('｜漢字（かんじ）'), '｜漢字《かんじ》');
      assert.strictEqual(parenReadingToRuby('|漢字(かんじ)'), '|漢字《かんじ》');
      assert.strictEqual(parenReadingToRuby('この｜日本語（にほんご）と東京（とうきょう）'), 'この｜日本語《にほんご》と｜東京《とうきょう》');
      assert.strictEqual(parenReadingToRuby('｜漢字（かんじ）｜漢字（かんじ）'), '｜漢字《かんじ》｜漢字《かんじ》');
      assert.strictEqual(parenReadingToRuby('｜かな漢字（かんじ）'), '｜かな｜漢字《かんじ》');
    });

    test('other parentheses stay', () => {
      for (const text of ['かな（かな）', '東京（Tokyo）', '東京（）', '東京 （とうきょう）', '東京（とうきょう)', '漢字（かん字）']) {
        assert.strictEqual(parenReadingToRuby(text), text, text);
      }
      assert.strictEqual(parenReadingToRuby('東京（とう（きょう）'), '東京（とう（きょう）');
    });

    test('linear on long input', () => {
      const text = '漢字（かんじ）'.repeat(50_000) + '漢'.repeat(100_000) + '（' + 'か'.repeat(100_000);
      const result = parenReadingToRuby(text);
      assert.ok(result.startsWith('｜漢字《かんじ》｜漢字《かんじ》'));
    });
  });
});
