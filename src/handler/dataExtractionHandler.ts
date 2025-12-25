import {
  TextEditor,
} from 'vscode';
import * as vscode from 'vscode';
import { openTextDocument } from '../common';

type ExtractionType = 'email' | 'url' | 'ip';

export const dataExtractionHandler: (type: ExtractionType, replace: boolean) => (textEditor: TextEditor) => Thenable<boolean | void> = (type, replace) => (textEditor) => {
  if (textEditor.selections.length === 0) {
    return Promise.resolve();
  }

  const getMatches = (text: string, regex: RegExp) => {
    const matches = text.match(regex);
    return matches ? matches.join('\n') : '';
  };

  const regexMap: Record<ExtractionType, RegExp> = {
    email: /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g,
    url: /https?:\/\/[^\s$.?#].[^\s]*/g,
    ip: /\b(?:\d{1,3}\.){3}\d{1,3}\b/g
  };

  const regex = regexMap[type];

  if (replace) {
    return textEditor.edit(editBuilder => {
      textEditor.selections.forEach(selection => {
        const text = textEditor.document.getText(selection);
        editBuilder.replace(selection, getMatches(text, regex));
      });
    });
  } else {
    const results = textEditor.selections
      .map(selection => textEditor.document.getText(selection))
      .map(text => getMatches(text, regex))
      .filter(result => result.length > 0)
      .join('\n\n');

    if (results.length > 0) {
      return openTextDocument(results).then(() => { });
    }
    return Promise.resolve();
  }
};
