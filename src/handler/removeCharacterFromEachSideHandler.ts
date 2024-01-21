import {
  TextEditor,
  Selection,
  Position,
} from 'vscode';

export const removeCharacterFromEachSideHandler: (textEditor: TextEditor) => void = (textEditor) => {
  const selections: Array<Selection> = [];
  const selectedTexts: Array<string> = [];
  textEditor.selections.forEach((selection) => {
    const text = textEditor.document.getText(selection);
    selectedTexts.push(text);
    const lineText = textEditor.document.lineAt(selection.end.line).text;
    const startPos = new Position(selection.start.line, selection.start.character === 0 ? 0 : selection.start.character - 1);
    const endPos = new Position(selection.end.line, selection.end.character === lineText.length ? selection.end.character : selection.end.character + 1);
    selections.push(new Selection(startPos, endPos));
  });
  textEditor.selections = selections;
  textEditor.edit((editBuilder) => {
    textEditor.selections
      .forEach((selection, index) => {
        editBuilder.replace(selection, selectedTexts[index]);
      });
  });
};
