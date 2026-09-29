import { EndOfLine, InputBoxOptions, QuickPickOptions, Selection, TextEditor, window } from 'vscode';
import { openTextDocument } from '../common';
import { EncOutputTooLargeError, MAX_OUTPUT_LENGTH } from './encodeTransforms';
import { DataInputError } from './dataCommon';
import { assertTableInputLength, findPromptProblem, TableInputError } from './tableCsv';
import { TABLE_COMMAND_ENTRIES, TableCommandEntry, TableNotifyEntry, TablePrompt, TableTransformEntry } from './tableTransforms';

/** How the handlers tell the user about a result (TABLE-015 / 023) or why nothing was changed. */
export interface TableNotifier {
  showInformationMessage(message: string): Thenable<unknown>;
  showWarningMessage(message: string): Thenable<unknown>;
  showErrorMessage(message: string): Thenable<unknown>;
}

/** What the handlers need from VS Code; replaced in tests. */
export interface TableDependencies {
  notifier: TableNotifier;
  /** Opens a result in a new read-only editor. */
  openResult: (content: string) => Thenable<unknown>;
  /** Asks for a column, a table name, a value or a delimiter. */
  showInputBox: (options: InputBoxOptions) => Thenable<string | undefined>;
  /** TABLE-014: asks for the condition. */
  showQuickPick: (items: string[], options: QuickPickOptions) => Thenable<string | undefined>;
}

const defaultDependencies: TableDependencies = {
  notifier: window,
  openResult: (content) => openTextDocument(content),
  showInputBox: (options) => window.showInputBox(options),
  showQuickPick: (items, options) => window.showQuickPick(items, options),
};

const NOT_CHANGED = 'The selection was not changed: ';

const documentEol = (textEditor: TextEditor): string =>
  textEditor.document.eol === EndOfLine.CRLF ? '\r\n' : '\n';

/** The transforms return LF line breaks; the result follows the document's EOL. */
const withEol = (text: string, eol: string): string => (eol === '\n' ? text : text.replace(/\r?\n/g, eol));

/** The non-empty selections, in document order (empty selections are skipped). */
const targetSelections = (textEditor: TextEditor): Selection[] =>
  textEditor.selections
    .filter((selection) => !selection.isEmpty)
    .sort((a, b) => a.start.compareTo(b.start));

const entryOf = (name: string): TableCommandEntry => {
  const entry = TABLE_COMMAND_ENTRIES.find((candidate) => candidate.name === name);
  if (!entry) {
    throw new Error(`Unknown TABLE command: ${name}`);
  }
  return entry;
};

/** The options of an input box; nothing typed is saved. */
export const inputBoxOptions = (prompt: Extract<TablePrompt, { type: 'input' }>): InputBoxOptions => ({
  prompt: prompt.prompt,
  placeHolder: prompt.placeHolder,
  ignoreFocusOut: true,
  validateInput: (value) => findPromptProblem(value, prompt.rule),
});

const isExpected = (error: unknown): boolean =>
  error instanceof TableInputError || error instanceof DataInputError || error instanceof EncOutputTooLargeError;

/**
 * Logs an unexpected failure (a bug, or a RangeError from a huge value) so it can be traced: only
 * the error name and the stack frames, never the message, which may quote the selected text.
 */
const logUnexpected = (error: unknown): void => {
  if (isExpected(error)) {
    return;
  }
  const name = error instanceof Error ? error.name : typeof error;
  const frames = error instanceof Error && typeof error.stack === 'string'
    ? error.stack.split('\n').filter((line) => /^\s+at /.test(line)).join('\n')
    : '';
  console.error(`Selection Manipulator: a CSV / TSV command failed unexpectedly (${name})${frames === '' ? '' : `\n${frames}`}`);
};

/** The text of an error: the message of an input error, a fixed text for anything unexpected. */
const reasonOf = (error: unknown): string => {
  if (error instanceof TableInputError || error instanceof DataInputError) {
    return error.message;
  }
  logUnexpected(error);
  if (error instanceof RangeError) {
    return 'the table is too large to convert';
  }
  return 'the text could not be converted';
};

interface SelectionPosition {
  index: number;
  count: number;
}

/** Shows why nothing was changed. Not awaited: the Thenable only settles when the notification is dismissed. */
const notifyFailure = (dependencies: TableDependencies, error: unknown, position?: SelectionPosition): void => {
  if (error instanceof EncOutputTooLargeError) {
    void dependencies.notifier.showWarningMessage(`${NOT_CHANGED}${error.message}. Select less text.`);
    return;
  }
  const where = position !== undefined && position.count > 1 ? `selection ${position.index + 1} of ${position.count}: ` : '';
  void dependencies.notifier.showErrorMessage(`${NOT_CHANGED}${where}${reasonOf(error)}`);
};

/**
 * Converts every non-empty selection, then opens the results in one new editor (joined with the
 * document's EOL, in document order) or replaces each selection whose result differs. The results
 * of all selections share MAX_OUTPUT_LENGTH. When a selection cannot be converted or the limit is
 * exceeded, nothing is edited or opened and the user is told why.
 */
const applyTransform = async (
  textEditor: TextEditor,
  dependencies: TableDependencies,
  entry: TableTransformEntry,
  inputs: readonly string[]
): Promise<void> => {
  const selections = targetSelections(textEditor);
  if (selections.length === 0) {
    return;
  }
  const eol = documentEol(textEditor);
  const results: { selection: Selection; text: string; result: string }[] = [];
  let total = 0;
  let current = 0;
  try {
    for (const [index, selection] of selections.entries()) {
      current = index;
      const text = textEditor.document.getText(selection);
      assertTableInputLength(text);
      const result = withEol(entry.transform(text, inputs), eol);
      total += result.length + (index > 0 && entry.output === 'new-tab' ? eol.length : 0);
      if (total > MAX_OUTPUT_LENGTH) {
        throw new EncOutputTooLargeError(total, MAX_OUTPUT_LENGTH);
      }
      results.push({ selection, text, result });
    }
  } catch (error) {
    notifyFailure(dependencies, error, { index: current, count: selections.length });
    return;
  }
  if (entry.output === 'new-tab') {
    await dependencies.openResult(results.map(({ result }) => result).join(eol));
    return;
  }
  const replacements = results.filter(({ text, result }) => text !== result);
  if (replacements.length > 0) {
    await textEditor.edit((editBuilder) => {
      replacements.forEach(({ selection, result }) => editBuilder.replace(selection, result));
    });
  }
};

/** TABLE-015 / 023: notifies about every non-empty selection without changing anything. */
const applyNotify = (
  textEditor: TextEditor,
  dependencies: TableDependencies,
  entry: TableNotifyEntry,
  inputs: readonly string[]
): void => {
  const selections = targetSelections(textEditor);
  if (selections.length === 0) {
    return;
  }
  const messages: string[] = [];
  let warning = false;
  for (const [index, selection] of selections.entries()) {
    try {
      const notice = entry.notify(textEditor.document.getText(selection), inputs);
      messages.push(notice.message);
      warning = warning || notice.warning === true;
    } catch (error) {
      notifyFailure(dependencies, error, { index, count: selections.length });
      return;
    }
  }
  const message = messages.length === 1 ? messages[0] : messages.map((text, index) => `Selection ${index + 1}: ${text}`).join('; ');
  void (warning ? dependencies.notifier.showWarningMessage(message) : dependencies.notifier.showInformationMessage(message));
};

/**
 * Asks the questions of the command once (for all selections). Returns the answers, or
 * `undefined` when one was cancelled or refused (then nothing else happens).
 */
const askPrompts = async (dependencies: TableDependencies, prompts: readonly TablePrompt[]): Promise<string[] | undefined> => {
  const answers: string[] = [];
  for (const prompt of prompts) {
    if (prompt.type === 'pick') {
      const picked = await dependencies.showQuickPick([...prompt.items], { placeHolder: prompt.placeHolder, ignoreFocusOut: true });
      if (picked === undefined) {
        return undefined;
      }
      if (!prompt.items.includes(picked)) {
        void dependencies.notifier.showWarningMessage(`${NOT_CHANGED}choose one of ${prompt.items.join(', ')}.`);
        return undefined;
      }
      answers.push(picked);
      continue;
    }
    const value = await dependencies.showInputBox(inputBoxOptions(prompt));
    if (value === undefined) {
      return undefined;
    }
    // Checked again in case a value that validateInput rejects comes back anyway.
    const problem = findPromptProblem(value, prompt.rule);
    if (problem !== undefined) {
      void dependencies.notifier.showWarningMessage(`${NOT_CHANGED}${problem}`);
      return undefined;
    }
    answers.push(value);
  }
  return answers;
};

/** The TABLE-001..030 commands by command name (without `selection-manipulator.`). The dependencies can be replaced in tests. */
export const tableHandlerInternal = (dependencies: TableDependencies) =>
  (name: string) => {
    const entry = entryOf(name);
    return async (textEditor: TextEditor): Promise<void> => {
      try {
        if (targetSelections(textEditor).length === 0) {
          return;
        }
        const inputs = await askPrompts(dependencies, entry.prompts);
        if (inputs === undefined) {
          return;
        }
        // The selections are read again: the document may have changed while a prompt was open.
        if (entry.output === 'notify') {
          return applyNotify(textEditor, dependencies, entry, inputs);
        }
        return await applyTransform(textEditor, dependencies, entry, inputs);
      } catch (error) {
        // Last resort: an unexpected failure is reported instead of escaping to VS Code.
        void dependencies.notifier.showErrorMessage(`${NOT_CHANGED}${reasonOf(error)}`);
      }
    };
  };

export const tableHandler = tableHandlerInternal(defaultDependencies);
