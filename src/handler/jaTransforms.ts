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
  kanaToRomaji,
  kanjiToNumber,
  kyujitaiToShinjitai,
  numberToDaiji,
  numberToKanji,
  punctuationToComma,
  punctuationToTouten,
  romajiToHiragana,
  shinjitaiToKyujitai,
  smallKanaToNormal,
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

/** Finds the ranges of one selection to select (in text order). */
export type JaSelect = (text: string) => JaRange[];

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
];

/** The base command of each derived (Replace) command, as in the `派生:` column of the ROADMAP. */
export const JA_DERIVED_FROM: Readonly<Record<string, string>> = {
  'JA-030': 'JA-001',
  'JA-031': 'JA-002',
  'JA-032': 'JA-003',
  'JA-033': 'JA-004',
  'JA-034': 'JA-008',
};
