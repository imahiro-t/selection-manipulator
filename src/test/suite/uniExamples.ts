/**
 * The input / output examples of the UNI table of docs/ROADMAP.md (`{U+XXXX}`, `⏎` and `·`
 * expanded), with the exact results of the commands and, for the commands that ask something
 * before running, the value chosen in the tests.
 */
export interface UniExample {
  /** The selected text (one selection). */
  input: string;
  /** The `（…）` note after the ROADMAP input (it explains the input, it is not part of it). */
  note?: string;
  /** The `value` of the quick pick item the tests choose. */
  choice?: string;
  /** The exact result (new editor / replacement / notification; `select`: the selected texts joined). */
  expected: string;
  /** The ROADMAP output when it is not the exact result (`…（通知）`, `「а」を選択（通知）`). */
  roadmapOutput?: string;
  /** `notify`: the notification for two selections of `input`. */
  twice?: string;
  /** `select`: the texts selected in one selection of `input`, in text order. */
  selected?: string[];
  /** `select`: the notification after selecting in two selections of `input` (none when not set). */
  foundTwice?: string;
}

const FAMILY = '\u{1F468}‍\u{1F469}‍\u{1F467}';

export const UNI_ROADMAP_EXAMPLES: Record<string, UniExample> = {
  'UNI-001': { input: 'é', expected: 'é' },
  'UNI-002': { input: 'é', expected: 'é' },
  'UNI-003': { input: 'ｶﾞ①ﬁ', expected: 'ガ1fi' },
  'UNI-004': { input: 'ﬁ', expected: 'fi' },
  'UNI-005': { input: 'a​b', expected: 'ab' },
  'UNI-006': { input: 'a​b', expected: 'a<U+200B>b' },
  'UNI-007': { input: 'あ😀', expected: 'U+3042 U+1F600' },
  'UNI-008': { input: 'U+3042 U+1F600', expected: 'あ😀' },
  'UNI-009': { input: 'aあ', expected: 'a: 61\nあ: E3 81 82' },
  'UNI-010': { input: '😀', expected: '😀: D83D DE00' },
  'UNI-011': {
    input: FAMILY,
    expected: '1 grapheme / length 8',
    roadmapOutput: '1 grapheme / length 8（通知）',
    twice: '2 graphemes / length 16',
  },
  'UNI-012': { input: 'a\u0007b', expected: 'ab' },
  'UNI-013': { input: 'café ☕', expected: 'caf ' },
  'UNI-014': { input: 'ok👍', expected: 'ok' },
  'UNI-015': { input: 'ok👍 go🚀', expected: '👍🚀' },
  'UNI-016': { input: 'abc', expected: '𝐚𝐛𝐜' },
  'UNI-017': { input: 'abc', expected: '𝑎𝑏𝑐' },
  'UNI-018': { input: 'abc', expected: '𝚊𝚋𝚌' },
  'UNI-019': { input: 'abc', expected: 'ⓐⓑⓒ' },
  'UNI-020': { input: 'hello', expected: 'ollǝɥ' },
  'UNI-021': { input: 'abc', expected: 'a̶b̶c̶' },
  'UNI-022': { input: 'abc', expected: 'a̲b̲c̲' },
  'UNI-023': { input: 'x2', choice: 'digits', expected: 'x²' },
  'UNI-024': { input: 'H2O', choice: 'digits', expected: 'H₂O' },
  'UNI-025': {
    input: 'pаypal',
    note: 'а はキリル文字',
    expected: 'а',
    roadmapOutput: '「а」を選択（通知）',
    selected: ['а'],
    foundTwice: '2 confusable characters found: "а" (U+0430) looks like "a"',
  },
  'UNI-026': {
    input: 'a\u202Eb',
    expected: '\u202E',
    roadmapOutput: '位置を選択（通知）',
    selected: ['\u202E'],
    foundTwice: '2 bidi control characters found: U+202E (right-to-left override)',
  },
  'UNI-027': { input: '"a" it\'s', expected: '“a” it’s' },
  'UNI-028': { input: 'wait... -- ok', expected: 'wait… — ok' },
  'UNI-029': {
    input: 'abcあア漢',
    expected: 'Latin 3, Hiragana 1, Katakana 1, Han 1',
    roadmapOutput: 'Latin 3, Hiragana 1, Katakana 1, Han 1（通知）',
    twice: 'Latin 6, Hiragana 2, Katakana 2, Han 2',
  },
  'UNI-030': { input: 'Привет', expected: 'Privet' },
};
