/**
 * Worker thread script for LINE-003 / LINE-004 / LINE-036 (Keep / Remove Lines Matching Regex).
 *
 * It tests the user's regular expression against every line and posts back one boolean per
 * line. It runs in a `worker_threads` Worker so that the extension host can stop it with
 * `worker.terminate()` when a catastrophic pattern (ReDoS) takes too long.
 *
 * The pattern and the lines arrive as plain data (`workerData`) and are never evaluated as
 * code. This script imports nothing but `worker_threads` (no `vscode`, no file or network
 * access), and it is bundled with the extension as a fixed file (see `lineRegex.ts`).
 */
import { parentPort, workerData } from 'worker_threads';

export interface LineRegexWorkerData {
  pattern: string;
  lines: string[];
}

export type LineRegexWorkerResult = { matches: boolean[] } | { error: string };

const run = (data: LineRegexWorkerData): LineRegexWorkerResult => {
  try {
    // No `g` / `y` flag: `test` then keeps no `lastIndex` state between lines.
    const regex = new RegExp(data.pattern, 'u');
    return { matches: data.lines.map((line) => regex.test(line)) };
  } catch (error) {
    return { error: error instanceof Error ? error.message : String(error) };
  }
};

parentPort?.postMessage(run(workerData as LineRegexWorkerData));
