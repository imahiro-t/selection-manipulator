/**
 * Hand-written parsers of the DATA commands (no `eval`, no `new Function`, no dynamic code):
 * - `parseJsonLike`: strict JSON with error positions (DATA-019), JSONC / JSON5 (DATA-014) and
 *   JavaScript object literals made only of literal values (DATA-028);
 * - `parseIni` (DATA-008) and `parseProperties` (DATA-010).
 * The TOML subset parser is in `tomlParser.ts`.
 *
 * Every parser checks the input length and the nesting depth, builds objects with
 * `createRecord` / `setOwn` (so `__proto__` is an ordinary key) and reports problems with a
 * `DataInputError` whose message names the line.
 */
import {
  assertInputLength,
  createRecord,
  DATA_MAX_DEPTH,
  DataInputError,
  hasOwn,
  isJsonObject,
  JsonObject,
  JsonValue,
  setOwn,
} from './dataCommon';

// ---------------------------------------------------------------------------------------------
// JSON / JSON5 / JS object literal
// ---------------------------------------------------------------------------------------------

export type JsonLikeMode = 'json' | 'json5' | 'js-object';

/** 1-based line and column (UTF-16 code units) of an offset; CRLF counts as one line break. */
export const lineColumnAt = (text: string, offset: number): { line: number; column: number } => {
  let line = 1;
  let lineStart = 0;
  for (let i = 0; i < offset && i < text.length; i++) {
    const ch = text[i];
    if (ch === '\n' || (ch === '\r' && text[i + 1] !== '\n')) {
      line++;
      lineStart = i + 1;
    }
  }
  return { line, column: offset - lineStart + 1 };
};

/** A syntax error in JSON-like text: `offset` is where it was found (`text.length` for "end of input"). */
export class JsonSyntaxError extends DataInputError {
  constructor(readonly offset: number, readonly reason: string, text: string) {
    const { line, column } = lineColumnAt(text, offset);
    super(`line ${line}, column ${column}: ${reason}`);
    this.name = 'JsonSyntaxError';
  }
}

const describeChar = (text: string, offset: number): string => {
  if (offset >= text.length) {
    return 'unexpected end of input';
  }
  const code = text.codePointAt(offset)!;
  return `unexpected character ${JSON.stringify(String.fromCodePoint(code))}`;
};

const isDigit = (ch: string | undefined): boolean => ch !== undefined && ch >= '0' && ch <= '9';
const isHexDigit = (ch: string | undefined): boolean => ch !== undefined && /^[0-9A-Fa-f]$/.test(ch);
const ID_START = /[\p{L}\p{Nl}$_]/u;
const ID_PART = /[\p{L}\p{Nl}\p{Mn}\p{Mc}\p{Nd}\p{Pc}$_\u200C\u200D]/u;
/** White space of JSON5 / ECMAScript besides the four JSON ones. */
const EXTRA_WHITESPACE = /[\v\f\u00A0\uFEFF\u2028\u2029\p{Zs}]/u;

class JsonLikeParser {
  private pos = 0;
  private readonly relaxed: boolean;

  constructor(private readonly text: string, private readonly mode: JsonLikeMode) {
    this.relaxed = mode !== 'json';
  }

  parse(): JsonValue {
    this.skipWhitespace();
    const value = this.parseValue(0);
    this.skipWhitespace();
    if (this.pos < this.text.length) {
      this.fail(`${describeChar(this.text, this.pos)} after the value`);
    }
    return value;
  }

  private fail(reason: string, offset: number = this.pos): never {
    throw new JsonSyntaxError(offset, reason, this.text);
  }

  private unexpected(): never {
    this.fail(describeChar(this.text, this.pos));
  }

  private skipWhitespace(): void {
    const { text } = this;
    while (this.pos < text.length) {
      const ch = text[this.pos];
      if (ch === ' ' || ch === '\t' || ch === '\n' || ch === '\r') {
        this.pos++;
      } else if (this.relaxed && EXTRA_WHITESPACE.test(ch)) {
        this.pos++;
      } else if (this.relaxed && ch === '/' && text[this.pos + 1] === '/') {
        this.pos += 2;
        while (this.pos < text.length && !'\n\r\u2028\u2029'.includes(text[this.pos])) {
          this.pos++;
        }
      } else if (this.relaxed && ch === '/' && text[this.pos + 1] === '*') {
        const end = text.indexOf('*/', this.pos + 2);
        if (end < 0) {
          this.fail('unterminated comment');
        }
        this.pos = end + 2;
      } else {
        return;
      }
    }
  }

  private parseValue(depth: number): JsonValue {
    const ch = this.text[this.pos];
    if (ch === '{') {
      return this.parseObject(depth + 1);
    }
    if (ch === '[') {
      return this.parseArray(depth + 1);
    }
    if (ch === '"' || (this.relaxed && ch === "'")) {
      return this.parseString(ch);
    }
    if (ch === '`' && this.mode === 'js-object') {
      return this.parseTemplate();
    }
    if (ch === '-' || isDigit(ch) || (this.relaxed && (ch === '+' || ch === '.'))) {
      return this.parseNumber();
    }
    if (ch !== undefined && (ID_START.test(ch) || ch === '\\')) {
      return this.parseKeyword();
    }
    this.unexpected();
  }

  private enter(depth: number): void {
    if (depth > DATA_MAX_DEPTH) {
      this.fail(`nesting is too deep (limit: ${DATA_MAX_DEPTH})`);
    }
  }

  private parseObject(depth: number): JsonObject {
    this.enter(depth);
    this.pos++;
    const result = createRecord<JsonValue>();
    this.skipWhitespace();
    if (this.text[this.pos] === '}') {
      this.pos++;
      return result;
    }
    for (;;) {
      const key = this.parseKey();
      this.skipWhitespace();
      if (this.text[this.pos] !== ':') {
        this.unexpected();
      }
      this.pos++;
      this.skipWhitespace();
      setOwn(result, key, this.parseValue(depth));
      this.skipWhitespace();
      const next = this.text[this.pos];
      if (next === ',') {
        this.pos++;
        this.skipWhitespace();
        if (this.relaxed && this.text[this.pos] === '}') {
          this.pos++;
          return result;
        }
        continue;
      }
      if (next === '}') {
        this.pos++;
        return result;
      }
      this.unexpected();
    }
  }

  private parseKey(): string {
    const ch = this.text[this.pos];
    if (ch === '"' || (this.relaxed && ch === "'")) {
      return this.parseString(ch);
    }
    if (!this.relaxed) {
      this.unexpected();
    }
    if (ch === '`' && this.mode === 'js-object') {
      return this.parseTemplate();
    }
    if (isDigit(ch) || ch === '.') {
      // A numeric key becomes the key JavaScript would use (`0x10` -> "16").
      const start = this.pos;
      const value = this.parseNumber();
      if (this.text[start] === '-' || this.text[start] === '+') {
        this.fail(describeChar(this.text, start), start);
      }
      return String(value);
    }
    if (ch !== undefined && ID_START.test(ch)) {
      return this.readIdentifier();
    }
    if (ch === '[') {
      this.fail('computed property names are not supported (only literal values)');
    }
    if (ch === '.' || ch === '\\') {
      this.unexpected();
    }
    this.unexpected();
  }

  private readIdentifier(): string {
    const start = this.pos;
    while (this.pos < this.text.length) {
      const code = this.text.codePointAt(this.pos)!;
      const ch = String.fromCodePoint(code);
      if (this.pos === start ? ID_START.test(ch) : ID_PART.test(ch)) {
        this.pos += ch.length;
      } else {
        break;
      }
    }
    if (this.text[this.pos] === '\\') {
      this.fail('escape sequences in names are not supported');
    }
    return this.text.slice(start, this.pos);
  }

  private parseArray(depth: number): JsonValue[] {
    this.enter(depth);
    this.pos++;
    const result: JsonValue[] = [];
    this.skipWhitespace();
    if (this.text[this.pos] === ']') {
      this.pos++;
      return result;
    }
    for (;;) {
      if (this.text[this.pos] === ',') {
        this.fail('empty array elements are not supported');
      }
      if (this.relaxed && this.text.startsWith('...', this.pos)) {
        this.fail('spread elements are not supported (only literal values)');
      }
      result.push(this.parseValue(depth));
      this.skipWhitespace();
      const next = this.text[this.pos];
      if (next === ',') {
        this.pos++;
        this.skipWhitespace();
        if (this.relaxed && this.text[this.pos] === ']') {
          this.pos++;
          return result;
        }
        continue;
      }
      if (next === ']') {
        this.pos++;
        return result;
      }
      this.unexpected();
    }
  }

  private readHex(count: number): number {
    const digits = this.text.slice(this.pos, this.pos + count);
    if (digits.length !== count || !/^[0-9A-Fa-f]+$/.test(digits)) {
      this.fail('invalid escape sequence');
    }
    this.pos += count;
    return parseInt(digits, 16);
  }

  /** The escape after a backslash (`this.pos` is just after the `\`). Returns the text it stands for. */
  private readEscape(): string {
    const { text } = this;
    const ch = text[this.pos];
    const simple: Record<string, string> = { '"': '"', '\\': '\\', '/': '/', b: '\b', f: '\f', n: '\n', r: '\r', t: '\t' };
    if (ch !== undefined && hasOwn(simple, ch)) {
      this.pos++;
      return simple[ch];
    }
    if (ch === 'u') {
      this.pos++;
      if (this.relaxed && text[this.pos] === '{' && this.mode === 'js-object') {
        const end = text.indexOf('}', this.pos);
        const digits = end < 0 ? '' : text.slice(this.pos + 1, end);
        if (!/^[0-9A-Fa-f]{1,6}$/.test(digits) || parseInt(digits, 16) > 0x10ffff) {
          this.fail('invalid escape sequence');
        }
        this.pos = end + 1;
        return String.fromCodePoint(parseInt(digits, 16));
      }
      return String.fromCharCode(this.readHex(4));
    }
    if (!this.relaxed) {
      this.fail('invalid escape sequence', this.pos - 1);
    }
    if (ch === "'") {
      this.pos++;
      return "'";
    }
    if (ch === 'v') {
      this.pos++;
      return '\v';
    }
    if (ch === '0' && !isDigit(text[this.pos + 1])) {
      this.pos++;
      return '\0';
    }
    if (ch === 'x') {
      this.pos++;
      return String.fromCharCode(this.readHex(2));
    }
    if (ch === '\r') {
      this.pos += text[this.pos + 1] === '\n' ? 2 : 1;
      return '';
    }
    if (ch === '\n' || ch === '\u2028' || ch === '\u2029') {
      this.pos++;
      return '';
    }
    if (ch === undefined) {
      this.fail('unterminated string');
    }
    if (isDigit(ch)) {
      this.fail('invalid escape sequence', this.pos - 1);
    }
    // Any other character stands for itself (`\a` -> "a").
    const code = text.codePointAt(this.pos)!;
    const escaped = String.fromCodePoint(code);
    this.pos += escaped.length;
    return escaped;
  }

  private parseString(quote: string): string {
    const { text } = this;
    const start = this.pos;
    this.pos++;
    let result = '';
    let chunkStart = this.pos;
    while (this.pos < text.length) {
      const ch = text[this.pos];
      if (ch === quote) {
        result += text.slice(chunkStart, this.pos);
        this.pos++;
        return result;
      }
      if (ch === '\\') {
        result += text.slice(chunkStart, this.pos);
        this.pos++;
        result += this.readEscape();
        chunkStart = this.pos;
        continue;
      }
      if (ch === '\n' || ch === '\r') {
        this.fail('unterminated string (a line break must be written as \\n)');
      }
      if (!this.relaxed && ch < ' ') {
        this.fail('control character in string (it must be escaped)');
      }
      this.pos++;
    }
    this.fail('unterminated string', start);
  }

  /** A template literal without substitutions (js-object only). */
  private parseTemplate(): string {
    const { text } = this;
    const start = this.pos;
    this.pos++;
    let result = '';
    while (this.pos < text.length) {
      const ch = text[this.pos];
      if (ch === '`') {
        this.pos++;
        return result;
      }
      if (ch === '$' && text[this.pos + 1] === '{') {
        this.fail('template literals with ${…} are not supported (only literal values)');
      }
      if (ch === '\\') {
        this.pos++;
        if (text[this.pos] === '`' || text[this.pos] === '$') {
          result += text[this.pos];
          this.pos++;
        } else {
          result += this.readEscape();
        }
        continue;
      }
      if (ch === '\r') {
        // A line break inside a template literal is always "\n".
        result += '\n';
        this.pos += text[this.pos + 1] === '\n' ? 2 : 1;
        continue;
      }
      result += ch;
      this.pos++;
    }
    this.fail('unterminated template literal', start);
  }

  private parseNumber(): number {
    const { text } = this;
    const start = this.pos;
    let sign = 1;
    if (text[this.pos] === '-' || text[this.pos] === '+') {
      if (text[this.pos] === '+' && !this.relaxed) {
        this.unexpected();
      }
      sign = text[this.pos] === '-' ? -1 : 1;
      this.pos++;
    }
    if (this.relaxed && ID_START.test(text[this.pos] ?? '')) {
      const name = this.readIdentifier();
      if (name === 'Infinity' || name === 'NaN') {
        this.fail(`${name} cannot be represented in JSON`, start);
      }
      this.fail(describeChar(text, start + 1), start + 1);
    }
    const digitsOf = (test: (ch: string | undefined) => boolean): string => {
      const from = this.pos;
      while (test(text[this.pos]) || (this.mode === 'js-object' && text[this.pos] === '_' && test(text[this.pos - 1]) && test(text[this.pos + 1]))) {
        this.pos++;
      }
      return text.slice(from, this.pos).replace(/_/g, '');
    };
    let value: number;
    const prefix = text.slice(this.pos, this.pos + 2).toLowerCase();
    if (this.relaxed && (prefix === '0x' || (this.mode === 'js-object' && (prefix === '0o' || prefix === '0b')))) {
      this.pos += 2;
      const test = prefix === '0x' ? isHexDigit : prefix === '0o' ? (c: string | undefined) => c !== undefined && c >= '0' && c <= '7' : (c: string | undefined) => c === '0' || c === '1';
      const digits = digitsOf(test);
      if (digits.length === 0) {
        this.unexpected();
      }
      value = Number(`${prefix}${digits}`);
    } else {
      let literal = '';
      const integer = digitsOf(isDigit);
      if (integer.length > 1 && integer[0] === '0') {
        this.fail('leading zeros are not allowed', start);
      }
      literal += integer;
      let fraction = '';
      if (text[this.pos] === '.') {
        this.pos++;
        fraction = digitsOf(isDigit);
        if (fraction.length === 0 && (!this.relaxed || integer.length === 0)) {
          this.unexpected();
        }
        literal += `.${fraction}`;
      }
      if (integer.length === 0 && (!this.relaxed || fraction.length === 0)) {
        this.fail(describeChar(text, this.pos));
      }
      if (text[this.pos] === 'e' || text[this.pos] === 'E') {
        this.pos++;
        let exponentSign = '';
        if (text[this.pos] === '+' || text[this.pos] === '-') {
          exponentSign = text[this.pos];
          this.pos++;
        }
        const exponent = digitsOf(isDigit);
        if (exponent.length === 0) {
          this.unexpected();
        }
        literal += `e${exponentSign}${exponent}`;
      }
      value = Number(literal.startsWith('.') ? `0${literal}` : literal);
    }
    if (this.mode === 'js-object' && text[this.pos] === 'n') {
      this.fail('BigInt literals cannot be represented in JSON', start);
    }
    if (this.relaxed && text[this.pos] !== undefined && ID_PART.test(text[this.pos])) {
      this.unexpected();
    }
    if (this.relaxed && !Number.isFinite(value)) {
      this.fail('the number is too large to be represented in JSON', start);
    }
    return sign * value;
  }

  private parseKeyword(): JsonValue {
    const start = this.pos;
    if (this.text[this.pos] === '\\') {
      this.unexpected();
    }
    const name = this.relaxed ? this.readIdentifier() : this.readAsciiWord();
    switch (name) {
      case 'true':
        return true;
      case 'false':
        return false;
      case 'null':
        return null;
    }
    if (!this.relaxed) {
      this.fail(describeChar(this.text, start), start);
    }
    if (name === 'Infinity' || name === 'NaN' || name === 'undefined') {
      this.fail(`${name} cannot be represented in JSON`, start);
    }
    this.fail(`unexpected identifier ${JSON.stringify(name)} (only literal values are supported)`, start);
  }

  private readAsciiWord(): string {
    const start = this.pos;
    while (this.pos < this.text.length && /[a-z]/.test(this.text[this.pos])) {
      this.pos++;
    }
    const word = this.text.slice(start, this.pos);
    if (word !== 'true' && word !== 'false' && word !== 'null') {
      this.pos = start;
    }
    return word;
  }
}

/**
 * Parses JSON-like text. `json` is RFC 8259 exactly (used by DATA-019 for its error positions);
 * `json5` adds comments, trailing commas, unquoted / single-quoted / numeric keys, single-quoted
 * strings with JavaScript escapes and line continuations, hexadecimal numbers, leading / trailing
 * decimal points and `+`; `js-object` also accepts template literals without `${…}`, numeric
 * separators and `0o` / `0b`. Anything that is not a literal (identifiers, calls, functions,
 * `Infinity`, `NaN`, `undefined`, spreads, computed keys) is an error.
 */
export const parseJsonLike = (text: string, mode: JsonLikeMode): JsonValue => {
  assertInputLength(text);
  return new JsonLikeParser(text, mode).parse();
};

// ---------------------------------------------------------------------------------------------
// INI (DATA-008)
// ---------------------------------------------------------------------------------------------

const splitLines = (text: string): string[] => text.split(/\r\n|\r|\n/);

/** Removes one pair of matching `"` or `'` around the whole value. */
export const unquoteValue = (value: string): string => {
  if (value.length >= 2 && (value[0] === '"' || value[0] === "'") && value[value.length - 1] === value[0]) {
    return value.slice(1, -1);
  }
  return value;
};

/**
 * `[section]`, `key=value` / `key: value` (split at the first `=`, or at the first `:` when there
 * is no `=`), whole-line comments starting with `;` or `#`, blank lines. Values are strings;
 * keys before the first section are top-level keys; a repeated key wins, repeated sections merge.
 */
export const parseIni = (text: string): JsonObject => {
  assertInputLength(text);
  const root = createRecord<JsonValue>();
  const sections = new Set<string>();
  let current: JsonObject = root;
  splitLines(text).forEach((raw, index) => {
    const line = raw.trim();
    const where = `line ${index + 1}`;
    if (line === '' || line.startsWith(';') || line.startsWith('#')) {
      return;
    }
    if (line.startsWith('[')) {
      if (!line.endsWith(']')) {
        throw new DataInputError(`${where}: a section header must end with "]"`);
      }
      const name = line.slice(1, -1).trim();
      if (name === '') {
        throw new DataInputError(`${where}: the section name is empty`);
      }
      if (hasOwn(root, name) && !sections.has(name)) {
        throw new DataInputError(`${where}: the section ${JSON.stringify(name)} has the same name as a key`);
      }
      if (!sections.has(name)) {
        sections.add(name);
        setOwn(root, name, createRecord<JsonValue>());
      }
      current = root[name] as JsonObject;
      return;
    }
    let separator = line.indexOf('=');
    if (separator < 0) {
      separator = line.indexOf(':');
    }
    if (separator < 0) {
      throw new DataInputError(`${where}: expected key=value, [section] or a comment`);
    }
    const key = line.slice(0, separator).trim();
    if (key === '') {
      throw new DataInputError(`${where}: the key is empty`);
    }
    if (current === root && sections.has(key)) {
      throw new DataInputError(`${where}: the key ${JSON.stringify(key)} has the same name as a section`);
    }
    setOwn(current, key, unquoteValue(line.slice(separator + 1).trim()));
  });
  return root;
};

// ---------------------------------------------------------------------------------------------
// .properties (DATA-010)
// ---------------------------------------------------------------------------------------------

const PROPERTIES_WHITESPACE = ' \t\f';

/** Joins continuation lines (an odd number of trailing backslashes) into logical lines. */
const logicalPropertyLines = (text: string): { line: number; text: string }[] => {
  const lines = splitLines(text);
  const result: { line: number; text: string }[] = [];
  let index = 0;
  while (index < lines.length) {
    const first = index;
    let current = lines[index].replace(/^[ \t\f]+/, '');
    index++;
    if (current === '' || current.startsWith('#') || current.startsWith('!')) {
      continue;
    }
    const endsWithContinuation = (value: string): boolean => {
      let count = 0;
      for (let i = value.length - 1; i >= 0 && value[i] === '\\'; i--) {
        count++;
      }
      return count % 2 === 1;
    };
    while (endsWithContinuation(current)) {
      current = current.slice(0, -1);
      if (index >= lines.length) {
        break;
      }
      current += lines[index].replace(/^[ \t\f]+/, '');
      index++;
    }
    result.push({ line: first + 1, text: current });
  }
  return result;
};

/** Reads `.properties` escapes (`\t \n \r \f \uXXXX`, `\` + any character). */
const unescapeProperties = (text: string, where: string): string => {
  let result = '';
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (ch !== '\\') {
      result += ch;
      continue;
    }
    i++;
    const next = text[i];
    if (next === undefined) {
      break;
    }
    switch (next) {
      case 't': result += '\t'; break;
      case 'n': result += '\n'; break;
      case 'r': result += '\r'; break;
      case 'f': result += '\f'; break;
      case 'u': {
        const digits = text.slice(i + 1, i + 5);
        if (!/^[0-9A-Fa-f]{4}$/.test(digits)) {
          throw new DataInputError(`${where}: invalid \\u escape (4 hexadecimal digits are required)`);
        }
        result += String.fromCharCode(parseInt(digits, 16));
        i += 4;
        break;
      }
      default:
        result += next;
    }
  }
  return result;
};

/** Splits a logical line into its raw (still escaped) key and value. */
const splitProperty = (line: string): { key: string; value: string } => {
  let i = 0;
  while (i < line.length) {
    const ch = line[i];
    if (ch === '\\') {
      i += 2;
      continue;
    }
    if (ch === '=' || ch === ':' || PROPERTIES_WHITESPACE.includes(ch)) {
      break;
    }
    i++;
  }
  const key = line.slice(0, Math.min(i, line.length));
  let j = i;
  while (j < line.length && PROPERTIES_WHITESPACE.includes(line[j])) {
    j++;
  }
  if (line[j] === '=' || line[j] === ':') {
    j++;
    while (j < line.length && PROPERTIES_WHITESPACE.includes(line[j])) {
      j++;
    }
  }
  return { key, value: line.slice(j) };
};

type PropertyStep = { kind: 'key'; key: string } | { kind: 'index'; index: number };

/** `a.b[0].c` -> steps; `.` separates keys and `[n]` indexes arrays (the notation DATA-009 writes). */
const propertySteps = (key: string, where: string): PropertyStep[] => {
  const steps: PropertyStep[] = [];
  const invalid = () => new DataInputError(`${where}: the key ${JSON.stringify(key)} cannot be nested (use names separated by "." and [index])`);
  for (const part of key.split('.')) {
    const bracket = part.indexOf('[');
    const name = bracket < 0 ? part : part.slice(0, bracket);
    if (name === '' || name.includes(']')) {
      throw invalid();
    }
    steps.push({ kind: 'key', key: name });
    let rest = bracket < 0 ? '' : part.slice(bracket);
    while (rest !== '') {
      const match = /^\[(0|[1-9][0-9]{0,8})\]/.exec(rest);
      if (!match) {
        throw invalid();
      }
      steps.push({ kind: 'index', index: Number(match[1]) });
      rest = rest.slice(match[0].length);
    }
  }
  if (steps.length > DATA_MAX_DEPTH) {
    throw new DataInputError(`${where}: nesting is too deep (limit: ${DATA_MAX_DEPTH})`);
  }
  return steps;
};

/**
 * Java `.properties` -> nested object: `#` / `!` comments, `=` / `:` / white space separators,
 * line continuations, escapes. Keys are split at `.` and `name[n]` becomes an array element (so
 * the output of DATA-009 reads back). Values are strings; a repeated key wins; a key that is both
 * a value and a parent (`a=1` and `a.b=2`), an empty step (`a..b`) or an index that skips an
 * element is an error.
 */
export const parseProperties = (text: string): JsonObject => {
  assertInputLength(text);
  const root = createRecord<JsonValue>();
  const conflict = (where: string, key: string) =>
    new DataInputError(`${where}: the key ${JSON.stringify(key)} is used both as a value and as a parent of other keys`);
  for (const { line, text: logical } of logicalPropertyLines(text)) {
    const where = `line ${line}`;
    const { key: rawKey, value: rawValue } = splitProperty(logical);
    const key = unescapeProperties(rawKey, where);
    const value = unescapeProperties(rawValue, where);
    if (key === '') {
      throw new DataInputError(`${where}: the key is empty`);
    }
    const steps = propertySteps(key, where);
    let container: JsonObject | JsonValue[] = root;
    steps.forEach((step, index) => {
      const last = index === steps.length - 1;
      const nextIsIndex = !last && steps[index + 1].kind === 'index';
      const create = (): JsonValue => (last ? value : nextIsIndex ? [] : createRecord<JsonValue>());
      let existing: JsonValue | undefined;
      if (step.kind === 'key') {
        if (Array.isArray(container)) {
          throw conflict(where, key);
        }
        const record: JsonObject = container;
        existing = hasOwn(record, step.key) ? record[step.key] : undefined;
        if (existing === undefined || (last && typeof existing === 'string')) {
          existing = create();
          setOwn(record, step.key, existing);
        }
      } else {
        if (!Array.isArray(container)) {
          throw conflict(where, key);
        }
        if (step.index > container.length) {
          throw new DataInputError(`${where}: the index [${step.index}] of ${JSON.stringify(key)} skips an element`);
        }
        existing = container[step.index];
        if (existing === undefined || (last && typeof existing === 'string')) {
          existing = create();
          container[step.index] = existing;
        }
      }
      if (last) {
        if (typeof existing !== 'string') {
          throw conflict(where, key);
        }
        return;
      }
      if (typeof existing === 'string' || existing === null || typeof existing !== 'object') {
        throw conflict(where, key);
      }
      if (nextIsIndex !== Array.isArray(existing) || (!nextIsIndex && !isJsonObject(existing))) {
        throw conflict(where, key);
      }
      container = existing;
    });
  }
  return root;
};
