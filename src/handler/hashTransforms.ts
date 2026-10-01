/**
 * Pure (vscode-independent) part of the HASH-001..HASH-020 hash and checksum commands.
 *
 * Where each algorithm is computed is fixed (no runtime fallback based on `getHashes()`), so the
 * result never depends on the environment:
 * - `node:crypto`: SHA-224, SHA-384, SHA-512/256, SHA-256, and HMAC-SHA1 / HMAC-SHA384
 *   (available in the Electron / BoringSSL build that runs the extension host);
 * - `hashAlgorithms.ts`: SHA3-256, SHA3-512, BLAKE2b-512, BLAKE2s-256, HMAC-SHA3-256, CRC-32,
 *   Adler-32 and FNV-1a (not available there).
 *
 * Every command works on the UTF-8 bytes of the selected text as it is (not trimmed, CRLF kept).
 * A selection that contains a lone surrogate is an error (`EncInputError`, the same message as
 * the ENC commands) instead of silently becoming U+FFFD.
 */
import { createHash, createHmac } from 'node:crypto';
import { findLoneSurrogate, utf8 } from './encodeTransforms';
import {
  adler32,
  blake2b512,
  blake2s256,
  crc32,
  fnv1a32,
  hmacSha3_256,
  sha3_256,
  sha3_512,
} from './hashAlgorithms';

/** Digest algorithms offered by the HASH commands (a fixed allow-list). */
export type HashAlgorithm =
  | 'sha224'
  | 'sha384'
  | 'sha512-256'
  | 'sha256'
  | 'sha3-256'
  | 'sha3-512'
  | 'blake2b512'
  | 'blake2s256';

/** HMAC algorithms offered by the HASH commands. */
export type HmacAlgorithm = 'sha1' | 'sha384' | 'sha3-256';

/** Non-cryptographic checksums (error detection only). */
export type ChecksumAlgorithm = 'crc32' | 'adler32' | 'fnv1a-32';

/** How a digest is written out. */
export type DigestEncoding = 'hex' | 'base64' | 'sri';

/** Where a command puts its result: a new read-only editor, in place of each selection, or a notification. */
export type HashOutput = 'new-tab' | 'replace' | 'notify';

export type HashCommandKind =
  | { kind: 'digest'; algorithm: HashAlgorithm; encoding: DigestEncoding }
  | { kind: 'digest-each-line'; algorithm: 'sha256' }
  | { kind: 'hmac'; algorithm: HmacAlgorithm }
  | { kind: 'checksum'; algorithm: ChecksumAlgorithm }
  | { kind: 'luhn' };

export type HashCommandEntry = HashCommandKind & {
  /** ROADMAP ID, e.g. `HASH-001`. */
  id: string;
  /** Command ID without the `selection-manipulator.` prefix. */
  name: string;
  output: HashOutput;
};

/** The 20 commands in ROADMAP order: 17 basic commands followed by 3 "(Replace)" variants. */
export const HASH_COMMAND_ENTRIES: readonly HashCommandEntry[] = [
  { id: 'HASH-001', name: 'crypto.hash-sha224', kind: 'digest', algorithm: 'sha224', encoding: 'hex', output: 'new-tab' },
  { id: 'HASH-002', name: 'crypto.hash-sha384', kind: 'digest', algorithm: 'sha384', encoding: 'hex', output: 'new-tab' },
  { id: 'HASH-003', name: 'crypto.hash-sha3-256', kind: 'digest', algorithm: 'sha3-256', encoding: 'hex', output: 'new-tab' },
  { id: 'HASH-004', name: 'crypto.hash-sha3-512', kind: 'digest', algorithm: 'sha3-512', encoding: 'hex', output: 'new-tab' },
  { id: 'HASH-005', name: 'crypto.hash-sha512-256', kind: 'digest', algorithm: 'sha512-256', encoding: 'hex', output: 'new-tab' },
  { id: 'HASH-006', name: 'crypto.hash-blake2b512', kind: 'digest', algorithm: 'blake2b512', encoding: 'hex', output: 'new-tab' },
  { id: 'HASH-007', name: 'crypto.hash-blake2s256', kind: 'digest', algorithm: 'blake2s256', encoding: 'hex', output: 'new-tab' },
  { id: 'HASH-008', name: 'crypto.hmac-sha1', kind: 'hmac', algorithm: 'sha1', output: 'new-tab' },
  { id: 'HASH-009', name: 'crypto.hmac-sha384', kind: 'hmac', algorithm: 'sha384', output: 'new-tab' },
  { id: 'HASH-010', name: 'crypto.hmac-sha3-256', kind: 'hmac', algorithm: 'sha3-256', output: 'new-tab' },
  { id: 'HASH-011', name: 'checksum.crc32', kind: 'checksum', algorithm: 'crc32', output: 'new-tab' },
  { id: 'HASH-012', name: 'checksum.adler32', kind: 'checksum', algorithm: 'adler32', output: 'new-tab' },
  { id: 'HASH-013', name: 'checksum.fnv1a-32', kind: 'checksum', algorithm: 'fnv1a-32', output: 'new-tab' },
  { id: 'HASH-014', name: 'crypto.hash-sha256-base64', kind: 'digest', algorithm: 'sha256', encoding: 'base64', output: 'new-tab' },
  { id: 'HASH-015', name: 'crypto.sri-sha384', kind: 'digest', algorithm: 'sha384', encoding: 'sri', output: 'new-tab' },
  { id: 'HASH-016', name: 'crypto.hash-sha256-each-line', kind: 'digest-each-line', algorithm: 'sha256', output: 'new-tab' },
  { id: 'HASH-017', name: 'checksum.luhn', kind: 'luhn', output: 'notify' },
  { id: 'HASH-018', name: 'crypto.hash-sha384.replace', kind: 'digest', algorithm: 'sha384', encoding: 'hex', output: 'replace' },
  { id: 'HASH-019', name: 'crypto.hash-sha3-256.replace', kind: 'digest', algorithm: 'sha3-256', encoding: 'hex', output: 'replace' },
  { id: 'HASH-020', name: 'crypto.hash-blake2b512.replace', kind: 'digest', algorithm: 'blake2b512', encoding: 'hex', output: 'replace' },
];

/** The algorithms computed with `node:crypto` (checked by a test against the extension host's `getHashes()`). */
export const NODE_CRYPTO_ALGORITHMS: readonly string[] = ['sha224', 'sha384', 'sha512-256', 'sha256', 'sha1'];

// ---------------------------------------------------------------------------
// Digests
// ---------------------------------------------------------------------------

export const toHex = (bytes: Uint8Array): string => Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength).toString('hex');
const toBase64 = (bytes: Uint8Array): string => Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength).toString('base64');

/** The digest of `bytes`. */
export const digestBytes = (algorithm: HashAlgorithm, bytes: Uint8Array): Uint8Array => {
  switch (algorithm) {
    case 'sha3-256':
      return sha3_256(bytes);
    case 'sha3-512':
      return sha3_512(bytes);
    case 'blake2b512':
      return blake2b512(bytes);
    case 'blake2s256':
      return blake2s256(bytes);
    case 'sha224':
    case 'sha384':
    case 'sha512-256':
    case 'sha256':
      return createHash(algorithm).update(bytes).digest();
  }
};

/** The digest of the UTF-8 bytes of `text` in the given encoding (`sri` = `sha384-` + Base64 for SHA-384). */
export const digestText = (algorithm: HashAlgorithm, encoding: DigestEncoding, text: string): string => {
  const digest = digestBytes(algorithm, utf8(text));
  switch (encoding) {
    case 'hex':
      return toHex(digest);
    case 'base64':
      return toBase64(digest);
    case 'sri':
      return `${algorithm}-${toBase64(digest)}`;
  }
};

/** The HMAC of `message` with `key` (both bytes). */
export const hmacBytes = (algorithm: HmacAlgorithm, key: Uint8Array, message: Uint8Array): Uint8Array => {
  switch (algorithm) {
    case 'sha3-256':
      return hmacSha3_256(key, message);
    case 'sha1':
    case 'sha384':
      return createHmac(algorithm, key).update(message).digest();
  }
};

/** The HMAC (hex) of the UTF-8 bytes of `text`; `key` is the UTF-8 bytes of the key (see `keyBytes`). */
export const hmacText = (algorithm: HmacAlgorithm, key: Uint8Array, text: string): string =>
  toHex(hmacBytes(algorithm, key, utf8(text)));

const CHECKSUMS: Record<ChecksumAlgorithm, (bytes: Uint8Array) => number> = {
  'crc32': crc32,
  'adler32': adler32,
  'fnv1a-32': fnv1a32,
};

/** The checksum of the UTF-8 bytes of `text` as 8 lowercase hexadecimal digits. */
export const checksumText = (algorithm: ChecksumAlgorithm, text: string): string =>
  CHECKSUMS[algorithm](utf8(text)).toString(16).padStart(8, '0');

// ---------------------------------------------------------------------------
// HMAC keys
// ---------------------------------------------------------------------------

export const KEY_EMPTY_MESSAGE = 'The key must not be empty.';
export const KEY_LONE_SURROGATE_MESSAGE = 'The key contains a lone surrogate.';

/** The key was rejected; the message is one of the fixed texts above and never contains the key. */
export class HashKeyError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'HashKeyError';
  }
}

/**
 * Why `key` cannot be used as an HMAC key, or `undefined` when it can. The messages are fixed
 * texts that contain neither the key nor any of its code units (used as the input box's
 * `validateInput` and again after the input box closes).
 */
export const findKeyProblem = (key: string): string | undefined => {
  if (key === '') {
    return KEY_EMPTY_MESSAGE;
  }
  if (findLoneSurrogate(key) !== undefined) {
    return KEY_LONE_SURROGATE_MESSAGE;
  }
  return undefined;
};

/** The UTF-8 bytes of an HMAC key; throws `HashKeyError` with the `findKeyProblem` message for a rejected key. */
export const keyBytes = (key: string): Buffer => {
  const problem = findKeyProblem(key);
  if (problem !== undefined) {
    throw new HashKeyError(problem);
  }
  return Buffer.from(key, 'utf8');
};

// ---------------------------------------------------------------------------
// HASH-016: one hash per line
// ---------------------------------------------------------------------------

/** Line breaks recognised by HASH-016 (kept as they are in the output). */
const LINE_BREAK = /(\r\n|\n|\r)/;

/**
 * HASH-016: the SHA-256 (hex) of every line of `text`, with the original line breaks (`\r\n`,
 * `\n` or `\r`) kept between them. An empty line stays empty (no hash of the empty string), so a
 * trailing line break also leaves the last line empty.
 */
export const hashEachLine = (text: string): string =>
  text
    .split(LINE_BREAK)
    .map((part, i) => (i % 2 === 1 || part === '' ? part : digestText('sha256', 'hex', part)))
    .join('');

// ---------------------------------------------------------------------------
// Output size
// ---------------------------------------------------------------------------

const SHA256_HEX_LENGTH = 64;

/** Length of the digest of each algorithm in hex digits. */
const HEX_LENGTH: Record<HashAlgorithm, number> = {
  'sha224': 56,
  'sha384': 96,
  'sha512-256': 64,
  'sha256': 64,
  'sha3-256': 64,
  'sha3-512': 128,
  'blake2b512': 128,
  'blake2s256': 64,
};

/** Length of the HMAC of each algorithm in hex digits. */
const HMAC_HEX_LENGTH: Record<HmacAlgorithm, number> = {
  'sha1': 40,
  'sha384': 96,
  'sha3-256': 64,
};

/**
 * An upper bound of the output length of a command for `text` (the length of the result only,
 * as for the ENC commands), so that the handler can refuse a selection before hashing it.
 * HASH-016 grows with the number of lines (64 characters per line plus the line breaks); every
 * other command has a fixed-length result.
 */
export const estimateHashOutputLength = (entry: HashCommandKind, text: string): number => {
  switch (entry.kind) {
    case 'digest': {
      if (entry.encoding === 'hex') {
        return HEX_LENGTH[entry.algorithm];
      }
      // Base64 of n bytes is 4 * ceil(n / 3) characters; the SRI prefix (e.g. "sha384-") adds its length.
      const base64Length = 4 * Math.ceil(HEX_LENGTH[entry.algorithm] / 2 / 3);
      return entry.encoding === 'sri' ? `${entry.algorithm}-`.length + base64Length : base64Length;
    }
    case 'digest-each-line': {
      let breaks = 0;
      let breakCharacters = 0;
      for (let i = 0; i < text.length; i++) {
        const code = text.charCodeAt(i);
        if (code === 0x0d) {
          breaks++;
          breakCharacters++;
          if (text.charCodeAt(i + 1) === 0x0a) {
            breakCharacters++;
            i++;
          }
        } else if (code === 0x0a) {
          breaks++;
          breakCharacters++;
        }
      }
      return (breaks + 1) * SHA256_HEX_LENGTH + breakCharacters;
    }
    case 'hmac':
      return HMAC_HEX_LENGTH[entry.algorithm];
    case 'checksum':
      return 8;
    case 'luhn':
      return 0;
  }
};

// ---------------------------------------------------------------------------
// HASH-017: Luhn
// ---------------------------------------------------------------------------

export type LuhnResult =
  | { verdict: 'valid' }
  | { verdict: 'invalid' }
  | { verdict: 'not-a-number'; reason: 'invalid-character' | 'too-short' };

/**
 * HASH-017: checks the Luhn check digit of `text`.
 *
 * Leading and trailing whitespace (including line breaks) is ignored, and so is a single
 * half-width space or hyphen between two digits (`4111 1111 1111 1111`, `4111-1111-1111-1111`).
 * The result is `not-a-number` with reason:
 * - `invalid-character` for any other character (letters, full-width digits, `+` and other
 *   symbols, a tab or a line break inside the number, ...), and for a separator that is not
 *   between two digits: a leading or trailing hyphen (`-79927398713`, `79927398713-`) or two
 *   separators in a row (`7--9927398713`, `7992 -7398713`);
 * - `too-short` for fewer than 2 digits (made of digits, spaces and hyphens only, e.g. `5`, `-`).
 * There is no upper limit on the number of digits; the text is read once from the end (O(n),
 * no per-digit allocation).
 */
export const luhnCheck = (text: string): LuhnResult => {
  const trimmed = text.trim();
  let digitCount = 0;
  let sum = 0;
  let misplacedSeparator = false;
  // Reading from the end, whether the character just read (the one after the current one) is a digit.
  let nextIsDigit = false;
  for (let i = trimmed.length - 1; i >= 0; i--) {
    const code = trimmed.charCodeAt(i);
    if (code >= 0x30 && code <= 0x39) {
      let d = code - 0x30;
      if (digitCount % 2 === 1) {
        d *= 2;
        if (d > 9) {
          d -= 9;
        }
      }
      sum += d;
      digitCount++;
      nextIsDigit = true;
    } else if (code === 0x20 || code === 0x2d) {
      if (!nextIsDigit) {
        misplacedSeparator = true;
      }
      nextIsDigit = false;
    } else {
      return { verdict: 'not-a-number', reason: 'invalid-character' };
    }
  }
  if (digitCount < 2) {
    return { verdict: 'not-a-number', reason: 'too-short' };
  }
  // `nextIsDigit` is now whether the first character is a digit.
  if (misplacedSeparator || !nextIsDigit) {
    return { verdict: 'not-a-number', reason: 'invalid-character' };
  }
  return { verdict: sum % 10 === 0 ? 'valid' : 'invalid' };
};

/** How `formatVerdictMessage` words the results of one kind of validation. */
export interface VerdictMessageFormat<R extends { verdict: string }> {
  /** The prefix of the 2+ selection forms (`Luhn`, `IBAN`, `ISBN`). */
  label: string;
  /** With more selections than this, only the counts are given. */
  listLimit: number;
  /** The whole message for a single selection (it may give a reason). */
  single: (result: R) => string;
  /** One result in the numbered list of 2..listLimit selections (no reasons). */
  word: (result: R) => string;
  /** The verdicts counted with 11+ selections, in order, with their words (zero counts included). */
  counts: readonly (readonly [R['verdict'], string])[];
}

/**
 * The common shape of the validation notifications (Luhn, IBAN, ISBN): the message of `single`
 * for 1 selection, `<label>: #1 <word>, #2 <word>` for 2..listLimit selections and
 * `<label>: N selections: <count> <word>, ...` for more.
 */
export const formatVerdictMessage = <R extends { verdict: string }>(
  results: readonly R[],
  format: VerdictMessageFormat<R>,
): string => {
  if (results.length === 1) {
    return format.single(results[0]);
  }
  if (results.length <= format.listLimit) {
    return `${format.label}: ${results.map((result, i) => `#${i + 1} ${format.word(result)}`).join(', ')}`;
  }
  const counts = format.counts.map(
    ([verdict, word]) => `${results.filter((result) => result.verdict === verdict).length} ${word}`,
  );
  return `${format.label}: ${results.length} selections: ${counts.join(', ')}`;
};

/** With more selections than this, the Luhn notification only gives the counts. */
export const LUHN_LIST_LIMIT = 10;

const luhnWord = (result: LuhnResult): string => (result.verdict === 'not-a-number' ? 'not a number' : result.verdict);

/**
 * The notification text of HASH-017 for the results of the target selections in document order.
 * It never contains the selected text (which may be a real card number):
 * - 1 selection: `Luhn: valid` / `Luhn: invalid` / `Luhn: not a number (<reason>)`;
 * - 2..10 selections: `Luhn: #1 valid, #2 invalid, #3 not a number` (no reasons);
 * - 11 or more: `Luhn: 12 selections: 5 valid, 4 invalid, 3 not a number` (zero counts included).
 */
export const formatLuhnMessage = (results: readonly LuhnResult[]): string =>
  formatVerdictMessage(results, {
    label: 'Luhn',
    listLimit: LUHN_LIST_LIMIT,
    single: (result) => {
      if (result.verdict !== 'not-a-number') {
        return `Luhn: ${result.verdict}`;
      }
      return result.reason === 'too-short'
        ? 'Luhn: not a number (at least 2 digits are required)'
        : 'Luhn: not a number (only digits, spaces and hyphens are allowed)';
    },
    word: luhnWord,
    counts: [['valid', 'valid'], ['invalid', 'invalid'], ['not-a-number', 'not a number']],
  });
