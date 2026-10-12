import * as assert from 'assert';
import * as vscode from 'vscode';
import { decrementToHandler } from '../../handler/decrementToHandler';
import { createTextEditor, waitForChange } from './testUtils';

suite('Decrement To Handler Test Suite', () => {
  test('Decrement To 1', async () => {
    const editor = await createTextEditor('a\nb\nc');
    editor.selections = [
      new vscode.Selection(0, 0, 0, 1),
      new vscode.Selection(1, 0, 1, 1),
      new vscode.Selection(2, 0, 2, 1)
    ];

    // Count: 3 items. Ends at 1. 3, 2, 1.
    const changed = waitForChange(editor.document);
    decrementToHandler(1)(editor);
    await changed;

    const text = editor.document.getText();
    assert.strictEqual(text, '3\n2\n1');
  });
});
