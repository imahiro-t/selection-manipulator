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

/** Throws when an object / array is nested more than DATA_MAX_DEPTH levels (checked without recursion). */
export const assertDepth = (root: unknown): void => {
  const stack: [unknown, number][] = [[root, 0]];
  while (stack.length > 0) {
    const [value, depth] = stack.pop()!;
    if (typeof value === 'object' && value !== null) {
      if (depth >= DATA_MAX_DEPTH) {
        throw tooDeepError();
      }
      for (const child of Object.values(value)) {
        if (typeof child === 'object' && child !== null) {
          stack.push([child, depth + 1]);
        }
      }
    }
  }
};

export const assertInputLength = (text: string): void => {
  if (text.length > DATA_MAX_INPUT_LENGTH) {
    throw new DataInputError(`the selection is longer than ${DATA_MAX_INPUT_LENGTH.toLocaleString('en-US')} characters`);
  }
};

/** Whether the selection spans several lines (leading / trailing white space ignored). */
export const isMultiLine = (text: string): boolean => /[\r\n]/.test(text.trim());

/**
 * JSON -> JSON commands keep the layout of the input: one line stays one line (no spaces), a
 * multi-line selection becomes JSON indented with 2 spaces.
 */
export const stringifyLike = (value: unknown, source: string): string =>
  isMultiLine(source) ? JSON.stringify(value, null, 2) : JSON.stringify(value);

/** Other formats -> JSON: always indented with 2 spaces, like the existing Format / YAML to JSON commands. */
export const stringifyPretty = (value: unknown): string => JSON.stringify(value, null, 2);

/** Collects output pieces and stops as soon as they would exceed MAX_OUTPUT_LENGTH. */
export class OutputBuffer {
  private readonly parts: string[] = [];
  private length = 0;

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

const IDENTIFIER = /^[A-Za-z_$][A-Za-z0-9_$]*$/;
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
