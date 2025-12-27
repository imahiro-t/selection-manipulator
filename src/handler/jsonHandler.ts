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

const unflatten = (data: any): any => {
  if (Object(data) !== data || Array.isArray(data)) return data;
  const result: any = {};
  for (const p in data) {
    let cur = result;
    let prop = "";
    let m;
    while (m = p.match(/^([^.]+)\./)) { // Match first part key.nested
      prop = m[1];
      const remaining = p.slice(prop.length + 1);
      // Determine if next key is array index
      const isArray = !isNaN(parseInt(remaining.split('.')[0]));
      // Issue: This simple regex based unflattening might not be perfect for arrays vs objects. 
      // But let's try a standard approach.
      // Actually, a simpler loop over keys is better.
      break;
    }
  }

  // Alternative Unflatten Implementation
  const res: any = {};
  for (const i in data) {
    const keys = i.split('.');
    keys.reduce((acc, value, index) => {
      return acc[value] || (acc[value] = (isNaN(Number(keys[index + 1])) ? (keys.length - 1 === index ? data[i] : {}) : []));
    }, res);
  }
  return res;
};
