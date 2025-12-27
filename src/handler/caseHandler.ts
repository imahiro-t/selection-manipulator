import {
  TextEditor,
} from 'vscode';
import * as changeCase from "change-case";

type Command = 'camel' | 'capital' | 'constant' | 'dot' | 'kebab' | 'no' | 'pascal' | 'path' | 'sentence' | 'snake' | 'train' | 'upper' | 'lower' | 'title-smart' | 'spongebob' | 'screaming-snake' | 'humanize' | 'slugify';

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
    case 'screaming-snake':
      return changeCase.constantCase(value);
    case 'dot':
      return changeCase.dotCase(value);
    case 'kebab':
    case 'slugify':
      return changeCase.paramCase(value);
    case 'no':
      return changeCase.noCase(value);
    case 'pascal':
      return changeCase.pascalCase(value);
    case 'path':
      return changeCase.pathCase(value);
    case 'sentence':
    case 'humanize':
      return changeCase.sentenceCase(value);
    case 'snake':
      return changeCase.snakeCase(value);
    case 'train':
      return changeCase.headerCase(value);
    case 'upper':
      return value.toUpperCase();
    case 'lower':
      return value.toLowerCase();
    case 'title-smart':
      return toSmartTitleCase(value);
    case 'spongebob':
      return toSpongeBobCase(value);
    default:
      return '';
  }
};

function toSmartTitleCase(str: string): string {
  const minorWords = /^(a|an|and|as|at|but|by|en|for|if|in|nor|of|on|or|per|the|to|v.?|vs.?|via)$/i;

  // First, convert the full string to sentence case or lower case to normalize
  const words = str.toLowerCase().split(/(\s+)/); // maintain spaces

  return words.map((word, index) => {
    if (word.trim().length === 0) { return word; }
    // Always capitalize the first word and last word (simplified: rely on index 0; handling last word in complex strings is harder without NLP, but usually first is key)
    if (index === 0 || !minorWords.test(word)) {
      return word.charAt(0).toUpperCase() + word.slice(1);
    }
    return word.toLowerCase();
  }).join('');
}

function toSpongeBobCase(str: string): string {
  let result = '';
  for (let i = 0; i < str.length; i++) {
    const char = str[i];
    if (Math.random() > 0.5) {
      result += char.toUpperCase();
    } else {
      result += char.toLowerCase();
    }
  }
  return result;
}
