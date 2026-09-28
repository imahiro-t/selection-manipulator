import {
  EndOfLine,
  InputBoxOptions,
  Selection,
  TextEditor,
  window,
} from 'vscode';
import {
  COLUMN_MAX,
  COLUMN_MIN,
  DELIMITER_MAX_LENGTH,
  INDENT_MAX,
  INDENT_MIN,
  MAX_ADDED_LENGTH,
  validateColumnInput,
  validateDelimiterInput,
  validateIndentInput,
  WhitespaceCommand,
  WhitespaceInputCommand,
  WhitespaceOptions,
  WhitespaceOutputTooLargeError,
  whitespaceTransforms,
} from './whitespaceTransforms';

const documentEol = (textEditor: TextEditor): string =>
  textEditor.document.eol === EndOfLine.CRLF ? '\r\n' : '\n';

/** How the handlers tell the user that a command did not change anything because of an error. */
export interface WhitespaceNotifier {
  showWarningMessage(message: string): Thenable<unknown>;
  showErrorMessage(message: string): Thenable<unknown>;
}

/**
 * WS-025: the selection ends at the start of a line and the document goes on after it
 * (typical for whole-line selections), so its final line break must be kept.
 */
const isFollowedByLine = (textEditor: TextEditor, selection: Selection): boolean => {
  const document = textEditor.document;
  const documentEnd = document.lineAt(document.lineCount - 1).range.end;
  return selection.end.character === 0 && !selection.end.isEqual(documentEnd);
};

/**
 * Transforms every non-empty selection independently and replaces them in one edit.
 * Selections whose text does not change are not replaced.
 *
 * All selections share one budget of MAX_ADDED_LENGTH added characters. When a transform
 * would exceed it (or fails for any other reason), nothing is edited and the user is told why.
 */
const applyTransform = async (
  textEditor: TextEditor,
  notifier: WhitespaceNotifier,
  command: WhitespaceCommand,
  options: Omit<WhitespaceOptions, 'eol'> = {}
): Promise<void> => {
  const selections = textEditor.selections.filter((selection) => !selection.isEmpty);
  if (selections.length === 0) {
    return;
  }
  const transform = whitespaceTransforms[command];
  const eol = documentEol(textEditor);
  const replacements: { selection: Selection; result: string }[] = [];
  let budget = MAX_ADDED_LENGTH;
  try {
    for (const selection of selections) {
      const text = textEditor.document.getText(selection);
      const result = transform(text, {
        ...options,
        eol,
        followedByLine: isFollowedByLine(textEditor, selection),
        maxAddedLength: budget,
      });
      budget -= Math.max(0, result.length - text.length);
      if (result !== text) {
        replacements.push({ selection, result });
      }
    }
  } catch (error) {
    // Not awaited: the returned Thenable only settles when the notification is dismissed.
    if (error instanceof WhitespaceOutputTooLargeError) {
      void notifier.showWarningMessage(
        `The selection was not changed: the result would add ${error.added.toLocaleString('en-US')} characters `
        + `(limit: ${MAX_ADDED_LENGTH.toLocaleString('en-US')}). Select fewer or shorter lines.`
      );
    } else {
      void notifier.showErrorMessage(
        `The selection was not changed: ${error instanceof Error ? error.message : String(error)}`
      );
    }
    return;
  }
  if (replacements.length === 0) {
    return;
  }
  await textEditor.edit((editBuilder) => {
    replacements.forEach(({ selection, result }) => editBuilder.replace(selection, result));
  });
};

/** WS commands that do not need any input (31 commands). The notifier can be replaced in tests. */
export const whitespaceHandlerInternal = (notifier: WhitespaceNotifier) =>
  (command: Exclude<WhitespaceCommand, WhitespaceInputCommand>) =>
    (textEditor: TextEditor): Promise<void> => applyTransform(textEditor, notifier, command);

export const whitespaceHandler = whitespaceHandlerInternal(window);

interface InputSpec {
  options: InputBoxOptions;
  validate: (value: string) => string | undefined;
  toOptions: (value: string) => Omit<WhitespaceOptions, 'eol'>;
}

const inputSpecs: Record<WhitespaceInputCommand, InputSpec> = {
  'hard-wrap-n': {
    options: { prompt: `Wrap column (${COLUMN_MIN}-${COLUMN_MAX})`, value: '80' },
    validate: validateColumnInput,
    toOptions: (value) => ({ n: Number(value.trim()) }),
  },
  'indent-n': {
    options: { prompt: `Number of spaces to indent (${INDENT_MIN}-${INDENT_MAX})`, value: '4' },
    validate: validateIndentInput,
    toOptions: (value) => ({ n: Number(value.trim()) }),
  },
  'outdent-n': {
    options: { prompt: `Maximum number of spaces to remove (${INDENT_MIN}-${INDENT_MAX})`, value: '4' },
    validate: validateIndentInput,
    toOptions: (value) => ({ n: Number(value.trim()) }),
  },
  'align-custom': {
    options: {
      prompt: `Delimiter to align on (literal text, up to ${DELIMITER_MAX_LENGTH} characters)`,
      placeHolder: 'e.g. =>',
    },
    validate: validateDelimiterInput,
    toOptions: (value) => ({ delimiter: value }),
  },
};

/**
 * WS-013 / WS-023 / WS-031 / WS-032: asks for the value once (even with several selections),
 * then transforms every selection. Does nothing when cancelled or when the value is invalid.
 */
export const whitespaceInputHandlerInternal = (
  showInputBox: (options: InputBoxOptions) => Thenable<string | undefined>,
  notifier: WhitespaceNotifier = window
) => (command: WhitespaceInputCommand) => async (textEditor: TextEditor): Promise<void> => {
  if (textEditor.selections.every((selection) => selection.isEmpty)) {
    return;
  }
  const spec = inputSpecs[command];
  const input = await showInputBox({ ...spec.options, validateInput: spec.validate });
  // Cancelled, or (defensively) invalid despite validateInput.
  if (input === undefined || spec.validate(input) !== undefined) {
    return;
  }
  await applyTransform(textEditor, notifier, command, spec.toOptions(input));
};

export const whitespaceInputHandler = whitespaceInputHandlerInternal(window.showInputBox);
