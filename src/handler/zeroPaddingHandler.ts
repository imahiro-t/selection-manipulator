import {
  window,
  TextEditor
} from 'vscode';

const DEFAULT_DIGIT = 8;

export const zeroPaddingHandler: (textEditor: TextEditor) => void = async (textEditor) => {
  if (textEditor.selections.length === 0) {
    return;
  }
  const selectedText = textEditor.selections
    .map(selection => textEditor.document.getText(selection))
    .join("\n");
  let digit = Number(await window.showInputBox({
    prompt: 'Number of Digits',
    placeHolder: `Default: ${DEFAULT_DIGIT}`,
    ignoreFocusOut: true,
  }));
  digit = digit > 0 ? digit : DEFAULT_DIGIT;
  textEditor.edit((editBuilder) => {
    textEditor.selections
      .forEach((selection) => {
        const text = textEditor.document.getText(selection);
        editBuilder.replace(selection, zeroPadding(digit)(text));
      });
  });
};

const zeroPadding: (digit: number) => (value: string) => string = (digit) => (value) => {
  return /^\d+$/.test(value) ? (Array(digit).join('0') + Number(value)).slice(-digit) : value;
};
