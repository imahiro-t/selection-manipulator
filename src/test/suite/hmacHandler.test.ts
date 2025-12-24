import * as assert from 'assert';
import * as vscode from 'vscode';
import { hmacHandler } from '../../handler/hmacHandler';
import { createTextEditor, waitForNewDocument } from './testUtils';

suite('HMAC Handler Test Suite', () => {
  test('HMAC SHA256', async () => {
    const editor = await createTextEditor('hello');
    editor.selection = new vscode.Selection(0, 0, 0, 5);

    const waitPromise = waitForNewDocument();
    hmacHandler('sha256', 'secret')(editor);
    const doc = await waitPromise;

    const text = doc.getText();
    // Check for 64-char hex string (sha256 result)
    assert.ok(/[0-9a-f]{64}/.test(text), `Expected hex hash, got: ${text}`);
  });
});
