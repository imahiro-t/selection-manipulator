import * as assert from 'assert';
import * as vscode from 'vscode';
import {
  applyEdit,
  DOCUMENT_CHANGED_WHILE_INPUT_MESSAGE,
  EDITOR_GONE_MESSAGE,
  ensureEditorAfterInput,
  ensureUnchangedAfterInput,
  isEditorAvailable,
} from '../../editGuard';
import { createTextEditor, insertAtTop, warningRecorder, withEdit } from './testUtils';

suite('Edit Guard Test Suite', () => {
  suite('applyEdit', () => {
    test('applies the edit and shows nothing when the editor accepts it', async () => {
      const editor = await createTextEditor('abc');
      const { warnings, notifier } = warningRecorder();
      const applied = await applyEdit(editor, (editBuilder) => editBuilder.insert(new vscode.Position(0, 0), 'x'), { notifier });
      assert.strictEqual(applied, true);
      assert.strictEqual(editor.document.getText(), 'xabc');
      assert.deepStrictEqual(warnings, []);
    });

    test('warns once with the default prefix when the editor does not accept the edit', async () => {
      const editor = await createTextEditor('abc');
      const { warnings, notifier } = warningRecorder();
      const applied = await applyEdit(withEdit(editor, () => Promise.resolve(false)), () => undefined, { notifier });
      assert.strictEqual(applied, false);
      assert.deepStrictEqual(warnings, ['The text was not changed: the editor did not accept the edit.']);
    });

    test('uses the given prefix', async () => {
      const editor = await createTextEditor('abc');
      const { warnings, notifier } = warningRecorder();
      await applyEdit(withEdit(editor, () => Promise.resolve(false)), () => undefined, { notifier, prefix: 'The selection was not changed: ' });
      assert.deepStrictEqual(warnings, ['The selection was not changed: the editor did not accept the edit.']);
    });

    test('warns that the editor was closed when the edit is rejected on an editor that is gone', async () => {
      const editor = await createTextEditor('abc');
      const { warnings, notifier } = warningRecorder();
      const gone = withEdit(editor, () => Promise.reject(new Error('TextEditor#edit not possible on closed editors')));
      const applied = await applyEdit(gone, () => undefined, { notifier });
      assert.strictEqual(applied, false);
      assert.deepStrictEqual(warnings, ['The text was not changed: the editor was closed.']);
    });

    test('rethrows a failure of the edit callback on a live editor', async () => {
      const editor = await createTextEditor('abc');
      const { warnings, notifier } = warningRecorder();
      await assert.rejects(applyEdit(editor, () => {
        throw new Error('boom');
      }, { notifier }), /boom/);
      assert.deepStrictEqual(warnings, []);
      assert.strictEqual(editor.document.getText(), 'abc');
    });
  });

  suite('ensureEditorAfterInput / ensureUnchangedAfterInput', () => {
    test('a visible editor is available', async () => {
      const editor = await createTextEditor('abc');
      const { warnings, notifier } = warningRecorder();
      assert.strictEqual(isEditorAvailable(editor), true);
      assert.strictEqual(ensureEditorAfterInput(editor, { notifier }), true);
      assert.strictEqual(ensureUnchangedAfterInput(editor, editor.document.version, { notifier }), true);
      assert.deepStrictEqual(warnings, []);
    });

    test('an editor hidden by another document in its column is not available', async () => {
      const editor = await createTextEditor('abc');
      await createTextEditor('other');
      const { warnings, notifier } = warningRecorder();
      assert.strictEqual(isEditorAvailable(editor), false);
      assert.strictEqual(ensureEditorAfterInput(editor, { notifier }), false);
      assert.strictEqual(ensureUnchangedAfterInput(editor, editor.document.version, { notifier }), false);
      assert.deepStrictEqual(warnings, [EDITOR_GONE_MESSAGE, EDITOR_GONE_MESSAGE]);
    });

    test('the injected availability check replaces the default one', async () => {
      const editor = await createTextEditor('abc');
      const stand = withEdit(editor, () => Promise.resolve(true));
      const { warnings, notifier } = warningRecorder();
      assert.strictEqual(ensureEditorAfterInput(stand, { notifier }), false);
      assert.strictEqual(ensureEditorAfterInput(stand, { notifier, isEditorAvailable: () => true }), true);
      assert.deepStrictEqual(warnings, [EDITOR_GONE_MESSAGE]);
    });

    test('a document changed since the given version is reported', async () => {
      const editor = await createTextEditor('abc');
      const version = editor.document.version;
      await insertAtTop(editor, 'x');
      const { warnings, notifier } = warningRecorder();
      assert.strictEqual(ensureUnchangedAfterInput(editor, version, { notifier }), false);
      assert.deepStrictEqual(warnings, [DOCUMENT_CHANGED_WHILE_INPUT_MESSAGE]);
    });
  });
});
