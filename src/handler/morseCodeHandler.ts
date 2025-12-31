import { TextEditor } from 'vscode';
import { openTextDocumentWithTitles } from '../common';

// Maps
const moraMap: { [key: string]: string } = {
  'A': '.-', 'B': '-...', 'C': '-.-.', 'D': '-..', 'E': '.', 'F': '..-.',
  'G': '--.', 'H': '....', 'I': '..', 'J': '.---', 'K': '-.-', 'L': '.-..',
  'M': '--', 'N': '-.', 'O': '---', 'P': '.--.', 'Q': '--.-', 'R': '.-.',
  'S': '...', 'T': '-', 'U': '..-', 'V': '...-', 'W': '.--', 'X': '-..-',
  'Y': '-.--', 'Z': '--..',
  '1': '.----', '2': '..---', '3': '...--', '4': '....-', '5': '.....',
  '6': '-....', '7': '--...', '8': '---..', '9': '----.', '0': '-----',
  '.': '.-.-.-', ',': '--..--', '?': '..--..', "'": '.----.', '!': '-.-.--',
  '/': '-..-.', '(': '-.--.', ')': '-.--.-', '&': '.-...', ':': '---...',
  ';': '-.-.-.', '=': '-...-', '+': '.-.-.', '-': '-....-', '_': '..--.-',
  '"': '.-..-.', '$': '...-..-', '@': '.--.-.'
};

const wabunMap: { [key: string]: string } = {
  'イ': '.-', 'ロ': '.-.-', 'ハ': '-...', 'ニ': '-.-.', 'ホ': '-..',
  'ヘ': '.', 'ト': '..-.', 'チ': '..-.', 'リ': '--.', 'ヌ': '....',
  'ル': '-.--.', 'ヲ': '.---', 'ワ': '-.-', 'カ': '.-..', 'ヨ': '--',
  'タ': '-.', 'レ': '---', 'ソ': '---.', 'ツ': '.--.', 'ネ': '--.-',
  'ナ': '.-.', 'ラ': '...', 'ム': '-', 'ウ': '..-', 'ヰ': '.-..-',
  'ノ': '..--', 'オ': '.-...', 'ク': '...-', 'ヤ': '.--', 'マ': '-..-',
  'ケ': '-.--', 'フ': '--..', 'コ': '----', 'エ': '-.---', 'テ': '.-.--',
  'ア': '--.--', 'サ': '-.-.-', 'キ': '-.-..', 'ユ': '-.--.', 'メ': '-...-',
  'ミ': '..-.-', 'シ': '--.-.', 'ヱ': '.--..', 'ヒ': '--..-', 'モ': '-..-.',
  'セ': '.---.', 'ス': '---.-', 'ン': '.-.-.', '゛': '..', '゜': '..--.'
};

// Reverse Maps
const reverseMoraMap: { [key: string]: string } = Object.fromEntries(Object.entries(moraMap).map(([k, v]) => [v, k]));
const reverseWabunMap: { [key: string]: string } = Object.fromEntries(Object.entries(wabunMap).map(([k, v]) => [v, k]));

// Output mode: 'new-tab' | 'replace' | 'clipboard'
// Priority: 'standard' | 'kana' (for decoding)
export const morseHandler = (mode: 'to-morse' | 'from-morse', output: 'new-tab' | 'replace' | 'clipboard', priority: 'standard' | 'kana' = 'standard') => async (textEditor: TextEditor) => {
  if (textEditor.selections.length === 0) return;

  const selections = textEditor.selections;
  const results = selections
    .map(selection => textEditor.document.getText(selection))
    .map(text => processText(text, mode, priority));

  if (output === 'replace') {
    await textEditor.edit(editBuilder => {
      selections.forEach((selection, index) => {
        editBuilder.replace(selection, results[index]);
      });
    });
  } else if (output === 'clipboard') {
    const vscode = require('vscode');
    await vscode.env.clipboard.writeText(results.join('\n'));
  } else {
    const zip = selections.map((selection, index) => [textEditor.document.getText(selection), results[index]]);
    await openTextDocumentWithTitles(zip);
  }
};

const processText = (text: string, mode: 'to-morse' | 'from-morse', priority: 'standard' | 'kana'): string => {
  if (mode === 'to-morse') {
    return text.toUpperCase().split('').map(char => {
      // Prioritize Wabun matches if char is Kana, Mora if char is Alpha.
      // Maps are disjoint (Kana vs Alpha), so checking both is safe, order matters only for shared chars which are none.
      // Wait, Wabun uses some chars? No key is text char.
      if (wabunMap[char]) return wabunMap[char];
      if (moraMap[char]) return moraMap[char];
      if (char === ' ') return ' ';
      return char;
    }).join(' ');
  } else {
    // From Morse
    return text.split(' ').map(code => {
      const trimmedCode = code.trim();
      if (!trimmedCode) return ' ';

      if (priority === 'kana') {
        // Check Wabun first
        if (reverseWabunMap[trimmedCode]) return reverseWabunMap[trimmedCode];
        if (reverseMoraMap[trimmedCode]) return reverseMoraMap[trimmedCode];
      } else {
        // Check Standard first
        if (reverseMoraMap[trimmedCode]) return reverseMoraMap[trimmedCode];
        if (reverseWabunMap[trimmedCode]) return reverseWabunMap[trimmedCode];
      }
      return trimmedCode; // Unknown code
    }).join('');
  }
};
