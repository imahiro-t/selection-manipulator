import * as assert from 'assert';
import * as vscode from 'vscode';
import { mathHandler } from '../../handler/mathHandler';
import { createTextEditor, waitForNewDocument } from './testUtils';

suite('Math Handler Test Suite', () => {
  test('Sum', async () => {
    const editor = await createTextEditor('1\n2\n3');
    editor.selection = new vscode.Selection(0, 0, 2, 1);

    const waitPromise = waitForNewDocument();
    mathHandler('sum')(editor);
    const doc = await waitPromise;

    const text = doc.getText();
    assert.ok(text.includes('Sum'));
    assert.ok(text.includes('6'));
  });

  test('Average', async () => {
    const editor = await createTextEditor('1\n2\n3');
    editor.selection = new vscode.Selection(0, 0, 2, 1);

    const waitPromise = waitForNewDocument();
    mathHandler('average')(editor);
    const doc = await waitPromise;

    const text = doc.getText();
    assert.ok(text.includes('Average'));
    assert.ok(text.includes('2'));
  });

  test('Min', async () => {
    const editor = await createTextEditor('1\n2\n3');
    editor.selection = new vscode.Selection(0, 0, 2, 1);

    const waitPromise = waitForNewDocument();
    mathHandler('min')(editor);
    const doc = await waitPromise;

    const text = doc.getText();
    assert.ok(text.includes('Min'));
    assert.ok(text.includes('1'));
  });

  test('Max', async () => {
    const editor = await createTextEditor('1\n2\n3');
    editor.selection = new vscode.Selection(0, 0, 2, 1);

    const waitPromise = waitForNewDocument();
    mathHandler('max')(editor);
    const doc = await waitPromise;

    const text = doc.getText();
    assert.ok(text.includes('Max'));
    assert.ok(text.includes('3'));
  });
});
