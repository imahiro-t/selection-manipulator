import * as vscode from 'vscode';

export async function createTextEditor(content: string = ''): Promise<vscode.TextEditor> {
  const document = await vscode.workspace.openTextDocument({ content });
  return await vscode.window.showTextDocument(document);
}

export async function setSelection(editor: vscode.TextEditor, selections: vscode.Selection[]) {
  editor.selections = selections;
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
