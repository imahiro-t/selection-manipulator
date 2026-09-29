import { EndOfLine, QuickPickItem, QuickPickOptions, Range, Selection, TextEditor, TextEditorRevealType, window } from 'vscode';
import { openTextDocument } from '../common';
import { assertJaInputLength, isBlank, JaInputError, JaNoTargetError } from './jaCommon';
import { JA_COMMAND_ENTRIES, JaCommandEntry, JaContext, JaQuickPickItem } from './jaTransforms';
import { EncOutputTooLargeError, MAX_OUTPUT_LENGTH } from './encodeTransforms';

/** How the handlers tell the user what happened. */
export interface JaNotifier {
  showInformationMessage(message: string): Thenable<unknown>;
  showWarningMessage(message: string): Thenable<unknown>;
  showErrorMessage(message: string): Thenable<unknown>;
}

/** A quick pick item that carries the value of its JaQuickPickItem. */
export interface JaPickItem extends QuickPickItem {
  value: string;
}

/** What the handlers need from VS Code; replaced in tests. */
export interface JaDependencies {
  notifier: JaNotifier;
  /** Opens a result in a new read-only editor. */
  openResult: (content: string) => Thenable<unknown>;
  /** Asks for one of the choices of a command (`undefined` = cancelled). */
  showQuickPick: (items: JaPickItem[], options: QuickPickOptions) => Thenable<JaPickItem | undefined>;
}

const defaultDependencies: JaDependencies = {
  notifier: window,
  openResult: (content) => openTextDocument(content),
  showQuickPick: (items, options) => window.showQuickPick(items, options),
};

export const JA_NOTHING_SELECTED = 'Select the text to convert.';
/** `select`: the information message when a command gives no message of its own. */
export const JA_NO_MATCH = 'Nothing was found in the selection.';
/** `select`: upper limit of the number of ranges selected at once. */
export const JA_MAX_SELECT_RANGES = 10_000;
/** `select`: too many ranges in all selections together (so the message names no selection). */
class JaTooManyRangesError extends JaInputError {
  constructor() {
    super(`more than ${JA_MAX_SELECT_RANGES.toLocaleString('en-US')} places were found; select less text`);
    this.name = 'JaTooManyRangesError';
  }
}

const NOT_CHANGED = 'The selection was not changed: ';
const NOT_SHOWN = 'No result was shown: ';
const NOT_SELECTED = 'Nothing was selected: ';

const prefixOf = (entry: JaCommandEntry): string => {
  switch (entry.output) {
    case 'replace':
      return NOT_CHANGED;
    case 'select':
      return NOT_SELECTED;
    default:
      return NOT_SHOWN;
  }
};

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

const isExpected = (error: unknown): boolean => error instanceof JaInputError || error instanceof EncOutputTooLargeError;

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
  console.error(`Selection Manipulator: a Japanese text command failed unexpectedly (${name})${frames === '' ? '' : `\n${frames}`}`);
};

/** The text of an error: the message of an input error, a fixed text for anything unexpected. */
const reasonOf = (error: unknown): string => {
  if (error instanceof JaInputError) {
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
const notifyFailure = (dependencies: JaDependencies, prefix: string, error: unknown, position?: SelectionPosition): void => {
  if (error instanceof JaNoTargetError) {
    void dependencies.notifier.showWarningMessage(JA_NOTHING_SELECTED);
    return;
  }
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
  dependencies: JaDependencies,
  entry: JaCommandEntry,
  texts: readonly string[],
  selections: readonly Selection[],
  context: JaContext,
  separatorLength: number
): Converted[] | undefined => {
  const transform = entry.transform!;
  const results: Converted[] = [];
  let total = 0;
  let current = 0;
  try {
    for (const [index, selection] of selections.entries()) {
      current = index;
      const used = total + (index > 0 ? separatorLength : 0);
      const result = transform(texts[index], context, MAX_OUTPUT_LENGTH - used);
      total = used + result.length;
      if (total > MAX_OUTPUT_LENGTH) {
        throw new EncOutputTooLargeError(total, MAX_OUTPUT_LENGTH);
      }
      results.push({ selection, text: texts[index], result });
    }
  } catch (error) {
    notifyFailure(dependencies, prefixOf(entry), error, { index: current, count: selections.length });
    return undefined;
  }
  return results;
};

/** `select`: selects the ranges the command finds in every selection, or says that nothing was found. */
const selectRanges = (
  textEditor: TextEditor,
  dependencies: JaDependencies,
  entry: JaCommandEntry,
  texts: readonly string[],
  selections: readonly Selection[]
): void => {
  const document = textEditor.document;
  const found: Selection[] = [];
  let current = 0;
  try {
    for (const [index, selection] of selections.entries()) {
      current = index;
      const base = document.offsetAt(selection.start);
      for (const { start, end } of entry.select!(texts[index], JA_MAX_SELECT_RANGES - found.length)) {
        if (found.length === JA_MAX_SELECT_RANGES) {
          throw new JaTooManyRangesError();
        }
        found.push(new Selection(document.positionAt(base + start), document.positionAt(base + end)));
      }
    }
  } catch (error) {
    notifyFailure(dependencies, prefixOf(entry), error,
      error instanceof JaTooManyRangesError ? undefined : { index: current, count: selections.length });
    return;
  }
  if (found.length === 0) {
    void dependencies.notifier.showInformationMessage(entry.noMatchMessage ?? JA_NO_MATCH);
    return;
  }
  textEditor.selections = found;
  textEditor.revealRange(new Range(found[0].start, found[0].end), TextEditorRevealType.InCenterIfOutsideViewport);
};

/**
 * Runs the command on the selections and puts the result where the command puts it: a new editor
 * (the results of the selections joined with the document's EOL), the selections (only those whose
 * result differs, in one edit), a notification, or new selections. When anything fails, nothing is
 * edited, opened, shown or selected and the user is told why.
 */
const applyTransform = async (
  textEditor: TextEditor,
  dependencies: JaDependencies,
  entry: JaCommandEntry,
  selections: readonly Selection[],
  context: JaContext
): Promise<void> => {
  let texts: string[];
  let current = 0;
  try {
    texts = selections.map((selection, index) => {
      current = index;
      const text = textEditor.document.getText(selection);
      assertJaInputLength(text);
      return text;
    });
  } catch (error) {
    notifyFailure(dependencies, prefixOf(entry), error, { index: current, count: selections.length });
    return;
  }

  if (entry.output === 'notify') {
    let message: string;
    try {
      message = entry.combine!(texts, context);
    } catch (error) {
      notifyFailure(dependencies, prefixOf(entry), error);
      return;
    }
    void dependencies.notifier.showInformationMessage(message);
    return;
  }

  if (entry.output === 'select') {
    selectRanges(textEditor, dependencies, entry, texts, selections);
    return;
  }

  const eol = context.eol;
  const results = convertSelections(dependencies, entry, texts, selections, context, entry.output === 'replace' ? 0 : eol.length);
  if (results === undefined) {
    return;
  }
  if (entry.output === 'new-tab') {
    if (entry.emptyMessage !== undefined && results.every(({ result }) => result === '')) {
      void dependencies.notifier.showInformationMessage(entry.emptyMessage);
      return;
    }
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

const pickItems = (items: readonly JaQuickPickItem[]): JaPickItem[] =>
  items.map(({ label, description, value }) => (description === undefined ? { label, value } : { label, description, value }));

/**
 * The JA-001..035 commands by command name (without `selection-manipulator.`). The dependencies
 * (and, in tests, the command table) can be replaced.
 */
export const jaCommandHandlerInternal = (dependencies: JaDependencies, entries: readonly JaCommandEntry[] = JA_COMMAND_ENTRIES) =>
  (name: string) => {
    const entry = entries.find((candidate) => candidate.name === name);
    if (!entry) {
      throw new Error(`Unknown JA command: ${name}`);
    }
    return async (textEditor: TextEditor): Promise<void> => {
      try {
        if (targetSelections(textEditor).length === 0) {
          void dependencies.notifier.showWarningMessage(JA_NOTHING_SELECTED);
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
        const selections = targetSelections(textEditor);
        if (selections.length === 0) {
          void dependencies.notifier.showWarningMessage(JA_NOTHING_SELECTED);
          return;
        }
        const context: JaContext = { eol: documentEol(textEditor), choice };
        await applyTransform(textEditor, dependencies, entry, selections, context);
      } catch (error) {
        // Last resort: an unexpected failure is reported instead of escaping to VS Code.
        void dependencies.notifier.showErrorMessage(`${prefixOf(entry)}${reasonOf(error)}`);
      }
    };
  };

export const jaCommandHandler = jaCommandHandlerInternal(defaultDependencies);
