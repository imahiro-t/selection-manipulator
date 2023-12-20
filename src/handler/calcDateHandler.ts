import {
  workspace,
  window,
  TextEditor,
  TextDocument,
  ViewColumn
} from 'vscode';

export const calcDateHandler: (textEditor: TextEditor) => void = (textEditor) => {
  if (textEditor.selections.length === 0) {
    return;
  }
  const content =
    textEditor.selections
      .map(selection => textEditor.document.getText(selection))
      .join("\n")
      .split("\n")
      .filter(x => x.trim() !== '')
      .map(expression => `${expression.trim()} = ${calc(expression)}`)
      .join("\n");
  workspace.openTextDocument({
    content: content,
    language: "text"
  }).then((doc: TextDocument) => {
    window.showTextDocument(doc, ViewColumn.Beside, true);
  });
};

const calc: (expression: string) => string = (expression) => {
  if (expression.toLowerCase() === 'now') {
    const date = new Date();
    return `${date.getTime()} = ${date.toISOString()}`;
  }
  try {
    return new Date(Number(expression)).toISOString();
  } catch (_e) {
    try {
      return new Date(expression).getTime().toString();
    } catch (_e) {
      return '';
    }
  }
};
