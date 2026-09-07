import {
  TextEditor,
} from 'vscode';
import { openTextDocument } from '../common';

type Command = 'format' | 'minify' | 'stringify' | 'parse' | 'flatten' | 'unflatten';

export const jsonHandler: (command: Command, isReplace: boolean) => (textEditor: TextEditor) => void = (command, isReplace) => (textEditor) => {
  if (isReplace) {
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
  } else {
    const selectedText = textEditor.document.getText(textEditor.selection);
    if (!selectedText) {
      return;
    }
    openTextDocument(change(command)(selectedText));
  }
};

const change: (command: Command) => (value: string) => string = (command) => (value) => {
  switch (command) {
    case 'format':
      return JSON.stringify(JSON.parse(value), null, 2);
    case 'minify':
      return JSON.stringify(JSON.parse(value), null, 0);
    case 'stringify':
      return JSON.stringify(value.trim());
    case 'parse':
      return JSON.parse(value);
    case 'flatten':
      return JSON.stringify(flatten(JSON.parse(value)), null, 2);
    case 'unflatten':
      return JSON.stringify(unflatten(JSON.parse(value)), null, 2);
    default:
      return '';
  }
};

const flatten = (data: any): any => {
  const result: any = {};
  const recurse = (cur: any, prop: string) => {
    if (Object(cur) !== cur) {
      result[prop] = cur;
    } else if (Array.isArray(cur)) {
      for (let i = 0, l = cur.length; i < l; i++)
        recurse(cur[i], prop ? prop + "." + i : "" + i);
      if (cur.length == 0)
        result[prop] = [];
    } else {
      let isEmpty = true;
      for (const p in cur) {
        isEmpty = false;
        recurse(cur[p], prop ? prop + "." + p : p);
      }
      if (isEmpty && prop)
        result[prop] = {};
    }
  };
  recurse(data, "");
  return result;
};

const isDangerousKey = (key: string): boolean => {
  return key === '__proto__' || key === 'constructor' || key === 'prototype';
};

const unflatten = (data: any): any => {
  if (Object(data) !== data || Array.isArray(data)) return data;
  const res: any = {};
  for (const i in data) {
    if (!Object.prototype.hasOwnProperty.call(data, i)) continue;
    const keys = i.split('.');
    if (keys.some(isDangerousKey)) {
      continue;
    }
    keys.reduce((acc, value, index) => {
      if (acc === null || typeof acc !== 'object') return acc;
      return acc[value] || (acc[value] = (isNaN(Number(keys[index + 1])) ? (keys.length - 1 === index ? data[i] : {}) : []));
    }, res);
  }
  return res;
};
