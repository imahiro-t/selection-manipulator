import {
  TextEditor,
} from 'vscode';
import { openTextDocument } from '../common';

export const extractLineHandler: (textEditor: TextEditor) => void = (textEditor) => {
  if (textEditor.selections.length === 0) {
    return;
  }
  const content =
    textEditor.selections
      .map(selection => textEditor.document.lineAt(selection.start).text)
      .join("\n");
  openTextDocument(content);
};
