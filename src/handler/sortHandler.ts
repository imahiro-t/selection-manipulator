import {
  TextEditor,
} from 'vscode';
import * as vscode from 'vscode';
import { openTextDocument } from '../common';

type CompareType = 'number' | 'string';

export const sortHandler: (compareType: CompareType, isAscending: boolean, isClipboard: boolean) => (textEditor: TextEditor) => Thenable<void> = (compareType, isAscending, isClipboard) => (textEditor) => {
  if (textEditor.selections.length === 0) {
    return Promise.resolve();
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
  if (isClipboard) {
    return vscode.env.clipboard.writeText(content);
  } else {
    return openTextDocument(content).then(() => { });
  }
};

const sort: (array: Array<string>, compareType: CompareType, isAscending: boolean) => Array<string> = (array, compareType, isAscending) => {
  const sorted = compareType === 'number' ? array.sort((a: string, b: string) => Number(a) - Number(b)) : array.sort();
  return isAscending ? sorted : sorted.reverse();
};
