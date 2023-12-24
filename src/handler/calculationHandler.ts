import {
  TextEditor,
} from 'vscode';
import { openTextDocument } from '../common';

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
  openTextDocument(content);
};

const calc: (expression: string) => string = (expression) => {
  try {
    return eval(expression);
  } catch (_e) {
    return 'NaN';
  }
};
