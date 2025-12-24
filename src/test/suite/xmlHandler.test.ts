import * as assert from 'assert';
import * as vscode from 'vscode';
import { xmlHandler } from '../../handler/xmlHandler';
import { createTextEditor } from './testUtils';

suite('XML Handler Test Suite', () => {
  test('Format XML', async () => {
    const editor = await createTextEditor('<root><a>1</a></root>');
    editor.selection = new vscode.Selection(0, 0, 0, 21);
    xmlHandler('format', true)(editor);
    await new Promise(resolve => setTimeout(resolve, 100));
    const text = editor.document.getText();
    assert.ok(text.includes('\n'));
    assert.ok(text.includes('  <a>1</a>'));
  });
});
