/**
 * Pure (vscode-independent) implementations and command table of the JAUNIX-015..021 Markdown
 * commands (group JAUNI2): sort and transpose a table, remove and extract links, reference links
 * to inline links, GitHub alert blocks and `<kbd>` keys. They run through the MD command handler
 * and follow the rules of the MD commands (see `mdTransforms.ts`): multiple cursors, empty
 * selections ignored, a failure is a warning and changes nothing, the results of all selections
 * together are at most MAX_OUTPUT_LENGTH characters.
 *
 * Security rules (SECURITY.md): only local processing, no URL is opened or fetched; the regular
 * expressions are constants without nested quantifiers and brackets are matched with loops; the
 * alert type comes from a fixed list (checked again here) and the key names of `<kbd>` are
 * HTML-escaped; table rows and cells are moved as they are written, so escaped `\|` stay escaped.
 */
import { formatNumber } from './lineTransforms';
import {
  codeSpans,
  escapeHtml,
  fenceRoles,
  findInlineLinks,
  isBlank,
  isSpaceOrTab,
  LineSpan,
  lineSpans,
  MdEol,
  splitEdges,
  splitLines,
  splitTrailingBreaks,
  trailingBreakOf,
} from './mdCommon';
import {
  assertOutputLength,
  assertValid,
  balancedParentheses,
  blockProtectedRanges,
  convertibleLinks,
  DELIMITER_CELL,
  leadingWhitespace,
  LineEdges,
  lineBreakCount,
  mapLines,
  MdChoice,
  MdCommandEntry,
  MdInputError,
  MdRange,
  MdResult,
  mergeRanges,
  NO_LINE_EDGES,
  NOT_A_TABLE,
  perSelection,
  replaceSelections,
  tableCells,
} from './mdTransforms';

// ---------------------------------------------------------------------------
// JAUNIX-015 / 016: tables
// ---------------------------------------------------------------------------

/** JAUNIX-015: the largest column number that can be typed. */
export const MD_SORT_MAX_COLUMN = 1000;

/** JAUNIX-015: a column number from 1 to MD_SORT_MAX_COLUMN (ASCII digits). */
export const validateColumnInput = (value: string): string | undefined => {
  const trimmed = value.trim();
  const message = `Enter a column number from 1 to ${formatNumber(MD_SORT_MAX_COLUMN)}`;
  if (trimmed.length === 0 || trimmed.length > 4 || !/^[0-9]+$/.test(trimmed)) {
    return message;
  }
  const column = Number(trimmed);
  return column >= 1 && column <= MD_SORT_MAX_COLUMN ? undefined : message;
};

export type SortOrder = 'ascending' | 'descending';

export const SORT_ORDER_CHOICES: readonly MdChoice[] = [
  { label: 'Ascending', description: 'A → Z, 1 → 9', value: 'ascending' },
  { label: 'Descending', description: 'Z → A, 9 → 1', value: 'descending' },
];

const validateSortOrder = (value: string): string | undefined =>
  (SORT_ORDER_CHOICES.some((choice) => choice.value === value) ? undefined : 'Choose Ascending or Descending');

/**
 * The cells of the rows of a table (the header, the delimiter row, the data rows). Every line must
 * have a `|` and the second line must be a delimiter row, as for Format Table.
 */
const tableRows = (lines: readonly string[]): string[][] => {
  if (lines.length < 2 || lines.some((line) => isBlank(line) || !line.includes('|'))) {
    throw new MdInputError(NOT_A_TABLE);
  }
  const rows = lines.map(tableCells);
  if (rows[1].length === 0 || !rows[1].every((cell) => DELIMITER_CELL.test(cell))) {
    throw new MdInputError(NOT_A_TABLE);
  }
  return rows;
};

/** Compares the cells of JAUNIX-015: numbers inside the text by their value (`2` before `10`). */
const COLLATOR = new Intl.Collator(undefined, { numeric: true });

/**
 * JAUNIX-015: sorts the data rows of a table by the cell of `column` (1-based; a row without that
 * cell sorts as an empty cell). The header and the delimiter row stay first; equal cells keep
 * their order. Every row is moved as it is written (its cells, `\|` escapes and spacing are not
 * touched).
 */
export const sortTableByColumn = (value: string, eol: MdEol, column: number, order: SortOrder): string =>
  mapLines(value, eol, (lines) => {
    const rows = tableRows(lines);
    if (column > rows[0].length) {
      throw new MdInputError(`the table has ${formatNumber(rows[0].length)} column${rows[0].length === 1 ? '' : 's'}; enter a column number up to that`);
    }
    const data = lines.slice(2).map((line, i) => ({ line, key: rows[i + 2][column - 1] ?? '' }));
    const sign = order === 'descending' ? -1 : 1;
    data.sort((a, b) => sign * COLLATOR.compare(a.key, b.key));
    return [lines[0], lines[1], ...data.map(({ line }) => line)];
  });

/**
 * JAUNIX-016: swaps the rows and the columns of a table: the header is the first row, and the
 * first column becomes the new header. Missing cells are empty. The delimiter row is written anew
 * with `---` for every column (an alignment belongs to a column, which is now a row, so it is not
 * kept). The cells are written as they were (`\|` stays escaped) in `| a | b |` rows with the
 * indentation of the first line. The length of the result is checked before it is built.
 */
export const transposeTable = (value: string, eol: MdEol): string =>
  mapLines(value, eol, (lines) => {
    const rows = tableRows(lines);
    const body = [rows[0], ...rows.slice(2)];
    const columns = body.reduce((max, row) => Math.max(max, row.length), 0);
    const indent = leadingWhitespace(lines[0]);
    // Every output row is `indent| c | … | c |` with one cell per input row (the delimiter row has `---`).
    const frame = indent.length + 4 + 3 * (body.length - 1);
    const cells = body.reduce((sum, row) => sum + row.reduce((total, cell) => total + cell.length, 0), 0);
    assertOutputLength((columns + 1) * frame + 3 * body.length + cells + columns * eol.length);
    const out: string[] = [];
    for (let c = 0; c < columns; c++) {
      out.push(`${indent}| ${body.map((row) => row[c] ?? '').join(' | ')} |`);
      if (c === 0) {
        out.push(`${indent}| ${body.map(() => '---').join(' | ')} |`);
      }
    }
    return out;
  });

// ---------------------------------------------------------------------------
// JAUNIX-017 / 018: links
// ---------------------------------------------------------------------------

/**
 * JAUNIX-017: every inline link `[text](url "title")` becomes its text (`[Docs](https://x.example)`
 * → `Docs`). Images stay, so a linked image `[![a](i)](u)` becomes `![a](i)`. Links in code spans
 * and fenced code blocks are left.
 */
export const unlink = (value: string): string => {
  let out = '';
  let position = 0;
  for (const link of convertibleLinks(value, true)) {
    out += value.slice(position, link.start) + value.slice(link.textStart, link.textEnd);
    position = link.end;
  }
  return out + value.slice(position);
};

/** Tabs and line breaks in a field of the TSV of JAUNIX-018 become one space. */
const tsvField = (text: string): string => text.replace(/[\t\r\n]+/g, ' ');

export const MD_NO_LINKS = 'No links or images were found in the selection.';

/**
 * JAUNIX-018: the inline links and images of the selections (in document order, outside code) as
 * `text<TAB>url` lines in a new editor (`[a](u1) ![b](u2)` → `a⏎u1` / `b⏎u2` with tabs). A link
 * text is written as it is (a linked image keeps its `![…](…)`); tabs and line breaks become a
 * space. The URLs are only copied, never opened.
 */
export const extractLinks = (text: string, ranges: readonly MdRange[], eol: MdEol): MdResult => {
  const rows: string[] = [];
  let total = 0;
  for (const range of ranges) {
    if (range.start === range.end) {
      continue;
    }
    const value = text.slice(range.start, range.end);
    const spans = mergeRanges([...codeSpans(value), ...blockProtectedRanges(value, false)]);
    const links = findInlineLinks(value, spans).sort((a, b) => a.start - b.start);
    for (const link of links) {
      const row = `${tsvField(value.slice(link.textStart, link.textEnd))}\t${tsvField(link.tail.destination)}`;
      total += row.length + (rows.length === 0 ? 0 : eol.length);
      assertOutputLength(total);
      rows.push(row);
    }
  }
  return rows.length === 0 ? { kind: 'info', message: MD_NO_LINKS } : { kind: 'open', content: rows.join(eol) };
};

// ---------------------------------------------------------------------------
// JAUNIX-019: reference links to inline links
// ---------------------------------------------------------------------------

/** CommonMark: a link label has at most 999 characters. */
const MAX_LABEL_LENGTH = 999;

/** A label compared the CommonMark way: trimmed, runs of whitespace as one space, case folded. */
const normalizeLabel = (label: string): string => label.trim().replace(/\s+/g, ' ').toUpperCase().toLowerCase();

/** Whether `text` has a character of `chars` that is not escaped with a backslash. */
const hasUnescaped = (text: string, chars: string): boolean => {
  for (let i = 0; i < text.length; i++) {
    if (text[i] === '\\') {
      i++;
    } else if (chars.includes(text[i])) {
      return true;
    }
  }
  return false;
};

interface Definition {
  /** The normalized label. */
  label: string;
  /** The destination as written (`<…>` included). */
  destination: string;
  /** The title as written, with its quotes or parentheses. */
  title?: string;
}

const TITLE_CLOSERS: Readonly<Record<string, string>> = { '"': '"', '\'': '\'', '(': ')' };

/**
 * A link reference definition on one line (`[label]: url "title"`, up to 3 spaces of indentation),
 * or `undefined`. A definition whose destination or title continues on the next line is not read.
 */
export const parseDefinition = (line: string): Definition | undefined => {
  let i = 0;
  while (i < line.length && line[i] === ' ') {
    i++;
  }
  if (i > 3 || line[i] !== '[') {
    return undefined;
  }
  let j = i + 1;
  while (j < line.length && line[j] !== ']') {
    if (line[j] === '[') {
      return undefined;
    }
    j += line[j] === '\\' ? 2 : 1;
  }
  const label = line.slice(i + 1, j);
  if (j >= line.length || line[j + 1] !== ':' || label.trim() === '' || label.length > MAX_LABEL_LENGTH) {
    return undefined;
  }
  let k = j + 2;
  while (k < line.length && isSpaceOrTab(line[k])) {
    k++;
  }
  if (k === line.length) {
    return undefined;
  }
  let destination: string;
  if (line[k] === '<') {
    let end = k + 1;
    while (end < line.length && line[end] !== '>' && line[end] !== '<') {
      end += line[end] === '\\' ? 2 : 1;
    }
    if (end >= line.length || line[end] !== '>') {
      return undefined;
    }
    destination = line.slice(k, end + 1);
    k = end + 1;
  } else {
    const start = k;
    while (k < line.length && !isSpaceOrTab(line[k])) {
      k++;
    }
    destination = line.slice(start, k);
  }
  let m = k;
  while (m < line.length && isSpaceOrTab(line[m])) {
    m++;
  }
  if (m === line.length) {
    return { label: normalizeLabel(label), destination };
  }
  const closer = TITLE_CLOSERS[line[m]];
  if (m === k || closer === undefined) {
    return undefined;
  }
  let e = line.length - 1;
  while (e > m && isSpaceOrTab(line[e])) {
    e--;
  }
  const inner = line.slice(m + 1, e);
  if (e === m || line[e] !== closer || hasUnescaped(inner, line[m] === '(' ? '()' : closer) || inner.endsWith('\\')) {
    return undefined;
  }
  return { label: normalizeLabel(label), destination, title: line.slice(m, e + 1) };
};

/**
 * The destination of a definition as an inline link destination: `<…>` stays; a bare one with
 * unbalanced parentheses (which would end the inline link early) is written in `<…>`, or with
 * escaped parentheses when it has `<` or `>`.
 */
const inlineDestination = (destination: string): string => {
  if (destination.startsWith('<') || balancedParentheses(destination)) {
    return destination;
  }
  if (!destination.includes('<') && !destination.includes('>')) {
    return `<${destination}>`;
  }
  let out = '';
  for (let i = 0; i < destination.length; i++) {
    const c = destination[i];
    if (c === '\\' && i + 1 < destination.length) {
      out += c + destination[i + 1];
      i++;
    } else {
      out += c === '(' || c === ')' ? `\\${c}` : c;
    }
  }
  return out;
};

/**
 * Every `[` … `]` pair on one line, outside `skip` (sorted, merged ranges), with backslash
 * escapes, as a map from the offset of `[` to that of its `]`. One pass with a stack emptied at
 * line breaks.
 */
const matchBrackets = (text: string, skip: readonly [number, number][]): Map<number, number> => {
  const matches = new Map<number, number>();
  const stack: number[] = [];
  let range = 0;
  for (let i = 0; i < text.length; i++) {
    while (range < skip.length && skip[range][1] <= i) {
      range++;
    }
    if (range < skip.length && skip[range][0] <= i) {
      i = skip[range][1] - 1;
      continue;
    }
    const c = text[i];
    if (c === '\\') {
      i++;
    } else if (c === '[') {
      stack.push(i);
    } else if (c === ']') {
      const open = stack.pop();
      if (open !== undefined) {
        matches.set(open, i);
      }
    } else if (c === '\n' || c === '\r') {
      stack.length = 0;
    }
  }
  return matches;
};

interface Conversion {
  start: number;
  end: number;
  text: string;
}

export const MD_NO_REFERENCES = 'No reference links with a definition were found in the selection.';

/**
 * JAUNIX-019: the full reference links `[text][label]` and collapsed ones `[text][]` (also images
 * `![alt][label]`) on one line in the selections become inline links `[text](url "title")` with
 * the definition of the label in the document (CommonMark rules: the first definition wins, labels
 * compare without case and with runs of whitespace as one space). The destination and the title
 * are written as in the definition (`<…>` and the quotes kept). Shortcut references `[label]` are
 * not converted (they look like task list boxes and other brackets). Undefined labels and
 * references in code stay.
 *
 * A definition in a selection whose label was converted and is no longer referenced anywhere in
 * the document (any `[…]` with that label counts, so a shortcut reference keeps it) is removed with
 * its line; when the definitions removed end the selection, the blank lines before them go too.
 * Definitions outside the selections are never changed.
 */
export const referenceToInline = (text: string, ranges: readonly MdRange[]): MdResult => {
  const spans = lineSpans(text);
  const roles = fenceRoles(spans.map(({ start, end }) => text.slice(start, end)));
  const definitions = new Map<string, Definition & { span: LineSpan }>();
  const definitionLines: (Definition & { span: LineSpan })[] = [];
  const skip: [number, number][] = [...codeSpans(text)];
  spans.forEach((span, i) => {
    if (roles[i] !== 'text') {
      skip.push([span.start, span.end]);
      return;
    }
    const definition = parseDefinition(text.slice(span.start, span.end));
    if (definition !== undefined) {
      const entry = { ...definition, span };
      definitionLines.push(entry);
      if (!definitions.has(definition.label)) {
        definitions.set(definition.label, entry);
      }
      skip.push([span.start, span.end]);
    }
  });
  const pairs = matchBrackets(text, mergeRanges(skip));
  const opens = [...pairs.keys()].sort((a, b) => a - b);
  const conversions: Conversion[] = [];
  const converted = new Set<string>();
  const used = new Set<string>();
  let skipUntil = 0;
  let r = 0;
  for (const open of opens) {
    if (open < skipUntil) {
      continue;
    }
    const close = pairs.get(open)!;
    const inner = text.slice(open + 1, close);
    const labelClose = text[close + 1] === '[' ? pairs.get(close + 1) : undefined;
    if (labelClose !== undefined) {
      const written = text.slice(close + 2, labelClose);
      const key = written === '' ? inner : written;
      const definition = key.length <= MAX_LABEL_LENGTH ? definitions.get(normalizeLabel(key)) : undefined;
      while (r < ranges.length && ranges[r].end <= open) {
        r++;
      }
      const range = ranges[r];
      if (definition !== undefined && range !== undefined && range.start <= open && labelClose < range.end) {
        const title = definition.title === undefined ? '' : ` ${definition.title}`;
        conversions.push({ start: open, end: labelClose + 1, text: `[${inner}](${inlineDestination(definition.destination)}${title})` });
        converted.add(definition.label);
        skipUntil = labelClose + 1;
        continue;
      }
    }
    if (inner.length <= MAX_LABEL_LENGTH) {
      used.add(normalizeLabel(inner));
    }
  }
  if (conversions.length === 0) {
    return { kind: 'info', message: MD_NO_REFERENCES };
  }
  // The definition lines to remove: start → end of the line (without its line break).
  const removable = new Map<number, number>(definitionLines
    .filter((definition) => converted.has(definition.label) && !used.has(definition.label) && definitions.get(definition.label) === definition)
    .map((definition): [number, number] => [definition.span.start, definition.span.end]));
  let c = 0;
  const replacements = ranges.map((range) => {
    if (range.start === range.end) {
      return undefined;
    }
    const value = text.slice(range.start, range.end);
    const lines = lineSpans(value).map((span) => {
      // The conversions are on one line each.
      let line = '';
      let position = range.start + span.start;
      while (c < conversions.length && conversions[c].end <= range.start + span.end) {
        line += text.slice(position, conversions[c].start) + conversions[c].text;
        position = conversions[c].end;
        c++;
      }
      line += text.slice(position, range.start + span.end);
      // Only a whole definition line in the selection is removed.
      const removed = removable.get(range.start + span.start) === range.start + span.end;
      return { line, lineBreak: value.slice(span.end, span.next), removed };
    });
    if (lines.length > 1 && lines[lines.length - 1].line === '' && lines[lines.length - 2].lineBreak !== '') {
      // The line break at the end of the selection does not start a line of its own.
      lines.pop();
    }
    let last = -1;
    lines.forEach(({ line, removed }, i) => {
      if (!removed && !isBlank(line)) {
        last = i;
      }
    });
    const trailingRemoval = lines.some(({ removed }, i) => removed && i > last);
    let out = '';
    lines.forEach(({ line, lineBreak, removed }, i) => {
      if (removed || (trailingRemoval && i > last)) {
        return;
      }
      out += line + (trailingRemoval && i === last ? '' : lineBreak);
    });
    return trailingRemoval ? out + trailingBreakOf(value) : out;
  });
  return replaceSelections(text, ranges, replacements);
};

// ---------------------------------------------------------------------------
// JAUNIX-020: GitHub alert
// ---------------------------------------------------------------------------

/** JAUNIX-020: the alert types of GitHub, the only values written into the block. */
export const GITHUB_ALERT_TYPES: readonly string[] = ['NOTE', 'TIP', 'IMPORTANT', 'WARNING', 'CAUTION'];

export const GITHUB_ALERT_CHOICES: readonly MdChoice[] = [
  { label: 'NOTE', description: 'Useful information', value: 'NOTE' },
  { label: 'TIP', description: 'Helpful advice', value: 'TIP' },
  { label: 'IMPORTANT', description: 'Key information', value: 'IMPORTANT' },
  { label: 'WARNING', description: 'Urgent information that needs attention', value: 'WARNING' },
  { label: 'CAUTION', description: 'Risks or negative outcomes', value: 'CAUTION' },
];

export const validateAlertType = (value: string): string | undefined =>
  (GITHUB_ALERT_TYPES.includes(value) ? undefined : `Choose one of ${GITHUB_ALERT_TYPES.join(', ')}`);

/**
 * JAUNIX-020: `> [!TYPE]` and every line of the selection after `> ` (`>` for a blank line). The
 * type must be one of GITHUB_ALERT_TYPES (checked here too). Like Wrap in Details Block, the
 * block is on lines of its own: a line break is added before it when the selection starts after
 * other text on its line, and a blank line after it when text follows (a quote would otherwise
 * take the next line in).
 */
export const toGithubAlert = (value: string, eol: MdEol, type: string, edges: LineEdges = NO_LINE_EDGES): string => {
  assertValid(validateAlertType, type);
  const [body, trailing] = splitTrailingBreaks(value);
  const quoted = splitLines(body).lines.map((line) => (isBlank(line) ? '>' : `> ${line}`));
  const before = edges.textBefore ? eol : '';
  let after = '';
  if (trailing === '') {
    after = edges.textAfter ? eol + eol : edges.textOnNextLine ? eol : '';
  } else if (lineBreakCount(trailing) === 1 && edges.textAfter) {
    after = eol;
  }
  return `${before}> [!${type}]${eol}${quoted.join(eol)}${trailing}${after}`;
};

// ---------------------------------------------------------------------------
// JAUNIX-021: <kbd>
// ---------------------------------------------------------------------------

/**
 * One line of key names separated by `+` as `<kbd>` elements (`Ctrl+C` →
 * `<kbd>Ctrl</kbd>+<kbd>C</kbd>`). A `+` where a key name is expected is the `+` key (`Ctrl++`),
 * the spaces around a key name are dropped and a name with spaces inside (`Page Up`) is one key.
 * Every key name is HTML-escaped, so no tag can be written through it.
 */
const kbdLine = (line: string): string => {
  const [before, core, after] = splitEdges(line);
  if (core === '') {
    return line;
  }
  const keys: string[] = [];
  let key = '';
  let dangling = false;
  for (const c of core) {
    if (c === '+' && key.trim() !== '') {
      keys.push(key.trim());
      key = '';
      dangling = true;
    } else {
      key += c;
      dangling = dangling && isSpaceOrTab(c);
    }
  }
  if (key.trim() !== '') {
    keys.push(key.trim());
    dangling = false;
  }
  return `${before}${keys.map((name) => `<kbd>${escapeHtml(name)}</kbd>`).join('+')}${dangling ? '+' : ''}${after}`;
};

/** JAUNIX-021: every line of the selection as `<kbd>` keys (blank lines kept). */
export const toKbd = (value: string, eol: MdEol): string =>
  mapLines(value, eol, (lines) => lines.map((line) => (isBlank(line) ? line : kbdLine(line))));

// ---------------------------------------------------------------------------
// Command table
// ---------------------------------------------------------------------------

/** The commands in the order of the JAUNIX commands of the showcase data (scripts/showcase-data/JAUNIX.json). */
export const MD2_COMMAND_ENTRIES: readonly MdCommandEntry[] = [
  {
    id: 'JAUNIX-015', name: 'markdown.table-sort-by-column', title: 'Markdown: Sort Table by Column',
    inputs: [
      {
        prompt: `Column to sort by (1 = the first column; up to ${formatNumber(MD_SORT_MAX_COLUMN)})`,
        value: '1',
        validate: validateColumnInput,
      },
      { prompt: 'Sort order', choices: SORT_ORDER_CHOICES, validate: validateSortOrder },
    ],
    run: perSelection((value, eol, inputs) => {
      assertValid(validateColumnInput, inputs[0]);
      assertValid(validateSortOrder, inputs[1]);
      return sortTableByColumn(value, eol, Number(inputs[0].trim()), inputs[1] as SortOrder);
    }),
  },
  {
    id: 'JAUNIX-016', name: 'markdown.table-transpose', title: 'Markdown: Transpose Table',
    run: perSelection((value, eol) => transposeTable(value, eol)),
  },
  {
    id: 'JAUNIX-017', name: 'markdown.unlink', title: 'Markdown: Remove Links (Keep Text)',
    run: perSelection(unlink),
  },
  {
    id: 'JAUNIX-018', name: 'markdown.extract-links', title: 'Markdown: Extract Links',
    run: ({ text, ranges, eol }) => extractLinks(text, ranges, eol),
  },
  {
    id: 'JAUNIX-019', name: 'markdown.reference-to-inline', title: 'Markdown: Reference Links to Inline Links',
    run: ({ text, ranges }) => referenceToInline(text, ranges),
  },
  {
    id: 'JAUNIX-020', name: 'markdown.github-alert', title: 'Markdown: GitHub Alert Block',
    inputs: [{ prompt: 'Type of the GitHub alert', choices: GITHUB_ALERT_CHOICES, validate: validateAlertType }],
    run: perSelection((value, eol, inputs, edges) => toGithubAlert(value, eol, inputs[0], edges), true),
  },
  {
    id: 'JAUNIX-021', name: 'markdown.kbd', title: 'Markdown: Keyboard Key (<kbd>)',
    run: perSelection(toKbd),
  },
];
