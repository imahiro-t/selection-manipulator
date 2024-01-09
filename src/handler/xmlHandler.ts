import {
  TextEditor,
} from 'vscode';
import { openTextDocument } from '../common';

import xmlFormat from 'xml-formatter';

type Command = 'format' | 'minify';

export const xmlHandler: (command: Command) => (textEditor: TextEditor) => void = (command) => (textEditor) => {
  const selectedText = textEditor.document.getText(textEditor.selection);
  if (!selectedText) {
    return;
  }
  let content;
  if (command === 'format') {
    content = xmlFormat(selectedText, { indentation: '  ', lineSeparator: '\n' });
  } else if (command === 'minify') {
    content = xmlFormat.minify(selectedText, { collapseContent: true });
  } else {
    content = '';
  }
  openTextDocument(content);
};
