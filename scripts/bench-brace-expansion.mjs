#!/usr/bin/env node
/**
 * Benchmark of the DATEX-016 brace expansion (SELEC-00124): the parsing and the estimate of the
 * current implementation (src/handler/gen2Generate.ts) next to the former one, frozen in
 * src/test/suite/legacy/braceExpansionLegacy.ts, on inputs full of braces.
 *
 *   node scripts/bench-brace-expansion.mjs [--runs 3] [--only B2,S1]
 *
 * Both are bundled with esbuild into a temporary directory; every measure runs in a child process
 * of its own (`node --expose-gc`), several times, and the median is printed with every value.
 *
 * Benches (B1 to R841: `{` + N alternatives of `x{1..1}` × k joined with `,` + `}`, as in art-aa1f961b):
 *   B1   N=1,100,  k=120 (925,101 characters) × 9 selections: about the 8.4 million characters of
 *        art-aa1f961b, cut into selections of at most GEN_MAX_INPUT_LENGTH.
 *   B2   N=10,000, k=14 (990,001 characters) × 34 selections: the most one run can parse within the
 *        output budget (9,859,966 characters of result in all).
 *   S1   one selection of B2.
 *   A1   `{` + `{a}` × 333,332 + `}` (999,998 characters): braces kept as text.
 *   A2   10,000 alternatives of (`a\,b{1..1}\{c{x}` × 6) (969,999 characters): escapes, ranges of
 *        one term and `{x}` kept as text.
 *   R841 N=10,000, k=120 (8,410,001 characters), one selection: the input of art-aa1f961b (over
 *        GEN_MAX_INPUT_LENGTH, for reference only).
 *   B3   many short lines: `{a}` + LF × 99,999 (399,996 characters) × 25 selections (the last one
 *        is over the output budget), braces kept as text on every line.
 *   B4   many short lines: `{` + LF × 99,999 (199,998 characters) × 50 selections (the last one is
 *        over the output budget), a brace that is never closed on every line.
 *   B5   many short lines: `{a,b}` + LF × 49,999 (299,994 characters) × 16 selections (the last
 *        one is over the output budget), two alternatives on every line.
 *
 * The input is made flat (as the text of a document is) before anything is measured.
 *
 * Measures:
 *   parse ms         every selection run with a budget of 0: the line is parsed and measured, then
 *                    refused before anything is expanded (the time of the parsing and the estimate
 *                    of one run of the command).
 *   peak RSS Δ MB    the highest resident set size of the process during "parse" (maxRSS) minus
 *                    the resident set size after a GC before it, in a new process (cold: the
 *                    optimising compiler of V8 runs during the measure, about 8 MB for the
 *                    current implementation).
 *   warm peak Δ MB   the same after a warm-up (the same function run 50 times on the same input
 *                    cut to 1/20, so that it is already compiled, as in an extension host where
 *                    the command has been run before).
 *   full ms          every selection run with what is left of the output budget (10,000,000), as
 *                    the command does (expansion included; for reference).
 *   retained MB      heapUsed + arrayBuffers of one parsed selection kept alive (table and pieces),
 *                    after a GC, minus the same before it (the benches of one line only; `-` for
 *                    B3 to B5, whose lines are not kept from one to the next).
 */
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const BUDGET = 10_000_000;

const alternatives = (n, option) => `{${Array.from({ length: n }, () => option).join(',')}}`;

const BENCHES = {
  B1: { make: () => alternatives(1_100, 'x{1..1}'.repeat(120)), makeSmall: () => alternatives(55, 'x{1..1}'.repeat(120)), selections: 9 },
  B2: { make: () => alternatives(10_000, 'x{1..1}'.repeat(14)), makeSmall: () => alternatives(500, 'x{1..1}'.repeat(14)), selections: 34 },
  S1: { make: () => alternatives(10_000, 'x{1..1}'.repeat(14)), makeSmall: () => alternatives(500, 'x{1..1}'.repeat(14)), selections: 1 },
  A1: { make: () => `{${'{a}'.repeat(333_332)}}`, makeSmall: () => `{${'{a}'.repeat(16_666)}}`, selections: 1 },
  A2: { make: () => alternatives(10_000, 'a\\,b{1..1}\\{c{x}'.repeat(6)), makeSmall: () => alternatives(500, 'a\\,b{1..1}\\{c{x}'.repeat(6)), selections: 1 },
  R841: { make: () => alternatives(10_000, 'x{1..1}'.repeat(120)), makeSmall: () => alternatives(500, 'x{1..1}'.repeat(120)), selections: 1 },
  B3: { make: () => '{a}\n'.repeat(99_999), makeSmall: () => '{a}\n'.repeat(5_000), selections: 25, lines: true },
  B4: { make: () => '{\n'.repeat(99_999), makeSmall: () => '{\n'.repeat(5_000), selections: 50, lines: true },
  B5: { make: () => '{a,b}\n'.repeat(49_999), makeSmall: () => '{a,b}\n'.repeat(2_500), selections: 16, lines: true },
};

const MODES = ['parse', 'warm', 'full', 'retained'];

/** In a child process: one measure of one bench with one implementation; prints a JSON line. */
const child = (bundle, bench, mode) => {
  const require = createRequire(import.meta.url);
  const impl = require(bundle);
  const { make, selections } = BENCHES[bench];
  const text = make();
  // Made flat (the bench strings are built with `+` and `join`), as the text of a document is.
  text.charCodeAt(0);
  const gc = globalThis.gc;
  if (mode === 'parse' || mode === 'warm') {
    if (mode === 'warm') {
      const small = BENCHES[bench].makeSmall();
      for (let k = 0; k < 50; k++) {
        try {
          impl.braceExpansion(small, '\n', 0);
        } catch {
          // refused: only the parsing and the estimate run
        }
      }
    }
    gc();
    const rss0 = process.memoryUsage().rss;
    const started = performance.now();
    let error = '';
    for (let s = 0; s < selections; s++) {
      try {
        impl.braceExpansion(text, '\n', 0);
      } catch (e) {
        error = e.constructor.name;
      }
    }
    const ms = performance.now() - started;
    // maxRSS is the highest of the whole process, warm-up included: a higher peak during the
    // warm-up could only make the value larger, so it is an upper bound of the measured run.
    const peak = process.resourceUsage().maxRSS * 1024 - rss0;
    console.log(JSON.stringify({ ms, peakMB: peak / 1e6, length: text.length, error }));
  } else if (mode === 'full') {
    gc();
    const started = performance.now();
    let total = 0;
    let error = '';
    for (let s = 0; s < selections; s++) {
      try {
        total += impl.braceExpansion(text, '\n', BUDGET - total).length;
      } catch (e) {
        error = e.constructor.name;
        break;
      }
    }
    console.log(JSON.stringify({ ms: performance.now() - started, total, error }));
  } else {
    gc();
    const before = process.memoryUsage();
    const table = impl.matchBraces(text);
    const parsed = impl.parseSequence(text, table, 0, text.length, 0);
    gc();
    const after = process.memoryUsage();
    const mb = (after.heapUsed + after.arrayBuffers - before.heapUsed - before.arrayBuffers) / 1e6;
    console.log(JSON.stringify({ mb, keep: typeof table === 'object' && Array.isArray(parsed.nodes) }));
  }
};

const median = (values) => [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)];
const fmt = (value, digits = 0) => value.toFixed(digits);

const main = async () => {
  const args = process.argv.slice(2);
  const runsAt = args.indexOf('--runs');
  const runs = runsAt >= 0 ? Number(args[runsAt + 1]) : 3;
  const onlyAt = args.indexOf('--only');
  const benches = onlyAt >= 0 ? args[onlyAt + 1].split(',') : Object.keys(BENCHES);
  const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
  const require = createRequire(join(root, 'package.json'));
  const esbuild = require('esbuild');
  const dir = mkdtempSync(join(tmpdir(), 'bench-brace-'));
  try {
    const implementations = {
      before: join(root, 'src/test/suite/legacy/braceExpansionLegacy.ts'),
      after: join(root, 'src/handler/gen2Generate.ts'),
    };
    const bundles = {};
    for (const [name, entry] of Object.entries(implementations)) {
      bundles[name] = join(dir, `${name}.cjs`);
      await esbuild.build({ entryPoints: [entry], bundle: true, platform: 'node', format: 'cjs', external: ['vscode'], outfile: bundles[name], logLevel: 'error' });
    }
    console.log(`node ${process.version}, ${process.platform} ${process.arch}, ${runs} runs each (median, then every value)`);
    console.log('');
    console.log('| bench | input chars × selections | impl | parse ms | peak RSS Δ MB | warm parse ms | warm peak Δ MB | full ms | retained MB |');
    console.log('|---|---|---|---|---|---|---|---|---|');
    for (const bench of benches) {
      for (const name of Object.keys(implementations)) {
        const values = Object.fromEntries(MODES.map((mode) => [mode, []]));
        let length = 0;
        for (let run = 0; run < runs; run++) {
          for (const mode of MODES) {
            if (mode === 'retained' && BENCHES[bench].lines) {
              continue;
            }
            const output = execFileSync(process.execPath, ['--expose-gc', fileURLToPath(import.meta.url), '--child', bundles[name], bench, mode], { encoding: 'utf8', maxBuffer: 1 << 20 });
            const result = JSON.parse(output.trim().split('\n').pop());
            values[mode].push(result);
            length = result.length ?? length;
          }
        }
        const parseMs = values.parse.map((v) => v.ms);
        const peak = values.parse.map((v) => v.peakMB);
        const warmMs = values.warm.map((v) => v.ms);
        const warmPeak = values.warm.map((v) => v.peakMB);
        const fullMs = values.full.map((v) => v.ms);
        const retained = values.retained.map((v) => v.mb);
        const all = (list, digits = 0) => (list.length === 0 ? '-' : `${fmt(median(list), digits)} (${list.map((v) => fmt(v, digits)).join(' / ')})`);
        console.log(`| ${bench} | ${length.toLocaleString('en-US')} × ${BENCHES[bench].selections} | ${name} | ${all(parseMs)} | ${all(peak)} | ${all(warmMs)} | ${all(warmPeak)} | ${all(fullMs)} ${values.full[0].error ? `[${values.full[0].error}]` : ''} | ${all(retained, 1)} |`);
      }
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
};

if (process.argv[2] === '--child') {
  child(process.argv[3], process.argv[4], process.argv[5]);
} else {
  await main();
}
