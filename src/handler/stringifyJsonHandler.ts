import {
  workspace,
  window,
  TextEditor,
  TextDocument,
  ViewColumn
} from 'vscode';

export const stringifyJsonHandler: (textEditor: TextEditor) => void = (textEditor) => {
  let selectedText = textEditor.document.getText(textEditor.selection);
  if (!selectedText) {
    return;
  }
  const content = JSON.stringify(selectedText.trim());
  workspace.openTextDocument({
    content: content,
    language: "text"
  }).then((doc: TextDocument) => {
    window.showTextDocument(doc, ViewColumn.Beside, true);
  });
};
