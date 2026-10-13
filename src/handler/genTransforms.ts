/**
 * Pure (vscode-independent) command table of the GEN generator commands (ROADMAP GEN-001..030).
 *
 * Every command writes one generated text into each selection and cursor (in document order;
 * a selection is replaced, an empty cursor gets an insertion). An entry says which selections it
 * works on, what it asks before running and how it makes the text of the `index`-th target:
 * - `targets: 'all'` (the default): every selection and cursor, the selected text is not read;
 * - `targets: 'lines'`: only the non-empty, non-blank selections, whose text is the input
 *   (GEN-008 / 009); nothing to work on is a warning (nothing changes);
 * - `targets: 'text-or-prompt'`: every selection and cursor; a non-blank selection is the input,
 *   the empty ones use the answer of `emptyPrompts`, asked once and only when there is one (GEN-019).
 *
 * Only local processing: no network, files or processes, no `eval` / `new Function`, no new
 * dependency. Random values come from `GenContext.random` only.
 */
import {
  formatCount,
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
 * One run of a command, made by its entry's `prepare` from the answers: the answers are parsed
 * once, there, and kept in `precheck` / `generate`.
 */
export interface GenRun {
  /**
   * Checked on all targets before anything is generated (e.g. the number of targets of a
   * sequence); `count` is the number of targets.
   */
  precheck?: (count: number) => void;
  /**
   * Makes the text of one target. `index` is its position in document order (0 for the first),
   * `text` the selected text (only read for `lines` / `text-or-prompt`, and parsed here, as it
   * differs from target to target), `budget` what is left of MAX_OUTPUT_LENGTH.
   */
  generate: (index: number, text: string, budget: number) => string;
}

/**
 * Parses the answers once per run and returns the run. `inputs` are the answers of the quick pick
 * and the prompts in order (checked and trimmed by the handler), followed by those of
 * `emptyPrompts` when they were asked (only when a target is empty). Called once, after all the
 * answers are known and before anything is generated: an error thrown here is not one of a target.
 */
export type GenPrepare = (inputs: readonly string[], context: GenContext) => GenRun;

/**
 * `text-or-prompt`: the answer of an empty-target prompt parsed once, or `undefined` when it was
 * not asked (no target is empty).
 */
export const parseEmptyAnswer = <T>(answer: string | undefined, parse: (value: string) => T): T | undefined =>
  answer === undefined ? undefined : parse(answer);

/** `text-or-prompt`: the parsed answer an empty target uses (always asked when a target is empty). */
export const emptyAnswer = <T>(value: T | undefined): T => {
  if (value === undefined) {
    throw new Error('the answer for the empty targets was not asked');
  }
  return value;
};

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
   * The results are sorted (ascending, by UTF-16 code units) before they are written in document
   * order, so that time-ordered IDs of one run are ordered in the document too (GEN-001 / 002).
   */
  sortResults?: boolean;
  /** Parses the answers once and returns how the targets are checked and generated (see `GenRun`). */
  prepare: GenPrepare;
}

const bytesPrompt = (placeHolder: string): GenPrompt => ({
  prompt: `Number of random bytes (${GEN_MIN_BYTES} to ${formatCount(GEN_MAX_BYTES)})`,
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
    prepare: (_inputs, context) => ({ generate: () => uuidV7(context.random, context.now.getTime()) }),
  },
  {
    id: 'GEN-002', name: 'random.ulid', title: 'Random - ULID', prompts: [], sortResults: true,
    prepare: (_inputs, context) => ({ generate: () => ulid(context.random, context.now.getTime()) }),
  },
  {
    id: 'GEN-003', name: 'random.nanoid', title: 'Random - NanoID', prompts: [],
    prepare: (_inputs, context) => ({ generate: () => nanoid(context.random) }),
  },
  {
    id: 'GEN-004', name: 'random.hex', title: 'Random - Hex String', prompts: [bytesPrompt('16')],
    prepare: (inputs, context) => {
      const bytes = Number(inputs[0]);
      return { generate: () => randomHex(context.random, bytes) };
    },
  },
  {
    id: 'GEN-005', name: 'random.base64', title: 'Random - Base64 Token', prompts: [bytesPrompt('24')],
    prepare: (inputs, context) => {
      const bytes = Number(inputs[0]);
      return { generate: () => randomBase64Url(context.random, bytes) };
    },
  },
  {
    id: 'GEN-006', name: 'random.integer', title: 'Random - Integer in Range',
    prompts: [{
      prompt: 'Range of integers, both ends included (min..max, e.g. 1..100)',
      placeHolder: '1..100',
      value: () => '1..100',
      rule: { kind: 'parse', parse: (value) => parseIntegerRange(value) },
    }],
    prepare: (inputs, context) => {
      const range = parseIntegerRange(inputs[0]);
      return { generate: () => randomInteger(context.random, range) };
    },
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
    prepare: (inputs, context) => {
      const range = parseFloatRange(inputs[0], inputs[1]);
      return { generate: () => randomFloat(context.random, range) };
    },
  },
  {
    id: 'GEN-008', name: 'random.pick-line', title: 'Random - Pick One Line', targets: 'lines', prompts: [],
    prepare: (_inputs, context) => ({ generate: (_index, text) => pickLine(context.random, text) }),
  },
  {
    id: 'GEN-009', name: 'random.sample-lines', title: 'Random - Pick N Lines', targets: 'lines',
    prompts: [{
      prompt: `Number of lines to pick, without repeats (1 to ${formatCount(GEN_MAX_SAMPLE_LINES)})`,
      placeHolder: '2',
      value: () => '2',
      rule: { kind: 'integer', min: 1, max: GEN_MAX_SAMPLE_LINES },
    }],
    prepare: (inputs, context) => {
      const count = Number(inputs[0]);
      return { generate: (_index, text, budget) => sampleLines(context.random, text, count, context.eol, budget) };
    },
  },
  {
    id: 'GEN-010', name: 'random.mac', title: 'Random - MAC Address', prompts: [],
    prepare: (_inputs, context) => ({ generate: () => randomMac(context.random) }),
  },
  {
    id: 'GEN-011', name: 'random.color', title: 'Random - Hex Color', prompts: [],
    prepare: (_inputs, context) => ({ generate: () => randomColor(context.random) }),
  },
  {
    id: 'GEN-012', name: 'random.date', title: 'Random - Date in Range',
    prompts: [{
      prompt: 'Range of dates, both ends included (YYYY-MM-DD..YYYY-MM-DD)',
      placeHolder: '2026-01-01..2026-12-31',
      value: defaultDateRange,
      rule: { kind: 'parse', parse: (value) => parseDateRange(value) },
    }],
    prepare: (inputs, context) => {
      const range = parseDateRange(inputs[0]);
      return { generate: () => randomDate(context.random, range) };
    },
  },
  {
    id: 'GEN-013', name: 'random.email', title: 'Random - Dummy Email', prompts: [],
    prepare: (_inputs, context) => ({ generate: () => randomEmail(context.random) }),
  },
  {
    id: 'GEN-014', name: 'random.name', title: 'Random - Dummy Name', prompts: [],
    prepare: (_inputs, context) => ({ generate: () => randomName(context.random) }),
  },
  {
    id: 'GEN-015', name: 'random.name-ja', title: 'Random - Dummy Japanese Name', prompts: [],
    prepare: (_inputs, context) => ({ generate: () => randomNameJa(context.random) }),
  },
  {
    id: 'GEN-016', name: 'random.phone-jp', title: 'Random - Dummy Phone Number (JP)', prompts: [],
    prepare: (_inputs, context) => ({ generate: () => randomPhoneJp(context.random) }),
  },
  {
    id: 'GEN-017', name: 'random.text-ja', title: 'Random - Japanese Dummy Text',
    prompts: [{
      prompt: `Number of sentences (1 to ${formatCount(GEN_MAX_SENTENCES)})`,
      placeHolder: '3',
      value: () => '3',
      rule: { kind: 'integer', min: 1, max: GEN_MAX_SENTENCES },
    }],
    prepare: (inputs, context) => {
      const sentences = Number(inputs[0]);
      return { generate: (_index, _text, budget) => randomTextJa(context.random, sentences, budget) };
    },
  },
  {
    id: 'GEN-018', name: 'random.boolean', title: 'Random - Boolean', prompts: [],
    prepare: (_inputs, context) => ({ generate: () => randomBoolean(context.random) }),
  },
  {
    id: 'GEN-019', name: 'random.dice', title: 'Random - Dice Roll', targets: 'text-or-prompt', prompts: [], emptyPrompts: [DICE_PROMPT],
    // `text` is the selection, or '' for an empty (or blank) target, which uses the typed dice.
    prepare: (inputs, context) => {
      const dice = parseEmptyAnswer(inputs[0], (value) => parseDice(value));
      return { generate: (_index, text) => rollDice(context.random, text === '' ? emptyAnswer(dice) : parseDice(text, text)) };
    },
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
    prepare: () => ({ generate: (index) => alphaSequence(index) }),
  },
  {
    id: 'GEN-021', name: 'generate.roman-sequence', title: 'Generate - Roman Numeral Sequence', prompts: [],
    prepare: () => ({
      precheck: (count) => checkRomanCount(count),
      generate: (index) => romanSequence(index),
    }),
  },
  {
    id: 'GEN-022', name: 'generate.date-sequence', title: 'Generate - Date Sequence',
    prompts: [{
      prompt: 'First date (YYYY-MM-DD); the next cursors get the following days',
      placeHolder: 'YYYY-MM-DD',
      value: defaultStartDate,
      rule: { kind: 'parse', parse: (value) => parseStartDate(value) },
    }],
    prepare: (inputs) => {
      const start = parseStartDate(inputs[0]);
      return {
        precheck: (count) => checkDateSequence(start, count),
        generate: (index) => dateSequence(start, index),
      };
    },
  },
  {
    id: 'GEN-023', name: 'generate.number-range', title: 'Generate - Number Range',
    prompts: [{
      prompt: 'Range of integers: start..end or start..end step s (e.g. 1..10 step 3); one number per line',
      placeHolder: '1..10',
      value: () => '1..10',
      rule: { kind: 'parse', parse: (value) => parseNumberRange(value) },
    }],
    prepare: (inputs, context) => {
      const range = parseNumberRange(inputs[0]);
      return { generate: (_index, _text, budget) => numberRange(range, context.eol, budget) };
    },
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
        prompt: `Width in characters (1 to ${formatCount(GEN_MAX_REPEAT_WIDTH)})`,
        placeHolder: '80',
        value: () => '80',
        rule: { kind: 'integer', min: 1, max: GEN_MAX_REPEAT_WIDTH },
      },
    ],
    prepare: (inputs) => {
      const pattern = parseRepeatPattern(inputs[0]);
      const width = Number(inputs[1]);
      return { generate: () => repeatToWidth(pattern, width) };
    },
  },
  {
    id: 'GEN-025', name: 'generate.hex-sequence', title: 'Generate - Hex Sequence',
    prompts: [{
      prompt: 'First hexadecimal number (e.g. 0x0A, 0A or ff); the prefix, the width and the case are kept',
      placeHolder: '0x00',
      value: () => '0x00',
      rule: { kind: 'parse', parse: (value) => parseHexStart(value) },
    }],
    prepare: (inputs) => {
      const start = parseHexStart(inputs[0]);
      return {
        precheck: (count) => checkHexSequence(start, count),
        generate: (index) => hexSequence(start, index),
      };
    },
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
    prepare: (inputs) => {
      const order = inputs[0];
      return {
        precheck: (count) => checkKanaCount(order, count),
        generate: (index) => kanaSequence(order, index),
      };
    },
  },
  {
    id: 'GEN-027', name: 'generate.circled-sequence', title: 'Generate - Circled Number Sequence', prompts: [],
    prepare: () => ({
      precheck: (count) => checkCircledCount(count),
      generate: (index) => circledSequence(index),
    }),
  },
  {
    id: 'GEN-028', name: 'generate.column-ruler', title: 'Generate - Column Ruler',
    prompts: [{
      prompt: `Number of columns (1 to ${formatCount(GEN_MAX_RULER_WIDTH)})`,
      placeHolder: '80',
      value: () => '80',
      rule: { kind: 'integer', min: 1, max: GEN_MAX_RULER_WIDTH },
    }],
    prepare: (inputs, context) => {
      const columns = Number(inputs[0]);
      return { generate: () => columnRuler(columns, context.eol) };
    },
  },
  {
    id: 'GEN-029', name: 'generate.guid-braced', title: 'Generate - GUID (Braced Uppercase)', prompts: [],
    prepare: (_inputs, context) => ({ generate: () => bracedGuid(context.random) }),
  },
  {
    id: 'GEN-030', name: 'generate.ipv4-sequence', title: 'Generate - IPv4 Sequence',
    prompts: [{
      prompt: 'First IPv4 address; the next cursors get the following addresses',
      placeHolder: '192.0.2.1',
      value: () => '192.0.2.1',
      rule: { kind: 'parse', parse: (value) => parseIpv4(value) },
    }],
    prepare: (inputs) => {
      const start = parseIpv4(inputs[0]);
      return {
        precheck: (count) => checkIpv4Sequence(start, count),
        generate: (index) => ipv4Sequence(start, index),
      };
    },
  },
];

/** All GEN commands in ROADMAP order. */
export const GEN_COMMAND_ENTRIES: readonly GenCommandEntry[] = [...GEN_RANDOM_ENTRIES, ...GEN_SEQUENCE_ENTRIES];
