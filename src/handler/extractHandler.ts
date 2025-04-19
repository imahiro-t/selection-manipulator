import {
  TextEditor,
} from 'vscode';
import * as vscode from 'vscode';
import { openTextDocument } from '../common';

export const extractHandler: (includeBlankRows: boolean, isClipboard: boolean) => (textEditor: TextEditor) => void = (includeBlankRows, isClipboard) => async (textEditor) => {
  if (textEditor.selections.length === 0) {
    return;
  }
  const content = includeBlankRows ?
    textEditor.selections
      .map(selection => textEditor.document.getText(selection))
      .join("\n") :

    textEditor.selections
      .map(selection => textEditor.document.getText(selection))
      .join("\n")
      .split("\n")
      .filter(x => x.trim() !== '')
      .join("\n")
    ;
  if (isClipboard) {
    vscode.env.clipboard.writeText(content);
  } else {
    openTextDocument(content);
  }
};
