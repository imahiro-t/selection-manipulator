import * as assert from 'assert';
import * as vscode from 'vscode';
import { extractLineHandler } from '../../handler/extractLineHandler';
import { createTextEditor, waitForNewDocument } from './testUtils';

suite('Extract Line Handler Test Suite', () => {
  test('Extract Lines to New Document', async () => {
    const editor = await createTextEditor('apple\nbanana\ncherry');
    editor.selections = [
      new vscode.Selection(0, 0, 0, 1), // Part of apple
      new vscode.Selection(2, 0, 2, 1)  // Part of cherry
    ];

    const waitPromise = waitForNewDocument();
    extractLineHandler(false)(editor);
    const doc = await waitPromise;

    assert.strictEqual(doc.getText(), 'apple\ncherry');
  });
});
