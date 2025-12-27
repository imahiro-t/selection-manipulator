import * as assert from 'assert';
import * as vscode from 'vscode';
import { markdownHandler } from '../../handler/markdownHandler';
import { createTextEditor, getDocumentText, selectAll } from './testUtils';

suite('Markdown Handler Test Suite', () => {
  test('Create Link from Text (URL in Clipboard)', async () => {
    await vscode.env.clipboard.writeText('https://example.com');
    const editor = await createTextEditor('Example');
    await selectAll(editor);
    await markdownHandler('link')(editor);
    assert.strictEqual(getDocumentText(editor), '[Example](https://example.com)');
  });

  test('Create Link from URL (Text in Clipboard)', async () => {
    await vscode.env.clipboard.writeText('Example');
    const editor = await createTextEditor('https://example.com');
    await selectAll(editor);
    await markdownHandler('link')(editor);
    assert.strictEqual(getDocumentText(editor), '[Example](https://example.com)');
  });

  test('Create Link from Text (Empty Clipboard)', async () => {
    await vscode.env.clipboard.writeText('');
    const editor = await createTextEditor('Example');
    await selectAll(editor);
    await markdownHandler('link')(editor);
    assert.strictEqual(getDocumentText(editor), '[Example]()');
  });
});
