import { EndOfLine, InputBoxOptions, Selection, TextEditor, window } from 'vscode';
import { openTextDocument } from '../common';
import { EncOutputTooLargeError } from './encodeTransforms';
import {
  TEXT2_COMMAND_ENTRIES,
  TEXT2_MAX_INPUT_LENGTH,
  TEXT2_MAX_OUTPUT_LENGTH,
  Text2CommandEntry,
  Text2Context,
  Text2InputError,
} from './text2Transforms';

/** How the handlers tell the user what happened. */
export interface Text2Notifier {
  showInformationMessage(message: string): Thenable<unknown>;
  showWarningMessage(message: string): Thenable<unknown>;
  showErrorMessage(message: string): Thenable<unknown>;
}

/** What the handlers need from VS Code; replaced in tests. */
export interface Text2Dependencies {
  notifier: Text2Notifier;
  showInputBox: (options: InputBoxOptions) => Thenable<string | undefined>;
  /** Opens a result in a new read-only editor. */
  openResult: (content: string) => Thenable<unknown>;
}

const defaultDependencies: Text2Dependencies = {
  notifier: window,
  showInputBox: (options) => window.showInputBox(options),
  openResult: (content) => openTextDocument(content),
};

export const TEXT2_NOTHING_SELECTED = 'Select the text to transform.';
export const TEXT2_NOT_CHANGED = 'The selection was not changed: ';
export const TEXT2_NOT_SHOWN = 'No result was shown: ';

const prefixOf = (entry: Text2CommandEntry): string => (entry.output === 'replace' ? TEXT2_NOT_CHANGED : TEXT2_NOT_SHOWN);

/** The non-empty selections, in document order. */
const targetSelections = (textEditor: TextEditor): Selection[] =>
  textEditor.selections
    .filter((selection) => !selection.isEmpty)
    .sort((a, b) => a.start.compareTo(b.start));

/**
 * Logs an unexpected failure so it can be traced: only the error name and the stack frames, never
 * the message, which may quote the selected text.
 */
const logUnexpected = (error: unknown): void => {
  const name = error instanceof Error ? error.name : typeof error;
  const frames = error instanceof Error && typeof error.stack === 'string'
    ? error.stack.split('\n').filter((line) => /^\s+at /.test(line)).join('\n')
    : '';
  console.error(`Selection Manipulator: a text transform command failed unexpectedly (${name})${frames === '' ? '' : `\n${frames}`}`);
};

interface SelectionPosition {
  index: number;
  count: number;
}

/** Tells why nothing was changed or shown. Not awaited: the Thenable only settles when the notification is dismissed. */
const notifyFailure = (dependencies: Text2Dependencies, entry: Text2CommandEntry, error: unknown, position?: SelectionPosition): void => {
  const prefix = prefixOf(entry);
  if (error instanceof EncOutputTooLargeError) {
    void dependencies.notifier.showWarningMessage(`${prefix}${error.message}. Select less text or enter a smaller number.`);
    return;
  }
  if (error instanceof Text2InputError) {
    const where = position !== undefined && position.count > 1 ? `selection ${position.index + 1} of ${position.count}: ` : '';
    void dependencies.notifier.showWarningMessage(`${prefix}${where}${error.message}.`);
    return;
  }
  logUnexpected(error);
  void dependencies.notifier.showErrorMessage(`${prefix}the text could not be processed.`);
};

/**
 * Asks for every value of the command, once for all selections. Returns `undefined` when the user
 * cancels or (defensively, despite `validateInput`) a value that is not valid comes back.
 */
const askInputs = async (dependencies: Text2Dependencies, entry: Text2CommandEntry): Promise<string[] | undefined> => {
  const values: string[] = [];
  for (const step of entry.inputs ?? []) {
    const previous = [...values];
    const value = await dependencies.showInputBox({
      prompt: step.prompt,
      placeHolder: step.placeHolder,
      value: step.value,
      ignoreFocusOut: true,
      validateInput: (input) => step.validate(input, previous),
    });
    if (value === undefined || step.validate(value, previous) !== undefined) {
      return undefined;
    }
    values.push(value);
  }
  return values;
};

const totalLength = (textEditor: TextEditor, selections: readonly Selection[]): number =>
  selections.reduce((sum, selection) => sum + textEditor.document.getText(selection).length, 0);

const inputTooLong = (): Text2InputError =>
  new Text2InputError(`the selections are longer than ${TEXT2_MAX_INPUT_LENGTH.toLocaleString('en-US')} characters in total`);

/**
 * Runs the command: the values are asked first, then every selection is converted. Nothing is
 * edited or shown until all selections have been converted, so a failure in one selection (a
 * result over the output limit, a value that cannot be used) changes nothing. The replacements are
 * made in one edit (one undo restores the text).
 */
const run = async (textEditor: TextEditor, dependencies: Text2Dependencies, entry: Text2CommandEntry): Promise<void> => {
  if (targetSelections(textEditor).length === 0) {
    void dependencies.notifier.showWarningMessage(TEXT2_NOTHING_SELECTED);
    return;
  }
  if (totalLength(textEditor, targetSelections(textEditor)) > TEXT2_MAX_INPUT_LENGTH) {
    notifyFailure(dependencies, entry, inputTooLong());
    return;
  }
  const inputs = await askInputs(dependencies, entry);
  if (inputs === undefined) {
    return;
  }
  // The selections are read again: the document may have changed while the input boxes were open.
  const selections = targetSelections(textEditor);
  if (selections.length === 0) {
    void dependencies.notifier.showWarningMessage(TEXT2_NOTHING_SELECTED);
    return;
  }
  const texts = selections.map((selection) => textEditor.document.getText(selection));
  if (texts.reduce((sum, text) => sum + text.length, 0) > TEXT2_MAX_INPUT_LENGTH) {
    notifyFailure(dependencies, entry, inputTooLong());
    return;
  }
  const context: Text2Context = { eol: textEditor.document.eol === EndOfLine.CRLF ? '\r\n' : '\n', inputs };

  if (entry.output === 'new-tab') {
    let result: string;
    try {
      result = entry.combine!(texts, context, TEXT2_MAX_OUTPUT_LENGTH);
    } catch (error) {
      notifyFailure(dependencies, entry, error);
      return;
    }
    if (result === '') {
      void dependencies.notifier.showInformationMessage(entry.emptyMessage ?? 'Nothing was found in the selection.');
      return;
    }
    await dependencies.openResult(result);
    return;
  }

  const results: string[] = [];
  let total = 0;
  for (const [index, text] of texts.entries()) {
    let result: string;
    try {
      result = entry.transform!(text, context, TEXT2_MAX_OUTPUT_LENGTH - total);
      total += result.length;
      if (total > TEXT2_MAX_OUTPUT_LENGTH) {
        throw new EncOutputTooLargeError(total, TEXT2_MAX_OUTPUT_LENGTH);
      }
    } catch (error) {
      notifyFailure(dependencies, entry, error, { index, count: texts.length });
      return;
    }
    results.push(result);
  }
  const replacements = selections
    .map((selection, index) => ({ selection, text: texts[index], result: results[index] }))
    .filter(({ text, result }) => text !== result);
  if (replacements.length === 0) {
    return;
  }
  const applied = await textEditor.edit((editBuilder) => {
    replacements.forEach(({ selection, result }) => editBuilder.replace(selection, result));
  });
  if (!applied) {
    void dependencies.notifier.showWarningMessage(`${TEXT2_NOT_CHANGED}the editor did not accept the edit.`);
  }
};

/**
 * The TEXTX-001..023 commands by command name (without `selection-manipulator.`). The
 * dependencies (and, in tests, the command table) can be replaced.
 */
export const text2CommandHandlerInternal = (dependencies: Text2Dependencies, entries: readonly Text2CommandEntry[] = TEXT2_COMMAND_ENTRIES) =>
  (name: string) => {
    const entry = entries.find((candidate) => candidate.name === name);
    if (!entry) {
      throw new Error(`Unknown text transform command: ${name}`);
    }
    return async (textEditor: TextEditor): Promise<void> => {
      try {
        await run(textEditor, dependencies, entry);
      } catch (error) {
        // Last resort: an unexpected failure is reported instead of escaping to VS Code.
        notifyFailure(dependencies, entry, error);
      }
    };
  };

export const text2CommandHandler = text2CommandHandlerInternal(defaultDependencies);
