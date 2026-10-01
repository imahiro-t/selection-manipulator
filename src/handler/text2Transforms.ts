/**
 * Pure (vscode-independent) command table of the TEXTX-001..023 text transform commands (the
 * group TEXT2 of SELEC-00091; the showcase category ID is `TEXTX` because category IDs are
 * upper-case letters only).
 *
 * Every command either replaces each selection with its result (`replace`) or opens one new editor
 * with a table made from all selections together (`new-tab`). Some commands ask for values first
 * (a number, a separator, a set of characters); the values are asked once and used for every
 * selection.
 *
 * "Characters" are grapheme clusters (what the user sees as one character) except for the tr-like
 * commands (translate / delete / squeeze) and Leetspeak, which work on code points.
 *
 * Security rules (SECURITY.md): only local processing (no network, files or processes), no
 * evaluation of code (no eval, no Function constructor), no new dependency. No regular expression
 * is built from the user's input (sets and delimiters are handled with `Set` / `Map` / `indexOf`);
 * the constant expressions below are linear (no end-anchored repetition such as `[ \t]+$`, which
 * is quadratic on a long run of blanks that is not at the end: blanks are trimmed by loops).
 * Results that may grow (repeat, pad, insert every N) are measured before they are built and
 * refused when they exceed the output budget. Error messages never quote the selected text or the
 * values entered.
 */
import { EncOutputTooLargeError, MAX_OUTPUT_LENGTH } from './encodeTransforms';
import { countGraphemes, formatCodePoint, graphemes, isEmojiGrapheme, isInvisibleCode } from './uniCommon';

/** An expected failure; the message is shown to the user and never contains the selected text. */
export class Text2InputError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'Text2InputError';
  }
}

/** Upper limit of the total length (UTF-16 code units) of all selections together. */
export const TEXT2_MAX_INPUT_LENGTH = 1_000_000;
/** Upper limit of the total length of the results of all selections together. */
export const TEXT2_MAX_OUTPUT_LENGTH = MAX_OUTPUT_LENGTH;
/** TEXTX-001: upper limit of N (the number of copies). */
export const TEXT2_MAX_REPEAT = 10_000;
/** TEXTX-004 / 005: upper limit of the width. */
export const TEXT2_MAX_WIDTH = 10_000;
/** TEXTX-006: upper limit of N (the group size). */
export const TEXT2_MAX_GROUP = 10_000;
/** TEXTX-002 / 003 / 021: upper limit of N (a length in characters). */
export const TEXT2_MAX_LENGTH = 1_000_000;
/** Upper limit of the length (code points) of a separator, a set of characters or a delimiter. */
export const TEXT2_MAX_PROMPT_LENGTH = 100;
/** TEXTX-004 / 005: upper limit of the length (UTF-16 code units) of the pad character. */
export const TEXT2_MAX_PAD_CHAR_LENGTH = 16;

/** The ellipsis of TEXTX-002 / 003. */
export const TEXT2_ELLIPSIS = '…';
/** The mask character of TEXTX-021. */
export const TEXT2_MASK = '*';

/** Throws `EncOutputTooLargeError` when a result of `length` characters exceeds `budget`. */
export const assertText2Budget = (length: number, budget: number): void => {
  if (length > budget) {
    throw new EncOutputTooLargeError(length, TEXT2_MAX_OUTPUT_LENGTH);
  }
};

// ---------------------------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------------------------

const codePoints = (text: string): number[] => {
  const result: number[] = [];
  for (const char of text) {
    result.push(char.codePointAt(0)!);
  }
  return result;
};

const countCodePoints = (text: string): number => {
  let count = 0;
  for (const _ of text) {
    count++;
  }
  return count;
};

/**
 * Compares two strings by their code points (not by UTF-16 code units, which put the characters
 * above U+FFFF before U+E000..U+FFFF). Independent of the locale.
 */
export const compareCodePoints = (a: string, b: string): number => {
  const left = a[Symbol.iterator]();
  const right = b[Symbol.iterator]();
  for (;;) {
    const x = left.next();
    const y = right.next();
    if (x.done || y.done) {
      return x.done ? (y.done ? 0 : -1) : 1;
    }
    const difference = x.value.codePointAt(0)! - y.value.codePointAt(0)!;
    if (difference !== 0) {
      return difference;
    }
  }
};

/** The words of the text: runs of characters other than whitespace. */
const WORD = /\S+/gu;
const wordsOf = (text: string): string[] => text.match(WORD) ?? [];

const isLineBreak = (grapheme: string): boolean => grapheme === '\n' || grapheme === '\r\n' || grapheme === '\r';

// ---------------------------------------------------------------------------------------------
// The transforms (one selection, or all selections for the frequency tables)
// ---------------------------------------------------------------------------------------------

/** TEXTX-001: `n` copies of the text joined with `separator`. The length is checked before the result is built. */
export const repeatText = (text: string, n: number, separator: string, budget: number = TEXT2_MAX_OUTPUT_LENGTH): string => {
  if (!Number.isInteger(n) || n < 1 || n > TEXT2_MAX_REPEAT) {
    throw new Text2InputError(`the number of copies must be a whole number from 1 to ${TEXT2_MAX_REPEAT.toLocaleString('en-US')}`);
  }
  assertText2Budget(text.length * n + separator.length * (n - 1), budget);
  return new Array<string>(n).fill(text).join(separator);
};

/** TEXTX-002: at most `n` graphemes; a longer text keeps its first n − 1 graphemes and ends with `…`. */
export const truncateText = (text: string, n: number): string => {
  const all = [...graphemes(text)];
  if (all.length <= n) {
    return text;
  }
  return all.slice(0, n - 1).join('') + TEXT2_ELLIPSIS;
};

/**
 * TEXTX-003: at most `n` graphemes; a longer text keeps ceil((n − 1) / 2) graphemes of its start
 * and floor((n − 1) / 2) of its end, with `…` between them.
 */
export const truncateMiddle = (text: string, n: number): string => {
  const all = [...graphemes(text)];
  if (all.length <= n) {
    return text;
  }
  const head = Math.ceil((n - 1) / 2);
  const tail = Math.floor((n - 1) / 2);
  return all.slice(0, head).join('') + TEXT2_ELLIPSIS + all.slice(all.length - tail).join('');
};

const padCount = (text: string, width: number): number => {
  if (!Number.isInteger(width) || width < 1 || width > TEXT2_MAX_WIDTH) {
    throw new Text2InputError(`the width must be a whole number from 1 to ${TEXT2_MAX_WIDTH.toLocaleString('en-US')}`);
  }
  let count = 0;
  for (const _ of graphemes(text)) {
    count++;
    if (count >= width) {
      return 0;
    }
  }
  return width - count;
};

/** TEXTX-004: `padChar` (one grapheme) added before the text until it is `width` graphemes long. */
export const padStart = (text: string, width: number, padChar: string, budget: number = TEXT2_MAX_OUTPUT_LENGTH): string => {
  const missing = padCount(text, width);
  assertText2Budget(text.length + padChar.length * missing, budget);
  return padChar.repeat(missing) + text;
};

/** TEXTX-005: `padChar` (one grapheme) added after the text until it is `width` graphemes long. */
export const padEnd = (text: string, width: number, padChar: string, budget: number = TEXT2_MAX_OUTPUT_LENGTH): string => {
  const missing = padCount(text, width);
  assertText2Budget(text.length + padChar.length * missing, budget);
  return text + padChar.repeat(missing);
};

/** TEXTX-006: `separator` inserted after every `n` graphemes (not after the last group). */
export const insertEveryN = (text: string, n: number, separator: string, budget: number = TEXT2_MAX_OUTPUT_LENGTH): string => {
  if (!Number.isInteger(n) || n < 1 || n > TEXT2_MAX_GROUP) {
    throw new Text2InputError(`the group size must be a whole number from 1 to ${TEXT2_MAX_GROUP.toLocaleString('en-US')}`);
  }
  // Counted without building the grapheme array, so a result over the budget is refused before
  // anything is allocated.
  const groups = Math.ceil(countGraphemes(text) / n);
  assertText2Budget(text.length + separator.length * Math.max(0, groups - 1), budget);
  const all = [...graphemes(text)];
  const parts: string[] = [];
  for (let i = 0; i < all.length; i += n) {
    parts.push(all.slice(i, i + n).join(''));
  }
  return parts.join(separator);
};

/**
 * TEXTX-007 validation: why the two sets cannot be used together, or `undefined`. Both are code
 * point lists of the same length; a character may appear only once in `from`.
 */
export const translationProblem = (from: string, to: string): string | undefined => {
  const source = codePoints(from);
  if (new Set(source).size !== source.length) {
    return 'a character appears more than once in the characters to replace';
  }
  if (codePoints(to).length !== source.length) {
    return `the replacement characters must be as many as the characters to replace (${source.length})`;
  }
  return undefined;
};

/** TEXTX-007: every code point of `from` replaced with the code point at the same position in `to` (like `tr`). */
export const translateChars = (text: string, from: string, to: string): string => {
  const problem = translationProblem(from, to);
  if (problem !== undefined) {
    throw new Text2InputError(problem);
  }
  const source = codePoints(from);
  const target = [...to];
  const map = new Map<number, string>(source.map((code, i) => [code, target[i]]));
  let result = '';
  for (const char of text) {
    result += map.get(char.codePointAt(0)!) ?? char;
  }
  return result;
};

/** TEXTX-008: every code point that is in `set` removed. */
export const deleteChars = (text: string, set: string): string => {
  const remove = new Set(codePoints(set));
  let result = '';
  for (const char of text) {
    if (!remove.has(char.codePointAt(0)!)) {
      result += char;
    }
  }
  return result;
};

/** TEXTX-009: runs of the same code point of `set` (of any code point when `set` is empty) squeezed to one (like `tr -s`). */
export const squeezeChars = (text: string, set: string): string => {
  const only = new Set(codePoints(set));
  let result = '';
  let previous: number | undefined;
  for (const char of text) {
    const code = char.codePointAt(0)!;
    if (code === previous && (only.size === 0 || only.has(code))) {
      continue;
    }
    result += char;
    previous = code;
  }
  return result;
};

const DIGIT = /\p{Nd}/gu;
const NOT_DIGIT = /\P{Nd}/gu;
const PUNCTUATION = /\p{P}/gu;

/** TEXTX-010: the decimal digits (Unicode Nd) removed. */
export const removeDigits = (text: string): string => text.replace(DIGIT, '');

/** TEXTX-011: the punctuation (Unicode P) removed; symbols (S) such as `$` `+` stay. */
export const removePunctuation = (text: string): string => text.replace(PUNCTUATION, '');

/** TEXTX-012: only the decimal digits (Unicode Nd) kept; line breaks are removed too. */
export const keepDigits = (text: string): string => text.replace(NOT_DIGIT, '');

/** TEXTX-013: the graphemes of every word reversed; whitespace stays where it is. */
export const reverseEachWord = (text: string): string =>
  text.replace(WORD, (word) => [...graphemes(word)].reverse().join(''));

/** TEXTX-014: the words sorted by code point and joined with one space (the text is unchanged when it has no word). */
export const sortWords = (text: string): string => {
  const words = wordsOf(text);
  return words.length === 0 ? text : words.sort(compareCodePoints).join(' ');
};

/** TEXTX-015: repeated words removed (the first one stays, case-sensitive) and joined with one space. */
export const uniqueWords = (text: string): string => {
  const words = wordsOf(text);
  return words.length === 0 ? text : [...new Set(words)].join(' ');
};

/** TEXTX-016: the graphemes sorted by code point. */
export const sortCharacters = (text: string): string => [...graphemes(text)].sort(compareCodePoints).join('');

/** TEXTX-017: repeated graphemes removed (the first one stays). */
export const uniqueCharacters = (text: string): string => [...new Set(graphemes(text))].join('');

/** Counts the keys, in the order they first appear. */
const countAll = (keys: Iterable<string>): Map<string, number> => {
  const counts = new Map<string, number>();
  for (const key of keys) {
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return counts;
};

/** `label TAB count` lines, the highest count first (equal counts in the order they first appear). */
const frequencyTable = (counts: Map<string, number>, label: (key: string) => string, eol: string, budget: number): string => {
  const rows = [...counts.entries()].sort((a, b) => b[1] - a[1]);
  const lines: string[] = [];
  let total = 0;
  for (const [key, count] of rows) {
    const line = `${label(key)}\t${count}`;
    total += line.length + (lines.length > 0 ? eol.length : 0);
    assertText2Budget(total, budget);
    lines.push(line);
  }
  return lines.join(eol);
};

/** TEXTX-018: a table of the words of all selections and how often they appear (`''` when there is no word). */
export const wordFrequency = (texts: readonly string[], eol: string, budget: number = TEXT2_MAX_OUTPUT_LENGTH): string =>
  frequencyTable(countAll(texts.flatMap(wordsOf)), (word) => word, eol, budget);

/** Whitespace that would break or hide a row of the character table. */
const TABLE_WHITESPACE = new Set([0x09, 0x0a, 0x0d, 0x20, 0x3000]);

/**
 * TEXTX-019: how a grapheme is written in the table. A grapheme with an invisible character (as in
 * UNI-006) or whitespace is written as its code points (`U+200B`, `U+000D U+000A`), so that it can
 * neither be misread nor break the table; an emoji sequence (with its joiners) is written as it is.
 */
export const frequencyLabel = (grapheme: string): string => {
  const codes = codePoints(grapheme);
  if (isEmojiGrapheme(grapheme) || !codes.some((code) => isInvisibleCode(code) || TABLE_WHITESPACE.has(code))) {
    return grapheme;
  }
  return codes.map(formatCodePoint).join(' ');
};

/** TEXTX-019: a table of the graphemes of all selections and how often they appear (`''` when there is none). */
export const charFrequency = (texts: readonly string[], eol: string, budget: number = TEXT2_MAX_OUTPUT_LENGTH): string =>
  frequencyTable(countAll(texts.flatMap((text) => [...graphemes(text)])), frequencyLabel, eol, budget);

/**
 * TEXTX-020: the URLs of the existing URL extraction (`http://` / `https://` and what follows up
 * to whitespace; the first character after `//` is not whitespace, `$`, `.`, `?` or `#`). Unlike
 * the extraction pattern, a URL never runs over a space. Linear: no nested quantifier.
 */
const URL_PATTERN = /https?:\/\/[^\s$.?#]\S*/g;
/** Characters that end a sentence or quote rather than a URL when they are its last ones. */
const URL_TRAILING_PUNCTUATION = new Set(['.', ',', ';', ':', '!', '?', "'", '"']);
/** Closing brackets and their openers; a closer is part of the URL only when the URL opens it. */
const URL_CLOSERS = new Map([
  [')', '('],
  [']', '['],
  ['}', '{'],
  ['>', '<'],
]);

/**
 * How much of a match of `URL_PATTERN` is the URL: the trailing punctuation (`.,;:!?'"`) and the
 * closing brackets that have no opener inside the URL are left out, so `(see https://a.example).`
 * keeps `).` and `https://en.wikipedia.org/wiki/Foo_(bar)` keeps its own parentheses. At least one
 * character after `//` always stays. Linear: one pass to count the brackets, one pass back.
 */
const urlLength = (match: string): number => {
  const unmatched = new Map<string, number>();
  for (const [closer, opener] of URL_CLOSERS) {
    let balance = 0;
    for (let i = 0; i < match.length; i++) {
      if (match[i] === closer) {
        balance++;
      } else if (match[i] === opener) {
        balance--;
      }
    }
    unmatched.set(closer, balance);
  }
  const minimum = match.indexOf('//') + 3;
  let end = match.length;
  while (end > minimum) {
    const last = match[end - 1];
    if (URL_TRAILING_PUNCTUATION.has(last)) {
      end--;
      continue;
    }
    const balance = unmatched.get(last);
    if (balance !== undefined && balance > 0) {
      unmatched.set(last, balance - 1);
      end--;
      continue;
    }
    break;
  }
  return end;
};

const isBlank = (char: string): boolean => char === ' ' || char === '\t';

/** `text` without its leading spaces and tabs (a loop: linear). */
const trimBlanksStart = (text: string): string => {
  let start = 0;
  while (start < text.length && isBlank(text[start])) {
    start++;
  }
  return text.slice(start);
};

/** `text` without its trailing spaces and tabs (a backward loop: linear, unlike `/[ \t]+$/`). */
const trimBlanksEnd = (text: string): string => {
  let end = text.length;
  while (end > 0 && isBlank(text[end - 1])) {
    end--;
  }
  return text.slice(0, end);
};

/**
 * TEXTX-020: the URLs removed. The spaces and tabs around a removed URL become one space between
 * the words on both sides, or nothing at the start or end of a line. Punctuation and closing
 * brackets that follow a URL stay, directly after the word before it (`Visit https://a.example.`
 * becomes `Visit.`). No URL is ever accessed. Linear in the length of the text.
 */
export const removeUrls = (text: string): string => {
  const parts: string[] = [];
  const trimEnd = () => {
    while (parts.length > 0) {
      const trimmed = trimBlanksEnd(parts[parts.length - 1]);
      if (trimmed !== '') {
        parts[parts.length - 1] = trimmed;
        return;
      }
      parts.pop();
    }
  };
  /** A URL was removed and the blanks around it are not handled yet. */
  let pending = false;
  const pushText = (segment: string) => {
    let piece = segment;
    if (pending) {
      piece = trimBlanksStart(piece);
      if (piece === '') {
        return;
      }
      trimEnd();
      const last = parts.length > 0 ? parts[parts.length - 1] : '';
      const before = last.charAt(last.length - 1);
      const after = piece.charAt(0);
      if (before !== '' && before !== '\n' && before !== '\r' && after !== '\n' && after !== '\r') {
        parts.push(' ');
      }
      pending = false;
    }
    if (piece !== '') {
      parts.push(piece);
    }
  };
  /** What followed a URL in its match (punctuation, closers): attached to the text before it. */
  const pushTail = (tail: string) => {
    trimEnd();
    parts.push(tail);
    pending = false;
  };
  let cursor = 0;
  let found = false;
  for (const match of text.matchAll(URL_PATTERN)) {
    found = true;
    const start = match.index ?? 0;
    const end = start + match[0].length;
    pushText(text.slice(cursor, start));
    pending = true;
    const length = urlLength(match[0]);
    if (length < match[0].length) {
      pushTail(match[0].slice(length));
    }
    cursor = end;
  }
  if (!found) {
    return text;
  }
  pushText(text.slice(cursor));
  if (pending) {
    trimEnd();
  }
  return parts.join('');
};

/** TEXTX-021: every grapheme but the last `n` replaced with `*`; line breaks stay and are not counted. */
export const maskKeepLast = (text: string, n: number): string => {
  const all = [...graphemes(text)];
  let visible = 0;
  for (const grapheme of all) {
    if (!isLineBreak(grapheme)) {
      visible++;
    }
  }
  let toMask = Math.max(0, visible - n);
  return all.map((grapheme) => {
    if (isLineBreak(grapheme)) {
      return grapheme;
    }
    if (toMask > 0) {
      toMask--;
      return TEXT2_MASK;
    }
    return grapheme;
  }).join('');
};

const LEET: ReadonlyMap<string, string> = new Map([
  ['a', '4'], ['e', '3'], ['i', '1'], ['o', '0'], ['s', '5'], ['t', '7'],
  ['A', '4'], ['E', '3'], ['I', '1'], ['O', '0'], ['S', '5'], ['T', '7'],
]);
const LEET_LETTERS = /[aeiostAEIOST]/g;

/** TEXTX-022: Leetspeak with a fixed table (a→4, e→3, i→1, o→0, s→5, t→7, upper case too). */
export const leetspeak = (text: string): string => text.replace(LEET_LETTERS, (letter) => LEET.get(letter)!);

/**
 * TEXTX-023: every `open` … `close` (both literal strings, not regular expressions) removed with
 * the text between them, left to right, without nesting. An `open` with no `close` after it stays.
 */
export const removeBetween = (text: string, open: string, close: string): string => {
  if (open === '' || close === '') {
    throw new Text2InputError('the delimiters must not be empty');
  }
  const parts: string[] = [];
  let position = 0;
  for (;;) {
    const start = text.indexOf(open, position);
    if (start === -1) {
      break;
    }
    const end = text.indexOf(close, start + open.length);
    if (end === -1) {
      break;
    }
    parts.push(text.slice(position, start));
    position = end + close.length;
  }
  parts.push(text.slice(position));
  return parts.join('');
};

// ---------------------------------------------------------------------------------------------
// Input boxes
// ---------------------------------------------------------------------------------------------

/**
 * One value asked before running. `validate` gets the value and the values entered in the boxes
 * before it, and returns why the value cannot be used (shown in the box) or `undefined`.
 */
export interface Text2Prompt {
  prompt: string;
  placeHolder?: string;
  value?: string;
  validate: (value: string, previous: readonly string[]) => string | undefined;
}

const WHOLE_NUMBER = /^\d+$/;

/** Accepts a whole number (digits only) from `min` to `max`. */
export const numberValidator = (min: number, max: number) => (value: string): string | undefined => {
  const message = `Enter a whole number from ${min.toLocaleString('en-US')} to ${max.toLocaleString('en-US')}.`;
  if (!WHOLE_NUMBER.test(value) || value.length > 9) {
    return message;
  }
  const n = Number(value);
  return n < min || n > max ? message : undefined;
};

/** Accepts `min`..TEXT2_MAX_PROMPT_LENGTH code points without line breaks. */
export const textValidator = (what: string, min: number) => (value: string): string | undefined => {
  if (/[\r\n]/.test(value)) {
    return `The ${what} must not contain line breaks.`;
  }
  const length = countCodePoints(value);
  if (length < min) {
    return `Enter the ${what}.`;
  }
  if (length > TEXT2_MAX_PROMPT_LENGTH) {
    return `The ${what} must be at most ${TEXT2_MAX_PROMPT_LENGTH} characters long.`;
  }
  return undefined;
};

/** Accepts exactly one grapheme (not a line break) as the pad character. */
export const padCharValidator = (value: string): string | undefined => {
  if (value.length === 0 || value.length > TEXT2_MAX_PAD_CHAR_LENGTH || /[\r\n]/.test(value)) {
    return 'Enter exactly one character.';
  }
  return countGraphemes(value) === 1 ? undefined : 'Enter exactly one character.';
};

const numberPrompt = (prompt: string, min: number, max: number, value?: string): Text2Prompt => ({
  prompt: `${prompt} (${min.toLocaleString('en-US')}-${max.toLocaleString('en-US')})`,
  value,
  validate: numberValidator(min, max),
});

const separatorPrompt = (prompt: string, min: number): Text2Prompt => ({
  prompt: `${prompt} (${min === 0 ? 'may be empty, ' : ''}at most ${TEXT2_MAX_PROMPT_LENGTH} characters)`,
  validate: textValidator('separator', min),
});

const padCharPrompt: Text2Prompt = {
  prompt: 'Pad character (exactly one character)',
  validate: padCharValidator,
};

// ---------------------------------------------------------------------------------------------
// The command table
// ---------------------------------------------------------------------------------------------

/** Where a command puts its result. */
export type Text2Output = 'replace' | 'new-tab';

/** What a transform may use besides the text: made once per run by the handler. */
export interface Text2Context {
  /** The line break of the document (`\n` or `\r\n`). */
  eol: string;
  /** The values entered in the input boxes, in order. */
  inputs: readonly string[];
}

/** `replace`: one selection. `budget` is what is left of the output limit. */
export type Text2Transform = (text: string, context: Text2Context, budget: number) => string;

/** `new-tab`: all selections together (in document order). */
export type Text2Combine = (texts: readonly string[], context: Text2Context, budget: number) => string;

export interface Text2CommandEntry {
  /** Candidate ID of the showcase data, e.g. `TEXTX-001`. */
  id: string;
  /** Command ID without the `selection-manipulator.` prefix. */
  name: string;
  /** Title in package.json. */
  title: string;
  output: Text2Output;
  /** Asked once before running, in order. */
  inputs?: readonly Text2Prompt[];
  /** `replace`: converts one selection. */
  transform?: Text2Transform;
  /** `new-tab`: all selections into one result. */
  combine?: Text2Combine;
  /** `new-tab`: the information message instead of an empty editor. */
  emptyMessage?: string;
}

const num = (context: Text2Context, index: number): number => Number(context.inputs[index]);

/** The commands in the order of the showcase data (scripts/showcase-data/TEXTX.json). */
export const TEXT2_COMMAND_ENTRIES: readonly Text2CommandEntry[] = [
  {
    id: 'TEXTX-001', name: 'text.repeat', title: 'Text - Repeat Selection N Times', output: 'replace',
    inputs: [numberPrompt('Number of copies', 1, TEXT2_MAX_REPEAT, '2'), separatorPrompt('Separator between the copies', 0)],
    transform: (text, context, budget) => repeatText(text, num(context, 0), context.inputs[1], budget),
  },
  {
    id: 'TEXTX-002', name: 'text.truncate', title: 'Text - Truncate to N Characters', output: 'replace',
    inputs: [numberPrompt('Maximum length in characters, including the ellipsis', 1, TEXT2_MAX_LENGTH)],
    transform: (text, context) => truncateText(text, num(context, 0)),
  },
  {
    id: 'TEXTX-003', name: 'text.truncate-middle', title: 'Text - Shorten in the Middle', output: 'replace',
    inputs: [numberPrompt('Maximum length in characters, including the ellipsis', 1, TEXT2_MAX_LENGTH)],
    transform: (text, context) => truncateMiddle(text, num(context, 0)),
  },
  {
    id: 'TEXTX-004', name: 'text.pad-start', title: 'Text - Pad Start to Width (Custom Character)', output: 'replace',
    inputs: [numberPrompt('Width in characters', 1, TEXT2_MAX_WIDTH), padCharPrompt],
    transform: (text, context, budget) => padStart(text, num(context, 0), context.inputs[1], budget),
  },
  {
    id: 'TEXTX-005', name: 'text.pad-end', title: 'Text - Pad End to Width (Custom Character)', output: 'replace',
    inputs: [numberPrompt('Width in characters', 1, TEXT2_MAX_WIDTH), padCharPrompt],
    transform: (text, context, budget) => padEnd(text, num(context, 0), context.inputs[1], budget),
  },
  {
    id: 'TEXTX-006', name: 'text.insert-every-n', title: 'Text - Insert Separator Every N Characters', output: 'replace',
    inputs: [numberPrompt('Group size in characters', 1, TEXT2_MAX_GROUP, '4'), separatorPrompt('Separator to insert', 1)],
    transform: (text, context, budget) => insertEveryN(text, num(context, 0), context.inputs[1], budget),
  },
  {
    id: 'TEXTX-007', name: 'text.translate-chars', title: 'Text - Translate Characters (tr)', output: 'replace',
    inputs: [
      {
        prompt: `Characters to replace (each at most once, at most ${TEXT2_MAX_PROMPT_LENGTH})`,
        validate: (value) => textValidator('characters to replace', 1)(value)
          ?? (new Set(codePoints(value)).size === countCodePoints(value) ? undefined : 'Each character may appear only once.'),
      },
      {
        prompt: 'Replacement characters (as many as the characters to replace, in the same order)',
        validate: (value, previous) => {
          const problem = textValidator('replacement characters', 1)(value);
          if (problem !== undefined) {
            return problem;
          }
          const expected = countCodePoints(previous[0] ?? '');
          return countCodePoints(value) === expected ? undefined : `Enter exactly ${expected} characters.`;
        },
      },
    ],
    transform: (text, context) => translateChars(text, context.inputs[0], context.inputs[1]),
  },
  {
    id: 'TEXTX-008', name: 'text.delete-chars', title: 'Text - Delete Characters in Set', output: 'replace',
    inputs: [{ prompt: `Characters to delete (at most ${TEXT2_MAX_PROMPT_LENGTH})`, validate: textValidator('characters to delete', 1) }],
    transform: (text, context) => deleteChars(text, context.inputs[0]),
  },
  {
    id: 'TEXTX-009', name: 'text.squeeze-chars', title: 'Text - Squeeze Repeated Characters', output: 'replace',
    inputs: [{
      prompt: `Characters to squeeze (empty: every character; at most ${TEXT2_MAX_PROMPT_LENGTH})`,
      validate: textValidator('characters to squeeze', 0),
    }],
    transform: (text, context) => squeezeChars(text, context.inputs[0]),
  },
  {
    id: 'TEXTX-010', name: 'text.remove-digits', title: 'Text - Remove Digits', output: 'replace',
    transform: (text) => removeDigits(text),
  },
  {
    id: 'TEXTX-011', name: 'text.remove-punctuation', title: 'Text - Remove Punctuation', output: 'replace',
    transform: (text) => removePunctuation(text),
  },
  {
    id: 'TEXTX-012', name: 'text.keep-digits', title: 'Text - Keep Digits Only', output: 'replace',
    transform: (text) => keepDigits(text),
  },
  {
    id: 'TEXTX-013', name: 'text.reverse-each-word', title: 'Text - Reverse Each Word', output: 'replace',
    transform: (text) => reverseEachWord(text),
  },
  {
    id: 'TEXTX-014', name: 'text.sort-words', title: 'Text - Sort Words in Selection', output: 'replace',
    transform: (text) => sortWords(text),
  },
  {
    id: 'TEXTX-015', name: 'text.unique-words', title: 'Text - Remove Duplicate Words', output: 'replace',
    transform: (text) => uniqueWords(text),
  },
  {
    id: 'TEXTX-016', name: 'text.sort-characters', title: 'Text - Sort Characters', output: 'replace',
    transform: (text) => sortCharacters(text),
  },
  {
    id: 'TEXTX-017', name: 'text.unique-characters', title: 'Text - Remove Duplicate Characters', output: 'replace',
    transform: (text) => uniqueCharacters(text),
  },
  {
    id: 'TEXTX-018', name: 'text.word-frequency', title: 'Text - Word Frequency Table', output: 'new-tab',
    emptyMessage: 'No words were found in the selection.',
    combine: (texts, context, budget) => wordFrequency(texts, context.eol, budget),
  },
  {
    id: 'TEXTX-019', name: 'text.char-frequency', title: 'Text - Character Frequency Table', output: 'new-tab',
    emptyMessage: 'No characters were found in the selection.',
    combine: (texts, context, budget) => charFrequency(texts, context.eol, budget),
  },
  {
    id: 'TEXTX-020', name: 'text.remove-urls', title: 'Text - Remove URLs', output: 'replace',
    transform: (text) => removeUrls(text),
  },
  {
    id: 'TEXTX-021', name: 'text.mask-keep-last', title: 'Text - Mask Except Last N Characters', output: 'replace',
    inputs: [numberPrompt('Number of characters to keep at the end', 0, TEXT2_MAX_LENGTH, '4')],
    transform: (text, context) => maskKeepLast(text, num(context, 0)),
  },
  {
    id: 'TEXTX-022', name: 'text.leetspeak', title: 'Text - Leetspeak', output: 'replace',
    transform: (text) => leetspeak(text),
  },
  {
    id: 'TEXTX-023', name: 'text.remove-between', title: 'Text - Remove Text Between Delimiters', output: 'replace',
    inputs: [
      { prompt: `Start delimiter (plain text, at most ${TEXT2_MAX_PROMPT_LENGTH} characters)`, value: '(', validate: textValidator('start delimiter', 1) },
      { prompt: `End delimiter (plain text, at most ${TEXT2_MAX_PROMPT_LENGTH} characters)`, value: ')', validate: textValidator('end delimiter', 1) },
    ],
    transform: (text, context) => removeBetween(text, context.inputs[0], context.inputs[1]),
  },
];
