/**
 * The input / output examples of the DATAX commands of the showcase data
 * (scripts/showcase-data/DATAX.json), with the exact results. In the showcase `⏎` is a line break
 * (LF here), `⇥` a tab and `·` a space. `answers` are what the tests enter in the prompts, in
 * order; `note` is the `（…）` note of the Japanese example after the input. When `pretty` is set,
 * the command writes the JSON of the example indented with 2 spaces (the showcase shows it on one
 * line). For DATAX-013 / 016 `expected` is the notification and the showcase shows its beginning
 * followed by `（通知）`.
 */
export interface Data2Example {
  input: string;
  expected: string;
  answers?: string[];
  note?: string;
  pretty?: boolean;
}

export const DATA2_EXAMPLES: Record<string, Data2Example> = {
  'DATAX-001': { input: '[{"n":2},{"n":1}]', answers: ['n'], note: 'キーパス: n', expected: '[{"n":1},{"n":2}]' },
  'DATAX-002': { input: '[{"s":"on"},{"s":"off"}]', answers: ['s=on'], note: 's=on', expected: '[{"s":"on"}]' },
  'DATAX-003': { input: '{"a":1,"b":2,"c":3}', answers: ['a,c'], note: 'a,c', expected: '{"a":1,"c":3}' },
  'DATAX-004': { input: '{"a":1,"pw":"x"}', answers: ['pw', 'Top level only'], note: 'pw、最上位のみ', expected: '{"a":1}' },
  'DATAX-005': { input: '{"old":1}', answers: ['old', 'new'], note: 'old, new', expected: '{"new":1}' },
  'DATAX-006': { input: '{"a":"","b":[],"c":1}', expected: '{"c":1}' },
  'DATAX-007': { input: '[{"a":1,"b":2}]', expected: '| a | b |\n| --- | --- |\n| 1 | 2 |' },
  'DATAX-008': { input: '[1,2,3]', answers: ['2'], note: 'N=2', expected: '[[1,2],[3]]' },
  'DATAX-009': { input: '[{"id":"a","v":1}]', answers: ['id'], note: 'id', expected: '{"a":{"id":"a","v":1}}' },
  'DATAX-010': { input: '{"a":1}', expected: '[{"key":"a","value":1}]' },
  'DATAX-011': { input: '{"a":{"b":1}}', answers: ['a.b', '2'], note: 'a.b, 2', expected: '{"a":{"b":2}}' },
  'DATAX-012': { input: 'a: 1\nb:\n  - x', expected: '{a: 1, b: [x]}' },
  'DATAX-013': { input: 'a: 1\n  b: 2', expected: 'Invalid YAML: line 2, column 4: bad indentation of a mapping entry' },
  'DATAX-014': { input: 'a: 1\n---\na: 2', expected: '[{"a":1},{"a":2}]', pretty: true },
  'DATAX-015': { input: 'a=1\n[b]\nc="x"', expected: 'a = 1\n\n[b]\nc = "x"' },
  'DATAX-016': {
    input: '<a><b></a>',
    expected: 'Invalid XML: line 1, column 7: mismatched end tag (expected the end tag of the element at line 1, column 4)',
  },
  'DATAX-017': { input: '<r><i>1</i><i>2</i></r>', expected: '/r/i[1]\n/r/i[2]' },
  'DATAX-018': { input: 'a,b,c', answers: ['3,1,2'], note: '3,1,2', expected: 'c,a,b' },
  'DATAX-019': { input: '山田,太郎', answers: ['1', '2', ' '], note: '1, 2, 区切り: 空白', expected: '山田 太郎' },
  'DATAX-020': { input: '2026-10-01', answers: ['1', '-'], note: '列 1, -', expected: '2026,10,01' },
  'DATAX-021': { input: 'a\nx\ny\nx', answers: ['1'], note: '列 1', expected: 'a,count\nx,2\ny,1' },
  'DATAX-022': { input: 'a,,c', answers: ['N/A'], note: 'N/A', expected: 'a,N/A,c' },
  'DATAX-023': { input: 'host:a\tstatus:200', expected: '[{"host":"a","status":"200"}]', pretty: true },
  'DATAX-024': { input: '[{"a":"1"}]', expected: 'a:1' },
};

/** Expands the notation of the showcase examples: `⏎` (LF), `⇥` (tab), `·` (space). */
export const expandData2 = (value: string): string => value.replace(/⏎/g, '\n').replace(/⇥/g, '\t').replace(/·/g, ' ');

/** The exact result of an example (indented when `pretty`). */
export const expectedResult = (example: Data2Example): string =>
  example.pretty ? JSON.stringify(JSON.parse(example.expected), null, 2) : example.expected;
