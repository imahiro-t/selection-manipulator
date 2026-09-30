import * as assert from 'assert';
import {
  MAX_ADDED_LENGTH,
  validateColumnInput,
  validateDelimiterInput,
  validateIndentInput,
  WHITESPACE_COMMANDS,
  WhitespaceCommand,
  WhitespaceOptions,
  WhitespaceOutputTooLargeError,
  whitespaceTransforms,
} from '../../handler/whitespaceTransforms';

/**
 * Notation used in this file (same as the examples of the showcase data, scripts/showcase-data/):
 * `·` = space, `⇥` = tab, `⏎` = line break. Tests for WS-015 / WS-016, where U+00B7
 * and U+2192 are real characters, use explicit escapes instead.
 */
const ws = (s: string): string => s.replace(/·/g, ' ').replace(/⇥/g, '\t').replace(/⏎/g, '\n');

const run = (command: WhitespaceCommand, input: string, options: Partial<WhitespaceOptions> = {}): string =>
  whitespaceTransforms[command](input, { eol: '\n', ...options });

/** Asserts the transform using the `· ⇥ ⏎` notation for both input and expected output. */
const check = (command: WhitespaceCommand, input: string, expected: string, options: Partial<WhitespaceOptions> = {}) =>
  assert.strictEqual(run(command, ws(input), options), ws(expected), `${command}: ${JSON.stringify(input)}`);

/** Same as `check`, but with CRLF input / output. */
const checkCrlf = (command: WhitespaceCommand, input: string, expected: string, options: Partial<WhitespaceOptions> = {}) =>
  assert.strictEqual(
    run(command, ws(input).replace(/\n/g, '\r\n'), { eol: '\r\n', ...options }),
    ws(expected).replace(/\n/g, '\r\n'),
    `${command} (CRLF): ${JSON.stringify(input)}`
  );

const ninetyCharLine = `${Array(8).fill('abcdefghi').join(' ')} abcdefghij`; // 79 + 1 + 10 = 90 characters

suite('Whitespace Transforms (WS-001..035) Test Suite', () => {

  test('the command table has exactly 35 commands', () => {
    assert.strictEqual(WHITESPACE_COMMANDS.length, 35);
    assert.strictEqual(new Set(WHITESPACE_COMMANDS).size, 35);
    assert.deepStrictEqual([...WHITESPACE_COMMANDS].sort(), Object.keys(whitespaceTransforms).sort());
  });

  test('every command returns an empty string for an empty string', () => {
    WHITESPACE_COMMANDS.forEach((command) => {
      assert.strictEqual(run(command, '', { n: 4, delimiter: '=>' }), '', command);
    });
  });

  suite('ROADMAP examples', () => {
    const examples: [WhitespaceCommand, string, string, Partial<WhitespaceOptions>?][] = [
      ['tabs-to-spaces-2', '⇥foo', '··foo'],
      ['tabs-to-spaces-4', '⇥foo', '····foo'],
      ['spaces-to-tabs-2', '····foo', '⇥⇥foo'],
      ['spaces-to-tabs-4', '····foo', '⇥foo'],
      ['reindent-2-to-4', '··a⏎····b', '····a⏎········b'],
      ['reindent-4-to-2', '····a⏎········b', '··a⏎····b'],
      ['dedent', '····a⏎······b', 'a⏎··b'],
      ['trim-leading', '··a··⏎·b', 'a··⏎b'],
      ['collapse-blank-lines', 'a⏎⏎⏎⏎b', 'a⏎⏎b'],
      ['remove-all', 'a·b⇥c⏎d', 'abcd'],
      ['unwrap-paragraphs', 'a⏎b⏎⏎c⏎d', 'a·b⏎⏎c·d'],
      ['hard-wrap-n', 'aa·bb·cc', 'aa·bb⏎cc', { n: 5 }],
      ['center-align', 'a⏎abc', '·a⏎abc'],
      ['right-align', 'a⏎abc', '··a⏎abc'],
      ['pad-to-longest', 'a⏎abc', 'a··⏎abc'],
      ['align-equals', 'a·=·1⏎bbb·=·2', 'a···=·1⏎bbb·=·2'],
      ['align-colon', 'a:·1⏎bbb:·2', 'a:···1⏎bbb:·2'],
      ['align-comma', 'a,bb,c⏎ccc,d,e', 'a,··bb,c⏎ccc,d,·e'],
      ['align-custom', 'a·=>·1⏎bb·=>·2', 'a··=>·1⏎bb·=>·2', { delimiter: '=>' }],
      ['blank-line-between', 'a⏎b', 'a⏎⏎b'],
      ['remove-trailing-blank-lines', 'a⏎b⏎⏎⏎', 'a⏎b'],
      ['remove-leading-blank-lines', '⏎⏎a⏎b', 'a⏎b'],
      ['collapse-inline', '··a···b', '··a·b'],
      ['space-around-operators', 'a=b+c', 'a·=·b·+·c'],
      ['remove-space-before-punctuation', 'hello·,·world·!', 'hello,·world!'],
      ['space-after-comma', 'a,b,c', 'a,·b,·c'],
      ['indent-n', 'a⏎b', '···a⏎···b', { n: 3 }],
      ['outdent-n', '····a⏎·b', '··a⏎b', { n: 2 }],
      ['expand-tabs', 'a⇥b', 'a···b'],
      ['unexpand-tabs', 'a···b', 'a⇥b'],
      ['clear-blank-only-lines', 'a⏎··⏎b', 'a⏎⏎b'],
    ];
    examples.forEach(([command, input, expected, options]) => {
      test(`${command}: ${input}`, () => check(command, input, expected, options));
    });

    test('hard-wrap-80: a 90 character line is wrapped into two lines of at most 80 columns', () => {
      assert.strictEqual(ninetyCharLine.length, 90);
      const result = run('hard-wrap-80', ninetyCharLine);
      assert.strictEqual(result, `${Array(8).fill('abcdefghi').join(' ')}\nabcdefghij`);
      result.split('\n').forEach((line) => assert.ok(line.length <= 80, line));
    });

    test('nbsp-to-space: a{U+00A0}b → a b', () => {
      assert.strictEqual(run('nbsp-to-space', 'a b'), 'a b');
    });

    test('visualize: a·b⇥c → a{U+00B7}b{U+2192}c', () => {
      assert.strictEqual(run('visualize', 'a b\tc'), 'a·b→c');
    });

    test('unvisualize: a{U+00B7}b{U+2192}c → a b⇥c', () => {
      assert.strictEqual(run('unvisualize', 'a·b→c'), 'a b\tc');
    });
  });

  suite('A. indent / tabs', () => {
    test('tabs-to-spaces: only tabs in the leading whitespace are replaced', () => {
      check('tabs-to-spaces-2', '·⇥a⇥b', '···a⇥b');
      check('tabs-to-spaces-4', '⇥⇥a⏎b⇥c', '········a⏎b⇥c');
    });

    test('spaces-to-tabs: remainder spaces and existing tabs are kept', () => {
      check('spaces-to-tabs-2', '·····a', '⇥⇥·a');
      check('spaces-to-tabs-4', '······a⏎⇥····b', '⇥··a⏎⇥⇥b');
      check('spaces-to-tabs-4', 'a····b', 'a····b');
    });

    test('reindent: odd remainders are kept and lines starting with a tab are unchanged', () => {
      check('reindent-2-to-4', '···a⏎⇥··b', '·····a⏎⇥··b');
      check('reindent-4-to-2', '·····a⏎⇥····b', '···a⏎⇥····b');
    });

    test('dedent: blank lines are ignored and spaces/tabs are distinguished', () => {
      check('dedent', '··a⏎⏎····b', 'a⏎⏎··b');
      check('dedent', '··a⏎····⏎··b', 'a⏎··⏎b');
      check('dedent', '··a⏎⇥b', '··a⏎⇥b');
      check('dedent', '⇥·a⏎⇥··b', 'a⏎·b');
    });

    test('indent-n: blank lines are not indented', () => {
      check('indent-n', 'a⏎⏎··⏎b', '··a⏎⏎··⏎··b', { n: 2 });
    });

    test('outdent-n: stops at a tab and removes at most N spaces', () => {
      check('outdent-n', '··⇥a⏎·····b', '⇥a⏎·b', { n: 4 });
    });

    test('expand-tabs: tab stops are computed from the line start', () => {
      check('expand-tabs', '⇥a⏎abcd⇥e⏎ab⇥⇥c', '····a⏎abcd····e⏎ab······c');
    });

    test('unexpand-tabs: a single separating space is not turned into a tab', () => {
      check('unexpand-tabs', 'abc·d', 'abc·d');
      check('unexpand-tabs', '········a', '⇥⇥a');
      check('unexpand-tabs', 'ab··cd', 'ab⇥cd');
      check('unexpand-tabs', 'ab·', 'ab·');
      check('unexpand-tabs', 'a⇥··b', 'a⇥··b');
    });

    test('expand-tabs and unexpand-tabs round trip on tab stop aligned text', () => {
      const text = ws('a⇥b⏎⇥⇥c');
      assert.strictEqual(run('unexpand-tabs', run('expand-tabs', text)), text);
    });
  });

  suite('B. lines / blank lines', () => {
    test('trim-leading treats NBSP as whitespace', () => {
      assert.strictEqual(run('trim-leading', '  a\n\tb '), 'a\nb ');
    });

    test('collapse-blank-lines keeps a single blank line as is', () => {
      check('collapse-blank-lines', 'a⏎··⏎b', 'a⏎··⏎b');
      check('collapse-blank-lines', 'a⏎··⏎⇥⏎b', 'a⏎⏎b');
    });

    test('blank-line-between does not add blank lines next to existing ones (idempotent)', () => {
      check('blank-line-between', 'a⏎b⏎⏎c', 'a⏎⏎b⏎⏎c');
      const once = run('blank-line-between', ws('a⏎b⏎c'));
      assert.strictEqual(run('blank-line-between', once), once);
    });

    test('remove-trailing-blank-lines: whitespace-only lines count as blank; all blank gives an empty string', () => {
      check('remove-trailing-blank-lines', 'a⏎··⏎⇥', 'a');
      check('remove-trailing-blank-lines', '··⏎⏎', '');
      check('remove-trailing-blank-lines', 'a⏎b', 'a⏎b');
    });

    test('remove-trailing-blank-lines: a selection followed by more lines keeps one final line break', () => {
      const followed = { followedByLine: true };
      // Whole lines `a` and `b` selected with `z` below: nothing to remove, `z` is not joined.
      check('remove-trailing-blank-lines', 'a⏎b⏎', 'a⏎b⏎', followed);
      check('remove-trailing-blank-lines', 'a⏎⏎⏎', 'a⏎', followed);
      check('remove-trailing-blank-lines', 'a⏎··⏎⇥⏎', 'a⏎', followed);
      // Only blank whole lines selected: they are removed completely.
      check('remove-trailing-blank-lines', '⏎··⏎', '', followed);
      // A selection that does not end with a line break is not affected by the flag.
      check('remove-trailing-blank-lines', 'a⏎··', 'a', followed);
      checkCrlf('remove-trailing-blank-lines', 'a⏎⏎', 'a⏎', followed);
    });

    test('a BOM (U+FEFF) is not whitespace for the line-wise commands', () => {
      assert.strictEqual(run('trim-leading', '\ufeffa'), '\ufeffa');
      assert.strictEqual(run('clear-blank-only-lines', 'a\n\ufeff\nb'), 'a\n\ufeff\nb');
      assert.strictEqual(run('remove-trailing-blank-lines', 'a\n\ufeff'), 'a\n\ufeff');
      assert.strictEqual(run('collapse-blank-lines', 'a\n\ufeff\n\ufeff\nb'), 'a\n\ufeff\n\ufeff\nb');
    });

    test('remove-leading-blank-lines: all blank gives an empty string', () => {
      check('remove-leading-blank-lines', '··⏎⏎', '');
      check('remove-leading-blank-lines', '⏎··⏎a', 'a');
    });

    // Selections starting in the middle of a non-empty line: the first segment is the rest of
    // a line outside the selection and must not be joined with the lines after the selection.
    const midLine = { precededByText: true, followedByText: true };
    const midLineToEnd = { precededByText: true };

    test('remove-trailing-blank-lines: a selection starting mid-line and followed by text keeps one line break', () => {
      check('remove-trailing-blank-lines', '⏎⏎⏎', '⏎', midLine); // ab|⏎⏎⏎|z -> ab⏎z
      check('remove-trailing-blank-lines', '⏎', '⏎', midLine); // a|⏎|z unchanged
      check('remove-trailing-blank-lines', '··⏎', '··⏎', midLine);
      check('remove-trailing-blank-lines', '··⏎⏎', '··⏎', midLine); // the first segment is never removed
      check('remove-trailing-blank-lines', '⏎⏎··', '⏎', midLine); // ends in the middle of a line
      check('remove-trailing-blank-lines', 'ab⏎⏎··', 'ab⏎', midLine); // x|ab⏎⏎··|z -> xab⏎z
      check('remove-trailing-blank-lines', '⏎c', '⏎c', midLine);
      check('remove-trailing-blank-lines', '··', '', midLine); // no line break: as before
    });

    test('remove-trailing-blank-lines: a selection starting mid-line and not followed by text behaves as before', () => {
      check('remove-trailing-blank-lines', '⏎⏎⏎', '', midLineToEnd);
      check('remove-trailing-blank-lines', '⏎⏎··', '', midLineToEnd);
      check('remove-trailing-blank-lines', '··⏎', '', midLineToEnd);
      // Ends at the start of an empty line.
      check('remove-trailing-blank-lines', '⏎⏎⏎', '', { precededByText: true, followedByLine: true });
    });

    test('remove-leading-blank-lines: a selection starting mid-line and followed by text keeps one line break', () => {
      check('remove-leading-blank-lines', '⏎⏎⏎', '⏎', midLine); // ab|⏎⏎⏎|z -> ab⏎z
      check('remove-leading-blank-lines', '⏎', '⏎', midLine); // a|⏎|z unchanged
      check('remove-leading-blank-lines', '··⏎', '··⏎', midLine);
      check('remove-leading-blank-lines', '··⏎⏎', '··⏎', midLine);
      check('remove-leading-blank-lines', '⏎⏎··', '⏎', midLine);
      check('remove-leading-blank-lines', '⏎⏎⏎c⏎', '⏎c⏎', midLine);
      check('remove-leading-blank-lines', '⏎⏎c', '⏎c', midLine);
      check('remove-leading-blank-lines', 'ab⏎⏎⏎', 'ab⏎⏎⏎', midLine); // the first line is not blank
      check('remove-leading-blank-lines', '··', '', midLine); // no line break: as before
    });

    test('remove-leading-blank-lines: a selection starting mid-line and not followed by text', () => {
      // Only blank lines up to the end of the document / line: as before.
      check('remove-leading-blank-lines', '⏎⏎⏎', '', midLineToEnd);
      check('remove-leading-blank-lines', '⏎', '', midLineToEnd);
      check('remove-leading-blank-lines', '··⏎⏎', '', midLineToEnd);
      // Non-blank lines follow: they are not joined to the line before the selection.
      check('remove-leading-blank-lines', '⏎c', '⏎c', midLineToEnd);
      check('remove-leading-blank-lines', '⏎⏎c', '⏎c', midLineToEnd);
      check('remove-leading-blank-lines', '··⏎⏎c', '··⏎c', midLineToEnd);
      check('remove-leading-blank-lines', '⏎⏎⏎c⏎', '⏎c⏎', midLineToEnd);
      check('remove-leading-blank-lines', 'ab⏎⏎c', 'ab⏎⏎c', midLineToEnd);
    });

    test('remove-trailing / leading-blank-lines: selections starting mid-line keep CRLF', () => {
      checkCrlf('remove-trailing-blank-lines', '⏎⏎⏎', '⏎', midLine);
      checkCrlf('remove-leading-blank-lines', '⏎⏎⏎', '⏎', midLine);
    });

    // Selections starting at the start of a line and ending inside the indentation of a later
    // line (`followedByText` only): the following text must not be joined with the last kept line.
    const lineStartToText = { followedByText: true };

    test('remove-trailing-blank-lines: a selection starting at a line start and ending inside the indentation keeps one line break', () => {
      check('remove-trailing-blank-lines', 'a⏎⏎··', 'a⏎', lineStartToText); // |a⏎⏎··|z -> a⏎z
      check('remove-trailing-blank-lines', 'a⏎··', 'a⏎', lineStartToText); // |a⏎··|z -> a⏎z
      check('remove-trailing-blank-lines', 'a⏎⏎⏎··', 'a⏎', lineStartToText);
      check('remove-trailing-blank-lines', 'a⏎b⏎⏎·', 'a⏎b⏎', lineStartToText);
      // The selected part of the last line contains non-whitespace: unchanged.
      check('remove-trailing-blank-lines', 'a⏎bc', 'a⏎bc', lineStartToText);
      check('remove-trailing-blank-lines', 'a⏎⏎b', 'a⏎⏎b', lineStartToText);
      // Only whitespace selected: removed completely (the line break before it is outside the selection).
      check('remove-trailing-blank-lines', '⏎⏎··', '', lineStartToText); // x⏎|⏎⏎··|z -> x⏎z
      check('remove-trailing-blank-lines', '··⏎⇥', '', lineStartToText);
      check('remove-trailing-blank-lines', '··', '', lineStartToText); // no line break: as before
    });

    test('remove-trailing-blank-lines: a selection ending at the start of a non-empty line behaves as before', () => {
      const lineStartToLine = { followedByLine: true, followedByText: true };
      check('remove-trailing-blank-lines', 'a⏎⏎⏎', 'a⏎', lineStartToLine);
      check('remove-trailing-blank-lines', 'a⏎b⏎', 'a⏎b⏎', lineStartToLine);
      check('remove-trailing-blank-lines', '⏎··⏎', '', lineStartToLine);
    });

    test('remove-trailing-blank-lines: a selection starting at a line start and ending inside the indentation keeps CRLF', () => {
      checkCrlf('remove-trailing-blank-lines', 'a⏎⏎··', 'a⏎', lineStartToText);
      checkCrlf('remove-trailing-blank-lines', 'a⏎··', 'a⏎', lineStartToText);
      checkCrlf('remove-trailing-blank-lines', '⏎⏎··', '', lineStartToText);
    });

    test('remove-trailing / leading-blank-lines: selections starting mid-line return the text as is when nothing is removed', () => {
      assert.strictEqual(run('remove-leading-blank-lines', '\r\nc', midLineToEnd), '\r\nc');
      assert.strictEqual(run('remove-leading-blank-lines', '\r\n', midLine), '\r\n');
      assert.strictEqual(run('remove-trailing-blank-lines', '\r\nc', midLine), '\r\nc');
    });

    test('clear-blank-only-lines keeps the number of lines', () => {
      check('clear-blank-only-lines', '··⏎a⏎⇥', '⏎a⏎');
    });
  });

  suite('C. whitespace characters', () => {
    test('remove-all also removes NBSP and CR/LF', () => {
      assert.strictEqual(run('remove-all', 'a b\r\nc'), 'abc');
    });

    test('nbsp-to-space replaces the documented special spaces only', () => {
      const targets = '\u00a0\u1680\u2000\u2001\u2002\u2003\u2004\u2005\u2006\u2007\u2008\u2009\u200a\u202f\u205f';
      assert.strictEqual(targets.length, 15);
      assert.strictEqual(run('nbsp-to-space', targets), ' '.repeat(targets.length));
      // Ideographic space, zero width space and BOM are not targets.
      assert.strictEqual(run('nbsp-to-space', 'a\u3000b\u200bc\ufeffd'), 'a\u3000b\u200bc\ufeffd');
    });

    test('visualize leaves line breaks and other whitespace alone', () => {
      assert.strictEqual(run('visualize', ' \n\t '), '·\n→ ');
    });

    test('visualize → unvisualize restores text without · and →', () => {
      const text = '  a\tb \n\t c';
      assert.strictEqual(run('unvisualize', run('visualize', text)), text);
    });

    test('unvisualize also converts · and → that were in the original text (not reversible)', () => {
      assert.strictEqual(run('unvisualize', 'x·y →'), 'x y \t');
    });

    test('collapse-inline keeps the indent, single tabs and trailing single spaces', () => {
      check('collapse-inline', '⇥··a⇥b··⇥c·', '⇥··a⇥b·c·');
      check('collapse-inline', 'a···', 'a·');
    });
  });

  suite('D. wrapping', () => {
    test('unwrap-paragraphs keeps the first indent and trims joined lines', () => {
      check('unwrap-paragraphs', '··a··⏎···b⏎··⏎c', '··a·b⏎··⏎c');
    });

    test('hard-wrap keeps the indent on wrapped lines and existing line breaks', () => {
      check('hard-wrap-n', '··aa·bb·cc⏎x', '··aa⏎··bb⏎··cc⏎x', { n: 6 });
    });

    test('hard-wrap does not split a word longer than the width', () => {
      check('hard-wrap-n', 'abcdefgh·ij', 'abcdefgh⏎ij', { n: 5 });
    });

    test('hard-wrap leaves lines within the width untouched', () => {
      check('hard-wrap-n', 'a···b', 'a···b', { n: 10 });
    });

    test('hard-wrap counts code points (a surrogate pair is one column)', () => {
      assert.strictEqual(run('hard-wrap-n', '\u{1F600}\u{1F600}\u{1F600} a', { n: 5 }), '\u{1F600}\u{1F600}\u{1F600} a');
    });
  });

  suite('E. alignment', () => {
    test('center-align / right-align: whitespace-only lines become empty', () => {
      check('center-align', '··a⏎abcde⏎···', '··a⏎abcde⏎');
      check('right-align', '·a·⏎abc', '··a⏎abc');
    });

    test('align-equals keeps compound operators together', () => {
      check('align-equals', 'a·+=·1⏎bbb·=·2', 'a···+=·1⏎bbb·=·2');
      check('align-equals', 'x·!=·y⏎long·=·1', 'x····!=·y⏎long·=·1');
      const input = ws('a·<=·b⏎a·>=·b⏎a·-=·1⏎a·*=·2⏎a·==·b⏎f·=·(x)·=>·x⏎a·:=·1⏎longer·=·3');
      const result = run('align-equals', input);
      ['+ =', '! =', '< =', '> =', '- =', '* =', '= =', '= >', ': ='].forEach((broken) => {
        assert.ok(!result.includes(broken), `${broken} in ${JSON.stringify(result)}`);
      });
      assert.strictEqual(result, ws('a······<=·b⏎a······>=·b⏎a······-=·1⏎a······*=·2⏎a······==·b⏎f······=·(x)·=>·x⏎a······:=·1⏎longer·=·3'));
    });

    test('align-equals leaves lines without = alone', () => {
      check('align-equals', 'a·=·1⏎//·comment⏎bbb=2', 'a···=·1⏎//·comment⏎bbb·=2');
    });

    test('align-colon does not split ::', () => {
      check('align-colon', 'std::string·x⏎a:·1', 'std::string·x⏎a:·1');
      check('align-colon', 'std::string·x:·1⏎b:·2', 'std::string·x:·1⏎b:·············2');
    });

    test('align-colon: an empty value is not padded', () => {
      check('align-colon', 'key:⏎a:·1', 'key:⏎a:···1');
    });

    test('align-comma: column widths come only from cells that are padded', () => {
      check('align-comma', 'a,b⏎ccc,d,e', 'a,··b⏎ccc,d,e');
      check('align-comma', 'a·,·b⏎no·commas', 'a,b⏎no·commas');
    });

    test('align-comma: empty trailing cells do not create trailing whitespace', () => {
      check('align-comma', 'a,⏎ccc,d', 'a,⏎ccc,d');
      check('align-comma', 'a,b,⏎ccc,dddd,e', 'a,··b,⏎ccc,dddd,e');
      check('align-comma', 'a,b,,⏎ccc,dddd,e,f', 'a,··b,,⏎ccc,dddd,e,f');
      // An empty cell in the middle is still padded.
      check('align-comma', 'a,,b⏎ccc,dd,e', 'a,··,··b⏎ccc,dd,e');
    });

    test('align-custom treats the delimiter literally', () => {
      check('align-custom', 'a.*b⏎cc.*d', 'a··.*b⏎cc·.*d', { delimiter: '.*' });
      // Documented limitation: a literal `=` delimiter can split `+=` (use align-equals for code).
      check('align-custom', 'a·+=·1⏎bb·=·2', 'a·+·=·1⏎bb··=·2', { delimiter: '=' });
    });

    const idempotent: [WhitespaceCommand, string, Partial<WhitespaceOptions>?][] = [
      ['align-equals', 'a = 1\nbbb = 2'],
      ['align-equals', 'a += 1\nbbb = 2\nx != y\nf = (x) => x\ny <= z'],
      ['align-colon', 'a: 1\nbbb: 2\nstd::x: 3'],
      ['align-comma', 'a,bb,c\nccc,d,e'],
      ['align-comma', 'a,b\nccc,d,e'],
      ['align-comma', 'a,b,\nccc,dddd,e'],
      ['align-custom', 'a => 1\nbb => 2', { delimiter: '=>' }],
    ];
    idempotent.forEach(([command, input, options]) => {
      test(`${command} is idempotent: ${JSON.stringify(input)}`, () => {
        const once = run(command, input, options);
        assert.strictEqual(run(command, once, options), once);
      });
    });
  });

  suite('F. spaces around symbols', () => {
    const operatorCases: [string, string][] = [
      ['a=b+c', 'a·=·b·+·c'],
      ['a···=····b', 'a·=·b'],
      ['x=a===b&&c!==d||e', 'x·=·a·===·b·&&·c·!==·d·||·e'],
      ['a+=1;b-=2;c**=3', 'a·+=·1;·b·-=·2;·c·**=·3'.replace(/;·/g, ';')],
      ['f=(x)=>x*2', 'f·=·(x)·=>·x·*·2'],
      ['x=-1', 'x·=·-1'],
      ['f(-a,*args,**kwargs)', 'f(-a,*args,**kwargs)'],
      ['return·-1', 'return·-1'],
      ['case·-1:', 'case·-1:'],
      ['yield·*gen', 'yield·*gen'],
      ['function*·g(){}', 'function*·g(){}'],
      ['function·*g(){}', 'function·*g(){}'],
      ['async·function*·g(){}', 'async·function*·g(){}'],
      ['f=function*(){}', 'f·=·function*(){}'],
      ['typeof·-x', 'typeof·-x'],
      ['x=a·in·-b', 'x·=·a·in·-b'],
      ['ret·-1', 'ret·-·1'],
      ['areturn·-1', 'areturn·-·1'],
      ['x=1e-5+2E+3', 'x·=·1e-5·+·2E+3'],
      ['x=0x1e-5', 'x·=·0x1e·-·5'],
      ['s="a+b"+\'c=d\'', 's·=·"a+b"·+·\'c=d\''],
      ['s="a\\"+b"', 's·=·"a\\"+b"'],
      ['a=b//c=d', 'a·=·b//c=d'],
      ['a=/*b+c*/d', 'a·=·/*b+c*/d'],
      ['i++;j--;a<b;c>d;e?f:g;h->i;j::k', 'i++;j--;a<b;c>d;e?f:g;h->i;j::k'],
      ['a<<=1;b>>=2;c>>>d;e??=f', 'a<<=1;b>>=2;c>>>d;e??=f'],
      ['····x=1', '····x·=·1'],
      ['····-x', '····-x'],
      ['a=', 'a·='],
      ['a=··', 'a·=··'],
      ['x=`${`a+b`}+c`+d', 'x·=·`${`a+b`}+c`·+·d'],
    ];
    operatorCases.forEach(([input, expected]) => {
      test(`space-around-operators: ${input}`, () => check('space-around-operators', input, expected));
    });

    test('space-around-operators: template literal across lines', () => {
      check('space-around-operators', 'x=`a+b⏎c+d`+e', 'x·=·`a+b⏎c+d`·+·e');
    });

    test('space-around-operators: block comment across lines', () => {
      check('space-around-operators', 'a=1/*x+y⏎z=w*/b+c⏎c=d', 'a·=·1/*x+y⏎z=w*/b·+·c⏎c·=·d');
    });

    test('space-around-operators is idempotent', () => {
      const once = run('space-around-operators', 'a=b+c*d-(-e)/f%g;x+=`t+${u}`');
      assert.strictEqual(run('space-around-operators', once), once);
    });

    test('remove-space-before-punctuation keeps indentation', () => {
      check('remove-space-before-punctuation', 'a⏎··.foo()⏎b·;·c·:·d·?', 'a⏎··.foo()⏎b;·c:·d?');
      check('remove-space-before-punctuation', '·.a', '·.a');
    });

    test('space-after-comma does not add a space at the end of a line or before whitespace', () => {
      check('space-after-comma', 'a,⏎b,·c,⇥d', 'a,⏎b,·c,⇥d');
      check('space-after-comma', '1,000', '1,·000');
    });
  });

  suite('trailing line break of the selection', () => {
    const cases: [WhitespaceCommand, string, string, Partial<WhitespaceOptions>?][] = [
      ['collapse-blank-lines', 'a⏎⏎', 'a⏎⏎'],
      ['collapse-blank-lines', 'a⏎⏎⏎', 'a⏎⏎'],
      ['blank-line-between', 'a⏎b⏎', 'a⏎⏎b⏎'],
      ['clear-blank-only-lines', 'a⏎··⏎', 'a⏎⏎'],
      ['unwrap-paragraphs', 'a⏎b⏎', 'a·b⏎'],
      ['remove-leading-blank-lines', '⏎⏎a⏎', 'a⏎'],
      ['indent-n', 'a⏎', '····a⏎', { n: 4 }],
      ['pad-to-longest', 'a⏎abc⏎', 'a··⏎abc⏎'],
      ['dedent', '··a⏎····b⏎', 'a⏎··b⏎'],
      // WS-025 exception: the selection reaches the end of the document (see the followedByLine tests).
      ['remove-trailing-blank-lines', 'a⏎b⏎', 'a⏎b'],
      ['remove-trailing-blank-lines', 'a⏎b⏎', 'a⏎b⏎', { followedByLine: true }],
      ['center-align', 'a⏎abc⏎', '·a⏎abc⏎'],
      ['right-align', 'a⏎abc⏎', '··a⏎abc⏎'],
      ['align-equals', 'a=1⏎bb=2⏎', 'a··=1⏎bb·=2⏎'],
      ['align-colon', 'a:1⏎bb:2⏎', 'a:··1⏎bb:·2⏎'],
      ['align-comma', 'a,b⏎cc,d⏎', 'a,·b⏎cc,d⏎'],
      ['align-custom', 'a->1⏎bb->2⏎', 'a··->1⏎bb·->2⏎', { delimiter: '->' }],
      ['tabs-to-spaces-2', '⇥a⏎', '··a⏎'],
      ['tabs-to-spaces-4', '⇥a⏎', '····a⏎'],
      ['spaces-to-tabs-2', '··a⏎', '⇥a⏎'],
      ['spaces-to-tabs-4', '····a⏎', '⇥a⏎'],
      ['reindent-2-to-4', '··a⏎', '····a⏎'],
      ['reindent-4-to-2', '····a⏎', '··a⏎'],
      ['trim-leading', '··a⏎', 'a⏎'],
      ['collapse-inline', 'a··b⏎', 'a·b⏎'],
      ['space-around-operators', 'a=b⏎', 'a·=·b⏎'],
      ['outdent-n', '··a⏎', 'a⏎', { n: 2 }],
      ['expand-tabs', 'a⇥b⏎', 'a···b⏎'],
      ['unexpand-tabs', 'a···b⏎', 'a⇥b⏎'],
      ['hard-wrap-n', 'aa·bb⏎', 'aa⏎bb⏎', { n: 3 }],
    ];
    cases.forEach(([command, input, expected, options]) => {
      test(`${command}: ${input}`, () => check(command, input, expected, options));
    });

    test('hard-wrap-80: a 90 character line with a line break keeps exactly one line break at the end', () => {
      const result = run('hard-wrap-80', `${ninetyCharLine}\n`);
      assert.ok(result.endsWith('j\n') && !result.endsWith('\n\n'), JSON.stringify(result));
      assert.strictEqual(result.split('\n').length, 3);
    });

    test('remove-all removes the trailing line break; visualize keeps it', () => {
      assert.strictEqual(run('remove-all', 'a b\n'), 'ab');
      assert.strictEqual(run('visualize', 'a b\n'), 'a·b\n');
    });
  });

  suite('CRLF', () => {
    test('line-wise commands keep CRLF line breaks', () => {
      checkCrlf('blank-line-between', 'a⏎b⏎', 'a⏎⏎b⏎');
      checkCrlf('hard-wrap-n', 'aa·bb·cc', 'aa·bb⏎cc', { n: 5 });
      checkCrlf('collapse-blank-lines', 'a⏎⏎⏎b', 'a⏎⏎b');
      checkCrlf('remove-trailing-blank-lines', 'a⏎⏎', 'a'); // selection reaching the end of the document
      checkCrlf('remove-leading-blank-lines', '⏎a⏎', 'a⏎');
      checkCrlf('unwrap-paragraphs', 'a⏎b⏎⏎c', 'a·b⏎⏎c');
      checkCrlf('align-equals', 'a=1⏎bb=2', 'a··=1⏎bb·=2');
      checkCrlf('space-around-operators', 'x=`a⏎b`+c', 'x·=·`a⏎b`·+·c');
      checkCrlf('remove-space-before-punctuation', 'a⏎··.b·,', 'a⏎··.b,');
    });
  });

  suite('input validation', () => {
    test('validateColumnInput accepts 1..1000 integers only', () => {
      ['1', '80', '1000', ' 42 '].forEach((value) => assert.strictEqual(validateColumnInput(value), undefined, value));
      ['0', '1001', '1.5', 'abc', '', '-1', '1e2'].forEach((value) => assert.notStrictEqual(validateColumnInput(value), undefined, value));
    });

    test('validateIndentInput accepts 1..100 integers only', () => {
      ['1', '4', '100'].forEach((value) => assert.strictEqual(validateIndentInput(value), undefined, value));
      ['0', '101', '2.0', 'x', '', '99999999999'].forEach((value) => assert.notStrictEqual(validateIndentInput(value), undefined, value));
    });

    test('validateDelimiterInput rejects empty, whitespace-only, multi-line and too long delimiters', () => {
      ['=>', ':', '.*', 'x'.repeat(100)].forEach((value) => assert.strictEqual(validateDelimiterInput(value), undefined, value));
      ['', '  ', '\t', 'a\nb', 'a\rb', 'x'.repeat(101)].forEach((value) => assert.notStrictEqual(validateDelimiterInput(value), undefined, JSON.stringify(value)));
    });
  });

  suite('output size limit (WS-017..WS-023, WS-031)', () => {
    const longLine = 'k'.repeat(100000);
    const manyLines = (line: string) => `\n${line}`.repeat(2000);
    const explosive: [WhitespaceCommand, string, Partial<WhitespaceOptions>?][] = [
      ['center-align', `${longLine}${manyLines('a')}`],
      ['right-align', `${longLine}${manyLines('a')}`],
      ['pad-to-longest', `${longLine}${manyLines('a')}`],
      ['align-equals', `${longLine}=1${manyLines('a=1')}`],
      ['align-colon', `${longLine}:1${manyLines('a:1')}`],
      ['align-comma', `${longLine},1${manyLines('a,1')}`],
      ['align-custom', `${longLine}=>1${manyLines('a=>1')}`, { delimiter: '=>' }],
      ['indent-n', 'a\n'.repeat(200000), { n: 100 }],
    ];
    explosive.forEach(([command, input, options]) => {
      test(`${command} refuses to add more than ${MAX_ADDED_LENGTH} characters, quickly`, () => {
        const start = Date.now();
        assert.throws(() => run(command, input, options), (error: unknown) => {
          assert.ok(error instanceof WhitespaceOutputTooLargeError, String(error));
          assert.ok(error.added > MAX_ADDED_LENGTH, String(error.added));
          assert.strictEqual(error.limit, MAX_ADDED_LENGTH);
          return true;
        });
        const elapsed = Date.now() - start;
        assert.ok(elapsed < 1000, `${command} took ${elapsed} ms`);
      });
    });

    test('maxAddedLength lowers the limit; a result exactly at the limit is allowed', () => {
      assert.strictEqual(run('pad-to-longest', 'a\nabc', { maxAddedLength: 2 }), 'a  \nabc');
      assert.throws(() => run('pad-to-longest', 'a\nabc', { maxAddedLength: 1 }), WhitespaceOutputTooLargeError);
      assert.strictEqual(run('indent-n', 'a\nb', { n: 3, maxAddedLength: 6 }), '   a\n   b');
      assert.throws(() => run('indent-n', 'a\nb', { n: 3, maxAddedLength: 5 }), WhitespaceOutputTooLargeError);
    });

    test('commands that do not pad ignore the limit', () => {
      assert.strictEqual(run('trim-leading', '  a', { maxAddedLength: 0 }), 'a');
      assert.strictEqual(run('expand-tabs', 'a\tb', { maxAddedLength: 0 }), 'a   b');
    });
  });

  suite('performance (linear time on large inputs)', () => {
    const longSpaces = ' '.repeat(200000);
    const inputs: Record<string, string> = {
      'long run of spaces': `${longSpaces}x${longSpaces},${longSpaces}`,
      'many operators': 'a+'.repeat(100000) + 'b',
      'many words': 'ab '.repeat(100000),
      'space comma pairs': ' ,'.repeat(100000),
      'many lines': '  x = 1\n'.repeat(50000),
      'compound operator chars': '+'.repeat(200000) + '=',
    };
    Object.entries(inputs).forEach(([name, input]) => {
      test(`all commands finish within 1 second: ${name}`, () => {
        WHITESPACE_COMMANDS.forEach((command) => {
          const start = Date.now();
          run(command, input, { n: 4, delimiter: '=>' });
          const elapsed = Date.now() - start;
          assert.ok(elapsed < 1000, `${command} took ${elapsed} ms`);
        });
      });
    });
  });
});
