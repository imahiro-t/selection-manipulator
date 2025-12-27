import {
  TextEditor,
} from 'vscode';
import { openTextDocumentWithTitles } from '../common';

export const calcDateHandler: (textEditor: TextEditor) => Thenable<void> = (textEditor) => {
  if (textEditor.selections.length === 0) {
    return Promise.resolve();
  }
  const zip =
    textEditor.selections
      .map(selection => textEditor.document.getText(selection))
      .join("\n")
      .split("\n")
      .map(selectedText => selectedText.trim())
      .filter(selectedText => selectedText.length > 0)
      .map(expression => [expression.trim(), calc(expression)]);
  return openTextDocumentWithTitles(zip).then(() => { });
};

const calc: (expression: string) => string = (expression) => {
  if (expression.toLowerCase().startsWith('now')) {
    try {
      const date = new Date(Number((0, eval)(`${(new Date()).getTime()}${expression.substring(3)}`)));
      const dateStrInMilliseconds = String(date.getTime());
      const dateStrInSeconds = String(date.getTime()).slice(0, -3);
      return `${dateStrInMilliseconds}\n${dateStrInSeconds}\n${date.toISOString()}`;
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
    const dateStrInMilliseconds = String(date.getTime());
    const dateStrInSeconds = String(date.getTime()).slice(0, -3);
    return `${dateStrInMilliseconds}\n${dateStrInSeconds}\n${date.toISOString()}`;
  } catch (_e) {
    try {
      const date = new Date(expression);
      const dateStrInMilliseconds = String(date.getTime());
      const dateStrInSeconds = String(date.getTime()).slice(0, -3);
      return `${dateStrInMilliseconds}\n${dateStrInSeconds}\n${date.toISOString()}`;
    } catch (_e) {
      return '';
    }
  }
};
