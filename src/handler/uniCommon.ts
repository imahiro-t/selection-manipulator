/**
 * Shared, vscode-independent helpers of the UNI-001..030 Unicode commands: the errors, the limits,
 * the grapheme segmentation, the line-by-line processing and the character classes (emoji,
 * invisible characters, the joiners that belong to an emoji sequence) that every command uses.
 *
 * Security rules (SECURITY.md): nothing here evaluates code, no regular expression is built from
 * the user's text (every expression below is a constant compiled once), every loop is linear in
 * the input, and the results are counted against the output limit.
 */
import { quoteForDisplay } from '../textFormat';
import { EncOutputTooLargeError, MAX_OUTPUT_LENGTH } from './encodeTransforms';

export { MAX_OUTPUT_LENGTH };

/** The selected text cannot be used; the message is shown to the user as it is. */
export class UniInputError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'UniInputError';
  }
}

/**
 * The selections hold nothing the command can work on: treated like empty selections, with the
 * same warning.
 */
export class UniNoTargetError extends UniInputError {
  constructor() {
    super('the selection has nothing to work on');
    this.name = 'UniNoTargetError';
  }
}

/** Upper limit of the length (UTF-16 code units) of one selection. */
export const UNI_MAX_INPUT_LENGTH = 1_000_000;
/** `select`: upper limit of the number of ranges selected at once (all selections together). */
export const UNI_MAX_SELECT_RANGES = 10_000;
/** Maximum number of characters of the selected text quoted in a message. */
export const UNI_MESSAGE_TEXT_LIMIT = 60;

/** `text` quoted like JSON and cut to UNI_MESSAGE_TEXT_LIMIT characters (for messages). */
export const quoteText = (text: string): string => quoteForDisplay(text, UNI_MESSAGE_TEXT_LIMIT);

export const assertUniInputLength = (text: string): void => {
  if (text.length > UNI_MAX_INPUT_LENGTH) {
    throw new UniInputError(`the selection is longer than ${UNI_MAX_INPUT_LENGTH.toLocaleString('en-US')} characters`);
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
 * exceeds `budget` (what is left of MAX_OUTPUT_LENGTH for this selection), so a result that is
 * many times longer than the input is never built in full.
 */
export class UniOutputBuffer {
  private readonly parts: string[] = [];
  private total = 0;

  constructor(private readonly budget: number) { }

  push(part: string): void {
    assertWithinBudget(this.total + part.length, this.budget);
    this.total += part.length;
    this.parts.push(part);
  }

  join(): string {
    return this.parts.join('');
  }
}

/** A range of a selection to select: UTF-16 offsets into the selected text (`end` exclusive). */
export interface UniTextRange {
  start: number;
  end: number;
}

// ---------------------------------------------------------------------------------------------
// Lines and graphemes
// ---------------------------------------------------------------------------------------------

/**
 * Calls `visit` for every line of the text with the line itself and the line break after it
 * (`''` for the last line). LF and CRLF are recognised.
 */
export const forEachUniLine = (text: string, visit: (line: string, lineBreak: string) => void): void => {
  let start = 0;
  for (;;) {
    const newline = text.indexOf('\n', start);
    const end = newline === -1 ? text.length : newline;
    const breakStart = end > start && text.charCodeAt(end - 1) === 0x0d ? end - 1 : end;
    visit(text.slice(start, breakStart), newline === -1 ? '' : text.slice(breakStart, newline + 1));
    if (newline === -1) {
      return;
    }
    start = newline + 1;
  }
};

/** Made once: creating a segmenter is far more expensive than using one. */
const GRAPHEME_SEGMENTER = new Intl.Segmenter(undefined, { granularity: 'grapheme' });

/**
 * The grapheme clusters (user-perceived characters) of the text, in order, as `Intl.Segmenter`
 * sees them: a surrogate pair, a base with its combining marks, CRLF, a flag or a ZWJ emoji
 * sequence is one grapheme.
 */
export function* graphemes(text: string): Generator<string> {
  for (const { segment } of GRAPHEME_SEGMENTER.segment(text)) {
    yield segment;
  }
}

/** The number of grapheme clusters of the text. */
export const countGraphemes = (text: string): number => {
  let count = 0;
  for (const _ of GRAPHEME_SEGMENTER.segment(text)) {
    count++;
  }
  return count;
};

// ---------------------------------------------------------------------------------------------
// Emoji
// ---------------------------------------------------------------------------------------------

/**
 * What makes a grapheme an emoji: a character shown as an emoji by default, the emoji
 * presentation selector U+FE0F, a regional indicator (flags) or the combining enclosing keycap
 * U+20E3. `©` `®` `™` without U+FE0F, a lone digit and `#` are not emoji.
 */
const EMOJI_MARK = /[\p{Emoji_Presentation}️\p{Regional_Indicator}⃣]/u;

/** True when the grapheme `grapheme` (one element of `graphemes`) is an emoji. */
export const isEmojiGrapheme = (grapheme: string): boolean =>
  // Fast path: no character below U+00A9 (©, the first Extended_Pictographic) makes an emoji on its own.
  !(grapheme.length === 1 && grapheme.charCodeAt(0) < 0xa9) && EMOJI_MARK.test(grapheme);

const EXTENDED_PICTOGRAPHIC = /^\p{Extended_Pictographic}$/u;

const ZWJ = 0x200d;
const isTag = (code: number): boolean => code >= 0xe0020 && code <= 0xe007f;
const isEmojiModifier = (code: number): boolean => code >= 0x1f3fb && code <= 0x1f3ff;
const isPresentationSelector = (code: number): boolean => code === 0xfe0e || code === 0xfe0f;
const isExtendedPictographic = (code: number): boolean =>
  code >= 0xa9 && EXTENDED_PICTOGRAPHIC.test(String.fromCodePoint(code));

/**
 * The offsets (UTF-16) of the ZWJs and tag characters that belong to an emoji sequence, as flags
 * (`1` = keep), found in one pass over the code points (linear in the input):
 *
 * - a ZWJ between an Extended_Pictographic (optionally followed by emoji modifiers and variation
 *   selectors) and another Extended_Pictographic (`👨‍👩‍👧`, `🧑🏽‍💻`, `❤️‍🔥`);
 * - the tag characters U+E0020..E007F right after an Extended_Pictographic (the tag sequence of a
 *   subdivision flag such as England's).
 *
 * A ZWJ with no emoji on both sides (`👍{ZWJ}`, `👍{ZWJ}a`, `a{ZWJ}b`) and a lone tag character are
 * not kept, although `Intl.Segmenter` puts a ZWJ after an emoji into the emoji's grapheme.
 */
export const protectedEmojiJoiners = (text: string): Uint8Array => {
  const flags = new Uint8Array(text.length);
  let afterPictographic = false;
  let i = 0;
  while (i < text.length) {
    const code = text.codePointAt(i)!;
    const size = code > 0xffff ? 2 : 1;
    if (isExtendedPictographic(code)) {
      afterPictographic = true;
    } else if (isEmojiModifier(code) || isPresentationSelector(code)) {
      // Keeps the state: `🧑🏽‍💻`, `❤️‍🔥`.
    } else if (isTag(code)) {
      if (afterPictographic) {
        flags[i] = 1;
        flags[i + 1] = 1;
      }
    } else if (code === ZWJ) {
      if (afterPictographic && i + 1 < text.length && isExtendedPictographic(text.codePointAt(i + 1)!)) {
        flags[i] = 1;
      }
      afterPictographic = false;
    } else {
      afterPictographic = false;
    }
    i += size;
  }
  return flags;
};

// ---------------------------------------------------------------------------------------------
// Invisible characters and code point notation
// ---------------------------------------------------------------------------------------------

/**
 * The candidates for an invisible character, as the inside of a `[...]` class for a regular
 * expression with the `u` flag: control characters (Cc), format characters (Cf: ZWSP, ZWJ, ZWNJ,
 * BOM, the soft hyphen, the bidi controls, the tag characters, ...), the line / paragraph
 * separators and the space separators (Zs). `isInvisibleCode` takes out tab, LF, CR, the space and
 * the ideographic space.
 */
export const INVISIBLE_CANDIDATE_CLASS = '\\p{Cc}\\p{Cf}\\p{Zs}\\u2028\\u2029';

const INVISIBLE_CANDIDATE = new RegExp(`^[${INVISIBLE_CANDIDATE_CLASS}]$`, 'u');

/**
 * True when the code point is invisible (or a control character) in the sense of UNI-006: Cc
 * except tab / LF / CR, Cf, U+2028 / U+2029 and Zs except the space and the ideographic space.
 * Whether a ZWJ / tag character belongs to an emoji sequence is decided by `protectedEmojiJoiners`.
 */
export const isInvisibleCode = (code: number): boolean =>
  code !== 0x09 && code !== 0x0a && code !== 0x0d && code !== 0x20 && code !== 0x3000
  && INVISIBLE_CANDIDATE.test(String.fromCodePoint(code));

/** `U+XXXX`: upper-case hexadecimal, at least 4 digits. */
export const formatCodePoint = (code: number): string => `U+${code.toString(16).toUpperCase().padStart(4, '0')}`;
