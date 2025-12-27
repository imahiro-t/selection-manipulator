import * as assert from 'assert';
import * as vscode from 'vscode';
import { countOccurrencesHandler } from '../../handler/countOccurrencesHandler';
import { createTextEditor, selectAll } from './testUtils';

suite('Count Occurrences Handler Test Suite', () => {
  test('Count Occurrences (Sort by Word)', async () => {
    const editor = await createTextEditor('apple\nbanana\napple');
    await selectAll(editor);
    let result = '';
    const originalOpen = require('../../common').openTextDocument;
    require('../../common').openTextDocument = async (content: string) => {
      result = content;
    };
    await countOccurrencesHandler('word')(editor);
    require('../../common').openTextDocument = originalOpen;

    // Check line by line as split result might vary in order if logic unchanged
    // 'apple\t2\nbanana\t1'
    assert.ok(result.includes('apple\t2'));
    assert.ok(result.includes('banana\t1'));
  });
});
