import {
  TextEditor,
} from 'vscode';
import { openTextDocument } from '../common';

type command = 'encode' | 'decode' | 'deflate' | 'inflate';

export const base64Handler: (command: command) => (textEditor: TextEditor) => void = (command) => async (textEditor) => {
  const selectedText = textEditor.document.getText(textEditor.selection);
  if (!selectedText) {
    return;
  }
  const zlib = require('node:zlib');
  let content;
  if (command === 'encode') {
    content = btoa(selectedText);
  } else if (command === 'decode') {
    content = atob(selectedText);
  } else if (command === 'deflate') {
    content = zlib.deflateRawSync(Buffer.from(selectedText)).toString('base64');
  } else if (command === 'inflate') {
    content = zlib.inflateRawSync(Buffer.from(selectedText, 'base64')).toString();
  }
  openTextDocument(content);
};
