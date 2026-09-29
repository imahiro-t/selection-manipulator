/**
 * Pure (vscode-independent) command table of the UNI-001..030 Unicode commands.
 *
 * Every command has one of four outputs: a new editor, the selections replaced in place, a
 * notification (all selections together, `combine`) or new selections (`select`, optionally with
 * a notification of what was found).
 *
 * Only local processing: no network, files or processes, no `eval` / `new Function`, no new
 * dependency.
 */
import { assertUniInputLength, assertWithinBudget, UniTextRange } from './uniCommon';
import {
  countGraphemesMessage,
  extractEmoji,
  fromCodePoints,
  normalizeText,
  removeControl,
  removeEmoji,
  removeNonAscii,
  removeZeroWidth,
  revealInvisible,
  toCodePoints,
  toUtf16Units,
  toUtf8Bytes,
} from './uniConvert';

/** Where a command puts its result. */
export type UniOutput = 'new-tab' | 'replace' | 'notify' | 'select';

/** What a transform may use besides the text: made once per run by the handler. */
export interface UniContext {
  /** The line break of the document (`\n` or `\r\n`). */
  eol: string;
  /** The `value` of the quick pick item chosen before running (commands with `quickPick` only). */
  choice?: string;
}

/**
 * A transform of one selection. `budget` is what is left of MAX_OUTPUT_LENGTH; a longer result
 * throws `EncOutputTooLargeError`. An unreadable value throws `UniInputError`.
 */
export type UniTransform = (text: string, context: UniContext, budget: number) => string;

/** A transform of all selections together (in document order) into one notification. */
export type UniCombine = (texts: readonly string[], context: UniContext) => string;

/**
 * Finds the ranges of one selection to select (in text order). It may stop once it has found more
 * than `limit` ranges (the caller refuses that many anyway).
 */
export type UniSelect = (text: string, limit: number) => UniTextRange[];

/** One choice of the quick pick shown before running. */
export interface UniQuickPickItem {
  label: string;
  description?: string;
  value: string;
}

/** A quick pick shown once before running (for all selections). */
export interface UniQuickPick {
  placeHolder: string;
  items: readonly UniQuickPickItem[];
}

export interface UniCommandEntry {
  /** ROADMAP ID, e.g. `UNI-001`. */
  id: string;
  /** Command ID without the `selection-manipulator.` prefix. */
  name: string;
  /** Title in package.json / ROADMAP. */
  title: string;
  output: UniOutput;
  /** `new-tab` / `replace`: converts one selection. */
  transform?: UniTransform;
  /** `notify`: all selections into one message. */
  combine?: UniCombine;
  /** `select`: the ranges to select in one selection. */
  select?: UniSelect;
  /** `select`: the information message when nothing is found. */
  noMatchMessage?: string;
  /**
   * `select`: the information message shown after the ranges were selected, made from the
   * selected texts of all selections (in document order). No message when it is not set.
   */
  foundMessage?: (found: readonly string[]) => string;
  /**
   * `new-tab`: the information message shown instead of an empty editor when the result of every
   * selection is empty (an extraction that found nothing).
   */
  emptyMessage?: string;
  /** Asked once before running; the chosen value is `context.choice`. */
  quickPick?: UniQuickPick;
}

/**
 * A transform of the whole text with the context and the output budget. The input limit is
 * checked here, and the length of the result is counted against the budget.
 */
const withBudget = (convert: (value: string, context: UniContext, budget: number) => string): UniTransform =>
  (value, context, budget) => {
    assertUniInputLength(value);
    const result = convert(value, context, budget);
    assertWithinBudget(result.length, budget);
    return result;
  };

/** A transform of the whole text (line breaks kept). */
const text = (convert: (value: string) => string): UniTransform => withBudget((value) => convert(value));

/** The commands in the order of the UNI table of docs/ROADMAP.md. */
export const UNI_COMMAND_ENTRIES: readonly UniCommandEntry[] = [
  {
    id: 'UNI-001', name: 'unicode.normalize-nfc', title: 'Unicode - Normalize NFC', output: 'replace',
    transform: text((value) => normalizeText(value, 'NFC')),
  },
  {
    id: 'UNI-002', name: 'unicode.normalize-nfd', title: 'Unicode - Normalize NFD', output: 'replace',
    transform: text((value) => normalizeText(value, 'NFD')),
  },
  {
    id: 'UNI-003', name: 'unicode.normalize-nfkc', title: 'Unicode - Normalize NFKC', output: 'replace',
    transform: text((value) => normalizeText(value, 'NFKC')),
  },
  {
    id: 'UNI-004', name: 'unicode.normalize-nfkd', title: 'Unicode - Normalize NFKD', output: 'replace',
    transform: text((value) => normalizeText(value, 'NFKD')),
  },
  {
    id: 'UNI-005', name: 'unicode.remove-zero-width', title: 'Unicode - Remove Zero-width Characters', output: 'replace',
    transform: text(removeZeroWidth),
  },
  {
    id: 'UNI-006', name: 'unicode.reveal-invisible', title: 'Unicode - Reveal Invisible Characters', output: 'replace',
    transform: withBudget((value, _context, budget) => revealInvisible(value, budget)),
  },
  {
    id: 'UNI-007', name: 'unicode.to-codepoints', title: 'Unicode - Show Code Points', output: 'new-tab',
    transform: withBudget((value, _context, budget) => toCodePoints(value, budget)),
  },
  {
    id: 'UNI-008', name: 'unicode.from-codepoints', title: 'Unicode - Code Points to Text', output: 'replace',
    transform: text(fromCodePoints),
  },
  {
    id: 'UNI-009', name: 'unicode.to-utf8-bytes', title: 'Unicode - Show UTF-8 Bytes per Character', output: 'new-tab',
    transform: withBudget((value, context, budget) => toUtf8Bytes(value, context.eol, budget)),
  },
  {
    id: 'UNI-010', name: 'unicode.to-utf16-units', title: 'Unicode - Show UTF-16 Code Units', output: 'new-tab',
    transform: withBudget((value, context, budget) => toUtf16Units(value, context.eol, budget)),
  },
  {
    id: 'UNI-011', name: 'unicode.count-graphemes', title: 'Unicode - Count Graphemes', output: 'notify',
    combine: (texts) => countGraphemesMessage(texts),
  },
  {
    id: 'UNI-012', name: 'unicode.remove-control', title: 'Unicode - Remove Control Characters', output: 'replace',
    transform: text(removeControl),
  },
  {
    id: 'UNI-013', name: 'unicode.remove-non-ascii', title: 'Unicode - Remove Non-ASCII Characters', output: 'replace',
    transform: text(removeNonAscii),
  },
  {
    id: 'UNI-014', name: 'unicode.remove-emoji', title: 'Unicode - Remove Emoji', output: 'replace',
    transform: text(removeEmoji),
  },
  {
    id: 'UNI-015', name: 'unicode.extract-emoji', title: 'Unicode - Extract Emoji', output: 'new-tab',
    emptyMessage: 'No emoji was found in the selection.',
    transform: text(extractEmoji),
  },
];
