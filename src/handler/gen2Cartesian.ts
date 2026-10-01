/**
 * Pure (vscode-independent) DATEX-021 Generate - Cartesian Product of Selections (group DATE2) and
 * its command table, run by the MSEL command handler (date2MselCommandHandler.ts).
 *
 * The number of combinations is computed by multiplication (stopped as soon as it passes the
 * limit) and the length of the result arithmetically, BEFORE anything is built: over the limits,
 * a warning is returned and nothing is changed. User input (the delimiter) is joined literally.
 *
 * Only local processing: no network, files or processes, no `eval` / `new Function`, no new
 * dependency.
 */
import { MAX_OUTPUT_LENGTH } from './encodeTransforms';
import { formatNumber, isBlankLine, LINE_JOIN_DELIMITER_MAX_LENGTH } from './lineTransforms';
import { MselCommandEntry, MselEdit, MselInputError, MselInputStep, MselRange, MselResult, needTwo, textOf } from './mselTransforms';
import { validateJoinDelimiterInput } from './msel2Transforms';

/** DATEX-021: the most combinations. */
export const CARTESIAN_MAX_COMBINATIONS = 10_000;

const NOT_CHANGED = 'The text was not changed: ';

/** The non-blank lines of a text (line breaks LF / CRLF / CR removed; the spaces of each line kept). */
const nonBlankLines = (text: string): string[] => text.split(/\r\n|\r|\n/).filter((line) => line !== '' && !isBlankLine(line));

/** The line break of the document: CRLF when its first line break is one, LF otherwise. */
const documentEol = (text: string): string => {
  const newline = text.indexOf('\n');
  return newline > 0 && text[newline - 1] === '\r' ? '\r\n' : '\n';
};

/**
 * DATEX-021: every combination of one line of each selection (document order, the first selection
 * varying slowest), the lines of a combination joined with `delimiter` and the combinations one per
 * line. The result replaces the first selection and the texts of the others are deleted, in one
 * edit (as Join All Selections into First); the result is then the only selection.
 */
export const cartesianProduct = (text: string, ranges: readonly MselRange[], delimiter: string): MselResult => {
  const problem = validateJoinDelimiterInput(delimiter);
  if (problem !== undefined) {
    throw new MselInputError(problem);
  }
  const tooFew = needTwo(ranges);
  if (tooFew) {
    return tooFew;
  }
  const lists = ranges.map((range) => nonBlankLines(textOf(text, range)));
  const empty = lists.findIndex((lines) => lines.length === 0);
  if (empty !== -1) {
    return { kind: 'warn', message: `${NOT_CHANGED}selection ${empty + 1} of ${ranges.length} has no non-blank line.` };
  }
  let count = 1;
  for (const lines of lists) {
    count *= lines.length;
    if (count > CARTESIAN_MAX_COMBINATIONS) {
      return {
        kind: 'warn',
        message: `${NOT_CHANGED}the selections make more than ${formatNumber(CARTESIAN_MAX_COMBINATIONS)} combinations. Select fewer lines.`,
      };
    }
  }
  // Each line of selection i is in count / nᵢ combinations.
  const eol = documentEol(text);
  const length = lists.reduce((sum, lines) => sum + (count / lines.length) * lines.reduce((s, line) => s + line.length, 0), 0)
    + count * (lists.length - 1) * delimiter.length + (count - 1) * eol.length;
  if (length > MAX_OUTPUT_LENGTH) {
    return { kind: 'warn', message: `${NOT_CHANGED}the result would be longer than ${formatNumber(MAX_OUTPUT_LENGTH)} characters. Select fewer lines.` };
  }
  const indexes = lists.map(() => 0);
  const rows: string[] = [];
  for (let k = 0; k < count; k++) {
    rows.push(lists.map((lines, i) => lines[indexes[i]]).join(delimiter));
    // The last selection varies fastest.
    for (let i = lists.length - 1; i >= 0; i--) {
      indexes[i]++;
      if (indexes[i] < lists[i].length) {
        break;
      }
      indexes[i] = 0;
    }
  }
  const joined = rows.join(eol);
  const first = ranges[0];
  const edits: MselEdit[] = [{ start: first.start, end: first.end, text: joined }];
  ranges.slice(1).forEach((range) => {
    if (range.end > range.start) {
      edits.push({ start: range.start, end: range.end, text: '' });
    }
  });
  return { kind: 'edit', edits, ranges: [{ start: first.start, end: first.start + joined.length }] };
};

/** DATEX-021: the delimiter, empty by default (`a` and `1` make `a1`). */
const cartesianDelimiterStep: MselInputStep = {
  prompt: `Delimiter between the lines of a combination (literal text, 0 to ${formatNumber(LINE_JOIN_DELIMITER_MAX_LENGTH)} characters, empty joins without a separator)`,
  value: '',
  validate: validateJoinDelimiterInput,
};

/** DATEX-021 (a table of its own: it is not a command of the Multi Cursor submenu). */
export const DATE2_MSEL_ENTRIES: readonly MselCommandEntry[] = [
  {
    id: 'DATEX-021', name: 'generate.cartesian-product', title: 'Generate - Cartesian Product of Selections', when: 'multi', needsTwo: true, edits: true,
    inputs: [cartesianDelimiterStep],
    run: ({ text, ranges, inputs }) => cartesianProduct(text, ranges, inputs[0]),
  },
];
