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

  test('Extract Email Replace gives the same addresses as before, in order', async () => {
    const text = 'a@b@c.com first.last+tag@sub.example.co.jp. x@y x@a.b mail a_b%c@d-e.fg! aa@bb.c1d';
    const editor = await createTextEditor(text);
    await selectAll(editor);
    await dataExtractionHandler('email', true)(editor);

    assert.strictEqual(editor.document.getText(), 'b@c.com\nfirst.last+tag@sub.example.co.jp\na_b%c@d-e.fg');
  });

  test('Extract Email Replace runs in linear time on long runs of address characters', async () => {
    // The former pattern took about 35 seconds on 160,000 letters without `@`.
    const text = `${'a'.repeat(160_000)} support@example.com ${'b.'.repeat(80_000)}`;
    const editor = await createTextEditor(text);
    await selectAll(editor);
    const started = Date.now();
    await dataExtractionHandler('email', true)(editor);

    assert.ok(Date.now() - started < 1000, `${Date.now() - started} ms`);
    assert.strictEqual(editor.document.getText(), 'support@example.com');
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
