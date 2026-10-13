import { TextEditor, TextEditorEdit, window } from 'vscode';

/**
 * Shared guards for commands that wait for user input and then rewrite the
 * document, and for reporting edits the editor did not apply.
 *
 * - While an input box / quick pick is open, the document can be changed (a
 *   formatter, a reload, another extension) and the editor can be closed or
 *   hidden by switching tabs. `ensureEditorAfterInput` /
 *   `ensureUnchangedAfterInput` detect that after the input and tell the user
 *   the command was not run.
 * - `TextEditor.edit` resolves to false (or rejects, for a closed editor) when
 *   the edit is not applied. `applyEdit` turns that into a warning instead of
 *   failing silently.
 */

export interface EditGuardNotifier {
  showWarningMessage(message: string): Thenable<unknown>;
}

export interface EditGuardDeps {
  notifier?: EditGuardNotifier;
  /**
   * Test-only hook. Production callers never pass it, so the default
   * `isEditorAvailable` below is used.
   */
  isEditorAvailable?: (textEditor: TextEditor) => boolean;
}

export const EDITOR_GONE_MESSAGE = 'The command was not run: the editor was closed or switched while waiting for input.';
export const DOCUMENT_CHANGED_WHILE_INPUT_MESSAGE = 'The command was not run: the document was edited while waiting for input.';
export const TEXT_NOT_CHANGED = 'The text was not changed: ';
export const EDIT_REJECTED_REASON = 'the editor did not accept the edit.';
export const EDITOR_CLOSED_REASON = 'the editor was closed.';

/**
 * A TextEditor hidden by switching tabs is disposed by VS Code and can no
 * longer be edited, so "not among the visible editors" is treated the same as
 * "closed or switched".
 */
export const isEditorAvailable = (textEditor: TextEditor): boolean =>
  !textEditor.document.isClosed && window.visibleTextEditors.includes(textEditor);

const notify = (notifier: EditGuardNotifier | undefined, message: string): void => {
  void (notifier ?? window).showWarningMessage(message);
};

/** Call after the input has closed. Warns and returns false when the editor is gone. */
export const ensureEditorAfterInput = (textEditor: TextEditor, deps: EditGuardDeps = {}): boolean => {
  const available = (deps.isEditorAvailable ?? isEditorAvailable)(textEditor);
  if (!available) {
    notify(deps.notifier, EDITOR_GONE_MESSAGE);
  }
  return available;
};

/**
 * Call after the input has closed when the command must not run on a document
 * that changed while waiting. Warns and returns false when the editor is gone
 * or the document version differs from `versionBeforeInput`.
 */
export const ensureUnchangedAfterInput = (textEditor: TextEditor, versionBeforeInput: number, deps: EditGuardDeps = {}): boolean => {
  if (!ensureEditorAfterInput(textEditor, deps)) {
    return false;
  }
  if (textEditor.document.version !== versionBeforeInput) {
    notify(deps.notifier, DOCUMENT_CHANGED_WHILE_INPUT_MESSAGE);
    return false;
  }
  return true;
};

export interface ApplyEditOptions {
  notifier?: EditGuardNotifier;
  /** Prefix of the warning; defaults to `TEXT_NOT_CHANGED`. */
  prefix?: string;
}

/**
 * `textEditor.edit(build)` that warns the user when the edit is not applied.
 * Resolves to true only when the edit was applied.
 */
export const applyEdit = async (
  textEditor: TextEditor,
  build: (editBuilder: TextEditorEdit) => void,
  options: ApplyEditOptions = {}
): Promise<boolean> => {
  const prefix = options.prefix ?? TEXT_NOT_CHANGED;
  let applied: boolean;
  try {
    applied = await textEditor.edit(build);
  } catch (error) {
    // `edit` on a disposed (closed / hidden) editor rejects. Any other
    // rejection on a live editor (e.g. overlapping ranges from `build`) is a
    // programming error and is rethrown rather than reported as "closed".
    if (isEditorAvailable(textEditor)) {
      throw error;
    }
    notify(options.notifier, `${prefix}${EDITOR_CLOSED_REASON}`);
    return false;
  }
  if (!applied) {
    notify(options.notifier, `${prefix}${EDIT_REJECTED_REASON}`);
  }
  return applied;
};
