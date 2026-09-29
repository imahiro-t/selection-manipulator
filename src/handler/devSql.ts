/**
 * DEV-015..017: format, minify and uppercase the keywords of SQL (vscode-independent).
 *
 * The SQL is only read by a hand-written linear tokenizer and rewritten as text: it is never run,
 * sent anywhere or evaluated. Literals, quoted identifiers and kept comments are copied as they
 * are. The parentheses are nested at most DEV_MAX_NESTING deep when formatting.
 *
 * Supported lexical forms: `'…'` strings (`''` inside), `"…"` / `` `…` `` / `[…]` quoted
 * identifiers (with the closing character doubled inside), `--` line comments and `/* … *\/`
 * block comments. Not supported (documented): PostgreSQL `$$` / `E'…'` strings, MySQL `#`
 * comments and backslash escapes.
 */
import { DEV_MAX_NESTING, DevInputError, DevOutputBuffer } from './devCommon';

type SqlTokenType =
  | 'ws' | 'line-comment' | 'block-comment' | 'string' | 'quoted' | 'number' | 'word'
  | 'op' | 'open' | 'close' | 'comma' | 'semicolon' | 'dot';

interface SqlToken {
  type: SqlTokenType;
  text: string;
}

/**
 * Words that are uppercased: the words that make up statements and clauses, the operators written
 * as words and the common type names (not function names).
 */
const SQL_KEYWORDS = new Set([
  'ADD', 'ALL', 'ALTER', 'AND', 'ANY', 'AS', 'ASC', 'AUTO_INCREMENT', 'BEGIN', 'BETWEEN', 'BIGINT',
  'BINARY', 'BLOB', 'BOOLEAN', 'BY', 'CASCADE', 'CASE', 'CAST', 'CHAR', 'CHECK', 'CLOB', 'COLLATE',
  'COLUMN', 'COMMIT', 'CONFLICT', 'CONSTRAINT', 'CREATE', 'CROSS', 'DATABASE', 'DATE', 'DECIMAL',
  'DECLARE', 'DEFAULT', 'DELETE', 'DESC', 'DISTINCT', 'DO', 'DOUBLE', 'DROP', 'ELSE', 'END', 'ESCAPE',
  'EXCEPT', 'EXEC', 'EXECUTE', 'EXISTS', 'FALSE', 'FETCH', 'FIRST', 'FLOAT', 'FOR', 'FOREIGN', 'FROM',
  'FULL', 'FUNCTION', 'GRANT', 'GROUP', 'HAVING', 'IF', 'ILIKE', 'IN', 'INDEX', 'INNER', 'INSERT',
  'INT', 'INTEGER', 'INTERSECT', 'INTERVAL', 'INTO', 'IS', 'JOIN', 'KEY', 'LATERAL', 'LEFT', 'LIKE',
  'LIMIT', 'MATCHED', 'MERGE', 'NATURAL', 'NEXT', 'NOT', 'NOTHING', 'NULL', 'NULLS', 'NUMERIC',
  'OFFSET', 'ON', 'ONLY', 'OR', 'ORDER', 'OUTER', 'OVER', 'PARTITION', 'PRECISION', 'PRIMARY',
  'PROCEDURE', 'REAL', 'RECURSIVE', 'REFERENCES', 'REPLACE', 'RETURNING', 'RETURNS', 'REVOKE', 'RIGHT',
  'ROLLBACK', 'ROW', 'ROWS', 'SCHEMA', 'SELECT', 'SERIAL', 'SET', 'SMALLINT', 'SOME', 'TABLE', 'TEMP',
  'TEMPORARY', 'TEXT', 'THEN', 'TIME', 'TIMESTAMP', 'TOP', 'TRANSACTION', 'TRIGGER', 'TRUE', 'TRUNCATE',
  'UNION', 'UNIQUE', 'UPDATE', 'USING', 'VALUES', 'VARBINARY', 'VARCHAR', 'VIEW', 'WHEN', 'WHERE',
  'WINDOW', 'WITH', 'ZONE',
]);

/** Type names and keywords called like functions: `VARCHAR(255)`, `CAST(…)` keep their `(`. */
const SQL_CALL_KEYWORDS = new Set([
  'BIGINT', 'BINARY', 'CAST', 'CHAR', 'DECIMAL', 'FLOAT', 'IF', 'INT', 'INTEGER', 'LEFT', 'NUMERIC',
  'REPLACE', 'RIGHT', 'SMALLINT', 'TIME', 'TIMESTAMP', 'VARBINARY', 'VARCHAR',
]);

/** Operators of more than one character (longest first). */
const SQL_OPERATORS = ['->>', '<=>', '->', '<=', '>=', '<>', '!=', '==', '||', '::', ':=', '=>', '<<', '>>', '&&'];

/** Comparison and assignment operators: formatted with a space on both sides. */
const SQL_COMPARISONS = new Set(['=', '<', '>', '<=', '>=', '<>', '!=', '==', '<=>', ':=', '=>']);

const isSpace = (code: number): boolean => code === 0x20 || (code >= 0x09 && code <= 0x0d);
const isDigitCode = (code: number): boolean => code >= 0x30 && code <= 0x39;
const isLetterCode = (code: number): boolean => (code >= 0x41 && code <= 0x5a) || (code >= 0x61 && code <= 0x7a);
/** Characters of a word: letters, digits, `_ $ @ #` and every non-ASCII character. */
const isWordCode = (code: number): boolean =>
  isLetterCode(code) || isDigitCode(code) || code === 0x5f || code === 0x24 || code === 0x40 || code === 0x23 || code >= 0x80;

/** The index after the closing `close` of a quoted token starting at `start` (`close` doubled inside). */
const endOfQuoted = (text: string, start: number, close: string, what: string): number => {
  let from = start + 1;
  for (; ;) {
    const end = text.indexOf(close, from);
    if (end < 0) {
      throw new DevInputError(`${what} is not closed`);
    }
    if (text[end + 1] === close) {
      from = end + 2;
      continue;
    }
    return end + 1;
  }
};

/** Splits SQL into tokens (linear). Unclosed strings, quoted identifiers and comments are errors. */
export const tokenizeSql = (text: string): SqlToken[] => {
  const tokens: SqlToken[] = [];
  let i = 0;
  const push = (type: SqlTokenType, end: number) => {
    tokens.push({ type, text: text.slice(i, end) });
    i = end;
  };
  while (i < text.length) {
    const code = text.charCodeAt(i);
    const ch = text[i];
    if (isSpace(code)) {
      let end = i + 1;
      while (end < text.length && isSpace(text.charCodeAt(end))) {
        end++;
      }
      push('ws', end);
    } else if (ch === '-' && text[i + 1] === '-') {
      let end = i + 2;
      while (end < text.length && text[end] !== '\n' && text[end] !== '\r') {
        end++;
      }
      push('line-comment', end);
    } else if (ch === '/' && text[i + 1] === '*') {
      const end = text.indexOf('*/', i + 2);
      if (end < 0) {
        throw new DevInputError('a /* comment is not closed');
      }
      push('block-comment', end + 2);
    } else if (ch === '\'') {
      push('string', endOfQuoted(text, i, '\'', 'a \' string'));
    } else if (ch === '"') {
      push('quoted', endOfQuoted(text, i, '"', 'a " quoted identifier'));
    } else if (ch === '`') {
      push('quoted', endOfQuoted(text, i, '`', 'a ` quoted identifier'));
    } else if (ch === '[') {
      push('quoted', endOfQuoted(text, i, ']', 'a [ quoted identifier'));
    } else if (isDigitCode(code) || (ch === '.' && isDigitCode(text.charCodeAt(i + 1)))) {
      let end = i + 1;
      while (end < text.length) {
        const c = text.charCodeAt(end);
        if (isWordCode(c) || c === 0x2e) {
          end++;
        } else if ((c === 0x2b || c === 0x2d) && (text[end - 1] === 'e' || text[end - 1] === 'E') && isDigitCode(text.charCodeAt(end + 1))) {
          end += 2;
        } else {
          break;
        }
      }
      push('number', end);
    } else if (isWordCode(code)) {
      let end = i + 1;
      while (end < text.length && isWordCode(text.charCodeAt(end))) {
        end++;
      }
      push('word', end);
    } else if (ch === '(') {
      push('open', i + 1);
    } else if (ch === ')') {
      push('close', i + 1);
    } else if (ch === ',') {
      push('comma', i + 1);
    } else if (ch === ';') {
      push('semicolon', i + 1);
    } else if (ch === '.') {
      push('dot', i + 1);
    } else {
      const operator = SQL_OPERATORS.find((candidate) => text.startsWith(candidate, i));
      // A lone surrogate or any other character is one operator token of one code point.
      push('op', i + (operator?.length ?? (code >= 0xd800 && code <= 0xdbff && i + 1 < text.length ? 2 : 1)));
    }
  }
  return tokens;
};

const isComment = (token: SqlToken): boolean => token.type === 'line-comment' || token.type === 'block-comment';
const isInsignificant = (token: SqlToken): boolean => token.type === 'ws' || isComment(token);

/**
 * Which words are keywords: a listed word that is not next to a `.` (`t.date`, `date.x` are
 * names). Returns, for every token, the uppercased keyword or undefined.
 */
const keywordsOf = (tokens: readonly SqlToken[]): (string | undefined)[] => {
  const result: (string | undefined)[] = new Array(tokens.length).fill(undefined);
  let previous: SqlToken | undefined;
  const nextSignificant: (SqlToken | undefined)[] = new Array(tokens.length).fill(undefined);
  let next: SqlToken | undefined;
  for (let i = tokens.length - 1; i >= 0; i--) {
    nextSignificant[i] = next;
    if (!isInsignificant(tokens[i])) {
      next = tokens[i];
    }
  }
  tokens.forEach((token, i) => {
    if (token.type === 'word') {
      const upper = token.text.toUpperCase();
      if (SQL_KEYWORDS.has(upper) && previous?.type !== 'dot' && nextSignificant[i]?.type !== 'dot') {
        result[i] = upper;
      }
    }
    if (!isInsignificant(token)) {
      previous = token;
    }
  });
  return result;
};

// ---------------------------------------------------------------------------------------------
// DEV-017 Uppercase keywords
// ---------------------------------------------------------------------------------------------

/**
 * DEV-017: the keywords outside strings, quoted identifiers and comments in uppercase; nothing
 * else changes.
 */
export const sqlUppercaseKeywords = (text: string): string => {
  const tokens = tokenizeSql(text);
  const keywords = keywordsOf(tokens);
  return tokens.map((token, i) => keywords[i] ?? token.text).join('');
};

// ---------------------------------------------------------------------------------------------
// DEV-016 Minify
// ---------------------------------------------------------------------------------------------

/** Comments that mean something and are kept: optimizer hints and MySQL executable comments. */
const isKeptComment = (token: SqlToken): boolean =>
  token.type === 'block-comment' && (token.text.startsWith('/*+') || token.text.startsWith('/*!'));

/**
 * DEV-016: comments removed (each one becomes a space, as SQL reads a comment as white space;
 * `/*+ … *\/` hints and `/*! … *\/` are kept), runs of white space made one space, the space
 * after `(` and before `)` `,` `;` removed, and the ends trimmed. Literals are not touched.
 */
export const sqlMinify = (text: string): string => {
  const SPACE: SqlToken = { type: 'ws', text: ' ' };
  const tokens: SqlToken[] = [];
  for (const token of tokenizeSql(text)) {
    const replaced = token.type === 'ws' || (isComment(token) && !isKeptComment(token)) ? SPACE : token;
    if (replaced === SPACE && tokens[tokens.length - 1] === SPACE) {
      continue;
    }
    tokens.push(replaced);
  }
  const out: string[] = [];
  tokens.forEach((token, i) => {
    if (token === SPACE) {
      const before = tokens[i - 1];
      const after = tokens[i + 1];
      if (before === undefined || after === undefined || before.type === 'open'
        || after.type === 'close' || after.type === 'comma' || after.type === 'semicolon') {
        return;
      }
    }
    out.push(token.text);
  });
  return out.join('');
};

// ---------------------------------------------------------------------------------------------
// DEV-015 Format
// ---------------------------------------------------------------------------------------------

/** Keywords that start a clause on a new line (in a query, not inside a function's parentheses). */
const CLAUSE_KEYWORDS = new Set([
  'SELECT', 'FROM', 'WHERE', 'HAVING', 'LIMIT', 'OFFSET', 'VALUES', 'SET', 'RETURNING', 'UNION',
  'INTERSECT', 'EXCEPT', 'INSERT', 'UPDATE', 'DELETE',
]);
/** Words that may start a join (`LEFT OUTER JOIN`). */
const JOIN_PREFIXES = new Set(['NATURAL', 'INNER', 'LEFT', 'RIGHT', 'FULL', 'CROSS', 'OUTER']);

/** A token of the formatter: a significant token with what came before it in the input. */
interface FormatToken extends SqlToken {
  /** The uppercased keyword, when the token is one. */
  keyword?: string;
  /** Whether white space or a comment came before it in the input. */
  spaced: boolean;
}

/** One level of parentheses (the statement itself is the outermost level). */
interface Level {
  /** A query (the statement or a `(SELECT …)` subquery): clauses start new lines. */
  query: boolean;
  /** Indentation of the clauses of this level. */
  indent: number;
  /** Indentation of the line the `(` was on (where the `)` of a subquery goes). */
  closeIndent: number;
  /** The clause being written (`WHERE`, `HAVING`, …). */
  clause?: string;
  /** An `AND` that belongs to `BETWEEN … AND …` is expected. */
  between: boolean;
}

/** Collects the lines of the formatted SQL. */
class SqlLines {
  private readonly lines: string[] = [];
  private current = '';
  private hasContent = false;
  private lineIndent = 0;

  /** Indentation of the current line. */
  get indent(): number {
    return this.lineIndent;
  }

  /** Starts a new line (nothing happens when the current line is still empty but the indent). */
  newLine(indent: number): void {
    if (this.hasContent) {
      this.lines.push(this.current);
    }
    this.current = ' '.repeat(indent);
    this.lineIndent = indent;
    this.hasContent = false;
  }

  blankLine(): void {
    this.newLine(0);
    if (this.lines.length > 0) {
      this.lines.push('');
    }
  }

  write(text: string, space: boolean): void {
    if (this.hasContent && space) {
      this.current += ' ';
    }
    this.current += text;
    this.hasContent = true;
  }

  finish(): string[] {
    this.newLine(0);
    return this.lines;
  }
}

const unbalanced = (): DevInputError => new DevInputError('the parentheses are not balanced');

/** Whether a space goes between `previous` and `token` on one line. */
const spaceBetween = (previous: FormatToken | undefined, token: FormatToken, beforePrevious: FormatToken | undefined): boolean => {
  if (previous === undefined) {
    return false;
  }
  if (token.type === 'close' || token.type === 'comma' || token.type === 'semicolon' || previous.type === 'open') {
    return false;
  }
  if (previous.type === 'dot' || token.type === 'dot' || previous.text === '::' || token.text === '::') {
    return false;
  }
  if (previous.type === 'comma' || isComment(previous) || isComment(token)) {
    return true;
  }
  if (token.type === 'open') {
    if (previous.keyword !== undefined) {
      return !SQL_CALL_KEYWORDS.has(previous.keyword);
    }
    // `INSERT INTO t (a, b)`, `CREATE TABLE t (…)`: the column list is not a call.
    return previous.type === 'op' || beforePrevious?.keyword === 'INTO' || beforePrevious?.keyword === 'TABLE';
  }
  if (SQL_COMPARISONS.has(previous.text) && previous.type === 'op') {
    return true;
  }
  if (SQL_COMPARISONS.has(token.text) && token.type === 'op') {
    return true;
  }
  if (previous.keyword !== undefined || token.keyword !== undefined) {
    return true;
  }
  if (previous.type === 'op' || token.type === 'op') {
    // `-1`, `a+b`, `a || b`: other operators keep the spacing of the input.
    return token.spaced;
  }
  if (previous.type === 'word' && token.type === 'string') {
    // `N'…'`, `X'…'` stay together.
    return token.spaced;
  }
  return true;
};

/**
 * DEV-015: a simple SQL formatter. Keywords are uppercased; the main clauses (`SELECT` `FROM`
 * `WHERE` `GROUP BY` `ORDER BY` `HAVING` `LIMIT` `OFFSET`, the joins, `UNION [ALL]` `INTERSECT`
 * `EXCEPT` `INSERT INTO` `VALUES` `UPDATE` `SET` `DELETE FROM` `RETURNING`) start new lines;
 * `AND` / `OR` of `WHERE` / `HAVING` start new lines indented by two spaces; comparison and
 * assignment operators get a space on both sides and commas a space after them; a `(SELECT …)`
 * subquery is indented one level deeper; statements are separated by a blank line after `;`.
 * Comments are kept (a line comment ends its line).
 */
export const sqlFormat = (text: string, eol: string, budget: number): string => {
  const raw = tokenizeSql(text);
  const keywords = keywordsOf(raw);
  const tokens: FormatToken[] = [];
  let spaced = false;
  raw.forEach((token, i) => {
    if (token.type === 'ws') {
      spaced = true;
      return;
    }
    tokens.push({
      type: token.type,
      text: token.type === 'line-comment' ? token.text.trimEnd() : keywords[i] ?? token.text,
      keyword: keywords[i],
      spaced,
    });
    spaced = isComment(token);
  });

  const lines = new SqlLines();
  const base = (): Level => ({ query: true, indent: 0, closeIndent: 0, between: false });
  let levels: Level[] = [base()];
  let previous: FormatToken | undefined;
  let beforePrevious: FormatToken | undefined;
  let pendingLine = false;
  let pendingStatement = false;
  const nextKeyword = (from: number): string | undefined => {
    for (let i = from; i < tokens.length; i++) {
      if (!isComment(tokens[i])) {
        return tokens[i].keyword;
      }
    }
    return undefined;
  };
  const write = (token: FormatToken) => {
    lines.write(token.text, spaceBetween(previous, token, beforePrevious));
    beforePrevious = previous;
    previous = token;
  };
  const breakLine = (indent: number) => {
    lines.newLine(indent);
    beforePrevious = undefined;
    previous = undefined;
  };

  tokens.forEach((token, i) => {
    let level = levels[levels.length - 1];
    if (pendingStatement) {
      lines.blankLine();
      breakLine(0);
      pendingStatement = false;
      pendingLine = false;
    } else if (pendingLine) {
      breakLine(level.clause === undefined ? level.indent : level.indent + 2);
      pendingLine = false;
    }
    const keyword = token.keyword;
    if (keyword !== undefined && level.query) {
      const before = previous?.keyword;
      let clause: string | undefined;
      if (CLAUSE_KEYWORDS.has(keyword)) {
        const inline = (keyword === 'FROM' && (before === 'DELETE' || before === 'DISTINCT'))
          || ((keyword === 'UPDATE' || keyword === 'DELETE') && (before === 'FOR' || before === 'DO' || before === 'ON'));
        clause = inline ? undefined : keyword;
      } else if ((keyword === 'GROUP' || keyword === 'ORDER') && nextKeyword(i + 1) === 'BY') {
        clause = `${keyword} BY`;
      } else if (keyword === 'JOIN' && !JOIN_PREFIXES.has(before ?? '')) {
        clause = 'JOIN';
      } else if (JOIN_PREFIXES.has(keyword) && !JOIN_PREFIXES.has(before ?? '')) {
        const second = nextKeyword(i + 1);
        if (second === 'JOIN' || (JOIN_PREFIXES.has(second ?? '') && nextKeyword(i + 2) === 'JOIN')) {
          clause = 'JOIN';
        }
      }
      if (clause !== undefined) {
        breakLine(level.indent);
        level.clause = clause;
        level.between = false;
      } else if ((keyword === 'AND' || keyword === 'OR') && (level.clause === 'WHERE' || level.clause === 'HAVING')) {
        if (keyword === 'AND' && level.between) {
          level.between = false;
        } else {
          breakLine(level.indent + 2);
        }
      } else if (keyword === 'BETWEEN') {
        level.between = true;
      }
    }
    if (token.type === 'open') {
      if (levels.length > DEV_MAX_NESTING) {
        throw new DevInputError(`the parentheses are nested deeper than ${DEV_MAX_NESTING} levels`);
      }
      const inner = nextKeyword(i + 1);
      const query = inner === 'SELECT' || inner === 'WITH';
      write(token);
      levels.push({ query, indent: query ? lines.indent + 2 : level.indent, closeIndent: lines.indent, between: false });
      return;
    }
    if (token.type === 'close') {
      if (levels.length === 1) {
        throw unbalanced();
      }
      levels.pop();
      if (level.query) {
        breakLine(level.closeIndent);
      }
      write(token);
      return;
    }
    write(token);
    if (token.type === 'line-comment') {
      pendingLine = true;
    } else if (token.type === 'semicolon') {
      if (levels.length > 1) {
        throw unbalanced();
      }
      levels = [base()];
      pendingStatement = true;
    }
  });
  if (levels.length > 1) {
    throw unbalanced();
  }
  const out = new DevOutputBuffer(budget);
  lines.finish().forEach((line, i) => {
    if (i > 0) {
      out.push(eol);
    }
    out.push(line);
  });
  return out.join();
};
