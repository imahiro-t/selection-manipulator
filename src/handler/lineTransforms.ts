/**
 * Pure (vscode-independent) implementations of the LINE-001..LINE-034 line commands
 * (LINE-035..LINE-040 are clipboard versions of six of them and reuse the same transforms).
 *
 * The rules shared by all commands are:
 * - Lines are split on /\r\n|\r|\n/ and joined with the document's EOL. ONE trailing line
 *   break is dropped before splitting; it is appended again (as the document's EOL) only when
 *   the result is not empty, so deleting every selected whole line does not join the lines
 *   before and after the selection. LINE-022 is the exception: it keeps every line break it
 *   does not remove exactly as it was.
 * - For the commands in `LINE_ANCHORED_COMMANDS`, a first line that is the rest of a line
 *   starting before the selection (`precededByText`) and a last line that goes on after the
 *   selection (`followedByText`) are "anchors": they are left untouched and only the lines
 *   between them are transformed, so the text around the selection is never joined to
 *   another line (see `anchoredLineWise`).
 * - Lengths and widths are counted in code points (a surrogate pair is one character).
 * - User input (text, markers, delimiters) is never embedded into a regular expression; it is
 *   matched with `includes` / `startsWith` / `endsWith`. The user-supplied regular expressions
 *   of LINE-003 / LINE-004 are NOT executed here: the handler runs them in a worker thread
 *   with a time limit and passes the per-line results in `regexMatches`.
 * - Commands that add characters (LINE-005, 006, 020, 027, 028, 029) count them before
 *   building the result and throw `LineOutputTooLargeError` when the count exceeds the limit.
 */
import { codePointWidth, describeAddedLength, MAX_ADDED_LENGTH } from './whitespaceTransforms';

export { MAX_ADDED_LENGTH };

export type LineCommand =
  | 'filter-contains'
  | 'filter-not-contains'
  | 'filter-regex'
  | 'filter-not-regex'
  | 'add-numbers'
  | 'add-numbers-padded'
  | 'keep-duplicates'
  | 'keep-unique-only'
  | 'dedupe-ignore-case'
  | 'dedupe-ignore-whitespace'
  | 'dedupe-adjacent'
  | 'reverse-words'
  | 'rotate'
  | 'keep-every-nth'
  | 'remove-every-nth'
  | 'keep-odd'
  | 'keep-even'
  | 'head'
  | 'tail'
  | 'duplicate-each'
  | 'swap-pairs'
  | 'join-continuation'
  | 'move-matching-to-top'
  | 'remove-prefix'
  | 'remove-suffix'
  | 'interleave-halves'
  | 'join-every-n'
  | 'split-sentences'
  | 'split-fixed-width'
  | 'remove-comment-lines'
  | 'count-stats'
  | 'extract-between-markers'
  | 'extract-longest'
  | 'extract-shortest';

/** Every command that changes the text (all but LINE-031, which only shows a notification). */
export type LineTransformCommand = Exclude<LineCommand, 'count-stats'>;

/** Commands that ask the user for one or two values (14 commands). */
export type LineInputCommand =
  | 'filter-contains'
  | 'filter-not-contains'
  | 'filter-regex'
  | 'filter-not-regex'
  | 'keep-every-nth'
  | 'remove-every-nth'
  | 'head'
  | 'tail'
  | 'move-matching-to-top'
  | 'remove-prefix'
  | 'remove-suffix'
  | 'join-every-n'
  | 'split-fixed-width'
  | 'extract-between-markers';

/** LINE-003 / LINE-004 (and LINE-036): commands that apply a user-supplied regular expression. */
export type LineRegexCommand = 'filter-regex' | 'filter-not-regex';

/** Commands that also have a clipboard version (LINE-035..LINE-040). */
export type LineClipboardCommand =
  | 'filter-contains'
  | 'filter-regex'
  | 'keep-duplicates'
  | 'keep-unique-only'
  | 'dedupe-adjacent'
  | 'extract-between-markers';

export interface LineOptions {
  /** End-of-line sequence of the document ('\n' or '\r\n'). */
  eol: string;
  /** Literal text (LINE-001, 002, 023, 024, 025). */
  text?: string;
  /** N (LINE-014, 015, 018, 019, 027) or the width (LINE-029). */
  n?: number;
  /** Delimiter of LINE-027 (may be empty). Defaults to ','. */
  delimiter?: string;
  /** Start / end markers of LINE-032. */
  startMarker?: string;
  endMarker?: string;
  /**
   * LINE-003 / LINE-004: whether each line of the selection (as split by `splitSelectionLines`)
   * matches the user's regular expression, computed by the handler in a worker thread.
   */
  regexMatches?: boolean[];
  /**
   * Maximum number of characters a command may add (defaults to MAX_ADDED_LENGTH). The handler
   * lowers it so that all selections share one budget.
   */
  maxAddedLength?: number;
  /**
   * True when the selection starts after column 0, i.e. its first line is the rest of a line
   * that begins before the selection. Only used by `LINE_ANCHORED_COMMANDS`.
   */
  precededByText?: boolean;
  /**
   * True when the selection ends in the middle of a line (after column 0 and before the end
   * of the line), i.e. its last line goes on after the selection. Only used by
   * `LINE_ANCHORED_COMMANDS`.
   */
  followedByText?: boolean;
}

export type LineTransform = (text: string, options: LineOptions) => string;

// ---------------------------------------------------------------------------
// Limits and input validation
// ---------------------------------------------------------------------------

/** Literal text and markers: 1 to 1,000 characters. */
export const LINE_TEXT_MAX_LENGTH = 1000;
/** N of LINE-014 / 015 / 018 / 019 / 027. */
export const LINE_COUNT_MIN = 1;
export const LINE_COUNT_MAX = 1_000_000;
/** Width of LINE-029. */
export const LINE_WIDTH_MIN = 1;
export const LINE_WIDTH_MAX = 1000;
/** Delimiter of LINE-027: 0 to 100 characters. */
export const LINE_JOIN_DELIMITER_MAX_LENGTH = 100;
/** Regular expressions of LINE-003 / LINE-004 / LINE-036. */
export const LINE_REGEX_PATTERN_MAX_LENGTH = 500;
/** Total length of all selections a regular expression may be applied to. */
export const LINE_REGEX_MAX_INPUT_LENGTH = 10_000_000;
/** Time limit of one regular expression run (milliseconds). */
export const LINE_REGEX_TIMEOUT_MS = 2000;

const formatNumber = (n: number): string => n.toLocaleString('en-US');

const hasLineBreak = (value: string): boolean => value.includes('\n') || value.includes('\r');

const validateInteger = (value: string, min: number, max: number): string | undefined => {
  const trimmed = value.trim();
  const message = `Enter an integer from ${formatNumber(min)} to ${formatNumber(max)}`;
  if (!/^[0-9]{1,7}$/.test(trimmed)) {
    return message;
  }
  const n = Number(trimmed);
  return n < min || n > max ? message : undefined;
};

/** N of LINE-014 / 015 / 018 / 019 / 027: an integer from 1 to 1,000,000. */
export const validateLineCountInput = (value: string): string | undefined =>
  validateInteger(value, LINE_COUNT_MIN, LINE_COUNT_MAX);

/** Width of LINE-029: an integer from 1 to 1,000. */
export const validateLineWidthInput = (value: string): string | undefined =>
  validateInteger(value, LINE_WIDTH_MIN, LINE_WIDTH_MAX);

/** Literal text / markers: 1 to 1,000 characters without line breaks (spaces are significant). */
export const validateLineTextInput = (value: string): string | undefined => {
  if (value.length === 0) {
    return 'Enter the text';
  }
  if (value.length > LINE_TEXT_MAX_LENGTH) {
    return `The text must be at most ${formatNumber(LINE_TEXT_MAX_LENGTH)} characters`;
  }
  if (hasLineBreak(value)) {
    return 'The text must not contain line breaks';
  }
  return undefined;
};

/** Delimiter of LINE-027: 0 to 100 characters without line breaks (empty joins without a delimiter). */
export const validateLineDelimiterInput = (value: string): string | undefined => {
  if (value.length > LINE_JOIN_DELIMITER_MAX_LENGTH) {
    return `The delimiter must be at most ${LINE_JOIN_DELIMITER_MAX_LENGTH} characters`;
  }
  if (hasLineBreak(value)) {
    return 'The delimiter must not contain line breaks';
  }
  return undefined;
};

/**
 * Regular expression of LINE-003 / 004 / 036: 1 to 500 characters and valid with the `u` flag.
 * Compiling a pattern cannot backtrack, so doing it here (outside the worker) is safe.
 */
export const validateLineRegexInput = (value: string): string | undefined => {
  if (value.length === 0) {
    return 'Enter a regular expression';
  }
  if (value.length > LINE_REGEX_PATTERN_MAX_LENGTH) {
    return `The regular expression must be at most ${LINE_REGEX_PATTERN_MAX_LENGTH} characters`;
  }
  try {
    new RegExp(value, 'u');
  } catch (error) {
    return `Invalid regular expression: ${error instanceof Error ? error.message : String(error)}`;
  }
  return undefined;
};

// ---------------------------------------------------------------------------
// Errors
// ---------------------------------------------------------------------------

/** Thrown (before the result is built) when a command would add more characters than allowed. */
export class LineOutputTooLargeError extends Error {
  constructor(readonly added: number, readonly limit: number) {
    const description = describeAddedLength(added, limit);
    super(description.charAt(0).toUpperCase() + description.slice(1));
    this.name = 'LineOutputTooLargeError';
  }
}

/** Thrown when the user's regular expression did not finish within the time limit. */
export class LineRegexTimeoutError extends Error {
  constructor(readonly timeoutMs: number) {
    super(`The regular expression did not finish within ${formatNumber(timeoutMs)} ms and was stopped`);
    this.name = 'LineRegexTimeoutError';
  }
}

/** Thrown when the selections are too large to apply a regular expression to. */
export class LineInputTooLargeError extends Error {
  constructor(readonly length: number, readonly limit: number) {
    super(
      `The selections contain ${formatNumber(length)} characters `
      + `(limit for regular expressions: ${formatNumber(limit)})`
    );
    this.name = 'LineInputTooLargeError';
  }
}

const ensureAddedLength = (added: number, options: LineOptions): void => {
  const limit = options.maxAddedLength ?? MAX_ADDED_LENGTH;
  if (added > limit) {
    throw new LineOutputTooLargeError(added, limit);
  }
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const LINE_BREAK = /\r\n|\r|\n/;

/**
 * Unicode whitespace other than line breaks, except U+FEFF (as in the WS commands).
 */
const isHorizontalWs = (ch: string): boolean =>
  ch !== '\n' && ch !== '\r' && ch !== '﻿' && /^\s$/.test(ch);

const isSpaceOrTab = (ch: string): boolean => ch === ' ' || ch === '\t';

const leadingLength = (s: string, pred: (ch: string) => boolean): number => {
  let i = 0;
  while (i < s.length && pred(s[i])) {
    i++;
  }
  return i;
};

const trailingStart = (s: string, pred: (ch: string) => boolean): number => {
  let i = s.length;
  while (i > 0 && pred(s[i - 1])) {
    i--;
  }
  return i;
};

const trimWs = (s: string): string => {
  const start = leadingLength(s, isHorizontalWs);
  return start === s.length ? '' : s.slice(start, trailingStart(s, isHorizontalWs));
};

const isBlankLine = (s: string): boolean => leadingLength(s, isHorizontalWs) === s.length;

const sum = (values: number[]): number => values.reduce((a, b) => a + b, 0);

/** Length of the single trailing line break of `text` (0, 1 or 2). */
const trailingBreakLength = (text: string): number => {
  if (text.endsWith('\r\n')) {
    return 2;
  }
  if (text.endsWith('\n') || text.endsWith('\r')) {
    return 1;
  }
  return 0;
};

/**
 * The lines of a selection as every command sees them: one trailing line break is dropped
 * and the rest is split on /\r\n|\r|\n/. The handler uses it to send the same lines to the
 * regular expression worker (`regexMatches` is aligned with this array).
 */
export const splitSelectionLines = (text: string): string[] => {
  if (text === '') {
    return [];
  }
  const body = text.slice(0, text.length - trailingBreakLength(text));
  return body.split(LINE_BREAK);
};

/** What a line function gets besides the lines it transforms. */
interface LineContext {
  options: LineOptions;
  /** Index of the first transformed line within `splitSelectionLines(text)`. */
  offset: number;
  /** Number of lines of `splitSelectionLines(text)`. */
  total: number;
}

/** Transforms the given lines; `undefined` means "leave the selection unchanged" (LINE-032). */
type LineFn = (lines: string[], context: LineContext) => string[] | undefined;

/**
 * Splits the selection into lines, transforms them and joins them with the document's EOL.
 * With `anchored`, the anchor rule applies: the first line is left untouched when
 * `precededByText` is set and the selection contains a line break, and the last line is left
 * untouched when `followedByText` is set, the selection has more than one line and does not
 * end with a line break. The result gets the document's EOL at the end only when the
 * selection ended with a line break and the result is not empty.
 */
const lineWiseWith = (text: string, options: LineOptions, anchored: boolean, fn: LineFn): string | undefined => {
  if (text === '') {
    return text;
  }
  const endsWithBreak = trailingBreakLength(text) > 0;
  const lines = splitSelectionLines(text);
  const last = lines.length - 1;
  const head = anchored && options.precededByText && (last >= 1 || endsWithBreak) ? 1 : 0;
  const tail = anchored && options.followedByText && !endsWithBreak && last >= 1 ? 1 : 0;
  const middle = fn(lines.slice(head, lines.length - tail), { options, offset: head, total: lines.length });
  if (middle === undefined) {
    return undefined;
  }
  const result = [...lines.slice(0, head), ...middle, ...lines.slice(lines.length - tail)];
  if (result.length === 0) {
    return '';
  }
  return result.join(options.eol) + (endsWithBreak ? options.eol : '');
};

const anchored = (fn: LineFn): LineTransform => (text, options) => lineWiseWith(text, options, true, fn) ?? text;
const unanchored = (fn: LineFn): LineTransform => (text, options) => lineWiseWith(text, options, false, fn) ?? text;

const requireText = (value: string | undefined, name: string): string => {
  if (value === undefined || value === '') {
    throw new Error(`Missing ${name}`);
  }
  return value;
};

const requireCount = (value: number | undefined, fallback: number): number => {
  const n = value ?? fallback;
  if (!Number.isInteger(n) || n < 1) {
    throw new Error(`Invalid number: ${n}`);
  }
  return n;
};

// ---------------------------------------------------------------------------
// A. Filters (LINE-001..004, 030)
// ---------------------------------------------------------------------------

const filterContains = (keep: boolean): LineFn => (lines, { options }) => {
  const text = requireText(options.text, 'text');
  return lines.filter((line) => line.includes(text) === keep);
};

const filterRegex = (keep: boolean): LineFn => (lines, { options, offset, total }) => {
  const matches = options.regexMatches;
  if (matches === undefined || matches.length !== total) {
    throw new Error('The regular expression results do not match the selected lines');
  }
  return lines.filter((_, i) => matches[offset + i] === keep);
};

/** LINE-030: lines whose content (after leading whitespace) starts with `#` or `//`. */
const isCommentLine = (line: string): boolean => {
  const content = line.slice(leadingLength(line, isHorizontalWs));
  return content.startsWith('#') || content.startsWith('//');
};

// ---------------------------------------------------------------------------
// B. Numbering (LINE-005, 006)
// ---------------------------------------------------------------------------

const addNumbers: LineFn = (lines, { options }) => {
  // "1: " is the number, ": " (2) and the line.
  ensureAddedLength(sum(lines.map((_, i) => String(i + 1).length + 2)), options);
  return lines.map((line, i) => `${i + 1}: ${line}`);
};

const addNumbersPadded: LineFn = (lines, { options }) => {
  const width = String(lines.length).length;
  ensureAddedLength(lines.length * (width + 1), options);
  return lines.map((line, i) => `${String(i + 1).padStart(width, '0')} ${line}`);
};

// ---------------------------------------------------------------------------
// C. Duplicates (LINE-007..011)
// ---------------------------------------------------------------------------

const countLines = (lines: string[]): Map<string, number> => {
  const counts = new Map<string, number>();
  lines.forEach((line) => counts.set(line, (counts.get(line) ?? 0) + 1));
  return counts;
};

/** LINE-007: each line that appears twice or more, once, in order of first appearance. */
const keepDuplicates: LineFn = (lines) => {
  const counts = countLines(lines);
  const emitted = new Set<string>();
  return lines.filter((line) => {
    if ((counts.get(line) ?? 0) < 2 || emitted.has(line)) {
      return false;
    }
    emitted.add(line);
    return true;
  });
};

/** LINE-008: lines that appear exactly once, in their original order. */
const keepUniqueOnly: LineFn = (lines) => {
  const counts = countLines(lines);
  return lines.filter((line) => counts.get(line) === 1);
};

/** Keeps the first line of every group of lines with the same key. */
const dedupeBy = (key: (line: string) => string): LineFn => (lines) => {
  const seen = new Set<string>();
  return lines.filter((line) => {
    const k = key(line);
    if (seen.has(k)) {
      return false;
    }
    seen.add(k);
    return true;
  });
};

/** LINE-011: `uniq`. */
const dedupeAdjacent: LineFn = (lines) => lines.filter((line, i) => i === 0 || line !== lines[i - 1]);

// ---------------------------------------------------------------------------
// D. Reordering and selection by position (LINE-013..021, 023, 026)
// ---------------------------------------------------------------------------

const rotate: LineFn = (lines) => (lines.length <= 1 ? lines : [lines[lines.length - 1], ...lines.slice(0, -1)]);

const everyNth = (keep: boolean): LineFn => (lines, { options }) => {
  const n = requireCount(options.n, 2);
  return lines.filter((_, i) => ((i + 1) % n === 0) === keep);
};

const keepParity = (odd: boolean): LineFn => (lines) => lines.filter((_, i) => (i % 2 === 0) === odd);

const head: LineFn = (lines, { options }) => lines.slice(0, requireCount(options.n, 10));

const tail: LineFn = (lines, { options }) => {
  const n = requireCount(options.n, 10);
  return n >= lines.length ? lines : lines.slice(lines.length - n);
};

const duplicateEach: LineFn = (lines, { options }) => {
  ensureAddedLength(sum(lines.map((line) => line.length + options.eol.length)), options);
  return lines.flatMap((line) => [line, line]);
};

const swapPairs: LineFn = (lines) => {
  const result = [...lines];
  for (let i = 0; i + 1 < result.length; i += 2) {
    [result[i], result[i + 1]] = [result[i + 1], result[i]];
  }
  return result;
};

/** LINE-023: a stable partition, matching lines first. */
const moveMatchingToTop: LineFn = (lines, { options }) => {
  const text = requireText(options.text, 'text');
  return [...lines.filter((line) => line.includes(text)), ...lines.filter((line) => !line.includes(text))];
};

/** LINE-026: the first half has ceil(n / 2) lines; with an odd count its last line ends the result. */
const interleaveHalves: LineFn = (lines) => {
  const half = Math.ceil(lines.length / 2);
  const result: string[] = [];
  for (let i = 0; i < half; i++) {
    result.push(lines[i]);
    if (half + i < lines.length) {
      result.push(lines[half + i]);
    }
  }
  return result;
};

// ---------------------------------------------------------------------------
// E. Prefix / suffix (LINE-024, 025)
// ---------------------------------------------------------------------------

const removePrefix: LineFn = (lines, { options }) => {
  const text = requireText(options.text, 'text');
  return lines.map((line) => (line.startsWith(text) ? line.slice(text.length) : line));
};

const removeSuffix: LineFn = (lines, { options }) => {
  const text = requireText(options.text, 'text');
  return lines.map((line) => (line.endsWith(text) ? line.slice(0, line.length - text.length) : line));
};

// ---------------------------------------------------------------------------
// F. In-line rewrites, joining and splitting (LINE-012, 027, 028, 029)
// ---------------------------------------------------------------------------

/** LINE-012: reverses the order of the non-whitespace runs; the whitespace stays where it was. */
const reverseWordsInLine = (line: string): string => {
  const words = line.match(/\S+/g);
  if (!words || words.length < 2) {
    return line;
  }
  let i = words.length;
  return line.replace(/\S+/g, () => words[--i]);
};

const reverseWords: LineFn = (lines) => lines.map(reverseWordsInLine);

/** LINE-027: joins every `n` lines with the delimiter (the last group may be shorter). */
const joinEveryN: LineFn = (lines, { options }) => {
  const n = requireCount(options.n, 2);
  const delimiter = options.delimiter ?? ',';
  const joins = lines.length - Math.ceil(lines.length / n);
  ensureAddedLength(Math.max(0, joins * (delimiter.length - options.eol.length)), options);
  const result: string[] = [];
  for (let i = 0; i < lines.length; i += n) {
    result.push(lines.slice(i, i + n).join(delimiter));
  }
  return result;
};

const SENTENCE_END = new Set(['.', '!', '?', '。']);
const CLOSERS = new Set(['"', '\'', '”', '’', ')', ']', '」', '』']);

/**
 * LINE-028: splits one line into sentences. A sentence ends after a run of `.` `!` `?` `。`
 * (plus closing quotes / brackets) that is followed by whitespace, or that contains `。`.
 * The whitespace at the split is removed. Nothing is split at the end of the line.
 */
const splitSentencesInLine = (line: string): string[] => {
  const pieces: string[] = [];
  let start = 0;
  let i = 0;
  while (i < line.length) {
    if (!SENTENCE_END.has(line[i])) {
      i++;
      continue;
    }
    let j = i;
    let ideographic = false;
    while (j < line.length && SENTENCE_END.has(line[j])) {
      ideographic = ideographic || line[j] === '。';
      j++;
    }
    while (j < line.length && CLOSERS.has(line[j])) {
      j++;
    }
    let k = j;
    while (k < line.length && isHorizontalWs(line[k])) {
      k++;
    }
    if (k < line.length && (ideographic || k > j)) {
      pieces.push(line.slice(start, j));
      start = k;
    }
    i = k > j ? k : j;
  }
  pieces.push(line.slice(start));
  return pieces;
};

const splitSentences: LineFn = (lines, { options }) => {
  const split = lines.map(splitSentencesInLine);
  const added = sum(split.map((pieces, index) =>
    (pieces.length - 1) * options.eol.length - (lines[index].length - sum(pieces.map((p) => p.length)))));
  ensureAddedLength(Math.max(0, added), options);
  return split.flat();
};

/** LINE-029: splits each line every `n` code points (an empty line stays one empty line). */
const splitFixedWidth: LineFn = (lines, { options }) => {
  const n = requireCount(options.n, 80);
  ensureAddedLength(
    sum(lines.map((line) => Math.max(0, Math.ceil(codePointWidth(line) / n) - 1) * options.eol.length)),
    options
  );
  return lines.flatMap((line) => {
    const chars = Array.from(line);
    if (chars.length <= n) {
      return [line];
    }
    const chunks: string[] = [];
    for (let i = 0; i < chars.length; i += n) {
      chunks.push(chars.slice(i, i + n).join(''));
    }
    return chunks;
  });
};

// ---------------------------------------------------------------------------
// G. LINE-022: backslash-continued lines
// ---------------------------------------------------------------------------

/** Number of consecutive backslashes at the end of `s`. */
const trailingBackslashes = (s: string): number => s.length - trailingStart(s, (ch) => ch === '\\');

/**
 * LINE-022: a line whose trailing run of backslashes has an ODD length is continued: the last
 * backslash and the line break are removed and the next line is appended without its leading
 * spaces / tabs. An even run (`\\`) is a literal backslash. The line break decides by the
 * character before `\r\n` / `\r` / `\n`, so CRLF works too. Every line break that is not
 * removed is kept exactly as it was (no EOL normalization). The last line of the selection and
 * the line before the selection's final line break are never continued, because their next
 * line is outside the selection.
 */
const joinContinuation: LineTransform = (text) => {
  const segments: { content: string; lineBreak: string }[] = [];
  const pattern = /\r\n|\r|\n/g;
  let position = 0;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(text)) !== null) {
    segments.push({ content: text.slice(position, match.index), lineBreak: match[0] });
    position = match.index + match[0].length;
  }
  segments.push({ content: text.slice(position), lineBreak: '' });
  // When the text ends with a line break, the last segment is the empty string after it.
  const lastJoinable = text.slice(position) === '' ? segments.length - 3 : segments.length - 2;
  let result = '';
  let trimNext = false;
  segments.forEach(({ content, lineBreak }, i) => {
    const line = trimNext ? content.slice(leadingLength(content, isSpaceOrTab)) : content;
    if (i <= lastJoinable && trailingBackslashes(line) % 2 === 1) {
      result += line.slice(0, -1);
      trimNext = true;
    } else {
      result += line + lineBreak;
      trimNext = false;
    }
  });
  return result;
};

// ---------------------------------------------------------------------------
// H. Extraction (LINE-032..034)
// ---------------------------------------------------------------------------

/**
 * LINE-032 on already split lines. A marker line is a line containing the marker; the lines
 * between a start marker line and the next end marker line (or the end of the lines) are
 * collected, for every block. Returns `undefined` when no line contains the start marker.
 */
const extractBetweenMarkerLines: LineFn = (lines, { options }) => {
  const start = requireText(options.startMarker, 'start marker');
  const end = requireText(options.endMarker, 'end marker');
  const result: string[] = [];
  let inside = false;
  let found = false;
  for (const line of lines) {
    if (!inside) {
      if (line.includes(start)) {
        inside = true;
        found = true;
      }
    } else if (line.includes(end)) {
      inside = false;
    } else {
      result.push(line);
    }
  }
  return found ? result : undefined;
};

/**
 * LINE-032 (and LINE-040): the extracted text, or `undefined` when the selection has no line
 * containing the start marker (the selection is then left unchanged / not copied).
 */
export const extractBetweenMarkers = (text: string, options: LineOptions): string | undefined =>
  lineWiseWith(text, options, true, extractBetweenMarkerLines);

/** Index of the first longest (or shortest) candidate, or -1 when there is none. */
const extremeIndex = (lines: string[], longest: boolean, candidate: (line: string) => boolean): number => {
  let best = -1;
  let bestWidth = 0;
  lines.forEach((line, i) => {
    if (!candidate(line)) {
      return;
    }
    const width = codePointWidth(line);
    if (best === -1 || (longest ? width > bestWidth : width < bestWidth)) {
      best = i;
      bestWidth = width;
    }
  });
  return best;
};

const extractExtreme = (longest: boolean): LineFn => (lines) => {
  const index = extremeIndex(lines, longest, longest ? () => true : (line) => !isBlankLine(line));
  return index === -1 ? lines : [lines[index]];
};

// ---------------------------------------------------------------------------
// LINE-031: statistics
// ---------------------------------------------------------------------------

export interface LineStats {
  lines: number;
  words: number;
  chars: number;
}

/**
 * LINE-031: lines as split by the common rule (a final line break does not start a line),
 * words as runs of non-whitespace, characters as code points with a line break (CRLF too)
 * counted as one character.
 */
export const countLineStats = (text: string): LineStats => ({
  lines: splitSelectionLines(text).length,
  words: (text.match(/\S+/g) ?? []).length,
  chars: codePointWidth(text.replace(/\r\n/g, '\n')),
});

const plural = (n: number, singular: string): string => `${formatNumber(n)} ${singular}${n === 1 ? '' : 's'}`;

/** `2 lines, 3 words, 5 chars`, plus ` (2 selections)` when several selections were counted. */
export const formatLineStats = (stats: LineStats, selections: number): string =>
  `${plural(stats.lines, 'line')}, ${plural(stats.words, 'word')}, ${plural(stats.chars, 'char')}`
  + (selections > 1 ? ` (${formatNumber(selections)} selections)` : '');

// ---------------------------------------------------------------------------
// Command table
// ---------------------------------------------------------------------------

export const lineTransforms: Record<LineTransformCommand, LineTransform> = {
  'filter-contains': anchored(filterContains(true)),
  'filter-not-contains': anchored(filterContains(false)),
  'filter-regex': anchored(filterRegex(true)),
  'filter-not-regex': anchored(filterRegex(false)),
  'add-numbers': anchored(addNumbers),
  'add-numbers-padded': anchored(addNumbersPadded),
  'keep-duplicates': anchored(keepDuplicates),
  'keep-unique-only': anchored(keepUniqueOnly),
  'dedupe-ignore-case': anchored(dedupeBy((line) => line.toLowerCase())),
  'dedupe-ignore-whitespace': anchored(dedupeBy(trimWs)),
  'dedupe-adjacent': anchored(dedupeAdjacent),
  'reverse-words': unanchored(reverseWords),
  'rotate': anchored(rotate),
  'keep-every-nth': anchored(everyNth(true)),
  'remove-every-nth': anchored(everyNth(false)),
  'keep-odd': anchored(keepParity(true)),
  'keep-even': anchored(keepParity(false)),
  'head': anchored(head),
  'tail': anchored(tail),
  'duplicate-each': anchored(duplicateEach),
  'swap-pairs': anchored(swapPairs),
  'join-continuation': joinContinuation,
  'move-matching-to-top': anchored(moveMatchingToTop),
  'remove-prefix': anchored(removePrefix),
  'remove-suffix': anchored(removeSuffix),
  'interleave-halves': anchored(interleaveHalves),
  'join-every-n': unanchored(joinEveryN),
  'split-sentences': unanchored(splitSentences),
  'split-fixed-width': unanchored(splitFixedWidth),
  'remove-comment-lines': anchored((lines) => lines.filter((line) => !isCommentLine(line))),
  'extract-between-markers': (text, options) => extractBetweenMarkers(text, options) ?? text,
  'extract-longest': anchored(extractExtreme(true)),
  'extract-shortest': anchored(extractExtreme(false)),
};

/** All 34 commands in ROADMAP order (LINE-001..LINE-034). */
export const LINE_COMMANDS: LineCommand[] = [
  'filter-contains',
  'filter-not-contains',
  'filter-regex',
  'filter-not-regex',
  'add-numbers',
  'add-numbers-padded',
  'keep-duplicates',
  'keep-unique-only',
  'dedupe-ignore-case',
  'dedupe-ignore-whitespace',
  'dedupe-adjacent',
  'reverse-words',
  'rotate',
  'keep-every-nth',
  'remove-every-nth',
  'keep-odd',
  'keep-even',
  'head',
  'tail',
  'duplicate-each',
  'swap-pairs',
  'join-continuation',
  'move-matching-to-top',
  'remove-prefix',
  'remove-suffix',
  'interleave-halves',
  'join-every-n',
  'split-sentences',
  'split-fixed-width',
  'remove-comment-lines',
  'count-stats',
  'extract-between-markers',
  'extract-longest',
  'extract-shortest',
];

export const LINE_INPUT_COMMANDS: LineInputCommand[] = [
  'filter-contains',
  'filter-not-contains',
  'filter-regex',
  'filter-not-regex',
  'keep-every-nth',
  'remove-every-nth',
  'head',
  'tail',
  'move-matching-to-top',
  'remove-prefix',
  'remove-suffix',
  'join-every-n',
  'split-fixed-width',
  'extract-between-markers',
];

export const LINE_REGEX_COMMANDS: LineRegexCommand[] = ['filter-regex', 'filter-not-regex'];

/** The parents of the clipboard versions LINE-035..LINE-040, in that order. */
export const LINE_CLIPBOARD_COMMANDS: LineClipboardCommand[] = [
  'filter-contains',
  'filter-regex',
  'keep-duplicates',
  'keep-unique-only',
  'dedupe-adjacent',
  'extract-between-markers',
];

/**
 * The 28 commands that use the anchor rule (they delete, reorder, number or extract lines, or
 * work relative to the start / end of a line). The other five transforms (LINE-012, 022, 027,
 * 028, 029) rewrite, join or split lines in place and treat a partial line as a line.
 */
export const LINE_ANCHORED_COMMANDS: LineTransformCommand[] = [
  'filter-contains',
  'filter-not-contains',
  'filter-regex',
  'filter-not-regex',
  'add-numbers',
  'add-numbers-padded',
  'keep-duplicates',
  'keep-unique-only',
  'dedupe-ignore-case',
  'dedupe-ignore-whitespace',
  'dedupe-adjacent',
  'rotate',
  'keep-every-nth',
  'remove-every-nth',
  'keep-odd',
  'keep-even',
  'head',
  'tail',
  'duplicate-each',
  'swap-pairs',
  'move-matching-to-top',
  'remove-prefix',
  'remove-suffix',
  'interleave-halves',
  'remove-comment-lines',
  'extract-between-markers',
  'extract-longest',
  'extract-shortest',
];
