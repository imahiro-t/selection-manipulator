import {
  TextEditor,
} from 'vscode';
import { openTextDocument } from '../common';

export const countUpListHandler: (textEditor: TextEditor) => Thenable<void> = (textEditor) => {
  let selectedText = textEditor.document.getText(textEditor.selection);
  if (!selectedText) {
    return Promise.resolve();
  }
  const ranges = selectedText.split('-');
  let from;
  let to;
  if (ranges.length === 2) {
    from = Number(ranges[0].trim());
    to = Number(ranges[1].trim());
  } else {
    from = 1;
    to = Number(ranges[0].trim());
  }
  if (to - from > 99999) {
    return Promise.resolve();
  }
  const array = [];
  for (let i = from; i <= to; i++) {
    array.push(i.toString());
  }
  const content = array.join('\n');
  return openTextDocument(content).then(() => { });
};
