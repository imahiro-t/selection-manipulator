/**
 * Shared, vscode-independent helpers of the DEV-001..035 developer commands: the errors, the
 * limits, the output budget and the line splitting that every command uses.
 *
 * Security rules (SECURITY.md): nothing here evaluates code, runs a process or opens a connection,
 * no regular expression is built from the user's text (every expression is a constant compiled
 * once), every loop is linear in the input, and the results are counted against the output limit.
 */
import { quoteForDisplay } from '../textFormat';
import { assertInputLength, forEachLine, isBlank, OutputBuffer } from './textCommon';

export { assertWithinBudget, isBlank, OutputBuffer as DevOutputBuffer } from './textCommon';

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

export const assertDevInputLength = (text: string): void =>
  assertInputLength(text, DEV_MAX_INPUT_LENGTH, (message) => new DevInputError(message));

/** One line of a text and the line break after it (`''` for the last line). */
export interface DevLine {
  text: string;
  lineBreak: string;
}

/**
 * Splits a text into lines, keeping each line break (`\r\n`, `\n` or a lone `\r`) with the line
 * before it. The last line has the line break `''` (it is `''` itself when the text ends with a
 * line break). Linear in the length of the text (the line breaks are found by `forEachLine`).
 */
export const splitDevLines = (text: string): DevLine[] => {
  const lines: DevLine[] = [];
  forEachLine(text, (line, lineBreak) => {
    lines.push({ text: line, lineBreak });
  });
  return lines;
};

/**
 * Converts every non-blank line of `text` with `convert` on its own: blank lines, the spaces around
 * each value and the line breaks are kept. When `convert` returns undefined for a line, the whole
 * text is an error: `line N: "…" is not <what>` (the line number only when there are several lines).
 */
export const convertEachLine = (
  text: string,
  budget: number,
  convert: (value: string) => string | undefined,
  what: string,
): string => {
  const out = new OutputBuffer(budget);
  const lines = splitDevLines(text);
  lines.forEach((line, index) => {
    if (isBlank(line.text)) {
      out.push(line.text + line.lineBreak);
      return;
    }
    const start = line.text.length - line.text.trimStart().length;
    const end = line.text.trimEnd().length;
    const value = line.text.slice(start, end);
    const converted = convert(value);
    if (converted === undefined) {
      const where = lines.length > 1 ? `line ${index + 1}: ` : '';
      throw new DevInputError(`${where}${quoteText(value)} is not ${what}`);
    }
    out.push(line.text.slice(0, start) + converted + line.text.slice(end) + line.lineBreak);
  });
  return out.join();
};
