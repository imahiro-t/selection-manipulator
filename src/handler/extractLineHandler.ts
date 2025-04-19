import {
  TextEditor,
} from 'vscode';
import * as vscode from 'vscode';
import { openTextDocument } from '../common';

export const extractLineHandler: (isClipboard: boolean) => (textEditor: TextEditor) => void = (isClipboard) => (textEditor) => {
  if (textEditor.selections.length === 0) {
    return;
  }
  const content =
    textEditor.selections
      .map(selection => textEditor.document.lineAt(selection.start).text)
      .join("\n");
  if (isClipboard) {
    vscode.env.clipboard.writeText(content);
  } else {
    openTextDocument(content);
  }
};
