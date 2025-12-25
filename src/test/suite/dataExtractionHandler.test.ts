
import * as assert from 'assert';
import * as vscode from 'vscode';
import { createTextEditor, selectAll, waitForNewDocument } from './testUtils';
import { dataExtractionHandler } from '../../handler/dataExtractionHandler';

suite('Data Extraction Handler Test Suite', () => {
  vscode.window.showInformationMessage('Start Data Extraction Handler tests.');

  test('Extract Email', async () => {
    const text = 'Contact us at support@example.com or sales@example.org for more info.';
    const editor = await createTextEditor(text);
    await selectAll(editor);
    const newDocPromise = waitForNewDocument();
    await dataExtractionHandler('email', false)(editor);

    const activeEditor = await newDocPromise;
    assert.ok(activeEditor);
    const extractedText = activeEditor.getText();
    assert.ok(extractedText.includes('support@example.com'), 'Expected support@example.com in: ' + extractedText);
    assert.ok(extractedText.includes('sales@example.org'));

    await vscode.commands.executeCommand('workbench.action.closeActiveEditor');
  });

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

  test('Extract URL', async () => {
    const text = 'Check out https://google.com and http://example.org/path?query=1';
    const editor = await createTextEditor(text);
    await selectAll(editor);
    const newDocPromise = waitForNewDocument();
    await dataExtractionHandler('url', false)(editor);

    const activeEditor = await newDocPromise;
    assert.ok(activeEditor);
    const extractedText = activeEditor.getText();
    assert.ok(extractedText.includes('https://google.com'));
    assert.ok(extractedText.includes('http://example.org/path?query=1'));

    await vscode.commands.executeCommand('workbench.action.closeActiveEditor');
  });

  test('Extract IP', async () => {
    const text = 'Server IP is 192.168.1.1 and backup is 10.0.0.5';
    const editor = await createTextEditor(text);
    await selectAll(editor);
    const newDocPromise = waitForNewDocument();
    await dataExtractionHandler('ip', false)(editor);

    const activeEditor = await newDocPromise;
    assert.ok(activeEditor);
    const extractedText = activeEditor.getText();
    assert.ok(extractedText.includes('192.168.1.1'));
    assert.ok(extractedText.includes('10.0.0.5'));

    await vscode.commands.executeCommand('workbench.action.closeActiveEditor');
  });
});
