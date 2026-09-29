import * as assert from 'assert';
import { EncOutputTooLargeError, MAX_OUTPUT_LENGTH } from '../../handler/encodeTransforms';
import {
  countGraphemes,
  forEachUniLine,
  formatCodePoint,
  graphemes,
  isEmojiGrapheme,
  isInvisibleCode,
  protectedEmojiJoiners,
  UniInputError,
  UniNoTargetError,
} from '../../handler/uniCommon';
import {
  countGraphemesMessage,
  extractEmoji,
  fromCodePoints,
  normalizeText,
  removeControl,
  removeEmoji,
  removeNonAscii,
  removeZeroWidth,
  revealInvisible,
  toCodePoints,
  toUtf16Units,
  toUtf8Bytes,
} from '../../handler/uniConvert';
import { UNI_COMMAND_ENTRIES } from '../../handler/uniTransforms';

const ZWJ = '‍';
/** 👨‍👩‍👧 man, ZWJ, woman, ZWJ, girl. */
const FAMILY = `\u{1F468}${ZWJ}\u{1F469}${ZWJ}\u{1F467}`;
/** 🧑🏽‍💻 person, skin tone modifier, ZWJ, laptop (the ZWJ follows the modifier). */
const TECHNOLOGIST = `\u{1F9D1}\u{1F3FD}${ZWJ}\u{1F4BB}`;
/** ❤️‍🔥 heart, U+FE0F, ZWJ, fire (the ZWJ follows the presentation selector). */
const HEART_ON_FIRE = `❤️${ZWJ}\u{1F525}`;
/** 🏴󠁧󠁢󠁥󠁮󠁧󠁿 black flag and the tag sequence `gbeng` + cancel tag. */
const ENGLAND = '\u{1F3F4}\u{E0067}\u{E0062}\u{E0065}\u{E006E}\u{E0067}\u{E007F}';
const JAPAN = '\u{1F1EF}\u{1F1F5}';
const KEYCAP_HASH = '#️⃣';
const THUMBS_UP = '\u{1F44D}';
const SEQUENCES = [FAMILY, TECHNOLOGIST, HEART_ON_FIRE, ENGLAND, JAPAN, KEYCAP_HASH];

const BUDGET = MAX_OUTPUT_LENGTH;

const throwsInput = (action: () => unknown, message: string) =>
  assert.throws(action, (error: unknown) => error instanceof UniInputError && error.message === message);

suite('Unicode Conversions (UNI-001..015) Test Suite', () => {

  suite('common helpers', () => {
    test('graphemes keep surrogate pairs, combining marks, CRLF and emoji sequences whole', () => {
      assert.deepStrictEqual([...graphemes(`a𠮷é\r\n${FAMILY}${JAPAN}`)], ['a', '𠮷', 'é', '\r\n', FAMILY, JAPAN]);
      assert.strictEqual(countGraphemes(`ab${FAMILY}`), 3);
      assert.strictEqual(countGraphemes(''), 0);
    });

    test('isEmojiGrapheme: emoji sequences are emoji; text symbols, digits and # are not', () => {
      for (const emoji of [...SEQUENCES, THUMBS_UP, '☕', '©️', `${THUMBS_UP}\u{1F3FB}`]) {
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
      assert.strictEqual(normalizeText('é', 'NFC'), 'é');
      assert.strictEqual(normalizeText('é', 'NFD'), 'é');
      assert.strictEqual(normalizeText('ｶﾞ①ﬁ', 'NFKC'), 'ガ1fi');
      assert.strictEqual(normalizeText('ﬁ', 'NFKD'), 'fi');
      assert.strictEqual(normalizeText('ガ', 'NFKD'), 'ガ');
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
      assert.strictEqual(removeZeroWidth('﻿a​b‌c‍d⁠e᠎f'), 'abcdef');
    });

    test('emoji ZWJ sequences and flags are kept', () => {
      for (const sequence of SEQUENCES) {
        assert.strictEqual(removeZeroWidth(sequence), sequence, sequence);
      }
      assert.strictEqual(removeZeroWidth(`a​${FAMILY}​b`), `a${FAMILY}b`);
    });

    test('a ZWJ with no emoji on both sides is removed', () => {
      assert.strictEqual(removeZeroWidth(`${THUMBS_UP}${ZWJ}`), THUMBS_UP);
      assert.strictEqual(removeZeroWidth(`${THUMBS_UP}${ZWJ}a`), `${THUMBS_UP}a`);
      assert.strictEqual(removeZeroWidth(`a${ZWJ}b`), 'ab');
      assert.strictEqual(removeZeroWidth(`a${ZWJ}${THUMBS_UP}`), `a${THUMBS_UP}`);
    });

    test('other characters, line breaks and tabs are kept', () => {
      assert.strictEqual(removeZeroWidth('a\tb\r\nc d'), 'a\tb\r\nc d');
    });
  });

  suite('UNI-006 reveal invisible characters', () => {
    test('invisible characters become <U+XXXX>', () => {
      assert.strictEqual(revealInvisible('a​b', BUDGET), 'a<U+200B>b');
      assert.strictEqual(revealInvisible('﻿x y\u0007‮ ', BUDGET), '<U+FEFF>x<U+00A0>y<U+0007><U+202E><U+2028>');
    });

    test('tab, line breaks, space and ideographic space stay', () => {
      assert.strictEqual(revealInvisible('a\tb c　d\r\ne\n', BUDGET), 'a\tb c　d\r\ne\n');
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
      const text = `a​ b\u{E0061}${FAMILY}⁦`;
      assert.strictEqual(fromCodePoints(revealInvisible(text, BUDGET)), text);
    });

    test('a result over the budget throws', () => {
      assert.throws(() => revealInvisible('​'.repeat(10), 79), EncOutputTooLargeError);
      assert.strictEqual(revealInvisible('​'.repeat(10), 80).length, 80);
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
      assert.strictEqual(fromCodePoints('a<U+200B>b'), 'a​b');
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
      assert.strictEqual(toUtf8Bytes('😀é', '\r\n', BUDGET), '😀: F0 9F 98 80\r\né: 65 CC 81');
    });

    test('UNI-009: white space, line breaks and invisible characters are labelled by code point', () => {
      assert.strictEqual(toUtf8Bytes(' \t\r\n​ ', '\n', BUDGET),
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
      assert.strictEqual(countGraphemesMessage(['é\r\n']), '2 graphemes / length 4');
    });

    test('nothing to count', () => {
      assert.throws(() => countGraphemesMessage(['']), UniNoTargetError);
    });
  });

  suite('UNI-012..015 removing characters and emoji', () => {
    test('UNI-012: C0 (except tab / LF / CR), DEL and C1 are removed', () => {
      assert.strictEqual(removeControl('a\u0007b'), 'ab');
      assert.strictEqual(removeControl('\u0000a\tb\r\nc\u000B\u000C\u001B\u007F\u0080\u0085\u009Fd '), 'a\tb\r\ncd ');
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

  suite('large selections', () => {
    // A mix of ASCII, kana, a surrogate pair, a combining mark, emoji sequences and zero-width
    // characters, repeated to the input limit.
    const unit = `ab あ𠮷é​${FAMILY}${JAPAN}\r\n`;
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

    test('a selection over 1,000,000 characters is refused by every transform', () => {
      const tooLong = 'a'.repeat(1_000_001);
      UNI_COMMAND_ENTRIES.filter((entry) => entry.transform !== undefined).forEach((entry) => {
        throwsInput(() => entry.transform!(tooLong, { eol: '\n' }, MAX_OUTPUT_LENGTH), 'the selection is longer than 1,000,000 characters');
      });
    });
  });
});
