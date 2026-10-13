import * as assert from 'assert';
import * as vscode from 'vscode';
import { multiSelectionHandler, multiSelectionHandlerInternal } from '../../handler/multiSelectionHandler';
import { DOCUMENT_CHANGED_WHILE_INPUT_MESSAGE } from '../../editGuard';
import { createTextEditor, insertAtTop, warningRecorder } from './testUtils';

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

  test('Convert every n-th line (interval)', async () => {
    const editor = await createTextEditor('line1\nline2\nline3');
    editor.selection = new vscode.Selection(0, 0, 2, 5);

    await multiSelectionHandlerInternal(() => Promise.resolve('2'))('interval')(editor);

    assert.deepStrictEqual(editor.selections.map((selection) => selection.start.line), [0, 2]);
  });

  test('interval: a document edited while the input box is open leaves the selection and tells the user', async () => {
    const editor = await createTextEditor('line1\nline2\nline3');
    editor.selection = new vscode.Selection(0, 0, 2, 5);
    const { warnings, notifier } = warningRecorder();

    await multiSelectionHandlerInternal(async () => {
      await insertAtTop(editor, 'inserted\n');
      return '1';
    }, { notifier })('interval')(editor);

    assert.strictEqual(editor.selections.length, 1);
    assert.strictEqual(editor.document.getText(), 'inserted\nline1\nline2\nline3');
    assert.deepStrictEqual(warnings, [DOCUMENT_CHANGED_WHILE_INPUT_MESSAGE]);
  });
});
