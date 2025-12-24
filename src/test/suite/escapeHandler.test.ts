import * as assert from 'assert';
import * as vscode from 'vscode';
import { escapeHandler } from '../../handler/escapeHandler';
import { createTextEditor } from './testUtils';

suite('Escape Handler Test Suite', () => {
  test('Escape Text (Replace)', async () => {
    const editor = await createTextEditor('"Hello" World');
    editor.selection = new vscode.Selection(0, 0, 0, 13);

    const handler = escapeHandler('escape', true);
    handler(editor);

    await new Promise(resolve => setTimeout(resolve, 100));

    const text = editor.document.getText();
    assert.strictEqual(text, '\\"Hello\\" World');
  });

  test('Unescape Text (Replace)', async () => {
    const editor = await createTextEditor('\\"Hello\\" World');
    editor.selection = new vscode.Selection(0, 0, 0, 15);

    const handler = escapeHandler('unescape', true);
    handler(editor);

    await new Promise(resolve => setTimeout(resolve, 100));

    const text = editor.document.getText();
    assert.strictEqual(text, '"Hello" World');
  });

  test('Escape Multiline Text', async () => {
    const editor = await createTextEditor('Line 1\nLine 2');
    editor.selection = new vscode.Selection(0, 0, 1, 6);

    const handler = escapeHandler('escape', true);
    handler(editor);

    await new Promise(resolve => setTimeout(resolve, 100));

    const text = editor.document.getText();
    assert.strictEqual(text, 'Line 1\\nLine 2');
  });
});
