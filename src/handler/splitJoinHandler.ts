import {
  InputBoxOptions,
  TextEditor,
  window,
} from 'vscode';
import * as vscode from 'vscode';
import { openTextDocument } from '../common';
import { applyEdit, EditGuardDeps, ensureUnchangedAfterInput } from '../editGuard';

export const processSplitJoin = (text: string, delimiter: string, type: 'split' | 'join'): string => {
  if (type === 'split') {
    return text.split(delimiter).join('\n');
  } else {
    // Join: split by newline (default line separator) and join with delimiter
    return text.split(/\r\n|\r|\n/).join(delimiter);
  }
};

type SplitJoinType = 'split' | 'join';
type SplitJoinMode = 'replace' | 'clipboard' | 'new-tab';

export const splitJoinHandlerInternal = (
  showInputBox: (options: InputBoxOptions) => Thenable<string | undefined>,
  guard: EditGuardDeps = {}
) => (type: SplitJoinType, mode: SplitJoinMode = 'replace') => async (textEditor: TextEditor): Promise<void> => {
  if (textEditor.selections.length === 0) {
    return;
  }
  const versionBeforeInput = textEditor.document.version;

  const delimiter = await showInputBox({
    placeHolder: 'Enter delimiter',
    prompt: type === 'split' ? 'Enter character(s) to split by' : 'Enter character(s) to join with',
  });

  if (!delimiter) {
    return;
  }
  if (!ensureUnchangedAfterInput(textEditor, versionBeforeInput, guard)) {
    return;
  }
  // Re-read the selections: they may have moved while the input box was open.
  const selections = textEditor.selections;
  if (selections.length === 0) {
    return;
  }

  if (mode === 'replace') {
    await applyEdit(textEditor, (editBuilder) => {
      selections.forEach((selection) => {
        const text = textEditor.document.getText(selection);
        const newText = processSplitJoin(text, delimiter, type);
        editBuilder.replace(selection, newText);
      });
    }, { notifier: guard.notifier });
  } else {
    // Clipboard / new tab: process every selection and join the results with newlines.
    const results = selections.map(selection => {
      const text = textEditor.document.getText(selection);
      return processSplitJoin(text, delimiter, type);
    });

    const content = results.join('\n');
    if (mode === 'clipboard') {
      await vscode.env.clipboard.writeText(content);
    } else {
      openTextDocument(content);
    }
  }
};

export const splitJoinHandler: (type: SplitJoinType, mode?: SplitJoinMode) => (textEditor: TextEditor) => Promise<void> = (type, mode = 'replace') =>
  splitJoinHandlerInternal((options) => window.showInputBox(options))(type, mode);
