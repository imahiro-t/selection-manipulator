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
  'DEV-012': { input: '{"id":1,"tags":["a"]}', expected: 'interface Root {\n  id: number;\n  tags: string[];\n}' },
  'DEV-013': { input: '{"user_id":1}', expected: 'type Root struct {\n\tUserID int `json:"user_id"`\n}' },
  'DEV-014': { input: '{"id":1}', expected: 'from typing import TypedDict\n\n\nclass Root(TypedDict):\n    id: int' },
  'DEV-015': { input: 'select a from t where b=1', expected: 'SELECT a\nFROM t\nWHERE b = 1' },
  'DEV-016': { input: 'SELECT a\n-- c\nFROM t', expected: 'SELECT a FROM t' },
  'DEV-017': { input: 'select name from users', expected: 'SELECT name FROM users' },
  'DEV-018': { input: 'a {\n  color: red;\n}', expected: 'a{color:red}' },
  'DEV-019': { input: 'a{color:red}', expected: 'a {\n  color: red;\n}' },
  'DEV-030': { input: 'it\'s\nok', expected: '\'it\\\'s\\nok\'' },
  'DEV-031': { input: 'a.b*c?', expected: 'a\\.b\\*c\\?' },
  'DEV-032': { input: 'O\'Reilly', expected: 'O\'\'Reilly' },
  'DEV-033': { input: '{"id":1,"tags":["a"]}', expected: 'interface Root {\n  id: number;\n  tags: string[];\n}' },
  'DEV-034': { input: 'select a from t where b=1', expected: 'SELECT a\nFROM t\nWHERE b = 1' },
};
