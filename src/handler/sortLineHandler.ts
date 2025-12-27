import {
  TextEditor, TextLine,
} from 'vscode';
import * as vscode from 'vscode';
import { openTextDocument } from '../common';

type CompareType = 'number' | 'string' | 'occurrence' | 'length';
// type CompareObject removed as we use strings now

export const sortLineHandler: (compareType: CompareType, isAscending: boolean, isClipboard: boolean) => (textEditor: TextEditor) => Thenable<void> = (compareType, isAscending, isClipboard) => (textEditor) => {
  if (textEditor.selections.length === 0) {
    return Promise.resolve();
  }
  const lines = textEditor.selections
    .flatMap(selection => textEditor.document.getText(selection).split(/\r?\n/));

  const content =
    compareType === 'occurrence' ? sortByOccurrence(lines, isAscending).join("\n") : sort(
      lines,
      compareType,
      isAscending
    )
      .join("\n");
  if (isClipboard) {
    return vscode.env.clipboard.writeText(content);
  } else {
    return openTextDocument(content).then(() => { });
  }
};

const sort: (array: Array<string>, compareType: CompareType, isAscending: boolean) => Array<string> = (array, compareType, isAscending) => {
  let sorted;
  if (compareType === 'number') {
    sorted = array.sort((a, b) => Number(a) - Number(b));
  } else if (compareType === 'length') {
    sorted = array.sort((a, b) => a.length - b.length);
  } else {
    sorted = array.sort((a, b) => a.localeCompare(b));
  }
  return isAscending ? sorted : sorted.reverse();
};

const sortByOccurrence: (array: Array<string>, isAscending: boolean) => Array<string> = (array, isAscending) => {
  const countObject: any = {};
  for (var i = 0; i < array.length; i++) {
    const selected = array[i];
    countObject[selected] = (countObject[selected] || 0) + 1;
  }
  const sorted = [];
  for (const selected in countObject) {
    sorted.push([selected, countObject[selected]]);
  }
  const sortIndex = 1;
  sorted.sort((a, b) => {
    if (a[sortIndex] > b[sortIndex]) {
      return 1;
    } else if (a[sortIndex] < b[sortIndex]) {
      return -1;
    } else {
      return 0;
    }
  });
  const sortedByOccurrence: Array<string> = [];
  sorted.forEach(ss => {
    const key = ss[0];
    const count = ss[1];
    for (let j = 0; j < count; j++) {
      sortedByOccurrence.push(key);
    }
  });
  return isAscending ? sortedByOccurrence : sortedByOccurrence.reverse();
};
