import {
  TextEditor,
} from 'vscode';
import { openTextDocumentWithTitles } from '../common';

export const calcDateHandler: (textEditor: TextEditor) => void = (textEditor) => {
  if (textEditor.selections.length === 0) {
    return;
  }
  const zip =
    textEditor.selections
      .map(selection => textEditor.document.getText(selection).trim())
      .join("\n")
      .split("\n")
      .filter(x => x !== '')
      .map(expression => [expression.trim(), calc(expression)]);
  openTextDocumentWithTitles(zip);
};

const calc: (expression: string) => string = (expression) => {
  if (expression.toLowerCase().startsWith('now')) {
    try {
      const date = new Date(Number(eval(`${(new Date()).getTime()}${expression.substring(3)}`)));
      return `${date.getTime()}\n${date.toISOString()}`;
    } catch (_e) {
      return '';
    }
  }
  try {
    const date = new Date(Number(eval(expression)));
    return `${date.getTime()}\n${date.toISOString()}`;
  } catch (_e) {
    try {
      const date = new Date(expression);
      return `${date.getTime()}\n${date.toISOString()}`;
    } catch (_e) {
      return '';
    }
  }
};
