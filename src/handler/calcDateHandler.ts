import {
  TextEditor,
} from 'vscode';
import { openTextDocumentWithTitles } from '../common';
import { parseDate } from './dateUtils';

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
  const date = parseDate(expression);
  if (!date) {
    return '';
  }
  const dateStrInMilliseconds = String(date.getTime());
  const dateStrInSeconds = String(Math.floor(date.getTime() / 1000));
  return `${dateStrInMilliseconds}\n${dateStrInSeconds}\n${date.toISOString()}`;
};
