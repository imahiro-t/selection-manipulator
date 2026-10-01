/**
 * Pure (vscode-independent) part of the encoding, escaping and hash commands of group ENC2
 * (showcase category ENCX, ENCX-001..022). The hash, checksum and validation algorithms are in
 * `hash2Transforms.ts` / `hashAlgorithms.ts`; this module has the 15 encoding and escaping
 * transforms (ENCX-001..015) and the table of all 22 commands.
 *
 * Rules shared with the ENC commands (`encodeTransforms.ts`):
 * - A transform takes the selected text and returns the converted text. Invalid input makes it
 *   throw `EncInputError` (the reason is in the message); it never returns a partial result.
 * - Encoders turn the text into UTF-8 bytes only after checking it (a lone surrogate is an error),
 *   and decoders turn their bytes back into text with a strict UTF-8 decoder (bytes that are not
 *   valid UTF-8 are an error instead of U+FFFD).
 * - Letters and digits are recognised by their ASCII code range only.
 * - No code is evaluated, and the only regular expression is a fixed line-break split: every
 *   scanner moves forward one character at a time (O(n)).
 * - Output size: `estimateEnc2OutputLength` gives an upper bound of the output length so that the
 *   handler can refuse a selection before building a huge string; the handler also checks the
 *   actual lengths against `MAX_OUTPUT_LENGTH`.
 */
import {
  decodeUtf8Strict,
  EncInputError,
  findLoneSurrogate,
  isAsciiDigit,
  isAsciiLower,
  isAsciiUpper,
  isRemovableWhitespace,
  quoteForMessage,
  removeWhitespace,
  utf8,
} from './encodeTransforms';

/** What a command does with its results. */
export type Enc2Kind =
  /** Converts every selection; the results open in one new editor (joined with the document's EOL). */
  | 'transform'
  /** Hashes every selection; the results open in one new editor with the selected text as headings. */
  | 'digest'
  /** Validates every selection and shows the results in a notification (nothing is edited or opened). */
  | 'notify';

/** The value a command asks for before it runs (once, for all selections). */
export type Enc2Input = 'uu-file-name' | 'shake-length' | 'hmac-key';

export interface Enc2CommandEntry {
  /** Showcase candidate ID, e.g. `ENCX-001`. */
  id: string;
  /** Command ID without the `selection-manipulator.` prefix. */
  name: string;
  /** The title in package.json. */
  title: string;
  /** The title in Show Commands. */
  showTitle: string;
  kind: Enc2Kind;
  input?: Enc2Input;
}

const entry = (
  id: number,
  name: string,
  title: string,
  showPrefix: string,
  kind: Enc2Kind,
  input?: Enc2Input
): Enc2CommandEntry => ({
  id: `ENCX-${String(id).padStart(3, '0')}`,
  name,
  title,
  showTitle: `${showPrefix}${title}`,
  kind,
  ...(input === undefined ? {} : { input }),
});

const ENCODE = 'Transform - Encode - ';
const URL_PREFIX = 'Transform - URL - ';
const CRYPTO = 'Transform - Crypto - ';
const CHECKSUM = 'Transform - Checksum - ';

/** The 22 commands in showcase order (candidates No.47..68 of SELEC-00091). */
export const ENC2_COMMAND_ENTRIES: readonly Enc2CommandEntry[] = [
  entry(1, 'base32.encode-hex', 'Encode Base32hex (RFC 4648 §7)', ENCODE, 'transform'),
  entry(2, 'base32.decode-hex', 'Decode Base32hex (RFC 4648 §7)', ENCODE, 'transform'),
  entry(3, 'base45.encode', 'Encode Base45 (RFC 9285)', ENCODE, 'transform'),
  entry(4, 'base45.decode', 'Decode Base45 (RFC 9285)', ENCODE, 'transform'),
  entry(5, 'base62.encode', 'Encode Base62', ENCODE, 'transform'),
  entry(6, 'base62.decode', 'Decode Base62', ENCODE, 'transform'),
  entry(7, 'uu.encode', 'Encode uuencode', ENCODE, 'transform', 'uu-file-name'),
  entry(8, 'uu.decode', 'Decode uuencode', ENCODE, 'transform'),
  entry(9, 'url.encode-all', 'Encode All Characters as Percent-encoding', URL_PREFIX, 'transform'),
  entry(10, 'escape.css-identifier', 'Escape CSS Identifier', '', 'transform'),
  entry(11, 'escape.ldap-filter', 'Escape LDAP Filter Value (RFC 4515)', '', 'transform'),
  entry(12, 'escape.ldap-dn', 'Escape LDAP DN Value (RFC 4514)', '', 'transform'),
  entry(13, 'escape.xpath-literal', 'Convert to XPath String Literal', '', 'transform'),
  entry(14, 'escape.c-string', 'Convert to C String Literal', '', 'transform'),
  entry(15, 'escape.c-unescape', 'Unescape C / Java Style Escapes', '', 'transform'),
  entry(16, 'crypto.hash-sha3-384', 'Create Hash (SHA3-384)', CRYPTO, 'digest'),
  entry(17, 'crypto.hash-shake256', 'Create Hash (SHAKE256, Output Length N)', CRYPTO, 'digest', 'shake-length'),
  entry(18, 'crypto.hmac-sha3-512', 'Create HMAC (SHA3-512)', CRYPTO, 'digest', 'hmac-key'),
  entry(19, 'checksum.crc16', 'Checksum: CRC-16/CCITT-FALSE', CHECKSUM, 'digest'),
  entry(20, 'checksum.crc32c', 'Checksum: CRC-32C (Castagnoli)', CHECKSUM, 'digest'),
  entry(21, 'checksum.iban', 'Checksum: IBAN Validate', CHECKSUM, 'notify'),
  entry(22, 'checksum.isbn', 'Checksum: ISBN-10 / ISBN-13 Validate', CHECKSUM, 'notify'),
];

/** The names of the 15 encoding and escaping transforms (ENCX-001..015). */
export type Enc2TransformName =
  | 'base32.encode-hex'
  | 'base32.decode-hex'
  | 'base45.encode'
  | 'base45.decode'
  | 'base62.encode'
  | 'base62.decode'
  | 'uu.encode'
  | 'uu.decode'
  | 'url.encode-all'
  | 'escape.css-identifier'
  | 'escape.ldap-filter'
  | 'escape.ldap-dn'
  | 'escape.xpath-literal'
  | 'escape.c-string'
  | 'escape.c-unescape';

export interface Enc2Options {
  /** The document's end-of-line sequence (the line breaks of uuencode). */
  eol: string;
  /** ENCX-007: the file name of the `begin` line (checked with `findUuFileNameProblem`). */
  fileName?: string;
}

/** ENCX-005: upper limit of the input in UTF-8 bytes (the Base62 conversion is quadratic). */
export const BASE62_MAX_ENCODE_BYTES = 10_000;
/** ENCX-006: upper limit of the input in characters (about 10,000 bytes). */
export const BASE62_MAX_DECODE_LENGTH = 13_500;
/** ENCX-007: the file name offered first, and the longest file name accepted. */
export const UU_DEFAULT_FILE_NAME = 'data';
export const UU_MAX_FILE_NAME_LENGTH = 64;
/** ENCX-007: bytes per uuencoded line (the usual maximum, 60 characters per line). */
const UU_LINE_BYTES = 45;

const describeLength = (value: number): string => value.toLocaleString('en-US');

const isHexCode = (code: number): boolean =>
  isAsciiDigit(code) || (code >= 0x41 && code <= 0x46) || (code >= 0x61 && code <= 0x66);
const hexValue = (code: number): number => (isAsciiDigit(code) ? code - 0x30 : (code | 0x20) - 0x61 + 10);

const hex2 = (byte: number): string => byte.toString(16).padStart(2, '0');
const hex2Upper = (byte: number): string => byte.toString(16).toUpperCase().padStart(2, '0');

/** A character of the selection for an error message, with its 1-based position. */
const describeChar = (text: string, index: number): string => {
  const code = text.codePointAt(index) ?? 0;
  return `${quoteForMessage(String.fromCodePoint(code))} at position ${index + 1}`;
};

/**
 * The index in `text` of the character at `compactIndex` in `removeWhitespace(text)`, so that an
 * error message gives the position in the selection itself, whitespace included. Only called on
 * the error path.
 */
const indexBeforeWhitespaceRemoval = (text: string, compactIndex: number): number => {
  let remaining = compactIndex;
  for (let i = 0; i < text.length; i++) {
    if (isRemovableWhitespace(text.charCodeAt(i))) {
      continue;
    }
    if (remaining === 0) {
      return i;
    }
    remaining--;
  }
  return text.length;
};

// ---------------------------------------------------------------------------
// ENCX-001 / ENCX-002: Base32hex (RFC 4648 §7)
// ---------------------------------------------------------------------------

const BASE32HEX_ALPHABET = '0123456789ABCDEFGHIJKLMNOPQRSTUV';
/** Number of padding characters for each possible length of the last 8-character block. */
const BASE32_PADDING: Record<number, number> = { 0: 0, 2: 6, 4: 4, 5: 3, 7: 1 };

const base32HexEncode = (text: string): string => {
  const bytes = utf8(text);
  let result = '';
  let buffer = 0;
  let bits = 0;
  for (const byte of bytes) {
    buffer = ((buffer << 8) | byte) & 0xffff;
    bits += 8;
    while (bits >= 5) {
      bits -= 5;
      result += BASE32HEX_ALPHABET[(buffer >> bits) & 0x1f];
    }
  }
  if (bits > 0) {
    result += BASE32HEX_ALPHABET[(buffer << (5 - bits)) & 0x1f];
  }
  return result + '='.repeat((8 - (result.length % 8)) % 8);
};

/** The value of a Base32hex digit (`0`-`9`, `A`-`V`, `a`-`v`), or -1. */
const base32HexValue = (code: number): number => {
  if (isAsciiDigit(code)) {
    return code - 0x30;
  }
  if (code >= 0x41 && code <= 0x56) {
    return code - 0x41 + 10;
  }
  if (code >= 0x61 && code <= 0x76) {
    return code - 0x61 + 10;
  }
  return -1;
};

const base32HexDecode = (text: string): string => {
  const compact = removeWhitespace(text);
  let body = compact.length;
  while (body > 0 && compact.charCodeAt(body - 1) === 0x3d) {
    body--;
  }
  for (let i = 0; i < body; i++) {
    if (base32HexValue(compact.charCodeAt(i)) < 0) {
      throw new EncInputError(`${describeChar(text, indexBeforeWhitespaceRemoval(text, i))} is not a Base32hex character`);
    }
  }
  const padding = compact.length - body;
  const expected = BASE32_PADDING[body % 8];
  if (expected === undefined) {
    throw new EncInputError('the length of the encoded text is invalid');
  }
  if (padding > 0 && padding !== expected) {
    throw new EncInputError('the padding (=) is invalid');
  }
  const bytes = new Uint8Array(Math.floor((body * 5) / 8));
  let length = 0;
  let buffer = 0;
  let bits = 0;
  for (let i = 0; i < body; i++) {
    buffer = ((buffer << 5) | base32HexValue(compact.charCodeAt(i))) & 0xfff;
    bits += 5;
    if (bits >= 8) {
      bits -= 8;
      bytes[length++] = (buffer >> bits) & 0xff;
    }
  }
  if ((buffer & ((1 << bits) - 1)) !== 0) {
    throw new EncInputError('the last character has non-zero unused bits');
  }
  return decodeUtf8Strict(bytes.subarray(0, length));
};

// ---------------------------------------------------------------------------
// ENCX-003 / ENCX-004: Base45 (RFC 9285)
// ---------------------------------------------------------------------------

const BASE45_ALPHABET = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ $%*+-./:';

const base45Encode = (text: string): string => {
  const bytes = utf8(text);
  let result = '';
  for (let i = 0; i + 1 < bytes.length; i += 2) {
    const n = bytes[i] * 256 + bytes[i + 1];
    result += BASE45_ALPHABET[n % 45] + BASE45_ALPHABET[Math.floor(n / 45) % 45] + BASE45_ALPHABET[Math.floor(n / 2025)];
  }
  if (bytes.length % 2 === 1) {
    const n = bytes[bytes.length - 1];
    result += BASE45_ALPHABET[n % 45] + BASE45_ALPHABET[Math.floor(n / 45)];
  }
  return result;
};

const isLineBreak = (code: number): boolean => code === 0x0a || code === 0x0d;

/**
 * Base45 decoding. The space is a Base45 character (value 36), so no space is removed; only the
 * CR / LF at the start and the end of the selection are (a selected line often ends with its line
 * break). A line break inside, a tab, a lowercase letter or any other character is an error.
 */
const base45Decode = (text: string): string => {
  let start = 0;
  let end = text.length;
  while (start < end && isLineBreak(text.charCodeAt(start))) {
    start++;
  }
  while (end > start && isLineBreak(text.charCodeAt(end - 1))) {
    end--;
  }
  const body = text.slice(start, end);
  const values = new Uint8Array(body.length);
  for (let i = 0; i < body.length; i++) {
    const code = body.charCodeAt(i);
    if (isLineBreak(code)) {
      throw new EncInputError('Base45 text must not contain line breaks (select one line per selection)');
    }
    const value = code < 0x80 ? BASE45_ALPHABET.indexOf(body[i]) : -1;
    if (value < 0) {
      throw new EncInputError(`invalid Base45 character ${describeChar(text, start + i)}`);
    }
    values[i] = value;
  }
  if (body.length % 3 === 1) {
    throw new EncInputError('the length must not leave a remainder of 1 when divided by 3');
  }
  const bytes = new Uint8Array(Math.floor(body.length / 3) * 2 + (body.length % 3 === 2 ? 1 : 0));
  let length = 0;
  for (let i = 0; i < body.length; i += 3) {
    if (i + 2 < body.length) {
      const n = values[i] + values[i + 1] * 45 + values[i + 2] * 2025;
      if (n > 0xffff) {
        throw new EncInputError(`the 3-character group at position ${start + i + 1} exceeds 65535`);
      }
      bytes[length++] = n >> 8;
      bytes[length++] = n & 0xff;
    } else {
      const n = values[i] + values[i + 1] * 45;
      if (n > 0xff) {
        throw new EncInputError(`the last 2-character group exceeds 255`);
      }
      bytes[length++] = n;
    }
  }
  return decodeUtf8Strict(bytes);
};

// ---------------------------------------------------------------------------
// ENCX-005 / ENCX-006: Base62 (0-9A-Za-z), the multi-precision method of Base58
// ---------------------------------------------------------------------------

const BASE62_ALPHABET = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';
const BASE62_LIMB_DIGITS = 5;
/** 62^5 < 2^30, so limb * 256 + carry stays a safe integer. */
const BASE62_LIMB = 62 ** BASE62_LIMB_DIGITS;

const base62Value = (code: number): number => {
  if (isAsciiDigit(code)) {
    return code - 0x30;
  }
  if (isAsciiUpper(code)) {
    return code - 0x41 + 10;
  }
  if (isAsciiLower(code)) {
    return code - 0x61 + 36;
  }
  return -1;
};

/** Each leading 0x00 byte becomes one `0` (as `1` in Base58), so that it survives a round trip. */
const base62Encode = (text: string): string => {
  const bytes = utf8(text);
  if (bytes.length > BASE62_MAX_ENCODE_BYTES) {
    throw new EncInputError(`the input is too long (limit: ${describeLength(BASE62_MAX_ENCODE_BYTES)} UTF-8 bytes)`);
  }
  let zeros = 0;
  while (zeros < bytes.length && bytes[zeros] === 0) {
    zeros++;
  }
  const limbs: number[] = [];
  for (let i = zeros; i < bytes.length; i++) {
    let carry = bytes[i];
    for (let j = 0; j < limbs.length; j++) {
      carry += limbs[j] * 256;
      limbs[j] = carry % BASE62_LIMB;
      carry = Math.floor(carry / BASE62_LIMB);
    }
    while (carry > 0) {
      limbs.push(carry % BASE62_LIMB);
      carry = Math.floor(carry / BASE62_LIMB);
    }
  }
  let digits = '';
  for (let i = limbs.length - 1; i >= 0; i--) {
    let limb = limbs[i];
    let chunk = '';
    for (let j = 0; j < BASE62_LIMB_DIGITS; j++) {
      chunk = BASE62_ALPHABET[limb % 62] + chunk;
      limb = Math.floor(limb / 62);
    }
    digits += chunk;
  }
  let start = 0;
  while (start < digits.length && digits[start] === '0') {
    start++;
  }
  return '0'.repeat(zeros) + digits.slice(start);
};

const base62Decode = (text: string): string => {
  const compact = removeWhitespace(text);
  if (compact.length > BASE62_MAX_DECODE_LENGTH) {
    throw new EncInputError(`the input is too long (limit: ${describeLength(BASE62_MAX_DECODE_LENGTH)} characters)`);
  }
  for (let i = 0; i < compact.length; i++) {
    if (base62Value(compact.charCodeAt(i)) < 0) {
      throw new EncInputError(`${describeChar(text, indexBeforeWhitespaceRemoval(text, i))} is not a Base62 character`);
    }
  }
  let zeros = 0;
  while (zeros < compact.length && compact.charCodeAt(zeros) === 0x30) {
    zeros++;
  }
  // Bytes, least significant first.
  const bytes: number[] = [];
  for (let i = zeros; i < compact.length; i++) {
    let carry = base62Value(compact.charCodeAt(i));
    for (let j = 0; j < bytes.length; j++) {
      carry += bytes[j] * 62;
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
// ENCX-007 / ENCX-008: uuencode
// ---------------------------------------------------------------------------

/**
 * Why `name` cannot be the file name of the `begin` line, or `undefined` when it can: 1 to 64
 * ASCII letters, digits, `.`, `_` and `-` (no space, path separator, line break or control
 * character, so that nothing can be injected into the header). No file is ever written.
 */
export const findUuFileNameProblem = (name: string): string | undefined => {
  const message = `Enter 1 to ${UU_MAX_FILE_NAME_LENGTH} letters, digits, ".", "_" or "-".`;
  if (name.length === 0 || name.length > UU_MAX_FILE_NAME_LENGTH) {
    return message;
  }
  for (let i = 0; i < name.length; i++) {
    const code = name.charCodeAt(i);
    if (!(isAsciiDigit(code) || isAsciiUpper(code) || isAsciiLower(code) || code === 0x2e || code === 0x5f || code === 0x2d)) {
      return message;
    }
  }
  return undefined;
};

/** A 6-bit value as a uuencode character (0 is written as a backquote instead of a space). */
const uuChar = (value: number): string => String.fromCharCode(value === 0 ? 0x60 : 0x20 + value);

const uuEncode = (text: string, options: Enc2Options): string => {
  const fileName = options.fileName ?? UU_DEFAULT_FILE_NAME;
  if (findUuFileNameProblem(fileName) !== undefined) {
    throw new EncInputError('the file name is not valid');
  }
  const bytes = utf8(text);
  const lines = [`begin 644 ${fileName}`];
  for (let offset = 0; offset < bytes.length; offset += UU_LINE_BYTES) {
    const count = Math.min(UU_LINE_BYTES, bytes.length - offset);
    let line = uuChar(count);
    for (let i = 0; i < count; i += 3) {
      const b0 = bytes[offset + i];
      const b1 = i + 1 < count ? bytes[offset + i + 1] : 0;
      const b2 = i + 2 < count ? bytes[offset + i + 2] : 0;
      line += uuChar(b0 >> 2) + uuChar(((b0 & 0x03) << 4) | (b1 >> 4)) + uuChar(((b1 & 0x0f) << 2) | (b2 >> 6)) + uuChar(b2 & 0x3f);
    }
    lines.push(line);
  }
  lines.push('`', 'end');
  return lines.join(options.eol);
};

/** The 6-bit value of a uuencode character (a space and a backquote are both 0), or -1. */
const uuValue = (code: number): number => (code >= 0x20 && code <= 0x60 ? (code - 0x20) & 0x3f : -1);

const startsWithBegin = (line: string): boolean =>
  line === 'begin' || (line.startsWith('begin') && (line.charCodeAt(5) === 0x20 || line.charCodeAt(5) === 0x09));

/**
 * uuencode decoding. A `begin` line before the data and the `end` line are skipped (the file name
 * and mode are never used and no file is written); empty lines are ignored. Each data line must
 * have exactly the number of characters its length character announces.
 */
const uuDecode = (text: string): string => {
  const lines = text.split(/\r\n|\n|\r/);
  const bytes = new Uint8Array(Math.floor((text.length * 3) / 4) + 3);
  let length = 0;
  let seenData = false;
  let ended = false;
  let finished = false;
  for (const [index, raw] of lines.entries()) {
    const where = `line ${index + 1}`;
    if (raw === '') {
      continue;
    }
    if (ended) {
      throw new EncInputError(`${where}: there is text after the "end" line`);
    }
    if (!seenData && startsWithBegin(raw)) {
      seenData = true;
      continue;
    }
    if (raw === 'end' || raw.trimEnd() === 'end') {
      ended = true;
      continue;
    }
    seenData = true;
    const count = uuValue(raw.charCodeAt(0));
    if (count < 0) {
      throw new EncInputError(`${where}: ${describeChar(raw, 0)} is not a uuencode length character`);
    }
    if (count === 0) {
      // The terminating line (a backquote or a space); only the "end" line may follow.
      finished = true;
      continue;
    }
    if (finished) {
      throw new EncInputError(`${where}: there is data after the terminating line`);
    }
    const characters = Math.ceil(count / 3) * 4;
    if (raw.length - 1 !== characters) {
      throw new EncInputError(`${where}: the length character announces ${count} bytes (${characters} characters), but the line has ${raw.length - 1}`);
    }
    for (let i = 1; i < raw.length; i++) {
      if (uuValue(raw.charCodeAt(i)) < 0) {
        throw new EncInputError(`${where}: ${describeChar(raw, i)} is not a uuencode character`);
      }
    }
    for (let i = 0, j = 1; i < count; i += 3, j += 4) {
      const c0 = uuValue(raw.charCodeAt(j));
      const c1 = uuValue(raw.charCodeAt(j + 1));
      const c2 = uuValue(raw.charCodeAt(j + 2));
      const c3 = uuValue(raw.charCodeAt(j + 3));
      bytes[length++] = (c0 << 2) | (c1 >> 4);
      if (i + 1 < count) {
        bytes[length++] = ((c1 & 0x0f) << 4) | (c2 >> 2);
      }
      if (i + 2 < count) {
        bytes[length++] = ((c2 & 0x03) << 6) | c3;
      }
    }
  }
  return decodeUtf8Strict(bytes.subarray(0, length));
};

// ---------------------------------------------------------------------------
// ENCX-009: percent-encode every byte
// ---------------------------------------------------------------------------

const urlEncodeAll = (text: string): string => {
  let result = '';
  for (const byte of utf8(text)) {
    result += `%${hex2Upper(byte)}`;
  }
  return result;
};

// ---------------------------------------------------------------------------
// ENCX-010: CSS identifier (CSSOM `CSS.escape`)
// ---------------------------------------------------------------------------

const cssEscape = (text: string): string => {
  let result = '';
  let index = 0;
  const firstCode = text.charCodeAt(0);
  for (const char of text) {
    const code = char.codePointAt(0) ?? 0;
    if (code === 0) {
      result += '\uFFFD';
    } else if ((code >= 0x01 && code <= 0x1f) || code === 0x7f
      || (index === 0 && isAsciiDigit(code))
      || (index === 1 && isAsciiDigit(code) && firstCode === 0x2d)) {
      result += `\\${code.toString(16)} `;
    } else if (index === 0 && code === 0x2d && text.length === 1) {
      result += '\\-';
    } else if (code >= 0x80 || code === 0x2d || code === 0x5f || isAsciiDigit(code) || isAsciiUpper(code) || isAsciiLower(code)) {
      result += char;
    } else {
      result += `\\${char}`;
    }
    index += char.length;
  }
  return result;
};

// ---------------------------------------------------------------------------
// ENCX-011 / ENCX-012: LDAP (RFC 4515 filter values, RFC 4514 DN attribute values)
// ---------------------------------------------------------------------------

const ldapFilterEscape = (text: string): string => {
  let result = '';
  for (let i = 0; i < text.length; i++) {
    const code = text.charCodeAt(i);
    result += code === 0x2a || code === 0x28 || code === 0x29 || code === 0x5c || code === 0x00 ? `\\${hex2(code)}` : text[i];
  }
  return result;
};

const ldapDnEscape = (text: string): string => {
  let result = '';
  for (let i = 0; i < text.length; i++) {
    const code = text.charCodeAt(i);
    if (code === 0x00) {
      result += '\\00';
    } else if (code === 0x22 || code === 0x2b || code === 0x2c || code === 0x3b || code === 0x3c || code === 0x3e || code === 0x5c) {
      result += `\\${text[i]}`;
    } else if ((i === 0 && (code === 0x23 || code === 0x20)) || (i === text.length - 1 && code === 0x20)) {
      result += `\\${text[i]}`;
    } else {
      result += text[i];
    }
  }
  return result;
};

// ---------------------------------------------------------------------------
// ENCX-013: XPath 1.0 string literal
// ---------------------------------------------------------------------------

/**
 * `'…'` when the text has no apostrophe, `"…"` when it has no quotation mark, otherwise
 * `concat(…)` of apostrophe-quoted parts and runs of apostrophes in quotation marks (always at
 * least 2 arguments, as XPath 1.0 requires). The expression is only generated, never evaluated.
 */
const xpathLiteral = (text: string): string => {
  if (!text.includes("'")) {
    return `'${text}'`;
  }
  if (!text.includes('"')) {
    return `"${text}"`;
  }
  const parts: string[] = [];
  let start = 0;
  while (start < text.length) {
    let end = start;
    if (text.charCodeAt(start) === 0x27) {
      while (end < text.length && text.charCodeAt(end) === 0x27) {
        end++;
      }
      parts.push(`"${text.slice(start, end)}"`);
    } else {
      while (end < text.length && text.charCodeAt(end) !== 0x27) {
        end++;
      }
      parts.push(`'${text.slice(start, end)}'`);
    }
    start = end;
  }
  return `concat(${parts.join(', ')})`;
};

// ---------------------------------------------------------------------------
// ENCX-014: C string literal
// ---------------------------------------------------------------------------

const C_SIMPLE_ESCAPES: Readonly<Record<number, string>> = {
  0x22: '\\"',
  0x5c: '\\\\',
  0x0a: '\\n',
  0x0d: '\\r',
  0x09: '\\t',
};

/**
 * A C string literal: `"` + body + `"` on one line. `\` `"` LF CR and tab are escaped as `\\`
 * `\"` `\n` `\r` `\t`; every other control character and every non-ASCII character becomes the
 * `\xHH` escapes of its UTF-8 bytes (lowercase). A C compiler reads all the hexadecimal digits
 * after `\x`, so when a hexadecimal digit follows a `\xHH`, the literal is split with `""` (the
 * adjacent literals are joined by the compiler). A `?` that follows a `?` is written `\?`, so that
 * no `??` (a trigraph introducer) is left, even in `???=`.
 */
const cString = (text: string): string => {
  const bytes = utf8(text);
  let result = '"';
  let afterHexEscape = false;
  let previousQuestion = false;
  for (const byte of bytes) {
    if (byte >= 0x80 || ((byte < 0x20 || byte === 0x7f) && C_SIMPLE_ESCAPES[byte] === undefined)) {
      result += `\\x${hex2(byte)}`;
      afterHexEscape = true;
      previousQuestion = false;
      continue;
    }
    const simple = C_SIMPLE_ESCAPES[byte];
    if (simple !== undefined) {
      result += simple;
    } else if (byte === 0x3f) {
      result += previousQuestion ? '\\?' : '?';
    } else {
      if (afterHexEscape && isHexCode(byte)) {
        result += '""';
      }
      result += String.fromCharCode(byte);
    }
    afterHexEscape = false;
    previousQuestion = byte === 0x3f;
  }
  return `${result}"`;
};

// ---------------------------------------------------------------------------
// ENCX-015: C / Java style unescape
// ---------------------------------------------------------------------------

const C_UNESCAPES: Readonly<Record<string, number>> = {
  'a': 0x07, 'b': 0x08, 'f': 0x0c, 'n': 0x0a, 'r': 0x0d, 't': 0x09, 'v': 0x0b,
  '\\': 0x5c, "'": 0x27, '"': 0x22, '?': 0x3f,
};

const isOctalCode = (code: number): boolean => code >= 0x30 && code <= 0x37;
const isHighSurrogate = (code: number): boolean => code >= 0xd800 && code <= 0xdbff;
const isLowSurrogate = (code: number): boolean => code >= 0xdc00 && code <= 0xdfff;

/** Collects the bytes of the result (never more than the UTF-8 bytes of the input). */
class ByteWriter {
  private readonly bytes: Buffer;
  private length = 0;

  constructor(capacity: number) {
    this.bytes = Buffer.allocUnsafe(capacity);
  }

  byte(value: number): void {
    this.bytes[this.length++] = value;
  }

  codePoint(code: number): void {
    if (code < 0x80) {
      this.byte(code);
    } else if (code < 0x800) {
      this.byte(0xc0 | (code >> 6));
      this.byte(0x80 | (code & 0x3f));
    } else if (code < 0x10000) {
      this.byte(0xe0 | (code >> 12));
      this.byte(0x80 | ((code >> 6) & 0x3f));
      this.byte(0x80 | (code & 0x3f));
    } else {
      this.byte(0xf0 | (code >> 18));
      this.byte(0x80 | ((code >> 12) & 0x3f));
      this.byte(0x80 | ((code >> 6) & 0x3f));
      this.byte(0x80 | (code & 0x3f));
    }
  }

  text(): string {
    return decodeUtf8Strict(this.bytes.subarray(0, this.length));
  }
}

/** Reads exactly `count` hexadecimal digits at `start` of `text` before `end`, or returns -1. */
const readFixedHex = (text: string, start: number, end: number, count: number): number => {
  if (start + count > end) {
    return -1;
  }
  let value = 0;
  for (let i = start; i < start + count; i++) {
    const code = text.charCodeAt(i);
    if (!isHexCode(code)) {
      return -1;
    }
    value = value * 16 + hexValue(code);
  }
  return value;
};

/**
 * Interprets the escape sequence whose backslash is at `index` (the body ends before `end`) and
 * returns the index after it. See `cUnescape` for the rules.
 */
const readEscape = (text: string, index: number, end: number, out: ByteWriter): number => {
  const at = `at position ${index + 1}`;
  if (index + 1 >= end) {
    throw new EncInputError(`a backslash ${at} is not followed by an escape`);
  }
  const code = text.charCodeAt(index + 1);
  const char = text[index + 1];
  if (isLineBreak(code)) {
    throw new EncInputError(`a backslash ${at} is followed by a line break (line continuations are not supported)`);
  }
  const simple = C_UNESCAPES[char];
  if (simple !== undefined && code < 0x80) {
    out.byte(simple);
    return index + 2;
  }
  if (isOctalCode(code)) {
    // Up to 3 octal digits, greedy (C and Java); \0 is the 1-digit case of the same rule.
    let next = index + 1;
    let value = 0;
    while (next < end && next < index + 4 && isOctalCode(text.charCodeAt(next))) {
      value = value * 8 + (text.charCodeAt(next) - 0x30);
      next++;
    }
    if (value > 0xff) {
      throw new EncInputError(`octal escape \\${text.slice(index + 1, next)} ${at} is out of range (max \\377)`);
    }
    out.byte(value);
    return next;
  }
  if (char === 'x') {
    // All the hexadecimal digits that follow (C); the value is checked while reading, so a long
    // run of digits cannot overflow, and the message shows at most 8 of them.
    let next = index + 2;
    let value = 0;
    while (next < end && isHexCode(text.charCodeAt(next))) {
      if (value <= 0xff) {
        value = value * 16 + hexValue(text.charCodeAt(next));
      }
      next++;
    }
    if (next === index + 2) {
      throw new EncInputError(`\\x ${at} must be followed by a hex digit`);
    }
    if (value > 0xff) {
      const digits = next - (index + 2);
      const shown = text.slice(index + 2, index + 2 + Math.min(digits, 8)) + (digits > 8 ? '…' : '');
      throw new EncInputError(`hex escape \\x${shown} ${at} is out of range (max \\xff)`);
    }
    out.byte(value);
    return next;
  }
  if (char === 'u' || char === 'U') {
    const count = char === 'u' ? 4 : 8;
    const value = readFixedHex(text, index + 2, end, count);
    if (value < 0) {
      throw new EncInputError(`\\${char} ${at} must be followed by exactly ${count} hex digits`);
    }
    const shown = `\\${char}${text.slice(index + 2, index + 2 + count)}`;
    if (value > 0x10ffff) {
      throw new EncInputError(`${shown} ${at} is beyond U+10FFFF`);
    }
    if (char === 'u' && isHighSurrogate(value)) {
      const low = text.charCodeAt(index + 6) === 0x5c && text.charCodeAt(index + 7) === 0x75
        ? readFixedHex(text, index + 8, end, 4)
        : -1;
      if (!isLowSurrogate(low)) {
        throw new EncInputError(`${shown} ${at} is a lone surrogate`);
      }
      out.codePoint(0x10000 + ((value - 0xd800) << 10) + (low - 0xdc00));
      return index + 12;
    }
    if (isHighSurrogate(value) || isLowSurrogate(value)) {
      throw new EncInputError(`${shown} ${at} is a lone surrogate`);
    }
    out.codePoint(value);
    return index + 2 + count;
  }
  throw new EncInputError(`unknown escape \\${quoteForMessage(String.fromCodePoint(text.codePointAt(index + 1) ?? code)).slice(1, -1)} ${at}`);
};

/** Copies `text[start, end)` to `out`, interpreting its escapes (the body of one literal). */
const readBody = (text: string, start: number, end: number, out: ByteWriter): void => {
  let i = start;
  while (i < end) {
    const code = text.charCodeAt(i);
    if (code === 0x5c) {
      i = readEscape(text, i, end, out);
      continue;
    }
    const point = text.codePointAt(i) ?? code;
    out.codePoint(point);
    i += point > 0xffff ? 2 : 1;
  }
};

/** Whether the last character of `text` is a `"` not escaped by a backslash (an even number of backslashes before it). */
const endsWithUnescapedQuote = (text: string): boolean => {
  if (text.charCodeAt(text.length - 1) !== 0x22) {
    return false;
  }
  let backslashes = 0;
  for (let i = text.length - 2; i >= 0 && text.charCodeAt(i) === 0x5c; i--) {
    backslashes++;
  }
  return backslashes % 2 === 0;
};

const isSpaceTabOrLineBreak = (code: number): boolean => code === 0x20 || code === 0x09 || code === 0x0a || code === 0x0d;

/**
 * C / Java style unescaping, by a forward scanner (no `eval`, no regular expression).
 *
 * Two modes:
 * - Literal sequence: when the selection starts with `"` and ends with an unescaped `"` (2 or
 *   more characters), it is read as a sequence of C string literals: the body of each literal is
 *   unescaped and the bodies are joined (C's adjacent literal concatenation; each escape ends with
 *   its literal, so `"\x4""1"` is 0x04 + `1`). Only spaces, tabs and line breaks may separate the
 *   literals, a body must not contain a raw line break, and every literal must be closed.
 * - Body: otherwise the whole selection is the body of one literal; an unescaped `"` and raw line
 *   breaks are kept as they are.
 *
 * Escapes: `\a \b \f \n \r \t \v \\ \' \" \?`; octal `\o`, `\oo`, `\ooo` (greedy, at most 3
 * digits, at most \377; `\0` is the 1-digit case); `\x` followed by any number of hexadecimal
 * digits (greedy, as in C; at most \xff); `\uXXXX` (a high and a low surrogate in a row make one
 * character, as in Java) and `\UXXXXXXXX` (at most U+10FFFF, no surrogate). `\x` and octal values
 * are bytes and the result is decoded as UTF-8 (`\xe3\x81\x82` is `あ`; bytes that are not valid
 * UTF-8 are an error). Anything else after a backslash is an error.
 */
const cUnescape = (text: string): string => {
  const lone = findLoneSurrogate(text);
  if (lone !== undefined) {
    throw new EncInputError(`the text contains a lone surrogate (\\u${lone.toString(16).padStart(4, '0')})`);
  }
  const out = new ByteWriter(Buffer.byteLength(text, 'utf8'));
  if (!(text.length >= 2 && text.charCodeAt(0) === 0x22 && endsWithUnescapedQuote(text))) {
    readBody(text, 0, text.length, out);
    return out.text();
  }
  let i = 0;
  while (i < text.length) {
    const code = text.charCodeAt(i);
    if (isSpaceTabOrLineBreak(code)) {
      i++;
      continue;
    }
    if (code !== 0x22) {
      throw new EncInputError(`unexpected text between string literals at position ${i + 1}`);
    }
    // Find the closing quote, skipping escaped characters.
    const open = i;
    let close = i + 1;
    while (close < text.length && text.charCodeAt(close) !== 0x22) {
      const inner = text.charCodeAt(close);
      if (isLineBreak(inner)) {
        throw new EncInputError(`a string literal must not contain a line break (position ${close + 1})`);
      }
      close += inner === 0x5c ? 2 : 1;
    }
    if (close >= text.length) {
      throw new EncInputError(`the string literal at position ${open + 1} is not closed`);
    }
    readBody(text, open + 1, close, out);
    i = close + 1;
  }
  return out.text();
};

// ---------------------------------------------------------------------------
// The transform table and the output size estimate
// ---------------------------------------------------------------------------

export const enc2Transforms: Record<Enc2TransformName, (text: string, options: Enc2Options) => string> = {
  'base32.encode-hex': base32HexEncode,
  'base32.decode-hex': base32HexDecode,
  'base45.encode': base45Encode,
  'base45.decode': base45Decode,
  'base62.encode': base62Encode,
  'base62.decode': base62Decode,
  'uu.encode': uuEncode,
  'uu.decode': uuDecode,
  'url.encode-all': urlEncodeAll,
  'escape.css-identifier': cssEscape,
  'escape.ldap-filter': ldapFilterEscape,
  'escape.ldap-dn': ldapDnEscape,
  'escape.xpath-literal': xpathLiteral,
  'escape.c-string': cString,
  'escape.c-unescape': cUnescape,
};

export const isEnc2TransformName = (name: string): name is Enc2TransformName =>
  Object.prototype.hasOwnProperty.call(enc2Transforms, name);

/**
 * An upper bound of the length (UTF-16 code units) of `enc2Transforms[name](text, options)`,
 * computed without converting, so that the handler can refuse a selection before converting it.
 */
export const estimateEnc2OutputLength = (name: Enc2TransformName, text: string, options: Enc2Options): number => {
  const n = text.length;
  // A lone surrogate counts as 3 bytes here (it is rejected when converting anyway).
  const b = (): number => Buffer.byteLength(text, 'utf8');
  switch (name) {
    case 'base32.encode-hex':
      return Math.ceil(b() / 5) * 8;
    case 'base45.encode':
      return Math.ceil(b() / 2) * 3;
    case 'base62.encode':
      return 2 * b() + 1;
    case 'uu.encode': {
      const eol = options.eol.length;
      const lines = Math.ceil(b() / UU_LINE_BYTES);
      return 'begin 644 '.length + UU_MAX_FILE_NAME_LENGTH + eol + lines * (61 + eol) + 1 + eol + 3;
    }
    case 'url.encode-all':
      return 3 * b();
    case 'escape.css-identifier':
      // `\` + up to 2 hex digits + space for a control character or a digit, `\` + char otherwise.
      return 4 * n;
    case 'escape.ldap-filter':
    case 'escape.ldap-dn':
      return 3 * n;
    case 'escape.xpath-literal':
      // Every part adds its quotes and `, `: at most 6 characters per character, plus `concat()`.
      return 6 * n + 10;
    case 'escape.c-string':
      // A BMP character is at most 3 bytes = 12 characters, plus a `""` split.
      return 14 * n + 2;
    case 'base32.decode-hex':
    case 'base45.decode':
    case 'base62.decode':
    case 'uu.decode':
    case 'escape.c-unescape':
      return n;
  }
};
