/**
 * Pure (vscode-independent) part of the hash, checksum and validation commands of group ENC2
 * (ENCX-016..022): SHA3-384, SHAKE256, HMAC-SHA3-512, CRC-16/CCITT-FALSE, CRC-32C, and the IBAN
 * and ISBN validators.
 *
 * - The SHA-3 family is computed by the dependency-free TypeScript implementation of
 *   `hashAlgorithms.ts`, not by `node:crypto`: the extension host runs on Electron, whose BoringSSL
 *   does not support SHA-3 (see that file).
 * - CRC-16 / CRC-32C, IBAN (ISO 13616 mod 97) and ISBN check digits only detect accidental
 *   corruption and typing mistakes. They are not cryptographic: anyone can make a changed value
 *   pass them, so they must not be used to detect tampering.
 * - Every command works on the UTF-8 bytes of the selected text as it is (not trimmed, CRLF kept);
 *   a lone surrogate is an error (`EncInputError`) instead of silently becoming U+FFFD.
 * - The validators never put the selected text into their result (an IBAN is an account number).
 */
import { isAsciiDigit, isAsciiLower, isAsciiUpper, utf8 } from './encodeTransforms';
import { crc16CcittFalse, crc32c, hmacSha3_512, sha3_384, shake256 } from './hashAlgorithms';
import { formatVerdictMessage, toHex } from './hashTransforms';


/** ENCX-017: the largest SHAKE256 output length in bytes (2,048 hexadecimal digits). */
export const SHAKE256_MAX_OUTPUT_BYTES = 1024;
/** ENCX-017: the output length offered first in the input box. */
export const SHAKE256_DEFAULT_OUTPUT_BYTES = 32;

/** ENCX-016: SHA3-384 of the UTF-8 bytes of `text` (96 lowercase hexadecimal digits). */
export const sha3_384Text = (text: string): string => toHex(sha3_384(utf8(text)));

/**
 * Why `value` is not a SHAKE256 output length (an integer from 1 to SHAKE256_MAX_OUTPUT_BYTES,
 * written with ASCII digits only), or `undefined` when it is.
 */
export const findShakeLengthProblem = (value: string): string | undefined => {
  if (value.length === 0 || value.length > 4) {
    return `Enter an integer from 1 to ${SHAKE256_MAX_OUTPUT_BYTES.toLocaleString('en-US')}.`;
  }
  for (let i = 0; i < value.length; i++) {
    const code = value.charCodeAt(i);
    if (code < 0x30 || code > 0x39) {
      return `Enter an integer from 1 to ${SHAKE256_MAX_OUTPUT_BYTES.toLocaleString('en-US')}.`;
    }
  }
  const length = Number(value);
  return length >= 1 && length <= SHAKE256_MAX_OUTPUT_BYTES
    ? undefined
    : `Enter an integer from 1 to ${SHAKE256_MAX_OUTPUT_BYTES.toLocaleString('en-US')}.`;
};

/** ENCX-017: SHAKE256 of the UTF-8 bytes of `text` with `outputBytes` bytes of output (hex). */
export const shake256Text = (text: string, outputBytes: number): string => {
  if (!Number.isSafeInteger(outputBytes) || outputBytes < 1 || outputBytes > SHAKE256_MAX_OUTPUT_BYTES) {
    throw new RangeError(`the output length must be an integer from 1 to ${SHAKE256_MAX_OUTPUT_BYTES}`);
  }
  return toHex(shake256(utf8(text), outputBytes));
};

/** ENCX-018: HMAC-SHA3-512 (128 hexadecimal digits); `key` is the UTF-8 bytes of the key. */
export const hmacSha3_512Text = (key: Uint8Array, text: string): string => toHex(hmacSha3_512(key, utf8(text)));

/** ENCX-019: CRC-16/CCITT-FALSE as 4 lowercase hexadecimal digits. */
export const crc16Text = (text: string): string => crc16CcittFalse(utf8(text)).toString(16).padStart(4, '0');

/** ENCX-020: CRC-32C as 8 lowercase hexadecimal digits. */
export const crc32cText = (text: string): string => crc32c(utf8(text)).toString(16).padStart(8, '0');

// ---------------------------------------------------------------------------
// Validation results (ENCX-021 / ENCX-022)
// ---------------------------------------------------------------------------

/** With more selections than this, the IBAN / ISBN notification only gives the counts (as for Luhn). */
export const IBAN_LIST_LIMIT = 10;
export const ISBN_LIST_LIMIT = 10;


// ---------------------------------------------------------------------------
// ENCX-021: IBAN
// ---------------------------------------------------------------------------

export type IbanResult =
  | { verdict: 'valid' }
  | { verdict: 'invalid' }
  | { verdict: 'not-an-iban'; reason: 'invalid-character' | 'wrong-length' | 'wrong-structure' };

/** The shortest and longest IBAN (ISO 13616: Norway has 15 characters, the maximum is 34). */
export const IBAN_MIN_LENGTH = 15;
export const IBAN_MAX_LENGTH = 34;

/**
 * ENCX-021: checks the IBAN check digits (ISO 13616 / ISO 7064 mod 97-10) of `text`.
 *
 * Leading and trailing whitespace is ignored and so is every half-width space (the 4-character
 * groups of the printed form). Lowercase ASCII letters count as uppercase (no `toUpperCase`, so
 * no non-ASCII letter is ever mapped). The structure checked is only the general one (a 2-letter
 * country code, 2 check digits, then letters and digits, 15 to 34 characters in all): the length
 * of each country is not checked. The remainder is computed digit by digit (no `BigInt`).
 */
export const ibanCheck = (text: string): IbanResult => {
  const trimmed = text.trim();
  const codes: number[] = [];
  for (let i = 0; i < trimmed.length; i++) {
    const code = trimmed.charCodeAt(i);
    if (code === 0x20) {
      continue;
    }
    if (isAsciiDigit(code) || isAsciiUpper(code)) {
      codes.push(code);
    } else if (isAsciiLower(code)) {
      codes.push(code - 0x20);
    } else {
      return { verdict: 'not-an-iban', reason: 'invalid-character' };
    }
    if (codes.length > IBAN_MAX_LENGTH) {
      return { verdict: 'not-an-iban', reason: 'wrong-length' };
    }
  }
  if (codes.length < IBAN_MIN_LENGTH) {
    return { verdict: 'not-an-iban', reason: 'wrong-length' };
  }
  if (!isAsciiUpper(codes[0]) || !isAsciiUpper(codes[1]) || !isAsciiDigit(codes[2]) || !isAsciiDigit(codes[3])) {
    return { verdict: 'not-an-iban', reason: 'wrong-structure' };
  }
  // The first four characters are moved to the end; letters count as 10 (A) to 35 (Z).
  let remainder = 0;
  for (let i = 0; i < codes.length; i++) {
    const code = codes[(i + 4) % codes.length];
    remainder = isAsciiDigit(code) ? (remainder * 10 + (code - 0x30)) % 97 : (remainder * 100 + (code - 0x41 + 10)) % 97;
  }
  return { verdict: remainder === 1 ? 'valid' : 'invalid' };
};

const IBAN_REASONS: Record<'invalid-character' | 'wrong-length' | 'wrong-structure', string> = {
  'invalid-character': 'only letters, digits and spaces are allowed',
  'wrong-length': `the length must be ${IBAN_MIN_LENGTH} to ${IBAN_MAX_LENGTH} characters`,
  'wrong-structure': 'it must start with a 2-letter country code and 2 check digits',
};

const ibanWord = (result: IbanResult): string => (result.verdict === 'not-an-iban' ? 'not an IBAN' : result.verdict);

/**
 * The notification of ENCX-021 for the results of the target selections in document order. It
 * never contains the selected text:
 * - 1 selection: `IBAN: valid` / `IBAN: invalid` / `IBAN: not an IBAN (<reason>)`;
 * - 2..10 selections: `IBAN: #1 valid, #2 invalid, #3 not an IBAN` (no reasons);
 * - 11 or more: `IBAN: 12 selections: 5 valid, 4 invalid, 3 not an IBAN` (zero counts included).
 */
export const formatIbanMessage = (results: readonly IbanResult[]): string =>
  formatVerdictMessage(results, {
    label: 'IBAN',
    listLimit: IBAN_LIST_LIMIT,
    single: (result) =>
      result.verdict === 'not-an-iban' ? `IBAN: not an IBAN (${IBAN_REASONS[result.reason]})` : `IBAN: ${result.verdict}`,
    word: ibanWord,
    counts: [['valid', 'valid'], ['invalid', 'invalid'], ['not-an-iban', 'not an IBAN']],
  });

// ---------------------------------------------------------------------------
// ENCX-022: ISBN-10 / ISBN-13
// ---------------------------------------------------------------------------

export type IsbnKind = 'ISBN-10' | 'ISBN-13';

export type IsbnResult =
  | { verdict: 'valid'; kind: IsbnKind }
  | { verdict: 'invalid'; kind: IsbnKind; expected: string }
  | { verdict: 'not-an-isbn'; reason: 'invalid-character' | 'wrong-length' | 'wrong-prefix' };

/**
 * ENCX-022: checks the check digit of an ISBN-10 or ISBN-13.
 *
 * Leading and trailing whitespace is ignored. A single half-width space or hyphen is allowed
 * between two digits only (the final `X` of an ISBN-10 counts as a digit, so `0-306-40615-X` is
 * accepted); a leading, trailing or doubled separator is `invalid-character`, and so is any other
 * character (full-width digits included). `X` / `x` is allowed only as the 10th and last digit.
 * - 10 digits: ISBN-10 (weights 10..1, the sum is a multiple of 11, `X` = 10);
 * - 13 digits: ISBN-13 (weights 1, 3, 1, 3, ...; the sum is a multiple of 10), which must start
 *   with 978 or 979: any other prefix is `wrong-prefix` and no check digit is checked or given
 *   (it may be a valid EAN-13, but it is not an ISBN);
 * - any other number of digits: `wrong-length`.
 * When the check digit is wrong, `expected` is the right one (`0`..`9`, or `X` for an ISBN-10).
 */
export const isbnCheck = (text: string): IsbnResult => {
  const trimmed = text.trim();
  const digits: number[] = [];
  let previousIsDigit = false;
  for (let i = 0; i < trimmed.length; i++) {
    const code = trimmed.charCodeAt(i);
    if (isAsciiDigit(code)) {
      digits.push(code - 0x30);
      previousIsDigit = true;
    } else if (code === 0x58 || code === 0x78) {
      // X: only as the 10th digit and the last character.
      if (i !== trimmed.length - 1 || digits.length !== 9) {
        return { verdict: 'not-an-isbn', reason: 'invalid-character' };
      }
      digits.push(10);
      previousIsDigit = true;
    } else if (code === 0x20 || code === 0x2d) {
      if (!previousIsDigit || i === trimmed.length - 1) {
        return { verdict: 'not-an-isbn', reason: 'invalid-character' };
      }
      previousIsDigit = false;
    } else {
      return { verdict: 'not-an-isbn', reason: 'invalid-character' };
    }
  }
  if (digits.length === 10) {
    let sum = 0;
    for (let i = 0; i < 9; i++) {
      sum += (10 - i) * digits[i];
    }
    const check = (11 - (sum % 11)) % 11;
    return check === digits[9]
      ? { verdict: 'valid', kind: 'ISBN-10' }
      : { verdict: 'invalid', kind: 'ISBN-10', expected: check === 10 ? 'X' : String(check) };
  }
  if (digits.length === 13) {
    const prefix = digits[0] * 100 + digits[1] * 10 + digits[2];
    if (prefix !== 978 && prefix !== 979) {
      return { verdict: 'not-an-isbn', reason: 'wrong-prefix' };
    }
    let sum = 0;
    for (let i = 0; i < 12; i++) {
      sum += digits[i] * (i % 2 === 0 ? 1 : 3);
    }
    const check = (10 - (sum % 10)) % 10;
    return check === digits[12]
      ? { verdict: 'valid', kind: 'ISBN-13' }
      : { verdict: 'invalid', kind: 'ISBN-13', expected: String(check) };
  }
  return { verdict: 'not-an-isbn', reason: 'wrong-length' };
};

const ISBN_REASONS: Record<'invalid-character' | 'wrong-length' | 'wrong-prefix', string> = {
  'invalid-character': 'only digits, spaces and hyphens are allowed, and X only as the last digit of an ISBN-10',
  'wrong-length': '10 or 13 digits are required',
  'wrong-prefix': 'an ISBN-13 must start with 978 or 979',
};

const isbnWord = (result: IsbnResult): string => {
  switch (result.verdict) {
    case 'valid':
      return 'valid';
    case 'invalid':
      return `invalid (should be ${result.expected})`;
    case 'not-an-isbn':
      return 'not an ISBN';
  }
};

/**
 * The notification of ENCX-022 for the results of the target selections in document order. It
 * never contains the selected text, only the right check digit when it is wrong:
 * - 1 selection: `ISBN-13: valid` / `ISBN-10: invalid (the check digit should be X)` /
 *   `ISBN: not an ISBN (<reason>)`;
 * - 2..10 selections: `ISBN: #1 valid, #2 invalid (should be 8), #3 not an ISBN` (no reasons);
 * - 11 or more: `ISBN: 12 selections: 5 valid, 4 invalid, 3 not an ISBN` (zero counts included).
 */
export const formatIsbnMessage = (results: readonly IsbnResult[]): string =>
  formatVerdictMessage(results, {
    label: 'ISBN',
    listLimit: ISBN_LIST_LIMIT,
    single: (result) => {
      switch (result.verdict) {
        case 'valid':
          return `${result.kind}: valid`;
        case 'invalid':
          return `${result.kind}: invalid (the check digit should be ${result.expected})`;
        case 'not-an-isbn':
          return `ISBN: not an ISBN (${ISBN_REASONS[result.reason]})`;
      }
    },
    word: isbnWord,
    counts: [['valid', 'valid'], ['invalid', 'invalid'], ['not-an-isbn', 'not an ISBN']],
  });
