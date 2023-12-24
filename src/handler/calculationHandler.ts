import {
  TextEditor,
} from 'vscode';
import { openTextDocumentWithTitles } from '../common';

export const calculationHandler: (textEditor: TextEditor) => void = (textEditor) => {
  if (textEditor.selections.length === 0) {
    return;
  }
  const zip =
    textEditor.selections
      .map(selection => textEditor.document.getText(selection).trim())
      .join("\n")
      .split("\n")
      .filter(x => x !== '')
      .map(expression => [expression, calc(expression)]);
  openTextDocumentWithTitles(zip);
};

const calc: (expression: string) => string = (expression) => {
  try {
    return eval(expression).toString();
  } catch (_e) {
    return 'NaN';
  }
};
