/**
 * Shared, vscode-independent helpers of the DEV-001..035 developer commands: the errors, the
 * limits, the output budget and the line splitting that every command uses.
 *
 * Security rules (SECURITY.md): nothing here evaluates code, runs a process or opens a connection,
 * no regular expression is built from the user's text (every expression is a constant compiled
 * once), every loop is linear in the input, and the results are counted against the output limit.
 */
import { quoteForDisplay } from '../textFormat';
import { EncOutputTooLargeError, MAX_OUTPUT_LENGTH } from './encodeTransforms';

/** The selected text cannot be used; the message is shown to the user as it is. */
export class DevInputError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'DevInputError';
  }
}

/** Upper limit of the length (UTF-16 code units) of one selection. */
export const DEV_MAX_INPUT_LENGTH = 1_000_000;
/** Upper limit of the nesting depth of JSON, HTML, SQL and CSS (deeper input is refused). */
export const DEV_MAX_NESTING = 200;
/** Maximum number of characters of the selected text quoted in a message. */
export const DEV_MESSAGE_TEXT_LIMIT = 60;

/** `text` quoted like JSON and cut to DEV_MESSAGE_TEXT_LIMIT characters (for messages). */
export const quoteText = (text: string): string => quoteForDisplay(text, DEV_MESSAGE_TEXT_LIMIT);

export const assertDevInputLength = (text: string): void => {
  if (text.length > DEV_MAX_INPUT_LENGTH) {
    throw new DevInputError(`the selection is longer than ${DEV_MAX_INPUT_LENGTH.toLocaleString('en-US')} characters`);
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
export class DevOutputBuffer {
  private readonly parts: string[] = [];
  private total = 0;

  constructor(private readonly budget: number) { }

  push(part: string): void {
    assertWithinBudget(this.total + part.length, this.budget);
    this.total += part.length;
    this.parts.push(part);
  }

  get length(): number {
    return this.total;
  }

  join(): string {
    return this.parts.join('');
  }
}

/** One line of a text and the line break after it (`''` for the last line). */
export interface DevLine {
  text: string;
  lineBreak: string;
}

/**
 * Splits a text into lines, keeping each line break (`\r\n`, `\n` or a lone `\r`) with the line
 * before it. The last line has the line break `''` (it is `''` itself when the text ends with a
 * line break). Linear in the length of the text.
 */
export const splitDevLines = (text: string): DevLine[] => {
  const lines: DevLine[] = [];
  let start = 0;
  for (let i = 0; i < text.length; i++) {
    const code = text.charCodeAt(i);
    if (code === 0x0a) {
      lines.push({ text: text.slice(start, i), lineBreak: '\n' });
      start = i + 1;
    } else if (code === 0x0d) {
      const crlf = text.charCodeAt(i + 1) === 0x0a;
      lines.push({ text: text.slice(start, i), lineBreak: crlf ? '\r\n' : '\r' });
      if (crlf) {
        i++;
      }
      start = i + 1;
    }
  }
  lines.push({ text: text.slice(start), lineBreak: '' });
  return lines;
};
