import * as assert from 'assert';
import { EncOutputTooLargeError, MAX_OUTPUT_LENGTH } from '../../handler/encodeTransforms';
import {
  assertInputLength,
  assertTotalOutput,
  assertWithinBudget,
  forEachLfLine,
  forEachLine,
  isBlank,
  isTrimBlank,
  JS_IDENTIFIER,
  OutputBuffer,
  textEol,
} from '../../handler/textCommon';
import { isBlank as mdIsBlank } from '../../handler/mdCommon';
import { NumOutputBuffer } from '../../handler/numCommon';
import { OutputBuffer as DataOutputBuffer } from '../../handler/dataCommon';
import { NOT_CHANGED, NOT_SHOWN, selectionLabel, unexpectedFailureLog } from '../../handler/commandCommon';
import { DevOutputBuffer, splitDevLines } from '../../handler/devCommon';
import { forEachUniLine, UniOutputBuffer } from '../../handler/uniCommon';
import { forEachJaLine } from '../../handler/jaCommon';
import { DateOutputBuffer, dateLineValues, mapDateLines } from '../../handler/dateCommon';
import { forEachLine as genForEachLine, GenOutputBuffer } from '../../handler/genCommon';

/** The lines `split` hands to its visitor, as [line, line break, line number]. */
const linesOf = (
  split: (text: string, visit: (line: string, lineBreak: string, lineNumber: number) => void) => void,
  text: string
): [string, string, number][] => {
  const lines: [string, string, number][] = [];
  split(text, (line, lineBreak, lineNumber) => lines.push([line, lineBreak, lineNumber]));
  return lines;
};

const isTooLarge = (total: number) => (error: unknown): boolean =>
  error instanceof EncOutputTooLargeError && error.length === total && error.limit === MAX_OUTPUT_LENGTH;

suite('Shared helpers of the category commands (textCommon / commandCommon)', () => {
  suite('forEachLine (LF, CRLF and a lone CR)', () => {
    test('LF, CRLF and a lone CR each end a line, and the line break is handed over', () => {
      assert.deepStrictEqual(linesOf(forEachLine, 'a\nb\r\nc\rd'), [['a', '\n', 1], ['b', '\r\n', 2], ['c', '\r', 3], ['d', '', 4]]);
    });

    test('a text ending with a line break has an empty last line; the empty text is one empty line', () => {
      assert.deepStrictEqual(linesOf(forEachLine, 'a\r\n'), [['a', '\r\n', 1], ['', '', 2]]);
      assert.deepStrictEqual(linesOf(forEachLine, 'a\r'), [['a', '\r', 1], ['', '', 2]]);
      assert.deepStrictEqual(linesOf(forEachLine, ''), [['', '', 1]]);
    });

    test('a CR not followed by LF, and CR CR LF, LF CR', () => {
      assert.deepStrictEqual(linesOf(forEachLine, '\r\rx'), [['', '\r', 1], ['', '\r', 2], ['x', '', 3]]);
      assert.deepStrictEqual(linesOf(forEachLine, 'a\r\r\nb'), [['a', '\r', 1], ['', '\r\n', 2], ['b', '', 3]]);
      assert.deepStrictEqual(linesOf(forEachLine, 'a\n\rb'), [['a', '\n', 1], ['', '\r', 2], ['b', '', 3]]);
    });

    test('genCommon.forEachLine is the same function', () => {
      assert.strictEqual(genForEachLine, forEachLine);
    });
  });

  suite('forEachLfLine (LF and CRLF only)', () => {
    test('LF and CRLF end a line; a lone CR stays in the line', () => {
      assert.deepStrictEqual(linesOf(forEachLfLine, 'a\nb\r\nc\rd'), [['a', '\n', 1], ['b', '\r\n', 2], ['c\rd', '', 3]]);
    });

    test('a text ending with a line break has an empty last line; the empty text is one empty line', () => {
      assert.deepStrictEqual(linesOf(forEachLfLine, 'a\r\n'), [['a', '\r\n', 1], ['', '', 2]]);
      assert.deepStrictEqual(linesOf(forEachLfLine, ''), [['', '', 1]]);
      assert.deepStrictEqual(linesOf(forEachLfLine, '\r\n\n'), [['', '\r\n', 1], ['', '\n', 2], ['', '', 3]]);
    });

    test('a lone CR at the very end of the text stays in the last line, like a lone CR elsewhere', () => {
      assert.deepStrictEqual(linesOf(forEachLfLine, 'a\r'), [['a\r', '', 1]]);
      assert.deepStrictEqual(linesOf(forEachLfLine, '\r'), [['\r', '', 1]]);
      assert.deepStrictEqual(linesOf(forEachLfLine, 'a\r\r'), [['a\r\r', '', 1]]);
      assert.deepStrictEqual(linesOf(forEachLfLine, 'a\n\r'), [['a', '\n', 1], ['\r', '', 2]]);
      assert.deepStrictEqual(linesOf(forEachLfLine, 'a\r\n\r'), [['a', '\r\n', 1], ['\r', '', 2]]);
    });

    test('the lines and line breaks together are the text again (nothing is lost)', () => {
      for (const text of ['', 'a', 'a\r', '\r', 'a\r\r', 'a\n\r', 'a\r\n\r', '\r\r\n\r', 'a\nb\r\nc\rd', 'a\r\n', '\n\r\n\r']) {
        assert.strictEqual(linesOf(forEachLfLine, text).map(([line, lineBreak]) => line + lineBreak).join(''), text, JSON.stringify(text));
      }
    });

    test('the JA and UNI line splitters are the same function', () => {
      assert.strictEqual(forEachJaLine, forEachLfLine);
      assert.strictEqual(forEachUniLine, forEachLfLine);
    });
  });

  suite('splitDevLines (DEV) follows forEachLine', () => {
    test('LF, CRLF and a lone CR are line breaks; CRLF is one line break', () => {
      assert.deepStrictEqual(splitDevLines('a\nb\r\nc\rd'), [
        { text: 'a', lineBreak: '\n' },
        { text: 'b', lineBreak: '\r\n' },
        { text: 'c', lineBreak: '\r' },
        { text: 'd', lineBreak: '' },
      ]);
      assert.deepStrictEqual(splitDevLines(''), [{ text: '', lineBreak: '' }]);
      assert.deepStrictEqual(splitDevLines('x\r\n'), [{ text: 'x', lineBreak: '\r\n' }, { text: '', lineBreak: '' }]);
      assert.deepStrictEqual(splitDevLines('\r\r\n'), [{ text: '', lineBreak: '\r' }, { text: '', lineBreak: '\r\n' }, { text: '', lineBreak: '' }]);
    });
  });

  suite('DATE lines keep a lone CR in the line', () => {
    test('dateLineValues treats "2026-01-01\\r2026-01-02" as one line', () => {
      assert.deepStrictEqual(dateLineValues('2026-01-01\r2026-01-02'), [{ value: '2026-01-01\r2026-01-02', lineNumber: 1 }]);
      assert.deepStrictEqual(dateLineValues('2026-01-01\r\n2026-01-02'), [
        { value: '2026-01-01', lineNumber: 1 },
        { value: '2026-01-02', lineNumber: 2 },
      ]);
    });

    test('mapDateLines converts "a\\rb" as one value and keeps the CRLF / LF line breaks', () => {
      const seen: string[] = [];
      const result = mapDateLines('a\rb\r\nc\n', 1_000, '\n', (value) => {
        seen.push(value);
        return value.toUpperCase();
      });
      assert.deepStrictEqual(seen, ['a\rb', 'c']);
      assert.strictEqual(result, 'A\rB\r\nC\n');
    });

    test('a lone CR at the very end of the selection stays in the last value', () => {
      assert.deepStrictEqual(dateLineValues('2026-01-01\n2026-01-02\r'), [
        { value: '2026-01-01', lineNumber: 1 },
        { value: '2026-01-02\r', lineNumber: 2 },
      ]);
      assert.strictEqual(mapDateLines('a\nb\r', 1_000, '\n', (value) => value.toUpperCase()), 'A\nB\r');
    });
  });

  suite('output budget', () => {
    test('OutputBuffer takes pieces up to the budget exactly', () => {
      const buffer = new OutputBuffer(5);
      buffer.push('abc');
      buffer.push('de');
      assert.strictEqual(buffer.length, 5);
      assert.strictEqual(buffer.join(), 'abcde');
      assert.strictEqual(buffer.join('-'), 'abc-de');
    });

    test('a piece one character over the budget throws and is not added', () => {
      const buffer = new OutputBuffer(5);
      buffer.push('abcd');
      assert.throws(() => buffer.push('ef'), isTooLarge(6));
      assert.strictEqual(buffer.length, 4);
      assert.strictEqual(buffer.join(), 'abcd');
      assert.throws(() => buffer.reserve(2), isTooLarge(6));
      buffer.reserve(1);
      assert.strictEqual(buffer.length, 4);
    });

    test('the buffers of the categories are the shared class', () => {
      for (const buffer of [DevOutputBuffer, UniOutputBuffer, DateOutputBuffer, GenOutputBuffer, NumOutputBuffer]) {
        assert.strictEqual(buffer, OutputBuffer);
      }
    });

    test('count is the number of pieces pushed (empty pieces too)', () => {
      const buffer = new OutputBuffer(5);
      assert.strictEqual(buffer.count, 0);
      buffer.push('ab');
      buffer.push('');
      assert.strictEqual(buffer.count, 2);
      assert.throws(() => buffer.push('abcd'), isTooLarge(6));
      assert.strictEqual(buffer.count, 2);
    });

    test('the DATA buffer is the shared class with the whole limit, and join counts the separators', () => {
      const buffer = new DataOutputBuffer();
      assert.ok(buffer instanceof OutputBuffer);
      buffer.push('a'.repeat(MAX_OUTPUT_LENGTH - 2));
      buffer.push('b');
      buffer.push('c');
      assert.strictEqual(buffer.count, 3);
      assert.strictEqual(buffer.join('').length, MAX_OUTPUT_LENGTH);
      // Two separators of one character: MAX_OUTPUT_LENGTH + 2.
      assert.throws(() => buffer.join(','), isTooLarge(MAX_OUTPUT_LENGTH + 2));
      assert.throws(() => buffer.push('d'), isTooLarge(MAX_OUTPUT_LENGTH + 1));
      const small = new DataOutputBuffer();
      small.push('x');
      small.push('y');
      assert.strictEqual(small.join('\n'), 'x\ny');
    });

    test('assertWithinBudget and assertTotalOutput', () => {
      assertWithinBudget(3, 3);
      assert.throws(() => assertWithinBudget(4, 3), isTooLarge(4));
      assertTotalOutput(MAX_OUTPUT_LENGTH);
      assert.throws(() => assertTotalOutput(MAX_OUTPUT_LENGTH + 1), isTooLarge(MAX_OUTPUT_LENGTH + 1));
    });
  });

  suite('input checks', () => {
    test('isBlank: only spaces, tabs and line breaks (or nothing)', () => {
      assert.deepStrictEqual(['', ' \t\r\n', ' a ', '　'].map(isBlank), [true, true, false, false]);
    });

    test('isTrimBlank: everything trim removes (Unicode whitespace) is blank; mdCommon.isBlank is it', () => {
      assert.deepStrictEqual(['', ' \t\r\n', '\u00a0\u3000\ufeff', ' a ', '\u200b'].map(isTrimBlank), [true, true, true, false, false]);
      assert.deepStrictEqual(['\u00a0', '\u3000'].map(isBlank), [false, false]);
      assert.strictEqual(mdIsBlank, isTrimBlank);
    });

    test('textEol: CRLF when the first line break of the text is one, LF otherwise', () => {
      assert.deepStrictEqual(['a\r\nb', 'a\nb\r\n', 'abc', '', '\nx', 'a\rb', '\r\n'].map(textEol),
        ['\r\n', '\n', '\n', '\n', '\n', '\n', '\r\n']);
    });

    test('assertInputLength builds the message and the error of the category', () => {
      class Refused extends Error { }
      assertInputLength('abc', 3, (message) => new Refused(message));
      assert.throws(
        () => assertInputLength('abcd', 3, (message) => new Refused(message)),
        (error: unknown) => error instanceof Refused && error.message === 'the selection is longer than 3 characters'
      );
      assert.throws(
        () => assertInputLength('a'.repeat(1_001), 1_000, (message) => new Refused(message)),
        (error: unknown) => error instanceof Refused && error.message === 'the selection is longer than 1,000 characters'
      );
    });

    test('JS_IDENTIFIER', () => {
      assert.deepStrictEqual(['a', '_a1', '$', 'A$_9', '1a', 'a-b', '', 'é'].map((key) => JS_IDENTIFIER.test(key)),
        [true, true, true, true, false, false, false, false]);
    });
  });

  suite('notifications', () => {
    test('the beginnings of the notifications', () => {
      assert.strictEqual(NOT_CHANGED, 'The selection was not changed: ');
      assert.strictEqual(NOT_SHOWN, 'No result was shown: ');
    });

    test('selectionLabel names the selection only when there are several', () => {
      assert.strictEqual(selectionLabel(0, 1), '');
      assert.strictEqual(selectionLabel(0, 2), 'selection 1 of 2: ');
      assert.strictEqual(selectionLabel(2, 3), 'selection 3 of 3: ');
    });

    test('unexpectedFailureLog gives the name and the stack frames, never the message', () => {
      const error = new TypeError('secret selected text');
      error.stack = 'TypeError: secret selected text\n    at one (a.js:1:1)\n    at two (b.js:2:2)';
      assert.strictEqual(unexpectedFailureLog('a number command', error),
        'Selection Manipulator: a number command failed unexpectedly (TypeError)\n    at one (a.js:1:1)\n    at two (b.js:2:2)');
      assert.strictEqual(unexpectedFailureLog('a date command', 'oops'), 'Selection Manipulator: a date command failed unexpectedly (string)');
    });
  });
});
