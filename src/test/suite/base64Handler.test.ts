import * as assert from 'assert';
import * as vscode from 'vscode';
import { base64Handler } from '../../handler/base64Handler';
import { createTextEditor } from './testUtils';

suite('Base64 Handler Test Suite', () => {
  test('Encode Base64 (Replace)', async () => {
    const editor = await createTextEditor('hello');
    editor.selection = new vscode.Selection(0, 0, 0, 5);
    base64Handler('encode', true)(editor);
    await new Promise(resolve => setTimeout(resolve, 100));
    assert.strictEqual(editor.document.getText(), 'aGVsbG8=');
  });

  test('Decode Base64 (Replace)', async () => {
    const editor = await createTextEditor('aGVsbG8=');
    editor.selection = new vscode.Selection(0, 0, 0, 8);
    base64Handler('decode', true)(editor);
    await new Promise(resolve => setTimeout(resolve, 100));
    assert.strictEqual(editor.document.getText(), 'hello');
  });
});
