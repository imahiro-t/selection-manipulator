/**
 * DEV-018..019: minify and format CSS (vscode-independent).
 *
 * The CSS is read by a hand-written linear tokenizer and rewritten as text; nothing is evaluated
 * or loaded (`url(…)` is copied as it is). Strings, `url(…)` and kept comments are never changed.
 * Blocks are nested at most DEV_MAX_NESTING deep.
 */
import { DEV_MAX_NESTING, DevInputError, DevOutputBuffer } from './devCommon';

export type CssTokenType = 'ws' | 'comment' | 'string' | 'url' | 'word' | '{' | '}' | ';' | ':' | ',' | '(' | ')' | '[' | ']';

/** What a run of tokens between `{` `}` `;` is. */
export type SegmentKind = 'prelude' | 'decl' | 'statement';

export interface CssToken {
  type: CssTokenType;
  text: string;
  /** The kind of segment the token belongs to (set by `classify`). */
  segment?: SegmentKind;
  /** The first `:` of a declaration (outside parentheses). */
  declColon?: boolean;
  /** Depth of `(` / `[` the token is in. */
  depth?: number;
}

const PUNCTUATION = new Set(['{', '}', ';', ':', ',', '(', ')', '[', ']']);

const isSpace = (ch: string): boolean => ch === ' ' || ch === '\t' || ch === '\n' || ch === '\r' || ch === '\f';

/** Splits CSS into tokens (linear). Unclosed strings, comments and `url(` are errors. */
export const tokenizeCss = (text: string): CssToken[] => {
  const tokens: CssToken[] = [];
  let i = 0;
  const push = (type: CssTokenType, end: number) => {
    tokens.push({ type, text: text.slice(i, end) });
    i = end;
  };
  while (i < text.length) {
    const ch = text[i];
    if (isSpace(ch)) {
      let end = i + 1;
      while (end < text.length && isSpace(text[end])) {
        end++;
      }
      push('ws', end);
    } else if (ch === '/' && text[i + 1] === '*') {
      const end = text.indexOf('*/', i + 2);
      if (end < 0) {
        throw new DevInputError('a /* comment is not closed');
      }
      push('comment', end + 2);
    } else if (ch === '"' || ch === '\'') {
      let end = i + 1;
      while (end < text.length && text[end] !== ch) {
        if (text[end] === '\n' || text[end] === '\r' || text[end] === '\f') {
          break;
        }
        end += text[end] === '\\' ? 2 : 1;
      }
      if (end >= text.length || text[end] !== ch) {
        throw new DevInputError(`a ${ch} string is not closed`);
      }
      push('string', end + 1);
    } else if (PUNCTUATION.has(ch)) {
      push(ch as CssTokenType, i + 1);
    } else {
      let end = i;
      while (end < text.length) {
        const c = text[end];
        if (isSpace(c) || PUNCTUATION.has(c) || c === '"' || c === '\'' || (c === '/' && text[end + 1] === '*')) {
          break;
        }
        end += c === '\\' && end + 1 < text.length ? 2 : 1;
      }
      if (text.slice(i, end).toLowerCase() === 'url' && text[end] === '(') {
        // `url(` followed by anything but a quote is one token up to its `)`.
        let j = end + 1;
        while (j < text.length && isSpace(text[j])) {
          j++;
        }
        if (text[j] !== '"' && text[j] !== '\'') {
          while (j < text.length && text[j] !== ')') {
            j += text[j] === '\\' ? 2 : 1;
          }
          if (j >= text.length) {
            throw new DevInputError('a url( is not closed');
          }
          push('url', j + 1);
          continue;
        }
      }
      push('word', end);
    }
  }
  return tokens;
};

const isInsignificant = (token: CssToken): boolean => token.type === 'ws' || token.type === 'comment';

/**
 * Checks the brackets and marks every token with the kind of its segment: the run up to `{` is a
 * prelude (selector or at-rule), a run up to `;` / `}` is a declaration inside a block, or at the
 * top level when it does not start with `@` and ends with `;` (a selected declaration list), and
 * any other run is a statement (`@import …;`, or a top-level run without `;`).
 */
const classify = (tokens: CssToken[]): void => {
  const brackets: string[] = [];
  let blocks = 0;
  let start = 0;
  let topDeclarations = false;
  const mark = (end: number, terminator: string) => {
    let first = start;
    while (first < end && isInsignificant(tokens[first])) {
      first++;
    }
    if (first === end) {
      return;
    }
    let kind: SegmentKind;
    if (terminator === '{') {
      kind = 'prelude';
    } else if (tokens[first].text.startsWith('@')) {
      kind = 'statement';
    } else if (blocks > 0 || terminator === ';' || (terminator === '' && topDeclarations)) {
      kind = 'decl';
      if (blocks === 0) {
        topDeclarations = true;
      }
    } else {
      kind = 'statement';
    }
    let colon = kind === 'decl';
    for (let k = start; k < end; k++) {
      tokens[k].segment = kind;
      if (colon && tokens[k].type === ':' && tokens[k].depth === 0) {
        tokens[k].declColon = true;
        colon = false;
      }
    }
  };
  tokens.forEach((token, i) => {
    token.depth = brackets.length;
    if (token.type === '(' || token.type === '[') {
      if (brackets.length >= DEV_MAX_NESTING) {
        throw new DevInputError(`the brackets are nested deeper than ${DEV_MAX_NESTING} levels`);
      }
      brackets.push(token.type === '(' ? ')' : ']');
    } else if (token.type === ')' || token.type === ']') {
      if (brackets.pop() !== token.type) {
        throw new DevInputError(`a ${token.type} does not match`);
      }
      token.depth = brackets.length;
    } else if (brackets.length === 0 && (token.type === '{' || token.type === '}' || token.type === ';')) {
      mark(i, token.type);
      if (token.type === '{') {
        if (blocks >= DEV_MAX_NESTING) {
          throw new DevInputError(`the blocks are nested deeper than ${DEV_MAX_NESTING} levels`);
        }
        blocks++;
      } else if (token.type === '}') {
        if (blocks === 0) {
          throw new DevInputError('a } does not match');
        }
        blocks--;
      }
      start = i + 1;
    }
  });
  if (brackets.length > 0) {
    throw new DevInputError(`a ${brackets[brackets.length - 1] === ')' ? '(' : '['} is not closed`);
  }
  mark(tokens.length, '');
  if (blocks > 0) {
    throw new DevInputError('a { is not closed');
  }
};

/** Tokenizes and classifies CSS (also used by DEVX-010; DEVX-011..012 use the tokenizer alone). */
export const parseCss = (text: string): CssToken[] => {
  const tokens = tokenizeCss(text);
  classify(tokens);
  return tokens;
};

// ---------------------------------------------------------------------------------------------
// DEV-018 Minify
// ---------------------------------------------------------------------------------------------

/** Characters that can be part of a name, number or dimension on both sides of a comment. */
const isNameChar = (ch: string): boolean => /[A-Za-z0-9_\-\\%#@.]/.test(ch) || ch.charCodeAt(0) >= 0x80;

/** Whether joining `before` and `after` makes `/*`, `<!--` or `-->` across the join. */
const makesMarker = (before: string, after: string): boolean => {
  const joined = before.slice(-3) + after.slice(0, 3);
  const cut = Math.min(3, before.length);
  return ['/*', '<!--', '-->'].some((marker) => {
    for (let at = joined.indexOf(marker); at >= 0; at = joined.indexOf(marker, at + 1)) {
      if (at < cut && at + marker.length > cut) {
        return true;
      }
    }
    return false;
  });
};

const isLicenseComment = (token: CssToken): boolean => token.type === 'comment' && token.text.startsWith('/*!');

/**
 * Removes the comments (`/*! … *\/` is kept). A CSS comment separates tokens without being white
 * space, so a run of comments between two tokens that would join into one (both sides name or
 * number characters, a name before `(`, or a join that makes `/*` `<!--` `-->`) becomes `/**\/`.
 */
const removeComments = (tokens: readonly CssToken[]): CssToken[] => {
  const out: CssToken[] = [];
  for (let i = 0; i < tokens.length; i++) {
    if (tokens[i].type !== 'comment') {
      out.push(tokens[i]);
      continue;
    }
    let end = i;
    while (end < tokens.length && tokens[end].type === 'comment') {
      end++;
    }
    const run = tokens.slice(i, end);
    const before = tokens[i - 1];
    const after = tokens[end];
    if (run.some(isLicenseComment)) {
      run.filter(isLicenseComment).forEach((comment) => out.push(comment));
    } else if (before !== undefined && after !== undefined && before.type !== 'ws' && after.type !== 'ws') {
      const last = before.text[before.text.length - 1];
      const first = after.text[0];
      if ((isNameChar(last) && (isNameChar(first) || first === '(')) || makesMarker(before.text, after.text)) {
        out.push({ ...run[0], text: '/**/' });
      }
    }
    i = end - 1;
  }
  return out;
};

/**
 * DEV-018: comments removed (see removeComments), white space made one space and removed next to
 * `{ } ; ,`, around the first `:` of a declaration and before `!important`, and the `;` before `}`
 * removed. The spaces of selectors (`a :hover`) and of values (`calc(1px + 2px)`) are kept.
 */
export const cssMinify = (text: string, budget: number): string => {
  const tokens: CssToken[] = [];
  for (const token of removeComments(parseCss(text))) {
    if (token.type === 'ws') {
      if (tokens.length === 0 || tokens[tokens.length - 1].type === 'ws') {
        continue;
      }
      tokens.push({ ...token, text: ' ' });
    } else {
      tokens.push(token);
    }
  }
  const tight = (token: CssToken | undefined) =>
    token === undefined || token.type === '{' || token.type === '}' || token.type === ';' || token.type === ',' || token.declColon === true;
  const out = new DevOutputBuffer(budget);
  tokens.forEach((token, i) => {
    const after = tokens[i + 1];
    if (token.type === 'ws') {
      const before = tokens[i - 1];
      if (tight(before) || tight(after) || (after.segment === 'decl' && after.text.startsWith('!'))) {
        return;
      }
    }
    if (token.type === ';') {
      let next = i + 1;
      while (next < tokens.length && tokens[next].type === 'ws') {
        next++;
      }
      if (tokens[next]?.type === '}') {
        return;
      }
    }
    out.push(token.text);
  });
  return out.join();
};

// ---------------------------------------------------------------------------------------------
// DEV-019 Format
// ---------------------------------------------------------------------------------------------

type CssItem =
  | { kind: 'comment'; text: string }
  | { kind: 'rule'; prelude: CssToken[]; children: CssItem[] }
  | { kind: 'decl' | 'statement'; tokens: CssToken[]; terminated: boolean };

/** The tokens of a segment as one line: white space made one space, the ends trimmed. */
const segmentText = (tokens: readonly CssToken[], prelude: boolean): string => {
  const parts: string[] = [];
  tokens.forEach((token, i) => {
    if (token.type === 'ws') {
      const before = tokens[i - 1];
      const after = tokens[i + 1];
      if (before === undefined || after === undefined || before.type === 'ws') {
        return;
      }
      if (prelude && after.type === ',' && after.depth === 0) {
        return;
      }
      if (token.declColon !== true && (before.declColon === true || after.declColon === true)) {
        return;
      }
      parts.push(' ');
      return;
    }
    if (token.declColon === true) {
      parts.push(': ');
      return;
    }
    parts.push(token.text);
    if (prelude && token.type === ',' && token.depth === 0 && tokens[i + 1] !== undefined && tokens[i + 1].type !== 'ws') {
      parts.push(' ');
    }
  });
  return parts.join('').trim();
};

/** The rules, declarations, statements and standalone comments of the CSS, nested. */
const buildTree = (tokens: readonly CssToken[]): CssItem[] => {
  const root: CssItem[] = [];
  const stack: CssItem[][] = [root];
  let segment: CssToken[] = [];
  const significant = () => segment.some((token) => !isInsignificant(token));
  const flush = (terminated: boolean) => {
    if (significant()) {
      const kind = segment.find((token) => !isInsignificant(token))!.segment === 'decl' ? 'decl' : 'statement';
      stack[stack.length - 1].push({ kind, tokens: segment, terminated });
    }
    segment = [];
  };
  for (const token of tokens) {
    if (token.type === 'comment' && !significant()) {
      // A comment before anything else of its segment stands on its own line.
      stack[stack.length - 1].push({ kind: 'comment', text: token.text });
      segment = [];
      continue;
    }
    if (token.depth === 0 && token.type === '{') {
      const rule: CssItem = { kind: 'rule', prelude: segment, children: [] };
      stack[stack.length - 1].push(rule);
      stack.push(rule.children);
      segment = [];
    } else if (token.depth === 0 && token.type === '}') {
      flush(false);
      stack.pop();
    } else if (token.depth === 0 && token.type === ';') {
      flush(true);
    } else {
      segment.push(token);
    }
  }
  flush(false);
  return root;
};

/**
 * DEV-019: `selector {`, one declaration per line indented by two spaces (`prop: value;`), `}` on
 * its own line, nested blocks indented deeper, a blank line between top-level rules, selector
 * lists on one line (`a, b`) and comments on their own lines.
 */
export const cssFormat = (text: string, eol: string, budget: number): string => {
  const out = new DevOutputBuffer(budget);
  let first = true;
  const line = (indent: number, content: string) => {
    if (!first) {
      out.push(eol);
    }
    first = false;
    out.push(' '.repeat(indent) + content);
  };
  // Iterative rendering: a stack of [items, next index, indent].
  const stack: { items: CssItem[]; index: number; indent: number }[] = [{ items: buildTree(parseCss(text)), index: 0, indent: 0 }];
  while (stack.length > 0) {
    const frame = stack[stack.length - 1];
    if (frame.index >= frame.items.length) {
      stack.pop();
      if (stack.length > 0) {
        line(stack[stack.length - 1].indent, '}');
      }
      continue;
    }
    const item = frame.items[frame.index];
    const previous = frame.items[frame.index - 1];
    frame.index++;
    if (stack.length === 1 && previous !== undefined
      && (previous.kind === 'rule' || (item.kind === 'rule' && previous.kind !== 'comment'))) {
      line(0, '');
    }
    if (item.kind === 'comment') {
      line(frame.indent, item.text);
    } else if (item.kind === 'rule') {
      const prelude = segmentText(item.prelude, true);
      line(frame.indent, prelude === '' ? '{' : `${prelude} {`);
      stack.push({ items: item.children, index: 0, indent: frame.indent + 2 });
    } else {
      const content = segmentText(item.tokens, false);
      line(frame.indent, item.kind === 'decl' || item.terminated ? `${content};` : content);
    }
  }
  return out.join();
};
