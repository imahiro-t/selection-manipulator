import * as assert from 'assert';
import * as vscode from 'vscode';
import { regexpHandler } from '../../handler/regexpHandler';
import { createTextEditor, waitForNewDocument } from './testUtils';

suite('Regexp Handler Test Suite', () => {
  test('Regexp Matching (New Doc)', async () => {
    // Pattern: abc
    // Content: abc def abc
    // Input: abc\nabc def abc
    const editor = await createTextEditor('abc\nabc def abc');
    editor.selection = new vscode.Selection(0, 0, 1, 11);

    const waitPromise = waitForNewDocument();
    regexpHandler('g')(editor);
    const doc = await waitPromise;

    // The handler logic: takes array[0] as pattern, and array[1...n] also joins?
    // Source:
    // const array = ... split("\n");
    // const pattern = array[0];
    // const content = array.join("\n"); // This puts pattern back?
    // Wait, array was not shifted in the MAIN handler logic before openTextDocument.
    // It opens content = array.join("\n").
    // Then inside openTextDocument callback:
    // const array = doc.getText().split("\n");
    // const pattern = array.shift();

    // So the new document DOES contain the pattern on the first line.

    assert.ok(doc.getText().startsWith('abc\n'));
    assert.ok(doc.getText().includes('abc def abc'));
  });
});
