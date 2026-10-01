/**
 * The input / output examples of the DATEX commands of the showcase data
 * (scripts/showcase-data/DATEX.json) (`⏎` expanded), with the exact results of the commands, the
 * values typed into the input boxes (the `（…）` note after the input stands for them) and, for the
 * random commands, the values the fixed `GenRandom` of the tests returns.
 */
import { PASSPHRASE_WORDS } from '../../handler/gen2Words';

export interface Date2Example {
  /** The selected text ('' for an empty cursor). DATEX-021: the selections, joined with SELECTIONS_SEPARATOR. */
  input: string;
  /** The answers to the input boxes, in order. */
  inputs: string[];
  /** The `（…）` note after the input of the showcase example. */
  note?: string;
  /** The exact result. */
  expected: string;
  /** The values `GenRandom.below` returns (random commands). */
  random?: number[];
}

/** How the showcase example of DATEX-021 writes its two selections. */
export const SELECTIONS_SEPARATOR = '` + `';

export const DATE2_EXAMPLES: Record<string, Date2Example> = {
  'DATEX-001': { input: '2026-10-01T00:00Z', inputs: ['P1DT2H'], note: 'P1DT2H', expected: '2026-10-02T02:00:00Z' },
  'DATEX-002': { input: '5400', inputs: [], expected: 'PT1H30M' },
  'DATEX-003': { input: '2026-10-15', inputs: [], expected: '2026-10-01' },
  'DATEX-004': { input: '2026-02-10', inputs: [], expected: '2026-02-28' },
  'DATEX-005': { input: '2026-10-02', inputs: ['1'], note: '1', expected: '2026-10-05' },
  'DATEX-006': { input: '2026-10-01 2026-10-08', inputs: [], expected: '5' },
  'DATEX-007': { input: '2026-10-01T00:00Z', inputs: ['Asia/Tokyo'], note: 'Asia/Tokyo', expected: '2026-10-01T09:00:00+09:00' },
  'DATEX-008': { input: '2026-W40', inputs: [], expected: '2026-09-28 – 2026-10-04' },
  'DATEX-009': { input: '2026', inputs: [], expected: '丙午' },
  'DATEX-010': { input: '14:30', inputs: [], expected: '2:30 PM' },
  'DATEX-011': { input: '2:30 PM', inputs: [], expected: '14:30' },
  'DATEX-012': { input: '175928847299117063', inputs: ['discord'], note: 'discord', expected: '2016-04-30T11:18:25.796Z' },
  'DATEX-013': { input: '01ARZ3NDEKTSV4RRFFQ69G5FAV', inputs: [], expected: '2016-07-30T23:54:10.259Z' },
  'DATEX-014': { input: '0190163d-8694-739b-aea5-966c26f8ad91', inputs: [], expected: '2024-06-14T10:14:09.300Z' },
  'DATEX-015': { input: '507f1f77bcf86cd799439011', inputs: [], expected: '2012-10-17T21:13:27Z' },
  'DATEX-016': { input: 'file{1..3}.txt', inputs: [], expected: 'file1.txt\nfile2.txt\nfile3.txt' },
  'DATEX-017': { input: '3', inputs: [], expected: '1 2 3\n2 4 6\n3 6 9' },
  'DATEX-018': { input: '7', inputs: [], expected: '0\n1\n1\n2\n3\n5\n8' },
  'DATEX-019': { input: '20', inputs: [], expected: '2 3 5 7 11 13 17 19' },
  'DATEX-020': { input: '09:00', inputs: ['30', '3'], note: '30, 3', expected: '09:00\n09:30\n10:00' },
  'DATEX-021': { input: `a\nb${SELECTIONS_SEPARATOR}1\n2`, inputs: [''], expected: 'a1\na2\nb1\nb2' },
  'DATEX-022': {
    input: '', inputs: ['4', '-'], note: '4', expected: 'orbit-maple-quiet-lantern',
    random: ['orbit', 'maple', 'quiet', 'lantern'].map((word) => PASSPHRASE_WORDS.indexOf(word)),
  },
  // ABC123 → A=0, B=1, C=2, 1=3, 2=4, 3=5.
  'DATEX-023': { input: '', inputs: ['ABC123', '8'], note: 'ABC123, 8', expected: 'B3A1CC2A', random: [1, 5, 0, 3, 2, 2, 4, 0] },
  // Fisher–Yates on [a, b, c, d]: i = 3 ↔ 1, i = 2 ↔ 1, i = 1 ↔ 0.
  'DATEX-024': { input: 'a b c d', inputs: [], expected: 'c a d b', random: [1, 1, 0] },
};
