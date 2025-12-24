import {
  TextEditor,
} from 'vscode';
import { openTextDocument } from '../common';

type Command = 'escape' | 'unescape';

export const escapeHandler: (command: Command, isReplace: boolean) => (textEditor: TextEditor) => void = (command, isReplace) => (textEditor) => {
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
    case 'escape':
      return JSON.stringify(value).slice(1, -1);
    case 'unescape':
      try {
        return JSON.parse(`"${value}"`);
      } catch (e) {
        return value; // Fallback if invalid JSON string
      }
    default:
      return value;
  }
};
