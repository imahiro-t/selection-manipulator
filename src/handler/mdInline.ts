/**
 * A subset of the CommonMark inline syntax, used by Markdown: Convert to HTML (MD-019) and
 * Markdown: Strip Formatting (MD-020): backslash escapes, code spans, emphasis (`*` `_`), strong
 * emphasis (`**` `__`), strikethrough (`~~`), inline links, images and autolinks (`<https://…>`).
 * Anything else (raw HTML, reference links, footnotes…) is plain text.
 *
 * The algorithm is the one of the CommonMark reference implementation: delimiter runs and
 * brackets are kept on stacks while the text is read once, and emphasis is resolved with the
 * "openers bottom" optimisation. The nodes are a doubly linked tree, so wrapping a range of
 * nodes in a new element and removing delimiters take constant time, and the result is linear in
 * the length of the text even for many unmatched `*`, `_`, `[` or `` ` ``. Two differences keep
 * it linear: a link or image made from a `]` makes every earlier `[` (for a link) or `![` (for an
 * image) plain text, so a node is moved into at most one link and one image.
 */
import {
  codeSpans,
  escapeHtml,
  isAsciiPunctuation,
  LinkTailParser,
  unescapeMarkdown,
} from './mdCommon';

export type InlineType = 'root' | 'text' | 'code' | 'em' | 'strong' | 'del' | 'link' | 'image' | 'autolink';

/** A node of the inline tree. */
export class InlineNode {
  /** Text / code / autolink: the text; link / image: nothing. */
  value = '';
  /** Link / image / autolink: the destination (backslash escapes removed). */
  destination = '';
  /** Link / image: the title (backslash escapes removed), if any. */
  title?: string;
  parent?: InlineNode;
  first?: InlineNode;
  last?: InlineNode;
  next?: InlineNode;
  prev?: InlineNode;

  constructor(readonly type: InlineType, value = '') {
    this.value = value;
  }

  appendChild(child: InlineNode): void {
    child.unlink();
    child.parent = this;
    if (this.last === undefined) {
      this.first = child;
      this.last = child;
    } else {
      this.last.next = child;
      child.prev = this.last;
      this.last = child;
    }
  }

  insertAfter(sibling: InlineNode): void {
    sibling.unlink();
    sibling.parent = this.parent;
    sibling.prev = this;
    sibling.next = this.next;
    if (this.next === undefined) {
      if (this.parent !== undefined) {
        this.parent.last = sibling;
      }
    } else {
      this.next.prev = sibling;
    }
    this.next = sibling;
  }

  unlink(): void {
    if (this.prev !== undefined) {
      this.prev.next = this.next;
    } else if (this.parent !== undefined) {
      this.parent.first = this.next;
    }
    if (this.next !== undefined) {
      this.next.prev = this.prev;
    } else if (this.parent !== undefined) {
      this.parent.last = this.prev;
    }
    this.parent = undefined;
    this.prev = undefined;
    this.next = undefined;
  }

  /** Moves the siblings strictly between `from` and `to` (both children of the same parent) into this node. */
  adoptBetween(from: InlineNode, to: InlineNode | undefined): void {
    let child = from.next;
    while (child !== undefined && child !== to) {
      const next = child.next;
      this.appendChild(child);
      child = next;
    }
  }
}

type DelimiterChar = '*' | '_' | '~';

interface Delimiter {
  node: InlineNode;
  char: DelimiterChar;
  count: number;
  originalCount: number;
  canOpen: boolean;
  canClose: boolean;
  prev?: Delimiter;
  next?: Delimiter;
}

interface Bracket {
  node: InlineNode;
  image: boolean;
  /** The top of the delimiter stack when the bracket was read. */
  delimiterBottom?: Delimiter;
}

const WHITESPACE = /^\s$/u;
const PUNCTUATION = /^[\p{P}\p{S}]$/u;

/** The code point before `index` (`'\n'` at the start). */
const charBefore = (text: string, index: number): string => {
  if (index === 0) {
    return '\n';
  }
  const low = text.charCodeAt(index - 1);
  if (index >= 2 && low >= 0xdc00 && low <= 0xdfff) {
    const high = text.charCodeAt(index - 2);
    if (high >= 0xd800 && high <= 0xdbff) {
      return text.slice(index - 2, index);
    }
  }
  return text[index - 1];
};

/** The code point at `index` (`'\n'` at the end). */
const charAt = (text: string, index: number): string => {
  if (index >= text.length) {
    return '\n';
  }
  return String.fromCodePoint(text.codePointAt(index)!);
};

const AUTOLINK_SCHEME = /^[A-Za-z][A-Za-z0-9+.-]{1,31}:/;

/** The offset after an autolink `<scheme:…>` starting at `start`, or -1. */
const autolinkEnd = (text: string, start: number): number => {
  const scheme = AUTOLINK_SCHEME.exec(text.slice(start + 1, start + 35));
  if (scheme === null) {
    return -1;
  }
  for (let i = start + 1 + scheme[0].length; i < text.length; i++) {
    const c = text[i];
    if (c === '>') {
      return i + 1;
    }
    if (c === '<' || c.charCodeAt(0) <= 0x20 || c === '\u007f') {
      return -1;
    }
  }
  return -1;
};

/** Parses the inline content of one block into a tree (the children of a `root` node). */
export const parseInline = (text: string): InlineNode => {
  const root = new InlineNode('root');
  const spans = codeSpans(text);
  const spanEnds = new Map<number, number>(spans);
  const tails = new LinkTailParser(text);
  let top: Delimiter | undefined;
  const brackets: Bracket[] = [];
  let linkBarrier = 0;
  let imageBarrier = 0;
  let buffer = '';

  const flush = (): void => {
    if (buffer !== '') {
      root.appendChild(new InlineNode('text', buffer));
      buffer = '';
    }
  };

  const removeDelimiter = (delimiter: Delimiter): void => {
    if (delimiter.prev !== undefined) {
      delimiter.prev.next = delimiter.next;
    }
    if (delimiter.next !== undefined) {
      delimiter.next.prev = delimiter.prev;
    } else {
      top = delimiter.prev;
    }
  };

  /** Resolves the emphasis between the delimiters above `bottom` and removes them from the stack. */
  const processEmphasis = (bottom: Delimiter | undefined): void => {
    const openersBottom = new Map<string, Delimiter | undefined>();
    // The first delimiter above `bottom`. Only the delimiters above `bottom` are visited (and
    // they are all removed below), so the work over all calls is linear in the delimiters; with
    // none above `bottom`, there is nothing to do (the stack below is not walked).
    let closer = top === bottom ? undefined : top;
    while (closer !== undefined && closer.prev !== bottom) {
      closer = closer.prev;
    }
    while (closer !== undefined) {
      if (!closer.canClose) {
        closer = closer.next;
        continue;
      }
      const key = closer.char === '~' ? '~' : `${closer.char}${closer.canOpen ? 1 : 0}${closer.originalCount % 3}`;
      const limit = openersBottom.has(key) ? openersBottom.get(key) : bottom;
      let opener = closer.prev;
      let found = false;
      while (opener !== undefined && opener !== bottom && opener !== limit) {
        const oddMatch = closer.char !== '~'
          && (closer.canOpen || opener.canClose)
          && closer.originalCount % 3 !== 0
          && (opener.originalCount + closer.originalCount) % 3 === 0;
        if (opener.char === closer.char && opener.canOpen && !oddMatch) {
          found = true;
          break;
        }
        opener = opener.prev;
      }
      if (!found || opener === undefined) {
        openersBottom.set(key, closer.prev);
        const next = closer.next;
        if (!closer.canOpen) {
          removeDelimiter(closer);
        }
        closer = next;
        continue;
      }
      const use = closer.char === '~' ? 2 : (closer.count >= 2 && opener.count >= 2 ? 2 : 1);
      opener.count -= use;
      closer.count -= use;
      opener.node.value = opener.char.repeat(opener.count);
      closer.node.value = closer.char.repeat(closer.count);
      const element = new InlineNode(closer.char === '~' ? 'del' : use === 2 ? 'strong' : 'em');
      element.adoptBetween(opener.node, closer.node);
      opener.node.insertAfter(element);
      // The delimiters between the opener and the closer can no longer match.
      opener.next = closer;
      closer.prev = opener;
      if (opener.count === 0) {
        opener.node.unlink();
        removeDelimiter(opener);
      }
      if (closer.count === 0) {
        const next = closer.next;
        closer.node.unlink();
        removeDelimiter(closer);
        closer = next;
      }
    }
    while (top !== undefined && top !== bottom) {
      removeDelimiter(top);
    }
  };

  for (let i = 0; i < text.length;) {
    const c = text[i];
    if (c === '\\') {
      const next = text[i + 1];
      if (next !== undefined && isAsciiPunctuation(next)) {
        buffer += next;
        i += 2;
      } else {
        buffer += c;
        i++;
      }
      continue;
    }
    if (c === '`') {
      let runEnd = i;
      while (runEnd < text.length && text[runEnd] === '`') {
        runEnd++;
      }
      const spanEnd = spanEnds.get(i);
      if (spanEnd !== undefined) {
        flush();
        const length = runEnd - i;
        root.appendChild(new InlineNode('code', text.slice(runEnd, spanEnd - length)));
        i = spanEnd;
      } else {
        buffer += text.slice(i, runEnd);
        i = runEnd;
      }
      continue;
    }
    if (c === '<') {
      const end = autolinkEnd(text, i);
      if (end !== -1) {
        flush();
        const url = text.slice(i + 1, end - 1);
        const node = new InlineNode('autolink', url);
        node.destination = url;
        root.appendChild(node);
        i = end;
        continue;
      }
      buffer += c;
      i++;
      continue;
    }
    if (c === '*' || c === '_' || c === '~') {
      let runEnd = i;
      while (runEnd < text.length && text[runEnd] === c) {
        runEnd++;
      }
      const count = runEnd - i;
      if (c === '~' && count !== 2) {
        buffer += text.slice(i, runEnd);
        i = runEnd;
        continue;
      }
      const before = charBefore(text, i);
      const after = charAt(text, runEnd);
      const beforeSpace = WHITESPACE.test(before);
      const afterSpace = WHITESPACE.test(after);
      const beforePunctuation = PUNCTUATION.test(before);
      const afterPunctuation = PUNCTUATION.test(after);
      const leftFlanking = !afterSpace && (!afterPunctuation || beforeSpace || beforePunctuation);
      const rightFlanking = !beforeSpace && (!beforePunctuation || afterSpace || afterPunctuation);
      const canOpen = c === '_' ? leftFlanking && (!rightFlanking || beforePunctuation) : leftFlanking;
      const canClose = c === '_' ? rightFlanking && (!leftFlanking || afterPunctuation) : rightFlanking;
      flush();
      const node = new InlineNode('text', text.slice(i, runEnd));
      root.appendChild(node);
      if (canOpen || canClose) {
        const delimiter: Delimiter = { node, char: c, count, originalCount: count, canOpen, canClose, prev: top };
        if (top !== undefined) {
          top.next = delimiter;
        }
        top = delimiter;
      }
      i = runEnd;
      continue;
    }
    if (c === '[' || (c === '!' && text[i + 1] === '[')) {
      flush();
      const image = c === '!';
      const node = new InlineNode('text', image ? '![' : '[');
      root.appendChild(node);
      brackets.push({ node, image, delimiterBottom: top });
      i += image ? 2 : 1;
      continue;
    }
    if (c === ']') {
      const opener = brackets.pop();
      if (opener === undefined) {
        buffer += c;
        i++;
        continue;
      }
      const index = brackets.length;
      const active = index >= (opener.image ? imageBarrier : linkBarrier);
      linkBarrier = Math.min(linkBarrier, index);
      imageBarrier = Math.min(imageBarrier, index);
      const tail = active && text[i + 1] === '(' ? tails.parse(i + 1) : undefined;
      if (tail === undefined) {
        buffer += c;
        i++;
        continue;
      }
      flush();
      const element = new InlineNode(opener.image ? 'image' : 'link');
      element.destination = unescapeMarkdown(tail.destination);
      element.title = tail.title === undefined ? undefined : unescapeMarkdown(tail.title);
      element.adoptBetween(opener.node, undefined);
      opener.node.insertAfter(element);
      opener.node.unlink();
      processEmphasis(opener.delimiterBottom);
      if (opener.image) {
        imageBarrier = brackets.length;
      } else {
        linkBarrier = brackets.length;
      }
      i = tail.end;
      continue;
    }
    buffer += c;
    i++;
  }
  flush();
  processEmphasis(undefined);
  return root;
};

/**
 * Visits the tree without recursion (emphasis can be nested very deeply). `enter` returns
 * whether to visit the children; `leave` is called after the children (for every node).
 */
const walk = (root: InlineNode, enter: (node: InlineNode) => boolean, leave: (node: InlineNode) => void): void => {
  let node: InlineNode | undefined = root.first;
  while (node !== undefined) {
    if (enter(node) && node.first !== undefined) {
      node = node.first;
      continue;
    }
    leave(node);
    while (node.next === undefined) {
      node = node.parent;
      if (node === undefined || node === root) {
        return;
      }
      leave(node);
    }
    node = node.next;
  }
};

/** The text of a tree without any markup (code spans keep their content as written). */
export const inlineToPlain = (root: InlineNode): string => {
  let result = '';
  walk(root, (node) => {
    if (node.type === 'text' || node.type === 'code' || node.type === 'autolink') {
      result += node.value;
    }
    return true;
  }, () => undefined);
  return result;
};

const UNSAFE_SCHEMES = ['javascript:', 'vbscript:', 'data:', 'file:'];

/** Control characters and whitespace (C0, space, DEL, C1 and the Unicode spaces), which browsers skip in a URL scheme. */
const isIgnoredInUrl = (code: number): boolean =>
  code <= 0x20 || (code >= 0x7f && code <= 0xa0) || code === 0x1680 || (code >= 0x2000 && code <= 0x200d)
  || code === 0x2028 || code === 0x2029 || code === 0x202f || code === 0x205f || code === 0x3000 || code === 0xfeff;

/**
 * The destination to write into `href` / `src`: `#` when its scheme is `javascript:`,
 * `vbscript:`, `data:` or `file:` (compared in lower case after removing whitespace and control
 * characters, which browsers ignore there).
 */
export const safeUrl = (url: string): string => {
  let normalized = '';
  for (const c of url) {
    if (!isIgnoredInUrl(c.codePointAt(0)!)) {
      normalized += c;
    }
  }
  normalized = normalized.toLowerCase();
  return UNSAFE_SCHEMES.some((scheme) => normalized.startsWith(scheme)) ? '#' : url;
};

const escape = escapeHtml;

/** Code span content as CommonMark renders it: line breaks become spaces, one space is stripped from both ends. */
const codeContent = (value: string): string => {
  const flat = value.replace(/\r\n|\r|\n/g, ' ');
  return flat.length >= 2 && flat.startsWith(' ') && flat.endsWith(' ') && flat.trim() !== '' ? flat.slice(1, -1) : flat;
};

/** Renders a tree as HTML: every text and attribute value is escaped, unsafe URLs are replaced with `#`. */
export const inlineToHtml = (root: InlineNode): string => {
  let result = '';
  const titleOf = (node: InlineNode): string => (node.title === undefined ? '' : ` title="${escape(node.title)}"`);
  walk(root, (node) => {
    switch (node.type) {
      case 'text':
        result += escape(node.value);
        break;
      case 'code':
        result += `<code>${escape(codeContent(node.value))}</code>`;
        break;
      case 'autolink':
        result += `<a href="${escape(safeUrl(node.destination))}">${escape(node.value)}</a>`;
        break;
      case 'em':
        result += '<em>';
        break;
      case 'strong':
        result += '<strong>';
        break;
      case 'del':
        result += '<del>';
        break;
      case 'link':
        result += `<a href="${escape(safeUrl(node.destination))}"${titleOf(node)}>`;
        break;
      case 'image':
        // The alt text is the plain text of the image's children, which are not rendered.
        result += `<img src="${escape(safeUrl(node.destination))}" alt="${escape(inlineToPlain(node))}"${titleOf(node)} />`;
        return false;
      default:
        break;
    }
    return true;
  }, (node) => {
    switch (node.type) {
      case 'em':
        result += '</em>';
        break;
      case 'strong':
        result += '</strong>';
        break;
      case 'del':
        result += '</del>';
        break;
      case 'link':
        result += '</a>';
        break;
      default:
        break;
    }
  });
  return result;
};
