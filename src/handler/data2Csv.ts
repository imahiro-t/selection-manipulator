/**
 * The five CSV column commands of group DATA2 (DATAX-018..022). They read and write CSV with the
 * TABLE reader / writer (`tableCsv.ts`: RFC 4180, minimal quoting, the same limits) and follow the
 * TABLE rules: a column is a 1-based number or the exact text of a header cell, ragged rows are
 * padded with empty cells, and the result ends with a line break only when the selection did.
 *
 * Security rules (SECURITY.md): no code evaluation and no regular expression built from the
 * user's text (the delimiter of DATAX-020 is split as plain text); the input, the grid (rows x
 * columns) and the output are limited; counts are kept in a `Map` (no prototype involved).
 */
import { CountLimitError } from './dataCommon';
import {
  assertTableInputLength,
  columnCount,
  findPromptProblem,
  hasTrailingLineBreak,
  normalizeRows,
  parseDelimited,
  resolveColumn,
  TABLE_MAX_GRID_CELLS,
  TableInputError,
  TableTooLargeError,
  writeDelimited,
} from './tableCsv';

/** DATAX-020: upper limit of the number of columns added by splitting. */
export const SPLIT_MAX_ADDED_COLUMNS = 1_000;
/** DATAX-019 / 020: upper limit of the length of the separator / delimiter. */
export const CSV_SEPARATOR_MAX_LENGTH = 100;

/** Control characters (C0 and DEL), tabs and line breaks included. */
const CONTROL = /[\u0000-\u001f\u007f]/;

const readCsv = (text: string): string[][] => parseDelimited(text, ',');

/** Writes CSV and ends with a line break when the selection did. */
const writeLike = (rows: readonly (readonly string[])[], text: string): string => {
  const body = writeDelimited(rows, ',');
  return hasTrailingLineBreak(text) ? `${body}\n` : body;
};

/** Why a column order (`3,1,2`) cannot be used, or `undefined` (DATAX-018). */
export const findColumnOrderProblem = (value: string): string | undefined => {
  const problem = findPromptProblem(value);
  if (problem !== undefined) {
    return problem;
  }
  const seen = new Set<string>();
  for (const part of value.split(',')) {
    const item = part.trim();
    if (!/^[1-9][0-9]{0,8}$/.test(item)) {
      return 'Enter column numbers separated by commas (e.g. 3,1,2).';
    }
    if (seen.has(item)) {
      return 'Each column number may appear only once.';
    }
    seen.add(item);
  }
  return undefined;
};

/** Why a separator (DATAX-019, may be empty) or a delimiter (DATAX-020) cannot be used, or `undefined`. */
export const findSeparatorProblem = (value: string, allowEmpty: boolean): string | undefined => {
  if (value === '' && !allowEmpty) {
    return 'Enter the delimiter (1 to 100 characters).';
  }
  if (value.length > CSV_SEPARATOR_MAX_LENGTH) {
    return `The delimiter is longer than ${CSV_SEPARATOR_MAX_LENGTH} characters.`;
  }
  if (CONTROL.test(value)) {
    return 'The delimiter must not contain tabs, line breaks or other control characters.';
  }
  return undefined;
};

/** DATAX-018: puts the columns in the order typed (`3,1,2`); every column exactly once. */
export const reorderColumns = (text: string, [order]: readonly string[]): string => {
  const problem = findColumnOrderProblem(order);
  if (problem !== undefined) {
    throw new TableInputError(problem);
  }
  const rows = normalizeRows(readCsv(text));
  const columns = rows[0].length;
  const indexes = order.split(',').map((item) => Number(item.trim()) - 1);
  if (indexes.length !== columns || indexes.some((index) => index >= columns)) {
    throw new TableInputError(`list every column of the table exactly once (the table has ${columns} column${columns === 1 ? '' : 's'}, ${indexes.length} given)`);
  }
  return writeLike(rows.map((row) => indexes.map((index) => row[index])), text);
};

/** DATAX-019: joins two columns with the separator into the place of the first; the second is removed. */
export const mergeColumns = (text: string, [first, second, separator]: readonly string[]): string => {
  const problem = findSeparatorProblem(separator, true);
  if (problem !== undefined) {
    throw new TableInputError(problem);
  }
  const rows = normalizeRows(readCsv(text));
  const columns = rows[0].length;
  const a = resolveColumn(rows[0], columns, first);
  const b = resolveColumn(rows[0], columns, second);
  if (a === b) {
    throw new TableInputError('the two columns are the same column');
  }
  const merged = rows.map((row) => {
    const result: string[] = [];
    row.forEach((cell, index) => {
      if (index === a) {
        result.push(`${cell}${separator}${row[b]}`);
      } else if (index !== b) {
        result.push(cell);
      }
    });
    return result;
  });
  return writeLike(merged, text);
};

/**
 * DATAX-020: splits one column at every occurrence of the delimiter (plain text, not a regular
 * expression) into as many columns as the row with the most parts needs; the header row too.
 * At most SPLIT_MAX_ADDED_COLUMNS columns are added, and the grid stays within TABLE_MAX_GRID_CELLS.
 */
export const splitColumn = (text: string, [column, delimiter]: readonly string[]): string => {
  const problem = findSeparatorProblem(delimiter, false);
  if (problem !== undefined) {
    throw new TableInputError(problem);
  }
  const rows = normalizeRows(readCsv(text));
  const columns = rows[0].length;
  const index = resolveColumn(rows[0], columns, column);
  const parts = rows.map((row) => row[index].split(delimiter));
  let widest = 1;
  for (const cellParts of parts) {
    widest = Math.max(widest, cellParts.length);
  }
  const added = widest - 1;
  if (added > SPLIT_MAX_ADDED_COLUMNS) {
    throw new CountLimitError(added, SPLIT_MAX_ADDED_COLUMNS, 'added columns');
  }
  if (rows.length * (columns + added) > TABLE_MAX_GRID_CELLS) {
    throw new TableTooLargeError(rows.length, columns + added);
  }
  const split = rows.map((row, r) => {
    const cells = parts[r];
    while (cells.length < widest) {
      cells.push('');
    }
    return [...row.slice(0, index), ...cells, ...row.slice(index + 1)];
  });
  return writeLike(split, text);
};

/**
 * DATAX-021: the number of data rows per value of a column, in order of first appearance, under
 * the header `<column name>,count`. The first row is the header.
 */
export const groupCount = (text: string, [column]: readonly string[]): string => {
  assertTableInputLength(text);
  const rows = readCsv(text);
  const [header, ...data] = rows;
  const index = resolveColumn(header, columnCount(rows), column);
  if (data.length === 0) {
    throw new TableInputError('no data rows (only the header was found)');
  }
  const counts = new Map<string, number>();
  for (const row of data) {
    const value = index < row.length ? row[index] : '';
    counts.set(value, (counts.get(value) ?? 0) + 1);
  }
  const name = index < header.length ? header[index] : '';
  return writeLike([[name, 'count'], ...[...counts].map(([value, count]) => [value, String(count)])], text);
};

/**
 * DATAX-022: every empty cell (also the missing cells of a short row, and in the header row)
 * becomes the value typed; the value is quoted by the CSV rules when it needs to be.
 */
export const fillEmpty = (text: string, [value]: readonly string[]): string => {
  const problem = findPromptProblem(value);
  if (problem !== undefined) {
    throw new TableInputError(problem);
  }
  const rows = normalizeRows(readCsv(text)).map((row) => row.map((cell) => (cell === '' ? value : cell)));
  return writeLike(rows, text);
};
