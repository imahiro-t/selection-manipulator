import {
  TextEditor,
} from 'vscode';
import { openTextDocument } from '../common';

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
      .map(expression => `${expression.trim()}: ${calc(expression)}`)
      .join("\n");
  openTextDocument(content);
};

const calc: (expression: string) => string = (expression) => {
  if (expression.toLowerCase().startsWith('now')) {
    try {
      const date = new Date(Number(eval(`${(new Date()).getTime()}${expression.substring(3)}`)));
      return `${date.getTime()} = ${date.toISOString()}`;
    } catch (_e) {
      return '';
    }
  }
  try {
    const date = new Date(Number(eval(expression)));
    return `${date.getTime()} = ${date.toISOString()}`;
  } catch (_e) {
    try {
      const date = new Date(expression);
      return `${date.getTime()} = ${date.toISOString()}`;
    } catch (_e) {
      return '';
    }
  }
};
