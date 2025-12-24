import * as assert from 'assert';
import * as vscode from 'vscode';
import { jwtHandler } from '../../handler/jwtHandler';
import { createTextEditor, waitForNewDocument } from './testUtils';

suite('JWT Handler Test Suite', () => {
  test('Decode JWT', async () => {
    const jwt = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkpvaG4gRG9lIiwiaWF0IjoxNTE2MjM5MDIyfQ.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c';
    const editor = await createTextEditor(jwt);
    editor.selection = new vscode.Selection(0, 0, 0, jwt.length);

    const waitPromise = waitForNewDocument();
    jwtHandler(editor);
    const doc = await waitPromise;

    const text = doc.getText();
    assert.ok(text.includes('"alg": "HS256"'));
    assert.ok(text.includes('"name": "John Doe"'));
  });
});
