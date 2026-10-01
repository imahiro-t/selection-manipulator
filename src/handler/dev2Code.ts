/**
 * DEVX-013..016: remove JavaScript / TypeScript comments, and C# verbatim, Rust raw and shell
 * here-document literals (vscode-independent).
 *
 * The comments are found with the lexer of DEV-023..025 (devJsLexer.ts), so strings, template
 * literals and regular expression literals are never touched; the lexer splits template literals
 * into their string chunks and the code of their `${…}`, so comments in `${…}` are removed too.
 * The literals are only built as text: nothing is compiled, evaluated or run in a shell. Every
 * function is linear in its input.
 */
import { assertWithinBudget, DevInputError, DevOutputBuffer } from './devCommon';
import { isLineTerminator, JsToken, tokenizeJs } from './devJsLexer';

// ---------------------------------------------------------------------------------------------
// DEVX-013 Remove comments
// ---------------------------------------------------------------------------------------------

/** Punctuators after which, or before which, a removed comment needs no space. */
const OPENERS = new Set(['(', '[', '{', ',', ';']);
const CLOSERS = new Set([')', ']', '}', ',', ';']);
/** Brackets whose inside a comment right after them starts: the spaces after that comment go. */
const OPEN_BRACKETS = new Set(['(', '[', '{']);

/** A template chunk that opens a `${…}` (`` `a${ `` or `}b${`). */
const opensSubstitution = (token: JsToken): boolean => token.kind === 'template' && token.text.endsWith('${');
/** A template chunk that ends a `${…}` (`}b${` or `` }b` ``). */
const closesSubstitution = (token: JsToken): boolean => token.kind === 'template' && token.text.startsWith('}');

/** Whether `token` opens a bracket (`(` `[` `{` or a chunk ending with `${`), for rule R1. */
const isOpenBracket = (token: JsToken | undefined): boolean =>
  token !== undefined && ((token.kind === 'punct' && OPEN_BRACKETS.has(token.text)) || opensSubstitution(token));

/** Whether `token` closes a bracket or ends a list item (`)` `]` `}` `,` `;` or a chunk starting with `}`), for rule R2. */
const isCloser = (token: JsToken | undefined): boolean =>
  token !== undefined && ((token.kind === 'punct' && CLOSERS.has(token.text)) || closesSubstitution(token));

/**
 * The line being written: what is kept so far, split where its code ends.
 *
 * The kept text of the line is `code + tail`. `code` runs up to the end of the last code token
 * ('' while the line has no code yet) and `tail` holds the spaces kept after it (and a space put in
 * for a removed comment). `tail` is only appended to `code` when the next code token comes, so
 * dropping it (rule R2, or the end of the line) never copies `code`: the work stays linear even
 * when one line has many comments.
 *
 * How endLine writes the line, by the three fields:
 *
 * | hadComment | code     | commentLast | the line is written as                                     |
 * |------------|----------|-------------|------------------------------------------------------------|
 * | false      | any      | (false)     | `code + tail` (empty lines and lines of spaces stay)       |
 * | true       | ''       | any         | nothing: the line is removed with its line break           |
 * | true       | not ''   | false       | `code + tail` (code follows the last removed comment)      |
 * | true       | not ''   | true        | `code`: the spaces after the last code go                  |
 *
 * `commentLast` is only set together with `hadComment`, so it is always false when `hadComment` is
 * false. On the line of a hashbang, `code` starts as the hashbang (the hashbang is code; no
 * comment can follow it on that line, as it runs to the line break).
 */
interface OpenLine {
  /** The text of the line up to the end of its last code token ('' when there is no code yet). */
  code: string;
  /** The text kept after `code`: spaces, and a space put in for a removed comment. */
  tail: string;
  hadComment: boolean;
  /** A comment was removed after the last code token: the spaces left after that code are dropped. */
  commentLast: boolean;
}

/** Whether the text of a comment holds a line break. */
const hasLineBreak = (text: string): boolean => /[\n\r\u2028\u2029]/.test(text);

/** The line breaks in the text of a block comment, each as it is written (CR LF as one). */
const lineBreaksOf = (text: string): string[] => {
  const breaks: string[] = [];
  for (let i = 0; i < text.length; i++) {
    const code = text.charCodeAt(i);
    if (!isLineTerminator(code)) {
      continue;
    }
    if (code === 0x0d && text.charCodeAt(i + 1) === 0x0a) {
      breaks.push('\r\n');
      i++;
    } else {
      breaks.push(text[i]);
    }
  }
  return breaks;
};

/**
 * Whether removing a comment between `before` and `after` (the code tokens next to it) would join
 * them into something else (`a/**\/b` → `ab`, `+/**\/+` → `++`, `a/**\//b/` → a line comment).
 */
const needsSpace = (before: JsToken | undefined, after: JsToken | undefined): boolean => {
  if (before === undefined || after === undefined) {
    return false;
  }
  if ((before.kind === 'punct' && OPENERS.has(before.text)) || opensSubstitution(before)) {
    return false;
  }
  return !isCloser(after);
};

/**
 * DEVX-013: the `//` and `/* *\/` comments of JavaScript / TypeScript removed; strings, template
 * literals and regular expressions are never changed, and a leading hashbang (`#!…`) is kept.
 * A block comment that spans lines keeps its line breaks (the same characters, the same number),
 * so automatic semicolon insertion reads the code as before (`return /*⏎*\/ x` stays two lines).
 * A comment between two code tokens that would join becomes one space. A line that had a comment
 * and holds only spaces afterwards is removed with its line break; lines that were empty before
 * are kept. When the last line (without a line break) is removed, the line break before it stays.
 * The spaces left at the end of a line after a removed comment are dropped (`a = 1; // x` → `a = 1;`).
 * Comments in the `${…}` of template literals are removed by the same rules; the string parts of
 * a template literal are never changed.
 *
 * Two more rules for the spaces around a comment without line breaks:
 * - R1: after a comment at the start of a line (only spaces before it) or right after an opening
 *   bracket (`(` `[` `{` or `${`), the spaces after it are dropped (`/* c *\/ a;` → `a;`,
 *   `  /* c *\/ a;` → `  a;`, `f(/* c *\/ a)` → `f(a)`).
 * - R2: when code comes before it on its line and the first code after it on that line is `)` `]`
 *   `}` `,` `;` or the `}` that ends a `${…}`, the spaces between that code and it are dropped
 *   (`f(a /* c *\/)` → `f(a)`, `g(a /* c *\/, b)` → `g(a, b)`).
 * Both may apply (`( /* c *\/ )` → `()`). The indent of a line is never dropped. Elsewhere in a
 * line, the spaces on both sides of a removed comment stay (`x = a /* c *\/ - b` → `x = a  - b`).
 * The spaces after a block comment that spans lines always stay, as they may be the indent of
 * the next line (`x;⏎/* a⏎ *\/ b;` → `x;⏎ b;`). R1 and R2 only drop spaces without line breaks, so
 * the line breaks, and automatic semicolon insertion, are the same as before.
 */
export const removeJsComments = (text: string, budget: number): string => {
  let hashbang = '';
  let source = text;
  if (text.startsWith('#!')) {
    let end = 2;
    while (end < text.length && !isLineTerminator(text.charCodeAt(end))) {
      end++;
    }
    hashbang = text.slice(0, end);
    source = text.slice(end);
  }
  // Template chunks are code tokens; a line break inside a chunk is part of it, not a `newline`.
  const tokens = tokenizeJs(source, { splitTemplates: true });
  // For each token: the next token that is not a comment (to know what follows a comment), and the
  // first code token after it on the same line, past spaces and comments without line breaks
  // (undefined when a line break or a comment with line breaks comes first; for rule R2).
  const nextCode: (JsToken | undefined)[] = new Array(tokens.length);
  const nextSolid: (JsToken | undefined)[] = new Array(tokens.length);
  let following: JsToken | undefined;
  let solid: JsToken | undefined;
  for (let i = tokens.length - 1; i >= 0; i--) {
    const token = tokens[i];
    nextCode[i] = following;
    nextSolid[i] = solid;
    if (token.kind !== 'comment') {
      following = token;
    }
    if (token.kind === 'newline' || (token.kind === 'comment' && hasLineBreak(token.text))) {
      solid = undefined;
    } else if (token.kind !== 'space' && token.kind !== 'comment') {
      solid = token;
    }
  }
  const out = new DevOutputBuffer(budget);
  let line: OpenLine = { code: hashbang, tail: '', hadComment: false, commentLast: false };
  // The last code token written on the current line (undefined after a space or at its start; for needsSpace).
  let lastCode: JsToken | undefined;
  // The last code token of the current line, kept across spaces and comments (for rule R1).
  let lineLastCode: JsToken | undefined;
  // Rule R1 applies: the spaces that come next are dropped, until a code token or a line break.
  let dropSpace = false;
  const endLine = (lineBreak: string) => {
    if (!line.hadComment) {
      out.push(line.code + line.tail + lineBreak);
    } else if (line.code !== '') {
      out.push((line.commentLast ? line.code : line.code + line.tail) + lineBreak);
    }
    // A line that had a comment and holds no code afterwards is removed with its line break.
    line = { code: '', tail: '', hadComment: false, commentLast: false };
    lastCode = undefined;
    lineLastCode = undefined;
    dropSpace = false;
  };
  tokens.forEach((token, i) => {
    if (token.kind === 'newline') {
      endLine(token.text);
      return;
    }
    if (token.kind !== 'comment') {
      if (token.kind === 'space') {
        if (!dropSpace) {
          line.tail += token.text;
        }
        lastCode = undefined;
      } else {
        line.code += line.tail + token.text;
        line.tail = '';
        lastCode = token;
        lineLastCode = token;
        line.commentLast = false;
        dropSpace = false;
      }
      return;
    }
    line.hadComment = true;
    line.commentLast = true;
    const breaks = token.text.startsWith('/*') ? lineBreaksOf(token.text) : [];
    if (breaks.length === 0) {
      if (line.code !== '' && isCloser(nextSolid[i])) {
        // R2: drop the spaces between the code before and this comment (with a space that an
        // earlier comment of the run may have left). The line now ends with that code, so it is
        // the code next to this comment again (needsSpace then gives false, as a closer follows).
        line.tail = '';
        lastCode = lineLastCode;
      }
      if (line.code === '' || isOpenBracket(lineLastCode)) {
        // R1: at the start of the line or right after an opening bracket.
        dropSpace = true;
      }
      const after = nextCode[i];
      if (needsSpace(lastCode, after?.kind === 'space' || after?.kind === 'newline' ? undefined : after)) {
        line.tail += ' ';
        lastCode = undefined;
      }
      return;
    }
    for (const lineBreak of breaks) {
      endLine(lineBreak);
      line.hadComment = true;
      line.commentLast = true;
    }
  });
  endLine('');
  return out.join();
};

// ---------------------------------------------------------------------------------------------
// DEVX-014 C# verbatim string
// ---------------------------------------------------------------------------------------------

/** DEVX-014: a C# verbatim string `@"…"`: every `"` doubled, everything else (line breaks too) as it is. */
export const toCSharpVerbatimString = (text: string): string => `@"${text.replace(/"/g, '""')}"`;

// ---------------------------------------------------------------------------------------------
// DEVX-015 Rust raw string
// ---------------------------------------------------------------------------------------------

/** The most `#` a Rust raw string may get (Rust allows 255). */
export const RUST_MAX_HASHES = 255;

/** Whether the text has a CR that is not followed by LF (Rust does not allow one in a raw string). */
const hasLoneCr = (text: string): boolean => {
  for (let i = text.indexOf('\r'); i >= 0; i = text.indexOf('\r', i + 1)) {
    if (text.charCodeAt(i + 1) !== 0x0a) {
      return true;
    }
  }
  return false;
};

/**
 * DEVX-015: a Rust raw string `r#"…"#` with the fewest `#` that do not appear after a `"` in the
 * text (`r"…"` when the text has no `"`). More than 255 `#` would be needed: an error. A CR that is
 * not part of CR LF is an error (Rust does not allow it in a raw string).
 */
export const toRustRawString = (text: string): string => {
  if (hasLoneCr(text)) {
    throw new DevInputError('the text has a carriage return (CR) without a line feed, which a Rust raw string cannot hold');
  }
  let hashes = -1;
  for (let i = text.indexOf('"'); i >= 0; i = text.indexOf('"', i + 1)) {
    let run = 0;
    while (text.charCodeAt(i + 1 + run) === 0x23) {
      run++;
    }
    hashes = Math.max(hashes, run);
  }
  const count = hashes + 1;
  if (count > RUST_MAX_HASHES) {
    throw new DevInputError(`the text has a " followed by ${hashes} #, so the raw string would need more than ${RUST_MAX_HASHES} #`);
  }
  const fence = '#'.repeat(count);
  return `r${fence}"${text}"${fence}`;
};

// ---------------------------------------------------------------------------------------------
// DEVX-016 Here-document
// ---------------------------------------------------------------------------------------------

/**
 * DEVX-016: a shell here-document that prints the text as it is: `cat <<'EOF'`, the text and the
 * delimiter. The delimiter is quoted, so nothing in the text is expanded, and it is a word that no
 * line of the text equals (`EOF`, else `EOF_1`, `EOF_2`, …). The result has LF line breaks (a
 * shell would read a CR as part of the line): CR LF becomes LF and a lone CR is an error. A line
 * break is added after the text when it does not end with one; an empty text gives an empty
 * here-document (no line between the two). Nothing is run.
 */
export const toHeredoc = (text: string, budget: number): string => {
  if (hasLoneCr(text)) {
    throw new DevInputError('the text has a carriage return (CR) without a line feed, which a here-document cannot hold');
  }
  const body = text.replace(/\r\n/g, '\n');
  const lines = new Set(body.split('\n'));
  let delimiter = 'EOF';
  // Each candidate that is taken is a different line, so this ends within lines.size + 1 tries.
  for (let n = 1; lines.has(delimiter); n++) {
    delimiter = `EOF_${n}`;
  }
  const lineBreak = body === '' || body.endsWith('\n') ? '' : '\n';
  const result = `cat <<'${delimiter}'\n${body}${lineBreak}${delimiter}`;
  assertWithinBudget(result.length, budget);
  return result;
};
