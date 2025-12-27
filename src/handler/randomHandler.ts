import {
  TextEditor,
} from 'vscode';
import * as crypto from 'crypto';

export const randomHandler: (command: 'uuid' | 'password' | 'ipv4' | 'ipv6' | 'lorem-ipsum') => (textEditor: TextEditor) => Thenable<boolean> = (command) => (textEditor) => {
  return textEditor.edit((editBuilder) => {
    const generate = () => {
      switch (command) {
        case 'uuid':
          return crypto.randomUUID();
        case 'password':
          return generatePassword(16);
        case 'ipv4':
          return generateIPv4();
        case 'ipv6':
          return generateIPv6();
        case 'lorem-ipsum':
          return generateLoremIpsum();
      }
    };

    if (textEditor.selections.length === 0 || (textEditor.selections.length === 1 && textEditor.selection.isEmpty)) {
      // If no selection or single empty cursor, insert at cursor
      editBuilder.insert(textEditor.selection.active, generate());
    } else {
      // Replace each selection with a generated value
      textEditor.selections.forEach(selection => {
        editBuilder.replace(selection, generate());
      });
    }
  });
};

const generatePassword = (length: number): string => {
  const chars = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%^&*()_+~`|}{[]\:;?><,./-=";
  let password = "";
  for (let i = 0; i < length; i++) {
    const randomIndex = Math.floor(Math.random() * chars.length);
    password += chars[randomIndex];
  }
  return password;
};

const generateIPv4 = (): string => {
  return Array.from({ length: 4 }, () => Math.floor(Math.random() * 256)).join('.');
};

const generateIPv6 = (): string => {
  return Array.from({ length: 8 }, () => Math.floor(Math.random() * 65536).toString(16)).join(':');
};

const generateLoremIpsum = (): string => {
  return "Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod tempor incididunt ut labore et dolore magna aliqua. Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris nisi ut aliquip ex ea commodo consequat. Duis aute irure dolor in reprehenderit in voluptate velit esse cillum dolore eu fugiat nulla pariatur. Excepteur sint occaecat cupidatat non proident, sunt in culpa qui officia deserunt mollit anim id est laborum.";
};
