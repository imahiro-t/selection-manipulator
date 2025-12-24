import * as assert from 'assert';
import * as vscode from 'vscode';
import { reverseHandler } from '../../handler/reverseHandler';
import { createTextEditor, waitForNewDocument } from './testUtils';

suite('Reverse Handler Test Suite', () => {
  test('Reverse Selections (New Doc)', async () => {
    const editor = await createTextEditor('1\n2\n3');
    editor.selections = [
      new vscode.Selection(0, 0, 0, 1),
      new vscode.Selection(1, 0, 1, 1),
      new vscode.Selection(2, 0, 2, 1)
    ];

    const waitPromise = waitForNewDocument();
    reverseHandler(false)(editor); // isClipboard = false
    const doc = await waitPromise;

    assert.strictEqual(doc.getText().trim(), '3\n2\n1');
  });
});
