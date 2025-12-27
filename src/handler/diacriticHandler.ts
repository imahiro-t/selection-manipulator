import {
  TextEditor,
} from 'vscode';

export const diacriticHandler = (textEditor: TextEditor) => {
  if (textEditor.selections.length === 0) {
    return;
  }
  textEditor.edit((editBuilder) => {
    textEditor.selections
      .forEach(selection => {
        const text = textEditor.document.getText(selection);
        editBuilder.replace(selection, removeAccents(text));
      });
  });
};

function removeAccents(str: string): string {
  return str.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}
