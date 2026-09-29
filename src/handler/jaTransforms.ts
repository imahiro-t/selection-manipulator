/**
 * Pure (vscode-independent) command table of the JA-001..035 Japanese text commands.
 *
 * Every command has one of four outputs: a new editor, the selections replaced in place, a
 * notification (all selections together, `combine`) or new selections (`select`). A derived
 * (Replace) command uses the very same transform as its base command, so both give the same result.
 *
 * Only local processing: no network, files or processes, no `eval` / `new Function`, no new
 * dependency.
 */
import { assertJaInputLength, assertWithinBudget, mapJaLines } from './jaCommon';
import {
  charTypeCount,
  circledNumberToParen,
  composeDakuten,
  extractKanji,
  extractKatakanaWords,
  findPlatformDependent,
  formatPostalCode,
  FULLWIDTH_TILDE,
  fullwidthAlnumToHalf,
  hiraganaToHalfwidthKatakana,
  ideographicSpaceToSpace,
  kanaToRomaji,
  kanjiToNumber,
  kyujitaiToShinjitai,
  manuscriptCount,
  normalizeHyphens,
  normalizeWaveDash,
  numberToDaiji,
  numberToKanji,
  prefectureCode,
  punctuationToComma,
  punctuationToTouten,
  removeRuby,
  removeSpacesBetweenJapanese,
  romajiToHiragana,
  rubyToHtml,
  shinjitaiToKyujitai,
  smallKanaToNormal,
  spaceBetweenJaEn,
  WAVE_DASH,
} from './jaConvert';

/** Where a command puts its result. */
export type JaOutput = 'new-tab' | 'replace' | 'notify' | 'select';

/** What a transform may use besides the text: made once per run by the handler. */
export interface JaContext {
  /** The line break of the document (`\n` or `\r\n`). */
  eol: string;
  /** The `value` of the quick pick item chosen before running (commands with `quickPick` only). */
  choice?: string;
}

/**
 * A transform of one selection. `budget` is what is left of MAX_OUTPUT_LENGTH; a longer result
 * throws `EncOutputTooLargeError`. An unreadable value throws `JaInputError`.
 */
export type JaTransform = (text: string, context: JaContext, budget: number) => string;

/**
 * A transform of all selections together (in document order) into one notification. A failure
 * names the selection (`selection 2 of 3: `) itself when there are several.
 */
export type JaCombine = (texts: readonly string[], context: JaContext) => string;

/** A range of a selection to select, as UTF-16 offsets into the selected text. */
export interface JaRange {
  start: number;
  end: number;
}

/**
 * Finds the ranges of one selection to select (in text order). It may stop once it has found more
 * than `limit` ranges (the caller refuses that many anyway).
 */
export type JaSelect = (text: string, limit: number) => JaRange[];

/** One choice of the quick pick shown before running. */
export interface JaQuickPickItem {
  label: string;
  description?: string;
  value: string;
}

/** A quick pick shown once before running (for all selections). */
export interface JaQuickPick {
  placeHolder: string;
  items: readonly JaQuickPickItem[];
}

export interface JaCommandEntry {
  /** ROADMAP ID, e.g. `JA-001`. */
  id: string;
  /** Command ID without the `selection-manipulator.` prefix. */
  name: string;
  /** Title in package.json / ROADMAP. */
  title: string;
  output: JaOutput;
  /** `new-tab` / `replace`: converts one selection. */
  transform?: JaTransform;
  /** `notify`: all selections into one message. */
  combine?: JaCombine;
  /** `select`: the ranges to select in one selection. */
  select?: JaSelect;
  /** `select`: the information message when nothing is found. */
  noMatchMessage?: string;
  /**
   * `new-tab`: the information message shown instead of an empty editor when the result of every
   * selection is empty (an extraction that found nothing).
   */
  emptyMessage?: string;
  /** Asked once before running; the chosen value is `context.choice`. */
  quickPick?: JaQuickPick;
}

/** A transform of the whole text (every character, line breaks kept). */
const text = (convert: (value: string) => string): JaTransform =>
  (value, _context, budget) => {
    assertJaInputLength(value);
    const result = convert(value);
    assertWithinBudget(result.length, budget);
    return result;
  };

/** A transform of one value per line (blank lines and the spaces around each value are kept). */
const lines = (convert: (value: string) => string): JaTransform =>
  (value, _context, budget) => mapJaLines(value, budget, convert);

const hepburn = text((value) => kanaToRomaji(value, 'hepburn'));
const romaji = text(romajiToHiragana);
const kanjiNumeral = lines(numberToKanji);
const arabicNumber = lines(kanjiToNumber);
const shinjitai = text(kyujitaiToShinjitai);
const jaEnSpace = text(spaceBetweenJaEn);

/** A transform of the whole text that also needs the context (the EOL or the chosen value). */
const withContext = (convert: (value: string, context: JaContext) => string): JaTransform =>
  (value, context, budget) => {
    assertJaInputLength(value);
    const result = convert(value, context);
    assertWithinBudget(result.length, budget);
    return result;
  };

/** The commands in the order of the JA table of docs/ROADMAP.md. */
export const JA_COMMAND_ENTRIES: readonly JaCommandEntry[] = [
  {
    id: 'JA-001', name: 'japanese.kana-to-romaji', title: 'Japanese - Kana to Romaji (Hepburn)', output: 'new-tab',
    transform: hepburn,
  },
  {
    id: 'JA-002', name: 'japanese.romaji-to-hiragana', title: 'Japanese - Romaji to Hiragana', output: 'new-tab',
    transform: romaji,
  },
  {
    id: 'JA-003', name: 'japanese.number-to-kanji', title: 'Japanese - Number to Kanji Numeral', output: 'new-tab',
    transform: kanjiNumeral,
  },
  {
    id: 'JA-004', name: 'japanese.kanji-to-number', title: 'Japanese - Kanji Numeral to Number', output: 'new-tab',
    transform: arabicNumber,
  },
  {
    id: 'JA-005', name: 'japanese.number-to-daiji', title: 'Japanese - Number to Daiji', output: 'new-tab',
    transform: lines(numberToDaiji),
  },
  {
    id: 'JA-006', name: 'japanese.punctuation-to-comma', title: 'Japanese - Punctuation to Comma and Period (，．)', output: 'replace',
    transform: text(punctuationToComma),
  },
  {
    id: 'JA-007', name: 'japanese.punctuation-to-touten', title: 'Japanese - Punctuation to Touten and Kuten (、。)', output: 'replace',
    transform: text(punctuationToTouten),
  },
  {
    id: 'JA-008', name: 'japanese.kyujitai-to-shinjitai', title: 'Japanese - Old Kanji to New (Kyujitai to Shinjitai)', output: 'new-tab',
    transform: shinjitai,
  },
  {
    id: 'JA-009', name: 'japanese.shinjitai-to-kyujitai', title: 'Japanese - New Kanji to Old (Shinjitai to Kyujitai)', output: 'new-tab',
    transform: text(shinjitaiToKyujitai),
  },
  {
    id: 'JA-010', name: 'japanese.small-kana-to-normal', title: 'Japanese - Small Kana to Normal', output: 'new-tab',
    transform: text(smallKanaToNormal),
  },
  {
    id: 'JA-011', name: 'japanese.manuscript-count', title: 'Japanese - Count Characters (Manuscript Paper)', output: 'notify',
    combine: (texts) => manuscriptCount(texts),
  },
  {
    id: 'JA-012', name: 'japanese.remove-ruby', title: 'Japanese - Remove Ruby Notation', output: 'replace',
    transform: text(removeRuby),
  },
  {
    id: 'JA-013', name: 'japanese.ruby-to-html', title: 'Japanese - Ruby Notation to HTML', output: 'new-tab',
    transform: text(rubyToHtml),
  },
  {
    id: 'JA-014', name: 'japanese.fullwidth-alnum-to-half', title: 'Japanese - Full-width Alphanumerics to Half (Keep Kana)', output: 'new-tab',
    transform: text(fullwidthAlnumToHalf),
  },
  {
    id: 'JA-015', name: 'japanese.ideographic-space-to-space', title: 'Japanese - Ideographic Space to Space', output: 'replace',
    transform: text(ideographicSpaceToSpace),
  },
  {
    id: 'JA-016', name: 'japanese.normalize-wave-dash', title: 'Japanese - Normalize Wave Dash', output: 'replace',
    quickPick: {
      placeHolder: 'Unify the wave dashes and full-width tildes to',
      items: [
        { label: `${WAVE_DASH} Wave Dash`, description: 'U+301C', value: WAVE_DASH },
        { label: `${FULLWIDTH_TILDE} Full-width Tilde`, description: 'U+FF5E', value: FULLWIDTH_TILDE },
      ],
    },
    transform: withContext((value, context) => normalizeWaveDash(value, context.choice)),
  },
  {
    id: 'JA-017', name: 'japanese.normalize-hyphens', title: 'Japanese - Normalize Hyphens and Long Vowel Marks', output: 'replace',
    transform: text(normalizeHyphens),
  },
  {
    id: 'JA-018', name: 'japanese.extract-kanji', title: 'Japanese - Extract Kanji', output: 'new-tab',
    emptyMessage: 'No kanji was found in the selection.',
    transform: text(extractKanji),
  },
  {
    id: 'JA-019', name: 'japanese.extract-katakana-words', title: 'Japanese - Extract Katakana Words', output: 'new-tab',
    emptyMessage: 'No katakana word was found in the selection.',
    transform: withContext((value, context) => extractKatakanaWords(value, context.eol)),
  },
  {
    id: 'JA-020', name: 'japanese.char-type-count', title: 'Japanese - Count by Character Type', output: 'notify',
    combine: (texts) => charTypeCount(texts),
  },
  {
    id: 'JA-021', name: 'japanese.circled-number-to-paren', title: 'Japanese - Circled Numbers to Parentheses', output: 'replace',
    transform: text(circledNumberToParen),
  },
  {
    id: 'JA-022', name: 'japanese.prefecture-code', title: 'Japanese - Prefecture Name to/from JIS Code', output: 'new-tab',
    transform: lines(prefectureCode),
  },
  {
    id: 'JA-023', name: 'japanese.postal-code-format', title: 'Japanese - Format Postal Code', output: 'replace',
    transform: lines(formatPostalCode),
  },
  {
    id: 'JA-024', name: 'japanese.hiragana-to-halfwidth-katakana', title: 'Japanese - Hiragana to Half-width Katakana', output: 'new-tab',
    transform: text(hiraganaToHalfwidthKatakana),
  },
  {
    id: 'JA-025', name: 'japanese.remove-spaces-between-japanese', title: 'Japanese - Remove Spaces Between Japanese Characters', output: 'replace',
    transform: text(removeSpacesBetweenJapanese),
  },
  {
    id: 'JA-026', name: 'japanese.space-between-ja-en', title: 'Japanese - Add Space Between Japanese and Alphanumerics', output: 'new-tab',
    transform: jaEnSpace,
  },
  {
    id: 'JA-027', name: 'japanese.compose-dakuten', title: 'Japanese - Compose Dakuten', output: 'replace',
    transform: text(composeDakuten),
  },
  {
    id: 'JA-028', name: 'japanese.kana-to-romaji-kunrei', title: 'Japanese - Kana to Romaji (Kunrei)', output: 'new-tab',
    transform: text((value) => kanaToRomaji(value, 'kunrei')),
  },
  {
    id: 'JA-029', name: 'japanese.detect-platform-dependent', title: 'Japanese - Detect Platform-dependent Characters', output: 'select',
    noMatchMessage: 'No platform-dependent character (outside JIS X 0208) was found in the selection.',
    select: findPlatformDependent,
  },
  {
    id: 'JA-030', name: 'japanese.kana-to-romaji.replace', title: 'Japanese - Kana to Romaji (Hepburn) (Replace)', output: 'replace',
    transform: hepburn,
  },
  {
    id: 'JA-031', name: 'japanese.romaji-to-hiragana.replace', title: 'Japanese - Romaji to Hiragana (Replace)', output: 'replace',
    transform: romaji,
  },
  {
    id: 'JA-032', name: 'japanese.number-to-kanji.replace', title: 'Japanese - Number to Kanji Numeral (Replace)', output: 'replace',
    transform: kanjiNumeral,
  },
  {
    id: 'JA-033', name: 'japanese.kanji-to-number.replace', title: 'Japanese - Kanji Numeral to Number (Replace)', output: 'replace',
    transform: arabicNumber,
  },
  {
    id: 'JA-034', name: 'japanese.kyujitai-to-shinjitai.replace', title: 'Japanese - Old Kanji to New (Kyujitai to Shinjitai) (Replace)', output: 'replace',
    transform: shinjitai,
  },
  {
    id: 'JA-035', name: 'japanese.space-between-ja-en.replace', title: 'Japanese - Add Space Between Japanese and Alphanumerics (Replace)', output: 'replace',
    transform: jaEnSpace,
  },
];

/** The base command of each derived (Replace) command, as in the `派生:` column of the ROADMAP. */
export const JA_DERIVED_FROM: Readonly<Record<string, string>> = {
  'JA-030': 'JA-001',
  'JA-031': 'JA-002',
  'JA-032': 'JA-003',
  'JA-033': 'JA-004',
  'JA-034': 'JA-008',
  'JA-035': 'JA-026',
};
