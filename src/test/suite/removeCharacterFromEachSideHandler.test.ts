import * as assert from 'assert';
import * as vscode from 'vscode';
import { removeCharacterFromEachSideHandler } from '../../handler/removeCharacterFromEachSideHandler';
import { createTextEditor } from './testUtils';

suite('Remove Character From Each Side Handler Test Suite', () => {
  test('Remove characters surrounding selection', async () => {
    const editor = await createTextEditor('"hello"');
    // Select 'hello', not quotes. 
    // Logic expands selection subtracts content?
    // Wait, logic in handler:
    // Reads selection text "hello". 
    // Expands selection start-1, end+1 (to include quotes).
    // Replaces expanded selection ("hello") with original text ("hello").
    // Result: "hello" replaces "hello", removing surrounding chars? 
    // No. 
    // 1. Get text of selection: T.
    // 2. Expand selection to S'.
    // 3. Replace S' with T.
    // Effectively removes the characters that were *just outside* the original selection.

    editor.selection = new vscode.Selection(0, 1, 0, 6); // hello
    removeCharacterFromEachSideHandler(editor);
    await new Promise(resolve => setTimeout(resolve, 100));
    assert.strictEqual(editor.document.getText(), 'hello');
  });
});
