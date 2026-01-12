import {
  TextEditor,
  window,
  Selection,
} from 'vscode';

// Export internal function for testing
export const selectMatchesHandlerInternal = (
  showInputBox: (options: import('vscode').InputBoxOptions) => Thenable<string | undefined>
) => async (textEditor: TextEditor) => {
  const selections = textEditor.selections;
  if (selections.length === 0) {
    return;
  }

  const searchString = await showInputBox({
    placeHolder: 'Enter string to select',
    prompt: 'Enter the string you want to select within the current selection(s)',
  });

  if (!searchString) {
    return;
  }

  const newSelections: Selection[] = [];
  const document = textEditor.document;

  selections.forEach((selection) => {
    const text = document.getText(selection);
    const startOffset = document.offsetAt(selection.start);
    let index = 0;

    while ((index = text.indexOf(searchString, index)) !== -1) {
      const matchStartOffset = startOffset + index;
      const matchEndOffset = matchStartOffset + searchString.length;

      const startPos = document.positionAt(matchStartOffset);
      const endPos = document.positionAt(matchEndOffset);

      newSelections.push(new Selection(startPos, endPos));

      index += searchString.length;
    }
  });

  if (newSelections.length > 0) {
    textEditor.selections = newSelections;
  }
};

// Main export used by extension
export const selectMatchesHandler = selectMatchesHandlerInternal(window.showInputBox);
