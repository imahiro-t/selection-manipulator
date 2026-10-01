import { EndOfLine, InputBoxOptions, Selection, TextEditor, window } from 'vscode';
import { openTextDocument, openTextDocumentWithTitles } from '../common';
import { EncInputError, EncOutputTooLargeError, MAX_OUTPUT_LENGTH } from './encodeTransforms';
import {
  ENC2_COMMAND_ENTRIES,
  Enc2CommandEntry,
  enc2Transforms,
  estimateEnc2OutputLength,
  findUuFileNameProblem,
  isEnc2TransformName,
  UU_DEFAULT_FILE_NAME,
} from './enc2Transforms';
import {
  crc16Text,
  crc32cText,
  findShakeLengthProblem,
  formatIbanMessage,
  formatIsbnMessage,
  hmacSha3_512Text,
  ibanCheck,
  isbnCheck,
  sha3_384Text,
  SHAKE256_DEFAULT_OUTPUT_BYTES,
  SHAKE256_MAX_OUTPUT_BYTES,
  shake256Text,
} from './hash2Transforms';
import { findKeyProblem, HashKeyError, keyBytes } from './hashTransforms';
import { HMAC_KEY_PROMPT } from './hashExtendedHandler';

/** How the handlers tell the user about a result (IBAN / ISBN) or why nothing was changed. */
export interface Enc2Notifier {
  showInformationMessage(message: string): Thenable<unknown>;
  showWarningMessage(message: string): Thenable<unknown>;
  showErrorMessage(message: string): Thenable<unknown>;
}

/** What the handlers need from VS Code; replaced in tests. */
export interface Enc2Dependencies {
  notifier: Enc2Notifier;
  /** Opens a result as it is in a new read-only editor (the encoding and escaping commands). */
  openResult: (content: string) => Thenable<unknown>;
  /** Opens `[selected text, result]` pairs in a new read-only editor (the hash and checksum commands). */
  openResultWithTitles: (pairs: string[][]) => Thenable<unknown>;
  showInputBox: (options: InputBoxOptions) => Thenable<string | undefined>;
  /** Logs an unexpected failure (never with the selected text or the key). */
  logError: (message: string) => void;
}

const defaultDependencies: Enc2Dependencies = {
  notifier: window,
  openResult: (content) => openTextDocument(content),
  openResultWithTitles: (pairs) => openTextDocumentWithTitles(pairs),
  showInputBox: (options) => window.showInputBox(options),
  logError: (message) => console.error(message),
};

export const ENC2_NOT_CHANGED = 'The selection was not changed: ';

/** ENCX-007: the file name prompt (the value is only written into the `begin` line, never used as a file). */
export const UU_FILE_NAME_PROMPT: InputBoxOptions = {
  prompt: 'File name for the "begin" line (letters, digits, ".", "_" and "-"; no file is written)',
  value: UU_DEFAULT_FILE_NAME,
  ignoreFocusOut: true,
  validateInput: findUuFileNameProblem,
};

/** ENCX-017: the output length prompt. */
export const SHAKE_LENGTH_PROMPT: InputBoxOptions = {
  prompt: `SHAKE256 output length in bytes (1 to ${SHAKE256_MAX_OUTPUT_BYTES.toLocaleString('en-US')})`,
  value: String(SHAKE256_DEFAULT_OUTPUT_BYTES),
  ignoreFocusOut: true,
  validateInput: findShakeLengthProblem,
};

/** The non-empty selections, in document order (empty selections are skipped). */
const targetSelections = (textEditor: TextEditor): Selection[] =>
  textEditor.selections
    .filter((selection) => !selection.isEmpty)
    .sort((a, b) => a.start.compareTo(b.start));

const documentEol = (textEditor: TextEditor): string => (textEditor.document.eol === EndOfLine.CRLF ? '\r\n' : '\n');

/**
 * Logs an unexpected failure so it can be traced: only the error name and the stack frames, never
 * the message, which may quote the selected text or depend on the HMAC key.
 */
const logUnexpected = (dependencies: Enc2Dependencies, error: unknown): void => {
  const name = error instanceof Error ? error.name : typeof error;
  const frames = error instanceof Error && typeof error.stack === 'string'
    ? error.stack.split('\n').filter((line) => line.startsWith('    at ')).join('\n')
    : '';
  dependencies.logError(`Selection Manipulator: an encoding command failed unexpectedly (${name})${frames === '' ? '' : `\n${frames}`}`);
};

/** Tells why nothing was changed. Not awaited: the Thenable only settles when the notification is dismissed. */
const notifyFailure = (dependencies: Enc2Dependencies, error: unknown, index: number, count: number): void => {
  const { notifier } = dependencies;
  if (error instanceof EncOutputTooLargeError) {
    void notifier.showWarningMessage(`${ENC2_NOT_CHANGED}${error.message}. Select less text.`);
    return;
  }
  const where = count > 1 ? `selection ${index + 1} of ${count}: ` : '';
  if (error instanceof EncInputError || error instanceof HashKeyError) {
    void notifier.showErrorMessage(`${ENC2_NOT_CHANGED}${where}${error.message}`);
    return;
  }
  logUnexpected(dependencies, error);
  void notifier.showErrorMessage(`${ENC2_NOT_CHANGED}${where}the text could not be processed.`);
};

/** What a command computes for one selection, with the upper bound of the result length. */
interface Computation {
  compute: (text: string) => string;
  estimate: (text: string) => number;
}

/**
 * Asks for the value the command needs (once, for all selections) and returns how to compute one
 * result, or `undefined` when the input box was cancelled or a value that is not valid came back
 * despite `validateInput`. The HMAC key is only kept in this closure: it is never logged, stored,
 * or included in a message or the result.
 */
const prepare = async (entry: Enc2CommandEntry, dependencies: Enc2Dependencies, eol: string): Promise<Computation | undefined> => {
  const name = entry.name;
  if (isEnc2TransformName(name)) {
    let fileName: string | undefined;
    if (entry.input === 'uu-file-name') {
      fileName = await dependencies.showInputBox({ ...UU_FILE_NAME_PROMPT });
      if (fileName === undefined || findUuFileNameProblem(fileName) !== undefined) {
        return undefined;
      }
    }
    const options = { eol, fileName };
    return {
      compute: (text) => enc2Transforms[name](text, options),
      estimate: (text) => estimateEnc2OutputLength(name, text, options),
    };
  }
  switch (name) {
    case 'crypto.hash-sha3-384':
      return { compute: sha3_384Text, estimate: () => 96 };
    case 'crypto.hash-shake256': {
      const value = await dependencies.showInputBox({ ...SHAKE_LENGTH_PROMPT });
      if (value === undefined || findShakeLengthProblem(value) !== undefined) {
        return undefined;
      }
      const outputBytes = Number(value);
      return { compute: (text) => shake256Text(text, outputBytes), estimate: () => 2 * outputBytes };
    }
    case 'crypto.hmac-sha3-512': {
      const key = await dependencies.showInputBox({ ...HMAC_KEY_PROMPT });
      if (key === undefined) {
        return undefined;
      }
      // Checked again in case a key that validateInput rejects comes back anyway.
      const problem = findKeyProblem(key);
      if (problem !== undefined) {
        void dependencies.notifier.showWarningMessage(`${ENC2_NOT_CHANGED}${problem}`);
        return undefined;
      }
      const bytes = keyBytes(key);
      return { compute: (text) => hmacSha3_512Text(bytes, text), estimate: () => 128 };
    }
    case 'checksum.crc16':
      return { compute: crc16Text, estimate: () => 4 };
    case 'checksum.crc32c':
      return { compute: crc32cText, estimate: () => 8 };
  }
  throw new Error(`Unknown ENC2 command: ${name}`);
};

/** ENCX-021 / ENCX-022: notifies the result of every non-empty selection without editing anything. */
const notifyValidation = (textEditor: TextEditor, dependencies: Enc2Dependencies, entry: Enc2CommandEntry): void => {
  const texts = targetSelections(textEditor).map((selection) => textEditor.document.getText(selection));
  if (texts.length === 0) {
    return;
  }
  const message = entry.name === 'checksum.iban'
    ? formatIbanMessage(texts.map(ibanCheck))
    : formatIsbnMessage(texts.map(isbnCheck));
  void dependencies.notifier.showInformationMessage(message);
};

/**
 * Converts or hashes every non-empty selection, then opens all results in one new editor. All
 * selections share MAX_OUTPUT_LENGTH (checked against the estimate before converting a selection
 * and against the actual length after). When a selection cannot be converted or the limit is
 * exceeded, nothing is opened and the user is told why; the document is never edited.
 */
const run = async (textEditor: TextEditor, dependencies: Enc2Dependencies, entry: Enc2CommandEntry): Promise<void> => {
  if (entry.kind === 'notify') {
    notifyValidation(textEditor, dependencies, entry);
    return;
  }
  // Only decides whether to ask at all: no input box without anything to convert.
  if (targetSelections(textEditor).length === 0) {
    return;
  }
  const eol = documentEol(textEditor);
  const computation = await prepare(entry, dependencies, eol);
  if (computation === undefined) {
    return;
  }
  // The selections are read again: the document may have changed while the input box was shown.
  const selections = targetSelections(textEditor);
  const results: { text: string; result: string }[] = [];
  let total = 0;
  for (const [index, selection] of selections.entries()) {
    const text = textEditor.document.getText(selection);
    try {
      const estimate = computation.estimate(text);
      if (total + estimate > MAX_OUTPUT_LENGTH) {
        throw new EncOutputTooLargeError(total + estimate, MAX_OUTPUT_LENGTH);
      }
      const result = computation.compute(text);
      total += result.length;
      if (total > MAX_OUTPUT_LENGTH) {
        throw new EncOutputTooLargeError(total, MAX_OUTPUT_LENGTH);
      }
      results.push({ text, result });
    } catch (error) {
      notifyFailure(dependencies, error, index, selections.length);
      return;
    }
  }
  if (results.length === 0) {
    return;
  }
  if (entry.kind === 'digest') {
    // The heading is the selected text (trimmed for display); the hash is of the untrimmed text.
    await dependencies.openResultWithTitles(results.map(({ text, result }) => [text, result]));
    return;
  }
  await dependencies.openResult(results.map(({ result }) => result).join(eol));
};

/**
 * The ENCX-001..022 commands by command name (without `selection-manipulator.`). The dependencies
 * can be replaced in tests.
 */
export const enc2CommandHandlerInternal = (dependencies: Enc2Dependencies) =>
  (name: string) => {
    const entry = ENC2_COMMAND_ENTRIES.find((candidate) => candidate.name === name);
    if (!entry) {
      throw new Error(`Unknown ENC2 command: ${name}`);
    }
    return async (textEditor: TextEditor): Promise<void> => {
      try {
        await run(textEditor, dependencies, entry);
      } catch (error) {
        // Last resort: an unexpected failure is reported instead of escaping to VS Code.
        notifyFailure(dependencies, error, 0, 1);
      }
    };
  };

export const enc2CommandHandler = enc2CommandHandlerInternal(defaultDependencies);
