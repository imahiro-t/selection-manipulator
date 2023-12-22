import {
  TextEditor,
} from 'vscode';

type command = 'camel' | 'capital' | 'constant' | 'dot' | 'kebab' | 'no' | 'pascal' | 'pascalSnake' | 'path' | 'sentence' | 'snake' | 'train' | 'upper' | 'lower';

export const caseHandler: (command: command) => (textEditor: TextEditor) => void = (command) => async (textEditor) => {
  if (textEditor.selections.length === 0) {
    return;
  }
  const changeCase = await import('change-case');
  textEditor.edit((editBuilder) => {
    const array = textEditor.selections
      .forEach(selection => {
        const text = textEditor.document.getText(selection);
        editBuilder.replace(selection, change(changeCase, command)(text));
      });
  });
};

const change: (changeCase: any, command: command) => (value: string) => string = (changeCase, command) => (value) => {
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
      return changeCase.kebabCase(value);
    case 'no':
      return changeCase.noCase(value);
    case 'pascal':
      return changeCase.pascalCase(value);
    case 'pascalSnake':
      return changeCase.pascalSnakeCase(value);
    case 'path':
      return changeCase.pathCase(value);
    case 'sentence':
      return changeCase.sentenceCase(value);
    case 'snake':
      return changeCase.snakeCase(value);
    case 'train':
      return changeCase.trainCase(value);
    case 'upper':
      return value.toUpperCase();
    case 'lower':
      return value.toLowerCase();
    default:
      return '';
  }
};
