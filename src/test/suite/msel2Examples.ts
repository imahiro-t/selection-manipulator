import { MselExample } from './mselExamples';

/**
 * The input / output examples of the LINEX-015..023 selection commands of the showcase data
 * (scripts/showcase-data/LINEX.json), in the notation of `mselExamples.ts`: `[text]` is a
 * selection, `|` a cursor, `⏎` a line break and `·` a space. A text without any marker is
 * selected as a whole.
 */
export const MSEL2_ROADMAP_EXAMPLES: Record<string, MselExample> = {
  'LINEX-015': { input: 'a x@y.jp b', expected: 'a [x@y.jp] b' },
  'LINEX-016': { input: 'host 10.0.0.1 ok', expected: 'host [10.0.0.1] ok' },
  'LINEX-017': { input: 'color:#fff;bg:#112233', expected: 'color:[#fff];bg:[#112233]' },
  'LINEX-018': { input: 'id=550e8400-e29b-41d4-a716-446655440000', expected: 'id=[550e8400-e29b-41d4-a716-446655440000]' },
  'LINEX-019': { input: 'from 2026-10-01 to 2026-10-31', expected: 'from [2026-10-01] to [2026-10-31]' },
  'LINEX-020': { input: 'Hi. This is| a pen. Bye.', expected: 'Hi. [This is a pen.] Bye.' },
  'LINEX-021': { input: 'p1⏎⏎a|b⏎cd⏎⏎p3', expected: 'p1⏎⏎[ab⏎cd]⏎⏎p3' },
  'LINEX-022': { input: '[a] [b] [a]', expected: '[a] b [a]' },
  'LINEX-023': { input: '[a] [b] [c]', note: '区切り: 既定値', inputs: [', '], expected: '[a, b, c]··' },
};
