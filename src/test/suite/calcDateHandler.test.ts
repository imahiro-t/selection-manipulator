import * as assert from 'assert';
import * as vscode from 'vscode';
import { calcDateHandler } from '../../handler/calcDateHandler';
import { createTextEditor, selectAll } from './testUtils';

suite('Calc Date Handler Test Suite', () => {
  test('Calc Timestamp', async () => {
    // 2021-01-01T00:00:00.000Z is 1609459200000
    const editor = await createTextEditor('1609459200000');
    await selectAll(editor);

    let result: string[][] = [];
    const originalOpen = require('../../common').openTextDocumentWithTitles;
    require('../../common').openTextDocumentWithTitles = async (zip: string[][]) => {
      result = zip;
    };

    await calcDateHandler(editor);
    require('../../common').openTextDocumentWithTitles = originalOpen;

    assert.strictEqual(result.length, 1);
    assert.ok(result[0][1].includes('2021'));
  });
});
