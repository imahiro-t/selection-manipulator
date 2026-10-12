/**
 * FROZEN COPY — for the differential fuzzing test (gen2BraceFuzz.test.ts) and the benchmark
 * (scripts/bench-brace-expansion.mjs) only. DO NOT CHANGE IT.
 *
 * This is the DATEX-016 brace expansion of `src/handler/gen2Generate.ts` as it was before SELEC-00124
 * (commit 6640e87), copied verbatim: the reference the faster parser and estimator are compared
 * with (same strings, same errors, same messages, same order of the checks). It shares the errors
 * and the output buffer of `genCommon`, so that the errors of both are the same classes. It is
 * not part of the extension (the bundle starts at `src/extension.ts`, and `src/**` is not packaged).
 */
import { forEachLine, formatCount, GenInputError, GenLimitError, GenOutputBuffer } from '../../../handler/genCommon';

// ---------------------------------------------------------------------------------------------
// Lines
// ---------------------------------------------------------------------------------------------

/** Prefixes the message of an input error with `line N: ` (a limit stays a limit). */
const atLine = (lineNumber: number, error: unknown): unknown => {
  if (error instanceof GenLimitError) {
    return new GenLimitError(`line ${lineNumber}: ${error.message}`);
  }
  if (error instanceof GenInputError) {
    return new GenInputError(`line ${lineNumber}: ${error.message}`);
  }
  return error;
};

// ---------------------------------------------------------------------------------------------
// DATEX-016 Brace Expansion
// ---------------------------------------------------------------------------------------------

/** DATEX-016: the deepest nesting of braces. */
export const BRACE_MAX_DEPTH = 10;
/** DATEX-016: the most strings one line expands to. */
export const BRACE_MAX_PER_LINE = 10_000;
/** DATEX-016: the most strings one selection expands to (all its lines). */
export const BRACE_MAX_PER_SELECTION = 100_000;
/** DATEX-016: the most terms of one range (`{1..10000}`). */
export const BRACE_MAX_RANGE_TERMS = 10_000;

/**
 * A piece of a parsed line: literal text, alternatives (`{a,b}`) or a range (`{1..3}`). A range is
 * lazy: it knows how many terms it has and makes the term `i` only when asked, so that nothing is
 * built for a line before the line has been counted. Exported (as a type) for the tests only.
 */
export type BraceNode =
  | { kind: 'text'; text: string }
  | { kind: 'alternatives'; options: BraceNode[][] }
  | { kind: 'range'; count: number; term: (i: number) => string };

type RangeNode = Extract<BraceNode, { kind: 'range' }>;

const NUMBER_RANGE = /^([-+]?\d{1,15})\.\.([-+]?\d{1,15})(?:\.\.([-+]?\d{1,15}))?$/;
const LETTER_RANGE = /^([A-Za-z])\.\.([A-Za-z])(?:\.\.([-+]?\d{1,15}))?$/;

/** The number of terms from `from` to `to` by `step` (> 0), refused over BRACE_MAX_RANGE_TERMS. */
const rangeTermCount = (from: number, to: number, step: number): number => {
  const terms = Math.floor(Math.abs(to - from) / step) + 1;
  if (terms > BRACE_MAX_RANGE_TERMS) {
    throw new GenLimitError(`a range has more than ${formatCount(BRACE_MAX_RANGE_TERMS)} terms`);
  }
  return terms;
};

/** A step of 0 counts as 1 (as in bash); the sign of the step is ignored (the direction comes from the ends). */
const stepOf = (text: string | undefined): number => {
  const step = text === undefined ? 1 : Math.abs(Number(text));
  return step === 0 ? 1 : step;
};

/**
 * `{1..3}`, `{01..10}` (zero-padded to the longer end), `{10..1..3}`, `{a..e}` as a lazy range (no
 * term is made here); `undefined` when the text is not a range.
 */
const parseRange = (content: string): RangeNode | undefined => {
  const number = NUMBER_RANGE.exec(content);
  if (number) {
    const from = Number(number[1]);
    const to = Number(number[2]);
    const step = stepOf(number[3]);
    const count = rangeTermCount(from, to, step);
    const padded = [number[1], number[2]].some((end) => /^[-+]?0\d/.test(end));
    const width = padded ? Math.max(number[1].replace('+', '').length, number[2].replace('+', '').length) : 0;
    const direction = to >= from ? 1 : -1;
    const term = (i: number): string => {
      const n = from + direction * i * step;
      const sign = n < 0 ? '-' : '';
      return `${sign}${String(Math.abs(n)).padStart(width - sign.length, '0')}`;
    };
    return { kind: 'range', count, term };
  }
  const letter = LETTER_RANGE.exec(content);
  if (letter) {
    const from = letter[1].charCodeAt(0);
    const to = letter[2].charCodeAt(0);
    const step = stepOf(letter[3]);
    const count = rangeTermCount(from, to, step);
    const direction = to >= from ? 1 : -1;
    return { kind: 'range', count, term: (i) => String.fromCharCode(from + direction * i * step) };
  }
  return undefined;
};

/** The braces of a line matched in one pass: the closing brace and the top-level commas of each opening brace. */
export interface BraceTable {
  /** Opening brace offset → its closing brace offset (unmatched braces are not in it). */
  close: Map<number, number>;
  /** Opening brace offset → the offsets of the commas directly inside it. */
  commas: Map<number, number[]>;
  /** Offsets of the characters escaped with a backslash (`\{`, `\}`, `\,`, `\\`). */
  escaped: Set<number>;
}

const ESCAPABLE = '{},\\';

/** Exported for the tests only (with `parseSequence`, to hand a parsed line to `emitSequence`). */
export const matchBraces = (line: string): BraceTable => {
  const close = new Map<number, number>();
  const commas = new Map<number, number[]>();
  const escaped = new Set<number>();
  const stack: number[] = [];
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '\\' && i + 1 < line.length && ESCAPABLE.includes(line[i + 1])) {
      escaped.add(i + 1);
      i++;
      continue;
    }
    if (ch === '{') {
      stack.push(i);
      commas.set(i, []);
    } else if (ch === '}' && stack.length > 0) {
      close.set(stack.pop()!, i);
    } else if (ch === ',' && stack.length > 0) {
      commas.get(stack[stack.length - 1])!.push(i);
    }
  }
  // A brace that is never closed is literal text; so are the commas recorded for it.
  return { close, commas, escaped };
};

/** Refuses a number of strings over BRACE_MAX_PER_LINE; returns it otherwise. */
const checkLineCount = (count: number): number => {
  if (count > BRACE_MAX_PER_LINE) {
    throw new GenLimitError(`the line expands to more than ${formatCount(BRACE_MAX_PER_LINE)} strings`);
  }
  return count;
};

/** Pieces of a line and the number of strings they expand to (at most BRACE_MAX_PER_LINE). */
export interface ParsedSequence {
  nodes: BraceNode[];
  count: number;
}

/**
 * Parses `line[from, to)` into pieces. A matched pair of braces with top-level commas is a list of
 * alternatives, one with a range inside is a range, anything else (`{a}`, `{}`, an unmatched brace)
 * is literal text whose inside is still parsed. `depth` is the nesting of the braces around.
 *
 * The strings are counted while parsing: a sequence multiplies the counts of its pieces and
 * alternatives add those of their options. Every count is 1 or more, so the count of any part is
 * not more than that of the whole line: parsing stops with GenLimitError as soon as one passes
 * BRACE_MAX_PER_LINE, and alternatives with more options than that are refused before any of them
 * is parsed. The work done before a refusal is therefore bounded by the limit, not by the input.
 * Exported for the tests only.
 */
export const parseSequence = (line: string, table: BraceTable, from: number, to: number, depth: number): ParsedSequence => {
  const nodes: BraceNode[] = [];
  let count = 1;
  let text = '';
  const flush = () => {
    if (text !== '') {
      nodes.push({ kind: 'text', text });
      text = '';
    }
  };
  let i = from;
  while (i < to) {
    const ch = line[i];
    if (ch === '\\' && table.escaped.has(i + 1)) {
      text += line[i + 1];
      i += 2;
      continue;
    }
    const end = ch === '{' && !table.escaped.has(i) ? table.close.get(i) : undefined;
    if (end === undefined || end >= to) {
      text += ch;
      i++;
      continue;
    }
    if (depth + 1 > BRACE_MAX_DEPTH) {
      throw new GenLimitError(`the braces are nested more than ${BRACE_MAX_DEPTH} deep`);
    }
    const commas = table.commas.get(i)!;
    if (commas.length > 0) {
      flush();
      // Every option expands to one string or more.
      checkLineCount(commas.length + 1);
      const options: BraceNode[][] = [];
      let optionsCount = 0;
      let start = i;
      for (const stop of [...commas, end]) {
        const option = parseSequence(line, table, start + 1, stop, depth + 1);
        options.push(option.nodes);
        optionsCount = checkLineCount(optionsCount + option.count);
        start = stop;
      }
      nodes.push({ kind: 'alternatives', options });
      count = checkLineCount(count * optionsCount);
    } else {
      const content = line.slice(i + 1, end);
      const range = content.includes('{') || content.includes('\\') ? undefined : parseRange(content);
      if (range !== undefined) {
        flush();
        nodes.push(range);
        count = checkLineCount(count * range.count);
      } else {
        // `{a}`: the braces stay; what is inside them is still expanded.
        text += '{';
        const inner = parseSequence(line, table, i + 1, end, depth + 1);
        // One by one (spreading a very long list into push() would overflow the call stack), the
        // literal text joined to the text around it.
        for (const node of inner.nodes) {
          if (node.kind === 'text') {
            text += node.text;
          } else {
            flush();
            nodes.push(node);
          }
        }
        count = checkLineCount(count * inner.count);
        text += '}';
      }
    }
    i = end + 1;
  }
  flush();
  return { nodes, count };
};

/** The number of strings and their total length (both saturated) of a sequence of pieces. */
interface Size {
  count: number;
  length: number;
}

/** Counts and lengths are computed saturated at this value (far above every limit). */
const SATURATED = 1e15;
const cap = (n: number): number => (n > SATURATED ? SATURATED : n);

const sizeOfNode = (node: BraceNode): Size => {
  switch (node.kind) {
    case 'text':
      return { count: 1, length: node.text.length };
    case 'range': {
      // Called only for a line already counted (at most BRACE_MAX_PER_LINE strings); each term is
      // made, measured and dropped, nothing is kept.
      let length = 0;
      for (let i = 0; i < node.count; i++) {
        length += node.term(i).length;
      }
      return { count: node.count, length };
    }
    default: {
      let count = 0;
      let length = 0;
      for (const option of node.options) {
        const size = sizeOfSequence(option);
        count = cap(count + size.count);
        length = cap(length + size.length);
      }
      return { count, length };
    }
  }
};

/** count = Π countᵢ; length = Σ lengthᵢ × Π_{j≠i} countⱼ (every string of a piece is combined with every string of the others). */
const sizeOfSequence = (nodes: readonly BraceNode[]): Size => {
  let count = 1;
  let length = 0;
  for (const node of nodes) {
    const size = sizeOfNode(node);
    length = cap(cap(length * size.count) + cap(size.length * count));
    count = cap(count * size.count);
  }
  return { count, length };
};

/**
 * Folds the pieces that expand to exactly one string (literal text, a range of one term, and
 * recursively the options of alternatives) into the text around them, so that only the pieces with
 * two strings or more are left between literal texts (at most log2(BRACE_MAX_PER_LINE) of them).
 * The texts next to each other are collected and joined once. An option made only of such pieces
 * becomes one text, an empty option (`{,a}`) no piece at all. The pieces are walked with a loop;
 * only the nesting of the alternatives recurses (bounded by BRACE_MAX_DEPTH).
 */
const foldSequence = (nodes: readonly BraceNode[]): BraceNode[] => {
  const folded: BraceNode[] = [];
  let texts: string[] = [];
  const flush = () => {
    if (texts.length > 0) {
      const text = texts.join('');
      if (text !== '') {
        folded.push({ kind: 'text', text });
      }
      texts = [];
    }
  };
  for (const node of nodes) {
    if (node.kind === 'text') {
      texts.push(node.text);
    } else if (node.kind === 'range' && node.count === 1) {
      // `term` is a pure function: making the only term here instead of while expanding changes nothing.
      texts.push(node.term(0));
    } else if (node.kind === 'range') {
      flush();
      folded.push(node);
    } else {
      // Alternatives have two options or more, so they always expand to two strings or more.
      flush();
      folded.push({ kind: 'alternatives', options: node.options.map((option) => foldSequence(option)) });
    }
  }
  flush();
  return folded;
};

/** The strings of one folded piece (at most BRACE_MAX_PER_LINE of them, no longer in all than the line). */
const piecesOf = (node: BraceNode): string[] => {
  switch (node.kind) {
    case 'text':
      return [node.text];
    case 'range':
      return Array.from({ length: node.count }, (_, i) => node.term(i));
    default: {
      const pieces: string[] = [];
      for (const option of node.options) {
        emitFolded(option, (piece) => pieces.push(piece));
      }
      return pieces;
    }
  }
};

/**
 * Emits the strings of folded pieces one by one in the order of the expansion, without building
 * the intermediate products: the strings of each piece are made once, and a mixed-radix counter
 * (one digit per piece, the last piece moving fastest) walks their combinations. Only the
 * prefixes of the current combination are kept (`prefixes[j]` is its first `j` strings
 * concatenated) and only those after the digit that moved are made again, so that the strings
 * share their prefixes as they did when the products were built (nothing is copied until the
 * result is joined). No piece at all (an empty option) emits one empty string.
 */
const emitFolded = (nodes: readonly BraceNode[], emit: (expanded: string) => void): void => {
  const pieces = nodes.map(piecesOf);
  const n = pieces.length;
  const digits = pieces.map(() => 0);
  const prefixes = [''];
  for (let j = 0; j < n; j++) {
    prefixes.push(prefixes[j] + pieces[j][0]);
  }
  for (;;) {
    emit(prefixes[n]);
    // Advances the counter: the last digit first, carrying into the one before it on a wrap.
    let k = n - 1;
    for (; k >= 0; k--) {
      digits[k]++;
      if (digits[k] < pieces[k].length) {
        break;
      }
      digits[k] = 0;
    }
    // Every digit wrapped (or there is none): every string has been emitted.
    if (k < 0) {
      return;
    }
    for (let j = k; j < n; j++) {
      prefixes[j + 1] = prefixes[j] + pieces[j][digits[j]];
    }
  }
};

/**
 * Emits the strings a parsed line (or part of one) expands to, one by one in the order of the
 * expansion: the pieces of one string are folded into the text around them first, then the
 * combinations of the others are walked (see `foldSequence` and `emitFolded`). Exported for the
 * tests only (they check that the strings come out one by one); it is not part of the command.
 */
export const emitSequence = (nodes: readonly BraceNode[], emit: (expanded: string) => void): void => {
  emitFolded(foldSequence(nodes), emit);
};

/**
 * DATEX-016: expands the braces of every line of the selection (`file{1..3}.txt` → 3 lines). The
 * strings of one line are joined with `eol`; the line breaks of the selection are kept. Every
 * line is parsed and counted before anything is expanded: more than BRACE_MAX_PER_LINE strings
 * for one line, BRACE_MAX_PER_SELECTION for the selection, or a longer result than the budget
 * stops everything. The strings of each line are then emitted one by one (`emitSequence`) and
 * joined once, without building the intermediate products of the expansion.
 */
export const braceExpansion = (text: string, eol: string, budget: number): string => {
  const parsed: { nodes: BraceNode[] | undefined; line: string; lineBreak: string; lineNumber: number }[] = [];
  let total = 0;
  let length = 0;
  forEachLine(text, (line, lineBreak, lineNumber) => {
    try {
      if (!line.includes('{')) {
        parsed.push({ nodes: undefined, line, lineBreak, lineNumber });
        total += 1;
        length += line.length + lineBreak.length;
        return;
      }
      // Refused while it is parsed as soon as the count passes BRACE_MAX_PER_LINE; measured only then.
      const { nodes } = parseSequence(line, matchBraces(line), 0, line.length, 0);
      const size = sizeOfSequence(nodes);
      parsed.push({ nodes, line, lineBreak, lineNumber });
      total += size.count;
      length = cap(length + size.length + (size.count - 1) * eol.length + lineBreak.length);
    } catch (error) {
      throw atLine(lineNumber, error);
    }
    if (total > BRACE_MAX_PER_SELECTION) {
      throw new GenLimitError(`the selection expands to more than ${formatCount(BRACE_MAX_PER_SELECTION)} strings`);
    }
  });
  const output = new GenOutputBuffer(budget);
  // The whole result is checked against the budget before it is built.
  output.reserve(length);
  for (const { nodes, line, lineBreak } of parsed) {
    if (nodes === undefined) {
      output.push(line);
    } else {
      // Only the strings of the line itself are kept (no intermediate product), then joined once.
      const strings: string[] = [];
      emitSequence(nodes, (expanded) => strings.push(expanded));
      output.push(strings.join(eol));
    }
    output.push(lineBreak);
  }
  return output.join();
};
