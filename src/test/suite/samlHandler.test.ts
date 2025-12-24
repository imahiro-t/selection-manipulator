import * as assert from 'assert';
import * as vscode from 'vscode';
import { samlHandler } from '../../handler/samlHandler';
import { createTextEditor, waitForNewDocument } from './testUtils';

suite('SAML Handler Test Suite', () => {
  test('Decode SAML (Base64)', async () => {
    const xml = '<root>hello</root>';
    const encoded = Buffer.from(xml).toString('base64');
    const editor = await createTextEditor(encoded);
    editor.selection = new vscode.Selection(0, 0, 0, encoded.length);

    const waitPromise = waitForNewDocument();
    samlHandler(editor);
    const doc = await waitPromise;

    const text = doc.getText();
    assert.ok(text.includes('<root>hello</root>'));
  });
});
