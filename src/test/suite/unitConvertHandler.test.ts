import * as assert from 'assert';
import * as vscode from 'vscode';
import { unitConvertHandler } from '../../handler/unitConvertHandler';
import { createTextEditor, selectAll } from './testUtils';

suite('Unit Convert Handler Test Suite', () => {
  test('px-to-rem', async () => {
    const editor = await createTextEditor('16');
    await selectAll(editor);
    await unitConvertHandler('px-to-rem')(editor);
    assert.strictEqual(editor.document.getText(), '1rem');
  });

  test('px-to-rem with decimal', async () => {
    const editor = await createTextEditor('24');
    await selectAll(editor);
    await unitConvertHandler('px-to-rem')(editor);
    assert.strictEqual(editor.document.getText(), '1.5rem');
  });

  test('rem-to-px', async () => {
    const editor = await createTextEditor('1');
    await selectAll(editor);
    await unitConvertHandler('rem-to-px')(editor);
    assert.strictEqual(editor.document.getText(), '16px');
  });

  test('rem-to-px with decimal', async () => {
    const editor = await createTextEditor('1.5');
    await selectAll(editor);
    await unitConvertHandler('rem-to-px')(editor);
    assert.strictEqual(editor.document.getText(), '24px');
  });

  test('kg-to-lb', async () => {
    const editor = await createTextEditor('1');
    await selectAll(editor);
    await unitConvertHandler('kg-to-lb')(editor);
    assert.strictEqual(editor.document.getText(), '2.20lb');
  });

  test('lb-to-kg', async () => {
    const editor = await createTextEditor('2.20462');
    await selectAll(editor);
    await unitConvertHandler('lb-to-kg')(editor);
    // Approximately 1kg. Code strips .00
    assert.strictEqual(editor.document.getText(), '1kg');
  });

  test('lb-to-kg clean output', async () => {
    const editor = await createTextEditor('4.40924');
    await selectAll(editor);
    await unitConvertHandler('lb-to-kg')(editor);
    assert.strictEqual(editor.document.getText(), '2kg');
  });
});
