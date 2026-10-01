/**
 * Pure (vscode-independent) conversions of the JAUNIX-001..007 Japanese text commands (group
 * JAUNI2): vertical text, gojuon rows, a search key, man / oku notation, the corporate number
 * check digit, dakuten decomposition and parenthesized readings to ruby notation.
 *
 * Security rules (SECURITY.md): only local processing; no regular expression is built at run time
 * (every expression below is a constant without nested quantifiers), every loop is linear in the
 * input, and the vertical text computes the size of its result before building it. The corporate
 * number check digit only detects typing mistakes: it is not cryptographic and nothing is looked
 * up anywhere.
 */
import { graphemes } from './uniCommon';
import {
  assertWithinBudget,
  forEachJaLine,
  isHiragana,
  isKanji,
  isKatakana,
  JaInputError,
  JaLimitError,
  quoteText,
} from './jaCommon';
import { formatVerdictMessage } from './hashTransforms';

/** Hiragana or katakana (full-width or half-width). */
const isKana = (ch: string): boolean => isHiragana(ch) || isKatakana(ch);

// ---------------------------------------------------------------------------------------------
// JAUNIX-001 Vertical text
// ---------------------------------------------------------------------------------------------

/** JAUNIX-001: the most lines (columns of the result) of one selection. */
export const VERTICAL_MAX_COLUMNS = 1_000;
/** JAUNIX-001: the most characters (graphemes) of one line (rows of the result). */
export const VERTICAL_MAX_ROWS = 1_000;
/** JAUNIX-001: what fills the end of a short column. */
export const VERTICAL_PAD = '　';

/**
 * JAUNIX-001: the characters that have a vertical presentation form (the long vowel mark, the
 * brackets, the comma and period, the ellipses) and a half-width space, which becomes an
 * ideographic space so that the columns stay aligned.
 */
export const VERTICAL_FORMS: ReadonlyMap<string, string> = new Map([
  ['ー', '｜'],
  ['（', '︵'], ['）', '︶'],
  ['｛', '︷'], ['｝', '︸'],
  ['〔', '︹'], ['〕', '︺'],
  ['【', '︻'], ['】', '︼'],
  ['《', '︽'], ['》', '︾'],
  ['〈', '︿'], ['〉', '﹀'],
  ['「', '﹁'], ['」', '﹂'],
  ['『', '﹃'], ['』', '﹄'],
  ['［', '﹇'], ['］', '﹈'],
  ['、', '︑'], ['。', '︒'],
  ['…', '︙'], ['‥', '︰'],
  [' ', VERTICAL_PAD],
]);

const verticalForm = (grapheme: string): string => VERTICAL_FORMS.get(grapheme) ?? grapheme;

/**
 * JAUNIX-001: every line becomes a column read from top to bottom, the first line on the right
 * (`あい⏎う` → `うあ⏎　い`). A short column is filled with ideographic spaces; a line break at the
 * end of the selection does not make an empty column. The rows are joined with `eol`.
 *
 * More than VERTICAL_MAX_COLUMNS lines or VERTICAL_MAX_ROWS characters in a line throws
 * `JaLimitError`; the length of the result is computed before it is built and counted against
 * `budget` (`EncOutputTooLargeError`). Only full-width characters line up: half-width letters and
 * emoji are as wide as the font makes them.
 */
export const verticalText = (text: string, eol: string, budget: number): string => {
  const lines: string[] = [];
  forEachJaLine(text, (line) => {
    lines.push(line);
  });
  if (lines.length > 1 && lines[lines.length - 1] === '') {
    lines.pop();
  }
  if (lines.length > VERTICAL_MAX_COLUMNS) {
    throw new JaLimitError(`the selection has more than ${VERTICAL_MAX_COLUMNS.toLocaleString('en-US')} lines`);
  }
  const columns: string[][] = [];
  let rows = 0;
  let cellsLength = 0;
  let cellCount = 0;
  lines.forEach((line, index) => {
    const column: string[] = [];
    for (const grapheme of graphemes(line)) {
      if (column.length === VERTICAL_MAX_ROWS) {
        throw new JaLimitError(`line ${index + 1} has more than ${VERTICAL_MAX_ROWS.toLocaleString('en-US')} characters`);
      }
      const form = verticalForm(grapheme);
      column.push(form);
      cellsLength += form.length;
    }
    cellCount += column.length;
    rows = Math.max(rows, column.length);
    columns.push(column);
  });
  // Every row holds one cell per column; the cells that are missing are padding.
  const length = cellsLength + (rows * columns.length - cellCount) * VERTICAL_PAD.length + Math.max(rows - 1, 0) * eol.length;
  assertWithinBudget(length, budget);
  const out: string[] = [];
  for (let row = 0; row < rows; row++) {
    let line = '';
    for (let column = columns.length - 1; column >= 0; column--) {
      line += columns[column][row] ?? VERTICAL_PAD;
    }
    out.push(line);
  }
  return out.join(eol);
};

// ---------------------------------------------------------------------------------------------
// JAUNIX-002 Gojuon row
// ---------------------------------------------------------------------------------------------

/** The hiragana of each row of the gojuon table (voiced, semi-voiced and small kana included). */
const GOJUON_ROWS: readonly (readonly [string, string])[] = [
  ['あ', 'あいうえおぁぃぅぇぉゔ'],
  ['か', 'かきくけこがぎぐげごゕゖ'],
  ['さ', 'さしすせそざじずぜぞ'],
  ['た', 'たちつてとだぢづでどっ'],
  ['な', 'なにぬねの'],
  ['は', 'はひふへほばびぶべぼぱぴぷぺぽ'],
  ['ま', 'まみむめも'],
  ['や', 'やゆよゃゅょ'],
  ['ら', 'らりるれろ'],
  ['わ', 'わゐゑをんゎ'],
];

const ROW_OF: ReadonlyMap<string, string> = new Map(
  GOJUON_ROWS.flatMap(([row, kana]) => [...kana].map((ch): [string, string] => [ch, row]))
);

/** ヷ ヸ ヹ ヺ (U+30F7..30FA) have no hiragana: they are the voiced わ ゐ ゑ を. */
const VOICED_WA: ReadonlyMap<number, string> = new Map([[0x30F7, 'わ'], [0x30F8, 'ゐ'], [0x30F9, 'ゑ'], [0x30FA, 'を']]);

/** One kana (full-width katakana, half-width katakana or hiragana) as hiragana, or `undefined`. */
const asHiragana = (ch: string): string | undefined => {
  const normalized = [...ch.normalize('NFKC')][0] ?? '';
  const code = normalized.codePointAt(0) ?? 0;
  if (code >= 0x30A1 && code <= 0x30F6) {
    return String.fromCharCode(code - 0x60);
  }
  return VOICED_WA.get(code) ?? normalized;
};

/**
 * JAUNIX-002: the gojuon row of the first kana of a line and a tab before the line
 * (`さとう` → `さ行\tさとう`, `\t` being a tab). Katakana and half-width katakana count like hiragana;
 * voiced, semi-voiced and small kana belong to the row of their plain kana (`が` → か行, `ぱ` → は行,
 * `ゃ` → や行, `ゔ` → あ行), and `ん` to わ行. A line that does not start with kana is an error.
 */
export const gojuonRow = (value: string): string => {
  const first = [...value][0];
  const row = first === undefined ? undefined : ROW_OF.get(asHiragana(first) ?? '');
  if (row === undefined) {
    throw new JaInputError(`${quoteText(value)} does not start with kana`);
  }
  return `${row}行\t${value}`;
};

// ---------------------------------------------------------------------------------------------
// JAUNIX-003 Normalize for search
// ---------------------------------------------------------------------------------------------

/**
 * The prolonged sound marks and the dashes and tildes used for them (after NFKC: `ｰ` is `ー`,
 * `－` is `-`, `～` is `~` and `‑` is `‐`).
 */
const LONG_VOWEL_LIKE: ReadonlySet<string> = new Set(['ー', '-', '‐', '‒', '–', '—', '―', '−', '〜', '~']);

/**
 * JAUNIX-003: one search key from the text: NFKC, katakana (U+30A1..30F6) to hiragana, lower case,
 * and the dashes and tildes right after kana (or after a mark already made `ー`) to `ー`
 * (`ｶﾞｲﾄﾞＡＢＣ` → `がいどabc`, `ラ－メン` → `らーめん`). The dashes are judged after NFKC, where the
 * full-width `－` / `～` have become the ASCII `-` / `~`, so an ASCII `-` or `~` right after kana
 * becomes `ー` as well (`コード-A1` → `こーどーa1`); this differs from Normalize Hyphens and Long
 * Vowel Marks (JA-017), which keeps the ASCII hyphen. A search key is only compared with keys
 * made the same way.
 */
export const normalizeForSearch = (text: string): string => {
  const out: string[] = [];
  let afterKana = false;
  for (const ch of text.normalize('NFKC')) {
    const code = ch.codePointAt(0)!;
    let next = code >= 0x30A1 && code <= 0x30F6 ? String.fromCharCode(code - 0x60) : ch.toLowerCase();
    if (afterKana && LONG_VOWEL_LIKE.has(next)) {
      next = 'ー';
    }
    out.push(next);
    afterKana = next === 'ー' ? afterKana : isKana(next);
  }
  return out.join('');
};

// ---------------------------------------------------------------------------------------------
// JAUNIX-004 Man / oku notation
// ---------------------------------------------------------------------------------------------

/** JAUNIX-004: the largest absolute value, 10^20 - 1 (as for Number to Kanji Numeral). */
export const MAN_OKU_MAX = 10n ** 20n - 1n;
const MAN_OKU_MAX_DIGITS = 20;
const LARGE_UNITS: readonly string[] = ['', '万', '億', '兆', '京'];

const SIGNED_INTEGER = /^([+\-−]?)([0-9]+|[0-9]{1,3}(?:,[0-9]{3})+)$/;

/** Full-width digits (U+FF10..FF19) and full-width `＋` `，` `－` (U+FF0B..FF0D) as ASCII. */
const toAsciiNumber = (value: string): string => {
  let out = '';
  for (const ch of value) {
    const code = ch.charCodeAt(0);
    const fullWidth = (code >= 0xFF10 && code <= 0xFF19) || (code >= 0xFF0B && code <= 0xFF0D);
    out += fullWidth ? String.fromCharCode(code - 0xFEE0) : ch;
  }
  return out;
};

/**
 * JAUNIX-004: an integer (ASCII or full-width digits, an optional sign, optional `,` every three
 * digits; the sign and the comma may be full-width too: `－１，２３４`) in units of 万 / 億 / 兆 / 京 (`123456789` → `1億2345万6789`, `100010000` → `1億1万`,
 * `0` → `0`). The digits are counted before the number is read; more than 10^20 - 1 is an error.
 */
export const manOkuNotation = (value: string): string => {
  const match = SIGNED_INTEGER.exec(toAsciiNumber(value));
  if (match === null) {
    throw new JaInputError(`${quoteText(value)} is not an integer`);
  }
  const digits = match[2].replace(/,/g, '').replace(/^0+(?=.)/, '');
  if (digits.length > MAN_OKU_MAX_DIGITS) {
    throw new JaInputError(`${quoteText(value)} is larger than ${MAN_OKU_MAX}`);
  }
  let rest = BigInt(digits);
  if (rest === 0n) {
    return '0';
  }
  const groups: number[] = [];
  while (rest > 0n) {
    groups.push(Number(rest % 10_000n));
    rest /= 10_000n;
  }
  let out = match[1] === '' || match[1] === '+' ? '' : '-';
  for (let k = groups.length - 1; k >= 0; k--) {
    if (groups[k] !== 0) {
      out += `${groups[k]}${LARGE_UNITS[k]}`;
    }
  }
  return out;
};

// ---------------------------------------------------------------------------------------------
// JAUNIX-005 Corporate number
// ---------------------------------------------------------------------------------------------

export type CorporateNumberResult =
  | { verdict: 'valid' }
  | { verdict: 'invalid' }
  | { verdict: 'not-a-corporate-number'; reason: 'invalid-character' | 'wrong-length' };

/** With more selections than this, the notification only gives the counts (as for IBAN). */
export const CORPORATE_NUMBER_LIST_LIMIT = 10;
const CORPORATE_NUMBER_DIGITS = 13;
/**
 * Whitespace and the hyphens written between the digit groups: `-`, full-width `－` (U+FF0D),
 * `‐` (U+2010), `‑` (U+2011) and `−` (U+2212).
 */
const CORPORATE_NUMBER_IGNORED: ReadonlySet<string> = new Set([
  ' ', '\t', '\r', '\n', '\u3000', '-', '\uFF0D', '\u2010', '\u2011', '\u2212',
]);

/**
 * JAUNIX-005: checks the check digit of a 13-digit Japanese corporate number (the first digit is
 * 9 - (Σ of the other digits × 1 or 2, alternating from the last digit with 1) mod 9).
 * Full-width digits count like ASCII digits; whitespace and hyphens (ASCII or full-width) are
 * ignored (`７－００００－１２０５－０００２`). This only detects typing mistakes; nothing is looked up.
 */
export const corporateNumberCheck = (text: string): CorporateNumberResult => {
  const digits: number[] = [];
  for (const ch of text) {
    if (CORPORATE_NUMBER_IGNORED.has(ch)) {
      continue;
    }
    const code = ch.charCodeAt(0);
    if (ch.length === 1 && code >= 0x30 && code <= 0x39) {
      digits.push(code - 0x30);
    } else if (code >= 0xFF10 && code <= 0xFF19) {
      digits.push(code - 0xFF10);
    } else {
      return { verdict: 'not-a-corporate-number', reason: 'invalid-character' };
    }
  }
  if (digits.length !== CORPORATE_NUMBER_DIGITS) {
    return { verdict: 'not-a-corporate-number', reason: 'wrong-length' };
  }
  let sum = 0;
  for (let n = 1; n < CORPORATE_NUMBER_DIGITS; n++) {
    // n = 1 is the last digit.
    sum += digits[CORPORATE_NUMBER_DIGITS - n] * (n % 2 === 1 ? 1 : 2);
  }
  return { verdict: 9 - (sum % 9) === digits[0] ? 'valid' : 'invalid' };
};

const CORPORATE_NUMBER_REASONS: Record<'invalid-character' | 'wrong-length', string> = {
  'invalid-character': 'only digits, spaces and hyphens are allowed',
  'wrong-length': `it must have ${CORPORATE_NUMBER_DIGITS} digits`,
};

const corporateWord = (result: CorporateNumberResult): string =>
  (result.verdict === 'not-a-corporate-number' ? 'not a corporate number' : result.verdict);

/**
 * The notification of JAUNIX-005 for the selections in document order. It never contains the
 * selected text: `Corporate number: valid` for one selection, `Corporate number: #1 valid, #2
 * invalid` for 2..10, `Corporate number: 12 selections: 5 valid, 4 invalid, 3 not a corporate
 * number` for more.
 */
export const corporateNumberMessage = (texts: readonly string[]): string =>
  formatVerdictMessage(texts.map(corporateNumberCheck), {
    label: 'Corporate number',
    listLimit: CORPORATE_NUMBER_LIST_LIMIT,
    single: (result) => (result.verdict === 'not-a-corporate-number'
      ? `Corporate number: not a corporate number (${CORPORATE_NUMBER_REASONS[result.reason]})`
      : `Corporate number: ${result.verdict}`),
    word: corporateWord,
    counts: [['valid', 'valid'], ['invalid', 'invalid'], ['not-a-corporate-number', 'not a corporate number']],
  });

// ---------------------------------------------------------------------------------------------
// JAUNIX-006 Decompose dakuten
// ---------------------------------------------------------------------------------------------

/** JAUNIX-006: the marks to write: combining (U+3099 / U+309A) or spacing (゛ U+309B / ゜ U+309C). */
export type DakutenStyle = 'combining' | 'spacing';

/** Combining voiced / semi-voiced sound mark → its spacing form (゛ / ゜). */
const SPACING_MARKS: ReadonlyMap<string, string> = new Map([
  ['\u3099', '\u309B'], // combining dakuten → ゛
  ['\u309A', '\u309C'], // combining handakuten → ゜
]);

/**
 * JAUNIX-006: the inverse of Compose Dakuten: every full-width kana with a voiced or semi-voiced
 * sound mark (`が`, `ぱ`, `ヴ`, `ヷ`, `ゞ`…) becomes its plain kana and the mark (`が` → `か゛` with
 * `spacing`, `か` + U+3099 with `combining`). Other characters are kept.
 */
export const decomposeDakuten = (text: string, style: DakutenStyle): string => {
  let out = '';
  for (const ch of text) {
    if (isKana(ch) && ch.codePointAt(0)! < 0xFF00) {
      const decomposed = ch.normalize('NFD');
      const mark = decomposed.length === 2 ? SPACING_MARKS.get(decomposed[1]) : undefined;
      if (mark !== undefined) {
        out += decomposed[0] + (style === 'spacing' ? mark : decomposed[1]);
        continue;
      }
    }
    out += ch;
  }
  return out;
};

// ---------------------------------------------------------------------------------------------
// JAUNIX-007 Parenthesized reading to ruby notation
// ---------------------------------------------------------------------------------------------

/** The marks that start the base of ruby notation. */
const RUBY_BASE_MARKS: ReadonlySet<string | undefined> = new Set(['｜', '|']);

/** `（` → `）`, `(` → `)`. */
const CLOSING: ReadonlyMap<string, string> = new Map([['（', '）'], ['(', ')']]);

/**
 * JAUNIX-007: a reading of only kana in parentheses right after a run of kanji becomes ruby
 * notation (`漢字（かんじ）` → `｜漢字《かんじ》`, also with `(…)`); the base is the whole run of
 * kanji before the parenthesis. A `｜` (or `|`) already before the base is kept as its start mark
 * (`｜漢字（かんじ）` → `｜漢字《かんじ》`). Everything else is kept. Each character is read at most twice.
 */
export const parenReadingToRuby = (text: string): string => {
  const chars = [...text];
  const out: string[] = [];
  let kanjiStart = -1;
  let i = 0;
  while (i < chars.length) {
    const ch = chars[i];
    const closing = CLOSING.get(ch);
    if (closing !== undefined && kanjiStart !== -1) {
      let j = i + 1;
      while (j < chars.length && isKana(chars[j])) {
        j++;
      }
      if (j > i + 1 && chars[j] === closing) {
        // The kanji of the base were written one by one: take them back. A `｜` (or `|`) already
        // right before the base is its start mark, so no second one is added.
        out.length -= i - kanjiStart;
        const mark = RUBY_BASE_MARKS.has(chars[kanjiStart - 1]) ? '' : '｜';
        out.push(`${mark}${chars.slice(kanjiStart, i).join('')}《${chars.slice(i + 1, j).join('')}》`);
        kanjiStart = -1;
        i = j + 1;
        continue;
      }
    }
    if (isKanji(ch)) {
      if (kanjiStart === -1) {
        kanjiStart = i;
      }
    } else {
      kanjiStart = -1;
    }
    out.push(ch);
    i++;
  }
  return out.join('');
};
