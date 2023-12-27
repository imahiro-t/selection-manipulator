import {
  TextEditor,
} from 'vscode';
import { openTextDocumentWithTitles } from '../common';

type command = 'PARSE_TO_JSON' | 'ENCODE_URI' | 'DECODE_URI' | 'ENCODE_URI_COMPONENT' | 'DECODE_URI_COMPONENT';

export const urlHandler: (command: command) => (textEditor: TextEditor) => void = (command) => (textEditor) => {
  if (textEditor.selections.length === 0) {
    return;
  }
  const querystring = require('node:querystring');
  const selectedTexts = textEditor.selections
    .map(selection => textEditor.document.getText(selection))
    .join("\n")
    .split("\n")
    .map(selectedText => selectedText.trim())
    .filter(selectedText => selectedText.length > 0);

  const zip = selectedTexts.map(selectedText => {
    try {
      if (command === 'PARSE_TO_JSON') {
        const url = new URL(selectedText);
        const search = url.search.startsWith('?') ? url.search.slice(1) : url.search;
        const hash = url.hash.startsWith('#') ? url.hash.slice(1) : url.hash;
        const parsed = {
          href: url.href,
          origin: url.origin,
          host: url.host,
          protocol: url.protocol,
          hostname: url.hostname,
          port: url.port,
          pathname: url.pathname,
          search: querystring.parse(search),
          hash: hash,
          username: url.username,
          password: url.password,
        };
        return [selectedText, JSON.stringify(parsed, null, 2)];
      } else if (command === 'ENCODE_URI') {
        return [selectedText, encodeURI(selectedText)];
      } else if (command === 'DECODE_URI') {
        return [selectedText, decodeURI(selectedText)];
      } else if (command === 'ENCODE_URI_COMPONENT') {
        return [selectedText, encodeURIComponent(selectedText)];
      } else if (command === 'DECODE_URI_COMPONENT') {
        return [selectedText, decodeURIComponent(selectedText)];
      } else {
        return [selectedText, ''];
      }
    } catch (_e) {
      return [selectedText, ''];
    }
  });
  openTextDocumentWithTitles(zip);
};
