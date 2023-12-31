import {
  TextEditor,
} from 'vscode';
import { openTextDocument } from '../common';

type SortType = 'count' | 'word';

export const countOccurrencesHandler: (sortType: SortType) => (textEditor: TextEditor) => void = (sortType) => (textEditor) => {
  if (textEditor.selections.length === 0) {
    return;
  }
  const occurrences =
    countOccurrences(
      textEditor.selections
        .map(selection => textEditor.document.getText(selection))
        .join("\n")
        .split("\n")
        .filter(x => x.trim() !== ''),
      sortType
    );
  const content = occurrences.map(occurrence => sortType === 'count' ? `${occurrence[1]}\t${occurrence[0]}` : `${occurrence[0]}\t${occurrence[1]}`)
    .join("\n");
  openTextDocument(content);
};

const countOccurrences: (array: Array<string>, sortType: SortType) => Array<Array<string>> = (array, sortType) => {
  const countObject: any = {};
  for (var i = 0; i < array.length; i++) {
    const selected = array[i];
    countObject[selected] = (countObject[selected] || 0) + 1;
  }
  const sorted = [];
  for (const selected in countObject) {
    sorted.push([selected, countObject[selected]]);
  }
  const sortIndex = sortType === 'count' ? 1 : 0;
  sorted.sort((a, b) => {
    if (a[sortIndex] > b[sortIndex]) {
      return 1;
    } else if (a[sortIndex] < b[sortIndex]) {
      return -1;
    } else {
      return 0;
    }
  });
  return sorted;
};
