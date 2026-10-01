import { env, EndOfLine, InputBoxOptions, Selection, TextEditor, window, workspace } from 'vscode';
import { openTextDocument } from '../common';
import {
  assertDateInputLength,
  DateInputError,
  DateSettingKey,
  findDatePromptProblem,
  isBlank,
  RawDateSettings,
  readDateSettings,
} from './dateCommon';
import { DATE_COMMAND_ENTRIES, DateCommandEntry, DateContext, DatePrompt } from './dateTransforms';
import { EncOutputTooLargeError, MAX_OUTPUT_LENGTH } from './encodeTransforms';

/** How the handlers tell the user what happened. */
export interface DateNotifier {
  showInformationMessage(message: string): Thenable<unknown>;
  showWarningMessage(message: string): Thenable<unknown>;
  showErrorMessage(message: string): Thenable<unknown>;
}

/** What the handlers need from VS Code; replaced in tests. */
export interface DateDependencies {
  notifier: DateNotifier;
  /** Opens a result in a new read-only editor. */
  openResult: (content: string) => Thenable<unknown>;
  /** Asks for a time zone, a pattern or a number. */
  showInputBox: (options: InputBoxOptions) => Thenable<string | undefined>;
  writeClipboard: (text: string) => Thenable<void>;
  /** The raw values of the `selection-manipulator.date.*` settings. */
  getSettings: () => RawDateSettings;
  /** The current time. */
  now: () => Date;
}

const SETTING_KEYS: readonly DateSettingKey[] = ['timeZones', 'weekdayLanguage', 'fiscalYearStartMonth'];

const defaultDependencies: DateDependencies = {
  notifier: window,
  openResult: (content) => openTextDocument(content),
  showInputBox: (options) => window.showInputBox(options),
  writeClipboard: (text) => env.clipboard.writeText(text),
  getSettings: () => {
    const configuration = workspace.getConfiguration('selection-manipulator.date');
    const raw: RawDateSettings = {};
    SETTING_KEYS.forEach((key) => {
      raw[key] = configuration.get<unknown>(key);
    });
    return raw;
  },
  now: () => new Date(),
};

export const DATE_NOTHING_SELECTED = 'Select the dates to use.';
export const DATE_COPIED = 'Copied the result to the clipboard.';
const NOT_CHANGED = 'The selection was not changed: ';
const NOT_SHOWN = 'No result was shown: ';
const NOT_COPIED = 'Nothing was copied: ';

const prefixOf = (entry: DateCommandEntry): string => {
  switch (entry.output) {
    case 'replace':
      return NOT_CHANGED;
    case 'clipboard':
      return NOT_COPIED;
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

const entryOf = (name: string, entries: readonly DateCommandEntry[]): DateCommandEntry => {
  const entry = entries.find((candidate) => candidate.name === name);
  if (!entry) {
    throw new Error(`Unknown DATE command: ${name}`);
  }
  return entry;
};

/** The options of an input box; nothing typed is saved. */
export const inputBoxOptions = (prompt: DatePrompt): InputBoxOptions => ({
  prompt: prompt.prompt,
  placeHolder: prompt.placeHolder,
  ignoreFocusOut: true,
  validateInput: (value) => findDatePromptProblem(value, prompt.rule),
});

const isExpected = (error: unknown): boolean => error instanceof DateInputError || error instanceof EncOutputTooLargeError;

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
  console.error(`Selection Manipulator: a date command failed unexpectedly (${name})${frames === '' ? '' : `\n${frames}`}`);
};

/** The text of an error: the message of an input error, a fixed text for anything unexpected. */
const reasonOf = (error: unknown): string => {
  if (error instanceof DateInputError) {
    return error.message;
  }
  logUnexpected(error);
  if (error instanceof RangeError) {
    return 'the date is out of range';
  }
  return 'the dates could not be processed';
};

interface SelectionPosition {
  index: number;
  count: number;
}

/** Shows why nothing was changed or shown. Not awaited: the Thenable only settles when the notification is dismissed. */
const notifyFailure = (dependencies: DateDependencies, prefix: string, error: unknown, position?: SelectionPosition): void => {
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
  dependencies: DateDependencies,
  entry: DateCommandEntry,
  texts: readonly string[],
  selections: readonly Selection[],
  inputs: readonly string[],
  context: DateContext,
  separatorLength: number
): Converted[] | undefined => {
  const results: Converted[] = [];
  let total = 0;
  let current = 0;
  try {
    for (const [index, selection] of selections.entries()) {
      current = index;
      const used = total + (index > 0 ? separatorLength : 0);
      const result = entry.transform(texts[index], inputs, context, MAX_OUTPUT_LENGTH - used);
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

/**
 * Runs the command on the selections and puts the result where the command puts it: a new editor
 * (the results of the selections joined with the document's EOL, or separated by an empty line),
 * the selections (only those whose result differs, in one edit), the clipboard, or a notification.
 * When anything fails, nothing is edited, opened, copied or shown and the user is told why.
 */
const applyTransform = async (
  textEditor: TextEditor,
  dependencies: DateDependencies,
  entry: DateCommandEntry,
  selections: readonly Selection[],
  inputs: readonly string[],
  context: DateContext
): Promise<void> => {
  const eol = context.eol;
  const separator = entry.output === 'new-tab' && entry.blankLineBetween ? eol + eol : eol;
  let texts: string[];
  let current = 0;
  try {
    texts = selections.map((selection, index) => {
      current = index;
      const text = textEditor.document.getText(selection);
      assertDateInputLength(text);
      return text;
    });
    current = -1;
    entry.precheck?.(texts);
  } catch (error) {
    notifyFailure(dependencies, prefixOf(entry), error, current >= 0 ? { index: current, count: selections.length } : undefined);
    return;
  }

  if (entry.combine) {
    let result: string;
    try {
      result = entry.combine(texts, inputs, context, MAX_OUTPUT_LENGTH);
      if (result.length > MAX_OUTPUT_LENGTH) {
        throw new EncOutputTooLargeError(result.length, MAX_OUTPUT_LENGTH);
      }
    } catch (error) {
      notifyFailure(dependencies, prefixOf(entry), error);
      return;
    }
    if (entry.output === 'notify') {
      void dependencies.notifier.showInformationMessage(result);
    } else {
      await dependencies.openResult(result);
    }
    return;
  }

  const results = convertSelections(dependencies, entry, texts, selections, inputs, context,
    entry.output === 'replace' ? 0 : separator.length);
  if (results === undefined) {
    return;
  }
  switch (entry.output) {
    case 'new-tab':
      await dependencies.openResult(results.map(({ result }) => result).join(separator));
      return;
    case 'clipboard':
      await dependencies.writeClipboard(results.map(({ result }) => result).join(eol));
      void dependencies.notifier.showInformationMessage(DATE_COPIED);
      return;
    default: {
      const replacements = results.filter(({ text, result }) => text !== result);
      if (replacements.length > 0) {
        await textEditor.edit((editBuilder) => {
          replacements.forEach(({ selection, result }) => editBuilder.replace(selection, result));
        });
      }
    }
  }
};

/**
 * Asks the questions of the command once (for all selections). Returns the answers (trimmed), or
 * `undefined` when one was cancelled or refused (then nothing else happens).
 */
const askPrompts = async (dependencies: DateDependencies, entry: DateCommandEntry): Promise<string[] | undefined> => {
  const answers: string[] = [];
  for (const prompt of entry.prompts) {
    const value = await dependencies.showInputBox(inputBoxOptions(prompt));
    if (value === undefined) {
      return undefined;
    }
    // Checked again in case a value that validateInput rejects comes back anyway.
    const problem = findDatePromptProblem(value, prompt.rule);
    if (problem !== undefined) {
      void dependencies.notifier.showWarningMessage(`${prefixOf(entry)}${problem}`);
      return undefined;
    }
    answers.push(value.trim());
  }
  return answers;
};

/**
 * The DATE-001..030 commands by command name (without `selection-manipulator.`). The dependencies
 * can be replaced in tests; another command table (DATEX-001..015) can be given instead.
 */
export const dateCommandHandlerInternal = (dependencies: DateDependencies, entries: readonly DateCommandEntry[] = DATE_COMMAND_ENTRIES) =>
  (name: string) => {
    const entry = entryOf(name, entries);
    return async (textEditor: TextEditor): Promise<void> => {
      try {
        if (targetSelections(textEditor).length === 0) {
          void dependencies.notifier.showWarningMessage(DATE_NOTHING_SELECTED);
          return;
        }
        let settings;
        try {
          settings = readDateSettings(dependencies.getSettings(), entry.settings);
        } catch (error) {
          notifyFailure(dependencies, prefixOf(entry), error);
          return;
        }
        const inputs = await askPrompts(dependencies, entry);
        if (inputs === undefined) {
          return;
        }
        // The selections are read again: the document may have changed while a prompt was open.
        const selections = targetSelections(textEditor);
        if (selections.length === 0) {
          void dependencies.notifier.showWarningMessage(DATE_NOTHING_SELECTED);
          return;
        }
        const context: DateContext = { settings, now: dependencies.now(), eol: documentEol(textEditor), timeZones: new Map() };
        await applyTransform(textEditor, dependencies, entry, selections, inputs, context);
      } catch (error) {
        // Last resort: an unexpected failure is reported instead of escaping to VS Code.
        void dependencies.notifier.showErrorMessage(`${prefixOf(entry)}${reasonOf(error)}`);
      }
    };
  };

/** The dependencies of the extension (VS Code's UI, the settings and the clock). */
export const defaultDateDependencies = defaultDependencies;

export const dateCommandHandler = dateCommandHandlerInternal(defaultDependencies);
