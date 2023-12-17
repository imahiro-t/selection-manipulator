import {
  TextEditor,
  workspace,
  window
} from 'vscode';

export const reverseHandler: (textEditor: TextEditor) => void = (textEditor) => {
  if (textEditor.selections.length === 0) {
    return;
  }
  const array = textEditor.selections
    .map(selection => textEditor.document.getText(selection))
    .join("\n")
    .split("\n");
  if (array[array.length - 1] === '') {
    array.pop();
  }
  const content = array.reverse().join("\n");
  workspace.openTextDocument({
    content: content,
    language: "text"
  }).then(doc => {
    window.showTextDocument(doc);
  });
};
