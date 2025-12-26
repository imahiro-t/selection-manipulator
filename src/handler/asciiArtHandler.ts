import {
  TextEditor,
} from 'vscode';
import { openTextDocument } from '../common';

export const asciiArtHandler: (character: string, replace: boolean) => (textEditor: TextEditor) => Thenable<boolean | void> = (character, replace) => (textEditor) => {
  if (textEditor.selections.length === 0) {
    return Promise.resolve();
  }

  const generateCowsay = (text: string): string => {
    const lines = text.split(/\r?\n/);
    const maxLength = Math.max(...lines.map(line => line.length));

    let bubble = ' ' + '_'.repeat(maxLength + 2) + ' \n';

    if (lines.length === 1) {
      bubble += `< ${lines[0]} >\n`;
    } else {
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        const padding = ' '.repeat(maxLength - line.length);
        let border = '';
        if (i === 0) {
          border = '/';
        } else if (i === lines.length - 1) {
          border = '\\';
        } else {
          border = '|';
        }

        let rightBorder = '';
        if (i === 0) {
          rightBorder = '\\';
        } else if (i === lines.length - 1) {
          rightBorder = '/';
        } else {
          rightBorder = '|';
        }

        bubble += `${border} ${line}${padding} ${rightBorder}\n`;
      }
    }

    bubble += ' ' + '-'.repeat(maxLength + 2) + ' \n';

    const cow = `        \\   ^__^
         \\  (oo)\\_______
            (__)\\       )\\/\\
                ||----w |
                ||     ||`;

    return bubble + cow;
  };

  if (replace) {
    return textEditor.edit(editBuilder => {
      textEditor.selections.forEach(selection => {
        const text = textEditor.document.getText(selection);
        editBuilder.replace(selection, generateCowsay(text));
      });
    });
  } else {
    const result = textEditor.selections.map(selection => generateCowsay(textEditor.document.getText(selection))).join('\n\n');
    return openTextDocument(result).then(() => { });
  }
};
