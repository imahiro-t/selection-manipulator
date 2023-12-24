import {
  TextEditor,
} from 'vscode';
import { openTextDocument } from '../common';

type compareType = 'number' | 'string';

export const sortHandler: (compareType: compareType, isAscending: boolean) => (textEditor: TextEditor) => void = (compareType, isAscending) => (textEditor) => {
  if (textEditor.selections.length === 0) {
    return;
  }
  const content =
    sort(
      textEditor.selections
        .map(selection => textEditor.document.getText(selection))
        .join("\n")
        .split("\n")
        .filter(x => x.trim() !== ''),
      compareType,
      isAscending
    )
      .join("\n");
  openTextDocument(content);
};

const sort: (array: Array<string>, compareType: compareType, isAscending: boolean) => Array<string> = (array, compareType, isAscending) => {
  const sorted = compareType === 'number' ? array.sort((a: string, b: string) => Number(a) - Number(b)) : array.sort();
  return isAscending ? sorted : sorted.reverse();
};
