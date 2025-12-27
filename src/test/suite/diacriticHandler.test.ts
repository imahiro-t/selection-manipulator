import * as assert from 'assert';
import * as vscode from 'vscode';
import { before, after } from 'mocha';

suite('Diacritic Handler Test Suite', () => {
  let originalDocumentContent = '';

  before(async () => {
    const document = await vscode.workspace.openTextDocument({ content: 'Crème Brûlée' });
    await vscode.window.showTextDocument(document);
    originalDocumentContent = document.getText();
  });

  after(async () => {
    await vscode.commands.executeCommand('workbench.action.closeActiveEditor');
  });

  test('Remove Accents', async () => {
    const editor = vscode.window.activeTextEditor;
    assert.ok(editor);

    editor.selection = new vscode.Selection(0, 0, 0, 12); // "Crème Brûlée"

    await vscode.commands.executeCommand('selection-manipulator.text.remove-accents');

    // Allow time for the command to execute
    await new Promise(resolve => setTimeout(resolve, 100));

    const text = editor.document.getText(new vscode.Range(0, 0, 0, 12));
    assert.strictEqual(text, 'Creme Brulee');
  });
});
