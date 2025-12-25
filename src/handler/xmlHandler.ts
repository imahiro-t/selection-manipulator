import {
  TextEditor,
} from 'vscode';
import { openTextDocument } from '../common';

import xmlFormat from 'xml-formatter';

type Command = 'format' | 'minify';

export const xmlHandler: (command: Command, isReplace: boolean) => (textEditor: TextEditor) => Thenable<boolean | void> = (command, isReplace) => (textEditor) => {
  if (isReplace) {
    if (textEditor.selections.length === 0) {
      return Promise.resolve();
    }
    return textEditor.edit((editBuilder) => {
      textEditor.selections
        .forEach(selection => {
          const text = textEditor.document.getText(selection);
          editBuilder.replace(selection, change(command)(text));
        });
    });
  } else {
    const selectedText = textEditor.document.getText(textEditor.selection);
    if (!selectedText) {
      return Promise.resolve();
    }
    return openTextDocument(change(command)(selectedText)).then(() => { });
  }
};

const change: (command: Command) => (value: string) => string = (command) => (value) => {
  switch (command) {
    case 'format':
      return xmlFormat(value, { indentation: '  ', lineSeparator: '\n' });
    case 'minify':
      return xmlFormat.minify(value, { collapseContent: true });
    default:
      return '';
  }
};
