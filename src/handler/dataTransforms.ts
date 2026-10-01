/**
 * Pure (vscode-independent) part of the DATA-001..DATA-040 data format commands: the command
 * table and one transform per command. Every transform takes the selected text and returns the
 * result with LF line breaks, or throws `DataInputError` (shown to the user, nothing changed) /
 * `EncOutputTooLargeError` (the result would exceed MAX_OUTPUT_LENGTH).
 *
 * Only local processing: no network, files or processes, no `eval` / `new Function`, and no new
 * dependency (`js-yaml` and `xml-formatter` were already used by other commands).
 */
import * as yaml from 'js-yaml';
import {
  assertDepth,
  assertInputLength,
  canonicalJson,
  createRecord,
  DATA_MAX_DEPTH,
  DataInputError,
  formatPath,
  GraphInfo,
  hasOwn,
  inspectGraph,
  isJsonObject,
  isMultiLine,
  isScalar,
  JsonObject,
  JsonValue,
  lookupPath,
  OutputBuffer,
  PathSegment,
  requireArray,
  requireObject,
  setOwn,
  stringifyLike,
  stringifyPretty,
  tooDeepError,
} from './dataCommon';
import { JsonSyntaxError, lineColumnAt, parseIni, parseJsonLike, parseProperties } from './dataParsers';
import { parseToml } from './tomlParser';
import { toEnv, toIni, toJsObject, toProperties, toQueryString, toToml, toXml } from './dataWriters';

/** Where a command puts its result. */
export type DataOutput = 'new-tab' | 'replace' | 'notify' | 'merge';

/** A transform of one selection; `path` is the value typed into the input box (DATA-015 / 023 / 024). */
export type DataTransform = (text: string, path: PathSegment[]) => string;

/** What a `notify` command reports: DATA-019 (validation) or DATA-025 (counts). */
export type DataNotification = 'validate' | 'count';

interface DataCommandBase {
  /** ROADMAP ID, e.g. `DATA-001`. */
  id: string;
  /** Command ID without the `selection-manipulator.` prefix. */
  name: string;
  /** Title in package.json / ROADMAP. */
  title: string;
}

/** A command that converts every selection (into a new editor or in place). */
export interface DataTransformEntry extends DataCommandBase {
  output: 'new-tab' | 'replace';
  /** The conversion (always present, so the table cannot name a command that does nothing). */
  transform: DataTransform;
  /** Asks for a path (DATA-015) or a field (DATA-023 / 024) first. */
  prompt?: 'path' | 'field';
}

/** DATA-018: merges all selections into one new editor. */
export interface DataMergeEntry extends DataCommandBase {
  output: 'merge';
}

/** DATA-019 / 025: only shows a notification. */
export interface DataNotifyEntry extends DataCommandBase {
  output: 'notify';
  notify: DataNotification;
}

export type DataCommandEntry = DataTransformEntry | DataMergeEntry | DataNotifyEntry;

/** Whether the command converts every selection (it has a `transform`), as opposed to merge / notify. */
export const isTransformEntry = (entry: DataCommandEntry): entry is DataTransformEntry =>
  entry.output === 'new-tab' || entry.output === 'replace';

// ---------------------------------------------------------------------------------------------
// Reading JSON
// ---------------------------------------------------------------------------------------------

/**
 * Reads JSON with `JSON.parse` (leading / trailing white space ignored). When it fails, the
 * strict parser of `dataParsers.ts` explains where ("line L, column C: ..."), so that the message
 * never quotes a long piece of the selection.
 */
export const parseJson = (text: string): JsonValue => {
  assertInputLength(text);
  let value: JsonValue;
  try {
    value = JSON.parse(text) as JsonValue;
  } catch {
    try {
      parseJsonLike(text, 'json');
    } catch (error) {
      if (error instanceof DataInputError) {
        throw new DataInputError(`invalid JSON: ${error.message}`);
      }
      throw error;
    }
    throw new DataInputError('invalid JSON');
  }
  assertDepth(value);
  return value;
};

// ---------------------------------------------------------------------------------------------
// C1: JSON structure
// ---------------------------------------------------------------------------------------------

/** DATA-001 / 034: sorts the keys of every object (UTF-16 code unit order); arrays keep their order. */
export const sortKeysDeep = (value: JsonValue): JsonValue => {
  if (Array.isArray(value)) {
    return value.map(sortKeysDeep);
  }
  if (isJsonObject(value)) {
    const result = createRecord<JsonValue>();
    Object.keys(value).sort().forEach((key) => setOwn(result, key, sortKeysDeep(value[key])));
    return result;
  }
  return value;
};

/** DATA-011: removes `null` values of objects and `null` elements of arrays (empty containers stay). */
export const removeNulls = (value: JsonValue): JsonValue => {
  if (Array.isArray(value)) {
    return value.filter((item) => item !== null).map(removeNulls);
  }
  if (isJsonObject(value)) {
    const result = createRecord<JsonValue>();
    Object.entries(value).forEach(([key, item]) => {
      if (item !== null) {
        setOwn(result, key, removeNulls(item));
      }
    });
    return result;
  }
  return value;
};

/** DATA-015: a string is written as it is, anything else as JSON (containers indented with 2 spaces). */
export const getPath = (text: string, path: PathSegment[]): string => {
  const found = lookupPath(parseJson(text), path);
  if (found === undefined) {
    throw new DataInputError(`nothing found at the path ${formatPath(path)}`);
  }
  return typeof found === 'string' ? found : stringifyPretty(found);
};

/** DATA-016: the path of every leaf (a scalar, an empty object or an empty array), one per line. */
export const listPaths = (text: string): string => {
  const out = new OutputBuffer();
  const visit = (value: JsonValue, path: PathSegment[]): void => {
    if (Array.isArray(value) && value.length > 0) {
      value.forEach((item, index) => visit(item, [...path, index]));
    } else if (isJsonObject(value) && Object.keys(value).length > 0) {
      Object.entries(value).forEach(([key, item]) => visit(item, [...path, key]));
    } else {
      out.push(`${formatPath(path)}\n`);
    }
  };
  visit(parseJson(text), []);
  return out.join('').slice(0, -1);
};

/** DATA-017: the top-level keys, one per line. */
export const listKeys = (text: string): string =>
  Object.keys(requireObject(parseJson(text), 'Extract JSON Keys')).join('\n');

/** DATA-018: deep merge (later wins, arrays and scalars are replaced). */
export const deepMerge = (target: JsonObject, source: JsonObject, depth = 1): JsonObject => {
  if (depth > DATA_MAX_DEPTH) {
    throw tooDeepError();
  }
  const result = createRecord<JsonValue>();
  Object.entries(target).forEach(([key, value]) => setOwn(result, key, value));
  Object.entries(source).forEach(([key, value]) => {
    const existing = hasOwn(result, key) ? result[key] : undefined;
    setOwn(result, key, isJsonObject(existing) && isJsonObject(value) ? deepMerge(existing, value, depth + 1) : value);
  });
  return result;
};

/** DATA-018: merges the JSON objects of all selections (in document order) into one. */
export const mergeJsonObjects = (texts: string[]): string => {
  let merged = createRecord<JsonValue>();
  texts.forEach((text, index) => {
    const where = `selection ${index + 1} of ${texts.length}: `;
    let value: JsonValue;
    try {
      value = parseJson(text);
    } catch (error) {
      throw error instanceof DataInputError ? new DataInputError(`${where}${error.message}`) : error;
    }
    if (!isJsonObject(value)) {
      throw new DataInputError(`${where}Merge JSON Objects needs a JSON object in every selection`);
    }
    merged = deepMerge(merged, value);
  });
  return stringifyPretty(merged);
};

/** DATA-019: the first syntax error of strict JSON, or `undefined` when the text is valid JSON. */
export const findJsonError = (text: string): JsonSyntaxError | undefined => {
  try {
    parseJsonLike(text, 'json');
    return undefined;
  } catch (error) {
    if (error instanceof JsonSyntaxError) {
      return error;
    }
    throw error;
  }
};

/** DATA-022: removes duplicate elements of the top-level array (objects compared by content, keys in any order). */
export const arrayUnique = (text: string): string => {
  const array = requireArray(parseJson(text), 'Remove Duplicates in JSON Array');
  const seen = new Set<string>();
  const result = array.filter((item) => {
    const key = canonicalJson(item);
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
  return stringifyLike(result, text);
};

/** DATA-023: the value at the field path of every element (`null` where there is none). */
export const pluck = (text: string, path: PathSegment[]): string => {
  const array = requireArray(parseJson(text), 'Pluck Field from JSON Array');
  const result = array.map((item) => lookupPath(item, path) ?? null);
  return stringifyLike(result, text);
};

/** DATA-024: groups the elements by the value at the field path (groups in order of appearance). */
export const groupBy = (text: string, path: PathSegment[]): string => {
  const array = requireArray(parseJson(text), 'Group JSON Array by Field');
  const groups = createRecord<JsonValue[]>();
  array.forEach((item, index) => {
    const value = lookupPath(item, path);
    if (value === undefined) {
      throw new DataInputError(`element ${index} has no field ${formatPath(path)}`);
    }
    if (!isScalar(value)) {
      throw new DataInputError(`the field ${formatPath(path)} of element ${index} is an object or array`);
    }
    const name = typeof value === 'string' ? value : JSON.stringify(value);
    if (!hasOwn(groups, name)) {
      setOwn(groups, name, []);
    }
    groups[name].push(item);
  });
  return stringifyLike(groups, text);
};

/** DATA-025: "3 elements (4 nodes in total)" / "2 keys (...)" / "1 value (1 node in total)". */
export const describeCount = (text: string): string => {
  const value = parseJson(text);
  let nodes = 0;
  const stack: JsonValue[] = [value];
  while (stack.length > 0) {
    const item = stack.pop()!;
    nodes++;
    // Pushed one by one: spreading a huge array into push() would exceed the argument limit.
    const children = Array.isArray(item) ? item : isJsonObject(item) ? Object.values(item) : [];
    for (const child of children) {
      stack.push(child);
    }
  }
  const plural = (count: number, word: string) => `${count} ${word}${count === 1 ? '' : 's'}`;
  const head = Array.isArray(value)
    ? plural(value.length, 'element')
    : isJsonObject(value) ? plural(Object.keys(value).length, 'key') : '1 value';
  return `${head} (${plural(nodes, 'node')} in total)`;
};

export const JSON_SCHEMA_DRAFT = 'https://json-schema.org/draft/2020-12/schema';

/**
 * Builds the schemas bottom-up and interns them: every distinct schema gets a number, and the key
 * that identifies a schema is made of its children's numbers (never of their whole text), so
 * comparing the element schemas of an array costs the same at every depth and the whole
 * generation stays linear in the size of the input.
 */
class SchemaBuilder {
  private readonly ids = new Map<string, number>();
  private readonly schemas: JsonObject[] = [];

  /** The number of the schema identified by `key`, created by `make` the first time. */
  private intern(key: string, make: () => JsonObject): number {
    const known = this.ids.get(key);
    if (known !== undefined) {
      return known;
    }
    const id = this.schemas.length;
    this.schemas.push(make());
    this.ids.set(key, id);
    return id;
  }

  schema(id: number): JsonObject {
    return this.schemas[id];
  }

  /** The schema of one value; two values get the same number exactly when their schemas are equal. */
  of(value: JsonValue, depth = 1): number {
    if (depth > DATA_MAX_DEPTH) {
      throw tooDeepError();
    }
    const simple = (type: string) => this.intern(type, () => {
      const schema = createRecord<JsonValue>();
      schema.type = type;
      return schema;
    });
    if (value === null) {
      return simple('null');
    }
    if (typeof value === 'boolean') {
      return simple('boolean');
    }
    if (typeof value === 'number') {
      return simple(Number.isInteger(value) ? 'integer' : 'number');
    }
    if (typeof value === 'string') {
      return simple('string');
    }
    if (Array.isArray(value)) {
      // The distinct element schemas in order of first appearance.
      const items = [...new Set(value.map((item) => this.of(item, depth + 1)))];
      return this.intern(`array:${items.join(',')}`, () => {
        const schema = createRecord<JsonValue>();
        schema.type = 'array';
        schema.items = items.length === 0
          ? createRecord<JsonValue>()
          : items.length === 1 ? this.schema(items[0]) : { anyOf: items.map((id) => this.schema(id)) };
        return schema;
      });
    }
    const keys = Object.keys(value);
    const children = keys.map((key) => this.of(value[key], depth + 1));
    // `required` lists the keys in their order, so the order is part of the identity.
    return this.intern(`object:${JSON.stringify(keys)}:${children.join(',')}`, () => {
      const schema = createRecord<JsonValue>();
      schema.type = 'object';
      const properties = createRecord<JsonValue>();
      keys.forEach((key, index) => setOwn(properties, key, this.schema(children[index])));
      schema.properties = properties;
      if (keys.length > 0) {
        schema.required = keys;
      }
      return schema;
    });
  }
}

/** DATA-026: a JSON Schema (draft 2020-12) skeleton of the sample (the `$schema` URL is only written, never fetched). */
export const toJsonSchema = (text: string): string => {
  const schema = createRecord<JsonValue>();
  schema.$schema = JSON_SCHEMA_DRAFT;
  const builder = new SchemaBuilder();
  Object.entries(builder.schema(builder.of(parseJson(text)))).forEach(([key, value]) => setOwn(schema, key, value));
  // An equal schema may appear in several places (it is written out each time); the output size
  // is checked before the text is built.
  return stringifyPretty(schema);
};

/** DATA-033: expands string values that hold a JSON object or array, recursively. */
export const parseNested = (text: string): string => {
  const expand = (value: JsonValue, depth: number): JsonValue => {
    if (depth > DATA_MAX_DEPTH) {
      throw tooDeepError();
    }
    if (typeof value === 'string') {
      const trimmed = value.trim();
      if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
        let inner: JsonValue;
        try {
          inner = JSON.parse(trimmed) as JsonValue;
        } catch {
          return value;
        }
        return expand(inner, depth);
      }
      return value;
    }
    if (Array.isArray(value)) {
      return value.map((item) => expand(item, depth + 1));
    }
    if (isJsonObject(value)) {
      const result = createRecord<JsonValue>();
      Object.entries(value).forEach(([key, item]) => setOwn(result, key, expand(item, depth + 1)));
      return result;
    }
    return value;
  };
  return stringifyLike(expand(parseJson(text), 1), text);
};

// ---------------------------------------------------------------------------------------------
// C3: other formats -> JSON
// ---------------------------------------------------------------------------------------------

/** DATA-013 / 039: every non-blank line is one JSON value; an error names the line and the column in it. */
export const jsonLinesToJson = (text: string): string => {
  assertInputLength(text);
  const result: JsonValue[] = [];
  text.split(/\r\n|\r|\n/).forEach((line, index) => {
    if (line.trim() === '') {
      return;
    }
    let value: JsonValue;
    try {
      value = JSON.parse(line) as JsonValue;
    } catch {
      const error = findJsonError(line);
      if (error === undefined) {
        throw new DataInputError(`line ${index + 1}: invalid JSON`);
      }
      // The line has no line break, so only the column is needed.
      throw new DataInputError(`line ${index + 1}, column ${lineColumnAt(line, error.offset).column}: ${error.reason}`);
    }
    assertDepth(value);
    result.push(value);
  });
  return stringifyPretty(result);
};

// ---------------------------------------------------------------------------------------------
// C4: YAML
// ---------------------------------------------------------------------------------------------

/**
 * Upper limit of (mappings and sequences) x (references to them) of a YAML selection that uses
 * anchors and aliases. When the references are kept, js-yaml finds repeated objects with linear
 * searches: once per reference over all objects seen so far, and once per written object over the
 * shared ones, so writing takes time proportional to this product: at the limit, from about 0.1 s
 * up to about a second on a current machine, the first call (with warm-up) being the slowest.
 * Without aliases the references are not tracked at all and writing is linear.
 */
export const YAML_MAX_ALIAS_WORK = 300_000_000;

/**
 * Throws when writing YAML that shares objects (anchors and aliases) would take too long: more
 * than YAML_MAX_ALIAS_WORK (mappings and sequences) x (references to them). DATA-020 / 021 / 040
 * and DATAX-012.
 */
export const assertYamlAliasWork = (graph: GraphInfo): void => {
  if (graph.shared && graph.containers * graph.references > YAML_MAX_ALIAS_WORK) {
    const count = (n: number) => n.toLocaleString('en-US');
    throw new DataInputError(
      `YAML with anchors and aliases is too large: ${count(graph.containers)} mappings and sequences`
      + ` x ${count(graph.references)} references to them is more than the limit of ${count(YAML_MAX_ALIAS_WORK)}`
    );
  }
};

/** A line that holds no YAML value: blank, a comment or a document marker (checked without a regular expression). */
export const isEmptyYamlLine = (line: string): boolean => {
  const trimmed = line.trim();
  return trimmed === '' || trimmed.startsWith('#') || trimmed === '---' || trimmed === '...';
};

/**
 * DATA-020 / 021 / 040: reads and writes with the YAML 1.2 Core schema (dates and times stay
 * strings, `<<` is an ordinary key), keeps anchors / aliases as references, and ends with a line
 * break only when the selection did (LF or CRLF).
 */
export const formatYaml = (text: string, sortKeys: boolean): string => {
  assertInputLength(text);
  let value: unknown;
  try {
    value = yaml.load(text, { schema: yaml.CORE_SCHEMA });
  } catch (error) {
    throw yamlError(error);
  }
  // Only comments, blank lines or document markers: there is nothing to format (not "null").
  if ((value === undefined || value === null) && text.split(/\r\n|\r|\n/).every(isEmptyYamlLine)) {
    throw new DataInputError('the selection contains no YAML value');
  }
  // Aliases share objects: visit each once (depth check), and learn whether any is shared.
  const graph = inspectGraph(value);
  assertYamlAliasWork(graph);
  let dumped: string;
  try {
    // Without shared objects there is nothing to write as an alias, so reference tracking is off.
    dumped = yaml.dump(value, { schema: yaml.CORE_SCHEMA, indent: 2, lineWidth: -1, sortKeys, noRefs: !graph.shared });
  } catch (error) {
    throw yamlError(error);
  }
  const body = dumped.endsWith('\n') ? dumped.slice(0, -1) : dumped;
  return /\n$/.test(text) ? `${body}\n` : body;
};

/** Where and why js-yaml rejected the text: `line L, column C: <reason>` (no position when js-yaml gives none). */
export const yamlErrorDetail = (error: yaml.YAMLException): string => {
  const mark = error.mark as { line?: number; column?: number } | undefined;
  const where = mark && typeof mark.line === 'number' && typeof mark.column === 'number'
    ? `line ${mark.line + 1}, column ${mark.column + 1}: `
    : '';
  return `${where}${error.reason}`;
};

export const yamlError = (error: unknown): Error => {
  if (error instanceof yaml.YAMLException) {
    return new DataInputError(`invalid YAML: ${yamlErrorDetail(error)}`);
  }
  if (error instanceof RangeError) {
    return tooDeepError();
  }
  return error instanceof Error ? error : new Error(String(error));
};

// ---------------------------------------------------------------------------------------------
// C5: HTTP texts
// ---------------------------------------------------------------------------------------------

const unquoteDoubleQuotes = (value: string): string =>
  value.length >= 2 && value.startsWith('"') && value.endsWith('"') ? value.slice(1, -1) : value;

/** DATA-029: `a=1; b=x` (a leading `Cookie:` is removed) -> object; a repeated name becomes an array. */
export const cookieToJson = (text: string): string => {
  assertInputLength(text);
  const body = text.trim().replace(/^cookie[ \t]*:/i, '');
  if (/[\r\n]/.test(body)) {
    throw new DataInputError('a Cookie header must be on one line');
  }
  const result = createRecord<JsonValue>();
  body.split(';').map((part) => part.trim()).filter((part) => part !== '').forEach((part) => {
    const separator = part.indexOf('=');
    const name = separator < 0 ? '' : part.slice(0, separator).trim();
    if (name === '') {
      throw new DataInputError('every cookie must be written as name=value');
    }
    const value = unquoteDoubleQuotes(part.slice(separator + 1).trim());
    if (!hasOwn(result, name)) {
      setOwn(result, name, value);
    } else {
      const existing = result[name];
      if (Array.isArray(existing)) {
        existing.push(value);
      } else {
        setOwn(result, name, [existing, value]);
      }
    }
  });
  return stringifyPretty(result);
};

const SET_COOKIE_ATTRIBUTES: Record<string, string> = {
  expires: 'expires',
  'max-age': 'maxAge',
  domain: 'domain',
  path: 'path',
  secure: 'secure',
  httponly: 'httpOnly',
  samesite: 'sameSite',
  partitioned: 'partitioned',
  priority: 'priority',
};
const SET_COOKIE_FLAGS = new Set(['secure', 'httpOnly', 'partitioned']);

const parseSetCookie = (line: string, where: string): JsonObject => {
  const parts = line.trim().replace(/^set-cookie[ \t]*:/i, '').split(';').map((part) => part.trim());
  const [first, ...attributes] = parts;
  const separator = first.indexOf('=');
  if (separator <= 0 || first.slice(0, separator).trim() === '') {
    throw new DataInputError(`${where}the cookie must start with name=value`);
  }
  const result = createRecord<JsonValue>();
  setOwn(result, 'name', first.slice(0, separator).trim());
  setOwn(result, 'value', unquoteDoubleQuotes(first.slice(separator + 1).trim()));
  attributes.filter((part) => part !== '').forEach((part) => {
    const equals = part.indexOf('=');
    const rawName = (equals < 0 ? part : part.slice(0, equals)).trim().toLowerCase();
    const rawValue = equals < 0 ? undefined : part.slice(equals + 1).trim();
    const known = hasOwn(SET_COOKIE_ATTRIBUTES, rawName) ? SET_COOKIE_ATTRIBUTES[rawName] : undefined;
    if (known !== undefined && SET_COOKIE_FLAGS.has(known)) {
      setOwn(result, known, true);
    } else if (known === 'maxAge' && rawValue !== undefined && /^-?[0-9]{1,15}$/.test(rawValue)) {
      setOwn(result, known, Number(rawValue));
    } else if (known !== undefined) {
      setOwn(result, known, rawValue ?? '');
    } else {
      if (rawName === '' || rawName === 'name' || rawName === 'value') {
        throw new DataInputError(`${where}unexpected attribute ${JSON.stringify(part.length > 40 ? `${part.slice(0, 40)}…` : part)}`);
      }
      setOwn(result, rawName, rawValue ?? true);
    }
  });
  return result;
};

/** DATA-030: one line -> one object, several lines -> an array (one cookie per line). */
export const setCookieToJson = (text: string): string => {
  assertInputLength(text);
  const lines = text.split(/\r\n|\r|\n/).map((line, index) => ({ line, index })).filter(({ line }) => line.trim() !== '');
  if (lines.length === 1) {
    return stringifyPretty(parseSetCookie(lines[0].line, ''));
  }
  return stringifyPretty(lines.map(({ line, index }) => parseSetCookie(line, `line ${index + 1}: `)));
};

const REQUEST_LINE = /^[A-Z]+ [^ ]+ HTTP\/[0-9](?:\.[0-9])?$/;
const STATUS_LINE = /^HTTP\/[0-9](?:\.[0-9])? [0-9]{3}(?: .*)?$/;

/** DATA-031: `Name: value` lines -> object (a request / status line is skipped, continuation lines are joined). */
export const httpHeadersToJson = (text: string): string => {
  assertInputLength(text);
  const result = createRecord<JsonValue>();
  const names = new Map<string, string>();
  let lastName: string | undefined;
  let first = true;
  text.split(/\r\n|\r|\n/).forEach((line, index) => {
    const where = `line ${index + 1}`;
    if (line.trim() === '') {
      return;
    }
    if (first && (REQUEST_LINE.test(line.trim()) || STATUS_LINE.test(line.trim()))) {
      first = false;
      return;
    }
    first = false;
    if (line.startsWith(' ') || line.startsWith('\t')) {
      if (lastName === undefined) {
        throw new DataInputError(`${where}: a continuation line needs a header before it`);
      }
      const existing = result[lastName];
      const addition = line.trim();
      if (Array.isArray(existing)) {
        existing[existing.length - 1] = `${existing[existing.length - 1]} ${addition}`;
      } else {
        setOwn(result, lastName, `${existing} ${addition}`);
      }
      return;
    }
    const colon = line.indexOf(':');
    const name = colon < 0 ? '' : line.slice(0, colon).trim();
    if (name === '') {
      throw new DataInputError(`${where}: expected "Name: value"`);
    }
    const value = line.slice(colon + 1).trim();
    const lower = name.toLowerCase();
    const known = names.get(lower);
    if (known === undefined) {
      names.set(lower, name);
      setOwn(result, name, value);
      lastName = name;
    } else {
      const existing = result[known];
      if (Array.isArray(existing)) {
        existing.push(value);
      } else {
        setOwn(result, known, [existing, value]);
      }
      lastName = known;
    }
  });
  return stringifyPretty(result);
};

/** Maximum length of one User-Agent line (DATA-032). */
export const USER_AGENT_MAX_LENGTH = 2_000;

const BROWSER_RULES: [string, RegExp][] = [
  ['Edge', /(?:Edg|EdgA|EdgiOS)\/([0-9]+)/],
  ['Opera', /OPR\/([0-9]+)/],
  ['Samsung Internet', /SamsungBrowser\/([0-9]+)/],
  ['Firefox', /(?:Firefox|FxiOS)\/([0-9]+)/],
  ['Chrome', /(?:Chrome|CriOS)\/([0-9]+)/],
];

const WINDOWS_VERSIONS: Record<string, string> = { '10.0': '10', '6.3': '8.1', '6.2': '8', '6.1': '7', '6.0': 'Vista', '5.1': 'XP' };

const detectBrowser = (ua: string): string => {
  for (const [name, pattern] of BROWSER_RULES) {
    const match = pattern.exec(ua);
    if (match) {
      return `${name} ${match[1]}`;
    }
  }
  const safari = /Version\/([0-9]+)[^ ]* (?:Mobile\/[^ ]+ )?Safari\//.exec(ua);
  if (safari) {
    return `Safari ${safari[1]}`;
  }
  const msie = /MSIE ([0-9]+)/.exec(ua) ?? (/Trident\//.test(ua) ? /rv:([0-9]+)/.exec(ua) : null);
  if (msie) {
    return `Internet Explorer ${msie[1]}`;
  }
  return 'Unknown';
};

const detectOs = (ua: string): string => {
  const windows = /Windows NT ([0-9]+\.[0-9]+)/.exec(ua);
  if (windows) {
    const version = hasOwn(WINDOWS_VERSIONS, windows[1]) ? WINDOWS_VERSIONS[windows[1]] : `NT ${windows[1]}`;
    return `Windows ${version}`;
  }
  const ios = /(?:iPhone OS|CPU OS) ([0-9]+(?:_[0-9]+)*)/.exec(ua);
  if (ios) {
    return `iOS ${ios[1].replace(/_/g, '.')}`;
  }
  if (/iPhone|iPad|iPod/.test(ua)) {
    return 'iOS';
  }
  const android = /Android ([0-9]+(?:\.[0-9]+)*)/.exec(ua);
  if (android) {
    return `Android ${android[1]}`;
  }
  if (/Android/.test(ua)) {
    return 'Android';
  }
  if (/CrOS/.test(ua)) {
    return 'ChromeOS';
  }
  const mac = /Mac OS X ([0-9]+(?:[._][0-9]+)*)/.exec(ua);
  if (mac) {
    return `macOS ${mac[1].replace(/_/g, '.')}`;
  }
  if (/Macintosh|Mac OS X/.test(ua)) {
    return 'macOS';
  }
  if (/Linux/.test(ua)) {
    return 'Linux';
  }
  return 'Unknown';
};

const parseUserAgent = (ua: string, where: string): JsonObject => {
  if (ua.length > USER_AGENT_MAX_LENGTH) {
    throw new DataInputError(`${where}the User-Agent is longer than ${USER_AGENT_MAX_LENGTH.toLocaleString('en-US')} characters`);
  }
  const result = createRecord<JsonValue>();
  result.browser = detectBrowser(ua);
  result.os = detectOs(ua);
  return result;
};

/** DATA-032: `{"browser": "Chrome 120", "os": "Windows 10"}` (one line) or an array (one per line). */
export const userAgentToJson = (text: string): string => {
  assertInputLength(text);
  const lines = text.split(/\r\n|\r|\n/).map((line, index) => ({ line: line.trim(), index })).filter(({ line }) => line !== '');
  if (lines.length === 1) {
    return stringifyPretty(parseUserAgent(lines[0].line, ''));
  }
  return stringifyPretty(lines.map(({ line, index }) => parseUserAgent(line, `line ${index + 1}: `)));
};

// ---------------------------------------------------------------------------------------------
// The command table
// ---------------------------------------------------------------------------------------------

const json = (convert: (value: JsonValue, text: string) => string): DataTransform => (text) => convert(parseJson(text), text);

const sortJsonKeys: DataTransform = json((value, text) => stringifyLike(sortKeysDeep(value), text));
const jsonToXml: DataTransform = json((value) => toXml(value));
const jsonToToml: DataTransform = json((value) => toToml(value));
const tomlToJson: DataTransform = (text) => stringifyPretty(parseToml(text));
const jsonToJsonLines: DataTransform = json((value) => {
  const out = new OutputBuffer();
  requireArray(value, 'Convert JSON Array to JSON Lines').forEach((item) => out.push(JSON.stringify(item)));
  return out.join('\n');
});
const yamlFormat: DataTransform = (text) => formatYaml(text, false);

/** The 40 commands in ROADMAP order: 33 basic commands followed by 7 "(Replace)" variants. */
export const DATA_COMMAND_ENTRIES: readonly DataCommandEntry[] = [
  { id: 'DATA-001', name: 'json.sort-keys', title: 'Sort JSON Keys', output: 'new-tab', transform: sortJsonKeys },
  { id: 'DATA-002', name: 'json.to-query-string', title: 'Convert JSON to Query String', output: 'new-tab', transform: json((value) => toQueryString(value)) },
  { id: 'DATA-003', name: 'json.to-env', title: 'Convert JSON to Env', output: 'new-tab', transform: json((value) => toEnv(value)) },
  { id: 'DATA-004', name: 'json.to-xml', title: 'Convert JSON to XML', output: 'new-tab', transform: jsonToXml },
  { id: 'DATA-005', name: 'json.to-toml', title: 'Convert JSON to TOML', output: 'new-tab', transform: jsonToToml },
  { id: 'DATA-006', name: 'toml.to-json', title: 'Convert TOML to JSON', output: 'new-tab', transform: tomlToJson },
  { id: 'DATA-007', name: 'json.to-ini', title: 'Convert JSON to INI', output: 'new-tab', transform: json((value) => toIni(value)) },
  { id: 'DATA-008', name: 'ini.to-json', title: 'Convert INI to JSON', output: 'new-tab', transform: (text) => stringifyPretty(parseIni(text)) },
  { id: 'DATA-009', name: 'json.to-properties', title: 'Convert JSON to .properties', output: 'new-tab', transform: json((value) => toProperties(value)) },
  { id: 'DATA-010', name: 'properties.to-json', title: 'Convert .properties to JSON', output: 'new-tab', transform: (text) => stringifyPretty(parseProperties(text)) },
  { id: 'DATA-011', name: 'json.remove-nulls', title: 'Remove Null Values from JSON', output: 'new-tab', transform: json((value, text) => stringifyLike(removeNulls(value), text)) },
  { id: 'DATA-012', name: 'json.to-jsonl', title: 'Convert JSON Array to JSON Lines', output: 'new-tab', transform: jsonToJsonLines },
  { id: 'DATA-013', name: 'jsonl.to-json', title: 'Convert JSON Lines to JSON Array', output: 'new-tab', transform: jsonLinesToJson },
  { id: 'DATA-014', name: 'jsonc.to-json', title: 'Convert JSONC / JSON5 to JSON', output: 'new-tab', transform: (text) => stringifyPretty(parseJsonLike(text, 'json5')) },
  { id: 'DATA-015', name: 'json.get-path', title: 'Extract JSON Value by Path', output: 'new-tab', prompt: 'path', transform: getPath },
  { id: 'DATA-016', name: 'json.list-paths', title: 'List JSON Paths', output: 'new-tab', transform: listPaths },
  { id: 'DATA-017', name: 'json.keys', title: 'Extract JSON Keys', output: 'new-tab', transform: listKeys },
  { id: 'DATA-018', name: 'json.merge-selections', title: 'Merge JSON Objects (Selections)', output: 'merge' },
  { id: 'DATA-019', name: 'json.validate', title: 'Validate JSON', output: 'notify', notify: 'validate' },
  { id: 'DATA-020', name: 'yaml.format', title: 'Format YAML', output: 'new-tab', transform: yamlFormat },
  { id: 'DATA-021', name: 'yaml.sort-keys', title: 'Sort YAML Keys', output: 'new-tab', transform: (text) => formatYaml(text, true) },
  { id: 'DATA-022', name: 'json.array-unique', title: 'Remove Duplicates in JSON Array', output: 'new-tab', transform: arrayUnique },
  { id: 'DATA-023', name: 'json.pluck', title: 'Pluck Field from JSON Array', output: 'new-tab', prompt: 'field', transform: pluck },
  { id: 'DATA-024', name: 'json.group-by', title: 'Group JSON Array by Field', output: 'new-tab', prompt: 'field', transform: groupBy },
  { id: 'DATA-025', name: 'json.count', title: 'Count JSON Elements', output: 'notify', notify: 'count' },
  { id: 'DATA-026', name: 'json.to-schema', title: 'Generate JSON Schema from JSON', output: 'new-tab', transform: toJsonSchema },
  { id: 'DATA-027', name: 'json.to-js-object', title: 'Convert JSON to JS Object Literal', output: 'new-tab', transform: json((value, text) => toJsObject(value, isMultiLine(text))) },
  { id: 'DATA-028', name: 'js-object.to-json', title: 'Convert JS Object Literal to JSON', output: 'new-tab', transform: (text) => stringifyPretty(parseJsonLike(text, 'js-object')) },
  { id: 'DATA-029', name: 'cookie.to-json', title: 'Parse Cookie Header to JSON', output: 'new-tab', transform: cookieToJson },
  { id: 'DATA-030', name: 'set-cookie.to-json', title: 'Parse Set-Cookie to JSON', output: 'new-tab', transform: setCookieToJson },
  { id: 'DATA-031', name: 'http-headers.to-json', title: 'Parse HTTP Headers to JSON', output: 'new-tab', transform: httpHeadersToJson },
  { id: 'DATA-032', name: 'user-agent.to-json', title: 'Parse User-Agent to JSON', output: 'new-tab', transform: userAgentToJson },
  { id: 'DATA-033', name: 'json.parse-nested', title: 'Parse Nested JSON Strings', output: 'new-tab', transform: parseNested },
  { id: 'DATA-034', name: 'json.sort-keys.replace', title: 'Sort JSON Keys (Replace)', output: 'replace', transform: sortJsonKeys },
  { id: 'DATA-035', name: 'json.to-xml.replace', title: 'Convert JSON to XML (Replace)', output: 'replace', transform: jsonToXml },
  { id: 'DATA-036', name: 'json.to-toml.replace', title: 'Convert JSON to TOML (Replace)', output: 'replace', transform: jsonToToml },
  { id: 'DATA-037', name: 'toml.to-json.replace', title: 'Convert TOML to JSON (Replace)', output: 'replace', transform: tomlToJson },
  { id: 'DATA-038', name: 'json.to-jsonl.replace', title: 'Convert JSON Array to JSON Lines (Replace)', output: 'replace', transform: jsonToJsonLines },
  { id: 'DATA-039', name: 'jsonl.to-json.replace', title: 'Convert JSON Lines to JSON Array (Replace)', output: 'replace', transform: jsonLinesToJson },
  { id: 'DATA-040', name: 'yaml.format.replace', title: 'Format YAML (Replace)', output: 'replace', transform: yamlFormat },
];
