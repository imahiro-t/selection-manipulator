import {
  env,
  InputBoxOptions,
  TextEditor,
  window,
} from 'vscode';
import { lowerLocale, upperLocale } from './caseTransforms';
import { applyEdit, EditGuardDeps, ensureUnchangedAfterInput } from '../editGuard';

type LocaleCaseMode = 'upper' | 'lower';

// `Intl.getCanonicalLocales` is available at runtime (ES2016+) but is not
// declared by the TypeScript lib bundled with this project.
const getCanonicalLocales = (locale: string): string[] =>
  (Intl as unknown as { getCanonicalLocales(locale: string): string[] }).getCanonicalLocales(locale);

/** Validation for the locale input box. Returns an error message, or undefined when valid. */
export const validateLocaleInput = (value: string): string | undefined => {
  const trimmed = value.trim();
  if (trimmed === '') {
    return 'Enter a locale tag (e.g. tr)';
  }
  try {
    getCanonicalLocales(trimmed);
    return undefined;
  } catch {
    return 'Invalid locale tag';
  }
};

/**
 * CASE-020 / CASE-021: asks for a locale once and applies
 * toLocaleUpperCase / toLocaleLowerCase to every selection.
 */
export const caseLocaleHandlerInternal = (
  showInputBox: (options: InputBoxOptions) => Thenable<string | undefined>,
  guard: EditGuardDeps = {}
) => (mode: LocaleCaseMode) => async (textEditor: TextEditor): Promise<void> => {
  const nonEmpty = () => textEditor.selections.filter((selection) => !selection.isEmpty);
  if (nonEmpty().length === 0) {
    return;
  }
  const versionBeforeInput = textEditor.document.version;
  const input = await showInputBox({
    prompt: `Locale for ${mode === 'upper' ? 'toLocaleUpperCase' : 'toLocaleLowerCase'}`,
    placeHolder: 'e.g. tr, az, lt, de',
    value: env.language,
    validateInput: validateLocaleInput,
  });
  // Cancelled, or (defensively) blank / invalid despite validateInput.
  if (input === undefined || validateLocaleInput(input) !== undefined) {
    return;
  }
  if (!ensureUnchangedAfterInput(textEditor, versionBeforeInput, guard)) {
    return;
  }
  // Re-read the selections: they may have moved while the input box was open.
  const selections = nonEmpty();
  if (selections.length === 0) {
    return;
  }
  const locale = getCanonicalLocales(input.trim())[0];
  const transform = mode === 'upper' ? upperLocale : lowerLocale;
  await applyEdit(textEditor, (editBuilder) => {
    selections.forEach((selection) => {
      editBuilder.replace(selection, transform(textEditor.document.getText(selection), locale));
    });
  }, { notifier: guard.notifier });
};

export const caseLocaleHandler = caseLocaleHandlerInternal(window.showInputBox);
