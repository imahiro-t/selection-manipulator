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
});
