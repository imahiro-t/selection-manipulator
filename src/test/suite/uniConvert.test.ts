import * as assert from 'assert';
import { EncOutputTooLargeError, MAX_OUTPUT_LENGTH } from '../../handler/encodeTransforms';
import {
  countGraphemes,
  forEachUniLine,
  formatCodePoint,
  GRAPHEME_CHUNK_LENGTH,
  graphemes,
  graphemesInChunks,
  isEmojiGrapheme,
  isInvisibleCode,
  protectedEmojiJoiners,
  UniInputError,
  UniNoTargetError,
} from '../../handler/uniCommon';
import {
  bidiControlsMessage,
  confusablesMessage,
  countGraphemesMessage,
  detectScriptsMessage,
  extractEmoji,
  findBidiControls,
  findConfusables,
  fromCodePoints,
  normalizeText,
  removeControl,
  removeEmoji,
  removeNonAscii,
  removeZeroWidth,
  revealInvisible,
  toCircled,
  toCodePoints,
  toMathBold,
  toMathItalic,
  toMathMonospace,
  toSmartQuotes,
  toStrikethrough,
  toSubscript,
  toSuperscript,
  toTypographicPunctuation,
  toUnderline,
  toUpsideDown,
  toUtf16Units,
  toUtf8Bytes,
  transliterateCyrillic,
} from '../../handler/uniConvert';
import { UPSIDE_DOWN } from '../../handler/uniTables';
import { UNI_COMMAND_ENTRIES } from '../../handler/uniTransforms';

const ZWJ = '\u200D';
/** 👨\u200D👩\u200D👧 man, ZWJ, woman, ZWJ, girl. */
const FAMILY = `\u{1F468}${ZWJ}\u{1F469}${ZWJ}\u{1F467}`;
/** 🧑🏽\u200D💻 person, skin tone modifier, ZWJ, laptop (the ZWJ follows the modifier). */
const TECHNOLOGIST = `\u{1F9D1}\u{1F3FD}${ZWJ}\u{1F4BB}`;
/** ❤\uFE0F\u200D🔥 heart, U+FE0F, ZWJ, fire (the ZWJ follows the presentation selector). */
const HEART_ON_FIRE = `❤\uFE0F${ZWJ}\u{1F525}`;
/** 🏴\u{E0067}\u{E0062}\u{E0065}\u{E006E}\u{E0067}\u{E007F} black flag and the tag sequence `gbeng` + cancel tag. */
const ENGLAND = '\u{1F3F4}\u{E0067}\u{E0062}\u{E0065}\u{E006E}\u{E0067}\u{E007F}';
const JAPAN = '\u{1F1EF}\u{1F1F5}';
const KEYCAP_HASH = '#\uFE0F\u20E3';
const THUMBS_UP = '\u{1F44D}';
const SEQUENCES = [FAMILY, TECHNOLOGIST, HEART_ON_FIRE, ENGLAND, JAPAN, KEYCAP_HASH];

const BUDGET = MAX_OUTPUT_LENGTH;

const throwsInput = (action: () => unknown, message: string) =>
  assert.throws(action, (error: unknown) => error instanceof UniInputError && error.message === message);

suite('Unicode Conversions (UNI-001..030) Test Suite', () => {

  suite('common helpers', () => {
    test('graphemes keep surrogate pairs, combining marks, CRLF and emoji sequences whole', () => {
      assert.deepStrictEqual([...graphemes(`a𠮷e\u0301\r\n${FAMILY}${JAPAN}`)], ['a', '𠮷', 'e\u0301', '\r\n', FAMILY, JAPAN]);
      assert.strictEqual(countGraphemes(`ab${FAMILY}`), 3);
      assert.strictEqual(countGraphemes(''), 0);
    });

    test('graphemesInChunks gives the same graphemes as segmenting the whole text at once', () => {
      const segmenter = new Intl.Segmenter(undefined, { granularity: 'grapheme' });
      const whole = (text: string): string[] => Array.from(segmenter.segment(text), ({ segment }) => segment);
      const pieces = [
        'a', '𠮷', 'e\u0301', '\r\n', '\r', '\n', FAMILY, TECHNOLOGIST, HEART_ON_FIRE, ENGLAND, JAPAN, KEYCAP_HASH,
        THUMBS_UP, '\u{1F3FD}', '\u200D', '\u{1F1EF}', 'x\u0301\u0301\u0301\u0301\u0301\u0301\u0301', 'あ', '\u200B',
        '\u1100\u1161\u11A8',
      ];
      // Every chunk length from 1 to 12 cuts flags, ZWJ sequences, CRLF and runs of combining marks
      // at every possible place.
      let seed = 7;
      for (let round = 0; round < 40; round++) {
        let text = '';
        for (let k = 0; k < 30; k++) {
          seed = (seed * 1103515245 + 12345) % 2147483648;
          text += pieces[seed % pieces.length];
        }
        const expected = whole(text);
        for (let chunk = 1; chunk <= 12; chunk++) {
          assert.deepStrictEqual([...graphemesInChunks(text, chunk)], expected, `${JSON.stringify(text)} / ${chunk}`);
        }
      }
      // Runs of regional indicators (odd and even), a long run of combining marks and a ZWJ
      // sequence across the boundary of the usual chunk length.
      const flags = '\u{1F1EF}'.repeat(2 * GRAPHEME_CHUNK_LENGTH + 1);
      const marks = `a${'\u0301'.repeat(3 * GRAPHEME_CHUNK_LENGTH)}b`;
      const family = `${'a'.repeat(GRAPHEME_CHUNK_LENGTH - 3)}${FAMILY}\r\n${FAMILY}`;
      const crlf = `${'a'.repeat(GRAPHEME_CHUNK_LENGTH - 1)}\r\n`;
      for (const text of [flags, marks, family, crlf]) {
        assert.deepStrictEqual([...graphemes(text)], whole(text));
        assert.strictEqual(countGraphemes(text), whole(text).length);
      }
      assert.strictEqual(countGraphemes(marks), 2);
    });

    test('graphemesInChunks: a lone high surrogate at the end of a piece does not cut the next surrogate pair', () => {
      const segmenter = new Intl.Segmenter(undefined, { granularity: 'grapheme' });
      const whole = (text: string): string[] => Array.from(segmenter.segment(text), ({ segment }) => segment);
      // A lone high surrogate followed by a pair (an emoji modifier, which joins the grapheme before it).
      const texts = [
        '\uD83C\u{1F3FD}',
        'a\uD83C\u{1F3FD}b',
        '\uD83C\uD83C\u{1F3FD}',
        'ab\uD83C\u{1F3FD}\u{1F3FD}\uDFFDc',
        '\uDFFD\uD83C\u{1F44D}\u{1F3FB}',
      ];
      for (const text of texts) {
        const expected = whole(text);
        for (let chunk = 1; chunk <= 8; chunk++) {
          const result = [...graphemesInChunks(text, chunk)];
          assert.deepStrictEqual(result, expected, `${JSON.stringify(text)} / ${chunk}`);
        }
      }
    });

    test('graphemes segments a long text in short pieces (linear on every runtime)', () => {
      const lengths: number[] = [];
      const segmenter = new Intl.Segmenter(undefined, { granularity: 'grapheme' });
      const spy = {
        segment: (text: string) => {
          lengths.push(text.length);
          return segmenter.segment(text);
        },
      };
      const text = `ab あ𠮷e\u0301\u200B${FAMILY}${JAPAN}\r\n`.repeat(2_000);
      assert.strictEqual([...graphemesInChunks(text, GRAPHEME_CHUNK_LENGTH, spy)].join(''), text);
      assert.ok(lengths.length > 1);
      assert.ok(lengths.every((length) => length <= GRAPHEME_CHUNK_LENGTH + 1), `${Math.max(...lengths)}`);
      // A grapheme longer than a piece is taken from a longer piece; the text after it is again
      // segmented in pieces of the usual length.
      lengths.length = 0;
      const long = `a${'\u0301'.repeat(5 * GRAPHEME_CHUNK_LENGTH)}${'b'.repeat(8 * GRAPHEME_CHUNK_LENGTH)}`;
      const result = [...graphemesInChunks(long, GRAPHEME_CHUNK_LENGTH, spy)];
      assert.strictEqual(result.length, 1 + 8 * GRAPHEME_CHUNK_LENGTH);
      assert.strictEqual(result[0], `a${'\u0301'.repeat(5 * GRAPHEME_CHUNK_LENGTH)}`);
      assert.ok(lengths.slice(-8).every((length) => length <= GRAPHEME_CHUNK_LENGTH + 1), lengths.join(','));
    });

    test('graphemes: after a long grapheme whose doubled piece reaches the end, the rest is again segmented in short pieces', () => {
      const lengths: number[] = [];
      const segmenter = new Intl.Segmenter(undefined, { granularity: 'grapheme' });
      const spy = {
        segment: (text: string) => {
          lengths.push(text.length);
          return segmenter.segment(text);
        },
      };
      const C = GRAPHEME_CHUNK_LENGTH;
      // The long grapheme fills pieces of C, 2C and 4C; the piece of 8C is past the end of the text.
      for (const rest of [3 * C, 3 * C + 7, C + 1]) {
        lengths.length = 0;
        const longGrapheme = `a${'\u0301'.repeat(5 * C)}`;
        const text = `${longGrapheme}${'b'.repeat(rest)}`;
        const result = [...graphemesInChunks(text, C, spy)];
        assert.strictEqual(result.length, 1 + rest);
        assert.strictEqual(result[0], longGrapheme);
        assert.strictEqual(result.join(''), text);
        // The pieces after the one that gave the long grapheme are of the usual length.
        const lastLong = lengths.findIndex((length) => length > 5 * C);
        assert.ok(lastLong >= 0, lengths.join(','));
        const after = lengths.slice(lastLong + 1);
        assert.ok(after.length >= Math.floor(rest / C), lengths.join(','));
        assert.ok(after.every((length) => length <= C + 1), lengths.join(','));
      }
      // A text ending with the long grapheme is still segmented to its end.
      lengths.length = 0;
      const ending = `${'b'.repeat(3)}a${'\u0301'.repeat(3 * C)}`;
      const endingResult = [...graphemesInChunks(ending, C, spy)];
      assert.deepStrictEqual(endingResult, ['b', 'b', 'b', `a${'\u0301'.repeat(3 * C)}`]);
    });

    test('isEmojiGrapheme: emoji sequences are emoji; text symbols, digits and # are not', () => {
      for (const emoji of [...SEQUENCES, THUMBS_UP, '☕', '©\uFE0F', `${THUMBS_UP}\u{1F3FB}`]) {
        assert.ok(isEmojiGrapheme(emoji), emoji);
      }
      for (const text of ['a', '1', '#', '©', '®', '™', 'あ', '❤', ' ']) {
        assert.ok(!isEmojiGrapheme(text), text);
      }
    });

    test('protectedEmojiJoiners keeps the ZWJs between emoji and the tags of a flag only', () => {
      const flags = (text: string) => Array.from(protectedEmojiJoiners(text));
      // 👨 (2) ZWJ (1) 👩 (2) ZWJ (1) 👧 (2)
      assert.deepStrictEqual(flags(FAMILY), [0, 0, 1, 0, 0, 1, 0, 0]);
      assert.deepStrictEqual(flags(TECHNOLOGIST), [0, 0, 0, 0, 1, 0, 0]);
      assert.deepStrictEqual(flags(HEART_ON_FIRE), [0, 0, 1, 0, 0]);
      assert.deepStrictEqual(flags(ENGLAND), [0, 0, ...new Array(12).fill(1)]);
      for (const text of [`${THUMBS_UP}${ZWJ}`, `${THUMBS_UP}${ZWJ}a`, `a${ZWJ}b`, `a${ZWJ}${THUMBS_UP}`, 'a\u{E0061}', `${FAMILY}x\u{E0061}`]) {
        const kept = flags(text).map((flag, i) => (flag === 1 ? text.charCodeAt(i) : 0)).filter((code) => code !== 0);
        // Only the ZWJs inside FAMILY may be kept.
        assert.deepStrictEqual(kept, text.startsWith(FAMILY) ? [0x200d, 0x200d] : [], JSON.stringify(text));
      }
    });

    test('isInvisibleCode: controls, format characters and odd spaces; not tab / LF / CR / space / U+3000', () => {
      for (const code of [0x00, 0x07, 0x7f, 0x85, 0xad, 0x200b, 0x200c, 0x200d, 0x2060, 0xfeff, 0x202e, 0x2066, 0x2028, 0x2029, 0xa0, 0x2009, 0xe0061]) {
        assert.ok(isInvisibleCode(code), formatCodePoint(code));
      }
      for (const code of [0x09, 0x0a, 0x0d, 0x20, 0x3000, 0x41, 0x3042, 0xfe0f, 0x1f3fd]) {
        assert.ok(!isInvisibleCode(code), formatCodePoint(code));
      }
    });

    test('formatCodePoint: upper case, at least 4 digits', () => {
      assert.deepStrictEqual([0x41, 0x3042, 0x1f600, 0x10ffff].map(formatCodePoint), ['U+0041', 'U+3042', 'U+1F600', 'U+10FFFF']);
    });

    test('forEachUniLine: LF and CRLF, last line without a break', () => {
      const lines: [string, string][] = [];
      forEachUniLine('a\r\nb\n\nc', (line, lineBreak) => lines.push([line, lineBreak]));
      assert.deepStrictEqual(lines, [['a', '\r\n'], ['b', '\n'], ['', '\n'], ['c', '']]);
    });
  });

  suite('UNI-001..004 normalization', () => {
    test('the four forms', () => {
      assert.strictEqual(normalizeText('e\u0301', 'NFC'), 'é');
      assert.strictEqual(normalizeText('é', 'NFD'), 'e\u0301');
      assert.strictEqual(normalizeText('ｶﾞ①ﬁ', 'NFKC'), 'ガ1fi');
      assert.strictEqual(normalizeText('ﬁ', 'NFKD'), 'fi');
      assert.strictEqual(normalizeText('ガ', 'NFKD'), 'カ\u3099');
    });

    test('emoji sequences, surrogate pairs and line breaks are kept', () => {
      const text = `𠮷\r\n${SEQUENCES.join(' ')}`;
      for (const form of ['NFC', 'NFD', 'NFKC', 'NFKD'] as const) {
        assert.strictEqual(normalizeText(text, form), text, form);
      }
    });
  });

  suite('UNI-005 remove zero-width characters', () => {
    test('removes ZWSP, ZWNJ, ZWJ, word joiner, BOM and U+180E', () => {
      assert.strictEqual(removeZeroWidth('\uFEFFa\u200Bb\u200Cc\u200Dd\u2060e\u180Ef'), 'abcdef');
    });

    test('emoji ZWJ sequences and flags are kept', () => {
      for (const sequence of SEQUENCES) {
        assert.strictEqual(removeZeroWidth(sequence), sequence, sequence);
      }
      assert.strictEqual(removeZeroWidth(`a\u200B${FAMILY}\u200Bb`), `a${FAMILY}b`);
    });

    test('a ZWJ with no emoji on both sides is removed', () => {
      assert.strictEqual(removeZeroWidth(`${THUMBS_UP}${ZWJ}`), THUMBS_UP);
      assert.strictEqual(removeZeroWidth(`${THUMBS_UP}${ZWJ}a`), `${THUMBS_UP}a`);
      assert.strictEqual(removeZeroWidth(`a${ZWJ}b`), 'ab');
      assert.strictEqual(removeZeroWidth(`a${ZWJ}${THUMBS_UP}`), `a${THUMBS_UP}`);
    });

    test('other characters, line breaks and tabs are kept', () => {
      assert.strictEqual(removeZeroWidth('a\tb\r\nc\u00A0d'), 'a\tb\r\nc\u00A0d');
    });
  });

  suite('UNI-006 reveal invisible characters', () => {
    test('invisible characters become <U+XXXX>', () => {
      assert.strictEqual(revealInvisible('a\u200Bb', BUDGET), 'a<U+200B>b');
      assert.strictEqual(revealInvisible('\uFEFFx\u00A0y\u0007\u202E\u2028', BUDGET), '<U+FEFF>x<U+00A0>y<U+0007><U+202E><U+2028>');
    });

    test('tab, line breaks, space and ideographic space stay', () => {
      assert.strictEqual(revealInvisible('a\tb c\u3000d\r\ne\n', BUDGET), 'a\tb c\u3000d\r\ne\n');
    });

    test('emoji ZWJ sequences and flags stay; a lone ZWJ or tag character is shown', () => {
      for (const sequence of SEQUENCES) {
        assert.strictEqual(revealInvisible(sequence, BUDGET), sequence, sequence);
      }
      assert.strictEqual(revealInvisible(`${THUMBS_UP}${ZWJ}`, BUDGET), `${THUMBS_UP}<U+200D>`);
      assert.strictEqual(revealInvisible(`${THUMBS_UP}${ZWJ}a`, BUDGET), `${THUMBS_UP}<U+200D>a`);
      assert.strictEqual(revealInvisible('a\u{E0061}b', BUDGET), 'a<U+E0061>b');
    });

    test('the result converts back with UNI-008', () => {
      const text = `a\u200B\u00A0b\u{E0061}${FAMILY}\u2066`;
      assert.strictEqual(fromCodePoints(revealInvisible(text, BUDGET)), text);
    });

    test('a result over the budget throws', () => {
      assert.throws(() => revealInvisible('\u200B'.repeat(10), 79), EncOutputTooLargeError);
      assert.strictEqual(revealInvisible('\u200B'.repeat(10), 80).length, 80);
    });
  });

  suite('UNI-007 / 008 code points', () => {
    test('UNI-007: code points of every line; line breaks kept', () => {
      assert.strictEqual(toCodePoints('あ😀', BUDGET), 'U+3042 U+1F600');
      assert.strictEqual(toCodePoints('a b\r\n\n\tc', BUDGET), 'U+0061 U+0020 U+0062\r\n\nU+0009 U+0063');
      assert.strictEqual(toCodePoints(FAMILY, BUDGET), 'U+1F468 U+200D U+1F469 U+200D U+1F467');
    });

    test('UNI-007: a lone surrogate is shown, not an error', () => {
      assert.strictEqual(toCodePoints('a\uD800', BUDGET), 'U+0061 U+D800');
    });

    test('UNI-007: a result over the budget throws', () => {
      assert.throws(() => toCodePoints('aaa', 19), EncOutputTooLargeError);
      assert.strictEqual(toCodePoints('aaa', 20), 'U+0061 U+0061 U+0061');
    });

    test('UNI-008: tokens become characters; the spaces between them are dropped', () => {
      assert.strictEqual(fromCodePoints('U+3042 U+1F600'), 'あ😀');
      assert.strictEqual(fromCodePoints('a<U+200B>b'), 'a\u200Bb');
      assert.strictEqual(fromCodePoints('u+0061\tU+0062  <u+0063>'), 'abc');
      assert.strictEqual(fromCodePoints('x U+0041 y'), 'x A y');
      assert.strictEqual(fromCodePoints('U+0041 U+0042\r\nU+0043'), 'AB\r\nC');
    });

    test('UNI-008: other text and tokens with too few / many digits stay', () => {
      assert.strictEqual(fromCodePoints('U+41 U+1234567 U+GGGG hello'), 'U+41 U+1234567 U+GGGG hello');
      assert.strictEqual(fromCodePoints('no tokens'), 'no tokens');
    });

    test('UNI-008: surrogates and values beyond U+10FFFF are errors', () => {
      throwsInput(() => fromCodePoints('U+D800'), '"U+D800" is a surrogate code point, not a character');
      throwsInput(() => fromCodePoints('a <U+DFFF>'), '"<U+DFFF>" is a surrogate code point, not a character');
      throwsInput(() => fromCodePoints('U+110000'), '"U+110000" is beyond U+10FFFF, the last code point');
      assert.strictEqual(fromCodePoints('U+10FFFF U+0000'), '\u{10FFFF}\u0000');
    });

    test('UNI-008 undoes UNI-007', () => {
      const text = `a あ\r\n\n${FAMILY}${ENGLAND}\t𠮷`;
      assert.strictEqual(fromCodePoints(toCodePoints(text, BUDGET)), text);
    });
  });

  suite('UNI-009 / 010 bytes and code units per grapheme', () => {
    test('UNI-009: one line per grapheme', () => {
      assert.strictEqual(toUtf8Bytes('aあ', '\n', BUDGET), 'a: 61\nあ: E3 81 82');
      assert.strictEqual(toUtf8Bytes('😀e\u0301', '\r\n', BUDGET), '😀: F0 9F 98 80\r\ne\u0301: 65 CC 81');
    });

    test('UNI-009: white space, line breaks and invisible characters are labelled by code point', () => {
      assert.strictEqual(toUtf8Bytes(' \t\r\n\u200B\u00A0', '\n', BUDGET),
        '<U+0020>: 20\n<U+0009>: 09\n<U+000D><U+000A>: 0D 0A\n<U+200B>: E2 80 8B\n<U+00A0>: C2 A0');
    });

    test('UNI-009: an emoji sequence is one line with its own label', () => {
      assert.strictEqual(toUtf8Bytes(HEART_ON_FIRE, '\n', BUDGET), `${HEART_ON_FIRE}: E2 9D A4 EF B8 8F E2 80 8D F0 9F 94 A5`);
      assert.strictEqual(toUtf8Bytes(`${THUMBS_UP}${ZWJ}`, '\n', BUDGET), `${THUMBS_UP}<U+200D>: F0 9F 91 8D E2 80 8D`);
    });

    test('UNI-010: UTF-16 code units', () => {
      assert.strictEqual(toUtf16Units('😀', '\n', BUDGET), '😀: D83D DE00');
      assert.strictEqual(toUtf16Units('aあ', '\n', BUDGET), 'a: 0061\nあ: 3042');
      assert.strictEqual(toUtf16Units('a\uD800', '\n', BUDGET), 'a: 0061\n\uD800: D800');
    });

    test('a result over the budget throws', () => {
      assert.throws(() => toUtf8Bytes('aaaa', '\n', 22), EncOutputTooLargeError);
      assert.strictEqual(toUtf8Bytes('aaaa', '\n', 23).length, 23);
    });
  });

  suite('UNI-011 count graphemes', () => {
    test('graphemes and length of all selections together', () => {
      assert.strictEqual(countGraphemesMessage([FAMILY]), '1 grapheme / length 8');
      assert.strictEqual(countGraphemesMessage([FAMILY, 'ab']), '3 graphemes / length 10');
      assert.strictEqual(countGraphemesMessage(['a'.repeat(1234)]), '1,234 graphemes / length 1,234');
      assert.strictEqual(countGraphemesMessage(['e\u0301\r\n']), '2 graphemes / length 4');
    });

    test('nothing to count', () => {
      assert.throws(() => countGraphemesMessage(['']), UniNoTargetError);
    });
  });

  suite('UNI-012..015 removing characters and emoji', () => {
    test('UNI-012: C0 (except tab / LF / CR), DEL and C1 are removed', () => {
      assert.strictEqual(removeControl('a\u0007b'), 'ab');
      assert.strictEqual(removeControl('\u0000a\tb\r\nc\u000B\u000C\u001B\u007F\u0080\u0085\u009Fd\u00A0'), 'a\tb\r\ncd\u00A0');
      assert.strictEqual(removeControl(`𠮷${FAMILY}`), `𠮷${FAMILY}`);
    });

    test('UNI-013: everything outside ASCII is removed', () => {
      assert.strictEqual(removeNonAscii('café ☕'), 'caf ');
      assert.strictEqual(removeNonAscii(`a𠮷\r\n${FAMILY}b\uD800`), 'a\r\nb');
    });

    test('UNI-014: emoji are removed as whole sequences', () => {
      assert.strictEqual(removeEmoji('ok👍'), 'ok');
      assert.strictEqual(removeEmoji(`a${SEQUENCES.join('b')}c`), 'abbbbbc');
      assert.strictEqual(removeEmoji(`${THUMBS_UP}\u{1F3FB}x`), 'x');
      assert.strictEqual(removeEmoji('© ® ™ # 1 ❤ あ\r\n'), '© ® ™ # 1 ❤ あ\r\n');
    });

    test('UNI-015: emoji are extracted in order, whole', () => {
      assert.strictEqual(extractEmoji('ok👍 go🚀'), '👍🚀');
      assert.strictEqual(extractEmoji(`a${SEQUENCES.join(' ')}b ©`), SEQUENCES.join(''));
      assert.strictEqual(extractEmoji('no emoji © #1'), '');
    });
  });

  suite('UNI-016..019 styled letters', () => {
    test('UNI-016: bold letters and digits', () => {
      assert.strictEqual(toMathBold('abc'), '𝐚𝐛𝐜');
      assert.strictEqual(toMathBold('AZaz09'), '𝐀𝐙𝐚𝐳𝟎𝟗');
    });

    test('UNI-017: italic letters; h is U+210E; digits stay', () => {
      assert.strictEqual(toMathItalic('abc'), '𝑎𝑏𝑐');
      assert.strictEqual(toMathItalic('hHz09'), 'ℎ𝐻𝑧09');
    });

    test('UNI-018: monospace letters and digits', () => {
      assert.strictEqual(toMathMonospace('abc'), '𝚊𝚋𝚌');
      assert.strictEqual(toMathMonospace('AZ09'), '𝙰𝚉𝟶𝟿');
    });

    test('UNI-019: circled letters and digits', () => {
      assert.strictEqual(toCircled('abc'), 'ⓐⓑⓒ');
      assert.strictEqual(toCircled('AZz0 19'), 'ⒶⓏⓩ⓪ ①⑨');
    });

    test('other characters, combining marks, surrogate pairs and line breaks stay', () => {
      const other = `é e\u0301 あ𠮷 ${FAMILY}\r\n-_.`;
      for (const convert of [toMathBold, toMathItalic, toMathMonospace, toCircled]) {
        assert.strictEqual(convert(other), other.replace(/e/g, convert('e')));
      }
    });
  });

  suite('UNI-020 upside-down text', () => {
    test('characters from the table, graphemes and lines in reverse order', () => {
      assert.strictEqual(toUpsideDown('hello'), 'ollǝɥ');
      assert.strictEqual(toUpsideDown('ab\ncd'), 'pɔ\nqɐ');
      assert.strictEqual(toUpsideDown('ab\r\ncd\n'), 'pɔ\r\nqɐ\n');
      assert.strictEqual(toUpsideDown('Why? 69!'), '¡69 ¿ʎɥM');
    });

    test('line breaks at the start and at the end of the selection stay in place', () => {
      assert.strictEqual(toUpsideDown('hello\n'), 'ollǝɥ\n');
      assert.strictEqual(toUpsideDown('\nabc'), '\nɔqɐ');
      assert.strictEqual(toUpsideDown('ab\ncd\n'), 'pɔ\nqɐ\n');
      assert.strictEqual(toUpsideDown('\r\n\nab\n\ncd\r\n\n'), '\r\n\npɔ\n\nqɐ\r\n\n');
      assert.strictEqual(toUpsideDown('\n\r\n'), '\n\r\n');
      assert.strictEqual(toUpsideDown(''), '');
    });

    test('turning twice gives the text back; the table maps both ways', () => {
      for (const [from, to] of UPSIDE_DOWN) {
        assert.strictEqual(UPSIDE_DOWN.get(to), from, from);
      }
      const text = 'The quick brown fox, (jumps) over [the] lazy dog!\n0123456789 & "quotes"';
      assert.strictEqual(toUpsideDown(toUpsideDown(text)), text);
      for (const withBreaks of [`${text}\n`, `\r\n${text}\r\n`, `\n\n${text}\n\n`]) {
        assert.strictEqual(toUpsideDown(toUpsideDown(withBreaks)), withBreaks);
      }
    });

    test('combining marks, surrogate pairs and emoji sequences stay whole', () => {
      assert.strictEqual(toUpsideDown(`ae\u0301𠮷${FAMILY}${JAPAN}`), `${JAPAN}${FAMILY}𠮷ǝ\u0301ɐ`);
    });
  });

  suite('UNI-021 / 022 combining lines', () => {
    test('a mark after every grapheme except line breaks, tabs and controls', () => {
      assert.strictEqual(toStrikethrough('abc'), 'a\u0336b\u0336c\u0336');
      assert.strictEqual(toUnderline('abc'), 'a\u0332b\u0332c\u0332');
      assert.strictEqual(toStrikethrough('a b\tc\r\nd\u0007'), 'a\u0336 \u0336b\u0336\tc\u0336\r\nd\u0336\u0007');
    });

    test('combining marks, surrogate pairs and emoji sequences are not split', () => {
      assert.strictEqual(toUnderline(`e\u0301𠮷${FAMILY}`), `e\u0301\u0332𠮷\u0332${FAMILY}\u0332`);
    });
  });

  suite('UNI-023 / 024 superscript and subscript', () => {
    test('digits and signs (default)', () => {
      assert.strictEqual(toSuperscript('x2', 'digits'), 'x²');
      assert.strictEqual(toSuperscript('(a+b)=0123456789-', 'digits'), '⁽a⁺b⁾⁼⁰¹²³⁴⁵⁶⁷⁸⁹⁻');
      assert.strictEqual(toSubscript('H2O', 'digits'), 'H₂O');
      assert.strictEqual(toSubscript('(a+b)=0123456789-', 'digits'), '₍a₊b₎₌₀₁₂₃₄₅₆₇₈₉₋');
    });

    test('letters too; letters without a form stay', () => {
      assert.strictEqual(toSuperscript('x2 qCHnm', 'letters'), 'ˣ² qCᴴⁿᵐ');
      assert.strictEqual(toSubscript('H2O ax b', 'letters'), 'H₂O ₐₓ b');
    });

    test('other characters, surrogate pairs and line breaks stay', () => {
      assert.strictEqual(toSuperscript('𠮷2\r\n²', 'letters'), '𠮷²\r\n²');
    });
  });

  suite('UNI-025 detect confusable characters', () => {
    const detect = (text: string): string[] => findConfusables(text, 10_000).map(({ start, end }) => text.slice(start, end));

    test('rule A: a word with Latin letters and homoglyphs (words split at _ - . and spaces)', () => {
      assert.deepStrictEqual(findConfusables('pаypal', 100), [{ start: 1, end: 2 }]);
      assert.deepStrictEqual(detect('pаypal123'), ['а']);
      assert.deepStrictEqual(detect('pаy-pal'), ['а']);
      assert.deepStrictEqual(detect('user_nаme'), ['а']);
      assert.deepStrictEqual(detect('Tοkyο'), ['ο', 'ο']);
      assert.deepStrictEqual(detect('ΑPI'), ['Α']);
    });

    test('rule B: a word of Cyrillic homoglyphs only on a line with a Latin word', () => {
      assert.deepStrictEqual(detect('login раура'), ['р', 'а', 'у', 'р', 'а']);
      assert.deepStrictEqual(detect('раура.com'), ['р', 'а', 'у', 'р', 'а']);
      assert.deepStrictEqual(detect('раура'), []);
      assert.deepStrictEqual(detect('login а'), []);
      assert.deepStrictEqual(detect('раура\nlogin'), []);
      assert.deepStrictEqual(detect('x\r\nlogin раура\r\nраура'), ['р', 'а', 'у', 'р', 'а']);
    });

    test('ordinary Russian and Greek text is not detected', () => {
      for (const text of ['а сок у оса', 'В лесу, а не в поле.', 'Я и ты, а сок', 'ο κόσμος και ο ήλιος', 'Hello Привет, а сок']) {
        assert.deepStrictEqual(detect(text), [], text);
      }
    });

    test('words of Greek homoglyphs only are left to rule A (Greek text mixed with English)', () => {
      assert.deepStrictEqual(detect('Το API και το SDK'), []);
      assert.deepStrictEqual(detect('ΑΡΙ key'), []);
    });

    test('stops once more than the limit was found', () => {
      assert.strictEqual(findConfusables('pаypаl\n'.repeat(100), 5).length, 6);
    });

    test('the message lists each kind once, in order', () => {
      assert.strictEqual(confusablesMessage(['а']), '1 confusable character found: "а" (U+0430) looks like "a"');
      assert.strictEqual(confusablesMessage(['ο', 'а', 'ο']),
        '3 confusable characters found: "ο" (U+03BF) looks like "o", "а" (U+0430) looks like "a"');
      const many = [...'аеорсухіјѕԁԛ'];
      assert.ok(confusablesMessage(many).endsWith('"ѕ" (U+0455) looks like "s", …'), confusablesMessage(many));
    });
  });

  suite('UNI-026 detect bidi control characters', () => {
    test('U+202A..202E and U+2066..2069 are found; other format characters are not', () => {
      const text = 'a\u202Ab\u202Ec\u2066d\u2069e\u200Ef\u200Bg\u061C';
      assert.deepStrictEqual(findBidiControls(text, 100).map(({ start }) => text[start]), ['\u202A', '\u202E', '\u2066', '\u2069']);
      assert.deepStrictEqual(findBidiControls('plain', 100), []);
      assert.strictEqual(findBidiControls('\u202E'.repeat(20), 5).length, 6);
    });

    test('the message', () => {
      assert.strictEqual(bidiControlsMessage(['\u202E']), '1 bidi control character found: U+202E (right-to-left override)');
      assert.strictEqual(bidiControlsMessage(['\u2067', '\u2069', '\u2067']),
        '3 bidi control characters found: U+2067 (right-to-left isolate), U+2069 (pop directional isolate)');
    });
  });

  suite('UNI-027 / 028 typography', () => {
    test('UNI-027: opening and closing quotes, apostrophes', () => {
      assert.strictEqual(toSmartQuotes('"a" it\'s'), '“a” it’s');
      assert.strictEqual(toSmartQuotes('He said "\'hi\'" (\'x\') and "[y]".'), 'He said “‘hi’” (‘x’) and “[y]”.');
      assert.strictEqual(toSmartQuotes('"a"\n"b"\r\n\'c\''), '“a”\n“b”\r\n‘c’');
      assert.strictEqual(toSmartQuotes('rock \'n\' roll, the \'90s, dogs\' toys'), 'rock ‘n’ roll, the ‘90s, dogs’ toys');
      assert.strictEqual(toSmartQuotes('a—"b"'), 'a—“b”');
      assert.strictEqual(toSmartQuotes('𠮷\'s "𠮷"'), '𠮷’s “𠮷”');
    });

    test('UNI-027: empty quotations close; nested quotations still open', () => {
      assert.strictEqual(toSmartQuotes('say "" to'), 'say “” to');
      assert.strictEqual(toSmartQuotes('x = "" and \'\' ok'), 'x = “” and ‘’ ok');
      assert.strictEqual(toSmartQuotes('use "" for empty'), 'use “” for empty');
      assert.strictEqual(toSmartQuotes('""'), '“”');
      assert.strictEqual(toSmartQuotes('\'\''), '‘’');
      assert.strictEqual(toSmartQuotes('"\'hi\'"'), '“‘hi’”');
      assert.strictEqual(toSmartQuotes('\'"hi"\''), '‘“hi”’');
      assert.strictEqual(toSmartQuotes('"\'\'"'), '“‘’”');
    });

    test('UNI-028: exactly two hyphens and exactly three dots', () => {
      assert.strictEqual(toTypographicPunctuation('wait... -- ok'), 'wait… — ok');
      assert.strictEqual(toTypographicPunctuation('a-b -- c --- d .... e . f..'), 'a-b — c --- d .... e . f..');
      assert.strictEqual(toTypographicPunctuation('---\ntitle: x\n---'), '---\ntitle: x\n---');
    });
  });

  suite('UNI-029 detect scripts', () => {
    test('scripts in order of appearance; digits, symbols, spaces and marks are not counted', () => {
      assert.strictEqual(detectScriptsMessage(['abcあア漢']), 'Latin 3, Hiragana 1, Katakana 1, Han 1');
      assert.strictEqual(detectScriptsMessage(['Привет, мир! 123', 'Γειά σου', 'e\u0301 ー ㌔']), 'Cyrillic 9, Greek 7, Latin 1, Katakana 1');
      assert.strictEqual(detectScriptsMessage(['한글 עברית ภาษา']), 'Hangul 2, Hebrew 5, Thai 4');
      assert.strictEqual(detectScriptsMessage(['a\u{10300}']), 'Latin 1, Other 1');
      assert.strictEqual(detectScriptsMessage([`${FAMILY} 123 ! ${JAPAN}`]), 'No letters of any script were found (only digits, symbols and spaces).');
    });

    test('thousands separators', () => {
      assert.strictEqual(detectScriptsMessage(['a'.repeat(1234)]), 'Latin 1,234');
    });
  });

  suite('UNI-030 transliterate Cyrillic', () => {
    test('Russian, one fixed value per letter', () => {
      assert.strictEqual(transliterateCyrillic('Привет'), 'Privet');
      assert.strictEqual(transliterateCyrillic('Ельцин'), 'Eltsin');
      assert.strictEqual(transliterateCyrillic('поезд'), 'poezd');
      assert.strictEqual(transliterateCyrillic('съезд объём'), 'sezd obyom');
      assert.strictEqual(transliterateCyrillic('г и'), 'g i');
    });

    test('Ukrainian, Belarusian, Serbian and Macedonian letters', () => {
      assert.strictEqual(transliterateCyrillic('Україна'), 'Ukrayina');
      assert.strictEqual(transliterateCyrillic('ґ ў є'), 'g w ye');
      assert.strictEqual(transliterateCyrillic('Љубљана'), 'Ljubljana');
      assert.strictEqual(transliterateCyrillic('ђ ћ џ ѓ ќ ѕ њ ј'), 'dj c dz gj kj dz nj j');
    });

    test('decomposed letters give the same result as precomposed ones', () => {
      assert.strictEqual(transliterateCyrillic('и\u0306 е\u0308 И\u0306 Е\u0308 і\u0308 у\u0306'), transliterateCyrillic('й ё Й Ё ї ў'));
      assert.strictEqual(transliterateCyrillic('й ё Й Ё ї ў'), 'y yo Y Yo yi w');
    });

    test('decomposed capitals next to letters of several Latin letters give the composed result', () => {
      assert.strictEqual(transliterateCyrillic('ЁЖ'), 'YOZH');
      assert.strictEqual(transliterateCyrillic('Е\u0308Ж'), 'YOZH');
      assert.strictEqual(transliterateCyrillic('ЙЖ'), 'YZH');
      assert.strictEqual(transliterateCyrillic('И\u0306Ж'), 'YZH');
      assert.strictEqual(transliterateCyrillic('ЖЁ'), 'ZHYO');
      assert.strictEqual(transliterateCyrillic('ЖЕ\u0308'), 'ZHYO');
      assert.strictEqual(transliterateCyrillic('ЁЖ ё Ж'), transliterateCyrillic('Е\u0308Ж е\u0308 Ж'));
      assert.strictEqual(transliterateCyrillic('ОБЪЕ\u0308М'), 'OBYOM');
      assert.strictEqual(transliterateCyrillic('Е\u0308ж'), 'Yozh');
    });

    test('capitals: several letters are all upper case next to capitals', () => {
      assert.strictEqual(transliterateCyrillic('ЖУК'), 'ZHUK');
      assert.strictEqual(transliterateCyrillic('Жук'), 'Zhuk');
      assert.strictEqual(transliterateCyrillic('Ж'), 'Zh');
      assert.strictEqual(transliterateCyrillic('ПЛЮЩ'), 'PLYUSHCH');
      assert.strictEqual(transliterateCyrillic('ОБЪЁМ'), 'OBYOM');
    });

    test('other characters stay', () => {
      assert.strictEqual(transliterateCyrillic(`abc 123 あ𠮷 ${FAMILY}\r\nѢ`), `abc 123 あ𠮷 ${FAMILY}\r\nѢ`);
    });
  });

  suite('large selections', () => {
    // A mix of ASCII, kana, a surrogate pair, a combining mark, emoji sequences and zero-width
    // characters, repeated to the input limit.
    const unit = `ab あ𠮷e\u0301\u200B${FAMILY}${JAPAN}\r\n`;
    const large = unit.repeat(Math.floor(1_000_000 / unit.length));

    UNI_COMMAND_ENTRIES.forEach((entry) => {
      test(`${entry.id} ${entry.name} handles about 1,000,000 characters in reasonable time`, function () {
        this.timeout(20_000);
        const started = Date.now();
        if (entry.combine !== undefined) {
          entry.combine([large], { eol: '\n' });
        } else if (entry.transform !== undefined) {
          entry.transform(large, { eol: '\n' }, MAX_OUTPUT_LENGTH);
        } else if (entry.select !== undefined) {
          entry.select(large, 10_000);
        }
        const elapsed = Date.now() - started;
        assert.ok(elapsed < 10_000, `${entry.id}: ${elapsed} ms`);
      });
    });

    test('graphemes stay linear when a long run of combining marks is followed by many graphemes up to the end', function () {
      this.timeout(20_000);
      const text = `a${'\u0301'.repeat(600_000)}${'b'.repeat(399_999)}`;
      const started = Date.now();
      assert.strictEqual(countGraphemes(text), 400_000);
      const elapsed = Date.now() - started;
      assert.ok(elapsed < 10_000, `${elapsed} ms`);
    });

    test('UNI-020 keeps hundreds of thousands of line breaks at the start and at the end', () => {
      assert.strictEqual(toUpsideDown(`a${'\n'.repeat(999_999)}`), `\u0250${'\n'.repeat(999_999)}`);
      assert.strictEqual(toUpsideDown(`a\r\n${'\r\n'.repeat(499_998)}`), `\u0250\r\n${'\r\n'.repeat(499_998)}`);
      assert.strictEqual(toUpsideDown(`${'\n'.repeat(999_998)}ab`), `${'\n'.repeat(999_998)}q\u0250`);
      const between = `${'\n'.repeat(300_000)}ab${'\n'.repeat(300_000)}cd${'\n'.repeat(300_000)}`;
      assert.strictEqual(toUpsideDown(toUpsideDown(between)), between);
    });

    test('UNI-025 handles a word of 1,000,000 homoglyphs and stops at the limit', () => {
      const word = `p${'\u0430'.repeat(999_999)}`;
      const limited = findConfusables(word, 10_000);
      assert.strictEqual(limited.length, 10_001);
      assert.deepStrictEqual(limited[0], { start: 1, end: 2 });
      assert.deepStrictEqual(limited[10_000], { start: 10_001, end: 10_002 });
      assert.strictEqual(findConfusables(word, 2_000_000).length, 999_999);
    });

    test('a selection over 1,000,000 characters is refused by every transform', () => {
      const tooLong = 'a'.repeat(1_000_001);
      UNI_COMMAND_ENTRIES.filter((entry) => entry.transform !== undefined).forEach((entry) => {
        throwsInput(() => entry.transform!(tooLong, { eol: '\n' }, MAX_OUTPUT_LENGTH), 'the selection is longer than 1,000,000 characters');
      });
    });
  });
});
