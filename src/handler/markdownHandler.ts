import {
  TextEditor,
} from 'vscode';
import * as vscode from 'vscode';

export const markdownHandler: (type: 'link') => (textEditor: TextEditor) => Promise<boolean | void> = (type) => async (textEditor) => {
  if (textEditor.selections.length === 0) {
    return;
  }

  if (type === 'link') {
    const clipboardText = await vscode.env.clipboard.readText();

    return textEditor.edit((editBuilder) => {
      textEditor.selections.forEach((selection) => {
        const text = textEditor.document.getText(selection);
        // If selection looks like a URL, use it as URL and clipboard as text (if not empty), else selection as text and clipboard as URL
        const isSelectionUrl = /^https?:\/\/[^\s]+$/.test(text);

        let newText = '';
        if (isSelectionUrl) {
          // Selection is URL
          const linkText = clipboardText.trim() || text;
          newText = `[${linkText}](${text})`;
        } else {
          // Selection is Text
          const linkUrl = /^https?:\/\/[^\s]+$/.test(clipboardText.trim()) ? clipboardText.trim() : '';
          newText = `[${text}](${linkUrl})`;
        }

        editBuilder.replace(selection, newText);
      });
    });
  }
};
