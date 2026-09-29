import { EndOfLine, InputBoxOptions, QuickPickItem, QuickPickOptions, Selection, TextEditor, window } from 'vscode';
import { EncOutputTooLargeError, MAX_OUTPUT_LENGTH } from './encodeTransforms';
import {
  assertGenInputLength,
  assertGenTargetCount,
  cryptoRandom,
  findGenPromptProblem,
  GenInputError,
  genPromptValue,
  GenRandom,
  isBlank,
} from './genCommon';
import { GEN_COMMAND_ENTRIES, GenCommandEntry, GenContext, GenPrompt } from './genTransforms';

/** How the handlers tell the user what happened. */
export interface GenNotifier {
  showWarningMessage(message: string): Thenable<unknown>;
  showErrorMessage(message: string): Thenable<unknown>;
}

/** A quick pick item that carries the value it stands for. */
export interface GenQuickPickItem extends QuickPickItem {
  value: string;
}

/** What the handlers need from VS Code and the environment; replaced in tests. */
export interface GenDependencies {
  notifier: GenNotifier;
  /** Asks for a typed value. */
  showInputBox: (options: InputBoxOptions) => Thenable<string | undefined>;
  /** Asks for one of several choices. */
  showQuickPick: (items: GenQuickPickItem[], options: QuickPickOptions) => Thenable<GenQuickPickItem | undefined>;
  /** Where the random values come from (crypto). */
  random: GenRandom;
  /** The current time. */
  now: () => Date;
}

const defaultDependencies: GenDependencies = {
  notifier: window,
  showInputBox: (options) => window.showInputBox(options),
  showQuickPick: (items, options) => window.showQuickPick(items, options),
  random: cryptoRandom,
  now: () => new Date(),
};

export const GEN_NOTHING_SELECTED = 'Select the lines to pick from.';
export const GEN_NOT_CHANGED = 'The selection was not changed: ';

const documentEol = (textEditor: TextEditor): string =>
  textEditor.document.eol === EndOfLine.CRLF ? '\r\n' : '\n';

const entryOf = (name: string): GenCommandEntry => {
  const entry = GEN_COMMAND_ENTRIES.find((candidate) => candidate.name === name);
  if (!entry) {
    throw new Error(`Unknown GEN command: ${name}`);
  }
  return entry;
};

/** A selection or cursor to write to, and its text when the command reads it ('' otherwise). */
interface Target {
  selection: Selection;
  text: string;
}

/** Where an error happened, to name the selection when there are several. */
class TargetError extends Error {
  constructor(readonly inner: unknown, readonly index: number, readonly count: number) {
    super('target error');
  }
}

/**
 * The targets of the command in document order. The selected text is read only by the commands
 * that use it, and its length is checked before anything else is done with it (a selection over
 * GEN_MAX_INPUT_LENGTH is refused before it is split or parsed). `lines`: only the non-empty,
 * non-blank selections. `text-or-prompt`: every target; a blank one gets ''.
 */
const readTargets = (textEditor: TextEditor, entry: GenCommandEntry): Target[] => {
  const selections = [...textEditor.selections].sort((a, b) => a.start.compareTo(b.start));
  const targets = entry.targets ?? 'all';
  if (targets === 'all') {
    assertGenTargetCount(selections.length);
    return selections.map((selection) => ({ selection, text: '' }));
  }
  const candidates = targets === 'lines' ? selections.filter((selection) => !selection.isEmpty) : selections;
  assertGenTargetCount(candidates.length);
  const result: Target[] = [];
  candidates.forEach((selection, index) => {
    const text = selection.isEmpty ? '' : textEditor.document.getText(selection);
    try {
      assertGenInputLength(text);
    } catch (error) {
      throw new TargetError(error, index, candidates.length);
    }
    if (targets === 'lines') {
      if (!isBlank(text)) {
        result.push({ selection, text });
      }
    } else {
      result.push({ selection, text: isBlank(text) ? '' : text });
    }
  });
  return result;
};

/** The options of an input box: the default value is filled in, nothing typed is saved. */
export const inputBoxOptions = (prompt: GenPrompt, previous: readonly string[], now: Date): InputBoxOptions => ({
  prompt: prompt.prompt,
  placeHolder: prompt.placeHolder,
  value: prompt.value(now),
  ignoreFocusOut: true,
  validateInput: (value) => findGenPromptProblem(value, prompt.rule, previous),
});

const isExpected = (error: unknown): boolean => error instanceof GenInputError || error instanceof EncOutputTooLargeError;

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
  console.error(`Selection Manipulator: a generator command failed unexpectedly (${name})${frames === '' ? '' : `\n${frames}`}`);
};

/** The text of an error: the message of an input error, a fixed text for anything unexpected. */
const reasonOf = (error: unknown): string => {
  if (error instanceof GenInputError) {
    return error.message;
  }
  logUnexpected(error);
  return 'the text could not be generated';
};

/**
 * Shows why nothing was changed. Not awaited: the Thenable only settles when the notification is
 * dismissed. The selection is named when the command reads the selections and there are several.
 */
const notifyFailure = (dependencies: GenDependencies, entry: GenCommandEntry, error: unknown): void => {
  let cause = error;
  let where = '';
  if (error instanceof TargetError) {
    cause = error.inner;
    if ((entry.targets ?? 'all') !== 'all' && error.count > 1) {
      where = `selection ${error.index + 1} of ${error.count}: `;
    }
  }
  if (cause instanceof EncOutputTooLargeError) {
    void dependencies.notifier.showWarningMessage(`${GEN_NOT_CHANGED}${cause.message}. Use fewer cursors or a smaller amount.`);
    return;
  }
  void dependencies.notifier.showErrorMessage(`${GEN_NOT_CHANGED}${where}${reasonOf(cause)}`);
};

/**
 * Asks one prompt. Returns the answer (trimmed unless the prompt keeps the spaces), or
 * `undefined` when it was cancelled or refused (then nothing else happens).
 */
const askPrompt = async (
  dependencies: GenDependencies,
  prompt: GenPrompt,
  previous: readonly string[],
  now: Date
): Promise<string | undefined> => {
  const value = await dependencies.showInputBox(inputBoxOptions(prompt, previous, now));
  if (value === undefined) {
    return undefined;
  }
  // Checked again in case a value that validateInput rejects comes back anyway.
  const problem = findGenPromptProblem(value, prompt.rule, previous);
  if (problem !== undefined) {
    void dependencies.notifier.showWarningMessage(`${GEN_NOT_CHANGED}${problem}`);
    return undefined;
  }
  return genPromptValue(value, prompt.rule);
};

/**
 * Asks the quick pick and the prompts of the command once (for all targets), and the prompts for
 * the empty targets when `withEmpty`. Returns the answers in that order, or `undefined`.
 */
const askInputs = async (
  dependencies: GenDependencies,
  entry: GenCommandEntry,
  withEmpty: boolean,
  now: Date
): Promise<string[] | undefined> => {
  const answers: string[] = [];
  if (entry.pick) {
    const items: GenQuickPickItem[] = entry.pick.items.map(({ label, value }) => ({ label, value }));
    const picked = await dependencies.showQuickPick(items, { placeHolder: entry.pick.placeHolder, ignoreFocusOut: true });
    if (picked === undefined) {
      return undefined;
    }
    answers.push(picked.value);
  }
  const prompts = withEmpty ? [...entry.prompts, ...(entry.emptyPrompts ?? [])] : entry.prompts;
  for (const prompt of prompts) {
    const answer = await askPrompt(dependencies, prompt, answers, now);
    if (answer === undefined) {
      return undefined;
    }
    answers.push(answer);
  }
  return answers;
};

/**
 * Generates the text of every target (in document order) within MAX_OUTPUT_LENGTH: each target
 * gets what is left as its budget. Throws (a `TargetError` for a target) when one fails.
 */
const generateAll = (entry: GenCommandEntry, targets: readonly Target[], inputs: readonly string[], context: GenContext): string[] => {
  entry.precheck?.(targets.length, inputs, context);
  const results: string[] = [];
  let total = 0;
  targets.forEach(({ text }, index) => {
    try {
      const result = entry.generate(index, text, inputs, context, MAX_OUTPUT_LENGTH - total);
      total += result.length;
      if (total > MAX_OUTPUT_LENGTH) {
        throw new EncOutputTooLargeError(total, MAX_OUTPUT_LENGTH);
      }
      results.push(result);
    } catch (error) {
      throw new TargetError(error, index, targets.length);
    }
  });
  if (entry.sortResults) {
    results.sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
  }
  return results;
};

/** Reads the targets; tells the user and returns `undefined` when there is nothing to do or a problem. */
const targetsOrNotify = (textEditor: TextEditor, dependencies: GenDependencies, entry: GenCommandEntry): Target[] | undefined => {
  let targets: Target[];
  try {
    targets = readTargets(textEditor, entry);
  } catch (error) {
    notifyFailure(dependencies, entry, error);
    return undefined;
  }
  if (targets.length === 0) {
    void dependencies.notifier.showWarningMessage(GEN_NOTHING_SELECTED);
    return undefined;
  }
  return targets;
};

const needsEmptyPrompts = (entry: GenCommandEntry, targets: readonly Target[]): boolean =>
  entry.targets === 'text-or-prompt' && targets.some(({ text }) => text === '');

/**
 * The GEN commands by command name (without `selection-manipulator.`). Nothing is edited unless
 * the text of every target was generated; then all targets are written in one edit. The
 * dependencies can be replaced in tests.
 */
export const genCommandHandlerInternal = (dependencies: GenDependencies) =>
  (name: string) => {
    const entry = entryOf(name);
    return async (textEditor: TextEditor): Promise<void> => {
      try {
        const first = targetsOrNotify(textEditor, dependencies, entry);
        if (first === undefined) {
          return;
        }
        const now = dependencies.now();
        const askedEmpty = needsEmptyPrompts(entry, first);
        const inputs = await askInputs(dependencies, entry, askedEmpty, now);
        if (inputs === undefined) {
          return;
        }
        // The selections are read again: the document may have changed while a prompt was open.
        const targets = targetsOrNotify(textEditor, dependencies, entry);
        if (targets === undefined) {
          return;
        }
        if (!askedEmpty && needsEmptyPrompts(entry, targets)) {
          for (const prompt of entry.emptyPrompts ?? []) {
            const answer = await askPrompt(dependencies, prompt, inputs, now);
            if (answer === undefined) {
              return;
            }
            inputs.push(answer);
          }
        }
        const context: GenContext = { random: dependencies.random, now, eol: documentEol(textEditor) };
        let results: string[];
        try {
          results = generateAll(entry, targets, inputs, context);
        } catch (error) {
          notifyFailure(dependencies, entry, error);
          return;
        }
        await textEditor.edit((editBuilder) => {
          targets.forEach(({ selection }, index) => editBuilder.replace(selection, results[index]));
        });
      } catch (error) {
        // Last resort: an unexpected failure is reported instead of escaping to VS Code.
        void dependencies.notifier.showErrorMessage(`${GEN_NOT_CHANGED}${reasonOf(error)}`);
      }
    };
  };

export const genCommandHandler = genCommandHandlerInternal(defaultDependencies);
