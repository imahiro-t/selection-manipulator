/**
 * The input / output examples of the TEXTX commands of the showcase data
 * (scripts/showcase-data/TEXTX.json), expanded (`⏎` = line break, `⇥` = tab, `·` = space), with
 * the values the tests enter in the input boxes.
 */
export interface Text2Example {
  /** The selected text (one selection). */
  input: string;
  /** The `（…）` note of the Japanese example after the input (it explains the input, it is not part of it). */
  note?: string;
  /** The values the tests enter in the input boxes, in order. */
  inputs?: string[];
  /** The replacement, or the content of the new editor. */
  expected: string;
}

export const TEXT2_EXAMPLES: Record<string, Text2Example> = {
  'TEXTX-001': { input: 'ab', note: 'N=3、区切り: -', inputs: ['3', '-'], expected: 'ab-ab-ab' },
  'TEXTX-002': { input: 'Hello World', note: 'N=8', inputs: ['8'], expected: 'Hello W…' },
  'TEXTX-003': { input: 'very-long-file-name.txt', note: 'N=15', inputs: ['15'], expected: 'very-lo…ame.txt' },
  'TEXTX-004': { input: '42', note: '幅: 6、文字: *', inputs: ['6', '*'], expected: '****42' },
  'TEXTX-005': { input: 'abc', note: '幅: 6、文字: .', inputs: ['6', '.'], expected: 'abc...' },
  'TEXTX-006': { input: '1234567890', note: 'N=4、区切り: -', inputs: ['4', '-'], expected: '1234-5678-90' },
  'TEXTX-007': { input: 'hello', note: 'A: el, B: ip', inputs: ['el', 'ip'], expected: 'hippo' },
  'TEXTX-008': { input: 'a-b_c', note: '集合: -_', inputs: ['-_'], expected: 'abc' },
  'TEXTX-009': { input: 'a---b--c', note: '集合: -', inputs: ['-'], expected: 'a-b-c' },
  'TEXTX-010': { input: 'abc123def', expected: 'abcdef' },
  'TEXTX-011': { input: 'Hello, world!', expected: 'Hello world' },
  'TEXTX-012': { input: 'TEL: 03-1234-5678', expected: '0312345678' },
  'TEXTX-013': { input: 'hello world', expected: 'olleh dlrow' },
  'TEXTX-014': { input: 'pear apple fig', expected: 'apple fig pear' },
  'TEXTX-015': { input: 'a b a c b', expected: 'a b c' },
  'TEXTX-016': { input: 'banana', expected: 'aaabnn' },
  'TEXTX-017': { input: 'banana', expected: 'ban' },
  'TEXTX-018': { input: 'a b a', expected: 'a\t2\nb\t1' },
  'TEXTX-019': { input: 'banana', expected: 'a\t3\nn\t2\nb\t1' },
  'TEXTX-020': { input: 'see https://a.example/x now', expected: 'see now' },
  'TEXTX-021': { input: '4111111111111111', note: 'N=4', inputs: ['4'], expected: '************1111' },
  'TEXTX-022': { input: 'leet speak', expected: 'l337 5p34k' },
  'TEXTX-023': { input: 'a (note) b', note: '開始: (、終了: )', inputs: ['(', ')'], expected: 'a  b' },
};

/** Expands the notation of the showcase examples: `⏎` (LF), `⇥` (tab) and `·` (space). */
export const expandText2 = (value: string): string => value.replace(/⏎/g, '\n').replace(/⇥/g, '\t').replace(/·/g, ' ');
