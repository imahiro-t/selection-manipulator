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
  /** The exact result (new editor / replacement / notification; `select`: the selected texts joined). */
  expected: string;
  /** The ROADMAP input when it describes the text (`（1,234 字の文章）`) instead of showing it. */
  roadmapInput?: string;
  /** The ROADMAP output when it is not the exact result (`…（通知）`, `「①」「髙」を選択`). */
  roadmapOutput?: string;
  /** `notify`: the notification for two selections of `input`. */
  twice?: string;
  /** `select`: the texts selected in one selection of `input`, in text order. */
  selected?: string[];
}

const HEPBURN: JaExample = { input: 'しんじゅく', expected: 'shinjuku' };
const ROMAJI: JaExample = { input: 'sushi', expected: 'すし' };
const KANJI_NUMERAL: JaExample = { input: '1234', expected: '千二百三十四' };
const KANJI_TO_NUMBER: JaExample = { input: '三億五千万', expected: '350000000' };
const KYUJITAI: JaExample = { input: '國學', expected: '国学' };
const JA_EN_SPACE: JaExample = { input: 'Vue3で開発', expected: 'Vue3 で開発' };

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
  'JA-011': {
    // 10 characters × 123 + 4 = 1,234 characters.
    input: `${'原稿用紙に書く文章。'.repeat(123)}以上です`,
    roadmapInput: '（1,234 字の文章）',
    expected: '1,234 字 / 原稿用紙 3.1 枚',
    roadmapOutput: '1,234 字 / 原稿用紙 3.1 枚（通知）',
    twice: '2,468 字 / 原稿用紙 6.2 枚',
  },
  'JA-012': { input: '｜東京《とうきょう》', expected: '東京' },
  'JA-013': { input: '｜東京《とうきょう》', expected: '<ruby>東京<rt>とうきょう</rt></ruby>' },
  'JA-014': { input: 'ＡＢＣ１２３カナ', expected: 'ABC123カナ' },
  'JA-015': { input: '東京　大阪', expected: '東京 大阪' },
  'JA-016': { input: '1〜3、4～5', note: '〜', choice: '〜', expected: '1〜3、4〜5' },
  'JA-017': { input: 'コ−ヒ− 03ー1234', expected: 'コーヒー 03-1234' },
  'JA-018': { input: '東京タワーへ行く', expected: '東京行' },
  'JA-019': { input: '東京タワーとスカイツリー', expected: 'タワー\nスカイツリー' },
  'JA-020': {
    input: '東京タワーへgo',
    expected: '漢字 2 / カタカナ 3 / ひらがな 1 / 英数字 2',
    roadmapOutput: '漢字 2 / カタカナ 3 / ひらがな 1 / 英数字 2（通知）',
    twice: '漢字 4 / カタカナ 6 / ひらがな 2 / 英数字 4',
  },
  'JA-021': { input: '①②', expected: '(1)(2)' },
  'JA-022': { input: '東京都', expected: '13' },
  'JA-023': { input: '1000001', expected: '〒100-0001' },
  'JA-024': { input: 'がっこう', expected: 'ｶﾞｯｺｳ' },
  'JA-025': { input: '日本 語 の hello world', expected: '日本語の hello world' },
  'JA-026': JA_EN_SPACE,
  'JA-027': { input: 'か゛は゜', expected: 'がぱ' },
  'JA-028': { input: 'しんじゅく', expected: 'sinzyuku' },
  'JA-029': { input: '①髙橋', expected: '①髙', roadmapOutput: '「①」「髙」を選択', selected: ['①', '髙'] },
  'JA-030': HEPBURN,
  'JA-031': ROMAJI,
  'JA-032': KANJI_NUMERAL,
  'JA-033': KANJI_TO_NUMBER,
  'JA-034': KYUJITAI,
  'JA-035': JA_EN_SPACE,
};
