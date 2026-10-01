/**
 * DEVX-013..016: remove JavaScript / TypeScript comments, and C# verbatim, Rust raw and shell
 * here-document literals (vscode-independent).
 *
 * The comments are found with the lexer of DEV-023..025 (devJsLexer.ts), so strings, template
 * literals and regular expression literals are never touched. The literals are only built as
 * text: nothing is compiled, evaluated or run in a shell. Every function is linear in its input.
 */
import { assertWithinBudget, DevInputError, DevOutputBuffer } from './devCommon';
import { isLineTerminator, JsToken, tokenizeJs } from './devJsLexer';

// ---------------------------------------------------------------------------------------------
// DEVX-013 Remove comments
// ---------------------------------------------------------------------------------------------

/** Punctuators after which, or before which, a removed comment needs no space. */
const OPENERS = new Set(['(', '[', '{', ',', ';']);
const CLOSERS = new Set([')', ']', '}', ',', ';']);

/** The line being written: what is kept so far and where its code ends. */
interface OpenLine {
  text: string;
  hadComment: boolean;
  /** The length of `text` up to the end of its last code token (0: no code on the line yet). */
  codeEnd: number;
  /** A comment was removed after the last code token: the spaces left after that code are dropped. */
  commentLast: boolean;
}

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
  if (before.kind === 'punct' && OPENERS.has(before.text)) {
    return false;
  }
  return !(after.kind === 'punct' && CLOSERS.has(after.text));
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
  const tokens = tokenizeJs(source);
  // The next token that is not a comment, for each token (to know what follows a comment).
  const nextCode: (JsToken | undefined)[] = new Array(tokens.length);
  let following: JsToken | undefined;
  for (let i = tokens.length - 1; i >= 0; i--) {
    nextCode[i] = following;
    if (tokens[i].kind !== 'comment') {
      following = tokens[i];
    }
  }
  const out = new DevOutputBuffer(budget);
  let line: OpenLine = { text: hashbang, hadComment: false, codeEnd: hashbang.length, commentLast: false };
  // The last code token written on the current line (undefined after a space or at its start).
  let lastCode: JsToken | undefined;
  const endLine = (lineBreak: string) => {
    if (!line.hadComment) {
      out.push(line.text + lineBreak);
    } else if (line.codeEnd > 0) {
      out.push((line.commentLast ? line.text.slice(0, line.codeEnd) : line.text) + lineBreak);
    }
    // A line that had a comment and holds no code afterwards is removed with its line break.
    line = { text: '', hadComment: false, codeEnd: 0, commentLast: false };
    lastCode = undefined;
  };
  tokens.forEach((token, i) => {
    if (token.kind === 'newline') {
      endLine(token.text);
      return;
    }
    if (token.kind !== 'comment') {
      line.text += token.text;
      if (token.kind === 'space') {
        lastCode = undefined;
      } else {
        lastCode = token;
        line.codeEnd = line.text.length;
        line.commentLast = false;
      }
      return;
    }
    line.hadComment = true;
    line.commentLast = true;
    const breaks = token.text.startsWith('/*') ? lineBreaksOf(token.text) : [];
    if (breaks.length === 0) {
      const after = nextCode[i];
      if (needsSpace(lastCode, after?.kind === 'space' || after?.kind === 'newline' ? undefined : after)) {
        line.text += ' ';
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
