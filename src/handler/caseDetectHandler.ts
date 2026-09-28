import {
  TextEditor,
  window,
} from 'vscode';
import { detectCase } from './caseTransforms';

const MAX_LISTED_RESULTS = 10;

/**
 * CASE-014: detects the naming convention of each non-empty selection and shows
 * the result as a notification. The document is never modified.
 */
export const caseDetectHandlerInternal = (
  showInformationMessage: (message: string) => Thenable<unknown>
) => async (textEditor: TextEditor): Promise<void> => {
  const results = [...textEditor.selections]
    .sort((a, b) => a.start.compareTo(b.start))
    .map((selection) => detectCase(textEditor.document.getText(selection)))
    .filter((result) => result !== '');

  let message: string;
  if (results.length === 0) {
    message = 'Select text to detect its case.';
  } else if (results.length === 1) {
    message = `Detected case: ${results[0]}`;
  } else {
    const listed = results
      .slice(0, MAX_LISTED_RESULTS)
      .map((result, index) => `${index + 1}) ${result}`)
      .join(', ');
    const rest = results.length - MAX_LISTED_RESULTS;
    message = `Detected case: ${listed}${rest > 0 ? `, ... (+${rest} more)` : ''}`;
  }
  // Not awaited: the returned Thenable only settles when the notification is dismissed.
  void showInformationMessage(message);
};

export const caseDetectHandler = caseDetectHandlerInternal(window.showInformationMessage);
