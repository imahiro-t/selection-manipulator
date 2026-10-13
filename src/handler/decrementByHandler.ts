import {
  TextEditor,
  window,
} from 'vscode';
import { applyEdit, ensureEditorAfterInput } from '../editGuard';

export const decrementByHandler: (decrementBy: number) => (textEditor: TextEditor) => Promise<boolean> | undefined = (decrementBy) => (textEditor) => {
  if (textEditor.selections.length === 0) {
    return;
  }
  return applyEdit(textEditor, (editBuilder) => {
    textEditor.selections
      .forEach(selection => {
        const text = textEditor.document.getText(selection);
        editBuilder.replace(selection, decrement(decrementBy)(text));
      });
  });
};

export const decrementByInputHandler: (textEditor: TextEditor) => void = async (textEditor) => {
  if (textEditor.selections.length === 0) {
    return;
  }
  let decrementBy = Number(await window.showInputBox({
    prompt: 'Increment by',
    placeHolder: `Default: 1`,
    ignoreFocusOut: true,
  }));
  if (!ensureEditorAfterInput(textEditor)) {
    return;
  }
  decrementBy = decrementBy > 0 ? decrementBy : 1;
  await decrementByHandler(decrementBy)(textEditor);
};

const decrement: (num: number) => (value: string) => string = (num) => (value) => {
  return isNaN(Number(value)) ? value : (Number(value) - num).toString();
};
