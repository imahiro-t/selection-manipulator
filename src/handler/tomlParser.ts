/**
 * A hand-written parser for the main syntax of TOML 1.0 (DATA-006 / DATA-037), used instead of
 * adding a dependency. No `eval` / `new Function`; the input length and the nesting depth are
 * limited; tables are prototype-less objects (`__proto__` is an ordinary key).
 *
 * Supported: comments; bare, quoted (basic / literal) and dotted keys; `[table]`, `[a.b]`,
 * `[[array.of.tables]]`; inline tables; arrays (multi-line, trailing comma, comments); basic,
 * literal, multi-line basic (with line-ending backslashes) and multi-line literal strings;
 * integers (decimal with `_`, `0x`, `0o`, `0b`); floats (fraction / exponent / `_`); booleans;
 * offset date-times, local date-times, local dates and local times (format-checked, written out
 * as the strings they are).
 *
 * Errors (never silently converted): duplicate keys / tables, extending an inline table or a
 * static array, mixing `[x]` and `[[x]]`, `inf` / `nan` (not representable in JSON), integers
 * outside ±(2^53 − 1) (they would lose precision). Dates are only format-checked (month 01-12,
 * day 01-31, ...), not checked against the calendar.
 */
import {
  assertDepth,
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

/** How a table came to exist; decides whether it may be defined or extended again. */
type TableKind = 'implicit' | 'explicit' | 'dotted' | 'inline';

const BARE_KEY_CHAR = /[A-Za-z0-9_-]/;
const BARE_VALUE_CHAR = /[A-Za-z0-9_+\-.:]/;
const DECIMAL_INTEGER = /^[+-]?(?:0|[1-9](?:_?[0-9])*)$/;
const HEX_INTEGER = /^0x[0-9A-Fa-f](?:_?[0-9A-Fa-f])*$/;
const OCTAL_INTEGER = /^0o[0-7](?:_?[0-7])*$/;
const BINARY_INTEGER = /^0b[01](?:_?[01])*$/;
const FLOAT = /^[+-]?(?:0|[1-9](?:_?[0-9])*)(?:\.[0-9](?:_?[0-9])*)?(?:[eE][+-]?[0-9](?:_?[0-9])*)?$/;
const LOCAL_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;
const LOCAL_TIME = /^(\d{2}):(\d{2}):(\d{2})(?:\.\d+)?$/;
const DATE_TIME = /^(\d{4})-(\d{2})-(\d{2})[Tt ](\d{2}):(\d{2}):(\d{2})(?:\.\d+)?([Zz]|[+-]\d{2}:\d{2})?$/;
const MAX_SAFE = BigInt(Number.MAX_SAFE_INTEGER);

const isControl = (ch: string): boolean => {
  const code = ch.charCodeAt(0);
  return (code <= 0x1f && ch !== '\t') || code === 0x7f;
};

class TomlParser {
  private pos = 0;
  private readonly root: JsonObject = createRecord<JsonValue>();
  private current: JsonObject;
  private readonly kinds = new Map<JsonObject, TableKind>();
  /** Arrays created by `[[...]]` (every other array is static and cannot be extended). */
  private readonly tableArrays = new Set<JsonValue[]>();

  constructor(private readonly text: string) {
    this.current = this.root;
    this.kinds.set(this.root, 'explicit');
  }

  parse(): JsonObject {
    const { text } = this;
    while (this.pos < text.length) {
      this.skipSpaces();
      const ch = text[this.pos];
      if (ch === undefined) {
        break;
      }
      if (ch === '#' || ch === '\n' || ch === '\r') {
        this.endOfLine();
        continue;
      }
      if (ch === '[') {
        if (text[this.pos + 1] === '[') {
          this.parseTableArrayHeader();
        } else {
          this.parseTableHeader();
        }
      } else {
        this.parseKeyValue(this.current, 0);
      }
      this.endOfLine();
    }
    assertDepth(this.root);
    return this.root;
  }

  // ----- errors and positions -----

  private lineAt(offset: number): number {
    let line = 1;
    for (let i = 0; i < offset && i < this.text.length; i++) {
      if (this.text[i] === '\n') {
        line++;
      }
    }
    return line;
  }

  private fail(reason: string, offset: number = this.pos): never {
    throw new DataInputError(`line ${this.lineAt(offset)}: ${reason}`);
  }

  private unexpected(what = 'a value'): never {
    const ch = this.text[this.pos];
    if (ch === undefined) {
      this.fail(`unexpected end of input (expected ${what})`);
    }
    if (ch === '\n' || ch === '\r') {
      this.fail(`unexpected end of the line (expected ${what})`);
    }
    this.fail(`unexpected character ${JSON.stringify(String.fromCodePoint(this.text.codePointAt(this.pos)!))} (expected ${what})`);
  }

  // ----- white space, comments, line ends -----

  private skipSpaces(): void {
    while (this.text[this.pos] === ' ' || this.text[this.pos] === '\t') {
      this.pos++;
    }
  }

  private skipComment(): void {
    if (this.text[this.pos] !== '#') {
      return;
    }
    this.pos++;
    while (this.pos < this.text.length && this.text[this.pos] !== '\n' && !(this.text[this.pos] === '\r' && this.text[this.pos + 1] === '\n')) {
      if (isControl(this.text[this.pos])) {
        this.fail('control characters are not allowed in comments');
      }
      this.pos++;
    }
  }

  /** Consumes one line break (LF or CRLF); returns false when there is none here. */
  private newline(): boolean {
    if (this.text[this.pos] === '\n') {
      this.pos++;
      return true;
    }
    if (this.text[this.pos] === '\r' && this.text[this.pos + 1] === '\n') {
      this.pos += 2;
      return true;
    }
    return false;
  }

  /** Spaces, an optional comment and a line break (or the end of the input). */
  private endOfLine(): void {
    this.skipSpaces();
    this.skipComment();
    if (this.pos >= this.text.length || this.newline()) {
      return;
    }
    this.unexpected('the end of the line');
  }

  /** Spaces, comments and line breaks inside an array. */
  private skipArrayWhitespace(): void {
    for (;;) {
      this.skipSpaces();
      this.skipComment();
      if (!this.newline()) {
        return;
      }
    }
  }

  // ----- keys -----

  private parseSimpleKey(): string {
    const ch = this.text[this.pos];
    if (ch === '"') {
      if (this.text.startsWith('"""', this.pos)) {
        this.fail('multi-line strings cannot be used as keys');
      }
      return this.parseBasicString();
    }
    if (ch === "'") {
      if (this.text.startsWith("'''", this.pos)) {
        this.fail('multi-line strings cannot be used as keys');
      }
      return this.parseLiteralString();
    }
    const start = this.pos;
    while (this.pos < this.text.length && BARE_KEY_CHAR.test(this.text[this.pos])) {
      this.pos++;
    }
    if (this.pos === start) {
      this.unexpected('a key');
    }
    return this.text.slice(start, this.pos);
  }

  private parseKey(): string[] {
    const keys = [this.parseSimpleKey()];
    for (;;) {
      this.skipSpaces();
      if (this.text[this.pos] !== '.') {
        return keys;
      }
      this.pos++;
      this.skipSpaces();
      keys.push(this.parseSimpleKey());
      if (keys.length > DATA_MAX_DEPTH) {
        this.fail(`nesting is too deep (limit: ${DATA_MAX_DEPTH})`);
      }
    }
  }

  private describeKey(keys: string[]): string {
    return JSON.stringify(keys.join('.'));
  }

  // ----- tables -----

  /** Walks the parent tables of a header, creating implicit tables where needed. */
  private walkHeaderParents(keys: string[], start: number): JsonObject {
    let table = this.root;
    for (let i = 0; i < keys.length - 1; i++) {
      const key = keys[i];
      if (!hasOwn(table, key)) {
        const created = createRecord<JsonValue>();
        setOwn(table, key, created);
        this.kinds.set(created, 'implicit');
        table = created;
        continue;
      }
      const existing = table[key];
      if (Array.isArray(existing)) {
        if (!this.tableArrays.has(existing)) {
          this.fail(`${this.describeKey(keys.slice(0, i + 1))} is a static array and cannot be extended`, start);
        }
        table = existing[existing.length - 1] as JsonObject;
      } else if (isJsonObject(existing)) {
        if (this.kinds.get(existing) === 'inline') {
          this.fail(`${this.describeKey(keys.slice(0, i + 1))} is an inline table and cannot be extended`, start);
        }
        table = existing;
      } else {
        this.fail(`${this.describeKey(keys.slice(0, i + 1))} is not a table`, start);
      }
    }
    return table;
  }

  private parseTableHeader(): void {
    const start = this.pos;
    this.pos++;
    this.skipSpaces();
    const keys = this.parseKey();
    this.skipSpaces();
    if (this.text[this.pos] !== ']') {
      this.unexpected('"]"');
    }
    this.pos++;
    const parent = this.walkHeaderParents(keys, start);
    const last = keys[keys.length - 1];
    if (!hasOwn(parent, last)) {
      const created = createRecord<JsonValue>();
      setOwn(parent, last, created);
      this.kinds.set(created, 'explicit');
      this.current = created;
      return;
    }
    const existing = parent[last];
    if (isJsonObject(existing) && this.kinds.get(existing) === 'implicit') {
      this.kinds.set(existing, 'explicit');
      this.current = existing;
      return;
    }
    if (Array.isArray(existing) && this.tableArrays.has(existing)) {
      this.fail(`${this.describeKey(keys)} is an array of tables and cannot be defined with [${keys.join('.')}]`, start);
    }
    this.fail(`${this.describeKey(keys)} is already defined`, start);
  }

  private parseTableArrayHeader(): void {
    const start = this.pos;
    this.pos += 2;
    this.skipSpaces();
    const keys = this.parseKey();
    this.skipSpaces();
    if (!this.text.startsWith(']]', this.pos)) {
      this.unexpected('"]]"');
    }
    this.pos += 2;
    const parent = this.walkHeaderParents(keys, start);
    const last = keys[keys.length - 1];
    const element = createRecord<JsonValue>();
    this.kinds.set(element, 'explicit');
    if (!hasOwn(parent, last)) {
      const array: JsonValue[] = [element];
      this.tableArrays.add(array);
      setOwn(parent, last, array);
    } else {
      const existing = parent[last];
      if (!Array.isArray(existing) || !this.tableArrays.has(existing)) {
        this.fail(`${this.describeKey(keys)} is already defined and is not an array of tables`, start);
      }
      existing.push(element);
    }
    this.current = element;
  }

  // ----- key/value pairs -----

  private parseKeyValue(table: JsonObject, depth: number): void {
    const start = this.pos;
    const keys = this.parseKey();
    this.skipSpaces();
    if (this.text[this.pos] !== '=') {
      this.unexpected('"="');
    }
    this.pos++;
    this.skipSpaces();
    let target = table;
    for (let i = 0; i < keys.length - 1; i++) {
      const key = keys[i];
      if (!hasOwn(target, key)) {
        const created = createRecord<JsonValue>();
        setOwn(target, key, created);
        this.kinds.set(created, 'dotted');
        target = created;
        continue;
      }
      const existing = target[key];
      if (!isJsonObject(existing) || this.kinds.get(existing) !== 'dotted') {
        this.fail(`${this.describeKey(keys.slice(0, i + 1))} is already defined and cannot be extended with a dotted key`, start);
      }
      target = existing;
    }
    const last = keys[keys.length - 1];
    if (hasOwn(target, last)) {
      this.fail(`duplicate key ${this.describeKey(keys)}`, start);
    }
    setOwn(target, last, this.parseValue(depth));
  }

  // ----- values -----

  private parseValue(depth: number): JsonValue {
    const { text } = this;
    const ch = text[this.pos];
    if (ch === '"') {
      return text.startsWith('"""', this.pos) ? this.parseMultilineBasicString() : this.parseBasicString();
    }
    if (ch === "'") {
      return text.startsWith("'''", this.pos) ? this.parseMultilineLiteralString() : this.parseLiteralString();
    }
    if (ch === '[') {
      return this.parseArray(depth + 1);
    }
    if (ch === '{') {
      return this.parseInlineTable(depth + 1);
    }
    return this.parseBareValue();
  }

  private enter(depth: number): void {
    if (depth > DATA_MAX_DEPTH) {
      this.fail(`nesting is too deep (limit: ${DATA_MAX_DEPTH})`);
    }
  }

  private parseArray(depth: number): JsonValue[] {
    this.enter(depth);
    this.pos++;
    const result: JsonValue[] = [];
    for (;;) {
      this.skipArrayWhitespace();
      if (this.text[this.pos] === ']') {
        this.pos++;
        return result;
      }
      result.push(this.parseValue(depth));
      this.skipArrayWhitespace();
      if (this.text[this.pos] === ',') {
        this.pos++;
        continue;
      }
      if (this.text[this.pos] === ']') {
        this.pos++;
        return result;
      }
      this.unexpected('"," or "]"');
    }
  }

  private parseInlineTable(depth: number): JsonObject {
    this.enter(depth);
    this.pos++;
    const table = createRecord<JsonValue>();
    this.kinds.set(table, 'inline');
    this.skipSpaces();
    if (this.text[this.pos] === '}') {
      this.pos++;
      return table;
    }
    for (;;) {
      this.skipSpaces();
      this.parseKeyValue(table, depth);
      this.skipSpaces();
      if (this.text[this.pos] === ',') {
        this.pos++;
        this.skipSpaces();
        if (this.text[this.pos] === '}') {
          this.fail('a trailing comma is not allowed in an inline table');
        }
        continue;
      }
      if (this.text[this.pos] === '}') {
        this.pos++;
        return table;
      }
      this.unexpected('"," or "}" (an inline table must be on one line)');
    }
  }

  private readHexEscape(count: number): string {
    const digits = this.text.slice(this.pos, this.pos + count);
    if (digits.length !== count || !/^[0-9A-Fa-f]+$/.test(digits)) {
      this.fail(`invalid escape sequence (\\${count === 4 ? 'u' : 'U'} needs ${count} hexadecimal digits)`);
    }
    const code = parseInt(digits, 16);
    if (code > 0x10ffff || (code >= 0xd800 && code <= 0xdfff)) {
      this.fail('invalid escape sequence (not a Unicode scalar value)');
    }
    this.pos += count;
    return String.fromCodePoint(code);
  }

  /** The escape after a backslash in a basic string (`this.pos` is just after the `\`). */
  private readEscape(): string {
    const ch = this.text[this.pos];
    const simple: Record<string, string> = { b: '\b', t: '\t', n: '\n', f: '\f', r: '\r', '"': '"', '\\': '\\' };
    if (ch !== undefined && hasOwn(simple, ch)) {
      this.pos++;
      return simple[ch];
    }
    if (ch === 'u' || ch === 'U') {
      this.pos++;
      return this.readHexEscape(ch === 'u' ? 4 : 8);
    }
    this.fail('invalid escape sequence');
  }

  private parseBasicString(): string {
    const start = this.pos;
    this.pos++;
    let result = '';
    while (this.pos < this.text.length) {
      const ch = this.text[this.pos];
      if (ch === '"') {
        this.pos++;
        return result;
      }
      if (ch === '\\') {
        this.pos++;
        result += this.readEscape();
        continue;
      }
      if (ch === '\n' || ch === '\r') {
        this.fail('unterminated string');
      }
      if (isControl(ch)) {
        this.fail('control characters must be escaped in strings');
      }
      result += ch;
      this.pos++;
    }
    this.fail('unterminated string', start);
  }

  private parseLiteralString(): string {
    const start = this.pos;
    this.pos++;
    const from = this.pos;
    while (this.pos < this.text.length) {
      const ch = this.text[this.pos];
      if (ch === "'") {
        this.pos++;
        return this.text.slice(from, this.pos - 1);
      }
      if (ch === '\n' || ch === '\r') {
        this.fail('unterminated string');
      }
      if (isControl(ch)) {
        this.fail('control characters are not allowed in literal strings');
      }
      this.pos++;
    }
    this.fail('unterminated string', start);
  }

  /**
   * The closing delimiter of a multi-line string at `this.pos` (three or more quotes): up to two
   * extra quotes before it belong to the content. Returns the content quotes, or undefined.
   */
  private closingQuotes(quote: string): string | undefined {
    let count = 0;
    while (this.text[this.pos + count] === quote) {
      count++;
    }
    if (count < 3) {
      return undefined;
    }
    if (count > 5) {
      this.fail('too many quotes in a multi-line string');
    }
    this.pos += count;
    return quote.repeat(count - 3);
  }

  private parseMultilineBasicString(): string {
    const start = this.pos;
    this.pos += 3;
    this.newline();
    let result = '';
    while (this.pos < this.text.length) {
      const ch = this.text[this.pos];
      if (ch === '"') {
        const extra = this.closingQuotes('"');
        if (extra !== undefined) {
          return result + extra;
        }
        result += ch;
        this.pos++;
        continue;
      }
      if (ch === '\\') {
        // A line-ending backslash removes the line break and the white space that follows.
        let j = this.pos + 1;
        while (this.text[j] === ' ' || this.text[j] === '\t') {
          j++;
        }
        if (this.text[j] === '\n' || (this.text[j] === '\r' && this.text[j + 1] === '\n')) {
          this.pos = j;
          while (this.newline() || this.text[this.pos] === ' ' || this.text[this.pos] === '\t') {
            if (this.text[this.pos] === ' ' || this.text[this.pos] === '\t') {
              this.pos++;
            }
          }
          continue;
        }
        this.pos++;
        result += this.readEscape();
        continue;
      }
      if (this.newline()) {
        result += '\n';
        continue;
      }
      if (isControl(ch)) {
        this.fail('control characters must be escaped in strings');
      }
      result += ch;
      this.pos++;
    }
    this.fail('unterminated multi-line string', start);
  }

  private parseMultilineLiteralString(): string {
    const start = this.pos;
    this.pos += 3;
    this.newline();
    let result = '';
    while (this.pos < this.text.length) {
      const ch = this.text[this.pos];
      if (ch === "'") {
        const extra = this.closingQuotes("'");
        if (extra !== undefined) {
          return result + extra;
        }
        result += ch;
        this.pos++;
        continue;
      }
      if (this.newline()) {
        result += '\n';
        continue;
      }
      if (isControl(ch)) {
        this.fail('control characters are not allowed in literal strings');
      }
      result += ch;
      this.pos++;
    }
    this.fail('unterminated multi-line string', start);
  }

  /** Numbers, booleans and dates / times. */
  private parseBareValue(): JsonValue {
    const { text } = this;
    const start = this.pos;
    while (this.pos < text.length && BARE_VALUE_CHAR.test(text[this.pos])) {
      this.pos++;
    }
    // `1979-05-27 07:32:00`: a space may separate the date and the time.
    if (LOCAL_DATE.test(text.slice(start, this.pos)) && text[this.pos] === ' ' && /^[0-9]{2}:/.test(text.slice(this.pos + 1, this.pos + 4))) {
      this.pos++;
      while (this.pos < text.length && BARE_VALUE_CHAR.test(text[this.pos])) {
        this.pos++;
      }
    }
    const token = text.slice(start, this.pos);
    if (token === '') {
      this.unexpected();
    }
    if (token === 'true') {
      return true;
    }
    if (token === 'false') {
      return false;
    }
    if (/^[+-]?(?:inf|nan)$/.test(token)) {
      this.fail(`${token} cannot be represented in JSON`, start);
    }
    if (DECIMAL_INTEGER.test(token) || HEX_INTEGER.test(token) || OCTAL_INTEGER.test(token) || BINARY_INTEGER.test(token)) {
      const big = BigInt(token.replace(/_/g, ''));
      if (big > MAX_SAFE || big < -MAX_SAFE) {
        this.fail(`the integer ${token} is outside ±(2^53 − 1) and cannot be converted without losing precision`, start);
      }
      return Number(big);
    }
    if (FLOAT.test(token)) {
      const value = Number(token.replace(/_/g, ''));
      if (!Number.isFinite(value)) {
        this.fail(`the number ${token} is too large to be represented in JSON`, start);
      }
      return value;
    }
    const dateTime = DATE_TIME.exec(token);
    if (dateTime) {
      this.checkDate(dateTime[1], dateTime[2], dateTime[3], start);
      this.checkTime(dateTime[4], dateTime[5], dateTime[6], start);
      if (dateTime[7] && dateTime[7].length === 6) {
        this.checkTime(dateTime[7].slice(1, 3), dateTime[7].slice(4, 6), '00', start);
      }
      return token;
    }
    const date = LOCAL_DATE.exec(token);
    if (date) {
      this.checkDate(date[1], date[2], date[3], start);
      return token;
    }
    const time = LOCAL_TIME.exec(token);
    if (time) {
      this.checkTime(time[1], time[2], time[3], start);
      return token;
    }
    this.pos = start;
    this.fail(`invalid value ${JSON.stringify(token.length > 40 ? `${token.slice(0, 40)}…` : token)} (strings must be quoted)`, start);
  }

  private checkDate(year: string, month: string, day: string, start: number): void {
    const m = Number(month);
    const d = Number(day);
    if (m < 1 || m > 12 || d < 1 || d > 31 || Number(year) < 0) {
      this.fail(`invalid date ${year}-${month}-${day}`, start);
    }
  }

  private checkTime(hour: string, minute: string, second: string, start: number): void {
    if (Number(hour) > 23 || Number(minute) > 59 || Number(second) > 60) {
      this.fail(`invalid time ${hour}:${minute}:${second}`, start);
    }
  }
}

/** Parses TOML (the subset described above) into prototype-less objects. */
export const parseToml = (text: string): JsonObject => {
  assertInputLength(text);
  return new TomlParser(text).parse();
};
