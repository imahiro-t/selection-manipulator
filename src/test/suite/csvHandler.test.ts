import * as assert from 'assert';
import * as vscode from 'vscode';
import { csvHandler, csvToMarkdown } from '../../handler/csvHandler';
import { createTextEditor, getDocumentText, waitForChange } from './testUtils';

suite('CSV Handler Test Suite', () => {
  vscode.window.showInformationMessage('Start all tests.');

  test('CSV to Markdown', async () => {
    const editor = await createTextEditor('a,b,c\n1,2,3\n4,5,6');
    editor.selection = new vscode.Selection(0, 0, 2, 5);
    const changed = waitForChange(editor.document);
    csvHandler('csv-to-markdown', true)(editor);
    await changed;

    const text = getDocumentText(editor);
    const expected = `| a | b | c |
| --- | --- | --- |
| 1 | 2 | 3 |
| 4 | 5 | 6 |
`;
    assert.strictEqual(text.trim(), expected.trim());
  });

  test('CSV to Markdown: 200,000 rows do not overflow the call stack (SELEC-00082)', () => {
    // The widest row is in the middle, so that the column count is not the first row's.
    const rows = Array.from({ length: 200000 }, (_, i) => (i === 100000 ? 'a,b,c,d' : 'a,b'));
    let markdown = '';
    assert.doesNotThrow(() => {
      markdown = csvToMarkdown(rows.join('\n'));
    });
    const lines = markdown.split('\n');
    assert.strictEqual(lines[1], '| --- | --- | --- | --- |');
    assert.strictEqual(lines.length, 200000 + 2, 'every row, the separator and the final empty line');
  });

  test('Markdown to CSV', async () => {
    const markdown = `| a | b | c |
| --- | --- | --- |
| 1 | 2 | 3 |
| 4 | 5 | 6 |`;
    const editor = await createTextEditor(markdown);
    editor.selection = new vscode.Selection(0, 0, 3, 13);
    const changed = waitForChange(editor.document);
    csvHandler('markdown-to-csv', true)(editor);
    await changed;

    const text = getDocumentText(editor);
    const expected = `a,b,c
1,2,3
4,5,6`;
    assert.strictEqual(text.trim(), expected.trim());
  });
});
