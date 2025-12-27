import {
  TextEditor,
} from 'vscode';

export const quoteHandler: (type: 'single' | 'double' | 'backtick') => (textEditor: TextEditor) => Thenable<boolean> | void = (type) => (textEditor) => {
  if (textEditor.selections.length === 0) {
    return;
  }

  const quoteChar = type === 'single' ? "'" : type === 'double' ? '"' : '`';

  return textEditor.edit((editBuilder) => {
    textEditor.selections.forEach((selection) => {
      const text = textEditor.document.getText(selection);
      editBuilder.replace(selection, `${quoteChar}${text}${quoteChar}`);
    });
  });
};
