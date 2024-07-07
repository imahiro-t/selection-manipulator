import {
  TextEditor, TextLine,
} from 'vscode';
import { openTextDocument } from '../common';

type CompareType = 'number' | 'string';
type CompareObject = {
  text: string,
  line: TextLine
};

export const sortLineHandler: (compareType: CompareType, isAscending: boolean) => (textEditor: TextEditor) => void = (compareType, isAscending) => (textEditor) => {
  if (textEditor.selections.length === 0) {
    return;
  }
  const content =
    sort(
      textEditor.selections
        .map(selection => ({
          text: textEditor.document.getText(selection),
          line: textEditor.document.lineAt(selection.start)
        })),
      compareType,
      isAscending
    )
      .map(compareObject => compareObject.line.text)
      .join("\n");
  openTextDocument(content);
};

const sort: (array: Array<CompareObject>, compareType: CompareType, isAscending: boolean) => Array<CompareObject> = (array, compareType, isAscending) => {
  const sorted = compareType === 'number' ? array.sort((a: CompareObject, b: CompareObject) => Number(a.text) - Number(b.text)) : array.sort((a: CompareObject, b: CompareObject) => a.text.localeCompare(b.text));
  return isAscending ? sorted : sorted.reverse();
};
