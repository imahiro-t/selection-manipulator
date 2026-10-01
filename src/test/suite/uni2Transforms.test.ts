import * as assert from 'assert';
import { EncOutputTooLargeError } from '../../handler/encodeTransforms';
import {
  escapePython,
  fromRegionalIndicators,
  toMathDoubleStruck,
  toMathFraktur,
  toMathScript,
  toRegionalIndicators,
  toSmallCapitals,
} from '../../handler/uni2Convert';
import { MATH_DOUBLE_STRUCK, MATH_FRAKTUR, MATH_HOLES, MATH_SCRIPT, MathStyle } from '../../handler/uniTables';

const BUDGET = 10_000_000;
const UPPER = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
const LOWER = 'abcdefghijklmnopqrstuvwxyz';
const DIGITS = '0123456789';
const UNASSIGNED = /\p{Cn}/u;

/** Every code point that the letters of a style would take without the holes. */
const plainCodes = (style: MathStyle): number[] => [
  ...[...UPPER].map((_ch, i) => style.upper + i),
  ...[...LOWER].map((_ch, i) => style.lower + i),
  ...(style.digits === undefined ? [] : [...DIGITS].map((_ch, i) => style.digits! + i)),
];

suite('Extended Unicode Conversions (JAUNIX-008..014) Test Suite', () => {
  suite('JAUNIX-008..010 mathematical styles', () => {
    const styles: [string, (text: string) => string, MathStyle, string][] = [
      ['script', toMathScript, MATH_SCRIPT, '𝒜𝒷𝒸'],
      ['fraktur', toMathFraktur, MATH_FRAKTUR, '𝔄𝔟𝔠'],
      ['double-struck', toMathDoubleStruck, MATH_DOUBLE_STRUCK, '𝔸𝕓𝕔'],
    ];
    for (const [name, convert, style, abc] of styles) {
      test(`${name}: every letter is an assigned character that NFKC turns back into the letter`, () => {
        assert.strictEqual(convert('Abc'), abc);
        const letters = UPPER + LOWER + (style.digits === undefined ? '' : DIGITS);
        const styled = convert(letters);
        assert.strictEqual([...styled].length, letters.length);
        assert.doesNotMatch(styled, UNASSIGNED);
        assert.strictEqual(styled.normalize('NFKC'), letters);
      });

      test(`${name}: the holes are exactly the unassigned code points of the style`, () => {
        for (const code of plainCodes(style)) {
          const unassigned = UNASSIGNED.test(String.fromCodePoint(code));
          assert.strictEqual(MATH_HOLES.has(code), unassigned, code.toString(16));
        }
      });
    }

    test('digits stay in script and fraktur; other characters stay', () => {
      assert.strictEqual(toMathScript('a1 é!'), '𝒶1 é!');
      assert.strictEqual(toMathFraktur('Z9'), 'ℨ9');
      assert.strictEqual(toMathDoubleStruck('Ab1 RZ'), '𝔸𝕓𝟙 ℝℤ');
      assert.strictEqual(toMathScript('BEFHILMRegoh'), 'ℬℰℱℋℐℒℳℛℯℊℴ𝒽');
      assert.strictEqual(toMathFraktur('CHIRZ'), 'ℭℌℑℜℨ');
      assert.strictEqual(toMathDoubleStruck('CHNPQRZ'), 'ℂℍℕℙℚℝℤ');
    });
  });

  suite('JAUNIX-011 small capitals', () => {
    test('a-z except x; upper case and the rest stay', () => {
      assert.strictEqual(toSmallCapitals(LOWER), 'ᴀʙᴄᴅᴇꜰɢʜɪᴊᴋʟᴍɴᴏᴘꞯʀꜱᴛᴜᴠᴡxʏᴢ');
      assert.strictEqual(toSmallCapitals('abc ABC 1 é'), 'ᴀʙᴄ ABC 1 é');
      assert.doesNotMatch(toSmallCapitals(LOWER), UNASSIGNED);
    });
  });

  suite('JAUNIX-012 Python escapes', () => {
    test('\\x, \\u and \\U by the code point, lower-case hexadecimal; ASCII stays', () => {
      assert.strictEqual(escapePython('é😀', BUDGET), '\\xe9\\U0001f600');
      assert.strictEqual(escapePython('a\u007f\u0080ÿĀ￿\u{10000}\u{10ffff}z', BUDGET),
        'a\u007f\\x80\\xff\\u0100\\uffff\\U00010000\\U0010ffffz');
      assert.strictEqual(escapePython('日本\n\\x', BUDGET), '\\u65e5\\u672c\n\\x');
    });

    test('lone surrogates become \\udxxx', () => {
      assert.strictEqual(escapePython('a\ud800b\udfff', BUDGET), 'a\\ud800b\\udfff');
      assert.strictEqual(escapePython('\ude00\ud83d', BUDGET), '\\ude00\\ud83d');
    });

    test('the result is counted against the budget', () => {
      assert.strictEqual(escapePython('ééé', 12), '\\xe9\\xe9\\xe9');
      assert.throws(() => escapePython('ééé', 11), EncOutputTooLargeError);
    });
  });

  suite('JAUNIX-013 / 014 regional indicators', () => {
    test('exactly two ASCII letters not next to another letter become a flag', () => {
      assert.strictEqual(toRegionalIndicators('JP'), '🇯🇵');
      assert.strictEqual(toRegionalIndicators('jp, US; gb.'), '🇯🇵, 🇺🇸; 🇬🇧.');
      assert.strictEqual(toRegionalIndicators('ABC J it2 ZZ'), 'ABC J 🇮🇹2 🇿🇿');
      assert.strictEqual(toRegionalIndicators('éJPé'), 'é🇯🇵é');
    });

    test('regional indicators back to letters (a single one too); a round trip', () => {
      assert.strictEqual(fromRegionalIndicators('🇯🇵'), 'JP');
      assert.strictEqual(fromRegionalIndicators('🇯🇵🇺 x 🇦'), 'JPU x A');
      assert.strictEqual(fromRegionalIndicators(toRegionalIndicators('JP and US')), 'JP and US');
      assert.strictEqual(fromRegionalIndicators('a😀b'), 'a😀b');
    });
  });
});
