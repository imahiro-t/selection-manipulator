import {
  workspace,
  window,
  TextEditor,
  TextDocument,
  ViewColumn
} from 'vscode';

import xmlFormat from 'xml-formatter';

type command = 'format' | 'minify';

export const xmlHandler: (command: command) => (textEditor: TextEditor) => void = (command) => (textEditor) => {
  let selectedText = textEditor.document.getText(textEditor.selection);
  if (!selectedText) {
    return;
  }
  let content;
  if (command === 'format') {
    content = xmlFormat(selectedText, { indentation: '  ', lineSeparator: '\n' });
  } else if (command === 'minify') {
    content = xmlFormat.minify(selectedText, { collapseContent: true });
  }
  workspace.openTextDocument({
    content: content,
    language: "text"
  }).then((doc: TextDocument) => {
    window.showTextDocument(doc, ViewColumn.Beside, true);
  });
};
