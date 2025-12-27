import * as assert from 'assert';
import * as vscode from 'vscode';
import { calculationHandler } from '../../handler/calculationHandler';
import { createTextEditor, selectAll } from './testUtils';

suite('Calculation Handler Test Suite', () => {
  test('Calculate Expression', async () => {
    const editor = await createTextEditor('1+1');
    await selectAll(editor);

    let result: string[][] = [];
    const originalOpen = require('../../common').openTextDocumentWithTitles;
    require('../../common').openTextDocumentWithTitles = async (zip: string[][]) => {
      result = zip;
    };

    await calculationHandler(editor);
    require('../../common').openTextDocumentWithTitles = originalOpen;

    // result should be [['1+1', '2']]
    assert.strictEqual(result.length, 1);
    assert.strictEqual(result[0][0], '1+1');
    assert.strictEqual(result[0][1], '2');
  });
});
