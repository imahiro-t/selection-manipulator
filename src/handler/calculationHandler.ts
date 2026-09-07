import {
  TextEditor,
} from 'vscode';
import { openTextDocumentWithTitles } from '../common';

export const calculationHandler: (textEditor: TextEditor) => Thenable<void> = (textEditor) => {
  if (textEditor.selections.length === 0) {
    return Promise.resolve();
  }
  const zip =
    textEditor.selections
      .map(selection => textEditor.document.getText(selection))
      .join("\n")
      .split("\n")
      .map(selectedText => selectedText.trim())
      .filter(selectedText => selectedText.length > 0)
      .map(expression => [expression, calc(expression)]);
  return openTextDocumentWithTitles(zip).then(() => { });
};

export const calc: (expression: string) => string = (expression) => {
  try {
    const result = evaluateMathExpression(expression);
    return isNaN(result) ? 'NaN' : result.toString();
  } catch (_e) {
    return 'NaN';
  }
};

function evaluateMathExpression(expr: string): number {
  let pos = 0;
  const str = expr.trim();

  function peek(): string {
    while (pos < str.length && /\s/.test(str[pos])) pos++;
    return pos < str.length ? str[pos] : '';
  }

  function get(): string {
    while (pos < str.length && /\s/.test(str[pos])) pos++;
    return pos < str.length ? str[pos++] : '';
  }

  function parseExpression(): number {
    let value = parseTerm();
    while (true) {
      const op = peek();
      if (op === '+') {
        get();
        value += parseTerm();
      } else if (op === '-') {
        get();
        value -= parseTerm();
      } else {
        break;
      }
    }
    return value;
  }

  function parseTerm(): number {
    let value = parsePower();
    while (true) {
      const op = peek();
      if (op === '*') {
        get();
        if (peek() === '*') {
          get();
          value = Math.pow(value, parsePower());
        } else {
          value *= parsePower();
        }
      } else if (op === '/') {
        get();
        const divisor = parsePower();
        if (divisor === 0) return NaN;
        value /= divisor;
      } else if (op === '%') {
        get();
        value %= parsePower();
      } else {
        break;
      }
    }
    return value;
  }

  function parsePower(): number {
    let value = parseUnary();
    while (peek() === '^') {
      get();
      value = Math.pow(value, parseUnary());
    }
    return value;
  }

  function parseUnary(): number {
    const next = peek();
    if (next === '+') {
      get();
      return parseUnary();
    }
    if (next === '-') {
      get();
      return -parseUnary();
    }
    return parsePrimary();
  }

  function parsePrimary(): number {
    const next = peek();
    if (next === '(') {
      get();
      const val = parseExpression();
      if (get() !== ')') {
        throw new Error('Mismatched parentheses');
      }
      return val;
    }

    const start = pos;
    if (/[0-9.]/.test(next)) {
      while (pos < str.length && /[0-9.eE+-]/.test(str[pos])) {
        if ((str[pos] === '+' || str[pos] === '-') && !/[eE]/.test(str[pos - 1])) {
          break;
        }
        pos++;
      }
      const numStr = str.substring(start, pos);
      const num = Number(numStr);
      if (isNaN(num)) throw new Error(`Invalid number: ${numStr}`);
      return num;
    }

    if (/[a-zA-Z_]/.test(next)) {
      while (pos < str.length && /[a-zA-Z0-9_]/.test(str[pos])) {
        pos++;
      }
      const id = str.substring(start, pos).toLowerCase();
      if (id === 'pi') return Math.PI;
      if (id === 'e') return Math.E;
      if (peek() === '(') {
        get();
        const arg = parseExpression();
        if (get() !== ')') throw new Error('Mismatched parentheses');
        switch (id) {
          case 'sqrt': return Math.sqrt(arg);
          case 'abs': return Math.abs(arg);
          case 'sin': return Math.sin(arg);
          case 'cos': return Math.cos(arg);
          case 'tan': return Math.tan(arg);
          case 'round': return Math.round(arg);
          case 'floor': return Math.floor(arg);
          case 'ceil': return Math.ceil(arg);
          case 'log': return Math.log(arg);
          case 'exp': return Math.exp(arg);
          default: throw new Error(`Unknown function: ${id}`);
        }
      }
      throw new Error(`Unknown identifier: ${id}`);
    }

    throw new Error(`Unexpected character: ${next}`);
  }

  const result = parseExpression();
  if (pos < str.length) {
    throw new Error(`Unexpected trailing content: ${str.substring(pos)}`);
  }
  return result;
}
