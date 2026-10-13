import {
  TextEditor,
  window,
} from 'vscode';
import { applyEdit, ensureEditorAfterInput } from '../editGuard';

// Returns the edit (or `undefined` when there is nothing to edit) so that a caller, such as a test,
// can await it; `registerTextEditorCommand` ignores the return value.
export const incrementByHandler: (incrementBy: number) => (textEditor: TextEditor) => Promise<boolean> | undefined = (incrementBy) => (textEditor) => {
  if (textEditor.selections.length === 0) {
    return undefined;
  }
  return applyEdit(textEditor, (editBuilder) => {
    textEditor.selections
      .forEach(selection => {
        const text = textEditor.document.getText(selection);
        editBuilder.replace(selection, increment(incrementBy)(text));
      });
  });
};

export const incrementByInputHandler: (textEditor: TextEditor) => void = async (textEditor) => {
  if (textEditor.selections.length === 0) {
    return;
  }
  let incrementBy = Number(await window.showInputBox({
    prompt: 'Increment by',
    placeHolder: `Default: 1`,
    ignoreFocusOut: true,
  }));
  if (!ensureEditorAfterInput(textEditor)) {
    return;
  }
  incrementBy = incrementBy > 0 ? incrementBy : 1;
  await incrementByHandler(incrementBy)(textEditor);
};

const increment: (num: number) => (value: string) => string = (num) => (value) => {
  return isNaN(Number(value)) ? value : (Number(value) + num).toString();
};
