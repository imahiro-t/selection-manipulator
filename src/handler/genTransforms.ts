/**
 * Pure (vscode-independent) command table of the GEN generator commands (ROADMAP GEN-001..030).
 *
 * Every command writes one generated text into each selection and cursor (in document order;
 * a selection is replaced, an empty cursor gets an insertion). An entry says which selections it
 * works on, what it asks before running and how it makes the text of the `index`-th target:
 * - `targets: 'all'` (the default): every selection and cursor, the selected text is not read;
 * - `targets: 'lines'`: only the non-empty, non-blank selections, whose text is the input
 *   (GEN-008 / 009); nothing to work on is an error;
 * - `targets: 'text-or-prompt'`: every selection and cursor; a non-blank selection is the input,
 *   the empty ones use the answer of `emptyPrompts`, asked once and only when there is one (GEN-019).
 *
 * Only local processing: no network, files or processes, no `eval` / `new Function`, no new
 * dependency. Random values come from `GenContext.random` only.
 */
import {
  GEN_MAX_BYTES,
  GEN_MAX_REPEAT_PATTERN,
  GEN_MAX_REPEAT_WIDTH,
  GEN_MAX_RULER_WIDTH,
  GEN_MAX_SAMPLE_LINES,
  GEN_MAX_SENTENCES,
  GEN_MIN_BYTES,
  GenPromptRule,
  GenRandom,
} from './genCommon';
import {
  defaultDateRange,
  nanoid,
  parseDateRange,
  parseDice,
  parseFloatDigits,
  parseFloatRange,
  parseFloatRangeText,
  parseIntegerRange,
  pickLine,
  randomBase64Url,
  randomBoolean,
  randomColor,
  randomDate,
  randomEmail,
  randomFloat,
  randomHex,
  randomInteger,
  randomMac,
  randomName,
  randomNameJa,
  randomPhoneJp,
  randomTextJa,
  rollDice,
  sampleLines,
  ulid,
  uuidV7,
} from './genRandom';
import {
  alphaSequence,
  bracedGuid,
  checkCircledCount,
  checkDateSequence,
  checkHexSequence,
  checkIpv4Sequence,
  checkKanaCount,
  checkRomanCount,
  circledSequence,
  columnRuler,
  dateSequence,
  defaultStartDate,
  hexSequence,
  ipv4Sequence,
  kanaSequence,
  numberRange,
  parseHexStart,
  parseIpv4,
  parseNumberRange,
  parseRepeatPattern,
  parseStartDate,
  repeatToWidth,
  romanSequence,
} from './genSequence';

/** One question asked before running. */
export interface GenPrompt {
  prompt: string;
  placeHolder: string;
  /** The value the input box starts with (the default). */
  value: (now: Date) => string;
  rule: GenPromptRule;
}

/** One item of a quick pick asked before running; `value` becomes the first input. */
export interface GenPickItem {
  label: string;
  value: string;
}

/** A choice asked with a quick pick before the prompts (for commands that need one). */
export interface GenPick {
  placeHolder: string;
  items: readonly GenPickItem[];
}

/** What a generator may use besides the typed values: made once per run by the handler. */
export interface GenContext {
  random: GenRandom;
  /** The current time (fixed in tests). */
  now: Date;
  /** The line break of the document (`\n` or `\r\n`). */
  eol: string;
}

/** Which selections a command works on (see the comment at the top). */
export type GenTargets = 'all' | 'lines' | 'text-or-prompt';

/**
 * Makes the text of one target. `index` is its position in document order (0 for the first),
 * `text` the selected text (only read for `lines` / `text-or-prompt`), `inputs` the answers of
 * the quick pick and the prompts in order (checked and trimmed by the handler), `budget` what is
 * left of MAX_OUTPUT_LENGTH.
 */
export type GenGenerate = (index: number, text: string, inputs: readonly string[], context: GenContext, budget: number) => string;

export interface GenCommandEntry {
  /** ROADMAP ID, e.g. `GEN-001`. */
  id: string;
  /** Command ID without the `selection-manipulator.` prefix. */
  name: string;
  /** Title in package.json / ROADMAP. */
  title: string;
  targets?: GenTargets;
  /** Asked once before the prompts. */
  pick?: GenPick;
  /** Asked once before running (answered for all targets). */
  prompts: readonly GenPrompt[];
  /** `text-or-prompt`: asked once when a target has no text of its own. */
  emptyPrompts?: readonly GenPrompt[];
  /**
   * Checked on all targets before anything is generated (e.g. the number of targets of a
   * sequence); `count` is the number of targets.
   */
  precheck?: (count: number, inputs: readonly string[], context: GenContext) => void;
  /**
   * The results are sorted (ascending, by UTF-16 code units) before they are written in document
   * order, so that time-ordered IDs of one run are ordered in the document too (GEN-001 / 002).
   */
  sortResults?: boolean;
  generate: GenGenerate;
}

const bytesPrompt = (placeHolder: string): GenPrompt => ({
  prompt: `Number of random bytes (${GEN_MIN_BYTES} to ${GEN_MAX_BYTES.toLocaleString('en-US')})`,
  placeHolder,
  value: () => placeHolder,
  rule: { kind: 'integer', min: GEN_MIN_BYTES, max: GEN_MAX_BYTES },
});

const DICE_PROMPT: GenPrompt = {
  prompt: 'Dice to roll for the empty cursors: NdM (N dice with M sides, e.g. 2d6)',
  placeHolder: '1d6',
  value: () => '1d6',
  rule: { kind: 'parse', parse: (value) => parseDice(value) },
};

/** GEN-001..019 (random values). */
export const GEN_RANDOM_ENTRIES: readonly GenCommandEntry[] = [
  {
    id: 'GEN-001', name: 'random.uuid-v7', title: 'Random - UUID v7', prompts: [], sortResults: true,
    generate: (_index, _text, _inputs, context) => uuidV7(context.random, context.now.getTime()),
  },
  {
    id: 'GEN-002', name: 'random.ulid', title: 'Random - ULID', prompts: [], sortResults: true,
    generate: (_index, _text, _inputs, context) => ulid(context.random, context.now.getTime()),
  },
  {
    id: 'GEN-003', name: 'random.nanoid', title: 'Random - NanoID', prompts: [],
    generate: (_index, _text, _inputs, context) => nanoid(context.random),
  },
  {
    id: 'GEN-004', name: 'random.hex', title: 'Random - Hex String', prompts: [bytesPrompt('16')],
    generate: (_index, _text, inputs, context) => randomHex(context.random, Number(inputs[0])),
  },
  {
    id: 'GEN-005', name: 'random.base64', title: 'Random - Base64 Token', prompts: [bytesPrompt('24')],
    generate: (_index, _text, inputs, context) => randomBase64Url(context.random, Number(inputs[0])),
  },
  {
    id: 'GEN-006', name: 'random.integer', title: 'Random - Integer in Range',
    prompts: [{
      prompt: 'Range of integers, both ends included (min..max, e.g. 1..100)',
      placeHolder: '1..100',
      value: () => '1..100',
      rule: { kind: 'parse', parse: (value) => parseIntegerRange(value) },
    }],
    generate: (_index, _text, inputs, context) => randomInteger(context.random, parseIntegerRange(inputs[0])),
  },
  {
    id: 'GEN-007', name: 'random.float', title: 'Random - Float in Range',
    prompts: [
      {
        prompt: 'Range of numbers, both ends included (min..max, e.g. 0..1; absolute values up to 1,000,000,000)',
        placeHolder: '0..1',
        value: () => '0..1',
        rule: { kind: 'parse', parse: (value) => parseFloatRangeText(value) },
      },
      {
        prompt: 'Number of decimal places (0 to 10)',
        placeHolder: '3',
        value: () => '3',
        rule: {
          kind: 'parse',
          parse: (value, previous) => (previous.length > 0 ? parseFloatRange(previous[0], value) : parseFloatDigits(value)),
        },
      },
    ],
    generate: (_index, _text, inputs, context) => randomFloat(context.random, parseFloatRange(inputs[0], inputs[1])),
  },
  {
    id: 'GEN-008', name: 'random.pick-line', title: 'Random - Pick One Line', targets: 'lines', prompts: [],
    generate: (_index, text, _inputs, context) => pickLine(context.random, text),
  },
  {
    id: 'GEN-009', name: 'random.sample-lines', title: 'Random - Pick N Lines', targets: 'lines',
    prompts: [{
      prompt: `Number of lines to pick, without repeats (1 to ${GEN_MAX_SAMPLE_LINES.toLocaleString('en-US')})`,
      placeHolder: '2',
      value: () => '2',
      rule: { kind: 'integer', min: 1, max: GEN_MAX_SAMPLE_LINES },
    }],
    generate: (_index, text, inputs, context, budget) => sampleLines(context.random, text, Number(inputs[0]), context.eol, budget),
  },
  {
    id: 'GEN-010', name: 'random.mac', title: 'Random - MAC Address', prompts: [],
    generate: (_index, _text, _inputs, context) => randomMac(context.random),
  },
  {
    id: 'GEN-011', name: 'random.color', title: 'Random - Hex Color', prompts: [],
    generate: (_index, _text, _inputs, context) => randomColor(context.random),
  },
  {
    id: 'GEN-012', name: 'random.date', title: 'Random - Date in Range',
    prompts: [{
      prompt: 'Range of dates, both ends included (YYYY-MM-DD..YYYY-MM-DD)',
      placeHolder: '2026-01-01..2026-12-31',
      value: defaultDateRange,
      rule: { kind: 'parse', parse: (value) => parseDateRange(value) },
    }],
    generate: (_index, _text, inputs, context) => randomDate(context.random, parseDateRange(inputs[0])),
  },
  {
    id: 'GEN-013', name: 'random.email', title: 'Random - Dummy Email', prompts: [],
    generate: (_index, _text, _inputs, context) => randomEmail(context.random),
  },
  {
    id: 'GEN-014', name: 'random.name', title: 'Random - Dummy Name', prompts: [],
    generate: (_index, _text, _inputs, context) => randomName(context.random),
  },
  {
    id: 'GEN-015', name: 'random.name-ja', title: 'Random - Dummy Japanese Name', prompts: [],
    generate: (_index, _text, _inputs, context) => randomNameJa(context.random),
  },
  {
    id: 'GEN-016', name: 'random.phone-jp', title: 'Random - Dummy Phone Number (JP)', prompts: [],
    generate: (_index, _text, _inputs, context) => randomPhoneJp(context.random),
  },
  {
    id: 'GEN-017', name: 'random.text-ja', title: 'Random - Japanese Dummy Text',
    prompts: [{
      prompt: `Number of sentences (1 to ${GEN_MAX_SENTENCES.toLocaleString('en-US')})`,
      placeHolder: '3',
      value: () => '3',
      rule: { kind: 'integer', min: 1, max: GEN_MAX_SENTENCES },
    }],
    generate: (_index, _text, inputs, context, budget) => randomTextJa(context.random, Number(inputs[0]), budget),
  },
  {
    id: 'GEN-018', name: 'random.boolean', title: 'Random - Boolean', prompts: [],
    generate: (_index, _text, _inputs, context) => randomBoolean(context.random),
  },
  {
    id: 'GEN-019', name: 'random.dice', title: 'Random - Dice Roll', targets: 'text-or-prompt', prompts: [], emptyPrompts: [DICE_PROMPT],
    // `text` is the selection, or '' for an empty (or blank) target, which uses the typed dice.
    generate: (_index, text, inputs, context) =>
      rollDice(context.random, text === '' ? parseDice(inputs[0]) : parseDice(text, text)),
  },
];

/**
 * GEN-020..030 (sequences and generators). A sequence gives the `index`-th target (in document
 * order) its `index`-th value; `precheck` refuses more targets than the sequence has values
 * before anything is generated.
 */
export const GEN_SEQUENCE_ENTRIES: readonly GenCommandEntry[] = [
  {
    id: 'GEN-020', name: 'generate.alpha-sequence', title: 'Generate - Alphabet Sequence', prompts: [],
    generate: (index) => alphaSequence(index),
  },
  {
    id: 'GEN-021', name: 'generate.roman-sequence', title: 'Generate - Roman Numeral Sequence', prompts: [],
    precheck: (count) => checkRomanCount(count),
    generate: (index) => romanSequence(index),
  },
  {
    id: 'GEN-022', name: 'generate.date-sequence', title: 'Generate - Date Sequence',
    prompts: [{
      prompt: 'First date (YYYY-MM-DD); the next cursors get the following days',
      placeHolder: 'YYYY-MM-DD',
      value: defaultStartDate,
      rule: { kind: 'parse', parse: (value) => parseStartDate(value) },
    }],
    precheck: (count, inputs) => checkDateSequence(parseStartDate(inputs[0]), count),
    generate: (index, _text, inputs) => dateSequence(parseStartDate(inputs[0]), index),
  },
  {
    id: 'GEN-023', name: 'generate.number-range', title: 'Generate - Number Range',
    prompts: [{
      prompt: 'Range of integers: start..end or start..end step s (e.g. 1..10 step 3); one number per line',
      placeHolder: '1..10',
      value: () => '1..10',
      rule: { kind: 'parse', parse: (value) => parseNumberRange(value) },
    }],
    generate: (_index, _text, inputs, context, budget) => numberRange(parseNumberRange(inputs[0]), context.eol, budget),
  },
  {
    id: 'GEN-024', name: 'generate.repeat-char', title: 'Generate - Repeat Character to Width',
    prompts: [
      {
        prompt: `Character(s) to repeat (1 to ${GEN_MAX_REPEAT_PATTERN} characters; spaces are kept)`,
        placeHolder: '=',
        value: () => '=',
        rule: { kind: 'parse', parse: (value) => parseRepeatPattern(value), keepSpaces: true },
      },
      {
        prompt: `Width in characters (1 to ${GEN_MAX_REPEAT_WIDTH.toLocaleString('en-US')})`,
        placeHolder: '80',
        value: () => '80',
        rule: { kind: 'integer', min: 1, max: GEN_MAX_REPEAT_WIDTH },
      },
    ],
    generate: (_index, _text, inputs) => repeatToWidth(parseRepeatPattern(inputs[0]), Number(inputs[1])),
  },
  {
    id: 'GEN-025', name: 'generate.hex-sequence', title: 'Generate - Hex Sequence',
    prompts: [{
      prompt: 'First hexadecimal number (e.g. 0x0A, 0A or ff); the prefix, the width and the case are kept',
      placeHolder: '0x00',
      value: () => '0x00',
      rule: { kind: 'parse', parse: (value) => parseHexStart(value) },
    }],
    precheck: (count, inputs) => checkHexSequence(parseHexStart(inputs[0]), count),
    generate: (index, _text, inputs) => hexSequence(parseHexStart(inputs[0]), index),
  },
  {
    id: 'GEN-026', name: 'generate.kana-sequence', title: 'Generate - Kana Sequence',
    pick: {
      placeHolder: 'Order of the kana',
      items: [
        { label: 'Gojūon (あ, い, う, … ん: 46 kana)', value: 'gojuon' },
        { label: 'Iroha (イ, ロ, ハ, … ス: 47 kana)', value: 'iroha' },
      ],
    },
    prompts: [],
    precheck: (count, inputs) => checkKanaCount(inputs[0], count),
    generate: (index, _text, inputs) => kanaSequence(inputs[0], index),
  },
  {
    id: 'GEN-027', name: 'generate.circled-sequence', title: 'Generate - Circled Number Sequence', prompts: [],
    precheck: (count) => checkCircledCount(count),
    generate: (index) => circledSequence(index),
  },
  {
    id: 'GEN-028', name: 'generate.column-ruler', title: 'Generate - Column Ruler',
    prompts: [{
      prompt: `Number of columns (1 to ${GEN_MAX_RULER_WIDTH.toLocaleString('en-US')})`,
      placeHolder: '80',
      value: () => '80',
      rule: { kind: 'integer', min: 1, max: GEN_MAX_RULER_WIDTH },
    }],
    generate: (_index, _text, inputs, context) => columnRuler(Number(inputs[0]), context.eol),
  },
  {
    id: 'GEN-029', name: 'generate.guid-braced', title: 'Generate - GUID (Braced Uppercase)', prompts: [],
    generate: (_index, _text, _inputs, context) => bracedGuid(context.random),
  },
  {
    id: 'GEN-030', name: 'generate.ipv4-sequence', title: 'Generate - IPv4 Sequence',
    prompts: [{
      prompt: 'First IPv4 address; the next cursors get the following addresses',
      placeHolder: '192.0.2.1',
      value: () => '192.0.2.1',
      rule: { kind: 'parse', parse: (value) => parseIpv4(value) },
    }],
    precheck: (count, inputs) => checkIpv4Sequence(parseIpv4(inputs[0]), count),
    generate: (index, _text, inputs) => ipv4Sequence(parseIpv4(inputs[0]), index),
  },
];

/** All GEN commands in ROADMAP order. */
export const GEN_COMMAND_ENTRIES: readonly GenCommandEntry[] = [...GEN_RANDOM_ENTRIES, ...GEN_SEQUENCE_ENTRIES];
