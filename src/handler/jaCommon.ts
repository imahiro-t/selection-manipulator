/**
 * Shared, vscode-independent helpers of the JA-001..035 Japanese text commands: the errors, the
 * limits, the line-by-line and character-by-character processing and the character classes that
 * every command uses (no command defines its own class of kanji / kana / Japanese characters).
 *
 * Security rules (SECURITY.md): nothing here evaluates code, no regular expression is built from
 * the user's text (the classes below are built once from constants), every loop is linear in the
 * input, and the results are counted against the output limit.
 */
import { quoteForDisplay } from '../textFormat';
import { EncOutputTooLargeError, MAX_OUTPUT_LENGTH } from './encodeTransforms';

export { MAX_OUTPUT_LENGTH };

/** The selected text cannot be used; the message is shown to the user as it is. */
export class JaInputError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'JaInputError';
  }
}

/**
 * The selections hold nothing the command can work on (for example only ideographic spaces for a
 * count): treated like empty selections, with the same warning.
 */
export class JaNoTargetError extends JaInputError {
  constructor() {
    super('the selection has nothing to work on');
    this.name = 'JaNoTargetError';
  }
}

/** Upper limit of the length (UTF-16 code units) of one selection. */
export const JA_MAX_INPUT_LENGTH = 1_000_000;
/** Maximum number of characters of the selected text quoted in a message. */
export const JA_MESSAGE_TEXT_LIMIT = 60;

/** `text` quoted like JSON and cut to JA_MESSAGE_TEXT_LIMIT characters (for messages). */
export const quoteText = (text: string): string => quoteForDisplay(text, JA_MESSAGE_TEXT_LIMIT);

export const assertJaInputLength = (text: string): void => {
  if (text.length > JA_MAX_INPUT_LENGTH) {
    throw new JaInputError(`the selection is longer than ${JA_MAX_INPUT_LENGTH.toLocaleString('en-US')} characters`);
  }
};

/** True when the text holds only spaces, tabs and line breaks (or nothing). */
export const isBlank = (text: string): boolean => !/[^ \t\r\n]/.test(text);

/** Throws `EncOutputTooLargeError` when a result of `length` characters exceeds `budget`. */
export const assertWithinBudget = (length: number, budget: number): void => {
  if (length > budget) {
    throw new EncOutputTooLargeError(length, MAX_OUTPUT_LENGTH);
  }
};

/**
 * Collects pieces of a result and throws `EncOutputTooLargeError` as soon as their total length
 * exceeds `budget` (what is left of MAX_OUTPUT_LENGTH for this selection).
 */
export class JaOutputBuffer {
  private readonly parts: string[] = [];
  private total = 0;

  constructor(private readonly budget: number) { }

  get length(): number {
    return this.total;
  }

  push(part: string): void {
    assertWithinBudget(this.total + part.length, this.budget);
    this.total += part.length;
    this.parts.push(part);
  }

  join(): string {
    return this.parts.join('');
  }
}

// ---------------------------------------------------------------------------------------------
// Lines
// ---------------------------------------------------------------------------------------------

const SPACE_TAB = /^[ \t]*/;

/** One line of a selection split into the spaces / tabs before the value, the value and those after it. */
interface LineParts {
  lead: string;
  value: string;
  trail: string;
}

const splitLine = (line: string): LineParts => {
  const lead = SPACE_TAB.exec(line)![0];
  let trailStart = line.length;
  while (trailStart > lead.length && (line.charCodeAt(trailStart - 1) === 0x20 || line.charCodeAt(trailStart - 1) === 0x09)) {
    trailStart--;
  }
  return { lead, value: line.slice(lead.length, trailStart), trail: line.slice(trailStart) };
};

/**
 * Calls `visit` for every line of the text with the line itself and the line break after it
 * (`''` for the last line). LF and CRLF are recognised.
 */
export const forEachJaLine = (text: string, visit: (line: string, lineBreak: string, lineNumber: number) => void): void => {
  let start = 0;
  let lineNumber = 1;
  for (;;) {
    const newline = text.indexOf('\n', start);
    const end = newline === -1 ? text.length : newline;
    const breakStart = end > start && text.charCodeAt(end - 1) === 0x0d ? end - 1 : end;
    visit(text.slice(start, breakStart), newline === -1 ? '' : text.slice(breakStart, newline + 1), lineNumber);
    if (newline === -1) {
      return;
    }
    start = newline + 1;
    lineNumber++;
  }
};

/** Prefixes the message of an input error with `line N: `. */
const atLine = (lineNumber: number, error: unknown): unknown =>
  error instanceof JaInputError ? new JaInputError(`line ${lineNumber}: ${error.message}`) : error;

/**
 * Applies `convert` to the value of every line of the selection (one value per line). The line
 * breaks (LF / CRLF) and the spaces / tabs around each value are kept; an empty (or blank) line
 * stays as it is and is not passed to `convert`. A value that cannot be converted stops everything
 * with `line N: <reason>`. The result is counted against `budget` piece by piece.
 */
export const mapJaLines = (text: string, budget: number, convert: (value: string) => string): string => {
  assertJaInputLength(text);
  const output = new JaOutputBuffer(budget);
  forEachJaLine(text, (line, lineBreak, lineNumber) => {
    const { lead, value, trail } = splitLine(line);
    if (value === '') {
      output.push(line);
    } else {
      let converted: string;
      try {
        converted = convert(value);
      } catch (error) {
        throw atLine(lineNumber, error);
      }
      output.push(lead);
      output.push(converted);
      output.push(trail);
    }
    output.push(lineBreak);
  });
  return output.join();
};

// ---------------------------------------------------------------------------------------------
// Character classes (plan 2-1). A character belongs to at most one of KANJI / KATAKANA / HIRAGANA
// / JA_PUNCT. The `*_CLASS` strings are the insides of a `[...]` class for a regular expression
// with the `u` flag; they are built only from constants.
// ---------------------------------------------------------------------------------------------

/** Kanji: Script=Han (includes 々 U+3005 and 〇 U+3007) and 〆 U+3006. ヵ・ヶ are NOT kanji. */
export const KANJI_CLASS = '\\p{Script=Han}\\u3006';
/**
 * Katakana: Script=Katakana (full-width, half-width, ㇰ..ㇿ, ヽヾ, ヵ U+30F5, ヶ U+30F6) and the
 * prolonged sound marks ー U+30FC / ｰ U+FF70 and the half-width (semi-)voiced marks ﾞ U+FF9E / ﾟ
 * U+FF9F. ・ U+30FB and ゠ U+30A0 are punctuation.
 */
export const KATAKANA_CLASS = '\\p{Script=Katakana}\\u30FC\\uFF70\\uFF9E\\uFF9F';
/** Hiragana: Script=Hiragana (includes ゝゞ, ゕ U+3095, ゖ U+3096; not ゛゜ U+309B/309C nor U+3099/309A). */
export const HIRAGANA_CLASS = '\\p{Script=Hiragana}';
/** Japanese letters (JA-026): kanji, katakana and hiragana. */
export const JA_LETTER_CLASS = `${KANJI_CLASS}${KATAKANA_CLASS}${HIRAGANA_CLASS}`;

const KANJI_RE = new RegExp(`^[${KANJI_CLASS}]$`, 'u');
const KATAKANA_RE = new RegExp(`^[${KATAKANA_CLASS}]$`, 'u');
const HIRAGANA_RE = new RegExp(`^[${HIRAGANA_CLASS}]$`, 'u');

/** True when the single code point `ch` is a kanji. */
export const isKanji = (ch: string): boolean => KANJI_RE.test(ch);
/** True when the single code point `ch` is a katakana (see KATAKANA_CLASS). */
export const isKatakana = (ch: string): boolean => KATAKANA_RE.test(ch);
/** True when the single code point `ch` is a hiragana. */
export const isHiragana = (ch: string): boolean => HIRAGANA_RE.test(ch);
/** True when the single code point `ch` is a kanji, katakana or hiragana. */
export const isJaLetter = (ch: string): boolean => isKanji(ch) || isKatakana(ch) || isHiragana(ch);

/** Full-width digits and Latin letters: alphanumerics, not punctuation (so JA-025 keeps the spaces between them). */
const isFullwidthAlnum = (code: number): boolean =>
  (code >= 0xFF10 && code <= 0xFF19) || (code >= 0xFF21 && code <= 0xFF3A) || (code >= 0xFF41 && code <= 0xFF5A);

/** The code point ranges of Japanese punctuation before the letters and the full-width alphanumerics are taken out. */
const JA_PUNCT_RANGES: readonly [number, number][] = [[0x3001, 0x303F], [0x30FB, 0x30FB], [0xFF01, 0xFF65]];

const escapeCode = (code: number): string => `\\u${code.toString(16).toUpperCase().padStart(4, '0')}`;

/**
 * Japanese punctuation: U+3001..303F, U+30FB, U+FF01..FF60 and U+FF61..FF65 without the Japanese
 * letters (々〆〇 and so on) and the full-width alphanumerics (０-９ Ａ-Ｚ ａ-ｚ). The ideographic
 * space U+3000 is not included.
 */
export const JA_PUNCT_CLASS = ((): string => {
  let result = '';
  for (const [first, last] of JA_PUNCT_RANGES) {
    for (let code = first; code <= last; code++) {
      if (!isJaLetter(String.fromCodePoint(code)) && !isFullwidthAlnum(code)) {
        result += escapeCode(code);
      }
    }
  }
  return result;
})();
/** Japanese characters (JA-025): Japanese letters and Japanese punctuation. */
export const JA_CHAR_CLASS = `${JA_LETTER_CLASS}${JA_PUNCT_CLASS}`;

const JA_PUNCT_RE = new RegExp(`^[${JA_PUNCT_CLASS}]$`, 'u');

/** True when the single code point `ch` is Japanese punctuation. */
export const isJaPunct = (ch: string): boolean => JA_PUNCT_RE.test(ch);
/** True when the single code point `ch` is a Japanese letter or Japanese punctuation. */
export const isJaChar = (ch: string): boolean => isJaLetter(ch) || isJaPunct(ch);
