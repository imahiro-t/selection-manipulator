import {
  workspace,
  window,
  TextEditor,
  TextDocument,
  ViewColumn
} from 'vscode';

export const extractHandler: (includeBlankRows: boolean) => (textEditor: TextEditor) => void = (includeBlankRows) => (textEditor) => {
  if (textEditor.selections.length === 0) {
    return;
  }
  const content = includeBlankRows ?
    textEditor.selections
      .map(selection => textEditor.document.getText(selection))
      .join("\n") :

    textEditor.selections
      .map(selection => textEditor.document.getText(selection))
      .join("\n")
      .split("\n")
      .filter(x => x.trim() !== '')
      .join("\n")
    ;
  workspace.openTextDocument({
    content: content,
    language: "text"
  }).then((doc: TextDocument) => {
    window.showTextDocument(doc, ViewColumn.Beside, true);
  });
};
