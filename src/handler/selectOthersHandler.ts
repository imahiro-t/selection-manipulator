import {
  TextEditor,
  Selection,
} from 'vscode';

export const selectOthersHandler: (matchCase: boolean, matchWord: boolean) => (textEditor: TextEditor) => void = (matchCase, matchWord) => (textEditor) => {
  let selectedText = textEditor.document.getText(textEditor.selection);
  if (!selectedText) {
    return;
  }
  let allText = textEditor.document.getText();
  selectedText = matchCase ? selectedText : selectedText.toLowerCase();
  allText = matchCase ? allText : allText.toLowerCase();
  let index = allText.indexOf(selectedText);
  const selections = [textEditor.selection];
  while (index !== -1) {
    const startPosition = textEditor.document.positionAt(index);
    const endPosition = textEditor.document.positionAt(index + selectedText.length);
    const word = textEditor.document.getText(textEditor.document.getWordRangeAtPosition(startPosition));
    if (!matchWord || selectedText === (matchCase ? word : word.toLowerCase())) {
      selections.push(new Selection(startPosition, endPosition));
    }
    index = allText.indexOf(selectedText, index + selectedText.length);
  }
  textEditor.selections = selections;
};
