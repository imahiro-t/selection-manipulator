import * as assert from 'assert';
import * as vscode from 'vscode';
import { calculationHandler } from '../../handler/calculationHandler';
import { createTextEditor, waitForNewDocument } from './testUtils';

suite('Calculation Handler Test Suite', () => {
  test('Calculate Expression', async () => {
    const editor = await createTextEditor('1+1');
    editor.selection = new vscode.Selection(0, 0, 0, 3);

    const waitPromise = waitForNewDocument();
    calculationHandler(editor);
    const doc = await waitPromise;

    const text = doc.getText();
    assert.ok(text.includes('1+1'));
    assert.ok(text.includes('2'));
  });
});
