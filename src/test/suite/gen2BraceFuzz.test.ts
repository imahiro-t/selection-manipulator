import * as assert from 'assert';
import { EncOutputTooLargeError, MAX_OUTPUT_LENGTH } from '../../handler/encodeTransforms';
import { braceExpansion } from '../../handler/gen2Generate';
import { braceExpansion as legacyBraceExpansion } from './legacy/braceExpansionLegacy';

/**
 * SELEC-00124: the faster parser and estimator of the DATEX-016 brace expansion are compared with
 * the implementation they replaced (frozen in `legacy/braceExpansionLegacy.ts`): the same strings,
 * or the same error (class and message), for random selections, line breaks and budgets.
 */

/** mulberry32: a small seeded generator, so that a failure can be replayed from its seed. */
const mulberry32 = (seed: number) => {
  let state = seed >>> 0;
  return (): number => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
};

type Outcome = { value: string } | { error: string; message: string; length?: number };

const outcomeOf = (run: () => string): Outcome => {
  try {
    return { value: run() };
  } catch (error) {
    // The class (by its constructor, so that a GenLimitError is not taken for a GenInputError) and
    // the message; for a result over the budget also the length it reports, which is the estimate
    // of the whole result when it is refused before anything is built (with a budget of 0, every
    // estimate is compared).
    const constructorName = error instanceof Error ? error.constructor.name : typeof error;
    const outcome: Outcome = { error: constructorName, message: error instanceof Error ? error.message : String(error) };
    if (error instanceof EncOutputTooLargeError) {
      outcome.length = error.length;
    }
    return outcome;
  }
};

const LITERALS = '{},\\.0123456789abcxyzAZ-+x';
const FIXED_RANGES = [
  '{1..3}', '{01..10..3}', '{-3..3}', '{a..e}', '{1..1}', '{a..a}', '{3..1}', '{-02..1}', '{1..10..-4}', '{1..3..0}',
  '{a..z..0}', '{Z..a}', '{+3..-2}', '{-0..2}', '{007..9}', '{+05..1}', '{1..2..x}', '{1...3}', '{..}', '{1..}',
  '{1234567890123456..1}', '{123456789012345..123456789012347}', '{-999999999999999..-999999999999998}',
  '{1..999999999999999..999999999999999}', '{0..9999}', '{1..10000}', '{1..10001}', '{0..10000}',
];
const FIXED_PIECES = [
  '{1..100}{1..100}', '{1..100}{1..101}', '{a,b}{c,d}', '{,}', '{,a}', '{a}', '{}', '{{1..2}}', '\\{a,b\\}', '{a\\,b,c}',
  '\\\\{a,b}', 'a\\b{1..2}', '\\', '\\\\', '\\{', '\\}', '\\,', '{x', 'x}', '}{', '{a,{b,c}',
];

/** A random number end of a range: often short, sometimes signed, zero-padded or longer than 15 digits. */
const randomEnd = (random: () => number): string => {
  const sign = random() < 0.2 ? (random() < 0.5 ? '-' : '+') : '';
  const pad = random() < 0.2 ? '0'.repeat(1 + Math.floor(random() * 2)) : '';
  const digits = random() < 0.05 ? 14 + Math.floor(random() * 4) : 1 + Math.floor(random() * 3);
  let number = '';
  for (let i = 0; i < digits; i++) {
    number += String(Math.floor(random() * 10));
  }
  return `${sign}${pad}${number}`;
};

const randomRange = (random: () => number): string => {
  const pick = random();
  if (pick < 0.35) {
    return FIXED_RANGES[Math.floor(random() * FIXED_RANGES.length)];
  }
  const step = random() < 0.3 ? `..${random() < 0.2 ? '-' : ''}${Math.floor(random() * 5)}` : '';
  if (pick < 0.5) {
    const letters = 'aAbczZyY';
    return `{${letters[Math.floor(random() * letters.length)]}..${letters[Math.floor(random() * letters.length)]}${step}}`;
  }
  // Short ranges (at most a few dozen terms) keep the outputs small.
  const from = randomEnd(random);
  const to = random() < 0.7 ? String(Number(from.replace(/^\+/, '')) + Math.floor(random() * 7) - 3) : randomEnd(random);
  return `{${from}..${to}${step}}`;
};

/** A random piece of a line: literal characters, ranges, alternatives, `{…}` kept as text, escapes, unmatched braces. */
const randomPiece = (random: () => number, depth: number): string => {
  const pick = random();
  if (pick < 0.25 || depth > 12) {
    let text = '';
    const length = Math.floor(random() * 4);
    for (let i = 0; i < length; i++) {
      text += LITERALS[Math.floor(random() * LITERALS.length)];
    }
    return text;
  }
  if (pick < 0.45) {
    return randomRange(random);
  }
  if (pick < 0.65) {
    const options = 1 + Math.floor(random() * 4);
    const parts: string[] = [];
    for (let i = 0; i < options; i++) {
      parts.push(randomSequence(random, depth + 1, 3));
    }
    // One option only: `{a}` (kept as text, its inside still expanded).
    return `{${parts.join(',')}}`;
  }
  if (pick < 0.75) {
    return FIXED_PIECES[Math.floor(random() * FIXED_PIECES.length)];
  }
  if (pick < 0.8) {
    // Nesting around the limit (10 deep), with or without commas.
    const nesting = 8 + Math.floor(random() * 5);
    return random() < 0.5 ? `${'{x,'.repeat(nesting)}y${'}'.repeat(nesting)}` : `${'{'.repeat(nesting)}{1..2}${'}'.repeat(nesting)}`;
  }
  if (pick < 0.85) {
    // Many one-term pieces (folded into the text around them).
    return `x${'{1..1}'.repeat(Math.floor(random() * 6))}{a..a}`;
  }
  if (pick < 0.9) {
    // Escapes, also of characters that cannot be escaped, and a backslash before a brace or a comma.
    const escapes = ['\\{', '\\}', '\\,', '\\\\', '\\a', '\\\\\\{', '\\{1..2}', '{1..2\\}', '{a\\,b}', '{\\1..2}'];
    return escapes[Math.floor(random() * escapes.length)];
  }
  return random() < 0.5 ? '{' : '}';
};

const randomSequence = (random: () => number, depth: number, maxPieces: number): string => {
  const pieces = Math.floor(random() * (maxPieces + 1));
  let text = '';
  for (let i = 0; i < pieces; i++) {
    text += randomPiece(random, depth);
  }
  return text;
};

const LINE_BREAKS = ['\n', '\r\n', '\r'];

const randomSelection = (random: () => number): string => {
  const lines = 1 + Math.floor(random() * 3);
  let text = '';
  for (let i = 0; i < lines; i++) {
    if (i > 0) {
      text += LINE_BREAKS[Math.floor(random() * LINE_BREAKS.length)];
    }
    text += randomSequence(random, 0, 6);
  }
  return text;
};

/** Inputs at the limits of a line and of a selection, checked with every budget too. */
const EDGE_CASES = [
  '{1..100}{1..100}',
  'x\n{1..100}{1..101}',
  '{1..10000}',
  '{1..10001}',
  '{a..z..0}{1..999999999999999}',
  '{0,1,2,3,4,5,6,7,8,9}'.repeat(5),
  `{${'a,'.repeat(9_999)}a}`,
  `{${'a,'.repeat(10_000)}a}`,
  `{${'{1..5000},'.repeat(2)}x}`,
  Array.from({ length: 10 }, () => '{1..100}{1..100}').join('\n'),
  `${Array.from({ length: 10 }, () => '{1..100}{1..100}').join('\n')}\n{1,2}`,
  `${Array.from({ length: 10 }, () => '{1..100}{1..100}').join('\r\n')}\r\nplain`,
  `${'{x,'.repeat(10)}y${'}'.repeat(10)}`,
  `${'{x,'.repeat(11)}y${'}'.repeat(11)}`,
  `${'{'.repeat(11)}a${'}'.repeat(11)}`,
  `${'{'.repeat(10)}{1..10001}${'}'.repeat(10)}`,
  `{${'{a}'.repeat(1_000)}}`,
  `x{${'{1..1}'.repeat(1_000)},y}`,
  '{1..100}' + 'x{1..1}'.repeat(500),
  `{${'x{1..1}'.repeat(14)}${',x{1..1}'.repeat(999)}}`,
  '',
  '\n',
  '{,}\n{,{,}}x',
];

const budgetsFor = (text: string, eol: string, random: () => number): number[] => {
  // The exact length of the result (when there is one) and one less: the budget boundary.
  const full = outcomeOf(() => braceExpansion(text, eol, MAX_OUTPUT_LENGTH));
  const budgets = [MAX_OUTPUT_LENGTH, 0, Math.floor(random() * 64)];
  if ('value' in full) {
    budgets.push(full.value.length, Math.max(0, full.value.length - 1));
  }
  return budgets;
};

const compare = (text: string, eol: string, budget: number, context: string): void => {
  const expected = outcomeOf(() => legacyBraceExpansion(text, eol, budget));
  const actual = outcomeOf(() => braceExpansion(text, eol, budget));
  assert.deepStrictEqual(actual, expected, `${context}: ${JSON.stringify({ text: text.length > 300 ? `${text.slice(0, 300)}…` : text, eol, budget })}`);
};

/** The time of `run` in milliseconds. */
const timed = (run: () => void): number => {
  const started = performance.now();
  run();
  return performance.now() - started;
};

suite('DATEX-016 brace expansion: differential fuzzing against the former implementation (SELEC-00124)', () => {
  test('random selections expand to the same strings or fail with the same error and message', function () {
    this.timeout(60_000);
    const seeds = [0x5e1ec, 124, 2026];
    let compared = 0;
    for (const seed of seeds) {
      const random = mulberry32(seed);
      for (let n = 0; n < 1_500; n++) {
        const text = randomSelection(random);
        for (const eol of ['\n', '\r\n']) {
          for (const budget of budgetsFor(text, eol, random)) {
            compare(text, eol, budget, `seed ${seed}, input ${n}`);
            compared++;
          }
        }
      }
    }
    assert.ok(compared > 20_000, `${compared} comparisons`);
  });

  test('inputs at the limits of a line, of a selection, of the nesting and of the budget', function () {
    this.timeout(60_000);
    const random = mulberry32(7);
    EDGE_CASES.forEach((text, index) => {
      for (const eol of ['\n', '\r\n']) {
        for (const budget of budgetsFor(text, eol, random)) {
          compare(text, eol, budget, `edge case ${index}`);
        }
      }
    });
  });

  test('a large selection full of braces is parsed and measured at least 3 times faster than before', function () {
    this.timeout(60_000);
    // S1 of the benchmark (scripts/bench-brace-expansion.mjs): 10,000 alternatives of
    // `x{1..1}` × 14, 990,001 characters (near GEN_MAX_INPUT_LENGTH). With a budget of 0, only the
    // parsing and the estimate run: the result is refused before anything is expanded. The time is
    // compared with that of the former implementation on the same machine (a ratio, not a time,
    // so that a slower machine does not matter); the former one is about 1, never below 1/3.
    const text = `{${Array.from({ length: 10_000 }, () => 'x{1..1}'.repeat(14)).join(',')}}`;
    assert.strictEqual(text.length, 990_001);
    const run = (expand: typeof braceExpansion) => () => {
      assert.throws(() => expand(text, '\n', 0), EncOutputTooLargeError);
    };
    // Two warm-ups of each (compiled, as in an extension host that has run the command before),
    // then the two measured in turn, so that a slower moment affects both; the fastest of five
    // runs leaves out a pause of the garbage collector.
    for (let k = 0; k < 2; k++) {
      run(legacyBraceExpansion)();
      run(braceExpansion)();
    }
    const before: number[] = [];
    const after: number[] = [];
    for (let k = 0; k < 5; k++) {
      before.push(timed(run(legacyBraceExpansion)));
      after.push(timed(run(braceExpansion)));
    }
    const was = Math.min(...before);
    const now = Math.min(...after);
    const report = `now ${now.toFixed(1)} ms, before ${was.toFixed(1)} ms (ratio ${(now / was).toFixed(2)})`;
    console.log(`      S1 parsing and estimate: ${report}`);
    assert.ok(now * 3 <= was, `${report}: should be 3 times faster at least`);
    assert.ok(now < 500, report);
  });
});
