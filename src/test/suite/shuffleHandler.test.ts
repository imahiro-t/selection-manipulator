import * as assert from 'assert';
import * as vscode from 'vscode';
import { shuffleHandler, shuffleCharacterHandler } from '../../handler/shuffleHandler';
import { createTextEditor, waitForNewDocument } from './testUtils';

suite('Shuffle Handler Test Suite', () => {
  test('Shuffle Selections (New Doc)', async () => {
    const content = '1\n2\n3\n4\n5';
    const editor = await createTextEditor(content);
    editor.selections = [
      new vscode.Selection(0, 0, 0, 1),
      new vscode.Selection(1, 0, 1, 1),
      new vscode.Selection(2, 0, 2, 1),
      new vscode.Selection(3, 0, 3, 1),
      new vscode.Selection(4, 0, 4, 1)
    ];

    const waitPromise = waitForNewDocument();
    shuffleHandler(false)(editor);
    const doc = await waitPromise;

    const originalSet = new Set(content.split('\n'));
    const shuffledSet = new Set(doc.getText().trim().split('\n'));

    assert.strictEqual(originalSet.size, shuffledSet.size);
    for (let item of originalSet) {
      assert.ok(shuffledSet.has(item));
    }
  });



  test('Shuffle Characters (Replace)', async () => {
    const original = 'abcde';
    const editor = await createTextEditor(original);
    editor.selection = new vscode.Selection(0, 0, 0, 5);

    // Call the handler
    await shuffleCharacterHandler('replace')(editor);

    const shuffled = editor.document.getText();
    assert.strictEqual(shuffled.length, original.length);
    assert.notStrictEqual(shuffled, original); // Flaky if it shuffles to same order (1/120 chance). 
    // Maybe checking characters are same set?
    const originalSet = original.split('').sort().join('');
    const shuffledSet = shuffled.split('').sort().join('');
    assert.strictEqual(shuffledSet, originalSet);
  });
});
