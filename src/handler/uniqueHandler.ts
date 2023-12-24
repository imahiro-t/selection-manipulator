import {
  TextEditor,
} from 'vscode';
import { openTextDocument } from '../common';

export const uniqueHandler: (textEditor: TextEditor) => void = (textEditor) => {
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
  openTextDocument(content);
};

const unique: (array: Array<string>) => Array<string> = (array) => {
  return Array.from(new Set(array));
};
