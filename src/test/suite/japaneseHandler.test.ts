import * as assert from 'assert';
import * as vscode from 'vscode';
import {
  fullWidthToHalfWidthHandler,
  halfWidthToFullWidthHandler,
  hiraganaToKatakanaHandler,
  katakanaToHiraganaHandler,
} from '../../handler/japaneseHandler';
import { createTextEditor, getDocumentText, waitForNewDocument, selectAll } from './testUtils';

suite('Japanese Handler Test Suite', () => {
  test('fullWidthToHalfWidthHandler', async () => {
    const editor = await createTextEditor('ＡＢＣ１２３　');
    await selectAll(editor);
    await fullWidthToHalfWidthHandler(true)(editor);
    assert.strictEqual(getDocumentText(editor), 'ABC123 ');
  });

  test('halfWidthToFullWidthHandler', async () => {
    const editor = await createTextEditor('ABC123 ');
    await selectAll(editor);
    await halfWidthToFullWidthHandler(true)(editor);
    assert.strictEqual(getDocumentText(editor), 'ＡＢＣ１２３　');
  });

  test('hiraganaToKatakanaHandler', async () => {
    const editor = await createTextEditor('あいうえお');
    await selectAll(editor);
    await hiraganaToKatakanaHandler(true)(editor);
    assert.strictEqual(getDocumentText(editor), 'アイウエオ');
  });

  test('katakanaToHiraganaHandler', async () => {
    const editor = await createTextEditor('アイウエオ');
    await selectAll(editor);
    await katakanaToHiraganaHandler(true)(editor);
    assert.strictEqual(getDocumentText(editor), 'あいうえお');
  });
});
