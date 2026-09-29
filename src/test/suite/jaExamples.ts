/**
 * The input / output examples of the JA table of docs/ROADMAP.md (`⏎` expanded), with the exact
 * results of the commands and, for the commands that ask something before running, the value
 * chosen in the tests.
 */
export interface JaExample {
  /** The selected text (one selection). */
  input: string;
  /** The `（…）` note after the ROADMAP input that stands for a value chosen at run time. */
  note?: string;
  /** The `value` of the quick pick item the tests choose. */
  choice?: string;
  /** The exact result (new editor / replacement / notification). */
  expected: string;
}

const HEPBURN: JaExample = { input: 'しんじゅく', expected: 'shinjuku' };
const ROMAJI: JaExample = { input: 'sushi', expected: 'すし' };
const KANJI_NUMERAL: JaExample = { input: '1234', expected: '千二百三十四' };
const KANJI_TO_NUMBER: JaExample = { input: '三億五千万', expected: '350000000' };
const KYUJITAI: JaExample = { input: '國學', expected: '国学' };

export const JA_ROADMAP_EXAMPLES: Record<string, JaExample> = {
  'JA-001': HEPBURN,
  'JA-002': ROMAJI,
  'JA-003': KANJI_NUMERAL,
  'JA-004': KANJI_TO_NUMBER,
  'JA-005': { input: '123', expected: '壱百弐拾参' },
  'JA-006': { input: '今日は、晴れ。', expected: '今日は，晴れ．' },
  'JA-007': { input: '今日は，晴れ．', expected: '今日は、晴れ。' },
  'JA-008': KYUJITAI,
  'JA-009': { input: '国学', expected: '國學' },
  'JA-010': { input: 'きゃっと', expected: 'きやつと' },
  'JA-030': HEPBURN,
  'JA-031': ROMAJI,
  'JA-032': KANJI_NUMERAL,
  'JA-033': KANJI_TO_NUMBER,
  'JA-034': KYUJITAI,
};
