import {
  TextEditor,
  workspace,
  window
} from 'vscode';

export const parseJsonHandler: (textEditor: TextEditor) => void = (textEditor) => {
  let selectedText = textEditor.document.getText(textEditor.selection);
  if (!selectedText) {
    return;
  }
  const content = JSON.parse(selectedText);
  workspace.openTextDocument({
    content: content,
    language: "text"
  }).then(doc => {
    window.showTextDocument(doc);
  });
};
