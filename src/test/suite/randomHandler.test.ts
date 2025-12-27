import * as assert from 'assert';
import * as vscode from 'vscode';
import { randomHandler } from '../../handler/randomHandler';
import { createTextEditor } from './testUtils';

suite('Random Handler Test Suite', () => {
  test('Insert UUID at cursor', async () => {
    const editor = await createTextEditor('');
    const handler = randomHandler('uuid');
    handler(editor);

    // Wait for edit to apply (though run synchronously usually, edit builder is async-ish?)
    // In extension host, edit returns thenable, but handler is void.
    // We might need to wait a small bit or ensure handler returns promise.
    // Checking source: handler returns void. textEditor.edit returns Thenable.
    // We can't await it easily without modifying handler.
    // Standard workaround: sleep or modify handler to return promise.
    // Since we can't modify handler easily without breaking signature, we might need a small delay.

    await new Promise(resolve => setTimeout(resolve, 100));

    const text = editor.document.getText();
    assert.match(text, /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);
  });

  test('Replace selection with UUID', async () => {
    const editor = await createTextEditor('replace me');
    editor.selection = new vscode.Selection(0, 0, 0, 10);

    const handler = randomHandler('uuid');
    handler(editor);

    await new Promise(resolve => setTimeout(resolve, 100));

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
    handler(editor);

    await new Promise(resolve => setTimeout(resolve, 100));

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
    handler(editor);

    await new Promise(resolve => setTimeout(resolve, 100));

    const text = editor.document.getText();
    assert.strictEqual(text.length, 16);
  });

  test('Insert IPv4', async () => {
    const editor = await createTextEditor('');
    const handler = randomHandler('ipv4');
    handler(editor);

    await new Promise(resolve => setTimeout(resolve, 100));

    const text = editor.document.getText();
    assert.match(text, /^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/);
  });

  test('Insert IPv6', async () => {
    const editor = await createTextEditor('');
    const handler = randomHandler('ipv6');
    handler(editor);

    await new Promise(resolve => setTimeout(resolve, 100));

    const text = editor.document.getText();
    assert.match(text, /^[0-9a-f]{1,4}(:[0-9a-f]{1,4}){7}$/);
  });
});
