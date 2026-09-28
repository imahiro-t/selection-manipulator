import {
  EndOfLine,
  InputBoxOptions,
  Selection,
  TextEditor,
  window,
} from 'vscode';
import { openTextDocument } from '../common';
import {
  EncCommand,
  EncInputCommand,
  EncOptions,
  EncOutput,
  EncOutputTooLargeError,
  encTransforms,
  estimateMaxOutputLength,
  MAX_OUTPUT_LENGTH,
} from './encodeTransforms';

const documentEol = (textEditor: TextEditor): string =>
  textEditor.document.eol === EndOfLine.CRLF ? '\r\n' : '\n';

/** How the handlers tell the user that a command did not change anything because of an error. */
export interface EncNotifier {
  showWarningMessage(message: string): Thenable<unknown>;
  showErrorMessage(message: string): Thenable<unknown>;
}

/** What the handlers need from VS Code; replaced in tests. */
export interface EncDependencies {
  notifier: EncNotifier;
  /** Opens the result of a basic (non-Replace) command in a new read-only editor. */
  openResult: (content: string) => Thenable<unknown>;
}

const defaultDependencies: EncDependencies = {
  notifier: window,
  openResult: (content) => openTextDocument(content),
};

/** The non-empty selections, in document order (empty selections are skipped). */
const targetSelections = (textEditor: TextEditor): Selection[] =>
  textEditor.selections
    .filter((selection) => !selection.isEmpty)
    .sort((a, b) => a.start.compareTo(b.start));

const tooLarge = (length: number): EncOutputTooLargeError => new EncOutputTooLargeError(length, MAX_OUTPUT_LENGTH);

/**
 * Converts every non-empty selection independently, then either opens the results in one new
 * editor (joined with the document's EOL, in document order) or replaces each selection.
 *
 * All selections share MAX_OUTPUT_LENGTH: before converting a selection the conservative
 * estimate is checked (when there is one), and after converting it the actual length is. When a
 * conversion fails or the limit is exceeded, nothing is edited, no editor is opened, and the
 * user is told why.
 */
const applyTransform = async (
  textEditor: TextEditor,
  dependencies: EncDependencies,
  command: EncCommand,
  output: EncOutput,
  options: Omit<EncOptions, 'eol'> = {}
): Promise<void> => {
  const selections = targetSelections(textEditor);
  if (selections.length === 0) {
    return;
  }
  const { notifier } = dependencies;
  const transform = encTransforms[command];
  const eol = documentEol(textEditor);
  const results: { selection: Selection; text: string; result: string }[] = [];
  let total = 0;
  let current = 0;
  try {
    for (const [index, selection] of selections.entries()) {
      current = index;
      const text = textEditor.document.getText(selection);
      const estimate = estimateMaxOutputLength(command, text);
      if (estimate !== undefined && total + estimate > MAX_OUTPUT_LENGTH) {
        throw tooLarge(total + estimate);
      }
      const result = transform(text, { ...options, eol });
      total += result.length;
      if (total > MAX_OUTPUT_LENGTH) {
        throw tooLarge(total);
      }
      results.push({ selection, text, result });
    }
  } catch (error) {
    // Not awaited: the returned Thenable only settles when the notification is dismissed.
    if (error instanceof EncOutputTooLargeError) {
      void notifier.showWarningMessage(
        `The selection was not changed: ${error.message}. Select less text.`
      );
    } else {
      const where = selections.length > 1 ? `selection ${current + 1} of ${selections.length}: ` : '';
      const reason = error instanceof Error ? error.message : String(error);
      void notifier.showErrorMessage(`The selection was not changed: ${where}${reason}`);
    }
    return;
  }
  if (output === 'new-tab') {
    await dependencies.openResult(results.map(({ result }) => result).join(eol));
    return;
  }
  const replacements = results.filter(({ text, result }) => text !== result);
  if (replacements.length === 0) {
    return;
  }
  await textEditor.edit((editBuilder) => {
    replacements.forEach(({ selection, result }) => editBuilder.replace(selection, result));
  });
};

/** ENC commands that do not need any input (39 commands). The dependencies can be replaced in tests. */
export const encodeHandlerInternal = (dependencies: EncDependencies) =>
  (command: Exclude<EncCommand, EncInputCommand>, output: EncOutput) =>
    (textEditor: TextEditor): Promise<void> => applyTransform(textEditor, dependencies, command, output);

export const encodeHandler = encodeHandlerInternal(defaultDependencies);

/** ENC-023: an optional sign and 1 to 9 digits (always a safe integer). */
const SHIFT_PATTERN = /^[+-]?[0-9]{1,9}$/;

export const validateShiftInput = (value: string): string | undefined =>
  SHIFT_PATTERN.test(value) ? undefined : 'Enter an integer (e.g. 3 or -3).';

/**
 * ENC-023 Caesar Shift: asks for the shift amount once (even with several selections), then
 * converts every non-empty selection and opens the result in a new editor. Does nothing when the
 * input box is cancelled or the value is not an integer.
 */
export const encodeInputHandlerInternal = (
  showInputBox: (options: InputBoxOptions) => Thenable<string | undefined>,
  dependencies: EncDependencies = defaultDependencies
) => (command: EncInputCommand) => async (textEditor: TextEditor): Promise<void> => {
  // Only decides whether to ask at all: no input box without anything to convert.
  if (targetSelections(textEditor).length === 0) {
    return;
  }
  const input = await showInputBox({
    prompt: 'Shift amount (integer, e.g. 3 or -3)',
    placeHolder: '3',
    validateInput: validateShiftInput,
  });
  // Cancelled, or (defensively) invalid despite validateInput.
  if (input === undefined || validateShiftInput(input) !== undefined) {
    return;
  }
  const shift = Number(input);
  if (!Number.isSafeInteger(shift)) {
    return;
  }
  // applyTransform reads the selections again: the document may have changed while the input
  // box was shown, and VS Code keeps the current selections in step with such edits.
  await applyTransform(textEditor, dependencies, command, 'new-tab', { shift });
};

export const encodeInputHandler = encodeInputHandlerInternal(window.showInputBox);
