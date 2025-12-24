import * as assert from 'assert';
import * as vscode from 'vscode';
import { removeCursorHandler } from '../../handler/removeCursorHandler';
import { createTextEditor } from './testUtils';

suite('Remove Cursor Handler Test Suite', () => {
  test('Remove Cursor Above', async () => {
    const editor = await createTextEditor('1\n2\n3');
    editor.selections = [
      new vscode.Selection(0, 0, 0, 0),
      new vscode.Selection(1, 0, 1, 0),
      new vscode.Selection(2, 0, 2, 0)
    ];

    // Remove above -> should remove top one (index 0).
    removeCursorHandler('above')(editor);

    assert.strictEqual(editor.selections.length, 2);
    assert.strictEqual(editor.selections[0].start.line, 1);
    assert.strictEqual(editor.selections[1].start.line, 2);
  });

  test('Remove Cursor Below', async () => {
    const editor = await createTextEditor('1\n2\n3');
    editor.selections = [
      new vscode.Selection(0, 0, 0, 0),
      new vscode.Selection(1, 0, 1, 0),
      new vscode.Selection(2, 0, 2, 0)
    ];

    // Remove below -> should remove bottom one (last index).
    removeCursorHandler('below')(editor);

    assert.strictEqual(editor.selections.length, 2);
    assert.strictEqual(editor.selections[0].start.line, 0);
    assert.strictEqual(editor.selections[1].start.line, 1);
  });
});
