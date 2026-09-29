/**
 * Pure (vscode-independent) conversions of the JA-001..035 Japanese text commands (plan 2-4), one
 * function per conversion. The functions that read one value per line convert only that value
 * and throw `JaInputError` (the caller adds the line number); the others convert the whole text.
 *
 * Only local processing: no network, files or processes, no `eval` / `new Function`, no new
 * dependency. No regular expression is built from the user's text.
 */
import { JaInputError, quoteText } from './jaCommon';
import {
  DAIJI_DIGITS,
  DAIJI_LARGE_UNITS,
  DAIJI_SMALL_UNITS,
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
