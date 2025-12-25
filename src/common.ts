import {
  workspace,
  window,
  TextEditor,
  TextDocument,
  ViewColumn,
  TextEditorDecorationType,
  DecorationRangeBehavior,
  Range,
} from 'vscode';

export const openTextDocument = (content: string, func?: (doc: TextDocument, editor: TextEditor) => void) => {
  const viewColumn = window.activeTextEditor?.viewColumn;
  const openViewColumn = viewColumn === 1 ? ViewColumn.Beside : viewColumn;
  return workspace.openTextDocument({
    content: content,
    language: "text"
  }).then((doc: TextDocument) => {
    return window.showTextDocument(doc, openViewColumn, true).then((editor: TextEditor) => {
      if (func) {
        func(doc, editor);
      }
    });
  });
};

const titleDecorator: TextEditorDecorationType = window.createTextEditorDecorationType({
  fontWeight: 'bold',
  light: {
    color: 'rgba(104, 183, 161, 1)',
  },
  dark: {
    color: 'rgba(104, 183, 161, 1)',
  },
  rangeBehavior: DecorationRangeBehavior.ClosedClosed
});

export const openTextDocumentWithTitles = (zip: string[][]) => {
  const trimZip = zip.map(([selectedText, result]) => [selectedText.trim(), result.replaceAll('\r', '').trim()]);
  const content = trimZip.map(([selectedText, result]) => `${selectedText}\n${result}\n`).join('\n').trim();
  return openTextDocument(content, (doc: TextDocument, editor: TextEditor) => {
    const ranges: Range[] = [];
    let currentIndex = 0;
    trimZip.forEach(([title, value]) => {
      var startPos = doc.positionAt(currentIndex);
      var endPos = doc.positionAt(currentIndex + title.length);
      ranges.push(new Range(startPos, endPos));
      currentIndex = currentIndex + title.length + value.length + 3;
    });
    editor.setDecorations(titleDecorator, ranges);
  });
};
