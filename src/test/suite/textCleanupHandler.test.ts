import * as assert from 'assert';
import * as vscode from 'vscode';
import { textCleanupHandler } from '../../handler/textCleanupHandler';
import { createTextEditor, getDocumentText, selectAll } from './testUtils';

suite('Text Cleanup Handler Test Suite', () => {
  test('Remove Empty Lines', async () => {
    const editor = await createTextEditor('line1\n\n  \nline2');
    editor.selection = new vscode.Selection(0, 0, 3, 5); // Select all

    const handler = textCleanupHandler('remove-empty-lines');
    handler(editor);

    await new Promise(resolve => setTimeout(resolve, 100));

    const text = editor.document.getText();
    assert.strictEqual(text, 'line1\nline2');
  });

  test('Remove Line Numbers', async () => {
    const editor = await createTextEditor('1. line1\n 2) line2\n[3] line3');
    editor.selection = new vscode.Selection(0, 0, 2, 9);

    const handler = textCleanupHandler('remove-line-numbers');
    handler(editor);

    await new Promise(resolve => setTimeout(resolve, 100));

    const text = editor.document.getText();
    assert.strictEqual(text, 'line1\nline2\nline3');
  });

  test('Unsmart Quotes', async () => {
    const editor = await createTextEditor('“Hello” ‘World’');
    await selectAll(editor);
    await textCleanupHandler('unsmart-quotes')(editor);
    assert.strictEqual(editor.document.getText(), '"Hello" \'World\'');
  });

  test('Trim Trailing Whitespace', async () => {
    const editor = await createTextEditor('a   \nb\t\n c ');
    await selectAll(editor);
    await textCleanupHandler('trim-lines-trailing')(editor);
    assert.strictEqual(editor.document.getText(), 'a\nb\n c');
  });

  test('Remove Duplicate Lines', async () => {
    const editor = await createTextEditor('a\nb\na\nc\nb');
    await selectAll(editor);
    await textCleanupHandler('remove-duplicate-lines')(editor);
    assert.strictEqual(editor.document.getText(), 'a\nb\nc');
  });

  test('Trim Lines', async () => {
    const editor = await createTextEditor('  line1  \n\tline2');
    editor.selection = new vscode.Selection(0, 0, 1, 6);

    const handler = textCleanupHandler('trim-lines');
    handler(editor);

    await new Promise(resolve => setTimeout(resolve, 100));

    const text = editor.document.getText();
    assert.strictEqual(text, 'line1\nline2');
  });

  test('Join Lines (Space)', async () => {
    const editor = await createTextEditor('line1\nline2');
    editor.selection = new vscode.Selection(0, 0, 1, 5);

    const handler = textCleanupHandler('join-lines-space');
    handler(editor);

    await new Promise(resolve => setTimeout(resolve, 100));

    const text = editor.document.getText();
    assert.strictEqual(text, 'line1 line2');
  });

  test('Join Lines (Comma)', async () => {
    const editor = await createTextEditor('line1\nline2');
    editor.selection = new vscode.Selection(0, 0, 1, 5);

    const handler = textCleanupHandler('join-lines-comma');
    handler(editor);

    await new Promise(resolve => setTimeout(resolve, 100));

    const text = editor.document.getText();
    assert.strictEqual(text, 'line1,line2');
  });

  test('Split Lines (Space)', async () => {
    const editor = await createTextEditor('line1 line2');
    editor.selection = new vscode.Selection(0, 0, 0, 11);

    const handler = textCleanupHandler('split-lines-space');
    handler(editor);

    await new Promise(resolve => setTimeout(resolve, 100));

    const text = editor.document.getText();
    assert.strictEqual(text, 'line1\nline2');
  });

  test('Split Lines (Comma)', async () => {
    const editor = await createTextEditor('line1,line2');
    editor.selection = new vscode.Selection(0, 0, 0, 11);

    const handler = textCleanupHandler('split-lines-comma');
    handler(editor);

    await new Promise(resolve => setTimeout(resolve, 100));

    const text = editor.document.getText();
    assert.strictEqual(text, 'line1\nline2');
  });
});
