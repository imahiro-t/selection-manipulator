import * as assert from 'assert';
import { encloseHandler } from '../../handler/encloseHandler';
import { createTextEditor, getDocumentText, selectAll } from './testUtils';

suite('Enclose Handler Test Suite', () => {
  test('Single Quote', async () => {
    const editor = await createTextEditor('text');
    await selectAll(editor);
    await encloseHandler('single')(editor);
    assert.strictEqual(getDocumentText(editor), "'text'");
  });

  test('Double Quote', async () => {
    const editor = await createTextEditor('text');
    await selectAll(editor);
    await encloseHandler('double')(editor);
    assert.strictEqual(getDocumentText(editor), '"text"');
  });

  test('Backtick Quote', async () => {
    const editor = await createTextEditor('text');
    await selectAll(editor);
    await encloseHandler('backtick')(editor);
    assert.strictEqual(getDocumentText(editor), '`text`');
  });

  test('Parentheses', async () => {
    const editor = await createTextEditor('text');
    await selectAll(editor);
    await encloseHandler('paren')(editor);
    assert.strictEqual(getDocumentText(editor), '(text)');
  });

  test('Square Brackets', async () => {
    const editor = await createTextEditor('text');
    await selectAll(editor);
    await encloseHandler('square')(editor);
    assert.strictEqual(getDocumentText(editor), '[text]');
  });

  test('Curly Brackets', async () => {
    const editor = await createTextEditor('text');
    await selectAll(editor);
    await encloseHandler('curly')(editor);
    assert.strictEqual(getDocumentText(editor), '{text}');
  });

  test('Angle Brackets', async () => {
    const editor = await createTextEditor('text');
    await selectAll(editor);
    await encloseHandler('angle')(editor);
    assert.strictEqual(getDocumentText(editor), '<text>');
  });

  test('Japanese Single Quote', async () => {
    const editor = await createTextEditor('text');
    await selectAll(editor);
    await encloseHandler('japanese-quote-single')(editor);
    assert.strictEqual(getDocumentText(editor), '「text」');
  });

  test('Japanese Double Quote', async () => {
    const editor = await createTextEditor('text');
    await selectAll(editor);
    await encloseHandler('japanese-quote-double')(editor);
    assert.strictEqual(getDocumentText(editor), '『text』');
  });

  test('Japanese Bracket', async () => {
    const editor = await createTextEditor('text');
    await selectAll(editor);
    await encloseHandler('japanese-bracket')(editor);
    assert.strictEqual(getDocumentText(editor), '【text】');
  });

  test('Japanese Angle Bracket', async () => {
    const editor = await createTextEditor('text');
    await selectAll(editor);
    await encloseHandler('japanese-angle')(editor);
    assert.strictEqual(getDocumentText(editor), '＜text＞');
  });

  test('Japanese Parentheses', async () => {
    const editor = await createTextEditor('text');
    await selectAll(editor);
    await encloseHandler('japanese-paren')(editor);
    assert.strictEqual(getDocumentText(editor), '（text）');
  });

  test('Japanese Square Brackets', async () => {
    const editor = await createTextEditor('text');
    await selectAll(editor);
    await encloseHandler('japanese-square')(editor);
    assert.strictEqual(getDocumentText(editor), '［text］');
  });

  test('Japanese Curly Brackets', async () => {
    const editor = await createTextEditor('text');
    await selectAll(editor);
    await encloseHandler('japanese-curly')(editor);
    assert.strictEqual(getDocumentText(editor), '｛text｝');
  });
});
