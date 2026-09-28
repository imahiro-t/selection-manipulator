import {
  EndOfLine,
  InputBoxOptions,
  Selection,
  TextEditor,
  window,
} from 'vscode';
import { openTextDocument, openTextDocumentWithTitles } from '../common';
import { EncOutputTooLargeError, MAX_OUTPUT_LENGTH } from './encodeTransforms';
import {
  checksumText,
  digestText,
  estimateHashOutputLength,
  findKeyProblem,
  formatLuhnMessage,
  HASH_COMMAND_ENTRIES,
  HashCommandEntry,
  hashEachLine,
  hmacText,
  keyBytes,
  luhnCheck,
} from './hashTransforms';

/** How the handlers tell the user about a result (HASH-017) or why nothing was changed. */
export interface HashNotifier {
  showInformationMessage(message: string): Thenable<unknown>;
  showWarningMessage(message: string): Thenable<unknown>;
  showErrorMessage(message: string): Thenable<unknown>;
}

/** What the handlers need from VS Code; replaced in tests. */
export interface HashDependencies {
  notifier: HashNotifier;
  /** Opens `[selected text, result]` pairs in a new read-only editor (the selected text as a heading). */
  openResultWithTitles: (pairs: string[][]) => Thenable<unknown>;
  /** Opens a result as it is in a new read-only editor (HASH-016, which keeps the line breaks). */
  openResult: (content: string) => Thenable<unknown>;
  /** Asks for the HMAC key (HASH-008..010). */
  showInputBox: (options: InputBoxOptions) => Thenable<string | undefined>;
}

const defaultDependencies: HashDependencies = {
  notifier: window,
  openResultWithTitles: (pairs) => openTextDocumentWithTitles(pairs),
  openResult: (content) => openTextDocument(content),
  showInputBox: (options) => window.showInputBox(options),
};

const documentEol = (textEditor: TextEditor): string =>
  textEditor.document.eol === EndOfLine.CRLF ? '\r\n' : '\n';

/** The non-empty selections, in document order (empty selections are skipped). */
const targetSelections = (textEditor: TextEditor): Selection[] =>
  textEditor.selections
    .filter((selection) => !selection.isEmpty)
    .sort((a, b) => a.start.compareTo(b.start));

const entryOf = (name: string): HashCommandEntry => {
  const entry = HASH_COMMAND_ENTRIES.find((candidate) => candidate.name === name);
  if (!entry) {
    throw new Error(`Unknown HASH command: ${name}`);
  }
  return entry;
};

/** The HMAC key prompt; `validateInput` rejects an empty key and a lone surrogate with fixed texts. */
export const HMAC_KEY_PROMPT: InputBoxOptions = {
  prompt: 'HMAC key (not saved)',
  password: true,
  ignoreFocusOut: true,
  validateInput: findKeyProblem,
};

/**
 * Computes the result of every non-empty selection, then opens them in one new editor or replaces
 * each selection. All selections share MAX_OUTPUT_LENGTH (checked against the estimate before
 * hashing a selection and against the actual length after). When a selection cannot be hashed or
 * the limit is exceeded, nothing is edited or opened and the user is told why.
 */
const applyHash = async (
  textEditor: TextEditor,
  dependencies: HashDependencies,
  entry: HashCommandEntry,
  compute: (text: string) => string
): Promise<void> => {
  const selections = targetSelections(textEditor);
  if (selections.length === 0) {
    return;
  }
  const { notifier } = dependencies;
  const results: { selection: Selection; text: string; result: string }[] = [];
  let total = 0;
  let current = 0;
  try {
    for (const [index, selection] of selections.entries()) {
      current = index;
      const text = textEditor.document.getText(selection);
      const estimate = estimateHashOutputLength(entry, text);
      if (total + estimate > MAX_OUTPUT_LENGTH) {
        throw new EncOutputTooLargeError(total + estimate, MAX_OUTPUT_LENGTH);
      }
      const result = compute(text);
      total += result.length;
      if (total > MAX_OUTPUT_LENGTH) {
        throw new EncOutputTooLargeError(total, MAX_OUTPUT_LENGTH);
      }
      results.push({ selection, text, result });
    }
  } catch (error) {
    // Not awaited: the returned Thenable only settles when the notification is dismissed.
    if (error instanceof EncOutputTooLargeError) {
      void notifier.showWarningMessage(`The selection was not changed: ${error.message}. Select less text.`);
    } else {
      const where = selections.length > 1 ? `selection ${current + 1} of ${selections.length}: ` : '';
      const reason = error instanceof Error ? error.message : String(error);
      void notifier.showErrorMessage(`The selection was not changed: ${where}${reason}`);
    }
    return;
  }
  if (entry.output === 'replace') {
    const replacements = results.filter(({ text, result }) => text !== result);
    if (replacements.length > 0) {
      await textEditor.edit((editBuilder) => {
        replacements.forEach(({ selection, result }) => editBuilder.replace(selection, result));
      });
    }
    return;
  }
  if (entry.kind === 'digest-each-line') {
    // No headings, so that the line breaks of every selection are kept as they are.
    await dependencies.openResult(results.map(({ result }) => result).join(documentEol(textEditor)));
    return;
  }
  // The heading is the selected text (trimmed for display); the hash is of the untrimmed text.
  await dependencies.openResultWithTitles(results.map(({ text, result }) => [text, result]));
};

/** HASH-017: notifies the Luhn result of every non-empty selection without editing anything. */
const notifyLuhn = (textEditor: TextEditor, dependencies: HashDependencies): void => {
  const selections = targetSelections(textEditor);
  if (selections.length === 0) {
    return;
  }
  const results = selections.map((selection) => luhnCheck(textEditor.document.getText(selection)));
  void dependencies.notifier.showInformationMessage(formatLuhnMessage(results));
};

/**
 * HASH-008..010: asks for the key once (even with several selections), then hashes every
 * non-empty selection with it. Does nothing when there is nothing to hash, when the input box is
 * cancelled, or when the key is rejected. The key is only kept in local variables: it is never
 * logged, stored, or included in a message or the result.
 */
const applyHmac = async (textEditor: TextEditor, dependencies: HashDependencies, entry: HashCommandEntry & { kind: 'hmac' }) => {
  if (targetSelections(textEditor).length === 0) {
    return;
  }
  const key = await dependencies.showInputBox({ ...HMAC_KEY_PROMPT });
  if (key === undefined) {
    return;
  }
  // Checked again in case a key that validateInput rejects comes back anyway.
  const problem = findKeyProblem(key);
  if (problem !== undefined) {
    void dependencies.notifier.showWarningMessage(`The selection was not changed: ${problem}`);
    return;
  }
  const bytes = keyBytes(key);
  // applyHash reads the selections again: the document may have changed while the input box was shown.
  await applyHash(textEditor, dependencies, entry, (text) => hmacText(entry.algorithm, bytes, text));
};

/** The HASH-001..020 commands by command name (without `selection-manipulator.`). The dependencies can be replaced in tests. */
export const hashExtendedHandlerInternal = (dependencies: HashDependencies) =>
  (name: string) => {
    const entry = entryOf(name);
    return async (textEditor: TextEditor): Promise<void> => {
      switch (entry.kind) {
        case 'luhn':
          return notifyLuhn(textEditor, dependencies);
        case 'hmac':
          return applyHmac(textEditor, dependencies, entry);
        case 'digest':
          return applyHash(textEditor, dependencies, entry, (text) => digestText(entry.algorithm, entry.encoding, text));
        case 'digest-each-line':
          return applyHash(textEditor, dependencies, entry, hashEachLine);
        case 'checksum':
          return applyHash(textEditor, dependencies, entry, (text) => checksumText(entry.algorithm, text));
      }
    };
  };

export const hashExtendedHandler = hashExtendedHandlerInternal(defaultDependencies);
