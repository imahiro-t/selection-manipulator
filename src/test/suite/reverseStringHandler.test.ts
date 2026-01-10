import * as assert from 'assert';
import * as vscode from 'vscode';
import { reverseStringHandler } from '../../handler/reverseStringHandler';
import { createTextEditor } from './testUtils';

suite('Reverse String Handler Test Suite', () => {
  test('Reverse String (Replace)', async () => {
    const editor = await createTextEditor('abcde\n12345');
    editor.selections = [
      new vscode.Selection(0, 0, 0, 5),
      new vscode.Selection(1, 0, 1, 5)
    ];

    await reverseStringHandler(false)(editor);

    assert.strictEqual(editor.document.getText(new vscode.Range(0, 0, 0, 5)), 'edcba');
    assert.strictEqual(editor.document.getText(new vscode.Range(1, 0, 1, 5)), '54321');
  });
});
