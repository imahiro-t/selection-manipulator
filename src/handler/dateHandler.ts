import {
  TextEditor,
  env
} from 'vscode';
import { openTextDocumentWithTitles } from '../common';
import { parseDate } from './dateUtils';

type DateFormat = 'iso' | 'locale' | 'timestamp' | 'timestamp-ms';
type OutputMode = 'new-tab' | 'replace' | 'clipboard';

export const dateHandler = (format: DateFormat, outputMode: OutputMode) => {
  return async (textEditor: TextEditor) => {
    if (textEditor.selections.length === 0) {
      return;
    }

    const selections = textEditor.selections;

    if (outputMode === 'replace') {
      const texts = selections
        .map(selection => textEditor.document.getText(selection))
        .map(text => convert(text, format));

      await textEditor.edit(editBuilder => {
        selections.forEach((selection, index) => {
          editBuilder.replace(selection, texts[index]);
        });
      });
      return;
    }

    if (outputMode === 'clipboard') {
      const texts = selections
        .map(selection => textEditor.document.getText(selection))
        .map(text => convert(text, format));

      await env.clipboard.writeText(texts.join('\n'));
      return;
    }

    if (outputMode === 'new-tab') {
      const zip = selections
        .map(selection => textEditor.document.getText(selection))
        .filter(text => text.length > 0)
        .map(expression => [expression, convert(expression, format)]);

      await openTextDocumentWithTitles(zip);
      return;
    }
  };
};

const convert = (expression: string, format: DateFormat): string => {
  const date = parseDate(expression);
  if (!date) {
    return expression; // Return original if parsing fails
  }

  switch (format) {
    case 'iso':
      return date.toISOString();
    case 'locale':
      return date.toLocaleString();
    case 'timestamp':
      return String(Math.floor(date.getTime() / 1000));
    case 'timestamp-ms':
      return String(date.getTime());
    default:
      return expression;
  }
};
