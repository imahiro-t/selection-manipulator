import {
  workspace,
  window,
  TextEditor,
  TextDocument,
  ViewColumn
} from 'vscode';

export const countUpListHandler: (textEditor: TextEditor) => void = (textEditor) => {
  let selectedText = textEditor.document.getText(textEditor.selection);
  if (!selectedText) {
    return;
  }
  const ranges = selectedText.split('-');
  let from;
  let to;
  if (ranges.length === 2) {
    from = Number(ranges[0].trim());
    to = Number(ranges[1].trim());
  } else {
    from = 1;
    to = Number(ranges[0].trim());
  }
  const array = [];
  for (let i = from; i <= to; i++) {
    array.push(i.toString());
  }
  const content = array.join('\n');
  workspace.openTextDocument({
    content: content,
    language: "text"
  }).then((doc: TextDocument) => {
    window.showTextDocument(doc, ViewColumn.Beside, true);
  });
};
