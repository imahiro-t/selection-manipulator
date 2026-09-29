/**
 * The input / output examples of the DEV table of docs/ROADMAP.md (`⏎` and `·` expanded), with
 * the exact results of the commands (with `\n` as the document's line break) and, for the commands
 * that ask something before running, the value chosen in the tests.
 */
export interface DevExample {
  /** The selected text (one selection). */
  input: string;
  /** The `（…）` note after the ROADMAP input (it explains the input, it is not part of it). */
  note?: string;
  /** The `value` of the quick pick item the tests choose. */
  choice?: string;
  /** The exact result (new editor / replacement). */
  expected: string;
}

export const DEV_ROADMAP_EXAMPLES: Record<string, DevExample> = {
  'DEV-001': { input: 'it\'s\nok', expected: '\'it\\\'s\\nok\'' },
  'DEV-002': { input: 'it\'s', expected: '"it\'s"' },
  'DEV-003': { input: 'a\nb', expected: '"a\\n" +\n"b"' },
  'DEV-004': { input: 'a\nb', expected: '`a\nb`' },
  'DEV-005': { input: 'cost ${x}', expected: '`cost \\${x}`' },
  'DEV-006': { input: 'a.b*c?', expected: 'a\\.b\\*c\\?' },
  'DEV-007': { input: 'O\'Reilly', expected: 'O\'\'Reilly' },
  'DEV-008': { input: 'it\'s', expected: '\'it\'\\\'\'s\'' },
  'DEV-009': { input: 'it\'s', expected: '\'it\'\'s\'' },
  'DEV-010': { input: 'a,"b"', expected: '"a,""b"""' },
  'DEV-011': { input: '*a* _b_', expected: '\\*a\\* \\_b\\_' },
  'DEV-030': { input: 'it\'s\nok', expected: '\'it\\\'s\\nok\'' },
  'DEV-031': { input: 'a.b*c?', expected: 'a\\.b\\*c\\?' },
  'DEV-032': { input: 'O\'Reilly', expected: 'O\'\'Reilly' },
};
