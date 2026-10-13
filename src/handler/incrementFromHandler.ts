import {
  TextEditor,
  window,
} from 'vscode';
import { applyEdit, ensureEditorAfterInput } from '../editGuard';

export const incrementFromHandler: (incrementFrom: number) => (textEditor: TextEditor) => Promise<boolean> | undefined = (incrementFrom) => (textEditor) => {
  if (textEditor.selections.length === 0) {
    return;
  }
  return applyEdit(textEditor, (editBuilder) => {
    textEditor.selections
      .forEach((selection, index) => {
        editBuilder.replace(selection, (incrementFrom + index).toString());
      });
  });
};

export const incrementFromInputHandler: (textEditor: TextEditor) => void = async (textEditor) => {
  if (textEditor.selections.length === 0) {
    return;
  }
  let incrementFrom = Number(await window.showInputBox({
    prompt: 'Increment From',
    ignoreFocusOut: true,
  }));
  if (!ensureEditorAfterInput(textEditor)) {
    return;
  }
  await incrementFromHandler(incrementFrom)(textEditor);
};
