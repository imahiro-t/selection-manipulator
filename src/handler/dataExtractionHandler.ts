import {
  TextEditor,
} from 'vscode';
import * as vscode from 'vscode';
import { openTextDocument } from '../common';
import { findEmails } from './msel2Transforms';

type ExtractionType = 'email' | 'url' | 'ip';

export const dataExtractionHandler: (type: ExtractionType, replace: boolean) => (textEditor: TextEditor) => Thenable<boolean | void> = (type, replace) => (textEditor) => {
  if (textEditor.selections.length === 0) {
    return Promise.resolve();
  }

  // The e-mail addresses are found by the linear-time scanner of Select All Email Addresses: it
  // gives the matches of `/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g`, which takes
  // quadratic time on long runs of address characters without `@`.
  const regexMap: Record<Exclude<ExtractionType, 'email'>, RegExp> = {
    url: /https?:\/\/[^\s$.?#].[^\s]*/g,
    ip: /\b(?:\d{1,3}\.){3}\d{1,3}\b/g
  };

  const getMatches = (text: string): string => {
    const matches = type === 'email'
      ? findEmails(text).map(([start, end]) => text.slice(start, end))
      : text.match(regexMap[type]);
    return matches ? matches.join('\n') : '';
  };

  if (replace) {
    return textEditor.edit(editBuilder => {
      textEditor.selections.forEach(selection => {
        const text = textEditor.document.getText(selection);
        editBuilder.replace(selection, getMatches(text));
      });
    });
  } else {
    const results = textEditor.selections
      .map(selection => textEditor.document.getText(selection))
      .map(text => getMatches(text))
      .filter(result => result.length > 0)
      .join('\n\n');

    if (results.length > 0) {
      return openTextDocument(results).then(() => { });
    }
    return Promise.resolve();
  }
};
