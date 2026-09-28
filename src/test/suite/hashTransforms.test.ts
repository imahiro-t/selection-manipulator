import * as assert from 'assert';
import { getHashes } from 'node:crypto';
import {
  checksumText,
  digestText,
  estimateHashOutputLength,
  findKeyProblem,
  formatLuhnMessage,
  HASH_COMMAND_ENTRIES,
  hashEachLine,
  hmacText,
  KEY_EMPTY_MESSAGE,
  KEY_LONE_SURROGATE_MESSAGE,
  keyBytes,
  luhnCheck,
  LuhnResult,
  NODE_CRYPTO_ALGORITHMS,
} from '../../handler/hashTransforms';
import { HASH_ROADMAP_EXAMPLES } from './hashExamples';

const SHA256_A = 'ca978112ca1bbdcafac231b39a23dc4da786eff8147c4e72b9807785afee48bb';
const SHA256_B = '3e23e8160039594a33894f6564e1b1348bbd7a0088d42c4acb73eeaed59c009d';
const LONE_SURROGATE = /: the text contains a lone surrogate \(\\ud83d\)$/;

/** Runs the transform of an entry directly (HMAC with the example key). */
const run = (id: string, text: string): string => {
  const entry = HASH_COMMAND_ENTRIES.find((candidate) => candidate.id === id);
  assert.ok(entry, id);
  switch (entry.kind) {
    case 'digest':
      return digestText(entry.algorithm, entry.encoding, text);
    case 'digest-each-line':
      return hashEachLine(text);
    case 'hmac':
      return hmacText(entry.algorithm, keyBytes(HASH_ROADMAP_EXAMPLES[id].key ?? 'key'), text);
    case 'checksum':
      return checksumText(entry.algorithm, text);
    case 'luhn':
      return formatLuhnMessage([luhnCheck(text)]);
  }
};

suite('Hash Transforms (HASH-001..020) Test Suite', () => {
  test('the command entries are HASH-001..HASH-020: 17 basic commands and 3 Replace variants', () => {
    assert.deepStrictEqual(
      HASH_COMMAND_ENTRIES.map((entry) => entry.id),
      Array.from({ length: 20 }, (_, i) => `HASH-${String(i + 1).padStart(3, '0')}`)
    );
    assert.strictEqual(HASH_COMMAND_ENTRIES.filter((entry) => entry.output === 'replace').length, 3);
    assert.strictEqual(new Set(HASH_COMMAND_ENTRIES.map((entry) => entry.name)).size, 20);
  });

  test('every ROADMAP example matches in full', () => {
    HASH_COMMAND_ENTRIES.forEach((entry) => {
      const example = HASH_ROADMAP_EXAMPLES[entry.id];
      assert.strictEqual(run(entry.id, example.input), example.expected, entry.id);
    });
  });

  test("the extension host's node:crypto supports the algorithms computed with it", () => {
    const available = getHashes();
    NODE_CRYPTO_ALGORITHMS.forEach((algorithm) => assert.ok(available.includes(algorithm), algorithm));
  });

  test('multi-byte characters are hashed as UTF-8 bytes', () => {
    assert.strictEqual(digestText('sha256', 'hex', 'あ'), 'dc5a4d3d82f7e15792959dc661538ae0e541ce66494516f5c9cfd9cd3308494d');
    assert.strictEqual(digestText('sha256', 'hex', '😀'), 'f0443a342c5ef54783a111b51ba56c938e474c32324d90c3a60c9c8e3a37e2d9');
    assert.strictEqual(digestText('sha224', 'hex', 'あ😀'), '5dea4e903a9eed3791d7e4989d4ad1c4210987894a70413df24ca763');
    assert.strictEqual(digestText('sha3-256', 'hex', 'あ😀'), '81174d92c7041f407db25a7f45d5477fa245582957528001a76f4d2417aaa0a7');
    assert.strictEqual(checksumText('crc32', 'あ😀'), '95e72d23');
  });

  test('the text is hashed as it is (not trimmed, CRLF kept)', () => {
    assert.strictEqual(digestText('sha256', 'hex', '  abc \n'), 'b3c85aeab94f26c813ae5a7c2eba7e941c11842a7d7e04f468d44031e02c3aa4');
    assert.strictEqual(digestText('sha256', 'hex', 'a\r\nb'), '18745f36a05e29072709042d6062ce54f1b08ff36c27ba80c39f81fb010c8ce2');
  });

  test('a lone surrogate in the text is an error for every kind of computation', () => {
    assert.throws(() => digestText('sha384', 'hex', 'a\ud83d'), LONE_SURROGATE);
    assert.throws(() => digestText('sha256', 'sri', '\ud83db'), LONE_SURROGATE);
    assert.throws(() => digestText('blake2s256', 'hex', 'x\ud83d'), LONE_SURROGATE);
    assert.throws(() => hmacText('sha3-256', keyBytes('key'), '\ud83d'), LONE_SURROGATE);
    assert.throws(() => hmacText('sha1', keyBytes('key'), '\ud83d'), LONE_SURROGATE);
    assert.throws(() => checksumText('fnv1a-32', 'ab\ud83d'), LONE_SURROGATE);
    assert.throws(() => hashEachLine('ok\n\ud83d'), LONE_SURROGATE);
    assert.throws(() => checksumText('adler32', '\ude00'), /lone surrogate \(\\ude00\)/);
  });

  suite('HMAC keys', () => {
    test('an empty key and a key with a lone surrogate are rejected with fixed messages', () => {
      assert.strictEqual(findKeyProblem(''), KEY_EMPTY_MESSAGE);
      assert.strictEqual(KEY_EMPTY_MESSAGE, 'The key must not be empty.');
      for (const key of ['sec\ud83dret', '\ude00', 'x\ud83d']) {
        const message = findKeyProblem(key);
        assert.strictEqual(message, KEY_LONE_SURROGATE_MESSAGE);
        assert.strictEqual(message, 'The key contains a lone surrogate.');
        assert.ok(!message.includes(key) && !/\\u|sec|ret/.test(message), message);
      }
    });

    test('valid keys (including multi-byte characters) are accepted', () => {
      for (const key of ['key', ' ', 'あ🔑', 'a'.repeat(1000)]) {
        assert.strictEqual(findKeyProblem(key), undefined, key);
      }
      assert.strictEqual(hmacText('sha384', keyBytes('あ🔑'), 'abc'), '0ef6bf1620e09a4a1564b4bf1d71da85039ab280b590f31acdb85d645eacb0130b74ffd94fe1c197e75bec9640be45be');
      assert.strictEqual(hmacText('sha3-256', keyBytes('あ🔑'), 'abc'), '9284fec27780b59016468b0c9b9d63f028b4a784779d31ae36002fc90decc340');
    });

    test('keyBytes throws the findKeyProblem message without the key', () => {
      assert.throws(() => keyBytes(''), (error: Error) => error.message === KEY_EMPTY_MESSAGE);
      assert.throws(() => keyBytes('secret\ud83d'), (error: Error) =>
        error.message === KEY_LONE_SURROGATE_MESSAGE && !error.message.includes('secret'));
    });
  });

  suite('HASH-016 hash per line', () => {
    test('line breaks are kept as they are', () => {
      assert.strictEqual(hashEachLine('a\nb'), `${SHA256_A}\n${SHA256_B}`);
      assert.strictEqual(hashEachLine('a\r\nb'), `${SHA256_A}\r\n${SHA256_B}`);
      assert.strictEqual(hashEachLine('a\rb'), `${SHA256_A}\r${SHA256_B}`);
      assert.strictEqual(hashEachLine('a\r\n\rb\n'), `${SHA256_A}\r\n\r${SHA256_B}\n`);
    });

    test('empty lines and a trailing line break stay empty', () => {
      assert.strictEqual(hashEachLine('a\n\nb'), `${SHA256_A}\n\n${SHA256_B}`);
      assert.strictEqual(hashEachLine('a\n'), `${SHA256_A}\n`);
      assert.strictEqual(hashEachLine('\n'), '\n');
      assert.strictEqual(hashEachLine(''), '');
    });

    test('the estimate is an upper bound of the output length', () => {
      const entry = HASH_COMMAND_ENTRIES.find((candidate) => candidate.kind === 'digest-each-line');
      assert.ok(entry);
      for (const text of ['a', 'a\nb', 'a\r\nb\rc\n', '\n\n\n', 'x'.repeat(100)]) {
        const estimate = estimateHashOutputLength(entry, text);
        assert.ok(estimate >= hashEachLine(text).length, JSON.stringify(text));
      }
      assert.strictEqual(estimateHashOutputLength(entry, 'a\r\nb\rc\n'), 4 * 64 + 4);
    });

    test('the estimate of the other commands is an upper bound of their fixed-length result', () => {
      HASH_COMMAND_ENTRIES.filter((entry) => entry.kind !== 'luhn').forEach((entry) => {
        const example = HASH_ROADMAP_EXAMPLES[entry.id];
        assert.ok(estimateHashOutputLength(entry, example.input) >= example.expected.length, entry.id);
      });
    });
  });

  suite('HASH-017 Luhn', () => {
    test('valid and invalid numbers', () => {
      assert.deepStrictEqual(luhnCheck('79927398713'), { verdict: 'valid' });
      assert.deepStrictEqual(luhnCheck('79927398710'), { verdict: 'invalid' });
      assert.deepStrictEqual(luhnCheck('4111111111111111'), { verdict: 'valid' });
      assert.deepStrictEqual(luhnCheck('00'), { verdict: 'valid' });
      assert.deepStrictEqual(luhnCheck('18'), { verdict: 'valid' });
      assert.deepStrictEqual(luhnCheck('19'), { verdict: 'invalid' });
    });

    test('spaces and hyphens between digits and surrounding whitespace are ignored', () => {
      for (const text of ['4111 1111 1111 1111', '4111-1111-1111-1111', ' 7992 7398 713 \n', '\r\n79927398713\t', '7-9-9-2-7-3-9-8-7-1-3']) {
        assert.deepStrictEqual(luhnCheck(text), { verdict: 'valid' }, JSON.stringify(text));
      }
    });

    test('any other character makes it not a number', () => {
      for (const text of ['7992739871a', '７９９２７３９８７１３', '79927398713.', '7992\n7398713', '7992\t7398713', '+79927398713', '7992_7398713', '\ud83d12']) {
        assert.deepStrictEqual(luhnCheck(text), { verdict: 'not-a-number', reason: 'invalid-character' }, JSON.stringify(text));
      }
    });

    test('fewer than 2 digits is not a number', () => {
      for (const text of ['0', ' 5 ', '-', '- -', '   ']) {
        assert.deepStrictEqual(luhnCheck(text), { verdict: 'not-a-number', reason: 'too-short' }, JSON.stringify(text));
      }
    });

    test('a very long number is handled', () => {
      assert.deepStrictEqual(luhnCheck('0'.repeat(1_000_000)), { verdict: 'valid' });
    });

    const valid: LuhnResult = { verdict: 'valid' };
    const invalid: LuhnResult = { verdict: 'invalid' };
    const notANumber: LuhnResult = { verdict: 'not-a-number', reason: 'invalid-character' };
    const tooShort: LuhnResult = { verdict: 'not-a-number', reason: 'too-short' };

    test('the message for one selection', () => {
      assert.strictEqual(formatLuhnMessage([valid]), 'Luhn: valid');
      assert.strictEqual(formatLuhnMessage([invalid]), 'Luhn: invalid');
      assert.strictEqual(formatLuhnMessage([notANumber]), 'Luhn: not a number (only digits, spaces and hyphens are allowed)');
      assert.strictEqual(formatLuhnMessage([tooShort]), 'Luhn: not a number (at least 2 digits are required)');
    });

    test('the message lists 2 to 10 selections by number', () => {
      assert.strictEqual(formatLuhnMessage([valid, invalid]), 'Luhn: #1 valid, #2 invalid');
      assert.strictEqual(formatLuhnMessage([valid, invalid, tooShort]), 'Luhn: #1 valid, #2 invalid, #3 not a number');
      const ten = [...Array(9).fill(valid), notANumber];
      assert.strictEqual(
        formatLuhnMessage(ten),
        'Luhn: #1 valid, #2 valid, #3 valid, #4 valid, #5 valid, #6 valid, #7 valid, #8 valid, #9 valid, #10 not a number'
      );
    });

    test('the message summarises 11 or more selections, zero counts included', () => {
      assert.strictEqual(formatLuhnMessage(Array(11).fill(valid)), 'Luhn: 11 selections: 11 valid, 0 invalid, 0 not a number');
      assert.strictEqual(
        formatLuhnMessage([...Array(5).fill(valid), ...Array(4).fill(invalid), notANumber, tooShort, tooShort]),
        'Luhn: 12 selections: 5 valid, 4 invalid, 3 not a number'
      );
    });
  });
});
