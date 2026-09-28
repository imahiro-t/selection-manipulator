/**
 * Pure (vscode-independent) implementations of the ENC-001..ENC-040 encode / decode commands.
 *
 * The 40 commands share 34 transforms: the six "(Replace)" variants (ENC-035..ENC-040) use the
 * transform of the command they derive from and only differ in where the result goes.
 *
 * Rules shared by all transforms:
 * - A transform takes the selected text and returns the converted text. Invalid input makes it
 *   throw `EncInputError` (the reason is in the message); it never returns a partial result.
 * - Byte-oriented decoders turn their bytes back into text with a strict UTF-8 decoder, so a
 *   byte sequence that is not valid UTF-8 is an error instead of silently becoming U+FFFD.
 * - Letters are recognised by their ASCII code range only (no `toUpperCase` / `toLowerCase`, no
 *   `i` / `u` regular expression flags), so characters such as `ß`, `ﬃ`, `K` (U+212A) or `ſ` are
 *   never expanded or matched as ASCII letters.
 * - No regular expression has a quantified repetition followed by a condition that can fail
 *   (to avoid ReDoS).
 * - Output size: `estimateMaxOutputLength` gives a conservative upper bound of the output length
 *   (or `undefined` when no such bound can be given) so that the handler can refuse a selection
 *   before building a huge string, and the handler also checks the actual lengths against
 *   `MAX_OUTPUT_LENGTH`.
 */
import { gunzipSync, gzipSync } from 'node:zlib';
import { domainToASCII, domainToUnicode } from 'node:url';
import { TextDecoder } from 'node:util';

/** The 34 transforms in ROADMAP order (ENC-001..ENC-034). */
export const ENC_COMMANDS = [
  'html-encode',
  'html-decode',
  'html-encode-numeric',
  'unicode-escape',
  'unicode-unescape',
  'unicode-escape-es6',
  'base64url-encode',
  'base64url-decode',
  'base32-encode',
  'base32-decode',
  'base58-encode',
  'base58-decode',
  'hex-encode',
  'hex-decode',
  'binary-encode',
  'binary-decode',
  'punycode-encode',
  'punycode-decode',
  'qp-encode',
  'qp-decode',
  'rot13',
  'rot47',
  'caesar',
  'atbash',
  'ascii85-encode',
  'ascii85-decode',
  'gzip',
  'gunzip',
  'form-encode',
  'form-decode',
  'base64-encode-each-line',
  'base64-decode-each-line',
  'nato',
  'data-uri',
] as const;

export type EncCommand = typeof ENC_COMMANDS[number];

/** Transforms that ask the user for a value (ENC-023). */
export type EncInputCommand = 'caesar';

/** Where a command puts its result: a new read-only editor, or in place of each selection. */
export type EncOutput = 'new-tab' | 'replace';

export interface EncCommandEntry {
  /** ROADMAP ID, e.g. `ENC-001`. */
  id: string;
  /** Command ID without the `selection-manipulator.` prefix. */
  name: string;
  transform: EncCommand;
  output: EncOutput;
}

/** The 40 commands in ROADMAP order: 34 basic commands followed by 6 "(Replace)" variants. */
export const ENC_COMMAND_ENTRIES: readonly EncCommandEntry[] = [
  ...([
    ['html.encode', 'html-encode'],
    ['html.decode', 'html-decode'],
    ['html.encode-numeric', 'html-encode-numeric'],
    ['unicode.escape', 'unicode-escape'],
    ['unicode.unescape', 'unicode-unescape'],
    ['unicode.escape-es6', 'unicode-escape-es6'],
    ['base64url.encode', 'base64url-encode'],
    ['base64url.decode', 'base64url-decode'],
    ['base32.encode', 'base32-encode'],
    ['base32.decode', 'base32-decode'],
    ['base58.encode', 'base58-encode'],
    ['base58.decode', 'base58-decode'],
    ['hex.encode', 'hex-encode'],
    ['hex.decode', 'hex-decode'],
    ['binary.encode', 'binary-encode'],
    ['binary.decode', 'binary-decode'],
    ['punycode.encode', 'punycode-encode'],
    ['punycode.decode', 'punycode-decode'],
    ['quoted-printable.encode', 'qp-encode'],
    ['quoted-printable.decode', 'qp-decode'],
    ['cipher.rot13', 'rot13'],
    ['cipher.rot47', 'rot47'],
    ['cipher.caesar', 'caesar'],
    ['cipher.atbash', 'atbash'],
    ['ascii85.encode', 'ascii85-encode'],
    ['ascii85.decode', 'ascii85-decode'],
    ['base64.gzip', 'gzip'],
    ['base64.gunzip', 'gunzip'],
    ['url.encode-form', 'form-encode'],
    ['url.decode-form', 'form-decode'],
    ['base64.encode-each-line', 'base64-encode-each-line'],
    ['base64.decode-each-line', 'base64-decode-each-line'],
    ['nato.encode', 'nato'],
    ['data-uri.encode-text', 'data-uri'],
  ] as const).map(([name, transform]) => ({ name, transform, output: 'new-tab' as const })),
  ...([
    ['html.encode.replace', 'html-encode'],
    ['html.decode.replace', 'html-decode'],
    ['unicode.escape.replace', 'unicode-escape'],
    ['unicode.unescape.replace', 'unicode-unescape'],
    ['hex.encode.replace', 'hex-encode'],
    ['hex.decode.replace', 'hex-decode'],
  ] as const).map(([name, transform]) => ({ name, transform, output: 'replace' as const })),
].map((entry, i) => ({ id: `ENC-${String(i + 1).padStart(3, '0')}`, ...entry }));

export interface EncOptions {
  /** The document's end-of-line sequence (used for the soft line breaks of Quoted-Printable). */
  eol: string;
  /** ENC-023: how many letters to shift (a safe integer, negative shifts go backwards). */
  shift?: number;
}

/** The selected text cannot be converted (invalid input, input too long, ...). */
export class EncInputError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'EncInputError';
  }
}

/** The results of all selections together would exceed MAX_OUTPUT_LENGTH characters. */
export class EncOutputTooLargeError extends Error {
  constructor(readonly length: number, readonly limit: number) {
    super(`the result would be longer than ${limit.toLocaleString('en-US')} characters`);
    this.name = 'EncOutputTooLargeError';
  }
}

/** Upper limit of the total length (UTF-16 code units) of the results of all selections. */
export const MAX_OUTPUT_LENGTH = 10_000_000;
/** ENC-028: upper limit of the decompressed size in bytes (10 MiB). */
export const GUNZIP_MAX_OUTPUT_BYTES = 10 * 1024 * 1024;
/** ENC-011: upper limit of the input in UTF-8 bytes (Base58 conversion is quadratic). */
export const BASE58_MAX_ENCODE_BYTES = 10_000;
/** ENC-012: upper limit of the input in characters (about 10,000 bytes). */
export const BASE58_MAX_DECODE_LENGTH = 14_000;
/** ENC-017 / ENC-018: upper limit of the input in UTF-16 code units. */
export const PUNYCODE_MAX_INPUT_LENGTH = 1_000;

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

const utf8 = (text: string): Buffer => Buffer.from(text, 'utf8');

const strictUtf8Decoder = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true });

const decodeUtf8Strict = (bytes: Uint8Array): string => {
  try {
    return strictUtf8Decoder.decode(bytes);
  } catch {
    throw new EncInputError('the decoded bytes are not valid UTF-8 text');
  }
};

/** Removes spaces, tabs and line breaks (allowed anywhere in the input of most decoders). */
const removeWhitespace = (text: string): string => text.replace(/[ \t\r\n]/g, '');

const isWhitespace = (char: string): boolean => /^\s$/.test(char);

const isSpaceOrTab = (code: number): boolean => code === 0x20 || code === 0x09;

/** Removes trailing spaces and tabs (a loop instead of /[ \t]+$/, which is quadratic). */
const trimEndSpacesAndTabs = (text: string): string => {
  let end = text.length;
  while (end > 0 && isSpaceOrTab(text.charCodeAt(end - 1))) {
    end--;
  }
  return text.slice(0, end);
};

/** Removes leading and trailing spaces and tabs. */
const trimSpacesAndTabs = (text: string): string => {
  let start = 0;
  while (start < text.length && isSpaceOrTab(text.charCodeAt(start))) {
    start++;
  }
  return trimEndSpacesAndTabs(text.slice(start));
};

/** Splits into lines, keeping the line breaks as separate elements (odd indexes). */
const splitKeepingLineBreaks = (text: string): string[] => text.split(/(\r\n|\n)/);

const describeLength = (value: number): string => value.toLocaleString('en-US');

/**
 * Decodes standard Base64 (`+` `/`) or Base64URL (`-` `_`) strictly: only the alphabet and
 * correct trailing padding (which may be omitted), no impossible length, and no non-zero unused
 * bits in the last character. Whitespace must already have been removed.
 */
const decodeBase64Strict = (text: string, kind: 'base64' | 'base64url'): Buffer => {
  const valid = kind === 'base64' ? /^[A-Za-z0-9+/]*={0,2}$/ : /^[A-Za-z0-9_-]*={0,2}$/;
  if (!valid.test(text)) {
    throw new EncInputError(`the text contains characters that are not ${kind === 'base64' ? 'Base64' : 'Base64URL'}`);
  }
  const body = text.replace(/=/g, '');
  const padding = text.length - body.length;
  const remainder = body.length % 4;
  if (remainder === 1) {
    throw new EncInputError('the length of the encoded text is invalid');
  }
  if (padding > 0 && (text.length % 4 !== 0 || padding !== (4 - remainder) % 4)) {
    throw new EncInputError('the padding (=) is invalid');
  }
  const bytes = Buffer.from(body, kind);
  if (bytes.toString(kind).replace(/=/g, '') !== body) {
    throw new EncInputError('the last character has non-zero unused bits');
  }
  return bytes;
};

const isUpper = (code: number): boolean => code >= 0x41 && code <= 0x5a;
const isLower = (code: number): boolean => code >= 0x61 && code <= 0x7a;

/** Maps every ASCII letter with `map(indexInAlphabet)`; other characters stay as they are. */
const mapAsciiLetters = (text: string, map: (index: number) => number): string => {
  let result = '';
  for (let i = 0; i < text.length; i++) {
    const code = text.charCodeAt(i);
    if (isUpper(code)) {
      result += String.fromCharCode(0x41 + map(code - 0x41));
    } else if (isLower(code)) {
      result += String.fromCharCode(0x61 + map(code - 0x61));
    } else {
      result += text[i];
    }
  }
  return result;
};

const shiftLetters = (text: string, shift: number): string => {
  const normalized = ((shift % 26) + 26) % 26;
  return mapAsciiLetters(text, (index) => (index + normalized) % 26);
};

// ---------------------------------------------------------------------------
// HTML entities (ENC-001..003)
// ---------------------------------------------------------------------------

const HTML_ESCAPES: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
};

/** ISO 8859-1 (Latin-1) entity names for U+00A0..U+00FF, in code point order. */
const LATIN1_ENTITY_NAMES = [
  'nbsp', 'iexcl', 'cent', 'pound', 'curren', 'yen', 'brvbar', 'sect',
  'uml', 'copy', 'ordf', 'laquo', 'not', 'shy', 'reg', 'macr',
  'deg', 'plusmn', 'sup2', 'sup3', 'acute', 'micro', 'para', 'middot',
  'cedil', 'sup1', 'ordm', 'raquo', 'frac14', 'frac12', 'frac34', 'iquest',
  'Agrave', 'Aacute', 'Acirc', 'Atilde', 'Auml', 'Aring', 'AElig', 'Ccedil',
  'Egrave', 'Eacute', 'Ecirc', 'Euml', 'Igrave', 'Iacute', 'Icirc', 'Iuml',
  'ETH', 'Ntilde', 'Ograve', 'Oacute', 'Ocirc', 'Otilde', 'Ouml', 'times',
  'Oslash', 'Ugrave', 'Uacute', 'Ucirc', 'Uuml', 'Yacute', 'THORN', 'szlig',
  'agrave', 'aacute', 'acirc', 'atilde', 'auml', 'aring', 'aelig', 'ccedil',
  'egrave', 'eacute', 'ecirc', 'euml', 'igrave', 'iacute', 'icirc', 'iuml',
  'eth', 'ntilde', 'ograve', 'oacute', 'ocirc', 'otilde', 'ouml', 'divide',
  'oslash', 'ugrave', 'uacute', 'ucirc', 'uuml', 'yacute', 'thorn', 'yuml',
];

/**
 * Named entities ENC-002 understands: the five XML entities, the Latin-1 entities (including
 * `nbsp`) and frequently used symbols. Every entry is a single BMP character, which keeps the
 * output of ENC-002 no longer than its input (see estimateMaxOutputLength).
 * A Map (not an object literal) so that names such as `constructor` are never looked up on
 * Object.prototype.
 */
export const HTML_NAMED_ENTITIES: ReadonlyMap<string, string> = new Map<string, string>([
  ['amp', '&'], ['lt', '<'], ['gt', '>'], ['quot', '"'], ['apos', "'"],
  ...LATIN1_ENTITY_NAMES.map((name, i): [string, string] => [name, String.fromCharCode(0xa0 + i)]),
  ...([
    ['OElig', 0x152], ['oelig', 0x153], ['Scaron', 0x160], ['scaron', 0x161], ['Yuml', 0x178],
    ['fnof', 0x192], ['circ', 0x2c6], ['tilde', 0x2dc],
    ['ensp', 0x2002], ['emsp', 0x2003], ['thinsp', 0x2009],
    ['zwnj', 0x200c], ['zwj', 0x200d], ['lrm', 0x200e], ['rlm', 0x200f],
    ['ndash', 0x2013], ['mdash', 0x2014], ['lsquo', 0x2018], ['rsquo', 0x2019], ['sbquo', 0x201a],
    ['ldquo', 0x201c], ['rdquo', 0x201d], ['bdquo', 0x201e], ['dagger', 0x2020], ['Dagger', 0x2021],
    ['bull', 0x2022], ['hellip', 0x2026], ['permil', 0x2030], ['prime', 0x2032], ['Prime', 0x2033],
    ['lsaquo', 0x2039], ['rsaquo', 0x203a], ['euro', 0x20ac], ['trade', 0x2122],
    ['larr', 0x2190], ['uarr', 0x2191], ['rarr', 0x2192], ['darr', 0x2193], ['harr', 0x2194],
    ['minus', 0x2212], ['infin', 0x221e], ['ne', 0x2260], ['le', 0x2264], ['ge', 0x2265],
  ] as const).map(([name, code]): [string, string] => [name, String.fromCharCode(code)]),
]);

const isSurrogate = (code: number): boolean => code >= 0xd800 && code <= 0xdfff;

const htmlEncode = (text: string): string => text.replace(/[&<>"']/g, (char) => HTML_ESCAPES[char]);

const htmlDecode = (text: string): string =>
  text.replace(/&(?:#([0-9]+)|#[xX]([0-9A-Fa-f]+)|([A-Za-z][A-Za-z0-9]*));/g, (match, decimal?: string, hex?: string, name?: string) => {
    if (name !== undefined) {
      // Unknown names stay as they are (like browsers do).
      return HTML_NAMED_ENTITIES.get(name) ?? match;
    }
    const code = decimal !== undefined ? parseInt(decimal, 10) : parseInt(hex ?? '', 16);
    if (!(code > 0 && code <= 0x10ffff) || isSurrogate(code)) {
      throw new EncInputError(`${match} is not a valid character reference`);
    }
    return String.fromCodePoint(code);
  });

const htmlEncodeNumeric = (text: string): string => {
  let result = '';
  for (const char of text) {
    const code = char.codePointAt(0) ?? 0;
    result += code > 0x7f ? `&#${code};` : char;
  }
  return result;
};

// ---------------------------------------------------------------------------
// Unicode escapes (ENC-004..006)
// ---------------------------------------------------------------------------

const unicodeEscape = (text: string): string => {
  let result = '';
  for (let i = 0; i < text.length; i++) {
    const code = text.charCodeAt(i);
    result += code > 0x7f ? `\\u${code.toString(16).padStart(4, '0')}` : text[i];
  }
  return result;
};

const unicodeEscapeEs6 = (text: string): string => {
  let result = '';
  for (const char of text) {
    const code = char.codePointAt(0) ?? 0;
    result += code > 0x7f ? `\\u{${code.toString(16).toUpperCase()}}` : char;
  }
  return result;
};

const isHighSurrogate = (code: number): boolean => code >= 0xd800 && code <= 0xdbff;
const isLowSurrogate = (code: number): boolean => code >= 0xdc00 && code <= 0xdfff;

const unicodeUnescape = (text: string): string => {
  const pattern = /\\u\{([0-9A-Fa-f]{1,6})\}|\\u([0-9A-Fa-f]{4})/g;
  // Matches a `\uXXXX` exactly at lastIndex (for the low surrogate following a high one).
  const lowPattern = /\\u([0-9A-Fa-f]{4})/y;
  let result = '';
  let last = 0;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(text)) !== null) {
    result += text.slice(last, match.index);
    if (match[1] !== undefined) {
      const code = parseInt(match[1], 16);
      if (code > 0x10ffff) {
        throw new EncInputError(`${match[0]} is beyond U+10FFFF`);
      }
      if (isSurrogate(code)) {
        throw new EncInputError(`${match[0]} is a lone surrogate`);
      }
      result += String.fromCodePoint(code);
    } else {
      const code = parseInt(match[2], 16);
      if (isLowSurrogate(code)) {
        throw new EncInputError(`${match[0]} is a lone surrogate`);
      }
      if (isHighSurrogate(code)) {
        lowPattern.lastIndex = pattern.lastIndex;
        const low = lowPattern.exec(text);
        const lowCode = low ? parseInt(low[1], 16) : -1;
        if (!low || !isLowSurrogate(lowCode)) {
          throw new EncInputError(`${match[0]} is a lone surrogate`);
        }
        result += String.fromCharCode(code, lowCode);
        pattern.lastIndex = lowPattern.lastIndex;
      } else {
        result += String.fromCharCode(code);
      }
    }
    last = pattern.lastIndex;
  }
  return result + text.slice(last);
};

// ---------------------------------------------------------------------------
// Base32 (ENC-009 / ENC-010), RFC 4648
// ---------------------------------------------------------------------------

const BASE32_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

const base32Encode = (text: string): string => {
  const bytes = utf8(text);
  let result = '';
  let buffer = 0;
  let bits = 0;
  for (const byte of bytes) {
    buffer = ((buffer << 8) | byte) & 0xffff;
    bits += 8;
    while (bits >= 5) {
      bits -= 5;
      result += BASE32_ALPHABET[(buffer >> bits) & 0x1f];
    }
  }
  if (bits > 0) {
    result += BASE32_ALPHABET[(buffer << (5 - bits)) & 0x1f];
  }
  return result + '='.repeat((8 - (result.length % 8)) % 8);
};

/** Number of padding characters for each possible length of the last 8-character block. */
const BASE32_PADDING: Record<number, number> = { 0: 0, 2: 6, 4: 4, 5: 3, 7: 1 };

const base32Decode = (text: string): string => {
  const compact = removeWhitespace(text);
  if (!/^[A-Za-z2-7]*=*$/.test(compact)) {
    throw new EncInputError('the text contains characters that are not Base32');
  }
  const body = compact.replace(/=/g, '');
  const padding = compact.length - body.length;
  const expected = BASE32_PADDING[body.length % 8];
  if (expected === undefined) {
    throw new EncInputError('the length of the encoded text is invalid');
  }
  if (padding > 0 && padding !== expected) {
    throw new EncInputError('the padding (=) is invalid');
  }
  const bytes: number[] = [];
  let buffer = 0;
  let bits = 0;
  for (let i = 0; i < body.length; i++) {
    const code = body.charCodeAt(i);
    // ASCII-only case folding (the character set was validated above).
    const upper = isLower(code) ? code - 0x20 : code;
    buffer = ((buffer << 5) | BASE32_ALPHABET.indexOf(String.fromCharCode(upper))) & 0xfff;
    bits += 5;
    if (bits >= 8) {
      bits -= 8;
      bytes.push((buffer >> bits) & 0xff);
    }
  }
  if ((buffer & ((1 << bits) - 1)) !== 0) {
    throw new EncInputError('the last character has non-zero unused bits');
  }
  return decodeUtf8Strict(Uint8Array.from(bytes));
};

// ---------------------------------------------------------------------------
// Base58 (ENC-011 / ENC-012), Bitcoin alphabet
// ---------------------------------------------------------------------------

const BASE58_ALPHABET = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
const BASE58_LIMB_DIGITS = 5;
const BASE58_LIMB = 58 ** BASE58_LIMB_DIGITS;

const base58Encode = (text: string): string => {
  const bytes = utf8(text);
  if (bytes.length > BASE58_MAX_ENCODE_BYTES) {
    throw new EncInputError(`the input is too long (limit: ${describeLength(BASE58_MAX_ENCODE_BYTES)} UTF-8 bytes)`);
  }
  let zeros = 0;
  while (zeros < bytes.length && bytes[zeros] === 0) {
    zeros++;
  }
  // Limbs of 5 base-58 digits (58^5 < 2^30, so limb * 256 + carry stays a safe integer),
  // least significant first: five times fewer steps than one digit per limb.
  const limbs: number[] = [];
  for (let i = zeros; i < bytes.length; i++) {
    let carry = bytes[i];
    for (let j = 0; j < limbs.length; j++) {
      carry += limbs[j] * 256;
      limbs[j] = carry % BASE58_LIMB;
      carry = Math.floor(carry / BASE58_LIMB);
    }
    while (carry > 0) {
      limbs.push(carry % BASE58_LIMB);
      carry = Math.floor(carry / BASE58_LIMB);
    }
  }
  let digits = '';
  for (let i = limbs.length - 1; i >= 0; i--) {
    let limb = limbs[i];
    let chunk = '';
    for (let j = 0; j < BASE58_LIMB_DIGITS; j++) {
      chunk = BASE58_ALPHABET[limb % 58] + chunk;
      limb = Math.floor(limb / 58);
    }
    digits += chunk;
  }
  // The most significant limb is zero-padded: drop those leading zero digits ('1').
  let start = 0;
  while (start < digits.length && digits[start] === '1') {
    start++;
  }
  return '1'.repeat(zeros) + digits.slice(start);
};

const base58Decode = (text: string): string => {
  const compact = removeWhitespace(text);
  if (compact.length > BASE58_MAX_DECODE_LENGTH) {
    throw new EncInputError(`the input is too long (limit: ${describeLength(BASE58_MAX_DECODE_LENGTH)} characters)`);
  }
  let zeros = 0;
  while (zeros < compact.length && compact[zeros] === '1') {
    zeros++;
  }
  // Bytes, least significant first.
  const bytes: number[] = [];
  for (let i = zeros; i < compact.length; i++) {
    let carry = BASE58_ALPHABET.indexOf(compact[i]);
    if (carry < 0) {
      throw new EncInputError(`"${compact[i]}" is not a Base58 character`);
    }
    for (let j = 0; j < bytes.length; j++) {
      carry += bytes[j] * 58;
      bytes[j] = carry & 0xff;
      carry >>= 8;
    }
    while (carry > 0) {
      bytes.push(carry & 0xff);
      carry >>= 8;
    }
  }
  const result = new Uint8Array(zeros + bytes.length);
  for (let i = 0; i < bytes.length; i++) {
    result[zeros + i] = bytes[bytes.length - 1 - i];
  }
  return decodeUtf8Strict(result);
};

// ---------------------------------------------------------------------------
// Hex / binary (ENC-013..016)
// ---------------------------------------------------------------------------

const hexDecode = (text: string): string => {
  const tokens = text.split(/[ \t\r\n]+/).filter((token) => token !== '');
  let hex = '';
  for (const token of tokens) {
    // `0x` / `0X` prefixes may appear before every byte (e.g. `0x61 0x62` or `0x610x62`).
    const digits = token.replace(/0[xX]/g, '');
    if (!/^[0-9A-Fa-f]*$/.test(digits)) {
      throw new EncInputError(`"${token}" is not hexadecimal`);
    }
    if (digits.length % 2 !== 0) {
      throw new EncInputError(`"${token}" has an odd number of hexadecimal digits`);
    }
    hex += digits;
  }
  return decodeUtf8Strict(Buffer.from(hex, 'hex'));
};

const binaryEncode = (text: string): string =>
  Array.from(utf8(text), (byte) => byte.toString(2).padStart(8, '0')).join(' ');

const binaryDecode = (text: string): string => {
  const compact = removeWhitespace(text);
  if (!/^[01]*$/.test(compact)) {
    throw new EncInputError('the text contains characters other than 0 and 1');
  }
  if (compact.length % 8 !== 0) {
    throw new EncInputError('the number of bits is not a multiple of 8');
  }
  const bytes = new Uint8Array(compact.length / 8);
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = parseInt(compact.slice(i * 8, i * 8 + 8), 2);
  }
  return decodeUtf8Strict(bytes);
};

// ---------------------------------------------------------------------------
// Punycode (ENC-017 / ENC-018), via node:url (UTS #46)
// ---------------------------------------------------------------------------

const convertDomain = (text: string, convert: (domain: string) => string): string => {
  if (text.length > PUNYCODE_MAX_INPUT_LENGTH) {
    throw new EncInputError(`the input is too long (limit: ${describeLength(PUNYCODE_MAX_INPUT_LENGTH)} characters)`);
  }
  const result = convert(text.trim());
  if (result === '') {
    throw new EncInputError('the text is not a valid domain name');
  }
  return result;
};

// ---------------------------------------------------------------------------
// Quoted-Printable (ENC-019 / ENC-020), RFC 2045
// ---------------------------------------------------------------------------

const QP_MAX_LINE_LENGTH = 76;

const hexByte = (byte: number): string => byte.toString(16).toUpperCase().padStart(2, '0');

const qpEncodeLine = (line: string, eol: string): string => {
  const bytes = utf8(line);
  const tokens = Array.from(bytes, (byte, i) => {
    const isLast = i === bytes.length - 1;
    if (byte === 0x20 || byte === 0x09) {
      return isLast ? `=${hexByte(byte)}` : String.fromCharCode(byte);
    }
    return byte >= 33 && byte <= 126 && byte !== 0x3d ? String.fromCharCode(byte) : `=${hexByte(byte)}`;
  });
  let result = '';
  let current = '';
  for (const token of tokens) {
    // Leave room for the `=` of a soft line break.
    if (current.length + token.length > QP_MAX_LINE_LENGTH - 1) {
      result += `${current}=${eol}`;
      current = '';
    }
    current += token;
  }
  return result + current;
};

const qpEncode = (text: string, options: EncOptions): string =>
  text.split(/(\r\n|\n|\r)/)
    .map((part, i) => (i % 2 === 1 ? part : qpEncodeLine(part, options.eol)))
    .join('');

const isHexCode = (code: number): boolean =>
  (code >= 0x30 && code <= 0x39) || (code >= 0x41 && code <= 0x46) || (code >= 0x61 && code <= 0x66);

const qpDecode = (text: string): string => {
  const parts = text.split(/(\r\n|\n|\r)/);
  const bytes: number[] = [];
  for (let i = 0; i < parts.length; i += 2) {
    // Trailing whitespace of an encoded line is not part of the data (RFC 2045).
    let line = trimEndSpacesAndTabs(parts[i]);
    const soft = line.endsWith('=');
    if (soft) {
      line = line.slice(0, -1);
    }
    for (let j = 0; j < line.length; j++) {
      if (line[j] === '=') {
        if (j + 2 >= line.length || !isHexCode(line.charCodeAt(j + 1)) || !isHexCode(line.charCodeAt(j + 2))) {
          throw new EncInputError(`"=${line.slice(j + 1, j + 3)}" is not a valid escape (=XX)`);
        }
        bytes.push(parseInt(line.slice(j + 1, j + 3), 16));
        j += 2;
      } else {
        const code = line.codePointAt(j) ?? 0;
        const char = String.fromCodePoint(code);
        bytes.push(...utf8(char));
        j += char.length - 1;
      }
    }
    const lineBreak = parts[i + 1];
    if (lineBreak !== undefined && !soft) {
      bytes.push(...utf8(lineBreak));
    }
  }
  return decodeUtf8Strict(Uint8Array.from(bytes));
};

// ---------------------------------------------------------------------------
// Ascii85 (ENC-025 / ENC-026), Adobe variant
// ---------------------------------------------------------------------------

const ascii85Encode = (text: string): string => {
  const bytes = utf8(text);
  let result = '<~';
  for (let i = 0; i < bytes.length; i += 4) {
    const count = Math.min(4, bytes.length - i);
    let value = 0;
    for (let j = 0; j < 4; j++) {
      value = value * 256 + (j < count ? bytes[i + j] : 0);
    }
    if (count === 4 && value === 0) {
      result += 'z';
      continue;
    }
    const chars: string[] = [];
    for (let j = 0; j < 5; j++) {
      chars.unshift(String.fromCharCode(33 + (value % 85)));
      value = Math.floor(value / 85);
    }
    result += chars.slice(0, count + 1).join('');
  }
  return `${result}~>`;
};

const ascii85Decode = (text: string): string => {
  let compact = removeWhitespace(text);
  if (compact.startsWith('<~')) {
    compact = compact.slice(2);
  }
  if (compact.endsWith('~>')) {
    compact = compact.slice(0, -2);
  }
  const bytes: number[] = [];
  let group: number[] = [];
  const flush = (length: number) => {
    let value = 0;
    for (let j = 0; j < 5; j++) {
      value = value * 85 + (j < group.length ? group[j] : 84);
    }
    if (value > 0xffffffff) {
      throw new EncInputError('a group of the encoded text is out of range');
    }
    for (let j = 0; j < length; j++) {
      bytes.push(Math.floor(value / 256 ** (3 - j)) % 256);
    }
    group = [];
  };
  for (const char of compact) {
    if (char === 'z') {
      if (group.length > 0) {
        throw new EncInputError('"z" appears inside a group');
      }
      bytes.push(0, 0, 0, 0);
      continue;
    }
    const code = char.charCodeAt(0);
    if (char.length !== 1 || code < 33 || code > 117) {
      throw new EncInputError(`"${char}" is not an Ascii85 character`);
    }
    group.push(code - 33);
    if (group.length === 5) {
      flush(4);
    }
  }
  if (group.length === 1) {
    throw new EncInputError('the last group has only one character');
  }
  if (group.length > 0) {
    flush(group.length - 1);
  }
  return decodeUtf8Strict(Uint8Array.from(bytes));
};

// ---------------------------------------------------------------------------
// gzip (ENC-027 / ENC-028)
// ---------------------------------------------------------------------------

/**
 * ENC-027: gzip with the header fields that depend on the environment (MTIME, XFL, OS) set to
 * fixed values, so that the same input always gives the same output. None of them is used when
 * decompressing, and the CRC32 in the trailer does not cover the header (RFC 1952).
 */
const gzipBase64 = (text: string): string => {
  const compressed = gzipSync(utf8(text), { level: 6 });
  compressed.writeUInt32LE(0, 4); // MTIME
  compressed[8] = 0; // XFL
  compressed[9] = 0x13; // OS (the value of the ROADMAP example)
  return compressed.toString('base64');
};

const gunzipBase64 = (text: string): string => {
  const compressed = decodeBase64Strict(removeWhitespace(text), 'base64');
  let bytes: Buffer;
  try {
    bytes = gunzipSync(compressed, { maxOutputLength: GUNZIP_MAX_OUTPUT_BYTES });
  } catch (error) {
    if ((error as { code?: unknown } | null)?.code === 'ERR_BUFFER_TOO_LARGE') {
      throw new EncInputError(`the decompressed data is larger than ${describeLength(GUNZIP_MAX_OUTPUT_BYTES)} bytes`);
    }
    throw new EncInputError('the data is not valid gzip');
  }
  return decodeUtf8Strict(bytes);
};

// ---------------------------------------------------------------------------
// Form encoding (ENC-029 / ENC-030), application/x-www-form-urlencoded
// ---------------------------------------------------------------------------

const isFormSafe = (byte: number): boolean =>
  (byte >= 0x30 && byte <= 0x39) || isUpper(byte) || isLower(byte)
  || byte === 0x2a || byte === 0x2d || byte === 0x2e || byte === 0x5f;

const formEncode = (text: string): string => {
  let result = '';
  for (const byte of utf8(text)) {
    if (byte === 0x20) {
      result += '+';
    } else if (isFormSafe(byte)) {
      result += String.fromCharCode(byte);
    } else {
      result += `%${hexByte(byte)}`;
    }
  }
  return result;
};

const formDecode = (text: string): string => {
  try {
    return decodeURIComponent(text.replace(/\+/g, ' '));
  } catch {
    throw new EncInputError('the text contains an invalid percent-encoding (%XX)');
  }
};

// ---------------------------------------------------------------------------
// Base64 each line (ENC-031 / ENC-032)
// ---------------------------------------------------------------------------

const base64EncodeEachLine = (text: string): string =>
  splitKeepingLineBreaks(text)
    .map((part, i) => (i % 2 === 1 || part === '' ? part : utf8(part).toString('base64')))
    .join('');

const base64DecodeEachLine = (text: string): string =>
  splitKeepingLineBreaks(text)
    .map((part, i) => {
      if (i % 2 === 1) {
        return part;
      }
      const line = trimSpacesAndTabs(part);
      if (line === '') {
        return '';
      }
      try {
        return decodeUtf8Strict(decodeBase64Strict(line, 'base64'));
      } catch (error) {
        const reason = error instanceof Error ? error.message : String(error);
        throw new EncInputError(`line ${i / 2 + 1}: ${reason}`);
      }
    })
    .join('');

// ---------------------------------------------------------------------------
// NATO phonetic alphabet (ENC-033)
// ---------------------------------------------------------------------------

const NATO_LETTERS = [
  'Alfa', 'Bravo', 'Charlie', 'Delta', 'Echo', 'Foxtrot', 'Golf', 'Hotel', 'India', 'Juliett',
  'Kilo', 'Lima', 'Mike', 'November', 'Oscar', 'Papa', 'Quebec', 'Romeo', 'Sierra', 'Tango',
  'Uniform', 'Victor', 'Whiskey', 'X-ray', 'Yankee', 'Zulu',
];
const NATO_DIGITS = ['Zero', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine'];

const natoLine = (line: string): string => {
  const chars = Array.from(line);
  let start = 0;
  let end = chars.length;
  while (start < end && isWhitespace(chars[start])) {
    start++;
  }
  while (end > start && isWhitespace(chars[end - 1])) {
    end--;
  }
  const tokens: string[] = [];
  let inSpace = false;
  for (let i = start; i < end; i++) {
    const char = chars[i];
    if (isWhitespace(char)) {
      if (!inSpace) {
        tokens.push('/');
        inSpace = true;
      }
      continue;
    }
    inSpace = false;
    const code = char.charCodeAt(0);
    if (char.length === 1 && isUpper(code)) {
      tokens.push(NATO_LETTERS[code - 0x41]);
    } else if (char.length === 1 && isLower(code)) {
      tokens.push(NATO_LETTERS[code - 0x61]);
    } else if (char.length === 1 && code >= 0x30 && code <= 0x39) {
      tokens.push(NATO_DIGITS[code - 0x30]);
    } else {
      tokens.push(char);
    }
  }
  return tokens.join(' ');
};

const nato = (text: string): string =>
  splitKeepingLineBreaks(text).map((part, i) => (i % 2 === 1 ? part : natoLine(part))).join('');

// ---------------------------------------------------------------------------
// The transform table
// ---------------------------------------------------------------------------

export const DATA_URI_PREFIX = 'data:text/plain;charset=utf-8;base64,';

export const encTransforms: Record<EncCommand, (text: string, options: EncOptions) => string> = {
  'html-encode': htmlEncode,
  'html-decode': htmlDecode,
  'html-encode-numeric': htmlEncodeNumeric,
  'unicode-escape': unicodeEscape,
  'unicode-unescape': unicodeUnescape,
  'unicode-escape-es6': unicodeEscapeEs6,
  'base64url-encode': (text) => utf8(text).toString('base64url'),
  'base64url-decode': (text) => decodeUtf8Strict(decodeBase64Strict(removeWhitespace(text), 'base64url')),
  'base32-encode': base32Encode,
  'base32-decode': base32Decode,
  'base58-encode': base58Encode,
  'base58-decode': base58Decode,
  'hex-encode': (text) => utf8(text).toString('hex'),
  'hex-decode': hexDecode,
  'binary-encode': binaryEncode,
  'binary-decode': binaryDecode,
  'punycode-encode': (text) => convertDomain(text, domainToASCII),
  'punycode-decode': (text) => convertDomain(text, domainToUnicode),
  'qp-encode': qpEncode,
  'qp-decode': qpDecode,
  'rot13': (text) => shiftLetters(text, 13),
  'rot47': (text) => {
    let result = '';
    for (let i = 0; i < text.length; i++) {
      const code = text.charCodeAt(i);
      result += code >= 33 && code <= 126 ? String.fromCharCode(33 + ((code - 33 + 47) % 94)) : text[i];
    }
    return result;
  },
  'caesar': (text, options) => {
    const shift = options.shift;
    if (shift === undefined || !Number.isSafeInteger(shift)) {
      throw new EncInputError('the shift amount must be an integer');
    }
    return shiftLetters(text, shift);
  },
  'atbash': (text) => mapAsciiLetters(text, (index) => 25 - index),
  'ascii85-encode': ascii85Encode,
  'ascii85-decode': ascii85Decode,
  'gzip': gzipBase64,
  'gunzip': gunzipBase64,
  'form-encode': formEncode,
  'form-decode': formDecode,
  'base64-encode-each-line': base64EncodeEachLine,
  'base64-decode-each-line': base64DecodeEachLine,
  'nato': nato,
  'data-uri': (text) => DATA_URI_PREFIX + utf8(text).toString('base64'),
};

// ---------------------------------------------------------------------------
// Output size estimate
// ---------------------------------------------------------------------------

const base64Length = (bytes: number): number => Math.ceil(bytes / 3) * 4;

const countLines = (text: string): number => {
  let lines = 1;
  for (let i = text.indexOf('\n'); i >= 0; i = text.indexOf('\n', i + 1)) {
    lines++;
  }
  return lines;
};

/**
 * A conservative upper bound of the length (UTF-16 code units) of `encTransforms[command](text)`,
 * computed without converting. `undefined` for the transforms whose output cannot be bounded by
 * a factor of the input (Punycode: UTS #46 mappings expand characters; gunzip: limited by
 * GUNZIP_MAX_OUTPUT_BYTES while decompressing instead); the handler then relies on the actual
 * length only.
 */
export const estimateMaxOutputLength = (command: EncCommand, text: string): number | undefined => {
  const n = text.length;
  const b = (): number => Buffer.byteLength(text, 'utf8');
  switch (command) {
    case 'html-encode':
    case 'unicode-escape':
      return 6 * n;
    case 'html-encode-numeric':
    case 'unicode-escape-es6':
      return 8 * n;
    case 'base64url-encode':
      return base64Length(b());
    case 'data-uri':
      return base64Length(b()) + DATA_URI_PREFIX.length;
    case 'base64-encode-each-line':
      return base64Length(b()) + 4 * countLines(text);
    case 'base32-encode':
      return Math.ceil(b() / 5) * 8;
    case 'base58-encode':
      return 2 * b() + 1;
    case 'hex-encode':
      return 2 * b();
    case 'binary-encode':
      return 9 * b();
    case 'qp-encode':
      return 4 * b();
    case 'ascii85-encode':
      return Math.ceil(b() / 4) * 5 + 4;
    case 'gzip': {
      const bytes = b();
      return base64Length(bytes + Math.ceil(bytes / 1000) + 64);
    }
    case 'form-encode':
      return 3 * b();
    case 'nato':
      return 9 * n;
    case 'ascii85-decode':
      return 4 * n;
    case 'rot13':
    case 'rot47':
    case 'caesar':
    case 'atbash':
    case 'html-decode':
    case 'unicode-unescape':
    case 'base64url-decode':
    case 'base32-decode':
    case 'base58-decode':
    case 'hex-decode':
    case 'binary-decode':
    case 'qp-decode':
    case 'form-decode':
    case 'base64-decode-each-line':
      return n;
    case 'punycode-encode':
    case 'punycode-decode':
    case 'gunzip':
      return undefined;
  }
};
