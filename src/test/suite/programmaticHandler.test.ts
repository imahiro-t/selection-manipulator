import * as assert from 'assert';
import * as vscode from 'vscode';
import {
  jsonToYamlHandler,
  yamlToJsonHandler,
  hexToRgbHandler,
  rgbToHexHandler,
  toggleQuotesHandler,
  hexToDecimalHandler,
  decimalToHexHandler,
} from '../../handler/programmaticHandler';
import { createTextEditor, waitForNewDocument, selectAll, getDocumentText } from './testUtils';

suite('Programmatic Handler Test Suite', () => {
  test('jsonToYamlHandler (replace)', async () => {
    const editor = await createTextEditor('{"a": 1, "b": "test"}');
    await selectAll(editor);
    await jsonToYamlHandler(true)(editor);
    assert.strictEqual(editor.document.getText().trim(), "a: 1\nb: test");
  });

  test('jsonToYamlHandler (new doc)', async () => {
    const editor = await createTextEditor('{"a": 1, "b": "test"}');
    await selectAll(editor);
    const newDocPromise = waitForNewDocument();
    await jsonToYamlHandler(false)(editor);
    const newDoc = await newDocPromise;
    assert.strictEqual(newDoc.getText().trim(), "a: 1\nb: test");
  });

  test('yamlToJsonHandler (replace)', async () => {
    const editor = await createTextEditor('a: 1\nb: test');
    await selectAll(editor);
    await yamlToJsonHandler(true)(editor);
    const result = JSON.parse(editor.document.getText());
    assert.deepStrictEqual(result, { a: 1, b: "test" });
  });

  test('yamlToJsonHandler (new doc)', async () => {
    const editor = await createTextEditor('a: 1\nb: test');
    await selectAll(editor);
    const newDocPromise = waitForNewDocument();
    await yamlToJsonHandler(false)(editor);
    const newDoc = await newDocPromise;
    const result = JSON.parse(newDoc.getText());
    assert.deepStrictEqual(result, { a: 1, b: "test" });
  });

  test('YAML to JSON (Single Selection - Replace)', async () => {
    const editor = await createTextEditor('key: value');
    await selectAll(editor);
    await yamlToJsonHandler(true)(editor);
    const text = editor.document.getText();
    assert.strictEqual(text, '{\n  "key": "value"\n}');
  });

  test('Hex to Decimal', async () => {
    const editor = await createTextEditor('0xFF');
    await selectAll(editor);
    await hexToDecimalHandler(true)(editor);
    assert.strictEqual(editor.document.getText(), '255');
  });

  test('Decimal to Hex', async () => {
    const editor = await createTextEditor('255');
    await selectAll(editor);
    await decimalToHexHandler(true)(editor);
    assert.strictEqual(getDocumentText(editor), '0xFF');
  });

  test('hexToRgbHandler', async () => {
    const editor = await createTextEditor('#ffffff');
    await selectAll(editor);
    await hexToRgbHandler(true)(editor);
    assert.strictEqual(getDocumentText(editor), 'rgb(255, 255, 255)');
  });

  test('rgbToHexHandler', async () => {
    const editor = await createTextEditor('rgb(255, 255, 255)');
    await selectAll(editor);
    await rgbToHexHandler(true)(editor);
    assert.strictEqual(getDocumentText(editor), '#ffffff');
  });

  test('toggleQuotesHandler', async () => {
    const editor = await createTextEditor("'test'");
    await selectAll(editor);
    await toggleQuotesHandler(editor);
    assert.strictEqual(getDocumentText(editor), '"test"');

    const editor2 = await createTextEditor('"test"');
    await selectAll(editor2);
    await toggleQuotesHandler(editor2);
    assert.strictEqual(getDocumentText(editor2), "'test'");

    // Test with escape
    const editor3 = await createTextEditor("'It\\'s me'");
    await selectAll(editor3);
    await toggleQuotesHandler(editor3);
    assert.strictEqual(getDocumentText(editor3), '"It\'s me"');

    const editor4 = await createTextEditor('"It\\"s me"');
    await selectAll(editor4);
    await toggleQuotesHandler(editor4);
    assert.strictEqual(getDocumentText(editor4), "'It\"s me'");
  });
});
