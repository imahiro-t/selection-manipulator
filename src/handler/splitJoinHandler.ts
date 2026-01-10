import {
  TextEditor,
  window,
} from 'vscode';
import * as vscode from 'vscode';
import { openTextDocument } from '../common';

export const processSplitJoin = (text: string, delimiter: string, type: 'split' | 'join'): string => {
  if (type === 'split') {
    return text.split(delimiter).join('\n');
  } else {
    // Join: split by newline (default line separator) and join with delimiter
    return text.split(/\r\n|\r|\n/).join(delimiter);
  }
};

export const splitJoinHandler: (type: 'split' | 'join', mode?: 'replace' | 'clipboard' | 'new-tab') => (textEditor: TextEditor) => Promise<void> = (type, mode = 'replace') => async (textEditor) => {
  const selections = textEditor.selections;
  if (selections.length === 0) {
    return;
  }

  const delimiter = await window.showInputBox({
    placeHolder: 'Enter delimiter',
    prompt: type === 'split' ? 'Enter character(s) to split by' : 'Enter character(s) to join with',
  });

  if (!delimiter) {
    return;
  }
  // Allow empty string for join (join without separator), but for split usually we need something? 
  // Consistently, if user enters empty string, use it (split by empty string = explode string, join with empty = concat)

  if (mode === 'replace') {
    await textEditor.edit((editBuilder) => {
      selections.forEach((selection) => {
        const text = textEditor.document.getText(selection);
        const newText = processSplitJoin(text, delimiter, type);
        editBuilder.replace(selection, newText);
      });
    });
  } else {
    // For clipboard/new-tab, treat multiple selections? 
    // Usually we join results or handle each.
    // implementation_plan says "either replace the selection or copy the joined/split text to clipboard".
    // If multiple selections, let's process all and join with newline for output?
    // Existing logic in previous file:
    // It mapped replacements.
    // Copy/New-tab logic:
    const results = selections.map(selection => {
      const text = textEditor.document.getText(selection);
      return processSplitJoin(text, delimiter, type);
    });

    const content = results.join('\n');
    if (mode === 'clipboard') {
      await vscode.env.clipboard.writeText(content);
    } else {
      openTextDocument(content);
    }
  }
};
