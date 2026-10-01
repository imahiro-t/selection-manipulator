/**
 * Pure (vscode-independent) implementations of the LINEX-001..014 line commands (the line part of
 * the group LINE2 of SELEC-00091; the showcase category ID is `LINEX` because category IDs are
 * upper-case letters only). The selection part (LINEX-015..023) is in `msel2Transforms.ts`.
 *
 * The rules are those of the LINE commands (`lineTransforms.ts`), whose helpers are reused:
 * - Lines are split by `splitSelectionLines` (one trailing line break is not a line) and joined
 *   with the document's EOL; the trailing line break is kept (see `lineWiseWith`).
 * - The commands that delete, reorder or number lines (keep-range, drop-first-n, drop-last-n,
 *   blank-every-n, dedupe-keep-last, number-nonblank) use the anchor rule of `head` / `tail`: a
 *   partial first / last line of the selection is left as it is. The commands that rewrite, split
 *   or join lines (cut-chars, split-by-regex, join-natural-list, fold-to-columns) treat a partial
 *   line as a line, like `split-fixed-width` / `join-every-n`.
 * - "Blank line" is `isBlankLine` of `lineTransforms.ts`: empty, or only Unicode whitespace other
 *   than line breaks and U+FEFF (a full-width space U+3000 is blank, U+FEFF / U+200B are not).
 * - There is no general input size limit (the LINE commands have none). Commands whose result may
 *   be longer than the selection count the added characters before the result is built and throw
 *   `LineOutputTooLargeError` above `maxAddedLength` (the handler shares one budget between all
 *   selections). Only LINEX-008 has an input limit (`LINE_REGEX_MAX_INPUT_LENGTH`, in the handler).
 * - The user's regular expression of LINEX-008 is NOT executed here: the handler runs it in the
 *   worker thread of `lineRegex.ts` (time limit) and passes the match offsets in `regexSplits`.
 * - Characters of cut-chars are grapheme clusters (`Intl.Segmenter`); widths of fold-to-columns
 *   are code points (`codePointWidth`, as the table / CSV alignment).
 *
 * Only local processing: no network, files or processes, no evaluation of code, no new dependency.
 * No regular expression is built from the user's input.
 */
import {
  formatNumber,
  isBlankLine,
  LINE_JOIN_DELIMITER_MAX_LENGTH,
  LINE_REGEX_PATTERN_MAX_LENGTH,
  LineFn,
  lineWiseWith,
  LineOptions,
  LineOutputTooLargeError,
  MAX_ADDED_LENGTH,
  splitSelectionLines,
  trailingBreakLength,
  validateLineCountInput,
  validateLineDelimiterInput,
  validateLineRegexInput,
} from './lineTransforms';
import { codePointWidth } from './whitespaceTransforms';
import { graphemes } from './uniCommon';

// ---------------------------------------------------------------------------
// Types, limits and input validation
// ---------------------------------------------------------------------------

/** The commands that transform every selection on its own (10 commands). */
export type Line2SingleCommand =
  | 'keep-range'
  | 'drop-first-n'
  | 'drop-last-n'
  | 'blank-every-n'
  | 'cut-chars'
  | 'dedupe-keep-last'
  | 'split-by-regex'
  | 'join-natural-list'
  | 'number-nonblank'
  | 'fold-to-columns';

/** The commands that combine the lines of several selections into the first one (4 commands). */
export type Line2MultiCommand =
  | 'paste-columns'
  | 'intersect-selections'
  | 'subtract-selections'
  | 'symmetric-difference';

export type Line2Command = Line2SingleCommand | Line2MultiCommand;

export interface Line2Options extends LineOptions {
  /** LINEX-001 `N-M` / LINEX-005 `M-N` (1-based, inclusive; `[M, M]` for a single position). */
  range?: [number, number];
  /** LINEX-009: the locale of `Intl.ListFormat` (validated). */
  locale?: string;
  /** LINEX-008: the non-empty matches of the user's regular expression in the selection text. */
  regexSplits?: readonly (readonly [number, number])[];
}

/** The largest N / M of LINEX-001 and LINEX-005. */
export const LINE2_POSITION_MAX = 1_000_000;
/** N of LINEX-014. */
export const LINE2_COLUMNS_MIN = 1;
export const LINE2_COLUMNS_MAX = 100;
/** The spaces between two columns of LINEX-014. */
export const LINE2_COLUMN_GAP = 2;
/** The longest locale of LINEX-009 (BCP 47 tags in practice are much shorter). */
export const LINE2_LOCALE_MAX_LENGTH = 64;
/** LINEX-009: the default locale. */
export const LINE2_DEFAULT_LOCALE = 'en';
/** LINEX-008: the most matches (all selections together). */
export const LINE2_SPLIT_MAX_MATCHES = 1_000_000;
/** LINEX-006: the delimiter used when the box is left empty. */
export const LINE2_PASTE_DEFAULT_DELIMITER = '\t';

/** An input that a command cannot use (reported as a warning; nothing is changed). */
export class Line2InputError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'Line2InputError';
  }
}

const RANGE_INPUT = /^([0-9]{1,7})(?:\s*-\s*([0-9]{1,7}))?$/;

/**
 * Parses `N-M` (and, with `allowSingle`, `N`) into a 1-based inclusive range with
 * 1 <= N <= M <= `LINE2_POSITION_MAX`, or returns the problem.
 */
const parseRange = (value: string, allowSingle: boolean): [number, number] | string => {
  const format = allowSingle ? 'M-N or N' : 'N-M';
  const message = `Enter ${format} with integers from 1 to ${formatNumber(LINE2_POSITION_MAX)}`;
  const match = RANGE_INPUT.exec(value.trim());
  if (match === null || (!allowSingle && match[2] === undefined)) {
    return message;
  }
  const from = Number(match[1]);
  const to = match[2] === undefined ? from : Number(match[2]);
  if (from < 1 || to < 1 || from > LINE2_POSITION_MAX || to > LINE2_POSITION_MAX) {
    return message;
  }
  if (from > to) {
    return 'The first number must not be greater than the second';
  }
  return [from, to];
};

/** LINEX-001: `N-M` (1 <= N <= M <= 1,000,000). */
export const validateLineRangeInput = (value: string): string | undefined => {
  const parsed = parseRange(value, false);
  return typeof parsed === 'string' ? parsed : undefined;
};

/** LINEX-005: `M-N` or `M` (1 <= M <= N <= 1,000,000). */
export const validateCharRangeInput = (value: string): string | undefined => {
  const parsed = parseRange(value, true);
  return typeof parsed === 'string' ? parsed : undefined;
};

/** The range of a value accepted by `validateLineRangeInput` / `validateCharRangeInput`. */
export const toRange = (value: string): [number, number] => {
  const parsed = parseRange(value, true);
  if (typeof parsed === 'string') {
    throw new Line2InputError(parsed);
  }
  return parsed;
};

/** LINEX-014: N from 1 to 100. */
export const validateColumnsInput = (value: string): string | undefined => {
  const trimmed = value.trim();
  const message = `Enter an integer from ${LINE2_COLUMNS_MIN} to ${LINE2_COLUMNS_MAX}`;
  if (!/^[0-9]{1,3}$/.test(trimmed)) {
    return message;
  }
  const n = Number(trimmed);
  return n < LINE2_COLUMNS_MIN || n > LINE2_COLUMNS_MAX ? message : undefined;
};

/**
 * LINEX-009: a locale supported by `Intl.ListFormat` (`en`, `ja`, `fr-CA`…), at most 64 characters.
 * An empty value is an error, not the default: the box starts with `en`, so the default is one
 * Enter away, and an emptied box is more likely a mistake than a request for English.
 */
export const validateListLocaleInput = (value: string): string | undefined => {
  const locale = value.trim();
  if (locale.length === 0) {
    return 'Enter a locale such as en or ja';
  }
  if (locale.length > LINE2_LOCALE_MAX_LENGTH) {
    return `The locale must be at most ${LINE2_LOCALE_MAX_LENGTH} characters`;
  }
  try {
    if (Intl.ListFormat.supportedLocalesOf([locale]).length === 0) {
      return 'This locale is not supported';
    }
  } catch {
    // RangeError: not a well-formed language tag.
    return 'Enter a valid locale such as en or ja';
  }
  return undefined;
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const ensureAdded = (added: number, options: { maxAddedLength?: number }): void => {
  const limit = options.maxAddedLength ?? MAX_ADDED_LENGTH;
  if (added > limit) {
    throw new LineOutputTooLargeError(added, limit);
  }
};

const requireN = (value: number | undefined, max: number): number => {
  if (value === undefined || !Number.isInteger(value) || value < 1 || value > max) {
    throw new Line2InputError(`N must be an integer from 1 to ${formatNumber(max)}`);
  }
  return value;
};

const requireRange = (range: [number, number] | undefined): [number, number] => {
  if (range === undefined || !Number.isInteger(range[0]) || !Number.isInteger(range[1])
    || range[0] < 1 || range[0] > range[1] || range[1] > LINE2_POSITION_MAX) {
    throw new Line2InputError('Invalid range');
  }
  return range;
};

type Line2Fn = (lines: string[], options: Line2Options) => string[];

const anchoredWith = (fn: Line2Fn) => (text: string, options: Line2Options): string =>
  lineWiseWith(text, options, true, ((lines) => fn(lines, options)) as LineFn) ?? text;

const unanchoredWith = (fn: Line2Fn) => (text: string, options: Line2Options): string =>
  lineWiseWith(text, options, false, ((lines) => fn(lines, options)) as LineFn) ?? text;

// ---------------------------------------------------------------------------
// LINEX-001..005, 007, 009, 013, 014
// ---------------------------------------------------------------------------

/** LINEX-001: lines N to M (lines beyond the selection are ignored). */
const keepRange: Line2Fn = (lines, options) => {
  const [from, to] = requireRange(options.range);
  return lines.slice(from - 1, to);
};

/** LINEX-002: without the first N lines. */
const dropFirstN: Line2Fn = (lines, options) => lines.slice(requireN(options.n, LINE2_POSITION_MAX));

/** LINEX-003: without the last N lines. */
const dropLastN: Line2Fn = (lines, options) => {
  const n = requireN(options.n, LINE2_POSITION_MAX);
  return n >= lines.length ? [] : lines.slice(0, lines.length - n);
};

/** LINEX-004: an empty line after every Nth line, but not after the last line. */
const blankEveryN: Line2Fn = (lines, options) => {
  const n = requireN(options.n, LINE2_POSITION_MAX);
  const blanks = lines.length === 0 ? 0 : Math.floor((lines.length - 1) / n);
  ensureAdded(blanks * options.eol.length, options);
  const result: string[] = [];
  lines.forEach((line, i) => {
    result.push(line);
    if ((i + 1) % n === 0 && i + 1 < lines.length) {
      result.push('');
    }
  });
  return result;
};

/**
 * ASCII without CR / LF: every UTF-16 code unit is a grapheme cluster of its own (only CR LF joins
 * two ASCII characters), so `slice` gives the same result as walking the graphemes.
 */
const SINGLE_UNIT_GRAPHEMES = /^[\x00-\x09\x0b\x0c\x0e-\x7f]*$/;

/**
 * BMP characters that are a grapheme cluster of their own whatever comes before or after them,
 * as long as the neighbours are such characters too: no UAX #29 rule that joins two characters
 * (GB3 CR × LF, GB6-8 Hangul jamo, GB9 × Extend / ZWJ, GB9a × SpacingMark, GB9b Prepend ×,
 * GB9c Indic conjuncts, GB11 ZWJ emoji sequences, GB12 / 13 regional indicators) can apply.
 * Excluded:
 * - everything outside the BMP (`\u{10000}-\u{10FFFF}`): with the `u` flag a surrogate pair is
 *   matched as one code point of U+10000 or above, so `\uD800-\uDFFF` alone would let it through
 *   and `slice` could cut it in half (regional indicators, emoji modifiers, tags and the
 *   supplementary Prepend / Extend characters are all there);
 * - lone surrogates (`\uD800-\uDFFF`): with the `u` flag an unpaired surrogate is matched as the
 *   single code point U+D800..U+DFFF;
 * - CR and LF; marks (`\p{M}`: Extend, SpacingMark, viramas); format characters (`\p{Cf}`: ZWNJ,
 *   ZWJ and most Prepend characters) and the line / paragraph separators;
 * - the Extend / SpacingMark / Prepend characters outside those categories: the variation
 *   selectors U+FE00..U+FE0F, the halfwidth (semi-)voiced sound marks U+FF9E U+FF9F, Thai and
 *   Lao SARA AM U+0E33 U+0EB3 and Malayalam dot reph U+0D4E;
 * - the Hangul jamo L / V / T. The syllables (LV / LVT) only join a following V or T, which are
 *   excluded, so they stay.
 * Other control characters (tab etc.) never join anything (GB4 / GB5), as on the ASCII path.
 * The tests check every allowed BMP character against `Intl.Segmenter` and every code point
 * outside the BMP and every lone surrogate against this expression.
 */
const SINGLE_UNIT_BMP_GRAPHEMES =
  /^[^\u{10000}-\u{10FFFF}\uD800-\uDFFF\r\n\p{M}\p{Cf}\p{Zl}\p{Zp}︀-️ﾞﾟำຳൎᄀ-ᇿꥠ-꥿ힰ-퟿]*$/u;

/** Whether every UTF-16 code unit of the line (without line breaks) is a grapheme cluster of its own. */
export const isSingleUnitGraphemeLine = (line: string): boolean =>
  SINGLE_UNIT_GRAPHEMES.test(line) || SINGLE_UNIT_BMP_GRAPHEMES.test(line);

/** LINEX-005: the Mth to Nth characters (grapheme clusters) of every line. */
const cutChars: Line2Fn = (lines, options) => {
  const [from, to] = requireRange(options.range);
  return lines.map((line) => {
    // The ASCII test comes first so that ASCII lines do not pay for the Unicode one.
    if (isSingleUnitGraphemeLine(line)) {
      // Fast path: starting `Intl.Segmenter` for every short line dominates the time otherwise.
      return line.slice(from - 1, to);
    }
    let kept = '';
    let position = 0;
    for (const grapheme of graphemes(line)) {
      position++;
      if (position > to) {
        break;
      }
      if (position >= from) {
        kept += grapheme;
      }
    }
    return kept;
  });
};

/** LINEX-007: every line once, at its last occurrence (the relative order is kept). */
const dedupeKeepLast: Line2Fn = (lines) => {
  const last = new Map<string, number>();
  lines.forEach((line, i) => last.set(line, i));
  return lines.filter((line, i) => last.get(line) === i);
};

/** LINEX-009: the non-blank lines as one natural-language list (`Intl.ListFormat`, conjunction). */
const joinNaturalList: Line2Fn = (lines, options) => {
  const locale = options.locale ?? LINE2_DEFAULT_LOCALE;
  if (validateListLocaleInput(locale) !== undefined) {
    throw new Line2InputError('Invalid locale');
  }
  const items = lines.filter((line) => !isBlankLine(line));
  if (items.length === 0) {
    return [];
  }
  const joined = new Intl.ListFormat(locale.trim(), { style: 'long', type: 'conjunction' }).format(items);
  // The separators of Intl.ListFormat depend on the locale (and in some locales on the next
  // item), so the length is checked on the result, before it is returned or applied.
  const before = lines.reduce((sum, line) => sum + line.length, 0) + Math.max(0, lines.length - 1) * options.eol.length;
  ensureAdded(joined.length - before, options);
  return [joined];
};

/**
 * LINEX-013: `<n> <line>` for the non-blank lines (numbered from 1, no padding, no colon); blank
 * lines (including lines of spaces, tabs or full-width spaces) are kept as they are and not counted.
 */
const numberNonBlank: Line2Fn = (lines, options) => {
  let count = 0;
  let added = 0;
  for (const line of lines) {
    if (!isBlankLine(line)) {
      count++;
      added += String(count).length + 1;
    }
  }
  ensureAdded(added, options);
  let n = 0;
  return lines.map((line) => (isBlankLine(line) ? line : `${++n} ${line}`));
};

/** Removes trailing U+0020 spaces with a loop (an end-anchored regex would be quadratic). */
const trimTrailingSpaces = (value: string): string => {
  let end = value.length;
  while (end > 0 && value.charCodeAt(end - 1) === 0x20) {
    end--;
  }
  return value.slice(0, end);
};

/**
 * LINEX-014: the lines down N columns (rows = ceil(lines / N), filled column by column), every
 * column as wide as its widest line (code points) plus two spaces, without trailing spaces.
 */
const foldToColumns: Line2Fn = (lines, options) => {
  const n = requireN(options.n, LINE2_COLUMNS_MAX);
  if (lines.length === 0) {
    return [];
  }
  const rows = Math.ceil(lines.length / n);
  const columns = Math.ceil(lines.length / rows);
  const widths = lines.map(codePointWidth);
  const columnWidths: number[] = [];
  for (let c = 0; c < columns; c++) {
    let max = 0;
    for (let r = 0; r < rows && c * rows + r < lines.length; r++) {
      max = Math.max(max, widths[c * rows + r]);
    }
    columnWidths.push(max);
  }
  // The length of the result before the trailing spaces are removed (an upper bound), counted
  // before anything is built.
  let length = 0;
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < columns && c * rows + r < lines.length; c++) {
      const i = c * rows + r;
      length += lines[i].length;
      if ((c + 1) * rows + r < lines.length) {
        length += columnWidths[c] - widths[i] + LINE2_COLUMN_GAP;
      }
    }
  }
  length += (rows - 1) * options.eol.length;
  const before = lines.reduce((sum, line) => sum + line.length, 0) + (lines.length - 1) * options.eol.length;
  ensureAdded(length - before, options);
  const result: string[] = [];
  for (let r = 0; r < rows; r++) {
    let row = '';
    for (let c = 0; c < columns && c * rows + r < lines.length; c++) {
      const i = c * rows + r;
      row += lines[i];
      if ((c + 1) * rows + r < lines.length) {
        row += ' '.repeat(columnWidths[c] - widths[i] + LINE2_COLUMN_GAP);
      }
    }
    result.push(trimTrailingSpaces(row));
  }
  return result;
};

// ---------------------------------------------------------------------------
// LINEX-008: split at the matches of the user's regular expression
// ---------------------------------------------------------------------------

/**
 * LINEX-008: replaces every match (`regexSplits`, computed by the worker on this text) with the
 * document's EOL. The added length is counted before the result is built.
 */
export const splitAtMatches = (text: string, options: Line2Options): string => {
  const splits = options.regexSplits;
  if (splits === undefined) {
    throw new Error('The regular expression results are missing');
  }
  let removed = 0;
  let previous = 0;
  for (const [start, end] of splits) {
    if (start < previous || end <= start || end > text.length) {
      throw new Error('The regular expression results do not match the selection');
    }
    removed += end - start;
    previous = end;
  }
  ensureAdded(splits.length * options.eol.length - removed, options);
  let result = '';
  let position = 0;
  for (const [start, end] of splits) {
    result += text.slice(position, start) + options.eol;
    position = end;
  }
  return result + text.slice(position);
};

// ---------------------------------------------------------------------------
// LINEX-006, 010..012: several selections
// ---------------------------------------------------------------------------

export interface Line2MultiOptions {
  eol: string;
  /** LINEX-006: the delimiter (empty = TAB). */
  delimiter?: string;
  maxAddedLength?: number;
}

/** The number of non-empty selections a multi-selection command needs: [at least, at most]. */
export const LINE2_MULTI_SELECTIONS: Record<Line2MultiCommand, [number, number]> = {
  'paste-columns': [2, Number.POSITIVE_INFINITY],
  'intersect-selections': [2, 2],
  'subtract-selections': [2, 2],
  'symmetric-difference': [2, 2],
};

/** Each line once, in order of first appearance. */
const unique = (lines: string[]): string[] => [...new Set(lines)];

/**
 * The new text of the FIRST selection, made from the lines of all `texts` (the non-empty
 * selections in document order). The result ends with the document's EOL only when the first
 * selection ends with a line break and the result has a line; a result without lines is empty.
 */
export const combineSelections = (command: Line2MultiCommand, texts: readonly string[], options: Line2MultiOptions): string => {
  const [min, max] = LINE2_MULTI_SELECTIONS[command];
  if (texts.length < min || texts.length > max) {
    throw new Line2InputError('Wrong number of selections');
  }
  const lines = texts.map(splitSelectionLines);
  const first = texts[0];
  const endsWithBreak = trailingBreakLength(first) > 0;
  const finish = (result: string[]): string => {
    if (result.length === 0) {
      return '';
    }
    const joined = result.join(options.eol) + (endsWithBreak ? options.eol : '');
    ensureAdded(joined.length - first.length, options);
    return joined;
  };
  switch (command) {
    case 'paste-columns': {
      const given = options.delimiter ?? '';
      if (given.length > LINE_JOIN_DELIMITER_MAX_LENGTH || given.includes('\n') || given.includes('\r')) {
        throw new Line2InputError('Invalid delimiter');
      }
      const delimiter = given === '' ? LINE2_PASTE_DEFAULT_DELIMITER : given;
      // A loop, not `Math.max(...)`: spreading one argument per selection overflows the stack
      // when there are more than about 120,000 selections.
      let rows = 0;
      for (const block of lines) {
        rows = Math.max(rows, block.length);
      }
      if (rows === 0) {
        return '';
      }
      // Counted before the result is built.
      let length = (rows - 1) * options.eol.length + (endsWithBreak ? options.eol.length : 0);
      for (const block of lines) {
        for (const line of block) {
          length += line.length;
        }
      }
      length += rows * (lines.length - 1) * delimiter.length;
      ensureAdded(length - first.length, options);
      const result: string[] = [];
      for (let r = 0; r < rows; r++) {
        result.push(lines.map((block) => block[r] ?? '').join(delimiter));
      }
      return finish(result);
    }
    case 'intersect-selections': {
      const second = new Set(lines[1]);
      return finish(unique(lines[0]).filter((line) => second.has(line)));
    }
    case 'subtract-selections': {
      const second = new Set(lines[1]);
      return finish(unique(lines[0]).filter((line) => !second.has(line)));
    }
    case 'symmetric-difference': {
      const firstSet = new Set(lines[0]);
      const second = new Set(lines[1]);
      return finish([
        ...unique(lines[0]).filter((line) => !second.has(line)),
        ...unique(lines[1]).filter((line) => !firstSet.has(line)),
      ]);
    }
  }
};

// ---------------------------------------------------------------------------
// Command table of the single-selection commands
// ---------------------------------------------------------------------------

export const line2Transforms: Record<Line2SingleCommand, (text: string, options: Line2Options) => string> = {
  'keep-range': anchoredWith(keepRange),
  'drop-first-n': anchoredWith(dropFirstN),
  'drop-last-n': anchoredWith(dropLastN),
  'blank-every-n': anchoredWith(blankEveryN),
  'cut-chars': unanchoredWith(cutChars),
  'dedupe-keep-last': anchoredWith(dedupeKeepLast),
  'split-by-regex': splitAtMatches,
  'join-natural-list': unanchoredWith(joinNaturalList),
  'number-nonblank': anchoredWith(numberNonBlank),
  'fold-to-columns': unanchoredWith(foldToColumns),
};

/** The commands that use the anchor rule (see the module comment). */
export const LINE2_ANCHORED_COMMANDS: Line2SingleCommand[] = [
  'keep-range',
  'drop-first-n',
  'drop-last-n',
  'blank-every-n',
  'dedupe-keep-last',
  'number-nonblank',
];

// ---------------------------------------------------------------------------
// Command entries (LINEX-001..014)
// ---------------------------------------------------------------------------

/** One input box of a command; `apply` stores the (validated) value into the options. */
export interface Line2InputStep {
  prompt: string;
  placeHolder?: string;
  value?: string;
  validate: (value: string) => string | undefined;
  apply: (value: string) => Partial<Line2Options & Line2MultiOptions> & { pattern?: string };
}

export interface Line2CommandEntry {
  /** Candidate ID (LINEX-001…). */
  id: string;
  /** Command name without `selection-manipulator.`. */
  name: string;
  title: string;
  command: Line2Command;
  /** Input boxes shown before running, in order (asked once for all selections). */
  inputs?: Line2InputStep[];
}

const countStep = (prompt: string, value: string, max: number, validate: (value: string) => string | undefined): Line2InputStep => ({
  prompt: `${prompt} (1-${formatNumber(max)})`,
  value,
  validate,
  apply: (input) => ({ n: Number(input.trim()) }),
});

const lineCountStep = (prompt: string, value: string): Line2InputStep =>
  countStep(prompt, value, LINE2_POSITION_MAX, validateLineCountInput);

export const LINE2_COMMAND_ENTRIES: readonly Line2CommandEntry[] = [
  {
    id: 'LINEX-001', name: 'line.keep-range', title: 'Line: Keep Lines N to M', command: 'keep-range',
    inputs: [{
      prompt: `Lines to keep: N-M (1 <= N <= M <= ${formatNumber(LINE2_POSITION_MAX)})`,
      placeHolder: 'e.g. 2-3',
      validate: validateLineRangeInput,
      apply: (input) => ({ range: toRange(input) }),
    }],
  },
  { id: 'LINEX-002', name: 'line.drop-first-n', title: 'Line: Remove First N Lines', command: 'drop-first-n', inputs: [lineCountStep('Number of lines to remove from the start', '1')] },
  { id: 'LINEX-003', name: 'line.drop-last-n', title: 'Line: Remove Last N Lines', command: 'drop-last-n', inputs: [lineCountStep('Number of lines to remove from the end', '1')] },
  { id: 'LINEX-004', name: 'line.blank-every-n', title: 'Line: Insert Blank Line Every N Lines', command: 'blank-every-n', inputs: [lineCountStep('Insert a blank line after every N lines: N', '2')] },
  {
    id: 'LINEX-005', name: 'line.cut-chars', title: 'Line: Cut Character Range of Each Line', command: 'cut-chars',
    inputs: [{
      prompt: `Characters to keep from each line: M-N or N (1 <= M <= N <= ${formatNumber(LINE2_POSITION_MAX)}, grapheme clusters)`,
      placeHolder: 'e.g. 3-5',
      validate: validateCharRangeInput,
      apply: (input) => ({ range: toRange(input) }),
    }],
  },
  {
    id: 'LINEX-006', name: 'line.paste-columns', title: 'Line: Paste Selections Side by Side', command: 'paste-columns',
    inputs: [{
      prompt: `Delimiter (literal text, up to ${formatNumber(LINE_JOIN_DELIMITER_MAX_LENGTH)} characters; empty uses a tab)`,
      validate: validateLineDelimiterInput,
      apply: (input) => ({ delimiter: input }),
    }],
  },
  { id: 'LINEX-007', name: 'line.dedupe-keep-last', title: 'Line: Remove Duplicate Lines (Keep Last)', command: 'dedupe-keep-last' },
  {
    id: 'LINEX-008', name: 'line.split-by-regex', title: 'Line: Split into Lines by Regex', command: 'split-by-regex',
    inputs: [{
      prompt: `Split at the matches of this regular expression (JavaScript syntax with the "u" flag, case-sensitive, up to ${formatNumber(LINE_REGEX_PATTERN_MAX_LENGTH)} characters)`,
      placeHolder: 'e.g. \\d+',
      validate: validateLineRegexInput,
      apply: (input) => ({ pattern: input }),
    }],
  },
  {
    id: 'LINEX-009', name: 'line.join-natural-list', title: 'Line: Join as Natural Language List', command: 'join-natural-list',
    inputs: [{
      prompt: 'Locale of the list (e.g. en, ja, fr)',
      value: LINE2_DEFAULT_LOCALE,
      validate: validateListLocaleInput,
      apply: (input) => ({ locale: input.trim() }),
    }],
  },
  { id: 'LINEX-010', name: 'line.intersect-selections', title: 'Line: Lines Common to Two Selections', command: 'intersect-selections' },
  { id: 'LINEX-011', name: 'line.subtract-selections', title: 'Line: Lines Only in First Selection', command: 'subtract-selections' },
  { id: 'LINEX-012', name: 'line.symmetric-difference', title: 'Line: Lines in Only One Selection', command: 'symmetric-difference' },
  { id: 'LINEX-013', name: 'line.number-nonblank', title: 'Line: Add Numbers to Non-blank Lines', command: 'number-nonblank' },
  {
    id: 'LINEX-014', name: 'line.fold-to-columns', title: 'Line: Arrange Lines into N Columns', command: 'fold-to-columns',
    inputs: [countStep('Number of columns', '2', LINE2_COLUMNS_MAX, validateColumnsInput)],
  },
];

export const isLine2MultiCommand = (command: Line2Command): command is Line2MultiCommand =>
  Object.prototype.hasOwnProperty.call(LINE2_MULTI_SELECTIONS, command);
