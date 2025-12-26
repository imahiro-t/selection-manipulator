import * as assert from 'assert';
import * as vscode from 'vscode';
import { createTextEditor, selectAll, waitForNewDocument } from './testUtils';
import { asciiArtHandler } from '../../handler/asciiArtHandler';

suite('ASCII Art Handler Test Suite', () => {

  test('Cowsay Single Line', async () => {
    const editor = await createTextEditor('Hello World');
    await selectAll(editor);
    const newDocPromise = waitForNewDocument();
    await asciiArtHandler('cowsay', false)(editor);

    const activeEditor = await newDocPromise;
    assert.ok(activeEditor);
    const text = activeEditor.getText();

    // Check for bubble structure
    assert.ok(text.includes('< Hello World >'), 'Text should be wrapped in single line bubble');
    assert.ok(text.includes('^__^'), 'Should contain cow face');

    await vscode.commands.executeCommand('workbench.action.closeActiveEditor');
  });

  test('Cowsay Multi Line Replace', async () => {
    const input = 'Line 1\nLine 2';
    const editor = await createTextEditor(input);
    await selectAll(editor);
    await asciiArtHandler('cowsay', true)(editor);

    const text = editor.document.getText();
    // Check for multi-line bubble structure
    assert.ok(text.includes('/ Line 1 \\'), 'First line should have top borders');
    assert.ok(text.includes('\\ Line 2 /'), 'Last line should have bottom borders');
    assert.ok(text.includes('(oo)'), 'Should contain cow eyes');
  });
});
