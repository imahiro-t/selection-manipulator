import { TextEditor } from 'vscode';

export const maskHandler: (textEditor: TextEditor) => Thenable<boolean> | void = (textEditor) => {
  if (textEditor.selections.length === 0) {
    return;
  }

  return textEditor.edit((editBuilder) => {
    textEditor.selections.forEach((selection) => {
      const text = textEditor.document.getText(selection);
      const maskedText = '*'.repeat(text.length);
      editBuilder.replace(selection, maskedText);
    });
  });
};
