import {
  TextEditor,
  window
} from 'vscode';
import * as vscode from 'vscode';
import { openTextDocument } from '../common';

type CompareMode = 'equal' | 'less' | 'greater';

export const extractLineByLengthHandler: (mode: CompareMode, isClipboard: boolean, testInput?: string) => (textEditor: TextEditor) => void = (mode, isClipboard, testInput) => async (textEditor) => {
  if (textEditor.selections.length === 0) {
    return;
  }

  let lengthInput = testInput;
  if (lengthInput === undefined) {
    lengthInput = await window.showInputBox({
      prompt: `Enter the length to filter lines (${mode})`,
      validateInput: (value) => {
        return isNaN(Number(value)) ? 'Please enter a valid number' : null;
      }
    });
  }

  if (lengthInput === undefined) {
    return;
  }

  const length = Number(lengthInput);

  const linesToExtract: string[] = [];

  for (const selection of textEditor.selections) {
    const startLine = selection.start.line;
    const endLine = selection.end.line;

    for (let i = startLine; i <= endLine; i++) {
      const lineText = textEditor.document.lineAt(i).text;
      let match = false;
      switch (mode) {
        case 'equal':
          match = lineText.length === length;
          break;
        case 'less':
          match = lineText.length <= length;
          break;
        case 'greater':
          match = lineText.length >= length;
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
