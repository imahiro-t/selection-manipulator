import {
  TextEditor,
} from 'vscode';
import * as crypto from 'crypto';

export const randomHandler: (command: 'uuid') => (textEditor: TextEditor) => void = (command) => (textEditor) => {
  textEditor.edit((editBuilder) => {
    if (textEditor.selections.length === 0 || (textEditor.selections.length === 1 && textEditor.selection.isEmpty)) {
      // If no selection or single empty cursor, insert at cursor
      const uuid = crypto.randomUUID();
      editBuilder.insert(textEditor.selection.active, uuid);
    } else {
      // Replace each selection with a unique UUID
      textEditor.selections.forEach(selection => {
        const uuid = crypto.randomUUID();
        editBuilder.replace(selection, uuid);
      });
    }
  });
};
