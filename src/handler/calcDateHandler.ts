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
      .map(selection => textEditor.document.getText(selection))
      .join("\n")
      .split("\n")
      .map(selectedText => selectedText.trim())
      .filter(selectedText => selectedText.length > 0)
      .map(expression => [expression.trim(), calc(expression)]);
  openTextDocumentWithTitles(zip);
};

const calc: (expression: string) => string = (expression) => {
  if (expression.toLowerCase().startsWith('now')) {
    try {
      const date = new Date(Number((0, eval)(`${(new Date()).getTime()}${expression.substring(3)}`)));
      return `${date.getTime()}\n${date.toISOString()}`;
    } catch (_e) {
      return '';
    }
  }
  try {
    let timestamp = Number((0, eval)(expression));
    if (timestamp <= 30000000000) {
      timestamp = timestamp * 1000;
    }
    const date = new Date(timestamp);
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
