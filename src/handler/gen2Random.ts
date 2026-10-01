/**
 * Pure (vscode-independent) random generators of the DATEX-022..024 commands (group DATE2):
 * passphrases, strings from the characters typed and the shuffling of the words of each line.
 *
 * Every random value comes from `GenRandom.below` (in the extension `crypto.randomInt`, which
 * rejects values to stay unbiased); `Math.random` is never used. Tests replace `GenRandom` with a
 * fixed sequence.
 */
import { forEachLine, formatCount, GenInputError, GenOutputBuffer, GenRandom } from './genCommon';
import { PASSPHRASE_WORDS } from './gen2Words';

// ---------------------------------------------------------------------------------------------
// DATEX-022 Passphrase
// ---------------------------------------------------------------------------------------------

/** DATEX-022: the numbers of words. */
export const PASSPHRASE_MIN_WORDS = 3;
export const PASSPHRASE_MAX_WORDS = 20;
export const PASSPHRASE_DEFAULT_WORDS = 6;
/** DATEX-022: the longest separator. */
export const PASSPHRASE_MAX_SEPARATOR = 10;

/** Line breaks, other control characters and lone surrogates cannot be part of a separator or a character set. */
const NOT_WRITABLE = /[\u0000-\u001f\u007f-\u009f\u2028\u2029]|[\ud800-\udbff](?![\udc00-\udfff])|(?<![\ud800-\udbff])[\udc00-\udfff]/;

/** DATEX-022: the separator of the words as typed (0 to 10 characters, spaces kept, no control characters). */
export const parsePassphraseSeparator = (text: string): string => {
  if (Array.from(text).length > PASSPHRASE_MAX_SEPARATOR) {
    throw new GenInputError(`the separator must be at most ${PASSPHRASE_MAX_SEPARATOR} characters`);
  }
  if (NOT_WRITABLE.test(text)) {
    throw new GenInputError('the separator must not include line breaks, tabs or other control characters');
  }
  return text;
};

/** DATEX-022: `count` words of PASSPHRASE_WORDS, each chosen uniformly (repeats possible), joined with `separator`. */
export const passphrase = (random: GenRandom, count: number, separator: string, words: readonly string[] = PASSPHRASE_WORDS): string => {
  const chosen: string[] = [];
  for (let i = 0; i < count; i++) {
    chosen.push(words[random.below(words.length)]);
  }
  return chosen.join(separator);
};

// ---------------------------------------------------------------------------------------------
// DATEX-023 String from Custom Characters
// ---------------------------------------------------------------------------------------------

/** DATEX-023: the most distinct characters and the longest string. */
export const CHARSET_MAX_CHARACTERS = 100;
export const CHARSET_MAX_LENGTH = 10_000;

/**
 * DATEX-023: the characters typed (spaces kept) as distinct code points, in the order of their
 * first appearance: 1 to 100 of them, no line breaks or control characters.
 */
export const parseCharset = (text: string): string[] => {
  if (NOT_WRITABLE.test(text)) {
    throw new GenInputError('the characters must not include line breaks, tabs or other control characters');
  }
  const chars = [...new Set(Array.from(text))];
  if (chars.length < 1) {
    throw new GenInputError('enter the characters to use, such as ABC123');
  }
  if (chars.length > CHARSET_MAX_CHARACTERS) {
    throw new GenInputError(`enter at most ${CHARSET_MAX_CHARACTERS} different characters`);
  }
  return chars;
};

/** DATEX-023: `length` characters (code points), each chosen uniformly from `chars`. */
export const stringFromCharset = (random: GenRandom, chars: readonly string[], length: number, budget: number): string => {
  const output = new GenOutputBuffer(budget);
  for (let i = 0; i < length; i++) {
    output.push(chars[random.below(chars.length)]);
  }
  return output.join();
};

// ---------------------------------------------------------------------------------------------
// DATEX-024 Shuffle Words
// ---------------------------------------------------------------------------------------------

/** Spaces, tabs and ideographic spaces separate the words. */
const isSpace = (code: number): boolean => code === 0x20 || code === 0x09 || code === 0x3000;

/** The words of a line and the spaces between them: `[gap, word, gap, word, …, gap]` (gaps may be ''). */
const splitWords = (line: string): { gaps: string[]; words: string[] } => {
  const gaps: string[] = [];
  const words: string[] = [];
  let i = 0;
  for (;;) {
    let j = i;
    while (j < line.length && isSpace(line.charCodeAt(j))) {
      j++;
    }
    gaps.push(line.slice(i, j));
    if (j >= line.length) {
      return { gaps, words };
    }
    let k = j;
    while (k < line.length && !isSpace(line.charCodeAt(k))) {
      k++;
    }
    words.push(line.slice(j, k));
    i = k;
  }
};

/** Shuffles `items` in place (Fisher–Yates: `below(i + 1)` from the last item down). */
export const fisherYates = <T>(random: GenRandom, items: T[]): T[] => {
  for (let i = items.length - 1; i > 0; i--) {
    const j = random.below(i + 1);
    [items[i], items[j]] = [items[j], items[i]];
  }
  return items;
};

/** A line with its words shuffled; the spaces stay where they are. A line of one word or none is kept. */
export const shuffleLineWords = (random: GenRandom, line: string): string => {
  const { gaps, words } = splitWords(line);
  if (words.length < 2) {
    return line;
  }
  fisherYates(random, words);
  let result = gaps[0];
  words.forEach((word, i) => {
    result += word + gaps[i + 1];
  });
  return result;
};

/**
 * DATEX-024: shuffles the words of every line of the selection independently (`a b c d` →
 * `c a d b`); the spaces, the indentation and the line breaks (LF / CRLF / CR) stay in place.
 */
export const shuffleWords = (random: GenRandom, text: string, budget: number): string => {
  // The result is as long as the selection.
  new GenOutputBuffer(budget).reserve(text.length);
  let result = '';
  forEachLine(text, (line, lineBreak) => {
    result += shuffleLineWords(random, line) + lineBreak;
  });
  return result;
};
