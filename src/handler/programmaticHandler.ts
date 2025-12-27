import {
  TextEditor,
} from 'vscode';
import * as yaml from 'js-yaml';
import { openTextDocument } from '../common';

export const jsonToYamlHandler: (replace: boolean) => (textEditor: TextEditor) => Thenable<boolean | void> = (replace) => (textEditor) => {
  if (textEditor.selections.length === 0) {
    return Promise.resolve();
  }
  const selections = textEditor.selections;

  if (replace) {
    return textEditor.edit(editBuilder => {
      selections.forEach(selection => {
        try {
          const text = textEditor.document.getText(selection);
          const obj = JSON.parse(text);
          const result = yaml.dump(obj);
          editBuilder.replace(selection, result);
        } catch (error) {
          console.error(error);
        }
      });
    });
  } else {
    const results: string[] = [];
    selections.forEach(selection => {
      try {
        const text = textEditor.document.getText(selection);
        const obj = JSON.parse(text);
        results.push(yaml.dump(obj));
      } catch (error) {
        console.error(error);
      }
    });
    if (results.length > 0) {
      return openTextDocument(results.join('\n---\n')).then(() => { });
    }
    return Promise.resolve();
  }
};

export const yamlToJsonHandler: (replace: boolean) => (textEditor: TextEditor) => Thenable<boolean | void> = (replace) => (textEditor) => {
  if (textEditor.selections.length === 0) {
    return Promise.resolve();
  }
  const selections = textEditor.selections;

  if (replace) {
    return textEditor.edit(editBuilder => {
      selections.forEach(selection => {
        try {
          const text = textEditor.document.getText(selection);
          const obj = yaml.load(text);
          const result = JSON.stringify(obj, null, 2);
          editBuilder.replace(selection, result);
        } catch (error) {
          console.error(error);
        }
      });
    });
  } else {
    const results: string[] = [];
    selections.forEach(selection => {
      try {
        const text = textEditor.document.getText(selection);
        const obj = yaml.load(text);
        results.push(JSON.stringify(obj, null, 2));
      } catch (error) {
        console.error(error);
      }
    });
    if (results.length > 0) {
      return openTextDocument(results.join('\n')).then(() => { });
    }
    return Promise.resolve();
  }
};

export const hexToRgbHandler: (replace: boolean) => (textEditor: TextEditor) => Thenable<boolean | void> = (replace) => (textEditor) => {
  const convert = (hex: string) => {
    const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
    return result ? `rgb(${parseInt(result[1], 16)}, ${parseInt(result[2], 16)}, ${parseInt(result[3], 16)})` : hex;
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

export const rgbToHexHandler: (replace: boolean) => (textEditor: TextEditor) => Thenable<boolean | void> = (replace) => (textEditor) => {
  const componentToHex = (c: number) => {
    const hex = c.toString(16);
    return hex.length === 1 ? "0" + hex : hex;
  };
  const convert = (rgb: string) => {
    const result = /^rgb\((\d+),\s*(\d+),\s*(\d+)\)$/i.exec(rgb);
    return result ? "#" + componentToHex(parseInt(result[1])) + componentToHex(parseInt(result[2])) + componentToHex(parseInt(result[3])) : rgb;
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

export const toggleQuotesHandler: (textEditor: TextEditor) => Thenable<boolean> = (textEditor) => {
  return textEditor.edit(editBuilder => {
    textEditor.selections.forEach(selection => {
      const text = textEditor.document.getText(selection);
      let result = text;
      if (text.startsWith("'") && text.endsWith("'")) {
        // Single to Double
        const content = text.slice(1, -1);
        // Unescape single quotes, escape double quotes
        result = '"' + content.replace(/\\'/g, "'").replace(/"/g, '\\"') + '"';
      } else if (text.startsWith('"') && text.endsWith('"')) {
        // Double to Single
        const content = text.slice(1, -1);
        // Unescape double quotes, escape single quotes
        result = "'" + content.replace(/\\"/g, '"').replace(/'/g, "\\'") + "'";
      }
      editBuilder.replace(selection, result);
    });
  });
};

export const hexToDecimalHandler: (replace: boolean) => (textEditor: TextEditor) => Thenable<boolean | void> = (replace) => (textEditor) => {
  const convert = (text: string) => {
    const result = parseInt(text.replace(/^#|^0x/, ''), 16);
    return isNaN(result) ? text : result.toString();
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

export const decimalToHexHandler: (replace: boolean) => (textEditor: TextEditor) => Thenable<boolean | void> = (replace) => (textEditor) => {
  const convert = (text: string) => {
    const result = parseInt(text, 10);
    return isNaN(result) ? text : '0x' + result.toString(16).toUpperCase();
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
