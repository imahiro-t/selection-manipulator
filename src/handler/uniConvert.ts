/**
 * Pure (vscode-independent) conversions of the UNI-001..030 Unicode commands. Every function works
 * on the whole selected text; the handler checks the input length, and the functions whose result
 * can be much longer than the input count it against `budget` (what is left of MAX_OUTPUT_LENGTH).
 *
 * Only built-in Unicode processing (`String.prototype.normalize`, `Intl.Segmenter`, `\p{…}`
 * property escapes). Every regular expression is a constant, linear in the input.
 */
import {
  countGraphemes,
  forEachUniLine,
  formatCodePoint,
  graphemes,
  INVISIBLE_CANDIDATE_CLASS,
  isEmojiGrapheme,
  isInvisibleCode,
  protectedEmojiJoiners,
  quoteText,
  UniInputError,
  UniNoTargetError,
  UniOutputBuffer,
} from './uniCommon';

// ---------------------------------------------------------------------------------------------
// UNI-001..004 Normalization
// ---------------------------------------------------------------------------------------------

export type NormalizationForm = 'NFC' | 'NFD' | 'NFKC' | 'NFKD';

/** UNI-001..004: the text in the normalization form `form`. */
export const normalizeText = (text: string, form: NormalizationForm): string => text.normalize(form);

// ---------------------------------------------------------------------------------------------
// UNI-005 / 006 Zero-width and invisible characters
// ---------------------------------------------------------------------------------------------

/** UNI-005: ZWSP, ZWNJ, ZWJ, word joiner, BOM (zero-width no-break space) and Mongolian vowel separator. */
const ZERO_WIDTH = /[​-‍⁠﻿᠎]/g;

/**
 * UNI-005: the text without zero-width characters (U+200B, U+200C, U+200D, U+2060, U+FEFF,
 * U+180E). A ZWJ that joins two emoji (`👨‍👩‍👧`, `🧑🏽‍💻`, `❤️‍🔥`) is kept.
 */
export const removeZeroWidth = (text: string): string => {
  const kept = text.includes('‍') ? protectedEmojiJoiners(text) : undefined;
  return text.replace(ZERO_WIDTH, (match: string, offset: number) => (kept !== undefined && kept[offset] === 1 ? match : ''));
};

const INVISIBLE_CANDIDATES = new RegExp(`[${INVISIBLE_CANDIDATE_CLASS}]`, 'gu');

/**
 * UNI-006: every invisible character (see `isInvisibleCode`) as `<U+XXXX>`. Tab, LF, CR, the
 * space, the ideographic space and the ZWJs / tag characters of an emoji sequence stay as they are.
 */
export const revealInvisible = (text: string, budget: number): string => {
  const kept = protectedEmojiJoiners(text);
  const output = new UniOutputBuffer(budget);
  let last = 0;
  for (const match of text.matchAll(INVISIBLE_CANDIDATES)) {
    const offset = match.index!;
    const code = match[0].codePointAt(0)!;
    if (kept[offset] === 1 || !isInvisibleCode(code)) {
      continue;
    }
    output.push(text.slice(last, offset));
    output.push(`<${formatCodePoint(code)}>`);
    last = offset + match[0].length;
  }
  output.push(text.slice(last));
  return output.join();
};

// ---------------------------------------------------------------------------------------------
// UNI-007..010 Code points and code units
// ---------------------------------------------------------------------------------------------

/**
 * UNI-007: the code points of every line as `U+XXXX` separated by spaces (`あ😀` → `U+3042
 * U+1F600`). The line breaks (LF / CRLF) are kept; an empty line stays empty.
 */
export const toCodePoints = (text: string, budget: number): string => {
  const output = new UniOutputBuffer(budget);
  forEachUniLine(text, (line, lineBreak) => {
    let first = true;
    for (const ch of line) {
      output.push(first ? formatCodePoint(ch.codePointAt(0)!) : ` ${formatCodePoint(ch.codePointAt(0)!)}`);
      first = false;
    }
    output.push(lineBreak);
  });
  return output.join();
};

/**
 * A `U+XXXX` or `<U+XXXX>` token (either case, 4 to 6 hexadecimal digits) not followed by another
 * hexadecimal digit, or a run of spaces / tabs (which is dropped between two tokens).
 */
const CODE_POINT_TOKEN = /<U\+([0-9A-F]{4,6})>|U\+([0-9A-F]{4,6})(?![0-9A-F])|[ \t]+/giu;

/**
 * UNI-008: every `U+XXXX` / `<U+XXXX>` token as the character it names; the spaces and tabs
 * between two tokens are dropped, everything else stays as it is (so the results of UNI-006 and
 * UNI-007 convert back). A surrogate (U+D800..DFFF) or a value above U+10FFFF is an error.
 */
export const fromCodePoints = (text: string): string => {
  const parts: string[] = [];
  let last = 0;
  // A run of spaces / tabs waiting to see whether a token follows it.
  let pendingSpace = '';
  let afterToken = false;
  for (const match of text.matchAll(CODE_POINT_TOKEN)) {
    const offset = match.index!;
    const hex = match[1] ?? match[2];
    if (offset > last) {
      // Text between the matches: the pending spaces belong to it.
      parts.push(pendingSpace, text.slice(last, offset));
      pendingSpace = '';
      afterToken = false;
    }
    last = offset + match[0].length;
    if (hex === undefined) {
      if (afterToken) {
        pendingSpace = match[0];
      } else {
        parts.push(match[0]);
      }
      continue;
    }
    const code = parseInt(hex, 16);
    if (code > 0x10ffff) {
      throw new UniInputError(`${quoteText(match[0])} is beyond U+10FFFF, the last code point`);
    }
    if (code >= 0xd800 && code <= 0xdfff) {
      throw new UniInputError(`${quoteText(match[0])} is a surrogate code point, not a character`);
    }
    // Spaces between two tokens are dropped.
    pendingSpace = '';
    parts.push(String.fromCodePoint(code));
    afterToken = true;
  }
  parts.push(pendingSpace, text.slice(last));
  return parts.join('');
};

/** Line breaks and white space shown by their code point in the label of UNI-009 / 010. */
const SHOWN_AS_CODE = /^[\p{White_Space}]$/u;

/**
 * The label of a grapheme in UNI-009 / 010: the grapheme itself, with line breaks, white space and
 * invisible characters written as `<U+XXXX>` (the ZWJs and tags of an emoji sequence are kept).
 */
const graphemeLabel = (grapheme: string): string => {
  const kept = protectedEmojiJoiners(grapheme);
  let label = '';
  let i = 0;
  for (const ch of grapheme) {
    const code = ch.codePointAt(0)!;
    label += kept[i] !== 1 && (SHOWN_AS_CODE.test(ch) || isInvisibleCode(code)) ? `<${formatCodePoint(code)}>` : ch;
    i += ch.length;
  }
  return label;
};

const hex = (value: number, digits: number): string => value.toString(16).toUpperCase().padStart(digits, '0');

/** Made once. A lone surrogate is encoded as U+FFFD (EF BF BD), as when the document is saved. */
const UTF8 = new TextEncoder();

/** `label: units` for every grapheme of the text, one per line (joined with `eol`). */
const perGrapheme = (text: string, eol: string, budget: number, units: (grapheme: string) => string): string => {
  const output = new UniOutputBuffer(budget);
  let first = true;
  for (const grapheme of graphemes(text)) {
    output.push(`${first ? '' : eol}${graphemeLabel(grapheme)}: ${units(grapheme)}`);
    first = false;
  }
  return output.join();
};

/** UNI-009: `character: UTF-8 bytes` for every grapheme (`aあ` → `a: 61⏎あ: E3 81 82`). */
export const toUtf8Bytes = (text: string, eol: string, budget: number): string =>
  perGrapheme(text, eol, budget, (grapheme) => Array.from(UTF8.encode(grapheme), (byte) => hex(byte, 2)).join(' '));

/** UNI-010: `character: UTF-16 code units` for every grapheme (`😀` → `😀: D83D DE00`). */
export const toUtf16Units = (text: string, eol: string, budget: number): string =>
  perGrapheme(text, eol, budget, (grapheme) => {
    const units: string[] = [];
    for (let i = 0; i < grapheme.length; i++) {
      units.push(hex(grapheme.charCodeAt(i), 4));
    }
    return units.join(' ');
  });

// ---------------------------------------------------------------------------------------------
// UNI-011 Count graphemes
// ---------------------------------------------------------------------------------------------

const plural = (count: number, word: string): string => `${count.toLocaleString('en-US')} ${word}${count === 1 ? '' : 's'}`;

/**
 * UNI-011: the number of graphemes and the length (UTF-16 code units) of all selections together
 * (`👨‍👩‍👧` → `1 grapheme / length 8`).
 */
export const countGraphemesMessage = (texts: readonly string[]): string => {
  let count = 0;
  let length = 0;
  for (const text of texts) {
    count += countGraphemes(text);
    length += text.length;
  }
  if (count === 0) {
    throw new UniNoTargetError();
  }
  return `${plural(count, 'grapheme')} / length ${length.toLocaleString('en-US')}`;
};

// ---------------------------------------------------------------------------------------------
// UNI-012..015 Removing characters, emoji
// ---------------------------------------------------------------------------------------------

/** C0 controls except tab / LF / CR, DEL and the C1 controls. */
const CONTROL = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F-\u009F]+/g;

/** UNI-012: the text without control characters (C0 except tab / LF / CR, DEL, C1). */
export const removeControl = (text: string): string => text.replace(CONTROL, '');

/** Everything from U+0080 on, as code units (so a surrogate pair goes as a whole). */
const NON_ASCII = /[^\u0000-\u007F]+/g;

/** UNI-013: the text without non-ASCII characters (`café ☕` → `caf `). */
export const removeNonAscii = (text: string): string => text.replace(NON_ASCII, '');

/**
 * UNI-014: the text without emoji graphemes (see `isEmojiGrapheme`); a sequence with modifiers,
 * ZWJs, a flag or a keycap goes as a whole.
 */
export const removeEmoji = (text: string): string => {
  const parts: string[] = [];
  for (const grapheme of graphemes(text)) {
    if (!isEmojiGrapheme(grapheme)) {
      parts.push(grapheme);
    }
  }
  return parts.join('');
};

/** UNI-015: the emoji graphemes of the text in order, with nothing between them (`ok👍 go🚀` → `👍🚀`). */
export const extractEmoji = (text: string): string => {
  const parts: string[] = [];
  for (const grapheme of graphemes(text)) {
    if (isEmojiGrapheme(grapheme)) {
      parts.push(grapheme);
    }
  }
  return parts.join('');
};
