import {
  TextEditor,
  Selection,
  Position,
} from 'vscode';

export const multiSelectionHandler: (textEditor: TextEditor) => void = (textEditor) => {
  const selectedText = textEditor.document.getText(textEditor.selection);
  if (!selectedText) {
    return;
  }
  const start = textEditor.selection.start;
  const array = selectedText.trimEnd().split("\n");
  const selections: Array<Selection> = [];
  array.forEach((value, index) => {
    const startCharacter = index === 0 ? start.character : 0;
    const endCharacter = index === 0 ? start.character + value.length : value.length;
    const line = start.line + index;
    selections.push(new Selection(new Position(line, startCharacter), new Position(line, endCharacter)));
  });
  textEditor.selections = selections;
};
