import * as assert from 'assert';
import * as vscode from 'vscode';
import { countUpListHandler } from '../../handler/countUpListHandler';
import { createTextEditor, selectAll } from './testUtils';

suite('Count Up List Handler Test Suite', () => {
  test('Count from 1 to 5', async () => {
    const editor = await createTextEditor('1 - 5');
    await selectAll(editor);
    let result = '';
    const originalOpen = require('../../common').openTextDocument;
    require('../../common').openTextDocument = async (content: string) => {
      result = content;
    };
    await countUpListHandler(editor);
    require('../../common').openTextDocument = originalOpen;
    assert.strictEqual(result, '1\n2\n3\n4\n5');
  });
});
