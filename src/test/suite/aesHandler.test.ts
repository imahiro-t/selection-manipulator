import * as assert from 'assert';
import * as crypto from 'crypto';
import * as vscode from 'vscode';
import { aesHandler, aesEncrypt, aesDecrypt, AesDependencies, LEGACY_NOTICE } from '../../handler/aesHandler';
import { EDIT_REJECTED_REASON, TEXT_NOT_CHANGED } from '../../editGuard';
import { createTextEditor, notificationRecorder, waitForNewDocument, withEdit } from './testUtils';

const V2_PATTERN = /^v2:([0-9a-f]{32}):([0-9a-f]{32}):([0-9a-f]+)$/;

/** The legacy encryption steps of the implementation before the v2 format (fixed salt 'salt'). */
const legacyEncrypt = (src: string, secret: string, iv: Buffer | null): string => {
  const key = crypto.scryptSync(secret, 'salt', 32);
  const cipher = crypto.createCipheriv('aes-256-cbc', key, iv ?? Buffer.alloc(16, 0));
  const encrypted = cipher.update(src, 'utf8', 'hex') + cipher.final('hex');
  return iv ? `${iv.toString('hex')}:${encrypted}` : encrypted;
};

/** A secret that no other string of the tests contains by chance. */
const UNIQUE_SECRET = 's3cr3t-🔑-unique-9f27c1';

/** Selects each line of `editor`'s document (one ciphertext per line). */
const selectLines = (editor: vscode.TextEditor): void => {
  editor.selections = Array.from({ length: editor.document.lineCount }, (_, i) => {
    const line = editor.document.lineAt(i);
    return new vscode.Selection(line.range.start, line.range.end);
  });
};

/**
 * A stand-in for `editor` (not one of `window.visibleTextEditors`: pass `isEditorAvailable`) with
 * the given `selections` / `document` members; the others the handler reads are delegated.
 */
const standIn = (editor: vscode.TextEditor, members: { selections?: () => readonly vscode.Selection[]; document?: vscode.TextDocument }): vscode.TextEditor => ({
  get selections() { return members.selections ? members.selections() : editor.selections; },
  get selection() { return editor.selection; },
  get document() { return members.document ?? editor.document; },
  edit: editor.edit.bind(editor),
}) as unknown as vscode.TextEditor;

suite('AES Handler Test Suite', () => {
  test('AES Encrypt/Decrypt (Replace)', async () => {
    const recorder = notificationRecorder();
    const deps: AesDependencies = { notifier: recorder.notifier };
    const editor = await createTextEditor('hello');
    editor.selection = new vscode.Selection(0, 0, 0, 5);

    // Encrypt
    await aesHandler('encrypt', true, 'secret', deps)(editor);
    const encrypted = editor.document.getText();
    assert.notStrictEqual(encrypted, 'hello');
    assert.match(encrypted, V2_PATTERN);

    // Decrypt
    editor.selection = new vscode.Selection(0, 0, 0, encrypted.length);
    await aesHandler('decrypt', true, 'secret', deps)(editor);
    const decrypted = editor.document.getText();

    assert.strictEqual(decrypted, 'hello');
    assert.deepStrictEqual(recorder.infos, [], 'v2 only: no compatibility-mode notice');
    assert.deepStrictEqual(recorder.warnings, []);
  });

  test('AES generates different ciphertexts with random IV', async () => {
    const deps: AesDependencies = { notifier: notificationRecorder().notifier };
    const editor1 = await createTextEditor('hello');
    editor1.selection = new vscode.Selection(0, 0, 0, 5);
    await aesHandler('encrypt', true, 'secret', deps)(editor1);
    const encrypted1 = editor1.document.getText();

    const editor2 = await createTextEditor('hello');
    editor2.selection = new vscode.Selection(0, 0, 0, 5);
    await aesHandler('encrypt', true, 'secret', deps)(editor2);
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
    const recorder = notificationRecorder();
    const editor = await createTextEditor(legacy);
    editor.selection = new vscode.Selection(0, 0, 0, legacy.length);
    await aesHandler('decrypt', true, 'secret', { notifier: recorder.notifier })(editor);
    assert.strictEqual(editor.document.getText(), 'hello legacy');
    assert.deepStrictEqual(recorder.infos, [LEGACY_NOTICE]);
  });

  suite('compatibility-mode notice', () => {
    test('several legacy selections (A and B) in one run: notified exactly once', async () => {
      const recorder = notificationRecorder();
      const editor = await createTextEditor([
        legacyEncrypt('first', UNIQUE_SECRET, crypto.randomBytes(16)),
        legacyEncrypt('second', UNIQUE_SECRET, null),
        legacyEncrypt('third', UNIQUE_SECRET, crypto.randomBytes(16)),
      ].join('\n'));
      selectLines(editor);
      await aesHandler('decrypt', true, UNIQUE_SECRET, { notifier: recorder.notifier })(editor);
      assert.strictEqual(editor.document.getText(), 'first\nsecond\nthird');
      assert.deepStrictEqual(recorder.infos, [LEGACY_NOTICE]);
      assert.deepStrictEqual(recorder.warnings, []);
      assert.deepStrictEqual(recorder.errors, []);
    });

    test('v2 and legacy selections mixed in one run: notified exactly once', async () => {
      const recorder = notificationRecorder();
      const editor = await createTextEditor([
        aesEncrypt('modern', UNIQUE_SECRET),
        legacyEncrypt('old', UNIQUE_SECRET, null),
        aesEncrypt('modern again', UNIQUE_SECRET),
      ].join('\n'));
      selectLines(editor);
      await aesHandler('decrypt', true, UNIQUE_SECRET, { notifier: recorder.notifier })(editor);
      assert.strictEqual(editor.document.getText(), 'modern\nold\nmodern again');
      assert.deepStrictEqual(recorder.infos, [LEGACY_NOTICE]);
      assert.deepStrictEqual(recorder.warnings, []);
    });

    test('v2 only or Encrypt: not notified', async () => {
      const recorder = notificationRecorder();
      const deps: AesDependencies = { notifier: recorder.notifier };
      const editor = await createTextEditor([aesEncrypt('a', UNIQUE_SECRET), aesEncrypt('b', UNIQUE_SECRET)].join('\n'));
      selectLines(editor);
      await aesHandler('decrypt', true, UNIQUE_SECRET, deps)(editor);
      assert.strictEqual(editor.document.getText(), 'a\nb');
      selectLines(editor);
      await aesHandler('encrypt', true, UNIQUE_SECRET, deps)(editor);
      assert.match(editor.document.lineAt(0).text, V2_PATTERN);
      // Encrypt of a text that happens to look like a legacy ciphertext is not a decryption either.
      const hexEditor = await createTextEditor(legacyEncrypt('x', UNIQUE_SECRET, null));
      selectLines(hexEditor);
      await aesHandler('encrypt', true, UNIQUE_SECRET, deps)(hexEditor);
      assert.match(hexEditor.document.getText(), V2_PATTERN);
      assert.deepStrictEqual(recorder.infos, []);
      assert.deepStrictEqual(recorder.warnings, []);
    });

    test('two runs: notified once per run (no state carried over)', async () => {
      const recorder = notificationRecorder();
      const deps: AesDependencies = { notifier: recorder.notifier };
      const editor1 = await createTextEditor([legacyEncrypt('one', UNIQUE_SECRET, null), legacyEncrypt('two', UNIQUE_SECRET, null)].join('\n'));
      selectLines(editor1);
      await aesHandler('decrypt', true, UNIQUE_SECRET, deps)(editor1);
      assert.deepStrictEqual(recorder.infos, [LEGACY_NOTICE]);
      const editor2 = await createTextEditor(legacyEncrypt('three', UNIQUE_SECRET, crypto.randomBytes(16)));
      selectLines(editor2);
      await aesHandler('decrypt', true, UNIQUE_SECRET, deps)(editor2);
      assert.deepStrictEqual(recorder.infos, [LEGACY_NOTICE, LEGACY_NOTICE]);
      // A v2-only run after them adds nothing.
      const editor3 = await createTextEditor(aesEncrypt('four', UNIQUE_SECRET));
      selectLines(editor3);
      await aesHandler('decrypt', true, UNIQUE_SECRET, deps)(editor3);
      assert.strictEqual(editor3.document.getText(), 'four');
      assert.deepStrictEqual(recorder.infos, [LEGACY_NOTICE, LEGACY_NOTICE]);
    });

    test('the notice contains neither the secret, the plaintext nor the ciphertext', async () => {
      const recorder = notificationRecorder();
      const deps: AesDependencies = { notifier: recorder.notifier };
      const plaintexts = ['plaintext-marker-Q7Z', 'другой-текст-ж'];
      const ciphertexts = [
        legacyEncrypt(plaintexts[0], UNIQUE_SECRET, crypto.randomBytes(16)),
        legacyEncrypt(plaintexts[1], UNIQUE_SECRET, null),
      ];
      const replaceEditor = await createTextEditor(ciphertexts.join('\n'));
      selectLines(replaceEditor);
      await aesHandler('decrypt', true, UNIQUE_SECRET, deps)(replaceEditor);
      assert.strictEqual(replaceEditor.document.getText(), plaintexts.join('\n'));

      const opened = waitForNewDocument();
      const plainEditor = await createTextEditor(ciphertexts[0]);
      selectLines(plainEditor);
      await aesHandler('decrypt', false, UNIQUE_SECRET, deps)(plainEditor);
      await opened;

      const messages = [...recorder.infos, ...recorder.warnings, ...recorder.errors];
      assert.strictEqual(messages.length, 2);
      const hexParts = ciphertexts.flatMap(c => c.split(':'));
      const forbidden = [
        UNIQUE_SECRET,
        's3cr3t',
        ...plaintexts,
        ...ciphertexts,
        ...hexParts.map(h => h.slice(0, 16)),
        ...hexParts.map(h => h.slice(-16)),
      ];
      for (const message of messages) {
        assert.strictEqual(message, LEGACY_NOTICE);
        for (const value of forbidden) {
          assert.ok(!message.includes(value), `the notice must not contain ${JSON.stringify(value)}`);
        }
      }
    });

    test('non-Replace decrypt of a legacy ciphertext: result document and one notice', async () => {
      const recorder = notificationRecorder();
      const editor = await createTextEditor(legacyEncrypt('opened in a new document', UNIQUE_SECRET, crypto.randomBytes(16)));
      selectLines(editor);
      const opened = waitForNewDocument();
      await aesHandler('decrypt', false, UNIQUE_SECRET, { notifier: recorder.notifier })(editor);
      const doc = await opened;
      assert.strictEqual(doc.getText(), 'opened in a new document');
      assert.deepStrictEqual(recorder.infos, [LEGACY_NOTICE]);
      assert.deepStrictEqual(recorder.warnings, []);
    });

    test('an edit the editor does not apply: no notice, a warning, the text unchanged', async () => {
      const recorder = notificationRecorder();
      const legacy = legacyEncrypt('never applied', UNIQUE_SECRET, null);
      const editor = await createTextEditor(legacy);
      selectLines(editor);
      // The edit callback is run (so the legacy ciphertext is converted), but the edit is refused.
      const refusing = withEdit(editor, (build) => {
        build({ replace: () => undefined, insert: () => undefined, delete: () => undefined, setEndOfLine: () => undefined });
        return Promise.resolve(false);
      });
      await aesHandler('decrypt', true, UNIQUE_SECRET, { notifier: recorder.notifier, isEditorAvailable: () => true })(refusing);
      assert.deepStrictEqual(recorder.infos, []);
      assert.deepStrictEqual(recorder.warnings, [TEXT_NOT_CHANGED + EDIT_REJECTED_REASON]);
      assert.strictEqual(recorder.warnings[0], 'The text was not changed: the editor did not accept the edit.');
      assert.strictEqual(editor.document.getText(), legacy);
    });
  });

  suite('errors of the handler reach the caller', () => {
    test('an error after the input guard rejects with the original error', async () => {
      const recorder = notificationRecorder();
      const editor = await createTextEditor('hello');
      selectLines(editor);
      const throwingDocument = {
        getText: () => { throw new Error('boom: getText'); },
        get isClosed() { return editor.document.isClosed; },
        get uri() { return editor.document.uri; },
      } as unknown as vscode.TextDocument;
      const stand = standIn(editor, { document: throwingDocument });
      await assert.rejects(
        aesHandler('encrypt', false, 'secret', { notifier: recorder.notifier, isEditorAvailable: () => true })(stand),
        /boom: getText/);
      assert.deepStrictEqual(recorder.infos, []);
      assert.deepStrictEqual(recorder.warnings, []);
    });

    test('an error on the first line rejects with the original error', async () => {
      const recorder = notificationRecorder();
      const editor = await createTextEditor('hello');
      const stand = standIn(editor, { selections: () => { throw new Error('boom: selections'); } });
      await assert.rejects(
        aesHandler('decrypt', true, 'secret', { notifier: recorder.notifier, isEditorAvailable: () => true })(stand),
        /boom: selections/);
      assert.deepStrictEqual(recorder.infos, []);
      assert.deepStrictEqual(recorder.warnings, []);
    });
  });
});
