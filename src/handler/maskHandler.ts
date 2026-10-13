import { TextEditor } from 'vscode';
import { applyEdit } from '../editGuard';

export const maskHandler: (textEditor: TextEditor) => Thenable<boolean> | void = (textEditor) => {
  if (textEditor.selections.length === 0) {
    return;
  }

  return applyEdit(textEditor, (editBuilder) => {
    textEditor.selections.forEach((selection) => {
      const text = textEditor.document.getText(selection);
      const maskedText = '*'.repeat(text.length);
      editBuilder.replace(selection, maskedText);
    });
  });
};
