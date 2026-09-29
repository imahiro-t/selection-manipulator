import { env, InputBoxOptions, TextEditor, window } from 'vscode';
import { openTextDocument } from '../common';
import { LineRegexCaptureRunner, runRegexCaptureInWorker } from './lineRegex';
import {
  formatNumber,
  LINE_REGEX_MAX_INPUT_LENGTH,
  LINE_REGEX_PATTERN_MAX_LENGTH,
  LINE_REGEX_TIMEOUT_MS,
  LineInputTooLargeError,
  LineRegexTimeoutError,
  splitSelectionLines,
  validateLineRegexInput,
} from './lineTransforms';
import {
  parseSortDelimiter,
  SORT_COLUMN_MAX,
  SORT_COLUMN_MIN,
  SORT_DELIMITER_MAX_LENGTH,
  SORT_LOCALE_MAX_LENGTH,
  SortLineCommand,
  sortLines,
  SortOptions,
  SortSelectionCommand,
  sortSelectionItems,
  validateSortColumnInput,
  validateSortDelimiterInput,
  validateSortLocaleInput,
} from './sortTransforms';

/** Like the existing sort commands: a new untitled editor, or the clipboard (`.clipboard`). */
export type SortOutput = 'new-document' | 'clipboard';

/** Everything the sort handlers use from VS Code (and the regex worker); replaceable in tests. */
export interface SortHandlerDeps {
  showInformationMessage(message: string): Thenable<unknown>;
  showWarningMessage(message: string): Thenable<unknown>;
  showErrorMessage(message: string): Thenable<unknown>;
  showInputBox(options: InputBoxOptions): Thenable<string | undefined>;
  writeClipboard(text: string): Thenable<void>;
  openTextDocument(content: string): Thenable<unknown>;
  runRegexCapture: LineRegexCaptureRunner;
  regexTimeoutMs: number;
  /** Initial value of SORT-005 / 006's locale input box. */
  defaultLocale: string;
}

const defaultDeps = (): SortHandlerDeps => ({
  showInformationMessage: (message) => window.showInformationMessage(message),
  showWarningMessage: (message) => window.showWarningMessage(message),
  showErrorMessage: (message) => window.showErrorMessage(message),
  showInputBox: (options) => window.showInputBox(options),
  writeClipboard: (text) => env.clipboard.writeText(text),
  openTextDocument: (content) => openTextDocument(content),
  runRegexCapture: runRegexCaptureInWorker,
  regexTimeoutMs: LINE_REGEX_TIMEOUT_MS,
  defaultLocale: env.language,
});

export const NO_LINES_TO_COPY_MESSAGE = 'No lines to copy. The clipboard was not changed.';
export const NO_LINES_TO_OPEN_MESSAGE = 'No lines to sort. No document was opened.';

// ---------------------------------------------------------------------------
// Input
// ---------------------------------------------------------------------------

/** The values asked for; `pattern` goes to the regex worker, the rest into `SortOptions`. */
type AskedOptions = Omit<SortOptions, 'regexKeys'> & { pattern?: string };

interface InputStep {
  options: InputBoxOptions;
  validate: (value: string) => string | undefined;
  toOptions: (value: string) => AskedOptions;
}

const inputSteps = (deps: SortHandlerDeps, command: SortLineCommand): InputStep[] => {
  switch (command) {
    case 'locale':
      return [{
        options: {
          prompt: `Locale to sort by (BCP 47 tag such as en, fr or ja, up to ${formatNumber(SORT_LOCALE_MAX_LENGTH)} characters)`,
          value: deps.defaultLocale,
        },
        validate: validateSortLocaleInput,
        toOptions: (value) => ({ locale: value.trim() }),
      }];
    case 'column':
      return [
        {
          options: {
            prompt: `Column delimiter (literal text, up to ${formatNumber(SORT_DELIMITER_MAX_LENGTH)} characters; \\t for a tab)`,
            value: ',',
          },
          validate: validateSortDelimiterInput,
          toOptions: (value) => ({ delimiter: parseSortDelimiter(value) }),
        },
        {
          options: {
            prompt: `Column number to sort by (${formatNumber(SORT_COLUMN_MIN)}-${formatNumber(SORT_COLUMN_MAX)}, the first column is 1)`,
            value: '1',
          },
          validate: validateSortColumnInput,
          toOptions: (value) => ({ column: Number(value.trim()) }),
        },
      ];
    case 'regex-key':
      return [{
        options: {
          prompt: 'Regular expression whose first capture group (or whole match) is the sort key '
            + `(JavaScript syntax with the "u" flag, up to ${formatNumber(LINE_REGEX_PATTERN_MAX_LENGTH)} characters)`,
          placeHolder: 'e.g. id=(\\d+)',
        },
        validate: validateLineRegexInput,
        toOptions: (value) => ({ pattern: value }),
      }];
    default:
      return [];
  }
};

/**
 * Asks for every value of the command once (even with several selections). Returns undefined
 * when the user cancels or (defensively, despite validateInput) enters an invalid value.
 */
const askInputs = async (deps: SortHandlerDeps, command: SortLineCommand): Promise<AskedOptions | undefined> => {
  let options: AskedOptions = {};
  for (const step of inputSteps(deps, command)) {
    const input = await deps.showInputBox({ ...step.options, validateInput: step.validate });
    if (input === undefined || step.validate(input) !== undefined) {
      return undefined;
    }
    options = { ...options, ...step.toOptions(input) };
  }
  return options;
};

// ---------------------------------------------------------------------------
// Output
// ---------------------------------------------------------------------------

/** Tells the user why nothing was output. Not awaited: the Thenable settles on dismissal. */
const notifyFailure = (deps: SortHandlerDeps, output: SortOutput, error: unknown): void => {
  const target = output === 'clipboard' ? 'The clipboard was not changed' : 'The result was not opened';
  if (error instanceof LineRegexTimeoutError || error instanceof LineInputTooLargeError) {
    void deps.showWarningMessage(`${target}: ${error.message}.`);
  } else {
    void deps.showErrorMessage(`${target}: ${error instanceof Error ? error.message : String(error)}`);
  }
};

/** Opens or copies the sorted lines (joined with `\n`, like the existing sort commands). */
const emit = async (deps: SortHandlerDeps, output: SortOutput, sorted: string[]): Promise<void> => {
  const content = sorted.join('\n');
  if (content === '') {
    void deps.showInformationMessage(output === 'clipboard' ? NO_LINES_TO_COPY_MESSAGE : NO_LINES_TO_OPEN_MESSAGE);
    return;
  }
  if (output === 'clipboard') {
    await deps.writeClipboard(content);
  } else {
    await deps.openTextDocument(content);
  }
};

const hasNonEmptySelection = (textEditor: TextEditor): boolean =>
  textEditor.selections.some((selection) => !selection.isEmpty);

/** The text of the non-empty selections, read when called (i.e. after the input boxes closed). */
const selectedTexts = (textEditor: TextEditor): string[] =>
  textEditor.selections
    .filter((selection) => !selection.isEmpty)
    .map((selection) => textEditor.document.getText(selection));

// ---------------------------------------------------------------------------
// Handlers
// ---------------------------------------------------------------------------

const runSortLines = async (
  deps: SortHandlerDeps,
  command: SortLineCommand,
  descending: boolean,
  output: SortOutput,
  textEditor: TextEditor
): Promise<void> => {
  // Only decides whether to ask at all: no input box without a non-empty selection.
  if (!hasNonEmptySelection(textEditor)) {
    return;
  }
  const asked = await askInputs(deps, command);
  if (asked === undefined) {
    return;
  }
  // Read the selections only after the input boxes close: the document may have changed
  // while they were shown, and VS Code keeps the current selections in step with such edits.
  const texts = selectedTexts(textEditor);
  if (texts.length === 0) {
    return;
  }
  const { pattern, ...options } = asked;
  const lines = texts.flatMap(splitSelectionLines);
  let sorted: string[];
  try {
    let regexKeys: (string | null)[] | undefined;
    if (command === 'regex-key' && pattern !== undefined) {
      const totalLength = texts.reduce((total, text) => total + text.length, 0);
      if (totalLength > LINE_REGEX_MAX_INPUT_LENGTH) {
        throw new LineInputTooLargeError(totalLength, LINE_REGEX_MAX_INPUT_LENGTH);
      }
      regexKeys = await deps.runRegexCapture(pattern, lines, deps.regexTimeoutMs);
    }
    sorted = sortLines(lines, command, descending, { ...options, regexKeys });
  } catch (error) {
    notifyFailure(deps, output, error);
    return;
  }
  await emit(deps, output, sorted);
};

const runSortSelections = async (
  deps: SortHandlerDeps,
  command: SortSelectionCommand,
  descending: boolean,
  output: SortOutput,
  textEditor: TextEditor
): Promise<void> => {
  const texts = selectedTexts(textEditor);
  if (texts.length === 0) {
    return;
  }
  // Like the existing sort.* commands: the lines of all selections, without blank ones.
  const items = texts.join('\n').split(/\r\n|\r|\n/).filter((item) => item.trim() !== '');
  await emit(deps, output, sortSelectionItems(items, command, descending));
};

/**
 * SORT-001..SORT-021 and SORT-026..SORT-029: sorts the lines of all non-empty selections as one
 * list (one trailing line break of each selection is not a line) and opens the result in a new
 * editor or copies it to the clipboard. The editor is never changed.
 */
export const sortLineExtendedHandlerInternal = (overrides: Partial<SortHandlerDeps> = {}) =>
  (command: SortLineCommand, descending: boolean, output: SortOutput) =>
    (textEditor: TextEditor): Promise<void> =>
      runSortLines({ ...defaultDeps(), ...overrides }, command, descending, output, textEditor);

/**
 * SORT-022..SORT-025 and SORT-030: sorts the non-blank lines of all selections and opens the
 * result in a new editor or copies it to the clipboard. The editor is never changed.
 */
export const sortSelectionExtendedHandlerInternal = (overrides: Partial<SortHandlerDeps> = {}) =>
  (command: SortSelectionCommand, descending: boolean, output: SortOutput) =>
    (textEditor: TextEditor): Promise<void> =>
      runSortSelections({ ...defaultDeps(), ...overrides }, command, descending, output, textEditor);

export const sortLineExtendedHandler = sortLineExtendedHandlerInternal();
export const sortSelectionExtendedHandler = sortSelectionExtendedHandlerInternal();
