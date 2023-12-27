import {
  TextEditor,
  window,
} from 'vscode';

export const incrementByHandler: (incrementBy: number) => (textEditor: TextEditor) => void = (incrementBy) => (textEditor) => {
  if (textEditor.selections.length === 0) {
    return;
  }
  textEditor.edit((editBuilder) => {
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
