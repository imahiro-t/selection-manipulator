import {
  TextEditor,
  window,
} from 'vscode';
import { openTextDocumentWithTitles } from '../common';

export const mathHandler: (command: 'sum' | 'average' | 'min' | 'max') => (textEditor: TextEditor) => void = (command) => (textEditor) => {
  if (textEditor.selections.length === 0) {
    return;
  }

  const numbers: number[] = [];

  textEditor.selections.forEach((selection) => {
    const text = textEditor.document.getText(selection);
    // Split by newlines or comma
    const parts = text.split(/[\r\n,]+/);
    parts.forEach(part => {
      const trimmed = part.trim();
      if (trimmed !== '') {
        const num = parseFloat(trimmed);
        if (!isNaN(num)) {
          numbers.push(num);
        }
      }
    });
  });

  if (numbers.length === 0) {
    window.showWarningMessage('No numbers found in selection.');
    return;
  }

  let result = 0;
  let title = '';

  switch (command) {
    case 'sum':
      result = numbers.reduce((a, b) => a + b, 0);
      title = 'Sum';
      break;
    case 'average':
      result = numbers.reduce((a, b) => a + b, 0) / numbers.length;
      title = 'Average';
      break;
    case 'min':
      result = Math.min(...numbers);
      title = 'Min';
      break;
    case 'max':
      result = Math.max(...numbers);
      title = 'Max';
      break;
  }

  openTextDocumentWithTitles([[title, result.toString()]]);
};
