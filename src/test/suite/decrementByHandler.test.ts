import * as assert from 'assert';
import * as vscode from 'vscode';
import { decrementByHandler } from '../../handler/decrementByHandler';
import { createTextEditor } from './testUtils';

suite('Decrement By Handler Test Suite', () => {
  test('Decrement By 1', async () => {
    const editor = await createTextEditor('2\n3\n4');
    editor.selections = [
      new vscode.Selection(0, 0, 0, 1),
      new vscode.Selection(1, 0, 1, 1),
      new vscode.Selection(2, 0, 2, 1)
    ];

    decrementByHandler(1)(editor);

    await new Promise(resolve => setTimeout(resolve, 100));

    const text = editor.document.getText();
    assert.strictEqual(text, '1\n2\n3');
  });
});
