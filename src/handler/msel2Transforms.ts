/**
 * Pure (vscode-independent) implementations of the LINEX-015..023 selection commands (the
 * selection part of the group LINE2 of SELEC-00091) and their command table
 * `MSEL2_COMMAND_ENTRIES`, which the MSEL handler (`mselCommandHandler.ts`) runs together with
 * `MSEL_COMMAND_ENTRIES` (same context, results, limits and `needsTwo` rule).
 *
 * - select-emails / ips / hex-colors / uuids / dates search the non-empty selections; only when
 *   every selection is empty (cursors) do they search the whole document (`searchTargets`). A
 *   match must lie entirely inside one searched range. At most `MSEL_MAX_SELECTIONS` selections
 *   are made. Every search is fixed and runs in linear time: the e-mail addresses are found by a
 *   scanner (the `extract.email` regular expression is quadratic on long runs of address
 *   characters); the other regular expressions have no nested or overlapping quantifiers (the
 *   only unbounded ones, `[0-9A-Fa-f:.]+` of the IPv6 candidates and `\d+` of the fraction of a
 *   second, repeat one character class and are followed by a fixed-width check); IPv6 candidates
 *   are checked by a function, and the IPv4 / IPv6 overlap is found by one merge pass.
 * - expand-to-sentence / expand-to-paragraph use the blank lines (`isBlankLine` of
 *   `lineTransforms.ts`) as paragraph boundaries; the start and the end of a selection are
 *   expanded independently (as `expandToWord`), and overlapping results are merged.
 * - join-into-first accepts an empty delimiter (`validateJoinDelimiterInput`), unlike the
 *   delimiters of MSEL-016 / 017 / 021.
 *
 * Only local processing: no network, files or processes, no evaluation of code, no new dependency.
 */
import { MAX_OUTPUT_LENGTH } from './encodeTransforms';
import { formatNumber, isBlankLine, LINE_JOIN_DELIMITER_MAX_LENGTH, validateLineDelimiterInput } from './lineTransforms';
import {
  MselCommandEntry,
  MselEdit,
  MselInputError,
  MselInputStep,
  MselLines,
  MselRange,
  MselResult,
  needTwo,
  RangeCollector,
  selectOrUnchanged,
  textOf,
} from './mselTransforms';

// ---------------------------------------------------------------------------
// Searching (LINEX-015..019)
// ---------------------------------------------------------------------------

/**
 * The ranges the select-* commands search: the non-empty selections when there is at least one
 * (cursors among them are ignored), otherwise (only cursors) the whole document.
 */
export const searchTargets = (text: string, ranges: readonly MselRange[]): MselRange[] => {
  const nonEmpty = ranges.filter((range) => range.end > range.start);
  return nonEmpty.length > 0 ? nonEmpty.map(({ start, end }) => ({ start, end })) : [{ start: 0, end: text.length }];
};

/** Finds `[start, end)` offsets in a text (relative to it). */
export type Msel2Finder = (value: string) => [number, number][];

/**
 * Selects what `find` returns inside every searched range. Warns (and changes nothing) when there
 * is nothing; throws `MselTooManySelectionsError` above `MSEL_MAX_SELECTIONS`.
 */
const selectFound = (text: string, ranges: readonly MselRange[], find: Msel2Finder, what: string): MselResult => {
  const targets = searchTargets(text, ranges);
  const wholeDocument = !ranges.some((range) => range.end > range.start);
  const collector = new RangeCollector();
  for (const target of targets) {
    for (const [start, end] of find(textOf(text, target))) {
      collector.push(target.start + start, target.start + end);
    }
  }
  if (collector.ranges.length === 0) {
    return { kind: 'warn', message: `No ${what} were found in the ${wholeDocument ? 'document' : 'selections'}.` };
  }
  return selectOrUnchanged(ranges, collector.ranges);
};

const isAsciiAlnum = (code: number): boolean =>
  (code >= 0x30 && code <= 0x39) || (code >= 0x41 && code <= 0x5a) || (code >= 0x61 && code <= 0x7a);
const isAsciiLetter = (code: number): boolean => (code >= 0x41 && code <= 0x5a) || (code >= 0x61 && code <= 0x7a);
const isHexDigit = (code: number): boolean =>
  (code >= 0x30 && code <= 0x39) || (code >= 0x41 && code <= 0x46) || (code >= 0x61 && code <= 0x66);

/** `[a-zA-Z0-9._%+-]`: the local part of `extract.email`. */
const isLocalChar = (code: number): boolean =>
  isAsciiAlnum(code) || code === 0x2e || code === 0x5f || code === 0x25 || code === 0x2b || code === 0x2d;
/** `[a-zA-Z0-9.-]`: the domain part of `extract.email`. */
const isDomainChar = (code: number): boolean => isAsciiAlnum(code) || code === 0x2e || code === 0x2d;

/**
 * LINEX-015: the matches of the `extract.email` pattern
 * `/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g` (the same results, in the same order),
 * found in linear time: the local part is the run of local characters before an `@`, the domain
 * runs to the last `.` of the domain characters that is followed by two letters, and the match
 * ends after the letters there. Each character is looked at a bounded number of times.
 */
export const findEmails: Msel2Finder = (value) => {
  const found: [number, number][] = [];
  let position = 0;
  while (position < value.length) {
    // The next run of local characters from `position`.
    let start = position;
    while (start < value.length && !isLocalChar(value.charCodeAt(start))) {
      start++;
    }
    let at = start;
    while (at < value.length && isLocalChar(value.charCodeAt(at))) {
      at++;
    }
    if (at >= value.length) {
      break;
    }
    if (at === start || value.charCodeAt(at) !== 0x40) {
      // The run is not followed by `@` (or there is no run): no match starts in it.
      position = at === start ? at + 1 : at;
      continue;
    }
    // The domain characters after the `@`.
    let domainEnd = at + 1;
    while (domainEnd < value.length && isDomainChar(value.charCodeAt(domainEnd))) {
      domainEnd++;
    }
    // The greedy domain part backtracks to the last `.` (with at least one character before it)
    // that is followed by two letters.
    let dot = -1;
    for (let i = domainEnd - 3; i > at + 1; i--) {
      if (value.charCodeAt(i) === 0x2e && isAsciiLetter(value.charCodeAt(i + 1)) && isAsciiLetter(value.charCodeAt(i + 2))) {
        dot = i;
        break;
      }
    }
    if (dot === -1) {
      // No match starts in this run; the domain characters may start the next run.
      position = at + 1;
      continue;
    }
    let end = dot + 1;
    while (end < value.length && isAsciiLetter(value.charCodeAt(end))) {
      end++;
    }
    found.push([start, end]);
    position = end;
  }
  return found;
};

const IPV4 = /\b(?:\d{1,3}\.){3}\d{1,3}\b/g;
const IPV6_CANDIDATE = /[0-9A-Fa-f:.]+/g;

/** Four dot-separated decimal numbers (1 to 3 digits) from 0 to 255. */
const isValidIPv4 = (value: string): boolean => {
  const parts = value.split('.');
  return parts.length === 4 && parts.every((part) => part.length >= 1 && part.length <= 3
    && [...part].every((char) => char >= '0' && char <= '9') && Number(part) <= 255);
};

/**
 * An IPv6 address without a zone ID: eight groups of 1 to 4 hex digits, at most one `::` for one
 * or more zero groups, and optionally an IPv4 address as the last 32 bits. No regular expression.
 */
export const isValidIPv6 = (value: string): boolean => {
  if (value.length < 2 || value.length > 45) {
    return false;
  }
  const doubleColon = value.indexOf('::');
  if (doubleColon !== -1 && value.indexOf('::', doubleColon + 1) !== -1) {
    return false;
  }
  const groupsOf = (part: string): string[] | undefined => {
    if (part === '') {
      return [];
    }
    const groups = part.split(':');
    return groups.some((group) => group === '') ? undefined : groups;
  };
  const head = doubleColon === -1 ? groupsOf(value) : groupsOf(value.slice(0, doubleColon));
  const tail = doubleColon === -1 ? [] : groupsOf(value.slice(doubleColon + 2));
  if (head === undefined || tail === undefined) {
    return false;
  }
  const groups = [...head, ...tail];
  let count = 0;
  for (const [i, group] of groups.entries()) {
    if (group.includes('.')) {
      // An embedded IPv4 address must be the last group.
      if (i !== groups.length - 1 || !isValidIPv4(group)) {
        return false;
      }
      count += 2;
      continue;
    }
    if (group.length > 4 || ![...group].every((char) => isHexDigit(char.charCodeAt(0)))) {
      return false;
    }
    count++;
  }
  return doubleColon === -1 ? count === 8 : count <= 7;
};

const isWordCode = (code: number): boolean => isAsciiAlnum(code) || code === 0x5f;

/**
 * LINEX-016: IPv6 addresses (candidates `[0-9A-Fa-f:.]+` without trailing dots, and without one
 * leading `:` that is not part of `::`, not touching a letter, digit or `_`, containing a `:` and
 * a hex digit, valid by `isValidIPv6`), then IPv4 addresses (the `extract.ip` pattern with every
 * number at most 255) that do not overlap an IPv6 address, in document order.
 */
export const findIps: Msel2Finder = (value) => {
  const ipv6: [number, number][] = [];
  for (const match of value.matchAll(IPV6_CANDIDATE)) {
    let start = match.index!;
    let end = start + match[0].length;
    while (end > start && value.charCodeAt(end - 1) === 0x2e) {
      end--;
    }
    // `addr:fe80::1`: the `:` after a word is a separator, not part of the address.
    if (end - start > 1 && value.charCodeAt(start) === 0x3a && value.charCodeAt(start + 1) !== 0x3a) {
      start++;
    }
    const candidate = value.slice(start, end);
    if (!candidate.includes(':') || ![...candidate].some((char) => isHexDigit(char.charCodeAt(0)))) {
      continue;
    }
    if ((start > 0 && isWordCode(value.charCodeAt(start - 1))) || (end < value.length && isWordCode(value.charCodeAt(end)))) {
      continue;
    }
    if (isValidIPv6(candidate)) {
      ipv6.push([start, end]);
    }
  }
  // Both lists are in ascending order of their (non-overlapping) ranges, so one merge pass finds
  // the overlaps and builds the result in document order (linear, not IPv4 × IPv6 comparisons).
  const found: [number, number][] = [];
  let next = 0;
  for (const match of value.matchAll(IPV4)) {
    const start = match.index!;
    const end = start + match[0].length;
    // IPv6 addresses that end at or before this IPv4 address cannot overlap it or a later one.
    while (next < ipv6.length && ipv6[next][1] <= start) {
      found.push(ipv6[next]);
      next++;
    }
    const overlapsIPv6 = next < ipv6.length && ipv6[next][0] < end;
    if (!overlapsIPv6 && isValidIPv4(match[0])) {
      found.push([start, end]);
    }
  }
  for (; next < ipv6.length; next++) {
    found.push(ipv6[next]);
  }
  return found;
};

/** `#rgb`, `#rrggbb` or `#rrggbbaa` not followed by a letter or digit. */
const HEX_COLOR = /#(?:[0-9A-Fa-f]{8}|[0-9A-Fa-f]{6}|[0-9A-Fa-f]{3})(?![0-9A-Za-z])/g;
/** 8-4-4-4-12 hex digits, not touching a letter or digit. */
const UUID = /(?<![0-9A-Za-z])[0-9A-Fa-f]{8}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{12}(?![0-9A-Za-z])/g;
/**
 * `YYYY-MM-DD`, optionally followed by `T` or a space, `HH:MM[:SS[.fraction]]` and `Z` / `±HH[:]MM`,
 * not touching a letter or digit. The fraction takes any number of digits, so a long fraction is
 * selected whole instead of the time being cut after the seconds. The numbers are checked by `isValidDate` / `isValidTime`.
 */
const ISO_DATE = /(?<![0-9A-Za-z])(\d{4})-(\d{2})-(\d{2})(?:([T ])(\d{2}):(\d{2})(?::(\d{2})(?:\.\d+)?)?(Z|[+-]\d{2}:?\d{2})?)?(?![0-9A-Za-z])/g;

const findAll = (pattern: RegExp): Msel2Finder => (value) =>
  [...value.matchAll(pattern)].map((match) => [match.index!, match.index! + match[0].length]);

/** LINEX-017. */
export const findHexColors: Msel2Finder = findAll(HEX_COLOR);
/** LINEX-018. */
export const findUuids: Msel2Finder = findAll(UUID);

const isLeapYear = (year: number): boolean => (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
const DAYS_IN_MONTH = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];

/** A day of the Gregorian calendar (month 1 to 12, the day within the month, leap years). */
export const isValidDate = (year: number, month: number, day: number): boolean => {
  if (month < 1 || month > 12 || day < 1) {
    return false;
  }
  const days = month === 2 && isLeapYear(year) ? 29 : DAYS_IN_MONTH[month - 1];
  return day <= days;
};

const isValidTime = (hour: string, minute: string, second: string | undefined, zone: string | undefined): boolean => {
  if (Number(hour) > 23 || Number(minute) > 59 || (second !== undefined && Number(second) > 59)) {
    return false;
  }
  if (zone === undefined || zone === 'Z') {
    return true;
  }
  const digits = zone.slice(1).replace(':', '');
  return Number(digits.slice(0, 2)) <= 23 && Number(digits.slice(2)) <= 59;
};

/**
 * LINEX-019: valid ISO dates (with an optional time). A date whose time part is not valid is
 * still selected without the time when a space separates them (`2026-10-01 25:00` → the date).
 */
export const findDates: Msel2Finder = (value) => {
  const found: [number, number][] = [];
  for (const match of value.matchAll(ISO_DATE)) {
    const [whole, year, month, day, separator, hour, minute, second, zone] = match;
    const start = match.index!;
    if (!isValidDate(Number(year), Number(month), Number(day))) {
      continue;
    }
    if (separator === undefined || isValidTime(hour, minute, second, zone)) {
      found.push([start, start + whole.length]);
    } else if (separator === ' ') {
      found.push([start, start + 10]);
    }
  }
  return found;
};

export const selectEmails = (text: string, ranges: readonly MselRange[]): MselResult =>
  selectFound(text, ranges, findEmails, 'email addresses');
export const selectIps = (text: string, ranges: readonly MselRange[]): MselResult =>
  selectFound(text, ranges, findIps, 'IP addresses');
export const selectHexColors = (text: string, ranges: readonly MselRange[]): MselResult =>
  selectFound(text, ranges, findHexColors, 'hex colors');
export const selectUuids = (text: string, ranges: readonly MselRange[]): MselResult =>
  selectFound(text, ranges, findUuids, 'UUIDs');
export const selectDates = (text: string, ranges: readonly MselRange[]): MselResult =>
  selectFound(text, ranges, findDates, 'ISO dates');

// ---------------------------------------------------------------------------
// Expanding (LINEX-020 / 021)
// ---------------------------------------------------------------------------

/**
 * The paragraphs of a document (runs of lines that are not blank), computed lazily and cached
 * so that many cursors in one paragraph read it once.
 */
class Paragraphs {
  private readonly lines: MselLines;
  private readonly blank = new Map<number, boolean>();
  private readonly byLine = new Map<number, [number, number]>();

  constructor(private readonly text: string) {
    this.lines = new MselLines(text);
  }

  private isBlank(line: number): boolean {
    let value = this.blank.get(line);
    if (value === undefined) {
      value = isBlankLine(this.text.slice(this.lines.start(line), this.lines.contentEnd(line)));
      this.blank.set(line, value);
    }
    return value;
  }

  /** The paragraph containing the line of `offset` as `[start, end]` offsets, or undefined on a blank line. */
  at(offset: number): [number, number] | undefined {
    const line = this.lines.lineOf(offset);
    if (this.isBlank(line)) {
      return undefined;
    }
    const cached = this.byLine.get(line);
    if (cached !== undefined) {
      return cached;
    }
    let first = line;
    while (first > 0 && !this.isBlank(first - 1)) {
      first--;
    }
    let last = line;
    while (last + 1 < this.lines.count && !this.isBlank(last + 1)) {
      last++;
    }
    const paragraph: [number, number] = [this.lines.start(first), this.lines.contentEnd(last)];
    for (let i = first; i <= last; i++) {
      this.byLine.set(i, paragraph);
    }
    return paragraph;
  }
}

/** Merges ranges that share at least one character (or are the same); the input is sorted. */
const mergeOverlapping = (ranges: MselRange[]): MselRange[] => {
  const merged: MselRange[] = [];
  for (const range of ranges) {
    const previous = merged[merged.length - 1];
    if (previous !== undefined && (range.start < previous.end || (range.start === previous.start && range.end === previous.end))) {
      previous.end = Math.max(previous.end, range.end);
      continue;
    }
    merged.push({ ...range });
  }
  return merged;
};

/** The units (paragraphs or sentences) around offsets; `[start, end]` or undefined. */
interface UnitIndex {
  /** The unit a cursor at `offset` is in. */
  around(offset: number): [number, number] | undefined;
  /** The unit containing the character at `offset` (start < unit end) for the start of a selection. */
  startingAt(offset: number): [number, number] | undefined;
  /** The unit containing the character before `offset` (unit start < end) for the end of a selection. */
  endingAt(offset: number): [number, number] | undefined;
}

/**
 * Expands every cursor to its unit and the start / end of every selection to the start / end of
 * the unit it is in (independently, as `expandToWord`); an end that is not in a unit stays.
 * Overlapping results are merged.
 */
const expandWith = (ranges: readonly MselRange[], units: UnitIndex): MselResult => {
  const expanded = ranges.map((range): MselRange => {
    if (range.start === range.end) {
      const unit = units.around(range.start);
      return unit === undefined ? { ...range } : { start: unit[0], end: unit[1], reversed: range.reversed };
    }
    const startUnit = units.startingAt(range.start);
    const endUnit = units.endingAt(range.end);
    return {
      start: startUnit === undefined ? range.start : Math.min(range.start, startUnit[0]),
      end: endUnit === undefined ? range.end : Math.max(range.end, endUnit[1]),
      reversed: range.reversed,
    };
  });
  const sorted = expanded.sort((a, b) => a.start - b.start || a.end - b.end);
  return selectOrUnchanged(ranges, mergeOverlapping(sorted));
};

/** LINEX-021: expands to the paragraphs (blank lines separate them). */
export const expandToParagraph = (text: string, ranges: readonly MselRange[]): MselResult => {
  const paragraphs = new Paragraphs(text);
  return expandWith(ranges, {
    around: (offset) => paragraphs.at(offset),
    startingAt: (offset) => {
      const paragraph = paragraphs.at(offset);
      return paragraph !== undefined && paragraph[1] > offset ? paragraph : undefined;
    },
    endingAt: (offset) => {
      const paragraph = paragraphs.at(offset);
      return paragraph !== undefined && paragraph[0] < offset ? paragraph : undefined;
    },
  });
};

const ASCII_TERMINATORS = new Set(['.', '!', '?']);
const FULL_WIDTH_TERMINATORS = new Set(['。', '！', '？']);
const isSpaceChar = (char: string): boolean => /^\s$/.test(char);

/**
 * The sentences of a paragraph as `[start, end]` offsets relative to it, without surrounding
 * whitespace: a sentence ends after `.`, `!` or `?` followed by whitespace (a line break too) or
 * the end of the paragraph, after `。`, `！` or `？`, or at the end of the paragraph.
 */
export const sentencesOf = (paragraph: string): [number, number][] => {
  const sentences: [number, number][] = [];
  let start = -1;
  for (let i = 0; i < paragraph.length; i++) {
    const char = paragraph[i];
    if (start === -1) {
      if (isSpaceChar(char)) {
        continue;
      }
      start = i;
    }
    const ends = FULL_WIDTH_TERMINATORS.has(char)
      || (ASCII_TERMINATORS.has(char) && (i + 1 === paragraph.length || isSpaceChar(paragraph[i + 1])));
    if (ends) {
      sentences.push([start, i + 1]);
      start = -1;
    }
  }
  if (start !== -1) {
    let end = paragraph.length;
    while (end > start && isSpaceChar(paragraph[end - 1])) {
      end--;
    }
    sentences.push([start, end]);
  }
  return sentences;
};

/**
 * LINEX-020: expands to the sentences. The search never leaves the paragraph (blank lines stop
 * it), and every paragraph is split into sentences once.
 */
export const expandToSentence = (text: string, ranges: readonly MselRange[]): MselResult => {
  const paragraphs = new Paragraphs(text);
  const cache = new Map<number, [number, number][]>();
  /** The sentences (absolute offsets) of the paragraph of `offset`. */
  const sentencesAt = (offset: number): [number, number][] => {
    const paragraph = paragraphs.at(offset);
    if (paragraph === undefined) {
      return [];
    }
    let sentences = cache.get(paragraph[0]);
    if (sentences === undefined) {
      sentences = sentencesOf(text.slice(paragraph[0], paragraph[1])).map(([s, e]) => [paragraph[0] + s, paragraph[0] + e]);
      cache.set(paragraph[0], sentences);
    }
    return sentences;
  };
  /** The first sentence whose end is at or after `offset` (binary search). */
  const firstEndingFrom = (sentences: [number, number][], offset: number): number => {
    let low = 0;
    let high = sentences.length;
    while (low < high) {
      const middle = (low + high) >> 1;
      if (sentences[middle][1] < offset) {
        low = middle + 1;
      } else {
        high = middle;
      }
    }
    return low;
  };
  return expandWith(ranges, {
    around: (offset) => {
      // The sentence the cursor is in or right after; in the space between two sentences, the next one.
      const sentences = sentencesAt(offset);
      const index = firstEndingFrom(sentences, offset);
      return sentences[index] ?? sentences[sentences.length - 1];
    },
    startingAt: (offset) => {
      const sentences = sentencesAt(offset);
      const index = firstEndingFrom(sentences, offset + 1);
      const sentence = sentences[index];
      return sentence !== undefined && sentence[0] <= offset ? sentence : undefined;
    },
    endingAt: (offset) => {
      const sentences = sentencesAt(offset);
      const index = firstEndingFrom(sentences, offset);
      const sentence = sentences[index];
      return sentence !== undefined && sentence[0] < offset ? sentence : undefined;
    },
  });
};

// ---------------------------------------------------------------------------
// LINEX-022 / 023
// ---------------------------------------------------------------------------

export const MSEL2_NO_DUPLICATES = 'No two selections have the same text; the selections were not changed.';

/** LINEX-022: keeps the selections whose text (case-sensitive) is the text of another selection too. */
export const keepDuplicateText = (text: string, ranges: readonly MselRange[]): MselResult => {
  const tooFew = needTwo(ranges);
  if (tooFew) {
    return tooFew;
  }
  const counts = new Map<string, number>();
  for (const range of ranges) {
    const value = textOf(text, range);
    counts.set(value, (counts.get(value) ?? 0) + 1);
  }
  const kept = ranges.filter((range) => (counts.get(textOf(text, range)) ?? 0) >= 2);
  if (kept.length === 0) {
    return { kind: 'info', message: MSEL2_NO_DUPLICATES };
  }
  return kept.length === ranges.length ? { kind: 'unchanged' } : { kind: 'select', ranges: kept };
};

/**
 * Delimiter of LINEX-023: 0 to 100 characters without line breaks. Unlike the delimiter of
 * MSEL-016 / 017 / 021 (`validateMselDelimiterInput`), an empty delimiter is accepted (the texts
 * are then joined without a separator). Used by the input box and again by `joinIntoFirst`.
 */
export const validateJoinDelimiterInput = (value: string): string | undefined => validateLineDelimiterInput(value);

/** LINEX-023: the default delimiter. */
export const MSEL2_JOIN_DEFAULT_DELIMITER = ', ';

/**
 * LINEX-023: joins the texts of all selections (document order) with `delimiter` into the first
 * selection and deletes the texts of the others, in one edit; the joined text is then the only
 * selection.
 */
export const joinIntoFirst = (text: string, ranges: readonly MselRange[], delimiter: string): MselResult => {
  const problem = validateJoinDelimiterInput(delimiter);
  if (problem !== undefined) {
    throw new MselInputError(problem);
  }
  const tooFew = needTwo(ranges);
  if (tooFew) {
    return tooFew;
  }
  const texts = ranges.map((range) => textOf(text, range));
  const total = texts.reduce((sum, value) => sum + value.length, 0) + (texts.length - 1) * delimiter.length;
  if (total > MAX_OUTPUT_LENGTH) {
    return { kind: 'warn', message: `The text was not changed: the result would be longer than ${formatNumber(MAX_OUTPUT_LENGTH)} characters. Select less text.` };
  }
  const joined = texts.join(delimiter);
  const first = ranges[0];
  const edits: MselEdit[] = [{ start: first.start, end: first.end, text: joined }];
  ranges.slice(1).forEach((range) => {
    if (range.end > range.start) {
      edits.push({ start: range.start, end: range.end, text: '' });
    }
  });
  if (edits.length === 1 && joined === texts[0]) {
    // Nothing to write (the other selections are empty and the delimiter is empty): only the
    // selections change.
    return { kind: 'select', ranges: [{ start: first.start, end: first.end }] };
  }
  return { kind: 'edit', edits, ranges: [{ start: first.start, end: first.start + joined.length }] };
};

// ---------------------------------------------------------------------------
// Command table
// ---------------------------------------------------------------------------

const joinDelimiterStep: MselInputStep = {
  prompt: `Delimiter (literal text, 0 to ${formatNumber(LINE_JOIN_DELIMITER_MAX_LENGTH)} characters, empty joins without a separator)`,
  value: MSEL2_JOIN_DEFAULT_DELIMITER,
  validate: validateJoinDelimiterInput,
};

export const MSEL2_COMMAND_ENTRIES: readonly MselCommandEntry[] = [
  {
    id: 'LINEX-015', name: 'selection.select-emails', title: 'Selection - Select All Email Addresses', when: 'always',
    run: ({ text, ranges }) => selectEmails(text, ranges),
  },
  {
    id: 'LINEX-016', name: 'selection.select-ips', title: 'Selection - Select All IP Addresses', when: 'always',
    run: ({ text, ranges }) => selectIps(text, ranges),
  },
  {
    id: 'LINEX-017', name: 'selection.select-hex-colors', title: 'Selection - Select All Hex Colors', when: 'always',
    run: ({ text, ranges }) => selectHexColors(text, ranges),
  },
  {
    id: 'LINEX-018', name: 'selection.select-uuids', title: 'Selection - Select All UUIDs', when: 'always',
    run: ({ text, ranges }) => selectUuids(text, ranges),
  },
  {
    id: 'LINEX-019', name: 'selection.select-dates', title: 'Selection - Select All ISO Dates', when: 'always',
    run: ({ text, ranges }) => selectDates(text, ranges),
  },
  {
    id: 'LINEX-020', name: 'selection.expand-to-sentence', title: 'Selection - Expand to Sentence', when: 'always',
    run: ({ text, ranges }) => expandToSentence(text, ranges),
  },
  {
    id: 'LINEX-021', name: 'selection.expand-to-paragraph', title: 'Selection - Expand to Paragraph', when: 'always',
    run: ({ text, ranges }) => expandToParagraph(text, ranges),
  },
  {
    id: 'LINEX-022', name: 'selection.keep-duplicate-text', title: 'Selection - Keep Only Duplicate Texts', when: 'multi', needsTwo: true,
    run: ({ text, ranges }) => keepDuplicateText(text, ranges),
  },
  {
    id: 'LINEX-023', name: 'selection.join-into-first', title: 'Selection - Join All Selections into First', when: 'multi', needsTwo: true, edits: true,
    inputs: [joinDelimiterStep],
    run: ({ text, ranges, inputs }) => joinIntoFirst(text, ranges, inputs[0]),
  },
];
