import {
  TextEditor,
} from 'vscode';

export const insertDateHandler: (format: 'iso' | 'locale' | 'timestamp') => (textEditor: TextEditor) => Thenable<boolean> = (format) => (textEditor) => {
  return textEditor.edit((editBuilder) => {
    const now = new Date();
    let dateStr = '';

    switch (format) {
      case 'iso':
        dateStr = now.toISOString();
        break;
      case 'locale':
        dateStr = now.toLocaleString();
        break;
      case 'timestamp':
        dateStr = Math.floor(now.getTime() / 1000).toString();
        break;
    }

    if (textEditor.selections.length === 0 || (textEditor.selections.length === 1 && textEditor.selection.isEmpty)) {
      editBuilder.insert(textEditor.selection.active, dateStr);
    } else {
      textEditor.selections.forEach((selection) => {
        editBuilder.replace(selection, dateStr);
      });
    }
  });
};
