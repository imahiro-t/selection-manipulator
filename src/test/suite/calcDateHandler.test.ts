import * as assert from 'assert';
import * as vscode from 'vscode';
import { calcDateHandler } from '../../handler/calcDateHandler';
import { createTextEditor, waitForNewDocument } from './testUtils';

suite('Calc Date Handler Test Suite', () => {
  test('Calc Timestamp', async () => {
    const editor = await createTextEditor('1609459200000'); // 2021-01-01
    editor.selection = new vscode.Selection(0, 0, 0, 13);

    const waitPromise = waitForNewDocument();
    calcDateHandler(editor);
    const doc = await waitPromise;

    const text = doc.getText();
    assert.ok(text.includes('2021'));
  });
});
