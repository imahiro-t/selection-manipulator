import * as assert from 'assert';
import { EncOutputTooLargeError } from '../../handler/encodeTransforms';
import { findGenPromptProblem, GenInputError } from '../../handler/genCommon';
import {
  alphaSequence,
  bracedGuid,
  checkCircledCount,
  checkDateSequence,
  checkHexSequence,
  checkIpv4Sequence,
  checkKanaCount,
  checkRomanCount,
  circledSequence,
  columnRuler,
  dateSequence,
  defaultStartDate,
  formatIpv4,
  GOJUON,
  hexSequence,
  IROHA,
  ipv4Sequence,
  kanaOf,
  kanaSequence,
  numberRange,
  parseHexStart,
  parseIpv4,
  parseNumberRange,
  parseRepeatPattern,
  parseStartDate,
  repeatToWidth,
  romanSequence,
  toCircled,
  toRoman,
} from '../../handler/genSequence';
import { fakeRandom, GEN_TEST_NOW } from './genTestUtils';

const inputError = (pattern?: RegExp) => (error: unknown) =>
  error instanceof GenInputError && (pattern === undefined || pattern.test(error.message));

const seq = (count: number, make: (index: number) => string): string[] => Array.from({ length: count }, (_, i) => make(i));

suite('Generator Sequences (GEN-020..030) Test Suite', () => {
  suite('GEN-020 Alphabet Sequence', () => {
    test('the ROADMAP example and z → aa', () => {
      assert.deepStrictEqual(seq(3, alphaSequence), ['a', 'b', 'c']);
      assert.strictEqual(alphaSequence(25), 'z');
      assert.strictEqual(alphaSequence(26), 'aa');
      assert.strictEqual(alphaSequence(27), 'ab');
      assert.strictEqual(alphaSequence(51), 'az');
      assert.strictEqual(alphaSequence(52), 'ba');
      assert.strictEqual(alphaSequence(701), 'zz');
      assert.strictEqual(alphaSequence(702), 'aaa');
      // The largest number of targets (100,000).
      assert.strictEqual(alphaSequence(99_999), 'eqxd');
    });
  });

  suite('GEN-021 Roman Numeral Sequence', () => {
    test('the ROADMAP example and well-known numerals', () => {
      assert.deepStrictEqual(seq(4, romanSequence), ['I', 'II', 'III', 'IV']);
      assert.deepStrictEqual([9, 14, 40, 90, 400, 1994, 2026, 3999].map(toRoman),
        ['IX', 'XIV', 'XL', 'XC', 'CD', 'MCMXCIV', 'MMXXVI', 'MMMCMXCIX']);
      assert.strictEqual(romanSequence(3998), 'MMMCMXCIX');
    });

    test('3,999 targets pass, 4,000 are refused', () => {
      checkRomanCount(3999);
      assert.throws(() => checkRomanCount(4000), inputError(/4,000 selections and cursors, but the Roman numeral sequence .* has only 3,999 values/));
      assert.throws(() => toRoman(4000), RangeError);
      assert.throws(() => toRoman(0), RangeError);
    });
  });

  suite('GEN-022 Date Sequence', () => {
    test('the ROADMAP example, month and leap-year boundaries', () => {
      const first = parseStartDate('2026-09-28');
      assert.deepStrictEqual(seq(3, (i) => dateSequence(first, i)), ['2026-09-28', '2026-09-29', '2026-09-30']);
      assert.deepStrictEqual(seq(3, (i) => dateSequence(parseStartDate(' 2024-02-28 '), i)), ['2024-02-28', '2024-02-29', '2024-03-01']);
      assert.deepStrictEqual(seq(2, (i) => dateSequence(parseStartDate('2025-12-31'), i)), ['2025-12-31', '2026-01-01']);
      assert.strictEqual(dateSequence(parseStartDate('0001-01-01'), 0), '0001-01-01');
    });

    test('the default is today (local time)', () => {
      assert.strictEqual(defaultStartDate(GEN_TEST_NOW()), '2026-09-29');
      assert.strictEqual(defaultStartDate(new Date(5, 0, 2)), '1905-01-02');
    });

    test('invalid dates and dates past 9999-12-31 are refused', () => {
      for (const text of ['2026-9-28', '2026/09/28', '2026-02-30', '0000-01-01', '2026-13-01', '', 'today']) {
        assert.throws(() => parseStartDate(text), inputError(), text);
      }
      const last = parseStartDate('9999-12-31');
      checkDateSequence(last, 1);
      assert.throws(() => checkDateSequence(last, 2), inputError(/past 9999-12-31 \(2 selections and cursors from 9999-12-31\)/));
      checkDateSequence(parseStartDate('9999-12-30'), 2);
    });
  });

  suite('GEN-023 Number Range', () => {
    const lines = (text: string, eol = '\n') => numberRange(parseNumberRange(text), eol, 10_000_000);

    test('the ROADMAP example and the forms of the input', () => {
      assert.strictEqual(lines('1..10 step 3'), '1\n4\n7\n10');
      assert.strictEqual(lines('1..10 STEP 3', '\r\n'), '1\r\n4\r\n7\r\n10');
      assert.strictEqual(lines(' 1 .. 5step2 '), '1\n3\n5');
      assert.strictEqual(lines('1..3'), '1\n2\n3');
      assert.strictEqual(lines('3..1'), '3\n2\n1');
      assert.strictEqual(lines('10..1 step -4'), '10\n6\n2');
      assert.strictEqual(lines('-2..2 step +2'), '-2\n0\n2');
      assert.strictEqual(lines('5..5'), '5');
      assert.strictEqual(lines('1..10 step 100'), '1');
      assert.strictEqual(lines('-0..0'), '0');
    });

    test('the ends of the safe integers are exact', () => {
      assert.strictEqual(lines('9007199254740989..9007199254740991'), '9007199254740989\n9007199254740990\n9007199254740991');
      assert.strictEqual(lines('-9007199254740991..-9007199254740990'), '-9007199254740991\n-9007199254740990');
      assert.strictEqual(lines('-9007199254740991..9007199254740991 step 9007199254740991'), '-9007199254740991\n0\n9007199254740991');
    });

    test('the number of terms is exact when end − start is above 2^53 (no term beyond end)', () => {
      // A double rounds 9007199254740995 up to 9007199254740996, which would add a third term.
      assert.strictEqual(lines('-4503599627370496..4503599627370499 step 4503599627370498'), '-4503599627370496\n2');
      // A third term would be 2^53, beyond end and not a safe integer.
      assert.strictEqual(lines('-4..9007199254740991 step 4503599627370498'), '-4\n4503599627370494');
      assert.strictEqual(lines('4503599627370499..-4503599627370496 step -4503599627370498'), '4503599627370499\n1');
    });

    test('100,000 numbers pass, 100,001 are refused', () => {
      assert.strictEqual(parseNumberRange('1..100000').terms, 100_000);
      assert.strictEqual(parseNumberRange('0..199998 step 2').terms, 100_000);
      assert.throws(() => parseNumberRange('1..100001'), inputError(/more than 100,000 numbers/));
      assert.throws(() => parseNumberRange('-9007199254740991..9007199254740991'), inputError(/more than 100,000 numbers/));
    });

    test('invalid ranges are refused', () => {
      assert.throws(() => parseNumberRange('1..10 step 0'), inputError(/must not be 0/));
      assert.throws(() => parseNumberRange('1..10 step -1'), inputError(/must be positive to go from 1 to 10/));
      assert.throws(() => parseNumberRange('10..1 step 1'), inputError(/must be negative/));
      assert.throws(() => parseNumberRange('1..9007199254740992'), inputError(/the end must be an integer/));
      assert.throws(() => parseNumberRange('1..3 step 9007199254740992'), inputError(/the step must be an integer/));
      for (const text of ['1.5..3', '1..', '..3', '1-3', '1..3 by 2', '1..3 step', 'a..b', '']) {
        assert.throws(() => parseNumberRange(text), inputError(/^enter a range of integers/), text);
      }
    });

    test('the output limit is checked while the numbers are joined', () => {
      assert.throws(() => numberRange(parseNumberRange('1..100000'), '\n', 100), EncOutputTooLargeError);
    });
  });

  suite('GEN-024 Repeat Character to Width', () => {
    test('the ROADMAP example; several characters are repeated and cut at the width', () => {
      assert.strictEqual(repeatToWidth(parseRepeatPattern('='), 20), '====================');
      assert.strictEqual(repeatToWidth(parseRepeatPattern('-+'), 5), '-+-+-');
      assert.strictEqual(repeatToWidth(parseRepeatPattern('- '), 4), '- - ');
      assert.strictEqual(repeatToWidth(parseRepeatPattern(' '), 3), '   ');
      assert.strictEqual(repeatToWidth(parseRepeatPattern('abc'), 1), 'a');
    });

    test('the width counts code points (surrogate pairs are never cut)', () => {
      assert.strictEqual(repeatToWidth(parseRepeatPattern('😀'), 3), '😀😀😀');
      assert.strictEqual(repeatToWidth(parseRepeatPattern('😀x'), 3), '😀x😀');
      assert.strictEqual(repeatToWidth(parseRepeatPattern('─'), 10_000).length, 10_000);
    });

    test('1 to 16 characters without line breaks or control characters', () => {
      assert.strictEqual(parseRepeatPattern('0123456789abcdef').length, 16);
      assert.strictEqual(parseRepeatPattern('😀'.repeat(16)).length, 16);
      assert.throws(() => parseRepeatPattern('0123456789abcdefg'), inputError(/^enter 1 to 16 characters/));
      assert.throws(() => parseRepeatPattern(''), inputError(/^enter 1 to 16 characters/));
      for (const text of ['a\nb', '\t', '\r', '\u0000', '\u007f', '\u0085', '\u2028', '\ud800', 'x\udc00']) {
        assert.throws(() => parseRepeatPattern(text), inputError(/control characters/), JSON.stringify(text));
      }
      assert.throws(() => repeatToWidth(['='], 10_001), RangeError);
      assert.throws(() => repeatToWidth(['='], 0), RangeError);
    });

    test('the spaces around the characters are kept by the input box check', () => {
      const rule = { kind: 'parse' as const, parse: (value: string) => parseRepeatPattern(value), keepSpaces: true };
      assert.strictEqual(findGenPromptProblem(' ', rule), undefined);
      assert.strictEqual(findGenPromptProblem('', rule), 'Enter 1 to 16 characters to repeat.');
      assert.strictEqual(findGenPromptProblem(' '.repeat(17), rule), 'Enter 1 to 16 characters to repeat.');
    });
  });

  suite('GEN-025 Hex Sequence', () => {
    const hex = (text: string, count: number) => {
      const start = parseHexStart(text);
      checkHexSequence(start, count);
      return seq(count, (i) => hexSequence(start, i));
    };

    test('the ROADMAP example; the prefix, the width and the case are kept', () => {
      assert.deepStrictEqual(hex('0x0A', 3), ['0x0A', '0x0B', '0x0C']);
      assert.deepStrictEqual(hex('0X0a', 2), ['0X0a', '0X0b']);
      assert.deepStrictEqual(hex('0A', 2), ['0A', '0B']);
      assert.deepStrictEqual(hex('ff', 3), ['ff', '100', '101']);
      assert.deepStrictEqual(hex('FE', 3), ['FE', 'FF', '100']);
      assert.deepStrictEqual(hex('0x09', 2), ['0x09', '0x0A']);
      assert.deepStrictEqual(hex('0x00', 2), ['0x00', '0x01']);
      assert.deepStrictEqual(hex('aF', 2), ['AF', 'B0']);
      assert.deepStrictEqual(hex(' 0x0000 ', 1), ['0x0000']);
    });

    test('up to 13 digits; the last value must not exceed 2^53 − 1', () => {
      assert.deepStrictEqual(hex('0xFFFFFFFFFFFFF', 2), ['0xFFFFFFFFFFFFF', '0x10000000000000']);
      assert.throws(() => parseHexStart('0x10000000000000'), inputError(/at most 13 hexadecimal digits/));
      // Not reachable with 13 digits and 100,000 targets, but checked anyway.
      const near = { value: Number.MAX_SAFE_INTEGER - 1, prefix: '', width: 1, upper: true };
      checkHexSequence(near, 2);
      assert.throws(() => checkHexSequence(near, 3), inputError(/exceed 1FFFFFFFFFFFFF/));
    });

    test('invalid values are refused', () => {
      for (const text of ['', '0x', 'xyz', '0xG1', '-1', '0x 1', '#ff', '0xx1']) {
        assert.throws(() => parseHexStart(text), inputError(/^enter a hexadecimal number/), text);
      }
    });
  });

  suite('GEN-026 Kana Sequence', () => {
    test('the gojūon order has exactly 46 kana, without repeats, with を and ん, without ゐ and ゑ', () => {
      const kana = Array.from(GOJUON);
      assert.strictEqual(kana.length, 46);
      assert.strictEqual(new Set(kana).size, 46);
      assert.ok(kana.includes('を') && kana.includes('ん'));
      assert.ok(!kana.includes('ゐ') && !kana.includes('ゑ'));
      assert.deepStrictEqual(kanaOf('gojuon'), kana);
    });

    test('the iroha order has exactly 47 kana, without repeats, with ヰ and ヱ', () => {
      const kana = Array.from(IROHA);
      assert.strictEqual(kana.length, 47);
      assert.strictEqual(new Set(kana).size, 47);
      assert.ok(kana.includes('ヰ') && kana.includes('ヱ') && !kana.includes('ン'));
    });

    test('the ROADMAP example; the sequences do not wrap around', () => {
      assert.deepStrictEqual(seq(3, (i) => kanaSequence('gojuon', i)), ['あ', 'い', 'う']);
      assert.deepStrictEqual(seq(3, (i) => kanaSequence('iroha', i)), ['イ', 'ロ', 'ハ']);
      assert.strictEqual(kanaSequence('gojuon', 45), 'ん');
      assert.strictEqual(kanaSequence('iroha', 46), 'ス');
      checkKanaCount('gojuon', 46);
      checkKanaCount('iroha', 47);
      assert.throws(() => checkKanaCount('gojuon', 47), inputError(/47 selections and cursors, but the gojūon order \(あ to ん\) has only 46 values/));
      assert.throws(() => checkKanaCount('iroha', 48), inputError(/has only 47 values/));
      assert.throws(() => checkKanaCount('katakana', 1), RangeError);
      assert.throws(() => kanaSequence('gojuon', 46), RangeError);
      assert.throws(() => kanaOf('katakana'), RangeError);
    });
  });

  suite('GEN-027 Circled Number Sequence', () => {
    test('the ROADMAP example and the three Unicode blocks', () => {
      assert.deepStrictEqual(seq(3, circledSequence), ['①', '②', '③']);
      assert.deepStrictEqual([20, 21, 35, 36, 50].map(toCircled), ['⑳', '㉑', '㉟', '㊱', '㊿']);
      const all = seq(50, circledSequence);
      assert.strictEqual(new Set(all).size, 50);
      all.forEach((c) => assert.strictEqual(c.length, 1));
    });

    test('50 targets pass, 51 are refused', () => {
      checkCircledCount(50);
      assert.throws(() => checkCircledCount(51), inputError(/51 selections and cursors, but the circled number sequence \(① to ㊿\) has only 50 values/));
      assert.throws(() => toCircled(51), RangeError);
    });
  });

  suite('GEN-028 Column Ruler', () => {
    test('the ROADMAP example (30 columns)', () => {
      assert.strictEqual(columnRuler(30, '\n'), '·········1·········2·········3\n123456789012345678901234567890');
    });

    test('the line break of the document; columns 100 and above; the limits', () => {
      assert.strictEqual(columnRuler(1, '\r\n'), '·\r\n1');
      const [tens, ones] = columnRuler(1000, '\n').split('\n');
      assert.strictEqual(tens.length, 1000);
      assert.strictEqual(ones.length, 1000);
      assert.strictEqual(tens[99], '0');
      assert.strictEqual(tens[109], '1');
      assert.strictEqual(tens[999], '0');
      assert.strictEqual(ones.slice(90, 100), '1234567890');
      assert.throws(() => columnRuler(1001, '\n'), RangeError);
      assert.throws(() => columnRuler(0, '\n'), RangeError);
    });
  });

  suite('GEN-029 GUID (Braced Uppercase)', () => {
    test('the UUID of the random source in upper case between braces', () => {
      assert.strictEqual(bracedGuid(fakeRandom()), '{3F2504E0-4F89-41D3-9A0C-0305E82C3301}');
    });
  });

  suite('GEN-030 IPv4 Sequence', () => {
    test('the ROADMAP example and carrying into the next part', () => {
      const first = parseIpv4('192.0.2.1');
      assert.deepStrictEqual(seq(3, (i) => ipv4Sequence(first, i)), ['192.0.2.1', '192.0.2.2', '192.0.2.3']);
      assert.deepStrictEqual(seq(2, (i) => ipv4Sequence(parseIpv4('10.0.0.255'), i)), ['10.0.0.255', '10.0.1.0']);
      assert.deepStrictEqual(seq(2, (i) => ipv4Sequence(parseIpv4('10.255.255.255'), i)), ['10.255.255.255', '11.0.0.0']);
      assert.strictEqual(formatIpv4(parseIpv4(' 0.0.0.0 ')), '0.0.0.0');
      assert.strictEqual(parseIpv4('255.255.255.255'), 0xffffffff);
    });

    test('the last address must not go past 255.255.255.255', () => {
      checkIpv4Sequence(parseIpv4('255.255.255.254'), 2);
      assert.throws(() => checkIpv4Sequence(parseIpv4('255.255.255.254'), 3), inputError(/past 255\.255\.255\.255 \(3 selections and cursors from 255\.255\.255\.254\)/));
    });

    test('strict dotted decimal only', () => {
      for (const text of ['192.0.2', '192.0.2.1.5', '192.0.2.256', '192.0.02.1', '01.0.0.0', '1.2.3.-4', '0x1.2.3.4', '1.2.3.4/24', '', '1234.1.1.1']) {
        assert.throws(() => parseIpv4(text), inputError(), text);
      }
    });
  });
});
