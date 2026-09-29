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
  UniTextRange,
} from './uniCommon';
import {
  CIRCLED_LOWER,
  CIRCLED_ONE,
  CIRCLED_UPPER,
  CIRCLED_ZERO,
  CYRILLIC_HOMOGLYPHS,
  CYRILLIC_TO_LATIN,
  GREEK_HOMOGLYPHS,
  MATH_BOLD,
  MATH_HOLES,
  MATH_ITALIC,
  MATH_MONOSPACE,
  MathStyle,
  SCRIPT_NAMES,
  SUBSCRIPT_DIGITS,
  SUBSCRIPT_LETTERS,
  SUPERSCRIPT_DIGITS,
  SUPERSCRIPT_LETTERS,
  UPSIDE_DOWN,
} from './uniTables';

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
const ZERO_WIDTH = /[\u200B-\u200D\u2060\uFEFF\u180E]/g;

/**
 * UNI-005: the text without zero-width characters (U+200B, U+200C, U+200D, U+2060, U+FEFF,
 * U+180E). A ZWJ that joins two emoji (`👨\u200D👩\u200D👧`, `🧑🏽\u200D💻`, `❤\uFE0F\u200D🔥`) is kept.
 */
export const removeZeroWidth = (text: string): string => {
  const kept = text.includes('\u200D') ? protectedEmojiJoiners(text) : undefined;
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
 * (`👨\u200D👩\u200D👧` → `1 grapheme / length 8`).
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

// ---------------------------------------------------------------------------------------------
// UNI-016..019 Styled letters
// ---------------------------------------------------------------------------------------------

const ASCII_ALPHANUMERIC = /[A-Za-z0-9]/g;

const codeOf = (ch: string): number => ch.charCodeAt(0);

/** The letters (and digits, when the style has them) of the text in a mathematical style. */
const toMathStyle = (text: string, style: MathStyle): string =>
  text.replace(ASCII_ALPHANUMERIC, (ch) => {
    const code = codeOf(ch);
    let styled: number;
    if (code >= 0x61) {
      styled = style.lower + code - 0x61;
    } else if (code >= 0x41) {
      styled = style.upper + code - 0x41;
    } else if (style.digits !== undefined) {
      styled = style.digits + code - 0x30;
    } else {
      return ch;
    }
    return MATH_HOLES.get(styled) ?? String.fromCodePoint(styled);
  });

/** UNI-016: A-Z, a-z and 0-9 in mathematical bold (`abc` → `𝐚𝐛𝐜`). */
export const toMathBold = (text: string): string => toMathStyle(text, MATH_BOLD);

/** UNI-017: A-Z and a-z in mathematical italic (`abc` → `𝑎𝑏𝑐`); the digits stay. */
export const toMathItalic = (text: string): string => toMathStyle(text, MATH_ITALIC);

/** UNI-018: A-Z, a-z and 0-9 in mathematical monospace (`abc` → `𝚊𝚋𝚌`). */
export const toMathMonospace = (text: string): string => toMathStyle(text, MATH_MONOSPACE);

/** UNI-019: A-Z → Ⓐ..Ⓩ, a-z → ⓐ..ⓩ, 0 → ⓪, 1-9 → ①..⑨ (`abc` → `ⓐⓑⓒ`). */
export const toCircled = (text: string): string =>
  text.replace(ASCII_ALPHANUMERIC, (ch) => {
    const code = codeOf(ch);
    if (code >= 0x61) {
      return String.fromCharCode(CIRCLED_LOWER + code - 0x61);
    }
    if (code >= 0x41) {
      return String.fromCharCode(CIRCLED_UPPER + code - 0x41);
    }
    return String.fromCharCode(code === 0x30 ? CIRCLED_ZERO : CIRCLED_ONE + code - 0x31);
  });

// ---------------------------------------------------------------------------------------------
// UNI-020 Upside-down text
// ---------------------------------------------------------------------------------------------

/** A grapheme upside down: its first character from the table, its combining marks kept. */
const turnGrapheme = (grapheme: string): string => {
  const first = String.fromCodePoint(grapheme.codePointAt(0)!);
  const turned = UPSIDE_DOWN.get(first);
  return turned === undefined ? grapheme : turned + grapheme.slice(first.length);
};

/**
 * UNI-020: the text turned by 180 degrees: every character that has an upside-down form in the
 * table is replaced, the graphemes of every line are reversed and so is the order of the lines
 * (`hello` → `ollǝɥ`). The line breaks between the lines stay where they are; the empty lines at
 * the start and at the end of the text (a selection that starts or ends with a line break, as
 * selecting whole lines does) stay in place and are not turned, so `hello⏎` → `ollǝɥ⏎` and the
 * result never joins the next line. Other characters are kept.
 */
export const toUpsideDown = (text: string): string => {
  const lines: string[] = [];
  const breaks: string[] = [];
  forEachUniLine(text, (line, lineBreak) => {
    lines.push(line);
    breaks.push(lineBreak);
  });
  let first = 0;
  while (first < lines.length && lines[first] === '') {
    first++;
  }
  if (first === lines.length) {
    return text;
  }
  let last = lines.length - 1;
  while (lines[last] === '') {
    last--;
  }
  const parts: string[] = breaks.slice(0, first);
  for (let i = last; i >= first; i--) {
    const turned: string[] = [];
    for (const grapheme of graphemes(lines[i])) {
      turned.push(turnGrapheme(grapheme));
    }
    parts.push(turned.reverse().join(''));
    // The break after the k-th turned line is the break after the k-th line of the text.
    if (i > first) {
      parts.push(breaks[first + last - i]);
    }
  }
  // A loop, not `push(...array)`: spreading one argument per break overflows the stack for a
  // text ending with hundreds of thousands of line breaks.
  for (let i = last; i < breaks.length; i++) {
    parts.push(breaks[i]);
  }
  return parts.join('');
};

// ---------------------------------------------------------------------------------------------
// UNI-021 / 022 Combining strikethrough and underline
// ---------------------------------------------------------------------------------------------

/** A grapheme that gets no combining line: a line break, a tab or another control character. */
const NO_COMBINING_LINE = /^\p{Cc}+$/u;

/** Every grapheme except line breaks, tabs and control characters followed by `mark`. */
const withCombiningMark = (text: string, mark: string): string => {
  const parts: string[] = [];
  for (const grapheme of graphemes(text)) {
    parts.push(NO_COMBINING_LINE.test(grapheme) ? grapheme : grapheme + mark);
  }
  return parts.join('');
};

/** UNI-021: U+0336 after every grapheme (`abc` → `a\u0336b\u0336c\u0336`). */
export const toStrikethrough = (text: string): string => withCombiningMark(text, '\u0336');

/** UNI-022: U+0332 after every grapheme (`abc` → `a\u0332b\u0332c\u0332`). */
export const toUnderline = (text: string): string => withCombiningMark(text, '\u0332');

// ---------------------------------------------------------------------------------------------
// UNI-023 / 024 Superscript and subscript
// ---------------------------------------------------------------------------------------------

/** The quick pick values of UNI-023 / 024. */
export type ScriptChoice = 'digits' | 'letters';

const DIGITS_AND_SIGNS = /[0-9+\-=()]/g;
const DIGITS_SIGNS_AND_LETTERS = /[0-9A-Za-z+\-=()]/g;

const withSmallForms = (text: string, digits: ReadonlyMap<string, string>, letters: ReadonlyMap<string, string>, choice: ScriptChoice): string =>
  choice === 'letters'
    ? text.replace(DIGITS_SIGNS_AND_LETTERS, (ch) => digits.get(ch) ?? letters.get(ch) ?? ch)
    : text.replace(DIGITS_AND_SIGNS, (ch) => digits.get(ch)!);

/**
 * UNI-023: the digits and `+ - = ( )` as superscripts (`x2` → `x²`); with `letters`, the letters
 * that have a superscript form too. Other characters stay.
 */
export const toSuperscript = (text: string, choice: ScriptChoice): string =>
  withSmallForms(text, SUPERSCRIPT_DIGITS, SUPERSCRIPT_LETTERS, choice);

/** UNI-024: as UNI-023 with subscripts (`H2O` → `H₂O`). */
export const toSubscript = (text: string, choice: ScriptChoice): string =>
  withSmallForms(text, SUBSCRIPT_DIGITS, SUBSCRIPT_LETTERS, choice);

// ---------------------------------------------------------------------------------------------
// UNI-025 Confusable characters
// ---------------------------------------------------------------------------------------------

/** A word: a run of letters, combining marks and digits. Anything else separates words. */
const WORD = /[\p{L}\p{M}\p{N}]+/gu;
const LATIN = /^\p{Script=Latin}$/u;
const CYRILLIC_OR_GREEK = /^[\p{Script=Cyrillic}\p{Script=Greek}]$/u;
const LETTER = /^\p{L}$/u;

/** What a code point is to the confusable check. */
enum Kind {
  Other,
  Latin,
  /** A Cyrillic letter of the homoglyph table. */
  CyrillicHomoglyph,
  /** A Greek letter of the homoglyph table. */
  GreekHomoglyph,
  /** A Cyrillic or Greek character that is not in the table (`я`, `λ`, `ή`). */
  OtherCyrillicOrGreek,
}

/** The kind of every code point met so far (a text uses few distinct characters). */
const kindCache = new Map<number, Kind>();

/** The most code points a cache of UNI-025 / 029 keeps; it is emptied when it would grow past this. */
const MAX_CACHED_CODE_POINTS = 4096;

const kindOf = (ch: string): Kind => {
  const code = ch.codePointAt(0)!;
  let kind = kindCache.get(code);
  if (kind === undefined) {
    if (CYRILLIC_HOMOGLYPHS.has(ch)) {
      kind = Kind.CyrillicHomoglyph;
    } else if (GREEK_HOMOGLYPHS.has(ch)) {
      kind = Kind.GreekHomoglyph;
    } else if (code < 0x80) {
      kind = /[A-Za-z]/.test(ch) ? Kind.Latin : Kind.Other;
    } else if (LATIN.test(ch)) {
      kind = Kind.Latin;
    } else if (CYRILLIC_OR_GREEK.test(ch)) {
      kind = Kind.OtherCyrillicOrGreek;
    } else {
      kind = Kind.Other;
    }
    if (kindCache.size >= MAX_CACHED_CODE_POINTS) {
      kindCache.clear();
    }
    kindCache.set(code, kind);
  }
  return kind;
};

interface WordInfo {
  /** The homoglyphs of the word: offsets into the text. */
  homoglyphs: UniTextRange[];
  hasLatin: boolean;
  hasGreekHomoglyph: boolean;
  hasOtherCyrillicOrGreek: boolean;
  /** Letters (`\p{L}`) that are not homoglyphs, e.g. a letter of another script. */
  hasOtherLetter: boolean;
  letters: number;
}

const describeWord = (word: string, offset: number): WordInfo => {
  const info: WordInfo = {
    homoglyphs: [], hasLatin: false, hasGreekHomoglyph: false, hasOtherCyrillicOrGreek: false, hasOtherLetter: false, letters: 0,
  };
  let i = 0;
  for (const ch of word) {
    const kind = kindOf(ch);
    const isLetter = kind !== Kind.Other || LETTER.test(ch);
    if (isLetter) {
      info.letters++;
    }
    switch (kind) {
      case Kind.Latin:
        info.hasLatin = true;
        break;
      case Kind.GreekHomoglyph:
        info.hasGreekHomoglyph = true;
        info.homoglyphs.push({ start: offset + i, end: offset + i + ch.length });
        break;
      case Kind.CyrillicHomoglyph:
        info.homoglyphs.push({ start: offset + i, end: offset + i + ch.length });
        break;
      case Kind.OtherCyrillicOrGreek:
        info.hasOtherCyrillicOrGreek = true;
        break;
      default:
        if (isLetter) {
          info.hasOtherLetter = true;
        }
    }
    i += ch.length;
  }
  return info;
};

/** The words of one line (`start`..`end` of the text), described. */
const wordsOfLine = (text: string, start: number, end: number): WordInfo[] => {
  const line = text.slice(start, end);
  const words: WordInfo[] = [];
  for (const match of line.matchAll(WORD)) {
    words.push(describeWord(match[0], start + match.index!));
  }
  return words;
};

/**
 * UNI-025: the homoglyphs (Cyrillic / Greek letters of the table that look like Latin letters) to
 * select, found by two rules on the words (runs of letters, combining marks and digits) of every
 * line:
 *
 * - A (mixed): a word with a Latin letter and a homoglyph: all its homoglyphs (`pаypal`, `pаy-pal`).
 * - B (spoofed word): a word of 2 letters or more made only of Cyrillic homoglyphs (digits and
 *   marks allowed), on a line that has a word with a Latin letter and no Cyrillic / Greek
 *   character outside the table (`login раура`, `раура.com`). Words made of Greek homoglyphs are
 *   left to rule A: common Greek words such as `το` and `και` are made of homoglyphs only and
 *   Greek text often mixes English words (`Το API και το SDK`).
 *
 * Stops once more than `limit` ranges were found.
 */
export const findConfusables = (text: string, limit: number): UniTextRange[] => {
  const found: UniTextRange[] = [];
  let start = 0;
  while (start <= text.length && found.length <= limit) {
    let end = start;
    while (end < text.length && text.charCodeAt(end) !== 0x0a && text.charCodeAt(end) !== 0x0d) {
      end++;
    }
    const words = wordsOfLine(text, start, end);
    const hasLatinWord = words.some((word) => word.hasLatin);
    const hasOtherCyrillicOrGreek = words.some((word) => word.hasOtherCyrillicOrGreek);
    for (const word of words) {
      if (word.homoglyphs.length === 0) {
        continue;
      }
      const mixed = word.hasLatin;
      const spoofed = !word.hasLatin && !word.hasGreekHomoglyph && !word.hasOtherCyrillicOrGreek && !word.hasOtherLetter
        && word.letters >= 2 && hasLatinWord && !hasOtherCyrillicOrGreek;
      if (mixed || spoofed) {
        // One at a time (a word can hold hundreds of thousands of homoglyphs, too many to spread
        // into the arguments of `push`), stopping as soon as the limit is passed.
        for (const range of word.homoglyphs) {
          found.push(range);
          if (found.length > limit) {
            break;
          }
        }
        if (found.length > limit) {
          break;
        }
      }
    }
    if (end === text.length) {
      break;
    }
    // CRLF is one line break.
    start = text.charCodeAt(end) === 0x0d && text.charCodeAt(end + 1) === 0x0a ? end + 2 : end + 1;
  }
  return found;
};

/** How many kinds of character the found messages of UNI-025 / 026 list at most. */
const MAX_LISTED_KINDS = 10;

/** The distinct texts in order of their first appearance, at most MAX_LISTED_KINDS, then `…`. */
const listKinds = (found: readonly string[], describe: (text: string) => string): string => {
  const kinds = [...new Set(found)];
  const listed = kinds.slice(0, MAX_LISTED_KINDS).map(describe);
  return kinds.length > MAX_LISTED_KINDS ? `${listed.join(', ')}, …` : listed.join(', ');
};

const homoglyphOf = (ch: string): string => CYRILLIC_HOMOGLYPHS.get(ch) ?? GREEK_HOMOGLYPHS.get(ch) ?? '?';

/**
 * UNI-025: the message after selecting (`1 confusable character found: "а" (U+0430) looks like
 * "a"`); every kind of character once, in order of appearance.
 */
export const confusablesMessage = (found: readonly string[]): string =>
  `${plural(found.length, 'confusable character')} found: ${listKinds(found,
    (ch) => `"${ch}" (${formatCodePoint(ch.codePointAt(0)!)}) looks like "${homoglyphOf(ch)}"`)}`;

// ---------------------------------------------------------------------------------------------
// UNI-026 Bidi control characters
// ---------------------------------------------------------------------------------------------

/** The bidirectional embedding, override and isolate controls (Trojan Source). */
const BIDI_CONTROL = /[\u202A-\u202E\u2066-\u2069]/g;

const BIDI_NAMES: ReadonlyMap<number, string> = new Map([
  [0x202a, 'left-to-right embedding'],
  [0x202b, 'right-to-left embedding'],
  [0x202c, 'pop directional formatting'],
  [0x202d, 'left-to-right override'],
  [0x202e, 'right-to-left override'],
  [0x2066, 'left-to-right isolate'],
  [0x2067, 'right-to-left isolate'],
  [0x2068, 'first strong isolate'],
  [0x2069, 'pop directional isolate'],
]);

/** UNI-026: the bidi control characters U+202A..202E and U+2066..2069 to select. */
export const findBidiControls = (text: string, limit: number): UniTextRange[] => {
  const found: UniTextRange[] = [];
  for (const match of text.matchAll(BIDI_CONTROL)) {
    found.push({ start: match.index!, end: match.index! + 1 });
    if (found.length > limit) {
      break;
    }
  }
  return found;
};

/**
 * UNI-026: the message after selecting (`1 bidi control character found: U+202E (right-to-left
 * override)`); every kind once, in order of appearance.
 */
export const bidiControlsMessage = (found: readonly string[]): string =>
  `${plural(found.length, 'bidi control character')} found: ${listKinds(found, (ch) => {
    const code = ch.codePointAt(0)!;
    return `${formatCodePoint(code)} (${BIDI_NAMES.get(code) ?? 'unknown'})`;
  })}`;

// ---------------------------------------------------------------------------------------------
// UNI-027 / 028 Typography
// ---------------------------------------------------------------------------------------------

/**
 * What an opening quote may follow: nothing (the start of the text), a line break, white space,
 * an opening bracket or a dash. An opening quote of the other kind is handled by `toSmartQuotes`
 * (`"'` opens twice, `""` is an empty quotation).
 */
const OPENS_AFTER = /^[\s([{<\-–—]$/u;

/** The opening quote after which a quote of each kind opens a nested quotation. */
const NESTED_AFTER: Readonly<Record<string, string>> = { '"': '‘', '\'': '“' };
const ALPHANUMERIC = /^[\p{L}\p{N}]$/u;

/**
 * UNI-027: straight quotes as curly quotes (`"a" it's` → `“a” it’s`). `"` is `“` at the start of
 * the text or a line, after white space, an opening bracket, a dash or the opening single quote
 * `‘` (a nested quotation), and `”` elsewhere, so `""` becomes `“”`. `'` between two letters or
 * digits is the apostrophe `’`; otherwise it is `‘` at the same places as `“` (with `“` as the
 * opening quote it may follow: `"'hi'"` → `“‘hi’”`, `''` → `‘’`) and `’` elsewhere.
 */
export const toSmartQuotes = (text: string): string => {
  const chars = Array.from(text);
  const parts: string[] = [];
  let previous = '';
  chars.forEach((ch, i) => {
    let out = ch;
    if (ch === '"' || ch === '\'') {
      const opens = previous === '' || previous === NESTED_AFTER[ch] || OPENS_AFTER.test(previous);
      if (ch === '"') {
        out = opens ? '“' : '”';
      } else if (ALPHANUMERIC.test(previous) && i + 1 < chars.length && ALPHANUMERIC.test(chars[i + 1])) {
        out = '’';
      } else {
        out = opens ? '‘' : '’';
      }
    }
    parts.push(out);
    previous = out;
  });
  return parts.join('');
};

const DASHES_AND_DOTS = /-+|\.+/g;

/**
 * UNI-028: exactly two hyphens as an em dash and exactly three dots as an ellipsis (`wait... -- ok`
 * → `wait… — ok`); other runs (`---`, `....`) stay.
 */
export const toTypographicPunctuation = (text: string): string =>
  text.replace(DASHES_AND_DOTS, (run) => (run === '--' ? '—' : run === '...' ? '…' : run));

// ---------------------------------------------------------------------------------------------
// UNI-029 Scripts
// ---------------------------------------------------------------------------------------------

/** Characters that belong to no particular script: digits, symbols, spaces, combining marks. */
const NO_SCRIPT = /^[\p{Script=Common}\p{Script=Inherited}\p{Script=Unknown}]$/u;

/** One expression per script of SCRIPT_NAMES, made once. */
const SCRIPT_TESTS: readonly [string, RegExp][] = SCRIPT_NAMES.map((name) => [name, new RegExp(`^\\p{Script=${name}}$`, 'u')]);

/** The script of every code point met so far (`null`: no script). */
const scriptCache = new Map<number, string | null>();

const scriptOf = (code: number, ch: string): string | null => {
  let script = scriptCache.get(code);
  if (script === undefined) {
    if (code < 0x80) {
      script = /[A-Za-z]/.test(ch) ? 'Latin' : null;
    } else if (NO_SCRIPT.test(ch)) {
      script = null;
    } else {
      script = SCRIPT_TESTS.find(([, test]) => test.test(ch))?.[0] ?? 'Other';
    }
    if (scriptCache.size >= MAX_CACHED_CODE_POINTS) {
      scriptCache.clear();
    }
    scriptCache.set(code, script);
  }
  return script;
};

/**
 * UNI-029: the scripts of all selections together with the number of their characters, in order
 * of appearance (`abcあア漢` → `Latin 3, Hiragana 1, Katakana 1, Han 1`). Digits, symbols,
 * spaces and combining marks (Common / Inherited) are not counted; a script outside SCRIPT_NAMES
 * is counted as `Other`.
 */
export const detectScriptsMessage = (texts: readonly string[]): string => {
  const counts = new Map<string, number>();
  for (const text of texts) {
    for (const ch of text) {
      const script = scriptOf(ch.codePointAt(0)!, ch);
      if (script !== null) {
        counts.set(script, (counts.get(script) ?? 0) + 1);
      }
    }
  }
  if (counts.size === 0) {
    return 'No letters of any script were found (only digits, symbols and spaces).';
  }
  return [...counts].map(([script, count]) => `${script} ${count.toLocaleString('en-US')}`).join(', ');
};

// ---------------------------------------------------------------------------------------------
// UNI-030 Cyrillic to Latin
// ---------------------------------------------------------------------------------------------

/** CYRILLIC_TO_LATIN with the upper-case keys added (`upper` = the key was upper case). */
const TRANSLITERATION: ReadonlyMap<string, { value: string; upper: boolean }> = new Map(
  [...CYRILLIC_TO_LATIN].flatMap(([key, value]) => [
    [key, { value, upper: false }],
    [key.toUpperCase(), { value, upper: true }],
  ] as [string, { value: string; upper: boolean }][])
);

const UPPER = /^\p{Lu}$/u;

const isUpperAt = (text: string, index: number): boolean => {
  const code = text.codePointAt(index);
  return code !== undefined && UPPER.test(String.fromCodePoint(code));
};

const isLetterAt = (text: string, index: number): boolean => {
  const code = text.codePointAt(index);
  return code !== undefined && LETTER.test(String.fromCodePoint(code));
};

const MARK = /^\p{M}$/u;

/** The code point before `index` (`''` at the start). */
const previousChar = (text: string, index: number): string => {
  if (index === 0) {
    return '';
  }
  const low = text.charCodeAt(index - 1);
  return index >= 2 && low >= 0xdc00 && low <= 0xdfff ? text.slice(index - 2, index) : text[index - 1];
};

/**
 * The code point before `index`, skipping combining marks (`''` when there is none), so that a
 * decomposed letter (`Е` + U+0308) counts like the composed one (`Ё`).
 */
const previousBaseChar = (text: string, index: number): string => {
  let ch = previousChar(text, index);
  while (ch !== '' && MARK.test(ch)) {
    index -= ch.length;
    ch = previousChar(text, index);
  }
  return ch;
};

/** The first index at or after `index` that holds no combining mark. */
const skipMarks = (text: string, index: number): number => {
  for (;;) {
    const code = text.codePointAt(index);
    if (code === undefined || !MARK.test(String.fromCodePoint(code))) {
      return index;
    }
    index += code > 0xffff ? 2 : 1;
  }
};

/**
 * UNI-030: Cyrillic letters as Latin letters, one fixed value per letter (`Привет` → `Privet`,
 * `Ельцин` → `Eltsin`). The value of an upper-case letter is upper case; a value of several
 * letters is all upper case when the next character is an upper-case letter, or when the next
 * character is no letter and the previous one is an upper-case letter (`ЖУК` → `ZHUK`, `ПЛЮЩ` →
 * `PLYUSHCH`), and capitalized otherwise (`Жук` → `Zhuk`, `Ж` → `Zh`). Other characters stay.
 */
export const transliterateCyrillic = (text: string): string => {
  const parts: string[] = [];
  let i = 0;
  while (i < text.length) {
    // A decomposed letter (two code units) first, then a single letter.
    let length = 2;
    let entry = TRANSLITERATION.get(text.slice(i, i + 2));
    if (entry === undefined) {
      length = 1;
      entry = TRANSLITERATION.get(text[i]);
    }
    if (entry === undefined) {
      parts.push(text[i]);
      i++;
      continue;
    }
    const { value, upper } = entry;
    if (!upper || value === '') {
      parts.push(value);
    } else if (value.length === 1) {
      parts.push(value.toUpperCase());
    } else {
      // Combining marks are skipped on both sides, so a decomposed neighbour counts like the
      // composed one (`Е` + U+0308 `Ж` → `YOZH`, like `ЁЖ`).
      const next = skipMarks(text, i + length);
      const allUpper = isUpperAt(text, next)
        || (!isLetterAt(text, next) && isUpperAt(previousBaseChar(text, i), 0));
      parts.push(allUpper ? value.toUpperCase() : value[0].toUpperCase() + value.slice(1));
    }
    i += length;
  }
  return parts.join('');
};
