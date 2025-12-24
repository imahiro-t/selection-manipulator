import * as assert from 'assert';
import * as vscode from 'vscode';
import { incrementFromHandler } from '../../handler/incrementFromHandler';
import { createTextEditor } from './testUtils';

suite('Increment From Handler Test Suite', () => {
  test('Increment From 1', async () => {
    const editor = await createTextEditor('a\nb\nc');
    editor.selections = [
      new vscode.Selection(0, 0, 0, 1),
      new vscode.Selection(1, 0, 1, 1),
      new vscode.Selection(2, 0, 2, 1)
    ];

    incrementFromHandler(1)(editor);

    await new Promise(resolve => setTimeout(resolve, 100));

    const text = editor.document.getText();
    assert.strictEqual(text, '1\n2\n3');
  });

  test('Increment From 10', async () => {
    const editor = await createTextEditor('a\nb\nc');
    editor.selections = [
      new vscode.Selection(0, 0, 0, 1),
      new vscode.Selection(1, 0, 1, 1),
      new vscode.Selection(2, 0, 2, 1)
    ];

    incrementFromHandler(10)(editor);

    await new Promise(resolve => setTimeout(resolve, 100));

    const text = editor.document.getText();
    assert.strictEqual(text, '10\n11\n12');
  });
});
