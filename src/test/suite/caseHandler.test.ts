import * as assert from 'assert';
import * as vscode from 'vscode';
import { caseHandler } from '../../handler/caseHandler';
import { createTextEditor } from './testUtils';

suite('Case Handler Test Suite', () => {
  test('Camel Case', async () => {
    const editor = await createTextEditor('hello_world');
    editor.selection = new vscode.Selection(0, 0, 0, 11);
    caseHandler('camel')(editor);
    await new Promise(resolve => setTimeout(resolve, 100));
    assert.strictEqual(editor.document.getText(), 'helloWorld');
  });

  test('Pascal Case', async () => {
    const editor = await createTextEditor('hello_world');
    editor.selection = new vscode.Selection(0, 0, 0, 11);
    caseHandler('pascal')(editor);
    await new Promise(resolve => setTimeout(resolve, 100));
    assert.strictEqual(editor.document.getText(), 'HelloWorld');
  });

  test('Snake Case', async () => {
    const editor = await createTextEditor('helloWorld');
    editor.selection = new vscode.Selection(0, 0, 0, 10);
    caseHandler('snake')(editor);
    await new Promise(resolve => setTimeout(resolve, 100));
    assert.strictEqual(editor.document.getText(), 'hello_world');
  });

  test('Upper Case', async () => {
    const editor = await createTextEditor('hello');
    editor.selection = new vscode.Selection(0, 0, 0, 5);
    caseHandler('upper')(editor);
    await new Promise(resolve => setTimeout(resolve, 100));
    assert.strictEqual(editor.document.getText(), 'HELLO');
  });
  test('Title Case (Smart)', async () => {
    const editor = await createTextEditor('the quick brown fox jumps over the lazy dog');
    editor.selection = new vscode.Selection(0, 0, 0, 43);
    caseHandler('title-smart')(editor);
    await new Promise(resolve => setTimeout(resolve, 100));
    assert.strictEqual(editor.document.getText(), 'The Quick Brown Fox Jumps Over the Lazy Dog');
  });

  test('SpongeBob Case', async () => {
    const editor = await createTextEditor('hello world');
    editor.selection = new vscode.Selection(0, 0, 0, 11);
    caseHandler('spongebob')(editor);
    await new Promise(resolve => setTimeout(resolve, 100));
    const text = editor.document.getText();
    assert.strictEqual(text.toLowerCase(), 'hello world');
    assert.notStrictEqual(text, 'hello world');
    assert.notStrictEqual(text, 'HELLO WORLD');
  });

  test('Screaming Snake Case', async () => {
    const editor = await createTextEditor('hello world');
    editor.selection = new vscode.Selection(0, 0, 0, 11);
    caseHandler('screaming-snake')(editor);
    await new Promise(resolve => setTimeout(resolve, 100));
    assert.strictEqual(editor.document.getText(), 'HELLO_WORLD');
  });

  test('Slugify', async () => {
    const editor = await createTextEditor('Hello World');
    editor.selection = new vscode.Selection(0, 0, 0, 11);
    caseHandler('slugify')(editor);
    await new Promise(resolve => setTimeout(resolve, 100));
    assert.strictEqual(editor.document.getText(), 'hello-world');
  });

  test('Humanize', async () => {
    const editor = await createTextEditor('hello_world');
    editor.selection = new vscode.Selection(0, 0, 0, 11);
    caseHandler('humanize')(editor);
    await new Promise(resolve => setTimeout(resolve, 100));
    assert.strictEqual(editor.document.getText(), 'Hello world');
  });
});
