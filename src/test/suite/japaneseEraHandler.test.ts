import * as assert from 'assert';
import * as vscode from 'vscode';
import { japaneseEraHandler } from '../../handler/japaneseEraHandler';
import { createTextEditor, selectAll } from './testUtils';

suite('Japanese Era Handler Test Suite', () => {
  vscode.window.showInformationMessage('Start Japanese Era Handler tests.');

  test('Convert AD to Wareki', async () => {
    const result = await runEraHandler('2019', true);
    assert.strictEqual(result, '令和元年');
  });

  test('Convert AD to Wareki (Meiji)', async () => {
    const result = await runEraHandler('1868', true);
    assert.strictEqual(result, '明治元年');
  });

  test('Convert AD to Wareki (Showa)', async () => {
    const result = await runEraHandler('1926', true);
    assert.strictEqual(result, '昭和元年');
  });

  test('Convert AD to Wareki (Heisei)', async () => {
    const result = await runEraHandler('1989', true);
    assert.strictEqual(result, '平成元年');
  });

  test('Convert Wareki to AD', async () => {
    const result = await runEraHandler('令和元年', true);
    assert.strictEqual(result, '2019年');
  });

  test('Convert Wareki to AD (Numeric)', async () => {
    const result = await runEraHandler('令和7年', true);
    assert.strictEqual(result, '2025年');
  });

  test('Convert Wareki to AD (Showa)', async () => {
    const result = await runEraHandler('昭和64年', true);
    assert.strictEqual(result, '1989年');
  });

  test('Invalid Input (No Change)', async () => {
    const input = 'ABCDE';
    const result = await runEraHandler(input, true);
    assert.strictEqual(result, input);
  });
});

async function runEraHandler(content: string, replace: boolean): Promise<string> {
  const editor = await createTextEditor(content);
  await selectAll(editor);

  await japaneseEraHandler(replace)(editor);

  return editor.document.getText();
}
