import {
  TextEditor,
} from 'vscode';
import { openTextDocument } from '../common';

export const dataStructHandler: (command: 'env-to-json', isReplace: boolean) => (textEditor: TextEditor) => void = (command, isReplace) => (textEditor) => {
  if (isReplace) {
    if (textEditor.selections.length === 0) {
      return;
    }
    textEditor.edit((editBuilder) => {
      textEditor.selections.forEach((selection) => {
        const text = textEditor.document.getText(selection);
        editBuilder.replace(selection, convert(command)(text));
      });
    });
  } else {
    const selectedText = textEditor.document.getText(textEditor.selection);
    if (!selectedText) {
      return;
    }
    openTextDocument(convert(command)(selectedText));
  }
};

const convert: (command: 'env-to-json') => (text: string) => string = (command) => (text) => {
  if (command === 'env-to-json') {
    return envToJson(text);
  }
  return '';
};

const envToJson = (env: string): string => {
  const lines = env.trim().split(/\r\n|\r|\n/);
  const result: any = {};

  lines.forEach(line => {
    // Ignore comments and empty lines
    if (!line.trim() || line.trim().startsWith('#')) {
      return;
    }

    const match = line.match(/^\s*([\w.-]+)\s*=\s*(.*)?\s*$/);
    if (match) {
      let key = match[1];
      let value = match[2] || '';

      // Remove surrounding quotes if present
      if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
        value = value.slice(1, -1);
      }

      result[key] = value;
    }
  });

  return JSON.stringify(result, null, 2);
};
