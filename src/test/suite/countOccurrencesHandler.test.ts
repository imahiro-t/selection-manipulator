import * as assert from 'assert';
import * as vscode from 'vscode';
import { countOccurrencesHandler } from '../../handler/countOccurrencesHandler';
import { createTextEditor, waitForNewDocument } from './testUtils';

suite('Count Occurrences Handler Test Suite', () => {
  test('Count Occurrences (Sort by Word)', async () => {
    const editor = await createTextEditor('apple\nbanana\napple');
    editor.selection = new vscode.Selection(0, 0, 2, 5);

    const waitPromise = waitForNewDocument();
    countOccurrencesHandler('word')(editor);
    const doc = await waitPromise;

    const text = doc.getText();
    assert.strictEqual(text.trim(), 'apple\t2\nbanana\t1');
  });
});
