/**
 * DEV-027 / DEV-035: HTML → JSX (vscode-independent).
 *
 * A small linear HTML scanner (tags, attributes, text, comments, `<!DOCTYPE>`, the raw text of
 * `<script>` / `<style>`) rewrites the markup token by token: nothing is parsed into a tree,
 * evaluated or run. The tags do not have to be balanced (a fragment such as `<label …>` is
 * converted as it is), and several root elements are not wrapped.
 */
import { DevInputError, DevOutputBuffer, quoteText } from './devCommon';
import { escapeTemplateLiteral, toJsString } from './devLiterals';

/** HTML attribute names (lower case) whose React name is not simply the same. */
const ATTRIBUTE_NAMES: Record<string, string> = {
  class: 'className', for: 'htmlFor', tabindex: 'tabIndex', readonly: 'readOnly', maxlength: 'maxLength',
  minlength: 'minLength', colspan: 'colSpan', rowspan: 'rowSpan', contenteditable: 'contentEditable',
  crossorigin: 'crossOrigin', autocomplete: 'autoComplete', autofocus: 'autoFocus', autoplay: 'autoPlay',
  autocapitalize: 'autoCapitalize', enctype: 'encType', accesskey: 'accessKey', novalidate: 'noValidate',
  'http-equiv': 'httpEquiv', 'accept-charset': 'acceptCharset', srcset: 'srcSet', srcdoc: 'srcDoc',
  srclang: 'srcLang', spellcheck: 'spellCheck', cellpadding: 'cellPadding', cellspacing: 'cellSpacing',
  usemap: 'useMap', frameborder: 'frameBorder', allowfullscreen: 'allowFullScreen', datetime: 'dateTime',
  formaction: 'formAction', formenctype: 'formEncType', formmethod: 'formMethod', formnovalidate: 'formNoValidate',
  formtarget: 'formTarget', hreflang: 'hrefLang', inputmode: 'inputMode', ismap: 'isMap', itemprop: 'itemProp',
  itemscope: 'itemScope', itemtype: 'itemType', itemid: 'itemID', itemref: 'itemRef', marginheight: 'marginHeight',
  marginwidth: 'marginWidth', playsinline: 'playsInline', referrerpolicy: 'referrerPolicy', charset: 'charSet',
  classid: 'classID', controlslist: 'controlsList', enterkeyhint: 'enterKeyHint', fetchpriority: 'fetchPriority',
  nomodule: 'noModule', radiogroup: 'radioGroup', mediagroup: 'mediaGroup', allowtransparency: 'allowTransparency',
  disablepictureinpicture: 'disablePictureInPicture', disableremoteplayback: 'disableRemotePlayback',
  imagesizes: 'imageSizes', imagesrcset: 'imageSrcSet', popovertarget: 'popoverTarget',
  popovertargetaction: 'popoverTargetAction', 'xmlns:xlink': 'xmlnsXlink',
  // SVG attributes that HTML writes in lower case.
  viewbox: 'viewBox', preserveaspectratio: 'preserveAspectRatio', gradientunits: 'gradientUnits',
  gradienttransform: 'gradientTransform', patternunits: 'patternUnits', patterncontentunits: 'patternContentUnits',
  patterntransform: 'patternTransform', clippathunits: 'clipPathUnits', maskunits: 'maskUnits',
  maskcontentunits: 'maskContentUnits', markerwidth: 'markerWidth', markerheight: 'markerHeight',
  markerunits: 'markerUnits', refx: 'refX', refy: 'refY', stddeviation: 'stdDeviation', textlength: 'textLength',
  lengthadjust: 'lengthAdjust', startoffset: 'startOffset', spreadmethod: 'spreadMethod',
  pathlength: 'pathLength', filterunits: 'filterUnits', primitiveunits: 'primitiveUnits',
};

/** Event names in the case React uses (after `on`), found by their lower-case form. */
const EVENTS = [
  'Abort', 'AnimationEnd', 'AnimationIteration', 'AnimationStart', 'AuxClick', 'BeforeInput', 'Blur',
  'CanPlay', 'CanPlayThrough', 'Change', 'Click', 'Close', 'CompositionEnd', 'CompositionStart',
  'CompositionUpdate', 'ContextMenu', 'Copy', 'Cut', 'Drag', 'DragEnd', 'DragEnter', 'DragExit', 'DragLeave',
  'DragOver', 'DragStart', 'Drop', 'DurationChange', 'Emptied', 'Encrypted', 'Ended', 'Error', 'Focus',
  'GotPointerCapture', 'Input', 'Invalid', 'KeyDown', 'KeyPress', 'KeyUp', 'Load', 'LoadedData',
  'LoadedMetadata', 'LoadStart', 'LostPointerCapture', 'MouseDown', 'MouseEnter', 'MouseLeave', 'MouseMove',
  'MouseOut', 'MouseOver', 'MouseUp', 'Paste', 'Pause', 'Play', 'Playing', 'PointerCancel', 'PointerDown',
  'PointerEnter', 'PointerLeave', 'PointerMove', 'PointerOut', 'PointerOver', 'PointerUp', 'Progress',
  'RateChange', 'Reset', 'Resize', 'Scroll', 'ScrollEnd', 'Seeked', 'Seeking', 'Select', 'Stalled', 'Submit',
  'Suspend', 'TimeUpdate', 'Toggle', 'TouchCancel', 'TouchEnd', 'TouchMove', 'TouchStart', 'TransitionEnd',
  'VolumeChange', 'Waiting', 'Wheel',
];
const EVENT_NAMES = new Map<string, string>([...EVENTS.map((name): [string, string] => [name.toLowerCase(), name]), ['dblclick', 'DoubleClick']]);

const VOID_ELEMENTS = new Set([
  'area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'param', 'source', 'track', 'wbr', 'keygen',
]);
const RAW_TEXT_ELEMENTS = new Set(['script', 'style']);

/** `stroke-width` → `strokeWidth`, `xlink:href` → `xlinkHref`. */
const camelCase = (name: string): string => name.replace(/[-:]([a-z0-9])/gi, (_match, ch: string) => ch.toUpperCase());

/** The JSX name of an HTML attribute. */
export const jsxAttributeName = (name: string): string => {
  const lower = name.toLowerCase();
  const known = ATTRIBUTE_NAMES[lower];
  if (known !== undefined && Object.prototype.hasOwnProperty.call(ATTRIBUTE_NAMES, lower)) {
    return known;
  }
  if (lower.startsWith('data-') || lower.startsWith('aria-')) {
    return lower;
  }
  if (lower.startsWith('on') && lower.length > 2 && /^[a-z]+$/.test(lower)) {
    const event = lower.slice(2);
    return `on${EVENT_NAMES.get(event) ?? event[0].toUpperCase() + event.slice(1)}`;
  }
  return name.includes('-') || name.includes(':') ? camelCase(name) : name;
};

const ENTITY = /&(?:#([0-9]{1,7})|#[xX]([0-9a-fA-F]{1,6})|(quot|apos|amp|lt|gt|nbsp));/g;
const NAMED: Record<string, string> = { quot: '"', apos: '\'', amp: '&', lt: '<', gt: '>', nbsp: '\u00a0' };

/** Decodes the character references that an attribute value in a JSX expression would keep literally. */
const decodeEntities = (value: string): string =>
  value.replace(ENTITY, (match, decimal: string | undefined, hex: string | undefined, name: string | undefined) => {
    if (name !== undefined) {
      return NAMED[name];
    }
    const code = decimal !== undefined ? parseInt(decimal, 10) : parseInt(hex!, 16);
    return code > 0 && code <= 0x10ffff && (code < 0xd800 || code > 0xdfff) ? String.fromCodePoint(code) : match;
  });

/** A CSS property name → the key of a React style object. */
const styleKey = (property: string): string => {
  if (property.startsWith('--')) {
    return toJsString(property);
  }
  let name = property.toLowerCase();
  if (name.startsWith('-ms-')) {
    // React writes the `ms` prefix in lower case (`msTransform`).
    name = name.slice(1);
  } else if (name.startsWith('-')) {
    name = name.slice(1).replace(/^([a-z])/, (ch) => ch.toUpperCase());
  }
  const key = camelCase(name);
  return /^[A-Za-z_$][A-Za-z0-9_$]*$/.test(key) ? key : toJsString(key);
};

/** Splits CSS declarations at `;` outside strings and parentheses (`url("a;b")`). */
const splitDeclarations = (css: string): string[] => {
  const parts: string[] = [];
  let depth = 0;
  let quote = '';
  let start = 0;
  for (let i = 0; i < css.length; i++) {
    const ch = css[i];
    if (quote !== '') {
      if (ch === '\\') {
        i++;
      } else if (ch === quote) {
        quote = '';
      }
    } else if (ch === '"' || ch === '\'') {
      quote = ch;
    } else if (ch === '(') {
      depth++;
    } else if (ch === ')') {
      depth = Math.max(0, depth - 1);
    } else if (ch === ';' && depth === 0) {
      parts.push(css.slice(start, i));
      start = i + 1;
    }
  }
  parts.push(css.slice(start));
  return parts;
};

/** `a: b; font-size: 12px` → `{{ a: 'b', fontSize: '12px' }}`. */
const styleObject = (css: string): string => {
  const entries = splitDeclarations(decodeEntities(css))
    .filter((declaration) => declaration.trim() !== '')
    .map((declaration) => {
      const colon = declaration.indexOf(':');
      if (colon <= 0 || declaration.slice(0, colon).trim() === '') {
        throw new DevInputError(`the style declaration ${quoteText(declaration.trim())} has no "property: value" form`);
      }
      return `${styleKey(declaration.slice(0, colon).trim())}: ${toJsString(declaration.slice(colon + 1).trim())}`;
    });
  return entries.length === 0 ? '{{}}' : `{{ ${entries.join(', ')} }}`;
};

/** An attribute value as a JSX attribute value (a string literal when possible). */
const jsxValue = (value: string): string => {
  if (!value.includes('"')) {
    return `"${value}"`;
  }
  if (!value.includes('\'')) {
    return `'${value}'`;
  }
  return `{${toJsString(decodeEntities(value))}}`;
};

/** Text between tags: `{`, `}`, `<` and `>` cannot appear in JSX text as they are. */
const jsxText = (text: string): string => text.replace(/[{}<>]/g, (ch) => `{'${ch}'}`);

const isNameStart = (code: number): boolean => (code >= 0x41 && code <= 0x5a) || (code >= 0x61 && code <= 0x7a);
const isSpace = (ch: string): boolean => ch === ' ' || ch === '\t' || ch === '\n' || ch === '\r' || ch === '\f';

interface Attribute {
  name: string;
  /** The raw value (without its quotes), or undefined for an attribute without a value. */
  value?: string;
}

interface Tag {
  name: string;
  attributes: Attribute[];
  selfClosing: boolean;
  /** The spaces and line breaks before each attribute and before the end of the tag, kept as written. */
  spaces: string[];
  end: number;
}

/** Reads the start tag whose name begins at `start` (just after `<`). */
const readStartTag = (html: string, start: number): Tag => {
  let i = start;
  while (i < html.length && !isSpace(html[i]) && html[i] !== '/' && html[i] !== '>') {
    i++;
  }
  const tag: Tag = { name: html.slice(start, i), attributes: [], selfClosing: false, spaces: [], end: 0 };
  for (;;) {
    const spaceStart = i;
    while (i < html.length && isSpace(html[i])) {
      i++;
    }
    const space = html.slice(spaceStart, i);
    if (i >= html.length) {
      throw new DevInputError(`the tag ${quoteText(`<${tag.name}`)} is not closed with ">"`);
    }
    if (html[i] === '>') {
      tag.spaces.push(space);
      tag.end = i + 1;
      return tag;
    }
    if (html[i] === '/' && html[i + 1] === '>') {
      tag.spaces.push(space);
      tag.selfClosing = true;
      tag.end = i + 2;
      return tag;
    }
    if (html[i] === '/') {
      i++;
      continue;
    }
    const nameStart = i;
    while (i < html.length && !isSpace(html[i]) && !'"\'>/='.includes(html[i])) {
      i++;
    }
    if (i === nameStart) {
      throw new DevInputError(`the tag ${quoteText(`<${tag.name}`)} has an unexpected ${quoteText(html[i])}`);
    }
    const attribute: Attribute = { name: html.slice(nameStart, i) };
    let j = i;
    while (j < html.length && isSpace(html[j])) {
      j++;
    }
    if (html[j] === '=') {
      j++;
      while (j < html.length && isSpace(html[j])) {
        j++;
      }
      const quote = html[j];
      if (quote === '"' || quote === '\'') {
        const close = html.indexOf(quote, j + 1);
        if (close < 0) {
          throw new DevInputError(`the value of the attribute ${quoteText(attribute.name)} of ${quoteText(`<${tag.name}`)} is not closed`);
        }
        attribute.value = html.slice(j + 1, close);
        i = close + 1;
      } else {
        const valueStart = j;
        while (j < html.length && !isSpace(html[j]) && html[j] !== '>') {
          j++;
        }
        attribute.value = html.slice(valueStart, j);
        i = j;
      }
    }
    tag.spaces.push(space);
    tag.attributes.push(attribute);
  }
};

const writeAttribute = (attribute: Attribute): string => {
  if (!ATTRIBUTE_NAME.test(attribute.name)) {
    throw new DevInputError(`${quoteText(attribute.name)} is not an attribute name this conversion supports (letters, digits, "-", "_" and one ":")`);
  }
  const name = jsxAttributeName(attribute.name);
  if (attribute.value === undefined) {
    return name;
  }
  if (name === 'style') {
    return `style=${styleObject(attribute.value)}`;
  }
  return `${name}=${jsxValue(attribute.value)}`;
};

/**
 * The names that are written into the JSX as they are (after the case and camelCase changes): a
 * tag name (`div`, `my-element`, `svg:rect`) and an attribute name (`class`, `data-x`,
 * `xlink:href`). Anything else (`{...evil()}`, `a"b`) would be JSX syntax, not a name, and is
 * refused, since HTML accepts almost any character in these names.
 */
const TAG_NAME = /^[A-Za-z][\w-]*(?::[A-Za-z][\w-]*)?$/;
const ATTRIBUTE_NAME = /^[A-Za-z_][\w-]*(?::[A-Za-z_][\w-]*)?$/;

/** An HTML tag name for JSX: HTML names are case-insensitive, and a capital letter would mean a component. */
const jsxTagName = (name: string): string => {
  if (!TAG_NAME.test(name)) {
    throw new DevInputError(`${quoteText(name)} is not a tag name this conversion supports (letters, digits, "-", "_" and one ":")`);
  }
  return /^[A-Z]/.test(name) ? name.toLowerCase() : name;
};

/**
 * DEV-027: converts HTML to JSX: `class` → `className`, `for` → `htmlFor`, other attributes to
 * their React names (`tabindex` → `tabIndex`, `stroke-width` → `strokeWidth`, `onclick` →
 * `onClick` …; `data-*` / `aria-*` are kept), `style="…"` → `style={{ … }}`, void elements
 * (`<br>`, `<img>` …) self-closed, `<!-- x -->` → `{/* x *\/}`, `<!DOCTYPE>` removed, `{ } < >`
 * in text escaped, and the content of `<script>` / `<style>` put in a template literal.
 */
export const htmlToJsx = (html: string, budget: number): string => {
  const out = new DevOutputBuffer(budget);
  // Only ASCII letters change, so the offsets of the lower-case copy are those of the text.
  const lowerHtml = html.replace(/[A-Z]+/g, (letters) => letters.toLowerCase());
  let i = 0;
  let textStart = 0;
  const flushText = (end: number): void => {
    if (end > textStart) {
      out.push(jsxText(html.slice(textStart, end)));
    }
  };
  while (i < html.length) {
    if (html[i] !== '<') {
      i++;
      continue;
    }
    if (html.startsWith('<!--', i)) {
      flushText(i);
      const close = html.indexOf('-->', i + 4);
      if (close < 0) {
        throw new DevInputError('a <!-- comment is not closed');
      }
      out.push(`{/*${html.slice(i + 4, close).replace(/\*\//g, '* /')}*/}`);
      i = close + 3;
      textStart = i;
    } else if (html[i + 1] === '!' || html[i + 1] === '?') {
      // <!DOCTYPE html>, <?xml …?>: not part of JSX.
      flushText(i);
      const close = html.indexOf('>', i + 2);
      if (close < 0) {
        throw new DevInputError(`${quoteText(html.slice(i, i + 20))} is not closed with ">"`);
      }
      const inner = html.slice(i + 2, close);
      if (html[i + 1] === '!' && !/^doctype\b/i.test(inner)) {
        throw new DevInputError(`${quoteText(html.slice(i, close + 1))} is not supported (only comments and <!DOCTYPE> are)`);
      }
      i = close + 1;
      // The line break after a removed declaration goes too.
      if (html[i] === '\r' && html[i + 1] === '\n') {
        i += 2;
      } else if (html[i] === '\n' || html[i] === '\r') {
        i++;
      }
      textStart = i;
    } else if (html[i + 1] === '/' && isNameStart(html.charCodeAt(i + 2))) {
      flushText(i);
      const close = html.indexOf('>', i + 2);
      if (close < 0) {
        throw new DevInputError(`the end tag ${quoteText(html.slice(i, i + 20))} is not closed with ">"`);
      }
      const name = jsxTagName(html.slice(i + 2, close).trim());
      if (!VOID_ELEMENTS.has(name.toLowerCase())) {
        out.push(`</${name}>`);
      }
      i = close + 1;
      textStart = i;
    } else if (isNameStart(html.charCodeAt(i + 1))) {
      flushText(i);
      const tag = readStartTag(html, i + 1);
      const lowerName = tag.name.toLowerCase();
      const name = jsxTagName(tag.name);
      let written = `<${name}`;
      tag.attributes.forEach((attribute, index) => {
        written += (tag.spaces[index] === '' ? ' ' : tag.spaces[index]) + writeAttribute(attribute);
      });
      const trailing = tag.spaces[tag.attributes.length];
      const selfClosing = tag.selfClosing || VOID_ELEMENTS.has(lowerName);
      written += selfClosing ? `${trailing === '' ? ' ' : trailing}/>` : `${trailing}>`;
      out.push(written);
      i = tag.end;
      textStart = i;
      if (RAW_TEXT_ELEMENTS.has(lowerName) && !tag.selfClosing) {
        const close = lowerHtml.indexOf(`</${lowerName}`, i);
        if (close < 0) {
          throw new DevInputError(`the ${quoteText(`<${tag.name}>`)} element is not closed`);
        }
        if (close > i) {
          out.push(`{\`${escapeTemplateLiteral(html.slice(i, close))}\`}`);
        }
        i = close;
        textStart = i;
      }
    } else {
      // A `<` that starts no tag (`a < b`): text.
      i++;
    }
  }
  flushText(html.length);
  return out.join();
};
