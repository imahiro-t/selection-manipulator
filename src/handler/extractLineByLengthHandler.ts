import {
  TextEditor,
  window
} from 'vscode';
import * as vscode from 'vscode';
import { openTextDocument } from '../common';

type CompareMode = 'equal' | 'less' | 'greater' | 'range';

export const extractLineByLengthHandler: (mode: CompareMode, isClipboard: boolean, testInput?: string) => (textEditor: TextEditor) => void = (mode, isClipboard, testInput) => async (textEditor) => {
  if (textEditor.selections.length === 0) {
    return;
  }

  let lengthInput = testInput;
  if (lengthInput === undefined) {
    const prompt = mode === 'range' ? 'Enter the length range (min,max or min-max)' : `Enter the length to filter lines (${mode})`;
    lengthInput = await window.showInputBox({
      prompt: prompt,
      validateInput: (value) => {
        if (mode === 'range') {
          const parts = value.split(/[,-]/).map(s => s.trim());
          if (parts.length !== 2 || parts.some(p => isNaN(Number(p)))) {
            return 'Please enter a valid range (min,max or min-max)';
          }
        } else {
          return isNaN(Number(value)) ? 'Please enter a valid number' : null;
        }
        return null;
      }
    });
  }

  if (lengthInput === undefined) {
    return;
  }

  let minLength = 0;
  let maxLength = 0;
  let targetLength = 0;

  if (mode === 'range') {
    const parts = lengthInput.split(/[,-]/).map(s => s.trim().replace(/^['"]|['"]$/g, ''));
    minLength = Number(parts[0]);
    maxLength = Number(parts[1]);
  } else {
    targetLength = Number(lengthInput);
  }

  const linesToExtract: string[] = [];

  for (const selection of textEditor.selections) {
    const startLine = selection.start.line;
    const endLine = selection.end.line;

    for (let i = startLine; i <= endLine; i++) {
      const lineText = textEditor.document.lineAt(i).text;
      let match = false;
      switch (mode) {
        case 'equal':
          match = lineText.length === targetLength;
          break;
        case 'less':
          match = lineText.length <= targetLength;
          break;
        case 'greater':
          match = lineText.length >= targetLength;
          break;
        case 'range':
          match = lineText.length >= minLength && lineText.length <= maxLength;
          break;
      }

      if (match) {
        linesToExtract.push(lineText);
      }
    }
  }

  const content = linesToExtract.join("\n");


  if (isClipboard) {
    vscode.env.clipboard.writeText(content);
  } else {
    openTextDocument(content);
  }
};
