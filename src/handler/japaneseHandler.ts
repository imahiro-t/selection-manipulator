import {
  TextEditor,
} from 'vscode';
import { openTextDocument } from '../common';

export const fullWidthToHalfWidthHandler: (replace: boolean) => (textEditor: TextEditor) => Thenable<boolean | void> = (replace) => (textEditor) => {
  const convert = (str: string) => {
    return str.replace(/[！-～]/g, (s) => {
      return String.fromCharCode(s.charCodeAt(0) - 0xFEE0);
    }).replace(/　/g, ' ');
  };

  if (replace) {
    return textEditor.edit(editBuilder => {
      textEditor.selections.forEach(selection => {
        const text = textEditor.document.getText(selection);
        editBuilder.replace(selection, convert(text));
      });
    });
  } else {
    const result = textEditor.selections.map(selection => convert(textEditor.document.getText(selection))).join('\n');
    return openTextDocument(result).then(() => { });
  }
};

export const halfWidthToFullWidthHandler: (replace: boolean) => (textEditor: TextEditor) => Thenable<boolean | void> = (replace) => (textEditor) => {
  const convert = (str: string) => {
    return str.replace(/[!-~]/g, (s) => {
      return String.fromCharCode(s.charCodeAt(0) + 0xFEE0);
    }).replace(/ /g, '　');
  };

  if (replace) {
    return textEditor.edit(editBuilder => {
      textEditor.selections.forEach(selection => {
        const text = textEditor.document.getText(selection);
        editBuilder.replace(selection, convert(text));
      });
    });
  } else {
    const result = textEditor.selections.map(selection => convert(textEditor.document.getText(selection))).join('\n');
    return openTextDocument(result).then(() => { });
  }
};

export const hiraganaToKatakanaHandler: (replace: boolean) => (textEditor: TextEditor) => Thenable<boolean | void> = (replace) => (textEditor) => {
  const convert = (str: string) => {
    return str.replace(/[\u3041-\u3096]/g, (match) => {
      const chr = match.charCodeAt(0) + 0x60;
      return String.fromCharCode(chr);
    });
  };

  if (replace) {
    return textEditor.edit(editBuilder => {
      textEditor.selections.forEach(selection => {
        const text = textEditor.document.getText(selection);
        editBuilder.replace(selection, convert(text));
      });
    });
  } else {
    const result = textEditor.selections.map(selection => convert(textEditor.document.getText(selection))).join('\n');
    return openTextDocument(result).then(() => { });
  }
};

export const katakanaToHiraganaHandler: (replace: boolean) => (textEditor: TextEditor) => Thenable<boolean | void> = (replace) => (textEditor) => {
  const convert = (str: string) => {
    return str.replace(/[\u30a1-\u30f6]/g, (match) => {
      const chr = match.charCodeAt(0) - 0x60;
      return String.fromCharCode(chr);
    });
  };

  if (replace) {
    return textEditor.edit(editBuilder => {
      textEditor.selections.forEach(selection => {
        const text = textEditor.document.getText(selection);
        editBuilder.replace(selection, convert(text));
      });
    });
  } else {
    const result = textEditor.selections.map(selection => convert(textEditor.document.getText(selection))).join('\n');
    return openTextDocument(result).then(() => { });
  }
};
