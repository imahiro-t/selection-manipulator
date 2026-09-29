/**
 * Worker thread script for the user's regular expressions: LINE-003 / LINE-004 / LINE-036
 * (Keep / Remove Lines Matching Regex) and MSEL-006 / MSEL-007 (Keep / Remove Selections Matching
 * Regex), mode `test`; SORT-010 (Sort Lines by regex capture), mode `capture`; MSEL-018 (Split
 * Selections by Regex), mode `split`.
 *
 * `test` posts back one boolean per line; `capture` posts back the sort key of every line (group
 * 1 when the pattern has a capture group, the whole match otherwise, `null` when the line does
 * not match or group 1 did not participate); `split` posts back the non-empty matches of every
 * line as `[start, end]` offsets, or `tooMany` as soon as there are more than `maxMatches`. It runs in a `worker_threads` Worker so that the
 * extension host can stop it with `worker.terminate()` when a catastrophic pattern (ReDoS)
 * takes too long.
 *
 * The pattern and the lines arrive as plain data (`workerData`) and are never evaluated as
 * code. This script imports nothing but `worker_threads` (no `vscode`, no file or network
 * access), and it is bundled with the extension as a fixed file (see `lineRegex.ts`).
 */
import { parentPort, workerData } from 'worker_threads';

export interface LineRegexWorkerData {
  pattern: string;
  lines: string[];
  /** Defaults to `test`. */
  mode?: 'test' | 'capture' | 'split';
  /** `split`: the most matches (in all lines together) before giving up with `tooMany`. */
  maxMatches?: number;
}

export type LineRegexWorkerResult =
  | { matches: boolean[] }
  | { keys: (string | null)[] }
  | { splits: [number, number][][] }
  | { tooMany: true }
  | { error: string };

const captureKey = (regex: RegExp, line: string): string | null => {
  const match = regex.exec(line);
  if (match === null) {
    return null;
  }
  return match.length > 1 ? match[1] ?? null : match[0];
};

/**
 * `split`: the non-empty matches of `pattern` (flags `gu`) in every line. After an empty match
 * `lastIndex` is moved on by one code point, so the loop always ends.
 */
const splitMatches = (pattern: string, lines: string[], maxMatches: number): LineRegexWorkerResult => {
  const regex = new RegExp(pattern, 'gu');
  const splits: [number, number][][] = [];
  let count = 0;
  for (const line of lines) {
    const found: [number, number][] = [];
    regex.lastIndex = 0;
    for (let match = regex.exec(line); match !== null; match = regex.exec(line)) {
      if (match[0].length === 0) {
        const code = line.codePointAt(match.index);
        regex.lastIndex = match.index + (code !== undefined && code > 0xffff ? 2 : 1);
        continue;
      }
      count++;
      if (count > maxMatches) {
        return { tooMany: true };
      }
      found.push([match.index, match.index + match[0].length]);
    }
    splits.push(found);
  }
  return { splits };
};

const run = (data: LineRegexWorkerData): LineRegexWorkerResult => {
  try {
    if (data.mode === 'split') {
      return splitMatches(data.pattern, data.lines, data.maxMatches ?? Number.MAX_SAFE_INTEGER);
    }
    // No `g` / `y` flag: `test` / `exec` then keep no `lastIndex` state between lines.
    const regex = new RegExp(data.pattern, 'u');
    if (data.mode === 'capture') {
      return { keys: data.lines.map((line) => captureKey(regex, line)) };
    }
    return { matches: data.lines.map((line) => regex.test(line)) };
  } catch (error) {
    return { error: error instanceof Error ? error.message : String(error) };
  }
};

parentPort?.postMessage(run(workerData as LineRegexWorkerData));
