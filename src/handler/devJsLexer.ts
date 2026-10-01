/**
 * A small JavaScript / TypeScript lexer shared by DEV-023..025 and DEVX-013 (vscode-independent).
 *
 * It only splits the text into tokens (strings, template literals, comments, regular expression
 * literals, words, numbers, punctuators, spaces and line breaks) so that the commands can find the
 * code outside strings and comments. It never evaluates anything. The scan is linear in the length
 * of the text; template literals nested in `${…}` are followed with an explicit stack whose depth
 * is limited by DEV_MAX_NESTING. A template literal is one token by default; DEVX-013 asks for it
 * split into its string chunks and the tokens of the code in its `${…}` (`splitTemplates`).
 */
import { DEV_MAX_NESTING, DevInputError } from './devCommon';

export type JsTokenKind =
  | 'space'
  | 'newline'
  | 'comment'
  | 'string'
  | 'template'
  | 'regex'
  | 'word'
  | 'number'
  | 'punct';

export interface JsToken {
  kind: JsTokenKind;
  /** The source text of the token. */
  text: string;
  start: number;
  end: number;
}

/** Punctuators, longest first so that the longest one at a position wins. */
const PUNCTUATORS = [
  '>>>=', '...', '===', '!==', '**=', '<<=', '>>=', '>>>', '&&=', '||=', '??=',
  '=>', '==', '!=', '<=', '>=', '&&', '||', '??', '?.', '++', '--', '+=', '-=', '*=', '/=', '%=',
  '&=', '|=', '^=', '**', '<<', '>>',
  '{', '}', '(', ')', '[', ']', ';', ',', '<', '>', '+', '-', '*', '/', '%', '&', '|', '^', '!',
  '~', '?', ':', '=', '.', '@', '#',
];

/** Words after which a `/` starts a regular expression rather than a division. */
const REGEX_AFTER_WORDS = new Set([
  'return', 'typeof', 'instanceof', 'in', 'of', 'new', 'delete', 'void', 'throw', 'case', 'do',
  'else', 'yield', 'await',
]);

/** LF, CR, U+2028 and U+2029: the line terminators of JavaScript. */
export const isLineTerminator = (code: number): boolean => code === 0x0a || code === 0x0d || code === 0x2028 || code === 0x2029;

const isSpace = (code: number): boolean =>
  code === 0x20 || code === 0x09 || code === 0x0b || code === 0x0c || code === 0xa0 || code === 0xfeff
  || code === 0x1680 || (code >= 0x2000 && code <= 0x200a) || code === 0x202f || code === 0x205f || code === 0x3000;

const isDigit = (code: number): boolean => code >= 0x30 && code <= 0x39;

/** A character of an identifier (ASCII letters, digits, `_`, `$`, `\` escapes and any non-ASCII). */
const isWordChar = (code: number): boolean =>
  (code >= 0x61 && code <= 0x7a) || (code >= 0x41 && code <= 0x5a) || isDigit(code)
  || code === 0x5f || code === 0x24 || code === 0x5c || (code >= 0x80 && !isSpace(code) && !isLineTerminator(code));

/** Whether a `/` after `previous` (the last token that is not a space, line break or comment) starts a regex. */
const regexAllowedAfter = (previous: JsToken | undefined): boolean => {
  if (previous === undefined) {
    return true;
  }
  switch (previous.kind) {
    case 'word':
      return REGEX_AFTER_WORDS.has(previous.text);
    case 'punct':
      return previous.text !== ')' && previous.text !== ']' && previous.text !== '}'
        && previous.text !== '++' && previous.text !== '--';
    default:
      return false;
  }
};

const notClosed = (what: string): DevInputError => new DevInputError(`${what} is not closed`);

/** The end of the quoted string that starts at `start` (`'` or `"`). */
const scanString = (text: string, start: number): number => {
  const quote = text.charCodeAt(start);
  let i = start + 1;
  while (i < text.length) {
    const code = text.charCodeAt(i);
    if (code === quote) {
      return i + 1;
    }
    if (code === 0x5c) {
      // An escape; `\` + CR LF is one line continuation.
      i += text.charCodeAt(i + 1) === 0x0d && text.charCodeAt(i + 2) === 0x0a ? 3 : 2;
      continue;
    }
    if (code === 0x0a || code === 0x0d) {
      break;
    }
    i++;
  }
  throw notClosed(`a ${text[start]} string`);
};

/** The end of the regular expression literal that starts at `start` (`/`), with its flags. */
const scanRegex = (text: string, start: number): number => {
  let i = start + 1;
  let inClass = false;
  while (i < text.length) {
    const code = text.charCodeAt(i);
    if (isLineTerminator(code)) {
      break;
    }
    if (code === 0x5c) {
      i += 2;
      continue;
    }
    if (code === 0x5b) {
      inClass = true;
    } else if (code === 0x5d) {
      inClass = false;
    } else if (code === 0x2f && !inClass) {
      i++;
      while (i < text.length && isWordChar(text.charCodeAt(i))) {
        i++;
      }
      return i;
    }
    i++;
  }
  throw notClosed('a regular expression');
};

/** Options of tokenizeJs. */
export interface TokenizeJsOptions {
  /**
   * Split each template literal into its string chunks and the tokens of the code in its `${…}`
   * (default: one `template` token for the whole literal, substitutions included).
   */
  splitTemplates?: boolean;
}

/** A frame of the template stack: an open template literal (any other value: an open `${…}` and its brace depth). */
const TEMPLATE = -1;

/**
 * Splits JavaScript / TypeScript source into tokens. Throws DevInputError for a string, template
 * literal, comment or regular expression that is not closed, and for template literals nested
 * more than DEV_MAX_NESTING levels deep.
 *
 * The code inside `${…}` is read by the same loop with the same rules as the code outside, while
 * the open template literals and substitutions are kept on an explicit stack (nothing recurses).
 * The string parts of a template literal are chunks: `` `a${ ``, `}b${`, `` }c` `` or `` `abc` ``
 * (a line break in a chunk stays in it, it is not a `newline` token).
 * - By default, the chunks and the tokens between them are not returned: each outermost template
 *   literal is one `template` token from its opening to its closing `` ` ``.
 * - With `splitTemplates`, every chunk is a `template` token and the code of each `${…}` comes as
 *   ordinary tokens between them (`` `a${b}c` `` → `` `a${ ``, `b`, `` }c` ``).
 * Both modes find the same boundaries and throw the same errors: the default mode only joins the
 * tokens of each template literal into one.
 */
export const tokenizeJs = (text: string, options: TokenizeJsOptions = {}): JsToken[] => {
  const split = options.splitTemplates === true;
  const tokens: JsToken[] = [];
  // The last token that is not a space, line break or comment (undefined right after `${`).
  let previous: JsToken | undefined;
  // The open template literals and `${…}`, innermost last (empty: outside every template literal).
  const frames: number[] = [];
  // Where the outermost open template literal starts (the default mode returns it as one token).
  let templateStart = 0;
  let i = 0;
  const push = (kind: JsTokenKind, end: number): void => {
    const token: JsToken = { kind, text: text.slice(i, end), start: i, end };
    if (split || frames.length === 0) {
      tokens.push(token);
    }
    if (kind !== 'space' && kind !== 'newline' && kind !== 'comment') {
      previous = token;
    }
    i = end;
  };
  const refuseDeeperNesting = (): void => {
    if (frames.length >= DEV_MAX_NESTING * 2) {
      throw new DevInputError(`the template literals are nested more than ${DEV_MAX_NESTING} levels deep`);
    }
  };
  // Reads the chunk at `i` (at the `` ` `` that opens a template literal, or at the `}` that ends
  // a `${…}`), whose template frame is on top of the stack, up to its closing `` ` `` or its `${`.
  const pushChunk = (): void => {
    let end = i + 1;
    let opensSubstitution = false;
    for (;;) {
      if (end >= text.length) {
        throw notClosed('a ` template literal');
      }
      const code = text.charCodeAt(end);
      if (code === 0x5c) {
        end += 2;
      } else if (code === 0x60) {
        frames.pop();
        end++;
        break;
      } else if (code === 0x24 && text.charCodeAt(end + 1) === 0x7b) {
        refuseDeeperNesting();
        frames.push(0);
        end += 2;
        opensSubstitution = true;
        break;
      } else {
        end++;
      }
    }
    if (!split && frames.length === 0) {
      // The default mode: the whole outermost template literal is one token.
      i = templateStart;
    }
    push('template', end);
    if (opensSubstitution) {
      // The start of an expression: a `/` there starts a regular expression.
      previous = undefined;
    }
  };
  while (i < text.length) {
    const code = text.charCodeAt(i);
    const top = frames.length - 1;
    if (code === 0x0d && text.charCodeAt(i + 1) === 0x0a) {
      push('newline', i + 2);
    } else if (isLineTerminator(code)) {
      push('newline', i + 1);
    } else if (isSpace(code)) {
      let end = i + 1;
      while (end < text.length && isSpace(text.charCodeAt(end))) {
        end++;
      }
      push('space', end);
    } else if (code === 0x2f && text.charCodeAt(i + 1) === 0x2f) {
      let end = i + 2;
      while (end < text.length && !isLineTerminator(text.charCodeAt(end))) {
        end++;
      }
      push('comment', end);
    } else if (code === 0x2f && text.charCodeAt(i + 1) === 0x2a) {
      const close = text.indexOf('*/', i + 2);
      if (close < 0) {
        throw notClosed('a /* comment');
      }
      push('comment', close + 2);
    } else if (code === 0x27 || code === 0x22) {
      push('string', scanString(text, i));
    } else if (code === 0x60) {
      if (frames.length === 0) {
        templateStart = i;
      } else {
        refuseDeeperNesting();
      }
      frames.push(TEMPLATE);
      pushChunk();
    } else if (code === 0x7d && top >= 0 && frames[top] === 0) {
      // The `}` that ends a `${…}`: back in its template literal.
      frames.pop();
      pushChunk();
    } else if (code === 0x2f && regexAllowedAfter(previous)) {
      push('regex', scanRegex(text, i));
    } else if (isDigit(code) || (code === 0x2e && isDigit(text.charCodeAt(i + 1)))) {
      let end = i + 1;
      while (end < text.length) {
        const next = text.charCodeAt(end);
        const exponentSign = (next === 0x2b || next === 0x2d) && (text[end - 1] === 'e' || text[end - 1] === 'E')
          && !text.startsWith('0x', i) && !text.startsWith('0X', i);
        if (isWordChar(next) || next === 0x2e || exponentSign) {
          end++;
        } else {
          break;
        }
      }
      push('number', end);
    } else if (isWordChar(code)) {
      let end = i + 1;
      while (end < text.length && isWordChar(text.charCodeAt(end))) {
        end++;
      }
      push('word', end);
    } else {
      let punct = PUNCTUATORS.find((candidate) => text.startsWith(candidate, i)) ?? text[i];
      if (punct === '?.' && isDigit(text.charCodeAt(i + 2))) {
        // `a?.5:b` is `a ? .5 : b`.
        punct = '?';
      }
      if (top >= 0) {
        // Inside `${…}`: count its braces, so that only the `}` at depth 0 ends it.
        if (punct === '{') {
          frames[top]++;
        } else if (punct === '}') {
          frames[top]--;
        }
      }
      push('punct', i + punct.length);
    }
  }
  if (frames.length > 0) {
    throw notClosed('a ` template literal');
  }
  return tokens;
};

/** Whether the token is only layout (a space, a line break or a comment). */
export const isTrivia = (token: JsToken): boolean => token.kind === 'space' || token.kind === 'newline' || token.kind === 'comment';
