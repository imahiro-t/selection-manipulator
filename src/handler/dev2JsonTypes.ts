/**
 * DEVX-001..005: type definitions (Rust serde struct, Kotlin data class, C# class, Zod schema,
 * Swift Codable struct) inferred from a sample JSON (vscode-independent).
 *
 * The inference is the one of DEV-012..014 (devJsonTypes.ts): the JSON is read with `JSON.parse`
 * only, every key is kept in a `Map` (so `__proto__` or `constructor` are ordinary fields), the
 * nesting depth is capped at DEV_MAX_NESTING and the result is counted against the output budget.
 * Generated names only hold ASCII letters, digits and `_` (keywords are escaped the way each
 * language allows), and the original keys are written as escaped string literals of the target
 * language. The generated code is only text: it is never compiled or run.
 */
import { DEV_MAX_NESTING, DevInputError, DevOutputBuffer, quoteText } from './devCommon';
import {
  capitalize,
  inferRoot,
  isOptional,
  LineWriter,
  NamePool,
  nameTypes,
  ObjectShape,
  pascalCase,
  Shape,
  wordsOf,
} from './devJsonTypes';
import { toJsString } from './devLiterals';

// ---------------------------------------------------------------------------------------------
// Shared: resolved types, names and string literals
// ---------------------------------------------------------------------------------------------

/** The type of the values seen at one place, as every target language needs it. */
interface Resolved {
  /** `mixed`: values of different types, or only `null` (nothing to infer from). */
  kind: 'string' | 'int' | 'float' | 'bool' | 'object' | 'array' | 'mixed';
  /** `null` was seen next to the other values. */
  nullable: boolean;
  /** The element type of an array (undefined when every array was empty). */
  element?: Resolved;
  object?: ObjectShape;
}

/** Integers next to decimals are decimals; `null` makes the type nullable. */
const resolve = (shape: Shape): Resolved => {
  const kinds = new Set(shape.kinds);
  const nullable = kinds.delete('null');
  if (kinds.has('int') && kinds.has('float')) {
    kinds.delete('int');
  }
  if (kinds.size !== 1) {
    return { kind: 'mixed', nullable };
  }
  const [kind] = kinds;
  if (kind === 'array') {
    return { kind, nullable, element: shape.element === undefined ? undefined : resolve(shape.element) };
  }
  if (kind === 'object') {
    return { kind, nullable, object: shape.object };
  }
  return { kind: kind as Resolved['kind'], nullable };
};

/** `user_id` → `userId` (Kotlin and Swift properties); `''` when the key has no ASCII letter or digit. */
const camelCase = (key: string): string =>
  wordsOf(key).map((word, i) => (i === 0 ? word.toLowerCase() : capitalize(word))).join('');

/** `userId` → `user_id` (Rust fields). */
const snakeCase = (key: string): string => wordsOf(key).map((word) => word.toLowerCase()).join('_');

/** A field name that can start an identifier: `fallback` when empty, `_` before a leading digit. */
const fieldIdentifier = (name: string, fallback: string): string => {
  if (name === '') {
    return fallback;
  }
  return /^[0-9]/.test(name) ? `_${name}` : name;
};

const hex = (code: number, width: number): string => code.toString(16).toUpperCase().padStart(width, '0');

/** A lone (unpaired) surrogate, which a UTF-8 source file cannot hold. */
const LONE_SURROGATE = /[\ud800-\udbff](?![\udc00-\udfff])|(?<![\ud800-\udbff])[\udc00-\udfff]/;

/**
 * Characters escaped in every string literal: `\`, `"`, `$`, the controls (C0, DEL, C1),
 * U+2028 / U+2029 and lone surrogates. Valid surrogate pairs (emoji) stay as they are.
 */
const STRING_SPECIAL = /[\\"$\u0000-\u001f\u007f-\u009f\u2028\u2029]|[\ud800-\udbff](?![\udc00-\udfff])|(?<![\ud800-\udbff])[\udc00-\udfff]/g;

interface StringStyle {
  /** Whether `$` starts a template in the language (Kotlin). */
  dollar: boolean;
  /** `\0` is written as a short escape. */
  nul: boolean;
  /** `\uXXXX` (true) or `\u{X}` (false: Rust and Swift, which cannot write a lone surrogate). */
  utf16: boolean;
  language: string;
}

/** A double-quoted string literal of the target language (no interpolation, no raw controls). */
const quoteString = (text: string, style: StringStyle): string => {
  if (!style.utf16 && LONE_SURROGATE.test(text)) {
    throw new DevInputError(`the key ${quoteText(text)} holds a lone surrogate, which a ${style.language} string cannot hold`);
  }
  const body = text.replace(STRING_SPECIAL, (ch) => {
    switch (ch) {
      case '\\':
        return '\\\\';
      case '"':
        return '\\"';
      case '$':
        return style.dollar ? '\\$' : '$';
      case '\n':
        return '\\n';
      case '\r':
        return '\\r';
      case '\t':
        return '\\t';
      case '\0':
        if (style.nul) {
          return '\\0';
        }
        break;
      default:
        break;
    }
    const code = ch.charCodeAt(0);
    return style.utf16 ? `\\u${hex(code, 4)}` : `\\u{${hex(code, 1)}}`;
  });
  return `"${body}"`;
};

const RUST_STRING: StringStyle = { dollar: false, nul: true, utf16: false, language: 'Rust' };
const KOTLIN_STRING: StringStyle = { dollar: true, nul: false, utf16: true, language: 'Kotlin' };
const CSHARP_STRING: StringStyle = { dollar: false, nul: true, utf16: true, language: 'C#' };
const SWIFT_STRING: StringStyle = { dollar: false, nul: true, utf16: false, language: 'Swift' };

const quoteRust = (text: string): string => quoteString(text, RUST_STRING);
const quoteKotlin = (text: string): string => quoteString(text, KOTLIN_STRING);
const quoteCSharp = (text: string): string => quoteString(text, CSHARP_STRING);
const quoteSwift = (text: string): string => quoteString(text, SWIFT_STRING);

/** The fields of an object with unique identifiers (made from the keys by `nameOf`). */
const fieldNames = (object: ObjectShape, nameOf: (key: string) => string, reserved: Iterable<string> = []): Map<string, string> => {
  const pool = new NamePool(reserved);
  const names = new Map<string, string>();
  for (const key of object.fields.keys()) {
    names.set(key, pool.take(nameOf(key)));
  }
  return names;
};

/** Writes blocks separated by one empty line after an optional header. */
const writeBlocks = (header: readonly string[], blocks: readonly (readonly string[])[], eol: string, budget: number): string => {
  const out = new LineWriter(eol, budget);
  header.forEach((line) => out.line(line));
  blocks.forEach((block, index) => {
    if (index > 0 || header.length > 0) {
      out.line('');
    }
    block.forEach((line) => out.line(line));
  });
  return out.join();
};

// ---------------------------------------------------------------------------------------------
// DEVX-001 Rust (serde)
// ---------------------------------------------------------------------------------------------

/** Rust 2021 strict and reserved keywords. */
const RUST_KEYWORDS = new Set([
  'as', 'async', 'await', 'break', 'const', 'continue', 'crate', 'dyn', 'else', 'enum', 'extern', 'false', 'fn', 'for',
  'if', 'impl', 'in', 'let', 'loop', 'match', 'mod', 'move', 'mut', 'pub', 'ref', 'return', 'self', 'Self', 'static',
  'struct', 'super', 'trait', 'true', 'type', 'unsafe', 'use', 'where', 'while', 'abstract', 'become', 'box', 'do',
  'final', 'macro', 'override', 'priv', 'try', 'typeof', 'unsized', 'virtual', 'yield', 'gen',
]);
/** Keywords that cannot be raw identifiers (`r#self` is invalid): they get a trailing `_`. */
const RUST_NOT_RAW = new Set(['self', 'Self', 'super', 'crate']);
/** Type names a generated struct must not shadow. */
const RUST_RESERVED_TYPES = ['Self', 'Option', 'Vec', 'String', 'Value', 'Result', 'Box', 'Some', 'None', 'Ok', 'Err', 'Serialize', 'Deserialize'];

/** The serde name of a field: snake_case, a trailing `_` after a keyword that cannot be raw (`self_`). */
const rustFieldName = (key: string): string => {
  const name = fieldIdentifier(snakeCase(key), 'field');
  return RUST_NOT_RAW.has(name) ? `${name}_` : name;
};

/** The field as written in the struct: a keyword is a raw identifier (`r#type`, which serde reads as `type`). */
const rustWritten = (name: string): string => (RUST_KEYWORDS.has(name) ? `r#${name}` : name);

const rustType = (type: Resolved | undefined, names: Map<ObjectShape, string>): string => {
  if (type === undefined || type.kind === 'mixed') {
    // serde_json::Value holds null too.
    return 'serde_json::Value';
  }
  let name: string;
  switch (type.kind) {
    case 'string':
      name = 'String';
      break;
    case 'int':
      name = 'i64';
      break;
    case 'float':
      name = 'f64';
      break;
    case 'bool':
      name = 'bool';
      break;
    case 'object':
      name = names.get(type.object!)!;
      break;
    default:
      name = `Vec<${rustType(type.element, names)}>`;
      break;
  }
  return type.nullable ? `Option<${name}>` : name;
};

/**
 * DEVX-001: Rust structs for serde (`Root` first, then the nested types), after
 * `use serde::{Deserialize, Serialize};`. Fields are snake_case with `#[serde(rename = "…")]` when
 * that differs from the key; `null` or a key missing from some objects makes `Option<…>`; values
 * of different types are `serde_json::Value`. Neither the structs nor the fields are `pub`.
 */
export const jsonToRustStruct = (text: string, eol: string, budget: number): string => {
  const { order, names } = nameTypes(inferRoot(text), pascalCase, RUST_RESERVED_TYPES);
  const blocks = order.map((object) => {
    const lines = ['#[derive(Serialize, Deserialize)]', `struct ${names.get(object)!} {`];
    const fields = fieldNames(object, rustFieldName);
    for (const [key, field] of object.fields) {
      const serde = fields.get(key)!;
      const written = rustWritten(serde);
      let type = rustType(resolve(field.shape), names);
      if (isOptional(object, field) && !type.startsWith('Option<')) {
        type = `Option<${type}>`;
      }
      if (serde !== key) {
        lines.push(`    #[serde(rename = ${quoteRust(key)})]`);
      }
      lines.push(`    ${written}: ${type},`);
    }
    lines.push('}');
    return lines;
  });
  return writeBlocks(['use serde::{Deserialize, Serialize};'], blocks, eol, budget);
};

// ---------------------------------------------------------------------------------------------
// DEVX-002 Kotlin (kotlinx.serialization)
// ---------------------------------------------------------------------------------------------

/** Kotlin hard keywords (escaped with backquotes). */
const KOTLIN_KEYWORDS = new Set([
  'as', 'break', 'class', 'continue', 'do', 'else', 'false', 'for', 'fun', 'if', 'in', 'interface', 'is', 'null',
  'object', 'package', 'return', 'super', 'this', 'throw', 'true', 'try', 'typealias', 'typeof', 'val', 'var', 'when',
  'while',
]);
const KOTLIN_RESERVED_TYPES = ['Any', 'Boolean', 'Double', 'JsonElement', 'List', 'Long', 'Nothing', 'SerialName', 'Serializable', 'String', 'Unit'];

const kotlinType = (type: Resolved | undefined, names: Map<ObjectShape, string>, imports: Set<string>): string => {
  if (type === undefined || type.kind === 'mixed') {
    imports.add('kotlinx.serialization.json.JsonElement');
    return type?.nullable ? 'JsonElement?' : 'JsonElement';
  }
  let name: string;
  switch (type.kind) {
    case 'string':
      name = 'String';
      break;
    case 'int':
      name = 'Long';
      break;
    case 'float':
      name = 'Double';
      break;
    case 'bool':
      name = 'Boolean';
      break;
    case 'object':
      name = names.get(type.object!)!;
      break;
    default:
      name = `List<${kotlinType(type.element, names, imports)}>`;
      break;
  }
  return type.nullable ? `${name}?` : name;
};

/**
 * DEVX-002: Kotlin data classes for kotlinx.serialization (`Root` first, then the nested types),
 * after the imports they need. Every class is `@Serializable`; properties are camelCase with
 * `@SerialName("…")` when that differs from the key; `null` makes `T?`, and a key missing from
 * some objects `T? = null`; values of different types are `JsonElement`. An object without keys is
 * a plain `class` (a data class needs a property).
 */
export const jsonToKotlinDataClass = (text: string, eol: string, budget: number): string => {
  const { order, names } = nameTypes(inferRoot(text), pascalCase, KOTLIN_RESERVED_TYPES);
  const imports = new Set(['kotlinx.serialization.Serializable']);
  const blocks = order.map((object) => {
    const name = names.get(object)!;
    if (object.fields.size === 0) {
      return ['@Serializable', `class ${name}`];
    }
    const fields = fieldNames(object, (key) => fieldIdentifier(camelCase(key), 'field'));
    const properties = [...object.fields].map(([key, field]) => {
      const identifier = fields.get(key)!;
      let type = kotlinType(resolve(field.shape), names, imports);
      if (isOptional(object, field)) {
        type = `${type.endsWith('?') ? type : `${type}?`} = null`;
      }
      const written = KOTLIN_KEYWORDS.has(identifier) ? `\`${identifier}\`` : identifier;
      let annotation = '';
      if (identifier !== key) {
        imports.add('kotlinx.serialization.SerialName');
        annotation = `@SerialName(${quoteKotlin(key)}) `;
      }
      return `${annotation}val ${written}: ${type}`;
    });
    if (properties.length === 1) {
      return ['@Serializable', `data class ${name}(${properties[0]})`];
    }
    return ['@Serializable', `data class ${name}(`, ...properties.map((property) => `    ${property},`), ')'];
  });
  return writeBlocks([...imports].sort().map((name) => `import ${name}`), blocks, eol, budget);
};

// ---------------------------------------------------------------------------------------------
// DEVX-003 C# (System.Text.Json)
// ---------------------------------------------------------------------------------------------

/** C# keywords (a property that would be one is written with `@`). */
const CSHARP_KEYWORDS = new Set([
  'abstract', 'as', 'base', 'bool', 'break', 'byte', 'case', 'catch', 'char', 'checked', 'class', 'const', 'continue',
  'decimal', 'default', 'delegate', 'do', 'double', 'else', 'enum', 'event', 'explicit', 'extern', 'false', 'finally',
  'fixed', 'float', 'for', 'foreach', 'goto', 'if', 'implicit', 'in', 'int', 'interface', 'internal', 'is', 'lock',
  'long', 'namespace', 'new', 'null', 'object', 'operator', 'out', 'override', 'params', 'private', 'protected',
  'public', 'readonly', 'ref', 'return', 'sbyte', 'sealed', 'short', 'sizeof', 'stackalloc', 'static', 'string',
  'struct', 'switch', 'this', 'throw', 'true', 'try', 'typeof', 'uint', 'ulong', 'unchecked', 'unsafe', 'ushort',
  'using', 'virtual', 'void', 'volatile', 'while',
]);
const CSHARP_RESERVED_TYPES = ['JsonElement', 'JsonPropertyName', 'JsonPropertyNameAttribute', 'List', 'Object', 'String', 'System'];

const csharpType = (type: Resolved | undefined, names: Map<ObjectShape, string>, usings: Set<string>): string => {
  if (type === undefined || type.kind === 'mixed') {
    usings.add('System.Text.Json');
    return type?.nullable ? 'JsonElement?' : 'JsonElement';
  }
  let name: string;
  switch (type.kind) {
    case 'string':
      name = 'string';
      break;
    case 'int':
      name = 'long';
      break;
    case 'float':
      name = 'double';
      break;
    case 'bool':
      name = 'bool';
      break;
    case 'object':
      name = names.get(type.object!)!;
      break;
    default:
      usings.add('System.Collections.Generic');
      name = `List<${csharpType(type.element, names, usings)}>`;
      break;
  }
  return type.nullable ? `${name}?` : name;
};

/**
 * DEVX-003: C# classes for System.Text.Json (`Root` first, then the nested types), after the
 * usings they need. Properties are PascalCase (a trailing `_` when that is the name of the class,
 * which C# does not allow) and every one has `[JsonPropertyName("…")]`, so the class round-trips
 * with the default options as well as with JsonSerializerDefaults.Web. `null` or a key missing
 * from some objects makes `T?`; values of different types are `JsonElement`.
 */
export const jsonToCSharpClass = (text: string, eol: string, budget: number): string => {
  const { order, names } = nameTypes(inferRoot(text), pascalCase, CSHARP_RESERVED_TYPES);
  const usings = new Set(['System.Text.Json.Serialization']);
  const blocks = order.map((object) => {
    const className = names.get(object)!;
    const lines = [`public class ${className}`, '{'];
    const fields = fieldNames(object, (key) => {
      const name = fieldIdentifier(pascalCase(key), 'Field');
      return name === className ? `${name}_` : name;
    }, [className]);
    let first = true;
    for (const [key, field] of object.fields) {
      const identifier = fields.get(key)!;
      let type = csharpType(resolve(field.shape), names, usings);
      if (isOptional(object, field) && !type.endsWith('?')) {
        type = `${type}?`;
      }
      if (!first) {
        lines.push('');
      }
      first = false;
      lines.push(`    [JsonPropertyName(${quoteCSharp(key)})]`);
      lines.push(`    public ${type} ${CSHARP_KEYWORDS.has(identifier) ? `@${identifier}` : identifier} { get; set; }`);
    }
    lines.push('}');
    return lines;
  });
  return writeBlocks([...usings].sort().map((name) => `using ${name};`), blocks, eol, budget);
};

// ---------------------------------------------------------------------------------------------
// DEVX-004 Zod
// ---------------------------------------------------------------------------------------------

/** One schema: written on one line, or over several lines (an object that does not fit). */
type ZodText = string | string[];

const ZOD_LINE_WIDTH = 80;
const JS_IDENTIFIER = /^[A-Za-z_$][A-Za-z0-9_$]*$/;

/**
 * The key of an object literal. `__proto__: …` (quoted or not) would set the prototype of the
 * object literal instead of making a property, so that key is computed: `['__proto__']: …`.
 */
const zodKey = (key: string): string => {
  if (key === '__proto__') {
    return `['__proto__']`;
  }
  return JS_IDENTIFIER.test(key) ? key : toJsString(key);
};

const isMultiLine = (schema: ZodText): schema is string[] => Array.isArray(schema);

/** `prefix` + schema + `suffix` (a multi-line schema gets them on its first and last lines). */
const wrapZod = (prefix: string, schema: ZodText, suffix: string): ZodText => {
  if (!isMultiLine(schema)) {
    return `${prefix}${schema}${suffix}`;
  }
  return [`${prefix}${schema[0]}`, ...schema.slice(1, -1), `${schema[schema.length - 1]}${suffix}`];
};

const zodObject = (object: ObjectShape, depth: number): ZodText => {
  if (depth > DEV_MAX_NESTING) {
    throw new DevInputError(`the JSON is nested deeper than ${DEV_MAX_NESTING} levels`);
  }
  const entries = [...object.fields].map(([key, field]) => {
    let schema = zodSchema(field.shape, depth + 1);
    if (isOptional(object, field)) {
      schema = wrapZod('', schema, '.optional()');
    }
    return wrapZod(`${zodKey(key)}: `, schema, '');
  });
  if (entries.length === 0) {
    return 'z.object({})';
  }
  if (entries.every((entry) => !isMultiLine(entry))) {
    const line = `z.object({ ${entries.join(', ')} })`;
    if (line.length <= ZOD_LINE_WIDTH) {
      return line;
    }
  }
  const lines = ['z.object({'];
  for (const entry of entries) {
    const entryLines = isMultiLine(entry) ? entry : [entry];
    entryLines.forEach((line, i) => lines.push(`  ${line}${i === entryLines.length - 1 ? ',' : ''}`));
  }
  lines.push('})');
  return lines;
};

const zodSchema = (shape: Shape, depth: number): ZodText => {
  const parts: ZodText[] = [];
  if (shape.kinds.has('string')) {
    parts.push('z.string()');
  }
  if (shape.kinds.has('int') || shape.kinds.has('float')) {
    parts.push('z.number()');
  }
  if (shape.kinds.has('bool')) {
    parts.push('z.boolean()');
  }
  if (shape.object !== undefined) {
    parts.push(zodObject(shape.object, depth));
  }
  if (shape.kinds.has('array')) {
    parts.push(wrapZod('z.array(', shape.element === undefined ? 'z.unknown()' : zodSchema(shape.element, depth + 1), ')'));
  }
  const nullable = shape.kinds.has('null');
  if (parts.length === 0) {
    return 'z.null()';
  }
  let schema: ZodText;
  if (parts.length === 1) {
    schema = parts[0];
  } else if (parts.every((part) => !isMultiLine(part))) {
    schema = `z.union([${parts.join(', ')}])`;
  } else {
    const lines = ['z.union(['];
    for (const part of parts) {
      const partLines = isMultiLine(part) ? part : [part];
      partLines.forEach((line, i) => lines.push(`  ${line}${i === partLines.length - 1 ? ',' : ''}`));
    }
    lines.push('])');
    schema = lines;
  }
  return nullable ? wrapZod('', schema, '.nullable()') : schema;
};

/**
 * DEVX-004: a Zod schema expression (`z.object({ … })`) for the object (or the merged objects of an
 * array). Numbers are `z.number()`, an empty array `z.array(z.unknown())`, values of different
 * types `z.union([…])`, `null` adds `.nullable()` and a key missing from some objects
 * `.optional()`. Nested objects are written in place; an object that does not fit in 80
 * characters is written over several lines (two-space indentation). Only the expression is
 * written: no `import`, and zod is not a dependency of this extension.
 */
export const jsonToZod = (text: string, eol: string, budget: number): string => {
  const schema = zodObject(inferRoot(text), 1);
  const out = new DevOutputBuffer(budget);
  (isMultiLine(schema) ? schema : [schema]).forEach((line, i) => {
    if (i > 0) {
      out.push(eol);
    }
    out.push(line);
  });
  return out.join();
};

// ---------------------------------------------------------------------------------------------
// DEVX-005 Swift (Codable)
// ---------------------------------------------------------------------------------------------

/** Swift keywords (escaped with backquotes). */
const SWIFT_KEYWORDS = new Set([
  'associatedtype', 'class', 'deinit', 'enum', 'extension', 'fileprivate', 'func', 'import', 'init', 'inout',
  'internal', 'let', 'open', 'operator', 'private', 'precedencegroup', 'protocol', 'public', 'rethrows', 'static',
  'struct', 'subscript', 'typealias', 'var', 'break', 'case', 'catch', 'continue', 'default', 'defer', 'do', 'else',
  'fallthrough', 'for', 'guard', 'if', 'in', 'repeat', 'return', 'throw', 'switch', 'where', 'while', 'Any', 'as',
  'await', 'false', 'is', 'nil', 'self', 'Self', 'super', 'throws', 'true', 'try',
]);
const SWIFT_RESERVED_TYPES = ['Any', 'Bool', 'Codable', 'CodingKey', 'CodingKeys', 'Double', 'Int', 'Self', 'String', 'Type'];

const swiftType = (type: Resolved | undefined, names: Map<ObjectShape, string>, key: string): string => {
  if (type === undefined || type.kind === 'mixed') {
    const what = type === undefined ? 'an empty array, whose element type is unknown,' : 'values of different types (or only null)';
    throw new DevInputError(`the key ${quoteText(key)} has ${what} which Swift Codable cannot represent without a custom type`);
  }
  let name: string;
  switch (type.kind) {
    case 'string':
      name = 'String';
      break;
    case 'int':
      name = 'Int';
      break;
    case 'float':
      name = 'Double';
      break;
    case 'bool':
      name = 'Bool';
      break;
    case 'object':
      name = names.get(type.object!)!;
      break;
    default:
      name = `[${swiftType(type.element, names, key)}]`;
      break;
  }
  return type.nullable ? `${name}?` : name;
};

const swiftName = (identifier: string): string => (SWIFT_KEYWORDS.has(identifier) ? `\`${identifier}\`` : identifier);

/**
 * DEVX-005: Swift structs that conform to Codable (`Root` first, then the nested types; Foundation
 * needs no import for them). Properties are camelCase; when one differs from its key, a
 * `CodingKeys` enum lists every property. `null` or a key missing from some objects makes `T?`.
 * Values of different types, `null` alone and empty arrays are errors: the standard library has no
 * Codable type for any JSON value.
 */
export const jsonToSwiftCodable = (text: string, eol: string, budget: number): string => {
  const { order, names } = nameTypes(inferRoot(text), pascalCase, SWIFT_RESERVED_TYPES);
  const blocks = order.map((object) => {
    const lines = [`struct ${names.get(object)!}: Codable {`];
    const fields = fieldNames(object, (key) => fieldIdentifier(camelCase(key), 'field'), ['CodingKeys']);
    for (const [key, field] of object.fields) {
      let type = swiftType(resolve(field.shape), names, key);
      if (isOptional(object, field) && !type.endsWith('?')) {
        type = `${type}?`;
      }
      lines.push(`    let ${swiftName(fields.get(key)!)}: ${type}`);
    }
    if ([...fields].some(([key, identifier]) => key !== identifier)) {
      lines.push('');
      lines.push('    enum CodingKeys: String, CodingKey {');
      for (const [key, identifier] of fields) {
        lines.push(identifier === key ? `        case ${swiftName(identifier)}` : `        case ${swiftName(identifier)} = ${quoteSwift(key)}`);
      }
      lines.push('    }');
    }
    lines.push('}');
    return lines;
  });
  return writeBlocks([], blocks, eol, budget);
};
