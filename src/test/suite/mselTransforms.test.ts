import * as assert from 'assert';
import {
  alignCursors,
  copyFirstToAll,
  countChars,
  cursorsToLineContentStart,
  expandToBrackets,
  expandToQuotes,
  expandToWord,
  extendToDelimiter,
  filterByMatches,
  keepEven,
  keepEveryNth,
  keepOdd,
  MSEL_COMMAND_ENTRIES,
  MSEL_INFO_MAX_LISTED,
  MSEL_MAX_SELECTIONS,
  MSEL_NEED_EXACTLY_TWO,
  MSEL_NEED_TWO,
  MselInputError,
  MselLines,
  MselRange,
  MselResult,
  MselTooManySelectionsError,
  MselWordAt,
  nextCharEnd,
  prevCharStart,
  quotedStrings,
  removeDuplicateText,
  removeEmpty,
  removeFirst,
  removeLast,
  rotateBackward,
  rotateForward,
  selectColumn,
  selectIndentation,
  selectionInfo,
  selectNumbers,
  selectStrings,
  selectUrls,
  shrinkBothSides,
  splitByDelimiter,
  splitByMatches,
  splitWords,
  swapTwo,
  trimSelections,
  trimUrl,
  validateMselDelimiterInput,
} from '../../handler/mselTransforms';
import { parseMarked, renderMarked } from './mselExamples';

/** The text and the selections of a marked text (`[…]` selection, `|` cursor, `⏎`, `·`). */
const on = (marked: string): { text: string; ranges: MselRange[] } => {
  const { text, ranges } = parseMarked(marked);
  return { text, ranges: ranges.map(([start, end]) => ({ start, end })) };
};

/** The marked text after a result: the new selections (and text), or `kind: message`. */
const show = (text: string, result: MselResult): string => {
  switch (result.kind) {
    case 'select':
      return renderMarked(text, result.ranges.map(({ start, end }) => [start, end])) + (result.message === undefined ? '' : ` / ${result.message}`);
    case 'edit': {
      let edited = text;
      [...result.edits].sort((a, b) => b.start - a.start).forEach(({ start, end, text: value }) => {
        edited = edited.slice(0, start) + value + edited.slice(end);
      });
      return renderMarked(edited, result.ranges.map(({ start, end }) => [start, end]));
    }
    case 'unchanged':
      return 'unchanged';
    default:
      return `${result.kind}: ${result.message}`;
  }
};

/** Runs a `(text, ranges)` transform on a marked text. */
const run = (fn: (text: string, ranges: readonly MselRange[]) => MselResult, marked: string): string => {
  const { text, ranges } = on(marked);
  return show(text, fn(text, ranges));
};

/** Runs a `(ranges)` transform on a marked text. */
const runRanges = (fn: (ranges: readonly MselRange[]) => MselResult, marked: string): string =>
  run((_text, ranges) => fn(ranges), marked);

/** A simple `getWordRangeAtPosition`: `\w+` around the offset (at either end of it too). */
const wordsOf = (text: string): MselWordAt => (offset) => {
  for (const match of text.matchAll(/\w+/g)) {
    if (match.index! <= offset && offset <= match.index! + match[0].length) {
      return { start: match.index!, end: match.index! + match[0].length };
    }
  }
  return undefined;
};

const many = (count: number, unit: string, separator = ' '): string => Array.from({ length: count }, () => unit).join(separator);

suite('Multi Cursor Transforms (MSEL-001..030) Test Suite', () => {

  suite('characters and lines', () => {
    test('a CRLF and a surrogate pair are one character', () => {
      assert.strictEqual(nextCharEnd('a\r\nb', 1), 3);
      assert.strictEqual(prevCharStart('a\r\nb', 3), 1);
      assert.strictEqual(nextCharEnd('😀x', 0), 2);
      assert.strictEqual(prevCharStart('x😀', 3), 1);
      assert.strictEqual(nextCharEnd('ab', 2), 2);
      assert.strictEqual(prevCharStart('ab', 0), 0);
      assert.strictEqual(countChars('a\r\n😀'), 3);
    });

    test('lines: starts, ends without the line break, the line of an offset', () => {
      const lines = new MselLines('ab\r\ncd\n\ne');
      assert.strictEqual(lines.count, 4);
      assert.deepStrictEqual([0, 1, 2, 3].map((line) => [lines.start(line), lines.contentEnd(line)]), [[0, 2], [4, 6], [7, 7], [8, 9]]);
      assert.deepStrictEqual([0, 2, 3, 4, 7, 9].map((offset) => lines.lineOf(offset)), [0, 0, 0, 1, 2, 3]);
    });
  });

  suite('delimiter input', () => {
    test('validateMselDelimiterInput: 1 to 100 characters without line breaks, empty rejected', () => {
      assert.strictEqual(validateMselDelimiterInput(''), 'Enter a delimiter');
      assert.strictEqual(validateMselDelimiterInput(','), undefined);
      assert.strictEqual(validateMselDelimiterInput(' '), undefined);
      assert.strictEqual(validateMselDelimiterInput('x'.repeat(100)), undefined);
      assert.ok(validateMselDelimiterInput('x'.repeat(101)));
      assert.ok(validateMselDelimiterInput('a\nb'));
      assert.ok(validateMselDelimiterInput('a\rb'));
    });

    test('MSEL-016 / 017 / 021 reject an empty delimiter themselves (no endless loop)', () => {
      const { text, ranges } = on('[a,b]');
      assert.throws(() => extendToDelimiter(text, ranges, ''), MselInputError);
      assert.throws(() => splitByDelimiter(text, ranges, ''), MselInputError);
      assert.throws(() => selectColumn(text, ranges, '', 1), MselInputError);
      assert.throws(() => selectColumn(text, ranges, 'x'.repeat(101), 1), MselInputError);
      assert.throws(() => selectColumn(text, ranges, ',', 0), MselInputError);
      assert.throws(() => selectColumn(text, ranges, ',', 1001), MselInputError);
    });
  });

  suite('A: filtering', () => {
    test('MSEL-001 / 002: odd and even selections', () => {
      assert.strictEqual(runRanges(keepOdd, '[a] [b] [c] [d] [e]'), '[a] b [c] d [e]');
      assert.strictEqual(runRanges(keepEven, '[a] [b] [c] [d] [e]'), 'a [b] c [d] e');
      assert.strictEqual(runRanges(keepOdd, '[a] b'), `warn: ${MSEL_NEED_TWO}`);
      assert.strictEqual(runRanges(keepEven, '[a] b'), `warn: ${MSEL_NEED_TWO}`);
    });

    test('MSEL-001: the original selections are kept (with their direction)', () => {
      const ranges: MselRange[] = [{ start: 0, end: 1, reversed: true }, { start: 2, end: 3 }, { start: 4, end: 5, reversed: true }];
      const result = keepOdd(ranges);
      assert.strictEqual(result.kind, 'select');
      assert.deepStrictEqual(result.kind === 'select' ? result.ranges : [], [ranges[0], ranges[2]]);
    });

    test('MSEL-003: every Nth selection; N=1 changes nothing; a missing Nth warns', () => {
      const { text, ranges } = on('[a] [b] [c] [d] [e] [f] [g]');
      assert.strictEqual(show(text, keepEveryNth(ranges, 3)), 'a b [c] d e [f] g');
      assert.strictEqual(show(text, keepEveryNth(ranges, 1)), 'unchanged');
      assert.strictEqual(show(text, keepEveryNth(ranges, 7)), 'a b c d e f [g]');
      assert.strictEqual(show(text, keepEveryNth(ranges, 8)), 'warn: There is no selection number 8: there are only 7 selections.');
      assert.throws(() => keepEveryNth(ranges, 0), MselInputError);
      assert.strictEqual(show('a', keepEveryNth([{ start: 0, end: 1 }], 2)), `warn: ${MSEL_NEED_TWO}`);
    });

    test('MSEL-004 / 005: first and last in document order, one selection warns', () => {
      assert.strictEqual(runRanges(removeFirst, '[a] [b]⏎[c]'), 'a [b]\n[c]');
      assert.strictEqual(runRanges(removeLast, '[a] [b]⏎[c]'), '[a] [b]\nc');
      assert.strictEqual(runRanges(removeFirst, '[a]'), `warn: ${MSEL_NEED_TWO}`);
      assert.strictEqual(runRanges(removeLast, '|a'), `warn: ${MSEL_NEED_TWO}`);
    });

    test('MSEL-006 / 007: by the worker results; none left warns; all kept is unchanged', () => {
      const { text, ranges } = on('[a1] [b] [c2] []');
      assert.strictEqual(show(text, filterByMatches(ranges, [true, false, true, false], true)), '[a1] b [c2] ');
      assert.strictEqual(show(text, filterByMatches(ranges, [true, false, true, false], false)), 'a1 [b] c2 |');
      assert.strictEqual(show(text, filterByMatches(ranges, [false, false, false, false], true)), 'warn: No selection matches the regular expression.');
      assert.strictEqual(show(text, filterByMatches(ranges, [true, true, true, true], false)),
        'warn: Every selection matches the regular expression; at least one selection must remain.');
      assert.strictEqual(show(text, filterByMatches(ranges, [true, true, true, true], true)), 'unchanged');
      assert.throws(() => filterByMatches(ranges, [true], true));
    });

    test('MSEL-008: empty selections are removed; all empty warns; none empty is unchanged', () => {
      assert.strictEqual(runRanges(removeEmpty, '[a] | [b] |'), '[a]  [b] ');
      assert.strictEqual(runRanges(removeEmpty, '| |'), 'warn: Every selection is empty; at least one selection must remain.');
      assert.strictEqual(runRanges(removeEmpty, '[a] [b]'), 'unchanged');
    });

    test('MSEL-009: the first of every text is kept (case-sensitive, empty texts too)', () => {
      assert.strictEqual(run(removeDuplicateText, '[a] [A] [a] [b] | [b] |'), '[a] [A] a [b] | b ');
      assert.strictEqual(run(removeDuplicateText, '[a] [b]'), 'unchanged');
      assert.strictEqual(run(removeDuplicateText, '[a]'), `warn: ${MSEL_NEED_TWO}`);
    });
  });

  suite('B: aligning, expanding and shrinking', () => {
    const align = (marked: string, tabSize = 4) => {
      const { text, ranges } = on(marked);
      return show(text, alignCursors(text, ranges, tabSize));
    };

    test('MSEL-010: spaces before the starts, widths kept', () => {
      assert.strictEqual(align('a|=1⏎bbb|=2⏎cc[x]'), 'a  |=1\nbbb|=2\ncc [x]');
      assert.strictEqual(align('a|⏎b|'), 'unchanged');
      assert.strictEqual(align('a|'), `warn: ${MSEL_NEED_TWO}`);
    });

    test('MSEL-010: several selections on one line are aligned column by column', () => {
      assert.strictEqual(align('a|,b|⏎ccc|,d|'), 'a  |,b|\nccc|,d|');
      assert.strictEqual(align('a|,bbbb|⏎ccc|,d|'), 'a  |,bbbb|\nccc|,d   |');
    });

    test('MSEL-010: tabs count to the next tab stop; CRLF documents', () => {
      assert.strictEqual(align('\t|a⏎ab|', 4), '\t|a\nab  |');
      assert.strictEqual(align('\t|a⏎ab|', 2), 'unchanged');
      assert.strictEqual(align('\t|a⏎a|', 2), '\t|a\na |');
      assert.strictEqual(align('a|=1\r\nbbb|=2'), 'a  |=1\r\nbbb|=2');
    });

    test('MSEL-011: cursors become words, ends move to word boundaries', () => {
      const expand = (marked: string) => {
        const { text, ranges } = on(marked);
        return show(text, expandToWord(ranges, wordsOf(text)));
      };
      assert.strictEqual(expand('he|llo wo|rld'), '[hello] [world]');
      assert.strictEqual(expand('hello|'), '[hello]');
      assert.strictEqual(expand('he[llo wo]rld'), '[hello world]');
      assert.strictEqual(expand('hello[ ]world'), 'unchanged');
      assert.strictEqual(expand('a | b'), 'unchanged');
    });

    test('MSEL-012: the inside of the quotes around the selection, on one line', () => {
      assert.strictEqual(run(expandToQuotes, 'x = "he|llo" + \'w|o\''), 'x = "[hello]" + \'[wo]\'');
      assert.strictEqual(run(expandToQuotes, '"a \\" b|c"'), '"[a \\" bc]"');
      assert.strictEqual(run(expandToQuotes, '"it\'s |ok"'), '"[it\'s ok]"');
      assert.strictEqual(run(expandToQuotes, '`a|`'), '`[a]`');
      assert.strictEqual(run(expandToQuotes, '"a" |b "c"'), 'unchanged');
      assert.strictEqual(run(expandToQuotes, '"a[⏎]b"'), 'unchanged');
      assert.strictEqual(run(expandToQuotes, '"[ab]"'), 'unchanged');
      assert.strictEqual(run(expandToQuotes, '"he|llo"\r\n"w|o"'), '"[hello]"\r\n"[wo]"');
    });

    test('MSEL-013: the innermost brackets, then one level out; types matched on their own', () => {
      assert.strictEqual(run(expandToBrackets, 'f(a,|b)'), 'f([a,b])');
      assert.strictEqual(run(expandToBrackets, 'f([a,b])'), 'unchanged');
      assert.strictEqual(run(expandToBrackets, 'g(f([a,b]))'), 'g([f(a,b)])');
      assert.strictEqual(run(expandToBrackets, 'x{a(b)|c}'), 'x{[a(b)c]}');
      assert.strictEqual(run(expandToBrackets, '{⏎··a(|)⏎}'), '{[\n  a()\n]}');
      assert.strictEqual(run(expandToBrackets, '{⏎··[a]⏎}'), '{[\n  a\n]}');
      assert.strictEqual(run(expandToBrackets, 'a|b'), 'unchanged');
      assert.strictEqual(run(expandToBrackets, '{a(}b|)'), '{a([}b])');
    });

    test('MSEL-013: brackets inside the selection are taken into account', () => {
      assert.strictEqual(run(expandToBrackets, '((x [a)(b] y))'), '([(x a)(b y)])');
      assert.strictEqual(run(expandToBrackets, '(x [a)(b] y)'), 'unchanged');
      assert.strictEqual(run(expandToBrackets, '(x [(a)] y)'), '([x (a) y])');
    });

    test('MSEL-013: the search stops at the limit', () => {
      const { text, ranges } = on(`(${'x'.repeat(20)}|${'x'.repeat(20)})`);
      assert.strictEqual(expandToBrackets(text, ranges, 10).kind, 'unchanged');
      assert.strictEqual(expandToBrackets(text, ranges, 30).kind, 'select');
    });

    test('MSEL-014: whitespace at both ends; only whitespace becomes a cursor', () => {
      assert.strictEqual(run(trimSelections, '[··ab·] [⏎\tc　] [···]'), '  [ab]  \n\t[c]　 |   ');
      assert.strictEqual(run(trimSelections, '[a\r\n]\r\n[b]'), '[a]\r\n\r\n[b]');
      assert.strictEqual(run(trimSelections, '[ab]'), 'unchanged');
    });

    test('MSEL-015: one character inward at each end; CRLF and surrogate pairs are one character', () => {
      assert.strictEqual(run(shrinkBothSides, '["ab"] [(x)] [ab] [a] |'), '"[ab]" ([x]) a|b [a] |');
      assert.strictEqual(run(shrinkBothSides, '[😀a😀]'), '😀[a]😀');
      assert.strictEqual(run(shrinkBothSides, '[\r\nab\r\n]'), '\r\n[ab]\r\n');
      assert.strictEqual(run(shrinkBothSides, '[a] |'), 'unchanged');
    });

    test('MSEL-016: up to the delimiter on the same line; not found is counted', () => {
      const extend = (marked: string, delimiter: string) => {
        const { text, ranges } = on(marked);
        return show(text, extendToDelimiter(text, ranges, delimiter));
      };
      assert.strictEqual(extend('[a]bc,d', ','), '[abc],d');
      assert.strictEqual(extend('|a::b::c', '::'), '[a]::b::c');
      assert.strictEqual(extend('[a]bc⏎,d', ','), 'warn: The delimiter was not found after any selection on its line.');
      assert.strictEqual(extend('[a]b,c⏎[d]e', ','),
        '[ab],c\n[d]e / The delimiter was not found after 1 of 2 selections; they were not changed.');
      assert.strictEqual(extend('[a],b', ','), 'unchanged');
      assert.strictEqual(extend('[a]b,\r\nc', ','), '[ab],\r\nc');
    });
  });

  suite('C: splitting', () => {
    test('MSEL-017: parts between the delimiters, empty parts as cursors', () => {
      const split = (marked: string, delimiter: string) => {
        const { text, ranges } = on(marked);
        return show(text, splitByDelimiter(text, ranges, delimiter));
      };
      assert.strictEqual(split('[a,b,c]', ','), '[a],[b],[c]');
      assert.strictEqual(split('[a,,b,]', ','), '[a],|,[b],|');
      assert.strictEqual(split('[a::b] [c]', '::'), '[a]::[b] [c]');
      assert.strictEqual(split('[abc]', ','), 'unchanged');
      assert.strictEqual(split('[a,b⏎c,d]', ','), '[a],[b\nc],[d]');
    });

    test('MSEL-017: more than the selection limit warns', () => {
      const { text, ranges } = on(`[${','.repeat(MSEL_MAX_SELECTIONS)}]`);
      assert.throws(() => splitByDelimiter(text, ranges, ','), MselTooManySelectionsError);
    });

    test('MSEL-018: parts between the worker matches; empty matches are ignored', () => {
      const { text, ranges } = on('[a1b22c] [x]');
      assert.strictEqual(show(text, splitByMatches(ranges, [[[1, 2], [3, 5]], []])), '[a]1[b]22[c] [x]');
      assert.strictEqual(show(text, splitByMatches(ranges, [[[0, 0]], []])), 'unchanged');
      assert.throws(() => splitByMatches(ranges, [[]]));
    });

    test('MSEL-019: one selection per word; no word warns', () => {
      assert.strictEqual(run(splitWords, '[foo bar_1, baz] [é日本]'), '[foo] [bar_1], [baz] [é日本]');
      assert.strictEqual(run(splitWords, '[foo] [ - ]'), '[foo]  - ');
      assert.strictEqual(run(splitWords, '[foo] [bar]'), 'unchanged');
      assert.strictEqual(run(splitWords, '[ - ]'), 'warn: No words were found in the selections.');
      assert.throws(() => splitWords(many(MSEL_MAX_SELECTIONS + 1, 'a'), [{ start: 0, end: many(MSEL_MAX_SELECTIONS + 1, 'a').length }]),
        MselTooManySelectionsError);
    });
  });

  suite('D: lines', () => {
    test('MSEL-020: before the first non-whitespace character; blank lines skipped', () => {
      assert.strictEqual(run(cursorsToLineContentStart, '··a⏎····b'), '  |a\n    |b');
      assert.strictEqual(run(cursorsToLineContentStart, '[··a⏎⏎··⏎\tb⏎]c'), '  |a\n\n  \n\t|b\nc');
      assert.strictEqual(run(cursorsToLineContentStart, '··|a b| c'), '  |a b c');
      assert.strictEqual(run(cursorsToLineContentStart, '··a\r\n··[b]'), '  a\r\n  |b');
      assert.strictEqual(run(cursorsToLineContentStart, '[··]⏎'), 'warn: No line with text other than spaces and tabs was found.');
      assert.strictEqual(run(cursorsToLineContentStart, '|a'), 'unchanged');
    });

    test('MSEL-030: the leading spaces and tabs; blank lines whole; no indent skipped', () => {
      assert.strictEqual(run(selectIndentation, '··a⏎····b'), '[  ]a\n[    ]b');
      assert.strictEqual(run(selectIndentation, '··a⏎b⏎\t·⏎'), '[  ]a\nb\n[\t ]\n');
      assert.strictEqual(run(selectIndentation, 'a⏎b'), 'warn: No indented line was found.');
      assert.strictEqual(run(selectIndentation, '[··]a'), 'unchanged');
      assert.strictEqual(run(selectIndentation, '··a\r\n····b'), '[  ]a\r\n[    ]b');
    });

    test('MSEL-021: column N of the selected part of every line', () => {
      const column = (marked: string, delimiter: string, n: number) => {
        const { text, ranges } = on(marked);
        return show(text, selectColumn(text, ranges, delimiter, n));
      };
      assert.strictEqual(column('a,b⏎c,d', ',', 2), 'a,[b]\nc,[d]');
      assert.strictEqual(column('a,b⏎c,d', ',', 1), '[a],b\n[c],d');
      assert.strictEqual(column('a,b⏎c⏎d,,e', ',', 2), 'a,[b]\nc\nd,|,e');
      assert.strictEqual(column('a::b::c', '::', 3), 'a::b::[c]');
      assert.strictEqual(column('x[a,b,c]', ',', 2), 'xa,[b],c');
      assert.strictEqual(column('a,b|⏎c,d', ',', 2), 'a,[b]\nc,d');
      assert.strictEqual(column('a,b\r\nc,d', ',', 2), 'a,[b]\r\nc,[d]');
      assert.strictEqual(column('a,b', ',', 3), 'warn: No line has column 3.');
    });
  });

  suite('E: inside the selections', () => {
    test('MSEL-022: numbers, decimals and signs', () => {
      assert.strictEqual(run(selectNumbers, 'a1 b22'), 'a[1] b[22]');
      assert.strictEqual(run(selectNumbers, 'x = -1.5 + 2 - 3; a-1 (-4) f(1)-2 _-5 1.2.3'),
        'x = [-1.5] + [2] - [3]; a-[1] ([-4]) f([1])-[2] _-[5] [1.2].[3]');
      assert.strictEqual(run(selectNumbers, '-1 x'), '[-1] x');
      assert.strictEqual(run(selectNumbers, '-[1]'), 'unchanged');
      assert.strictEqual(run(selectNumbers, 'abc'), 'warn: No numbers were found in the selections.');
    });

    test('MSEL-023: quoted strings with escapes; unclosed quotes ignored', () => {
      assert.strictEqual(run(selectStrings, 'f("a", \'b\')'), 'f("[a]", \'[b]\')');
      assert.strictEqual(run(selectStrings, '"a\\"b" "" `x⏎y`'), '"[a\\"b]" "|" `[x\ny]`');
      assert.strictEqual(run(selectStrings, '"it\'s"'), '"[it\'s]"');
      assert.strictEqual(run(selectStrings, '"a⏎b" \'c\''), '"a\nb" \'[c]\'');
      assert.strictEqual(run(selectStrings, 'no "quote'), 'warn: No quoted strings were found in the selections.');
      assert.deepStrictEqual(quotedStrings('\\"a "b"'), [[5, 6]]);
    });

    test('MSEL-024: URLs without trailing punctuation or unmatched closing brackets', () => {
      assert.strictEqual(run(selectUrls, 'see https://a.example and https://b.example'), 'see [https://a.example] and [https://b.example]');
      assert.strictEqual(run(selectUrls, '(https://a.example/x_(y)), http://b.example.'), '([https://a.example/x_(y)]), [http://b.example].');
      assert.strictEqual(run(selectUrls, '<https://a.example>'), '<[https://a.example]>');
      assert.strictEqual(run(selectUrls, 'no url, ftp://a.example'), 'warn: No URLs were found in the selections.');
      assert.strictEqual(trimUrl('https://a.example/?q="x",'), 'https://a.example/?q="x'.length);
    });

    test('the selection limit applies to E as well', () => {
      const text = many(MSEL_MAX_SELECTIONS + 1, '1');
      assert.throws(() => selectNumbers(text, [{ start: 0, end: text.length }]), MselTooManySelectionsError);
    });
  });

  suite('F: exchanging texts', () => {
    test('MSEL-025 / 026: rotation in document order, texts of any length', () => {
      assert.strictEqual(run(rotateForward, '[a] [bb] [] [ccc]'), '[ccc] [a] [bb] |');
      assert.strictEqual(run(rotateBackward, '[a] [bb] [] [ccc]'), '[bb] | [ccc] [a]');
      assert.strictEqual(run(rotateForward, '[a] [a]'), 'unchanged');
      assert.strictEqual(run(rotateForward, '[a]'), `warn: ${MSEL_NEED_TWO}`);
      assert.strictEqual(run(rotateBackward, '[😀]⏎[b\r\nc]'), '[b\r\nc]\n[😀]');
    });

    test('MSEL-027: exactly two selections', () => {
      assert.strictEqual(run(swapTwo, '[foo] = [bar]'), '[bar] = [foo]');
      assert.strictEqual(run(swapTwo, '[a] [b] [c]'), `warn: ${MSEL_NEED_EXACTLY_TWO}`);
      assert.strictEqual(run(swapTwo, '[a]'), `warn: ${MSEL_NEED_EXACTLY_TWO}`);
    });

    test('MSEL-028: the first text into every selection', () => {
      assert.strictEqual(run(copyFirstToAll, '[x] [a] [bb] |'), '[x] [x] [x] [x]');
      assert.strictEqual(run(copyFirstToAll, '| [a]'), '| |');
      assert.strictEqual(run(copyFirstToAll, '[x] [x]'), 'unchanged');
    });
  });

  suite('G: information', () => {
    test('MSEL-029: count, lines and characters', () => {
      assert.strictEqual(run(selectionInfo, '[ab]⏎⏎[c]'), 'info: 2 selections: L1 (2), L3 (1)');
      assert.strictEqual(run(selectionInfo, '[a😀\r\nb] |'), 'info: 2 selections: L1 (4), L2 (0)');
      assert.strictEqual(run(selectionInfo, '|'), 'info: 1 selection: L1 (0)');
    });

    test('MSEL-029: at most 50 selections are listed', () => {
      const count = MSEL_INFO_MAX_LISTED + 3;
      const { text, ranges } = on(many(count, '[a]', '⏎'));
      const result = selectionInfo(text, ranges);
      assert.strictEqual(result.kind, 'info');
      const message = result.kind === 'info' ? result.message : '';
      assert.ok(message.startsWith(`${count} selections: L1 (1), L2 (1), `), message);
      assert.ok(message.endsWith(`L${MSEL_INFO_MAX_LISTED} (1), … (+3 more)`), message);
    });
  });

  suite('command table', () => {
    test('30 commands, IDs in order, unique names', () => {
      assert.deepStrictEqual(MSEL_COMMAND_ENTRIES.map((entry) => entry.id),
        Array.from({ length: 30 }, (_value, i) => `MSEL-${String(i + 1).padStart(3, '0')}`));
      assert.strictEqual(new Set(MSEL_COMMAND_ENTRIES.map((entry) => entry.name)).size, 30);
    });

    test('the input boxes and validators of the 7 commands that ask', () => {
      const asking = MSEL_COMMAND_ENTRIES.filter((entry) => entry.inputs !== undefined);
      assert.deepStrictEqual(asking.map((entry) => [entry.id, entry.inputs!.length, entry.regex]), [
        ['MSEL-003', 1, undefined], ['MSEL-006', 1, 'test'], ['MSEL-007', 1, 'test'], ['MSEL-016', 1, undefined],
        ['MSEL-017', 1, undefined], ['MSEL-018', 1, 'split'], ['MSEL-021', 2, undefined],
      ]);
      const validate = (id: string, step: number, value: string) =>
        MSEL_COMMAND_ENTRIES.find((entry) => entry.id === id)!.inputs![step].validate(value);
      assert.ok(validate('MSEL-003', 0, '0'));
      assert.strictEqual(validate('MSEL-003', 0, ' 1000000 '), undefined);
      for (const id of ['MSEL-006', 'MSEL-007', 'MSEL-018']) {
        assert.ok(validate(id, 0, '('), id);
        assert.ok(validate(id, 0, 'a'.repeat(501)), id);
        assert.strictEqual(validate(id, 0, '\\d'), undefined, id);
      }
      for (const [id, step] of [['MSEL-016', 0], ['MSEL-017', 0], ['MSEL-021', 0]] as [string, number][]) {
        assert.strictEqual(validate(id, step, ''), 'Enter a delimiter', id);
      }
      assert.ok(validate('MSEL-021', 1, '0'));
      assert.ok(validate('MSEL-021', 1, '1001'));
      assert.ok(validate('MSEL-021', 1, 'x'));
      assert.strictEqual(validate('MSEL-021', 1, '1000'), undefined);
    });
  });
});
