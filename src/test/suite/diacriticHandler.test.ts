import * as assert from 'assert';
import * as fs from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';
import { diacriticHandler } from '../../handler/diacriticHandler';
import { createTextEditor, waitForChange } from './testUtils';

const COMMAND = 'selection-manipulator.text.remove-accents';

// The handler is called directly (not through `executeCommand`), so the test depends neither on
// which editor is active nor on activating the extension; the wiring of the command is checked
// statically below instead.
suite('Diacritic Handler Test Suite', () => {
  test('Remove Accents', async () => {
    const editor = await createTextEditor('Crème Brûlée');
    editor.selection = new vscode.Selection(0, 0, 0, 12); // "Crème Brûlée"

    const changed = waitForChange(editor.document);
    diacriticHandler(editor);
    await changed;

    assert.strictEqual(editor.document.getText(), 'Creme Brulee');
  });

  test('extension.ts and package.json register Remove Accents with diacriticHandler', () => {
    const root = path.resolve(__dirname, '../../..');
    const source = fs.readFileSync(path.join(root, 'src/extension.ts'), 'utf8');
    const registration = `registerTextEditorCommand('${COMMAND}', diacriticHandler)`;
    assert.strictEqual(source.split(registration).length - 1, 1, registration);
    const packageJson = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
    const contributed = (packageJson.contributes.commands as { command: string }[]).filter((c) => c.command === COMMAND);
    assert.strictEqual(contributed.length, 1, COMMAND);
  });
});
