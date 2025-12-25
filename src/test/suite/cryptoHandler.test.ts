
import * as assert from 'assert';
import * as vscode from 'vscode';
import { createTextEditor, selectAll, waitForNewDocument } from './testUtils';
import { cryptoHandler } from '../../handler/cryptoHandler';

suite('Crypto Handler Test Suite', () => {

  test('SHA1 Hash', async () => {
    const editor = await createTextEditor('test string');
    await selectAll(editor);
    const newDocPromise = waitForNewDocument();
    await cryptoHandler('sha1', false)(editor);

    const activeEditor = await newDocPromise;
    assert.ok(activeEditor);
    // SHA1 of "test string" is "661295c9cbf9d6b2f6428414504a8deed3020641"
    assert.strictEqual(activeEditor.getText().includes('661295c9cbf9d6b2f6428414504a8deed3020641'), true);

    // Cleanup: Close the new document
    await vscode.commands.executeCommand('workbench.action.closeActiveEditor');
  });

  test('SHA1 Hash Replace', async () => {
    const editor = await createTextEditor('test string');
    await selectAll(editor);
    await cryptoHandler('sha1', true)(editor);

    assert.strictEqual(editor.document.getText(), '661295c9cbf9d6b2f6428414504a8deed3020641');
  });

  test('MD5 Hash Replace', async () => {
    const editor = await createTextEditor('test string');
    await selectAll(editor);
    await cryptoHandler('md5', true)(editor);

    // MD5 of "test string" is "6f8db599de986fab7a21625b7916589c"
    assert.strictEqual(editor.document.getText(), '6f8db599de986fab7a21625b7916589c');
  });

  test('SHA256 Hash Replace', async () => {
    const editor = await createTextEditor('test string');
    await selectAll(editor);
    await cryptoHandler('sha256', true)(editor);

    // SHA256 of "test string"
    assert.strictEqual(editor.document.getText(), 'd5579c46dfcc7f18207013e65b44e4cb4e2c2298f4ac457ba8f82743f31e930b');
  });
});
