import {
  TextEditor,
} from 'vscode';
import { openTextDocument } from '../common';

export const asciiArtHandler: (character: string, replace: boolean) => (textEditor: TextEditor) => Thenable<boolean | void> = (character, replace) => (textEditor) => {
  if (textEditor.selections.length === 0) {
    return Promise.resolve();
  }

  const arts: { [key: string]: string } = {
    cowsay: `
        \\   ^__^
         \\  (oo)\\_______
            (__)\\       )\\/\\
                ||----w |
                ||     ||`,
    tux: `
        \\   .--.
         \\ |o_o |
           |:_/ |
          //   \\ \\
         (|     | )
        /'\\_   _/\`\\
        \\___)=(___/`,
    ghost: `
        \\     .-.
         \\   (o o)
          \\  | O \\
             \\   \\
              \`~~~\``,
    meow: `
        \\    |\\_/|
         \\   (o.o)
              =^=`,
    pig: `
        \\   _//| .-~~~-.
         \\ _/oo  }       }-@
         (  _  ,}       |
          \`---' \\_(\\/)_/`,
    face: `
        \\   (o)(o)
         \\ /      \\
           \\  ()  /
            \\ -- /`,
  };

  const generateAsciiArt = (text: string, charName: string): string => {
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

    const art = arts[charName] || arts['cowsay'];

    return bubble + art.replace(/^\n/, '');
  };

  if (replace) {
    return textEditor.edit(editBuilder => {
      textEditor.selections.forEach(selection => {
        const text = textEditor.document.getText(selection);
        editBuilder.replace(selection, generateAsciiArt(text, character));
      });
    });
  } else {
    const result = textEditor.selections.map(selection => generateAsciiArt(textEditor.document.getText(selection), character)).join('\n\n');
    return openTextDocument(result).then(() => { });
  }
};
