/**
 * Shared, vscode-independent helpers of the category commands (DEV, UNI, JA, DATE, GEN, NUM, LINE,
 * WS, DATA, ...):
 * - the blank test, the input length check, the output budget (`OutputBuffer`) and the two line
 *   splitters (`forEachLine`, `forEachLfLine`);
 * - the horizontal whitespace helpers of the WS and LINE commands (`LINE_BREAK`, `isSpaceOrTab`,
 *   `isHorizontalWs`, `leadingLength`, `trailingStart`, `isBlankLine`, `sum`);
 * - `JS_IDENTIFIER`, the unquoted property key test of the DATA and DEV commands.
 *
 * Each category keeps its own names for these as aliases, re-exports or thin wrappers, so the
 * rules live in one place: for example `isBlank`, `assertXxxInputLength`, `XxxOutputBuffer` and
 * `forEachXxxLine` (DEV, UNI, JA, DATE, GEN, NUM), `lineTransforms.isBlankLine` (LINE) and
 * `dataCommon.IDENTIFIER` (DATA).
 *
 * Security rules (SECURITY.md): nothing here evaluates code, no regular expression is built from
 * the user's text, every loop is linear in the input, and the results are counted against the
 * output limit while they are built.
 *
 * This module depends only on `encodeTransforms` (the output limit and its error), so that every
 * `*Common.ts` / `*Transforms.ts` module can import it without an import cycle.
 */
import { EncOutputTooLargeError, MAX_OUTPUT_LENGTH } from './encodeTransforms';

/** True when the text holds only spaces, tabs and line breaks (or nothing). */
export const isBlank = (text: string): boolean => !/[^ \t\r\n]/.test(text);

/**
 * Throws the error `makeError` makes from `the selection is longer than N characters` when the
 * text is longer than `max` (UTF-16 code units).
 */
export const assertInputLength = (text: string, max: number, makeError: (message: string) => Error): void => {
  if (text.length > max) {
    throw makeError(`the selection is longer than ${max.toLocaleString('en-US')} characters`);
  }
};

/** Throws `EncOutputTooLargeError` when a result of `length` characters exceeds `budget`. */
export const assertWithinBudget = (length: number, budget: number): void => {
  if (length > budget) {
    throw new EncOutputTooLargeError(length, MAX_OUTPUT_LENGTH);
  }
};

/**
 * Throws `EncOutputTooLargeError` when the results of all selections together (`total`
 * characters) exceed MAX_OUTPUT_LENGTH. Used by the handlers after each selection.
 */
export const assertTotalOutput = (total: number): void => {
  if (total > MAX_OUTPUT_LENGTH) {
    throw new EncOutputTooLargeError(total, MAX_OUTPUT_LENGTH);
  }
};

/**
 * Collects pieces of a result and throws `EncOutputTooLargeError` as soon as their total length
 * would exceed `budget` (what is left of MAX_OUTPUT_LENGTH for this selection), so a result that
 * is many times longer than the input is never built in full. A piece that does not fit is not
 * added.
 */
export class OutputBuffer {
  private readonly parts: string[] = [];
  private total = 0;

  constructor(private readonly budget: number) { }

  get length(): number {
    return this.total;
  }

  /** Throws when `length` more characters would exceed the budget (nothing is added). */
  reserve(length: number): void {
    assertWithinBudget(this.total + length, this.budget);
  }

  push(part: string): void {
    this.reserve(part.length);
    this.total += part.length;
    this.parts.push(part);
  }

  join(separator = ''): string {
    return this.parts.join(separator);
  }
}

/**
 * Calls `visit` for every line of the text with the line, the line break after it (`''` for the
 * last line) and its number (from 1). LF, CRLF and a lone CR are recognised. The line breaks are
 * found with `indexOf` (the next LF and the next CR) rather than by looking at every character,
 * so that a long line is not read once more just for this.
 *
 * See `forEachLfLine` for the variant in which a lone CR is part of the line.
 */
export const forEachLine = (text: string, visit: (line: string, lineBreak: string, lineNumber: number) => void): void => {
  let start = 0;
  let lineNumber = 1;
  let lf = text.indexOf('\n');
  let cr = text.indexOf('\r');
  while (lf >= 0 || cr >= 0) {
    const at = lf < 0 ? cr : cr < 0 ? lf : Math.min(lf, cr);
    const breakLength = at === cr && text.charCodeAt(at + 1) === 0x0a ? 2 : 1;
    visit(text.slice(start, at), text.slice(at, at + breakLength), lineNumber);
    start = at + breakLength;
    lineNumber++;
    if (lf >= 0 && lf < start) {
      lf = text.indexOf('\n', start);
    }
    if (cr >= 0 && cr < start) {
      cr = text.indexOf('\r', start);
    }
  }
  visit(text.slice(start), '', lineNumber);
};

/**
 * Calls `visit` for every line of the text with the line itself, the line break after it (`''`
 * for the last line) and its number (from 1). Only LF and CRLF are recognised: a lone CR stays in
 * the line (the JA, UNI and DATE commands), also at the very end of the text (`'a\r'` visits
 * `'a\r'`, `''`, 1). The lines and line breaks joined together are always the text again.
 *
 * See `forEachLine` for the variant in which a lone CR is a line break too.
 */
export const forEachLfLine = (text: string, visit: (line: string, lineBreak: string, lineNumber: number) => void): void => {
  let start = 0;
  let lineNumber = 1;
  for (;;) {
    const newline = text.indexOf('\n', start);
    const end = newline === -1 ? text.length : newline;
    // Only a CR right before an LF belongs to the line break (CRLF); any other CR stays in the line.
    const breakStart = newline !== -1 && end > start && text.charCodeAt(end - 1) === 0x0d ? end - 1 : end;
    visit(text.slice(start, breakStart), newline === -1 ? '' : text.slice(breakStart, newline + 1), lineNumber);
    if (newline === -1) {
      return;
    }
    start = newline + 1;
    lineNumber++;
  }
};

// ---------------------------------------------------------------------------------------------
// Horizontal whitespace (the WS and LINE commands)
// ---------------------------------------------------------------------------------------------

/** A line break: CRLF, LF or a lone CR (for `split`). */
export const LINE_BREAK = /\r\n|\r|\n/;

/** Space or tab. */
export const isSpaceOrTab = (ch: string): boolean => ch === ' ' || ch === '\t';

/**
 * Unicode whitespace other than line breaks ([^\S\r\n]), except U+FEFF (BOM / zero width
 * no-break space): it has no width, so, as in WS-014, it is not treated as a space and a BOM
 * is never trimmed away. All such characters are in the BMP.
 */
export const isHorizontalWs = (ch: string): boolean =>
  ch !== '\n' && ch !== '\r' && ch !== '\ufeff' && /^\s$/.test(ch);

/** Number of leading code units of `s` satisfying `pred`. */
export const leadingLength = (s: string, pred: (ch: string) => boolean): number => {
  let i = 0;
  while (i < s.length && pred(s[i])) {
    i++;
  }
  return i;
};

/** Index where the trailing run of code units of `s` satisfying `pred` starts (`s.length` when there is none). */
export const trailingStart = (s: string, pred: (ch: string) => boolean): number => {
  let i = s.length;
  while (i > 0 && pred(s[i - 1])) {
    i--;
  }
  return i;
};

/** A line that is empty or made only of `isHorizontalWs` characters. */
export const isBlankLine = (s: string): boolean => leadingLength(s, isHorizontalWs) === s.length;

/** The sum of the numbers. */
export const sum = (values: number[]): number => values.reduce((a, b) => a + b, 0);

/** A JavaScript identifier (ASCII only) that can be written as a property key without quotes. */
export const JS_IDENTIFIER = /^[A-Za-z_$][A-Za-z0-9_$]*$/;
