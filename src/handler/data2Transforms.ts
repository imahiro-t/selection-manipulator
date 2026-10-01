/**
 * Pure (vscode-independent) part of the extended data format commands of group DATA2 (showcase
 * category DATAX, DATAX-001..024): the command table and the JSON, YAML, TOML and LTSV
 * transforms. The XML commands are in `data2Xml.ts`, the CSV commands in `data2Csv.ts`.
 *
 * Rules shared with the DATA commands (`dataTransforms.ts` / `dataCommon.ts`):
 * - A transform takes the selected text and the values typed into the prompts and returns the
 *   result with LF line breaks, or throws `DataInputError` / `TableInputError` (shown to the user,
 *   nothing changed) or `EncOutputTooLargeError` (a warning: the result would be too large).
 * - JSON is read with `parseJson` (input and nesting limits). Every object built from keys of the
 *   user's text is prototype-less (`createRecord` + `setOwn`) and keys are tested with `hasOwn`
 *   only, so `__proto__`, `constructor` and `prototype` are ordinary keys and can never reach
 *   `Object.prototype`. Counts use `Map` / `Set`.
 * - Paths typed into a prompt are always checked with `findPathProblem` (which also applies
 *   DATA_MAX_PATH_LENGTH) before `parsePath`, both in the input box and again here.
 * - YAML is read with the Core schema (no type that runs code). Values from YAML can share objects
 *   through aliases (one subtree reachable through exponentially many paths), so they are checked
 *   with `inspectGraph` (each object visited once), never expanded: DATAX-012 keeps anchors and
 *   aliases as references, DATAX-014 checks the JSON length with `assertJsonFits` before building
 *   the string, and DATAX-013 only reports whether the text loads.
 * - No code is evaluated; no regular expression is built from the user's text, and the fixed
 *   ones run in linear time. The recursive JSON walks are bounded by DATA_MAX_DEPTH (checked first).
 */
import * as yaml from 'js-yaml';
import {
  assertDepth,
  assertInputLength,
  canonicalJson,
  CountLimitError,
  createRecord,
  DataInputError,
  findPathProblem,
  formatPath,
  hasOwn,
  inspectGraph,
  isJsonObject,
  JsonObject,
  JsonValue,
  lookupPath,
  MAX_OUTPUT_LENGTH,
  OutputBuffer,
  outputTooLarge,
  parsePath,
  PathSegment,
  quoteText,
  requireArray,
  requireObject,
  setOwn,
  stringifyLike,
  stringifyPretty,
} from './dataCommon';
import { assertYamlAliasWork, isEmptyYamlLine, parseJson, yamlError, yamlErrorDetail } from './dataTransforms';
import { toToml } from './dataWriters';
import { parseToml } from './tomlParser';
import { listXmlPaths, validateXml } from './data2Xml';
import {
  findColumnOrderProblem,
  findSeparatorProblem,
  fillEmpty,
  groupCount,
  mergeColumns,
  reorderColumns,
  splitColumn,
} from './data2Csv';
import { findPromptProblem, hasTrailingLineBreak } from './tableCsv';

// ---------------------------------------------------------------------------------------------
// The command table types
// ---------------------------------------------------------------------------------------------

/** One question asked before running (once, for all selections): an input box or a QuickPick. */
export type Data2Prompt =
  | {
    type: 'input';
    prompt: string;
    placeHolder: string;
    /** `validateInput` of the input box; checked again before running. */
    validate: (value: string) => string | undefined;
  }
  | { type: 'pick'; placeHolder: string; items: readonly string[] };

/** A conversion of one selection; `inputs` are the answers to the prompts, in order. */
export type Data2Transform = (text: string, inputs: readonly string[]) => string;

/** A check of one selection (DATAX-013 / 016): the notification text and whether it passed. */
export type Data2Check = (text: string) => { valid: boolean; message: string };

interface Data2CommandBase {
  /** Showcase candidate ID, e.g. `DATAX-001`. */
  id: string;
  /** Command ID without the `selection-manipulator.` prefix. */
  name: string;
  /** The title in package.json. */
  title: string;
  /** The title in Show Commands. */
  showTitle: string;
  prompts: readonly Data2Prompt[];
}

/** Converts every selection; the results open in one new read-only editor. */
export interface Data2TransformEntry extends Data2CommandBase {
  output: 'new-tab';
  transform: Data2Transform;
}

/** Checks every selection and only shows a notification (the document is never changed). */
export interface Data2NotifyEntry extends Data2CommandBase {
  output: 'notify';
  check: Data2Check;
}

export type Data2CommandEntry = Data2TransformEntry | Data2NotifyEntry;

// ---------------------------------------------------------------------------------------------
// Limits and prompt checks
// ---------------------------------------------------------------------------------------------

/** Upper limit of the length of a key list, a `key=value` condition or a key name typed into a prompt. */
export const DATA2_MAX_PROMPT_LENGTH = 10_000;
/** DATAX-011: upper limit of the length of the JSON value typed into the prompt. */
export const DATA2_MAX_VALUE_LENGTH = 100_000;
/** DATAX-003 / 004: upper limit of the number of keys in a key list. */
export const DATA2_MAX_KEYS = 1_000;
/** DATAX-008: the largest chunk size. */
export const CHUNK_MAX_SIZE = 1_000_000;
/** DATAX-014: upper limit of the number of YAML documents. */
export const YAML_MAX_DOCUMENTS = 10_000;

/** DATAX-001: an empty key path sorts by the elements themselves. */
export const findOptionalPathProblem = (value: string): string | undefined =>
  value === '' ? undefined : findPathProblem(value);

/** DATAX-002: `key=value`, the key being a path. The value may be empty. */
export const findFilterProblem = (value: string): string | undefined => {
  if (value.length > DATA2_MAX_PROMPT_LENGTH) {
    return `The condition is longer than ${DATA2_MAX_PROMPT_LENGTH.toLocaleString('en-US')} characters.`;
  }
  const equals = value.indexOf('=');
  if (equals === -1) {
    return 'Enter key=value (e.g. status=active or user.id=1).';
  }
  return findPathProblem(value.slice(0, equals));
};

/** DATAX-003 / 004: keys separated by `,` (spaces around a key are removed; no empty key). */
export const parseKeyList = (value: string): string[] => value.split(',').map((key) => key.trim());

export const findKeyListProblem = (value: string): string | undefined => {
  if (value.length > DATA2_MAX_PROMPT_LENGTH) {
    return `The list is longer than ${DATA2_MAX_PROMPT_LENGTH.toLocaleString('en-US')} characters.`;
  }
  const keys = parseKeyList(value);
  if (keys.some((key) => key === '')) {
    return 'Enter keys separated by commas (e.g. id,name); no key may be empty.';
  }
  if (keys.length > DATA2_MAX_KEYS) {
    return `Enter at most ${DATA2_MAX_KEYS.toLocaleString('en-US')} keys.`;
  }
  return undefined;
};

/** DATAX-005: a key name (any text, not empty). */
export const findKeyNameProblem = (value: string): string | undefined => {
  if (value === '') {
    return 'Enter a key name.';
  }
  if (value.length > DATA2_MAX_PROMPT_LENGTH) {
    return `The key is longer than ${DATA2_MAX_PROMPT_LENGTH.toLocaleString('en-US')} characters.`;
  }
  return undefined;
};

/** DATAX-008: an integer from 1 to CHUNK_MAX_SIZE. */
export const findChunkSizeProblem = (value: string): string | undefined =>
  /^[1-9][0-9]{0,6}$/.test(value) && Number(value) <= CHUNK_MAX_SIZE
    ? undefined
    : `Enter an integer from 1 to ${CHUNK_MAX_SIZE.toLocaleString('en-US')}.`;

/** DATAX-011: one JSON value (read with `JSON.parse` only). */
export const findJsonValueProblem = (value: string): string | undefined => {
  if (value.length > DATA2_MAX_VALUE_LENGTH) {
    return `The value is longer than ${DATA2_MAX_VALUE_LENGTH.toLocaleString('en-US')} characters.`;
  }
  try {
    JSON.parse(value);
    return undefined;
  } catch {
    return 'Enter a JSON value (e.g. 2, "text", true, null, [1] or {"a":1}).';
  }
};

/** Runs a prompt check again inside a transform (in case a refused value got past the input box). */
const check = (problem: string | undefined): void => {
  if (problem !== undefined) {
    throw new DataInputError(problem);
  }
};

/** A path typed into a prompt: checked with `findPathProblem` (length limit included) before `parsePath`. */
const checkedPath = (path: string): PathSegment[] => {
  check(findPathProblem(path));
  return parsePath(path);
};

// ---------------------------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------------------------

/** Compares two strings by code point (not by UTF-16 code unit, not by locale). */
export const compareCodePoints = (a: string, b: string): number => {
  let i = 0;
  while (i < a.length && i < b.length) {
    const ca = a.codePointAt(i)!;
    const cb = b.codePointAt(i)!;
    if (ca !== cb) {
      return ca < cb ? -1 : 1;
    }
    i += ca > 0xffff ? 2 : 1;
  }
  return a.length - b.length;
};

/** The objects of an array (an error names the first element that is not one). */
const requireObjects = (array: readonly JsonValue[], what: string): JsonObject[] =>
  array.map((item, index) => {
    if (!isJsonObject(item)) {
      throw new DataInputError(`${what} needs objects: element [${index}] is not an object`);
    }
    return item;
  });

/** A copy of `object` with only the keys that are (`keep`) or are not (`!keep`) in `keys`; key order kept. */
const filterKeys = (object: JsonObject, keys: ReadonlySet<string>, keep: boolean): JsonObject => {
  const result = createRecord();
  for (const key of Object.keys(object)) {
    if (keys.has(key) === keep) {
      setOwn(result, key, object[key]);
    }
  }
  return result;
};

const json = (convert: (value: JsonValue, text: string, inputs: readonly string[]) => string): Data2Transform =>
  (text, inputs) => convert(parseJson(text), text, inputs);

// ---------------------------------------------------------------------------------------------
// JSON (DATAX-001..011, 024)
// ---------------------------------------------------------------------------------------------

/**
 * DATAX-001 type order: number < string < boolean < array < object < null < missing (a key path
 * that an element does not have).
 */
const sortRank = (value: JsonValue | undefined): number => {
  if (value === undefined) {
    return 6;
  }
  if (value === null) {
    return 5;
  }
  switch (typeof value) {
    case 'number': return 0;
    case 'string': return 1;
    case 'boolean': return 2;
  }
  return Array.isArray(value) ? 3 : 4;
};

/**
 * DATAX-001: sorts an array by its elements, or by the value at a key path of each element.
 * Numbers by value, strings by code point, `false < true`, arrays and objects by their canonical
 * JSON (keys sorted), then by type (see `sortRank`); a stable sort.
 */
export const sortJsonArray = (value: JsonValue, text: string, keyPath: string): string => {
  const array = requireArray(value, 'Sort JSON Array');
  const segments = keyPath === '' ? [] : checkedPath(keyPath);
  const keyed = array.map((item, index) => {
    const key = segments.length === 0 ? item : lookupPath(item, segments);
    const rank = sortRank(key);
    return { item, index, rank, key, canonical: rank === 3 || rank === 4 ? canonicalJson(key!) : '' };
  });
  keyed.sort((a, b) => {
    if (a.rank !== b.rank) {
      return a.rank - b.rank;
    }
    let order = 0;
    switch (a.rank) {
      case 0: order = (a.key as number) - (b.key as number); break;
      case 1: order = compareCodePoints(a.key as string, b.key as string); break;
      case 2: order = Number(a.key) - Number(b.key); break;
      case 3:
      case 4: order = compareCodePoints(a.canonical, b.canonical); break;
    }
    return order !== 0 ? order : a.index - b.index;
  });
  return stringifyLike(keyed.map(({ item }) => item), text);
};

/**
 * DATAX-002: keeps the elements whose field (a path) matches `key=value`. Only equality, never an
 * expression: the field matches when the value is JSON that is equal to it (keys in any order),
 * or when the field is a string equal to the typed text. `status=200` keeps both 200 and "200";
 * `status="200"` keeps only the string. A missing field never matches.
 */
export const filterJsonArray = (value: JsonValue, text: string, condition: string): string => {
  const array = requireArray(value, 'Filter JSON Array');
  check(findFilterProblem(condition));
  const equals = condition.indexOf('=');
  const segments = parsePath(condition.slice(0, equals));
  const typed = condition.slice(equals + 1);
  let wanted: string | undefined;
  let parsed: JsonValue | undefined;
  try {
    parsed = JSON.parse(typed) as JsonValue;
  } catch {
    parsed = undefined;
  }
  if (parsed !== undefined) {
    assertDepth(parsed);
    wanted = canonicalJson(parsed);
  }
  const kept = array.filter((item) => {
    const field = lookupPath(item, segments);
    if (field === undefined) {
      return false;
    }
    return (wanted !== undefined && canonicalJson(field) === wanted) || (typeof field === 'string' && field === typed);
  });
  return stringifyLike(kept, text);
};

/** DATAX-003: only the listed keys of an object, or of every object of an array (original key order). */
export const pickKeys = (value: JsonValue, text: string, list: string): string => {
  check(findKeyListProblem(list));
  const keys = new Set(parseKeyList(list));
  if (Array.isArray(value)) {
    return stringifyLike(requireObjects(value, 'Pick Keys').map((item) => filterKeys(item, keys, true)), text);
  }
  if (!isJsonObject(value)) {
    throw new DataInputError('Pick Keys needs a JSON object or an array of objects');
  }
  return stringifyLike(filterKeys(value, keys, true), text);
};

export const OMIT_SCOPES = ['Top level only', 'Recursive'] as const;

const omitDeep = (value: JsonValue, keys: ReadonlySet<string>): JsonValue => {
  if (Array.isArray(value)) {
    return value.map((item) => omitDeep(item, keys));
  }
  if (!isJsonObject(value)) {
    return value;
  }
  const result = createRecord();
  for (const key of Object.keys(value)) {
    if (!keys.has(key)) {
      setOwn(result, key, omitDeep(value[key], keys));
    }
  }
  return result;
};

/**
 * DATAX-004: removes the listed keys from an object (or from the objects of an array) at the top
 * level only, or at every level (`Recursive`).
 */
export const omitKeys = (value: JsonValue, text: string, list: string, scope: string): string => {
  check(findKeyListProblem(list));
  const keys = new Set(parseKeyList(list));
  if (!Array.isArray(value) && !isJsonObject(value)) {
    throw new DataInputError('Omit Keys needs a JSON object or array');
  }
  if (scope === 'Recursive') {
    return stringifyLike(omitDeep(value, keys), text);
  }
  if (Array.isArray(value)) {
    return stringifyLike(value.map((item) => (isJsonObject(item) ? filterKeys(item, keys, false) : item)), text);
  }
  return stringifyLike(filterKeys(value, keys, false), text);
};

/**
 * DATAX-005: renames a key in every object at every level, keeping the key order. An object that
 * has both the old and the new key is an error (its path is shown).
 */
export const renameKey = (value: JsonValue, text: string, from: string, to: string): string => {
  check(findKeyNameProblem(from));
  check(findKeyNameProblem(to));
  if (from === to) {
    throw new DataInputError('the new key name is the same as the old one');
  }
  const path: PathSegment[] = [];
  const rename = (item: JsonValue): JsonValue => {
    if (Array.isArray(item)) {
      return item.map((child, index) => {
        path.push(index);
        const renamed = rename(child);
        path.pop();
        return renamed;
      });
    }
    if (!isJsonObject(item)) {
      return item;
    }
    if (hasOwn(item, from) && hasOwn(item, to)) {
      throw new DataInputError(`the object at ${formatPath(path)} already has the key ${quoteText(to)}`);
    }
    const result = createRecord();
    for (const key of Object.keys(item)) {
      path.push(key);
      setOwn(result, key === from ? to : key, rename(item[key]));
      path.pop();
    }
    return result;
  };
  return stringifyLike(rename(value), text);
};

const isEmptyValue = (value: JsonValue): boolean =>
  value === null || value === '' || (Array.isArray(value) && value.length === 0) || (isJsonObject(value) && Object.keys(value).length === 0);

const removeEmptyDeep = (value: JsonValue): JsonValue => {
  if (Array.isArray(value)) {
    return value.map(removeEmptyDeep).filter((item) => !isEmptyValue(item));
  }
  if (!isJsonObject(value)) {
    return value;
  }
  const result = createRecord();
  for (const key of Object.keys(value)) {
    const item = removeEmptyDeep(value[key]);
    if (!isEmptyValue(item)) {
      setOwn(result, key, item);
    }
  }
  return result;
};

/**
 * DATAX-006: removes `""`, `[]`, `{}` and null at every level; a parent that becomes empty is
 * removed too. The top-level value itself stays (possibly as `{}` / `[]`).
 */
export const removeEmpty = (value: JsonValue, text: string): string => stringifyLike(removeEmptyDeep(value), text);

/** DATAX-007: `\` -> `\\`, `|` -> `\|`, a line break (CRLF, CR or LF) -> `<br>`, so a cell stays one cell. */
export const escapeMarkdownCell = (cell: string): string => {
  let result = '';
  for (let i = 0; i < cell.length; i++) {
    const ch = cell[i];
    if (ch === '\\') {
      result += '\\\\';
    } else if (ch === '|') {
      result += '\\|';
    } else if (ch === '\r') {
      result += '<br>';
      if (cell[i + 1] === '\n') {
        i++;
      }
    } else if (ch === '\n') {
      result += '<br>';
    } else {
      result += ch;
    }
  }
  return result;
};

/** A table cell: a string as it is, other values as compact JSON, a missing key empty. */
const tableCell = (value: JsonValue | undefined): string => {
  if (value === undefined) {
    return '';
  }
  return escapeMarkdownCell(typeof value === 'string' ? value : JSON.stringify(value));
};

/** DATAX-007: an array of objects -> a Markdown table; the columns are all keys, in order of first appearance. */
export const toMarkdownTable = (value: JsonValue): string => {
  const array = requireArray(value, 'Convert JSON Array to Markdown Table');
  if (array.length === 0) {
    throw new DataInputError('the array is empty');
  }
  const objects = requireObjects(array, 'Convert JSON Array to Markdown Table');
  const columns = new Set<string>();
  objects.forEach((item) => Object.keys(item).forEach((key) => columns.add(key)));
  if (columns.size === 0) {
    throw new DataInputError('the objects have no keys');
  }
  const keys = [...columns];
  const out = new OutputBuffer();
  out.push(`| ${keys.map(escapeMarkdownCell).join(' | ')} |`);
  out.push(`| ${keys.map(() => '---').join(' | ')} |`);
  for (const item of objects) {
    out.push(`| ${keys.map((key) => tableCell(hasOwn(item, key) ? item[key] : undefined)).join(' | ')} |`);
  }
  return out.join('\n');
};

/** DATAX-008: `[1,2,3]` with N = 2 -> `[[1,2],[3]]`. */
export const chunkArray = (value: JsonValue, text: string, size: string): string => {
  check(findChunkSizeProblem(size));
  const array = requireArray(value, 'Split JSON Array into Chunks');
  const n = Number(size);
  const chunks: JsonValue[] = [];
  for (let i = 0; i < array.length; i += n) {
    chunks.push(array.slice(i, i + n));
  }
  return stringifyLike(chunks, text);
};

/**
 * DATAX-009: an array of objects -> an object keyed by the value (a string or a number) at a path
 * of each element. A missing or other value, or a key that two elements share, is an error.
 */
export const arrayToObject = (value: JsonValue, text: string, keyPath: string): string => {
  const segments = checkedPath(keyPath);
  const objects = requireObjects(requireArray(value, 'Convert JSON Array to Object'), 'Convert JSON Array to Object');
  const result = createRecord();
  objects.forEach((item, index) => {
    const key = lookupPath(item, segments);
    if (typeof key !== 'string' && typeof key !== 'number') {
      throw new DataInputError(`element [${index}] has no string or number at ${formatPath(segments)}`);
    }
    const name = String(key);
    if (hasOwn(result, name)) {
      throw new DataInputError(`element [${index}] repeats the key ${quoteText(name)}`);
    }
    setOwn(result, name, item);
  });
  return stringifyLike(result, text);
};

/** DATAX-010: `{"a":1}` -> `[{"key":"a","value":1}]`. */
export const objectToEntries = (value: JsonValue, text: string): string => {
  const object = requireObject(value, 'Convert JSON Object to Key-Value Array');
  const entries = Object.keys(object).map((key) => {
    const entry = createRecord();
    setOwn(entry, 'key', key);
    setOwn(entry, 'value', object[key]);
    return entry;
  });
  return stringifyLike(entries, text);
};

/**
 * DATAX-011: replaces the value at a path with a JSON value (read with `JSON.parse` only). Missing
 * object keys on the way are created as objects; an array index must be an existing element
 * (0 <= index < length: no sparse array is ever made). `$` replaces the whole value.
 */
export const setPath = (value: JsonValue, text: string, path: string, valueText: string): string => {
  const segments = checkedPath(path);
  check(findJsonValueProblem(valueText));
  const replacement = JSON.parse(valueText) as JsonValue;
  assertDepth(replacement);
  if (segments.length === 0) {
    return stringifyLike(replacement, text);
  }
  const where = (count: number) => formatPath(segments.slice(0, count));
  let current: JsonValue = value;
  for (let i = 0; i < segments.length; i++) {
    const segment = segments[i];
    const last = i === segments.length - 1;
    if (typeof segment === 'number') {
      if (!Array.isArray(current)) {
        throw new DataInputError(`${where(i)} is not an array, so [${segment}] cannot be set`);
      }
      if (segment >= current.length) {
        throw new DataInputError(`${where(i + 1)} is out of range (the array has ${current.length} element${current.length === 1 ? '' : 's'}; only existing elements can be set)`);
      }
      if (last) {
        current[segment] = replacement;
      } else {
        current = current[segment];
      }
      continue;
    }
    if (!isJsonObject(current)) {
      throw new DataInputError(`${where(i)} is not an object, so the key ${quoteText(segment)} cannot be set`);
    }
    if (last) {
      setOwn(current, segment, replacement);
    } else if (hasOwn(current, segment)) {
      current = current[segment];
    } else if (typeof segments[i + 1] === 'number') {
      throw new DataInputError(`${where(i + 1)} does not exist, so an array index cannot be set in it`);
    } else {
      const created = createRecord();
      setOwn(current, segment, created);
      current = created;
    }
  }
  assertDepth(value);
  return stringifyLike(value, text);
};

/** DATAX-024: `\` -> `\\`, tab -> `\t`, LF -> `\n`, CR -> `\r` (undone by `unescapeLtsv`). */
export const escapeLtsv = (text: string): string => {
  let result = '';
  for (const ch of text) {
    switch (ch) {
      case '\\': result += '\\\\'; break;
      case '\t': result += '\\t'; break;
      case '\n': result += '\\n'; break;
      case '\r': result += '\\r'; break;
      default: result += ch;
    }
  }
  return result;
};

const LTSV_UNESCAPES: Readonly<Record<string, string>> = Object.freeze(Object.assign(Object.create(null) as Record<string, string>, {
  '\\': '\\', t: '\t', n: '\n', r: '\r',
}));

/**
 * DATAX-023: undoes `escapeLtsv` in one pass from the left (`\\t` is `\` + `t`). Any other
 * backslash (`\x`, a final `\`) stays as it is, so `C:\path` is unchanged.
 */
export const unescapeLtsv = (text: string): string => {
  let result = '';
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (ch === '\\' && i + 1 < text.length) {
      const replacement = LTSV_UNESCAPES[text[i + 1]];
      if (replacement !== undefined) {
        result += replacement;
        i++;
        continue;
      }
    }
    result += ch;
  }
  return result;
};

/** An LTSV label (the characters the LTSV specification recommends). */
const LTSV_LABEL = /^[0-9A-Za-z_.-]+$/;

/**
 * DATAX-024: an object or an array of objects -> LTSV, one record per line. A string value is
 * written as it is, other values as compact JSON, both escaped with `escapeLtsv`.
 */
export const jsonToLtsv = (value: JsonValue): string => {
  let records: JsonObject[];
  if (Array.isArray(value)) {
    if (value.length === 0) {
      throw new DataInputError('the array is empty');
    }
    records = requireObjects(value, 'Convert JSON to LTSV');
  } else if (isJsonObject(value)) {
    records = [value];
  } else {
    throw new DataInputError('Convert JSON to LTSV needs a JSON object or an array of objects');
  }
  const out = new OutputBuffer();
  for (const record of records) {
    const fields = Object.keys(record).map((label) => {
      if (!LTSV_LABEL.test(label)) {
        throw new DataInputError(`the key ${quoteText(label)} cannot be an LTSV label (use letters, digits, "_", "." and "-")`);
      }
      const item = record[label];
      return `${label}:${escapeLtsv(typeof item === 'string' ? item : JSON.stringify(item))}`;
    });
    out.push(fields.join('\t'));
  }
  return out.join('\n');
};

/**
 * DATAX-023: LTSV -> a JSON array of objects. One record per line (empty lines skipped), fields
 * separated by tabs, the label before the first `:`. Values stay strings (unescaped with
 * `unescapeLtsv`). A field without `:`, an empty label or a repeated label is an error.
 */
export const ltsvToJson = (text: string): string => {
  assertInputLength(text);
  const records: JsonObject[] = [];
  text.split(/\r\n|\r|\n/).forEach((line, index) => {
    if (line === '') {
      return;
    }
    const record = createRecord();
    line.split('\t').forEach((field, column) => {
      const where = `line ${index + 1}, field ${column + 1}`;
      const colon = field.indexOf(':');
      if (colon === -1) {
        throw new DataInputError(`${where}: no ":" between the label and the value`);
      }
      if (colon === 0) {
        throw new DataInputError(`${where}: the label is empty`);
      }
      const label = field.slice(0, colon);
      if (hasOwn(record, label)) {
        throw new DataInputError(`${where}: the label ${quoteText(label)} is repeated`);
      }
      setOwn(record, label, unescapeLtsv(field.slice(colon + 1)));
    });
    records.push(record);
  });
  if (records.length === 0) {
    throw new DataInputError('the selection contains no LTSV record');
  }
  return stringifyPretty(records);
};

// ---------------------------------------------------------------------------------------------
// YAML (DATAX-012..014) and TOML (DATAX-015)
// ---------------------------------------------------------------------------------------------

/** Ends the result with a line break when the selection did. */
const keepFinalLineBreak = (body: string, text: string): string => (hasTrailingLineBreak(text) ? `${body}\n` : body);

/**
 * DATAX-012: writes YAML in flow style (`{a: 1, b: [x]}`). Read and written with the Core schema;
 * anchors and aliases are kept as references (`noRefs` is false whenever an object is shared), so
 * the result never expands them. Without shared objects there is nothing to write as an alias and
 * reference tracking is off (the output is the same). The work of tracking references is limited
 * by YAML_MAX_ALIAS_WORK, as in Format YAML.
 */
export const yamlToFlow = (text: string): string => {
  assertInputLength(text);
  let value: unknown;
  try {
    value = yaml.load(text, { schema: yaml.CORE_SCHEMA });
  } catch (error) {
    throw yamlError(error);
  }
  if ((value === undefined || value === null) && text.split(/\r\n|\r|\n/).every(isEmptyYamlLine)) {
    throw new DataInputError('the selection contains no YAML value');
  }
  const graph = inspectGraph(value);
  assertYamlAliasWork(graph);
  let dumped: string;
  try {
    dumped = yaml.dump(value, { schema: yaml.CORE_SCHEMA, flowLevel: 0, lineWidth: -1, noRefs: !graph.shared });
  } catch (error) {
    throw yamlError(error);
  }
  if (dumped.length > MAX_OUTPUT_LENGTH) {
    throw outputTooLarge(dumped.length);
  }
  return keepFinalLineBreak(dumped.endsWith('\n') ? dumped.slice(0, -1) : dumped, text);
};

/**
 * DATAX-013: whether the selection is valid YAML (every document, Core schema). The values are
 * thrown away as they are read: nothing expands aliases.
 */
export const validateYaml = (text: string): { valid: boolean; message: string } => {
  assertInputLength(text);
  try {
    yaml.loadAll(text, () => undefined, { schema: yaml.CORE_SCHEMA });
    return { valid: true, message: 'Valid YAML' };
  } catch (error) {
    if (error instanceof yaml.YAMLException) {
      return { valid: false, message: `Invalid YAML: ${yamlErrorDetail(error)}` };
    }
    throw yamlError(error);
  }
};

/** Throws when a value read from YAML has `.inf` / `.nan`, which JSON cannot represent (each object visited once). */
const assertFiniteNumbers = (root: unknown): void => {
  const seen = new Set<object>();
  const stack: unknown[] = [root];
  while (stack.length > 0) {
    const item = stack.pop();
    if (typeof item === 'number' && !Number.isFinite(item)) {
      throw new DataInputError('.inf and .nan cannot be represented in JSON');
    }
    if (typeof item === 'object' && item !== null && !seen.has(item)) {
      seen.add(item);
      for (const child of Object.values(item)) {
        stack.push(child);
      }
    }
  }
};

/**
 * DATAX-014: every document of a multi-document YAML (`---`) as an element of a JSON array (an
 * empty document is null). At most YAML_MAX_DOCUMENTS documents. Aliases are expanded by JSON, so
 * the length of the JSON is checked with `assertJsonFits` (stopping at MAX_OUTPUT_LENGTH) before
 * the string is built: nested aliases ("billion laughs") are refused quickly.
 */
export const multiDocumentYamlToJson = (text: string): string => {
  assertInputLength(text);
  const documents: JsonValue[] = [];
  try {
    yaml.loadAll(text, (document) => {
      if (documents.length >= YAML_MAX_DOCUMENTS) {
        throw new CountLimitError(documents.length + 1, YAML_MAX_DOCUMENTS, 'documents');
      }
      documents.push(document === undefined ? null : (document as JsonValue));
    }, { schema: yaml.CORE_SCHEMA });
  } catch (error) {
    throw yamlError(error);
  }
  // Only comments, blank lines or document markers: there is nothing to convert (not "[null]").
  if (documents.every((document) => document === null) && text.split(/\r\n|\r|\n/).every(isEmptyYamlLine)) {
    throw new DataInputError('the selection contains no YAML document');
  }
  inspectGraph(documents);
  assertFiniteNumbers(documents);
  return stringifyPretty(documents);
};

/**
 * DATAX-015: reads TOML with the TOML to JSON parser, keeping floats and dates / times as they
 * are (`1.0` stays a float), and writes it back with the JSON to TOML writer: values first,
 * `[table]` / `[[array]]` headers, one blank line before each header. Comments, the original
 * quoting of keys and blank lines are not kept.
 */
export const formatToml = (text: string): string => {
  const value = parseToml(text, { preserveTypes: true });
  if (Object.keys(value).length === 0) {
    throw new DataInputError('the selection contains no TOML key');
  }
  return keepFinalLineBreak(toToml(value), text);
};

// ---------------------------------------------------------------------------------------------
// The command table
// ---------------------------------------------------------------------------------------------

const DATA_FORMAT = 'Transform - Data Format - ';
const TRANSFORM = 'Transform - ';

const input = (prompt: string, placeHolder: string, validate: (value: string) => string | undefined): Data2Prompt =>
  ({ type: 'input', prompt, placeHolder, validate });

const KEY_LIST_PROMPT = input('Keys separated by commas (e.g. id,name)', 'id,name', findKeyListProblem);
const COLUMN_PROMPT = input('Column number or header name', '1', (value) => findPromptProblem(value));

const transformEntry = (
  id: number,
  name: string,
  title: string,
  showPrefix: string,
  prompts: readonly Data2Prompt[],
  transform: Data2Transform
): Data2TransformEntry => ({
  id: `DATAX-${String(id).padStart(3, '0')}`, name, title, showTitle: `${showPrefix}${title}`, output: 'new-tab', prompts, transform,
});

const notifyEntry = (id: number, name: string, title: string, check: Data2Check): Data2NotifyEntry => ({
  id: `DATAX-${String(id).padStart(3, '0')}`, name, title, showTitle: `${DATA_FORMAT}${title}`, output: 'notify', prompts: [], check,
});

/** The 24 commands in showcase order (candidates No.69..92 of SELEC-00091). */
export const DATA2_COMMAND_ENTRIES: readonly Data2CommandEntry[] = [
  transformEntry(1, 'json.sort-array', 'Sort JSON Array', DATA_FORMAT,
    [input('Key path to sort by (e.g. user.age); leave empty to sort by the elements', 'user.age', findOptionalPathProblem)],
    json((value, text, [path]) => sortJsonArray(value, text, path))),
  transformEntry(2, 'json.filter-array', 'Filter JSON Array by Field Value', DATA_FORMAT,
    [input('key=value — matches the JSON value or the same text; quote the value ("200") to match strings only', 'status=active', findFilterProblem)],
    json((value, text, [condition]) => filterJsonArray(value, text, condition))),
  transformEntry(3, 'json.pick-keys', 'Pick Keys from JSON Object', DATA_FORMAT, [KEY_LIST_PROMPT],
    json((value, text, [list]) => pickKeys(value, text, list))),
  transformEntry(4, 'json.omit-keys', 'Omit Keys from JSON', DATA_FORMAT,
    [KEY_LIST_PROMPT, { type: 'pick', placeHolder: 'Remove the keys at…', items: OMIT_SCOPES }],
    json((value, text, [list, scope]) => omitKeys(value, text, list, scope))),
  transformEntry(5, 'json.rename-key', 'Rename JSON Key', DATA_FORMAT,
    [input('Key to rename (at every level)', 'old', findKeyNameProblem), input('New key name', 'new', findKeyNameProblem)],
    json((value, text, [from, to]) => renameKey(value, text, from, to))),
  transformEntry(6, 'json.remove-empty', 'Remove Empty Values from JSON', DATA_FORMAT, [], json(removeEmpty)),
  transformEntry(7, 'json.to-markdown-table', 'Convert JSON Array to Markdown Table', DATA_FORMAT, [], json(toMarkdownTable)),
  transformEntry(8, 'json.chunk-array', 'Split JSON Array into Chunks', DATA_FORMAT,
    [input(`Elements per chunk (1 to ${CHUNK_MAX_SIZE.toLocaleString('en-US')})`, '2', findChunkSizeProblem)],
    json((value, text, [size]) => chunkArray(value, text, size))),
  transformEntry(9, 'json.array-to-object', 'Convert JSON Array to Object by Key', DATA_FORMAT,
    [input('Key of each element (e.g. id or user.id)', 'id', findPathProblem)],
    json((value, text, [path]) => arrayToObject(value, text, path))),
  transformEntry(10, 'json.object-to-entries', 'Convert JSON Object to Key-Value Array', DATA_FORMAT, [], json(objectToEntries)),
  transformEntry(11, 'json.set-path', 'Set JSON Value at Path', DATA_FORMAT,
    [input('JSON path to set (e.g. a.b[0])', 'a.b', findPathProblem), input('New value as JSON (e.g. 2, "text", true, null, {"a":1})', '"value"', findJsonValueProblem)],
    json((value, text, [path, valueText]) => setPath(value, text, path, valueText))),
  transformEntry(12, 'yaml.to-flow', 'Convert YAML to Flow Style', DATA_FORMAT, [], yamlToFlow),
  notifyEntry(13, 'yaml.validate', 'Validate YAML', validateYaml),
  transformEntry(14, 'yaml.multi-doc-to-json', 'Convert Multi-document YAML to JSON Array', DATA_FORMAT, [], multiDocumentYamlToJson),
  transformEntry(15, 'toml.format', 'Format TOML', DATA_FORMAT, [], formatToml),
  notifyEntry(16, 'xml.validate', 'Validate XML (Well-formedness)', validateXml),
  transformEntry(17, 'xml.list-paths', 'List XML Element Paths', DATA_FORMAT, [], listXmlPaths),
  transformEntry(18, 'csv.reorder-columns', 'CSV - Reorder Columns', TRANSFORM,
    [input('New order of the column numbers (e.g. 3,1,2)', '3,1,2', findColumnOrderProblem)], reorderColumns),
  transformEntry(19, 'csv.merge-columns', 'CSV - Merge Two Columns', TRANSFORM,
    [
      input('First column (number or header name); the merged column takes its place', '1', (value) => findPromptProblem(value)),
      input('Second column (number or header name)', '2', (value) => findPromptProblem(value)),
      input('Separator between the two values (may be empty)', ' ', (value) => findSeparatorProblem(value, true)),
    ],
    mergeColumns),
  transformEntry(20, 'csv.split-column', 'CSV - Split Column by Delimiter', TRANSFORM,
    [COLUMN_PROMPT, input('Delimiter (plain text, 1 to 100 characters)', '-', (value) => findSeparatorProblem(value, false))], splitColumn),
  transformEntry(21, 'csv.group-count', 'CSV - Count Rows by Column Value', TRANSFORM, [COLUMN_PROMPT], groupCount),
  transformEntry(22, 'csv.fill-empty', 'CSV - Fill Empty Cells with Value', TRANSFORM,
    [input('Value for the empty cells', 'N/A', (value) => findPromptProblem(value))], fillEmpty),
  transformEntry(23, 'ltsv.to-json', 'Convert LTSV to JSON', DATA_FORMAT, [], ltsvToJson),
  transformEntry(24, 'json.to-ltsv', 'Convert JSON to LTSV', DATA_FORMAT, [], json(jsonToLtsv)),
];
