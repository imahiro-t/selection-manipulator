import * as assert from 'assert';
import * as vscode from 'vscode';
import { mathHandler } from '../../handler/mathHandler';
import { createTextEditor, isResultDocument, waitForNewDocument } from './testUtils';

suite('Math Handler Test Suite', () => {
  /**
   * Runs the handler on '1\n2\n3' and returns its result document. The wait only takes the result
   * document of this command (its title on the first line), so a document opened by something else
   * at the same time (another result, an output channel) is not taken for it.
   */
  const runMath = async (command: 'sum' | 'average' | 'min' | 'max', title: string): Promise<string> => {
    const editor = await createTextEditor('1\n2\n3');
    editor.selection = new vscode.Selection(0, 0, 2, 1);

    const waitPromise = waitForNewDocument(doc => isResultDocument(doc) && doc.getText().startsWith(`${title}\n`));
    mathHandler(command)(editor);
    const doc = await waitPromise;
    return doc.getText();
  };

  test('Sum', async () => {
    assert.strictEqual(await runMath('sum', 'Sum'), 'Sum\n6');
  });

  test('Average', async () => {
    assert.strictEqual(await runMath('average', 'Average'), 'Average\n2');
  });

  test('Min', async () => {
    assert.strictEqual(await runMath('min', 'Min'), 'Min\n1');
  });

  test('Max', async () => {
    assert.strictEqual(await runMath('max', 'Max'), 'Max\n3');
  });
});
