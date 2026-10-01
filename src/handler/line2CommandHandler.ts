import { EndOfLine, InputBoxOptions, Selection, TextEditor, window } from 'vscode';
import { LineRegexSplitRunner, runRegexSplitInWorker } from './lineRegex';
import {
  formatNumber,
  LINE_REGEX_MAX_INPUT_LENGTH,
  LINE_REGEX_TIMEOUT_MS,
  LineInputTooLargeError,
  LineOutputTooLargeError,
  LineRegexTimeoutError,
  MAX_ADDED_LENGTH,
} from './lineTransforms';
import {
  combineSelections,
  isLine2MultiCommand,
  LINE2_COMMAND_ENTRIES,
  LINE2_MULTI_SELECTIONS,
  LINE2_SPLIT_MAX_MATCHES,
  Line2CommandEntry,
  Line2InputError,
  Line2MultiCommand,
  Line2MultiOptions,
  Line2Options,
  line2Transforms,
} from './line2Transforms';
import { describeAddedLength } from './whitespaceTransforms';

/** Everything the LINE2 line handlers use from VS Code (and the regex worker); replaceable in tests. */
export interface Line2Dependencies {
  showInformationMessage(message: string): Thenable<unknown>;
  showWarningMessage(message: string): Thenable<unknown>;
  showErrorMessage(message: string): Thenable<unknown>;
  showInputBox(options: InputBoxOptions): Thenable<string | undefined>;
  /** LINEX-008: the worker that finds the matches (time limit `regexTimeoutMs`). */
  runRegexSplit: LineRegexSplitRunner;
  regexTimeoutMs: number;
  /** LINEX-008: the most characters (all selections together) the regular expression is applied to. */
  regexMaxInputLength: number;
  /** The most characters one run may add (shared by all selections). */
  maxAddedLength: number;
}

const defaultDependencies = (): Line2Dependencies => ({
  showInformationMessage: (message) => window.showInformationMessage(message),
  showWarningMessage: (message) => window.showWarningMessage(message),
  showErrorMessage: (message) => window.showErrorMessage(message),
  showInputBox: (options) => window.showInputBox(options),
  runRegexSplit: runRegexSplitInWorker,
  regexTimeoutMs: LINE_REGEX_TIMEOUT_MS,
  regexMaxInputLength: LINE_REGEX_MAX_INPUT_LENGTH,
  maxAddedLength: MAX_ADDED_LENGTH,
});

export const LINE2_NOT_CHANGED = 'The selection was not changed';
export const LINE2_DOCUMENT_CHANGED =
  'The selection was not changed: the document was edited while the regular expression was running.';
export const LINE2_TOO_MANY_MATCHES =
  `${LINE2_NOT_CHANGED}: the regular expression matches more than ${formatNumber(LINE2_SPLIT_MAX_MATCHES)} times. Select less text.`;

/** The warning shown when a multi-selection command has too few or too many non-empty selections. */
export const line2SelectionCountMessage = (command: Line2MultiCommand): string => {
  const [min, max] = LINE2_MULTI_SELECTIONS[command];
  return max === min
    ? `Select exactly ${min} blocks of lines (non-empty selections) first.`
    : `Select at least ${min} blocks of lines (non-empty selections) first.`;
};

/** The non-empty selections, in document order. */
const targetSelections = (textEditor: TextEditor): Selection[] =>
  textEditor.selections
    .filter((selection) => !selection.isEmpty)
    .sort((a, b) => a.start.compareTo(b.start));

const documentEol = (textEditor: TextEditor): string =>
  textEditor.document.eol === EndOfLine.CRLF ? '\r\n' : '\n';

/** Where the selection sits in its lines (used by the anchored commands). */
const selectionContext = (textEditor: TextEditor, selection: Selection): Partial<Line2Options> => ({
  precededByText: selection.start.character > 0,
  followedByText: selection.end.character > 0
    && selection.end.character < textEditor.document.lineAt(selection.end.line).text.length,
});

/**
 * Logs an unexpected failure so it can be traced: only the error name and the stack frames, never
 * the message, which may quote the selected text.
 */
const logUnexpected = (error: unknown): void => {
  const name = error instanceof Error ? error.name : typeof error;
  const frames = error instanceof Error && typeof error.stack === 'string'
    ? error.stack.split('\n').filter((line) => /^\s+at /.test(line)).join('\n')
    : '';
  console.error(`Selection Manipulator: a line command failed unexpectedly (${name})${frames === '' ? '' : `\n${frames}`}`);
};

/** Tells why nothing was changed. Not awaited: the Thenable settles on dismissal. */
const notifyFailure = (deps: Line2Dependencies, error: unknown): void => {
  if (error instanceof LineOutputTooLargeError) {
    // The overall limit, not error.limit (the budget left for this selection).
    void deps.showWarningMessage(`${LINE2_NOT_CHANGED}: ${describeAddedLength(error.added, deps.maxAddedLength)}. Select fewer or shorter lines.`);
  } else if (error instanceof LineRegexTimeoutError || error instanceof LineInputTooLargeError || error instanceof Line2InputError) {
    void deps.showWarningMessage(`${LINE2_NOT_CHANGED}: ${error.message}.`);
  } else {
    logUnexpected(error);
    void deps.showErrorMessage(`${LINE2_NOT_CHANGED}: the lines could not be processed.`);
  }
};

type Asked = Partial<Line2Options & Line2MultiOptions> & { pattern?: string };

/**
 * Asks for every value of the command once (even with several selections). Returns undefined
 * when the user cancels or (defensively, despite validateInput) an invalid value comes back.
 */
const askInputs = async (deps: Line2Dependencies, entry: Line2CommandEntry): Promise<Asked | undefined> => {
  let asked: Asked = {};
  for (const step of entry.inputs ?? []) {
    const input = await deps.showInputBox({
      prompt: step.prompt,
      placeHolder: step.placeHolder,
      value: step.value,
      ignoreFocusOut: true,
      validateInput: step.validate,
    });
    if (input === undefined || step.validate(input) !== undefined) {
      return undefined;
    }
    asked = { ...asked, ...step.apply(input) };
  }
  return asked;
};

/** LINEX-008: the matches of every text, found once in the worker for all selections. */
const findSplits = async (deps: Line2Dependencies, pattern: string, texts: string[]): Promise<[number, number][][]> => {
  const total = texts.reduce((sum, text) => sum + text.length, 0);
  if (total > deps.regexMaxInputLength) {
    throw new LineInputTooLargeError(total, deps.regexMaxInputLength);
  }
  const splits = await deps.runRegexSplit(pattern, texts, deps.regexTimeoutMs, LINE2_SPLIT_MAX_MATCHES);
  if (splits === undefined) {
    throw new Line2InputError(`the regular expression matches more than ${formatNumber(LINE2_SPLIT_MAX_MATCHES)} times. Select less text`);
  }
  if (splits.length !== texts.length) {
    throw new Error('The regular expression results do not match the selections');
  }
  return splits;
};

const replaceAll = async (
  deps: Line2Dependencies,
  textEditor: TextEditor,
  replacements: { selection: Selection; text: string; result: string }[]
): Promise<void> => {
  const changed = replacements.filter(({ text, result }) => text !== result);
  if (changed.length === 0) {
    return;
  }
  const applied = await textEditor.edit((editBuilder) => {
    changed.forEach(({ selection, result }) => editBuilder.replace(selection, result));
  });
  if (!applied) {
    void deps.showWarningMessage(`${LINE2_NOT_CHANGED}: the editor did not accept the edit.`);
  }
};

const countFits = (command: Line2MultiCommand, count: number): boolean => {
  const [min, max] = LINE2_MULTI_SELECTIONS[command];
  return count >= min && count <= max;
};

/** LINEX-006, 010..012: the result replaces the first non-empty selection; the others stay. */
const runMulti = async (deps: Line2Dependencies, entry: Line2CommandEntry, command: Line2MultiCommand, textEditor: TextEditor): Promise<void> => {
  // Checked before any input box (as the `needsTwo` commands of MSEL).
  if (!countFits(command, targetSelections(textEditor).length)) {
    void deps.showWarningMessage(line2SelectionCountMessage(command));
    return;
  }
  const asked = await askInputs(deps, entry);
  if (asked === undefined) {
    return;
  }
  // Read again: the document may have changed while the input box was shown.
  const selections = targetSelections(textEditor);
  if (!countFits(command, selections.length)) {
    void deps.showWarningMessage(line2SelectionCountMessage(command));
    return;
  }
  const texts = selections.map((selection) => textEditor.document.getText(selection));
  let result: string;
  try {
    result = combineSelections(command, texts, {
      eol: documentEol(textEditor),
      delimiter: asked.delimiter,
      maxAddedLength: deps.maxAddedLength,
    });
  } catch (error) {
    notifyFailure(deps, error);
    return;
  }
  await replaceAll(deps, textEditor, [{ selection: selections[0], text: texts[0], result }]);
};

/** LINEX-001..005, 007..009, 013, 014: every non-empty selection is transformed on its own. */
const runSingle = async (deps: Line2Dependencies, entry: Line2CommandEntry, textEditor: TextEditor): Promise<void> => {
  if (isLine2MultiCommand(entry.command)) {
    throw new Error(`Not a single-selection command: ${entry.command}`);
  }
  const command = entry.command;
  // Only decides whether to ask at all: no input box without a non-empty selection.
  if (targetSelections(textEditor).length === 0) {
    return;
  }
  const asked = await askInputs(deps, entry);
  if (asked === undefined) {
    return;
  }
  // Read the selections (and their text) only after the input boxes close.
  const selections = targetSelections(textEditor);
  if (selections.length === 0) {
    return;
  }
  const { pattern, ...inputOptions } = asked;
  const eol = documentEol(textEditor);
  // LINEX-008 waits for the worker between reading the text and editing; the version tells
  // whether the document changed meanwhile (stale ranges and results).
  const version = textEditor.document.version;
  const texts = selections.map((selection) => textEditor.document.getText(selection));
  const results: string[] = [];
  try {
    const splits = command === 'split-by-regex'
      ? await findSplits(deps, pattern ?? '', texts)
      : undefined;
    let budget = deps.maxAddedLength;
    selections.forEach((selection, i) => {
      const options: Line2Options = {
        ...inputOptions,
        eol,
        ...selectionContext(textEditor, selection),
        regexSplits: splits?.[i],
        maxAddedLength: budget,
      };
      const result = line2Transforms[command](texts[i], options);
      budget -= Math.max(0, result.length - texts[i].length);
      results.push(result);
    });
  } catch (error) {
    notifyFailure(deps, error);
    return;
  }
  if (textEditor.document.version !== version) {
    void deps.showWarningMessage(LINE2_DOCUMENT_CHANGED);
    return;
  }
  await replaceAll(deps, textEditor, selections.map((selection, i) => ({ selection, text: texts[i], result: results[i] })));
};

/**
 * The LINEX-001..014 commands by command name (without `selection-manipulator.`). The
 * dependencies (and, in tests, the command table) can be replaced.
 */
export const line2CommandHandlerInternal = (overrides: Partial<Line2Dependencies> = {}, entries: readonly Line2CommandEntry[] = LINE2_COMMAND_ENTRIES) =>
  (name: string) => {
    const entry = entries.find((candidate) => candidate.name === name);
    if (!entry) {
      throw new Error(`Unknown LINE2 command: ${name}`);
    }
    return async (textEditor: TextEditor): Promise<void> => {
      const deps = { ...defaultDependencies(), ...overrides };
      try {
        if (isLine2MultiCommand(entry.command)) {
          await runMulti(deps, entry, entry.command, textEditor);
        } else {
          await runSingle(deps, entry, textEditor);
        }
      } catch (error) {
        // Last resort: an unexpected failure is reported instead of escaping to VS Code.
        notifyFailure(deps, error);
      }
    };
  };

export const line2CommandHandler = line2CommandHandlerInternal();
