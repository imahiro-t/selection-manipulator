import {
  window,
  TextEditor,
} from 'vscode';
import { openTextDocumentWithTitles } from '../common';

type Algorithm = 'sha256' | 'sha512' | 'md5';

export const hmacHandler: (algorithm: Algorithm, testSecret?: string) => (textEditor: TextEditor) => void = (algorithm, testSecret) => async (textEditor) => {
  if (textEditor.selections.length === 0) {
    return;
  }
  const { createHmac } = require('node:crypto');
  let secret = testSecret ?? await window.showInputBox({
    prompt: 'Secret?',
    ignoreFocusOut: true,
    password: true,
  });
  const zip =
    textEditor.selections
      .map(selection => textEditor.document.getText(selection))
      .map(text => {
        const hmac = createHmac(algorithm, secret);
        hmac.update(text);
        return [text, hmac.digest('hex')];
      });
  openTextDocumentWithTitles(zip);
};
