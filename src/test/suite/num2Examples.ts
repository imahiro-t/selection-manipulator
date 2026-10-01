/**
 * The input / output examples of the NUMX commands of the showcase data
 * (scripts/showcase-data/NUMX.json) (`⏎` expanded), with the exact results of the commands and the
 * values typed into the input boxes (the `（…）` note after the input).
 */
import { NumExample } from './numExamples';

export const NUM2_EXAMPLES: Record<string, NumExample> = {
  'NUMX-001': { input: '123456', inputs: ['2'], note: '2', expected: '120000' },
  'NUMX-002': { input: '17', inputs: ['5'], note: '5', expected: '15' },
  'NUMX-003': { input: '120\n50\n-5', inputs: ['0', '100'], note: '0, 100', expected: '100\n50\n0' },
  'NUMX-004': { input: '2026', inputs: [], expected: 'MMXXVI' },
  'NUMX-005': { input: 'MMXXVI', inputs: [], expected: '2026' },
  'NUMX-006': { input: 'one hundred twenty-three', inputs: [], expected: '123' },
  'NUMX-007': { input: '1 3/4', inputs: [], expected: '1.75' },
  'NUMX-008': { input: '12', inputs: ['1.1'], note: '1.1', expected: '13.2' },
  'NUMX-009': { input: '1.5', inputs: ['64'], note: '64', expected: '0x3FF8000000000000' },
  'NUMX-010': { input: '0x3FF8000000000000', inputs: [], expected: '1.5' },
  'NUMX-011': { input: '-1', inputs: ['32'], note: '32', expected: '0xFFFFFFFF' },
  'NUMX-012': { input: '12 18 24', inputs: [], expected: '6' },
  'NUMX-013': { input: '4 6', inputs: [], expected: '12' },
  'NUMX-014': { input: '360', inputs: [], expected: '2^3 × 3^2 × 5' },
  'NUMX-015': { input: '1 4 9', inputs: [], expected: '3 5' },
  'NUMX-016': { input: '1 2 3 5 7 8', inputs: [], expected: '1-3, 5, 7-8' },
  'NUMX-017': { input: '1-3, 5', inputs: [], expected: '1, 2, 3, 5' },
  'NUMX-018': { input: '1', inputs: [], expected: '3.2808' },
  'NUMX-019': { input: '10', inputs: [], expected: '3.048' },
  'NUMX-020': { input: '100', inputs: [], expected: '30.25' },
  'NUMX-021': { input: '30.25', inputs: [], expected: '100' },
  'NUMX-022': { input: '180', inputs: [], expected: '3.1416' },
  'NUMX-023': { input: '3.14159265', inputs: [], expected: '180' },
};
