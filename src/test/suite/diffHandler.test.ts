
import * as assert from 'assert';
import * as vscode from 'vscode';
import { diffHandler } from '../../handler/diffHandler';
import { createTextEditor, waitForNewDocument } from './testUtils';

suite('Diff Handler Test Suite', () => {
  test('Diff Two Selections (Word Diff)', async () => {
    const content = 'The quick brown fox\nThe slow brown fox';
    const editor = await createTextEditor(content);

    // Select "The quick brown fox" and "The slow brown fox"
    editor.selections = [
      new vscode.Selection(0, 0, 0, 19),
      new vscode.Selection(1, 0, 1, 18)
    ];

    const waitPromise = waitForNewDocument();
    await diffHandler(editor);
    const doc = await waitPromise;

    // setTextDocumentLanguage is async, so we poll for the change
    let attempts = 0;
    while (doc.languageId !== 'markdown' && attempts < 100) {
      await new Promise(resolve => setTimeout(resolve, 50));
      attempts++;
    }

    assert.strictEqual(doc.languageId, 'markdown');
    const text = doc.getText();

    // Expected: "The ~~quick~~**slow** brown fox" (format depends on diff library behavior with spaces)
    // Actually diffWordsWithSpace might handle spaces. 
    // "The " (common), "quick" (removed), "slow" (added), " brown fox" (common)
    // So: "The ~~quick~~**slow** brown fox"

    assert.ok(text.includes('# Differences Found'));
    assert.ok(text.includes('~~quick~~'));
    assert.ok(text.includes('**slow**'));
  });

  test('Diff Two Selections (No Diff)', async () => {
    const content = 'The quick brown fox\nThe quick brown fox';
    const editor = await createTextEditor(content);

    editor.selections = [
      new vscode.Selection(0, 0, 0, 19),
      new vscode.Selection(1, 0, 1, 19)
    ];

    const waitPromise = waitForNewDocument();
    await diffHandler(editor);
    const doc = await waitPromise;

    // setTextDocumentLanguage is async, so we poll for the change
    let attempts = 0;
    while (doc.languageId !== 'markdown' && attempts < 100) {
      await new Promise(resolve => setTimeout(resolve, 50));
      attempts++;
    }

    assert.strictEqual(doc.languageId, 'markdown');
    const text = doc.getText();

    assert.ok(text.includes('# No Differences Found'));
    assert.ok(!text.includes('**'));
    assert.ok(!text.includes('~~'));
  });

  test('Diff With Less Than Two Selections', async () => {
    const content = 'Line 1';
    const editor = await createTextEditor(content);
    editor.selection = new vscode.Selection(0, 0, 0, 6);

    await diffHandler(editor);
    // Should verify no new document opened, or just no crash.
    // In this suite, we assume no crash implies success for this error case.
    assert.ok(true);
  });
});
