import {
  env,
  EndOfLine,
  InputBoxOptions,
  Selection,
  TextEditor,
  window,
} from 'vscode';
import { LineRegexRunner, runRegexInWorker } from './lineRegex';
import { describeAddedLength } from './whitespaceTransforms';
import {
  countLineStats,
  extractBetweenMarkers,
  formatNumber,
  LINE_COUNT_MAX,
  LINE_COUNT_MIN,
  LINE_JOIN_DELIMITER_MAX_LENGTH,
  LINE_REGEX_COMMANDS,
  LINE_REGEX_MAX_INPUT_LENGTH,
  LINE_REGEX_PATTERN_MAX_LENGTH,
  LINE_REGEX_TIMEOUT_MS,
  LINE_TEXT_MAX_LENGTH,
  LINE_WIDTH_MAX,
  LINE_WIDTH_MIN,
  LineClipboardCommand,
  LineInputCommand,
  LineInputTooLargeError,
  LineOptions,
  LineOutputTooLargeError,
  LineRegexCommand,
  LineRegexTimeoutError,
  LineStats,
  LineTransformCommand,
  lineTransforms,
  MAX_ADDED_LENGTH,
  formatLineStats,
  splitSelectionLines,
  validateLineCountInput,
  validateLineDelimiterInput,
  validateLineRegexInput,
  validateLineTextInput,
  validateLineWidthInput,
} from './lineTransforms';

export type LineOutput = 'replace' | 'clipboard';

/** Everything the line handlers use from VS Code (and the regex worker); replaceable in tests. */
export interface LineHandlerDeps {
  showInformationMessage(message: string): Thenable<unknown>;
  showWarningMessage(message: string): Thenable<unknown>;
  showErrorMessage(message: string): Thenable<unknown>;
  showInputBox(options: InputBoxOptions): Thenable<string | undefined>;
  writeClipboard(text: string): Thenable<void>;
  runRegex: LineRegexRunner;
  regexTimeoutMs: number;
}

const defaultDeps = (): LineHandlerDeps => ({
  showInformationMessage: (message) => window.showInformationMessage(message),
  showWarningMessage: (message) => window.showWarningMessage(message),
  showErrorMessage: (message) => window.showErrorMessage(message),
  showInputBox: (options) => window.showInputBox(options),
  writeClipboard: (text) => env.clipboard.writeText(text),
  runRegex: runRegexInWorker,
  regexTimeoutMs: LINE_REGEX_TIMEOUT_MS,
});

export const NO_LINES_TO_COPY_MESSAGE = 'No lines to copy. The clipboard was not changed.';
export const NO_LINES_BETWEEN_MARKERS_MESSAGE = 'No lines were found between the markers';

const documentEol = (textEditor: TextEditor): string =>
  textEditor.document.eol === EndOfLine.CRLF ? '\r\n' : '\n';

/**
 * Where the selection sits in its lines (used by the anchored commands of the replace
 * versions only). `selection.start` / `selection.end` are ordered, so reversed selections
 * give the same result.
 */
const selectionContext = (textEditor: TextEditor, selection: Selection): Partial<LineOptions> => ({
  precededByText: selection.start.character > 0,
  followedByText: selection.end.character > 0
    && selection.end.character < textEditor.document.lineAt(selection.end.line).text.length,
});

// ---------------------------------------------------------------------------
// Input
// ---------------------------------------------------------------------------

interface InputStep {
  options: InputBoxOptions;
  validate: (value: string) => string | undefined;
  toOptions: (value: string) => AskedOptions;
}

/** The values asked for; `pattern` goes to the regex worker, the rest into `LineOptions`. */
type AskedOptions = Partial<LineOptions> & { pattern?: string };

const textStep = (prompt: string, key: 'text' | 'startMarker' | 'endMarker' = 'text', placeHolder?: string): InputStep => ({
  options: { prompt: `${prompt} (case-sensitive, up to ${formatNumber(LINE_TEXT_MAX_LENGTH)} characters)`, placeHolder },
  validate: validateLineTextInput,
  toOptions: (value) => ({ [key]: value }),
});

/** An integer from `min` to `max` (checked by `validate`), stored as `n`. */
const integerStep = (
  prompt: string,
  value: string,
  min: number,
  max: number,
  validate: (value: string) => string | undefined
): InputStep => ({
  options: { prompt: `${prompt} (${formatNumber(min)}-${formatNumber(max)})`, value },
  validate,
  toOptions: (input) => ({ n: Number(input.trim()) }),
});

/** N of LINE-014 / 015 / 018 / 019 / 027. */
const countStep = (prompt: string, value: string): InputStep =>
  integerStep(prompt, value, LINE_COUNT_MIN, LINE_COUNT_MAX, validateLineCountInput);

const regexStep = (prompt: string): InputStep => ({
  options: {
    prompt: `${prompt} (JavaScript syntax with the "u" flag, case-sensitive, up to ${formatNumber(LINE_REGEX_PATTERN_MAX_LENGTH)} characters)`,
    placeHolder: 'e.g. \\d+',
  },
  validate: validateLineRegexInput,
  toOptions: (value) => ({ pattern: value }),
});

/** Input steps of every input command (LINE-027 and LINE-032 ask twice). */
const inputSpecs: Record<LineInputCommand, InputStep[]> = {
  'filter-contains': [textStep('Keep lines containing this text')],
  'filter-not-contains': [textStep('Remove lines containing this text')],
  'filter-regex': [regexStep('Keep lines matching this regular expression')],
  'filter-not-regex': [regexStep('Remove lines matching this regular expression')],
  'keep-every-nth': [countStep('Keep every Nth line: N', '2')],
  'remove-every-nth': [countStep('Remove every Nth line: N', '2')],
  'head': [countStep('Number of lines to keep from the start', '10')],
  'tail': [countStep('Number of lines to keep from the end', '10')],
  'move-matching-to-top': [textStep('Move lines containing this text to the top')],
  'remove-prefix': [textStep('Prefix to remove from each line')],
  'remove-suffix': [textStep('Suffix to remove from each line')],
  'join-every-n': [
    countStep('Number of lines to join into one', '2'),
    {
      options: {
        prompt: `Delimiter (literal text, up to ${formatNumber(LINE_JOIN_DELIMITER_MAX_LENGTH)} characters; empty joins without a delimiter)`,
        value: ',',
      },
      validate: validateLineDelimiterInput,
      toOptions: (value) => ({ delimiter: value }),
    },
  ],
  'split-fixed-width': [
    integerStep('Line width in characters', '80', LINE_WIDTH_MIN, LINE_WIDTH_MAX, validateLineWidthInput),
  ],
  'extract-between-markers': [
    textStep('Start marker: lines after the line containing it are extracted', 'startMarker', 'e.g. BEGIN'),
    textStep('End marker: extraction stops at the line containing it', 'endMarker', 'e.g. END'),
  ],
};

const isInputCommand = (command: LineTransformCommand): command is LineInputCommand =>
  Object.prototype.hasOwnProperty.call(inputSpecs, command);

const isRegexCommand = (command: LineTransformCommand): command is LineRegexCommand =>
  (LINE_REGEX_COMMANDS as LineTransformCommand[]).includes(command);

/**
 * Asks for every value of the command once (even with several selections). Returns undefined
 * when the user cancels or (defensively, despite validateInput) enters an invalid value.
 */
const askInputs = async (deps: LineHandlerDeps, command: LineTransformCommand): Promise<AskedOptions | undefined> => {
  if (!isInputCommand(command)) {
    return {};
  }
  let options: AskedOptions = {};
  for (const step of inputSpecs[command]) {
    const input = await deps.showInputBox({ ...step.options, validateInput: step.validate });
    if (input === undefined || step.validate(input) !== undefined) {
      return undefined;
    }
    options = { ...options, ...step.toOptions(input) };
  }
  return options;
};

// ---------------------------------------------------------------------------
// Regular expressions (LINE-003 / LINE-004 / LINE-036)
// ---------------------------------------------------------------------------

/**
 * Runs the pattern once, in the worker, over the lines of all selections and returns the
 * results per selection (aligned with `splitSelectionLines`).
 */
const matchSelections = async (deps: LineHandlerDeps, pattern: string, texts: string[]): Promise<boolean[][]> => {
  const totalLength = texts.reduce((total, text) => total + text.length, 0);
  if (totalLength > LINE_REGEX_MAX_INPUT_LENGTH) {
    throw new LineInputTooLargeError(totalLength, LINE_REGEX_MAX_INPUT_LENGTH);
  }
  const linesPerText = texts.map(splitSelectionLines);
  const matches = await deps.runRegex(pattern, linesPerText.flat(), deps.regexTimeoutMs);
  const result: boolean[][] = [];
  let position = 0;
  linesPerText.forEach((lines) => {
    result.push(matches.slice(position, position + lines.length));
    position += lines.length;
  });
  return result;
};

// ---------------------------------------------------------------------------
// Handlers
// ---------------------------------------------------------------------------

/** Tells the user why nothing was changed. Not awaited: the Thenable settles on dismissal. */
const notifyFailure = (deps: LineHandlerDeps, output: LineOutput, error: unknown): void => {
  const target = output === 'replace' ? 'The selection was not changed' : 'The clipboard was not changed';
  if (error instanceof LineOutputTooLargeError) {
    // The overall limit, not error.limit (the budget left for this selection).
    void deps.showWarningMessage(`${target}: ${describeAddedLength(error.added, MAX_ADDED_LENGTH)}. Select fewer or shorter lines.`);
  } else if (error instanceof LineRegexTimeoutError || error instanceof LineInputTooLargeError) {
    void deps.showWarningMessage(`${target}: ${error.message}.`);
  } else {
    void deps.showErrorMessage(`${target}: ${error instanceof Error ? error.message : String(error)}`);
  }
};

export const DOCUMENT_CHANGED_MESSAGE =
  'The selection was not changed: the document was edited while the regular expression was running.';

/** Drops ONE trailing line break (LINE-035..LINE-040 copy the same text with or without it). */
const withoutTrailingBreak = (text: string): string => text.replace(/(?:\r\n|\r|\n)$/, '');

const runLineCommand = async (
  deps: LineHandlerDeps,
  command: LineTransformCommand,
  output: LineOutput,
  textEditor: TextEditor
): Promise<void> => {
  const selections = textEditor.selections.filter((selection) => !selection.isEmpty);
  if (selections.length === 0) {
    return;
  }
  const asked = await askInputs(deps, command);
  if (asked === undefined) {
    return;
  }
  const { pattern, ...inputOptions } = asked;
  const eol = documentEol(textEditor);
  // The regex commands wait for the worker (up to the time limit) between reading the text and
  // editing; the version tells whether the document changed meanwhile (stale ranges and results).
  const version = textEditor.document.version;
  const texts = selections.map((selection) => textEditor.document.getText(selection));
  // undefined: LINE-032 / LINE-040 found no start marker in that selection.
  const results: (string | undefined)[] = [];
  try {
    const regexMatches = isRegexCommand(command) && pattern !== undefined
      ? await matchSelections(deps, pattern, texts)
      : undefined;
    let budget = MAX_ADDED_LENGTH;
    selections.forEach((selection, i) => {
      const text = texts[i];
      const options: LineOptions = {
        ...inputOptions,
        eol,
        ...(output === 'replace' ? selectionContext(textEditor, selection) : {}),
        regexMatches: regexMatches?.[i],
        maxAddedLength: budget,
      };
      const result = command === 'extract-between-markers'
        ? extractBetweenMarkers(text, options)
        : lineTransforms[command](text, options);
      if (result !== undefined) {
        budget -= Math.max(0, result.length - text.length);
      }
      results.push(result);
    });
  } catch (error) {
    notifyFailure(deps, output, error);
    return;
  }

  if (output === 'clipboard') {
    const copied = results
      .filter((result): result is string => result !== undefined)
      .map(withoutTrailingBreak)
      .filter((result) => result !== '');
    if (copied.length === 0) {
      void deps.showInformationMessage(
        command === 'extract-between-markers' ? NO_LINES_BETWEEN_MARKERS_MESSAGE : NO_LINES_TO_COPY_MESSAGE
      );
      return;
    }
    await deps.writeClipboard(copied.join(eol));
    return;
  }

  if (command === 'extract-between-markers' && results.every((result) => result === undefined)) {
    void deps.showInformationMessage(NO_LINES_BETWEEN_MARKERS_MESSAGE);
    return;
  }
  const replacements = selections
    .map((selection, i) => ({ selection, text: texts[i], result: results[i] }))
    .filter(({ text, result }) => result !== undefined && result !== text);
  if (replacements.length === 0) {
    return;
  }
  if (textEditor.document.version !== version) {
    void deps.showWarningMessage(DOCUMENT_CHANGED_MESSAGE);
    return;
  }
  await textEditor.edit((editBuilder) => {
    replacements.forEach(({ selection, result }) => editBuilder.replace(selection, result as string));
  });
};

/**
 * LINE-001..LINE-040 except LINE-031: `lineHandler('<name>', 'replace')` transforms every
 * non-empty selection independently and replaces them in one edit; `'clipboard'`
 * (LINE-035..LINE-040) copies the joined results and leaves the editor unchanged.
 */
export const lineHandlerInternal = (overrides: Partial<LineHandlerDeps> = {}) =>
  (command: LineTransformCommand, output: LineOutput) =>
    (textEditor: TextEditor): Promise<void> =>
      runLineCommand({ ...defaultDeps(), ...overrides }, command, output, textEditor);

const defaultLineHandler = lineHandlerInternal();

/** Only LINE-035..LINE-040's six commands have a clipboard version. */
export function lineHandler(command: LineClipboardCommand, output: 'clipboard'): (textEditor: TextEditor) => Promise<void>;
export function lineHandler(command: LineTransformCommand, output: 'replace'): (textEditor: TextEditor) => Promise<void>;
export function lineHandler(command: LineTransformCommand, output: LineOutput): (textEditor: TextEditor) => Promise<void> {
  return defaultLineHandler(command, output);
}

/** LINE-031: shows the total number of lines, words and characters of all non-empty selections. */
export const lineCountStatsHandlerInternal = (overrides: Partial<LineHandlerDeps> = {}) =>
  async (textEditor: TextEditor): Promise<void> => {
    const deps = { ...defaultDeps(), ...overrides };
    const selections = textEditor.selections.filter((selection) => !selection.isEmpty);
    if (selections.length === 0) {
      return;
    }
    const total: LineStats = { lines: 0, words: 0, chars: 0 };
    selections.forEach((selection) => {
      const stats = countLineStats(textEditor.document.getText(selection));
      total.lines += stats.lines;
      total.words += stats.words;
      total.chars += stats.chars;
    });
    void deps.showInformationMessage(formatLineStats(total, selections.length));
  };

export const lineCountStatsHandler = lineCountStatsHandlerInternal();
