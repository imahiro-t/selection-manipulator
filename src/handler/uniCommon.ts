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
 * Length (UTF-16 code units) of the pieces `graphemes` hands to `Intl.Segmenter`. The segmenter of
 * older V8 versions (Node 18 / 20, the VS Code releases up to about 1.100 that `engines.vscode`
 * still admits) takes time quadratic in the length of the string it iterates, so a long text is
 * segmented piece by piece to keep the whole pass linear.
 */
export const GRAPHEME_CHUNK_LENGTH = 512;

/** The part of `Intl.Segmenter` that `graphemesInChunks` uses (replaceable in tests). */
export interface GraphemeSegmenter {
  segment(text: string): Iterable<{ segment: string }>;
}

const isHighSurrogate = (code: number): boolean => code >= 0xd800 && code <= 0xdbff;
const isLowSurrogate = (code: number): boolean => code >= 0xdc00 && code <= 0xdfff;

/**
 * The grapheme clusters of the text, segmenting at most about `chunkLength` code units at a time.
 *
 * Every grapheme of a piece except its last one is final: a boundary depends only on the
 * characters before it (counted from a boundary, which is where every piece starts) and on the
 * one character after it, which is inside the piece. The last grapheme may continue in the text
 * after the piece (a flag, a ZWJ sequence, CRLF or combining marks cut by the end of the piece),
 * so the next piece starts where it starts. A piece never ends between the two halves of a
 * surrogate pair, and a piece holding a single grapheme is doubled until the grapheme ends
 * before the end of the piece (a long run of combining marks); only that grapheme is taken from
 * the longer piece. The result is the same as segmenting the whole text at once.
 */
export function* graphemesInChunks(
  text: string,
  chunkLength: number,
  segmenter: GraphemeSegmenter = GRAPHEME_SEGMENTER,
): Generator<string> {
  let start = 0;
  let size = chunkLength;
  while (start < text.length) {
    let end = start + size;
    const retrying = size > chunkLength;
    if (end >= text.length) {
      for (const { segment } of segmenter.segment(start === 0 ? text : text.slice(start))) {
        yield segment;
        if (retrying) {
          // The doubled piece reached the end of the text: take only the long grapheme and go
          // back to pieces of the usual size, rather than segmenting all the rest at once.
          start += segment.length;
          break;
        }
      }
      if (!retrying) {
        return;
      }
      size = chunkLength;
      continue;
    }
    // Only a high surrogate followed by a low one is a pair to keep whole; a lone high surrogate
    // may end the piece (extending it would cut the next pair in two instead).
    if (isHighSurrogate(text.charCodeAt(end - 1)) && isLowSurrogate(text.charCodeAt(end))) {
      end++;
    }
    let pending: string | undefined;
    let consumed = 0;
    for (const { segment } of segmenter.segment(text.slice(start, end))) {
      if (pending !== undefined) {
        yield pending;
        consumed += pending.length;
        if (retrying) {
          // Only the long grapheme was wanted; the rest is segmented in pieces of the usual size.
          break;
        }
      }
      pending = segment;
    }
    if (consumed === 0) {
      // One grapheme fills the whole piece: try again with a piece twice as long.
      size *= 2;
    } else {
      start += consumed;
      size = chunkLength;
    }
  }
}

/**
 * The grapheme clusters (user-perceived characters) of the text, in order, as `Intl.Segmenter`
 * sees them: a surrogate pair, a base with its combining marks, CRLF, a flag or a ZWJ emoji
 * sequence is one grapheme. Linear in the length of the text (see `graphemesInChunks`).
 */
export const graphemes = (text: string): Generator<string> => graphemesInChunks(text, GRAPHEME_CHUNK_LENGTH);

/** The number of grapheme clusters of the text. */
export const countGraphemes = (text: string): number => {
  let count = 0;
  for (const _ of graphemes(text)) {
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
const EMOJI_MARK = /[\p{Emoji_Presentation}\uFE0F\p{Regional_Indicator}\u20E3]/u;

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
 *   selectors) and another Extended_Pictographic (`👨\u200D👩\u200D👧`, `🧑🏽\u200D💻`, `❤\uFE0F\u200D🔥`);
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
      // Keeps the state: `🧑🏽\u200D💻`, `❤\uFE0F\u200D🔥`.
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
