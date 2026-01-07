
import {
  TextEditor,
} from 'vscode';
import * as vscode from 'vscode';
import * as diff from 'diff';
import { openTextDocument } from '../common';

export const diffHandler: (textEditor: TextEditor) => Thenable<void> | void = (textEditor) => {
  if (textEditor.selections.length < 2) {
    vscode.window.showErrorMessage('Please select more than 2 selections to diff.');
    return;
  }

  const selection1 = textEditor.selections[0];
  const selection2 = textEditor.selections[1];

  const text1 = textEditor.document.getText(selection1);
  const text2 = textEditor.document.getText(selection2);

  const changes = diff.diffWordsWithSpace(text1, text2);

  const hasDifferences = changes.some(part => part.added || part.removed);
  let markdown = hasDifferences ? '# Differences Found\n\n' : '# No Differences Found\n\n';

  changes.forEach(change => {
    if (change.added) {
      markdown += `**${change.value}**`;
    } else if (change.removed) {
      markdown += `~~${change.value}~~`;
    } else {
      markdown += change.value;
    }
  });

  return openTextDocument(markdown, (doc) => {
    vscode.languages.setTextDocumentLanguage(doc, 'markdown');
  });
};
