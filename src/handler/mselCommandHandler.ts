import { InputBoxOptions, Range, Selection, TextEditor, TextEditorRevealType, window } from 'vscode';
import { LineRegexRunner, LineRegexSplitRunner, runRegexInWorker, runRegexSplitInWorker } from './lineRegex';
import {
  LINE_REGEX_MAX_INPUT_LENGTH,
  LINE_REGEX_TIMEOUT_MS,
  LineInputTooLargeError,
  LineRegexTimeoutError,
} from './lineTransforms';
import {
  MSEL_COMMAND_ENTRIES,
  MSEL_MAX_SELECTIONS,
  MSEL_NEED_TWO,
  MselCommandEntry,
  MselContext,
  MselInputError,
  MselRange,
  MselResult,
  MselTooManySelectionsError,
} from './mselTransforms';
import { MSEL2_COMMAND_ENTRIES } from './msel2Transforms';

/** The MSEL-001..030 commands and the LINEX-015..023 selection commands of the group LINE2. */
export const ALL_MSEL_COMMAND_ENTRIES: readonly MselCommandEntry[] = [...MSEL_COMMAND_ENTRIES, ...MSEL2_COMMAND_ENTRIES];

/** How the handlers tell the user what happened. */
export interface MselNotifier {
  showInformationMessage(message: string): Thenable<unknown>;
  showWarningMessage(message: string): Thenable<unknown>;
  showErrorMessage(message: string): Thenable<unknown>;
}

/** What the handlers need from VS Code (and the regex worker); replaced in tests. */
export interface MselDependencies {
  notifier: MselNotifier;
  showInputBox: (options: InputBoxOptions) => Thenable<string | undefined>;
  runRegex: LineRegexRunner;
  runRegexSplit: LineRegexSplitRunner;
  regexTimeoutMs: number;
  /** The most characters (all selections together) a regular expression is applied to. */
  regexMaxInputLength: number;
}

const defaultDependencies: MselDependencies = {
  notifier: window,
  showInputBox: (options) => window.showInputBox(options),
  runRegex: runRegexInWorker,
  runRegexSplit: runRegexSplitInWorker,
  regexTimeoutMs: LINE_REGEX_TIMEOUT_MS,
  regexMaxInputLength: LINE_REGEX_MAX_INPUT_LENGTH,
};

export const MSEL_SELECTIONS_NOT_CHANGED = 'The selections were not changed: ';
export const MSEL_TEXT_NOT_CHANGED = 'The text was not changed: ';
export const MSEL_DOCUMENT_CHANGED =
  'The selections were not changed: the document was edited while the regular expression was running.';
export const MSEL_TOO_MANY_SELECTIONS =
  `${MSEL_SELECTIONS_NOT_CHANGED}${new MselTooManySelectionsError().message}.`;

const prefixOf = (entry: MselCommandEntry): string => (entry.edits ? MSEL_TEXT_NOT_CHANGED : MSEL_SELECTIONS_NOT_CHANGED);

/**
 * Logs an unexpected failure so it can be traced: only the error name and the stack frames, never
 * the message, which may quote the selected text.
 */
const logUnexpected = (error: unknown): void => {
  const name = error instanceof Error ? error.name : typeof error;
  const frames = error instanceof Error && typeof error.stack === 'string'
    ? error.stack.split('\n').filter((line) => /^\s+at /.test(line)).join('\n')
    : '';
  console.error(`Selection Manipulator: a selection command failed unexpectedly (${name})${frames === '' ? '' : `\n${frames}`}`);
};

/** Tells why nothing was changed. Not awaited: the Thenable only settles when the notification is dismissed. */
const notifyFailure = (dependencies: MselDependencies, entry: MselCommandEntry, error: unknown): void => {
  if (error instanceof MselInputError || error instanceof LineRegexTimeoutError || error instanceof LineInputTooLargeError) {
    void dependencies.notifier.showWarningMessage(`${prefixOf(entry)}${error.message}.`);
    return;
  }
  logUnexpected(error);
  void dependencies.notifier.showErrorMessage(`${prefixOf(entry)}the selections could not be processed.`);
};

/** The selections in document order, as offsets. */
const rangesOf = (textEditor: TextEditor): MselRange[] => {
  const document = textEditor.document;
  return [...textEditor.selections]
    .sort((a, b) => a.start.compareTo(b.start) || a.end.compareTo(b.end))
    .map((selection) => ({
      start: document.offsetAt(selection.start),
      end: document.offsetAt(selection.end),
      reversed: selection.isReversed,
    }));
};

const toSelection = (textEditor: TextEditor, range: MselRange): Selection => {
  const document = textEditor.document;
  const start = document.positionAt(range.start);
  const end = document.positionAt(range.end);
  return range.reversed ? new Selection(end, start) : new Selection(start, end);
};

const setSelections = (textEditor: TextEditor, ranges: readonly MselRange[]): void => {
  const selections = ranges.map((range) => toSelection(textEditor, range));
  textEditor.selections = selections;
  textEditor.revealRange(new Range(selections[0].start, selections[0].end), TextEditorRevealType.InCenterIfOutsideViewport);
};

/**
 * Asks for every value of the command. Returns `undefined` when the user cancels or
 * (defensively, despite `validateInput`) enters an invalid value.
 */
const askInputs = async (dependencies: MselDependencies, entry: MselCommandEntry): Promise<string[] | undefined> => {
  const values: string[] = [];
  for (const step of entry.inputs ?? []) {
    const value = await dependencies.showInputBox({
      prompt: step.prompt,
      placeHolder: step.placeHolder,
      value: step.value,
      ignoreFocusOut: true,
      validateInput: step.validate,
    });
    if (value === undefined || step.validate(value) !== undefined) {
      return undefined;
    }
    values.push(value);
  }
  return values;
};

/** Applies what the command returned. */
const applyResult = async (textEditor: TextEditor, dependencies: MselDependencies, entry: MselCommandEntry, result: MselResult): Promise<void> => {
  switch (result.kind) {
    case 'unchanged':
      return;
    case 'info':
      void dependencies.notifier.showInformationMessage(result.message);
      return;
    case 'warn':
      void dependencies.notifier.showWarningMessage(result.message);
      return;
    case 'select':
      if (result.ranges.length === 0) {
        return;
      }
      if (result.ranges.length > MSEL_MAX_SELECTIONS) {
        void dependencies.notifier.showWarningMessage(MSEL_TOO_MANY_SELECTIONS);
        return;
      }
      setSelections(textEditor, result.ranges);
      if (result.message !== undefined) {
        void dependencies.notifier.showInformationMessage(result.message);
      }
      return;
    case 'edit': {
      const document = textEditor.document;
      const edits = result.edits.map(({ start, end, text }) => ({ range: new Range(document.positionAt(start), document.positionAt(end)), text }));
      const applied = await textEditor.edit((editBuilder) => {
        edits.forEach(({ range, text }) => editBuilder.replace(range, text));
      });
      if (!applied) {
        void dependencies.notifier.showWarningMessage(`${prefixOf(entry)}the editor did not accept the edit.`);
        return;
      }
      if (result.ranges.length > 0) {
        setSelections(textEditor, result.ranges);
      }
      return;
    }
  }
};

/**
 * The MSEL-001..030 and LINEX-015..023 commands by command name (without `selection-manipulator.`).
 * The dependencies (and, in tests, the command table) can be replaced.
 */
export const mselCommandHandlerInternal = (dependencies: MselDependencies, entries: readonly MselCommandEntry[] = ALL_MSEL_COMMAND_ENTRIES) =>
  (name: string) => {
    const entry = entries.find((candidate) => candidate.name === name);
    if (!entry) {
      throw new Error(`Unknown MSEL command: ${name}`);
    }
    return async (textEditor: TextEditor): Promise<void> => {
      try {
        if (entry.needsTwo && textEditor.selections.length < 2) {
          // Checked before any input box: these commands need two or more selections.
          void dependencies.notifier.showWarningMessage(MSEL_NEED_TWO);
          return;
        }
        const inputs = await askInputs(dependencies, entry);
        if (inputs === undefined) {
          return;
        }
        // The selections and the text are read only after the input boxes close: the document
        // may have changed meanwhile. The version tells whether it changes while the worker runs.
        const document = textEditor.document;
        const version = document.version;
        const text = document.getText();
        const ranges = rangesOf(textEditor);
        const context: MselContext = {
          text,
          ranges,
          inputs,
          tabSize: typeof textEditor.options.tabSize === 'number' ? textEditor.options.tabSize : 4,
          wordAt: (offset) => {
            const word = document.getWordRangeAtPosition(document.positionAt(offset));
            return word === undefined ? undefined : { start: document.offsetAt(word.start), end: document.offsetAt(word.end) };
          },
        };
        let result: MselResult;
        try {
          if (entry.regex !== undefined) {
            const texts = ranges.map((range) => text.slice(range.start, range.end));
            const total = texts.reduce((sum, value) => sum + value.length, 0);
            if (total > dependencies.regexMaxInputLength) {
              throw new LineInputTooLargeError(total, dependencies.regexMaxInputLength);
            }
            if (entry.regex === 'test') {
              context.regexMatches = await dependencies.runRegex(inputs[0], texts, dependencies.regexTimeoutMs);
            } else {
              const splits = await dependencies.runRegexSplit(inputs[0], texts, dependencies.regexTimeoutMs, MSEL_MAX_SELECTIONS);
              if (splits === undefined) {
                throw new MselTooManySelectionsError();
              }
              context.regexSplits = splits;
            }
            if (document.version !== version) {
              void dependencies.notifier.showWarningMessage(MSEL_DOCUMENT_CHANGED);
              return;
            }
          }
          result = entry.run(context);
        } catch (error) {
          notifyFailure(dependencies, entry, error);
          return;
        }
        await applyResult(textEditor, dependencies, entry, result);
      } catch (error) {
        // Last resort: an unexpected failure is reported instead of escaping to VS Code.
        notifyFailure(dependencies, entry, error);
      }
    };
  };

export const mselCommandHandler = mselCommandHandlerInternal(defaultDependencies);
