/**
 * Shared handler-side helpers of the category commands (NUM, TABLE, JA, DATE, GEN, DEV, UNI, ...):
 * the notifier interfaces, the document's line break, the fixed beginnings of the notifications,
 * the position of a selection in a message, the order of the selections, the edit that replaces
 * the changed selections and the log of an unexpected failure.
 *
 * Only what is the same in every category is here. What differs (which errors are expected, the
 * fixed reason of an unexpected failure, which errors are warnings, the advice after the output
 * limit) stays in each handler.
 *
 * This module depends on vscode: the vscode-independent modules (`*Common.ts`, `*Transforms.ts`)
 * must not import it (they use `textCommon.ts`).
 */
import { EndOfLine, Selection, TextEditor } from 'vscode';
import { applyEdit } from '../editGuard';
import { isBlank } from './textCommon';

/** How a handler tells the user why nothing was changed or shown. */
export interface CommandNotifier {
  showWarningMessage(message: string): Thenable<unknown>;
  showErrorMessage(message: string): Thenable<unknown>;
}

/** How a handler tells the user about a result, or why nothing was changed or shown. */
export interface InfoCommandNotifier extends CommandNotifier {
  showInformationMessage(message: string): Thenable<unknown>;
}

/** The beginning of a notification when a command that replaces the selections changed nothing. */
export const NOT_CHANGED = 'The selection was not changed: ';
/** The beginning of a notification when a command that opens a new editor showed nothing. */
export const NOT_SHOWN = 'No result was shown: ';

/** The line break of the document (`\r\n` or `\n`). */
export const documentEol = (textEditor: TextEditor): string =>
  textEditor.document.eol === EndOfLine.CRLF ? '\r\n' : '\n';

/** `selection N of M: ` (from 1) when there are several selections, `''` otherwise. */
export const selectionLabel = (index: number, count: number): string =>
  count > 1 ? `selection ${index + 1} of ${count}: ` : '';

/**
 * The selections to work on, in document order: empty selections and selections of only spaces,
 * tabs and line breaks are skipped.
 */
export const nonBlankSelections = (textEditor: TextEditor): Selection[] =>
  textEditor.selections
    .filter((selection) => !selection.isEmpty && !isBlank(textEditor.document.getText(selection)))
    .sort((a, b) => a.start.compareTo(b.start));

/** A selection, its text when the command ran, and the text that replaces it. */
export interface Replacement {
  selection: Selection;
  text: string;
  result: string;
}

/** Replaces, in one edit, every selection whose result differs from its text (nothing when none does). */
export const replaceChangedSelections = async (
  textEditor: TextEditor,
  results: readonly Replacement[],
  notifier: CommandNotifier
): Promise<void> => {
  const replacements = results.filter(({ text, result }) => text !== result);
  if (replacements.length > 0) {
    await applyEdit(textEditor, (editBuilder) => {
      replacements.forEach(({ selection, result }) => editBuilder.replace(selection, result));
    }, { notifier });
  }
};

/**
 * The log line of an unexpected failure of `what` (for example `a number command`): only the error
 * name and the stack frames, never the message, which may quote the selected text.
 */
export const unexpectedFailureLog = (what: string, error: unknown): string => {
  const name = error instanceof Error ? error.name : typeof error;
  const frames = error instanceof Error && typeof error.stack === 'string'
    ? error.stack.split('\n').filter((line) => /^\s+at /.test(line)).join('\n')
    : '';
  return `Selection Manipulator: ${what} failed unexpectedly (${name})${frames === '' ? '' : `\n${frames}`}`;
};

/**
 * Logs an unexpected failure (a bug, or a RangeError from a huge value) so it can be traced (see
 * `unexpectedFailureLog`). Whether a failure is expected is decided by the caller.
 */
export const logUnexpectedFailure = (what: string, error: unknown, log: (message: string) => void = console.error): void => {
  log(unexpectedFailureLog(what, error));
};
