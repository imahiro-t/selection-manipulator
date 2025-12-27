import * as assert from 'assert';
import * as vscode from 'vscode';
import { quoteHandler } from '../../handler/quoteHandler';
import { createTextEditor, getDocumentText, selectAll } from './testUtils';

suite('Quote Handler Test Suite', () => {
  test('Single Quote', async () => {
    const editor = await createTextEditor('text');
    await selectAll(editor);
    await quoteHandler('single')(editor);
    assert.strictEqual(getDocumentText(editor), "'text'");
  });

  test('Double Quote', async () => {
    const editor = await createTextEditor('text');
    await selectAll(editor);
    await quoteHandler('double')(editor);
    assert.strictEqual(getDocumentText(editor), '"text"');
  });

  test('Backtick Quote', async () => {
    const editor = await createTextEditor('text');
    await selectAll(editor);
    await quoteHandler('backtick')(editor);
    assert.strictEqual(getDocumentText(editor), '`text`');
  });
});
