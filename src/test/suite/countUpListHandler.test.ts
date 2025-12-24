import * as assert from 'assert';
import * as vscode from 'vscode';
import { countUpListHandler } from '../../handler/countUpListHandler';
import { createTextEditor, waitForNewDocument } from './testUtils';

suite('Count Up List Handler Test Suite', () => {
  test('Count from 1 to 5', async () => {
    const editor = await createTextEditor('1-5');
    editor.selection = new vscode.Selection(0, 0, 0, 3);

    const waitPromise = waitForNewDocument();
    countUpListHandler(editor);
    const doc = await waitPromise;

    const text = doc.getText();
    assert.strictEqual(text.trim(), '1\n2\n3\n4\n5');
  });
});
