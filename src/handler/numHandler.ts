import { EndOfLine, InputBoxOptions, Selection, TextEditor, window } from 'vscode';
import { openTextDocument } from '../common';
import { EncOutputTooLargeError, MAX_OUTPUT_LENGTH } from './encodeTransforms';
import { assertNumInputLength, findNumPromptProblem, isBlank, NumInputError, NumLimitError, NumNoNumbersError } from './numCommon';
import { NUM_COMMAND_ENTRIES, NumCommandEntry, NumPrompt, NumRun } from './numTransforms';

/** How the handlers tell the user why nothing was changed or shown. */
export interface NumNotifier {
  showWarningMessage(message: string): Thenable<unknown>;
  showErrorMessage(message: string): Thenable<unknown>;
}

/** What the handlers need from VS Code; replaced in tests. */
export interface NumDependencies {
  notifier: NumNotifier;
  /** Opens a result in a new read-only editor. */
  openResult: (content: string) => Thenable<unknown>;
  /** Asks for a percentile, a number of digits, a locale or a base. */
  showInputBox: (options: InputBoxOptions) => Thenable<string | undefined>;
}

export const defaultNumDependencies: NumDependencies = {
  notifier: window,
  openResult: (content) => openTextDocument(content),
  showInputBox: (options) => window.showInputBox(options),
};

export const NUM_NOTHING_SELECTED = 'Select the numbers to use.';
const NOT_CHANGED = 'The selection was not changed: ';
const NOT_SHOWN = 'No result was shown: ';

const prefixOf = (entry: NumCommandEntry): string => (entry.output === 'new-tab' ? NOT_SHOWN : NOT_CHANGED);

const documentEol = (textEditor: TextEditor): string =>
  textEditor.document.eol === EndOfLine.CRLF ? '\r\n' : '\n';

/**
 * The selections to work on, in document order: empty selections and selections of only spaces,
 * tabs and line breaks are skipped.
 */
const targetSelections = (textEditor: TextEditor): Selection[] =>
  textEditor.selections
    .filter((selection) => !selection.isEmpty && !isBlank(textEditor.document.getText(selection)))
    .sort((a, b) => a.start.compareTo(b.start));

const entryOf = (entries: readonly NumCommandEntry[], name: string): NumCommandEntry => {
  const entry = entries.find((candidate) => candidate.name === name);
  if (!entry) {
    throw new Error(`Unknown NUM command: ${name}`);
  }
  return entry;
};

/** The options of an input box; nothing typed is saved. */
export const inputBoxOptions = (prompt: NumPrompt): InputBoxOptions => ({
  prompt: prompt.prompt,
  placeHolder: prompt.placeHolder,
  ignoreFocusOut: true,
  validateInput: (value) => findNumPromptProblem(value, prompt.rule),
});

const isExpected = (error: unknown): boolean => error instanceof NumInputError || error instanceof EncOutputTooLargeError;

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
  console.error(`Selection Manipulator: a number command failed unexpectedly (${name})${frames === '' ? '' : `\n${frames}`}`);
};

/** The text of an error: the message of an input error, a fixed text for anything unexpected. */
const reasonOf = (error: unknown): string => {
  if (error instanceof NumInputError) {
    return error.message;
  }
  logUnexpected(error);
  if (error instanceof RangeError) {
    return 'the result is too large';
  }
  return 'the numbers could not be processed';
};

interface SelectionPosition {
  index: number;
  count: number;
}

/** Shows why nothing was changed or shown. Not awaited: the Thenable only settles when the notification is dismissed. */
const notifyFailure = (dependencies: NumDependencies, prefix: string, error: unknown, position?: SelectionPosition): void => {
  if (error instanceof EncOutputTooLargeError) {
    void dependencies.notifier.showWarningMessage(`${prefix}${error.message}. Select less text.`);
    return;
  }
  const where = position !== undefined && position.count > 1 ? `selection ${position.index + 1} of ${position.count}: ` : '';
  const message = `${prefix}${where}${reasonOf(error)}`;
  void (error instanceof NumNoNumbersError || error instanceof NumLimitError
    ? dependencies.notifier.showWarningMessage(message)
    : dependencies.notifier.showErrorMessage(message));
};

/**
 * Converts every selection (in document order), then opens the results in one new editor (one
 * line per selection, joined with the document's EOL) or replaces each selection whose result
 * differs. Each selection gets what is left of MAX_OUTPUT_LENGTH as its budget. When a selection
 * cannot be converted or the limit is exceeded, nothing is edited or opened and the user is told why.
 */
const applyTransform = async (
  textEditor: TextEditor,
  dependencies: NumDependencies,
  entry: NumCommandEntry,
  selections: readonly Selection[],
  inputs: readonly string[]
): Promise<void> => {
  const eol = documentEol(textEditor);
  const separator = entry.output === 'new-tab' ? eol.length : 0;
  const results: { selection: Selection; text: string; result: string }[] = [];
  const run: NumRun = { work: 0 };
  let total = 0;
  let current = 0;
  try {
    for (const [index, selection] of selections.entries()) {
      current = index;
      const text = textEditor.document.getText(selection);
      assertNumInputLength(text);
      const used = total + (index > 0 ? separator : 0);
      const result = entry.transform(text, inputs, MAX_OUTPUT_LENGTH - used, run);
      total = used + result.length;
      if (total > MAX_OUTPUT_LENGTH) {
        throw new EncOutputTooLargeError(total, MAX_OUTPUT_LENGTH);
      }
      results.push({ selection, text, result });
    }
  } catch (error) {
    notifyFailure(dependencies, prefixOf(entry), error, { index: current, count: selections.length });
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

/**
 * Asks the questions of the command once (for all selections). Returns the answers (trimmed), or
 * `undefined` when one was cancelled or refused (then nothing else happens).
 */
const askPrompts = async (dependencies: NumDependencies, entry: NumCommandEntry): Promise<string[] | undefined> => {
  const answers: string[] = [];
  for (const prompt of entry.prompts) {
    const value = await dependencies.showInputBox(inputBoxOptions(prompt));
    if (value === undefined) {
      return undefined;
    }
    // Checked again in case a value that validateInput rejects comes back anyway.
    const problem = findNumPromptProblem(value, prompt.rule);
    if (problem !== undefined) {
      void dependencies.notifier.showWarningMessage(`${prefixOf(entry)}${problem}`);
      return undefined;
    }
    answers.push(value.trim());
  }
  const problem = entry.validateInputs?.(answers);
  if (problem !== undefined) {
    void dependencies.notifier.showWarningMessage(`${prefixOf(entry)}${problem}`);
    return undefined;
  }
  return answers;
};

/**
 * The commands of `entries` (the NUM-001..040 commands by default) by command name (without
 * `selection-manipulator.`). The dependencies can be replaced in tests.
 */
export const numHandlerInternal = (dependencies: NumDependencies, entries: readonly NumCommandEntry[] = NUM_COMMAND_ENTRIES) =>
  (name: string) => {
    const entry = entryOf(entries, name);
    return async (textEditor: TextEditor): Promise<void> => {
      try {
        if (targetSelections(textEditor).length === 0) {
          void dependencies.notifier.showWarningMessage(NUM_NOTHING_SELECTED);
          return;
        }
        const inputs = await askPrompts(dependencies, entry);
        if (inputs === undefined) {
          return;
        }
        // The selections are read again: the document may have changed while a prompt was open.
        const selections = targetSelections(textEditor);
        if (selections.length === 0) {
          void dependencies.notifier.showWarningMessage(NUM_NOTHING_SELECTED);
          return;
        }
        await applyTransform(textEditor, dependencies, entry, selections, inputs);
      } catch (error) {
        // Last resort: an unexpected failure is reported instead of escaping to VS Code.
        void dependencies.notifier.showErrorMessage(`${prefixOf(entry)}${reasonOf(error)}`);
      }
    };
  };

export const numHandler = numHandlerInternal(defaultNumDependencies);
