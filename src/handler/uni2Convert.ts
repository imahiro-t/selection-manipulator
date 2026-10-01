/**
 * Pure (vscode-independent) conversions of the JAUNIX-008..014 Unicode commands (group JAUNI2):
 * mathematical script, fraktur and double-struck letters, small capitals, Python escapes and
 * regional indicator symbols (flags).
 *
 * Only local processing on the code points of the text: every loop is linear, no regular
 * expression is built at run time, and the escape result is counted against the output budget
 * while it is built.
 */
import { toMathStyle } from './uniConvert';
import { UniOutputBuffer } from './uniCommon';
import { MATH_DOUBLE_STRUCK, MATH_FRAKTUR, MATH_SCRIPT, SMALL_CAPITALS } from './uniTables';

/** JAUNIX-008: A-Z and a-z in mathematical script (`Abc` → `𝒜𝒷𝒸`); the digits stay. */
export const toMathScript = (text: string): string => toMathStyle(text, MATH_SCRIPT);

/** JAUNIX-009: A-Z and a-z in mathematical fraktur (`Abc` → `𝔄𝔟𝔠`); the digits stay. */
export const toMathFraktur = (text: string): string => toMathStyle(text, MATH_FRAKTUR);

/** JAUNIX-010: A-Z, a-z and 0-9 in mathematical double-struck (`Ab1` → `𝔸𝕓𝟙`). */
export const toMathDoubleStruck = (text: string): string => toMathStyle(text, MATH_DOUBLE_STRUCK);

/** JAUNIX-011: a-z in small capitals (`abc` → `ᴀʙᴄ`); `x`, the upper-case letters and the rest stay. */
export const toSmallCapitals = (text: string): string => {
  let out = '';
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    out += SMALL_CAPITALS.get(ch) ?? ch;
  }
  return out;
};

const hex = (code: number, width: number): string => code.toString(16).padStart(width, '0');

/**
 * JAUNIX-012: every non-ASCII code point as a Python escape, like `ascii()`: U+0080..00FF as
 * `\xhh`, the rest of the BMP as `\uhhhh` (a lone surrogate too) and the others as `\Uhhhhhhhh`,
 * in lower-case hexadecimal (`é😀` → `\xe9\U0001f600`). ASCII is kept as it is. The result is
 * counted against `budget` piece by piece.
 */
export const escapePython = (text: string, budget: number): string => {
  const out = new UniOutputBuffer(budget);
  let plainStart = 0;
  let i = 0;
  while (i < text.length) {
    const code = text.codePointAt(i)!;
    if (code < 0x80) {
      i++;
      continue;
    }
    out.push(text.slice(plainStart, i));
    if (code <= 0xff) {
      out.push(`\\x${hex(code, 2)}`);
    } else if (code <= 0xffff) {
      out.push(`\\u${hex(code, 4)}`);
    } else {
      out.push(`\\U${hex(code, 8)}`);
    }
    i += code > 0xffff ? 2 : 1;
    plainStart = i;
  }
  out.push(text.slice(plainStart));
  return out.join();
};

/** Regional indicator symbol letter A (U+1F1E6); Z is U+1F1FF. */
const REGIONAL_A = 0x1f1e6;
const REGIONAL_Z = 0x1f1ff;

const isAsciiLetterCode = (code: number): boolean => (code >= 0x41 && code <= 0x5a) || (code >= 0x61 && code <= 0x7a);

const regionalOf = (code: number): string => String.fromCodePoint(REGIONAL_A + ((code | 0x20) - 0x61));

/**
 * JAUNIX-013: every run of exactly two ASCII letters (not next to another ASCII letter; either
 * case) becomes two regional indicator symbols, which show as a flag (`JP` → `🇯🇵`). The codes are
 * not checked against ISO 3166-1, so any two letters (also words such as `is` or `OK`) are
 * converted; an unassigned pair shows as two letters in boxes. Longer and shorter runs stay.
 */
export const toRegionalIndicators = (text: string): string => {
  let out = '';
  let i = 0;
  while (i < text.length) {
    const code = text.charCodeAt(i);
    if (!isAsciiLetterCode(code)) {
      out += text[i];
      i++;
      continue;
    }
    let end = i;
    while (end < text.length && isAsciiLetterCode(text.charCodeAt(end))) {
      end++;
    }
    out += end - i === 2 ? regionalOf(code) + regionalOf(text.charCodeAt(i + 1)) : text.slice(i, end);
    i = end;
  }
  return out;
};

/**
 * JAUNIX-014: every regional indicator symbol becomes its upper-case ASCII letter, so a flag
 * becomes its two-letter code (`🇯🇵` → `JP`) and a symbol without a partner becomes one letter.
 */
export const fromRegionalIndicators = (text: string): string => {
  let out = '';
  let i = 0;
  while (i < text.length) {
    const code = text.codePointAt(i)!;
    if (code >= REGIONAL_A && code <= REGIONAL_Z) {
      out += String.fromCharCode(0x41 + code - REGIONAL_A);
      i += 2;
      continue;
    }
    out += text[i];
    i++;
  }
  return out;
};
