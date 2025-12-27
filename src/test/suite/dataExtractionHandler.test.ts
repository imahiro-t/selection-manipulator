import * as assert from 'assert';
import * as vscode from 'vscode';
import { createTextEditor, selectAll } from './testUtils';
import { dataExtractionHandler } from '../../handler/dataExtractionHandler';

suite('Data Extraction Handler Test Suite', () => {
  vscode.window.showInformationMessage('Start Data Extraction Handler tests.');

  test('Extract Email Replace', async () => {
    const text = 'foo bar support@example.com baz sales@example.org qux';
    const editor = await createTextEditor(text);
    await selectAll(editor);
    await dataExtractionHandler('email', true)(editor);

    const content = editor.document.getText();
    assert.ok(content.includes('support@example.com'));
    assert.ok(content.includes('sales@example.org'));
    assert.ok(!content.includes('foo bar'));
  });

  test('Extract Email', async () => {
    const editor = await createTextEditor('Contact us at support@example.com for help.');
    await selectAll(editor);
    let extractedText = '';
    // Mock openTextDocument to capture output
    const originalOpen = require('../../common').openTextDocument;
    require('../../common').openTextDocument = async (content: string) => {
      extractedText = content;
    };

    await dataExtractionHandler('email', false)(editor);

    // Restore
    require('../../common').openTextDocument = originalOpen;

    assert.ok(extractedText.includes('support@example.com'));
  });

  test('Extract URL', async () => {
    const editor = await createTextEditor('Visit https://google.com for more info.');
    await selectAll(editor);
    let extractedText = '';
    const originalOpen = require('../../common').openTextDocument;
    require('../../common').openTextDocument = async (content: string) => {
      extractedText = content;
    };

    await dataExtractionHandler('url', false)(editor);
    require('../../common').openTextDocument = originalOpen;

    assert.ok(extractedText.includes('https://google.com'));
  });

  test('Extract IP', async () => {
    const editor = await createTextEditor('Server IP is 192.168.1.1 connected.');
    await selectAll(editor);
    let extractedText = '';
    const originalOpen = require('../../common').openTextDocument;
    require('../../common').openTextDocument = async (content: string) => {
      extractedText = content;
    };

    await dataExtractionHandler('ip', false)(editor);
    require('../../common').openTextDocument = originalOpen;

    assert.ok(extractedText.includes('192.168.1.1'));
  });
});
