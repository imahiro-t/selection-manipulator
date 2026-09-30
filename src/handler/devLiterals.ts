/**
 * DEV-001..011: string literals of several languages, escaping and quoting (vscode-independent).
 *
 * Every function only builds text: nothing is evaluated, run in a shell or sent anywhere. All
 * regular expressions are constants without nested quantifiers, and every function is linear in
 * the length of its input.
 */
import { DevInputError, splitDevLines } from './devCommon';
import { sqlUnsafeCharacterReason } from './sqlSafety';
import { writeCell } from './tableCsv';

const hex2 = (code: number): string => code.toString(16).padStart(2, '0');
const hex4 = (code: number): string => code.toString(16).padStart(4, '0');

/** A lone (unpaired) surrogate: it cannot be written to a UTF-8 file as it is. */
const LONE_SURROGATE = '[\\ud800-\\udbff](?![\\udc00-\\udfff])|(?<![\\ud800-\\udbff])[\\udc00-\\udfff]';

// ---------------------------------------------------------------------------------------------
// DEV-001 JavaScript single-quoted string
// ---------------------------------------------------------------------------------------------

const JS_ESCAPES: Readonly<Record<string, string>> = {
  '\\': '\\\\',
  '\'': '\\\'',
  '\n': '\\n',
  '\r': '\\r',
  '\t': '\\t',
};

const JS_SPECIAL = new RegExp(`[\\\\'\\u0000-\\u001f\\u007f\\u2028\\u2029]|${LONE_SURROGATE}`, 'g');

/** Escapes `\`, `'`, the control characters, U+2028 / U+2029 and lone surrogates for a JS string. */
const escapeJsSingleQuoted = (text: string): string =>
  text.replace(JS_SPECIAL, (ch) => {
    const known = JS_ESCAPES[ch];
    if (known !== undefined) {
      return known;
    }
    const code = ch.charCodeAt(0);
    return code <= 0xff ? `\\x${hex2(code)}` : `\\u${hex4(code)}`;
  });

/**
 * DEV-001: a JavaScript string literal in single quotes. `\` `'` LF CR TAB get their short escapes,
 * the other C0 controls and DEL `\xhh`, U+2028 / U+2029 and lone surrogates `\uhhhh`.
 */
export const toJsString = (text: string): string => `'${escapeJsSingleQuoted(text)}'`;

// ---------------------------------------------------------------------------------------------
// DEV-002 Python string (like repr of a str)
// ---------------------------------------------------------------------------------------------

const PY_SPECIAL = new RegExp(`[\\\\'"\\u0000-\\u001f\\u007f-\\u009f]|${LONE_SURROGATE}`, 'g');

/**
 * DEV-002: a Python 3 string literal chosen like `repr(str)`: in `'…'`, or in `"…"` when the text
 * holds `'` but no `"`. `\`, the chosen quote, `\n` `\r` `\t` and the other control characters
 * (C0, DEL, C1: `\xhh`; lone surrogates: `\uhhhh`) are escaped; other characters stay as they are.
 */
export const toPythonString = (text: string): string => {
  const quote = text.includes('\'') && !text.includes('"') ? '"' : '\'';
  const body = text.replace(PY_SPECIAL, (ch) => {
    switch (ch) {
      case '\\':
        return '\\\\';
      case '\'':
      case '"':
        return ch === quote ? `\\${ch}` : ch;
      case '\n':
        return '\\n';
      case '\r':
        return '\\r';
      case '\t':
        return '\\t';
      default: {
        const code = ch.charCodeAt(0);
        return code <= 0xff ? `\\x${hex2(code)}` : `\\u${hex4(code)}`;
      }
    }
  });
  return `${quote}${body}${quote}`;
};

// ---------------------------------------------------------------------------------------------
// DEV-003 Java / C string concatenation
// ---------------------------------------------------------------------------------------------

const JAVA_SPECIAL = /[\\"\u0000-\u001f\u007f]/g;

/**
 * Escapes one line for a Java / C string: `\` `"` TAB BS FF get their short escapes, the other
 * controls a three-digit octal escape (never `\uXXXX`: Java expands those before parsing, so
 * `\u000a` would end the literal).
 */
const escapeJavaLine = (line: string): string =>
  line.replace(JAVA_SPECIAL, (ch) => {
    switch (ch) {
      case '\\':
        return '\\\\';
      case '"':
        return '\\"';
      case '\t':
        return '\\t';
      case '\b':
        return '\\b';
      case '\f':
        return '\\f';
      default:
        return `\\${ch.charCodeAt(0).toString(8).padStart(3, '0')}`;
    }
  });

/**
 * DEV-003: one string literal per line, joined with ` +` and the document's line break:
 * `"line\n" +` for every line but the last, `"last"` for the last. Any line break (CRLF, LF, CR)
 * ends a line and is written `\n` in the literal. A text that ends with a line break ends with
 * `"…\n"` (no empty `""` is added).
 */
export const toJavaString = (text: string, eol: string): string => {
  const lines = splitDevLines(text);
  if (lines.length > 1 && lines[lines.length - 1].text === '') {
    lines.pop();
  }
  return lines
    .map(({ text: line, lineBreak }) => `"${escapeJavaLine(line)}${lineBreak === '' ? '' : '\\n'}"`)
    .join(` +${eol}`);
};

// ---------------------------------------------------------------------------------------------
// DEV-004 Go raw string / DEV-005 JavaScript template literal
// ---------------------------------------------------------------------------------------------

/**
 * DEV-004: a Go raw string literal. A backquote cannot appear in one, so it is concatenated as
 * `` ` + "`" + ` ``. (Go drops carriage returns from raw strings.)
 */
export const toGoRawString = (text: string): string => `\`${text.replace(/`/g, '` + "`" + `')}\``;

/** DEV-005 (and DEV-027): escapes `\`, `` ` `` and `${` for the inside of a template literal. */
export const escapeTemplateLiteral = (text: string): string => text.replace(/\\|`|\$\{/g, (match) => `\\${match}`);

/** DEV-005: a JavaScript template literal (line breaks stay as they are). */
export const toTemplateLiteral = (text: string): string => `\`${escapeTemplateLiteral(text)}\``;

// ---------------------------------------------------------------------------------------------
// DEV-006 regex / DEV-007 SQL / DEV-008 POSIX shell / DEV-009 PowerShell / DEV-010 CSV
// ---------------------------------------------------------------------------------------------

/**
 * DEV-006: `\` before every character that is special in a regular expression:
 * `\ ^ $ . * + ? ( ) [ ] { } | /`. All of them are identity escapes that are valid with the `u`
 * flag too (`-` is not escaped: `\-` is an error outside a class with the `u` flag).
 */
export const escapeRegex = (text: string): string => text.replace(/[\\^$.*+?()[\]{}|/]/g, '\\$&');

/**
 * DEV-007: `'` doubled for the inside of a standard SQL string literal (no quotes added). Text
 * with `\` or `¥` is an error (see sqlUnsafeCharacterReason), like TABLE-012 and WRAP-006: in
 * MySQL's default mode `\'` would be read as an escaped quote and the text could end the literal.
 */
export const escapeSql = (text: string): string => {
  const unsafe = sqlUnsafeCharacterReason(text);
  if (unsafe !== undefined) {
    throw new DevInputError(`the text contains ${unsafe}`);
  }
  return text.replace(/'/g, '\'\'');
};

/** DEV-008: in single quotes for a POSIX shell; every `'` becomes `'\''`. */
export const quotePosixShell = (text: string): string => `'${text.replace(/'/g, '\'\\\'\'')}'`;

/**
 * DEV-009: in single quotes for PowerShell. PowerShell also takes the curly single quotes
 * U+2018..U+201B as quotes, so they are doubled like `'` (otherwise they would end the string).
 */
export const quotePowerShell = (text: string): string => `'${text.replace(/['‘-‛]/g, '$&$&')}'`;

/**
 * DEV-010: the text as one CSV field (RFC 4180), written like the TABLE commands write a cell:
 * quoted with `"` doubled only when it holds `,` `"` CR or LF, otherwise unchanged.
 */
export const escapeCsvField = (text: string): string => writeCell(text, ',');

// ---------------------------------------------------------------------------------------------
// DEV-011 Markdown
// ---------------------------------------------------------------------------------------------

/** Characters that are always escaped. */
const MARKDOWN_ALWAYS = new Set(['\\', '`', '*', '_', '[', ']', '<', '>', '#', '|', '~']);
/** Characters escaped when they are the first character of a line (after the indentation). */
const MARKDOWN_LINE_START = new Set(['+', '-', '=']);
/** A character reference at the given position (sticky): `&name;`, `&#123;`, `&#x1F;`. */
const CHARACTER_REFERENCE = /&(?:[A-Za-z][A-Za-z0-9]{0,31}|#[0-9]{1,7}|#[xX][0-9A-Fa-f]{1,6});/y;

const isDigit = (ch: string): boolean => ch >= '0' && ch <= '9';

/**
 * DEV-011: escapes the characters Markdown would read as markup with `\`: always
 * `` \ ` * _ [ ] < > # | ~ ``; `+` `-` `=` as the first character of a line (after spaces and
 * tabs: list markers, setext underlines); `.` / `)` after the digits a line starts with (ordered
 * lists); `&` only when it starts a character reference.
 */
export const escapeMarkdown = (text: string): string => {
  const out: string[] = [];
  let lineStart = true;
  let i = 0;
  while (i < text.length) {
    const ch = text[i];
    if (ch === '\n' || ch === '\r') {
      out.push(ch);
      lineStart = true;
      i++;
      continue;
    }
    if (lineStart && (ch === ' ' || ch === '\t')) {
      out.push(ch);
      i++;
      continue;
    }
    if (lineStart) {
      lineStart = false;
      if (MARKDOWN_LINE_START.has(ch)) {
        out.push('\\', ch);
        i++;
        continue;
      }
      if (isDigit(ch)) {
        let end = i;
        while (end < text.length && isDigit(text[end])) {
          end++;
        }
        out.push(text.slice(i, end));
        i = end;
        if (text[i] === '.' || text[i] === ')') {
          out.push('\\', text[i]);
          i++;
        }
        continue;
      }
    }
    if (MARKDOWN_ALWAYS.has(ch)) {
      out.push('\\', ch);
    } else if (ch === '&') {
      CHARACTER_REFERENCE.lastIndex = i;
      out.push(CHARACTER_REFERENCE.test(text) ? '\\&' : '&');
    } else {
      out.push(ch);
    }
    i++;
  }
  return out.join('');
};
