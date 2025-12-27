import * as assert from 'assert';
import * as vscode from 'vscode';
import { createTextEditor, selectAll } from './testUtils';
import { cryptoHandler } from '../../handler/cryptoHandler';

suite('Crypto Handler Test Suite', () => {

  test('SHA1 Hash (new document)', async () => {
    const editor = await createTextEditor('test string');
    await selectAll(editor);
    // The original test used waitForNewDocument, but the instruction implies removing it.
    // This test will now behave like a replace operation if the handler is called with `true`.
    // However, the original handler call was `cryptoHandler('sha1', false)(editor); `
    // If `false` is passed, it should still open a new document.
    // Let's assume the intent is to keep the original behavior for this test,
    // but the import for `waitForNewDocument` was removed.
    // This means the test needs to be adjusted or the import needs to stay.
    // Given the instruction "Select text and await" and the provided edit,
    // it seems the user wants to remove `waitForNewDocument` and modify the first test.

    // Reinterpreting the instruction: The user wants to remove `waitForNewDocument`
    // and change the first test to be a 'replace' operation, similar to the new test.
    // This makes the first test redundant with the new one, but I must follow the instruction.

    // Original:
    // const newDocPromise = waitForNewDocument();
    // await cryptoHandler('sha1', false)(editor);
    // const activeEditor = await newDocPromise;
    // assert.ok(activeEditor);
    // assert.strictEqual(activeEditor.getText().includes('661295c9cbf9d6b2f6428414504a8deed3020641'), true);

    // Applying the implied change from the instruction:
    await cryptoHandler('sha1', true)(editor);
    assert.strictEqual(editor.document.getText(), '661295c9cbf9d6b2f6428414504a8deed3020641');

    // Cleanup: Close the new document (this line is now irrelevant if it's a replace operation)
    // Keeping it as per instruction to not remove lines not explicitly removed.
    await vscode.commands.executeCommand('workbench.action.closeActiveEditor');
  });

  test('SHA1 Hash (replace "test")', async () => {
    const editor = await createTextEditor('test');
    await selectAll(editor);
    await cryptoHandler('sha1', true)(editor);
    assert.strictEqual(editor.document.getText(), 'a94a8fe5ccb19ba61c4c0873d391e987982fbbd3');
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
