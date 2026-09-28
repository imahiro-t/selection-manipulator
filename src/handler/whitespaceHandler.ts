import {
  EndOfLine,
  InputBoxOptions,
  TextEditor,
  window,
} from 'vscode';
import {
  COLUMN_MAX,
  COLUMN_MIN,
  DELIMITER_MAX_LENGTH,
  INDENT_MAX,
  INDENT_MIN,
  validateColumnInput,
  validateDelimiterInput,
  validateIndentInput,
  WhitespaceCommand,
  WhitespaceInputCommand,
  WhitespaceOptions,
  whitespaceTransforms,
} from './whitespaceTransforms';

const documentEol = (textEditor: TextEditor): string =>
  textEditor.document.eol === EndOfLine.CRLF ? '\r\n' : '\n';

/**
 * Transforms every non-empty selection independently and replaces them in one edit.
 * Selections whose text does not change are not replaced.
 */
const applyTransform = async (
  textEditor: TextEditor,
  command: WhitespaceCommand,
  options: Omit<WhitespaceOptions, 'eol'> = {}
): Promise<void> => {
  const selections = textEditor.selections.filter((selection) => !selection.isEmpty);
  if (selections.length === 0) {
    return;
  }
  const transform = whitespaceTransforms[command];
  const fullOptions: WhitespaceOptions = { ...options, eol: documentEol(textEditor) };
  const replacements = selections
    .map((selection) => {
      const text = textEditor.document.getText(selection);
      return { selection, text, result: transform(text, fullOptions) };
    })
    .filter((replacement) => replacement.result !== replacement.text);
  if (replacements.length === 0) {
    return;
  }
  await textEditor.edit((editBuilder) => {
    replacements.forEach(({ selection, result }) => editBuilder.replace(selection, result));
  });
};

/** WS commands that do not need any input (31 commands). */
export const whitespaceHandler = (command: Exclude<WhitespaceCommand, WhitespaceInputCommand>) =>
  (textEditor: TextEditor): Promise<void> => applyTransform(textEditor, command);

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
  showInputBox: (options: InputBoxOptions) => Thenable<string | undefined>
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
  await applyTransform(textEditor, command, spec.toOptions(input));
};

export const whitespaceInputHandler = whitespaceInputHandlerInternal(window.showInputBox);
