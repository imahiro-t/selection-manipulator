import {
  TextEditor,
} from 'vscode';

export const unitConvertHandler = (type: 'px-to-rem' | 'rem-to-px' | 'kg-to-lb' | 'lb-to-kg') => (textEditor: TextEditor) => {
  if (textEditor.selections.length === 0) {
    return;
  }
  const baseFontSize = 16; // Default base font size for rem conversion

  textEditor.edit((editBuilder) => {
    textEditor.selections
      .forEach(selection => {
        const text = textEditor.document.getText(selection);
        let converted = text;

        const num = parseFloat(text);
        if (isNaN(num)) {
          return;
        }

        switch (type) {
          case 'px-to-rem':
            converted = `${num / baseFontSize}rem`;
            break;
          case 'rem-to-px':
            converted = `${num * baseFontSize}px`;
            break;
          case 'kg-to-lb':
            converted = `${(num * 2.20462).toFixed(2)}lb`;
            break;
          case 'lb-to-kg':
            converted = `${(num / 2.20462).toFixed(2)}kg`;
            break;
        }

        // Remove trailing .00 if present for cleaner output
        converted = converted.replace(/\.00(?=[a-z]+$)/, '');

        editBuilder.replace(selection, converted);
      });
  });
};
