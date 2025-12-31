import * as assert from 'assert';
import * as vscode from 'vscode';
import { morseHandler } from '../../handler/morseCodeHandler';
import { createTextEditor, selectAll } from './testUtils';

suite('Morse Code Handler Test Suite', () => {
  vscode.window.showInformationMessage('Start Morse Code Handler tests.');

  test('Convert Text to Morse (Alphanumeric)', async () => {
    const result = await runMorseHandler('SOS', 'to-morse', 'replace');
    assert.strictEqual(result, '... --- ...');
  });

  test('Convert Morse to Text (Alphanumeric)', async () => {
    const result = await runMorseHandler('... --- ...', 'from-morse', 'replace');
    assert.strictEqual(result, 'SOS');
  });

  test('Convert Text to Morse (Japanese)', async () => {
    const result = await runMorseHandler('アイウエオ', 'to-morse', 'replace');
    // ア: --.--, イ: .-, ウ: ..-, エ: -.---, オ: .-...
    assert.strictEqual(result, '--.-- .- ..- -.--- .-...');
  });

  test('Convert Morse to Text (Japanese)', async () => {
    const result = await runMorseHandler('--.-- .- ..- -.--- .-...', 'from-morse', 'replace', 'kana');
    assert.strictEqual(result, 'アイウエオ');
  });

  test('Convert Text to Morse (Mixed and Symbols)', async () => {
    const result = await runMorseHandler('A B', 'to-morse', 'replace');
    // A: .-, B: -... Space: space
    assert.strictEqual(result, '.-   -...');
  });
});

async function runMorseHandler(content: string, mode: any, output: any, priority: any = 'standard'): Promise<string> {
  const editor = await createTextEditor(content);
  await selectAll(editor);

  await morseHandler(mode, output, priority)(editor);

  return editor.document.getText();
}
