import {
  TextEditor,
} from 'vscode';

type EncloseType =
  | 'single'
  | 'double'
  | 'backtick'
  | 'paren'
  | 'square'
  | 'curly'
  | 'angle'
  | 'japanese-quote-single'
  | 'japanese-quote-double'
  | 'japanese-bracket'
  | 'japanese-angle'
  | 'japanese-paren'
  | 'japanese-square'
  | 'japanese-curly';

const encloseMap: Record<EncloseType, [string, string]> = {
  'single': ["'", "'"],
  'double': ['"', '"'],
  'backtick': ['`', '`'],
  'paren': ['(', ')'],
  'square': ['[', ']'],
  'curly': ['{', '}'],
  'angle': ['<', '>'],
  'japanese-quote-single': ['「', '」'],
  'japanese-quote-double': ['『', '』'],
  'japanese-bracket': ['【', '】'],
  'japanese-angle': ['＜', '＞'],
  'japanese-paren': ['（', '）'],
  'japanese-square': ['［', '］'],
  'japanese-curly': ['｛', '｝'],
};

export const encloseHandler: (type: EncloseType) => (textEditor: TextEditor) => Thenable<boolean> | void = (type) => (textEditor) => {
  if (textEditor.selections.length === 0) {
    return;
  }

  const [start, end] = encloseMap[type];

  return textEditor.edit((editBuilder) => {
    textEditor.selections.forEach((selection) => {
      const text = textEditor.document.getText(selection);
      editBuilder.replace(selection, `${start}${text}${end}`);
    });
  });
};
