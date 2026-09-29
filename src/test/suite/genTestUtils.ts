import * as assert from 'assert';
import { assertRandomCount, GenRandom } from '../../handler/genCommon';

/** `max` stands for the largest value `below(count)` may return (`count - 1`). */
export type FakeValue = number | 'max';

export interface FakeRandom extends GenRandom {
  /** The `count` of every `below` call, in order. */
  readonly counts: number[];
  /** The `n` of every `bytes` call, in order. */
  readonly byteCounts: number[];
}

/**
 * A deterministic `GenRandom` for tests. `below` returns the values of `values` in order (0 when
 * they run out) and checks that each is below `count`; `bytes` returns the next array of `bytes`
 * (its values repeated or cut to `n`), or `0, 1, 2, …` when there is none left.
 */
export const fakeRandom = (values: FakeValue[] = [], bytes: number[][] = []): FakeRandom => {
  const queue = [...values];
  const byteQueue = bytes.map((b) => [...b]);
  const counts: number[] = [];
  const byteCounts: number[] = [];
  return {
    counts,
    byteCounts,
    below: (count) => {
      assertRandomCount(count);
      counts.push(count);
      const next = queue.shift() ?? 0;
      const value = next === 'max' ? count - 1 : next;
      assert.ok(Number.isInteger(value) && value >= 0 && value < count, `fake value ${value} is not below ${count}`);
      return value;
    },
    bytes: (n) => {
      byteCounts.push(n);
      const source = byteQueue.shift();
      return Uint8Array.from({ length: n }, (_, i) => (source === undefined ? i & 0xff : source[i % source.length]));
    },
    uuid: () => '3f2504e0-4f89-41d3-9a0c-0305e82c3301',
  };
};

/** 2026-09-29 12:34:56.789 local time. */
export const GEN_TEST_NOW = (): Date => new Date(2026, 8, 29, 12, 34, 56, 789);
