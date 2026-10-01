/**
 * DEVX-010..012: sort CSS declarations, CSS declarations → a React style object and back
 * (vscode-independent).
 *
 * The CSS is read with the linear tokenizer of DEV-018..019 (devCss.ts); the JavaScript object is
 * read with the hand-written literal parser of the DATA commands (`parseJsonLike(…, 'js-object')`).
 * Nothing is evaluated: values become escaped JavaScript string literals or checked CSS text.
 * Nesting is limited to DEV_MAX_NESTING by the tokenizer, and every loop is linear.
 */
import { DataInputError } from './dataCommon';
import { parseJsonLike } from './dataParsers';
import { assertWithinBudget, DevInputError, DevOutputBuffer, quoteText } from './devCommon';
import { CssToken, parseCss, tokenizeCss } from './devCss';
import { toJsPropertyKey, toJsString } from './devLiterals';

// ---------------------------------------------------------------------------------------------
// DEVX-010 Sort declarations
// ---------------------------------------------------------------------------------------------

const isSpaceToken = (token: CssToken): boolean => token.type === 'ws';
const isInsignificant = (token: CssToken): boolean => token.type === 'ws' || token.type === 'comment';
const isTerminator = (token: CssToken): boolean =>
  token.depth === 0 && (token.type === '{' || token.type === '}' || token.type === ';');

/**
 * One declaration of a run: its body (and the comment after it at the end of the same line) moves,
 * the frame (spaces around it and the `;`) stays.
 */
interface Declaration {
  lead: string;
  body: string;
  trail: string;
  terminator: string;
  /**
   * The spaces and comments at the end of the line of the declaration (`' /* about b *\/'`), or
   * `''`: after its `;`, or, for a declaration without `;`, after its last code on the same line.
   */
  note: string;
  key: string;
}

const LINE_BREAK = /[\n\r\f]/;

/**
 * How many tokens at the start of a segment are a comment that ends the line of the declaration
 * before it (`b: 1; /* about b *\/⏎`): spaces without a line break and comments, up to the last
 * comment, when a line break or the end of the segment follows them. 0 when there is no such
 * comment, or when code follows on the same line (`/* z *\/ y: 2` belongs to `y`).
 */
const sameLineNoteLength = (segment: readonly CssToken[]): number => {
  let length = 0;
  for (let k = 0; k < segment.length; k++) {
    const token = segment[k];
    if (token.type === 'comment') {
      length = k + 1;
    } else if (token.type !== 'ws') {
      return 0;
    } else if (LINE_BREAK.test(token.text)) {
      return length;
    }
  }
  return length;
};

/**
 * For a declaration without `;` whose last code token is at `lastCode`: the end of its note, the
 * spaces without a line break and comments after that code on the same line, up to the last
 * comment (`lastCode + 1` when there is no such comment). What follows (a line break and the lines
 * after it) stays in the frame.
 */
const trailingNoteEnd = (segment: readonly CssToken[], lastCode: number): number => {
  let end = lastCode + 1;
  for (let k = lastCode + 1; k < segment.length; k++) {
    const token = segment[k];
    if (token.type === 'comment') {
      end = k + 1;
    } else if (token.type !== 'ws' || LINE_BREAK.test(token.text)) {
      break;
    }
  }
  return end;
};

const joinTokens = (part: readonly CssToken[]): string => part.map((token) => token.text).join('');

/** The property name of a declaration (before its first `:`, comments left out), in lower case. */
const propertyKey = (tokens: readonly CssToken[]): string => {
  let key = '';
  for (const token of tokens) {
    if (token.declColon) {
      break;
    }
    if (!isInsignificant(token)) {
      key += token.text;
    }
  }
  return key.toLowerCase();
};

const compareKeys = (a: Declaration, b: Declaration): number => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0);

/**
 * DEVX-010: the declarations of every block (and of a selected declaration list without braces)
 * sorted by property name (lower case, code point order, stable). Only the declarations move: the
 * spaces and line breaks around each one and the `;` stay where they were, so the layout is kept.
 * A comment right before a declaration moves with it, and so does a comment after its `;` at the
 * end of the same line (`b: 1; /* about b *\/`). For the last declaration without `;`, the comment
 * after it on the same line moves with it too, and goes after the `;` when it moves to a place
 * that has one (`a: 2 /* a *\/` → `a: 2; /* a *\/`); a comment on a later line stays where it is,
 * before the `}`. A comment before the `;` (`b: 1 /* x *\/;`) is part of the body. A nested rule
 * (`@media`, CSS nesting) or an at-rule statement ends a run: declarations are never moved across
 * it. Strings, comments and `url(…)` are copied as they are.
 */
export const cssSortProperties = (text: string, budget: number): string => {
  const tokens = parseCss(text);
  const out = new DevOutputBuffer(budget);
  let run: Declaration[] = [];
  const flush = () => {
    const sorted = [...run].sort(compareKeys);
    run.forEach((frame, i) => {
      const { body, note } = sorted[i];
      // A slot without `;` (the last declaration of a block) gets the comment before its spaces.
      out.push(frame.terminator === '' ? frame.lead + body + note + frame.trail : frame.lead + body + frame.trail + frame.terminator + note);
    });
    run = [];
  };
  let start = 0;
  for (let i = 0; i <= tokens.length; i++) {
    if (i < tokens.length && !isTerminator(tokens[i])) {
      continue;
    }
    let segment = tokens.slice(start, i);
    const previous = run.length > 0 ? run[run.length - 1] : undefined;
    if (previous !== undefined && previous.terminator === ';') {
      const noteLength = sameLineNoteLength(segment);
      previous.note = joinTokens(segment.slice(0, noteLength));
      segment = segment.slice(noteLength);
    }
    const terminator = i < tokens.length ? tokens[i].text : '';
    const first = segment.findIndex((token) => !isInsignificant(token));
    if (first >= 0 && segment[first].segment === 'decl') {
      let bodyStart = 0;
      while (isSpaceToken(segment[bodyStart])) {
        bodyStart++;
      }
      let bodyEnd = segment.length;
      let noteEnd = bodyEnd;
      if (terminator === ';') {
        while (isSpaceToken(segment[bodyEnd - 1])) {
          bodyEnd--;
        }
        noteEnd = bodyEnd;
      } else {
        // No `;`: the comments after the last code on its line are its note, not its body.
        while (isInsignificant(segment[bodyEnd - 1])) {
          bodyEnd--;
        }
        noteEnd = trailingNoteEnd(segment, bodyEnd - 1);
      }
      run.push({
        lead: joinTokens(segment.slice(0, bodyStart)),
        body: joinTokens(segment.slice(bodyStart, bodyEnd)),
        trail: joinTokens(segment.slice(noteEnd)),
        terminator: terminator === ';' ? ';' : '',
        note: joinTokens(segment.slice(bodyEnd, noteEnd)),
        key: propertyKey(segment.slice(first)),
      });
      if (terminator !== ';') {
        flush();
        out.push(terminator);
      }
    } else {
      flush();
      out.push(joinTokens(segment) + terminator);
    }
    start = i + 1;
  }
  flush();
  const result = out.join();
  assertWithinBudget(result.length, budget);
  return result;
};

// ---------------------------------------------------------------------------------------------
// DEVX-011 CSS declarations → style object
// ---------------------------------------------------------------------------------------------

const CSS_PROPERTY = /^-?[A-Za-z][A-Za-z0-9-]*$/;
const CUSTOM_PROPERTY = /^--[A-Za-z0-9_-]+$/;

/** `font-size` → `fontSize`, `-webkit-transition` → `WebkitTransition`, `-ms-transform` → `msTransform` (as React names them). */
const camelProperty = (property: string): string => {
  const lower = property.toLowerCase();
  const parts = (lower.startsWith('-') ? lower.slice(1) : lower).split('-');
  const camel = parts.map((part, i) => (i === 0 ? part : part.charAt(0).toUpperCase() + part.slice(1))).join('');
  if (lower.startsWith('-') && !lower.startsWith('-ms-')) {
    return camel.charAt(0).toUpperCase() + camel.slice(1);
  }
  return camel;
};

/** The value of a declaration: comments and runs of white space become one space; the ends are trimmed. */
const valueText = (tokens: readonly CssToken[]): string => {
  let value = '';
  for (const token of tokens) {
    if (isInsignificant(token)) {
      if (!value.endsWith(' ')) {
        value += ' ';
      }
    } else {
      value += token.text;
    }
  }
  return value.trim();
};

/**
 * DEVX-011: CSS declarations (`prop: value;`, the outer `{ }` optional) → a React style object on
 * one line: `{ fontSize: '12px', color: 'red' }`. Properties are camelCase (vendor prefixes as
 * React writes them), custom properties (`--x`) are quoted keys; every value is a JavaScript
 * string literal (escaped, never evaluated), `!important` included. A property written twice is
 * one key with the last value (in the place of the first). Comments are dropped; a nested block is
 * an error.
 */
export const cssToJsObject = (text: string, budget: number): string => {
  let source = text.trim();
  if (source.startsWith('{') && source.endsWith('}')) {
    source = source.slice(1, -1);
  }
  const tokens = tokenizeCss(source);
  const declarations: CssToken[][] = [];
  let current: CssToken[] = [];
  let depth = 0;
  for (const token of tokens) {
    if (token.type === '{' || token.type === '}') {
      throw new DevInputError('only declarations can be converted: the selection has a nested block');
    }
    if (token.type === '(' || token.type === '[') {
      depth++;
    } else if (token.type === ')' || token.type === ']') {
      depth--;
    }
    if (token.type === ';' && depth === 0) {
      declarations.push(current);
      current = [];
    } else {
      current.push(token);
    }
  }
  declarations.push(current);
  // A property written twice keeps its first place and its last value, as in the object literal.
  const entries = new Map<string, string>();
  let length = 4;
  for (const declaration of declarations) {
    if (declaration.every(isInsignificant)) {
      continue;
    }
    const colon = declaration.findIndex((token) => token.type === ':');
    const property = colon < 0 ? '' : valueText(declaration.slice(0, colon));
    const value = colon < 0 ? '' : valueText(declaration.slice(colon + 1));
    const whole = valueText(declaration);
    if (colon < 0 || value === '') {
      throw new DevInputError(`${quoteText(whole)} is not a declaration (property: value)`);
    }
    let key: string;
    if (CUSTOM_PROPERTY.test(property)) {
      key = toJsString(property);
    } else if (CSS_PROPERTY.test(property)) {
      const camel = camelProperty(property);
      key = toJsPropertyKey(camel);
    } else {
      throw new DevInputError(`${quoteText(property)} is not a CSS property name`);
    }
    const entry = `${key}: ${toJsString(value)}`;
    const replaced = entries.get(key);
    length += entry.length + (replaced === undefined ? 2 : -replaced.length);
    assertWithinBudget(length, budget);
    entries.set(key, entry);
  }
  if (entries.size === 0) {
    throw new DevInputError('the selection has no declarations');
  }
  const result = `{ ${[...entries.values()].join(', ')} }`;
  assertWithinBudget(result.length, budget);
  return result;
};

// ---------------------------------------------------------------------------------------------
// DEVX-012 style object → CSS declarations
// ---------------------------------------------------------------------------------------------

const STYLE_KEY = /^[A-Za-z][A-Za-z0-9]*$/;
const KEBAB_KEY = /^-?[a-z][a-z0-9-]*$/;

/** `fontSize` → `font-size`, `WebkitTransition` → `-webkit-transition`, `msTransform` → `-ms-transform`. */
const kebabProperty = (key: string): string | undefined => {
  if (CUSTOM_PROPERTY.test(key)) {
    return key;
  }
  if (KEBAB_KEY.test(key)) {
    return key;
  }
  if (!STYLE_KEY.test(key)) {
    return undefined;
  }
  const vendor = /^[A-Z]/.test(key) || /^ms[A-Z]/.test(key);
  const kebab = key.replace(/[A-Z]/g, (ch) => `-${ch.toLowerCase()}`);
  return vendor && !kebab.startsWith('-') ? `-${kebab}` : kebab;
};

/** Why a value would break the declaration it is written in, or undefined when it is safe. */
const unsafeValueReason = (value: string): string | undefined => {
  if (/[;{}\r\n\f]/.test(value)) {
    return 'holds ; { } or a line break';
  }
  if (value.includes('/*') || value.includes('<!--') || value.includes('-->')) {
    return 'holds a comment marker';
  }
  let backslashes = 0;
  while (backslashes < value.length && value.charCodeAt(value.length - 1 - backslashes) === 0x5c) {
    backslashes++;
  }
  if (backslashes % 2 === 1) {
    // `\;` would escape the `;` written after the value.
    return 'ends with a backslash';
  }
  let tokens: CssToken[];
  try {
    tokens = tokenizeCss(value);
  } catch {
    return 'has a string or url( that is not closed';
  }
  let depth = 0;
  for (const token of tokens) {
    if (token.type === '(' || token.type === '[') {
      depth++;
    } else if (token.type === ')' || token.type === ']') {
      depth--;
      if (depth < 0) {
        return 'has a bracket that does not match';
      }
    }
  }
  return depth === 0 ? undefined : 'has a bracket that is not closed';
};

/**
 * DEVX-012: a flat JavaScript style object (`{ fontSize: '12px' }`, read without evaluating it) →
 * one CSS declaration per line (`font-size: 12px;`), joined with the document's line break. Keys
 * become kebab-case (`WebkitX` → `-webkit-x`, `msX` → `-ms-x`; `--x` and kebab-case keys stay);
 * numbers are written as they are, without a unit. Nested objects, arrays, booleans, null and
 * values that would break the declaration (`;`, braces, line breaks, comment markers, unclosed
 * strings or brackets) are errors.
 */
export const jsObjectToCss = (text: string, eol: string, budget: number): string => {
  let parsed: unknown;
  try {
    parsed = parseJsonLike(text, 'js-object');
  } catch (error) {
    if (error instanceof DataInputError) {
      throw new DevInputError(`the selection is not a JavaScript object literal: ${error.message}`);
    }
    throw error;
  }
  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new DevInputError('the selection must be a JavaScript object ({ … })');
  }
  const record = parsed as Record<string, unknown>;
  const keys = Object.keys(record);
  if (keys.length === 0) {
    throw new DevInputError('the object has no properties');
  }
  const out = new DevOutputBuffer(budget);
  keys.forEach((key, i) => {
    const property = kebabProperty(key);
    if (property === undefined) {
      throw new DevInputError(`${quoteText(key)} is not a style property name`);
    }
    const raw = record[key];
    let value: string;
    if (typeof raw === 'string') {
      value = raw.trim();
    } else if (typeof raw === 'number' && Number.isFinite(raw)) {
      value = String(raw);
    } else {
      throw new DevInputError(`the value of ${quoteText(key)} must be a string or a number`);
    }
    if (value === '') {
      throw new DevInputError(`the value of ${quoteText(key)} is empty`);
    }
    const reason = unsafeValueReason(value);
    if (reason !== undefined) {
      throw new DevInputError(`the value of ${quoteText(key)} ${reason}, which would break the declaration`);
    }
    out.push(`${i > 0 ? eol : ''}${property}: ${value};`);
  });
  return out.join();
};
