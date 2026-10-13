import * as assert from 'assert';
import * as vscode from 'vscode';
import { processSplitJoin, splitJoinHandlerInternal } from '../../handler/splitJoinHandler';
import { DOCUMENT_CHANGED_WHILE_INPUT_MESSAGE, EDITOR_GONE_MESSAGE } from '../../editGuard';
import { createTextEditor, insertAtTop, warningRecorder, withEdit } from './testUtils';

suite('Split/Join Logic Test Suite', () => {
  test('Split custom', () => {
    const text = 'a,b,c';
    const result = processSplitJoin(text, ',', 'split');
    assert.strictEqual(result, 'a\nb\nc');
  });

  test('Join custom', () => {
    const text = 'a\nb\nc';
    const result = processSplitJoin(text, '-', 'join');
    assert.strictEqual(result, 'a-b-c');
  });

  test('Join custom with multiple newlines', () => {
    const text = 'a\r\nb\nc';
    const result = processSplitJoin(text, '|', 'join');
    assert.strictEqual(result, 'a|b|c');
  });
});

suite('Split/Join Handler Test Suite', () => {
  /** `x` on the first line, `a,b` (selected) on the second. */
  const setUp = async () => {
    const editor = await createTextEditor('x\na,b');
    editor.selection = new vscode.Selection(1, 0, 1, 3);
    return editor;
  };

  test('splits the selection by the delimiter', async () => {
    const editor = await setUp();
    await splitJoinHandlerInternal(() => Promise.resolve(','))('split')(editor);
    assert.strictEqual(editor.document.getText(), 'x\na\nb');
  });

  test('the selections are read after the input box closes', async () => {
    const editor = await setUp();
    await splitJoinHandlerInternal(async () => {
      editor.selection = new vscode.Selection(0, 0, 0, 1);
      return ',';
    })('split')(editor);
    assert.strictEqual(editor.document.getText(), 'x\na,b');
    await splitJoinHandlerInternal(async () => {
      editor.selection = new vscode.Selection(1, 0, 1, 3);
      return ',';
    })('split')(editor);
    assert.strictEqual(editor.document.getText(), 'x\na\nb');
  });

  test('a document edited while the input box is open is not changed and the user is told', async () => {
    const editor = await setUp();
    const { warnings, notifier } = warningRecorder();
    await splitJoinHandlerInternal(async () => {
      await insertAtTop(editor, 'inserted\n');
      return ',';
    }, { notifier })('split')(editor);
    assert.strictEqual(editor.document.getText(), 'inserted\nx\na,b');
    assert.deepStrictEqual(warnings, [DOCUMENT_CHANGED_WHILE_INPUT_MESSAGE]);
  });

  test('an editor switched away while the input box is open is not changed and the user is told', async () => {
    const editor = await setUp();
    const { warnings, notifier } = warningRecorder();
    await splitJoinHandlerInternal(async () => {
      await createTextEditor('other');
      return ',';
    }, { notifier })('join')(editor);
    assert.strictEqual(editor.document.getText(), 'x\na,b');
    assert.deepStrictEqual(warnings, [EDITOR_GONE_MESSAGE]);
  });

  test('an edit the editor does not accept is reported (replace)', async () => {
    const editor = await setUp();
    const { warnings, notifier } = warningRecorder();
    const stand = withEdit(editor, () => Promise.resolve(false));
    await splitJoinHandlerInternal(() => Promise.resolve(','), { notifier, isEditorAvailable: () => true })('split', 'replace')(stand);
    assert.strictEqual(editor.document.getText(), 'x\na,b');
    assert.deepStrictEqual(warnings, ['The text was not changed: the editor did not accept the edit.']);
  });
});
