import * as assert from 'assert';
import * as vscode from 'vscode';
import { randomHandler } from '../../handler/randomHandler';
import { createTextEditor, getDocumentText } from './testUtils';

/** The characters of a generated password (`generatePassword` of src/handler/randomHandler.ts), and nothing else. */
const PASSWORD_CHARS = /^[a-zA-Z0-9!@#$%^&*()_+~`|}{[\]:;?><,./\-=]+$/;

suite('Random Handler Test Suite', () => {
  test('Insert UUID at cursor', async () => {
    const editor = await createTextEditor('');
    const handler = randomHandler('uuid');
    await handler(editor);

    const text = editor.document.getText();
    assert.match(text, /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);
  });

  test('Replace selection with UUID', async () => {
    const editor = await createTextEditor('replace me');
    editor.selection = new vscode.Selection(0, 0, 0, 10);

    const handler = randomHandler('uuid');
    await handler(editor);

    const text = editor.document.getText();
    assert.notStrictEqual(text, 'replace me');
    assert.match(text, /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);
  });

  test('Multiple unique UUIDs', async () => {
    const editor = await createTextEditor('1\n2');
    editor.selections = [
      new vscode.Selection(0, 0, 0, 1),
      new vscode.Selection(1, 0, 1, 1)
    ];

    const handler = randomHandler('uuid');
    assert.strictEqual(await handler(editor), true, 'the edit is applied');

    const text = editor.document.getText();
    const lines = text.split('\n');
    assert.strictEqual(lines.length, 2);
    assert.notStrictEqual(lines[0], lines[1]);
    assert.match(lines[0], /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);
    assert.match(lines[1], /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);
  });

  test('Insert Password', async () => {
    const editor = await createTextEditor('');
    const handler = randomHandler('password');
    // Await the edit itself (a fixed sleep could read the text before the edit or after a foreign one).
    assert.strictEqual(await handler(editor), true, 'the edit is applied');

    const text = editor.document.getText();
    assert.strictEqual(text.length, 16, JSON.stringify(text));
    assert.match(text, PASSWORD_CHARS, 'only the password characters');
  });

  test('Insert Password: always 16 characters from the password character set', async () => {
    // The generator itself: many passwords, each exactly 16 allowed characters.
    const editor = await createTextEditor(Array.from({ length: 200 }, (_, i) => `${i}`).join('\n'));
    editor.selections = Array.from({ length: 200 }, (_, i) => new vscode.Selection(i, 0, i, `${i}`.length));
    assert.strictEqual(await randomHandler('password')(editor), true, 'the edit is applied');

    const lines = editor.document.getText().split('\n');
    assert.strictEqual(lines.length, 200);
    lines.forEach(line => {
      assert.strictEqual(line.length, 16, JSON.stringify(line));
      assert.match(line, PASSWORD_CHARS, JSON.stringify(line));
    });
  });

  test('Insert IPv4', async () => {
    const editor = await createTextEditor('');
    const handler = randomHandler('ipv4');
    assert.strictEqual(await handler(editor), true, 'the edit is applied');

    const text = editor.document.getText();
    assert.match(text, /^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/);
  });

  test('Generate IPv6', async () => {
    const editor = await createTextEditor('');
    await randomHandler('ipv6')(editor);
    const text = getDocumentText(editor);
    assert.strictEqual(text.split(':').length, 8);
  });

  test('Generate Lorem Ipsum', async () => {
    const editor = await createTextEditor('');
    await randomHandler('lorem-ipsum')(editor);
    const text = getDocumentText(editor);
    assert.ok(text.startsWith('Lorem ipsum'));
    assert.ok(text.length > 100);
  });
});
