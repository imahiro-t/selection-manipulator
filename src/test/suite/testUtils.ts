import * as vscode from 'vscode';

import { ResultProvider } from '../../provider/resultProvider';

// Register provider for tests if not already registered (or just register it, assuming one instance per test run)
try {
  vscode.workspace.registerTextDocumentContentProvider(ResultProvider.scheme, ResultProvider.instance);
} catch (e) {
  // Ignore if already registered
  console.log('Provider already registered or failed to register', e);
}

const sleep = (ms: number) => new Promise<void>(resolve => setTimeout(resolve, ms));

/**
 * Waits (up to `timeoutMs`) until the active editor shows `document`. Commands such as `undo` act
 * on the focused editor, so a test that runs one must first make sure its own editor has the focus.
 * Returns whether the document became active; the callers go on either way (as before this helper).
 */
async function waitUntilActive(document: vscode.TextDocument, timeoutMs = 500): Promise<boolean> {
  const deadline = Date.now() + timeoutMs;
  while (vscode.window.activeTextEditor?.document !== document) {
    if (Date.now() >= deadline) {
      return false;
    }
    await sleep(10);
  }
  return true;
}

/**
 * Opens `content` in a new untitled document and returns its editor, shown and focused. Every call
 * uses a new document, so text typed or inserted into another editor cannot leak into the test.
 */
export async function createTextEditor(content: string = ''): Promise<vscode.TextEditor> {
  const document = await vscode.workspace.openTextDocument({ content });
  const editor = await vscode.window.showTextDocument(document, { preview: false, preserveFocus: false });
  await waitUntilActive(document);
  return editor;
}

/**
 * Runs `undo` on `editor`: `undo` acts on the focused editor, which is not necessarily the editor of
 * the test (a result document, the chat view or another test's editor can hold the focus), so the
 * editor is shown and focused first. Runs exactly one `undo` and waits (up to `timeoutMs`) for it to
 * change the document; when nothing changes, the caller's assertion on the text reports it.
 */
export async function undoIn(editor: vscode.TextEditor, timeoutMs = 1000): Promise<void> {
  const document = editor.document;
  await vscode.window.showTextDocument(document, { viewColumn: editor.viewColumn, preserveFocus: false });
  if (!await waitUntilActive(document)) {
    throw new Error(`undoIn: could not focus the editor of ${document.uri.toString()} (active: ${vscode.window.activeTextEditor?.document.uri.toString() ?? 'none'})`);
  }
  // Listen before running the command, so that a change applied at once is not missed.
  let timer: NodeJS.Timeout | undefined;
  let listener: vscode.Disposable | undefined;
  const changed = new Promise<void>(resolve => {
    listener = vscode.workspace.onDidChangeTextDocument(event => {
      if (event.document === document && event.contentChanges.length > 0) {
        resolve();
      }
    });
    timer = setTimeout(resolve, timeoutMs);
  });
  try {
    await vscode.commands.executeCommand('undo');
    await changed;
  } finally {
    clearTimeout(timer);
    listener?.dispose();
  }
}

/**
 * Resolves on the next change of `document`'s text, or rejects after `timeoutMs`. For handlers that
 * start an edit without returning it: call this before the handler, then await it, instead of
 * sleeping for a fixed time (which also lets a late or foreign change go unnoticed).
 */
export function waitForChange(document: vscode.TextDocument, timeoutMs = 1000): Promise<void> {
  const promise = new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => {
      listener.dispose();
      reject(new Error(`waitForChange: ${document.uri.toString()} did not change in ${timeoutMs} ms`));
    }, timeoutMs);
    const listener = vscode.workspace.onDidChangeTextDocument(event => {
      if (event.document === document && event.contentChanges.length > 0) {
        clearTimeout(timer);
        listener.dispose();
        resolve();
      }
    });
  });
  promise.catch(() => undefined);
  return promise;
}

/**
 * Closes every editor without a save prompt: each active editor is reverted, then closed. Stops
 * when no tab is left or when closing makes no progress (an editor that cannot be closed this way).
 */
export async function closeAllEditors(): Promise<void> {
  const tabCount = () => vscode.window.tabGroups.all.reduce((count, group) => count + group.tabs.length, 0);
  let stalls = 0;
  for (let i = 0; i < 200 && tabCount() > 0 && stalls < 3; i++) {
    const before = tabCount();
    await vscode.commands.executeCommand('workbench.action.revertAndCloseActiveEditor');
    if (tabCount() >= before) {
      stalls++;
      // The active group can be empty while another group still has editors: move to the next group.
      await vscode.commands.executeCommand('workbench.action.focusNextGroup');
    } else {
      stalls = 0;
    }
  }
}

export async function setSelection(editor: vscode.TextEditor, selections: vscode.Selection[]) {
  editor.selections = selections;
}

export async function selectAll(editor: vscode.TextEditor) {
  const firstLine = editor.document.lineAt(0);
  const lastLine = editor.document.lineAt(editor.document.lineCount - 1);
  const range = new vscode.Range(firstLine.range.start, lastLine.range.end);
  const selection = new vscode.Selection(range.start, range.end);
  editor.selection = selection;
}

export function getDocumentText(editor: vscode.TextEditor): string {
  return editor.document.getText();
}

/** A result document of the extension (opened by `openTextDocument` of `src/common.ts`). */
export const isResultDocument = (doc: vscode.TextDocument): boolean => doc.uri.scheme === ResultProvider.scheme;

/**
 * Waits for the next opened document that satisfies `predicate` (by default: a result document of
 * the extension) and ignores the others (an output channel, a settings file, another test's editor).
 * Fails with the list of ignored documents after `timeoutMs` (below Mocha's default 2 s timeout, so
 * that the message says what was opened instead).
 */
export function waitForNewDocument(
  predicate: (doc: vscode.TextDocument) => boolean = isResultDocument,
  timeoutMs = 1500,
): Promise<vscode.TextDocument> {
  const promise = new Promise<vscode.TextDocument>((resolve, reject) => {
    const ignored: string[] = [];
    const timer = setTimeout(() => {
      disposable.dispose();
      reject(new Error(`waitForNewDocument: no matching document was opened in ${timeoutMs} ms (ignored: ${ignored.length > 0 ? ignored.join(', ') : 'none'})`));
    }, timeoutMs);
    const disposable = vscode.workspace.onDidOpenTextDocument(doc => {
      if (!predicate(doc)) {
        ignored.push(`${doc.uri.toString()} ${JSON.stringify(doc.getText().slice(0, 40))}`);
        return;
      }
      clearTimeout(timer);
      disposable.dispose();
      resolve(doc);
    });
  });
  // A test that fails before awaiting the promise must not leave an unhandled rejection behind for
  // a later test; awaiting the returned promise still rejects.
  promise.catch(() => undefined);
  return promise;
}
