import {
  TextEditor,
} from 'vscode';
import { openTextDocumentWithTitles } from '../common';

export const jwtHandler: (textEditor: TextEditor) => void = (textEditor) => {
  if (textEditor.selections.length === 0) {
    return;
  }
  const selectedTexts = textEditor.selections
    .map(selection => textEditor.document.getText(selection))
    .join("\n")
    .split("\n")
    .map(selectedText => selectedText.trim())
    .filter(selectedText => selectedText.length > 0);

  const zip = selectedTexts.map(selectedText => {
    try {
      const ss = selectedText.split('.');
      if (ss.length === 3) {
        const header = JSON.stringify(JSON.parse(Buffer.from(ss[0], 'base64').toString()), null, 2);
        const payload = JSON.stringify(JSON.parse(Buffer.from(ss[1], 'base64').toString()), null, 2);
        return [selectedText, `${header}\n${payload}`];
      } else {
        return [selectedText, ''];
      }
    } catch (_e) {
      return [selectedText, ''];
    }
  });
  openTextDocumentWithTitles(zip);
};
