import {
  window,
  TextEditor,
} from 'vscode';
import { openTextDocument } from '../common';

type Command = 'encrypt' | 'decrypt';

export const aesHandler: (command: Command, isReplace: boolean, testSecret?: string) => (textEditor: TextEditor) => void = (command, isReplace, testSecret) => async (textEditor) => {
  if (textEditor.selections.length === 0) {
    return;
  }
  const secret = testSecret ?? (await window.showInputBox({
    prompt: 'Secret?',
    ignoreFocusOut: true,
    password: true,
  }) ?? "");
  if (isReplace) {
    if (textEditor.selections.length === 0) {
      return;
    }
    textEditor.edit((editBuilder) => {
      textEditor.selections
        .forEach(selection => {
          const text = textEditor.document.getText(selection);
          editBuilder.replace(selection, change(command,)(text, secret));
        });
    });
  } else {
    const selectedText = textEditor.document.getText(textEditor.selection);
    if (!selectedText) {
      return;
    }
    openTextDocument(change(command)(selectedText, secret));
  }
};

const change: (command: Command) => (value: string, password: string) => string = (command) => (value, secret) => {
  switch (command) {
    case 'encrypt':
      return encrypt(value, secret);
    case 'decrypt':
      return decrypt(value, secret);
    default:
      return '';
  }
};

const encrypt = (src: string, secret: string) => {
  const crypto = require('crypto');
  const algorithm = 'aes-256-cbc';
  const key = crypto.scryptSync(secret, 'salt', 32);
  const iv = Buffer.alloc(16, 0);
  const cipher = crypto.createCipheriv(algorithm, key, iv);
  return cipher.update(src, 'utf8', 'hex') + cipher.final('hex');
};

const decrypt = (encrypted: string, secret: string) => {
  const crypto = require('crypto');
  const algorithm = 'aes-256-cbc';
  const key = crypto.scryptSync(secret, 'salt', 32);
  const iv = Buffer.alloc(16, 0);
  const decipher = crypto.createDecipheriv(algorithm, key, iv);
  return decipher.update(encrypted, 'hex', 'utf8') + decipher.final('utf8');
};
