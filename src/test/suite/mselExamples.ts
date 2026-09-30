/**
 * The input / output examples of the MSEL commands of the showcase data (scripts/showcase-data/MSEL.json), in its notation:
 * `[text]` is a selection, `|` (`\|` in the table) and `[]` are cursors (empty selections),
 * `⏎` is a line break and `·` a space. A text without any marker is selected as a whole.
 */
export interface MselExample {
  /** The ROADMAP input without its `（…）` note. */
  input: string;
  /** The `（…）` note after the ROADMAP input (it explains the input, it is not part of it). */
  note?: string;
  /** The values the tests enter in the input boxes, in order. */
  inputs?: string[];
  /** The exact text and selections after the command. */
  expected: string;
  /** The ROADMAP output when it is not `expected` (it lists only the selections left, or the notification). */
  roadmapOutput?: string;
  /** Commands that only notify: the notification (the ROADMAP output without `（通知）`). */
  info?: string;
}

export const MSEL_ROADMAP_EXAMPLES: Record<string, MselExample> = {
  'MSEL-001': { input: '[a] [b] [c]', expected: '[a] b [c]', roadmapOutput: '[a] [c]' },
  'MSEL-002': { input: '[a] [b] [c]', expected: 'a [b] c', roadmapOutput: '[b]' },
  'MSEL-003': { input: '[a] [b] [c] [d]', note: 'N=2', inputs: ['2'], expected: 'a [b] c [d]', roadmapOutput: '[b] [d]' },
  'MSEL-004': { input: '[a] [b] [c]', expected: 'a [b] [c]', roadmapOutput: '[b] [c]' },
  'MSEL-005': { input: '[a] [b] [c]', expected: '[a] [b] c', roadmapOutput: '[a] [b]' },
  'MSEL-006': { input: '[a1] [b] [c2]', note: '\\d', inputs: ['\\d'], expected: '[a1] b [c2]', roadmapOutput: '[a1] [c2]' },
  'MSEL-007': { input: '[a1] [b] [c2]', note: '\\d', inputs: ['\\d'], expected: 'a1 [b] c2', roadmapOutput: '[b]' },
  'MSEL-008': { input: '[a] [] [b]', expected: '[a]  [b]', roadmapOutput: '[a] [b]' },
  'MSEL-009': { input: '[a] [b] [a]', expected: '[a] [b] a', roadmapOutput: '[a] [b]' },
  'MSEL-010': { input: 'a|=1⏎bbb|=2', note: '| はカーソル', expected: 'a··|=1⏎bbb|=2' },
  'MSEL-011': { input: 'he|llo', expected: '[hello]' },
  'MSEL-012': { input: '"he|llo"', expected: '"[hello]"' },
  'MSEL-013': { input: 'f(a,|b)', expected: 'f([a,b])' },
  'MSEL-014': { input: '[··ab·]', expected: '··[ab]·' },
  'MSEL-015': { input: '["ab"]', expected: '"[ab]"' },
  'MSEL-016': { input: '[a]bc,d', note: ',', inputs: [','], expected: '[abc],d' },
  'MSEL-017': { input: '[a,b,c]', note: ',', inputs: [','], expected: '[a],[b],[c]' },
  'MSEL-018': { input: '[a1b2c]', note: '\\d', inputs: ['\\d'], expected: '[a]1[b]2[c]' },
  'MSEL-019': { input: '[foo bar]', expected: '[foo] [bar]' },
  'MSEL-020': { input: '··a⏎····b', expected: '··|a⏎····|b' },
  'MSEL-021': { input: 'a,b⏎c,d', note: '列 2', inputs: [',', '2'], expected: 'a,[b]⏎c,[d]' },
  'MSEL-022': { input: 'a1 b22', expected: 'a[1] b[22]' },
  'MSEL-023': { input: 'f("a", \'b\')', expected: 'f("[a]", \'[b]\')' },
  'MSEL-024': {
    input: 'see https://a.example and https://b.example',
    expected: 'see [https://a.example] and [https://b.example]',
  },
  'MSEL-025': { input: '[a] [b] [c]', expected: '[c] [a] [b]' },
  'MSEL-026': { input: '[a] [b] [c]', expected: '[b] [c] [a]' },
  'MSEL-027': { input: '[foo] = [bar]', expected: '[bar] = [foo]' },
  'MSEL-028': { input: '[x] [a] [b]', expected: '[x] [x] [x]' },
  'MSEL-029': { input: '[ab]⏎⏎[c]', expected: '[ab]⏎⏎[c]', roadmapOutput: '2 selections: L1 (2), L3 (1)（通知）', info: '2 selections: L1 (2), L3 (1)' },
  'MSEL-030': { input: '··a⏎····b', expected: '[··]a⏎[····]b' },
};

/** A text with selections: the document text and the selections as `[start, end]` offsets. */
export interface MarkedText {
  text: string;
  ranges: [number, number][];
}

/** Expands `⏎` and `·` (the ROADMAP's `\|` is written `|` in the examples). */
export const expandNotation = (value: string): string => value.replace(/\\\|/g, '|').replace(/⏎/g, '\n').replace(/·/g, ' ');

/** Parses `[…]` (selection) and `|` (cursor) markers; without markers the whole text is selected. */
export const parseMarked = (marked: string): MarkedText => {
  const value = expandNotation(marked);
  let text = '';
  const ranges: [number, number][] = [];
  let open = -1;
  for (const char of value) {
    if (char === '[' && open === -1) {
      open = text.length;
    } else if (char === ']' && open !== -1) {
      ranges.push([open, text.length]);
      open = -1;
    } else if (char === '|' && open === -1) {
      ranges.push([text.length, text.length]);
    } else {
      text += char;
    }
  }
  return ranges.length === 0 ? { text, ranges: [[0, text.length]] } : { text, ranges };
};

/** Writes the markers back: `[…]` for a selection, `|` for a cursor (the inverse of `parseMarked`, `⏎`/`·` kept as is). */
export const renderMarked = (text: string, ranges: readonly [number, number][]): string => {
  const sorted = [...ranges].sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  let result = '';
  let position = 0;
  for (const [start, end] of sorted) {
    result += text.slice(position, start) + (start === end ? '|' : `[${text.slice(start, end)}]`);
    position = end;
  }
  return result + text.slice(position);
};
