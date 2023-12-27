import {
  TextEditor,
  window,
} from 'vscode';

export const decrementToHandler: (decrementTo: number) => (textEditor: TextEditor) => void = (decrementTo) => (textEditor) => {
  if (textEditor.selections.length === 0) {
    return;
  }
  textEditor.edit((editBuilder) => {
    const start = textEditor.selections.length + decrementTo - 1;
    textEditor.selections
      .forEach((selection, index) => {
        editBuilder.replace(selection, (start - index).toString());
      });
  });
};

export const decrementToInputHandler: (textEditor: TextEditor) => void = async (textEditor) => {
  if (textEditor.selections.length === 0) {
    return;
  }
  let decrementTo = Number(await window.showInputBox({
    prompt: 'Decrement To',
    ignoreFocusOut: true,
  }));
  decrementToHandler(decrementTo)(textEditor);
};
