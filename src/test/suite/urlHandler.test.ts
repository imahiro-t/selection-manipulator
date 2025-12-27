import * as assert from 'assert';
import * as vscode from 'vscode';
import { urlHandler } from '../../handler/urlHandler';
import { createTextEditor, waitForNewDocument } from './testUtils';

suite('URL Handler Test Suite', () => {
  test('Encode URI', async () => {
    const editor = await createTextEditor('https://example.com/foo bar');
    editor.selection = new vscode.Selection(0, 0, 0, 27);

    const waitPromise = waitForNewDocument();
    urlHandler('ENCODE_URI')(editor);
    const doc = await waitPromise;

    const text = doc.getText();
    assert.ok(text.includes('https://example.com/foo%20bar'));
  });

  test('Parse URL Params to JSON', async () => {
    const editor = await createTextEditor('http://example.com?a=1&b=2');
    editor.selection = new vscode.Selection(0, 0, 0, 26);
    // waitForNewDocument since urlHandler defaults to open new doc
    const promise = waitForNewDocument();
    urlHandler('PARSE_PARAMS_TO_JSON')(editor);
    const doc = await promise;
    const text = doc.getText();
    // [selectedText, JSON.stringify(...)]
    // content should contain the JSON
    assert.ok(text.includes('"a": "1"'));
    assert.ok(text.includes('"b": "2"'));
  });
});
