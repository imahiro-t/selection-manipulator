import * as assert from 'assert';
import * as vscode from 'vscode';
import { selectMatchesHandlerInternal } from '../../handler/selectMatchesHandler';
import { createTextEditor } from './testUtils';

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
});
