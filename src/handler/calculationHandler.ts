import {
  TextEditor,
  workspace,
  window
} from 'vscode';

export const calculationHandler: (textEditor: TextEditor) => void = (textEditor) => {
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
  }).then(doc => {
    window.showTextDocument(doc);
  });
};

const calc: (expression: string) => string = (expression) => {
  try {
    return eval(expression);
  } catch (_e) {
    return 'NaN';
  }
};
