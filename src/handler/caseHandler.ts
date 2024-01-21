import {
  TextEditor,
} from 'vscode';
import * as changeCase from "change-case";

type Command = 'camel' | 'capital' | 'constant' | 'dot' | 'kebab' | 'no' | 'pascal' | 'path' | 'sentence' | 'snake' | 'train' | 'upper' | 'lower';

export const caseHandler: (command: Command) => (textEditor: TextEditor) => void = (command) => (textEditor) => {
  if (textEditor.selections.length === 0) {
    return;
  }
  textEditor.edit((editBuilder) => {
    textEditor.selections
      .forEach(selection => {
        const text = textEditor.document.getText(selection);
        editBuilder.replace(selection, change(command)(text));
      });
  });
};

const change: (command: Command) => (value: string) => string = (command) => (value) => {
  switch (command) {
    case 'camel':
      return changeCase.camelCase(value);
    case 'capital':
      return changeCase.capitalCase(value);
    case 'constant':
      return changeCase.constantCase(value);
    case 'dot':
      return changeCase.dotCase(value);
    case 'kebab':
      return changeCase.paramCase(value);
    case 'no':
      return changeCase.noCase(value);
    case 'pascal':
      return changeCase.pascalCase(value);
    case 'path':
      return changeCase.pathCase(value);
    case 'sentence':
      return changeCase.sentenceCase(value);
    case 'snake':
      return changeCase.snakeCase(value);
    case 'train':
      return changeCase.headerCase(value);
    case 'upper':
      return value.toUpperCase();
    case 'lower':
      return value.toLowerCase();
    default:
      return '';
  }
};
