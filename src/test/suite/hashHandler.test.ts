import * as assert from 'assert';
import * as vscode from 'vscode';
import { hashHandler } from '../../handler/hashHandler';
import { createTextEditor, waitForNewDocument } from './testUtils';

suite('Hash Handler Test Suite', () => {
  test('SHA256 Hash', async () => {
    const editor = await createTextEditor('hello');
    editor.selection = new vscode.Selection(0, 0, 0, 5);

    const waitPromise = waitForNewDocument();
    hashHandler('sha256')(editor);
    const doc = await waitPromise;

    const text = doc.getText();
    assert.ok(text.includes('2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824'));
  });
});
