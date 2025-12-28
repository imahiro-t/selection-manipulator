import * as assert from 'assert';
import * as vscode from 'vscode';
import { createTextEditor, selectAll, waitForNewDocument } from './testUtils';
import { asciiArtHandler } from '../../handler/asciiArtHandler';

suite('ASCII Art Handler Test Suite', () => {

  test('Cowsay Single Line', async () => {
    const editor = await createTextEditor('Hello World');
    await selectAll(editor);

    let result = '';
    const originalOpen = require('../../common').openTextDocument;
    require('../../common').openTextDocument = async (content: string) => {
      result = content;
    };

    await asciiArtHandler('cowsay', false)(editor);
    require('../../common').openTextDocument = originalOpen;

    assert.ok(result.includes('< Hello World >'), 'Text should be wrapped in single line bubble');
    assert.ok(result.includes('^__^'), 'Should contain cow face');

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

  test('Tux Single Line', async () => {
    const editor = await createTextEditor('Hello Tux');
    await selectAll(editor);

    let result = '';
    const originalOpen = require('../../common').openTextDocument;
    require('../../common').openTextDocument = async (content: string) => {
      result = content;
    };

    await asciiArtHandler('tux', false)(editor);
    require('../../common').openTextDocument = originalOpen;

    assert.ok(result.includes('< Hello Tux >'), 'Text should be wrapped in single line bubble');
    assert.ok(result.includes('o_o'), 'Should contain tux eyes');
    assert.ok(result.includes('.--.'), 'Should contain tux head');
  });

  test('Ghost Multi Line', async () => {
    const editor = await createTextEditor('Boo\nHa');
    await selectAll(editor);

    let result = '';
    const originalOpen = require('../../common').openTextDocument;
    require('../../common').openTextDocument = async (content: string) => {
      result = content;
    };

    await asciiArtHandler('ghost', false)(editor);
    require('../../common').openTextDocument = originalOpen;

    // Ghost definition in handler has 'boxy' word inside (o o)
    // Actually wait, looking at my implementation in Step 90:
    // It has `(o o)` and `.-.` but no 'boxy'.
    // Step 87 had 'boxy' in my THOUGHT process but my CODE in Step 90 removed it or maybe I didn't verify.
    // Let's check Step 90 content.
    // Step 90: Ghost definition:
    // ghost: `
    //     \
    //      \
    //       \
    //           .-.
    //          (o o)
    //          | O \
    //          \   \
    //           `~~~`

    // It does NOT have 'boxy'.
    // So I should assert on `(o o)`.

    assert.ok(result.includes('(o o)'), 'Should contain ghost eyes');
    assert.ok(result.includes('| O \\'), 'Should contain ghost body');
  });
});
