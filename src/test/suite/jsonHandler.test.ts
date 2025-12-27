import * as assert from 'assert';
import * as vscode from 'vscode';
import { jsonHandler } from '../../handler/jsonHandler';
import { createTextEditor, getDocumentText } from './testUtils';

suite('JSON Handler Test Suite', () => {
  test('Format JSON (Pretty Print)', async () => {
    const editor = await createTextEditor('{"a":1}');
    editor.selection = new vscode.Selection(0, 0, 0, 7);
    jsonHandler('format', true)(editor);
    await new Promise(resolve => setTimeout(resolve, 100));
    const text = editor.document.getText();
    assert.ok(text.includes('\n'));
    assert.ok(text.includes('"a": 1'));
  });

  test('Minify JSON', async () => {
    const editor = await createTextEditor('{\n  "a": 1\n}');
    editor.selection = new vscode.Selection(0, 0, 2, 1);
    jsonHandler('minify', true)(editor);
    await new Promise(resolve => setTimeout(resolve, 100));
    const text = editor.document.getText();
    assert.strictEqual(text, '{"a":1}');
  });
  test('Flatten JSON', async () => {
    const editor = await createTextEditor('{"a": {"b": 1}}');
    editor.selection = new vscode.Selection(0, 0, 0, 15);
    await jsonHandler('flatten', true)(editor);
    await new Promise(resolve => setTimeout(resolve, 200));
    const text = getDocumentText(editor);
    assert.strictEqual(JSON.parse(text)["a.b"], 1);
  });

  test('Unflatten JSON', async () => {
    const editor = await createTextEditor('{"a.b": 1}');
    editor.selection = new vscode.Selection(0, 0, 0, 10);
    await jsonHandler('unflatten', true)(editor);
    await new Promise(resolve => setTimeout(resolve, 200));
    const text = getDocumentText(editor);
    assert.strictEqual(JSON.parse(text).a.b, 1);
  });
});
