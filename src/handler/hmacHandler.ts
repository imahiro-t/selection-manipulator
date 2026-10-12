import { createHmac } from 'node:crypto';
import {
  InputBoxOptions,
  TextEditor,
  window,
} from 'vscode';
import { openTextDocumentWithTitles } from '../common';

type Algorithm = 'sha256' | 'sha512' | 'md5';

/** What Create HMAC needs from VS Code; replaced in tests. */
export interface HmacDependencies {
  /** Asks for the secret; `undefined` when the box is cancelled. */
  showInputBox: (options: InputBoxOptions) => Thenable<string | undefined>;
  /** Opens `[selected text, HMAC]` pairs in a new read-only editor (the selected text as a heading). */
  openResultWithTitles: (pairs: string[][]) => Thenable<unknown>;
}

const defaultDependencies: HmacDependencies = {
  showInputBox: (options) => window.showInputBox(options),
  openResultWithTitles: (pairs) => openTextDocumentWithTitles(pairs),
};

/**
 * Create HMAC (sha256 / sha512 / md5): asks for the secret and opens the HMAC of every selection.
 * Cancelling the box changes nothing (an empty secret, by Enter alone, is used as it is), as with
 * HASH-008..010.
 */
export const hmacHandler = (algorithm: Algorithm, dependencies: Partial<HmacDependencies> = {}) => async (textEditor: TextEditor): Promise<void> => {
  if (textEditor.selections.length === 0) {
    return;
  }
  const { showInputBox, openResultWithTitles } = { ...defaultDependencies, ...dependencies };
  const secret = await showInputBox({
    prompt: 'Secret?',
    ignoreFocusOut: true,
    password: true,
  });
  if (secret === undefined) {
    return;
  }
  const zip =
    textEditor.selections
      .map(selection => textEditor.document.getText(selection))
      .map(text => {
        const hmac = createHmac(algorithm, secret);
        hmac.update(text);
        return [text, hmac.digest('hex')];
      });
  await openResultWithTitles(zip);
};
