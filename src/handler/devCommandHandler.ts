import { EndOfLine, QuickPickItem, QuickPickOptions, Selection, TextEditor, window } from 'vscode';
import { openTextDocument } from '../common';
import { assertDevInputLength, DevInputError, isBlank } from './devCommon';
import { DEV_COMMAND_ENTRIES, DevCommandEntry, DevContext, DevQuickPickItem } from './devTransforms';
import { EncOutputTooLargeError, MAX_OUTPUT_LENGTH } from './encodeTransforms';

/** How the handlers tell the user what happened. */
export interface DevNotifier {
  showWarningMessage(message: string): Thenable<unknown>;
  showErrorMessage(message: string): Thenable<unknown>;
}

/** A quick pick item that carries the value of its DevQuickPickItem. */
export interface DevPickItem extends QuickPickItem {
  value: string;
}

/** What the handlers need from VS Code; replaced in tests. */
export interface DevDependencies {
  notifier: DevNotifier;
  /** Opens a result in a new read-only editor. */
  openResult: (content: string) => Thenable<unknown>;
  /** Asks for one of the choices of a command (`undefined` = cancelled). */
  showQuickPick: (items: DevPickItem[], options: QuickPickOptions) => Thenable<DevPickItem | undefined>;
}

const defaultDependencies: DevDependencies = {
  notifier: window,
  openResult: (content) => openTextDocument(content),
  showQuickPick: (items, options) => window.showQuickPick(items, options),
};

export const DEV_NOTHING_SELECTED = 'Select the text to convert.';

const NOT_CHANGED = 'The selection was not changed: ';
const NOT_SHOWN = 'No result was shown: ';

const prefixOf = (entry: DevCommandEntry): string => (entry.output === 'replace' ? NOT_CHANGED : NOT_SHOWN);

const documentEol = (textEditor: TextEditor): string =>
  textEditor.document.eol === EndOfLine.CRLF ? '\r\n' : '\n';

/**
 * The selections to work on, in document order: empty selections are skipped, and so are
 * selections of only spaces, tabs and line breaks unless the command converts those too.
 */
const targetSelections = (textEditor: TextEditor, entry: DevCommandEntry): Selection[] =>
  textEditor.selections
    .filter((selection) => !selection.isEmpty && (entry.acceptsBlank || !isBlank(textEditor.document.getText(selection))))
    .sort((a, b) => a.start.compareTo(b.start));

const isExpected = (error: unknown): boolean => error instanceof DevInputError || error instanceof EncOutputTooLargeError;

/**
 * Logs an unexpected failure so it can be traced: only the error name and the stack frames, never
 * the message, which may quote the selected text.
 */
const logUnexpected = (error: unknown): void => {
  if (isExpected(error)) {
    return;
  }
  const name = error instanceof Error ? error.name : typeof error;
  const frames = error instanceof Error && typeof error.stack === 'string'
    ? error.stack.split('\n').filter((line) => /^\s+at /.test(line)).join('\n')
    : '';
  console.error(`Selection Manipulator: a developer command failed unexpectedly (${name})${frames === '' ? '' : `\n${frames}`}`);
};

/** The text of an error: the message of an input error, a fixed text for anything unexpected. */
const reasonOf = (error: unknown): string => {
  if (error instanceof DevInputError) {
    return error.message;
  }
  logUnexpected(error);
  return 'the text could not be processed';
};

interface SelectionPosition {
  index: number;
  count: number;
}

/** Shows why nothing was changed or shown. Not awaited: the Thenable only settles when the notification is dismissed. */
const notifyFailure = (dependencies: DevDependencies, prefix: string, error: unknown, position?: SelectionPosition): void => {
  if (error instanceof EncOutputTooLargeError) {
    void dependencies.notifier.showWarningMessage(`${prefix}${error.message}. Select less text.`);
    return;
  }
  const where = position !== undefined && position.count > 1 ? `selection ${position.index + 1} of ${position.count}: ` : '';
  void dependencies.notifier.showErrorMessage(`${prefix}${where}${reasonOf(error)}`);
};

interface Converted {
  selection: Selection;
  text: string;
  result: string;
}

/**
 * Converts every selection (in document order) with the transform of the command. Each selection
 * gets what is left of MAX_OUTPUT_LENGTH as its budget. Returns `undefined` (after telling the
 * user why) when a selection cannot be converted or the limit is exceeded.
 */
const convertSelections = (
  textEditor: TextEditor,
  dependencies: DevDependencies,
  entry: DevCommandEntry,
  selections: readonly Selection[],
  context: DevContext,
  separatorLength: number
): Converted[] | undefined => {
  const results: Converted[] = [];
  let total = 0;
  let current = 0;
  try {
    for (const [index, selection] of selections.entries()) {
      current = index;
      const text = textEditor.document.getText(selection);
      assertDevInputLength(text);
      const used = total + (index > 0 ? separatorLength : 0);
      const result = entry.transform(text, context, MAX_OUTPUT_LENGTH - used);
      total = used + result.length;
      if (total > MAX_OUTPUT_LENGTH) {
        throw new EncOutputTooLargeError(total, MAX_OUTPUT_LENGTH);
      }
      results.push({ selection, text, result });
    }
  } catch (error) {
    notifyFailure(dependencies, prefixOf(entry), error, { index: current, count: selections.length });
    return undefined;
  }
  return results;
};

/**
 * Runs the command on the selections and puts the result where the command puts it: a new editor
 * (the results of the selections joined with the document's EOL) or the selections (only those
 * whose result differs, in one edit). When any selection fails, nothing is edited or opened and
 * the user is told which selection and why.
 */
const applyTransform = async (
  textEditor: TextEditor,
  dependencies: DevDependencies,
  entry: DevCommandEntry,
  selections: readonly Selection[],
  context: DevContext
): Promise<void> => {
  const eol = context.eol;
  const results = convertSelections(textEditor, dependencies, entry, selections, context, entry.output === 'replace' ? 0 : eol.length);
  if (results === undefined) {
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

const pickItems = (items: readonly DevQuickPickItem[]): DevPickItem[] =>
  items.map(({ label, description, value }) => (description === undefined ? { label, value } : { label, description, value }));

/**
 * The DEV-001..035 commands by command name (without `selection-manipulator.`). The dependencies
 * (and, in tests, the command table) can be replaced.
 */
export const devCommandHandlerInternal = (dependencies: DevDependencies, entries: readonly DevCommandEntry[] = DEV_COMMAND_ENTRIES) =>
  (name: string) => {
    const entry = entries.find((candidate) => candidate.name === name);
    if (!entry) {
      throw new Error(`Unknown DEV command: ${name}`);
    }
    return async (textEditor: TextEditor): Promise<void> => {
      try {
        if (targetSelections(textEditor, entry).length === 0) {
          void dependencies.notifier.showWarningMessage(DEV_NOTHING_SELECTED);
          return;
        }
        let choice: string | undefined;
        if (entry.quickPick !== undefined) {
          const picked = await dependencies.showQuickPick(pickItems(entry.quickPick.items), {
            placeHolder: entry.quickPick.placeHolder,
            ignoreFocusOut: true,
          });
          if (picked === undefined) {
            return;
          }
          if (!entry.quickPick.items.some((item) => item.value === picked.value)) {
            // Checked again in case something that was not offered comes back anyway.
            return;
          }
          choice = picked.value;
        }
        // The selections are read again: the document may have changed while the quick pick was open.
        const selections = targetSelections(textEditor, entry);
        if (selections.length === 0) {
          void dependencies.notifier.showWarningMessage(DEV_NOTHING_SELECTED);
          return;
        }
        const context: DevContext = { eol: documentEol(textEditor), choice };
        await applyTransform(textEditor, dependencies, entry, selections, context);
      } catch (error) {
        // Last resort: an unexpected failure is reported instead of escaping to VS Code.
        void dependencies.notifier.showErrorMessage(`${prefixOf(entry)}${reasonOf(error)}`);
      }
    };
  };

export const devCommandHandler = devCommandHandlerInternal(defaultDependencies);
