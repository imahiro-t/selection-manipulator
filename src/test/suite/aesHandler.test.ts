import * as assert from 'assert';
import * as crypto from 'crypto';
import * as vscode from 'vscode';
import { aesHandler, aesEncrypt, aesDecrypt } from '../../handler/aesHandler';
import { createTextEditor } from './testUtils';

const V2_PATTERN = /^v2:([0-9a-f]{32}):([0-9a-f]{32}):([0-9a-f]+)$/;

/** The legacy encryption steps of the implementation before the v2 format (fixed salt 'salt'). */
const legacyEncrypt = (src: string, secret: string, iv: Buffer | null): string => {
  const key = crypto.scryptSync(secret, 'salt', 32);
  const cipher = crypto.createCipheriv('aes-256-cbc', key, iv ?? Buffer.alloc(16, 0));
  const encrypted = cipher.update(src, 'utf8', 'hex') + cipher.final('hex');
  return iv ? `${iv.toString('hex')}:${encrypted}` : encrypted;
};

suite('AES Handler Test Suite', () => {
  test('AES Encrypt/Decrypt (Replace)', async () => {
    const editor = await createTextEditor('hello');
    editor.selection = new vscode.Selection(0, 0, 0, 5);

    // Encrypt
    aesHandler('encrypt', true, 'secret')(editor);
    await new Promise(resolve => setTimeout(resolve, 100));
    const encrypted = editor.document.getText();
    assert.notStrictEqual(encrypted, 'hello');
    assert.match(encrypted, V2_PATTERN);

    // Decrypt
    editor.selection = new vscode.Selection(0, 0, 0, encrypted.length);
    aesHandler('decrypt', true, 'secret')(editor);
    await new Promise(resolve => setTimeout(resolve, 100));
    const decrypted = editor.document.getText();

    assert.strictEqual(decrypted, 'hello');
  });

  test('AES generates different ciphertexts with random IV', async () => {
    const editor1 = await createTextEditor('hello');
    editor1.selection = new vscode.Selection(0, 0, 0, 5);
    aesHandler('encrypt', true, 'secret')(editor1);
    await new Promise(resolve => setTimeout(resolve, 100));
    const encrypted1 = editor1.document.getText();

    const editor2 = await createTextEditor('hello');
    editor2.selection = new vscode.Selection(0, 0, 0, 5);
    aesHandler('encrypt', true, 'secret')(editor2);
    await new Promise(resolve => setTimeout(resolve, 100));
    const encrypted2 = editor2.document.getText();

    assert.notStrictEqual(encrypted1, encrypted2);
  });

  test('v2 format round trip (ASCII, multibyte, emoji, multi-line)', () => {
    const inputs = ['hello', '日本語テキスト', 'emoji 🎉👍🏽 done', 'line 1\nline 2\r\nline 3 – ü'];
    for (const input of inputs) {
      const encrypted = aesEncrypt(input, 'secret');
      assert.match(encrypted, V2_PATTERN, input);
      assert.deepStrictEqual(aesDecrypt(encrypted, 'secret'), { text: input, legacy: false }, input);
    }
  });

  test('v2 salt and IV differ on every encryption', () => {
    const results = Array.from({ length: 5 }, () => aesEncrypt('same text', 'same secret').match(V2_PATTERN));
    const salts = results.map(m => m![1]);
    const ivs = results.map(m => m![2]);
    assert.strictEqual(new Set(salts).size, salts.length);
    assert.strictEqual(new Set(ivs).size, ivs.length);
  });

  test('legacy format A (iv:ciphertext, fixed salt) decrypts in compatibility mode', () => {
    // Generated now with the legacy steps.
    const generated = legacyEncrypt('legacy with iv', 'secret', crypto.randomBytes(16));
    assert.deepStrictEqual(aesDecrypt(generated, 'secret'), { text: 'legacy with iv', legacy: true });
    // Literals produced by the implementation before the v2 format (main at 6640e87).
    assert.deepStrictEqual(
      aesDecrypt('9341c76b2734640981b43927febaf3b0:8dea8b1a099c01ab46519c92d5edf008', 'secret'),
      { text: 'hello legacy', legacy: true });
    assert.deepStrictEqual(
      aesDecrypt('0ca65e24de6a42f367993cfff280b250:13fda955c2afcad6ac93aefab8cb5512cd3ff3566f371e8cc90d3c3f8f7de783', 'pässwörd'),
      { text: '日本語テキスト🎉', legacy: true });
  });

  test('legacy format B (ciphertext only, fixed salt, zero IV) decrypts in compatibility mode', () => {
    const generated = legacyEncrypt('legacy zero iv', 'secret', null);
    assert.deepStrictEqual(aesDecrypt(generated, 'secret'), { text: 'legacy zero iv', legacy: true });
    // Literal produced by the implementation before the v2 format (main at 6640e87).
    assert.deepStrictEqual(aesDecrypt('c212ae3bf15336cd64a0592b498602d2', 'secret'), { text: 'hello zero iv', legacy: true });
  });

  test('wrong secret or malformed input decrypts to an empty string', () => {
    const encrypted = aesEncrypt('hello', 'secret');
    const [, salt, iv, body] = encrypted.split(':');
    const wrong = aesDecrypt(encrypted, 'other secret');
    // CBC is not authenticated: a wrong key can rarely pass the padding check, but never yields the plaintext.
    assert.notStrictEqual(wrong.text, 'hello');
    const malformed = [
      `v2:${salt.slice(2)}:${iv}:${body}`, // salt too short
      `v2:${salt}:${iv}0:${body}`, // IV too long
      `v2:${salt}:${iv.replace(/^./, 'g')}:${body}`, // not hex
      `v2:${salt}:${iv}`, // missing ciphertext
      `v3:${salt}:${iv}:${body}`, // unknown version
      `v2:${salt}:${iv}:${body}:extra`,
      'zz:1234', // legacy A with a non-hex IV
      'not hex at all',
      '',
    ];
    for (const input of malformed) {
      assert.deepStrictEqual(aesDecrypt(input, 'secret'), { text: '', legacy: false }, input);
    }
  });

  test('decrypt via the handler (Replace) restores legacy ciphertexts', async () => {
    const legacy = '9341c76b2734640981b43927febaf3b0:8dea8b1a099c01ab46519c92d5edf008';
    const editor = await createTextEditor(legacy);
    editor.selection = new vscode.Selection(0, 0, 0, legacy.length);
    aesHandler('decrypt', true, 'secret')(editor);
    await new Promise(resolve => setTimeout(resolve, 100));
    assert.strictEqual(editor.document.getText(), 'hello legacy');
  });
});
