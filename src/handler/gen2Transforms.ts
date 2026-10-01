/**
 * Pure (vscode-independent) command table of the DATEX-016..020 and 022..024 generator and random
 * commands (group DATE2). They use the GEN command handler with this table, so the targets, the
 * prompts, the output limit, the notifications and the logging (never the selected text) are those
 * of the GEN commands; a value over a limit is a `GenLimitError`, shown as a warning (nothing is
 * changed). DATEX-021 (Cartesian Product of Selections) works on the selections and is in
 * gen2Cartesian.ts.
 *
 * Only local processing: no network, files or processes, no `eval` / `new Function`, no new
 * dependency. Random values come from `GenContext.random` only.
 */
import { formatCount } from './genCommon';
import { GenCommandEntry, GenContext, GenPrompt } from './genTransforms';
import {
  braceExpansion,
  fibonacci,
  FIBONACCI_MAX_TERMS,
  multiplicationTable,
  parseBoundedCount,
  parseStartTime,
  parseTableSize,
  primeSieve,
  primesUpTo,
  PRIMES_MAX,
  TIME_SEQUENCE_MAX_COUNT,
  TIME_SEQUENCE_MAX_INTERVAL,
  timeSequence,
} from './gen2Generate';
import {
  CHARSET_MAX_LENGTH,
  parseCharset,
  parsePassphraseSeparator,
  passphrase,
  PASSPHRASE_DEFAULT_WORDS,
  PASSPHRASE_MAX_SEPARATOR,
  PASSPHRASE_MAX_WORDS,
  PASSPHRASE_MIN_WORDS,
  shuffleWords,
  stringFromCharset,
} from './gen2Random';

const PRIMES_MIN = 2;

/**
 * The sieve of one run (DATEX-019), shared by all its targets: made for the first N, and made
 * once more (for PRIMES_MAX) only when a later target needs a larger one. Kept only as long as
 * the context of the run.
 */
const sieves = new WeakMap<GenContext, Uint8Array>();

const sieveFor = (context: GenContext, n: number): Uint8Array => {
  const cached = sieves.get(context);
  if (cached !== undefined && cached.length >= n + 1) {
    return cached;
  }
  const sieve = primeSieve(cached === undefined ? n : PRIMES_MAX);
  sieves.set(context, sieve);
  return sieve;
};

const integerPrompt = (prompt: string, min: number, max: number, value: string): GenPrompt => ({
  prompt: `${prompt} (${formatCount(min)} to ${formatCount(max)})`,
  placeHolder: value,
  value: () => value,
  rule: { kind: 'integer', min, max },
});

/** The 8 commands in the order of the DATEX commands of the showcase data (scripts/showcase-data/DATEX.json). */
export const GEN2_COMMAND_ENTRIES: readonly GenCommandEntry[] = [
  {
    id: 'DATEX-016', name: 'generate.brace-expansion', title: 'Generate - Brace Expansion', targets: 'lines', prompts: [],
    generate: (_index, text, _inputs, context, budget) => braceExpansion(text, context.eol, budget),
  },
  {
    id: 'DATEX-017', name: 'generate.multiplication-table', title: 'Generate - Multiplication Table', targets: 'text-or-prompt', prompts: [],
    emptyPrompts: [{
      prompt: 'Size of the table for the empty cursors: N or NxM (rows x columns, 1 to 100 each)',
      placeHolder: '9',
      value: () => '9',
      rule: { kind: 'parse', parse: (value) => parseTableSize(value) },
    }],
    generate: (_index, text, inputs, context, budget) =>
      multiplicationTable(parseTableSize(text === '' ? inputs[0] : text), context.eol, budget),
  },
  {
    id: 'DATEX-018', name: 'generate.fibonacci', title: 'Generate - Fibonacci Sequence', targets: 'text-or-prompt', prompts: [],
    emptyPrompts: [integerPrompt('Number of terms for the empty cursors', 1, FIBONACCI_MAX_TERMS, '10')],
    generate: (_index, text, inputs, context, budget) =>
      fibonacci(text === '' ? Number(inputs[0]) : parseBoundedCount(text, 1, FIBONACCI_MAX_TERMS, 'the number of terms'), context.eol, budget),
  },
  {
    id: 'DATEX-019', name: 'generate.primes', title: 'Generate - Prime Numbers', targets: 'text-or-prompt', prompts: [],
    emptyPrompts: [integerPrompt('Largest number N for the empty cursors: the primes up to N', PRIMES_MIN, PRIMES_MAX, '100')],
    generate: (_index, text, inputs, context, budget) => {
      const n = text === '' ? Number(inputs[0]) : parseBoundedCount(text, PRIMES_MIN, PRIMES_MAX, 'N');
      return primesUpTo(n, sieveFor(context, n), budget);
    },
  },
  {
    id: 'DATEX-020', name: 'generate.time-sequence', title: 'Generate - Time Sequence', targets: 'text-or-prompt',
    prompts: [
      integerPrompt('Interval in minutes', 1, TIME_SEQUENCE_MAX_INTERVAL, '30'),
      integerPrompt('Number of times', 1, TIME_SEQUENCE_MAX_COUNT, '3'),
    ],
    emptyPrompts: [{
      prompt: 'First time for the empty cursors (HH:MM or HH:MM:SS)',
      placeHolder: '09:00',
      value: () => '09:00',
      rule: { kind: 'parse', parse: (value) => parseStartTime(value) },
    }],
    generate: (_index, text, inputs, context, budget) =>
      timeSequence(parseStartTime(text === '' ? inputs[2] : text), Number(inputs[0]), Number(inputs[1]), context.eol, budget),
  },
  {
    id: 'DATEX-022', name: 'random.passphrase', title: 'Random - Passphrase',
    prompts: [
      integerPrompt('Number of words', PASSPHRASE_MIN_WORDS, PASSPHRASE_MAX_WORDS, String(PASSPHRASE_DEFAULT_WORDS)),
      {
        prompt: `Separator between the words (0 to ${PASSPHRASE_MAX_SEPARATOR} characters; spaces are kept)`,
        placeHolder: '-',
        value: () => '-',
        rule: { kind: 'parse', parse: (value) => parsePassphraseSeparator(value), keepSpaces: true },
      },
    ],
    generate: (_index, _text, inputs, context) => passphrase(context.random, Number(inputs[0]), parsePassphraseSeparator(inputs[1])),
  },
  {
    id: 'DATEX-023', name: 'random.string-custom-charset', title: 'Random - String from Custom Characters',
    prompts: [
      {
        prompt: 'Characters to use (repeats are ignored; spaces are kept)',
        placeHolder: 'ABC123',
        value: () => 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789',
        rule: { kind: 'parse', parse: (value) => parseCharset(value), keepSpaces: true },
      },
      integerPrompt('Length in characters', 1, CHARSET_MAX_LENGTH, '16'),
    ],
    generate: (_index, _text, inputs, context, budget) => stringFromCharset(context.random, parseCharset(inputs[0]), Number(inputs[1]), budget),
  },
  {
    id: 'DATEX-024', name: 'random.shuffle-words', title: 'Random - Shuffle Words', targets: 'lines', prompts: [],
    generate: (_index, text, _inputs, context, budget) => shuffleWords(context.random, text, budget),
  },
];
