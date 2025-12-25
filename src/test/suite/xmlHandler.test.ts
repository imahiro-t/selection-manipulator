import * as assert from 'assert';
import * as vscode from 'vscode';
import { xmlHandler } from '../../handler/xmlHandler';
import { createTextEditor } from './testUtils';

suite('XML Handler Test Suite', () => {
  test('Format XML', async () => {
    const editor = await createTextEditor('<root><a>1</a></root>');
    editor.selection = new vscode.Selection(0, 0, 0, 21);
    editor.selection = new vscode.Selection(0, 0, 0, 21);
    await xmlHandler('format', true)(editor);
    const text = editor.document.getText();
    console.log('XML Output:', JSON.stringify(text));
    assert.ok(text.includes('\n'));
    assert.ok(text.includes('  <a>'));
    assert.ok(text.includes('    1'));
    assert.ok(text.includes('  </a>'));
  });
});
