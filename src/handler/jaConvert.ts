/**
 * Pure (vscode-independent) conversions of the JA-001..035 Japanese text commands (plan 2-4), one
 * function per conversion. The functions that read one value per line convert only that value
 * and throw `JaInputError` (the caller adds the line number); the others convert the whole text.
 *
 * Only local processing: no network, files or processes, no `eval` / `new Function`, no new
 * dependency. No regular expression is built from the user's text.
 */
import {
  forEachJaLine,
  HIRAGANA_CLASS,
  isHiragana,
  isKanji,
  isKatakana,
  JA_CHAR_CLASS,
  JA_LETTER_CLASS,
  JaInputError,
  JaNoTargetError,
  KANJI_CLASS,
  KATAKANA_CLASS,
  quoteText,
} from './jaCommon';
import { isJisX0208OrX0201 } from './jaJisX0208';
import {
  CIRCLED_NUMBERS,
  DAIJI_DIGITS,
  DAIJI_LARGE_UNITS,
  DAIJI_SMALL_UNITS,
  HIRAGANA_TO_HALFWIDTH,
  KANA_DIGRAPH_ROMAJI,
  KANA_ROMAJI,
  KANJI_DIGITS,
  KANJI_LARGE_UNITS,
  KANJI_SMALL_UNITS,
  KATAKANA_EXTRA_TO_HIRAGANA,
  KYUJITAI_TO_SHINJITAI,
  NUMERAL_DIGIT_VALUES,
  NUMERAL_LARGE_UNIT_VALUES,
  NUMERAL_SMALL_UNIT_VALUES,
  PREFECTURES,
  prefectureShortName,
  ROMAJI_MAX_LENGTH,
  ROMAJI_TO_HIRAGANA,
  SHINJITAI_TO_KYUJITAI,
  SMALL_TO_NORMAL_KANA,
} from './jaTables';

// ---------------------------------------------------------------------------------------------
// JA-001 / 028 / 030: kana to romaji
// ---------------------------------------------------------------------------------------------

export type RomajiSystem = 'hepburn' | 'kunrei';

/** A piece of the text: a kana (as hiragana) or anything else (kept as it is). */
interface KanaToken {
  /** The original text of the piece. */
  original: string;
  /** The hiragana it stands for (undefined when it is not a kana that is converted). */
  kana?: string;
}

const isHalfwidthKana = (code: number): boolean => code >= 0xFF66 && code <= 0xFF9D;
const isHalfwidthVoicedMark = (ch: string | undefined): boolean => ch === 'ﾞ' || ch === 'ﾟ';

/** The hiragana a single full-width kana stands for, or undefined. */
const hiraganaOf = (ch: string): string | undefined => {
  const code = ch.codePointAt(0)!;
  if (ch === 'ー') {
    return 'ー';
  }
  if (code >= 0x3041 && code <= 0x3096) {
    return ch;
  }
  if (code >= 0x30A1 && code <= 0x30F6) {
    return String.fromCodePoint(code - 0x60);
  }
  const extra = KATAKANA_EXTRA_TO_HIRAGANA.get(ch);
  if (extra !== undefined) {
    return extra;
  }
  if (code >= 0x31F0 && code <= 0x31FF) {
    // ㇰ..ㇿ (small katakana for Ainu): read as the normal katakana.
    return hiraganaOf(SMALL_TO_NORMAL_KANA.get(ch)!);
  }
  return undefined;
};

/**
 * Splits the text into kana and other pieces. Half-width katakana (with a following ﾞ / ﾟ) and ｰ
 * are read as their full-width forms; ゝゞヽヾ and everything that is not a kana stay other pieces.
 */
const kanaTokens = (text: string): KanaToken[] => {
  const chars = [...text];
  const tokens: KanaToken[] = [];
  for (let i = 0; i < chars.length; i++) {
    const ch = chars[i];
    const code = ch.codePointAt(0)!;
    if (isHalfwidthKana(code)) {
      const original = isHalfwidthVoicedMark(chars[i + 1]) ? ch + chars[i + 1] : ch;
      const full = original.normalize('NFKC');
      const kana = [...full].length === 1 ? hiraganaOf(full) : undefined;
      if (kana !== undefined) {
        tokens.push({ original, kana });
        i += original.length - 1;
        continue;
      }
      tokens.push({ original: ch, kana: hiraganaOf(ch.normalize('NFKC')) });
      continue;
    }
    tokens.push({ original: ch, kana: hiraganaOf(ch) });
  }
  return tokens;
};

const SMALL_KANA = new Set([...'ぁぃぅぇぉゃゅょゎ']);

interface Syllable {
  romaji: string;
  /** Number of tokens used. */
  length: number;
}

const syllableAt = (tokens: readonly KanaToken[], i: number, system: RomajiSystem): Syllable | undefined => {
  const kana = tokens[i]?.kana;
  if (kana === undefined || kana === 'ー' || kana === 'っ' || kana === 'ん') {
    return undefined;
  }
  const index = system === 'hepburn' ? 0 : 1;
  if (kana.length === 2) {
    // ヷ..ヺ (already two hiragana).
    const pair = KANA_DIGRAPH_ROMAJI.get(kana);
    return pair === undefined ? undefined : { romaji: pair[index], length: 1 };
  }
  const next = tokens[i + 1]?.kana;
  if (next !== undefined && SMALL_KANA.has(next)) {
    const pair = KANA_DIGRAPH_ROMAJI.get(kana + next);
    if (pair !== undefined) {
      return { romaji: pair[index], length: 2 };
    }
  }
  const single = KANA_ROMAJI.get(kana);
  return single === undefined ? undefined : { romaji: single[index], length: 1 };
};

const VOWELS = new Set([...'aeiou']);

/**
 * JA-001 / 028: hiragana and katakana (full-width and half-width) to romaji. ん is `n`, and `n'`
 * before a vowel or `y`; っ doubles the next consonant (`tch` before `ch` in Hepburn) and is
 * `xtsu` (Hepburn) / `xtu` (Kunrei) when no consonant follows; ー repeats the previous vowel
 * (kept as it is after anything else). ヵ ヶ ゕ ゖ are `ka` / `ke`. Everything else is kept.
 */
export const kanaToRomaji = (text: string, system: RomajiSystem): string => {
  const tokens = kanaTokens(text);
  const out: string[] = [];
  let lastVowel: string | undefined;
  let i = 0;
  while (i < tokens.length) {
    const token = tokens[i];
    const kana = token.kana;
    if (kana === undefined) {
      out.push(token.original);
      lastVowel = undefined;
      i++;
      continue;
    }
    if (kana === 'ー') {
      out.push(lastVowel ?? token.original);
      i++;
      continue;
    }
    if (kana === 'っ') {
      const next = syllableAt(tokens, i + 1, system);
      if (next !== undefined && !VOWELS.has(next.romaji[0])) {
        out.push(system === 'hepburn' && next.romaji.startsWith('ch') ? 't' : next.romaji[0]);
      } else {
        out.push(system === 'hepburn' ? 'xtsu' : 'xtu');
      }
      lastVowel = undefined;
      i++;
      continue;
    }
    if (kana === 'ん') {
      const next = syllableAt(tokens, i + 1, system);
      out.push(next !== undefined && (VOWELS.has(next.romaji[0]) || next.romaji[0] === 'y') ? "n'" : 'n');
      lastVowel = undefined;
      i++;
      continue;
    }
    const syllable = syllableAt(tokens, i, system);
    if (syllable === undefined) {
      out.push(token.original);
      lastVowel = undefined;
      i++;
      continue;
    }
    out.push(syllable.romaji);
    const last = syllable.romaji[syllable.romaji.length - 1];
    lastVowel = VOWELS.has(last) ? last : undefined;
    i += syllable.length;
  }
  return out.join('');
};

// ---------------------------------------------------------------------------------------------
// JA-002 / 031: romaji to hiragana
// ---------------------------------------------------------------------------------------------

/** A run of ASCII letters, with `'` between letters. */
const LETTER_RUN = /[A-Za-z]+(?:'[A-Za-z]+)*/g;

const isVowel = (ch: string | undefined): boolean => ch !== undefined && VOWELS.has(ch);
const isLetter = (ch: string | undefined): boolean => ch !== undefined && ch >= 'a' && ch <= 'z';

/** The longest syllable of ROMAJI_TO_HIRAGANA at `i`, or undefined. */
const matchRomaji = (run: string, i: number): { kana: string; length: number } | undefined => {
  for (let length = Math.min(ROMAJI_MAX_LENGTH, run.length - i); length >= 1; length--) {
    const kana = ROMAJI_TO_HIRAGANA.get(run.slice(i, i + length));
    if (kana !== undefined) {
      return { kana, length };
    }
  }
  return undefined;
};

/** One run of letters (lower case) as hiragana, or undefined when any position cannot be read. */
const romajiRunToHiragana = (run: string): string | undefined => {
  let out = '';
  let i = 0;
  while (i < run.length) {
    const c = run[i];
    const next = run[i + 1];
    if (c === 'n' && !(isVowel(next) || next === 'y')) {
      if (next === "'") {
        out += 'ん';
        i += 2;
      } else if (next === 'n' && (isVowel(run[i + 2]) || run[i + 2] === 'y')) {
        out += 'ん';
        i += 1;
      } else if (next === 'n') {
        out += 'ん';
        i += 2;
      } else {
        out += 'ん';
        i += 1;
      }
      continue;
    }
    if (c === 'm' && (next === 'b' || next === 'p')) {
      out += 'ん';
      i += 1;
      continue;
    }
    if (isLetter(c) && !isVowel(c) && c !== 'n' && next === c && matchRomaji(run, i + 1) !== undefined) {
      out += 'っ';
      i += 1;
      continue;
    }
    if (c === 't' && next === 'c' && run[i + 2] === 'h') {
      out += 'っ';
      i += 1;
      continue;
    }
    const match = matchRomaji(run, i);
    if (match === undefined) {
      return undefined;
    }
    out += match.kana;
    i += match.length;
  }
  return out;
};

/**
 * JA-002 / 031: romaji (Hepburn and Kunrei) to hiragana. Each run of ASCII letters is converted
 * only when every part of it can be read (`hello` stays `hello`); everything else is kept.
 */
export const romajiToHiragana = (text: string): string =>
  text.replace(LETTER_RUN, (run) => romajiRunToHiragana(run.toLowerCase()) ?? run);

// ---------------------------------------------------------------------------------------------
// JA-003 / 004 / 005 / 032 / 033: numbers and kanji numerals
// ---------------------------------------------------------------------------------------------

/** The largest number the numeral commands handle: 10^20 - 1 (9999京9999兆9999億9999万9999). */
export const JA_MAX_NUMERAL = 10n ** 20n - 1n;

const toAsciiDigits = (value: string): string =>
  value.replace(/[０-９]/g, (ch) => String.fromCharCode(ch.charCodeAt(0) - 0xFF10 + 0x30));

const INTEGER = /^(?:[0-9]+|[0-9]{1,3}(?:,[0-9]{3})+)$/;

/** A whole number from 0 to JA_MAX_NUMERAL (ASCII / full-width digits, optional `,` every three digits). */
const parseWholeNumber = (value: string): bigint => {
  const ascii = toAsciiDigits(value);
  if (!INTEGER.test(ascii)) {
    throw new JaInputError(`${quoteText(value)} is not a whole number`);
  }
  const number = BigInt(ascii.replace(/,/g, ''));
  if (number > JA_MAX_NUMERAL) {
    throw new JaInputError(`${quoteText(value)} is larger than ${JA_MAX_NUMERAL}`);
  }
  return number;
};

interface NumeralStyle {
  digits: readonly string[];
  smallUnits: readonly string[];
  largeUnits: readonly string[];
  /** Write 壱 before 拾 / 百 / 千 too (daiji). */
  explicitOne: boolean;
}

const KANJI_STYLE: NumeralStyle = { digits: KANJI_DIGITS, smallUnits: KANJI_SMALL_UNITS, largeUnits: KANJI_LARGE_UNITS, explicitOne: false };
const DAIJI_STYLE: NumeralStyle = { digits: DAIJI_DIGITS, smallUnits: DAIJI_SMALL_UNITS, largeUnits: DAIJI_LARGE_UNITS, explicitOne: true };

/** 1..9999 with 十百千 (or 拾百千). */
const groupToNumeral = (group: number, style: NumeralStyle): string => {
  let out = '';
  const parts = [Math.floor(group / 1000), Math.floor(group / 100) % 10, Math.floor(group / 10) % 10];
  parts.forEach((digit, index) => {
    if (digit === 0) {
      return;
    }
    out += (digit === 1 && !style.explicitOne ? '' : style.digits[digit]) + style.smallUnits[2 - index];
  });
  const ones = group % 10;
  return ones === 0 ? out : out + style.digits[ones];
};

const toNumeral = (number: bigint, style: NumeralStyle): string => {
  if (number === 0n) {
    return style.digits[0];
  }
  const groups: number[] = [];
  let rest = number;
  while (rest > 0n) {
    groups.push(Number(rest % 10_000n));
    rest /= 10_000n;
  }
  let out = '';
  for (let k = groups.length - 1; k >= 0; k--) {
    if (groups[k] !== 0) {
      out += groupToNumeral(groups[k], style) + (k === 0 ? '' : style.largeUnits[k - 1]);
    }
  }
  return out;
};

/** JA-003 / 032: one whole number (0..10^20-1) to kanji numerals (`1234` → `千二百三十四`, `10000` → `一万`, `0` → `〇`). */
export const numberToKanji = (value: string): string => toNumeral(parseWholeNumber(value), KANJI_STYLE);

/** JA-005: one whole number (0..10^20-1) to daiji (`123` → `壱百弐拾参`, `0` → `零`). */
export const numberToDaiji = (value: string): string => toNumeral(parseWholeNumber(value), DAIJI_STYLE);

/**
 * JA-004 / 033: one kanji numeral to a number. Accepts place values (`三億五千万`), plain digit
 * sequences (`二〇二六`), ASCII / full-width digits mixed in (`3億5000万`) and daiji
 * (`壱弐参拾萬`). Units out of order (`万万`, `十百`) and anything else are errors.
 */
export const kanjiToNumber = (value: string): string => {
  const notNumeral = (): JaInputError => new JaInputError(`${quoteText(value)} is not a kanji numeral`);
  const chars = [...value];
  if (chars.every((ch) => NUMERAL_DIGIT_VALUES.has(ch))) {
    if (chars.length > 20) {
      throw new JaInputError(`${quoteText(value)} is larger than ${JA_MAX_NUMERAL}`);
    }
    return BigInt(chars.map((ch) => NUMERAL_DIGIT_VALUES.get(ch)!).join('')).toString();
  }
  let total = 0n;
  let section = 0n;
  let run: bigint | undefined;
  let runDigits = 0;
  let lastSmall: bigint | undefined;
  let lastLarge: bigint | undefined;
  /** The digits read since the last unit, which must be smaller than `limit`. */
  const takeRun = (limit: bigint | undefined): bigint => {
    const taken = run ?? 0n;
    if (limit !== undefined && taken >= limit) {
      throw notNumeral();
    }
    run = undefined;
    runDigits = 0;
    return taken;
  };
  for (const ch of chars) {
    const digit = NUMERAL_DIGIT_VALUES.get(ch);
    if (digit !== undefined) {
      if (++runDigits > 20) {
        throw notNumeral();
      }
      run = (run ?? 0n) * 10n + BigInt(digit);
      continue;
    }
    const small = NUMERAL_SMALL_UNIT_VALUES.get(ch);
    if (small !== undefined) {
      if (lastSmall !== undefined && small >= lastSmall) {
        throw notNumeral();
      }
      const multiplier = run === undefined ? 1n : takeRun(10n);
      if (multiplier === 0n) {
        throw notNumeral();
      }
      section += multiplier * small;
      lastSmall = small;
      continue;
    }
    const large = NUMERAL_LARGE_UNIT_VALUES.get(ch);
    if (large !== undefined) {
      if (lastLarge !== undefined && large >= lastLarge) {
        throw notNumeral();
      }
      const sectionValue = section + takeRun(lastSmall);
      if (sectionValue === 0n || sectionValue >= 10_000n) {
        throw notNumeral();
      }
      total += sectionValue * large;
      section = 0n;
      lastSmall = undefined;
      lastLarge = large;
      continue;
    }
    throw notNumeral();
  }
  const rest = section + takeRun(lastSmall ?? (lastLarge === undefined ? undefined : 10_000n));
  if (lastLarge !== undefined && rest >= 10_000n) {
    throw notNumeral();
  }
  total += rest;
  if (total > JA_MAX_NUMERAL) {
    throw new JaInputError(`${quoteText(value)} is larger than ${JA_MAX_NUMERAL}`);
  }
  return total.toString();
};

// ---------------------------------------------------------------------------------------------
// JA-006 / 007: punctuation
// ---------------------------------------------------------------------------------------------

/** JA-006: 、 → ， and 。 → ．. */
export const PUNCTUATION_TO_COMMA: ReadonlyMap<string, string> = new Map([['、', '，'], ['。', '．']]);
/** JA-007: ， → 、 and ． → 。. */
export const PUNCTUATION_TO_TOUTEN: ReadonlyMap<string, string> = new Map([['，', '、'], ['．', '。']]);

// ---------------------------------------------------------------------------------------------
// JA-008 / 009 / 034 and JA-010: character tables
// ---------------------------------------------------------------------------------------------

export { KYUJITAI_TO_SHINJITAI, SHINJITAI_TO_KYUJITAI, SMALL_TO_NORMAL_KANA };

const mapText = (text: string, table: ReadonlyMap<string, string>): string => {
  let out = '';
  for (const ch of text) {
    out += table.get(ch) ?? ch;
  }
  return out;
};

/** JA-008 / 034: old kanji forms to new ones (`國學` → `国学`). */
export const kyujitaiToShinjitai = (text: string): string => mapText(text, KYUJITAI_TO_SHINJITAI);
/** JA-009: new kanji forms to old ones (`国学` → `國學`), except SHINJITAI_NOT_CONVERTED. */
export const shinjitaiToKyujitai = (text: string): string => mapText(text, SHINJITAI_TO_KYUJITAI);
/** JA-010: small kana to normal kana (`きゃっと` → `きやつと`). */
export const smallKanaToNormal = (text: string): string => mapText(text, SMALL_TO_NORMAL_KANA);
/** JA-006: `今日は、晴れ。` → `今日は，晴れ．`. */
export const punctuationToComma = (text: string): string => mapText(text, PUNCTUATION_TO_COMMA);
/** JA-007: `今日は，晴れ．` → `今日は、晴れ。`. */
export const punctuationToTouten = (text: string): string => mapText(text, PUNCTUATION_TO_TOUTEN);

/** Maps every code point of the text with `convert` (surrogate pairs are never split). */
const mapCodePoints = (text: string, convert: (ch: string) => string): string => {
  let out = '';
  for (const ch of text) {
    out += convert(ch);
  }
  return out;
};

const formatCount = (count: number): string => count.toLocaleString('en-US');

// ---------------------------------------------------------------------------------------------
// JA-011: manuscript paper count
// ---------------------------------------------------------------------------------------------

/** Characters of one sheet of Japanese manuscript paper (genko yoshi). */
export const MANUSCRIPT_SHEET = 400;

/**
 * JA-011: the characters of all selections together (code points; line breaks are not counted,
 * spaces are) and the number of 400-character sheets, rounded half up to one decimal place:
 * `1,234 字 / 原稿用紙 3.1 枚`.
 */
export const manuscriptCount = (texts: readonly string[]): string => {
  let count = 0;
  for (const text of texts) {
    for (const ch of text) {
      if (ch !== '\n' && ch !== '\r') {
        count++;
      }
    }
  }
  if (count === 0) {
    throw new JaNoTargetError();
  }
  // Tenths of a sheet, rounded half up with integers only.
  const tenths = Math.floor((count * 10 + MANUSCRIPT_SHEET / 2) / MANUSCRIPT_SHEET);
  return `${formatCount(count)} 字 / 原稿用紙 ${formatCount(Math.floor(tenths / 10))}.${tenths % 10} 枚`;
};

// ---------------------------------------------------------------------------------------------
// JA-012 / 013: ruby notation
// ---------------------------------------------------------------------------------------------

const isRubyBar = (ch: string): boolean => ch === '｜' || ch === '|';

/**
 * The index of the `《` that ends the base text of a `｜base《ruby》` starting at `from`, or -1
 * (the base is not empty and holds no `｜` `|` `《` `》` or line break).
 */
const rubyOpenAfterBar = (text: string, from: number): number => {
  let j = from;
  while (j < text.length) {
    const ch = text[j];
    if (isRubyBar(ch) || ch === '《' || ch === '》' || ch === '\n' || ch === '\r') {
      break;
    }
    j++;
  }
  return j > from && text[j] === '《' ? j : -1;
};

/** The index of the `》` that closes a ruby text starting at `from`, or -1 (empty ruby, `《` or a line break first). */
const rubyClose = (text: string, from: number): number => {
  let j = from;
  while (j < text.length) {
    const ch = text[j];
    if (ch === '《' || ch === '》' || ch === '\n' || ch === '\r') {
      break;
    }
    j++;
  }
  return j > from && text[j] === '》' ? j : -1;
};

/**
 * Replaces every ruby of the text with `render(base, ruby)`: `｜base《ruby》` (or `|`), and
 * `kanji《ruby》` whose base is the run of kanji just before `《`. Everything else (a `｜` without
 * a ruby, `《…》` after anything but a kanji) is kept. Every scan stops at the next `｜` / `《` /
 * line break, so the work is linear in the text.
 */
const replaceRuby = (text: string, render: (base: string, ruby: string) => string): string => {
  let out = '';
  let plainStart = 0;
  let kanjiStart = -1;
  let i = 0;
  while (i < text.length) {
    const ch = String.fromCodePoint(text.codePointAt(i)!);
    if (isRubyBar(ch)) {
      const open = rubyOpenAfterBar(text, i + 1);
      const close = open === -1 ? -1 : rubyClose(text, open + 1);
      if (close !== -1) {
        out += text.slice(plainStart, i) + render(text.slice(i + 1, open), text.slice(open + 1, close));
        i = close + 1;
        plainStart = i;
        kanjiStart = -1;
        continue;
      }
    } else if (ch === '《' && kanjiStart !== -1) {
      const close = rubyClose(text, i + 1);
      if (close !== -1) {
        out += text.slice(plainStart, kanjiStart) + render(text.slice(kanjiStart, i), text.slice(i + 1, close));
        i = close + 1;
        plainStart = i;
        kanjiStart = -1;
        continue;
      }
    }
    if (isKanji(ch)) {
      if (kanjiStart === -1) {
        kanjiStart = i;
      }
    } else {
      kanjiStart = -1;
    }
    i += ch.length;
  }
  return out + text.slice(plainStart);
};

const KANA_CLASS = `${HIRAGANA_CLASS}${KATAKANA_CLASS}`;
/** A reading in parentheses (only kana) right after a kanji: `漢字（かんじ）` / `漢字(かんじ)`. */
const PAREN_READING = new RegExp(`(?<=[${KANJI_CLASS}])(?:（[${KANA_CLASS}]+）|\\([${KANA_CLASS}]+\\))`, 'gu');

/**
 * JA-012: removes ruby: `｜東京《とうきょう》` / `東京《とうきょう》` → `東京`, and a reading of only
 * kana in parentheses right after a kanji (`東京（とうきょう）` → `東京`).
 */
export const removeRuby = (text: string): string => replaceRuby(text, (base) => base).replace(PAREN_READING, '');

const HTML_ESCAPES: Readonly<Record<string, string>> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
const escapeHtml = (value: string): string => value.replace(/[&<>"']/g, (ch) => HTML_ESCAPES[ch]);

/**
 * JA-013: `｜東京《とうきょう》` and `東京《とうきょう》` → `<ruby>東京<rt>とうきょう</rt></ruby>`. The
 * base and the ruby are HTML-escaped; the rest of the text is kept as it is.
 */
export const rubyToHtml = (text: string): string =>
  replaceRuby(text, (base, ruby) => `<ruby>${escapeHtml(base)}<rt>${escapeHtml(ruby)}</rt></ruby>`);

// ---------------------------------------------------------------------------------------------
// JA-014 / 015 / 016: width, spaces and wave dashes
// ---------------------------------------------------------------------------------------------

/** JA-014: full-width ASCII letters, digits and symbols (U+FF01..FF5E) to half-width; kana and the ideographic space are kept. */
export const fullwidthAlnumToHalf = (text: string): string =>
  mapCodePoints(text, (ch) => {
    const code = ch.codePointAt(0)!;
    return code >= 0xFF01 && code <= 0xFF5E ? String.fromCharCode(code - 0xFEE0) : ch;
  });

/** JA-015: the ideographic space U+3000 to a space. */
export const ideographicSpaceToSpace = (text: string): string => text.replace(/　/g, ' ');

export const WAVE_DASH = '〜';
export const FULLWIDTH_TILDE = '～';

/** JA-016: the wave dash 〜 (U+301C) and the full-width tilde ～ (U+FF5E) to `choice` (one of them). */
export const normalizeWaveDash = (text: string, choice: string | undefined): string => {
  if (choice !== WAVE_DASH && choice !== FULLWIDTH_TILDE) {
    throw new JaInputError('choose the wave dash or the full-width tilde');
  }
  return text.replace(/[〜～]/g, choice);
};

// ---------------------------------------------------------------------------------------------
// JA-017: hyphens and long vowel marks
// ---------------------------------------------------------------------------------------------

/** Hyphen-like characters (not the ASCII `-`): ‐ ‑ ‒ – — ― − －. */
const HYPHENS: ReadonlySet<string> = new Set(['‐', '‑', '‒', '–', '—', '―', '−', '－']);
const LONG_VOWEL_MARKS: ReadonlySet<string> = new Set(['ー', 'ｰ']);
const isDigitChar = (ch: string | undefined): boolean => ch !== undefined && /^[0-9０-９]$/.test(ch);
const isHalfwidthKatakana = (ch: string): boolean => {
  const code = ch.codePointAt(0)!;
  return code >= 0xFF66 && code <= 0xFF9F;
};

/**
 * JA-017: a hyphen-like character right after a kana becomes the long vowel mark (`ー`, or `ｰ`
 * after a half-width katakana); a long vowel mark or hyphen-like character between two digits
 * becomes `-` (`コ−ヒ− 03ー1234` → `コーヒー 03-1234`). The ASCII `-` after a kana is kept.
 */
export const normalizeHyphens = (text: string): string => {
  const chars = [...text];
  let out = '';
  let previous: string | undefined;
  for (let i = 0; i < chars.length; i++) {
    const ch = chars[i];
    let result = ch;
    if ((HYPHENS.has(ch) || LONG_VOWEL_MARKS.has(ch)) && isDigitChar(chars[i - 1]) && isDigitChar(chars[i + 1])) {
      result = '-';
    } else if (HYPHENS.has(ch) && previous !== undefined && (isHiragana(previous) || isKatakana(previous))) {
      result = isHalfwidthKatakana(previous) ? 'ｰ' : 'ー';
    }
    out += result;
    previous = result;
  }
  return out;
};

// ---------------------------------------------------------------------------------------------
// JA-018 / 019 / 020: extracting and counting by character type
// ---------------------------------------------------------------------------------------------

/**
 * JA-018: only the kanji of every line (`東京タワーへ行く` → `東京行`). Lines without kanji are
 * dropped; the kept lines keep their line breaks. `ヵ` `ヶ` are katakana, not kanji.
 */
export const extractKanji = (text: string): string => {
  const kept: string[] = [];
  forEachJaLine(text, (line, lineBreak) => {
    let kanji = '';
    for (const ch of line) {
      if (isKanji(ch)) {
        kanji += ch;
      }
    }
    if (kanji !== '') {
      kept.push(kanji, lineBreak);
    }
  });
  // No line break after the last kept line.
  kept.pop();
  return kept.join('');
};

/** Characters that cannot start a katakana word. */
const NOT_WORD_START: ReadonlySet<string> = new Set(['ー', 'ｰ', 'ﾞ', 'ﾟ', '・']);

/**
 * JA-019: the katakana words in text order, one per line (joined with `eol`), repeats kept. A word
 * is the longest run of katakana with `・` only between two katakana, without leading `ー` (`ｰ`
 * `ﾞ` `ﾟ`). A lone `ヵ` or `ヶ` (`3ヶ月`) is not a word.
 */
export const extractKatakanaWords = (text: string, eol: string): string => {
  const chars = [...text];
  const words: string[] = [];
  let i = 0;
  while (i < chars.length) {
    if (!isKatakana(chars[i])) {
      i++;
      continue;
    }
    let j = i;
    let word = '';
    while (j < chars.length) {
      if (isKatakana(chars[j])) {
        word += chars[j];
      } else if (chars[j] === '・' && j + 1 < chars.length && isKatakana(chars[j + 1])) {
        word += '・';
      } else {
        break;
      }
      j++;
    }
    let start = 0;
    while (start < word.length && NOT_WORD_START.has(word[start])) {
      start++;
    }
    const trimmed = word.slice(start);
    if (trimmed !== '' && trimmed !== 'ヵ' && trimmed !== 'ヶ') {
      words.push(trimmed);
    }
    i = j;
  }
  return words.join(eol);
};

/** The character types of JA-020, in the order of the notification. */
export const JA_CHAR_TYPES = ['漢字', 'カタカナ', 'ひらがな', '英数字', '記号', 'その他'] as const;

const WHITE_SPACE = /^\s$/u;
const SYMBOL = /^[\p{P}\p{S}]$/u;
const isAlphanumeric = (code: number): boolean =>
  (code >= 0x30 && code <= 0x39) || (code >= 0x41 && code <= 0x5A) || (code >= 0x61 && code <= 0x7A)
  || (code >= 0xFF10 && code <= 0xFF19) || (code >= 0xFF21 && code <= 0xFF3A) || (code >= 0xFF41 && code <= 0xFF5A);

/**
 * The index in JA_CHAR_TYPES of the code point `ch`, or -1 for white space (not counted). The
 * first matching type wins: kanji, katakana, hiragana (the shared classes), alphanumerics (ASCII
 * and full-width), symbols (Unicode punctuation `\p{P}` or symbol `\p{S}`), others.
 */
export const charTypeOf = (ch: string): number => {
  if (WHITE_SPACE.test(ch)) {
    return -1;
  }
  if (isKanji(ch)) {
    return 0;
  }
  if (isKatakana(ch)) {
    return 1;
  }
  if (isHiragana(ch)) {
    return 2;
  }
  if (isAlphanumeric(ch.codePointAt(0)!)) {
    return 3;
  }
  return SYMBOL.test(ch) ? 4 : 5;
};

/**
 * JA-020: the characters of all selections together by type, types without characters left out:
 * `漢字 2 / カタカナ 3 / ひらがな 1 / 英数字 2`.
 */
export const charTypeCount = (texts: readonly string[]): string => {
  const counts = JA_CHAR_TYPES.map(() => 0);
  for (const text of texts) {
    for (const ch of text) {
      const type = charTypeOf(ch);
      if (type !== -1) {
        counts[type]++;
      }
    }
  }
  const parts = JA_CHAR_TYPES.flatMap((type, index) => (counts[index] === 0 ? [] : [`${type} ${formatCount(counts[index])}`]));
  if (parts.length === 0) {
    throw new JaNoTargetError();
  }
  return parts.join(' / ');
};

// ---------------------------------------------------------------------------------------------
// JA-021 / 022 / 023: circled numbers, prefectures and postal codes
// ---------------------------------------------------------------------------------------------

const CIRCLED_TO_PAREN: ReadonlyMap<string, string> = new Map(
  [...CIRCLED_NUMBERS].map(([ch, value]) => [ch, `(${value})`])
);

/** JA-021: circled and parenthesized numbers (⓪ ①..㊿ ⑴..⒇) to `(1)` (`①②` → `(1)(2)`). */
export const circledNumberToParen = (text: string): string => mapCodePoints(text, (ch) => CIRCLED_TO_PAREN.get(ch) ?? ch);

/** Official and short names of the prefectures → their JIS X 0401 codes. */
const PREFECTURE_CODES: ReadonlyMap<string, number> = new Map(
  PREFECTURES.flatMap((name, index) => [[name, index + 1], [prefectureShortName(name), index + 1]] as [string, number][])
);

/**
 * JA-022: one value per line. A prefecture name (official `東京都` or short `東京`) → its
 * two-digit JIS X 0401 code (`13`); a code (`13`, `1`, `01`, full-width digits) → the official name.
 */
export const prefectureCode = (value: string): string => {
  const digits = toAsciiDigits(value);
  if (/^[0-9]{1,2}$/.test(digits)) {
    const code = Number(digits);
    if (code >= 1 && code <= PREFECTURES.length) {
      return PREFECTURES[code - 1];
    }
    throw new JaInputError(`${quoteText(value)} is not a prefecture code (01-47)`);
  }
  const code = PREFECTURE_CODES.get(value);
  if (code === undefined) {
    throw new JaInputError(`${quoteText(value)} is not a prefecture name or code`);
  }
  return String(code).padStart(2, '0');
};

const POSTAL_CODE = /^([0-9]{3})-?([0-9]{4})$/;

/**
 * JA-023: one value per line. Seven digits (full-width digits, a `-` / `－` after the third digit
 * and a leading `〒` are accepted) → `〒100-0001`.
 */
export const formatPostalCode = (value: string): string => {
  const match = POSTAL_CODE.exec(toAsciiDigits(value).replace(/^〒[ \t　]*/u, '').replace('－', '-'));
  if (match === null) {
    throw new JaInputError(`${quoteText(value)} is not a 7-digit postal code`);
  }
  return `〒${match[1]}-${match[2]}`;
};

// ---------------------------------------------------------------------------------------------
// JA-024 .. 027: kana and spacing
// ---------------------------------------------------------------------------------------------

/**
 * JA-024: hiragana to half-width katakana (`がっこう` → `ｶﾞｯｺｳ`, voiced marks separated). A `ー`
 * right after a converted hiragana (or a converted `ー`) becomes `ｰ` (`すごーい` → `ｽｺﾞｰｲ`).
 * Katakana, a `ー` after katakana, punctuation, alphanumerics and ゎ ゐ ゑ are kept.
 */
export const hiraganaToHalfwidthKatakana = (text: string): string => {
  let out = '';
  let afterConverted = false;
  for (const ch of text) {
    const converted = HIRAGANA_TO_HALFWIDTH.get(ch);
    if (converted !== undefined) {
      out += converted;
      afterConverted = true;
    } else if (ch === 'ー' && afterConverted) {
      out += 'ｰ';
    } else {
      out += ch;
      afterConverted = false;
    }
  }
  return out;
};

/** Spaces, tabs and ideographic spaces between two Japanese characters (not line breaks). */
const SPACES_BETWEEN_JAPANESE = new RegExp(`(?<=[${JA_CHAR_CLASS}])[ \\t\\u3000]+(?=[${JA_CHAR_CLASS}])`, 'gu');

/** JA-025: removes the spaces between Japanese characters (`日本 語 の hello world` → `日本語の hello world`). */
export const removeSpacesBetweenJapanese = (text: string): string => text.replace(SPACES_BETWEEN_JAPANESE, '');

/** A boundary between a Japanese letter and an ASCII letter or digit (either order). */
const JA_EN_BOUNDARY = new RegExp(
  `(?<=[${JA_LETTER_CLASS}])(?=[A-Za-z0-9])|(?<=[A-Za-z0-9])(?=[${JA_LETTER_CLASS}])`, 'gu'
);

/** JA-026 / 035: a space between Japanese letters and ASCII letters / digits (`Vue3で開発` → `Vue3 で開発`). */
export const spaceBetweenJaEn = (text: string): string => text.replace(JA_EN_BOUNDARY, ' ');

/** Voiced / semi-voiced sound marks → the combining mark they stand for. */
const SOUND_MARKS: ReadonlyMap<string, string> = new Map([
  ['゙', '゙'], ['゚', '゚'], ['゛', '゙'], ['゜', '゚'],
]);

const isFullwidthKana = (ch: string): boolean => (isHiragana(ch) || isKatakana(ch)) && ch.codePointAt(0)! < 0xFF00;

/**
 * JA-027: a (semi-)voiced sound mark (combining U+3099 / 309A or ゛ ゜) right after a full-width
 * kana is composed with it when the two make one character (`か゛は゜` → `がぱ`, `ウ゛` → `ヴ`).
 * Other pairs are kept; the rest of the text is not normalized.
 */
export const composeDakuten = (text: string): string => {
  const out: string[] = [];
  let previousKana = false;
  for (const ch of text) {
    const mark = SOUND_MARKS.get(ch);
    if (mark !== undefined && previousKana) {
      const composed = (out[out.length - 1] + mark).normalize('NFC');
      if (composed.length === 1) {
        out[out.length - 1] = composed;
        previousKana = false;
        continue;
      }
    }
    out.push(ch);
    previousKana = isFullwidthKana(ch);
  }
  return out.join('');
};

// ---------------------------------------------------------------------------------------------
// JA-029: platform-dependent characters
// ---------------------------------------------------------------------------------------------

/** A range of the text as UTF-16 offsets. */
export interface JaTextRange {
  start: number;
  end: number;
}

/**
 * JA-029: every character outside JIS X 0208 / JIS X 0201 (a surrogate pair is one character),
 * in text order. Line breaks and tabs are never reported. The search stops once more than `limit`
 * characters are found.
 */
export const findPlatformDependent = (text: string, limit = Number.POSITIVE_INFINITY): JaTextRange[] => {
  const ranges: JaTextRange[] = [];
  let offset = 0;
  for (const ch of text) {
    const code = ch.codePointAt(0)!;
    if (ch !== '\n' && ch !== '\r' && ch !== '\t' && !isJisX0208OrX0201(code)) {
      ranges.push({ start: offset, end: offset + ch.length });
      if (ranges.length > limit) {
        break;
      }
    }
    offset += ch.length;
  }
  return ranges;
};
