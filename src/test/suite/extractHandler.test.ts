import * as assert from 'assert';
import * as vscode from 'vscode';
import { extractHandler } from '../../handler/extractHandler';
import { createTextEditor, waitForNewDocument } from './testUtils';

suite('Extract Handler Test Suite', () => {
  test('Extract to New Document', async () => {
    const editor = await createTextEditor('a\nb\nc');
    editor.selections = [
      new vscode.Selection(0, 0, 0, 1),
      new vscode.Selection(2, 0, 2, 1)
    ]; // Select 'a' and 'c'

    const waitPromise = waitForNewDocument();
    extractHandler(false, false)(editor);
    const doc = await waitPromise;

    assert.strictEqual(doc.getText(), 'a\nc');
  });
});
