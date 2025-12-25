import {
  TextEditor,
} from 'vscode';
import * as vscode from 'vscode';
import { openTextDocumentWithTitles } from '../common';
import * as crypto from 'crypto';

type Algorithm = 'md5' | 'sha1' | 'sha256' | 'sha512';

export const cryptoHandler: (algorithm: Algorithm, replace: boolean) => (textEditor: TextEditor) => Thenable<boolean | void> = (algorithm, replace) => (textEditor) => {
  if (textEditor.selections.length === 0) {
    return Promise.resolve();
  }

  const hashContent = (text: string) => {
    const hash = crypto.createHash(algorithm);
    hash.update(text);
    return hash.digest('hex');
  };

  if (replace) {
    return textEditor.edit(editBuilder => {
      textEditor.selections.forEach(selection => {
        const text = textEditor.document.getText(selection);
        editBuilder.replace(selection, hashContent(text));
      });
    });
  } else {
    const zip = textEditor.selections
      .map(selection => textEditor.document.getText(selection))
      .map(text => [text, hashContent(text)]);

    return openTextDocumentWithTitles(zip).then(() => { });
  }
};
