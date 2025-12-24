import * as assert from 'assert';
import * as vscode from 'vscode';
import { aesHandler } from '../../handler/aesHandler';
import { createTextEditor } from './testUtils';

suite('AES Handler Test Suite', () => {
  test('AES Encrypt/Decrypt (Replace)', async () => {
    const editor = await createTextEditor('hello');
    editor.selection = new vscode.Selection(0, 0, 0, 5);

    // Encrypt
    aesHandler('encrypt', true, 'secret')(editor);
    await new Promise(resolve => setTimeout(resolve, 100));
    const encrypted = editor.document.getText();
    assert.notStrictEqual(encrypted, 'hello');

    // Decrypt
    editor.selection = new vscode.Selection(0, 0, 0, encrypted.length);
    aesHandler('decrypt', true, 'secret')(editor);
    await new Promise(resolve => setTimeout(resolve, 100));
    const decrypted = editor.document.getText();

    assert.strictEqual(decrypted, 'hello');
  });
});
