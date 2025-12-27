import {
  TextEditor,
} from 'vscode';
import { openTextDocument } from '../common';

import xmlFormat from 'xml-formatter';

type Command = 'format' | 'minify' | 'to-json';

export const xmlHandler: (command: Command, isReplace: boolean) => (textEditor: TextEditor) => Thenable<boolean | void> = (command, isReplace) => (textEditor) => {
  if (isReplace) {
    if (textEditor.selections.length === 0) {
      return Promise.resolve();
    }
    return textEditor.edit((editBuilder) => {
      textEditor.selections
        .forEach(selection => {
          const text = textEditor.document.getText(selection);
          editBuilder.replace(selection, change(command)(text));
        });
    });
  } else {
    const selectedText = textEditor.document.getText(textEditor.selection);
    if (!selectedText) {
      return Promise.resolve();
    }
    return openTextDocument(change(command)(selectedText)).then(() => { });
  }
};

const change: (command: Command) => (value: string) => string = (command) => (value) => {
  switch (command) {
    case 'format':
      return xmlFormat(value, { indentation: '  ', lineSeparator: '\n' });
    case 'minify':
      return xmlFormat.minify(value, { collapseContent: true });
    case 'to-json':
      return JSON.stringify(xmlToJson(value), null, 2);
    default:
      return '';
  }
};

function xmlToJson(xml: string): any {
  // Simple XML to JSON parser
  const result: any = {};
  const stack: any[] = [result];
  let current = result;

  // Remove XML declaration and comments
  xml = xml.replace(/<\?xml.*?\?>/g, '').replace(/<!--[\s\S]*?-->/g, '');

  const regex = /<(\/)?([a-zA-Z0-9_\-:]+)([^>]*)>([^<]*)?/g;
  let match;

  while ((match = regex.exec(xml)) !== null) {
    const [_, isClosing, tagName, attributes, textContent] = match;

    if (isClosing) {
      const parent = stack.pop();
      current = stack[stack.length - 1];
    } else {
      const newNode: any = {};

      // Parse attributes
      if (attributes) {
        const attrRegex = /([a-zA-Z0-9_\-:]+)="([^"]*)"/g;
        let attrMatch;
        while ((attrMatch = attrRegex.exec(attributes)) !== null) {
          newNode[`@${attrMatch[1]}`] = attrMatch[2];
        }
      }

      // Handle text content
      if (textContent && textContent.trim()) {
        newNode['#text'] = textContent.trim();
      }

      // Add to parent
      if (current[tagName]) {
        if (!Array.isArray(current[tagName])) {
          current[tagName] = [current[tagName]];
        }
        current[tagName].push(newNode);
      } else {
        current[tagName] = newNode;
      }

      stack.push(newNode);
      current = newNode;

      // Check if self-closing (basic check, regex might miss <tag /> if not robust)
      if (match[0].endsWith('/>')) {
        stack.pop();
        current = stack[stack.length - 1];
      }
    }
  }

  // Clean up empty objects that only have text
  const simplify = (obj: any): any => {
    if (typeof obj !== 'object' || obj === null) return obj;
    const keys = Object.keys(obj);
    if (keys.length === 1 && keys[0] === '#text') {
      return obj['#text'];
    }
    for (const key in obj) {
      obj[key] = simplify(obj[key]);
    }
    return obj;
  };

  return simplify(result);
}
