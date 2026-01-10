import {
  TextEditor,
  Selection,
  Position,
  window,
} from 'vscode';

export const multiSelectionHandler: (type?: 'all' | 'interval') => (textEditor: TextEditor) => Promise<void> = (type = 'all') => async (textEditor) => {
  const selectedText = textEditor.document.getText(textEditor.selection);
  if (!selectedText) {
    return;
  }

  let interval = 1;
  if (type === 'interval') {
    const input = await window.showInputBox({
      placeHolder: 'Enter interval (n)',
      prompt: 'Select every n-th line from the selection',
      validateInput: (value) => {
        return /^[1-9]\d*$/.test(value) ? null : 'Please enter a positive integer';
      }
    });
    if (!input) {
      return;
    }
    interval = parseInt(input, 10);
  }

  const start = textEditor.selection.start;
  const array = selectedText.trimEnd().split("\n");
  const selections: Array<Selection> = [];
  array.forEach((value, index) => {
    if (index % interval !== 0) {
      return;
    }
    const startCharacter = index === 0 ? start.character : 0;
    const endCharacter = index === 0 ? start.character + value.length : value.length;
    const line = start.line + index;
    selections.push(new Selection(new Position(line, startCharacter), new Position(line, endCharacter)));
  });
  textEditor.selections = selections;
};
