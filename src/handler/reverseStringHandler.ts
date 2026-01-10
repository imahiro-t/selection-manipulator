import {
  TextEditor,
} from 'vscode';
import * as vscode from 'vscode';
import { openTextDocument } from '../common';

export const reverseStringHandler: (isClipboard: boolean) => (textEditor: TextEditor) => Promise<void> = (isClipboard) => async (textEditor) => {
  if (textEditor.selections.length === 0) {
    return;
  }

  // If replacing, we edit the document
  if (!isClipboard) {
    await textEditor.edit((editBuilder) => {
      textEditor.selections.forEach((selection) => {
        const text = textEditor.document.getText(selection);
        const reversedText = [...text].reverse().join('');
        editBuilder.replace(selection, reversedText);
      });
    });
  } else {
    // If clipboard, we collect reversed strings and copy them
    const texts = textEditor.selections.map(selection => {
      const text = textEditor.document.getText(selection);
      return [...text].reverse().join('');
    });

    // Join with newline if multiple selections, same as other handlers behavior usually
    const content = texts.join('\n');
    await vscode.env.clipboard.writeText(content);
  }
};
