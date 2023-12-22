import {
  TextEditor,
  window,
} from 'vscode';

export const incrementFromHandler: (incrementFrom: number) => (textEditor: TextEditor) => void = (incrementFrom) => async (textEditor) => {
  if (textEditor.selections.length === 0) {
    return;
  }
  textEditor.edit((editBuilder) => {
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
  incrementFromHandler(incrementFrom)(textEditor);
};
