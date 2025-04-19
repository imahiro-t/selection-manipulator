import {
  TextEditor,
} from 'vscode';
import * as vscode from 'vscode';
import { openTextDocument } from '../common';

export const shuffleHandler: (isClipboard: boolean) => (textEditor: TextEditor) => void = (isClipboard) => (textEditor) => {
  if (textEditor.selections.length === 0) {
    return;
  }
  const array = textEditor.selections
    .map(selection => textEditor.document.getText(selection))
    .join("\n")
    .split("\n");
  if (array[array.length - 1] === '') {
    array.pop();
  }
  shuffleArray(array);
  const content = array.join("\n");
  if (isClipboard) {
    vscode.env.clipboard.writeText(content);
  } else {
    openTextDocument(content);
  }
};

const shuffleArray: (array: Array<any>) => void = array => {
  for (let i = array.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [array[i], array[j]] = [array[j], array[i]];
  }
};
