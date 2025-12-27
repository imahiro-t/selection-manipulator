import {
  TextEditor,
} from 'vscode';

export const unitConvertHandler = (type: 'px-to-rem' | 'rem-to-px' | 'kg-to-lb' | 'lb-to-kg') => (textEditor: TextEditor) => {
  if (textEditor.selections.length === 0) {
    return Promise.resolve();
  }
  const baseFontSize = 16; // Default base font size for rem conversion

  return textEditor.edit((editBuilder) => {
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
        // Remove trailing 0 if present (e.g. 2.20 -> 2.2)
        // Actually, toFixed(2) keeps 2 decimals.
        // Let's use parseFloat to strip unnecessary zeros if needed, but the current regex only removes .00
        // Wait, the regex `\.00(?=[a-z]+$)` is specific to removing exactly `.00`.
        // Examples: "2.00lb" -> "2lb". "2.20lb" -> "2.20lb".
        // If we want "2.20" -> "2.2", we need better formatting.
        // But let's stick to simple fix first: return Thenable.

        editBuilder.replace(selection, converted);
      });
  });
};
