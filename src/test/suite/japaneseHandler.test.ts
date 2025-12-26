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
    const editor = await createTextEditor('ＡＢＣａｂｃ１２３！＃＄　アイウエオ　あいうえお　ガギグゲゴ');
    await selectAll(editor);
    const newDocPromise = waitForNewDocument();
    await fullWidthToHalfWidthHandler(false)(editor);

    const activeEditor = await newDocPromise;
    assert.ok(activeEditor);
    // ABCabc123!#$ ｱｲｳｴｵ ｱｲｳｴｵ ｶﾞｷﾞｸﾞｹﾞｺﾞ
    assert.strictEqual(activeEditor.getText(), 'ABCabc123!#$ ｱｲｳｴｵ ｱｲｳｴｵ ｶﾞｷﾞｸﾞｹﾞｺﾞ');
    await vscode.commands.executeCommand('workbench.action.closeActiveEditor');
  });

  test('halfWidthToFullWidthHandler', async () => {
    const editor = await createTextEditor('ABC123 ');
    await selectAll(editor);
    await halfWidthToFullWidthHandler(true)(editor);
    assert.strictEqual(getDocumentText(editor), 'ＡＢＣ１２３　');

    // Regression test for Half-width Katakana
    const editor2 = await createTextEditor('ｱｲｳｴｵ');
    await selectAll(editor2);
    await halfWidthToFullWidthHandler(true)(editor2);
    assert.strictEqual(getDocumentText(editor2), 'アイウエオ');
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

    // Regression test for Half-width Katakana
    const editor2 = await createTextEditor('ｱｲｳｴｵ');
    await selectAll(editor2);
    await katakanaToHiraganaHandler(true)(editor2);
    assert.strictEqual(getDocumentText(editor2), 'あいうえお');
  });
});
