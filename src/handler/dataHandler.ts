import {
  EndOfLine,
  InputBoxOptions,
  Range,
  Selection,
  TextEditor,
  TextEditorRevealType,
  window,
} from 'vscode';
import { openTextDocument } from '../common';
import { EncOutputTooLargeError, MAX_OUTPUT_LENGTH } from './encodeTransforms';
import {
  assertInputLength,
  DataInputError,
  findPathProblem,
  parsePath,
  PathSegment,
} from './dataCommon';
import {
  DATA_COMMAND_ENTRIES,
  DataCommandEntry,
  describeCount,
  findJsonError,
  mergeJsonObjects,
} from './dataTransforms';

/** How the handlers tell the user about a result (DATA-019 / 025) or why nothing was changed. */
export interface DataNotifier {
  showInformationMessage(message: string): Thenable<unknown>;
  showWarningMessage(message: string): Thenable<unknown>;
  showErrorMessage(message: string): Thenable<unknown>;
}

/** What the handlers need from VS Code; replaced in tests. */
export interface DataDependencies {
  notifier: DataNotifier;
  /** Opens a result in a new read-only editor. */
  openResult: (content: string) => Thenable<unknown>;
  /** Asks for the path (DATA-015) or field (DATA-023 / 024). */
  showInputBox: (options: InputBoxOptions) => Thenable<string | undefined>;
}

const defaultDependencies: DataDependencies = {
  notifier: window,
  openResult: (content) => openTextDocument(content),
  showInputBox: (options) => window.showInputBox(options),
};

const NOT_CHANGED = 'The selection was not changed: ';

const documentEol = (textEditor: TextEditor): string =>
  textEditor.document.eol === EndOfLine.CRLF ? '\r\n' : '\n';

/** The transforms return LF line breaks; the result follows the document's EOL. */
const withEol = (text: string, eol: string): string => (eol === '\n' ? text : text.replace(/\r?\n/g, eol));

/** The non-empty selections, in document order (empty selections are skipped). */
const targetSelections = (textEditor: TextEditor): Selection[] =>
  textEditor.selections
    .filter((selection) => !selection.isEmpty)
    .sort((a, b) => a.start.compareTo(b.start));

const entryOf = (name: string): DataCommandEntry => {
  const entry = DATA_COMMAND_ENTRIES.find((candidate) => candidate.name === name);
  if (!entry) {
    throw new Error(`Unknown DATA command: ${name}`);
  }
  return entry;
};

/** The input box of DATA-015 (path) and DATA-023 / 024 (field); nothing typed is saved. */
export const pathPrompt = (kind: 'path' | 'field'): InputBoxOptions => ({
  prompt: kind === 'path' ? 'JSON path (e.g. a.b[0])' : 'Field (e.g. id or user.name)',
  placeHolder: kind === 'path' ? 'a.b[0]' : 'id',
  ignoreFocusOut: true,
  validateInput: findPathProblem,
});

/** The text of an error: the message of a `DataInputError`, a fixed text for anything unexpected. */
const reasonOf = (error: unknown): string => {
  if (error instanceof DataInputError) {
    return error.message;
  }
  if (error instanceof RangeError) {
    return 'the text is nested too deeply or is too large to convert';
  }
  return 'the text could not be converted';
};

/** Shows why nothing was changed. Not awaited: the Thenable only settles when the notification is dismissed. */
const notifyFailure = (dependencies: DataDependencies, error: unknown, index: number, count: number): void => {
  if (error instanceof EncOutputTooLargeError) {
    void dependencies.notifier.showWarningMessage(`${NOT_CHANGED}${error.message}. Select less text.`);
    return;
  }
  const where = count > 1 ? `selection ${index + 1} of ${count}: ` : '';
  void dependencies.notifier.showErrorMessage(`${NOT_CHANGED}${where}${reasonOf(error)}`);
};

/**
 * Converts every non-empty selection, then opens the results in one new editor (joined with the
 * document's EOL, in document order) or replaces each selection. The results of all selections
 * share MAX_OUTPUT_LENGTH. When a selection cannot be converted or the limit is exceeded, nothing
 * is edited or opened and the user is told why; no exception leaves the handler.
 */
const applyTransform = async (
  textEditor: TextEditor,
  dependencies: DataDependencies,
  entry: DataCommandEntry,
  path: PathSegment[]
): Promise<void> => {
  const selections = targetSelections(textEditor);
  const transform = entry.transform;
  if (selections.length === 0 || transform === undefined) {
    return;
  }
  const eol = documentEol(textEditor);
  const results: { selection: Selection; text: string; result: string }[] = [];
  let total = 0;
  let current = 0;
  try {
    for (const [index, selection] of selections.entries()) {
      current = index;
      const text = textEditor.document.getText(selection);
      assertInputLength(text);
      const result = withEol(transform(text, path), eol);
      total += result.length + (index > 0 && entry.output === 'new-tab' ? eol.length : 0);
      if (total > MAX_OUTPUT_LENGTH) {
        throw new EncOutputTooLargeError(total, MAX_OUTPUT_LENGTH);
      }
      results.push({ selection, text, result });
    }
  } catch (error) {
    notifyFailure(dependencies, error, current, selections.length);
    return;
  }
  if (entry.output === 'new-tab') {
    await dependencies.openResult(results.map(({ result }) => result).join(eol));
    return;
  }
  const replacements = results.filter(({ text, result }) => text !== result);
  if (replacements.length > 0) {
    await textEditor.edit((editBuilder) => {
      replacements.forEach(({ selection, result }) => editBuilder.replace(selection, result));
    });
  }
};

/** DATA-018: merges the JSON objects of two or more selections into one new editor. */
const applyMerge = async (textEditor: TextEditor, dependencies: DataDependencies): Promise<void> => {
  const selections = targetSelections(textEditor);
  if (selections.length === 0) {
    return;
  }
  if (selections.length < 2) {
    void dependencies.notifier.showWarningMessage('Select two or more JSON objects to merge (one per selection).');
    return;
  }
  let result: string;
  let current = 0;
  try {
    const texts = selections.map((selection, index) => {
      current = index;
      const text = textEditor.document.getText(selection);
      assertInputLength(text);
      return text;
    });
    current = -1;
    result = withEol(mergeJsonObjects(texts), documentEol(textEditor));
    if (result.length > MAX_OUTPUT_LENGTH) {
      throw new EncOutputTooLargeError(result.length, MAX_OUTPUT_LENGTH);
    }
  } catch (error) {
    // mergeJsonObjects names the selection itself.
    notifyFailure(dependencies, error, current, current < 0 ? 1 : selections.length);
    return;
  }
  await dependencies.openResult(result);
};

/**
 * DATA-019: checks every non-empty selection as strict JSON. Shows "Valid JSON" or, at the first
 * error, "Invalid JSON at line L, column C: reason" (document line / column) and selects the
 * character where the error was found (an empty selection at the end of the selection when the
 * input ended too early).
 */
const validateJson = (textEditor: TextEditor, dependencies: DataDependencies): void => {
  const selections = targetSelections(textEditor);
  if (selections.length === 0) {
    return;
  }
  const { document } = textEditor;
  for (const [index, selection] of selections.entries()) {
    const text = document.getText(selection);
    let error;
    try {
      assertInputLength(text);
      error = findJsonError(text);
    } catch (failure) {
      notifyFailure(dependencies, failure, index, selections.length);
      return;
    }
    if (error === undefined) {
      continue;
    }
    const base = document.offsetAt(selection.start);
    const start = document.positionAt(base + error.offset);
    let length = 0;
    if (error.offset < text.length) {
      const code = text.charCodeAt(error.offset);
      const pair = code >= 0xd800 && code <= 0xdbff && /[\uDC00-\uDFFF]/.test(text[error.offset + 1] ?? '');
      length = pair ? 2 : 1;
    }
    const end = document.positionAt(base + error.offset + length);
    textEditor.selection = new Selection(start, end);
    textEditor.revealRange(new Range(start, end), TextEditorRevealType.InCenterIfOutsideViewport);
    void dependencies.notifier.showErrorMessage(
      `Invalid JSON at line ${start.line + 1}, column ${start.character + 1}: ${error.reason}`
    );
    return;
  }
  void dependencies.notifier.showInformationMessage(
    selections.length === 1 ? 'Valid JSON' : `Valid JSON (${selections.length} selections)`
  );
};

/** DATA-025: notifies the counts of every non-empty selection without changing anything. */
const countJson = (textEditor: TextEditor, dependencies: DataDependencies): void => {
  const selections = targetSelections(textEditor);
  if (selections.length === 0) {
    return;
  }
  const counts: string[] = [];
  for (const [index, selection] of selections.entries()) {
    try {
      counts.push(describeCount(textEditor.document.getText(selection)));
    } catch (error) {
      notifyFailure(dependencies, error, index, selections.length);
      return;
    }
  }
  void dependencies.notifier.showInformationMessage(
    counts.length === 1 ? counts[0] : counts.map((count, index) => `Selection ${index + 1}: ${count}`).join('; ')
  );
};

/** Asks for the path / field once, then converts (the selections are read again afterwards). */
const applyWithPrompt = async (textEditor: TextEditor, dependencies: DataDependencies, entry: DataCommandEntry, kind: 'path' | 'field') => {
  if (targetSelections(textEditor).length === 0) {
    return;
  }
  const input = await dependencies.showInputBox(pathPrompt(kind));
  if (input === undefined) {
    return;
  }
  // Checked again in case a value that validateInput rejects comes back anyway.
  const problem = findPathProblem(input);
  if (problem !== undefined) {
    void dependencies.notifier.showWarningMessage(`${NOT_CHANGED}${problem}`);
    return;
  }
  await applyTransform(textEditor, dependencies, entry, parsePath(input));
};

/** The DATA-001..040 commands by command name (without `selection-manipulator.`). The dependencies can be replaced in tests. */
export const dataHandlerInternal = (dependencies: DataDependencies) =>
  (name: string) => {
    const entry = entryOf(name);
    return async (textEditor: TextEditor): Promise<void> => {
      try {
        if (entry.name === 'json.validate') {
          return validateJson(textEditor, dependencies);
        }
        if (entry.name === 'json.count') {
          return countJson(textEditor, dependencies);
        }
        if (entry.output === 'merge') {
          return await applyMerge(textEditor, dependencies);
        }
        if (entry.prompt !== undefined) {
          return await applyWithPrompt(textEditor, dependencies, entry, entry.prompt);
        }
        return await applyTransform(textEditor, dependencies, entry, []);
      } catch (error) {
        // Last resort: an unexpected failure is reported instead of escaping to VS Code.
        void dependencies.notifier.showErrorMessage(`${NOT_CHANGED}${reasonOf(error)}`);
      }
    };
  };

export const dataHandler = dataHandlerInternal(defaultDependencies);
