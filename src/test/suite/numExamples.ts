/**
 * The input / output examples of the NUM table of docs/ROADMAP.md (`⏎` expanded), with the exact
 * results of the commands and the values typed into the input boxes.
 */
export interface NumExample {
  /** The selected text (one selection). */
  input: string;
  /** The answers to the input boxes, in order. */
  inputs: string[];
  /** The `（…）` note after the ROADMAP input that stands for the typed values. */
  note?: string;
  /** The exact result (new editor line / replacement). */
  expected: string;
}

export const NUM_ROADMAP_EXAMPLES: Record<string, NumExample> = {
  'NUM-001': { input: '1\n3\n2\n10', inputs: [], expected: '2.5' },
  'NUM-002': { input: '1\n2\n2\n3', inputs: [], expected: '2' },
  'NUM-003': { input: '2\n4\n4\n4\n5\n5\n7\n9', inputs: [], expected: 'σ=2, s=2.1381' },
  'NUM-004': { input: '1\n2\n3', inputs: [], expected: '0.6667 / 1' },
  'NUM-005': { input: 'a 1 b 2.5', inputs: [], expected: '2' },
  'NUM-006': { input: '2\n3\n4', inputs: [], expected: '24' },
  'NUM-007': { input: '3\n9\n1', inputs: [], expected: '8' },
  'NUM-008': { input: '1\n2\n3\n4\n5', inputs: ['90'], note: '90', expected: '4.6' },
  'NUM-009': { input: '1\n2\n3', inputs: [], expected: 'count=3, sum=6, mean=2, min=1, max=3, median=2, σ=0.8165, s=1' },
  'NUM-010': { input: '1\n2\n3', inputs: [], expected: '1\n3\n6' },
  'NUM-011': { input: '3.14159', inputs: ['2'], note: '2', expected: '3.14' },
  'NUM-012': { input: '-2.5\n2.7', inputs: [], expected: '-3\n2' },
  'NUM-013': { input: '2.1', inputs: [], expected: '3' },
  'NUM-014': { input: '-2.7', inputs: [], expected: '-2' },
  'NUM-015': { input: '-5', inputs: [], expected: '5' },
  'NUM-016': { input: '5\n-3', inputs: [], expected: '-5\n3' },
  'NUM-017': { input: '1234567.89', inputs: [], expected: '1,234,567.89' },
  'NUM-018': { input: '1,234,567', inputs: [], expected: '1234567' },
  'NUM-019': { input: '1234.5', inputs: ['de-DE'], note: 'de-DE', expected: '1.234,5' },
  'NUM-020': { input: '255', inputs: [], expected: '0xff' },
  'NUM-021': { input: '0xff', inputs: [], expected: '255' },
  'NUM-022': { input: '10', inputs: [], expected: '0b1010' },
  'NUM-023': { input: '0b1010', inputs: [], expected: '10' },
  'NUM-024': { input: '8', inputs: [], expected: '0o10' },
  'NUM-025': { input: '0o10', inputs: [], expected: '8' },
  'NUM-026': { input: 'zz', inputs: ['36', '10'], note: '36 → 10', expected: '1295' },
  'NUM-027': { input: '12300', inputs: [], expected: '1.23e+4' },
  'NUM-028': { input: '1.23e+4', inputs: [], expected: '12300' },
  'NUM-029': { input: '0.125', inputs: [], expected: '12.5%' },
  'NUM-030': { input: '1536', inputs: [], expected: '1.5 KiB' },
  'NUM-031': { input: '1.5 MiB', inputs: [], expected: '1572864' },
  'NUM-032': { input: '42', inputs: [], expected: 'forty-two' },
  'NUM-033': { input: '1\n2\n11', inputs: [], expected: '1st\n2nd\n11th' },
  'NUM-034': { input: '0.75', inputs: [], expected: '3/4' },
  'NUM-035': { input: '100', inputs: [], expected: '212' },
  'NUM-036': { input: '212', inputs: [], expected: '100' },
  'NUM-037': { input: '10', inputs: [], expected: '6.2137' },
  'NUM-038': { input: '1', inputs: [], expected: '1.6093' },
  'NUM-039': { input: '2.54', inputs: [], expected: '1' },
  'NUM-040': { input: '1', inputs: [], expected: '2.54' },
};

/** Text that no command accepts (not a number in any base, and no number token for the statistics). */
export const NUM_INVALID_INPUT = 'a?c';
