import * as assert from 'assert';
import { countEolGrowth } from '../../handler/eolGrowth';

suite('countEolGrowth Test Suite', () => {
  test('a CRLF document: one character for each LF or lone CR, none for CRLF', () => {
    assert.strictEqual(countEolGrowth('', '\r\n'), 0);
    assert.strictEqual(countEolGrowth('abc', '\r\n'), 0);
    assert.strictEqual(countEolGrowth('a\r\nb\r\n', '\r\n'), 0);
    assert.strictEqual(countEolGrowth('a\nb\n', '\r\n'), 2);
    assert.strictEqual(countEolGrowth('a\nb', '\r\n'), 1);
    assert.strictEqual(countEolGrowth('a\rb\r', '\r\n'), 2);
    assert.strictEqual(countEolGrowth('a\r\nb\nc\rd\r\n', '\r\n'), 2);
    // `\n\r` is two line breaks (LF, then a lone CR), `\r\r\n` a lone CR and a CRLF.
    assert.strictEqual(countEolGrowth('\n\r', '\r\n'), 2);
    assert.strictEqual(countEolGrowth('\r\r\n', '\r\n'), 1);
    assert.strictEqual(countEolGrowth('\r', '\r\n'), 1);
  });

  test('an LF document: nothing grows', () => {
    assert.strictEqual(countEolGrowth('', '\n'), 0);
    assert.strictEqual(countEolGrowth('a\r\nb\nc\rd\r\n', '\n'), 0);
  });
});
