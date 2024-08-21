import {
  TextEditor,
} from 'vscode';
import { openTextDocument } from '../common';

type Command = 'format' | 'minify' | 'stringify' | 'parse';

export const jsonHandler: (command: Command, isReplace: boolean) => (textEditor: TextEditor) => void = (command, isReplace) => (textEditor) => {
  if (isReplace) {
    if (textEditor.selections.length === 0) {
      return;
    }
    textEditor.edit((editBuilder) => {
      textEditor.selections
        .forEach(selection => {
          const text = textEditor.document.getText(selection);
          editBuilder.replace(selection, change(command)(text));
        });
    });
  } else {
    const selectedText = textEditor.document.getText(textEditor.selection);
    if (!selectedText) {
      return;
    }
    openTextDocument(change(command)(selectedText));
  }
};

const change: (command: Command) => (value: string) => string = (command) => (value) => {
  switch (command) {
    case 'format':
      return JSON.stringify(JSON.parse(value), null, 2);
    case 'minify':
      return JSON.stringify(JSON.parse(value), null, 0);
    case 'stringify':
      return JSON.stringify(value.trim());
    case 'parse':
      return JSON.parse(value);
    default:
      return '';
  }
};
