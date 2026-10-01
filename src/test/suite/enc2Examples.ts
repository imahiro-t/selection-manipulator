/**
 * The input / output examples of the ENCX commands of the showcase data
 * (scripts/showcase-data/ENCX.json) with the full expected values (the showcase shows only the
 * first characters of a hash followed by `…`). `⏎` in the showcase is a line break (LF here).
 * `answer` is what the tests enter in the input box, `note` the `（…）` note of the Japanese example
 * after the input, and for ENCX-021 / ENCX-022 `expected` is the notification text.
 */
export interface Enc2Example {
  input: string;
  expected: string;
  answer?: string;
  note?: string;
}

export const ENC2_EXAMPLES: Record<string, Enc2Example> = {
  'ENCX-001': { input: 'foo', expected: 'CPNMU===' },
  'ENCX-002': { input: 'CPNMU===', expected: 'foo' },
  'ENCX-003': { input: 'AB', expected: 'BB8' },
  'ENCX-004': { input: 'BB8', expected: 'AB' },
  'ENCX-005': { input: 'hi', expected: '6x7' },
  'ENCX-006': { input: '6x7', expected: 'hi' },
  'ENCX-007': { input: 'Cat', answer: 'data', note: 'ファイル名: data', expected: 'begin 644 data\n#0V%T\n`\nend' },
  'ENCX-008': { input: 'begin 644 data\n#0V%T\n`\nend', expected: 'Cat' },
  'ENCX-009': { input: 'a b', expected: '%61%20%62' },
  'ENCX-010': { input: '1foo bar', expected: '\\31 foo\\ bar' },
  'ENCX-011': { input: 'a*b(c)', expected: 'a\\2ab\\28c\\29' },
  'ENCX-012': { input: 'Smith, John', expected: 'Smith\\, John' },
  'ENCX-013': { input: 'It\'s "x"', expected: 'concat(\'It\', "\'", \'s "x"\')' },
  'ENCX-014': { input: 'a"b\n', expected: '"a\\"b\\n"' },
  'ENCX-015': { input: 'a\\x41\\101', expected: 'aAA' },
  'ENCX-016': { input: 'abc', expected: 'ec01498288516fc926459f58e2c6ad8df9b473cb0fc08c2596da7cf0e49be4b298d88cea927ac7f539f1edf228376d25' },
  'ENCX-017': { input: 'abc', answer: '32', note: 'N=32', expected: '483366601360a8771c6863080cc4114d8db44530f8f1e1ee4f94ea37e78b5739' },
  'ENCX-018': {
    input: 'abc',
    answer: 'k',
    note: '鍵: k',
    expected: '7cc7ed9b9f44d32fa6025c48df62817a8786ebcbf91118e2e9d1eb295a147513dffd9231f72b99510096a47828e78f3edeea2ec7e9b36d17d7e1654fd6c83f13',
  },
  'ENCX-019': { input: '123456789', expected: '29b1' },
  'ENCX-020': { input: '123456789', expected: 'e3069283' },
  'ENCX-021': { input: 'GB82 WEST 1234 5698 7654 32', expected: 'IBAN: valid' },
  'ENCX-022': { input: '978-4-00-310101-8', expected: 'ISBN-13: valid' },
};

/** Expands the notation of the showcase examples: `⏎` (LF). */
export const expandEnc2 = (value: string): string => value.replace(/⏎/g, '\n');
