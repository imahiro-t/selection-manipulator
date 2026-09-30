/**
 * The input / output examples of the TABLE commands of the showcase data (scripts/showcase-data/TABLE.json) (`⏎`, `⇥` and `··` expanded),
 * with the exact results of the commands. TABLE-001 / 026 write JSON indented with 2 spaces and
 * TABLE-011 / 030 write one `<tr>` per line, so their exact results differ from the one-line
 * ROADMAP examples only in layout; the ROADMAP test compares those as values / without white space.
 */
export interface TableExample {
  /** The selected text (one selection). */
  input: string;
  /** The answers to the prompts (input boxes and the QuickPick), in order. */
  inputs: string[];
  /** The `（…）` note after the ROADMAP input that stands for the typed values. */
  note?: string;
  /** The exact result (new editor / replacement) or notification. */
  expected: string;
}

const pretty = (json: string): string => JSON.stringify(JSON.parse(json), null, 2);

const HTML_TABLE = '<table>\n  <tr><th>a</th><th>b</th></tr>\n  <tr><td>1</td><td>2</td></tr>\n</table>';
const ASCII_TABLE = '+---+---+\n| a | b |\n+---+---+\n| 1 | 2 |\n+---+---+';

export const TABLE_ROADMAP_EXAMPLES: Record<string, TableExample> = {
  'TABLE-001': { input: 'a,b\n1,2', inputs: [], expected: pretty('[{"a":"1","b":"2"}]') },
  'TABLE-002': { input: '[{"a":1,"b":2}]', inputs: [], expected: 'a,b\n1,2' },
  'TABLE-003': { input: 'a,b\n1,2', inputs: [], expected: 'a\tb\n1\t2' },
  'TABLE-004': { input: 'a\tb\n1\t2', inputs: [], expected: 'a,b\n1,2' },
  'TABLE-005': { input: 'a,b\n1,2', inputs: [], expected: 'a,1\nb,2' },
  'TABLE-006': { input: 'a,b\n1,2', inputs: ['2'], note: '列 2', expected: 'b\n2' },
  'TABLE-007': { input: 'a,b,c\n1,2,3', inputs: ['2'], note: '列 2', expected: 'a,c\n1,3' },
  'TABLE-008': { input: 'a,b\n1,2', inputs: ['1', '2'], note: '1, 2', expected: 'b,a\n2,1' },
  'TABLE-009': { input: 'a,bb\nccc,d', inputs: [], expected: 'a  ,bb\nccc,d' },
  'TABLE-010': { input: 'a  ,bb\nccc,d', inputs: [], expected: 'a,bb\nccc,d' },
  'TABLE-011': { input: 'a,b\n1,2', inputs: [], expected: HTML_TABLE },
  'TABLE-012': { input: "id,name\n1,O'Neil", inputs: ['users'], note: '表名: users', expected: "INSERT INTO users (id, name) VALUES ('1', 'O''Neil');" },
  'TABLE-013': { input: 'a\n1\n1', inputs: [], expected: 'a\n1' },
  'TABLE-014': { input: 'n,v\na,1\nb,2', inputs: ['v', 'Equals', '2'], note: 'v = 2', expected: 'n,v\nb,2' },
  'TABLE-015': { input: 'n,v\na,1\nb,2', inputs: ['v'], note: 'v', expected: 'sum=3, avg=1.5' },
  'TABLE-016': { input: 'a\nx\ny', inputs: [], expected: '#,a\n1,x\n2,y' },
  'TABLE-017': { input: 'a,b', inputs: [';'], note: ';', expected: 'a;b' },
  'TABLE-018': { input: 'a,b', inputs: [], expected: '"a","b"' },
  'TABLE-019': { input: '"a","b,c"', inputs: [], expected: 'a,"b,c"' },
  'TABLE-020': { input: 'a,b\n1,2', inputs: [], expected: "- a: '1'\n  b: '2'" },
  'TABLE-021': { input: 'a,b\n1,2', inputs: [], expected: ASCII_TABLE },
  'TABLE-022': { input: 'NAME   AGE\nbob    30', inputs: [], expected: 'NAME,AGE\nbob,30' },
  'TABLE-023': { input: 'a,b\n1,\n2,3', inputs: [], expected: '2 rows × 2 cols, b: 1 empty' },
  'TABLE-024': { input: 'a,1\n,2', inputs: [], expected: 'a,1\na,2' },
  'TABLE-025': { input: 'a,b\n1,2', inputs: [], expected: 'a: 1\nb: 2' },
  'TABLE-026': { input: 'a,b\n1,2', inputs: [], expected: pretty('[{"a":"1","b":"2"}]') },
  'TABLE-027': { input: '[{"a":1,"b":2}]', inputs: [], expected: 'a,b\n1,2' },
  'TABLE-028': { input: 'a,b\n1,2', inputs: [], expected: 'a\tb\n1\t2' },
  'TABLE-029': { input: 'a,b\n1,2', inputs: [], expected: 'a,1\nb,2' },
  'TABLE-030': { input: 'a,b\n1,2', inputs: [], expected: HTML_TABLE },
};

/** Answers that pass every prompt of the command (for tests that need some valid answer). */
export const VALID_INPUTS: Record<string, string[]> = {
  'TABLE-006': ['1'],
  'TABLE-007': ['1'],
  'TABLE-008': ['1', '2'],
  'TABLE-012': ['t'],
  'TABLE-014': ['1', 'Equals', 'x'],
  'TABLE-015': ['1'],
  'TABLE-017': [';'],
};
