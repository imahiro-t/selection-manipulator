import {
  TextEditor,
  workspace,
  window
} from 'vscode';

export const formatJsonHandler: (indent: number) => (textEditor: TextEditor) => void = (indent) => (textEditor) => {
  let selectedText = textEditor.document.getText(textEditor.selection);
  if (!selectedText) {
    return;
  }
  const content = JSON.stringify(JSON.parse(selectedText), null, indent);
  workspace.openTextDocument({
    content: content,
    language: "text"
  }).then(doc => {
    window.showTextDocument(doc);
  });
};
