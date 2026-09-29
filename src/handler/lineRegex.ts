import * as path from 'path';
import { Worker } from 'worker_threads';
import { LineRegexTimeoutError } from './lineTransforms';
import type { LineRegexWorkerData, LineRegexWorkerResult } from './lineRegexWorker';

/**
 * The only script ever loaded into a Worker: `lineRegexWorker.js`, shipped with the extension
 * next to the code that starts it (`out/handler/` for the `tsc` test build, `out/` for the
 * esbuild bundle, where this module is part of `out/main.js`). The path is built from this
 * constant alone, never from user input (pattern, selected text or settings).
 */
export const LINE_REGEX_WORKER_PATH = path.join(__dirname, 'lineRegexWorker.js');

export type LineRegexRunner = (pattern: string, lines: string[], timeoutMs: number) => Promise<boolean[]>;

/** SORT-010: the key of every line (see `lineRegexWorker.ts`), `null` when there is none. */
export type LineRegexCaptureRunner = (pattern: string, lines: string[], timeoutMs: number) => Promise<(string | null)[]>;

/**
 * Runs the worker script on `data` and resolves with what `pick` takes from its result.
 * Rejects with `LineRegexTimeoutError` when it takes longer than `timeoutMs`, which bounds the
 * time a catastrophic pattern such as `^(a+)+$` can take.
 *
 * SECURITY.md notes:
 * - A Worker is a thread of the extension host, not another process (`child_process` is not
 *   used), so this is not shell or process execution.
 * - The Worker loads only the bundled, fixed script `LINE_REGEX_WORKER_PATH` (no `eval: true`,
 *   no code string, no `data:` URL, no user-controlled path), so this is neither arbitrary code
 *   execution / dynamic `require` nor file access beyond the extension's own code.
 * - The pattern and the lines are passed as data (`workerData`) and are never evaluated as code.
 *
 * The Worker is terminated and the timer cleared on every path (result, error, exit, timeout).
 */
const runWorker = <T>(
  data: LineRegexWorkerData,
  timeoutMs: number,
  pick: (result: LineRegexWorkerResult) => T | undefined
): Promise<T> =>
  new Promise<T>((resolve, reject) => {
    const worker = new Worker(LINE_REGEX_WORKER_PATH, { workerData: data });
    let settled = false;
    const finish = (settle: () => void) => {
      if (settled) {
        return;
      }
      settled = true;
      clearTimeout(timer);
      void worker.terminate();
      settle();
    };
    const timer = setTimeout(() => finish(() => reject(new LineRegexTimeoutError(timeoutMs))), timeoutMs);
    worker.once('message', (result: LineRegexWorkerResult) => finish(() => {
      if ('error' in result) {
        reject(new Error(result.error));
        return;
      }
      const value = pick(result);
      if (value === undefined) {
        reject(new Error('The regular expression worker returned an unexpected result'));
      } else {
        resolve(value);
      }
    }));
    worker.once('error', (error) => finish(() => reject(error)));
    worker.once('exit', (code) => finish(() => reject(new Error(`The regular expression worker stopped (exit code ${code})`))));
  });

/**
 * Tests `pattern` (with the `u` flag) against every line in a worker thread and resolves with
 * one boolean per line (LINE-003 / LINE-004 / LINE-036). See `runWorker` for the time limit
 * and the security notes.
 */
export const runRegexInWorker: LineRegexRunner = (pattern, lines, timeoutMs) =>
  runWorker({ pattern, lines }, timeoutMs, (result) => ('matches' in result ? result.matches : undefined));

/**
 * SORT-010: runs `pattern` (with the `u` flag) on every line in a worker thread and resolves
 * with the key of every line: group 1 when the pattern has a capture group, the whole match
 * otherwise, `null` when the line does not match or group 1 did not participate. Same time
 * limit and security properties as `runRegexInWorker`.
 */
export const runRegexCaptureInWorker: LineRegexCaptureRunner = (pattern, lines, timeoutMs) =>
  runWorker({ pattern, lines, mode: 'capture' }, timeoutMs, (result) => ('keys' in result ? result.keys : undefined));
