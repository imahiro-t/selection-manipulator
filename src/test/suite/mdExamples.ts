/**
 * The input / output examples of the MD table of docs/ROADMAP.md, in its notation: `⏎` is a line
 * break, `·` a space and `\|` a `|`. The whole input is the document and is selected as a whole,
 * unless `selection` says which part is selected.
 */
export interface MdExample {
  /** The ROADMAP input without its `（…）` note. */
  input: string;
  /** The `（…）` note after the ROADMAP input (it explains the input, it is not part of it). */
  note?: string;
  /** The values the tests enter in the input boxes, in order. */
  inputs?: string[];
  /** The selected part of the document as offsets (default: all of it). */
  selection?: [number, number];
  /** The whole document after the command (the ROADMAP output). */
  expected: string;
}

export const MD_ROADMAP_EXAMPLES: Record<string, MdExample> = {
  'MD-001': { input: '# a⏎## b', expected: '## a⏎### b' },
  'MD-002': { input: '## a', expected: '# a' },
  'MD-003': { input: '# A⏎## B C', expected: '- [A](#a)⏎··- [B C](#b-c)' },
  'MD-004': { input: 'a⏎b', expected: '- a⏎- b' },
  'MD-005': { input: 'a⏎b', expected: '1. a⏎2. b' },
  'MD-006': { input: 'a⏎b', expected: '- [ ] a⏎- [ ] b' },
  'MD-007': { input: '- [ ] a', expected: '- [x] a' },
  'MD-008': { input: '- [ ] a⏎2. b', expected: 'a⏎b' },
  'MD-009': { input: '1. a⏎5. b⏎2. c', expected: '1. a⏎2. b⏎3. c' },
  'MD-010': { input: 'abc', expected: '**abc**' },
  'MD-011': { input: 'abc', expected: '_abc_' },
  'MD-012': { input: 'abc', expected: '~~abc~~' },
  'MD-013': { input: 'Title⏎=====⏎Sub⏎---', expected: '# Title⏎## Sub' },
  'MD-014': { input: 'a = 1', note: 'python', inputs: ['python'], expected: '```python⏎a = 1⏎```' },
  'MD-015': { input: 'a⏎b', expected: '> a⏎> b' },
  'MD-016': { input: 'https://example.com/a.png', inputs: ['alt'], expected: '![alt](https://example.com/a.png)' },
  'MD-017': { input: 'see https://example.com', expected: 'see <https://example.com>' },
  'MD-018': { input: '\\|a\\|bb\\|⏎\\|-\\|-\\|⏎\\|ccc\\|d\\|', expected: '\\|·a···\\|·bb·\\|⏎\\|·---·\\|·--·\\|⏎\\|·ccc·\\|·d··\\|' },
  'MD-019': { input: '# a⏎**b**', expected: '<h1>a</h1>⏎<p><strong>b</strong></p>' },
  'MD-020': { input: '# A **b** [c](d)', expected: 'A b c' },
  'MD-021': { input: '## Hello World!', expected: '[Hello World!](#hello-world)' },
  'MD-022': { input: '本文補足', note: '「補足」を選択', selection: [2, 4], expected: '本文[^1]⏎⏎[^1]: 補足' },
  'MD-023': { input: '[a](https://x.example)', expected: '[a][1]⏎⏎[1]: https://x.example' },
  'MD-024': { input: '長い本文', note: '要約: 詳細', inputs: ['詳細'], expected: '<details><summary>詳細</summary>⏎⏎長い本文⏎⏎</details>' },
  'MD-025': { input: '---⏎title: a⏎---', expected: '{"title":"a"}' },
};

/** Expands `⏎` (LF), `·` (space) and `\|` (`|`). */
export const expandMd = (value: string): string => value.replace(/\\\|/g, '|').replace(/⏎/g, '\n').replace(/·/g, ' ');
