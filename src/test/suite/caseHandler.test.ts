import * as assert from 'assert';
import * as vscode from 'vscode';
import { caseHandler } from '../../handler/caseHandler';
import { createTextEditor } from './testUtils';

suite('Case Handler Test Suite', () => {
  test('Camel Case', async () => {
    const editor = await createTextEditor('hello_world');
    editor.selection = new vscode.Selection(0, 0, 0, 11);
    await caseHandler('camel')(editor);
    assert.strictEqual(editor.document.getText(), 'helloWorld');
  });

  test('Pascal Case', async () => {
    const editor = await createTextEditor('hello_world');
    editor.selection = new vscode.Selection(0, 0, 0, 11);
    await caseHandler('pascal')(editor);
    assert.strictEqual(editor.document.getText(), 'HelloWorld');
  });

  test('Snake Case', async () => {
    const editor = await createTextEditor('helloWorld');
    editor.selection = new vscode.Selection(0, 0, 0, 10);
    await caseHandler('snake')(editor);
    assert.strictEqual(editor.document.getText(), 'hello_world');
  });

  test('Upper Case', async () => {
    const editor = await createTextEditor('hello');
    editor.selection = new vscode.Selection(0, 0, 0, 5);
    await caseHandler('upper')(editor);
    assert.strictEqual(editor.document.getText(), 'HELLO');
  });
  test('Title Case (Smart)', async () => {
    const editor = await createTextEditor('the quick brown fox jumps over the lazy dog');
    editor.selection = new vscode.Selection(0, 0, 0, 43);
    await caseHandler('title-smart')(editor);
    assert.strictEqual(editor.document.getText(), 'The Quick Brown Fox Jumps Over the Lazy Dog');
  });

  test('SpongeBob Case', async function () {
    this.timeout(20000);
    // Each letter is upper-cased with probability 1/2, so one run gives all-lower or all-upper text
    // with probability 2/1024 and a single "mixed case" check is flaky. Every try must keep the
    // letters (case-insensitively); across up to 10 tries at least one result must be mixed case.
    const results: string[] = [];
    const mixed = (text: string) => text !== 'hello world' && text !== 'HELLO WORLD';
    for (let i = 0; i < 10 && !results.some(mixed); i++) {
      const editor = await createTextEditor('hello world');
      editor.selection = new vscode.Selection(0, 0, 0, 11);
      // Awaiting the edit (not a document change): SpongeBob case can leave the text as it is.
      await caseHandler('spongebob')(editor);
      const text = editor.document.getText();
      assert.strictEqual(text.toLowerCase(), 'hello world');
      results.push(text);
    }
    assert.ok(results.some(mixed), `some result mixes the cases: ${JSON.stringify(results)}`);
  });

  test('Screaming Snake Case', async () => {
    const editor = await createTextEditor('hello world');
    editor.selection = new vscode.Selection(0, 0, 0, 11);
    await caseHandler('screaming-snake')(editor);
    assert.strictEqual(editor.document.getText(), 'HELLO_WORLD');
  });

  test('Slugify', async () => {
    const editor = await createTextEditor('Hello World');
    editor.selection = new vscode.Selection(0, 0, 0, 11);
    await caseHandler('slugify')(editor);
    assert.strictEqual(editor.document.getText(), 'hello-world');
  });

  test('Humanize', async () => {
    const editor = await createTextEditor('hello_world');
    editor.selection = new vscode.Selection(0, 0, 0, 11);
    await caseHandler('humanize')(editor);
    assert.strictEqual(editor.document.getText(), 'Hello world');
  });
});
