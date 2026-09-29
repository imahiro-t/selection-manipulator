import { EndOfLine, InputBoxOptions, Range, Selection, TextEditor, TextEditorRevealType, window } from 'vscode';
import { MD_COMMAND_ENTRIES, MdCommandEntry, MdInputError, MdRange, MdResult } from './mdTransforms';

/** How the handlers tell the user what happened. */
export interface MdNotifier {
  showInformationMessage(message: string): Thenable<unknown>;
  showWarningMessage(message: string): Thenable<unknown>;
  showErrorMessage(message: string): Thenable<unknown>;
}

/** What the handlers need from VS Code; replaced in tests. */
export interface MdDependencies {
  notifier: MdNotifier;
  showInputBox: (options: InputBoxOptions) => Thenable<string | undefined>;
}

const defaultDependencies: MdDependencies = {
  notifier: window,
  showInputBox: (options) => window.showInputBox(options),
};

export const MD_TEXT_NOT_CHANGED = 'The text was not changed: ';

/**
 * Logs an unexpected failure so it can be traced: only the error name and the stack frames, never
 * the message, which may quote the selected text.
 */
const logUnexpected = (error: unknown): void => {
  const name = error instanceof Error ? error.name : typeof error;
  const frames = error instanceof Error && typeof error.stack === 'string'
    ? error.stack.split('\n').filter((line) => /^\s+at /.test(line)).join('\n')
    : '';
  console.error(`Selection Manipulator: a Markdown command failed unexpectedly (${name})${frames === '' ? '' : `\n${frames}`}`);
};

/** Tells why nothing was changed. Not awaited: the Thenable only settles when the notification is dismissed. */
const notifyFailure = (dependencies: MdDependencies, error: unknown): void => {
  if (error instanceof MdInputError) {
    void dependencies.notifier.showWarningMessage(`${MD_TEXT_NOT_CHANGED}${error.message}.`);
    return;
  }
  logUnexpected(error);
  void dependencies.notifier.showErrorMessage(`${MD_TEXT_NOT_CHANGED}the selections could not be processed.`);
};

/** The selections in document order, as offsets. */
const rangesOf = (textEditor: TextEditor): MdRange[] => {
  const document = textEditor.document;
  return [...textEditor.selections]
    .sort((a, b) => a.start.compareTo(b.start) || a.end.compareTo(b.end))
    .map((selection) => ({
      start: document.offsetAt(selection.start),
      end: document.offsetAt(selection.end),
      reversed: selection.isReversed,
    }));
};

const setSelections = (textEditor: TextEditor, ranges: readonly MdRange[]): void => {
  const document = textEditor.document;
  const selections = ranges.map((range) => {
    const start = document.positionAt(range.start);
    const end = document.positionAt(range.end);
    return range.reversed ? new Selection(end, start) : new Selection(start, end);
  });
  textEditor.selections = selections;
  textEditor.revealRange(new Range(selections[0].start, selections[0].end), TextEditorRevealType.InCenterIfOutsideViewport);
};

/**
 * Asks for every value of the command. Returns `undefined` when the user cancels or
 * (defensively, despite `validateInput`) enters an invalid value.
 */
const askInputs = async (dependencies: MdDependencies, entry: MdCommandEntry): Promise<string[] | undefined> => {
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
const applyResult = async (textEditor: TextEditor, dependencies: MdDependencies, result: MdResult): Promise<void> => {
  switch (result.kind) {
    case 'unchanged':
      return;
    case 'info':
      void dependencies.notifier.showInformationMessage(result.message);
      return;
    case 'edit': {
      const document = textEditor.document;
      const edits = result.edits.map(({ start, end, text }) => ({ range: new Range(document.positionAt(start), document.positionAt(end)), text }));
      const applied = await textEditor.edit((editBuilder) => {
        edits.forEach(({ range, text }) => editBuilder.replace(range, text));
      });
      if (!applied) {
        void dependencies.notifier.showWarningMessage(`${MD_TEXT_NOT_CHANGED}the editor did not accept the edit.`);
        return;
      }
      setSelections(textEditor, result.ranges);
      return;
    }
  }
};

/**
 * The MD-001..025 commands by command name (without `selection-manipulator.`). The dependencies
 * (and, in tests, the command table) can be replaced.
 */
export const mdCommandHandlerInternal = (dependencies: MdDependencies, entries: readonly MdCommandEntry[] = MD_COMMAND_ENTRIES) =>
  (name: string) => {
    const entry = entries.find((candidate) => candidate.name === name);
    if (!entry) {
      throw new Error(`Unknown Markdown command: ${name}`);
    }
    return async (textEditor: TextEditor): Promise<void> => {
      try {
        // Empty selections are ignored by every command but MD-003: with nothing selected there
        // is nothing to do, and no input box is shown.
        if (!entry.cursor && textEditor.selections.every((selection) => selection.isEmpty)) {
          return;
        }
        const inputs = await askInputs(dependencies, entry);
        if (inputs === undefined) {
          return;
        }
        // The text and the selections are read after the input boxes close: they may have changed.
        const document = textEditor.document;
        let result: MdResult;
        try {
          result = entry.run({
            text: document.getText(),
            ranges: rangesOf(textEditor),
            eol: document.eol === EndOfLine.CRLF ? '\r\n' : '\n',
            inputs,
          });
        } catch (error) {
          notifyFailure(dependencies, error);
          return;
        }
        await applyResult(textEditor, dependencies, result);
      } catch (error) {
        // Last resort: an unexpected failure is reported instead of escaping to VS Code.
        notifyFailure(dependencies, error);
      }
    };
  };

export const mdCommandHandler = mdCommandHandlerInternal(defaultDependencies);
