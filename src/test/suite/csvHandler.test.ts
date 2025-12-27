import * as assert from 'assert';
import * as vscode from 'vscode';
import { csvHandler } from '../../handler/csvHandler';
import { createTextEditor, getDocumentText } from './testUtils';

suite('CSV Handler Test Suite', () => {
  vscode.window.showInformationMessage('Start all tests.');

  test('CSV to Markdown', async () => {
    const editor = await createTextEditor('a,b,c\n1,2,3\n4,5,6');
    editor.selection = new vscode.Selection(0, 0, 2, 5);
    await csvHandler('csv-to-markdown', true)(editor);
    await new Promise(resolve => setTimeout(resolve, 200));

    const text = getDocumentText(editor);
    const expected = `| a | b | c |
| --- | --- | --- |
| 1 | 2 | 3 |
| 4 | 5 | 6 |
`;
    assert.strictEqual(text.trim(), expected.trim());
  });

  test('Markdown to CSV', async () => {
    const markdown = `| a | b | c |
| --- | --- | --- |
| 1 | 2 | 3 |
| 4 | 5 | 6 |`;
    const editor = await createTextEditor(markdown);
    editor.selection = new vscode.Selection(0, 0, 3, 13);
    await csvHandler('markdown-to-csv', true)(editor);
    await new Promise(resolve => setTimeout(resolve, 200));

    const text = getDocumentText(editor);
    const expected = `a,b,c
1,2,3
4,5,6`;
    assert.strictEqual(text.trim(), expected.trim());
  });
});
