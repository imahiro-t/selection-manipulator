import {
  TextEditor,
} from 'vscode';
import * as vscode from 'vscode';
import { openTextDocument } from '../common';

export const uniqueHandler: (isClipboard: boolean) => (textEditor: TextEditor) => void = (isClipboard) => (textEditor) => {
  if (textEditor.selections.length === 0) {
    return;
  }
  const content =
    unique(
      textEditor.selections
        .map(selection => textEditor.document.getText(selection))
        .join("\n")
        .split("\n")
        .filter(x => x.trim() !== '')
    )
      .join("\n");
  if (isClipboard) {
    vscode.env.clipboard.writeText(content);
  } else {
    openTextDocument(content);
  }
};

const unique: (array: Array<string>) => Array<string> = (array) => {
  return Array.from(new Set(array));
};
