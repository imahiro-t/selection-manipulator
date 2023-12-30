import {
  TextEditor,
} from 'vscode';
import { openTextDocumentWithTitles } from '../common';

export const whoisHandler: (textEditor: TextEditor) => void = async (textEditor) => {
  if (textEditor.selections.length === 0) {
    return;
  }
  const whois = require('whois');
  const { promisify } = require('util');
  const selectedTexts = textEditor.selections
    .map(selection => textEditor.document.getText(selection))
    .join("\n")
    .split("\n")
    .map(selectedText => selectedText.trim())
    .filter(selectedText => selectedText.length > 0);
  const zip = await Promise.all(selectedTexts
    .map(async selectedText => {
      try {
        const data = await promisify(whois.lookup)(selectedText);
        return [selectedText, data];
      } catch (_e) {
        return [selectedText, ''];
      }
    }));
  openTextDocumentWithTitles(zip);
};
