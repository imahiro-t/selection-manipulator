import {
  EndOfLine,
  InputBoxOptions,
  Selection,
  TextEditor,
  window,
} from 'vscode';
import {
  AFFIX_MAX_LENGTH,
  describeAddedLength,
  isWrapContentCommand,
  MAX_ADDED_LENGTH,
  TAG_NAME_MAX_LENGTH,
  validateAffixInput,
  validateTagNameInput,
  WrapCommand,
  WrapInputCommand,
  WrapOptions,
  WrapOutputTooLargeError,
  wrapTransforms,
} from './wrapTransforms';

const documentEol = (textEditor: TextEditor): string =>
  textEditor.document.eol === EndOfLine.CRLF ? '\r\n' : '\n';

/** How the handlers tell the user that a command did not change anything because of an error. */
export interface WrapNotifier {
  showWarningMessage(message: string): Thenable<unknown>;
  showErrorMessage(message: string): Thenable<unknown>;
}

/**
 * The selections a command works on: every selection for the commands that enclose the whole
 * selection (an empty one gets the pair inserted, like the existing Enclose / Quote commands),
 * only the non-empty ones for the commands that analyse the content.
 */
const targetSelections = (textEditor: TextEditor, command: WrapCommand): readonly Selection[] =>
  isWrapContentCommand(command)
    ? textEditor.selections.filter((selection) => !selection.isEmpty)
    : textEditor.selections;

/**
 * Transforms every target selection independently and replaces them in one edit.
 * Selections whose text does not change are not replaced.
 *
 * All selections share one budget of MAX_ADDED_LENGTH added characters. When a transform
 * would exceed it (or fails for any other reason), nothing is edited and the user is told why.
 */
const applyTransform = async (
  textEditor: TextEditor,
  notifier: WrapNotifier,
  command: WrapCommand,
  options: Omit<WrapOptions, 'eol'> = {}
): Promise<void> => {
  const selections = targetSelections(textEditor, command);
  if (selections.length === 0) {
    return;
  }
  const transform = wrapTransforms[command];
  const eol = documentEol(textEditor);
  const replacements: { selection: Selection; result: string }[] = [];
  let budget = MAX_ADDED_LENGTH;
  try {
    for (const selection of selections) {
      const text = textEditor.document.getText(selection);
      const result = transform(text, { ...options, eol, maxAddedLength: budget });
      budget -= Math.max(0, result.length - text.length);
      if (result !== text) {
        replacements.push({ selection, result });
      }
    }
  } catch (error) {
    // Not awaited: the returned Thenable only settles when the notification is dismissed.
    if (error instanceof WrapOutputTooLargeError) {
      void notifier.showWarningMessage(
        // The overall limit, not error.limit (the budget left for this selection).
        `The selection was not changed: ${describeAddedLength(error.added, MAX_ADDED_LENGTH)}. `
        + 'Select less text or use shorter input.'
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

/** WRAP commands that do not need any input (26 commands). The notifier can be replaced in tests. */
export const wrapHandlerInternal = (notifier: WrapNotifier) =>
  (command: Exclude<WrapCommand, WrapInputCommand>) =>
    (textEditor: TextEditor): Promise<void> => applyTransform(textEditor, notifier, command);

export const wrapHandler = wrapHandlerInternal(window);

interface InputStep {
  options: InputBoxOptions;
  validate: (value: string) => string | undefined;
  toOptions: (value: string) => Omit<WrapOptions, 'eol'>;
}

const affixStep = (prompt: string, toOptions: (value: string) => Omit<WrapOptions, 'eol'>): InputStep => ({
  options: { prompt: `${prompt} (up to ${AFFIX_MAX_LENGTH.toLocaleString('en-US')} characters, no line breaks)` },
  validate: validateAffixInput,
  toOptions,
});

const inputSteps: Record<WrapInputCommand, InputStep[]> = {
  'enclose.custom': [
    affixStep('Prefix', (prefix) => ({ prefix })),
    affixStep('Suffix', (suffix) => ({ suffix })),
  ],
  'enclose.each-line.custom': [
    affixStep('Prefix for each line', (prefix) => ({ prefix })),
    affixStep('Suffix for each line', (suffix) => ({ suffix })),
  ],
  'enclose.html-tag': [{
    options: {
      prompt: `Tag name (letters, digits and hyphens, up to ${TAG_NAME_MAX_LENGTH} characters)`,
      placeHolder: 'e.g. span',
    },
    validate: validateTagNameInput,
    toOptions: (tagName) => ({ tagName }),
  }],
  'enclose.lines-block': [
    affixStep('Line to insert before', (before) => ({ before })),
    affixStep('Line to insert after', (after) => ({ after })),
  ],
};

/**
 * WRAP-001 / WRAP-002 / WRAP-018 / WRAP-027: asks for the values once (even with several
 * selections), then transforms every target selection. Does nothing when any input box is
 * cancelled or a value is invalid.
 */
export const wrapInputHandlerInternal = (
  showInputBox: (options: InputBoxOptions) => Thenable<string | undefined>,
  notifier: WrapNotifier = window
) => (command: WrapInputCommand) => async (textEditor: TextEditor): Promise<void> => {
  // Only decides whether to ask at all: no input box without anything to change.
  if (targetSelections(textEditor, command).length === 0) {
    return;
  }
  let options: Omit<WrapOptions, 'eol'> = {};
  for (const step of inputSteps[command]) {
    const input = await showInputBox({ ...step.options, validateInput: step.validate });
    // Cancelled, or (defensively) invalid despite validateInput.
    if (input === undefined || step.validate(input) !== undefined) {
      return;
    }
    options = { ...options, ...step.toOptions(input) };
  }
  // applyTransform reads the selections again: the document may have changed while the input
  // boxes were shown, and VS Code keeps the current selections in step with such edits.
  await applyTransform(textEditor, notifier, command, options);
};

export const wrapInputHandler = wrapInputHandlerInternal(window.showInputBox);
