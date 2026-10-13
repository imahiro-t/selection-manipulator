import {
  InputBoxOptions,
  TextEditor,
  Selection,
  Position,
  window,
} from 'vscode';
import { EditGuardDeps, ensureUnchangedAfterInput } from '../editGuard';

type MultiSelectionType = 'all' | 'interval';

export const multiSelectionHandlerInternal = (
  showInputBox: (options: InputBoxOptions) => Thenable<string | undefined>,
  guard: EditGuardDeps = {}
) => (type: MultiSelectionType = 'all') => async (textEditor: TextEditor): Promise<void> => {
  let selectedText = textEditor.document.getText(textEditor.selection);
  if (!selectedText) {
    return;
  }

  let interval = 1;
  if (type === 'interval') {
    const versionBeforeInput = textEditor.document.version;
    const input = await showInputBox({
      placeHolder: 'Enter interval (n)',
      prompt: 'Select every n-th line from the selection',
      validateInput: (value) => {
        return /^[1-9]\d*$/.test(value) ? null : 'Please enter a positive integer';
      }
    });
    if (!input) {
      return;
    }
    if (!ensureUnchangedAfterInput(textEditor, versionBeforeInput, guard)) {
      return;
    }
    // Re-read the selection: it may have moved while the input box was open.
    selectedText = textEditor.document.getText(textEditor.selection);
    if (!selectedText) {
      return;
    }
    interval = parseInt(input, 10);
  }

  const start = textEditor.selection.start;
  const array = selectedText.trimEnd().split("\n");
  const selections: Array<Selection> = [];
  array.forEach((value, index) => {
    if (index % interval !== 0) {
      return;
    }
    const startCharacter = index === 0 ? start.character : 0;
    const endCharacter = index === 0 ? start.character + value.length : value.length;
    const line = start.line + index;
    selections.push(new Selection(new Position(line, startCharacter), new Position(line, endCharacter)));
  });
  textEditor.selections = selections;
};

export const multiSelectionHandler: (type?: MultiSelectionType) => (textEditor: TextEditor) => Promise<void> = (type = 'all') =>
  multiSelectionHandlerInternal((options) => window.showInputBox(options))(type);
