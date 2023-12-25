import {
  TextEditor,
} from 'vscode';
import { openTextDocumentWithTitles } from '../common';
import { resolve, reverse } from 'node:dns/promises';

type command = 'A' | 'AAAA' | 'ANY' | 'CAA' | 'CNAME' | 'MX' | 'NAPTR' | 'NS' | 'PTR' | 'SOA' | 'SRV' | 'TXT' | 'REVERSE';

export const dnsHandler: (command: command) => (textEditor: TextEditor) => void = (command) => async (textEditor) => {
  if (textEditor.selections.length === 0) {
    return;
  }
  const selectedTexts = textEditor.selections
    .map(selection => textEditor.document.getText(selection))
    .join("\n")
    .split("\n")
    .map(selectedText => selectedText.trim())
    .filter(selectedText => selectedText.length > 0);
  const zip = await Promise.all(selectedTexts
    .map(async selectedText => {
      try {
        if (command === 'REVERSE') {
          return [selectedText, JSON.stringify(await reverse(selectedText), null, 2)];
        } else {
          return [selectedText, JSON.stringify(await resolve(selectedText, command), null, 2)];
        }
      } catch (_e) {
        return [selectedText, JSON.stringify([])];
      }
    }));
  openTextDocumentWithTitles(zip);
};
