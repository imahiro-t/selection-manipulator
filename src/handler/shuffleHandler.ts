import {
  TextEditor,
} from 'vscode';
import * as vscode from 'vscode';
import { openTextDocument } from '../common';

export const shuffleHandler: (isClipboard: boolean) => (textEditor: TextEditor) => void = (isClipboard) => (textEditor) => {
  if (textEditor.selections.length === 0) {
    return;
  }
  const array = textEditor.selections
    .map(selection => textEditor.document.getText(selection))
    .join("\n")
    .split("\n");
  if (array[array.length - 1] === '') {
    array.pop();
  }
  shuffleArray(array);
  const content = array.join("\n");
  if (isClipboard) {
    vscode.env.clipboard.writeText(content);
  } else {
    openTextDocument(content);
  }
};

export const shuffleCharacterHandler: (mode: 'replace' | 'clipboard' | 'new-tab') => (textEditor: TextEditor) => Thenable<any> | void = (mode) => (textEditor) => {
  if (textEditor.selections.length === 0) {
    return;
  }

  if (mode === 'replace') {
    return textEditor.edit((editBuilder) => {
      textEditor.selections.forEach(selection => {
        const text = textEditor.document.getText(selection);
        editBuilder.replace(selection, shuffleString(text));
      });
    });
  } else {
    const results = textEditor.selections.map(selection => {
      const text = textEditor.document.getText(selection);
      return shuffleString(text);
    });
    const content = results.join('\n');

    if (mode === 'clipboard') {
      return vscode.env.clipboard.writeText(content);
    } else {
      return openTextDocument(content);
    }
  }
};

const shuffleString = (str: string) => {
  const arr = str.split('');
  shuffleArray(arr);
  return arr.join('');
};

const shuffleArray: (array: Array<any>) => void = array => {
  for (let i = array.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [array[i], array[j]] = [array[j], array[i]];
  }
};
