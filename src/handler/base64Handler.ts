import {
  TextEditor,
} from 'vscode';
import { openTextDocument } from '../common';

type command = 'encode' | 'decode' | 'deflate' | 'inflate';

export const base64Handler: (command: command) => (textEditor: TextEditor) => void = (command) => async (textEditor) => {
  if (textEditor.selections.length === 0) {
    return;
  }
  const zlib = require('node:zlib');
  const text =
    textEditor.selections
      .map(selection => textEditor.document.getText(selection))
      .join("\n");
  let content;
  if (command === 'encode') {
    content = btoa(text);
  } else if (command === 'decode') {
    content = atob(text);
  } else if (command === 'deflate') {
    content = zlib.deflateRawSync(Buffer.from(text)).toString('base64');
  } else if (command === 'inflate') {
    content = zlib.inflateRawSync(Buffer.from(text, 'base64')).toString();
  }
  openTextDocument(content);
};
