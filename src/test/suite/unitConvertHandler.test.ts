import * as assert from 'assert';
import * as vscode from 'vscode';
import { unitConvertHandler } from '../../handler/unitConvertHandler';
import { createTextEditor, getDocumentText } from './testUtils';

suite('Unit Convert Handler Test Suite', () => {
  test('px-to-rem', async () => {
    const editor = await createTextEditor('16');
    unitConvertHandler('px-to-rem')(editor);
    assert.strictEqual(getDocumentText(editor), '1rem');
  });

  test('px-to-rem with decimal', async () => {
    const editor = await createTextEditor('24');
    unitConvertHandler('px-to-rem')(editor);
    assert.strictEqual(getDocumentText(editor), '1.5rem');
  });

  test('rem-to-px', async () => {
    const editor = await createTextEditor('1');
    unitConvertHandler('rem-to-px')(editor);
    assert.strictEqual(getDocumentText(editor), '16px');
  });

  test('rem-to-px with decimal', async () => {
    const editor = await createTextEditor('1.5');
    unitConvertHandler('rem-to-px')(editor);
    assert.strictEqual(getDocumentText(editor), '24px');
  });

  test('kg-to-lb', async () => {
    const editor = await createTextEditor('1');
    unitConvertHandler('kg-to-lb')(editor);
    assert.strictEqual(getDocumentText(editor), '2.20lb');
  });

  test('lb-to-kg', async () => {
    const editor = await createTextEditor('2.20462');
    unitConvertHandler('lb-to-kg')(editor);
    // Approximately 1kg
    assert.strictEqual(getDocumentText(editor), '1kg');
  });

  test('lb-to-kg clean output', async () => {
    const editor = await createTextEditor('4.40924');
    unitConvertHandler('lb-to-kg')(editor);
    assert.strictEqual(getDocumentText(editor), '2kg');
  });
});
