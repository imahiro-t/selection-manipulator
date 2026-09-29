/**
 * Shared, vscode-independent building blocks of the DATA-001..040 data format commands:
 * the error type, the limits, safe object construction, JSON reading / writing rules and the
 * path notation used by DATA-015 / 016 / 023 / 024.
 *
 * Security rules (SECURITY.md): nothing here evaluates code (no `eval`, no `new Function`),
 * objects built from keys the user controls never use the normal prototype (see `createRecord`),
 * nesting is limited to DATA_MAX_DEPTH, and every fixed regular expression runs in linear time.
 */
import { quoteForDisplay } from '../textFormat';
import { EncOutputTooLargeError, MAX_OUTPUT_LENGTH } from './encodeTransforms';

/** The selected text cannot be converted; the message is shown to the user as it is. */
export class DataInputError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'DataInputError';
  }
}

/** Upper limit of the length (UTF-16 code units) of one selection. */
export const DATA_MAX_INPUT_LENGTH = 5_000_000;
/** Upper limit of the nesting of objects / arrays, in the input and in every recursive step. */
export const DATA_MAX_DEPTH = 500;
/** Upper limit of the length of a path typed into the input box (DATA-015 / 023 / 024). */
export const DATA_MAX_PATH_LENGTH = 1_000;
/** Maximum number of characters of the selected text quoted in an error message. */
export const DATA_MESSAGE_TEXT_LIMIT = 60;

export { MAX_OUTPUT_LENGTH };

export const quoteText = (text: string): string => quoteForDisplay(text, DATA_MESSAGE_TEXT_LIMIT);

export const tooDeepError = (): DataInputError =>
  new DataInputError(`nesting is too deep (limit: ${DATA_MAX_DEPTH})`);

export const outputTooLarge = (length: number): EncOutputTooLargeError =>
  new EncOutputTooLargeError(length, MAX_OUTPUT_LENGTH);

export type JsonValue = null | boolean | number | string | JsonValue[] | JsonObject;
export interface JsonObject {
  [key: string]: JsonValue;
}

/**
 * An object without a prototype: a key such as `__proto__`, `constructor` or `prototype` from
 * the user's text becomes an ordinary own property and can never reach `Object.prototype`.
 */
export const createRecord = <T = JsonValue>(): Record<string, T> => Object.create(null) as Record<string, T>;

/** Sets an own, enumerable property (never calls an inherited setter such as `__proto__`). */
export const setOwn = <T>(target: Record<string, T>, key: string, value: T): void => {
  Object.defineProperty(target, key, { value, writable: true, enumerable: true, configurable: true });
};

export const hasOwn = (target: object, key: string): boolean => Object.prototype.hasOwnProperty.call(target, key);

export const isJsonObject = (value: unknown): value is JsonObject =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

export const isScalar = (value: unknown): value is null | boolean | number | string =>
  value === null || typeof value === 'boolean' || typeof value === 'number' || typeof value === 'string';

/** What `inspectGraph` found out about a value read by a parser. */
export interface GraphInfo {
  /** Some object / array is reached through more than one reference (YAML anchors and aliases). */
  shared: boolean;
  /** Number of distinct objects / arrays. */
  containers: number;
}

/**
 * Throws when objects / arrays are nested more than DATA_MAX_DEPTH levels, or when they refer to
 * themselves; also tells whether some object is shared. Values from JSON are trees, but YAML
 * aliases make a DAG in which one subtree can be reached through exponentially many paths, so
 * every object is visited once (iterative depth-first search, the height of each finished object
 * is remembered): the time is linear in the number of distinct objects and references.
 */
export const inspectGraph = (root: unknown): GraphInfo => {
  const info: GraphInfo = { shared: false, containers: 0 };
  if (typeof root !== 'object' || root === null) {
    return info;
  }
  // Height of a finished object (1 = no object inside); VISITING while it is on the current path.
  const VISITING = -1;
  const heights = new Map<object, number>();
  const path: { value: object; children: unknown[]; next: number; height: number }[] = [];
  const enter = (value: object): void => {
    if (path.length >= DATA_MAX_DEPTH) {
      throw tooDeepError();
    }
    heights.set(value, VISITING);
    info.containers++;
    path.push({ value, children: Object.values(value), next: 0, height: 1 });
  };
  enter(root);
  while (path.length > 0) {
    const frame = path[path.length - 1];
    if (frame.next < frame.children.length) {
      const child = frame.children[frame.next++];
      if (typeof child !== 'object' || child === null) {
        continue;
      }
      const known = heights.get(child);
      if (known === undefined) {
        enter(child);
        continue;
      }
      info.shared = true;
      if (known === VISITING) {
        // A cycle has no finite depth.
        throw tooDeepError();
      }
      if (path.length + known > DATA_MAX_DEPTH) {
        throw tooDeepError();
      }
      frame.height = Math.max(frame.height, known + 1);
      continue;
    }
    path.pop();
    heights.set(frame.value, frame.height);
    if (path.length > 0) {
      const parent = path[path.length - 1];
      parent.height = Math.max(parent.height, frame.height + 1);
    }
  }
  return info;
};

/** Throws when an object / array is nested more than DATA_MAX_DEPTH levels (checked without recursion). */
export const assertDepth = (root: unknown): void => {
  inspectGraph(root);
};

export const assertInputLength = (text: string): void => {
  if (text.length > DATA_MAX_INPUT_LENGTH) {
    throw new DataInputError(`the selection is longer than ${DATA_MAX_INPUT_LENGTH.toLocaleString('en-US')} characters`);
  }
};

/** Whether the selection spans several lines (leading / trailing white space ignored). */
export const isMultiLine = (text: string): boolean => /[\r\n]/.test(text.trim());

/** Thrown inside `jsonLengthAtLeast` to stop counting once the limit is passed. */
class JsonLengthExceeded extends Error {}

/**
 * A lower bound of the length of `JSON.stringify(value, null, indent)`, computed without building
 * the string (linear time, no recursion). The indentation, which grows with depth × size, is
 * counted exactly and every token at its shortest (a string without escapes), so the bound is the
 * exact length when no string needs escaping. Counting stops as soon as the bound passes `limit`.
 */
export const jsonLengthAtLeast = (value: JsonValue, indent: number, limit = Infinity): number => {
  let total = 0;
  const add = (length: number): void => {
    total += length;
    if (total > limit) {
      throw new JsonLengthExceeded();
    }
  };
  const stack: [JsonValue, number][] = [[value, 0]];
  while (stack.length > 0) {
    const [item, depth] = stack.pop()!;
    if (typeof item === 'string') {
      add(item.length + 2);
    } else if (typeof item !== 'object' || item === null) {
      add(String(item).length);
    } else {
      const isArray = Array.isArray(item);
      const keys = isArray ? undefined : Object.keys(item);
      const count = isArray ? item.length : keys!.length;
      // Brackets; with indentation also the line break and indent before the closing one.
      add(2 + (count > 0 && indent > 0 ? 1 + indent * depth : 0));
      if (count === 0) {
        continue;
      }
      // Commas, and a line break plus the indent before every element.
      add(count - 1 + (indent > 0 ? count * (1 + indent * (depth + 1)) : 0));
      if (isArray) {
        for (const child of item) {
          stack.push([child, depth + 1]);
        }
      } else {
        for (const key of keys!) {
          // "key": (the space after the colon only with indentation)
          add(key.length + 3 + (indent > 0 ? 1 : 0));
          stack.push([(item as JsonObject)[key], depth + 1]);
        }
      }
    }
  }
  return total;
};

/**
 * Throws `EncOutputTooLargeError` when `JSON.stringify(value, null, indent)` would certainly be
 * longer than MAX_OUTPUT_LENGTH, before the string is built (the handler still checks the real
 * length afterwards).
 */
export const assertJsonFits = (value: JsonValue, indent: number): void => {
  try {
    jsonLengthAtLeast(value, indent, MAX_OUTPUT_LENGTH);
  } catch (error) {
    if (error instanceof JsonLengthExceeded) {
      throw outputTooLarge(MAX_OUTPUT_LENGTH + 1);
    }
    throw error;
  }
};

/**
 * JSON -> JSON commands keep the layout of the input: one line stays one line (no spaces), a
 * multi-line selection becomes JSON indented with 2 spaces.
 */
export const stringifyLike = (value: JsonValue, source: string): string =>
  isMultiLine(source) ? stringifyPretty(value) : stringifyCompact(value);

/** One line of JSON (the size is checked before the string is built). */
export const stringifyCompact = (value: JsonValue): string => {
  assertJsonFits(value, 0);
  return JSON.stringify(value);
};

/** Other formats -> JSON: always indented with 2 spaces, like the existing Format / YAML to JSON commands. */
export const stringifyPretty = (value: JsonValue): string => {
  assertJsonFits(value, 2);
  return JSON.stringify(value, null, 2);
};

export const requireArray = (value: JsonValue, what: string): JsonValue[] => {
  if (!Array.isArray(value)) {
    throw new DataInputError(`${what} needs a JSON array at the top level`);
  }
  return value;
};

export const requireObject = (value: JsonValue, what: string): JsonObject => {
  if (!isJsonObject(value)) {
    throw new DataInputError(`${what} needs a JSON object at the top level`);
  }
  return value;
};

/** Whether `text[index]` is a high surrogate followed by a low surrogate (one code point in two units). */
export const isSurrogatePairAt = (text: string, index: number): boolean => {
  const high = text.charCodeAt(index);
  const low = text.charCodeAt(index + 1);
  return high >= 0xd800 && high <= 0xdbff && low >= 0xdc00 && low <= 0xdfff;
};

/** Collects output pieces and stops as soon as they would exceed MAX_OUTPUT_LENGTH. */
export class OutputBuffer {
  private readonly parts: string[] = [];
  private length = 0;

  /** Number of pieces pushed so far. */
  get count(): number {
    return this.parts.length;
  }

  push(part: string): void {
    this.length += part.length;
    if (this.length > MAX_OUTPUT_LENGTH) {
      throw outputTooLarge(this.length);
    }
    this.parts.push(part);
  }

  join(separator: string): string {
    const total = this.length + Math.max(0, this.parts.length - 1) * separator.length;
    if (total > MAX_OUTPUT_LENGTH) {
      throw outputTooLarge(total);
    }
    return this.parts.join(separator);
  }
}

// ---------------------------------------------------------------------------------------------
// Path notation (DATA-015 / 016 / 023 / 024)
// ---------------------------------------------------------------------------------------------

/** One step of a path: an object key or an array index. */
export type PathSegment = string | number;

/** An ASCII JavaScript identifier: a name in the path notation and an unquoted key of DATA-027. */
export const IDENTIFIER = /^[A-Za-z_$][A-Za-z0-9_$]*$/;
const IDENTIFIER_START = /[A-Za-z_$]/;
const IDENTIFIER_PART = /[A-Za-z0-9_$]/;

/** Why a path cannot be parsed (a fixed text, never containing the typed value). */
export class PathSyntaxError extends Error {
  constructor() {
    super('invalid path');
    this.name = 'PathSyntaxError';
  }
}

/**
 * Parses `a.b[0]`, `$.a["b-c"][1]`, `["a.b"]`, `$` (the whole value). A leading `$` is the root
 * only when it is alone or followed by `.` or `[` (`$a` is the key `$a`).
 */
export const parsePath = (path: string): PathSegment[] => {
  const segments: PathSegment[] = [];
  let i = 0;
  const readIdentifier = (): string => {
    const start = i;
    if (i >= path.length || !IDENTIFIER_START.test(path[i])) {
      throw new PathSyntaxError();
    }
    i++;
    while (i < path.length && IDENTIFIER_PART.test(path[i])) {
      i++;
    }
    return path.slice(start, i);
  };
  if (path.length === 0) {
    throw new PathSyntaxError();
  }
  if (path[0] === '$' && (path.length === 1 || path[1] === '.' || path[1] === '[')) {
    i = 1;
    if (path[1] === '.') {
      i = 2;
      segments.push(readIdentifier());
    }
  } else if (path[0] !== '[') {
    segments.push(readIdentifier());
  }
  while (i < path.length) {
    const ch = path[i];
    if (ch === '.') {
      i++;
      segments.push(readIdentifier());
    } else if (ch === '[') {
      i++;
      if (path[i] === '"') {
        const start = i;
        i++;
        while (i < path.length && path[i] !== '"') {
          i += path[i] === '\\' ? 2 : 1;
        }
        if (i >= path.length) {
          throw new PathSyntaxError();
        }
        i++;
        let key: unknown;
        try {
          key = JSON.parse(path.slice(start, i));
        } catch {
          throw new PathSyntaxError();
        }
        if (typeof key !== 'string') {
          throw new PathSyntaxError();
        }
        segments.push(key);
      } else {
        const start = i;
        while (i < path.length && path[i] >= '0' && path[i] <= '9') {
          i++;
        }
        const digits = path.slice(start, i);
        if (digits.length === 0 || (digits.length > 1 && digits[0] === '0') || digits.length > 15) {
          throw new PathSyntaxError();
        }
        segments.push(Number(digits));
      }
      if (path[i] !== ']') {
        throw new PathSyntaxError();
      }
      i++;
    } else {
      throw new PathSyntaxError();
    }
  }
  return segments;
};

/** Checks a path typed into the input box; returns a fixed message or `undefined` when it is valid. */
export const findPathProblem = (path: string): string | undefined => {
  if (path.length === 0) {
    return 'Enter a path (e.g. a.b[0]).';
  }
  if (path.length > DATA_MAX_PATH_LENGTH) {
    return `The path is too long (limit: ${DATA_MAX_PATH_LENGTH.toLocaleString('en-US')} characters).`;
  }
  try {
    parsePath(path);
    return undefined;
  } catch {
    return 'Invalid path. Use names, [index] and ["key"] (e.g. a.b[0] or $["b-c"][1]).';
  }
};

/** The notation DATA-016 prints (and DATA-015 reads back): `a.b`, `c[0]`, `["b-c"]`, `$` for the root. */
export const formatPath = (segments: readonly PathSegment[]): string => {
  if (segments.length === 0) {
    return '$';
  }
  return segments.map((segment, index) => {
    if (typeof segment === 'number') {
      return `[${segment}]`;
    }
    if (IDENTIFIER.test(segment) && !(index === 0 && segment === '$')) {
      return index === 0 ? segment : `.${segment}`;
    }
    return `[${JSON.stringify(segment)}]`;
  }).join('');
};

/** The value at the path, or `undefined` when a step does not exist. */
export const lookupPath = (value: JsonValue, segments: readonly PathSegment[]): JsonValue | undefined => {
  let current: JsonValue | undefined = value;
  for (const segment of segments) {
    if (typeof segment === 'number') {
      if (!Array.isArray(current) || segment >= current.length) {
        return undefined;
      }
      current = current[segment];
    } else {
      if (!isJsonObject(current) || !hasOwn(current, segment)) {
        return undefined;
      }
      current = current[segment];
    }
  }
  return current;
};

/** Canonical text of a value with the keys of every object sorted (DATA-022 / 026 comparisons). */
export const canonicalJson = (value: JsonValue): string => {
  if (Array.isArray(value)) {
    return `[${value.map(canonicalJson).join(',')}]`;
  }
  if (isJsonObject(value)) {
    const keys = Object.keys(value).sort();
    return `{${keys.map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(',')}}`;
  }
  return JSON.stringify(value);
};
