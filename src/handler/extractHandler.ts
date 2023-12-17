import {
  TextEditor,
  workspace,
  window
} from 'vscode';

export const extractHandler: (textEditor: TextEditor) => void = (textEditor) => {
  if (textEditor.selections.length === 0) {
    return;
  }
  const content =
    textEditor.selections
      .map(selection => textEditor.document.getText(selection))
      .join("\n");
  workspace.openTextDocument({
    content: content,
    language: "text"
  }).then(doc => {
    window.showTextDocument(doc);
  });
};
