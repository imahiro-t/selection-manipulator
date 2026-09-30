import * as assert from 'assert';
import * as vscode from 'vscode';
import { shuffleHandler, shuffleCharacterHandler } from '../../handler/shuffleHandler';
import { createTextEditor, isResultDocument, waitForNewDocument } from './testUtils';

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

    // Only the result of this shuffle: a result document with the same lines in some order.
    const sameLines = (text: string) => text.trim().split('\n').sort().join('\n') === content;
    const waitPromise = waitForNewDocument(doc => isResultDocument(doc) && sameLines(doc.getText()));
    shuffleHandler(false)(editor);
    const doc = await waitPromise;

    const originalSet = new Set(content.split('\n'));
    const shuffledSet = new Set(doc.getText().trim().split('\n'));

    assert.strictEqual(originalSet.size, shuffledSet.size);
    for (let item of originalSet) {
      assert.ok(shuffledSet.has(item));
    }
  });



  test('Shuffle Characters (Replace)', async function () {
    this.timeout(20000);
    const original: string = 'abcde';
    const sortedOriginal = original.split('').sort().join('');
    // One shuffle gives back the original order with probability 1/120, so a single "differs from
    // the original" check is flaky. Every try must keep the same characters (the same multiset);
    // across up to 20 tries at least one result must differ from the original (all 20 being the
    // identity has probability (1/120)^20), which still catches a shuffle that does nothing.
    const results: string[] = [];
    for (let i = 0; i < 20 && results.every(result => result === original); i++) {
      const editor = await createTextEditor(original);
      editor.selection = new vscode.Selection(0, 0, 0, 5);

      assert.strictEqual(await shuffleCharacterHandler('replace')(editor), true, 'the edit is applied');

      const shuffled = editor.document.getText();
      assert.strictEqual(shuffled.length, original.length);
      assert.strictEqual(shuffled.split('').sort().join(''), sortedOriginal, `${JSON.stringify(shuffled)} has the characters of ${JSON.stringify(original)}`);
      results.push(shuffled);
    }
    assert.ok(results.some(result => result !== original), `some shuffle differs from the original: ${JSON.stringify(results)}`);
  });
});
