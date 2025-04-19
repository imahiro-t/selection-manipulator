import {
  TextEditor,
} from 'vscode';
import * as vscode from 'vscode';
import { openTextDocument } from '../common';

export const reverseHandler: (isClipboard: boolean) => (textEditor: TextEditor) => void = (isClipboard) => (textEditor) => {
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
  const content = array.reverse().join("\n");
  if (isClipboard) {
    vscode.env.clipboard.writeText(content);
  } else {
    openTextDocument(content);
  }
};
