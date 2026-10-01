/**
 * XML well-formedness check (DATAX-016) and element path list (DATAX-017) of group DATA2: a
 * hand-written scanner that moves forward one character at a time (no regular expression that
 * could backtrack, no dependency).
 *
 * Security rules (SECURITY.md): nothing is fetched, read or evaluated. A DOCTYPE is recognised
 * only as syntax: its internal subset is skipped and its external identifier is never resolved,
 * and no entity it declares is ever expanded; a reference to any entity other than the five
 * predefined ones is an error. So neither external entities (XXE) nor nested entity expansion can
 * happen. Nesting is limited to DATA_MAX_DEPTH, the input to DATA_MAX_INPUT_LENGTH.
 *
 * Scope: the main rules of well-formed XML 1.0 (matching tags, one root element, no text outside
 * it, attribute quoting and uniqueness, comments, CDATA, processing instructions, character and
 * predefined entity references, characters allowed in XML). Names are checked with a simplified
 * rule (see `isNameStart` / `isNameChar`); DTD validity and the encoding declaration are not.
 */
import {
  assertInputLength,
  CountLimitError,
  DATA_MAX_DEPTH,
  DataInputError,
  MAX_OUTPUT_LENGTH,
  OutputBuffer,
  outputTooLarge,
} from './dataCommon';
import { lineColumnAt } from './dataParsers';

/** The selection is not well-formed XML; `line` / `column` are 1-based, in the selection. */
export class XmlWellFormednessError extends DataInputError {
  constructor(readonly line: number, readonly column: number, readonly reason: string) {
    super(`invalid XML: line ${line}, column ${column}: ${reason}`);
    this.name = 'XmlWellFormednessError';
  }
}

/** DATAX-017: upper limit of the number of listed paths (lines). */
export const XML_MAX_PATH_LINES = 100_000;

/** A simplified XML name start character: an ASCII letter, `_`, `:` or any character from U+00C0. */
const isNameStart = (code: number): boolean =>
  (code >= 0x41 && code <= 0x5a) || (code >= 0x61 && code <= 0x7a) || code === 0x5f || code === 0x3a || code >= 0xc0;

/** A name character: a start character, an ASCII digit, `-`, `.` or U+00B7. */
const isNameChar = (code: number): boolean =>
  isNameStart(code) || (code >= 0x30 && code <= 0x39) || code === 0x2d || code === 0x2e || code === 0xb7;

const isXmlSpace = (code: number): boolean => code === 0x20 || code === 0x09 || code === 0x0a || code === 0x0d;

/** Whether a code point may appear in an XML 1.0 document (`Char`). */
const isXmlChar = (code: number): boolean =>
  code === 0x09 || code === 0x0a || code === 0x0d
  || (code >= 0x20 && code <= 0xd7ff) || (code >= 0xe000 && code <= 0xfffd) || (code >= 0x10000 && code <= 0x10ffff);

const PREDEFINED_ENTITIES = new Set(['lt', 'gt', 'amp', 'apos', 'quot']);

/** What the scanner reports to DATAX-017 (DATAX-016 passes no listener). */
interface XmlListener {
  startElement(name: string): void;
  endElement(): void;
}

class XmlScanner {
  private pos = 0;
  /** Names and start offsets of the open elements. */
  private readonly open: { name: string; offset: number }[] = [];
  private rootSeen = false;
  private rootClosed = false;
  private doctypeSeen = false;

  constructor(private readonly text: string, private readonly listener?: XmlListener) {}

  private fail(reason: string, offset: number = this.pos): never {
    const { line, column } = lineColumnAt(this.text, offset);
    throw new XmlWellFormednessError(line, column, reason);
  }

  private startsWith(token: string): boolean {
    return this.text.startsWith(token, this.pos);
  }

  private code(offset = this.pos): number {
    return this.text.charCodeAt(offset);
  }

  /** Characters that XML does not allow anywhere (control characters, U+FFFE / U+FFFF, lone surrogates). */
  private checkCharacters(): void {
    const { text } = this;
    for (let i = 0; i < text.length; i++) {
      const code = text.codePointAt(i)!;
      if (code > 0xffff) {
        i++;
        continue;
      }
      if (!isXmlChar(code)) {
        this.fail(code >= 0xd800 && code <= 0xdfff ? 'a lone surrogate is not allowed' : 'a character that XML does not allow (a control character or U+FFFE / U+FFFF)', i);
      }
    }
  }

  scan(): void {
    const { text } = this;
    this.checkCharacters();
    if (this.code() === 0xfeff) {
      this.pos++;
    }
    const start = this.pos;
    while (this.pos < text.length) {
      if (this.code() !== 0x3c /* < */) {
        this.readText();
        continue;
      }
      if (this.startsWith('<!--')) {
        this.readComment();
      } else if (this.startsWith('<![CDATA[')) {
        if (this.open.length === 0) {
          this.fail('a CDATA section is only allowed inside an element');
        }
        const end = text.indexOf(']]>', this.pos + 9);
        if (end === -1) {
          this.fail('the CDATA section is not closed');
        }
        this.pos = end + 3;
      } else if (this.startsWith('<!DOCTYPE')) {
        this.readDoctype();
      } else if (this.startsWith('<!')) {
        this.fail('unknown markup declaration (only comments, CDATA sections and one DOCTYPE are allowed)');
      } else if (this.startsWith('<?')) {
        this.readProcessingInstruction(start);
      } else if (this.startsWith('</')) {
        this.readEndTag();
      } else {
        this.readStartTag();
      }
    }
    if (this.open.length > 0) {
      this.fail('the element is not closed', this.open[this.open.length - 1].offset);
    }
    if (!this.rootSeen) {
      this.fail('no root element', text.length);
    }
  }

  /** Character data: only white space outside the root element; references are checked. */
  private readText(): void {
    const { text } = this;
    while (this.pos < text.length) {
      const code = this.code();
      if (code === 0x3c) {
        return;
      }
      if (this.open.length === 0) {
        if (!isXmlSpace(code)) {
          this.fail(this.rootClosed ? 'text after the root element' : 'text before the root element');
        }
        this.pos++;
        continue;
      }
      if (code === 0x26 /* & */) {
        this.readReference();
        continue;
      }
      if (code === 0x5d /* ] */ && this.startsWith(']]>')) {
        this.fail('"]]>" is not allowed in text');
      }
      this.pos++;
    }
  }

  /** `&lt;`, `&#65;`, `&#x41;`; any other entity is refused, never resolved. */
  private readReference(): void {
    const { text } = this;
    const start = this.pos;
    this.pos++;
    if (this.code() === 0x23 /* # */) {
      this.pos++;
      const hex = this.code() === 0x78 /* x */;
      if (hex) {
        this.pos++;
      }
      const digitsStart = this.pos;
      while (this.pos < text.length) {
        const code = this.code();
        const isDigit = code >= 0x30 && code <= 0x39;
        const isHex = isDigit || (code >= 0x41 && code <= 0x46) || (code >= 0x61 && code <= 0x66);
        if (!(hex ? isHex : isDigit)) {
          break;
        }
        this.pos++;
      }
      const digits = text.slice(digitsStart, this.pos);
      if (digits.length === 0 || this.code() !== 0x3b /* ; */) {
        this.fail('invalid character reference', start);
      }
      // More than 8 digits is always out of range (and keeps the number exact).
      const value = digits.length > 8 ? -1 : parseInt(digits, hex ? 16 : 10);
      if (!isXmlChar(value)) {
        this.fail('the character reference is not a character that XML allows', start);
      }
      this.pos++;
      return;
    }
    const nameStart = this.pos;
    if (!isNameStart(this.code())) {
      this.fail('"&" must start a reference (write &amp; for "&")', start);
    }
    while (this.pos < text.length && isNameChar(this.code())) {
      this.pos++;
    }
    if (this.code() !== 0x3b) {
      this.fail('the entity reference is not closed with ";"', start);
    }
    if (!PREDEFINED_ENTITIES.has(text.slice(nameStart, this.pos))) {
      this.fail('undefined entity (only &lt; &gt; &amp; &apos; &quot; and character references are allowed; entities are never resolved)', start);
    }
    this.pos++;
  }

  private readComment(): void {
    const { text } = this;
    const start = this.pos;
    const dashes = text.indexOf('--', this.pos + 4);
    if (dashes === -1) {
      this.fail('the comment is not closed', start);
    }
    if (text.charCodeAt(dashes + 2) !== 0x3e /* > */) {
      this.fail('"--" is not allowed inside a comment', dashes);
    }
    this.pos = dashes + 3;
  }

  private readName(what: string): string {
    const { text } = this;
    const start = this.pos;
    if (this.pos >= text.length || !isNameStart(this.code())) {
      this.fail(`invalid ${what} name`);
    }
    while (this.pos < text.length && isNameChar(this.code())) {
      this.pos++;
    }
    return text.slice(start, this.pos);
  }

  private skipSpaces(): boolean {
    const before = this.pos;
    while (this.pos < this.text.length && isXmlSpace(this.code())) {
      this.pos++;
    }
    return this.pos > before;
  }

  /** `<?target ...?>`; the XML declaration (`<?xml ...?>`) only at the very start. */
  private readProcessingInstruction(documentStart: number): void {
    const { text } = this;
    const start = this.pos;
    this.pos += 2;
    const target = this.readName('processing instruction target');
    if (target.toLowerCase() === 'xml' && start !== documentStart) {
      this.fail('the XML declaration is only allowed at the very start', start);
    }
    const end = text.indexOf('?>', this.pos);
    if (end === -1) {
      this.fail('the processing instruction is not closed', start);
    }
    if (end > this.pos && !isXmlSpace(this.code())) {
      this.fail('a space must follow the processing instruction target');
    }
    this.pos = end + 2;
  }

  /**
   * `<!DOCTYPE name ... [internal subset]>`: read as syntax only. Quoted strings, comments and
   * declarations inside the internal subset are skipped; nothing is resolved or expanded.
   */
  private readDoctype(): void {
    const { text } = this;
    const start = this.pos;
    if (this.doctypeSeen || this.rootSeen) {
      this.fail('a DOCTYPE is only allowed once, before the root element', start);
    }
    this.doctypeSeen = true;
    this.pos += 9;
    if (!this.skipSpaces()) {
      this.fail('a space must follow DOCTYPE');
    }
    this.readName('DOCTYPE');
    let inSubset = false;
    while (this.pos < text.length) {
      const code = this.code();
      if (code === 0x22 || code === 0x27) {
        const close = text.indexOf(text[this.pos], this.pos + 1);
        if (close === -1) {
          this.fail('the quoted string in the DOCTYPE is not closed');
        }
        this.pos = close + 1;
      } else if (inSubset && this.startsWith('<!--')) {
        this.readComment();
      } else if (code === 0x5b /* [ */ && !inSubset) {
        inSubset = true;
        this.pos++;
      } else if (code === 0x5d /* ] */ && inSubset) {
        inSubset = false;
        this.pos++;
      } else if (code === 0x3e /* > */ && !inSubset) {
        this.pos++;
        return;
      } else {
        this.pos++;
      }
    }
    this.fail('the DOCTYPE is not closed', start);
  }

  private readStartTag(): void {
    const { text } = this;
    const start = this.pos;
    if (this.rootClosed) {
      this.fail('only one root element is allowed', start);
    }
    if (this.open.length >= DATA_MAX_DEPTH) {
      this.fail(`the elements are nested too deeply (limit: ${DATA_MAX_DEPTH})`, start);
    }
    this.pos++;
    const name = this.readName('element');
    const attributes = new Set<string>();
    for (;;) {
      const spaced = this.skipSpaces();
      if (this.startsWith('/>')) {
        this.pos += 2;
        this.rootSeen = true;
        this.listener?.startElement(name);
        this.listener?.endElement();
        if (this.open.length === 0) {
          this.rootClosed = true;
        }
        return;
      }
      if (this.code() === 0x3e /* > */) {
        this.pos++;
        this.rootSeen = true;
        this.open.push({ name, offset: start });
        this.listener?.startElement(name);
        return;
      }
      if (this.pos >= text.length) {
        this.fail('the start tag is not closed', start);
      }
      if (!spaced) {
        this.fail('a space must separate the attributes');
      }
      const attributeStart = this.pos;
      const attribute = this.readName('attribute');
      if (attributes.has(attribute)) {
        this.fail('the attribute is repeated in the same element', attributeStart);
      }
      attributes.add(attribute);
      this.skipSpaces();
      if (this.code() !== 0x3d /* = */) {
        this.fail('the attribute has no "=" and value');
      }
      this.pos++;
      this.skipSpaces();
      this.readAttributeValue();
    }
  }

  private readAttributeValue(): void {
    const { text } = this;
    const quote = this.code();
    if (quote !== 0x22 && quote !== 0x27) {
      this.fail('the attribute value must be quoted');
    }
    const start = this.pos;
    this.pos++;
    while (this.pos < text.length) {
      const code = this.code();
      if (code === quote) {
        this.pos++;
        return;
      }
      if (code === 0x3c) {
        this.fail('"<" is not allowed in an attribute value');
      }
      if (code === 0x26) {
        this.readReference();
        continue;
      }
      this.pos++;
    }
    this.fail('the attribute value is not closed', start);
  }

  private readEndTag(): void {
    const start = this.pos;
    this.pos += 2;
    const name = this.readName('element');
    this.skipSpaces();
    if (this.code() !== 0x3e) {
      this.fail('the end tag is not closed with ">"');
    }
    this.pos++;
    const top = this.open.pop();
    if (top === undefined) {
      this.fail('an end tag without a start tag', start);
    }
    if (top.name !== name) {
      const opened = lineColumnAt(this.text, top.offset);
      this.fail(`mismatched end tag (expected the end tag of the element at line ${opened.line}, column ${opened.column})`, start);
    }
    this.listener?.endElement();
    if (this.open.length === 0) {
      this.rootClosed = true;
    }
  }
}

/** Throws `XmlWellFormednessError` when the selection is not well-formed XML. */
export const checkXml = (text: string): void => {
  assertInputLength(text);
  new XmlScanner(text).scan();
};

/** DATAX-016: the notification of one selection. */
export const validateXml = (text: string): { valid: boolean; message: string } => {
  try {
    checkXml(text);
    return { valid: true, message: 'Well-formed XML' };
  } catch (error) {
    if (error instanceof XmlWellFormednessError) {
      return { valid: false, message: `Invalid XML: line ${error.line}, column ${error.column}: ${error.reason}` };
    }
    throw error;
  }
};

/** An element of the lightweight tree built for DATAX-017 (names only). */
interface XmlNode {
  name: string;
  children: XmlNode[];
}

/**
 * DATAX-017: the paths of the leaf elements (elements without child elements), in document order:
 * `/root/item[2]/name`. `[n]` (1-based) is added only to names that two or more siblings share.
 * At most XML_MAX_PATH_LINES lines and MAX_OUTPUT_LENGTH characters.
 */
export const listXmlPaths = (text: string): string => {
  assertInputLength(text);
  const root: XmlNode = { name: '', children: [] };
  const stack: XmlNode[] = [root];
  let leaves = 0;
  new XmlScanner(text, {
    startElement: (name) => {
      const node: XmlNode = { name, children: [] };
      stack[stack.length - 1].children.push(node);
      stack.push(node);
    },
    endElement: () => {
      const node = stack.pop()!;
      if (node.children.length === 0) {
        leaves++;
        if (leaves > XML_MAX_PATH_LINES) {
          throw new CountLimitError(leaves, XML_MAX_PATH_LINES, 'lines (element paths)');
        }
      }
    },
  }).scan();
  const out = new OutputBuffer();
  // Depth-first, children in document order; each frame holds the path prefix of its element.
  const frames: { node: XmlNode; prefix: string; next: number; segments: string[] }[] = [];
  const enter = (node: XmlNode, prefix: string): void => {
    const counts = new Map<string, number>();
    node.children.forEach((child) => counts.set(child.name, (counts.get(child.name) ?? 0) + 1));
    const seen = new Map<string, number>();
    const segments = node.children.map((child) => {
      if (counts.get(child.name)! < 2) {
        return child.name;
      }
      const index = (seen.get(child.name) ?? 0) + 1;
      seen.set(child.name, index);
      return `${child.name}[${index}]`;
    });
    frames.push({ node, prefix, next: 0, segments });
  };
  enter(root, '');
  while (frames.length > 0) {
    const frame = frames[frames.length - 1];
    if (frame.next >= frame.node.children.length) {
      frames.pop();
      continue;
    }
    const index = frame.next++;
    const child = frame.node.children[index];
    const path = `${frame.prefix}/${frame.segments[index]}`;
    if (path.length > MAX_OUTPUT_LENGTH) {
      throw outputTooLarge(path.length);
    }
    if (child.children.length === 0) {
      out.push(path);
    } else {
      enter(child, path);
    }
  }
  return out.join('\n');
};
