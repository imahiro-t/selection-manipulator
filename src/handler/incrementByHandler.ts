import {
  TextEditor,
  window,
} from 'vscode';

// Returns the edit (or `undefined` when there is nothing to edit) so that a caller, such as a test,
// can await it; `registerTextEditorCommand` ignores the return value.
export const incrementByHandler: (incrementBy: number) => (textEditor: TextEditor) => Thenable<boolean> | undefined = (incrementBy) => (textEditor) => {
  if (textEditor.selections.length === 0) {
    return undefined;
  }
  return textEditor.edit((editBuilder) => {
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
  incrementBy = incrementBy > 0 ? incrementBy : 1;
  incrementByHandler(incrementBy)(textEditor);
};

const increment: (num: number) => (value: string) => string = (num) => (value) => {
  return isNaN(Number(value)) ? value : (Number(value) + num).toString();
};
