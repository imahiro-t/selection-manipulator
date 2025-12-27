import {
  TextEditor,
} from 'vscode';
import { openTextDocument } from '../common';

export const csvHandler: (command: 'csv-to-markdown' | 'markdown-to-csv', isReplace: boolean) => (textEditor: TextEditor) => void = (command, isReplace) => (textEditor) => {
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

const convert: (command: 'csv-to-markdown' | 'markdown-to-csv') => (text: string) => string = (command) => (text) => {
  if (command === 'csv-to-markdown') {
    return csvToMarkdown(text);
  } else {
    return markdownToCsv(text);
  }
};

const csvToMarkdown = (csv: string): string => {
  const lines = csv.trim().split(/\r\n|\r|\n/);
  if (lines.length === 0) {
    return '';
  }

  const rows = lines.map(line => line.split(',')); // Simple split, does not handle quotes yet
  const colCount = Math.max(...rows.map(row => row.length));

  // Header
  let markdown = '| ' + rows[0].join(' | ') + ' |\n';

  // Separator
  markdown += '| ' + Array(colCount).fill('---').join(' | ') + ' |\n';

  // Body
  for (let i = 1; i < rows.length; i++) {
    markdown += '| ' + rows[i].join(' | ') + ' |\n';
  }

  return markdown;
};

const markdownToCsv = (markdown: string): string => {
  const lines = markdown.trim().split(/\r\n|\r|\n/);
  // Filter out separator lines (lines containing only - | whitespace)
  const dataLines = lines.filter(line => !/^[\s|:-]+$/.test(line));

  return dataLines.map(line => {
    // Remove leading/trailing pipes and split by pipe
    const content = line.trim().replace(/^\||\|$/g, '');
    return content.split('|').map(cell => cell.trim()).join(',');
  }).join('\n');
};
