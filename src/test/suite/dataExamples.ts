/**
 * The input / output examples of the DATA table of docs/ROADMAP.md (`⏎` and `··` expanded), with
 * the exact results of the commands. Commands that write other formats as JSON indent it with 2
 * spaces, so their expected result is the ROADMAP example re-indented (`pretty`); the ROADMAP test
 * compares those semantically.
 */
export interface DataExample {
  /** The selected text (one selection). */
  input: string;
  /** DATA-018: the text of each selection. */
  selections?: string[];
  /** DATA-015 / 023 / 024: the value typed into the input box. */
  path?: string;
  /** The exact result (new editor / replacement) or notification. */
  expected: string;
}

export const pretty = (json: string): string => JSON.stringify(JSON.parse(json), null, 2);

/** A complete User-Agent for the shortened ROADMAP example of DATA-032. */
export const CHROME_ON_WINDOWS_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

export const DATA_ROADMAP_EXAMPLES: Record<string, DataExample> = {
  'DATA-001': { input: '{"b":1,"a":{"d":2,"c":3}}', expected: '{"a":{"c":3,"d":2},"b":1}' },
  'DATA-002': { input: '{"a":1,"b":"x y"}', expected: 'a=1&b=x+y' },
  'DATA-003': { input: '{"A":"1","B":"x y"}', expected: 'A=1\nB="x y"' },
  'DATA-004': { input: '{"a":{"b":1}}', expected: '<a>\n  <b>1</b>\n</a>' },
  'DATA-005': { input: '{"a":{"b":1}}', expected: '[a]\nb = 1' },
  'DATA-006': { input: '[a]\nb = 1', expected: pretty('{"a":{"b":1}}') },
  'DATA-007': { input: '{"db":{"host":"x"}}', expected: '[db]\nhost=x' },
  'DATA-008': { input: '[db]\nhost=x', expected: pretty('{"db":{"host":"x"}}') },
  'DATA-009': { input: '{"a":{"b":1}}', expected: 'a.b=1' },
  'DATA-010': { input: 'a.b=1', expected: pretty('{"a":{"b":"1"}}') },
  'DATA-011': { input: '{"a":null,"b":[1,null]}', expected: '{"b":[1]}' },
  'DATA-012': { input: '[{"a":1},{"a":2}]', expected: '{"a":1}\n{"a":2}' },
  'DATA-013': { input: '{"a":1}\n{"a":2}', expected: pretty('[{"a":1},{"a":2}]') },
  'DATA-014': { input: '{a: 1, // c\n}', expected: pretty('{"a":1}') },
  'DATA-015': { input: '{"a":{"b":[5]}}', path: 'a.b[0]', expected: '5' },
  'DATA-016': { input: '{"a":{"b":1},"c":[2]}', expected: 'a.b\nc[0]' },
  'DATA-017': { input: '{"a":1,"b":2}', expected: 'a\nb' },
  'DATA-018': { input: '{"a":1}', selections: ['{"a":1}', '{"b":2}'], expected: pretty('{"a":1,"b":2}') },
  'DATA-019': { input: '{"a":1,}', expected: 'Invalid JSON at line 1, column 8: unexpected character "}"' },
  'DATA-020': { input: 'a:   {b: 1}', expected: 'a:\n  b: 1' },
  'DATA-021': { input: 'b: 1\na: 2', expected: 'a: 2\nb: 1' },
  'DATA-022': { input: '[1,2,1,{"a":1},{"a":1}]', expected: '[1,2,{"a":1}]' },
  'DATA-023': { input: '[{"id":1},{"id":2}]', path: 'id', expected: '[1,2]' },
  'DATA-024': { input: '[{"t":"a","v":1},{"t":"a","v":2}]', path: 't', expected: '{"a":[{"t":"a","v":1},{"t":"a","v":2}]}' },
  'DATA-025': { input: '[1,2,3]', expected: '3 elements (4 nodes in total)' },
  'DATA-026': {
    input: '{"a":1}',
    expected: pretty('{"$schema":"https://json-schema.org/draft/2020-12/schema","type":"object","properties":{"a":{"type":"integer"}},"required":["a"]}'),
  },
  'DATA-027': { input: '{"a":1,"b-c":2}', expected: "{ a: 1, 'b-c': 2 }" },
  'DATA-028': { input: "{ a: 1, 'b': [true] }", expected: pretty('{"a":1,"b":[true]}') },
  'DATA-029': { input: 'a=1; b=x', expected: pretty('{"a":"1","b":"x"}') },
  'DATA-030': { input: 'id=1; Path=/; Secure', expected: pretty('{"name":"id","value":"1","path":"/","secure":true}') },
  'DATA-031': { input: 'Accept: a\nX-Id: 1', expected: pretty('{"Accept":"a","X-Id":"1"}') },
  'DATA-032': { input: CHROME_ON_WINDOWS_UA, expected: pretty('{"browser":"Chrome 120","os":"Windows 10"}') },
  'DATA-033': { input: '{"a":"{\\"b\\":1}"}', expected: '{"a":{"b":1}}' },
  'DATA-034': { input: '{"b":1,"a":{"d":2,"c":3}}', expected: '{"a":{"c":3,"d":2},"b":1}' },
  'DATA-035': { input: '{"a":{"b":1}}', expected: '<a>\n  <b>1</b>\n</a>' },
  'DATA-036': { input: '{"a":{"b":1}}', expected: '[a]\nb = 1' },
  'DATA-037': { input: '[a]\nb = 1', expected: pretty('{"a":{"b":1}}') },
  'DATA-038': { input: '[{"a":1},{"a":2}]', expected: '{"a":1}\n{"a":2}' },
  'DATA-039': { input: '{"a":1}\n{"a":2}', expected: pretty('[{"a":1},{"a":2}]') },
  'DATA-040': { input: 'a:   {b: 1}', expected: 'a:\n  b: 1' },
};
