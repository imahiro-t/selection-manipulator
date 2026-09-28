import * as assert from 'assert';
import { quoteForDisplay } from '../../textFormat';

suite('Text Format Unit Test Suite', () => {

  test('quoteForDisplay keeps up to 60 characters and adds an ellipsis beyond that', () => {
    assert.strictEqual(quoteForDisplay('', 60), '""');
    assert.strictEqual(quoteForDisplay('a'.repeat(60), 60), `"${'a'.repeat(60)}"`);
    assert.strictEqual(quoteForDisplay('a'.repeat(61), 60), `"${'a'.repeat(60)}…"`);
    assert.strictEqual(quoteForDisplay('a\nb"c', 60), JSON.stringify('a\nb"c'));
  });

  test('quoteForDisplay never splits a surrogate pair', () => {
    assert.strictEqual(quoteForDisplay('a'.repeat(58) + '😀b', 60), `"${'a'.repeat(58)}😀…"`);
    assert.strictEqual(quoteForDisplay('a'.repeat(59) + '😀b', 60), `"${'a'.repeat(59)}…"`);
    assert.strictEqual(quoteForDisplay('😀'.repeat(40), 60), `"${'😀'.repeat(30)}…"`);
    assert.strictEqual(quoteForDisplay('a'.repeat(59) + '\ud800', 60), `"${'a'.repeat(59)}…"`);
    assert.strictEqual(quoteForDisplay('\ud800', 60), '"\\ud800"');
  });

  test('quoteForDisplay bounds the escaped form and never splits an escape sequence', () => {
    const quoted = quoteForDisplay('\u0001'.repeat(100), 60);
    assert.strictEqual(quoted, `"${'\\u0001'.repeat(10)}…"`);
    assert.strictEqual(quoteForDisplay('a'.repeat(59) + '\n', 60), `"${'a'.repeat(59)}…"`);
    assert.strictEqual(quoteForDisplay('a'.repeat(58) + '\n', 60), JSON.stringify('a'.repeat(58) + '\n'));
  });

  test('quoteForDisplay uses the given limit', () => {
    assert.strictEqual(quoteForDisplay('abcdef', 5), '"abcde…"');
    assert.strictEqual(quoteForDisplay('abcde', 5), '"abcde"');
    assert.strictEqual(quoteForDisplay('a\n', 2), '"a…"');
  });
});
