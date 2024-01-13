import {
  TextEditor,
} from 'vscode';
import { openTextDocumentWithTitles } from '../common';

type Algorithm = 'sha256' | 'sha512' | 'md5';

export const hashHandler: (algorithm: Algorithm) => (textEditor: TextEditor) => void = (algorithm) => (textEditor) => {
  if (textEditor.selections.length === 0) {
    return;
  }
  const { createHash } = require('node:crypto');
  const zip =
    textEditor.selections
      .map(selection => textEditor.document.getText(selection))
      .map(text => {
        const hash = createHash(algorithm);
        hash.update(text);
        return [text, hash.digest('hex')];
      });
  openTextDocumentWithTitles(zip);
};
