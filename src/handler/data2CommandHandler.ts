import { EndOfLine, InputBoxOptions, QuickPickOptions, Selection, TextEditor, window } from 'vscode';
import { openTextDocument } from '../common';
import { EncOutputTooLargeError, MAX_OUTPUT_LENGTH } from './encodeTransforms';
import { DataInputError } from './dataCommon';
import { TableInputError } from './tableCsv';
import { DATA2_COMMAND_ENTRIES, Data2CommandEntry, Data2NotifyEntry, Data2Prompt, Data2TransformEntry } from './data2Transforms';

/** How the handlers tell the user about a result (DATAX-013 / 016) or why nothing was changed. */
export interface Data2Notifier {
  showInformationMessage(message: string): Thenable<unknown>;
  showWarningMessage(message: string): Thenable<unknown>;
  showErrorMessage(message: string): Thenable<unknown>;
}

/** What the handlers need from VS Code; replaced in tests. */
export interface Data2Dependencies {
  notifier: Data2Notifier;
  /** Opens a result in a new read-only editor. */
  openResult: (content: string) => Thenable<unknown>;
  showInputBox: (options: InputBoxOptions) => Thenable<string | undefined>;
  /** DATAX-004: top level only or recursive. */
  showQuickPick: (items: string[], options: QuickPickOptions) => Thenable<string | undefined>;
  /** Logs an unexpected failure (never with the selected text or a typed value). */
  logError: (message: string) => void;
}

const defaultDependencies: Data2Dependencies = {
  notifier: window,
  openResult: (content) => openTextDocument(content),
  showInputBox: (options) => window.showInputBox(options),
  showQuickPick: (items, options) => window.showQuickPick(items, options),
  logError: (message) => console.error(message),
};

export const DATA2_NOT_CHANGED = 'The selection was not changed: ';

const documentEol = (textEditor: TextEditor): string =>
  textEditor.document.eol === EndOfLine.CRLF ? '\r\n' : '\n';

/** The transforms return LF line breaks; the result follows the document's EOL. */
const withEol = (text: string, eol: string): string => (eol === '\n' ? text : text.replace(/\r?\n/g, eol));

/** The non-empty selections, in document order (empty selections are skipped). */
const targetSelections = (textEditor: TextEditor): Selection[] =>
  textEditor.selections
    .filter((selection) => !selection.isEmpty)
    .sort((a, b) => a.start.compareTo(b.start));

/** The options of an input box; nothing typed is saved. */
export const data2InputBoxOptions = (prompt: Extract<Data2Prompt, { type: 'input' }>): InputBoxOptions => ({
  prompt: prompt.prompt,
  placeHolder: prompt.placeHolder,
  ignoreFocusOut: true,
  validateInput: prompt.validate,
});

/**
 * Logs an unexpected failure so it can be traced: only the error name and the stack frames, never
 * the message, which may quote the selected text or a typed value.
 */
const logUnexpected = (dependencies: Data2Dependencies, error: unknown): void => {
  const name = error instanceof Error ? error.name : typeof error;
  const frames = error instanceof Error && typeof error.stack === 'string'
    ? error.stack.split('\n').filter((line) => line.startsWith('    at ')).join('\n')
    : '';
  dependencies.logError(`Selection Manipulator: a data format command failed unexpectedly (${name})${frames === '' ? '' : `\n${frames}`}`);
};

/** The text of an error: the message of an input error, a fixed text for anything unexpected. */
const reasonOf = (dependencies: Data2Dependencies, error: unknown): string => {
  if (error instanceof DataInputError || error instanceof TableInputError) {
    return error.message;
  }
  logUnexpected(dependencies, error);
  if (error instanceof RangeError) {
    return 'the text is nested too deeply or is too large to convert';
  }
  return 'the text could not be converted';
};

/** Shows why nothing was changed. Not awaited: the Thenable only settles when the notification is dismissed. */
const notifyFailure = (dependencies: Data2Dependencies, error: unknown, index: number, count: number): void => {
  if (error instanceof EncOutputTooLargeError) {
    void dependencies.notifier.showWarningMessage(`${DATA2_NOT_CHANGED}${error.message}. Select less text.`);
    return;
  }
  const where = count > 1 ? `selection ${index + 1} of ${count}: ` : '';
  void dependencies.notifier.showErrorMessage(`${DATA2_NOT_CHANGED}${where}${reasonOf(dependencies, error)}`);
};

/**
 * Converts every non-empty selection, then opens the results in one new editor (joined with the
 * document's EOL, in document order). The results of all selections share MAX_OUTPUT_LENGTH.
 * When a selection cannot be converted or the limit is exceeded, nothing is opened and the user is
 * told why; the document is never edited.
 */
const applyTransform = async (
  textEditor: TextEditor,
  dependencies: Data2Dependencies,
  entry: Data2TransformEntry,
  inputs: readonly string[]
): Promise<void> => {
  const selections = targetSelections(textEditor);
  if (selections.length === 0) {
    return;
  }
  const eol = documentEol(textEditor);
  const results: string[] = [];
  let total = 0;
  for (const [index, selection] of selections.entries()) {
    try {
      const result = withEol(entry.transform(textEditor.document.getText(selection), inputs), eol);
      total += result.length + (index > 0 ? eol.length : 0);
      if (total > MAX_OUTPUT_LENGTH) {
        throw new EncOutputTooLargeError(total, MAX_OUTPUT_LENGTH);
      }
      results.push(result);
    } catch (error) {
      notifyFailure(dependencies, error, index, selections.length);
      return;
    }
  }
  await dependencies.openResult(results.join(eol));
};

/**
 * DATAX-013 / 016: checks every non-empty selection and shows one notification (an error when a
 * selection is not valid). The selected text is never quoted and the document is never changed.
 */
const applyCheck = (textEditor: TextEditor, dependencies: Data2Dependencies, entry: Data2NotifyEntry): void => {
  const selections = targetSelections(textEditor);
  if (selections.length === 0) {
    return;
  }
  const messages: string[] = [];
  let valid = true;
  for (const [index, selection] of selections.entries()) {
    try {
      const result = entry.check(textEditor.document.getText(selection));
      messages.push(result.message);
      valid = valid && result.valid;
    } catch (error) {
      notifyFailure(dependencies, error, index, selections.length);
      return;
    }
  }
  const message = messages.length === 1 ? messages[0] : messages.map((text, index) => `Selection ${index + 1}: ${text}`).join('; ');
  void (valid ? dependencies.notifier.showInformationMessage(message) : dependencies.notifier.showErrorMessage(message));
};

/**
 * Asks the questions of the command once (for all selections). Returns the answers, or
 * `undefined` when one was cancelled or refused (then nothing else happens).
 */
const askPrompts = async (dependencies: Data2Dependencies, prompts: readonly Data2Prompt[]): Promise<string[] | undefined> => {
  const answers: string[] = [];
  for (const prompt of prompts) {
    if (prompt.type === 'pick') {
      const picked = await dependencies.showQuickPick([...prompt.items], { placeHolder: prompt.placeHolder, ignoreFocusOut: true });
      if (picked === undefined) {
        return undefined;
      }
      if (!prompt.items.includes(picked)) {
        void dependencies.notifier.showWarningMessage(`${DATA2_NOT_CHANGED}choose one of ${prompt.items.join(', ')}.`);
        return undefined;
      }
      answers.push(picked);
      continue;
    }
    const value = await dependencies.showInputBox(data2InputBoxOptions(prompt));
    if (value === undefined) {
      return undefined;
    }
    // Checked again in case a value that validateInput rejects comes back anyway.
    const problem = prompt.validate(value);
    if (problem !== undefined) {
      void dependencies.notifier.showWarningMessage(`${DATA2_NOT_CHANGED}${problem}`);
      return undefined;
    }
    answers.push(value);
  }
  return answers;
};

const entryOf = (name: string): Data2CommandEntry => {
  const entry = DATA2_COMMAND_ENTRIES.find((candidate) => candidate.name === name);
  if (!entry) {
    throw new Error(`Unknown DATA2 command: ${name}`);
  }
  return entry;
};

/** The DATAX-001..024 commands by command name (without `selection-manipulator.`). The dependencies can be replaced in tests. */
export const data2CommandHandlerInternal = (dependencies: Data2Dependencies) =>
  (name: string) => {
    const entry = entryOf(name);
    return async (textEditor: TextEditor): Promise<void> => {
      try {
        if (targetSelections(textEditor).length === 0) {
          return;
        }
        if (entry.output === 'notify') {
          applyCheck(textEditor, dependencies, entry);
          return;
        }
        const inputs = await askPrompts(dependencies, entry.prompts);
        if (inputs === undefined) {
          return;
        }
        // The selections are read again: the document may have changed while a prompt was open.
        await applyTransform(textEditor, dependencies, entry, inputs);
      } catch (error) {
        // Last resort: an unexpected failure is reported instead of escaping to VS Code.
        notifyFailure(dependencies, error, 0, 1);
      }
    };
  };

export const data2CommandHandler = data2CommandHandlerInternal(defaultDependencies);
