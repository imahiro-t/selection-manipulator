/**
 * JSON -> other formats (DATA-002 / 003 / 004 / 005 / 007 / 009 / 027). Pure functions: the
 * results use LF line breaks (the handler switches them to the document's EOL). Values that a
 * format cannot represent are errors (`DataInputError`) rather than silently changed.
 */
import xmlFormat from 'xml-formatter';
import { findLoneSurrogate } from './encodeTransforms';
import {
  DataInputError,
  IDENTIFIER,
  isJsonObject,
  isScalar,
  isSurrogatePairAt,
  JsonObject,
  JsonValue,
  OutputBuffer,
  quoteText,
  requireObject,
} from './dataCommon';

const describePath = (path: readonly string[]): string => (path.length === 0 ? 'the top level' : JSON.stringify(path.join('.')));

const scalarText = (value: null | boolean | number | string): string => (value === null ? '' : String(value));

// ---------------------------------------------------------------------------------------------
// DATA-002 Query string
// ---------------------------------------------------------------------------------------------

export const toQueryString = (value: JsonValue): string => {
  const object = requireObject(value, 'Convert JSON to Query String');
  const params = new URLSearchParams();
  for (const [key, item] of Object.entries(object)) {
    if (Array.isArray(item)) {
      item.forEach((element) => {
        if (!isScalar(element)) {
          throw new DataInputError(`the value of ${JSON.stringify(key)} contains an object or array (only flat objects and arrays of values are supported)`);
        }
        params.append(key, scalarText(element));
      });
    } else if (isScalar(item)) {
      params.append(key, scalarText(item));
    } else {
      throw new DataInputError(`the value of ${JSON.stringify(key)} is an object (only flat objects are supported)`);
    }
  }
  return params.toString();
};

// ---------------------------------------------------------------------------------------------
// DATA-003 .env
// ---------------------------------------------------------------------------------------------

const ENV_KEY = /^[\w.-]+$/;
const ENV_NEEDS_QUOTES = /[\s#"'=\\`$]/;
/**
 * Characters that readers expand inside double quotes: `$VAR` / `${VAR}` / `$(...)` (shells,
 * Docker Compose, dotenv-expand), backquotes (shells) and backslash escapes such as `\n` (dotenv).
 * A value that holds one of them is written in single quotes, where they stay literal.
 */
const ENV_EXPANDED_IN_DOUBLE_QUOTES = /[\\`$]/;

export const toEnv = (value: JsonValue): string => {
  const object = requireObject(value, 'Convert JSON to Env');
  const lines = new OutputBuffer();
  for (const [key, item] of Object.entries(object)) {
    if (!ENV_KEY.test(key)) {
      throw new DataInputError(`the key ${quoteText(key)} cannot be used in .env (only letters, digits, "_", "." and "-")`);
    }
    if (!isScalar(item)) {
      throw new DataInputError(`the value of ${JSON.stringify(key)} is an object or array (only flat objects are supported)`);
    }
    const text = scalarText(item);
    if (/[\r\n]/.test(text)) {
      throw new DataInputError(`the value of ${JSON.stringify(key)} contains a line break`);
    }
    let written = text;
    if (ENV_EXPANDED_IN_DOUBLE_QUOTES.test(text)) {
      if (text.includes("'")) {
        throw new DataInputError(`the value of ${JSON.stringify(key)} contains ' together with $, \` or \\ and cannot be quoted safely`);
      }
      written = `'${text}'`;
    } else if (ENV_NEEDS_QUOTES.test(text)) {
      if (!text.includes('"')) {
        written = `"${text}"`;
      } else if (!text.includes("'")) {
        written = `'${text}'`;
      } else {
        throw new DataInputError(`the value of ${JSON.stringify(key)} contains both " and ' and cannot be quoted`);
      }
    }
    lines.push(`${key}=${written}`);
  }
  return lines.join('\n');
};

// ---------------------------------------------------------------------------------------------
// DATA-004 XML
// ---------------------------------------------------------------------------------------------

/**
 * XML element names are limited to ASCII letters, digits, `_`, `.` and `-` (starting with a letter
 * or `_`): the XML parser inside xml-formatter does not accept other names, and anything else in a
 * key (spaces, `<`, `:` ...) must not reach the markup (SECURITY.md rule 4).
 */
const XML_NAME = /^[A-Za-z_][A-Za-z0-9_.-]*$/;
const XML_INVALID_CHAR = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\uFFFE\uFFFF]/;

/** Options of xml-formatter: text-only elements stay on one line and lines end with LF. */
export const XML_FORMAT_OPTIONS = { indentation: '  ', lineSeparator: '\n', collapseContent: true } as const;

const checkXmlName = (name: string): string => {
  if (!XML_NAME.test(name) || /^xml/i.test(name)) {
    throw new DataInputError(`the key ${quoteText(name)} is not a valid XML element name`);
  }
  return name;
};

const escapeXml = (text: string): string => {
  if (XML_INVALID_CHAR.test(text) || findLoneSurrogate(text) !== undefined) {
    throw new DataInputError('a value contains a character that cannot be written in XML');
  }
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
    .replace(/\r/g, '&#13;');
};

/** One element of an array: an inner array becomes an element that holds `<item>` elements. */
const xmlArrayItem = (name: string, item: JsonValue, out: OutputBuffer): void => {
  if (!Array.isArray(item)) {
    xmlElement(name, item, out);
    return;
  }
  if (item.length === 0) {
    out.push(`<${name}/>`);
    return;
  }
  out.push(`<${name}>`);
  item.forEach((inner) => xmlArrayItem('item', inner, out));
  out.push(`</${name}>`);
};

/** An array value is written as the same element repeated (an empty array writes nothing). */
const xmlElement = (name: string, value: JsonValue, out: OutputBuffer): void => {
  if (Array.isArray(value)) {
    value.forEach((item) => xmlArrayItem(name, item, out));
    return;
  }
  if (value === null) {
    out.push(`<${name}/>`);
    return;
  }
  if (isJsonObject(value)) {
    const entries = Object.entries(value);
    if (entries.length === 0) {
      out.push(`<${name}/>`);
      return;
    }
    out.push(`<${name}>`);
    entries.forEach(([key, item]) => xmlElement(checkXmlName(key), item, out));
    out.push(`</${name}>`);
    return;
  }
  out.push(`<${name}>${escapeXml(String(value))}</${name}>`);
};

/**
 * An object with exactly one key (whose value is not an array) becomes that element; anything
 * else is wrapped in `<root>` (arrays at the top level become `<item>` elements).
 */
export const toXml = (value: JsonValue): string => {
  const out = new OutputBuffer();
  const keys = isJsonObject(value) ? Object.keys(value) : [];
  if (isJsonObject(value) && keys.length === 1 && !Array.isArray(value[keys[0]])) {
    xmlElement(checkXmlName(keys[0]), value[keys[0]], out);
  } else if (Array.isArray(value)) {
    xmlArrayItem('root', value, out);
  } else {
    xmlElement('root', value, out);
  }
  const xml = out.join('');
  try {
    return xmlFormat(xml, { ...XML_FORMAT_OPTIONS });
  } catch {
    throw new DataInputError('the XML could not be formatted');
  }
};

// ---------------------------------------------------------------------------------------------
// DATA-005 TOML
// ---------------------------------------------------------------------------------------------

const TOML_BARE_KEY = /^[A-Za-z0-9_-]+$/;

const tomlString = (text: string): string => {
  if (findLoneSurrogate(text) !== undefined) {
    throw new DataInputError('a string contains a lone surrogate and cannot be written in TOML');
  }
  let result = '"';
  for (const ch of text) {
    switch (ch) {
      case '"': result += '\\"'; break;
      case '\\': result += '\\\\'; break;
      case '\b': result += '\\b'; break;
      case '\t': result += '\\t'; break;
      case '\n': result += '\\n'; break;
      case '\f': result += '\\f'; break;
      case '\r': result += '\\r'; break;
      default: {
        const code = ch.codePointAt(0)!;
        result += code < 0x20 || code === 0x7f ? `\\u${code.toString(16).toUpperCase().padStart(4, '0')}` : ch;
      }
    }
  }
  return `${result}"`;
};

const tomlKey = (key: string): string => (TOML_BARE_KEY.test(key) ? key : tomlString(key));

const tomlNumber = (value: number): string => {
  if (Number.isSafeInteger(value)) {
    return String(value);
  }
  const text = String(value);
  return /[.eE]/.test(text) ? text : `${text}.0`;
};

const tomlInline = (value: JsonValue, path: string[]): string => {
  if (value === null) {
    throw new DataInputError(`TOML has no null (at ${describePath(path)})`);
  }
  if (typeof value === 'string') {
    return tomlString(value);
  }
  if (typeof value === 'number') {
    return tomlNumber(value);
  }
  if (typeof value === 'boolean') {
    return String(value);
  }
  if (Array.isArray(value)) {
    return value.length === 0 ? '[]' : `[${value.map((item, index) => tomlInline(item, [...path, `[${index}]`])).join(', ')}]`;
  }
  const entries = Object.entries(value);
  return entries.length === 0 ? '{}' : `{ ${entries.map(([key, item]) => `${tomlKey(key)} = ${tomlInline(item, [...path, key])}`).join(', ')} }`;
};

const isTableArray = (value: JsonValue): value is JsonObject[] =>
  Array.isArray(value) && value.length > 0 && value.every(isJsonObject);

const writeTomlTable = (table: JsonObject, path: string[], header: string | undefined, out: OutputBuffer): void => {
  const entries = Object.entries(table);
  const simple = entries.filter(([, item]) => !isJsonObject(item) && !isTableArray(item));
  const nested = entries.filter(([, item]) => isJsonObject(item) || isTableArray(item));
  // A table with only sub-tables needs no header of its own (it is created implicitly).
  if (header !== undefined && (simple.length > 0 || nested.length === 0 || header.startsWith('[['))) {
    out.push(header);
  }
  simple.forEach(([key, item]) => out.push(`${tomlKey(key)} = ${tomlInline(item, [...path, key])}`));
  nested.forEach(([key, item]) => {
    const childPath = [...path, key];
    const dotted = childPath.map(tomlKey).join('.');
    if (isTableArray(item)) {
      item.forEach((element) => writeTomlTable(element, childPath, `[[${dotted}]]`, out));
    } else {
      writeTomlTable(item as JsonObject, childPath, `[${dotted}]`, out);
    }
  });
};

export const toToml = (value: JsonValue): string => {
  const object = requireObject(value, 'Convert JSON to TOML');
  const out = new OutputBuffer();
  writeTomlTable(object, [], undefined, out);
  // A blank line before every table header except at the very beginning.
  return out.join('\n').replace(/\n(?=\[)/g, '\n\n');
};

// ---------------------------------------------------------------------------------------------
// DATA-007 INI
// ---------------------------------------------------------------------------------------------

const INI_BAD_KEY = /[=[\];#\r\n]/;

const iniValue = (key: string, value: JsonValue, path: string[]): string => {
  if (!isScalar(value)) {
    throw new DataInputError(`${describePath([...path, key])} is nested too deeply or is an array (INI supports 2 levels of objects and no arrays)`);
  }
  const text = scalarText(value);
  if (/[\r\n]/.test(text)) {
    throw new DataInputError(`the value of ${describePath([...path, key])} contains a line break`);
  }
  const needsQuotes = text !== text.trim() || /[;#]/.test(text)
    || (text.length >= 2 && (text[0] === '"' || text[0] === "'") && text[text.length - 1] === text[0]);
  return needsQuotes ? `"${text}"` : text;
};

const iniKey = (key: string): string => {
  if (key === '' || key !== key.trim() || INI_BAD_KEY.test(key)) {
    throw new DataInputError(`the key ${quoteText(key)} cannot be used in INI (it must not be empty or contain = [ ] ; # or line breaks)`);
  }
  return key;
};

export const toIni = (value: JsonValue): string => {
  const object = requireObject(value, 'Convert JSON to INI');
  const out = new OutputBuffer();
  const entries = Object.entries(object);
  entries.filter(([, item]) => !isJsonObject(item)).forEach(([key, item]) => out.push(`${iniKey(key)}=${iniValue(key, item, [])}`));
  entries.filter(([, item]) => isJsonObject(item)).forEach(([section, item]) => {
    out.push(`[${iniKey(section)}]`);
    Object.entries(item as JsonObject).forEach(([key, inner]) => out.push(`${iniKey(key)}=${iniValue(key, inner, [section])}`));
  });
  return out.join('\n').replace(/\n(?=\[)/g, '\n\n');
};

// ---------------------------------------------------------------------------------------------
// DATA-009 .properties
// ---------------------------------------------------------------------------------------------

const escapePropertiesText = (text: string, isKey: boolean): string => {
  let result = '';
  let index = 0;
  for (const ch of text) {
    switch (ch) {
      case '\\': result += '\\\\'; break;
      case '\t': result += '\\t'; break;
      case '\n': result += '\\n'; break;
      case '\r': result += '\\r'; break;
      case '\f': result += '\\f'; break;
      case ' ':
        result += isKey || index === 0 ? '\\ ' : ' ';
        break;
      case ':': case '=': case '#': case '!':
        result += isKey ? `\\${ch}` : ch;
        break;
      default: {
        const code = ch.codePointAt(0)!;
        result += code < 0x20 || code === 0x7f ? `\\u${code.toString(16).toUpperCase().padStart(4, '0')}` : ch;
      }
    }
    index++;
  }
  return result;
};

export const toProperties = (value: JsonValue): string => {
  const object = requireObject(value, 'Convert JSON to .properties');
  const out = new OutputBuffer();
  const visit = (item: JsonValue, key: string): void => {
    if (Array.isArray(item)) {
      item.forEach((element, index) => {
        const before = out.count;
        visit(element, `${key}[${index}]`);
        // An element that writes no line (an empty object / array) would shift the indexes of
        // the elements after it when read back, so it cannot be represented.
        if (out.count === before) {
          throw new DataInputError(`the element ${key}[${index}] is an empty object or array, which .properties cannot represent inside an array`);
        }
      });
      return;
    }
    if (isJsonObject(item)) {
      Object.entries(item).forEach(([name, inner]) => visit(inner, `${key}.${propertyName(name)}`));
      return;
    }
    out.push(`${key}=${escapePropertiesText(scalarText(item), false)}`);
  };
  const propertyName = (name: string): string => {
    if (name === '' || /[.[\]]/.test(name)) {
      throw new DataInputError(`the key ${quoteText(name)} cannot be used in .properties (it must not be empty or contain ".", "[" or "]")`);
    }
    return escapePropertiesText(name, true);
  };
  Object.entries(object).forEach(([name, item]) => visit(item, propertyName(name)));
  return out.join('\n');
};

// ---------------------------------------------------------------------------------------------
// DATA-027 JavaScript object literal
// ---------------------------------------------------------------------------------------------

const jsString = (text: string): string => {
  let result = "'";
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    const code = ch.charCodeAt(0);
    switch (ch) {
      case "'": result += "\\'"; break;
      case '\\': result += '\\\\'; break;
      case '\n': result += '\\n'; break;
      case '\r': result += '\\r'; break;
      case '\t': result += '\\t'; break;
      case '\b': result += '\\b'; break;
      case '\f': result += '\\f'; break;
      case '\v': result += '\\v'; break;
      default:
        if (code < 0x20 || code === 0x7f) {
          result += `\\x${code.toString(16).padStart(2, '0')}`;
        } else if (isSurrogatePairAt(text, i)) {
          // A surrogate pair is kept as it is.
          result += ch + text[i + 1];
          i++;
        } else if (code === 0x2028 || code === 0x2029 || (code >= 0xd800 && code <= 0xdfff)) {
          // Line separators and lone surrogates are escaped.
          result += `\\u${code.toString(16)}`;
        } else {
          result += ch;
        }
    }
  }
  return `${result}'`;
};

/**
 * `__proto__: value` (quoted or not) in an object literal sets the prototype instead of creating a
 * property, so that key is written as the computed name `['__proto__']` (DATA-028 reads it back).
 */
const jsKey = (key: string): string => {
  if (key === '__proto__') {
    return "['__proto__']";
  }
  return IDENTIFIER.test(key) ? key : jsString(key);
};

/**
 * Writes the literal piece by piece into `out`, so a result longer than MAX_OUTPUT_LENGTH (deep
 * nesting multiplies the indentation) stops early instead of being built first.
 */
const writeJsValue = (value: JsonValue, indent: string | undefined, level: number, out: OutputBuffer): void => {
  if (typeof value === 'string') {
    out.push(jsString(value));
    return;
  }
  if (!Array.isArray(value) && !isJsonObject(value)) {
    out.push(JSON.stringify(value));
    return;
  }
  const isArray = Array.isArray(value);
  const entries: [string | undefined, JsonValue][] = isArray
    ? value.map((item): [undefined, JsonValue] => [undefined, item])
    : Object.entries(value);
  const [open, close] = isArray ? ['[', ']'] : ['{', '}'];
  if (entries.length === 0) {
    out.push(`${open}${close}`);
    return;
  }
  const inner = indent === undefined ? '' : indent.repeat(level + 1);
  out.push(indent !== undefined ? `${open}\n` : isArray ? '[' : '{ ');
  entries.forEach(([key, item], index) => {
    if (index > 0) {
      out.push(indent === undefined ? ', ' : ',\n');
    }
    out.push(key === undefined ? inner : `${inner}${jsKey(key)}: `);
    writeJsValue(item, indent, level + 1, out);
  });
  out.push(indent !== undefined ? `\n${indent.repeat(level)}${close}` : isArray ? ']' : ' }');
};

/** One line in, one line out (`{ a: 1, 'b-c': 2 }`); a multi-line input is indented with 2 spaces. */
export const toJsObject = (value: JsonValue, multiLine: boolean): string => {
  const out = new OutputBuffer();
  writeJsValue(value, multiLine ? '  ' : undefined, 0, out);
  return out.join('');
};
