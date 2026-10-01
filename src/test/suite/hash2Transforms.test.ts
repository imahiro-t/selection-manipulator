import * as assert from 'assert';
import { EncInputError } from '../../handler/encodeTransforms';
import {
  crc16CcittFalse,
  crc32c,
  hmacSha3_256,
  hmacSha3_512,
  sha3_256,
  sha3_384,
  sha3_512,
  shake256,
} from '../../handler/hashAlgorithms';
import {
  crc16Text,
  crc32cText,
  findShakeLengthProblem,
  formatIbanMessage,
  formatIsbnMessage,
  hmacSha3_512Text,
  IBAN_LIST_LIMIT,
  ibanCheck,
  IbanResult,
  ISBN_LIST_LIMIT,
  isbnCheck,
  IsbnResult,
  sha3_384Text,
  SHAKE256_MAX_OUTPUT_BYTES,
  shake256Text,
} from '../../handler/hash2Transforms';

const bytes = (text: string): Uint8Array => Buffer.from(text, 'utf8');
const a = (n: number): Uint8Array => Buffer.alloc(n, 0x61);
const hex = (digest: Uint8Array): string => Buffer.from(digest).toString('hex');
const range = (n: number): Uint8Array => Uint8Array.from({ length: n }, (_, i) => i);

/**
 * The expected values are fixed (FIPS 202 / NIST samples, RFC 3720, or values computed with
 * Python's hashlib and checked against published ones): the extension host's `node:crypto`
 * (Electron / BoringSSL) cannot compute SHA-3, so they cannot be compared at run time.
 */
suite('ENC2 Hashes, Checksums and Validators (ENCX-016..022) Test Suite', () => {

  suite('algorithms', () => {
    test('the generalised sponge keeps SHA3-256 / SHA3-512 / HMAC-SHA3-256 unchanged', () => {
      assert.strictEqual(hex(sha3_256(bytes('abc'))), '3a985da74fe225b2045c172d6bd390bd855f086e3e9d525b46bfe24511431532');
      assert.strictEqual(hex(sha3_256(a(136))), '3fc5559f14db8e453a0a3091edbd2bc25e11528d81c66fa570a4efdcc2695ee1');
      assert.strictEqual(hex(sha3_512(bytes('abc'))), 'b751850b1a57168a5693cd924b6b096e08f621827444f70d884f5d0240d2712e10e116e9192af3c91a7ec57647e3934057340b4cf408d5a56592f8274eec53f0');
      assert.strictEqual(hex(hmacSha3_256(bytes('key'), bytes('abc'))), '09b6dbab8d11795ca7c8d82f1cf91682013c7cb980abbb25473be4ae7f7b5683');
    });

    test('SHA3-384: FIPS 202 samples and the rate boundary (104 bytes)', () => {
      assert.strictEqual(hex(sha3_384(bytes(''))), '0c63a75b845e4f7d01107d852e4c2485c51a50aaaa94fc61995e71bbee983a2ac3713831264adb47fb6bd1e058d5f004');
      assert.strictEqual(hex(sha3_384(bytes('abc'))), 'ec01498288516fc926459f58e2c6ad8df9b473cb0fc08c2596da7cf0e49be4b298d88cea927ac7f539f1edf228376d25');
      assert.strictEqual(hex(sha3_384(Buffer.alloc(200, 0xa3))), '1881de2ca7e41ef95dc4732b8f5f002b189cc1e42b74168ed1732649ce1dbcdd76197a31fd55ee989f2d7050dd473e8f');
      assert.strictEqual(hex(sha3_384(bytes('abcdbcdecdefdefgefghfghighijhijkijkljklmklmnlmnomnopnopq'))), '991c665755eb3a4b6bbdfb75c78a492e8c56a22c5c4d7e429bfdbc32b9d4ad5aa04a1f076e62fea19eef51acd0657c22');
      assert.strictEqual(hex(sha3_384(a(103))), 'af61fb4fd1c6afe80857fcba888318a0a1426635b4509f09707e3787630bdb621655ffa54f5884088ccc000f81436414');
      assert.strictEqual(hex(sha3_384(a(104))), '3a4f3b6284e571238884e95655e8c8a60e068e4059a9734abc08823a900d161592860243f00619ae699a29092ed91a16');
      assert.strictEqual(hex(sha3_384(a(105))), 'cb73ab2f8f5fbb13f0e115a7062ba1644aa16534aa80d076ef27f8550deb900d89bdfa169b45073223acadb6001204d3');
    });

    test('SHAKE256: FIPS 202 samples, outputs longer than one block (136 bytes) and the input rate boundary', () => {
      assert.strictEqual(hex(shake256(bytes(''), 32)), '46b9dd2b0ba88d13233b3feb743eeb243fcd52ea62b81b82b50c27646ed5762f');
      assert.strictEqual(hex(shake256(bytes('abc'), 32)), '483366601360a8771c6863080cc4114d8db44530f8f1e1ee4f94ea37e78b5739');
      assert.strictEqual(hex(shake256(bytes('abc'), 1)), '48');
      assert.strictEqual(hex(shake256(Buffer.alloc(200, 0xa3), 64)),
        'cd8a920ed141aa0407a22d59288652e9d9f1a7ee0c1e7c1ca699424da84a904d2d700caae7396ece96604440577da4f3aa22aeb8857f961c4cd8e06f0ae6610b');
      // A prefix of a longer output is the shorter output (an extendable-output function).
      const long = hex(shake256(bytes('abc'), 300));
      assert.strictEqual(long.length, 600);
      assert.ok(long.startsWith('483366601360a8771c6863080cc4114d8db44530f8f1e1ee4f94ea37e78b5739'));
      assert.ok(long.endsWith('42215c11d5f8ee57f341'));
      assert.ok(hex(shake256(bytes('abc'), 136)).endsWith('e8a2d7ec71a7cc29'));
      assert.ok(hex(shake256(bytes('abc'), 137)).endsWith('a2d7ec71a7cc29cf'));
      assert.ok(hex(shake256(bytes('abc'), 1024)).endsWith('66a4b37f64d405bb6b040d9640ba423e8a7a7fc2a13c75e3b842a4713b49c008'));
      assert.strictEqual(hex(shake256(a(135), 16)), '55b991ece1e567b6e7c2c714444dd201');
      assert.strictEqual(hex(shake256(a(136), 16)), '8fcc5a08f0a1f6827c9cf64ee8d16e04');
      assert.throws(() => shake256(bytes('abc'), -1), RangeError);
      assert.throws(() => shake256(bytes('abc'), 1.5), RangeError);
    });

    test('HMAC-SHA3-512: the NIST samples (keys shorter than, equal to and longer than the 72-byte block)', () => {
      assert.strictEqual(hex(hmacSha3_512(range(64), bytes('Sample message for keylen<blocklen'))),
        '4efd629d6c71bf86162658f29943b1c308ce27cdfa6db0d9c3ce81763f9cbce5f7ebe9868031db1a8f8eb7b6b95e5c5e3f657a8996c86a2f6527e307f0213196');
      assert.strictEqual(hex(hmacSha3_512(range(72), bytes('Sample message for keylen=blocklen'))),
        '544e257ea2a3e5ea19a590e6a24b724ce6327757723fe2751b75bf007d80f6b360744bf1b7a88ea585f9765b47911976d3191cf83c039f5ffab0d29cc9d9b6da');
      assert.strictEqual(hex(hmacSha3_512(range(200), bytes('Sample message for keylen>blocklen'))),
        'eba5b7668e85748ab6d5f4800f48c292a5085820904091cda307f8431ef37763680ddeed39f4aa9b262f1aa8691e2331563eb0169aaa1249575a4ad17dbd6c53');
      assert.strictEqual(hmacSha3_512Text(bytes('k'), 'abc'),
        '7cc7ed9b9f44d32fa6025c48df62817a8786ebcbf91118e2e9d1eb295a147513dffd9231f72b99510096a47828e78f3edeea2ec7e9b36d17d7e1654fd6c83f13');
      assert.strictEqual(hmacSha3_512Text(bytes('鍵'), 'あ'),
        '170616ee9cfc04fd6241457e6be87bc8457b9e899f1807c86308a67496affadeb3f7e87e805279985e28c231efd1c9e8d7335ca7e31be87d98e49e4f715ba539');
    });

    test('CRC-16/CCITT-FALSE and CRC-32C: the check values and RFC 3720 samples', () => {
      assert.strictEqual(crc16CcittFalse(bytes('123456789')), 0x29b1);
      assert.strictEqual(crc16CcittFalse(bytes('')), 0xffff);
      assert.strictEqual(crc16CcittFalse(bytes('A')), 0xb915);
      assert.strictEqual(crc32c(bytes('123456789')), 0xe3069283);
      assert.strictEqual(crc32c(bytes('')), 0);
      assert.strictEqual(crc32c(Buffer.alloc(32, 0)), 0x8a9136aa);
      assert.strictEqual(crc32c(Buffer.alloc(32, 0xff)), 0x62a8ab43);
    });
  });

  suite('text results', () => {
    test('hex digits in lowercase, CRCs zero-padded; the UTF-8 bytes of the text as it is', () => {
      assert.strictEqual(sha3_384Text('あ'), 'd882ec285899a7fdc8973b386dcb7e735044f0f6a05634430e938b645caeef7ae0356178f86c80e6c2339c23a6d51c40');
      assert.strictEqual(crc16Text('123456789'), '29b1');
      assert.strictEqual(crc16Text('あ'), 'ac9e');
      assert.strictEqual(crc32cText('123456789'), 'e3069283');
      assert.strictEqual(crc32cText('あ'), 'ace04686');
      assert.strictEqual(crc32cText(''), '00000000');
      assert.strictEqual(crc16Text('a\r\n'), crc16CcittFalse(bytes('a\r\n')).toString(16).padStart(4, '0'), 'CRLF is kept');
    });

    test('a lone surrogate is an error, not U+FFFD', () => {
      for (const compute of [sha3_384Text, crc16Text, crc32cText, (text: string) => shake256Text(text, 32), (text: string) => hmacSha3_512Text(bytes('k'), text)]) {
        assert.throws(() => compute('a\ud800'), EncInputError);
      }
    });

    test('SHAKE256: the output length is an integer from 1 to 1,024 (the upper limit)', () => {
      assert.strictEqual(SHAKE256_MAX_OUTPUT_BYTES, 1024);
      for (const valid of ['1', '32', '1024', '0032']) {
        assert.strictEqual(findShakeLengthProblem(valid), undefined, valid);
      }
      for (const invalid of ['', '0', '1025', '99999', '1.5', '-1', '+3', ' 32', '３２', '1e3', 'abc']) {
        assert.strictEqual(findShakeLengthProblem(invalid), 'Enter an integer from 1 to 1,024.', invalid);
      }
      assert.strictEqual(shake256Text('abc', 1024).length, 2048);
      assert.throws(() => shake256Text('abc', 1025), RangeError);
      assert.throws(() => shake256Text('abc', 0), RangeError);
    });
  });

  suite('ENCX-021 IBAN', () => {
    test('valid and invalid check digits; spaces, lowercase and the surrounding whitespace are accepted', () => {
      assert.deepStrictEqual(ibanCheck('GB82 WEST 1234 5698 7654 32'), { verdict: 'valid' });
      assert.deepStrictEqual(ibanCheck('GB82WEST12345698765432'), { verdict: 'valid' });
      assert.deepStrictEqual(ibanCheck(' gb82 west 1234 5698 7654 32\n'), { verdict: 'valid' });
      assert.deepStrictEqual(ibanCheck('DE89 3704 0044 0532 0130 00'), { verdict: 'valid' });
      assert.deepStrictEqual(ibanCheck('NO9386011117947'), { verdict: 'valid' }, 'the shortest (15 characters)');
      assert.deepStrictEqual(ibanCheck('GB82 WEST 1234 5698 7654 33'), { verdict: 'invalid' }, 'one digit changed');
      assert.deepStrictEqual(ibanCheck('GB28 WEST 1234 5698 7654 32'), { verdict: 'invalid' }, 'check digits swapped');
    });

    test('not an IBAN: the length, the structure and the characters', () => {
      assert.deepStrictEqual(ibanCheck('GB82 WEST 1234'), { verdict: 'not-an-iban', reason: 'wrong-length' });
      assert.deepStrictEqual(ibanCheck(`GB82${'1'.repeat(31)}`), { verdict: 'not-an-iban', reason: 'wrong-length' }, '35 characters');
      assert.deepStrictEqual(ibanCheck('1282 WEST 1234 5698 7654 32'), { verdict: 'not-an-iban', reason: 'wrong-structure' });
      assert.deepStrictEqual(ibanCheck('GBX2 WEST 1234 5698 7654 32'), { verdict: 'not-an-iban', reason: 'wrong-structure' });
      assert.deepStrictEqual(ibanCheck('GB82-WEST-1234-5698-7654-32'), { verdict: 'not-an-iban', reason: 'invalid-character' });
      assert.deepStrictEqual(ibanCheck('GB82\tWEST12345698765432'), { verdict: 'not-an-iban', reason: 'invalid-character' });
      assert.deepStrictEqual(ibanCheck('ＧＢ82WEST12345698765432'), { verdict: 'not-an-iban', reason: 'invalid-character' });
      assert.deepStrictEqual(ibanCheck('GB82WEST1234569876543ß'), { verdict: 'not-an-iban', reason: 'invalid-character' });
    });

    test('the notification texts never contain the IBAN', () => {
      assert.strictEqual(formatIbanMessage([{ verdict: 'valid' }]), 'IBAN: valid');
      assert.strictEqual(formatIbanMessage([{ verdict: 'invalid' }]), 'IBAN: invalid');
      assert.strictEqual(formatIbanMessage([{ verdict: 'not-an-iban', reason: 'wrong-length' }]), 'IBAN: not an IBAN (the length must be 15 to 34 characters)');
      assert.strictEqual(formatIbanMessage([{ verdict: 'not-an-iban', reason: 'wrong-structure' }]), 'IBAN: not an IBAN (it must start with a 2-letter country code and 2 check digits)');
      assert.strictEqual(formatIbanMessage([{ verdict: 'not-an-iban', reason: 'invalid-character' }]), 'IBAN: not an IBAN (only letters, digits and spaces are allowed)');
      const three: IbanResult[] = [{ verdict: 'valid' }, { verdict: 'invalid' }, { verdict: 'not-an-iban', reason: 'wrong-length' }];
      assert.strictEqual(formatIbanMessage(three), 'IBAN: #1 valid, #2 invalid, #3 not an IBAN');
      const ten = Array.from({ length: IBAN_LIST_LIMIT }, (): IbanResult => ({ verdict: 'valid' }));
      assert.ok(formatIbanMessage(ten).endsWith('#10 valid'));
      const eleven: IbanResult[] = [...ten.slice(0, 9), { verdict: 'invalid' }, { verdict: 'invalid' }];
      assert.strictEqual(formatIbanMessage(eleven), 'IBAN: 11 selections: 9 valid, 2 invalid, 0 not an IBAN');
    });
  });

  suite('ENCX-022 ISBN', () => {
    test('valid ISBN-10 / ISBN-13 with and without separators; X / x as the last digit (also after a hyphen)', () => {
      assert.deepStrictEqual(isbnCheck('978-4-00-310101-8'), { verdict: 'valid', kind: 'ISBN-13' });
      assert.deepStrictEqual(isbnCheck('9784003101018'), { verdict: 'valid', kind: 'ISBN-13' });
      assert.deepStrictEqual(isbnCheck('979 10 90636 07 1'), { verdict: 'valid', kind: 'ISBN-13' });
      assert.deepStrictEqual(isbnCheck('0-306-40615-2'), { verdict: 'valid', kind: 'ISBN-10' });
      assert.deepStrictEqual(isbnCheck('  0306406152\n'), { verdict: 'valid', kind: 'ISBN-10' });
      assert.deepStrictEqual(isbnCheck('0-8044-2957-X'), { verdict: 'valid', kind: 'ISBN-10' });
      assert.deepStrictEqual(isbnCheck('080442957x'), { verdict: 'valid', kind: 'ISBN-10' });
    });

    test('invalid: the right check digit is given (X for an ISBN-10 that needs 10)', () => {
      assert.deepStrictEqual(isbnCheck('978-4-00-310101-9'), { verdict: 'invalid', kind: 'ISBN-13', expected: '8' });
      assert.deepStrictEqual(isbnCheck('0-306-40615-X'), { verdict: 'invalid', kind: 'ISBN-10', expected: '2' });
      assert.deepStrictEqual(isbnCheck('0-8044-2957-0'), { verdict: 'invalid', kind: 'ISBN-10', expected: 'X' });
      assert.deepStrictEqual(isbnCheck('9780306406150'), { verdict: 'invalid', kind: 'ISBN-13', expected: '7' });
    });

    test('not an ISBN: a prefix other than 978 / 979, the number of digits and the characters', () => {
      assert.deepStrictEqual(isbnCheck('4006381333931'), { verdict: 'not-an-isbn', reason: 'wrong-prefix' }, 'a valid EAN-13, not an ISBN');
      assert.deepStrictEqual(isbnCheck('977-1234-5678-90'), { verdict: 'not-an-isbn', reason: 'wrong-prefix' });
      for (const text of ['030640615', '03064061521', '978030640615', '', '   ']) {
        assert.deepStrictEqual(isbnCheck(text), { verdict: 'not-an-isbn', reason: 'wrong-length' }, JSON.stringify(text));
      }
      for (const text of [
        'X306406152', '03064X6152', '978030640615X', '03064061520X', '-0306406152', '0306406152-', '0--306406152', '0- 306406152',
        '０３０６４０６１５２', '0306406152a', '0.306.40615.2', '03064\t06152', '0306406152\n1', 'ISBN 0306406152',
      ]) {
        assert.deepStrictEqual(isbnCheck(text), { verdict: 'not-an-isbn', reason: 'invalid-character' }, JSON.stringify(text));
      }
    });

    test('the notification texts are fixed and never contain the selected text', () => {
      const message = (text: string) => formatIsbnMessage([isbnCheck(text)]);
      assert.strictEqual(message('978-4-00-310101-8'), 'ISBN-13: valid');
      assert.strictEqual(message('0-306-40615-2'), 'ISBN-10: valid');
      assert.strictEqual(message('0-8044-2957-0'), 'ISBN-10: invalid (the check digit should be X)');
      assert.strictEqual(message('978-4-00-310101-9'), 'ISBN-13: invalid (the check digit should be 8)');
      assert.strictEqual(message('4006381333931'), 'ISBN: not an ISBN (an ISBN-13 must start with 978 or 979)');
      assert.strictEqual(message('12345'), 'ISBN: not an ISBN (10 or 13 digits are required)');
      assert.strictEqual(message('0-306-40615-'), 'ISBN: not an ISBN (only digits, spaces and hyphens are allowed, and X only as the last digit of an ISBN-10)');
      const three = ['978-4-00-310101-8', '978-4-00-310101-9', 'abc'].map(isbnCheck);
      assert.strictEqual(formatIsbnMessage(three), 'ISBN: #1 valid, #2 invalid (should be 8), #3 not an ISBN');
      const ten = Array.from({ length: ISBN_LIST_LIMIT }, (): IsbnResult => ({ verdict: 'valid', kind: 'ISBN-13' }));
      assert.ok(formatIsbnMessage(ten).endsWith('#10 valid'));
      const twelve: IsbnResult[] = [
        ...Array.from({ length: 5 }, (): IsbnResult => ({ verdict: 'valid', kind: 'ISBN-10' })),
        ...Array.from({ length: 4 }, (): IsbnResult => ({ verdict: 'invalid', kind: 'ISBN-13', expected: '1' })),
        ...Array.from({ length: 3 }, (): IsbnResult => ({ verdict: 'not-an-isbn', reason: 'wrong-length' })),
      ];
      assert.strictEqual(formatIsbnMessage(twelve), 'ISBN: 12 selections: 5 valid, 4 invalid, 3 not an ISBN');
      assert.strictEqual(formatIsbnMessage([...ten, { verdict: 'valid', kind: 'ISBN-13' }]), 'ISBN: 11 selections: 11 valid, 0 invalid, 0 not an ISBN');
    });
  });
});
