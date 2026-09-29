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
  'DEV-020': { input: '#ff0000', expected: 'hsl(0, 100%, 50%)' },
  'DEV-021': { input: 'hsl(120, 100%, 25%)', expected: '#008000' },
  'DEV-022': { input: '#aabbcc', expected: '#abc' },
  'DEV-023': { input: 'a();\nconsole.log(x);\nb();', expected: 'a();\nb();' },
  'DEV-024': { input: 'import b from \'b\';\nimport a from \'a\';', expected: 'import a from \'a\';\nimport b from \'b\';' },
  'DEV-025': { input: '\'Hi \' + name + \'!\'', expected: '`Hi ${name}!`' },
  'DEV-026': {
    input: 'curl -X POST -d \'a=1\' https://example.com',
    expected: 'fetch(\'https://example.com\', {\n  method: \'POST\',\n  headers: {\n    \'Content-Type\': \'application/x-www-form-urlencoded\',\n  },\n  body: \'a=1\',\n});',
  },
  'DEV-027': { input: '<label class="a" for="b">', expected: '<label className="a" htmlFor="b">' },
  'DEV-028': { input: '1.2.3', note: 'minor', choice: 'minor', expected: '1.3.0' },
  'DEV-029': { input: '755', expected: 'rwxr-xr-x' },
  'DEV-030': { input: 'it\'s\nok', expected: '\'it\\\'s\\nok\'' },
  'DEV-031': { input: 'a.b*c?', expected: 'a\\.b\\*c\\?' },
  'DEV-032': { input: 'O\'Reilly', expected: 'O\'\'Reilly' },
  'DEV-033': { input: '{"id":1,"tags":["a"]}', expected: 'interface Root {\n  id: number;\n  tags: string[];\n}' },
  'DEV-034': { input: 'select a from t where b=1', expected: 'SELECT a\nFROM t\nWHERE b = 1' },
  'DEV-035': { input: '<label class="a" for="b">', expected: '<label className="a" htmlFor="b">' },
};
