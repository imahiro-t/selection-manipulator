import * as assert from 'assert';
import * as vscode from 'vscode';
import { shuffleHandler } from '../../handler/shuffleHandler';
import { createTextEditor, waitForNewDocument } from './testUtils';

suite('Shuffle Handler Test Suite', () => {
  test('Shuffle Selections (New Doc)', async () => {
    const content = '1\n2\n3\n4\n5';
    const editor = await createTextEditor(content);
    editor.selections = [
      new vscode.Selection(0, 0, 0, 1),
      new vscode.Selection(1, 0, 1, 1),
      new vscode.Selection(2, 0, 2, 1),
      new vscode.Selection(3, 0, 3, 1),
      new vscode.Selection(4, 0, 4, 1)
    ];

    const waitPromise = waitForNewDocument();
    shuffleHandler(false)(editor);
    const doc = await waitPromise;

    const originalSet = new Set(content.split('\n'));
    const shuffledSet = new Set(doc.getText().trim().split('\n'));

    assert.strictEqual(originalSet.size, shuffledSet.size);
    for (let item of originalSet) {
      assert.ok(shuffledSet.has(item));
    }
  });
});
