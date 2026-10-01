/**
 * Pure (vscode-independent) part of the NUM-001..040 number commands: the command table and one
 * transform per command.
 *
 * - NUM-001..009 (statistics) read the number tokens of one selection and return one line, which
 *   the handler opens in a new editor. A selection without numbers throws `NumNoNumbersError`
 *   (except NUM-005, which counts 0).
 * - NUM-010..040 replace every line of the selection that holds one number (spaces around it and
 *   empty lines are kept). A line that is not a number throws `NumInputError` with its line number.
 *
 * Every transform takes the selected text, the values typed into the input boxes and the output
 * budget (what is left of MAX_OUTPUT_LENGTH), and throws `EncOutputTooLargeError` as soon as the
 * result would exceed the budget. Only local processing: no network, files or processes, no
 * `eval` / `new Function`, no new dependency (`Intl` and `BigInt` only).
 */
import {
  cleanNumber,
  extractNumbers,
  formatA,
  formatB,
  formatInteger,
  mapLines,
  NumInputError,
  NumNoNumbersError,
  NumOutputBuffer,
  NumPromptRule,
  parseBasicNumber,
  roundNumber,
} from './numCommon';
import {
  absolute,
  addSeparator,
  baseToDecimal,
  bytesToHuman,
  convertBase,
  decimalToBase,
  fromScientific,
  humanToBytes,
  negate,
  ordinalEn,
  removeSeparator,
  toFraction,
  toPercent,
  toWordsEn,
} from './numConvert';

/** Where a command puts its result. */
export type NumOutput = 'new-tab' | 'replace';

/** One question asked before running. */
export interface NumPrompt {
  prompt: string;
  placeHolder: string;
  rule: NumPromptRule;
}

/**
 * A transform of one selection. `inputs` are the answers to the prompts, in order, already
 * checked with `findNumPromptProblem` and trimmed by the caller (the handler), so a transform
 * uses them as they are.
 */
export type NumTransform = (text: string, inputs: readonly string[], budget: number, run?: NumRun) => string;

/**
 * State shared by every selection of one run of a command (created by the handler for each run):
 * `work` counts expensive steps (e.g. trial divisions) so that a limit applies to the run as a whole.
 */
export interface NumRun {
  work: number;
}

export interface NumCommandEntry {
  /** ROADMAP ID, e.g. `NUM-001`. */
  id: string;
  /** Command ID without the `selection-manipulator.` prefix. */
  name: string;
  /** Title in package.json / ROADMAP. */
  title: string;
  output: NumOutput;
  /** Questions asked once before running (answered for all selections). */
  prompts: readonly NumPrompt[];
  /**
   * Checks the answers together after every prompt was answered (e.g. minimum ≤ maximum); a
   * problem is shown as a warning and nothing is changed.
   */
  validateInputs?: (inputs: readonly string[]) => string | undefined;
  transform: NumTransform;
}

// ---------------------------------------------------------------------------------------------
// Statistics (NUM-001..009)
// ---------------------------------------------------------------------------------------------

/** The numbers of a selection; at least one (`NumNoNumbersError` otherwise). */
const numbersOf = (text: string): number[] => {
  const numbers = extractNumbers(text);
  if (numbers.length === 0) {
    throw new NumNoNumbersError();
  }
  return numbers;
};

const sorted = (numbers: readonly number[]): Float64Array => Float64Array.from(numbers).sort();

const sumOf = (numbers: readonly number[]): number => {
  let sum = 0;
  for (const n of numbers) {
    sum += n;
  }
  return sum;
};

/** The value at `p` percent of the sorted numbers, interpolated linearly (PERCENTILE.INC). */
const percentileOf = (values: Float64Array, p: number): number => {
  const rank = (p / 100) * (values.length - 1);
  const low = Math.floor(rank);
  const high = Math.min(low + 1, values.length - 1);
  return values[low] + (values[high] - values[low]) * (rank - low);
};

const medianOf = (values: Float64Array): number => percentileOf(values, 50);

/** The result of `deviations`. */
interface Deviations {
  /** Population variance / scale². */
  population: number;
  /** Sample variance / scale², or `undefined` for one number. */
  sample: number | undefined;
  scale: number;
}

/**
 * The population and sample variances, computed on the numbers divided by a power of two near
 * their largest magnitude. The division is exact, so the result is the same as without it, but the
 * squares cannot overflow while the result itself is finite (`1e155 -1e155` → σ = 1e155). The
 * variances are returned as `scaled × scale²` so that the standard deviation can take the square
 * root before scaling back (a variance beyond the range of a double is still out of range).
 *
 * The mean is corrected with a second pass over the residuals (corrected two-pass algorithm): the
 * rounding error of the first sum is added back as the mean of `x - mean`. For many copies of one
 * value the corrected mean is the value itself, so the variance is exactly 0 (`1e308` on 800,000
 * lines → σ = 0) instead of the square of the rounding error.
 */
const deviations = (numbers: readonly number[]): Deviations => {
  let largest = 0;
  for (const n of numbers) {
    largest = Math.max(largest, Math.abs(n));
  }
  // 2^1023 is the largest finite power of two (log2 of a value just below 2^1024 may round to 1024).
  const scale = largest === 0 ? 1 : 2 ** Math.min(1023, Math.floor(Math.log2(largest)));
  let sum = 0;
  for (const n of numbers) {
    sum += n / scale;
  }
  let mean = sum / numbers.length;
  let residuals = 0;
  for (const n of numbers) {
    residuals += n / scale - mean;
  }
  mean += residuals / numbers.length;
  let squares = 0;
  for (const n of numbers) {
    squares += (n / scale - mean) ** 2;
  }
  return {
    population: squares / numbers.length,
    sample: numbers.length > 1 ? squares / (numbers.length - 1) : undefined,
    scale,
  };
};

const NOT_AVAILABLE = 'n/a';

const standardDeviations = (numbers: readonly number[]): string => {
  const { population, sample, scale } = deviations(numbers);
  const s = sample === undefined ? NOT_AVAILABLE : formatB(Math.sqrt(sample) * scale);
  return `σ=${formatB(Math.sqrt(population) * scale)}, s=${s}`;
};

/** A statistics transform: one result line per selection. */
const statistic = (compute: (text: string, inputs: readonly string[]) => string): NumTransform => (text, inputs, budget) => {
  const output = new NumOutputBuffer(budget);
  output.push(compute(text, inputs));
  return output.join();
};

const median: NumTransform = statistic((text) => formatA(medianOf(sorted(numbersOf(text)))));

/** NUM-002: the result is counted against the budget number by number, never built in full first. */
const mode: NumTransform = (text, _inputs, budget) => {
  const numbers = numbersOf(text);
  const counts = new Map<number, number>();
  let most = 0;
  for (const n of numbers) {
    const count = (counts.get(n) ?? 0) + 1;
    counts.set(n, count);
    most = Math.max(most, count);
  }
  if (numbers.length > 1 && most === 1) {
    throw new NumInputError('every number appears once, so there is no mode');
  }
  const modes = [...counts].filter(([, count]) => count === most).map(([n]) => n).sort((a, b) => a - b);
  const output = new NumOutputBuffer(budget);
  modes.forEach((n, index) => {
    if (index > 0) {
      output.push(', ');
    }
    output.push(formatA(n));
  });
  return output.join();
};

const stddev: NumTransform = statistic((text) => standardDeviations(numbersOf(text)));

const variance: NumTransform = statistic((text) => {
  const { population, sample, scale } = deviations(numbersOf(text));
  const scaleBack = (scaled: number): string => formatB(scaled * scale * scale);
  return `${scaleBack(population)} / ${sample === undefined ? NOT_AVAILABLE : scaleBack(sample)}`;
});

const count: NumTransform = statistic((text) => String(extractNumbers(text).length));

const product: NumTransform = statistic((text) => {
  let result = 1;
  for (const n of numbersOf(text)) {
    result *= n;
  }
  return formatA(result);
});

const range: NumTransform = statistic((text) => {
  const values = sorted(numbersOf(text));
  return formatA(values[values.length - 1] - values[0]);
});

const percentile: NumTransform = statistic((text, inputs) =>
  formatA(percentileOf(sorted(numbersOf(text)), Number(inputs[0]))));

const summary: NumTransform = statistic((text) => {
  const numbers = numbersOf(text);
  const values = sorted(numbers);
  const sum = sumOf(numbers);
  return [
    `count=${numbers.length}`,
    `sum=${formatA(sum)}`,
    `mean=${formatB(sum / numbers.length)}`,
    `min=${formatA(values[0])}`,
    `max=${formatA(values[values.length - 1])}`,
    `median=${formatA(medianOf(values))}`,
    standardDeviations(numbers),
  ].join(', ');
});

// ---------------------------------------------------------------------------------------------
// Conversions line by line (NUM-010..040)
// ---------------------------------------------------------------------------------------------

/** A transform that converts each line on its own. */
export const perLine = (convert: (value: string, inputs: readonly string[]) => string): NumTransform => (text, inputs, budget) =>
  mapLines(text, budget, (value) => convert(value, inputs));

/** A conversion of the double value of a line (basic form) written with `format`. */
export const numeric = (compute: (n: number) => number, format: (n: number) => string = formatA): NumTransform =>
  perLine((value) => format(compute(parseBasicNumber(value))));

/** NUM-010: rule A on every running total (a safe integer total, e.g. of 16-digit integers, is kept exact). */
const cumulativeSum: NumTransform = (text, _inputs, budget) => {
  let sum = 0;
  return mapLines(text, budget, (value) => {
    sum += parseBasicNumber(value);
    return formatA(sum);
  });
};

const round = perLine((value, inputs) => {
  const result = roundNumber(parseBasicNumber(value), Number(inputs[0]));
  return String(result);
});

/** NUM-019: one formatter per selection, shared by every line (building one is expensive). */
const formatLocale: NumTransform = (text, inputs, budget) => {
  const formatter = new Intl.NumberFormat(inputs[0], { maximumFractionDigits: 20 });
  return mapLines(text, budget, (value) => formatter.format(parseBasicNumber(value)));
};

/** NUM-027: the floating-point error removed (rule A) before writing the exponent form. */
const toScientific = perLine((value) => cleanNumber(parseBasicNumber(value)).toExponential());

const plain = (convert: (value: string) => string): NumTransform => perLine((value) => convert(value));

const baseRule: NumPromptRule = { kind: 'integer', min: 2, max: 36 };

// ---------------------------------------------------------------------------------------------
// The command table, in ROADMAP order
// ---------------------------------------------------------------------------------------------

const entry = (id: string, name: string, title: string, output: NumOutput, transform: NumTransform, prompts: NumPrompt[] = []): NumCommandEntry =>
  ({ id, name, title, output, prompts, transform });

export const NUM_COMMAND_ENTRIES: readonly NumCommandEntry[] = [
  entry('NUM-001', 'math.median', 'Math - Median', 'new-tab', median),
  entry('NUM-002', 'math.mode', 'Math - Mode', 'new-tab', mode),
  entry('NUM-003', 'math.stddev', 'Math - Standard Deviation', 'new-tab', stddev),
  entry('NUM-004', 'math.variance', 'Math - Variance', 'new-tab', variance),
  entry('NUM-005', 'math.count', 'Math - Count Numbers', 'new-tab', count),
  entry('NUM-006', 'math.product', 'Math - Product', 'new-tab', product),
  entry('NUM-007', 'math.range', 'Math - Range', 'new-tab', range),
  entry('NUM-008', 'math.percentile', 'Math - Percentile', 'new-tab', percentile, [
    { prompt: 'Percentile (0-100)', placeHolder: '90', rule: { kind: 'number', min: 0, max: 100 } },
  ]),
  entry('NUM-009', 'math.summary', 'Math - Statistics Summary', 'new-tab', summary),
  entry('NUM-010', 'math.cumulative-sum', 'Math - Cumulative Sum', 'replace', cumulativeSum),
  entry('NUM-011', 'number.round', 'Number - Round', 'replace', round, [
    { prompt: 'Digits after the decimal point (0-15)', placeHolder: '2', rule: { kind: 'integer', min: 0, max: 15 } },
  ]),
  entry('NUM-012', 'number.floor', 'Number - Floor', 'replace', numeric(Math.floor, formatInteger)),
  entry('NUM-013', 'number.ceil', 'Number - Ceil', 'replace', numeric(Math.ceil, formatInteger)),
  entry('NUM-014', 'number.truncate', 'Number - Truncate', 'replace', numeric(Math.trunc, formatInteger)),
  entry('NUM-015', 'number.abs', 'Number - Absolute Value', 'replace', plain(absolute)),
  entry('NUM-016', 'number.negate', 'Number - Negate', 'replace', plain(negate)),
  entry('NUM-017', 'number.add-separator', 'Number - Add Thousands Separator', 'replace', plain(addSeparator)),
  entry('NUM-018', 'number.remove-separator', 'Number - Remove Thousands Separator', 'replace', plain(removeSeparator)),
  entry('NUM-019', 'number.format-locale', 'Number - Format by Locale', 'replace', formatLocale, [
    { prompt: 'Locale (BCP 47, e.g. en-US, de-DE, ja-JP)', placeHolder: 'de-DE', rule: { kind: 'locale' } },
  ]),
  entry('NUM-020', 'number.to-hex', 'Number - Decimal to Hex', 'replace', plain(decimalToBase(16))),
  entry('NUM-021', 'number.from-hex', 'Number - Hex to Decimal', 'replace', plain(baseToDecimal(16))),
  entry('NUM-022', 'number.to-binary', 'Number - Decimal to Binary', 'replace', plain(decimalToBase(2))),
  entry('NUM-023', 'number.from-binary', 'Number - Binary to Decimal', 'replace', plain(baseToDecimal(2))),
  entry('NUM-024', 'number.to-octal', 'Number - Decimal to Octal', 'replace', plain(decimalToBase(8))),
  entry('NUM-025', 'number.from-octal', 'Number - Octal to Decimal', 'replace', plain(baseToDecimal(8))),
  entry('NUM-026', 'number.convert-base', 'Number - Convert Base (2-36)', 'replace',
    perLine((value, inputs) => convertBase(Number(inputs[0]), Number(inputs[1]))(value)), [
      { prompt: 'Base of the selected numbers (2-36)', placeHolder: '16', rule: baseRule },
      { prompt: 'Base to convert to (2-36)', placeHolder: '10', rule: baseRule },
    ]),
  entry('NUM-027', 'number.to-scientific', 'Number - To Scientific Notation', 'replace', toScientific),
  entry('NUM-028', 'number.from-scientific', 'Number - From Scientific Notation', 'replace', plain(fromScientific)),
  entry('NUM-029', 'number.to-percent', 'Number - To Percent', 'replace', plain(toPercent)),
  entry('NUM-030', 'number.bytes-to-human', 'Number - Bytes to Human Readable', 'replace', plain(bytesToHuman)),
  entry('NUM-031', 'number.human-to-bytes', 'Number - Human Readable to Bytes', 'replace', plain(humanToBytes)),
  entry('NUM-032', 'number.to-words-en', 'Number - To English Words', 'replace', plain(toWordsEn)),
  entry('NUM-033', 'number.ordinal-en', 'Number - Add English Ordinal Suffix', 'replace', plain(ordinalEn)),
  entry('NUM-034', 'number.to-fraction', 'Number - Decimal to Fraction', 'replace', plain(toFraction)),
  entry('NUM-035', 'unit.celsius-to-fahrenheit', 'Unit: Celsius to Fahrenheit', 'replace', numeric((c) => c * 9 / 5 + 32, formatB)),
  entry('NUM-036', 'unit.fahrenheit-to-celsius', 'Unit: Fahrenheit to Celsius', 'replace', numeric((f) => (f - 32) * 5 / 9, formatB)),
  entry('NUM-037', 'unit.km-to-mile', 'Unit: km to mile', 'replace', numeric((km) => km / 1.609344, formatB)),
  entry('NUM-038', 'unit.mile-to-km', 'Unit: mile to km', 'replace', numeric((mile) => mile * 1.609344, formatB)),
  entry('NUM-039', 'unit.cm-to-inch', 'Unit: cm to inch', 'replace', numeric((cm) => cm / 2.54, formatB)),
  entry('NUM-040', 'unit.inch-to-cm', 'Unit: inch to cm', 'replace', numeric((inch) => inch * 2.54, formatB)),
];
