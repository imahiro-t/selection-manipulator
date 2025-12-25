import {
  TextEditor, TextLine,
} from 'vscode';
import * as vscode from 'vscode';
import { openTextDocument } from '../common';

type CompareType = 'number' | 'string' | 'occurrence';
type CompareObject = {
  text: string,
  line: TextLine
};

export const sortLineHandler: (compareType: CompareType, isAscending: boolean, isClipboard: boolean) => (textEditor: TextEditor) => Thenable<void> = (compareType, isAscending, isClipboard) => (textEditor) => {
  if (textEditor.selections.length === 0) {
    return Promise.resolve();
  }
  const selections = textEditor.selections
    .map(selection => ({
      text: textEditor.document.getText(selection),
      line: textEditor.document.lineAt(selection.start)
    }));
  const content =
    compareType === 'occurrence' ? sortByOccurrence(selections, isAscending).map(textLine => textLine.text).join("\n") : sort(
      selections,
      compareType,
      isAscending
    )
      .map(compareObject => compareObject.line.text)
      .join("\n");
  if (isClipboard) {
    return vscode.env.clipboard.writeText(content);
  } else {
    return openTextDocument(content).then(() => { });
  }
};

const sort: (array: Array<CompareObject>, compareType: CompareType, isAscending: boolean) => Array<CompareObject> = (array, compareType, isAscending) => {
  const sorted = compareType === 'number' ? array.sort((a: CompareObject, b: CompareObject) => Number(a.text) - Number(b.text)) : array.sort((a: CompareObject, b: CompareObject) => a.text.localeCompare(b.text));
  return isAscending ? sorted : sorted.reverse();
};

const sortByOccurrence: (array: Array<CompareObject>, isAscending: boolean) => Array<TextLine> = (array, isAscending) => {
  const countObject: any = {};
  const groupObject: any = {};
  for (var i = 0; i < array.length; i++) {
    const selected = array[i].text;
    countObject[selected] = (countObject[selected] || 0) + 1;
    if (!groupObject[selected]) {
      groupObject[selected] = [];
    }
    groupObject[selected].push(array[i].line);
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
  const sortedByOccurrence: Array<TextLine> = [];
  sorted.forEach(ss => {
    const lines = groupObject[ss[0]];
    lines.forEach((line: TextLine) => {
      sortedByOccurrence.push(line);
    });
  });
  return isAscending ? sortedByOccurrence : sortedByOccurrence.reverse();
};
