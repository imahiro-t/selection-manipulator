/**
 * DEV-023..025, DEV-028..029: small code rewrites (vscode-independent).
 *
 * The JavaScript commands work on the tokens of devJsLexer (never on the evaluated code), the
 * version and permission commands on each line. Nothing is evaluated or run; every function is
 * linear in the length of its input (plus the sort of DEV-024), and the regular expressions are
 * constants anchored at both ends without nested quantifiers.
 */
import { DevInputError, DevOutputBuffer, isBlank, quoteText, splitDevLines } from './devCommon';
import { isTrivia, JsToken, tokenizeJs } from './devJsLexer';

/** Words that never end an expression (a line after them continues the same statement). */
const JS_KEYWORDS = new Set([
  'break', 'case', 'catch', 'class', 'const', 'continue', 'debugger', 'default', 'delete', 'do',
  'else', 'export', 'extends', 'finally', 'for', 'function', 'if', 'import', 'in', 'instanceof',
  'let', 'new', 'return', 'switch', 'throw', 'try', 'typeof', 'var', 'void', 'while', 'with',
  'yield', 'await', 'async', 'of', 'static', 'get', 'set',
]);

const isPunct = (token: JsToken | undefined, text: string): boolean => token?.kind === 'punct' && token.text === text;

/** The index of the next token at or after `index` that is not a space (line breaks count). */
const skipSpaces = (tokens: readonly JsToken[], index: number): number => {
  let i = index;
  while (i < tokens.length && tokens[i].kind === 'space') {
    i++;
  }
  return i;
};

/** The index of the next token at or after `index` that is not a space, line break or comment. */
const skipTrivia = (tokens: readonly JsToken[], index: number): number => {
  let i = index;
  while (i < tokens.length && isTrivia(tokens[i])) {
    i++;
  }
  return i;
};

/**
 * For every `)`, whether its `(` follows `if`, `for`, `while` or `with` (a statement that takes the
 * next statement as its body). Indexed by the token index of the `)`.
 */
const controlHeaderEnds = (tokens: readonly JsToken[]): Set<number> => {
  const ends = new Set<number>();
  const open: boolean[] = [];
  let previous: JsToken | undefined;
  tokens.forEach((token, index) => {
    if (token.kind === 'punct' && token.text === '(') {
      open.push(previous?.kind === 'word' && ['if', 'for', 'while', 'with'].includes(previous.text));
    } else if (token.kind === 'punct' && token.text === ')') {
      if (open.pop() === true) {
        ends.add(index);
      }
    }
    if (!isTrivia(token)) {
      previous = token;
    }
  });
  return ends;
};

/**
 * For every opening bracket, the index of the bracket that closes it (-1 when it is not closed or
 * closed by a different bracket). Computed once with a stack, so finding the end of any call is
 * linear in total.
 */
const matchingBrackets = (tokens: readonly JsToken[]): Map<number, number> => {
  const matches = new Map<number, number>();
  const open: number[] = [];
  const pairs: Record<string, string> = { ')': '(', ']': '[', '}': '{' };
  tokens.forEach((token, index) => {
    if (token.kind !== 'punct') {
      return;
    }
    if (token.text === '(' || token.text === '[' || token.text === '{') {
      open.push(index);
      matches.set(index, -1);
    } else if (token.text in pairs && Object.prototype.hasOwnProperty.call(pairs, token.text)) {
      const opener = open.pop();
      if (opener !== undefined && tokens[opener].text === pairs[token.text]) {
        matches.set(opener, index);
      }
    }
  });
  return matches;
};

// ---------------------------------------------------------------------------------------------
// DEV-023 remove console.log / console.debug statements
// ---------------------------------------------------------------------------------------------

/**
 * DEV-023: removes the lines that hold nothing but a `console.log(…)` or `console.debug(…)` call
 * (optionally followed by `;` and a `// comment`). A call whose arguments span several lines is
 * removed with all its lines; the end of the call is found on the tokens, so parentheses in
 * strings, template literals, comments and regular expressions do not count. A call that shares
 * its line with other code, or that is the body of `if (…)`, `for (…)`, `while (…)`, `else`, `do`
 * or an arrow function (removing it would change what the code does), is kept.
 */
export const removeConsoleLog = (text: string, budget: number): string => {
  const tokens = tokenizeJs(text);
  const controlEnds = controlHeaderEnds(tokens);
  const brackets = matchingBrackets(tokens);
  // [start, end) ranges of the text to remove, in order.
  const removed: [number, number][] = [];
  let reachedEnd = false;
  let lineStart = 0;
  let lineStartToken = 0;
  let previousCode = -1;
  let i = 0;
  while (i < tokens.length) {
    const first = skipSpaces(tokens, i);
    const token = tokens[first];
    const call = token !== undefined ? consoleCall(tokens, first, brackets) : -1;
    if (call >= 0 && canRemoveAfter(tokens, previousCode, controlEnds)) {
      // `call` is the index of the line break after the call (or tokens.length at the end).
      const end = call < tokens.length ? tokens[call].end : text.length;
      removed.push([lineStart, end]);
      reachedEnd ||= call >= tokens.length;
      i = call + 1;
      lineStart = end;
      lineStartToken = i;
      continue;
    }
    // Skip to the next line.
    let j = lineStartToken;
    for (; j < tokens.length && tokens[j].kind !== 'newline'; j++) {
      if (!isTrivia(tokens[j])) {
        previousCode = j;
      }
    }
    i = j + 1;
    lineStart = j < tokens.length ? tokens[j].end : text.length;
    lineStartToken = i;
  }
  const out = new DevOutputBuffer(budget);
  let kept = '';
  let position = 0;
  const parts: string[] = [];
  for (const [start, end] of removed) {
    parts.push(text.slice(position, start));
    position = end;
  }
  parts.push(text.slice(position));
  kept = parts.join('');
  if (reachedEnd) {
    // The last line was removed: the line break before it now ends the text and is removed too.
    kept = kept.replace(/(?:\r\n|[\n\r\u2028\u2029])$/, '');
  }
  out.push(kept);
  return out.join();
};

/**
 * When the tokens from `first` are `console.log(…)` / `console.debug(…)` followed only by an
 * optional `;`, spaces and an optional comment up to the end of the line, the index of the line
 * break token after it (tokens.length at the end of the text); otherwise -1.
 */
const consoleCall = (tokens: readonly JsToken[], first: number, brackets: Map<number, number>): number => {
  const word = tokens[first];
  if (word.kind !== 'word' || word.text !== 'console') {
    return -1;
  }
  let i = skipSpaces(tokens, first + 1);
  if (!isPunct(tokens[i], '.')) {
    return -1;
  }
  i = skipSpaces(tokens, i + 1);
  const method = tokens[i];
  if (method?.kind !== 'word' || (method.text !== 'log' && method.text !== 'debug')) {
    return -1;
  }
  i = skipSpaces(tokens, i + 1);
  if (!isPunct(tokens[i], '(')) {
    return -1;
  }
  const close = brackets.get(i) ?? -1;
  if (close < 0) {
    return -1;
  }
  i = skipSpaces(tokens, close + 1);
  if (isPunct(tokens[i], ';')) {
    i = skipSpaces(tokens, i + 1);
  }
  if (tokens[i]?.kind === 'comment' && tokens[i].text.startsWith('//')) {
    i++;
  }
  return i >= tokens.length || tokens[i].kind === 'newline' ? i : -1;
};

/**
 * Whether a statement that starts after the token `previous` (index; -1 = none) can be removed
 * without changing the meaning of the code before it: it must not be the body of a control
 * statement or an arrow function, nor the continuation of an unfinished expression.
 */
const canRemoveAfter = (tokens: readonly JsToken[], previous: number, controlEnds: Set<number>): boolean => {
  if (previous < 0) {
    return true;
  }
  const token = tokens[previous];
  switch (token.kind) {
    case 'punct':
      if (token.text === ')') {
        return !controlEnds.has(previous);
      }
      return token.text === ';' || token.text === '{' || token.text === '}' || token.text === ']';
    case 'word':
      return !JS_KEYWORDS.has(token.text);
    default:
      return true;
  }
};

// ---------------------------------------------------------------------------------------------
// DEV-024 sort import statements
// ---------------------------------------------------------------------------------------------

interface ImportStatement {
  /** The module specifier (the text inside its quotes). */
  specifier: string;
  /** `import 'm'`: kept in place, it separates the groups that are sorted. */
  sideEffect: boolean;
  /** The index of the line break token after the statement's last line (tokens.length at the end). */
  lineBreak: number;
}

/** Tokens that may appear between `import` and `from`. */
const isImportClauseToken = (token: JsToken): boolean =>
  isTrivia(token) || token.kind === 'word' || token.kind === 'string'
  || (token.kind === 'punct' && ['{', '}', ',', '*'].includes(token.text));

/** The rest of an import after its specifier: `with { … }` / `assert { … }`, `;`, then only a comment. */
const importTail = (tokens: readonly JsToken[], index: number): number => {
  let i = skipSpaces(tokens, index);
  const word = tokens[i];
  if (word?.kind === 'word' && (word.text === 'with' || word.text === 'assert')) {
    i = skipTrivia(tokens, i + 1);
    if (!isPunct(tokens[i], '{')) {
      return -1;
    }
    for (i++; i < tokens.length && !isPunct(tokens[i], '}'); i++) {
      const token = tokens[i];
      const allowed = isTrivia(token) || (token.kind === 'word' && token.text !== 'import') || token.kind === 'string'
        || isPunct(token, ':') || isPunct(token, ',');
      if (!allowed) {
        return -1;
      }
    }
    if (i >= tokens.length) {
      return -1;
    }
    i = skipSpaces(tokens, i + 1);
  }
  if (isPunct(tokens[i], ';')) {
    i = skipSpaces(tokens, i + 1);
  }
  while (tokens[i]?.kind === 'comment' && !/[\n\r\u2028\u2029]/.test(tokens[i].text)) {
    i = skipSpaces(tokens, i + 1);
  }
  return i >= tokens.length || tokens[i].kind === 'newline' ? i : -1;
};

/** The import statement that starts at the token `first` (the first token of its line), if any. */
const importAt = (tokens: readonly JsToken[], first: number): ImportStatement | undefined => {
  const keyword = tokens[first];
  if (keyword?.kind !== 'word' || keyword.text !== 'import') {
    return undefined;
  }
  let i = skipTrivia(tokens, first + 1);
  const next = tokens[i];
  if (next === undefined) {
    return undefined;
  }
  if (next.kind === 'string') {
    const lineBreak = importTail(tokens, i + 1);
    return lineBreak < 0 ? undefined : { specifier: next.text.slice(1, -1), sideEffect: true, lineBreak };
  }
  // `import x from 'm'`, `import { a, b as c } from 'm'`, `import * as m from 'm'`, `import type …`.
  let depth = 0;
  for (; i < tokens.length; i++) {
    const token = tokens[i];
    // Another `import` ends the search, so that every token is looked at by one statement only.
    if (!isImportClauseToken(token) || (token.kind === 'word' && token.text === 'import')) {
      return undefined;
    }
    if (isPunct(token, '{')) {
      depth++;
    } else if (isPunct(token, '}')) {
      depth--;
    } else if (depth === 0 && token.kind === 'word' && token.text === 'from' && i > first + 1) {
      const specifier = skipTrivia(tokens, i + 1);
      if (tokens[specifier]?.kind === 'string') {
        const lineBreak = importTail(tokens, specifier + 1);
        return lineBreak < 0 ? undefined : { specifier: tokens[specifier].text.slice(1, -1), sideEffect: false, lineBreak };
      }
    }
  }
  return undefined;
};

interface ImportUnit {
  statement: ImportStatement;
  /** The lines of the statement without the line break after them. */
  text: string;
  /** The line break after the statement (`''` at the end of the text). */
  lineBreak: string;
}

const compareSpecifiers = (a: ImportUnit, b: ImportUnit): number => {
  const x = a.statement.specifier;
  const y = b.statement.specifier;
  const lowerX = x.toLowerCase();
  const lowerY = y.toLowerCase();
  if (lowerX !== lowerY) {
    return lowerX < lowerY ? -1 : 1;
  }
  return x === y ? 0 : x < y ? -1 : 1;
};

/**
 * DEV-024: sorts each run of consecutive JavaScript / TypeScript `import` statements (one or more
 * whole lines each, multi-line `import { … } from 'm'` included) by module specifier: ignoring
 * case, then by code unit, keeping the original order of equal specifiers. A blank line, a comment
 * line or any other line ends a run, and so does a side-effect import (`import 'm'`), which never
 * moves: the order in which such modules load can matter. The statements themselves and the line
 * breaks are not changed.
 */
export const sortImports = (text: string, budget: number): string => {
  const tokens = tokenizeJs(text);
  const out = new DevOutputBuffer(budget);
  let run: ImportUnit[] = [];
  const flush = (): void => {
    const sorted = [...run].sort(compareSpecifiers);
    sorted.forEach((unit, index) => out.push(unit.text + run[index].lineBreak));
    run = [];
  };
  let lineStart = 0;
  let i = 0;
  while (i < tokens.length || lineStart < text.length) {
    const first = skipSpaces(tokens, i);
    const statement = first < tokens.length ? importAt(tokens, first) : undefined;
    let lineBreakIndex: number;
    if (statement !== undefined) {
      lineBreakIndex = statement.lineBreak;
    } else {
      lineBreakIndex = i;
      while (lineBreakIndex < tokens.length && tokens[lineBreakIndex].kind !== 'newline') {
        lineBreakIndex++;
      }
    }
    const end = lineBreakIndex < tokens.length ? tokens[lineBreakIndex].start : text.length;
    const lineBreak = lineBreakIndex < tokens.length ? tokens[lineBreakIndex].text : '';
    const unit = { text: text.slice(lineStart, end), lineBreak };
    if (statement !== undefined && !statement.sideEffect) {
      run.push({ ...unit, statement });
    } else {
      flush();
      out.push(unit.text + unit.lineBreak);
    }
    i = lineBreakIndex + 1;
    lineStart = end + lineBreak.length;
    if (lineBreakIndex >= tokens.length) {
      break;
    }
  }
  flush();
  return out.join();
};

// ---------------------------------------------------------------------------------------------
// DEV-025 string concatenation → template literal
// ---------------------------------------------------------------------------------------------

/** Operators that bind as loosely as the binary `+` or more loosely: splitting at `+` would change the meaning. */
const LOOSE_OPERATORS = new Set([
  '==', '!=', '===', '!==', '<', '>', '<=', '>=', '<<', '>>', '>>>', '&', '|', '^', '&&', '||', '??',
  '?', ':', '=', '+=', '-=', '*=', '/=', '%=', '**=', '<<=', '>>=', '>>>=', '&=', '|=', '^=',
  '&&=', '||=', '??=', '=>', ',', '++', '--', '...', ';', '/', '/=',
]);
/** Punctuators allowed at the top level of a term (they bind more tightly than `+`). */
const TIGHT_OPERATORS = new Set(['*', '%', '**', '.', '?.', '!', '~', '(', ')', '[', ']', '{', '}', '#']);
/** Words that cannot be part of a term of the concatenation. */
const STATEMENT_WORDS = new Set([
  'in', 'instanceof', 'yield', 'return', 'throw', 'const', 'let', 'var', 'if', 'else', 'for',
  'while', 'do', 'switch', 'case', 'default', 'break', 'continue', 'try', 'catch', 'finally', 'with',
  'export', 'debugger',
]);
/** Words after which a `+` or `-` is unary. */
const OPERATOR_WORDS = new Set(['typeof', 'void', 'delete', 'await', 'new', 'in', 'instanceof', 'return', 'yield', 'throw', 'case']);

/** Whether the token ends an operand (so a following `+` / `-` is binary). */
const endsOperand = (token: JsToken | undefined): boolean => {
  if (token === undefined) {
    return false;
  }
  switch (token.kind) {
    case 'word':
      return !OPERATOR_WORDS.has(token.text);
    case 'punct':
      return token.text === ')' || token.text === ']' || token.text === '}';
    default:
      return true;
  }
};

const PARENTHESES_HINT = 'wrap that part in parentheses or select only the concatenation';

/**
 * The text of a `'…'` / `"…"` literal for a template literal: the escaped quotes are unescaped, `` ` ``
 * and `${` are escaped, and every other escape (`\n`, `\\`, `\x41`, a line continuation …) is kept.
 */
const stringToTemplateText = (literal: string): string => {
  const inner = literal.slice(1, -1);
  let result = '';
  for (let i = 0; i < inner.length; i++) {
    const ch = inner[i];
    if (ch === '\\') {
      const next = inner[i + 1];
      if (next === '\'' || next === '"') {
        result += next;
      } else if ((next >= '1' && next <= '9') || (next === '0' && inner[i + 2] >= '0' && inner[i + 2] <= '9')) {
        throw new DevInputError(`the string ${quoteText(literal)} has an octal escape (\\${next}), which a template literal does not allow`);
      } else {
        result += ch + next;
      }
      i++;
    } else if (ch === '`') {
      result += '\\`';
    } else if (ch === '$' && inner[i + 1] === '{') {
      result += '\\$';
    } else {
      result += ch;
    }
  }
  return result;
};

/**
 * DEV-025: `'Hi ' + name + '!'` → `` `Hi ${name}!` ``. The expression is split at its top-level
 * binary `+` (not inside brackets, strings or template literals). `'…'` / `"…"` terms become text,
 * untagged template literal terms are put in as they are, and every other term becomes `${term}`;
 * several terms before the first string literal stay together (`${1 + 2}`), as JavaScript adds
 * them before the string. The spaces around the expression and a `;` after it are kept.
 *
 * To keep the meaning, an expression is refused when its top level holds an operator that binds
 * as loosely as `+` or more loosely (binary `-`, comparisons, `&&`, `??`, `?:`, `=`, `,`, `in` …),
 * or a `/` (a division cannot always be told apart from a regular expression).
 */
export const concatToTemplate = (text: string, budget: number): string => {
  const tokens = tokenizeJs(text);
  let first = 0;
  while (first < tokens.length && (tokens[first].kind === 'space' || tokens[first].kind === 'newline')) {
    first++;
  }
  let last = tokens.length - 1;
  while (last >= first && (tokens[last].kind === 'space' || tokens[last].kind === 'newline')) {
    last--;
  }
  if (last >= first && isPunct(tokens[last], ';')) {
    last--;
    while (last >= first && (tokens[last].kind === 'space' || tokens[last].kind === 'newline')) {
      last--;
    }
  }
  // Terms as [first token, last token] (inclusive).
  const terms: [number, number][] = [];
  let termStart = first;
  let depth = 0;
  let previous: JsToken | undefined;
  for (let i = first; i <= last; i++) {
    const token = tokens[i];
    if (token.kind === 'comment') {
      throw new DevInputError('the expression holds a comment: remove it first');
    }
    if (isTrivia(token)) {
      continue;
    }
    if (token.kind === 'punct') {
      if (token.text === '(' || token.text === '[' || token.text === '{') {
        depth++;
      } else if (token.text === ')' || token.text === ']' || token.text === '}') {
        depth--;
        if (depth < 0) {
          throw new DevInputError(`the brackets are not balanced: ${quoteText(token.text)} has no opening bracket`);
        }
      } else if (depth === 0) {
        const binary = endsOperand(previous);
        if (token.text === '+' && binary) {
          terms.push([termStart, i - 1]);
          termStart = i + 1;
          previous = token;
          continue;
        }
        if (token.text === '-' && binary) {
          throw new DevInputError(`the expression has a top-level binary "-", which binds as loosely as "+": ${PARENTHESES_HINT}`);
        }
        if (LOOSE_OPERATORS.has(token.text) || !(TIGHT_OPERATORS.has(token.text) || token.text === '+' || token.text === '-')) {
          const hint = token.text === '/' || token.text === '/='
            ? 'a "/" cannot always be told apart from a regular expression'
            : `it binds as loosely as "+" or more loosely`;
          throw new DevInputError(`the expression has a top-level "${token.text}" (${hint}): ${PARENTHESES_HINT}`);
        }
      }
    } else if (depth === 0 && token.kind === 'regex') {
      throw new DevInputError(`the expression has a top-level "/" (a division cannot always be told apart from a regular expression): ${PARENTHESES_HINT}`);
    } else if (depth === 0 && token.kind === 'word' && STATEMENT_WORDS.has(token.text)) {
      throw new DevInputError(`the expression has a top-level "${token.text}": ${PARENTHESES_HINT}`);
    }
    previous = token;
  }
  if (depth !== 0) {
    throw new DevInputError('the brackets are not balanced');
  }
  terms.push([termStart, last]);
  const trimmed = terms.map(([start, end]): [number, number] => {
    let s = start;
    let e = end;
    while (s <= e && isTrivia(tokens[s])) {
      s++;
    }
    while (e >= s && isTrivia(tokens[e])) {
      e--;
    }
    if (s > e) {
      throw new DevInputError('a "+" has nothing on one side');
    }
    return [s, e];
  });
  const isStringTerm = ([s, e]: [number, number]): boolean => s === e && (tokens[s].kind === 'string' || tokens[s].kind === 'template');
  const firstString = trimmed.findIndex(isStringTerm);
  if (firstString < 0) {
    throw new DevInputError('the expression has no string literal (\'…\', "…" or `…`) to join');
  }
  const out = new DevOutputBuffer(budget);
  out.push(text.slice(0, tokens[first].start));
  out.push('`');
  if (firstString > 0) {
    // The terms before the first string are added together first: `1 + 2 + 'a'` is "3a".
    out.push(`\${${text.slice(tokens[trimmed[0][0]].start, tokens[trimmed[firstString - 1][1]].end)}}`);
  }
  for (const term of trimmed.slice(firstString)) {
    const [s, e] = term;
    const source = text.slice(tokens[s].start, tokens[e].end);
    if (!isStringTerm(term)) {
      out.push(`\${${source}}`);
    } else if (tokens[s].kind === 'template') {
      out.push(source.slice(1, -1));
    } else {
      out.push(stringToTemplateText(source));
    }
  }
  out.push('`');
  out.push(text.slice(tokens[last].end));
  return out.join();
};

// ---------------------------------------------------------------------------------------------
// DEV-028 bump a semantic version
// ---------------------------------------------------------------------------------------------

export type SemverPart = 'major' | 'minor' | 'patch';

const NUMERIC_IDENTIFIER = /^(?:0|[1-9][0-9]*)$/;
const DIGITS = /^[0-9]+$/;
const IDENTIFIER = /^[0-9A-Za-z-]+$/;

interface Semver {
  prefix: string;
  major: bigint;
  minor: bigint;
  patch: bigint;
  prerelease: string[];
}

/** A SemVer 2.0.0 version with an optional `v` / `V` before it, or undefined. */
const parseSemver = (value: string): Semver | undefined => {
  let rest = value;
  let prefix = '';
  if (rest.startsWith('v') || rest.startsWith('V')) {
    prefix = rest[0];
    rest = rest.slice(1);
  }
  const plus = rest.indexOf('+');
  if (plus >= 0) {
    const build = rest.slice(plus + 1).split('.');
    if (!build.every((identifier) => IDENTIFIER.test(identifier))) {
      return undefined;
    }
    rest = rest.slice(0, plus);
  }
  const dash = rest.indexOf('-');
  let prerelease: string[] = [];
  if (dash >= 0) {
    prerelease = rest.slice(dash + 1).split('.');
    const valid = prerelease.every((identifier) =>
      IDENTIFIER.test(identifier) && (!DIGITS.test(identifier) || NUMERIC_IDENTIFIER.test(identifier)));
    if (!valid) {
      return undefined;
    }
    rest = rest.slice(0, dash);
  }
  const numbers = rest.split('.');
  if (numbers.length !== 3 || !numbers.every((number) => NUMERIC_IDENTIFIER.test(number))) {
    return undefined;
  }
  return { prefix, major: BigInt(numbers[0]), minor: BigInt(numbers[1]), patch: BigInt(numbers[2]), prerelease };
};

/** The next version, by the rules of npm's `semver.inc`; the build metadata is dropped. */
const bump = (version: Semver, part: SemverPart): string => {
  let { major, minor, patch } = version;
  const pre = version.prerelease.length > 0;
  if (part === 'major') {
    // 1.0.0-rc.1 → 1.0.0 (the release it leads to); otherwise the next major.
    if (minor !== 0n || patch !== 0n || !pre) {
      major++;
    }
    minor = 0n;
    patch = 0n;
  } else if (part === 'minor') {
    if (patch !== 0n || !pre) {
      minor++;
    }
    patch = 0n;
  } else if (!pre) {
    patch++;
  }
  return `${version.prefix}${major}.${minor}.${patch}`;
};

/**
 * DEV-028: raises the `choice` part (`patch`, `minor` or `major`) of the SemVer 2.0.0 version on
 * each line (`v1.2.3`, `1.0.0-rc.1+build.5` …). Empty lines and the spaces around a version are
 * kept. The numbers can be of any size.
 */
export const semverBump = (text: string, part: SemverPart, budget: number): string => {
  const out = new DevOutputBuffer(budget);
  const lines = splitDevLines(text);
  lines.forEach((line, index) => {
    if (isBlank(line.text)) {
      out.push(line.text + line.lineBreak);
      return;
    }
    const start = line.text.length - line.text.trimStart().length;
    const end = line.text.trimEnd().length;
    const value = line.text.slice(start, end);
    const version = parseSemver(value);
    if (version === undefined) {
      const where = lines.length > 1 ? `line ${index + 1}: ` : '';
      throw new DevInputError(`${where}${quoteText(value)} is not a semantic version (MAJOR.MINOR.PATCH, e.g. 1.2.3 or v1.2.3-rc.1)`);
    }
    out.push(line.text.slice(0, start) + bump(version, part) + line.text.slice(end) + line.lineBreak);
  });
  return out.join();
};

// ---------------------------------------------------------------------------------------------
// DEV-029 chmod numeric ↔ symbolic
// ---------------------------------------------------------------------------------------------

const OCTAL_MODE = /^[0-7]{3,4}$/;
const SYMBOLIC_MODE = /^[-dlbcpsDw]?[r-][w-][xsS-][r-][w-][xsS-][r-][w-][xtT-][.+@]?$/;

/** `755` → `rwxr-xr-x`, `4755` → `rwsr-xr-x`. */
const numericToSymbolic = (value: string): string => {
  const digits = value.padStart(4, '0');
  const special = Number(digits[0]);
  const specials = [[4, 's', 'S'], [2, 's', 'S'], [1, 't', 'T']] as const;
  return [1, 2, 3].map((position, index) => {
    const bits = Number(digits[position]);
    const [flag, set, unset] = specials[index];
    const execute = bits & 1;
    const x = (special & flag) !== 0 ? (execute ? set : unset) : (execute ? 'x' : '-');
    return `${bits & 4 ? 'r' : '-'}${bits & 2 ? 'w' : '-'}${x}`;
  }).join('');
};

/** `rwxr-xr-x` / `-rwxr-xr-x` / `drwsr-xr-x+` → `755` / `4755`. */
const symbolicToNumeric = (value: string): string => {
  // The 9 permission characters (without the file type and the ACL / attribute mark of `ls -l`).
  const start = value.length === 9 || (value.length === 10 && /[.+@]$/.test(value)) ? 0 : 1;
  const perms = value.slice(start, start + 9);
  let special = 0;
  const digits = [0, 3, 6].map((offset, index) => {
    const x = perms[offset + 2];
    if (x === 's' || x === 'S' || x === 't' || x === 'T') {
      special |= [4, 2, 1][index];
    }
    return (perms[offset] === 'r' ? 4 : 0) + (perms[offset + 1] === 'w' ? 2 : 0) + (x === 'x' || x === 's' || x === 't' ? 1 : 0);
  });
  return `${special > 0 ? special : ''}${digits.join('')}`;
};

const chmodValue = (value: string): string | undefined => {
  if (OCTAL_MODE.test(value)) {
    return numericToSymbolic(value);
  }
  if (SYMBOLIC_MODE.test(value) && value.length >= 9 && value.length <= 11) {
    return symbolicToNumeric(value);
  }
  return undefined;
};

/**
 * DEV-029: converts each line between the numeric (`755`, `4755` with setuid / setgid / sticky)
 * and the symbolic (`rwxr-xr-x`, also with the file type of `ls -l` such as `-rwxr-xr-x` or
 * `drwxr-xr-x`) permission notation. Empty lines and the spaces around a mode are kept.
 */
export const chmodConvert = (text: string, budget: number): string => {
  const out = new DevOutputBuffer(budget);
  const lines = splitDevLines(text);
  lines.forEach((line, index) => {
    if (isBlank(line.text)) {
      out.push(line.text + line.lineBreak);
      return;
    }
    const start = line.text.length - line.text.trimStart().length;
    const end = line.text.trimEnd().length;
    const value = line.text.slice(start, end);
    const converted = chmodValue(value);
    if (converted === undefined) {
      const where = lines.length > 1 ? `line ${index + 1}: ` : '';
      throw new DevInputError(`${where}${quoteText(value)} is not a file mode (755, 4755, rwxr-xr-x or -rwxr-xr-x)`);
    }
    out.push(line.text.slice(0, start) + converted + line.text.slice(end) + line.lineBreak);
  });
  return out.join();
};
