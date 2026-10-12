import * as assert from 'assert';
import { createHmac } from 'node:crypto';
import * as vscode from 'vscode';
import { hmacHandler, HmacDependencies } from '../../handler/hmacHandler';
import { createTextEditor } from './testUtils';

suite('HMAC Handler Test Suite', () => {
  /** The input box answers `answer`; the opened results are recorded instead of shown. */
  const fakes = (answer: string | undefined) => {
    const opened: string[][][] = [];
    const boxes: vscode.InputBoxOptions[] = [];
    const dependencies: HmacDependencies = {
      showInputBox: (options) => {
        boxes.push(options);
        return Promise.resolve(answer);
      },
      openResultWithTitles: (pairs) => {
        opened.push(pairs);
        return Promise.resolve();
      },
    };
    return { dependencies, opened, boxes };
  };

  const expected = (algorithm: string, secret: string, text: string): string =>
    createHmac(algorithm, secret).update(text).digest('hex');

  test('HMAC SHA256', async () => {
    const editor = await createTextEditor('hello');
    editor.selection = new vscode.Selection(0, 0, 0, 5);
    const { dependencies, opened, boxes } = fakes('secret');
    await hmacHandler('sha256', dependencies)(editor);
    assert.strictEqual(boxes.length, 1);
    assert.strictEqual(boxes[0].password, true, 'the secret is typed in a password box');
    assert.deepStrictEqual(opened, [[['hello', expected('sha256', 'secret', 'hello')]]]);
    assert.ok(/^[0-9a-f]{64}$/.test(opened[0][0][1]));
  });

  test('HMAC SHA512 / MD5 of every selection', async () => {
    const editor = await createTextEditor('ab cd');
    editor.selections = [new vscode.Selection(0, 0, 0, 2), new vscode.Selection(0, 3, 0, 5)];
    for (const algorithm of ['sha512', 'md5'] as const) {
      const { dependencies, opened } = fakes('k');
      await hmacHandler(algorithm, dependencies)(editor);
      assert.deepStrictEqual(opened, [[['ab', expected(algorithm, 'k', 'ab')], ['cd', expected(algorithm, 'k', 'cd')]]], algorithm);
    }
  });

  test('cancelling the secret box changes nothing (SELEC-00082)', async () => {
    for (const algorithm of ['sha256', 'sha512', 'md5'] as const) {
      const editor = await createTextEditor('hello');
      editor.selection = new vscode.Selection(0, 0, 0, 5);
      const { dependencies, opened, boxes } = fakes(undefined);
      await hmacHandler(algorithm, dependencies)(editor);
      assert.strictEqual(boxes.length, 1, algorithm);
      assert.deepStrictEqual(opened, [], `${algorithm}: no result is opened`);
      assert.strictEqual(editor.document.getText(), 'hello', `${algorithm}: the text is unchanged`);
    }
  });

  test('an empty secret (Enter alone) is used as it is (SELEC-00082)', async () => {
    const editor = await createTextEditor('hello');
    editor.selection = new vscode.Selection(0, 0, 0, 5);
    const { dependencies, opened } = fakes('');
    await hmacHandler('sha256', dependencies)(editor);
    assert.deepStrictEqual(opened, [[['hello', expected('sha256', '', 'hello')]]]);
  });
});
