import * as assert from 'assert';
import * as vscode from 'vscode';
import { urlHandler } from '../../handler/urlHandler';
import { createTextEditor, waitForNewDocument } from './testUtils';

suite('URL Handler Test Suite', () => {
  test('Encode URI', async () => {
    const editor = await createTextEditor('https://example.com/foo bar');
    editor.selection = new vscode.Selection(0, 0, 0, 27);

    const waitPromise = waitForNewDocument();
    urlHandler('ENCODE_URI')(editor);
    const doc = await waitPromise;

    const text = doc.getText();
    assert.ok(text.includes('https://example.com/foo%20bar'));
  });
});
