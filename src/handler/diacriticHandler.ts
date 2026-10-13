import {
  TextEditor,
} from 'vscode';
import { applyEdit } from '../editGuard';

export const diacriticHandler = (textEditor: TextEditor) => {
  if (textEditor.selections.length === 0) {
    return;
  }
  return applyEdit(textEditor, (editBuilder) => {
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
