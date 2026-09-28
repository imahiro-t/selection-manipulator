/**
 * Pure sort functions of SORT-001..SORT-030 (no VS Code API, so they can be unit tested).
 *
 * Everything is built on JavaScript built-ins (`Intl.Collator`, `BigInt`,
 * `String.prototype.normalize`); no dependency is added. The keys of dates, IP addresses,
 * semantic versions, hex numbers and numeric cells are read with fixed linear regular
 * expressions or hand-written parsers; user input is never turned into a regular expression
 * here (SORT-010's pattern runs in the worker of `lineRegex.ts`, which hands over the keys).
 */
import { formatNumber } from './lineTransforms';

/** Keys of the line sorts (SORT-001..SORT-021 and their clipboard versions). */
export type SortLineCommand =
  | 'natural'
  | 'ignore-case'
  | 'locale'
  | 'japanese'
  | 'column'
  | 'regex-key'
  | 'date'
  | 'semver'
  | 'ip'
  | 'word-count'
  | 'last-word'
  | 'suffix'
  | 'unique'
  | 'paragraph'
  | 'indent-block'
  | 'hex';

/** Keys of the selection sorts (SORT-022..SORT-025 and SORT-030). */
export type SortSelectionCommand = 'natural' | 'ignore-case' | 'length';

export interface SortOptions {
  /** SORT-005 / 006: the BCP 47 locale the user entered (validated by `validateSortLocaleInput`). */
  locale?: string;
  /** SORT-008 / 009 / 028: the literal delimiter (after `parseSortDelimiter`). */
  delimiter?: string;
  /** SORT-008 / 009 / 028: the 1-based column number. */
  column?: number;
  /**
   * SORT-010: the key of every line, extracted in the regex worker (aligned with the lines;
   * `null` when the line does not match or group 1 did not participate).
   */
  regexKeys?: (string | null)[];
}

// ---------------------------------------------------------------------------
// Limits and input validation
// ---------------------------------------------------------------------------

export const SORT_LOCALE_MAX_LENGTH = 64;
export const SORT_DELIMITER_MAX_LENGTH = 100;
export const SORT_COLUMN_MIN = 1;
export const SORT_COLUMN_MAX = 1000;

const hasLineBreak = (value: string): boolean => value.includes('\n') || value.includes('\r');

/** Locale of SORT-005 / 006: a well-formed BCP 47 tag the runtime's `Intl.Collator` supports. */
export const validateSortLocaleInput = (value: string): string | undefined => {
  const locale = value.trim();
  if (locale.length === 0) {
    return 'Enter a locale (e.g. en, fr, ja)';
  }
  if (locale.length > SORT_LOCALE_MAX_LENGTH) {
    return `The locale must be at most ${formatNumber(SORT_LOCALE_MAX_LENGTH)} characters`;
  }
  let supported: string[];
  try {
    // Both throw a RangeError for a tag that is not well-formed BCP 47.
    new Intl.Locale(locale);
    supported = Intl.Collator.supportedLocalesOf(locale);
  } catch {
    return `Invalid locale: ${locale}`;
  }
  return supported.length === 0 ? `Unsupported locale: ${locale}` : undefined;
};

/** Delimiter of SORT-008 / 009 / 028: 1 to 100 characters without line breaks (`\t` means a tab). */
export const validateSortDelimiterInput = (value: string): string | undefined => {
  if (value.length === 0) {
    return 'Enter a delimiter (\\t for a tab)';
  }
  if (value.length > SORT_DELIMITER_MAX_LENGTH) {
    return `The delimiter must be at most ${formatNumber(SORT_DELIMITER_MAX_LENGTH)} characters`;
  }
  if (hasLineBreak(value)) {
    return 'The delimiter must not contain line breaks';
  }
  return undefined;
};

/** The delimiter as typed, except that the two characters `\t` stand for a tab. */
export const parseSortDelimiter = (value: string): string => (value === '\\t' ? '\t' : value);

/** Column number of SORT-008 / 009 / 028: an integer from 1 to 1,000. */
export const validateSortColumnInput = (value: string): string | undefined => {
  const trimmed = value.trim();
  const message = `Enter an integer from ${formatNumber(SORT_COLUMN_MIN)} to ${formatNumber(SORT_COLUMN_MAX)}`;
  if (!/^[0-9]{1,7}$/.test(trimmed)) {
    return message;
  }
  const n = Number(trimmed);
  return n < SORT_COLUMN_MIN || n > SORT_COLUMN_MAX ? message : undefined;
};

// ---------------------------------------------------------------------------
// Comparators and the stable sort
// ---------------------------------------------------------------------------

/** Plain string order (like the existing `localeCompare` sort), fixed to `en` for reproducibility. */
const stringCollator = new Intl.Collator('en');
/** Natural order: digit runs compare as numbers (`file2` < `file10`). */
const naturalCollator = new Intl.Collator('en', { numeric: true });
/** Letters that differ only in case are equal (the stable sort keeps their original order). */
const ignoreCaseCollator = new Intl.Collator('en', { sensitivity: 'accent' });
const japaneseCollator = new Intl.Collator('ja');

type Compare<K> = (a: K, b: K) => number;

const compareNumbers: Compare<number> = (a, b) => (a < b ? -1 : a > b ? 1 : 0);
const compareBigInts: Compare<bigint> = (a, b) => (a < b ? -1 : a > b ? 1 : 0);

/**
 * Stable sort by key: items with equal keys keep their original order, the descending order
 * flips the comparison (not the result), and items without a key (`undefined`) are put last in
 * their original order in both directions.
 */
export const stableSortBy = <T, K>(
  items: T[],
  key: (item: T, index: number) => K | undefined,
  compare: Compare<K>,
  descending: boolean
): T[] => {
  const keyed: { item: T; key: K; index: number }[] = [];
  const missing: T[] = [];
  items.forEach((item, index) => {
    const k = key(item, index);
    if (k === undefined) {
      missing.push(item);
    } else {
      keyed.push({ item, key: k, index });
    }
  });
  const sign = descending ? -1 : 1;
  keyed.sort((a, b) => sign * compare(a.key, b.key) || a.index - b.index);
  return [...keyed.map((entry) => entry.item), ...missing];
};

// ---------------------------------------------------------------------------
// Keys
// ---------------------------------------------------------------------------

/**
 * Whether a cell / capture is a decimal number. The pattern has no overlapping quantifiers
 * (after `\d+` only `.`, `e` or the end can follow), so it fails in linear time even on a very
 * long run of digits followed by a non-digit; cells and captures have no size limit.
 */
const NUMERIC_KEY = /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?$/;

export const isNumericKey = (key: string): boolean => NUMERIC_KEY.test(key) && Number.isFinite(Number(key));

/** A SORT-008 / 009 / 010 key, classified once per line (not once per comparison). */
export type CellKey = { numeric: true; value: number } | { numeric: false; text: string };

/** Classifies a cell / capture as a number or text; undefined (no key) stays undefined. */
export const toCellKey = (key: string | null | undefined): CellKey | undefined => {
  if (key === undefined || key === null) {
    return undefined;
  }
  return isNumericKey(key) ? { numeric: true, value: Number(key) } : { numeric: false, text: key };
};

/**
 * Order of SORT-008 / 009 / 010 keys: numbers (by value) before other text (natural order).
 * Keeping the two groups apart makes the order consistent (transitive) when a column mixes
 * numbers and text.
 */
export const compareCellKeys: Compare<CellKey> = (a, b) => {
  if (a.numeric && b.numeric) {
    return compareNumbers(a.value, b.value);
  }
  if (!a.numeric && !b.numeric) {
    return naturalCollator.compare(a.text, b.text);
  }
  return a.numeric ? -1 : 1;
};

/** SORT-007: half-width kana to full-width (NFKC), then katakana to hiragana. */
export const kanaKey = (line: string): string =>
  line.normalize('NFKC').replace(/[ァ-ヶ]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0x60));

/** SORT-008: the trimmed cell, or undefined when the line has fewer columns. */
export const columnKey = (line: string, delimiter: string, column: number): string | undefined => {
  const cell = line.split(delimiter)[column - 1];
  return cell === undefined ? undefined : cell.trim();
};

const isLeapYear = (year: number): boolean => (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;

const daysInMonth = (year: number, month: number): number =>
  [31, isLeapYear(year) ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][month - 1];

/**
 * First year-first date of a line (`YYYY-MM-DD`, `YYYY/MM/DD`, `YYYY.MM.DD`), optionally with a
 * time (`T` or a space, `HH:MM[:SS[.fraction]]`) and a time zone (`Z`, `±HH:MM`, `±HHMM`).
 * The fraction takes every digit (only the first three count) so that a zone after a long
 * fraction is still read. Nothing after `\d+` can match a digit except the zone's own `[+-]`
 * prefix, so backtracking stays linear in the length of the line.
 */
const DATE_PATTERN =
  /(?<!\d)(\d{4})([-/.])(\d{2})\2(\d{2})(?!\d)(?:[T ](\d{2}):(\d{2})(?::(\d{2})(?:\.(\d+))?)?(Z|[+-]\d{2}:?\d{2})?(?!\d))?/;

/**
 * SORT-011 / 012: the first date of the line as epoch milliseconds (a date without a time zone
 * is taken as UTC, so the result does not depend on the host). Returns undefined when the line
 * has no date or its first date is invalid (e.g. `2026-02-30`, `25:00`).
 */
export const parseDateKey = (line: string): number | undefined => {
  const match = DATE_PATTERN.exec(line);
  if (!match) {
    return undefined;
  }
  const [, y, , mo, d, h, mi, s, fraction, zone] = match;
  const year = Number(y);
  const month = Number(mo);
  const day = Number(d);
  const hours = h === undefined ? 0 : Number(h);
  const minutes = mi === undefined ? 0 : Number(mi);
  const seconds = s === undefined ? 0 : Number(s);
  const millis = fraction === undefined ? 0 : Number(fraction.slice(0, 3).padEnd(3, '0'));
  if (month < 1 || month > 12 || day < 1 || day > daysInMonth(year, month)
    || hours > 23 || minutes > 59 || seconds > 59) {
    return undefined;
  }
  let offsetMinutes = 0;
  if (zone !== undefined && zone !== 'Z') {
    const digits = zone.slice(1).replace(':', '');
    const zoneHours = Number(digits.slice(0, 2));
    const zoneMinutes = Number(digits.slice(2));
    if (zoneHours > 23 || zoneMinutes > 59) {
      return undefined;
    }
    offsetMinutes = (zone.startsWith('-') ? -1 : 1) * (zoneHours * 60 + zoneMinutes);
  }
  // setUTCFullYear keeps years 0-99 as they are (Date.UTC would map them to 1900-1999).
  const date = new Date(0);
  date.setUTCFullYear(year, month - 1, day);
  date.setUTCHours(hours, minutes, seconds, millis);
  return date.getTime() - offsetMinutes * 60_000;
};

export interface SemverKey {
  /** MAJOR / MINOR / PATCH as decimal strings without leading zeros (any size). */
  core: [string, string, string];
  /** Pre-release identifiers (empty when there is none). */
  pre: string[];
}

const NUMERIC_IDENTIFIER = /^(?:0|[1-9][0-9]*)$/;
const DIGITS = /^[0-9]+$/;
const IDENTIFIER = /^[0-9A-Za-z-]+$/;

/**
 * SORT-013 / 029: parses `MAJOR.MINOR.PATCH[-pre][+build]` (SemVer 2.0.0, an optional leading
 * `v` / `V`) of the trimmed line. Returns undefined when the line is not a semantic version.
 */
export const parseSemver = (line: string): SemverKey | undefined => {
  let text = line.trim();
  if (text.startsWith('v') || text.startsWith('V')) {
    text = text.slice(1);
  }
  const plus = text.indexOf('+');
  if (plus >= 0) {
    const build = text.slice(plus + 1).split('.');
    if (!build.every((identifier) => IDENTIFIER.test(identifier))) {
      return undefined;
    }
    text = text.slice(0, plus);
  }
  const dash = text.indexOf('-');
  const core = (dash >= 0 ? text.slice(0, dash) : text).split('.');
  if (core.length !== 3 || !core.every((part) => NUMERIC_IDENTIFIER.test(part))) {
    return undefined;
  }
  const pre = dash >= 0 ? text.slice(dash + 1).split('.') : [];
  const validPre = pre.every((identifier) =>
    IDENTIFIER.test(identifier) && (!DIGITS.test(identifier) || NUMERIC_IDENTIFIER.test(identifier)));
  if (!validPre) {
    return undefined;
  }
  return { core: [core[0], core[1], core[2]], pre };
};

/** Compares non-negative decimal strings without leading zeros (no overflow for huge values). */
const compareDecimalStrings: Compare<string> = (a, b) =>
  a.length !== b.length ? a.length - b.length : a < b ? -1 : a > b ? 1 : 0;

const compareAscii: Compare<string> = (a, b) => (a < b ? -1 : a > b ? 1 : 0);

/** SemVer 2.0.0 precedence (build metadata is ignored, so such versions keep their order). */
export const compareSemver: Compare<SemverKey> = (a, b) => {
  for (let i = 0; i < 3; i++) {
    const result = compareDecimalStrings(a.core[i], b.core[i]);
    if (result !== 0) {
      return result;
    }
  }
  // A version without a pre-release is greater than one with it.
  if (a.pre.length === 0 || b.pre.length === 0) {
    return Number(a.pre.length === 0) - Number(b.pre.length === 0);
  }
  const length = Math.min(a.pre.length, b.pre.length);
  for (let i = 0; i < length; i++) {
    const x = a.pre[i];
    const y = b.pre[i];
    const xNumeric = DIGITS.test(x);
    const yNumeric = DIGITS.test(y);
    let result: number;
    if (xNumeric && yNumeric) {
      result = compareDecimalStrings(x, y);
    } else if (xNumeric !== yNumeric) {
      result = xNumeric ? -1 : 1;
    } else {
      result = compareAscii(x, y);
    }
    if (result !== 0) {
      return result;
    }
  }
  return a.pre.length - b.pre.length;
};

export interface IpKey {
  version: 4 | 6;
  value: bigint;
  /** CIDR prefix length, or -1 without one (sorted first). */
  prefix: number;
}

const IPV4_OCTET = /^(?:0|[1-9][0-9]{0,2})$/;
const IPV6_GROUP = /^[0-9A-Fa-f]{1,4}$/;

const parseIpv4 = (text: string): bigint | undefined => {
  const octets = text.split('.');
  if (octets.length !== 4 || !octets.every((octet) => IPV4_OCTET.test(octet) && Number(octet) <= 255)) {
    return undefined;
  }
  return octets.reduce((value, octet) => (value << 8n) | BigInt(octet), 0n);
};

/** Groups (16-bit values) of one side of `::`; an embedded IPv4 address is allowed at the end. */
const parseIpv6Groups = (text: string, allowIpv4: boolean): number[] | undefined => {
  if (text === '') {
    return [];
  }
  const parts = text.split(':');
  const groups: number[] = [];
  for (let i = 0; i < parts.length; i++) {
    const part = parts[i];
    if (allowIpv4 && i === parts.length - 1 && part.includes('.')) {
      const ipv4 = parseIpv4(part);
      if (ipv4 === undefined) {
        return undefined;
      }
      groups.push(Number(ipv4 >> 16n), Number(ipv4 & 0xffffn));
    } else if (IPV6_GROUP.test(part)) {
      groups.push(parseInt(part, 16));
    } else {
      return undefined;
    }
  }
  return groups;
};

const parseIpv6 = (text: string): bigint | undefined => {
  const halves = text.split('::');
  if (halves.length > 2) {
    return undefined;
  }
  let groups: number[];
  if (halves.length === 2) {
    const head = parseIpv6Groups(halves[0], false);
    const tail = parseIpv6Groups(halves[1], true);
    if (head === undefined || tail === undefined || head.length + tail.length > 7) {
      return undefined;
    }
    groups = [...head, ...Array(8 - head.length - tail.length).fill(0), ...tail];
  } else {
    const all = parseIpv6Groups(text, true);
    if (all === undefined || all.length !== 8) {
      return undefined;
    }
    groups = all;
  }
  return groups.reduce((value, group) => (value << 16n) | BigInt(group), 0n);
};

/** The first white-space separated token of the trimmed line (SORT-014 / SORT-021). */
const leadingToken = (line: string): string => line.trim().split(/\s/)[0];

/**
 * SORT-014: the IPv4 / IPv6 address (optionally with a `/prefix` and, for IPv6, a zone ID
 * `%...` that is ignored) at the start of the trimmed line. The `net` module is not used
 * (SECURITY.md forbids network modules).
 */
export const parseIp = (line: string): IpKey | undefined => {
  const token = leadingToken(line);
  const slash = token.split('/');
  if (slash.length > 2) {
    return undefined;
  }
  let prefix = -1;
  if (slash.length === 2) {
    if (!/^[0-9]{1,3}$/.test(slash[1])) {
      return undefined;
    }
    prefix = Number(slash[1]);
  }
  const address = slash[0];
  if (!address.includes(':')) {
    const value = parseIpv4(address);
    return value === undefined || prefix > 32 ? undefined : { version: 4, value, prefix };
  }
  const zone = address.indexOf('%');
  if (zone === 0 || zone === address.length - 1) {
    return undefined;
  }
  const value = parseIpv6(zone > 0 ? address.slice(0, zone) : address);
  return value === undefined || prefix > 128 ? undefined : { version: 6, value, prefix };
};

export const compareIp: Compare<IpKey> = (a, b) =>
  a.version - b.version || compareBigInts(a.value, b.value) || a.prefix - b.prefix;

const HEX_TOKEN = /^(?:0[xX])?[0-9a-fA-F]+$/;

/**
 * SORT-021: the value of the first token of the trimmed line when the WHOLE token is a hex
 * number (`0x` / `0X` optional). `deadline`, `0x` alone and `0xZZ` have no key; words made only
 * of hex letters (`bad`, `face`) do.
 */
export const parseHexKey = (line: string): bigint | undefined => {
  const token = leadingToken(line);
  if (!HEX_TOKEN.test(token)) {
    return undefined;
  }
  const digits = /^0[xX]/.test(token) ? token.slice(2) : token;
  return BigInt(`0x${digits}`);
};

/** Tokens separated by white space (any Unicode space). */
const words = (line: string): string[] => line.split(/\s+/).filter((word) => word !== '');

const codePointLength = (text: string): number => Array.from(text).length;

const isBlank = (line: string): boolean => line.trim() === '';

const indentWidth = (line: string): number => /^[ \t]*/.exec(line)![0].length;

// ---------------------------------------------------------------------------
// Block sorts (SORT-019 / SORT-020)
// ---------------------------------------------------------------------------

/**
 * SORT-019: paragraphs (runs of non-blank lines) sorted by their text, separated by one empty
 * line. Leading, trailing and repeated blank lines are normalized.
 */
const sortParagraphs = (lines: string[], descending: boolean): string[] => {
  const paragraphs: string[][] = [];
  let current: string[] = [];
  lines.forEach((line) => {
    if (isBlank(line)) {
      if (current.length > 0) {
        paragraphs.push(current);
        current = [];
      }
    } else {
      current.push(line);
    }
  });
  if (current.length > 0) {
    paragraphs.push(current);
  }
  const sorted = stableSortBy(paragraphs, (paragraph) => paragraph.join('\n'), stringCollator.compare, descending);
  return sorted.flatMap((paragraph, i) => (i === 0 ? paragraph : ['', ...paragraph]));
};

/**
 * SORT-020: the least indented non-blank lines are parents; each carries the lines up to the
 * next parent (deeper lines and blank lines) and parents are sorted by their trimmed text. Only
 * the top level is sorted. Lines before the first parent (leading blank lines, or deeper lines
 * with no parent) stay at the top in their order. Without a non-blank line nothing changes.
 */
const sortIndentBlocks = (lines: string[], descending: boolean): string[] => {
  const nonBlank = lines.filter((line) => !isBlank(line));
  if (nonBlank.length === 0) {
    return lines;
  }
  // A loop, not Math.min(...spread): spreading >~100k arguments throws a RangeError.
  let minIndent = Infinity;
  for (const line of nonBlank) {
    minIndent = Math.min(minIndent, indentWidth(line));
  }
  const isParent = (line: string) => !isBlank(line) && indentWidth(line) === minIndent;
  const first = lines.findIndex(isParent);
  const header = lines.slice(0, first);
  const blocks: string[][] = [];
  lines.slice(first).forEach((line) => {
    if (isParent(line)) {
      blocks.push([line]);
    } else {
      blocks[blocks.length - 1].push(line);
    }
  });
  const sorted = stableSortBy(blocks, (block) => block[0].trim(), stringCollator.compare, descending);
  return [...header, ...sorted.flat()];
};

// ---------------------------------------------------------------------------
// Entry points
// ---------------------------------------------------------------------------

/**
 * Sorts the lines of all selections (already split by `splitSelectionLines` and concatenated)
 * with the given key. `descending` is used by the commands that have a descending version.
 */
export const sortLines = (
  lines: string[],
  command: SortLineCommand,
  descending: boolean,
  options: SortOptions = {}
): string[] => {
  const by = <K>(key: (line: string, index: number) => K | undefined, compare: Compare<K>) =>
    stableSortBy(lines, key, compare, descending);
  const itself = (line: string) => line;
  switch (command) {
    case 'natural':
      return by(itself, naturalCollator.compare);
    case 'ignore-case':
      return by(itself, ignoreCaseCollator.compare);
    case 'locale':
      return by(itself, new Intl.Collator(options.locale).compare);
    case 'japanese':
      return by(kanaKey, japaneseCollator.compare);
    case 'column': {
      const delimiter = options.delimiter ?? ',';
      const column = options.column ?? 1;
      return by((line) => toCellKey(columnKey(line, delimiter, column)), compareCellKeys);
    }
    case 'regex-key': {
      const keys = options.regexKeys ?? [];
      return by((_line, index) => toCellKey(keys[index]), compareCellKeys);
    }
    case 'date':
      return by(parseDateKey, compareNumbers);
    case 'semver':
      return by(parseSemver, compareSemver);
    case 'ip':
      return by(parseIp, compareIp);
    case 'word-count':
      return by((line) => words(line).length, compareNumbers);
    case 'last-word':
      return by((line) => words(line).pop() ?? '', stringCollator.compare);
    case 'suffix':
      return by((line) => Array.from(line).reverse().join(''), stringCollator.compare);
    case 'unique': {
      // Exact duplicates are removed first (in the original order), then the rest is sorted.
      // Lines that are only equal for the collator (NFC / NFD, case) are all kept.
      const unique = [...new Set(lines)];
      return stableSortBy(unique, itself, stringCollator.compare, descending);
    }
    case 'paragraph':
      return sortParagraphs(lines, descending);
    case 'indent-block':
      return sortIndentBlocks(lines, descending);
    case 'hex':
      return by(parseHexKey, compareBigInts);
  }
};

/** Sorts the non-blank lines of the selections (SORT-022..SORT-025 / SORT-030). */
export const sortSelectionItems = (items: string[], command: SortSelectionCommand, descending: boolean): string[] => {
  switch (command) {
    case 'natural':
      return stableSortBy(items, (item) => item, naturalCollator.compare, descending);
    case 'ignore-case':
      return stableSortBy(items, (item) => item, ignoreCaseCollator.compare, descending);
    case 'length':
      return stableSortBy(items, codePointLength, compareNumbers, descending);
  }
};
