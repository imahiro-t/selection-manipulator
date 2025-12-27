import * as assert from 'assert';
import * as vscode from 'vscode';
import { dataStructHandler } from '../../handler/dataStructHandler';
import { createTextEditor, getDocumentText } from './testUtils';

suite('Data Struct Handler Test Suite', () => {
  vscode.window.showInformationMessage('Start all tests.');

  test('Env to JSON', async () => {
    const env = `
# Comment
KEY1=VALUE1
KEY2="VALUE2"
KEY3='VALUE3'
        
        `;
    const editor = await createTextEditor(env);
    editor.selection = new vscode.Selection(0, 0, 5, 10);
    await dataStructHandler('env-to-json', true)(editor);
    await new Promise(resolve => setTimeout(resolve, 200));

    const text = getDocumentText(editor);
    const expected = `{
  "KEY1": "VALUE1",
  "KEY2": "VALUE2",
  "KEY3": "VALUE3"
}`;
    assert.strictEqual(JSON.parse(text).KEY1, "VALUE1");
    assert.strictEqual(JSON.parse(text).KEY2, "VALUE2");
  });
});
