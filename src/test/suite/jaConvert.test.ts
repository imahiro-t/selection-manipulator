import * as assert from 'assert';
import { TextDecoder } from 'util';
import {
  HIRAGANA_CLASS,
  isHiragana,
  isJaChar,
  isJaLetter,
  isJaPunct,
  isKanji,
  isKatakana,
  JA_CHAR_CLASS,
  JA_LETTER_CLASS,
  JA_MAX_INPUT_LENGTH,
  JaInputError,
  JaNoTargetError,
  KANJI_CLASS,
  KATAKANA_CLASS,
  mapJaChars,
  mapJaLines,
  tableConverter,
} from '../../handler/jaCommon';
import {
  charTypeCount,
  charTypeOf,
  circledNumberToParen,
  composeDakuten,
  extractKanji,
  extractKatakanaWords,
  findPlatformDependent,
  formatPostalCode,
  fullwidthAlnumToHalf,
  hiraganaToHalfwidthKatakana,
  ideographicSpaceToSpace,
  JA_CHAR_TYPES,
  JA_MAX_NUMERAL,
  kanaToRomaji,
  manuscriptCount,
  normalizeHyphens,
  normalizeWaveDash,
  prefectureCode,
  removeRuby,
  removeSpacesBetweenJapanese,
  rubyToHtml,
  spaceBetweenJaEn,
  kanjiToNumber,
  kyujitaiToShinjitai,
  numberToDaiji,
  numberToKanji,
  punctuationToComma,
  punctuationToTouten,
  romajiToHiragana,
  shinjitaiToKyujitai,
  smallKanaToNormal,
} from '../../handler/jaConvert';
import { isJisX0208OrX0201, JIS_X_0208_ALTERNATIVES, JIS_X_0208_CHARACTERS } from '../../handler/jaJisX0208';
import {
  CIRCLED_NUMBERS,
  HIRAGANA_TO_HALFWIDTH,
  KYUJITAI_TO_SHINJITAI,
  PREFECTURES,
  prefectureShortName,
  ROMAJI_MAX_LENGTH,
  ROMAJI_TO_HIRAGANA,
  SHINJITAI_NOT_CONVERTED,
  SHINJITAI_TO_KYUJITAI,
  SMALL_TO_NORMAL_KANA,
} from '../../handler/jaTables';
import { EncOutputTooLargeError } from '../../handler/encodeTransforms';

const throwsInput = (run: () => unknown, message: string | RegExp) =>
  assert.throws(run, (error: unknown) => {
    assert.ok(error instanceof JaInputError, String(error));
    if (typeof message === 'string') {
      assert.strictEqual(error.message, message);
    } else {
      assert.match(error.message, message);
    }
    return true;
  });

suite('Japanese Text - conversions (jaConvert / jaCommon / jaTables)', () => {

  suite('character classes (plan 2-1)', () => {
    test('ヵ ヶ are katakana and never kanji; ゕ ゖ are hiragana', () => {
      for (const ch of ['ヵ', 'ヶ']) {
        assert.strictEqual(isKanji(ch), false, ch);
        assert.strictEqual(isKatakana(ch), true, ch);
      }
      for (const ch of ['ゕ', 'ゖ']) {
        assert.strictEqual(isHiragana(ch), true, ch);
        assert.strictEqual(isKanji(ch), false, ch);
      }
    });

    test('the members of each class', () => {
      const cases: [string, 'kanji' | 'katakana' | 'hiragana' | 'punct' | 'none'][] = [
        ['東', 'kanji'], ['々', 'kanji'], ['〆', 'kanji'], ['〇', 'kanji'], ['𠮷', 'kanji'],
        ['カ', 'katakana'], ['ｶ', 'katakana'], ['ー', 'katakana'], ['ｰ', 'katakana'], ['ﾞ', 'katakana'], ['ﾟ', 'katakana'],
        ['ㇰ', 'katakana'], ['ヽ', 'katakana'], ['ヵ', 'katakana'], ['ヶ', 'katakana'],
        ['か', 'hiragana'], ['ゝ', 'hiragana'], ['ゕ', 'hiragana'],
        ['、', 'punct'], ['。', 'punct'], ['「', 'punct'], ['〜', 'punct'], ['・', 'punct'], ['！', 'punct'], ['～', 'punct'], ['｡', 'punct'], ['･', 'punct'],
        ['゛', 'none'], ['゙', 'none'], ['　', 'none'], ['Ａ', 'none'], ['０', 'none'], ['ａ', 'none'], ['A', 'none'], ['!', 'none'], ['é', 'none'],
      ];
      for (const [ch, expected] of cases) {
        const actual = isKanji(ch) ? 'kanji' : isKatakana(ch) ? 'katakana' : isHiragana(ch) ? 'hiragana' : isJaPunct(ch) ? 'punct' : 'none';
        assert.strictEqual(actual, expected, ch);
        assert.strictEqual(isJaLetter(ch), ['kanji', 'katakana', 'hiragana'].includes(expected), ch);
        assert.strictEqual(isJaChar(ch), expected !== 'none', ch);
      }
    });

    test('the classes do not overlap (every BMP code point and the Han planes sampled)', () => {
      const codes: number[] = [];
      for (let code = 0; code <= 0xFFFF; code++) {
        if (code < 0xD800 || code > 0xDFFF) {
          codes.push(code);
        }
      }
      for (let code = 0x20000; code <= 0x3134F; code += 97) {
        codes.push(code);
      }
      for (const code of codes) {
        const ch = String.fromCodePoint(code);
        const count = [isKanji(ch), isKatakana(ch), isHiragana(ch), isJaPunct(ch)].filter((value) => value).length;
        assert.ok(count <= 1, `U+${code.toString(16)}`);
      }
    });

    test('the class strings can be used inside [...] with the u flag', () => {
      for (const source of [KANJI_CLASS, KATAKANA_CLASS, HIRAGANA_CLASS, JA_LETTER_CLASS, JA_CHAR_CLASS]) {
        assert.doesNotThrow(() => new RegExp(`[${source}]+`, 'u'));
      }
      assert.deepStrictEqual('Vue3で開発、テスト。'.match(new RegExp(`[${JA_LETTER_CLASS}]+`, 'gu')), ['で開発', 'テスト']);
      assert.deepStrictEqual('日本 語、abc'.match(new RegExp(`[${JA_CHAR_CLASS}]+`, 'gu')), ['日本', '語、']);
    });
  });

  suite('line and character helpers', () => {
    test('mapJaLines keeps blank lines, spaces around values and CRLF; failures name the line', () => {
      assert.strictEqual(mapJaLines('  1\r\n\r\n\t22 ', 1000, (value) => `<${value}>`), '  <1>\r\n\r\n\t<22> ');
      throwsInput(() => mapJaLines('1\n2\nx', 1000, (value) => {
        if (value === 'x') {
          throw new JaInputError('bad');
        }
        return value;
      }), 'line 3: bad');
    });

    test('the budget and the input limit', () => {
      assert.throws(() => mapJaLines('12345', 4, (value) => value), EncOutputTooLargeError);
      assert.throws(() => mapJaChars('abc', 2, (ch) => ch), EncOutputTooLargeError);
      assert.strictEqual(mapJaChars('a𠮷b', 10, tableConverter(new Map([['𠮷', '吉']]))), 'a吉b');
      throwsInput(() => mapJaChars('a'.repeat(JA_MAX_INPUT_LENGTH + 1), Infinity, (ch) => ch), 'the selection is longer than 1,000,000 characters');
    });
  });

  suite('JA-001 / 028: kana to romaji', () => {
    test('Hepburn', () => {
      const cases: [string, string][] = [
        ['しんじゅく', 'shinjuku'], ['コーヒー', 'koohii'], ['んあ', "n'a"], ['きんよう', "kin'you"], ['さんぽ', 'sanpo'],
        ['まっち', 'matchi'], ['がっこう', 'gakkou'], ['あっ', 'axtsu'], ['ヵ', 'ka'], ['ヶ', 'ke'], ['ゕゖ', 'kake'],
        ['ｼﾝｼﾞｭｸ', 'shinjuku'], ['ｶﾞｯｺｳｰ', 'gakkouu'], ['ヴァイオリン', 'vaiorin'], ['ヷ', 'va'], ['ティー', 'tii'], ['ふぁいる', 'fairu'],
        ['ちゃ ぢゃ じゃ しゃ つ ふ を', 'cha ja ja sha tsu fu o'], ['ㇰ', 'ku'], ['ぁ', 'a'],
        ['東京タワーへ行く', '東京tawaahe行ku'], ['ゝヽ', 'ゝヽ'], ['ー', 'ー'], ['3ヶ月', '3ke月'], ['ABC', 'ABC'],
      ];
      for (const [input, expected] of cases) {
        assert.strictEqual(kanaToRomaji(input, 'hepburn'), expected, input);
      }
    });

    test('Kunrei', () => {
      const cases: [string, string][] = [
        ['しんじゅく', 'sinzyuku'], ['ちゃ ぢゃ じゃ しゃ つ ふ', 'tya zya zya sya tu hu'], ['まっち', 'matti'], ['あっ', 'axtu'],
        ['コーヒー', 'koohii'], ['んあ', "n'a"],
      ];
      for (const [input, expected] of cases) {
        assert.strictEqual(kanaToRomaji(input, 'kunrei'), expected, input);
      }
    });
  });

  suite('JA-002: romaji to hiragana', () => {
    test('the representative examples of the plan', () => {
      const cases: [string, string][] = [
        ['sushi', 'すし'], ['shinbun', 'しんぶん'], ['shimbun', 'しんぶん'], ['kampai', 'かんぱい'], ['konnichiwa', 'こんにちわ'],
        ['konnnichiha', 'こんにちは'], ["kon'ya", 'こんや'], ['konya', 'こにゃ'], ['gakkou', 'がっこう'], ['matcha', 'まっちゃ'],
        ['sinzyuku', 'しんじゅく'], ['xtu', 'っ'], ['SUSHI', 'すし'], ['hello', 'hello'], ['hello sushi', 'hello すし'],
        ['world', 'world'], ['abc123def', 'abc123def'], ['tōkyō', 'tōkyō'], ['tokyo', 'ときょ'], ['toukyou', 'とうきょう'],
      ];
      for (const [input, expected] of cases) {
        assert.strictEqual(romajiToHiragana(input), expected, input);
      }
    });

    test('other spellings, n at the end, words that are also romaji, text around the runs', () => {
      const cases: [string, string][] = [
        ['shi si chi ti tsu tu fu hu ji zi', 'し し ち ち つ つ ふ ふ じ じ'], ['sha sya ja zya jya cha tya', 'しゃ しゃ じゃ じゃ じゃ ちゃ ちゃ'],
        ['dya di du wo', 'ぢゃ ぢ づ を'], ['fa vi we', 'ふぁ ゔぃ うぇ'], ['xya xtsu xka', 'ゃ っ ゕ'], ['la ltu', 'la ltu'],
        ['hon', 'ほん'], ['honn', 'ほん'], ['sake', 'さけ'], ['tree', 'tree'], ['Sushi、Tempura!', 'すし、てんぷら!'],
        ["it's", "it's"], ['n', 'ん'],
      ];
      for (const [input, expected] of cases) {
        assert.strictEqual(romajiToHiragana(input), expected, input);
      }
    });

    test('the syllable table: lower case keys of at most ROMAJI_MAX_LENGTH letters, no l spellings', () => {
      for (const key of ROMAJI_TO_HIRAGANA.keys()) {
        assert.match(key, /^[a-z]+$/, key);
        assert.ok(key.length <= ROMAJI_MAX_LENGTH, key);
        assert.ok(!key.startsWith('l'), key);
      }
    });
  });

  suite('JA-003 / 004 / 005: numbers and kanji numerals', () => {
    test('number to kanji numeral', () => {
      const cases: [string, string][] = [
        ['1234', '千二百三十四'], ['10000', '一万'], ['0', '〇'], ['1,234', '千二百三十四'], ['１２３４', '千二百三十四'],
        ['10', '十'], ['11', '十一'], ['110', '百十'], ['1000', '千'], ['10000000', '千万'], ['100000001', '一億一'],
        ['350000000', '三億五千万'], ['007', '七'],
        [String(JA_MAX_NUMERAL), '九千九百九十九京九千九百九十九兆九千九百九十九億九千九百九十九万九千九百九十九'],
      ];
      for (const [input, expected] of cases) {
        assert.strictEqual(numberToKanji(input), expected, input);
      }
    });

    test('number to daiji: 壱 before 拾 / 百 / 千, 零 for 0', () => {
      const cases: [string, string][] = [
        ['123', '壱百弐拾参'], ['0', '零'], ['10', '壱拾'], ['1000', '壱千'], ['10000', '壱萬'], ['20300', '弐萬参百'],
      ];
      for (const [input, expected] of cases) {
        assert.strictEqual(numberToDaiji(input), expected, input);
      }
    });

    test('values that are not whole numbers from 0 to 10^20 - 1', () => {
      for (const input of ['-1', '1.5', '1,23', '12,3456', 'abc', '1 2', '１，０００']) {
        throwsInput(() => numberToKanji(input), /is not a whole number$/);
        throwsInput(() => numberToDaiji(input), /is not a whole number$/);
      }
      throwsInput(() => numberToKanji('100000000000000000000'), '"100000000000000000000" is larger than 99999999999999999999');
    });

    test('kanji numeral to number', () => {
      const cases: [string, string][] = [
        ['三億五千万', '350000000'], ['二〇二六', '2026'], ['3億5000万', '350000000'], ['千二百三十四', '1234'], ['〇', '0'],
        ['十', '10'], ['二十', '20'], ['一億', '100000000'], ['壱萬弐千参百拾', '12310'], ['壱弐参', '123'], ['参拾', '30'],
        ['一万', '10000'], ['千万', '10000000'], ['2026', '2026'], ['１２億', '1200000000'], ['百一', '101'],
        ['九千九百九十九京九千九百九十九兆九千九百九十九億九千九百九十九万九千九百九十九', String(JA_MAX_NUMERAL)],
      ];
      for (const [input, expected] of cases) {
        assert.strictEqual(kanjiToNumber(input), expected, input);
      }
    });

    test('units out of order and other text are errors', () => {
      for (const input of ['万万', '一万万', '十百', '二十三百', '20百', '千万億', '万', 'abc', '三億円', '〇十', '1億23456']) {
        throwsInput(() => kanjiToNumber(input), /is not a kanji numeral$/);
      }
      throwsInput(() => kanjiToNumber('1'.repeat(21)), /is larger than 99999999999999999999$/);
    });

    test('the conversions are inverse of each other', () => {
      for (const n of ['0', '1', '10', '101', '1010', '10001', '123456789', '100000000000000000', String(JA_MAX_NUMERAL)]) {
        assert.strictEqual(kanjiToNumber(numberToKanji(n)), n, n);
        assert.strictEqual(kanjiToNumber(numberToDaiji(n)), n, n);
      }
    });
  });

  suite('JA-006 / 007: punctuation', () => {
    test('both ways, other characters kept', () => {
      assert.strictEqual(punctuationToComma('今日は、晴れ。a,b.'), '今日は，晴れ．a,b.');
      assert.strictEqual(punctuationToTouten('今日は，晴れ．a,b.'), '今日は、晴れ。a,b.');
    });
  });

  suite('JA-008 / 009: kyujitai and shinjitai', () => {
    test('the examples and the excluded new forms', () => {
      assert.strictEqual(kyujitaiToShinjitai('國學'), '国学');
      assert.strictEqual(shinjitaiToKyujitai('国学'), '國學');
      assert.strictEqual(kyujitaiToShinjitai('辨瓣辯藝缺豫餘臺絲罐蟲'), '弁弁弁芸欠予余台糸缶虫');
      assert.strictEqual(shinjitaiToKyujitai('弁芸欠予余台糸缶虫'), '弁芸欠予余台糸缶虫');
      assert.strictEqual(kyujitaiToShinjitai('海社'), '海社');
      assert.strictEqual(shinjitaiToKyujitai('海社'), '海社');
      assert.strictEqual(kyujitaiToShinjitai('髙橋 𠮷野家'), '髙橋 𠮷野家');
    });

    test('the tables: single ideographs, one old form per new form in JA-009, the round trip', () => {
      for (const [kyu, shin] of KYUJITAI_TO_SHINJITAI) {
        assert.strictEqual([...kyu].length, 1, kyu);
        assert.strictEqual([...shin].length, 1, shin);
        assert.ok(isKanji(kyu) && isKanji(shin), kyu);
        assert.notStrictEqual(kyu, shin);
      }
      assert.ok(KYUJITAI_TO_SHINJITAI.size >= 350, String(KYUJITAI_TO_SHINJITAI.size));
      for (const [shin, kyu] of SHINJITAI_TO_KYUJITAI) {
        assert.ok(!SHINJITAI_NOT_CONVERTED.has(shin), shin);
        assert.strictEqual(KYUJITAI_TO_SHINJITAI.get(kyu), shin, kyu);
        // An old form that normalization would change is never produced.
        assert.strictEqual(kyu.normalize('NFC'), kyu, kyu);
        assert.ok(!KYUJITAI_TO_SHINJITAI.has(shin), `${shin} is also an old form`);
      }
      const shinjitai = [...SHINJITAI_TO_KYUJITAI.keys()].join('');
      assert.strictEqual(kyujitaiToShinjitai(shinjitaiToKyujitai(shinjitai)), shinjitai);
    });
  });

  suite('JA-010: small kana', () => {
    test('hiragana, katakana, ㇰ..ㇿ and half-width; ヶ is a small kana', () => {
      assert.strictEqual(smallKanaToNormal('きゃっと'), 'きやつと');
      assert.strictEqual(smallKanaToNormal('ぁぃぅぇぉっゃゅょゎゕゖ'), 'あいうえおつやゆよわかけ');
      assert.strictEqual(smallKanaToNormal('ァィゥェォッャュョヮヵヶ'), 'アイウエオツヤユヨワカケ');
      assert.strictEqual(smallKanaToNormal('ㇰㇱㇲㇳㇴㇵㇶㇷㇸㇹㇺㇻㇼㇽㇾㇿ'), 'クシストヌハヒフヘホムラリルレロ');
      assert.strictEqual(smallKanaToNormal('ｧｨｩｪｫｬｭｮｯ'), 'ｱｲｳｴｵﾔﾕﾖﾂ');
      assert.strictEqual(smallKanaToNormal('3ヶ月 きやつと abc'), '3ケ月 きやつと abc');
      for (const [small, normal] of SMALL_TO_NORMAL_KANA) {
        assert.ok(isHiragana(small) || isKatakana(small), small);
        assert.ok(isHiragana(normal) || isKatakana(normal), normal);
      }
    });
  });

  suite('JA-011: manuscript paper count', () => {
    test('line breaks are not counted, spaces are; sheets rounded half up to one decimal place', () => {
      assert.strictEqual(manuscriptCount(['あ'.repeat(1234)]), '1,234 字 / 原稿用紙 3.1 枚');
      assert.strictEqual(manuscriptCount(['あい\r\nう　え \nお']), '7 字 / 原稿用紙 0.0 枚');
      assert.strictEqual(manuscriptCount(['あ'.repeat(19)]), '19 字 / 原稿用紙 0.0 枚');
      assert.strictEqual(manuscriptCount(['あ'.repeat(20)]), '20 字 / 原稿用紙 0.1 枚');
      assert.strictEqual(manuscriptCount(['あ'.repeat(400)]), '400 字 / 原稿用紙 1.0 枚');
      assert.strictEqual(manuscriptCount(['あ'.repeat(3980)]), '3,980 字 / 原稿用紙 10.0 枚');
      assert.strictEqual(manuscriptCount(['𠮷野', '家']), '3 字 / 原稿用紙 0.0 枚');
      assert.throws(() => manuscriptCount(['\n\r\n']), JaNoTargetError);
    });
  });

  suite('JA-012 / 013: ruby', () => {
    test('remove ruby: the three forms, other text kept', () => {
      assert.strictEqual(removeRuby('｜東京《とうきょう》'), '東京');
      assert.strictEqual(removeRuby('|東京《とうきょう》タワー'), '東京タワー');
      assert.strictEqual(removeRuby('私は漢字《かんじ》を書く'), '私は漢字を書く');
      assert.strictEqual(removeRuby('東京（とうきょう）と大阪(おおさか)'), '東京と大阪');
      assert.strictEqual(removeRuby('会社（カイシャ）'), '会社');
      assert.strictEqual(removeRuby('｜ＡＢＣ《えーびーしー》'), 'ＡＢＣ');
      // Not ruby: no matching 《》, 《》 after a kana, parentheses with other text or after a kana.
      for (const text of ['｜東京', '｜東京《とう', '東京《》', 'かな《かな》', '東京（Tokyo）', 'かな（かな）', '東京（2024年）', '｜《ルビ》']) {
        assert.strictEqual(removeRuby(text), text, text);
      }
      // A ｜ whose base would cross a line break is kept; the kanji before 《 are then the base.
      assert.strictEqual(removeRuby('｜東\n京《とう》'), '｜東\n京');
    });

    test('ruby to HTML: escaped base and ruby, other text kept', () => {
      assert.strictEqual(rubyToHtml('｜東京《とうきょう》'), '<ruby>東京<rt>とうきょう</rt></ruby>');
      assert.strictEqual(rubyToHtml('これは漢字《かんじ》です'), 'これは<ruby>漢字<rt>かんじ</rt></ruby>です');
      assert.strictEqual(rubyToHtml('｜<b>《"&\'》'), '<ruby>&lt;b&gt;<rt>&quot;&amp;&#39;</rt></ruby>');
      assert.strictEqual(rubyToHtml('a<b>｜東京'), 'a<b>｜東京');
      assert.strictEqual(rubyToHtml('東京（とうきょう）'), '東京（とうきょう）');
      assert.strictEqual(rubyToHtml('𠮷野《よしの》'), '<ruby>𠮷野<rt>よしの</rt></ruby>');
    });

    test('long input without ruby is linear', () => {
      const text = `${'｜'.repeat(100_000)}${'漢'.repeat(100_000)}${'《'.repeat(100_000)}`;
      assert.strictEqual(rubyToHtml(text), text);
      assert.strictEqual(removeRuby(text), text);
    });
  });

  suite('JA-014 .. 017: width, spaces, wave dashes, hyphens', () => {
    test('full-width alphanumerics and symbols only', () => {
      assert.strictEqual(fullwidthAlnumToHalf('ＡＢＣ１２３カナ'), 'ABC123カナ');
      assert.strictEqual(fullwidthAlnumToHalf('！～＠　。「」ｶﾅ'), '!~@　。「」ｶﾅ');
    });

    test('ideographic space', () => {
      assert.strictEqual(ideographicSpaceToSpace('東京　大阪\t 京都'), '東京 大阪\t 京都');
    });

    test('wave dash: both ways; an unknown choice is an error', () => {
      assert.strictEqual(normalizeWaveDash('1〜3、4～5', '〜'), '1〜3、4〜5');
      assert.strictEqual(normalizeWaveDash('1〜3、4～5', '～'), '1～3、4～5');
      assert.strictEqual(normalizeWaveDash('a~b', '〜'), 'a~b');
      throwsInput(() => normalizeWaveDash('1〜3', '~'), /choose/);
      throwsInput(() => normalizeWaveDash('1〜3', undefined), /choose/);
    });

    test('hyphens after kana, long vowel marks between digits', () => {
      assert.strictEqual(normalizeHyphens('コ−ヒ− 03ー1234'), 'コーヒー 03-1234');
      assert.strictEqual(normalizeHyphens('すご‐‐い'), 'すごーーい');
      assert.strictEqual(normalizeHyphens('ｺ−ﾋ―'), 'ｺｰﾋｰ');
      assert.strictEqual(normalizeHyphens('０３ー１２３４ ０３ｰ1 1－2'), '０３-１２３４ ０３-1 1-2');
      // Kept: the ASCII hyphen, hyphens after other characters, long vowel marks not between digits.
      assert.strictEqual(normalizeHyphens('テスト-1 漢字−A 03ー ーー'), 'テスト-1 漢字−A 03ー ーー');
    });
  });

  suite('JA-018 / 019 / 020: character types', () => {
    test('extract kanji: lines kept, lines without kanji dropped', () => {
      assert.strictEqual(extractKanji('東京タワーへ行く'), '東京行');
      assert.strictEqual(extractKanji('東京\r\nabc\n大阪へ\n'), '東京\r\n大阪');
      assert.strictEqual(extractKanji('3ヶ月'), '月');
      assert.strictEqual(extractKanji('々〆〇𠮷'), '々〆〇𠮷');
      assert.strictEqual(extractKanji('かな'), '');
    });

    test('extract katakana words', () => {
      assert.strictEqual(extractKatakanaWords('東京タワーとスカイツリー', '\n'), 'タワー\nスカイツリー');
      assert.strictEqual(extractKatakanaWords('ジョン・スミスとジョン', '\r\n'), 'ジョン・スミス\r\nジョン');
      assert.strictEqual(extractKatakanaWords('3ヶ月、霞ヶ関', '\n'), '');
      assert.strictEqual(extractKatakanaWords('すごーいカ・ ﾃｽﾄ ・ア', '\n'), 'カ\nﾃｽﾄ\nア');
      assert.strictEqual(extractKatakanaWords('ヶケ', '\n'), 'ヶケ');
    });

    test('count by character type: the classification of the plan', () => {
      const types = (text: string) => [...text].map((ch) => JA_CHAR_TYPES[charTypeOf(ch)] ?? '-').join(',');
      assert.strictEqual(types('々〆〇'), '漢字,漢字,漢字');
      assert.strictEqual(types('ヶーｰ'), 'カタカナ,カタカナ,カタカナ');
      assert.strictEqual(types('ゕゝ'), 'ひらがな,ひらがな');
      assert.strictEqual(types('aZ9Ａｚ０'), '英数字,英数字,英数字,英数字,英数字,英数字');
      assert.strictEqual(types('、・〜！゛-@😀'), '記号,記号,記号,記号,記号,記号,記号,記号');
      assert.strictEqual(types('é①゙α한'), 'その他,その他,その他,その他,その他');
      assert.strictEqual(types(' \t\n　'), '-,-,-,-');
      assert.strictEqual(charTypeCount(['東京タワーへgo']), '漢字 2 / カタカナ 3 / ひらがな 1 / 英数字 2');
      assert.strictEqual(charTypeCount(['①é!']), '記号 1 / その他 2');
      assert.strictEqual(charTypeCount(['!', 'a', 'あ']), 'ひらがな 1 / 英数字 1 / 記号 1');
      assert.strictEqual(charTypeCount(['あ'.repeat(1234)]), 'ひらがな 1,234');
      assert.throws(() => charTypeCount(['　']), JaNoTargetError);
    });
  });

  suite('JA-021 / 022 / 023: circled numbers, prefectures, postal codes', () => {
    test('circled numbers', () => {
      assert.strictEqual(circledNumberToParen('①②'), '(1)(2)');
      assert.strictEqual(circledNumberToParen('⓪ ⑳㉑㊿ ⑴⒇ ❶'), '(0) (20)(21)(50) (1)(20) ❶');
    });

    test('prefectures: names to codes and codes to names', () => {
      assert.strictEqual(prefectureCode('東京都'), '13');
      assert.strictEqual(prefectureCode('東京'), '13');
      assert.strictEqual(prefectureCode('北海道'), '01');
      assert.strictEqual(prefectureCode('京都'), '26');
      assert.strictEqual(prefectureCode('沖縄県'), '47');
      assert.strictEqual(prefectureCode('13'), '東京都');
      assert.strictEqual(prefectureCode('1'), '北海道');
      assert.strictEqual(prefectureCode('01'), '北海道');
      assert.strictEqual(prefectureCode('４７'), '沖縄県');
      throwsInput(() => prefectureCode('0'), '"0" is not a prefecture code (01-47)');
      throwsInput(() => prefectureCode('48'), '"48" is not a prefecture code (01-47)');
      throwsInput(() => prefectureCode('東京府'), '"東京府" is not a prefecture name or code');
      throwsInput(() => prefectureCode('013'), '"013" is not a prefecture name or code');
      assert.strictEqual(mapJaLines('東京都\n\n 27 ', 1000, prefectureCode), '13\n\n 大阪府 ');
    });

    test('postal codes', () => {
      assert.strictEqual(formatPostalCode('1000001'), '〒100-0001');
      assert.strictEqual(formatPostalCode('100-0001'), '〒100-0001');
      assert.strictEqual(formatPostalCode('〒100-0001'), '〒100-0001');
      assert.strictEqual(formatPostalCode('〒 １００－０００１'), '〒100-0001');
      for (const value of ['100001', '10000011', '10-00001', '100--0001', 'abc1234', '〒〒1000001']) {
        throwsInput(() => formatPostalCode(value), `${JSON.stringify(value)} is not a 7-digit postal code`);
      }
    });
  });

  suite('JA-024 .. 027: kana and spacing', () => {
    test('hiragana to half-width katakana: only hiragana and the ー after it', () => {
      assert.strictEqual(hiraganaToHalfwidthKatakana('がっこう'), 'ｶﾞｯｺｳ');
      assert.strictEqual(hiraganaToHalfwidthKatakana('すごーーい'), 'ｽｺﾞｰｰｲ');
      assert.strictEqual(hiraganaToHalfwidthKatakana('がっこう。カタカナー'), 'ｶﾞｯｺｳ。カタカナー');
      assert.strictEqual(hiraganaToHalfwidthKatakana('ゐゎゑ ぱゔ「あ」ヵ ー'), 'ゐゎゑ ﾊﾟｳﾞ「ｱ」ヵ ー');
    });

    test('remove spaces between Japanese characters', () => {
      assert.strictEqual(removeSpacesBetweenJapanese('日本 語 の hello world'), '日本語の hello world');
      assert.strictEqual(removeSpacesBetweenJapanese('東京　\t 大阪 、 京都'), '東京大阪、京都');
      assert.strictEqual(removeSpacesBetweenJapanese('ＡＢＣ　ＤＥＦ 東京\n大阪 a'), 'ＡＢＣ　ＤＥＦ 東京\n大阪 a');
    });

    test('space between Japanese and alphanumerics', () => {
      assert.strictEqual(spaceBetweenJaEn('Vue3で開発'), 'Vue3 で開発');
      assert.strictEqual(spaceBetweenJaEn('第1章はAPIとSDKの話'), '第 1 章は API と SDK の話');
      assert.strictEqual(spaceBetweenJaEn('Vue3 で開発、「React」。ＡＢＣで'), 'Vue3 で開発、「React」。ＡＢＣで');
      assert.strictEqual(spaceBetweenJaEn(spaceBetweenJaEn('a漢b')), 'a 漢 b');
    });

    test('compose dakuten', () => {
      assert.strictEqual(composeDakuten('か゛は゜'), 'がぱ');
      assert.strictEqual(composeDakuten('ウ゛がパゝ゛'), 'ヴがパゞ');
      // Kept: pairs that do not compose, marks after other characters, half-width kana.
      assert.strictEqual(composeDakuten('あ゛が゛ー゛a゛ｶ゛゛'), 'あ゛が゛ー゛a゛ｶ゛゛');
      assert.strictEqual(composeDakuten('か゛゛'), 'が゛');
      assert.strictEqual(composeDakuten('é'), 'é');
    });
  });

  suite('JA-029: platform-dependent characters', () => {
    test('characters outside JIS X 0208 / 0201, surrogate pairs whole, line breaks and tabs never', () => {
      const texts = (text: string) => findPlatformDependent(text).map(({ start, end }) => text.slice(start, end));
      assert.deepStrictEqual(texts('①髙橋'), ['①', '髙']);
      assert.deepStrictEqual(texts('𠮷野家\r\n\tＡ～〜㈱'), ['𠮷', '㈱']);
      assert.deepStrictEqual(findPlatformDependent('a𠮷①'), [{ start: 1, end: 3 }, { start: 3, end: 4 }]);
      assert.deepStrictEqual(texts('東京 ｱｲｳ abc'), []);
      assert.strictEqual(findPlatformDependent('①'.repeat(100), 10).length, 11);
    });
  });

  suite('tables for the other commands', () => {
    test('JIS X 0208: the constant equals rows 1..84 (without row 13) decoded with TextDecoder("shift_jis")', () => {
      let decoder: TextDecoder;
      try {
        decoder = new TextDecoder('shift_jis');
      } catch (error) {
        assert.fail(`TextDecoder does not support shift_jis in this environment (${String(error)}); the JIS X 0208 constant cannot be checked`);
      }
      const decoded = new Set<string>();
      for (let row = 1; row <= 84; row++) {
        if (row === 13) {
          continue;
        }
        for (let cell = 1; cell <= 94; cell++) {
          const lead = row <= 62 ? 0x81 + ((row - 1) >> 1) : 0xE0 + ((row - 63) >> 1);
          const trail = row % 2 === 1 ? (cell <= 63 ? 0x3F + cell : 0x40 + cell) : 0x9E + cell;
          const ch = decoder.decode(new Uint8Array([lead, trail]));
          // An unassigned cell decodes to U+FFFD (followed by the trail byte when it is ASCII).
          if (!ch.includes('\uFFFD')) {
            decoded.add(ch);
          }
        }
      }
      const constant = [...JIS_X_0208_CHARACTERS];
      assert.strictEqual(constant.length, 6879);
      assert.strictEqual(new Set(constant).size, constant.length);
      assert.deepStrictEqual([...decoded].sort(), constant.slice().sort());
    });

    test('JIS X 0208 / 0201: what counts as not platform-dependent', () => {
      const code = (ch: string) => ch.codePointAt(0)!;
      for (const ch of ['a', '~', '\\', '¥', '‾', 'ｱ', 'ﾟ', '｡', '東', '橋', 'あ', 'ヶ', '〜', '～', '‖', '∥', '−', '－', '—', '―', '¢', '￠', '£', '¬', '　']) {
        assert.strictEqual(isJisX0208OrX0201(code(ch)), true, ch);
      }
      for (const ch of ['①', '髙', '𠮷', 'Ⅰ', '㈱', '㌔', 'é', '한', '😀', '゙', 'ヷ']) {
        assert.strictEqual(isJisX0208OrX0201(code(ch)), false, ch);
      }
      assert.strictEqual([...JIS_X_0208_ALTERNATIVES].length, 7);
    });

    test('prefectures: 47 in JIS order, short names', () => {
      assert.strictEqual(PREFECTURES.length, 47);
      assert.strictEqual(new Set(PREFECTURES).size, 47);
      assert.strictEqual(PREFECTURES[12], '東京都');
      assert.strictEqual(PREFECTURES[0], '北海道');
      assert.strictEqual(PREFECTURES[46], '沖縄県');
      assert.strictEqual(prefectureShortName('東京都'), '東京');
      assert.strictEqual(prefectureShortName('京都府'), '京都');
      assert.strictEqual(prefectureShortName('北海道'), '北海道');
      assert.strictEqual(new Set(PREFECTURES.map(prefectureShortName)).size, 47);
    });

    test('circled numbers', () => {
      assert.strictEqual(CIRCLED_NUMBERS.get('⓪'), 0);
      assert.strictEqual(CIRCLED_NUMBERS.get('①'), 1);
      assert.strictEqual(CIRCLED_NUMBERS.get('⑳'), 20);
      assert.strictEqual(CIRCLED_NUMBERS.get('㉑'), 21);
      assert.strictEqual(CIRCLED_NUMBERS.get('㉟'), 35);
      assert.strictEqual(CIRCLED_NUMBERS.get('㊱'), 36);
      assert.strictEqual(CIRCLED_NUMBERS.get('㊿'), 50);
      assert.strictEqual(CIRCLED_NUMBERS.get('⑴'), 1);
      assert.strictEqual(CIRCLED_NUMBERS.get('⒇'), 20);
      assert.strictEqual(CIRCLED_NUMBERS.size, 71);
    });

    test('hiragana to half-width katakana: only hiragana keys, voiced kana as two characters', () => {
      assert.strictEqual([...'がっこう'].map((ch) => HIRAGANA_TO_HALFWIDTH.get(ch)).join(''), 'ｶﾞｯｺｳ');
      assert.strictEqual(HIRAGANA_TO_HALFWIDTH.get('ぱ'), 'ﾊﾟ');
      assert.strictEqual(HIRAGANA_TO_HALFWIDTH.get('ゔ'), 'ｳﾞ');
      assert.strictEqual(HIRAGANA_TO_HALFWIDTH.get('ゕ'), 'ｶ');
      for (const ch of ['ゎ', 'ゐ', 'ゑ', 'ア', '。', 'ー']) {
        assert.strictEqual(HIRAGANA_TO_HALFWIDTH.has(ch), false, ch);
      }
      for (const [key, value] of HIRAGANA_TO_HALFWIDTH) {
        assert.ok(isHiragana(key), key);
        assert.strictEqual(value.normalize('NFKC'), String.fromCodePoint(key.codePointAt(0)! + 0x60).replace('ヵ', 'カ').replace('ヶ', 'ケ'), key);
      }
      assert.strictEqual(HIRAGANA_TO_HALFWIDTH.size, 0x3096 - 0x3041 + 1 - 3);
    });
  });
});
