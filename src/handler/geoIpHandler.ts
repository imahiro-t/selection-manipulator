import {
  TextEditor,
} from 'vscode';
import { openTextDocument } from '../common';
import axios from 'axios';

export const geoIpHandler: (textEditor: TextEditor) => void = async (textEditor) => {
  if (textEditor.selections.length === 0) {
    return;
  }
  const selectedTexts = textEditor.selections
    .map(selection => textEditor.document.getText(selection))
    .join("\n")
    .split("\n")
    .map(selectedText => selectedText.trim())
    .filter(selectedText => selectedText.length > 0);

  const response = await axios.post('http://ip-api.com/batch', selectedTexts);
  const content = JSON.stringify(response.data, null, 2);
  openTextDocument(content);
};
