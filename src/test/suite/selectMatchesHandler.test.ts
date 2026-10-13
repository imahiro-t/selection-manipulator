import * as assert from 'assert';
import * as vscode from 'vscode';
import { selectMatchesHandlerInternal } from '../../handler/selectMatchesHandler';
import { DOCUMENT_CHANGED_WHILE_INPUT_MESSAGE, EDITOR_GONE_MESSAGE } from '../../editGuard';
import { createTextEditor, insertAtTop, warningRecorder } from './testUtils';

suite('Select Matches Handler Test Suite', () => {

  const createMockInputBox = (result: string | undefined) => {
    return (options: vscode.InputBoxOptions): Thenable<string | undefined> => {
      return Promise.resolve(result);
    };
  };

  test('Select matches within single selection', async () => {
    const editor = await createTextEditor('foo bar foo bar');
    // Select entire document
    editor.selections = [new vscode.Selection(0, 0, 0, 15)];

    const handler = selectMatchesHandlerInternal(createMockInputBox('foo'));
    await handler(editor);

    assert.strictEqual(editor.selections.length, 2);
    assert.strictEqual(editor.document.getText(editor.selections[0]), 'foo');
    assert.strictEqual(editor.selections[0].start.character, 0);
    assert.strictEqual(editor.document.getText(editor.selections[1]), 'foo');
    assert.strictEqual(editor.selections[1].start.character, 8);
  });

  test('Select matches within multiple selections', async () => {
    const editor = await createTextEditor('foo bar\nfoo bar');
    // Select first line and second line separately
    editor.selections = [
      new vscode.Selection(0, 0, 0, 7),
      new vscode.Selection(1, 0, 1, 7)
    ];

    const handler = selectMatchesHandlerInternal(createMockInputBox('foo'));
    await handler(editor);

    assert.strictEqual(editor.selections.length, 2);
    assert.strictEqual(editor.document.getText(editor.selections[0]), 'foo');
    assert.strictEqual(editor.selections[0].start.line, 0);
    assert.strictEqual(editor.document.getText(editor.selections[1]), 'foo');
    assert.strictEqual(editor.selections[1].start.line, 1);
  });

  test('Do nothing if no search string provided', async () => {
    const editor = await createTextEditor('foo bar');
    editor.selections = [new vscode.Selection(0, 0, 0, 7)];
    const initialSelections = editor.selections;

    const handler = selectMatchesHandlerInternal(createMockInputBox(undefined));
    await handler(editor);

    assert.deepStrictEqual(editor.selections, initialSelections);
  });

  test('Do nothing if no matches found', async () => {
    const editor = await createTextEditor('foo bar');
    const initialSelections = [new vscode.Selection(0, 0, 0, 7)];
    editor.selections = initialSelections;

    const handler = selectMatchesHandlerInternal(createMockInputBox('baz'));
    await handler(editor);

    assert.deepStrictEqual(editor.selections, initialSelections);
  });

  test('Case sensitivity (assuming literal match)', async () => {
    const editor = await createTextEditor('Foo foo');
    editor.selections = [new vscode.Selection(0, 0, 0, 7)];

    const handler = selectMatchesHandlerInternal(createMockInputBox('Foo'));
    await handler(editor);

    assert.strictEqual(editor.selections.length, 1);
    assert.strictEqual(editor.document.getText(editor.selections[0]), 'Foo');
  });

  test('a document edited while the input box is open: the selections stay and the user is told', async () => {
    const editor = await createTextEditor('x\nfoo bar foo');
    editor.selection = new vscode.Selection(1, 0, 1, 11);
    const { warnings, notifier } = warningRecorder();
    await selectMatchesHandlerInternal(async () => {
      await insertAtTop(editor, 'inserted\n');
      return 'foo';
    }, { notifier })(editor);
    assert.strictEqual(editor.document.getText(), 'inserted\nx\nfoo bar foo');
    assert.strictEqual(editor.selections.length, 1);
    assert.strictEqual(editor.document.getText(editor.selection), 'foo bar foo');
    assert.deepStrictEqual(warnings, [DOCUMENT_CHANGED_WHILE_INPUT_MESSAGE]);
  });

  test('an editor switched away while the input box is open: the selections stay and the user is told', async () => {
    const editor = await createTextEditor('foo bar foo');
    editor.selection = new vscode.Selection(0, 0, 0, 11);
    const { warnings, notifier } = warningRecorder();
    await selectMatchesHandlerInternal(async () => {
      await createTextEditor('other');
      return 'foo';
    }, { notifier })(editor);
    assert.strictEqual(editor.selections.length, 1);
    assert.strictEqual(editor.document.getText(editor.selection), 'foo bar foo');
    assert.deepStrictEqual(warnings, [EDITOR_GONE_MESSAGE]);
  });

  test('the selections are read after the input box closes', async () => {
    const editor = await createTextEditor('foo bar\nfoo foo');
    editor.selection = new vscode.Selection(0, 0, 0, 7);
    await selectMatchesHandlerInternal(async () => {
      editor.selection = new vscode.Selection(1, 0, 1, 7);
      return 'foo';
    })(editor);
    assert.strictEqual(editor.selections.length, 2);
    assert.ok(editor.selections.every((selection) => selection.start.line === 1));
  });
});
