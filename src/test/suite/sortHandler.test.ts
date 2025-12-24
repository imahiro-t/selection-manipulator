import * as assert from 'assert';
import * as vscode from 'vscode';
import { sortHandler } from '../../handler/sortHandler';
import { createTextEditor, waitForNewDocument } from './testUtils';

suite('Sort Handler Test Suite', () => {
  test('Sort Number Ascending (New Doc)', async () => {
    const editor = await createTextEditor('10\n2\n1');
    editor.selections = [
      new vscode.Selection(0, 0, 0, 2),
      new vscode.Selection(1, 0, 1, 1),
      new vscode.Selection(2, 0, 2, 1)
    ];

    const waitPromise = waitForNewDocument();
    sortHandler('number', true, false)(editor); // isClipboard = false
    const doc = await waitPromise;

    assert.strictEqual(doc.getText().trim(), '1\n2\n10');
  });

  test('Sort String Descending (New Doc)', async () => {
    const editor = await createTextEditor('a\nc\nb');
    editor.selections = [
      new vscode.Selection(0, 0, 0, 1),
      new vscode.Selection(1, 0, 1, 1),
      new vscode.Selection(2, 0, 2, 1)
    ];

    const waitPromise = waitForNewDocument();
    sortHandler('string', false, false)(editor); // isClipboard = false
    const doc = await waitPromise;

    assert.strictEqual(doc.getText().trim(), 'c\nb\na');
  });
});
