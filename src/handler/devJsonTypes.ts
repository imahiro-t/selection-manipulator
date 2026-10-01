/**
 * DEV-012..014: type definitions (TypeScript interface, Go struct, Python TypedDict) inferred from
 * a sample JSON (vscode-independent).
 *
 * The JSON is read with `JSON.parse` only and never evaluated. Everything that is keyed by a JSON
 * key is kept in a `Map` (never in a plain object), so keys such as `__proto__`, `constructor` or
 * `toString` are ordinary fields: nothing is looked up on, or written to, `Object.prototype`.
 * The nesting depth is capped at DEV_MAX_NESTING, so the recursion is bounded, and the result is
 * counted against the output budget.
 */
import { DEV_MAX_NESTING, DevInputError, DevOutputBuffer } from './devCommon';
import { toJsString, toPythonString } from './devLiterals';

// ---------------------------------------------------------------------------------------------
// Inference
// ---------------------------------------------------------------------------------------------

export type Kind = 'string' | 'int' | 'float' | 'bool' | 'null' | 'array' | 'object';

/** Everything seen at one place of the sample (the union of the values found there). */
export interface Shape {
  kinds: Set<Kind>;
  /** The merged elements of the arrays seen here (undefined when every array was empty). */
  element?: Shape;
  /** The merged objects seen here. */
  object?: ObjectShape;
}

export interface FieldShape {
  shape: Shape;
  /** In how many of the merged objects the key was present. */
  count: number;
}

export interface ObjectShape {
  /** The fields in the order in which their keys first appeared. */
  fields: Map<string, FieldShape>;
  /** How many objects were merged. */
  count: number;
}

const newShape = (): Shape => ({ kinds: new Set() });

const tooDeep = (): DevInputError => new DevInputError(`the JSON is nested deeper than ${DEV_MAX_NESTING} levels`);

/** Merges `value` into `shape`; `depth` is the nesting depth of `value` (the root is 1). */
const mergeValue = (shape: Shape, value: unknown, depth: number): void => {
  if (value === null) {
    shape.kinds.add('null');
  } else if (typeof value === 'string') {
    shape.kinds.add('string');
  } else if (typeof value === 'number') {
    // `1.0` and `1e2` are parsed to integers: the text of the number is not available.
    shape.kinds.add(Number.isInteger(value) ? 'int' : 'float');
  } else if (typeof value === 'boolean') {
    shape.kinds.add('bool');
  } else if (Array.isArray(value)) {
    if (depth > DEV_MAX_NESTING) {
      throw tooDeep();
    }
    shape.kinds.add('array');
    for (const item of value) {
      shape.element ??= newShape();
      mergeValue(shape.element, item, depth + 1);
    }
  } else if (typeof value === 'object') {
    if (depth > DEV_MAX_NESTING) {
      throw tooDeep();
    }
    shape.kinds.add('object');
    shape.object ??= { fields: new Map(), count: 0 };
    const object = shape.object;
    object.count++;
    const record = value as Record<string, unknown>;
    // Own keys only (`JSON.parse` makes even `__proto__` an own property).
    for (const key of Object.keys(record)) {
      if (!Object.prototype.hasOwnProperty.call(record, key)) {
        continue;
      }
      let field = object.fields.get(key);
      if (field === undefined) {
        field = { shape: newShape(), count: 0 };
        object.fields.set(key, field);
      }
      field.count++;
      mergeValue(field.shape, record[key], depth + 1);
    }
  }
};

/** The object shape of the root: an object, or the merged objects of an array of objects. */
export const inferRoot = (text: string): ObjectShape => {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch (error) {
    const detail = error instanceof Error ? `: ${error.message}` : '';
    throw new DevInputError(`the selection is not valid JSON${detail}`);
  }
  const root = newShape();
  mergeValue(root, parsed, 1);
  if (root.object !== undefined) {
    return root.object;
  }
  if (root.kinds.has('array')) {
    const element = root.element;
    if (element === undefined) {
      throw new DevInputError('the JSON array is empty: there is nothing to infer the types from');
    }
    if (element.object !== undefined && element.kinds.size === 1) {
      return element.object;
    }
  }
  throw new DevInputError('the JSON must be an object or an array of objects');
};

// ---------------------------------------------------------------------------------------------
// Names
// ---------------------------------------------------------------------------------------------

/** The words of a key: ASCII letter / digit runs, split again at camelCase and acronym bounds. */
const WORD = /[A-Z]+(?![a-z])|[A-Z]?[a-z]+|[0-9]+/g;

export const wordsOf = (key: string): string[] => key.match(WORD) ?? [];

export const capitalize = (word: string): string => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();

/** `user_id` → `UserId`, `HTTPServer` → `HttpServer` (TypeScript and Python type names). */
export const pascalCase = (key: string): string => wordsOf(key).map(capitalize).join('');

/** The common Go initialisms (as golint writes them). */
const GO_INITIALISMS = new Set([
  'ACL', 'API', 'ASCII', 'CPU', 'CSS', 'DNS', 'EOF', 'GUID', 'HTML', 'HTTP', 'HTTPS', 'ID', 'IP', 'JSON',
  'LHS', 'QPS', 'RAM', 'RHS', 'RPC', 'SLA', 'SMTP', 'SQL', 'SSH', 'TCP', 'TLS', 'TTL', 'UDP', 'UI',
  'UID', 'UUID', 'URI', 'URL', 'UTF8', 'VM', 'XML', 'XMPP', 'XSRF', 'XSS',
]);

/** `user_id` → `UserID`, `api_url` → `APIURL` (Go names: exported, with the usual initialisms). */
const goCase = (key: string): string =>
  wordsOf(key).map((word) => (GO_INITIALISMS.has(word.toUpperCase()) ? word.toUpperCase() : capitalize(word))).join('');

/** A name that can start an identifier: `fallback` when empty, `fallback` + name before a digit. */
export const identifierOf = (name: string, fallback: string): string => {
  if (name === '') {
    return fallback;
  }
  return /^[0-9]/.test(name) ? `${fallback}${name}` : name;
};

/** Hands out unique names: `Name`, `Name2`, `Name3`, … (linear overall). */
export class NamePool {
  private readonly used: Set<string>;
  private readonly next = new Map<string, number>();

  constructor(reserved: Iterable<string> = []) {
    this.used = new Set(reserved);
  }

  take(base: string): string {
    let name = base;
    if (this.used.has(name)) {
      let n = this.next.get(base) ?? 2;
      while (this.used.has(`${base}${n}`)) {
        n++;
      }
      name = `${base}${n}`;
      this.next.set(base, n + 1);
    }
    this.used.add(name);
    return name;
  }
}

/**
 * The object shapes in breadth-first order (the root first) with unique type names: a nested
 * object is named after its key.
 */
export const nameTypes = (root: ObjectShape, nameOf: (key: string) => string, reserved: Iterable<string>): { order: ObjectShape[]; names: Map<ObjectShape, string> } => {
  const pool = new NamePool(reserved);
  const names = new Map<ObjectShape, string>();
  const order: ObjectShape[] = [];
  const assign = (object: ObjectShape, base: string) => {
    names.set(object, pool.take(base));
    order.push(object);
  };
  assign(root, 'Root');
  for (let i = 0; i < order.length; i++) {
    for (const [key, field] of order[i].fields) {
      for (let shape: Shape | undefined = field.shape; shape !== undefined; shape = shape.element) {
        if (shape.object !== undefined) {
          assign(shape.object, identifierOf(nameOf(key), 'Type'));
        }
      }
    }
  }
  return { order, names };
};

export const isOptional = (object: ObjectShape, field: FieldShape): boolean => field.count < object.count;

/** Writes the lines of a result to the budgeted buffer, joined with `eol`. */
export class LineWriter {
  private readonly buffer: DevOutputBuffer;
  private first = true;

  constructor(private readonly eol: string, budget: number) {
    this.buffer = new DevOutputBuffer(budget);
  }

  line(text: string): void {
    if (!this.first) {
      this.buffer.push(this.eol);
    }
    this.first = false;
    this.buffer.push(text);
  }

  join(): string {
    return this.buffer.join();
  }
}

// ---------------------------------------------------------------------------------------------
// DEV-012 TypeScript
// ---------------------------------------------------------------------------------------------

/** Global type names a generated interface must not merge with or shadow. */
const TS_RESERVED = [
  'Array', 'Boolean', 'Date', 'Error', 'Function', 'JSON', 'Map', 'Math', 'Number', 'Object', 'Omit',
  'Partial', 'Pick', 'Promise', 'Readonly', 'Record', 'RegExp', 'Required', 'Set', 'String', 'Symbol',
];

const TS_IDENTIFIER = /^[A-Za-z_$][A-Za-z0-9_$]*$/;

const tsType = (shape: Shape, names: Map<ObjectShape, string>): string => {
  const parts: string[] = [];
  if (shape.kinds.has('string')) {
    parts.push('string');
  }
  if (shape.kinds.has('int') || shape.kinds.has('float')) {
    parts.push('number');
  }
  if (shape.kinds.has('bool')) {
    parts.push('boolean');
  }
  if (shape.object !== undefined) {
    parts.push(names.get(shape.object)!);
  }
  if (shape.kinds.has('array')) {
    if (shape.element === undefined) {
      parts.push('unknown[]');
    } else {
      const element = tsType(shape.element, names);
      parts.push(element.includes(' | ') ? `(${element})[]` : `${element}[]`);
    }
  }
  if (shape.kinds.has('null')) {
    parts.push('null');
  }
  return parts.join(' | ');
};

/**
 * DEV-012: TypeScript interfaces (`Root` first, then the nested types), two-space indentation.
 * A key that is not an identifier is quoted; a key missing from some objects of an array is
 * optional (`?:`); `null` is added to the union.
 */
export const jsonToTypeScript = (text: string, eol: string, budget: number): string => {
  const { order, names } = nameTypes(inferRoot(text), pascalCase, TS_RESERVED);
  const out = new LineWriter(eol, budget);
  order.forEach((object, index) => {
    if (index > 0) {
      out.line('');
    }
    out.line(`interface ${names.get(object)!} {`);
    for (const [key, field] of object.fields) {
      const name = TS_IDENTIFIER.test(key) ? key : toJsString(key);
      out.line(`  ${name}${isOptional(object, field) ? '?' : ''}: ${tsType(field.shape, names)};`);
    }
    out.line('}');
  });
  return out.join();
};

// ---------------------------------------------------------------------------------------------
// DEV-013 Go
// ---------------------------------------------------------------------------------------------

/**
 * The Go type: `interface{}` for `null` only and for values of different types; `null` next to
 * one other type is left out (encoding/json leaves the field at its zero value for `null`).
 */
const goType = (shape: Shape, names: Map<ObjectShape, string>): string => {
  const kinds = new Set(shape.kinds);
  kinds.delete('null');
  if (kinds.has('int') && kinds.has('float')) {
    kinds.delete('int');
  }
  if (kinds.size !== 1) {
    return 'interface{}';
  }
  const [kind] = kinds;
  switch (kind) {
    case 'string':
      return 'string';
    case 'int':
      return 'int';
    case 'float':
      return 'float64';
    case 'bool':
      return 'bool';
    case 'object':
      return names.get(shape.object!)!;
    default:
      return shape.element === undefined ? '[]interface{}' : `[]${goType(shape.element, names)}`;
  }
};

/** The characters encoding/json accepts in a tag name (its `isValidTag`). */
const GO_JSON_TAG_NAME = /^[\p{L}\p{Nd}!#$%&()*+\-./:;<=>?@[\]^_{|}~ ]+$/u;

/** A Go interpreted string literal body: `\` `"` and the control characters escaped. */
const goQuote = (text: string): string =>
  text.replace(/[\\"\u0000-\u001f\u007f]/g, (ch) => {
    switch (ch) {
      case '\\':
        return '\\\\';
      case '"':
        return '\\"';
      case '\n':
        return '\\n';
      case '\r':
        return '\\r';
      case '\t':
        return '\\t';
      default:
        return `\\x${ch.charCodeAt(0).toString(16).padStart(2, '0')}`;
    }
  });

/** The struct tag literal: a raw string, or an interpreted string when the key holds a backquote. */
const goTag = (key: string, optional: boolean): string => {
  const tag = `json:"${goQuote(key)}${optional ? ',omitempty' : ''}"`;
  return tag.includes('`') ? `"${goQuote(tag)}"` : `\`${tag}\``;
};

/** The width of a cell as gofmt's tabwriter counts it (in code points). */
const cellWidth = (text: string): number => [...text].length;

/** The widest cell (no spread: a struct may have a very large number of fields). */
const maxWidth = (cells: readonly string[]): number => cells.reduce((max, cell) => Math.max(max, cellWidth(cell)), 0);

/**
 * DEV-013: Go structs with json tags (`Root` first, then the nested types), indented with a tab
 * and with the columns aligned as gofmt aligns them. Field names are exported and use the common
 * initialisms (`UserID`); a key missing from some objects of an array gets `omitempty`. A key
 * that encoding/json cannot take as a tag name gets a comment saying so.
 */
export const jsonToGoStruct = (text: string, eol: string, budget: number): string => {
  const { order, names } = nameTypes(inferRoot(text), goCase, []);
  const out = new LineWriter(eol, budget);
  order.forEach((object, index) => {
    if (index > 0) {
      out.line('');
    }
    out.line(`type ${names.get(object)!} struct {`);
    const fieldNames = new NamePool();
    const rows = [...object.fields].map(([key, field]) => ({
      name: fieldNames.take(identifierOf(goCase(key), 'Field')),
      type: goType(field.shape, names),
      tag: goTag(key, isOptional(object, field)),
      comment: GO_JSON_TAG_NAME.test(key) ? '' : '// encoding/json cannot use this key as a tag name',
    }));
    const nameWidth = maxWidth(rows.map((row) => row.name));
    const typeWidth = maxWidth(rows.map((row) => row.type));
    // Like tabwriter, the tag column is aligned within each run of lines that have a comment.
    const tagWidths: number[] = new Array(rows.length).fill(0);
    for (let start = 0; start < rows.length; start++) {
      if (rows[start].comment === '') {
        continue;
      }
      let end = start;
      while (end < rows.length && rows[end].comment !== '') {
        end++;
      }
      const width = maxWidth(rows.slice(start, end).map((row) => row.tag));
      tagWidths.fill(width, start, end);
      start = end - 1;
    }
    rows.forEach((row, i) => {
      const pad = (cell: string, width: number) => cell + ' '.repeat(width - cellWidth(cell) + 1);
      const tag = row.comment === '' ? row.tag : `${pad(row.tag, tagWidths[i])}${row.comment}`;
      out.line(`\t${pad(row.name, nameWidth)}${pad(row.type, typeWidth)}${tag}`);
    });
    out.line('}');
  });
  return out.join();
};

// ---------------------------------------------------------------------------------------------
// DEV-014 Python
// ---------------------------------------------------------------------------------------------

/** Names a class must not take: the capitalized keywords and the names imported from typing. */
const PY_RESERVED = ['None', 'True', 'False', 'TypedDict', 'Any', 'NotRequired'];

const PY_KEYWORDS = new Set([
  'False', 'None', 'True', 'and', 'as', 'assert', 'async', 'await', 'break', 'class', 'continue',
  'def', 'del', 'elif', 'else', 'except', 'finally', 'for', 'from', 'global', 'if', 'import', 'in',
  'is', 'lambda', 'nonlocal', 'not', 'or', 'pass', 'raise', 'return', 'try', 'while', 'with', 'yield',
]);

/**
 * A key that can be a class attribute of the class form: an ASCII identifier that is not a
 * keyword and is not name-mangled (`__x`, but not `__x__`).
 */
const isPythonAttribute = (key: string): boolean =>
  /^[A-Za-z_][A-Za-z0-9_]*$/.test(key) && !PY_KEYWORDS.has(key) && !(key.startsWith('__') && !key.endsWith('__'));

const pyType = (shape: Shape, names: Map<ObjectShape, string>, imports: Set<string>): string => {
  const parts: string[] = [];
  if (shape.kinds.has('string')) {
    parts.push('str');
  }
  if (shape.kinds.has('float')) {
    parts.push('float');
  } else if (shape.kinds.has('int')) {
    parts.push('int');
  }
  if (shape.kinds.has('bool')) {
    parts.push('bool');
  }
  if (shape.object !== undefined) {
    parts.push(names.get(shape.object)!);
  }
  if (shape.kinds.has('array')) {
    if (shape.element === undefined) {
      imports.add('Any');
      parts.push('list[Any]');
    } else {
      parts.push(`list[${pyType(shape.element, names, imports)}]`);
    }
  }
  if (shape.kinds.has('null')) {
    parts.push('None');
  }
  return parts.join(' | ');
};

/**
 * DEV-014: Python TypedDicts (the nested types first, `Root` last, so that every name is defined
 * before it is used), four-space indentation, after `from typing import …` (only what is used).
 * A key that cannot be a class attribute makes the functional form `Root = TypedDict('Root', {…})`.
 * A key missing from some objects of an array is `NotRequired[…]`; `null` adds `| None`.
 * The result needs Python 3.11 (3.10 without `NotRequired`).
 */
export const jsonToPythonTypedDict = (text: string, eol: string, budget: number): string => {
  const { order, names } = nameTypes(inferRoot(text), pascalCase, PY_RESERVED);
  const imports = new Set(['TypedDict']);
  const blocks: string[][] = [];
  for (const object of [...order].reverse()) {
    const name = names.get(object)!;
    const fields = [...object.fields].map(([key, field]) => {
      let type = pyType(field.shape, names, imports);
      if (isOptional(object, field)) {
        imports.add('NotRequired');
        type = `NotRequired[${type}]`;
      }
      return { key, type };
    });
    if (fields.every(({ key }) => isPythonAttribute(key))) {
      blocks.push([
        `class ${name}(TypedDict):`,
        ...(fields.length === 0 ? ['    pass'] : fields.map(({ key, type }) => `    ${key}: ${type}`)),
      ]);
    } else {
      blocks.push([
        `${name} = TypedDict(${toPythonString(name)}, {`,
        ...fields.map(({ key, type }) => `    ${toPythonString(key)}: ${type},`),
        '})',
      ]);
    }
  }
  const out = new LineWriter(eol, budget);
  out.line(`from typing import ${[...imports].sort().join(', ')}`);
  for (const block of blocks) {
    out.line('');
    out.line('');
    block.forEach((line) => out.line(line));
  }
  return out.join();
};
