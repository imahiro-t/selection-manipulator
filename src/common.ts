import {
  workspace,
  window,
  TextEditor,
  TextDocument,
  ViewColumn,
} from 'vscode';

export const openTextDocument = (content: string, func?: (doc: TextDocument, editor: TextEditor) => void) => {
  const viewColumn = window.activeTextEditor?.viewColumn;
  const openViewColumn = viewColumn === 1 ? ViewColumn.Beside : viewColumn;
  workspace.openTextDocument({
    content: content,
    language: "text"
  }).then((doc: TextDocument) => {
    window.showTextDocument(doc, openViewColumn, true).then((editor: TextEditor)  => {
      if (func) {
        func(doc, editor);
      }
    });
  });
};
