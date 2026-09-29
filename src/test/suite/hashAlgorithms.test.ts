import * as assert from 'assert';
import { createHash, createHmac } from 'node:crypto';
import {
  adler32,
  blake2b512,
  blake2s256,
  crc32,
  fnv1a32,
  hmac,
  hmacSha3_256,
  sha3_256,
  sha3_512,
} from '../../handler/hashAlgorithms';

const bytes = (text: string): Uint8Array => Buffer.from(text, 'utf8');
const a = (n: number): Uint8Array => Buffer.alloc(n, 0x61);
const hex = (digest: Uint8Array): string => Buffer.from(digest).toString('hex');
const hex8 = (value: number): string => value.toString(16).padStart(8, '0');

/**
 * The expected values are fixed (published test vectors, or values computed with the OpenSSL of
 * the Node.js CLI and checked against published ones): the extension host's `node:crypto`
 * (Electron / BoringSSL) cannot compute SHA-3 / BLAKE2, so they cannot be compared at run time.
 */
suite('Hash Algorithms (self-implemented) Test Suite', () => {
  test('SHA3-256: FIPS 202 samples and the rate boundary (136 bytes)', () => {
    assert.strictEqual(hex(sha3_256(bytes(''))), 'a7ffc6f8bf1ed76651c14756a061d662f580ff4de43b49fa82d80a4b80f8434a');
    assert.strictEqual(hex(sha3_256(bytes('abc'))), '3a985da74fe225b2045c172d6bd390bd855f086e3e9d525b46bfe24511431532');
    assert.strictEqual(hex(sha3_256(a(135))), '8094bb53c44cfb1e67b7c30447f9a1c33696d2463ecc1d9c92538913392843c9');
    assert.strictEqual(hex(sha3_256(a(136))), '3fc5559f14db8e453a0a3091edbd2bc25e11528d81c66fa570a4efdcc2695ee1');
    assert.strictEqual(hex(sha3_256(a(137))), 'f8d6846cedd2ccfadf15c5879ef95af724d799eed7391fb1c91f95344e738614');
  });

  test('SHA3-512: FIPS 202 samples and the rate boundary (72 bytes)', () => {
    assert.strictEqual(hex(sha3_512(bytes(''))), 'a69f73cca23a9ac5c8b567dc185a756e97c982164fe25859e0d1dcc1475c80a615b2123af1f5f94c11e3e9402c3ac558f500199d95b6d3e301758586281dcd26');
    assert.strictEqual(hex(sha3_512(bytes('abc'))), 'b751850b1a57168a5693cd924b6b096e08f621827444f70d884f5d0240d2712e10e116e9192af3c91a7ec57647e3934057340b4cf408d5a56592f8274eec53f0');
    assert.strictEqual(hex(sha3_512(a(71))), '070faf98d2a8fddf8ed886408744dc06456096c2e045f26f3c7b010530e6bbb3db535a54d636856f4e0e1e982461cb9a7e8e57ff8895cff1619af9f0e486e28c');
    assert.strictEqual(hex(sha3_512(a(72))), 'a8ae722a78e10cbbc413886c02eb5b369a03f6560084aff566bd597bb7ad8c1ccd86e81296852359bf2faddb5153c0a7445722987875e74287adac21adebe952');
    assert.strictEqual(hex(sha3_512(a(73))), '23e6a8815f8201dbbf6a5463be8dcadb1acea9df5f8998954e59ac9565cf6d29b17aa27a5e8b0fc06343db6122d6e544d27583ddc78504d08203217e7e65b6bd');
  });

  test('BLAKE2b-512: RFC 7693 sample, empty input and the block boundary (128 bytes)', () => {
    assert.strictEqual(hex(blake2b512(bytes('abc'))), 'ba80a53f981c4d0d6a2797b69f12f6e94c212f14685ac4b74b12bb6fdbffa2d17d87c5392aab792dc252d5de4533cc9518d38aa8dbf1925ab92386edd4009923');
    assert.strictEqual(hex(blake2b512(bytes(''))), '786a02f742015903c6c6fd852552d272912f4740e15847618a86e217f71f5419d25e1031afee585313896444934eb04b903a685b1448b755d56f701afe9be2ce');
    assert.strictEqual(hex(blake2b512(a(127))), '94596b9d6199c807c40ae1a935f3633ba5a8dd5655f7f1bd44f5285b1ce8dbb0054771eba409539df85a963296d28788807105153c90fa3ec3d761228e90f8b8');
    assert.strictEqual(hex(blake2b512(a(128))), 'fc6c71f688f43ea7d60817478808f3cac753e61571865c95adbc2d9122c943a76b92c2cb1047ef3fe7bf6e436ec1d0a99a9e5b216780bf7fed9d7ca91d3a8f3b');
    assert.strictEqual(hex(blake2b512(a(129))), '55e6e0eb418149a8af92fd9ddc99254781b2f522a131b4f4d984404b71a00e1167b8124d5dcddd4c6977b299392335d6edd303da6d344d74bbef2d38101b232b');
  });

  test('BLAKE2s-256: RFC 7693 sample, empty input and the block boundary (64 bytes)', () => {
    assert.strictEqual(hex(blake2s256(bytes('abc'))), '508c5e8c327c14e2e1a72ba34eeb452f37458b209ed63a294d999b4c86675982');
    assert.strictEqual(hex(blake2s256(bytes(''))), '69217a3079908094e11121d042354a7c1f55b6482ca1a51e1b250dfd1ed0eef9');
    assert.strictEqual(hex(blake2s256(a(63))), '9a4267618070af968ff2a0fdaecc62b5c15ab91cb4a56424ba9fcad20aab417c');
    assert.strictEqual(hex(blake2s256(a(64))), '651d2f5f20952eacaea2fba2f2af2bcd633e511ea2d2e4c9ae2ac0d9ffb7b252');
    assert.strictEqual(hex(blake2s256(a(65))), '045f8ae18932119bd051ac7ba5c73db59892055fad5c32f82d79a6543d92a497');
  });

  test('HMAC-SHA3-256: ROADMAP example, key length boundary (136 bytes) and NIST samples', () => {
    assert.strictEqual(hex(hmacSha3_256(bytes('key'), bytes('abc'))), '09b6dbab8d11795ca7c8d82f1cf91682013c7cb980abbb25473be4ae7f7b5683');
    assert.strictEqual(hex(hmacSha3_256(a(136), bytes('abc'))), 'b963371226a8ae4d11aed91cb3a033fd7d72ff97b54ef8411ffddf4be5297a92');
    assert.strictEqual(hex(hmacSha3_256(a(137), bytes('abc'))), 'f948e5fdf0e70acf3df105c1241b61469bfd3994a417b4593d5f185affac2414');
    // NIST CSRC "HMAC_SHA3-256" examples: keys 00 01 02 ... of 32 and 136 bytes.
    const nistKey = (length: number) => Uint8Array.from({ length }, (_, i) => i);
    assert.strictEqual(
      hex(hmacSha3_256(nistKey(32), bytes('Sample message for keylen<blocklen'))),
      '4fe8e202c4f058e8dddc23d8c34e467343e23555e24fc2f025d598f558f67205'
    );
    assert.strictEqual(
      hex(hmacSha3_256(nistKey(136), bytes('Sample message for keylen=blocklen'))),
      '68b94e2e538a9be4103bebb5aa016d47961d4d1aa906061313b557f8af2c3faa'
    );
  });

  test('the generic HMAC matches node:crypto (HMAC-SHA384, available in the extension host)', () => {
    const sha384 = (input: Uint8Array): Uint8Array => createHash('sha384').update(input).digest();
    for (const keyLength of [0, 3, 127, 128, 129, 300]) {
      const key = a(keyLength);
      const message = bytes(`message ${keyLength}`);
      assert.strictEqual(
        hex(hmac(sha384, 128, key, message)),
        createHmac('sha384', key).update(message).digest('hex'),
        `key length ${keyLength}`
      );
    }
  });

  test('CRC-32 (IEEE)', () => {
    assert.strictEqual(hex8(crc32(bytes('hello'))), '3610a686');
    assert.strictEqual(hex8(crc32(bytes('123456789'))), 'cbf43926');
    assert.strictEqual(hex8(crc32(bytes(''))), '00000000');
  });

  test('Adler-32, including inputs longer than 5552 bytes', () => {
    assert.strictEqual(hex8(adler32(bytes('hello'))), '062c0215');
    assert.strictEqual(hex8(adler32(bytes('Wikipedia'))), '11e60398');
    assert.strictEqual(hex8(adler32(bytes(''))), '00000001');
    // Computed with a reference that reduces modulo 65521 after every byte.
    assert.strictEqual(hex8(adler32(a(100_000))), '79660b4d');
    const reference = (input: Uint8Array): number => {
      let s1 = 1;
      let s2 = 0;
      for (const byte of input) {
        s1 = (s1 + byte) % 65521;
        s2 = (s2 + s1) % 65521;
      }
      return ((s2 << 16) | s1) >>> 0;
    };
    for (const length of [5551, 5552, 5553, 11_104, 20_000]) {
      const input = Buffer.alloc(length, 0xff);
      assert.strictEqual(adler32(input), reference(input), `0xff x ${length}`);
    }
  });

  test('FNV-1a 32-bit', () => {
    assert.strictEqual(hex8(fnv1a32(bytes('hello'))), '4f9f2cab');
    assert.strictEqual(hex8(fnv1a32(bytes(''))), '811c9dc5');
    assert.strictEqual(hex8(fnv1a32(bytes('a'))), 'e40c292c');
  });
});
