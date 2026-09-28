/**
 * Pure case / naming-convention transforms used by the extended case commands
 * (CASE-001 .. CASE-030). This module must not import `vscode` so that it can be
 * unit-tested directly.
 *
 * Every transform returns '' for '' (empty selections are left untouched).
 *
 * ReDoS note: all regular expressions below are applied only to the selected
 * text (never to user-supplied patterns) and are written so that backtracking
 * can only restart from a fixed character (a delimiter, a line start or a
 * sentence terminator). Anything that would need a "quantifier followed by a
 * look-ahead to the end" is implemented as a hand-written backwards scan.
 */
import * as changeCase from 'change-case';

// ---------------------------------------------------------------------------
// Small helpers
// ---------------------------------------------------------------------------

const isAsciiUpper = (code: number): boolean => code >= 65 && code <= 90;
const isAsciiLower = (code: number): boolean => code >= 97 && code <= 122;
const isAsciiAlpha = (code: number): boolean => isAsciiUpper(code) || isAsciiLower(code);
const isWhitespace = (ch: string): boolean => ch.trim() === '';

/** Upper-cases the first cased character of `word`, leaving the rest unchanged. */
const upperFirstCased = (word: string): string => {
  let index = 0;
  for (const ch of word) {
    if (ch.toUpperCase() !== ch.toLowerCase()) {
      return word.slice(0, index) + ch.toUpperCase() + word.slice(index + ch.length);
    }
    index += ch.length;
  }
  return word;
};

/** Words of `value` as split by change-case v4 (lower-cased, non-ASCII dropped). */
const noCaseWords = (value: string): string[] =>
  changeCase.noCase(value).split(' ').filter((word) => word.length > 0);

const capitalizeAsciiWord = (word: string): string =>
  word.length === 0 ? word : word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();

/** Replaces the first non-whitespace code point of `value` using `fn`. */
const mapFirstNonWhitespace = (value: string, fn: (ch: string) => string): string => {
  let index = 0;
  for (const ch of value) {
    if (!isWhitespace(ch)) {
      return value.slice(0, index) + fn(ch) + value.slice(index + ch.length);
    }
    index += ch.length;
  }
  return value;
};

// ---------------------------------------------------------------------------
// CASE-001 .. CASE-005: case-only changes (delimiters are kept)
// ---------------------------------------------------------------------------

/** CASE-001: `Hello World` -> `hELLO wORLD`. */
export const swapCase = (value: string): string => {
  let result = '';
  for (const ch of value) {
    const upper = ch.toUpperCase();
    result += ch !== upper ? upper : ch.toLowerCase();
  }
  return result;
};

/** A whitespace-separated token that is an all-caps acronym (`API`, `HTTP2`, `URL.`) or the pronoun `I`. */
const isPreservedToken = (token: string): boolean => {
  let casedLetters = 0;
  let letters = '';
  for (const ch of token) {
    if (ch.toUpperCase() !== ch.toLowerCase()) {
      if (ch !== ch.toUpperCase()) {
        return false; // contains a lower-case letter
      }
      casedLetters++;
      letters += ch;
    }
  }
  return casedLetters >= 2 || letters === 'I';
};

/** CASE-002: `the API URL is ready` -> `The API URL is ready`. */
export const sentenceCasePreserveAcronyms = (value: string): string => {
  const lowered = value
    .split(/(\s+)/)
    .map((token) => (token.trim() === '' || isPreservedToken(token) ? token : token.toLowerCase()))
    .join('');
  return upperFirstCased(lowered);
};

/** APA 7th: articles, coordinating conjunctions and prepositions of three letters or fewer. */
const APA_MINOR_WORDS: ReadonlySet<string> = new Set([
  'a', 'an', 'the', 'and', 'but', 'or', 'nor', 'for', 'so', 'yet',
  'as', 'at', 'by', 'in', 'of', 'off', 'on', 'per', 'to', 'up', 'via', 'vs',
]);

/** Strips leading / trailing non-letters with a linear scan (no regex). */
const coreLetters = (token: string): string => {
  let start = 0;
  let end = token.length;
  while (start < end && !isAsciiAlpha(token.charCodeAt(start))) {
    start++;
  }
  while (end > start && !isAsciiAlpha(token.charCodeAt(end - 1))) {
    end--;
  }
  return token.slice(start, end).toLowerCase();
};

/** CASE-003: `a guide through the woods` -> `A Guide Through the Woods`. */
export const titleCaseApa = (value: string): string => {
  let capitalizeNext = true;
  return value
    .split(/(\s+)/)
    .map((token) => {
      if (token.trim() === '') {
        return token;
      }
      const forceCapital = capitalizeNext;
      const last = token.charAt(token.length - 1);
      capitalizeNext = last === ':' || last === '.' || last === '?' || last === '!';
      if (!forceCapital && APA_MINOR_WORDS.has(coreLetters(token))) {
        return token.toLowerCase();
      }
      return token.split('-').map(upperFirstCased).join('-');
    })
    .join('');
};

/** CASE-004: `hello World` -> `Hello World`. */
export const upperFirst = (value: string): string => mapFirstNonWhitespace(value, (ch) => ch.toUpperCase());

/** CASE-005: `HelloWorld` -> `helloWorld`. */
export const lowerFirst = (value: string): string => mapFirstNonWhitespace(value, (ch) => ch.toLowerCase());

// ---------------------------------------------------------------------------
// CASE-006 .. CASE-013: naming conventions (change-case v4 word splitting)
// ---------------------------------------------------------------------------

/** CASE-006: `userName` -> `USER-NAME`. */
export const cobolCase = (value: string): string => changeCase.paramCase(value).toUpperCase();

/** CASE-007: `user name` -> `User_Name`. */
export const adaCase = (value: string): string => changeCase.capitalCase(value, { delimiter: '_' });

/** CASE-008: `User Name` -> `username`. */
export const flatCase = (value: string): string => changeCase.noCase(value, { delimiter: '' });

/** CASE-009: `user name` -> `USERNAME`. */
export const upperFlatCase = (value: string): string => changeCase.noCase(value, { delimiter: '' }).toUpperCase();

/** CASE-010: `user name id` -> `user_Name_Id`. */
export const camelSnakeCase = (value: string): string =>
  noCaseWords(value)
    .map((word, index) => (index === 0 ? word : capitalizeAsciiWord(word)))
    .join('_');

/** CASE-011: `user name id` -> `User_Name_Id` (alias of Ada_Case). */
export const pascalSnakeCase = (value: string): string => adaCase(value);

/** CASE-012: `one two three` -> `ONE two THREE`. Word numbering restarts per selection. */
export const alternatingWordsCase = (value: string): string => {
  let wordIndex = 0;
  return value
    .split(/(\s+)/)
    .map((token) => {
      if (token.trim() === '') {
        return token;
      }
      const result = wordIndex % 2 === 0 ? token.toUpperCase() : token.toLowerCase();
      wordIndex++;
      return result;
    })
    .join('');
};

/** CASE-013: `portable network graphics` -> `PNG`. */
export const acronymCase = (value: string): string =>
  noCaseWords(value)
    .map((word) => word.charAt(0).toUpperCase())
    .join('');

// ---------------------------------------------------------------------------
// CASE-014 / CASE-015: detection and cycling
// ---------------------------------------------------------------------------

/**
 * Ordered detection patterns. Every pattern is anchored with ^...$ and each
 * repetition begins with a character (delimiter or capital) that the preceding
 * character class cannot consume, so there is only one way to split the input.
 */
const CASE_PATTERNS: ReadonlyArray<readonly [string, RegExp]> = [
  ['--css-variable', /^--[a-z0-9]+(?:-[a-z0-9]+)*$/],
  ['#Hashtag', /^#[A-Z][A-Za-z0-9]*$/],
  ['snake_case', /^[a-z][a-z0-9]*(?:_[a-z0-9]+)+$/],
  ['CONSTANT_CASE', /^[A-Z][A-Z0-9]*(?:_[A-Z0-9]+)+$/],
  ['camel_Snake_Case', /^[a-z][a-z0-9]*(?:_[A-Z][a-z0-9]*)+$/],
  ['Pascal_Snake_Case', /^[A-Z][a-z0-9]*(?:_[A-Z][a-z0-9]*)+$/],
  ['kebab-case', /^[a-z][a-z0-9]*(?:-[a-z0-9]+)+$/],
  ['COBOL-CASE', /^[A-Z][A-Z0-9]*(?:-[A-Z0-9]+)+$/],
  ['Train-Case', /^[A-Z][a-z0-9]*(?:-[A-Z][a-z0-9]*)+$/],
  ['dot.case', /^[a-z][a-z0-9]*(?:\.[a-z0-9]+)+$/],
  ['path/case', /^[a-z][a-z0-9]*(?:\/[a-z0-9]+)+$/],
  ['camelCase', /^[a-z][a-z0-9]*(?:[A-Z][a-z0-9]*)+$/],
  ['PascalCase', /^[A-Z][a-z0-9]+(?:[A-Z][a-z0-9]*)*$/],
  ['flatcase', /^[a-z][a-z0-9]*$/],
  ['UPPERFLATCASE', /^[A-Z][A-Z0-9]*$/],
];

const detectSpacedCase = (text: string): string => {
  const hasLower = /[a-z]/.test(text);
  const hasUpper = /[A-Z]/.test(text);
  if (hasLower && !hasUpper) {
    return 'lower case';
  }
  if (hasUpper && !hasLower) {
    return 'UPPER CASE';
  }
  const letterWords = text
    .split(/\s+/)
    .filter((word) => word.length > 0 && isAsciiAlpha(word.charCodeAt(0)));
  if (letterWords.length === 0) {
    return 'unknown';
  }
  const startsUpper = letterWords.map((word) => isAsciiUpper(word.charCodeAt(0)));
  if (startsUpper.every((upper) => upper)) {
    return 'Title Case';
  }
  if (startsUpper[0] && startsUpper.slice(1).every((upper) => !upper)) {
    return 'Sentence case';
  }
  return 'unknown';
};

/** CASE-014: returns the detected naming convention ('' for blank input, 'unknown' if none). */
export const detectCase = (value: string): string => {
  const text = value.trim();
  if (text === '') {
    return '';
  }
  if (/\s/.test(text)) {
    return detectSpacedCase(text);
  }
  for (const [name, pattern] of CASE_PATTERNS) {
    if (pattern.test(text)) {
      return name;
    }
  }
  return 'unknown';
};

/** CASE-015: camelCase -> snake_case -> kebab-case -> PascalCase -> CONSTANT_CASE -> camelCase. */
export const cycleCase = (value: string): string => {
  switch (detectCase(value)) {
    case '':
      return value;
    case 'camelCase':
      return changeCase.snakeCase(value);
    case 'snake_case':
      return changeCase.paramCase(value);
    case 'kebab-case':
      return changeCase.pascalCase(value);
    case 'PascalCase':
      return changeCase.constantCase(value);
    default:
      // CONSTANT_CASE / UPPERFLATCASE go back to camelCase, and everything
      // outside the cycle starts it from camelCase.
      return changeCase.camelCase(value);
  }
};

// ---------------------------------------------------------------------------
// CASE-016: upper-case known acronyms
// ---------------------------------------------------------------------------

/** Known acronyms (lower-case). Words easily confused with plain English (rest, it, us, ok, io, os, ram) are excluded on purpose. */
export const KNOWN_ACRONYMS: ReadonlySet<string> = new Set([
  'api', 'ascii', 'cli', 'cpu', 'css', 'csv', 'db', 'dns', 'dom', 'ftp',
  'gpu', 'grpc', 'guid', 'html', 'http', 'https', 'id', 'ip', 'jpeg', 'jpg',
  'json', 'jwt', 'pdf', 'png', 'rpc', 'sdk', 'sms', 'smtp', 'sql', 'ssh',
  'ssl', 'svg', 'tcp', 'tls', 'udp', 'ui', 'uri', 'url', 'utf', 'uuid',
  'xml', 'yaml',
]);

/** CASE-016: `userId apiUrl` -> `userID apiURL`. The leading hump of a multi-hump word is kept. */
export const upperKnownAcronyms = (value: string): string =>
  value.replace(/[A-Za-z0-9]+/g, (word) => {
    const humps = word.split(/(?<=[a-z0-9])(?=[A-Z])/);
    return humps
      .map((hump, index) =>
        (humps.length >= 2 && index === 0) || !KNOWN_ACRONYMS.has(hump.toLowerCase()) ? hump : hump.toUpperCase())
      .join('');
  });

// ---------------------------------------------------------------------------
// CASE-017 .. CASE-021: sentences, lines and locales
// ---------------------------------------------------------------------------

/** CASE-017: `hello. how are you? fine.` -> `Hello. How are you? Fine.` */
export const sentenceCaseEach = (value: string): string =>
  value.replace(/(^\s*|[.!?]\s+)(\p{Ll})/gu, (_match, prefix: string, letter: string) => prefix + letter.toUpperCase());

/** CASE-018: upper-cases the first character of each line (after indentation). */
export const capitalizeLines = (value: string): string =>
  value.replace(/^([ \t]*)(\S)/gmu, (_match, indent: string, ch: string) => indent + ch.toUpperCase());

/** CASE-019: lower-cases the first character of each line (after indentation). */
export const lowerLineStart = (value: string): string =>
  value.replace(/^([ \t]*)(\S)/gmu, (_match, indent: string, ch: string) => indent + ch.toLowerCase());

/** CASE-020: `istanbul` (tr) -> `İSTANBUL`. */
export const upperLocale = (value: string, locale: string): string => value.toLocaleUpperCase(locale);

/** CASE-021: `İSTANBUL` (tr) -> `istanbul`. */
export const lowerLocale = (value: string, locale: string): string => value.toLocaleLowerCase(locale);

// ---------------------------------------------------------------------------
// CASE-022 .. CASE-025: JSON keys
// ---------------------------------------------------------------------------

/**
 * Sets an own, enumerable data property without going through `[[Set]]`, so a
 * key such as `__proto__` never swaps the prototype or pollutes Object.prototype.
 */
export const defineSafeProperty = (target: object, key: string, value: unknown): void => {
  Object.defineProperty(target, key, { value, enumerable: true, writable: true, configurable: true });
};

const convertKeysDeep = (value: unknown, keyFn: (key: string) => string): unknown => {
  if (Array.isArray(value)) {
    return value.map((item) => convertKeysDeep(item, keyFn));
  }
  if (value !== null && typeof value === 'object') {
    const result = Object.create(null) as object;
    for (const key of Object.keys(value)) {
      const converted = keyFn(key);
      defineSafeProperty(result, converted === '' ? key : converted, convertKeysDeep((value as Record<string, unknown>)[key], keyFn));
    }
    return result;
  }
  return value;
};

/** Indentation of the second line: a tab, N spaces, or 2 spaces when undetectable. */
const detectIndent = (text: string): string | number => {
  const lines = text.trim().split('\n');
  if (lines.length < 2) {
    return 2;
  }
  const line = lines[1];
  if (line.startsWith('\t')) {
    return '\t';
  }
  let spaces = 0;
  while (spaces < line.length && line.charCodeAt(spaces) === 32) {
    spaces++;
  }
  return spaces > 0 ? Math.min(spaces, 10) : 2;
};

/**
 * CASE-022..025: converts only the object keys of a JSON text, recursively.
 * Values are never changed. Throws when the text is not valid JSON.
 * Leading / trailing whitespace of the selection is preserved.
 */
export const convertJsonKeys = (json: string, keyFn: (key: string) => string): string => {
  const body = json.trim();
  const converted = convertKeysDeep(JSON.parse(body), keyFn);
  const formatted = body.includes('\n')
    ? JSON.stringify(converted, null, detectIndent(body))
    : JSON.stringify(converted);
  const leading = json.slice(0, json.length - json.trimStart().length);
  const trailing = json.slice(leading.length + body.length);
  return leading + formatted + trailing;
};

// ---------------------------------------------------------------------------
// CASE-026, CASE-027, CASE-030: CSS / BEM / hashtag
// ---------------------------------------------------------------------------

/** CASE-026: `primaryColor` -> `--primary-color` (idempotent). */
export const cssVariableCase = (value: string): string => {
  const kebab = changeCase.paramCase(value);
  return kebab === '' ? '' : `--${kebab}`;
};

/** CASE-027: `card title active` -> `card__title--active`. Four or more words join the rest into the modifier. */
export const bemCase = (value: string): string => {
  const words = noCaseWords(value);
  if (words.length === 0) {
    return '';
  }
  const [block, element, ...modifiers] = words;
  let result = block;
  if (element !== undefined) {
    result += `__${element}`;
  }
  if (modifiers.length > 0) {
    result += `--${modifiers.join('-')}`;
  }
  return result;
};

/** CASE-030: `hello world` -> `#HelloWorld`. */
export const hashtagCase = (value: string): string => {
  const pascal = changeCase.pascalCase(value);
  return pascal === '' ? '' : `#${pascal}`;
};

// ---------------------------------------------------------------------------
// CASE-028 / CASE-029: pluralize / singularize
// ---------------------------------------------------------------------------

/** Uncountable nouns (unchanged in both directions). */
export const UNCOUNTABLE_WORDS: ReadonlySet<string> = new Set([
  'aircraft', 'data', 'deer', 'equipment', 'fish', 'hardware', 'information', 'media', 'metadata',
  'money', 'moose', 'news', 'rice', 'series', 'sheep', 'software', 'species',
]);

/** Irregular singular -> plural pairs. */
export const IRREGULAR_PLURALS: ReadonlyArray<readonly [string, string]> = [
  ['person', 'people'], ['man', 'men'], ['woman', 'women'], ['child', 'children'], ['tooth', 'teeth'],
  ['foot', 'feet'], ['mouse', 'mice'], ['goose', 'geese'], ['ox', 'oxen'], ['cactus', 'cacti'],
  ['focus', 'foci'], ['fungus', 'fungi'], ['nucleus', 'nuclei'], ['radius', 'radii'], ['analysis', 'analyses'],
  ['crisis', 'crises'], ['thesis', 'theses'], ['axis', 'axes'], ['index', 'indices'], ['matrix', 'matrices'],
  ['vertex', 'vertices'], ['criterion', 'criteria'], ['phenomenon', 'phenomena'], ['leaf', 'leaves'], ['life', 'lives'],
  ['knife', 'knives'], ['wife', 'wives'], ['half', 'halves'], ['wolf', 'wolves'], ['calf', 'calves'],
  ['shelf', 'shelves'], ['quiz', 'quizzes'], ['potato', 'potatoes'], ['tomato', 'tomatoes'], ['hero', 'heroes'],
  ['echo', 'echoes'], ['movie', 'movies'], ['cookie', 'cookies'],
];

const SINGULAR_TO_PLURAL: ReadonlyMap<string, string> = new Map(IRREGULAR_PLURALS);
const PLURAL_TO_SINGULAR: ReadonlyMap<string, string> = new Map(
  IRREGULAR_PLURALS.map(([singular, plural]) => [plural, singular] as [string, string]));

const isVowel = (ch: string): boolean => ch === 'a' || ch === 'e' || ch === 'i' || ch === 'o' || ch === 'u';
const isConsonant = (ch: string): boolean => ch.length === 1 && isAsciiLower(ch.charCodeAt(0)) && !isVowel(ch);

/** Plural of a lower-case word. */
export const pluralizeWord = (word: string): string => {
  if (UNCOUNTABLE_WORDS.has(word)) {
    return word;
  }
  const irregular = SINGULAR_TO_PLURAL.get(word);
  if (irregular !== undefined) {
    return irregular;
  }
  if (PLURAL_TO_SINGULAR.has(word)) {
    return word;
  }
  if (word.endsWith('s') || word.endsWith('x') || word.endsWith('z') || word.endsWith('ch') || word.endsWith('sh')) {
    return `${word}es`;
  }
  if (word.length >= 2 && word.endsWith('y') && isConsonant(word.charAt(word.length - 2))) {
    return `${word.slice(0, -1)}ies`;
  }
  return `${word}s`;
};

/** Singular of a lower-case word. */
export const singularizeWord = (word: string): string => {
  if (UNCOUNTABLE_WORDS.has(word)) {
    return word;
  }
  const irregular = PLURAL_TO_SINGULAR.get(word);
  if (irregular !== undefined) {
    return irregular;
  }
  if (SINGULAR_TO_PLURAL.has(word)) {
    return word;
  }
  if (word.length >= 5 && word.endsWith('ies')) {
    return `${word.slice(0, -3)}y`;
  }
  if (word.endsWith('ss') || word.endsWith('us') || word.endsWith('is')) {
    return word;
  }
  if (word.length >= 5 && word.endsWith('uses') && isConsonant(word.charAt(word.length - 5))) {
    return word.slice(0, -2);
  }
  if (word.endsWith('sses') || word.endsWith('ches') || word.endsWith('shes') || word.endsWith('xes') || word.endsWith('zzes')) {
    return word.slice(0, -2);
  }
  if (word.endsWith('s')) {
    return word.slice(0, -1);
  }
  return word;
};

/**
 * Range [start, end) of the last run of ASCII letters in `line`, found by a
 * backwards scan (each character is visited at most once). null if none.
 */
export const findLastWordRange = (line: string): { start: number; end: number } | null => {
  let i = line.length - 1;
  while (i >= 0 && !isAsciiAlpha(line.charCodeAt(i))) {
    i--;
  }
  if (i < 0) {
    return null;
  }
  const end = i + 1;
  while (i >= 0 && isAsciiAlpha(line.charCodeAt(i))) {
    i--;
  }
  return { start: i + 1, end };
};

/** Start of the last hump inside the letter run [start, end). */
const findLastHumpStart = (line: string, start: number, end: number): number => {
  let j = end - 1;
  if (isAsciiLower(line.charCodeAt(j))) {
    while (j >= start && isAsciiLower(line.charCodeAt(j))) {
      j--;
    }
    return j >= start && isAsciiUpper(line.charCodeAt(j)) ? j : j + 1;
  }
  while (j >= start && isAsciiUpper(line.charCodeAt(j))) {
    j--;
  }
  return j + 1;
};

/**
 * Re-applies the case shape of `target` (lower / Capitalized / UPPER) to `result`.
 * A single capital letter (`userA`) is treated as Capitalized, giving `userAs`.
 */
const applyShape = (target: string, result: string): string => {
  if (target.length >= 2 && target === target.toUpperCase()) {
    return result.toUpperCase();
  }
  if (isAsciiUpper(target.charCodeAt(0))) {
    return result.charAt(0).toUpperCase() + result.slice(1);
  }
  return result;
};

const inflectLines = (value: string, inflect: (word: string) => string): string =>
  value
    .split('\n')
    .map((line) => {
      const range = findLastWordRange(line);
      if (range === null) {
        return line;
      }
      const humpStart = findLastHumpStart(line, range.start, range.end);
      const target = line.slice(humpStart, range.end);
      const replaced = applyShape(target, inflect(target.toLowerCase()));
      return line.slice(0, humpStart) + replaced + line.slice(range.end);
    })
    .join('\n');

/** CASE-028: pluralizes the last hump of the last word on each line (`category⏎child` -> `categories⏎children`). */
export const pluralize = (value: string): string => inflectLines(value, pluralizeWord);

/** CASE-029: singularizes the last hump of the last word on each line. */
export const singularize = (value: string): string => inflectLines(value, singularizeWord);
