/**
 * Pure (vscode-independent) part of the TABLE-001..030 CSV / TSV commands: the command table and
 * one transform per command. Every transform takes the selected text and the values typed into
 * the input boxes, and returns the result with LF line breaks, or throws `TableInputError` (shown
 * to the user, nothing changed) / `EncOutputTooLargeError` (the result or the table is too large).
 *
 * Only local processing: no network, files or processes, no `eval` / `new Function`, and no new
 * dependency (`js-yaml` was already used by other commands). Generated HTML and SQL are escaped,
 * and the SQL is only generated, never run.
 */
import * as yaml from 'js-yaml';
import { createRecord, DataInputError, isJsonObject, JsonValue, OutputBuffer, setOwn, stringifyCompact, stringifyPretty } from './dataCommon';
import { parseJson } from './dataTransforms';
import { SQL_BACKSLASH_REASON } from './sqlSafety';
import { codePointWidth } from './whitespaceTransforms';
import {
  assertTableInputLength,
  assertTableShape,
  columnCount,
  hasTrailingLineBreak,
  MAX_OUTPUT_LENGTH,
  normalizeRows,
  outputTooLarge,
  parseDelimited,
  parseDelimiterInput,
  PromptRule,
  quoteText,
  resolveColumn,
  shortText,
  TableInputError,
  TableTooLargeError,
  TABLE_MAX_GRID_CELLS,
  trimSpaceTab,
  writeCell,
  writeDelimited,
} from './tableCsv';

/** Where a command puts its result. */
export type TableOutput = 'new-tab' | 'replace' | 'notify';

/** One question asked before running: an input box, or a QuickPick of fixed items. */
export type TablePrompt =
  | { type: 'input'; prompt: string; placeHolder: string; rule: PromptRule }
  | { type: 'pick'; placeHolder: string; items: readonly string[] };

/** A transform of one selection; `inputs` are the answers to the prompts, in order. */
export type TableTransform = (text: string, inputs: readonly string[]) => string;

/** What a `notify` command shows for one selection (TABLE-015 / 023). */
export interface TableNotice {
  message: string;
  /** Shown as a warning (TABLE-015 found no number). */
  warning?: boolean;
}

export type TableNotify = (text: string, inputs: readonly string[]) => TableNotice;

interface TableCommandBase {
  /** ROADMAP ID, e.g. `TABLE-001`. */
  id: string;
  /** Command ID without the `selection-manipulator.` prefix. */
  name: string;
  /** Title in package.json / ROADMAP. */
  title: string;
  /** Questions asked once before running (answered for all selections). */
  prompts: readonly TablePrompt[];
}

export interface TableTransformEntry extends TableCommandBase {
  output: 'new-tab' | 'replace';
  transform: TableTransform;
}

export interface TableNotifyEntry extends TableCommandBase {
  output: 'notify';
  notify: TableNotify;
}

export type TableCommandEntry = TableTransformEntry | TableNotifyEntry;

// ---------------------------------------------------------------------------------------------
// Common rules
// ---------------------------------------------------------------------------------------------

const readCsv = (text: string): string[][] => parseDelimited(text, ',');

/** Adds the final line break when the selection ended with one (so that Replace keeps the lines apart). */
const keepTrailingLineBreak = (transform: TableTransform): TableTransform => (text, inputs) => {
  assertTableInputLength(text);
  const body = transform(text, inputs);
  return hasTrailingLineBreak(text) ? `${body}\n` : body;
};

/** A cell of a row, or '' when the row is shorter. */
const cellAt = (row: readonly string[], index: number): string => (index < row.length ? row[index] : '');

/**
 * The header and the data rows of commands that pair each value with its column name: a row with
 * more cells than the header is an error (its values would have no name); a shorter row gets ''.
 */
const headedRows = (rows: readonly string[][]): { header: string[]; data: string[][] } => {
  const [header, ...data] = rows;
  data.forEach((row, index) => {
    if (row.length > header.length) {
      throw new TableInputError(`row ${index + 2} has more cells than the header (${row.length} > ${header.length})`);
    }
  });
  return { header, data: data.map((row) => header.map((_, column) => cellAt(row, column))) };
};

/** TABLE-001 / 020: object keys must be unique. */
const assertUniqueHeader = (header: readonly string[]): void => {
  const seen = new Set<string>();
  for (const name of header) {
    if (seen.has(name)) {
      throw new TableInputError(`the header has the column name ${quoteText(name)} more than once`);
    }
    seen.add(name);
  }
};

/** Objects without a prototype (`__proto__` is an ordinary key), values always strings. */
const toRecords = (header: readonly string[], data: readonly string[][]): Record<string, string>[] =>
  data.map((row) => {
    const record = createRecord<string>();
    header.forEach((name, column) => setOwn(record, name, row[column]));
    return record;
  });

/**
 * Throws `EncOutputTooLargeError` before the records are built when the JSON / YAML would
 * certainly be longer than MAX_OUTPUT_LENGTH: every value takes at least its key, its value and
 * `extra` characters (quotes, `: `, indentation, line break).
 */
const assertRecordsFit = (header: readonly string[], data: readonly string[][], extra: number): void => {
  let estimate = 0;
  for (const row of data) {
    row.forEach((value, column) => {
      estimate += header[column].length + value.length + extra;
    });
    if (estimate > MAX_OUTPUT_LENGTH) {
      throw outputTooLarge(estimate);
    }
  }
};

const requireDataRows = (data: readonly unknown[]): void => {
  if (data.length === 0) {
    throw new TableInputError('no data rows (only the header was found)');
  }
};

// ---------------------------------------------------------------------------------------------
// Conversions
// ---------------------------------------------------------------------------------------------

/** TABLE-001 / 026: CSV -> array of objects (string values), indented with 2 spaces. */
export const csvToJson: TableTransform = (text) => {
  const { header, data } = headedRows(readCsv(text));
  assertUniqueHeader(header);
  // `    "key": "value",` and a line break.
  assertRecordsFit(header, data, 10);
  return stringifyPretty(toRecords(header, data) as unknown as JsonValue);
};

/** A JSON value as one CSV cell: strings as they are, null as '', objects / arrays as compact JSON. */
const jsonCell = (value: JsonValue | undefined): string => {
  if (value === undefined || value === null) {
    return '';
  }
  if (typeof value === 'string') {
    return value;
  }
  if (typeof value === 'object') {
    return stringifyCompact(value);
  }
  return JSON.stringify(value);
};

/**
 * Whether a parsed JSON value holds a number out of the double range (`1e400` is read as
 * Infinity, which JSON.stringify would write as `null`). Iterative: the depth is limited by
 * parseJson, but no call stack is needed either way.
 */
const hasNonFiniteNumber = (value: JsonValue): boolean => {
  const stack: JsonValue[] = [value];
  while (stack.length > 0) {
    const item = stack.pop()!;
    if (typeof item === 'number') {
      if (!Number.isFinite(item)) {
        return true;
      }
    } else if (Array.isArray(item)) {
      // One push per element: spreading a long array would exceed the argument limit.
      for (const element of item) {
        stack.push(element);
      }
    } else if (item !== null && typeof item === 'object') {
      for (const key of Object.keys(item)) {
        stack.push(item[key]);
      }
    }
  }
  return false;
};

/** TABLE-002 / 027: array of objects -> CSV; the header is the union of the keys in first-seen order. */
export const jsonToCsv: TableTransform = (text) => {
  let value: JsonValue;
  try {
    value = parseJson(text);
  } catch (error) {
    throw error instanceof DataInputError ? new TableInputError(error.message) : error;
  }
  if (!Array.isArray(value)) {
    throw new TableInputError('Convert from JSON Array needs a JSON array of objects');
  }
  if (value.length === 0) {
    throw new TableInputError('the JSON array is empty');
  }
  const keys = new Set<string>();
  value.forEach((item, index) => {
    if (!isJsonObject(item)) {
      throw new TableInputError(`element ${index + 1} of the array is not an object`);
    }
    if (hasNonFiniteNumber(item)) {
      throw new TableInputError(`element ${index + 1}: a number is out of range`);
    }
    Object.keys(item).forEach((key) => keys.add(key));
  });
  const header = [...keys];
  if (header.length === 0) {
    throw new TableInputError('the objects have no keys');
  }
  const rows = value.length + 1;
  if (rows * header.length > TABLE_MAX_GRID_CELLS) {
    throw new TableTooLargeError(rows, header.length);
  }
  const has = (item: object, key: string) => Object.prototype.hasOwnProperty.call(item, key);
  const data = value.map((item) => header.map((key) => jsonCell(has(item as object, key) ? (item as Record<string, JsonValue>)[key] : undefined)));
  return writeDelimited([header, ...data], ',');
};

/** TABLE-003 / 028: CSV -> TSV (cells with a tab, a line break or `"` are quoted). */
export const csvToTsv: TableTransform = (text) => writeDelimited(readCsv(text), '\t');

/** TABLE-004: TSV (quoted cells allowed) -> CSV. */
export const tsvToCsv: TableTransform = (text) => writeDelimited(parseDelimited(text, '\t'), ',');

/** TABLE-005 / 029: rows <-> columns (ragged rows are padded first). */
export const transpose: TableTransform = (text) => {
  const rows = normalizeRows(readCsv(text));
  const columns = rows[0].length;
  const result: string[][] = [];
  for (let column = 0; column < columns; column++) {
    result.push(rows.map((row) => row[column]));
  }
  return writeDelimited(result, ',');
};

/** TABLE-006: only one column (header included). */
export const extractColumn: TableTransform = (text, [column]) => {
  const rows = readCsv(text);
  const index = resolveColumn(rows[0], columnCount(rows), column);
  return writeDelimited(rows.map((row) => [cellAt(row, index)]), ',');
};

/** TABLE-007: removes one column; a shorter row without that column stays as it is. */
export const removeColumn: TableTransform = (text, [column]) => {
  const rows = readCsv(text);
  const columns = columnCount(rows);
  if (columns === 1) {
    throw new TableInputError('the table has only one column');
  }
  const index = resolveColumn(rows[0], columns, column);
  return writeDelimited(rows.map((row) => row.filter((_, i) => i !== index)), ',');
};

/** TABLE-008: swaps two columns (ragged rows are padded first). */
export const swapColumns: TableTransform = (text, [first, second]) => {
  const rows = readCsv(text);
  const columns = columnCount(rows);
  const a = resolveColumn(rows[0], columns, first);
  const b = resolveColumn(rows[0], columns, second);
  if (a === b) {
    throw new TableInputError('the two columns are the same column');
  }
  const swapped = normalizeRows(rows).map((row) => {
    [row[a], row[b]] = [row[b], row[a]];
    return row;
  });
  return writeDelimited(swapped, ',');
};

/**
 * The width (number of code points) of every cell and the widest cell of every column, for the
 * padding of TABLE-009 / 021.
 */
const measureColumns = (rows: readonly (readonly string[])[]): { widths: number[]; cellWidths: number[][] } => {
  const widths: number[] = [];
  const cellWidths = rows.map((row) => row.map((cell, column) => {
    const width = codePointWidth(cell);
    widths[column] = Math.max(widths[column] ?? 0, width);
    return width;
  }));
  return { widths, cellWidths };
};

/**
 * TABLE-009: pads every cell but the last of each row with spaces to the widest cell of its
 * column (as written, quotes included; width = number of code points). The length of the result
 * is computed before it is built.
 */
export const alignColumns: TableTransform = (text) => {
  // A row of one empty cell is written as `""` (as by writeDelimited), so that it is not an empty line.
  const written = readCsv(text).map((row) => (row.length === 1 && row[0] === '' ? ['""'] : row.map((cell) => writeCell(cell, ','))));
  const { widths, cellWidths } = measureColumns(written);
  let total = Math.max(0, written.length - 1);
  written.forEach((row, r) => {
    row.forEach((cell, column) => {
      total += cell.length + (column < row.length - 1 ? 1 + widths[column] - cellWidths[r][column] : 0);
    });
    if (total > MAX_OUTPUT_LENGTH) {
      throw outputTooLarge(total);
    }
  });
  return written.map((row, r) => row.map((cell, column) =>
    column < row.length - 1 ? cell + ' '.repeat(widths[column] - cellWidths[r][column]) : cell).join(',')).join('\n');
};

/** TABLE-010: removes the spaces / tabs around every cell value (the reverse of Align Columns). */
export const trimCells: TableTransform = (text) =>
  writeDelimited(readCsv(text).map((row) => row.map(trimSpaceTab)), ',');

const escapeHtml = (text: string): string =>
  text.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

/** TABLE-011 / 030: `<table>`, one `<tr>` per line indented with 2 spaces, the first row in `<th>`. */
export const csvToHtmlTable: TableTransform = (text) => {
  const rows = normalizeRows(readCsv(text));
  const out = new OutputBuffer();
  out.push('<table>');
  rows.forEach((row, r) => {
    const tag = r === 0 ? 'th' : 'td';
    out.push(`  <tr>${row.map((cell) => `<${tag}>${escapeHtml(cell)}</${tag}>`).join('')}</tr>`);
  });
  out.push('</table>');
  return out.join('\n');
};

const SQL_IDENTIFIER = /^[A-Za-z_][A-Za-z0-9_]*$/;
/** Control characters other than tab, CR and LF (NUL included). */
const SQL_FORBIDDEN = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/;

const quoteIdentifier = (name: string): string => `"${name.replace(/"/g, '""')}"`;

/** A table name: `name` or `schema.name` of plain identifiers as it is, anything else quoted as one identifier. */
export const sqlTableName = (name: string): string => {
  if (name === '') {
    throw new TableInputError('the table name is empty');
  }
  if (SQL_FORBIDDEN.test(name)) {
    throw new TableInputError('the table name contains a control character');
  }
  if (name.includes('\\')) {
    throw new TableInputError(`the table name contains ${SQL_BACKSLASH_REASON}`);
  }
  return name.split('.').every((part) => SQL_IDENTIFIER.test(part)) ? name : quoteIdentifier(name);
};

const sqlColumnName = (name: string, column: number): string => {
  if (name === '') {
    throw new TableInputError(`column ${column + 1} of the header is empty`);
  }
  if (SQL_FORBIDDEN.test(name)) {
    throw new TableInputError(`column ${column + 1} of the header contains a control character`);
  }
  if (name.includes('\\')) {
    throw new TableInputError(`column ${column + 1} of the header contains ${SQL_BACKSLASH_REASON}`);
  }
  return SQL_IDENTIFIER.test(name) ? name : quoteIdentifier(name);
};

/**
 * TABLE-012: one `INSERT INTO t (c1, c2) VALUES ('v1', 'v2');` per data row. Every value is a
 * string literal (`'` doubled, an empty cell is `''`), names follow standard SQL. A backslash
 * in a value or a name is an error (see SQL_BACKSLASH_REASON). The SQL is only generated.
 */
export const csvToSqlInsert: TableTransform = (text, [tableName]) => {
  const table = sqlTableName(tableName);
  const { header, data } = headedRows(readCsv(text));
  const columns = header.map(sqlColumnName).join(', ');
  requireDataRows(data);
  const out = new OutputBuffer();
  data.forEach((row, r) => {
    const values = row.map((value, column) => {
      if (SQL_FORBIDDEN.test(value)) {
        throw new TableInputError(`row ${r + 2}, column ${column + 1} contains a control character`);
      }
      if (value.includes('\\')) {
        throw new TableInputError(`row ${r + 2}, column ${column + 1} contains ${SQL_BACKSLASH_REASON}`);
      }
      return `'${value.replace(/'/g, "''")}'`;
    });
    out.push(`INSERT INTO ${table} (${columns}) VALUES (${values.join(', ')});`);
  });
  return out.join('\n');
};

/** TABLE-013: keeps the header and the first of each identical data row. */
export const dedupeRows: TableTransform = (text) => {
  const [header, ...data] = readCsv(text);
  const seen = new Set<string>();
  const kept = data.filter((row) => {
    const key = JSON.stringify(row);
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
  return writeDelimited([header, ...kept], ',');
};

export const FILTER_CONDITIONS = ['Equals', 'Contains'] as const;

/** TABLE-014: keeps the header and the data rows whose cell equals / contains the value (case-sensitive). */
export const filterRows: TableTransform = (text, [column, condition, value]) => {
  const rows = readCsv(text);
  const index = resolveColumn(rows[0], columnCount(rows), column);
  if (condition !== 'Equals' && condition !== 'Contains') {
    throw new TableInputError('choose Equals or Contains');
  }
  const matches = condition === 'Equals'
    ? (cell: string) => cell === value
    : (cell: string) => cell.includes(value);
  const [header, ...data] = rows;
  return writeDelimited([header, ...data.filter((row) => matches(cellAt(row, index)))], ',');
};

/** A decimal number such as `-1.5`, `.5` or `1e3` (white space around it already removed). */
const NUMBER = /^[+-]?(?:[0-9]+(?:\.[0-9]*)?|\.[0-9]+)(?:[eE][+-]?[0-9]+)?$/;

/** Rounds to 15 significant digits so that `0.1 + 0.2` shows as `0.3`. */
export const formatNumber = (value: number): string => String(Number(value.toPrecision(15)));

/** TABLE-015: `sum=…, avg=…` of the numbers of one column (empty cells ignored). */
export const sumColumn: TableNotify = (text, [column]) => {
  assertTableInputLength(text);
  const rows = readCsv(text);
  const index = resolveColumn(rows[0], columnCount(rows), column);
  let sum = 0;
  let count = 0;
  let skipped = 0;
  rows.slice(1).forEach((row) => {
    const cell = cellAt(row, index).trim();
    if (cell === '') {
      return;
    }
    const number = NUMBER.test(cell) ? Number(cell) : NaN;
    if (!Number.isFinite(number)) {
      skipped++;
      return;
    }
    sum += number;
    count++;
  });
  const skippedText = skipped > 0 ? ` (${skipped} non-numeric cell${skipped === 1 ? '' : 's'} skipped)` : '';
  if (count === 0) {
    return { message: `no numeric cells in the column${skippedText}`, warning: true };
  }
  if (!Number.isFinite(sum)) {
    // Every cell is finite, but the sum went past the double range (`1e308` + `1e308`).
    return { message: `the sum is out of range${skippedText}`, warning: true };
  }
  return { message: `sum=${formatNumber(sum)}, avg=${formatNumber(sum / count)}${skippedText}` };
};

/** TABLE-016: a first column `#` numbered from 1. */
export const addIndex: TableTransform = (text) => {
  const [header, ...data] = readCsv(text);
  return writeDelimited([['#', ...header], ...data.map((row, index) => [String(index + 1), ...row])], ',');
};

/** TABLE-017: CSV with another delimiter (one code point, or `\t` for a tab). */
export const changeDelimiter: TableTransform = (text, [delimiter]) => {
  const target = parseDelimiterInput(delimiter);
  return writeDelimited(readCsv(text), target);
};

/** TABLE-018: every cell in double quotes (`""` for an empty one). */
export const quoteAll: TableTransform = (text) => writeDelimited(readCsv(text), ',', { quoteAll: true });

/** TABLE-019: keeps quotes only around cells with the delimiter, a line break or `"`. */
export const unquote: TableTransform = (text) => writeDelimited(readCsv(text), ',');

/** TABLE-020: CSV -> YAML sequence of mappings (js-yaml, Core schema, values quoted as strings). */
export const csvToYaml: TableTransform = (text) => {
  const { header, data } = headedRows(readCsv(text));
  assertUniqueHeader(header);
  // `- key: value` or `  key: value` and a line break.
  assertRecordsFit(header, data, 5);
  const dumped = yaml.dump(toRecords(header, data), { schema: yaml.CORE_SCHEMA, indent: 2, lineWidth: -1, noRefs: true });
  return dumped.endsWith('\n') ? dumped.slice(0, -1) : dumped;
};

/** Line breaks inside a cell would break a line-based output (TABLE-021 / 025): each becomes one space. */
const oneLine = (cell: string): string => cell.replace(/\r\n|\r|\n/g, ' ');

/** A cell of the ASCII table (TABLE-021): line breaks and tabs, whose width is not 1, become one space each. */
const asciiTableCell = (cell: string): string => oneLine(cell).replace(/\t/g, ' ');

/** TABLE-021: a table with `+---+` borders, also under the header (width = number of code points). */
export const csvToAsciiTable: TableTransform = (text) => {
  const rows = normalizeRows(readCsv(text)).map((row) => row.map(asciiTableCell));
  const { widths, cellWidths } = measureColumns(rows);
  // Exact length before building: border lines and cell lines.
  const borderLength = widths.reduce((sum, width) => sum + width + 3, 1);
  const borders = rows.length > 1 ? 3 : 2;
  let total = borders * borderLength + rows.length + borders - 1;
  for (let r = 0; r < rows.length; r++) {
    rows[r].forEach((cell, column) => {
      total += cell.length + widths[column] - cellWidths[r][column] + 3;
    });
    total += 1;
    if (total > MAX_OUTPUT_LENGTH) {
      throw outputTooLarge(total);
    }
  }
  const border = `+${widths.map((width) => '-'.repeat(width + 2)).join('+')}+`;
  const line = (row: string[], r: number) =>
    `|${row.map((cell, column) => ` ${cell}${' '.repeat(widths[column] - cellWidths[r][column])} `).join('|')}|`;
  const lines = [border, line(rows[0], 0), border];
  if (rows.length > 1) {
    rows.slice(1).forEach((row, index) => lines.push(line(row, index + 1)));
    lines.push(border);
  }
  return lines.join('\n');
};

/** TABLE-022: splits each line at runs of spaces / tabs (no quotes; blank lines skipped). */
export const whitespaceToCsv: TableTransform = (text) => {
  const body = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
  const rows: string[][] = [];
  for (const line of body.split(/\r\n|\r|\n/)) {
    const trimmed = trimSpaceTab(line);
    if (trimmed !== '') {
      rows.push(trimmed.split(/[ \t]+/));
    }
  }
  assertTableShape(rows);
  return writeDelimited(rows, ',');
};

/** Maximum number of columns named in the TABLE-023 notification. */
export const INFO_MAX_COLUMNS = 10;

/** TABLE-023: `N rows × M cols` and the empty cells (missing ones included) of each column. */
export const tableInfo: TableNotify = (text) => {
  assertTableInputLength(text);
  const [header, ...data] = readCsv(text);
  const columns = columnCount([header, ...data]);
  const empty = new Array<number>(columns).fill(0);
  data.forEach((row) => {
    for (let column = 0; column < columns; column++) {
      if (cellAt(row, column) === '') {
        empty[column]++;
      }
    }
  });
  const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;
  const listed: string[] = [];
  let more = 0;
  empty.forEach((count, column) => {
    if (count === 0) {
      return;
    }
    if (listed.length >= INFO_MAX_COLUMNS) {
      more++;
      return;
    }
    const name = cellAt(header, column) === '' ? `column ${column + 1}` : shortText(header[column]);
    listed.push(`${name}: ${count} empty`);
  });
  const emptyText = listed.length === 0 ? 'no empty cells' : listed.join(', ') + (more > 0 ? `, …and ${more} more` : '');
  return { message: `${plural(data.length, 'row')} × ${plural(columns, 'col')}, ${emptyText}` };
};

/** TABLE-024: empty cells ('' only) take the value above (after it was filled); every row is data. */
export const fillDown: TableTransform = (text) => {
  const rows = normalizeRows(readCsv(text));
  for (let r = 1; r < rows.length; r++) {
    rows[r].forEach((cell, column) => {
      if (cell === '') {
        rows[r][column] = rows[r - 1][column];
      }
    });
  }
  return writeDelimited(rows, ',');
};

/**
 * TABLE-025: `header: value` lines per row, records separated by one empty line. Line breaks in
 * a header or a value become one space each (as in TABLE-021), so that every line is one
 * `header: value` pair and an empty line only separates records.
 */
export const csvToRecords: TableTransform = (text) => {
  const { header, data } = headedRows(readCsv(text));
  requireDataRows(data);
  const keys = header.map(oneLine);
  const out = new OutputBuffer();
  data.forEach((row, index) => {
    if (index > 0) {
      out.push('');
    }
    row.forEach((value, column) => out.push(`${keys[column]}: ${oneLine(value)}`));
  });
  return out.join('\n');
};

// ---------------------------------------------------------------------------------------------
// Command table
// ---------------------------------------------------------------------------------------------

const COLUMN_PROMPT: TablePrompt = { type: 'input', prompt: 'Column number or header name', placeHolder: '1', rule: {} };

const t = keepTrailingLineBreak;

/** The 30 commands in ROADMAP order: 25 basic commands followed by 5 "(Replace)" variants. */
export const TABLE_COMMAND_ENTRIES: readonly TableCommandEntry[] = [
  { id: 'TABLE-001', name: 'csv.to-json', title: 'CSV - Convert to JSON Array', output: 'new-tab', prompts: [], transform: t(csvToJson) },
  { id: 'TABLE-002', name: 'csv.from-json', title: 'CSV - Convert from JSON Array', output: 'new-tab', prompts: [], transform: t(jsonToCsv) },
  { id: 'TABLE-003', name: 'csv.to-tsv', title: 'CSV - Convert to TSV', output: 'new-tab', prompts: [], transform: t(csvToTsv) },
  { id: 'TABLE-004', name: 'csv.from-tsv', title: 'CSV - Convert from TSV', output: 'new-tab', prompts: [], transform: t(tsvToCsv) },
  { id: 'TABLE-005', name: 'csv.transpose', title: 'CSV - Transpose', output: 'new-tab', prompts: [], transform: t(transpose) },
  { id: 'TABLE-006', name: 'csv.extract-column', title: 'CSV - Extract Column', output: 'new-tab', prompts: [COLUMN_PROMPT], transform: t(extractColumn) },
  { id: 'TABLE-007', name: 'csv.remove-column', title: 'CSV - Remove Column', output: 'new-tab', prompts: [COLUMN_PROMPT], transform: t(removeColumn) },
  {
    id: 'TABLE-008', name: 'csv.swap-columns', title: 'CSV - Swap Columns', output: 'new-tab',
    prompts: [
      { type: 'input', prompt: 'First column (number or header name)', placeHolder: '1', rule: {} },
      { type: 'input', prompt: 'Second column (number or header name)', placeHolder: '2', rule: {} },
    ],
    transform: t(swapColumns),
  },
  { id: 'TABLE-009', name: 'csv.align-columns', title: 'CSV - Align Columns', output: 'new-tab', prompts: [], transform: t(alignColumns) },
  { id: 'TABLE-010', name: 'csv.trim-cells', title: 'CSV - Trim Cell Padding', output: 'new-tab', prompts: [], transform: t(trimCells) },
  { id: 'TABLE-011', name: 'csv.to-html-table', title: 'CSV - Convert to HTML Table', output: 'new-tab', prompts: [], transform: t(csvToHtmlTable) },
  {
    id: 'TABLE-012', name: 'csv.to-sql-insert', title: 'CSV - Convert to SQL INSERT', output: 'new-tab',
    prompts: [{ type: 'input', prompt: 'Table name (e.g. users or schema.users)', placeHolder: 'users', rule: {} }],
    transform: t(csvToSqlInsert),
  },
  { id: 'TABLE-013', name: 'csv.dedupe-rows', title: 'CSV - Remove Duplicate Rows', output: 'new-tab', prompts: [], transform: t(dedupeRows) },
  {
    id: 'TABLE-014', name: 'csv.filter-rows', title: 'CSV - Filter Rows by Column Value', output: 'new-tab',
    prompts: [
      COLUMN_PROMPT,
      { type: 'pick', placeHolder: 'Keep the rows whose cell…', items: FILTER_CONDITIONS },
      { type: 'input', prompt: 'Value (case-sensitive; may be empty)', placeHolder: 'value', rule: { allowEmpty: true } },
    ],
    transform: t(filterRows),
  },
  { id: 'TABLE-015', name: 'csv.sum-column', title: 'CSV - Sum Column', output: 'notify', prompts: [COLUMN_PROMPT], notify: sumColumn },
  { id: 'TABLE-016', name: 'csv.add-index', title: 'CSV - Add Index Column', output: 'new-tab', prompts: [], transform: t(addIndex) },
  {
    id: 'TABLE-017', name: 'csv.change-delimiter', title: 'CSV - Change Delimiter', output: 'new-tab',
    prompts: [{ type: 'input', prompt: 'New delimiter (one character, e.g. ; or |; type \\t for a tab)', placeHolder: ';', rule: { delimiter: true } }],
    transform: t(changeDelimiter),
  },
  { id: 'TABLE-018', name: 'csv.quote-all', title: 'CSV - Quote All Fields', output: 'new-tab', prompts: [], transform: t(quoteAll) },
  { id: 'TABLE-019', name: 'csv.unquote', title: 'CSV - Remove Unnecessary Quotes', output: 'new-tab', prompts: [], transform: t(unquote) },
  { id: 'TABLE-020', name: 'csv.to-yaml', title: 'CSV - Convert to YAML', output: 'new-tab', prompts: [], transform: t(csvToYaml) },
  { id: 'TABLE-021', name: 'csv.to-ascii-table', title: 'CSV - Convert to ASCII Table', output: 'new-tab', prompts: [], transform: t(csvToAsciiTable) },
  { id: 'TABLE-022', name: 'csv.from-whitespace', title: 'CSV - Convert from Whitespace-separated Table', output: 'new-tab', prompts: [], transform: t(whitespaceToCsv) },
  { id: 'TABLE-023', name: 'csv.info', title: 'CSV - Show Row and Column Count', output: 'notify', prompts: [], notify: tableInfo },
  { id: 'TABLE-024', name: 'csv.fill-down', title: 'CSV - Fill Empty Cells from Above', output: 'new-tab', prompts: [], transform: t(fillDown) },
  { id: 'TABLE-025', name: 'csv.to-records', title: 'CSV - Convert Rows to Key-Value Records', output: 'new-tab', prompts: [], transform: t(csvToRecords) },
  { id: 'TABLE-026', name: 'csv.to-json.replace', title: 'CSV - Convert to JSON Array (Replace)', output: 'replace', prompts: [], transform: t(csvToJson) },
  { id: 'TABLE-027', name: 'csv.from-json.replace', title: 'CSV - Convert from JSON Array (Replace)', output: 'replace', prompts: [], transform: t(jsonToCsv) },
  { id: 'TABLE-028', name: 'csv.to-tsv.replace', title: 'CSV - Convert to TSV (Replace)', output: 'replace', prompts: [], transform: t(csvToTsv) },
  { id: 'TABLE-029', name: 'csv.transpose.replace', title: 'CSV - Transpose (Replace)', output: 'replace', prompts: [], transform: t(transpose) },
  { id: 'TABLE-030', name: 'csv.to-html-table.replace', title: 'CSV - Convert to HTML Table (Replace)', output: 'replace', prompts: [], transform: t(csvToHtmlTable) },
];
