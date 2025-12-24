import * as assert from 'assert';
import * as vscode from 'vscode';
import { uniqueHandler } from '../../handler/uniqueHandler';
import { createTextEditor, waitForNewDocument } from './testUtils';

suite('Unique Handler Test Suite', () => {
  test('Unique Selections (New Doc)', async () => {
    const editor = await createTextEditor('apple\nbanana\napple');
    editor.selections = [
      new vscode.Selection(0, 0, 0, 5),
      new vscode.Selection(1, 0, 1, 6),
      new vscode.Selection(2, 0, 2, 5)
    ];

    const waitPromise = waitForNewDocument();
    uniqueHandler(false)(editor); // isClipboard = false
    const doc = await waitPromise;

    const lines = doc.getText().trim().split('\n');
    assert.strictEqual(lines.length, 2);
    assert.ok(lines.includes('apple'));
    assert.ok(lines.includes('banana'));
  });
});
