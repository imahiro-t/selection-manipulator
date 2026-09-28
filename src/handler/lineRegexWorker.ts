/**
 * Worker thread script for the user's regular expressions: LINE-003 / LINE-004 / LINE-036
 * (Keep / Remove Lines Matching Regex, mode `test`) and SORT-010 (Sort Lines by regex capture,
 * mode `capture`).
 *
 * `test` posts back one boolean per line; `capture` posts back the sort key of every line (group
 * 1 when the pattern has a capture group, the whole match otherwise, `null` when the line does
 * not match or group 1 did not participate). It runs in a `worker_threads` Worker so that the
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
  mode?: 'test' | 'capture';
}

export type LineRegexWorkerResult =
  | { matches: boolean[] }
  | { keys: (string | null)[] }
  | { error: string };

const captureKey = (regex: RegExp, line: string): string | null => {
  const match = regex.exec(line);
  if (match === null) {
    return null;
  }
  return match.length > 1 ? match[1] ?? null : match[0];
};

const run = (data: LineRegexWorkerData): LineRegexWorkerResult => {
  try {
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
