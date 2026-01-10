import * as assert from 'assert';
import { processSplitJoin } from '../../handler/splitJoinHandler';

suite('Split/Join Logic Test Suite', () => {
  test('Split custom', () => {
    const text = 'a,b,c';
    const result = processSplitJoin(text, ',', 'split');
    assert.strictEqual(result, 'a\nb\nc');
  });

  test('Join custom', () => {
    const text = 'a\nb\nc';
    const result = processSplitJoin(text, '-', 'join');
    assert.strictEqual(result, 'a-b-c');
  });

  test('Join custom with multiple newlines', () => {
    const text = 'a\r\nb\nc';
    const result = processSplitJoin(text, '|', 'join');
    assert.strictEqual(result, 'a|b|c');
  });
});
