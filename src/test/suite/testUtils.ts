import * as vscode from 'vscode';

import { ResultProvider } from '../../provider/resultProvider';

// Register provider for tests if not already registered (or just register it, assuming one instance per test run)
try {
  vscode.workspace.registerTextDocumentContentProvider(ResultProvider.scheme, ResultProvider.instance);
} catch (e) {
  // Ignore if already registered
  console.log('Provider already registered or failed to register', e);
}

export async function createTextEditor(content: string = ''): Promise<vscode.TextEditor> {
  const document = await vscode.workspace.openTextDocument({ content });
  return await vscode.window.showTextDocument(document);
}

export async function setSelection(editor: vscode.TextEditor, selections: vscode.Selection[]) {
  editor.selections = selections;
}

export async function selectAll(editor: vscode.TextEditor) {
  const firstLine = editor.document.lineAt(0);
  const lastLine = editor.document.lineAt(editor.document.lineCount - 1);
  const range = new vscode.Range(firstLine.range.start, lastLine.range.end);
  const selection = new vscode.Selection(range.start, range.end);
  editor.selection = selection;
}

export function getDocumentText(editor: vscode.TextEditor): string {
  return editor.document.getText();
}

export function waitForNewDocument(): Promise<vscode.TextDocument> {
  return new Promise(resolve => {
    const disposable = vscode.workspace.onDidOpenTextDocument(doc => {
      disposable.dispose();
      resolve(doc);
    });
  });
}
