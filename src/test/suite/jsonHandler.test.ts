import * as assert from 'assert';
import * as vscode from 'vscode';
import { jsonHandler } from '../../handler/jsonHandler';
import { createTextEditor, getDocumentText, waitForChange } from './testUtils';

suite('JSON Handler Test Suite', () => {
  test('Format JSON (Pretty Print)', async () => {
    const editor = await createTextEditor('{"a":1}');
    editor.selection = new vscode.Selection(0, 0, 0, 7);
    const changed = waitForChange(editor.document);
    jsonHandler('format', true)(editor);
    await changed;
    const text = editor.document.getText();
    assert.ok(text.includes('\n'));
    assert.ok(text.includes('"a": 1'));
  });

  test('Minify JSON', async () => {
    const editor = await createTextEditor('{\n  "a": 1\n}');
    editor.selection = new vscode.Selection(0, 0, 2, 1);
    const changed = waitForChange(editor.document);
    jsonHandler('minify', true)(editor);
    await changed;
    const text = editor.document.getText();
    assert.strictEqual(text, '{"a":1}');
  });
  test('Flatten JSON', async () => {
    const editor = await createTextEditor('{"a": {"b": 1}}');
    editor.selection = new vscode.Selection(0, 0, 0, 15);
    const changed = waitForChange(editor.document);
    jsonHandler('flatten', true)(editor);
    await changed;
    const text = getDocumentText(editor);
    assert.strictEqual(JSON.parse(text)["a.b"], 1);
  });

  test('Unflatten JSON Prototype Pollution Protection', async () => {
    const editor = await createTextEditor('{"__proto__.polluted": "yes", "a.b": 1}');
    editor.selection = new vscode.Selection(0, 0, 0, 39);
    const changed = waitForChange(editor.document);
    jsonHandler('unflatten', true)(editor);
    await changed;
    const text = getDocumentText(editor);
    const parsed = JSON.parse(text);
    assert.strictEqual(parsed.a.b, 1);
    assert.strictEqual((({} as any).polluted), undefined);
  });
});
