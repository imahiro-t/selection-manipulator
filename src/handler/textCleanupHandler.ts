import {
  TextEditor,
} from 'vscode';

export const textCleanupHandler: (command: 'remove-empty-lines' | 'remove-line-numbers' | 'trim-lines' | 'join-lines-space' | 'join-lines-comma' | 'split-lines-space' | 'split-lines-comma' | 'normalize-whitespace' | 'strip-html-tags' | 'unsmart-quotes' | 'trim-lines-trailing' | 'remove-duplicate-lines') => (textEditor: TextEditor) => Thenable<boolean> = (command) => (textEditor) => {
  const document = textEditor.document;

  return textEditor.edit((editBuilder) => {
    textEditor.selections.forEach((selection) => {
      const text = textEditor.document.getText(selection);
      let newText = text;

      switch (command) {
        case 'remove-empty-lines':
          newText = text
            .split(/\r\n|\r|\n/)
            .filter((line) => line.trim() !== '')
            .join('\n');
          break;
        case 'remove-line-numbers':
          // Removes leading numbers like "1. ", " 12: ", "  [3] " etc.
          // Regex breakdown:
          // ^\s*       : Start of line, optional whitespace
          // [\[\(]?    : Optional opening bracket or parenthesis
          // \d+        : One or more digits
          // [\]\)]?    : Optional closing bracket or parenthesis
          // [:.]?      : Optional separator (colon or dot)
          // \s+        : At least one whitespace character
          newText = text
            .split(/\r\n|\r|\n/)
            .map((line) => line.replace(/^\s*[\[\(]?\d+[\]\)]?[:.]?\s+/, ''))
            .join('\n');
          break;
        case 'trim-lines':
          newText = text
            .split(/\r\n|\r|\n/)
            .map((line) => line.trim())
            .join('\n');
          break;
        case 'join-lines-space':
          newText = text
            .split(/\r\n|\r|\n/)
            .map((line) => line.trim())
            .filter((line) => line.length > 0)
            .join(' ');
          break;
        case 'join-lines-comma':
          newText = text
            .split(/\r\n|\r|\n/)
            .map((line) => line.trim())
            .filter((line) => line.length > 0)
            .join(',');
          break;
        case 'split-lines-space':
          newText = text
            .split(' ')
            .join('\n');
          break;
        case 'split-lines-comma':
          newText = text
            .split(',')
            .join('\n');
          break;
        case 'normalize-whitespace':
          newText = text.replace(/\s+/g, ' ');
          break;
        case 'strip-html-tags':
          newText = text.replace(/<[^>]*>/g, '');
          break;
        case 'unsmart-quotes':
          newText = text
            .replace(/[\u2018\u2019]/g, "'") // Left/Right single quotes
            .replace(/[\u201C\u201D]/g, '"'); // Left/Right double quotes
          break;
        case 'trim-lines-trailing':
          newText = text
            .split(/\r\n|\r|\n/)
            .map((line) => line.replace(/\s+$/, ''))
            .join('\n');
          break;
        case 'remove-duplicate-lines':
          newText = [...new Set(text.split(/\r\n|\r|\n/))].join('\n');
          break;
      }

      if (text !== newText) {
        editBuilder.replace(selection, newText);
      }
    });
  });
};
