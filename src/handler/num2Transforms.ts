/**
 * Pure (vscode-independent) command table of the NUMX-001..023 extended number commands (group
 * NUM2): significant figures, rounding to a multiple, clamping, Roman numerals, English number
 * words, fractions, multiplication, IEEE 754 bits, two's complement, gcd / lcm, prime factors,
 * consecutive differences, integer ranges and conversions of m / ft, m² / tsubo and degrees / radians.
 *
 * They run through the NUM command handler (numHandler.ts) with this table, so the selections,
 * the input boxes, the output limit, the notifications and the logging (never the selected text)
 * are those of the NUM commands. Only local processing: no network, files or processes, no
 * `eval` / `new Function`, no new dependency (`Math`, `BigInt` and `DataView` only).
 */
import {
  clamp,
  findClampProblem,
  fromEnglishWords,
  fromFraction,
  fromIeee754,
  fromRoman,
  multiplyBy,
  roundToMultiple,
  roundToSignificant,
  toIeee754,
  toRoman,
  toTwosComplement,
} from './num2Convert';
import { collapseRanges, differences, expandRanges, greatestCommonDivisor, leastCommonMultiple, primeFactors } from './num2Math';
import { formatB, mapLines, NumPromptRule } from './numCommon';
import { entry, numeric, NumCommandEntry, NumTransform, perLine, plain, statistic } from './numTransforms';

/** A transform of the whole selection (one result per selection). */
const whole = (convert: (text: string, budget: number) => string): NumTransform => (text, _inputs, budget) => convert(text, budget);

/** NUMX-014: every line of every selection shares the trial-division count of the run. */
const factorize: NumTransform = (text, _inputs, budget, run = { work: 0 }) =>
  mapLines(text, budget, (value) => primeFactors(value, run));

const anyNumber: NumPromptRule = { kind: 'number' };

/** The commands in the order of the showcase data (scripts/showcase-data/NUMX.json). */
export const NUM2_COMMAND_ENTRIES: readonly NumCommandEntry[] = [
  entry('NUMX-001', 'number.round-to-significant', 'Number - Round to Significant Figures', 'replace',
    perLine((value, inputs) => roundToSignificant(value, Number(inputs[0]))), [
      { prompt: 'Significant figures (1-21)', placeHolder: '3', rule: { kind: 'integer', min: 1, max: 21 } },
    ]),
  entry('NUMX-002', 'number.round-to-multiple', 'Number - Round to Nearest Multiple', 'replace',
    perLine((value, inputs) => roundToMultiple(value, Number(inputs[0]))), [
      { prompt: 'Round to the nearest multiple of (any number except 0)', placeHolder: '5', rule: { kind: 'number', nonZero: true } },
    ]),
  entry('NUMX-003', 'number.clamp', 'Number - Clamp to Range', 'replace',
    perLine((value, inputs) => clamp(value, Number(inputs[0]), Number(inputs[1]))), [
      { prompt: 'Minimum', placeHolder: '0', rule: anyNumber },
      { prompt: 'Maximum', placeHolder: '100', rule: anyNumber },
    ], (inputs) => findClampProblem(Number(inputs[0]), Number(inputs[1]))),
  entry('NUMX-004', 'number.to-roman', 'Number - To Roman Numeral', 'replace', plain(toRoman)),
  entry('NUMX-005', 'number.from-roman', 'Number - From Roman Numeral', 'replace', plain(fromRoman)),
  entry('NUMX-006', 'number.from-english-words', 'Number - From English Words', 'replace', plain(fromEnglishWords)),
  entry('NUMX-007', 'number.from-fraction', 'Number - Fraction to Decimal', 'replace', plain(fromFraction)),
  entry('NUMX-008', 'number.multiply-by-n', 'Number - Multiply by N', 'replace',
    perLine((value, inputs) => multiplyBy(value, Number(inputs[0]))), [
      { prompt: 'Multiply by', placeHolder: '1.1', rule: anyNumber },
    ]),
  entry('NUMX-009', 'number.to-ieee754', 'Number - To IEEE 754 Bits', 'replace',
    perLine((value, inputs) => toIeee754(value, Number(inputs[0]) as 64 | 32)), [
      { prompt: 'Bit width (64 = double, 32 = single)', placeHolder: '64', rule: { kind: 'choice', values: [64, 32] } },
    ]),
  entry('NUMX-010', 'number.from-ieee754', 'Number - From IEEE 754 Hex', 'replace', plain(fromIeee754)),
  entry('NUMX-011', 'number.to-twos-complement', 'Number - To Two\'s Complement Hex', 'replace',
    perLine((value, inputs) => toTwosComplement(value, Number(inputs[0]) as 8 | 16 | 32 | 64)), [
      { prompt: 'Bit width (8, 16, 32 or 64)', placeHolder: '32', rule: { kind: 'choice', values: [8, 16, 32, 64] } },
    ]),
  entry('NUMX-012', 'math.gcd', 'Math - Greatest Common Divisor', 'new-tab', statistic(greatestCommonDivisor)),
  entry('NUMX-013', 'math.lcm', 'Math - Least Common Multiple', 'new-tab', statistic(leastCommonMultiple)),
  entry('NUMX-014', 'math.prime-factors', 'Math - Prime Factorization', 'replace', factorize),
  entry('NUMX-015', 'math.diff-consecutive', 'Math - Differences Between Consecutive Numbers', 'replace', whole(differences)),
  entry('NUMX-016', 'math.collapse-ranges', 'Math - Collapse Integers to Ranges', 'replace', whole(collapseRanges)),
  entry('NUMX-017', 'math.expand-ranges', 'Math - Expand Ranges to Integers', 'replace', whole(expandRanges)),
  entry('NUMX-018', 'unit.m-to-ft', 'Unit: m to ft', 'replace', numeric((m) => m / 0.3048, formatB)),
  entry('NUMX-019', 'unit.ft-to-m', 'Unit: ft to m', 'replace', numeric((ft) => ft * 0.3048, formatB)),
  entry('NUMX-020', 'unit.sqm-to-tsubo', 'Unit: m² to Tsubo (坪)', 'replace', numeric((sqm) => sqm * 121 / 400, formatB)),
  entry('NUMX-021', 'unit.tsubo-to-sqm', 'Unit: Tsubo (坪) to m²', 'replace', numeric((tsubo) => tsubo * 400 / 121, formatB)),
  entry('NUMX-022', 'unit.deg-to-rad', 'Unit: Degrees to Radians', 'replace', numeric((deg) => deg * Math.PI / 180, formatB)),
  entry('NUMX-023', 'unit.rad-to-deg', 'Unit: Radians to Degrees', 'replace', numeric((rad) => rad * 180 / Math.PI, formatB)),
];
