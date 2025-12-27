import * as assert from 'assert';
import * as vscode from 'vscode';
import { insertDateHandler } from '../../handler/insertDateHandler';
import { createTextEditor, getDocumentText } from './testUtils';

suite('Insert Date Handler Test Suite', () => {
  test('Insert ISO Date', async () => {
    const editor = await createTextEditor('');
    await insertDateHandler('iso')(editor);
    const text = getDocumentText(editor);
    assert.ok(/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z/.test(text));
  });

  test('Insert Timestamp', async () => {
    const editor = await createTextEditor('');
    await insertDateHandler('timestamp')(editor);
    const text = getDocumentText(editor);
    assert.ok(/^\d{10}$/.test(text));
  });
});
