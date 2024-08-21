import {
  TextEditor,
} from 'vscode';
import { openTextDocument } from '../common';

type Command = 'encode' | 'decode' | 'deflate' | 'inflate';

export const base64Handler: (command: Command, isReplace: boolean) => (textEditor: TextEditor) => void = (command, isReplace) => (textEditor) => {
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
  const zlib = require('node:zlib');
  switch (command) {
    case 'encode':
      return btoa(value);
    case 'decode':
      return atob(value);
    case 'deflate':
      return zlib.deflateRawSync(Buffer.from(value)).toString('base64');
    case 'inflate':
      return zlib.inflateRawSync(Buffer.from(value, 'base64')).toString();
    default:
      return '';
  }
};
