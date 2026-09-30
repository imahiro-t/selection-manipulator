import * as assert from 'assert';
import {
  countLineStats,
  extractBetweenMarkers,
  formatLineStats,
  LINE_ANCHORED_COMMANDS,
  LINE_CLIPBOARD_COMMANDS,
  LINE_COMMANDS,
  LINE_INPUT_COMMANDS,
  LineOptions,
  LineOutputTooLargeError,
  LineTransformCommand,
  lineTransforms,
  MAX_ADDED_LENGTH,
  splitSelectionLines,
  validateLineCountInput,
  validateLineDelimiterInput,
  validateLineRegexInput,
  validateLineTextInput,
  validateLineWidthInput,
} from '../../handler/lineTransforms';

/**
 * Notation used in this file (same as the examples of the showcase data, scripts/showcase-data/):
 * `·` = space, `⇥` = tab, `⏎` = line break.
 */
const ws = (s: string): string => s.replace(/·/g, ' ').replace(/⇥/g, '\t').replace(/⏎/g, '\n');

/** LINE-003 / LINE-004 get the regex results from the handler; here a line "matches" when it contains a digit. */
const digitMatches = (text: string): boolean[] => splitSelectionLines(text).map((line) => /[0-9]/.test(line));

const run = (command: LineTransformCommand, input: string, options: Partial<LineOptions> = {}): string =>
  lineTransforms[command](input, {
    eol: '\n',
    ...(command === 'filter-regex' || command === 'filter-not-regex' ? { regexMatches: digitMatches(input) } : {}),
    ...options,
  });

const check = (command: LineTransformCommand, input: string, expected: string, options: Partial<LineOptions> = {}) =>
  assert.strictEqual(run(command, ws(input), options), ws(expected), `${command}: ${JSON.stringify(input)}`);

const checkCrlf = (command: LineTransformCommand, input: string, expected: string, options: Partial<LineOptions> = {}) =>
  assert.strictEqual(
    run(command, ws(input).replace(/\n/g, '\r\n'), { eol: '\r\n', ...options }),
    ws(expected).replace(/\n/g, '\r\n'),
    `${command} (CRLF): ${JSON.stringify(input)}`
  );

const TRANSFORM_COMMANDS = LINE_COMMANDS.filter((command) => command !== 'count-stats') as LineTransformCommand[];

/** Values for the input commands, used by the generic tests. */
const INPUTS: Partial<LineOptions> = { text: 'x', n: 2, delimiter: ',', startMarker: 'BEGIN', endMarker: 'END' };

/** Same regex as the existing "Text - Remove Line Numbers" command. */
const removeLineNumbers = (text: string): string =>
  text.split(/\r\n|\r|\n/).map((line) => line.replace(/^\s*[\[\(]?\d+[\]\)]?[:.]?\s+/, '')).join('\n');

suite('Line Transforms (LINE-001..034) Test Suite', () => {

  test('the command tables have the expected sizes', () => {
    assert.strictEqual(LINE_COMMANDS.length, 34);
    assert.strictEqual(new Set(LINE_COMMANDS).size, 34);
    assert.deepStrictEqual([...TRANSFORM_COMMANDS].sort(), Object.keys(lineTransforms).sort());
    assert.strictEqual(LINE_INPUT_COMMANDS.length, 14);
    assert.deepStrictEqual(LINE_CLIPBOARD_COMMANDS, [
      'filter-contains', 'filter-regex', 'keep-duplicates', 'keep-unique-only', 'dedupe-adjacent', 'extract-between-markers',
    ]);
  });

  test('LINE_ANCHORED_COMMANDS is exactly the 28 commands of plan 2-5 (category B)', () => {
    const categoryA = ['reverse-words', 'join-continuation', 'join-every-n', 'split-sentences', 'split-fixed-width'];
    const expected = TRANSFORM_COMMANDS.filter((command) => !categoryA.includes(command));
    assert.strictEqual(LINE_ANCHORED_COMMANDS.length, 28);
    assert.deepStrictEqual(LINE_ANCHORED_COMMANDS, expected);
  });

  test('every command returns an empty string for an empty string', () => {
    TRANSFORM_COMMANDS.forEach((command) => {
      assert.strictEqual(run(command, '', { ...INPUTS, regexMatches: [] }), '', command);
    });
  });

  suite('ROADMAP examples', () => {
    const examples: [LineTransformCommand, string, string, Partial<LineOptions>?][] = [
      ['filter-contains', 'apple⏎banana⏎cherry', 'banana', { text: 'an' }],
      ['filter-not-contains', 'apple⏎banana⏎cherry', 'apple⏎cherry', { text: 'an' }],
      ['filter-regex', 'a1⏎b⏎c2', 'a1⏎c2'],
      ['filter-not-regex', 'a1⏎b⏎c2', 'b'],
      ['add-numbers', 'a⏎b', '1:·a⏎2:·b'],
      ['add-numbers-padded', 'a⏎b⏎c⏎d⏎e⏎f⏎g⏎h⏎i⏎j', '01·a⏎02·b⏎03·c⏎04·d⏎05·e⏎06·f⏎07·g⏎08·h⏎09·i⏎10·j'],
      ['keep-duplicates', 'a⏎b⏎a⏎c⏎b', 'a⏎b'],
      ['keep-unique-only', 'a⏎b⏎a', 'b'],
      ['dedupe-ignore-case', 'Apple⏎apple⏎b', 'Apple⏎b'],
      ['dedupe-ignore-whitespace', 'a⏎··a⏎b', 'a⏎b'],
      ['dedupe-adjacent', 'a⏎a⏎b⏎a', 'a⏎b⏎a'],
      ['reverse-words', 'a·b·c⏎d·e', 'c·b·a⏎e·d'],
      ['rotate', 'a⏎b⏎c', 'c⏎a⏎b'],
      ['keep-every-nth', 'a⏎b⏎c⏎d', 'b⏎d', { n: 2 }],
      ['remove-every-nth', 'a⏎b⏎c⏎d', 'a⏎c', { n: 2 }],
      ['keep-odd', 'a⏎b⏎c', 'a⏎c'],
      ['keep-even', 'a⏎b⏎c', 'b'],
      ['head', 'a⏎b⏎c', 'a⏎b', { n: 2 }],
      ['tail', 'a⏎b⏎c', 'b⏎c', { n: 2 }],
      ['duplicate-each', 'a⏎b', 'a⏎a⏎b⏎b'],
      ['swap-pairs', 'a⏎b⏎c⏎d⏎e', 'b⏎a⏎d⏎c⏎e'],
      ['join-continuation', 'ls·\\⏎··-l⏎pwd', 'ls·-l⏎pwd'],
      ['move-matching-to-top', 'b⏎x1⏎c⏎x2', 'x1⏎x2⏎b⏎c', { text: 'x' }],
      ['remove-prefix', '-·a⏎-·b', 'a⏎b', { text: '- ' }],
      ['remove-suffix', 'a;⏎b;', 'a⏎b', { text: ';' }],
      ['interleave-halves', 'a⏎b⏎1⏎2', 'a⏎1⏎b⏎2'],
      ['join-every-n', 'a⏎b⏎c⏎d', 'a,b⏎c,d', { n: 2, delimiter: ',' }],
      ['split-sentences', 'Hello.·Bye!', 'Hello.⏎Bye!'],
      ['split-fixed-width', 'abcdef', 'ab⏎cd⏎ef', { n: 2 }],
      ['remove-comment-lines', '#·a⏎b⏎//·c', 'b'],
      ['extract-between-markers', 'x⏎BEGIN⏎a⏎END⏎y', 'a', { startMarker: 'BEGIN', endMarker: 'END' }],
      ['extract-longest', 'a⏎abc⏎ab', 'abc'],
      ['extract-shortest', 'abc⏎a⏎ab', 'a'],
    ];

    test('the examples cover all 33 transforms', () => {
      assert.deepStrictEqual(examples.map(([command]) => command), TRANSFORM_COMMANDS);
    });

    examples.forEach(([command, input, expected, options]) => {
      test(`${command}: ${input}`, () => check(command, input, expected, options));
    });

    test('LINE-031 count-stats: `a b⏎c` → 2 lines, 3 words, 5 chars', () => {
      assert.strictEqual(formatLineStats(countLineStats(ws('a·b⏎c')), 1), '2 lines, 3 words, 5 chars');
    });
  });

  suite('common rules', () => {
    test('one trailing line break is kept (as the document EOL) when the result is not empty', () => {
      check('rotate', 'a⏎b⏎', 'b⏎a⏎');
      check('filter-contains', 'a⏎b⏎', 'a⏎', { text: 'a' });
      checkCrlf('rotate', 'a⏎b⏎', 'b⏎a⏎');
    });

    test('an empty result gets no line break (deleting whole lines does not join the next line)', () => {
      check('filter-contains', 'a⏎b⏎', '', { text: 'z' });
      check('remove-comment-lines', '#a⏎//b⏎', '');
    });

    test('lines are joined with the document EOL (mixed line breaks are normalized)', () => {
      assert.strictEqual(run('rotate', 'a\r\nb\nc', { eol: '\r\n' }), 'c\r\na\r\nb');
      assert.strictEqual(run('rotate', 'a\rb', { eol: '\n' }), 'b\na');
    });

    test('an empty line in the selection is a line', () => {
      check('keep-duplicates', '⏎a⏎⏎b', '');
      check('keep-duplicates', 'a⏎⏎b⏎⏎c', '');
      check('keep-unique-only', 'a⏎⏎b⏎⏎', 'a⏎b⏎');
      check('dedupe-adjacent', 'a⏎⏎⏎b', 'a⏎⏎b');
    });
  });

  suite('filters (LINE-001..004, 030)', () => {
    test('LINE-001 / 002: literal, case-sensitive matching', () => {
      check('filter-contains', 'Apple⏎apple⏎a.b', 'apple', { text: 'app' });
      check('filter-contains', 'a.b⏎axb', 'a.b', { text: '.' });
      check('filter-not-contains', 'Apple⏎apple', 'Apple', { text: 'app' });
    });

    test('LINE-003 / 004 use the per-line results given by the handler', () => {
      check('filter-regex', 'a⏎b⏎c', 'a⏎c', { regexMatches: [true, false, true] });
      check('filter-not-regex', 'a⏎b⏎c', 'b', { regexMatches: [true, false, true] });
    });

    test('LINE-003 throws when the regex results do not match the lines', () => {
      assert.throws(() => run('filter-regex', 'a\nb', { regexMatches: [true] }));
      assert.throws(() => run('filter-regex', 'a\nb', { regexMatches: undefined }));
    });

    test('LINE-030: # and // after leading whitespace', () => {
      check('remove-comment-lines', '··#·a⏎⇥//b⏎a·#·b⏎/·c⏎c', 'a·#·b⏎/·c⏎c');
    });
  });

  suite('numbering (LINE-005 / 006)', () => {
    test('LINE-005 numbers every line from 1', () => {
      check('add-numbers', 'a⏎⏎c', '1:·a⏎2:·⏎3:·c');
    });

    test('LINE-006 pads to the number of digits of the line count', () => {
      check('add-numbers-padded', 'a', '1·a');
      check('add-numbers-padded', 'a⏎b', '1·a⏎2·b');
    });

    test('the existing Remove Line Numbers command removes the added numbers again', () => {
      const input = 'alpha\nbeta gamma\n#x\n(y)\nz\nw\nv\nu\nt\ns\nr';
      assert.strictEqual(removeLineNumbers(run('add-numbers', input)), input);
      assert.strictEqual(removeLineNumbers(run('add-numbers-padded', input)), input);
    });
  });

  suite('duplicates (LINE-007..011)', () => {
    test('LINE-007 keeps each duplicated line once in order of first appearance', () => {
      check('keep-duplicates', 'b⏎a⏎a⏎b⏎b⏎c', 'b⏎a');
      check('keep-duplicates', 'a⏎b', '');
    });

    test('LINE-009 compares with toLowerCase and keeps the first line', () => {
      check('dedupe-ignore-case', 'aBc⏎ABC⏎abc⏎d', 'aBc⏎d');
    });

    test('LINE-010 ignores leading / trailing whitespace but not inner whitespace', () => {
      check('dedupe-ignore-whitespace', '··a·b⇥⏎a·b⏎a··b', '··a·b⇥⏎a··b');
    });
  });

  suite('reordering and positions (LINE-012..021, 023, 026)', () => {
    test('LINE-012 keeps the whitespace in place', () => {
      check('reverse-words', '··a·b⇥c··', '··c·b⇥a··');
      check('reverse-words', 'one⏎⏎··', 'one⏎⏎··');
    });

    test('LINE-013 leaves one line unchanged', () => {
      check('rotate', 'a', 'a');
    });

    test('LINE-014 / 015 with N = 1 and N larger than the line count', () => {
      check('keep-every-nth', 'a⏎b', 'a⏎b', { n: 1 });
      check('remove-every-nth', 'a⏎b', '', { n: 1 });
      check('keep-every-nth', 'a⏎b', '', { n: 5 });
      check('keep-every-nth', 'a⏎b⏎c⏎d⏎e⏎f', 'c⏎f', { n: 3 });
    });

    test('LINE-018 / 019: N at or above the line count leaves the lines unchanged', () => {
      check('head', 'a⏎b', 'a⏎b', { n: 2 });
      check('tail', 'a⏎b', 'a⏎b', { n: 10 });
      check('head', 'a⏎b⏎c', 'a', { n: 1 });
      check('tail', 'a⏎b⏎c', 'c', { n: 1 });
    });

    test('LINE-021 keeps the last line of an odd count', () => {
      check('swap-pairs', 'a', 'a');
      check('swap-pairs', 'a⏎b⏎c', 'b⏎a⏎c');
    });

    test('LINE-023 is a stable partition', () => {
      check('move-matching-to-top', 'a⏎xb⏎c⏎xd⏎e', 'xb⏎xd⏎a⏎c⏎e', { text: 'x' });
      check('move-matching-to-top', 'a⏎b', 'a⏎b', { text: 'x' });
    });

    test('LINE-026 with an odd line count ends with the last line of the first half', () => {
      check('interleave-halves', 'a⏎b⏎c⏎1⏎2', 'a⏎1⏎b⏎2⏎c');
      check('interleave-halves', 'a', 'a');
    });
  });

  suite('prefix / suffix (LINE-024 / 025)', () => {
    test('removed once, only as an exact literal match', () => {
      check('remove-prefix', '--a⏎·-b⏎-c', '-a⏎·-b⏎c', { text: '-' });
      check('remove-suffix', 'a;;⏎b;·⏎c;', 'a;⏎b;·⏎c', { text: ';' });
    });
  });

  suite('joining and splitting (LINE-027..029)', () => {
    test('LINE-027: the last group may be shorter; an empty delimiter joins directly', () => {
      check('join-every-n', 'a⏎b⏎c⏎d⏎e', 'a,b⏎c,d⏎e', { n: 2, delimiter: ',' });
      check('join-every-n', 'a⏎b⏎c', 'abc', { n: 5, delimiter: '' });
      check('join-every-n', 'a⏎b⏎c', 'a·|·b·|·c', { n: 3, delimiter: ' | ' });
    });

    test('LINE-028: sentence ends, closing quotes and brackets, 。, and no split before a non-space', () => {
      check('split-sentences', 'Is·it?··Yes!!·Ok.', 'Is·it?⏎Yes!!⏎Ok.');
      check('split-sentences', 'He·said·"Hi."·Then·left.', 'He·said·"Hi."⏎Then·left.');
      check('split-sentences', '(Done.)·Next', '(Done.)⏎Next');
      check('split-sentences', 'pi·is·3.14·ok', 'pi·is·3.14·ok');
      check('split-sentences', 'はい。「いいえ。」ですか？', 'はい。⏎「いいえ。」⏎ですか？');
      check('split-sentences', 'End.··', 'End.··');
      check('split-sentences', 'a.·b⏎c.·d', 'a.⏎b⏎c.⏎d');
    });

    test('LINE-029 counts code points and keeps empty lines', () => {
      check('split-fixed-width', 'abcde⏎⏎ab', 'ab⏎cd⏎e⏎⏎ab', { n: 2 });
      assert.strictEqual(run('split-fixed-width', '😀😀😀', { n: 2 }), '😀😀\n😀');
    });
  });

  suite('LINE-022 join-continuation (odd / even backslashes, CRLF)', () => {
    test('an odd number of trailing backslashes continues the line', () => {
      check('join-continuation', 'a\\⏎b', 'ab');
      check('join-continuation', 'a\\\\\\⏎b', 'a\\\\b');
    });

    test('an even number (0 or 2) is literal', () => {
      check('join-continuation', 'a⏎b', 'a⏎b');
      check('join-continuation', 'a\\\\⏎b', 'a\\\\⏎b');
    });

    test('a backslash followed by a space does not continue the line', () => {
      check('join-continuation', 'a\\·⏎b', 'a\\·⏎b');
    });

    test('continuations chain; leading spaces / tabs of the next line are removed', () => {
      check('join-continuation', 'a·\\⏎b·\\⏎c', 'a·b·c');
      check('join-continuation', 'cmd·\\⏎⇥··--flag⏎next', 'cmd·--flag⏎next');
    });

    test('the last line and the line before the final line break are not continued', () => {
      check('join-continuation', 'a\\', 'a\\');
      check('join-continuation', 'a\\⏎', 'a\\⏎');
      check('join-continuation', 'a\\⏎b\\⏎', 'ab\\⏎');
    });

    test('CRLF: judged by the character before \\r\\n; kept line breaks stay CRLF', () => {
      assert.strictEqual(run('join-continuation', 'ls \\\r\n  -l\r\npwd', { eol: '\r\n' }), 'ls -l\r\npwd');
      assert.strictEqual(run('join-continuation', 'a\\\\\r\nb', { eol: '\r\n' }), 'a\\\\\r\nb');
      assert.strictEqual(run('join-continuation', 'a\\\rb\rc', { eol: '\n' }), 'ab\rc');
    });

    test('mixed LF / CRLF: every line break that is not removed is kept as it was', () => {
      assert.strictEqual(run('join-continuation', 'a\r\nb \\\nc\nd\r\n', { eol: '\n' }), 'a\r\nb c\nd\r\n');
      assert.strictEqual(run('join-continuation', 'a\r\nb\nc', { eol: '\r\n' }), 'a\r\nb\nc');
    });
  });

  suite('extraction (LINE-032..034)', () => {
    const markers = { startMarker: 'BEGIN', endMarker: 'END' };

    test('LINE-032: several blocks, a missing end marker, and marker lines are not included', () => {
      check('extract-between-markers', 'BEGIN·x⏎a⏎--END--⏎y⏎BEGIN⏎b⏎c', 'a⏎b⏎c', markers);
    });

    test('LINE-032: the same marker opens and closes blocks', () => {
      check('extract-between-markers', 'x⏎---⏎a⏎---⏎y⏎---⏎b⏎---', 'a⏎b', { startMarker: '---', endMarker: '---' });
    });

    test('LINE-032: no start marker leaves the text unchanged (undefined from extractBetweenMarkers)', () => {
      check('extract-between-markers', 'a⏎END⏎b', 'a⏎END⏎b', markers);
      assert.strictEqual(extractBetweenMarkers('a\nb', { eol: '\n', ...markers }), undefined);
    });

    test('LINE-032: a start marker with no lines between the markers gives an empty result', () => {
      assert.strictEqual(extractBetweenMarkers('BEGIN\nEND\n', { eol: '\n', ...markers }), '');
    });

    test('LINE-033 / 034: first of equal length, code points, blank lines excluded from the shortest', () => {
      check('extract-longest', 'ab⏎cd⏎e', 'ab');
      assert.strictEqual(run('extract-longest', '😀😀\nabc'), 'abc');
      check('extract-shortest', 'abc⏎⏎··⏎ab⏎cd', 'ab');
      check('extract-shortest', '⏎··', '⏎··');
      check('extract-longest', 'a⏎abc⏎', 'abc⏎');
    });
  });

  suite('LINE-031 count-stats', () => {
    test('CRLF counts as one character; a final line break does not start a line', () => {
      assert.deepStrictEqual(countLineStats('a b\r\nc\r\n'), { lines: 2, words: 3, chars: 6 });
    });

    test('code points', () => {
      assert.deepStrictEqual(countLineStats('😀 x'), { lines: 1, words: 2, chars: 3 });
    });

    test('singular forms and several selections', () => {
      assert.strictEqual(formatLineStats({ lines: 1, words: 1, chars: 1 }, 1), '1 line, 1 word, 1 char');
      assert.strictEqual(formatLineStats({ lines: 0, words: 0, chars: 2 }, 1), '0 lines, 0 words, 2 chars');
      assert.strictEqual(formatLineStats({ lines: 3, words: 4, chars: 12345 }, 2), '3 lines, 4 words, 12,345 chars (2 selections)');
    });
  });

  suite('anchor rule for selections starting / ending in the middle of a line (plan 2-5)', () => {
    test('examples of the plan', () => {
      // xx|a⏎b⏎|next: `a` is the rest of the line starting before the selection.
      check('filter-contains', 'a⏎b⏎', 'a⏎', { text: 'z', precededByText: true });
      // xx|a⏎b⏎c|yy
      check('filter-not-contains', 'a⏎b⏎c', 'a⏎c', { text: 'b', precededByText: true, followedByText: true });
      // |a⏎b⏎zz|zz
      check('filter-contains', 'a⏎b⏎zz', 'zz', { text: 'q', followedByText: true });
      // |a⏎b⏎|next: whole lines, no anchors.
      check('filter-contains', 'a⏎b⏎', '', { text: 'q' });
      // Anchors are neither numbered nor reordered.
      check('add-numbers', 'a⏎b⏎c', 'a⏎1:·b⏎c', { precededByText: true, followedByText: true });
      check('rotate', 'a⏎b⏎c⏎d', 'a⏎c⏎b⏎d', { precededByText: true, followedByText: true });
      // Only a start anchor and no middle line: nothing to do.
      check('filter-contains', 'a⏎', 'a⏎', { text: 'z', precededByText: true });
      check('filter-contains', 'a⏎b', 'a⏎b', { text: 'z', precededByText: true, followedByText: true });
    });

    test('a selection without a line break has no anchors', () => {
      check('filter-contains', 'abc', '', { text: 'z', precededByText: true, followedByText: true });
      check('remove-prefix', '-a', 'a', { text: '-', precededByText: true, followedByText: true });
    });

    test('followedByText is ignored when the selection ends with a line break', () => {
      check('filter-contains', 'a⏎b⏎', '', { text: 'z', followedByText: true });
    });

    test('LINE-024 / 025 do not touch the partial first / last line', () => {
      check('remove-prefix', '-a⏎-b⏎-c', '-a⏎b⏎-c', { text: '-', precededByText: true, followedByText: true });
      check('remove-suffix', 'a;⏎b;⏎c;', 'a;⏎b⏎c;', { text: ';', precededByText: true, followedByText: true });
    });

    test('CRLF', () => {
      checkCrlf('filter-not-contains', 'a⏎b⏎c', 'a⏎c', { text: 'b', precededByText: true, followedByText: true });
      checkCrlf('filter-not-contains', 'a⏎b⏎', 'a⏎', { text: 'b', precededByText: true });
    });

    /**
     * Table-driven check of all 28 anchored commands. `P` (start anchor) and `S` (end anchor)
     * are chosen so that every command would change them if they were transformed.
     */
    suite('all 28 anchored commands', () => {
      const P = 'xP1 BEGIN';
      const S = 'Sx9 END';
      const middles = [
        'x1\nb\nx1\nBEGIN\n  c\nEND\n# d\nlonger line x',
        'b\nc', // empty for LINE-001 / 003 / 007 / 014 / 017 / 019..., no start marker for LINE-032
      ];
      const optionsFor = (text: string, extra: Partial<LineOptions>): Partial<LineOptions> =>
        ({ ...INPUTS, regexMatches: digitMatches(text), ...extra });
      const runWith = (command: LineTransformCommand, text: string, extra: Partial<LineOptions> = {}) =>
        run(command, text, optionsFor(text, extra));
      /** The transform of the middle lines alone (as a whole-line selection ending with a line break). */
      const middleLines = (command: LineTransformCommand, middle: string): string[] => {
        const result = runWith(command, `${middle}\n`);
        return result === '' ? [] : result.slice(0, -1).split('\n');
      };

      LINE_ANCHORED_COMMANDS.forEach((command) => {
        test(command, () => {
          middles.forEach((middle) => {
            const lines = middleLines(command, middle);
            const joined = (parts: string[]) => parts.join('\n');
            // Start anchor, the selection ends with a line break (with or without followedByText).
            [false, true].forEach((followedByText) => {
              assert.strictEqual(
                runWith(command, `${P}\n${middle}\n`, { precededByText: true, followedByText }),
                `${joined([P, ...lines])}\n`,
                `${command}: start anchor + final line break (${followedByText})`
              );
            });
            // Start anchor, the selection ends at the end of a line.
            assert.strictEqual(
              runWith(command, `${P}\n${middle}`, { precededByText: true }),
              joined([P, ...lines]),
              `${command}: start anchor`
            );
            // End anchor only.
            assert.strictEqual(
              runWith(command, `${middle}\n${S}`, { followedByText: true }),
              joined([...lines, S]),
              `${command}: end anchor`
            );
            // Both anchors.
            assert.strictEqual(
              runWith(command, `${P}\n${middle}\n${S}`, { precededByText: true, followedByText: true }),
              joined([P, ...lines, S]),
              `${command}: both anchors`
            );
            // No anchors: the same as a whole-line selection.
            assert.strictEqual(
              runWith(command, `${middle}\n`),
              lines.length === 0 ? '' : `${joined(lines)}\n`,
              `${command}: whole lines`
            );
          });
          // A selection inside one line has no anchors.
          const single = 'x1 BEGIN';
          assert.strictEqual(
            runWith(command, single, { precededByText: true, followedByText: true }),
            runWith(command, single),
            `${command}: one partial line`
          );
        });
      });

      test('the table produces empty middles for the second input where expected', () => {
        assert.deepStrictEqual(middleLines('filter-contains', middles[1]), []);
        assert.deepStrictEqual(middleLines('extract-between-markers', middles[1]), ['b', 'c']);
      });
    });

    test('category A commands ignore the position options', () => {
      const text = 'a b\\\n  c d. e f\nabcdef';
      (['reverse-words', 'join-continuation', 'join-every-n', 'split-sentences', 'split-fixed-width'] as LineTransformCommand[])
        .forEach((command) => {
          const options = { ...INPUTS, n: 3 };
          assert.strictEqual(
            run(command, text, { ...options, precededByText: true, followedByText: true }),
            run(command, text, options),
            command
          );
          assert.notStrictEqual(run(command, text, options), text, `${command} changes the sample`);
        });
    });
  });

  suite('input validation', () => {
    test('counts: 1..1,000,000 integers', () => {
      assert.strictEqual(validateLineCountInput('1'), undefined);
      assert.strictEqual(validateLineCountInput(' 1000000 '), undefined);
      ['0', '1000001', '-1', '1.5', '', 'a', '12345678'].forEach((value) =>
        assert.strictEqual(validateLineCountInput(value), 'Enter an integer from 1 to 1,000,000', value));
    });

    test('width: 1..1,000 integers', () => {
      assert.strictEqual(validateLineWidthInput('80'), undefined);
      assert.ok(validateLineWidthInput('1001'));
      assert.ok(validateLineWidthInput('0'));
    });

    test('text: 1..1,000 characters without line breaks; spaces are allowed', () => {
      assert.strictEqual(validateLineTextInput(' - '), undefined);
      assert.strictEqual(validateLineTextInput('a'.repeat(1000)), undefined);
      assert.ok(validateLineTextInput(''));
      assert.ok(validateLineTextInput('a'.repeat(1001)));
      assert.ok(validateLineTextInput('a\nb'));
      assert.ok(validateLineTextInput('a\rb'));
    });

    test('delimiter: 0..100 characters without line breaks', () => {
      assert.strictEqual(validateLineDelimiterInput(''), undefined);
      assert.strictEqual(validateLineDelimiterInput(' | '), undefined);
      assert.ok(validateLineDelimiterInput('a'.repeat(101)));
      assert.ok(validateLineDelimiterInput('\n'));
    });

    test('regular expression: 1..500 characters and valid with the u flag', () => {
      assert.strictEqual(validateLineRegexInput('\\d+'), undefined);
      assert.strictEqual(validateLineRegexInput('a'.repeat(500)), undefined);
      assert.ok(validateLineRegexInput(''));
      assert.ok(validateLineRegexInput('a'.repeat(501)));
      assert.ok(validateLineRegexInput('('));
      // Valid without the u flag, a syntax error with it.
      assert.ok(validateLineRegexInput('\\-'));
    });
  });

  suite('output size limit', () => {
    const big = 'x\n'.repeat(1000);

    ([
      ['add-numbers', {}],
      ['add-numbers-padded', {}],
      ['duplicate-each', {}],
      ['join-every-n', { n: 2, delimiter: 'abc' }],
      ['split-sentences', {}],
      ['split-fixed-width', { n: 1 }],
    ] as [LineTransformCommand, Partial<LineOptions>][]).forEach(([command, options]) => {
      test(`${command} throws LineOutputTooLargeError above the limit`, () => {
        const input = command === 'split-sentences' ? '。a'.repeat(1000) : command === 'split-fixed-width' ? 'abcdef' : big;
        assert.throws(
          () => run(command, input, { ...options, maxAddedLength: 3 }),
          (error: unknown) => error instanceof LineOutputTooLargeError && error.limit === 3
        );
        assert.doesNotThrow(() => run(command, input, options));
      });
    });

    test('the default limit is MAX_ADDED_LENGTH and the message names both numbers', () => {
      const error = new LineOutputTooLargeError(MAX_ADDED_LENGTH + 1, MAX_ADDED_LENGTH);
      assert.strictEqual(error.message, 'The result would add 10,000,001 characters (limit: 10,000,000)');
    });

    test('commands that only remove characters never throw', () => {
      assert.doesNotThrow(() => run('keep-odd', big, { maxAddedLength: 0 }));
      assert.doesNotThrow(() => run('join-every-n', big, { n: 2, delimiter: ',', maxAddedLength: 0 }));
    });
  });
});
