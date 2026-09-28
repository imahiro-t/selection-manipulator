import {
  Selection,
  TextEditor,
  window,
} from 'vscode';
import * as changeCase from 'change-case';
import { convertJsonKeys } from './caseTransforms';

type JsonKeyStyle = 'camel' | 'snake' | 'kebab' | 'pascal';

const KEY_CONVERTERS: Readonly<Record<JsonKeyStyle, (key: string) => string>> = {
  camel: (key) => changeCase.camelCase(key),
  snake: (key) => changeCase.snakeCase(key),
  kebab: (key) => changeCase.paramCase(key),
  pascal: (key) => changeCase.pascalCase(key),
};

/**
 * CASE-022..025: converts the keys of the JSON in each selection. Selections
 * that are not valid JSON are left unchanged and a single error is shown.
 */
export const caseJsonKeysHandlerInternal = (
  showErrorMessage: (message: string) => Thenable<unknown>
) => (style: JsonKeyStyle) => async (textEditor: TextEditor): Promise<void> => {
  const keyFn = KEY_CONVERTERS[style];
  const replacements: { selection: Selection; text: string }[] = [];
  let firstError: string | undefined;

  textEditor.selections.forEach((selection) => {
    const text = textEditor.document.getText(selection);
    if (text.trim() === '') {
      return;
    }
    try {
      replacements.push({ selection, text: convertJsonKeys(text, keyFn) });
    } catch (error) {
      firstError ??= error instanceof Error ? error.message : String(error);
    }
  });

  if (replacements.length > 0) {
    await textEditor.edit((editBuilder) => {
      replacements.forEach(({ selection, text }) => editBuilder.replace(selection, text));
    });
  }
  if (firstError !== undefined) {
    // Not awaited: the returned Thenable only settles when the notification is dismissed.
    void showErrorMessage(`Invalid JSON: ${firstError}`);
  }
};

export const caseJsonKeysHandler = caseJsonKeysHandlerInternal(window.showErrorMessage);
