import {
  workspace,
  window,
  TextEditor,
  ViewColumn,
  Range,
  TextEditorDecorationType,
  TextDocument
} from 'vscode';

const titleDecorator: TextEditorDecorationType = window.createTextEditorDecorationType({
  'borderWidth': '2px',
  'borderRadius': '2px',
  'borderStyle': 'solid',
  'light': {
    'borderColor': 'rgba(104, 183, 161, 1)',
  },
  'dark': {
    'borderColor': 'rgba(104, 183, 161, 1)',
  }
});

const targetDecorator: TextEditorDecorationType = window.createTextEditorDecorationType({
  'light': {
    'backgroundColor': 'rgba(104, 183, 161, 1)',
    'color': 'rgba(0, 0, 0, 1.0)'
  },
  'dark': {
    'backgroundColor': 'rgba(104, 183, 161, 1)',
    'color': 'rgba(27, 27, 27, 1.0)'
  }
});

type flags = 'gi' | 'g';

export const regexpHandler: (flags: flags) => (textEditor: TextEditor) => void = (flags) => (textEditor) => {
  if (textEditor.selections.length === 0) {
    return;
  }
  const array = textEditor.selections
    .map(selection => textEditor.document.getText(selection))
    .join("\n")
    .split("\n");
  const pattern = array[0];
  const content = array.join("\n");
  const regex = RegExp(pattern, flags);

  workspace.openTextDocument({
    content: content,
    language: "text"
  }).then((doc: TextDocument) => {
    window.showTextDocument(doc, ViewColumn.Beside, true).then(editor => {
      const array = doc.getText().split("\n");
      const pattern = array.shift() ?? '';
      editor.setDecorations(titleDecorator, [new Range(doc.positionAt(0), doc.positionAt(pattern.length))]);
      const ranges: Range[] = [];
      let currentIndex = pattern.length + 1;
      array.forEach(value => {
        if (flags.indexOf('g') !== -1) {
          let results;
          while ((results = regex.exec(value)) !== null) {
            var startPos = doc.positionAt(currentIndex + results.index);
            var endPos = doc.positionAt(currentIndex + results.index + results[0].length);
            ranges.push(new Range(startPos, endPos));
          }
        } else {
          const results = regex.exec(value);
          if (results !== null) {
            var startPos = doc.positionAt(currentIndex + results.index);
            var endPos = doc.positionAt(currentIndex + results.index + results[0].length);
            ranges.push(new Range(startPos, endPos));
          }
        }
        currentIndex = currentIndex + value.length + 1;
      });
      editor.setDecorations(targetDecorator, ranges);
    });
  });
};
