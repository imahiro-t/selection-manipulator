import * as assert from 'assert';
import * as vscode from 'vscode';
import { incrementByHandler } from '../../handler/incrementByHandler';
import { createTextEditor } from './testUtils';

suite('Increment By Handler Test Suite', () => {
  test('Increment By 1', async () => {
    const editor = await createTextEditor('1\n2\n3');
    editor.selections = [
      new vscode.Selection(0, 0, 0, 1),
      new vscode.Selection(1, 0, 1, 1),
      new vscode.Selection(2, 0, 2, 1)
    ];

    incrementByHandler(1)(editor);

    await new Promise(resolve => setTimeout(resolve, 100));

    const text = editor.document.getText();
    assert.strictEqual(text, '2\n3\n4');
  });

  test('Increment By 5', async () => {
    const editor = await createTextEditor('10\n20');
    editor.selections = [
      new vscode.Selection(0, 0, 0, 2),
      new vscode.Selection(1, 0, 1, 2)
    ];

    incrementByHandler(5)(editor);

    await new Promise(resolve => setTimeout(resolve, 100));

    const text = editor.document.getText();
    assert.strictEqual(text, '15\n25');
  });

  test('Ignore non-number', async () => {
    const editor = await createTextEditor('a');
    editor.selection = new vscode.Selection(0, 0, 0, 1);

    incrementByHandler(1)(editor);

    await new Promise(resolve => setTimeout(resolve, 100));

    const text = editor.document.getText();
    assert.strictEqual(text, 'a');
  });
});
