import {
  TextEditor,
  Selection,
} from 'vscode';

type Target = 'above' | 'below';

export const removeCursorHandler: (target: Target) => (textEditor: TextEditor) => void = (target) => (textEditor) => {
  if (textEditor.selections.length <= 1) {
    return;
  }
  const sortedSelections = [...textEditor.selections].sort((a: Selection, b: Selection) => a.start.line - b.start.line);
  const removeIndex = target === 'above' ? 0 : textEditor.selections.length - 1;
  const selections: Array<Selection> = [];
  sortedSelections.forEach((selection, index) => {
    if (index === removeIndex) {
      return;
    }
    selections.push(selection);
  });
  textEditor.selections = selections;
};
