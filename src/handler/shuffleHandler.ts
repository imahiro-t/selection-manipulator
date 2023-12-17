import {
  TextEditor,
  workspace,
  window
} from 'vscode';

export const shuffleHandler: (textEditor: TextEditor) => void = (textEditor) => {
  if (textEditor.selections.length === 0) {
    return;
  }
  const array = textEditor.selections
    .map(selection => textEditor.document.getText(selection))
    .join("\n")
    .split("\n");
  if (array[array.length - 1] === '') {
    array.pop();
  }
  shuffleArray(array);
  const content = array.join("\n");
  workspace.openTextDocument({
    content: content,
    language: "text"
  }).then(doc => {
    window.showTextDocument(doc);
  });
};

const shuffleArray: (array: Array<any>) => void = array => {
  for (let i = array.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [array[i], array[j]] = [array[j], array[i]];
  }
};
