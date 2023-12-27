import {
  TextEditor,
} from 'vscode';
import { openTextDocumentWithTitles } from '../common';

export const samlHandler: (textEditor: TextEditor) => void = (textEditor) => {
  if (textEditor.selections.length === 0) {
    return;
  }
  const zlib = require('node:zlib');
  const selectedTexts = textEditor.selections
    .map(selection => textEditor.document.getText(selection))
    .join("\n")
    .split("\n")
    .map(selectedText => selectedText.trim())
    .filter(selectedText => selectedText.length > 0);

  const zip = selectedTexts.map(selectedText => {
    try {
      let xml;
      try {
        xml = zlib.inflateRawSync(Buffer.from(decodeURIComponent(selectedText), 'base64')).toString();
      } catch (_e) {
        xml = Buffer.from(selectedText, 'base64').toString();
      }
      return [selectedText, xml];
    } catch (_e) {
      return [selectedText, ''];
    }
  });
  openTextDocumentWithTitles(zip);
};
