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
import { toJsString } from './devLiterals';

// ---------------------------------------------------------------------------------------------
// DEVX-010 Sort declarations
// ---------------------------------------------------------------------------------------------

const isSpaceToken = (token: CssToken): boolean => token.type === 'ws';
const isInsignificant = (token: CssToken): boolean => token.type === 'ws' || token.type === 'comment';
const isTerminator = (token: CssToken): boolean =>
  token.depth === 0 && (token.type === '{' || token.type === '}' || token.type === ';');

/** One declaration of a run: its body moves, the frame (spaces around it and the `;`) stays. */
interface Declaration {
  lead: string;
  body: string;
  trail: string;
  terminator: string;
  key: string;
}

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
 * A comment right before a declaration moves with it. A nested rule (`@media`, CSS nesting) or an
 * at-rule statement ends a run: declarations are never moved across it. Strings, comments and
 * `url(…)` are copied as they are.
 */
export const cssSortProperties = (text: string, budget: number): string => {
  const tokens = parseCss(text);
  const out = new DevOutputBuffer(budget);
  let run: Declaration[] = [];
  const flush = () => {
    const sorted = [...run].sort(compareKeys);
    run.forEach((frame, i) => out.push(frame.lead + sorted[i].body + frame.trail + frame.terminator));
    run = [];
  };
  let start = 0;
  for (let i = 0; i <= tokens.length; i++) {
    if (i < tokens.length && !isTerminator(tokens[i])) {
      continue;
    }
    const segment = tokens.slice(start, i);
    const terminator = i < tokens.length ? tokens[i].text : '';
    const first = segment.findIndex((token) => !isInsignificant(token));
    if (first >= 0 && segment[first].segment === 'decl') {
      let bodyStart = 0;
      while (isSpaceToken(segment[bodyStart])) {
        bodyStart++;
      }
      let bodyEnd = segment.length;
      while (isSpaceToken(segment[bodyEnd - 1])) {
        bodyEnd--;
      }
      const join = (part: readonly CssToken[]) => part.map((token) => token.text).join('');
      run.push({
        lead: join(segment.slice(0, bodyStart)),
        body: join(segment.slice(bodyStart, bodyEnd)),
        trail: join(segment.slice(bodyEnd)),
        terminator: terminator === ';' ? ';' : '',
        key: propertyKey(segment.slice(first)),
      });
      if (terminator !== ';') {
        flush();
        out.push(terminator);
      }
    } else {
      flush();
      out.push(segment.map((token) => token.text).join('') + terminator);
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
const JS_IDENTIFIER = /^[A-Za-z_$][A-Za-z0-9_$]*$/;

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
 * string literal (escaped, never evaluated), `!important` included. Comments are dropped; a nested
 * block is an error.
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
  const entries: string[] = [];
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
      key = JS_IDENTIFIER.test(camel) ? camel : toJsString(camel);
    } else {
      throw new DevInputError(`${quoteText(property)} is not a CSS property name`);
    }
    const entry = `${key}: ${toJsString(value)}`;
    length += entry.length + 2;
    assertWithinBudget(length, budget);
    entries.push(entry);
  }
  if (entries.length === 0) {
    throw new DevInputError('the selection has no declarations');
  }
  const result = `{ ${entries.join(', ')} }`;
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
