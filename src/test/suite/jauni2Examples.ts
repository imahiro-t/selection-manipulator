/**
 * The input / output examples of the JAUNIX commands of the showcase data
 * (scripts/showcase-data/JAUNIX.json) (`⏎` and `⇥` expanded), with the exact results of the
 * commands and the answers to their quick picks and input boxes (the `（…）` note after the input
 * of the English example stands for them).
 */
export interface Jauni2Example {
  /** The selected text. */
  input: string;
  /** The answers to the input boxes and quick picks, in order (a quick pick answer is the value of the item). */
  inputs: string[];
  /** The `（…）` note after the input of the English showcase example. */
  note?: string;
  /** The exact result (for a notification: its text). */
  expected: string;
}

export const JAUNI2_EXAMPLES: Record<string, Jauni2Example> = {
  'JAUNIX-001': { input: 'あい\nう', inputs: [], expected: 'うあ\n　い' },
  'JAUNIX-002': { input: 'さとう\nｶﾞｲﾄﾞ', inputs: [], expected: 'さ行\tさとう\nか行\tｶﾞｲﾄﾞ' },
  'JAUNIX-003': { input: 'ｶﾞｲﾄﾞＡＢＣ', inputs: [], expected: 'がいどabc' },
  'JAUNIX-004': { input: '123456789', inputs: [], expected: '1億2345万6789' },
  'JAUNIX-005': { input: '7000012050002', inputs: [], expected: 'Corporate number: valid' },
  'JAUNIX-006': { input: 'がぱ', inputs: ['spacing'], note: '゛ ゜', expected: 'か゛は゜' },
  'JAUNIX-007': { input: '漢字（かんじ）', inputs: [], expected: '｜漢字《かんじ》' },
  'JAUNIX-008': { input: 'Abc', inputs: [], expected: '𝒜𝒷𝒸' },
  'JAUNIX-009': { input: 'Abc', inputs: [], expected: '𝔄𝔟𝔠' },
  'JAUNIX-010': { input: 'Ab1', inputs: [], expected: '𝔸𝕓𝟙' },
  'JAUNIX-011': { input: 'abc', inputs: [], expected: 'ᴀʙᴄ' },
  'JAUNIX-012': { input: 'é😀', inputs: [], expected: '\\xe9\\U0001f600' },
  'JAUNIX-013': { input: 'JP', inputs: [], expected: '🇯🇵' },
  'JAUNIX-014': { input: '🇯🇵', inputs: [], expected: 'JP' },
  'JAUNIX-015': {
    input: '| k | v |\n|---|---|\n| b | 2 |\n| a | 1 |', inputs: ['1', 'ascending'], note: '1, Ascending',
    expected: '| k | v |\n|---|---|\n| a | 1 |\n| b | 2 |',
  },
  'JAUNIX-016': { input: '| a | b |\n|---|---|\n| 1 | 2 |', inputs: [], expected: '| a | 1 |\n| --- | --- |\n| b | 2 |' },
  'JAUNIX-017': { input: '[Docs](https://x.example)', inputs: [], expected: 'Docs' },
  'JAUNIX-018': { input: '[a](u1) ![b](u2)', inputs: [], expected: 'a\tu1\nb\tu2' },
  'JAUNIX-019': { input: '[a][1]\n\n[1]: https://x.example', inputs: [], expected: '[a](https://x.example)' },
  'JAUNIX-020': { input: 'text', inputs: ['NOTE'], note: 'NOTE', expected: '> [!NOTE]\n> text' },
  'JAUNIX-021': { input: 'Ctrl+C', inputs: [], expected: '<kbd>Ctrl</kbd>+<kbd>C</kbd>' },
};
