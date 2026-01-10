import * as assert from 'assert';
import * as vscode from 'vscode';
import { multiSelectionHandler } from '../../handler/multiSelectionHandler';
import { createTextEditor } from './testUtils';

suite('Multi Selection Handler Test Suite', () => {
  test('Convert to Multi Selection', async () => {
    const editor = await createTextEditor('line1\nline2\nline3');
    editor.selection = new vscode.Selection(0, 0, 2, 5); // Select all 3 lines

    await multiSelectionHandler('all')(editor);

    assert.strictEqual(editor.selections.length, 3);
    assert.strictEqual(editor.selections[0].start.line, 0);
    assert.strictEqual(editor.selections[1].start.line, 1);
    assert.strictEqual(editor.selections[2].start.line, 2);
  });
});
