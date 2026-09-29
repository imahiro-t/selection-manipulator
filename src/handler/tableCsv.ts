/**
 * Shared, vscode-independent CSV / TSV reader and writer of the TABLE-001..030 commands:
 * an RFC 4180 parser (`parseDelimited`), a writer with minimal quoting (`writeDelimited`), the
 * limits, the column lookup and the checks of the values typed into the input boxes.
 *
 * Security rules (SECURITY.md): nothing here evaluates code, every loop is linear in the input,
 * the input, the grid (rows x columns) and the output are limited, and no regular expression is
 * built from the user's text.
 */
import { quoteForDisplay } from '../textFormat';
import { EncOutputTooLargeError, MAX_OUTPUT_LENGTH } from './encodeTransforms';
import { OutputBuffer } from './dataCommon';

/** The selected text or a typed value cannot be used; the message is shown to the user as it is. */
export class TableInputError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'TableInputError';
  }
}

/** Upper limit of the length (UTF-16 code units) of one selection (the same as the DATA commands). */
export const TABLE_MAX_INPUT_LENGTH = 5_000_000;
/**
 * Upper limit of rows x (the largest number of cells in a row). A common safety limit of all 30
 * commands against huge results (padding ragged rows with empty cells, transposing...): a table
 * above it is refused even by commands that do not pad.
 */
export const TABLE_MAX_GRID_CELLS = 10_000_000;
/** Upper limit of the length of a value typed into an input box. */
export const TABLE_MAX_PROMPT_LENGTH = 1_000;
/** Maximum number of characters of the selected text quoted in a message. */
export const TABLE_MESSAGE_TEXT_LIMIT = 60;

export { MAX_OUTPUT_LENGTH };

/**
 * The table has more cells than TABLE_MAX_GRID_CELLS. Reported like a result that is too long
 * (a warning), with its own message.
 */
export class TableTooLargeError extends EncOutputTooLargeError {
  constructor(readonly rows: number, readonly columns: number) {
    super(rows * columns, TABLE_MAX_GRID_CELLS);
    const count = (n: number) => n.toLocaleString('en-US');
    this.message = `the table is too large: ${count(rows)} rows × ${count(columns)} columns is more than ${count(TABLE_MAX_GRID_CELLS)} cells`;
    this.name = 'TableTooLargeError';
  }
}

export const outputTooLarge = (length: number): EncOutputTooLargeError => new EncOutputTooLargeError(length, MAX_OUTPUT_LENGTH);

/** `text` quoted like JSON and cut to TABLE_MESSAGE_TEXT_LIMIT characters (for messages). */
export const quoteText = (text: string): string => quoteForDisplay(text, TABLE_MESSAGE_TEXT_LIMIT);

/** `text` escaped like JSON (control characters made visible), cut to TABLE_MESSAGE_TEXT_LIMIT, without the quotes. */
export const shortText = (text: string): string => quoteText(text).slice(1, -1);

export const assertTableInputLength = (text: string): void => {
  if (text.length > TABLE_MAX_INPUT_LENGTH) {
    throw new TableInputError(`the selection is longer than ${TABLE_MAX_INPUT_LENGTH.toLocaleString('en-US')} characters`);
  }
};

/** Throws when the table is empty or rows x (the widest row) is more than TABLE_MAX_GRID_CELLS. */
export const assertTableShape = (rows: readonly (readonly string[])[]): void => {
  if (rows.length === 0) {
    throw new TableInputError('no rows found');
  }
  const columns = columnCount(rows);
  if (rows.length * columns > TABLE_MAX_GRID_CELLS) {
    throw new TableTooLargeError(rows.length, columns);
  }
};

/** The largest number of cells in a row. */
export const columnCount = (rows: readonly (readonly string[])[]): number => {
  let columns = 0;
  for (const row of rows) {
    columns = Math.max(columns, row.length);
  }
  return columns;
};

const QUOTE = 0x22;
const CR = 0x0d;
const LF = 0x0a;
const SPACE = 0x20;
const TAB = 0x09;

/** Number of line breaks (LF, CRLF or a lone CR) in `text[start..end)`. */
const countLineBreaks = (text: string, start: number, end: number): number => {
  let count = 0;
  for (let i = start; i < end; i++) {
    const c = text.charCodeAt(i);
    if (c === LF || (c === CR && text.charCodeAt(i + 1) !== LF)) {
      count++;
    }
  }
  return count;
};

/**
 * Reads CSV / TSV (RFC 4180): fields in double quotes may hold the delimiter, `""` (one quote)
 * and line breaks; records end with CRLF, LF or CR. Also:
 * - a leading BOM is removed; lines that are completely empty (outside quotes) are skipped, and
 *   a final line break does not make an empty record;
 * - a `"` in the middle of an unquoted field is an ordinary character (`5"`);
 * - after a closing quote come, checked in this order: the delimiter, a line break, the end, or
 *   spaces / tabs other than the delimiter (skipped, so that the output of Align Columns reads
 *   back); anything else, like an unclosed quote, is an error that names the line (1-based,
 *   counted in the selection).
 * `delimiter` is one UTF-16 code unit (`,` or a tab). The result has at least one record and at
 * most TABLE_MAX_GRID_CELLS cells counted as rows x (the widest row).
 */
export const parseDelimited = (text: string, delimiter: string): string[][] => {
  assertTableInputLength(text);
  if (delimiter.length !== 1) {
    throw new Error('parseDelimited: the delimiter must be one code unit');
  }
  const d = delimiter.charCodeAt(0);
  const n = text.length;
  const rows: string[][] = [];
  let i = text.charCodeAt(0) === 0xfeff ? 1 : 0;
  let line = 1;
  while (i < n) {
    const first = text.charCodeAt(i);
    if (first === LF || first === CR) {
      // A completely empty line.
      i += first === CR && text.charCodeAt(i + 1) === LF ? 2 : 1;
      line++;
      continue;
    }
    const row: string[] = [];
    for (;;) {
      if (text.charCodeAt(i) === QUOTE) {
        const startLine = line;
        let value = '';
        let position = i + 1;
        for (;;) {
          const quote = text.indexOf('"', position);
          if (quote < 0) {
            throw new TableInputError(`line ${startLine}: a quoted field is not closed`);
          }
          line += countLineBreaks(text, position, quote);
          value += text.slice(position, quote);
          if (text.charCodeAt(quote + 1) === QUOTE) {
            value += '"';
            position = quote + 2;
            continue;
          }
          i = quote + 1;
          break;
        }
        while (i < n) {
          const c = text.charCodeAt(i);
          if (c === d || c === CR || c === LF) {
            break;
          }
          // The delimiter was checked first, so a tab here is not the TSV delimiter.
          if (c === SPACE || c === TAB) {
            i++;
            continue;
          }
          throw new TableInputError(`line ${line}: a closing quote must be followed by a delimiter or a line break`);
        }
        row.push(value);
      } else {
        let end = i;
        while (end < n) {
          const c = text.charCodeAt(end);
          if (c === d || c === CR || c === LF) {
            break;
          }
          end++;
        }
        row.push(text.slice(i, end));
        i = end;
      }
      if (i < n && text.charCodeAt(i) === d) {
        i++;
        continue;
      }
      break;
    }
    rows.push(row);
    if (i < n) {
      i += text.charCodeAt(i) === CR && text.charCodeAt(i + 1) === LF ? 2 : 1;
      line++;
    }
  }
  assertTableShape(rows);
  return rows;
};

/** Whether the cell has to be quoted: it holds the delimiter, a double quote, CR or LF. */
const needsQuotes = (cell: string, delimiter: string): boolean =>
  cell.includes(delimiter) || cell.includes('"') || cell.includes('\r') || cell.includes('\n');

/** One cell as it is written: quoted (with `"` doubled) only when needed, or always with `quoteAll`. */
export const writeCell = (cell: string, delimiter: string, quoteAll = false): string =>
  quoteAll || needsQuotes(cell, delimiter) ? `"${cell.replace(/"/g, '""')}"` : cell;

export interface WriteOptions {
  /** TABLE-018: quote every cell, the empty ones too. */
  quoteAll?: boolean;
}

/**
 * Writes rows as CSV / TSV with minimal quoting, lines joined with LF (the handler converts them
 * to the document's EOL). A row that would be an empty line (no cell, or one empty cell) is
 * written as `""`, so that it is not skipped when the result is read again. Stops as soon as the
 * result would exceed MAX_OUTPUT_LENGTH.
 */
export const writeDelimited = (rows: readonly (readonly string[])[], delimiter: string, options: WriteOptions = {}): string => {
  const quoteAll = options.quoteAll === true;
  const out = new OutputBuffer();
  for (const row of rows) {
    if (row.length === 0 || (row.length === 1 && row[0] === '')) {
      out.push('""');
      continue;
    }
    out.push(row.map((cell) => writeCell(cell, delimiter, quoteAll)).join(delimiter));
  }
  return out.join('\n');
};

/** Copies of the rows, each padded with empty cells to the widest row. */
export const normalizeRows = (rows: readonly (readonly string[])[]): string[][] => {
  const columns = columnCount(rows);
  return rows.map((row) => {
    const copy = row.slice();
    while (copy.length < columns) {
      copy.push('');
    }
    return copy;
  });
};

/** Whether the selection ends with a line break (then the result ends with one LF too). */
export const hasTrailingLineBreak = (text: string): boolean => text.endsWith('\n') || text.endsWith('\r');

/** Removes leading and trailing spaces / tabs (without a regular expression, in linear time). */
export const trimSpaceTab = (text: string): string => {
  let start = 0;
  let end = text.length;
  while (start < end && (text.charCodeAt(start) === SPACE || text.charCodeAt(start) === TAB)) {
    start++;
  }
  while (end > start && (text.charCodeAt(end - 1) === SPACE || text.charCodeAt(end - 1) === TAB)) {
    end--;
  }
  return start === 0 && end === text.length ? text : text.slice(start, end);
};

/**
 * Finds a column (0-based) from what was typed: digits only are a 1-based column number
 * (1..`columns`), anything else is the exact (case-sensitive) text of one cell of the header.
 * A number out of range, a name that no header cell has, or a name that several have is an error.
 */
export const resolveColumn = (header: readonly string[], columns: number, input: string): number => {
  const trimmed = input.trim();
  if (/^[0-9]+$/.test(trimmed)) {
    const number = Number(trimmed);
    if (number < 1 || number > columns) {
      throw new TableInputError(`column ${trimmed.length > 12 ? `${trimmed.slice(0, 12)}…` : trimmed} is out of range: the table has ${columns} column${columns === 1 ? '' : 's'}`);
    }
    return number - 1;
  }
  const matches: number[] = [];
  header.forEach((cell, index) => {
    if (cell === input) {
      matches.push(index);
    }
  });
  if (matches.length === 0) {
    throw new TableInputError(`no column named ${quoteText(input)} in the header`);
  }
  if (matches.length > 1) {
    throw new TableInputError(`${matches.length} columns are named ${quoteText(input)}; use the column number`);
  }
  return matches[0];
};

/** Control characters (C0 and DEL), tabs and line breaks included. */
const CONTROL = /[\u0000-\u001f\u007f]/;

/**
 * TABLE-017: the delimiter typed into the input box. `\t` (two characters) is a tab; otherwise
 * exactly one code point that is not `"`, a line break, another control character or a lone
 * surrogate. Returns the delimiter, or throws.
 */
export const parseDelimiterInput = (input: string): string => {
  if (input === '\\t') {
    return '\t';
  }
  const problem = findDelimiterProblem(input);
  if (problem !== undefined) {
    throw new TableInputError(problem);
  }
  return input;
};

/** Why `input` cannot be a delimiter (TABLE-017), or `undefined`. */
export const findDelimiterProblem = (input: string): string | undefined => {
  if (input === '\\t') {
    return undefined;
  }
  if (input === '') {
    return 'Enter one character (type \\t for a tab).';
  }
  const codePoints = [...input];
  if (codePoints.length !== 1) {
    return 'The delimiter must be exactly one character (type \\t for a tab).';
  }
  const code = input.codePointAt(0)!;
  if (code >= 0xd800 && code <= 0xdfff) {
    return 'The delimiter must be a complete character (a lone surrogate cannot be written).';
  }
  if (input === '"') {
    return 'The double quote cannot be the delimiter.';
  }
  if (CONTROL.test(input)) {
    return 'The delimiter must not be a line break or a control character (type \\t for a tab).';
  }
  return undefined;
};

export interface PromptRule {
  /** An empty value is accepted (TABLE-014: the value to compare with). */
  allowEmpty?: boolean;
  /** TABLE-017: the value is a delimiter. */
  delimiter?: boolean;
}

/**
 * Why a value typed into an input box cannot be used, or `undefined`: longer than
 * TABLE_MAX_PROMPT_LENGTH, empty (unless allowed), or holding a control character (tabs and line
 * breaks included: a tab delimiter is typed as `\t`). Used as `validateInput` and checked again
 * before running.
 */
export const findPromptProblem = (value: string, rule: PromptRule = {}): string | undefined => {
  if (value.length > TABLE_MAX_PROMPT_LENGTH) {
    return `The value is longer than ${TABLE_MAX_PROMPT_LENGTH.toLocaleString('en-US')} characters.`;
  }
  if (rule.delimiter) {
    return findDelimiterProblem(value);
  }
  if (value === '' && !rule.allowEmpty) {
    return 'Enter a value.';
  }
  if (CONTROL.test(value)) {
    return 'The value must not contain tabs, line breaks or other control characters.';
  }
  return undefined;
};
