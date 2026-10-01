import * as assert from 'assert';
import * as fs from 'fs';
import * as path from 'path';
import { isBlankLine } from '../../handler/lineTransforms';
import {
  expandToParagraph,
  expandToSentence,
  findDates,
  findEmails,
  findHexColors,
  findIps,
  findUuids,
  isValidDate,
  isValidIPv6,
  joinIntoFirst,
  keepDuplicateText,
  MSEL2_COMMAND_ENTRIES,
  MSEL2_NO_DUPLICATES,
  Msel2Finder,
  searchTargets,
  selectDates,
  selectEmails,
  selectHexColors,
  selectIps,
  selectUuids,
  sentencesOf,
  validateJoinDelimiterInput,
} from '../../handler/msel2Transforms';
import {
  MSEL_COMMAND_ENTRIES,
  MSEL_MAX_SELECTIONS,
  MSEL_NEED_TWO,
  MselInputError,
  MselRange,
  MselResult,
  MselTooManySelectionsError,
  validateMselDelimiterInput,
} from '../../handler/mselTransforms';
import { MSEL2_ROADMAP_EXAMPLES } from './msel2Examples';
import { expandNotation, parseMarked, renderMarked } from './mselExamples';

/** Parses a marked text (`[…]` selection, `|` cursor) into the text and the ranges. */
const marked = (value: string): { text: string; ranges: MselRange[] } => {
  const { text, ranges } = parseMarked(value);
  return { text, ranges: ranges.map(([start, end]) => ({ start, end })) };
};

/** Runs a command on a marked text and renders the selections after it (or the result kind). */
const apply = (fn: (text: string, ranges: readonly MselRange[]) => MselResult, value: string): string => {
  const { text, ranges } = marked(value);
  const result = fn(text, ranges);
  switch (result.kind) {
    case 'select':
      return renderMarked(text, result.ranges.map((range) => [range.start, range.end]));
    case 'unchanged':
      return 'unchanged';
    case 'warn':
      return `warn: ${result.message}`;
    case 'info':
      return `info: ${result.message}`;
    case 'edit':
      return 'edit';
  }
};

const found = (find: Msel2Finder, value: string): string[] => find(value).map(([start, end]) => value.slice(start, end));

const readRepoFile = (file: string): string => fs.readFileSync(path.resolve(__dirname, '../../..', file), 'utf8');

suite('LINE2 Selection Transforms (LINEX-015..023) Test Suite', () => {

  suite('command table', () => {
    test('MSEL2_COMMAND_ENTRIES: LINEX-015..023 in order, unique names that are not MSEL names', () => {
      assert.deepStrictEqual(MSEL2_COMMAND_ENTRIES.map((entry) => entry.id),
        Array.from({ length: 9 }, (_value, i) => `LINEX-${String(15 + i).padStart(3, '0')}`));
      const names = MSEL2_COMMAND_ENTRIES.map((entry) => entry.name);
      assert.strictEqual(new Set(names).size, names.length);
      const mselNames = new Set(MSEL_COMMAND_ENTRIES.map((entry) => entry.name));
      assert.ok(names.every((name) => !mselNames.has(name)));
      assert.deepStrictEqual(Object.keys(MSEL2_ROADMAP_EXAMPLES), MSEL2_COMMAND_ENTRIES.map((entry) => entry.id));
    });

    test('the MSEL table is unchanged: 30 commands, 7 with inputs', () => {
      assert.strictEqual(MSEL_COMMAND_ENTRIES.length, 30);
      assert.strictEqual(MSEL_COMMAND_ENTRIES.filter((entry) => entry.inputs !== undefined).length, 7);
    });

    test('when and needsTwo of every entry', () => {
      assert.deepStrictEqual(MSEL2_COMMAND_ENTRIES.map((entry) => [entry.id, entry.when, entry.needsTwo === true, entry.edits === true]), [
        ['LINEX-015', 'always', false, false],
        ['LINEX-016', 'always', false, false],
        ['LINEX-017', 'always', false, false],
        ['LINEX-018', 'always', false, false],
        ['LINEX-019', 'always', false, false],
        ['LINEX-020', 'always', false, false],
        ['LINEX-021', 'always', false, false],
        ['LINEX-022', 'multi', true, false],
        ['LINEX-023', 'multi', true, true],
      ]);
    });

    test('only LINEX-023 asks for a value: the delimiter, which may be empty', () => {
      const withInputs = MSEL2_COMMAND_ENTRIES.filter((entry) => entry.inputs !== undefined)
        .map((entry) => [entry.id, entry.inputs!.length, entry.regex]);
      assert.deepStrictEqual(withInputs, [['LINEX-023', 1, undefined]]);
      const step = MSEL2_COMMAND_ENTRIES[8].inputs![0];
      assert.strictEqual(step.value, ', ');
      assert.ok(step.prompt.includes('0 to 100 characters, empty joins without a separator'), step.prompt);
      for (const value of ['', ', ', 'x'.repeat(101), 'a\nb', 'a\rb']) {
        assert.strictEqual(step.validate(value), validateJoinDelimiterInput(value), JSON.stringify(value));
      }
      assert.strictEqual(validateJoinDelimiterInput(''), undefined);
      assert.strictEqual(validateJoinDelimiterInput(', '), undefined);
      assert.strictEqual(validateJoinDelimiterInput('x'.repeat(100)), undefined);
      assert.ok(validateJoinDelimiterInput('x'.repeat(101)));
      assert.ok(validateJoinDelimiterInput('a\nb'));
      // The MSEL-016 / 017 / 021 delimiter still rejects an empty value.
      assert.strictEqual(validateMselDelimiterInput(''), 'Enter a delimiter');
    });
  });

  suite('searchTargets (LINEX-015..019)', () => {
    test('the non-empty selections when there is one; cursors among them are ignored', () => {
      assert.deepStrictEqual(searchTargets('abcdef', [{ start: 0, end: 0 }, { start: 2, end: 4 }]), [{ start: 2, end: 4 }]);
      assert.deepStrictEqual(searchTargets('abcdef', [{ start: 1, end: 2 }, { start: 3, end: 5 }]), [{ start: 1, end: 2 }, { start: 3, end: 5 }]);
    });

    test('the whole document when every selection is empty (one or several cursors)', () => {
      assert.deepStrictEqual(searchTargets('abcdef', [{ start: 3, end: 3 }]), [{ start: 0, end: 6 }]);
      assert.deepStrictEqual(searchTargets('abcdef', [{ start: 1, end: 1 }, { start: 5, end: 5 }]), [{ start: 0, end: 6 }]);
    });

    const commands: [string, (text: string, ranges: readonly MselRange[]) => MselResult, string, string, string][] = [
      ['LINEX-015', selectEmails, 'x@y.jp', 'z@w.jp', 'q@r.jp'],
      ['LINEX-016', selectIps, '10.0.0.1', '192.168.0.1', '::1'],
      ['LINEX-017', selectHexColors, '#000', '#112233', '#fff'],
      ['LINEX-018', selectUuids, '00000000-0000-0000-0000-000000000000', '550e8400-e29b-41d4-a716-446655440000', '11111111-1111-1111-1111-111111111111'],
      ['LINEX-019', selectDates, '2026-01-01', '2026-10-01', '2026-12-31'],
    ];
    for (const [id, fn, before, inside, after] of commands) {
      test(`${id}: cursors → the whole document; a selection with a cursor → only its inside; nothing inside → warning`, () => {
        assert.strictEqual(apply(fn, `${before}| ${inside} ${after}`), `[${before}] [${inside}] [${after}]`, 'one cursor');
        assert.strictEqual(apply(fn, `|${before} ${inside} ${after}|`), `[${before}] [${inside}] [${after}]`, 'two cursors');
        assert.strictEqual(apply(fn, `${before}| [a ${inside}] ${after}`), `${before} a [${inside}] ${after}`, 'mixed');
        assert.ok(apply(fn, `${before}| [abc] ${after}`).startsWith('warn: No '), 'nothing inside the selection');
        assert.ok(apply(fn, `${before}| [abc] ${after}`).endsWith(' were found in the selections.'));
        assert.ok(apply(fn, 'abc|').endsWith(' were found in the document.'));
      });
    }

    test('a match across the border of a selection is not selected', () => {
      assert.strictEqual(apply(selectEmails, '[a x@y].jp'), 'warn: No email addresses were found in the selections.');
      assert.strictEqual(apply(selectHexColors, '[#11]2233'), 'warn: No hex colors were found in the selections.');
    });

    test('selecting the same ranges again changes nothing', () => {
      assert.strictEqual(apply(selectEmails, 'a [x@y.jp] b'), 'unchanged');
    });

    test('more than MSEL_MAX_SELECTIONS matches throw (the handler warns)', () => {
      const text = Array.from({ length: MSEL_MAX_SELECTIONS + 1 }, () => '#fff').join(' ');
      assert.throws(() => selectHexColors(text, [{ start: 0, end: 0 }]), MselTooManySelectionsError);
    });
  });

  suite('patterns', () => {
    test('LINEX-015: the same results as the extract.email pattern, in linear time', () => {
      const pattern = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;
      const samples = [
        'a x@y.jp b', 'a@b@c.com', 'a@b.c@d.ef', 'a@b.cd5x@e.fg', 'x@y', 'x@.com', 'x@a.b', 'x@a..com', '@a.com',
        'first.last+tag@sub.example.co.jp.', 'x@a.b.cd.e', 'mail me at a_b%c@d-e.fg!', 'x@1.23', 'aa@bb.c1d',
      ];
      for (const sample of samples) {
        assert.deepStrictEqual(findEmails(sample), [...sample.matchAll(pattern)].map((m) => [m.index!, m.index! + m[0].length]), sample);
      }
      // A fixed pseudo-random sweep over the characters that matter.
      let seed = 12345;
      const random = () => {
        seed = (seed * 1103515245 + 12345) & 0x7fffffff;
        return seed / 0x7fffffff;
      };
      const alphabet = 'ab.-_@%+1 Z';
      for (let k = 0; k < 20000; k++) {
        let sample = '';
        const length = Math.floor(random() * 16);
        for (let i = 0; i < length; i++) {
          sample += alphabet[Math.floor(random() * alphabet.length)];
        }
        assert.deepStrictEqual(findEmails(sample), [...sample.matchAll(pattern)].map((m) => [m.index!, m.index! + m[0].length]), sample);
      }
      // Long runs that make the regular expression quadratic finish quickly here.
      const started = Date.now();
      findEmails('a'.repeat(2_000_000));
      findEmails(`a@${'a.'.repeat(1_000_000)}1`);
      assert.ok(Date.now() - started < 2000, `${Date.now() - started} ms`);
    });

    test('LINEX-016: IPv4 / IPv6 (the examples of the specification)', () => {
      const cases: [string, string[]][] = [
        ['host 10.0.0.1 ok', ['10.0.0.1']],
        ['a 2001:db8::1 b', ['2001:db8::1']],
        ['a ::1 b 256.1.1.1', ['::1']],
        ['a 1:2:3:4:5:6:7:8:9 b', []],
        ['ping 10.0.0.1.', ['10.0.0.1']],
        ['use ::1.', ['::1']],
        ['map ::ffff:192.0.2.1 ok', ['::ffff:192.0.2.1']],
        ['host:10.0.0.1', ['10.0.0.1']],
        ['std::vector', []],
        ['a :: b', []],
        // Review carry-over: one leading ":" after a word is a separator (as with IPv4).
        ['addr:fe80::1', ['fe80::1']],
        ['x 1:2:3:4:5:6:7:8 y', ['1:2:3:4:5:6:7:8']],
        ['fe80::1%eth0', ['fe80::1']],
        // As extract.ip: the first four numbers of a longer dotted run.
        ['1.2.3.4.5', ['1.2.3.4']],
        ['time 12:34:56', []],
      ];
      for (const [text, expected] of cases) {
        assert.deepStrictEqual(found(findIps, text), expected, text);
      }
      assert.strictEqual(apply(selectIps, 'a 1:2:3:4:5:6:7:8:9 b|'), 'warn: No IP addresses were found in the document.');
    });

    test('LINEX-016: isValidIPv6', () => {
      for (const valid of ['::1', '::', '1::', '2001:db8::1', '1:2:3:4:5:6:7:8', '::ffff:192.0.2.1', '1:2:3:4:5:6:1.2.3.4', 'FE80::ABCD']) {
        assert.ok(isValidIPv6(valid), valid);
      }
      for (const invalid of ['1:2:3:4:5:6:7:8:9', '1:2:3:4:5:6:7', '1::2::3', '1:::2', '12345::1', ':1', '1:', 'g::1', '::1.2.3.256', '1.2.3.4::1', '1:2:3:4:5:6:7:1.2.3.4']) {
        assert.ok(!isValidIPv6(invalid), invalid);
      }
    });

    test('LINEX-017: hex colors', () => {
      assert.deepStrictEqual(found(findHexColors, 'color:#fff;bg:#112233'), ['#fff', '#112233']);
      assert.deepStrictEqual(found(findHexColors, 'c:#11223344'), ['#11223344']);
      assert.deepStrictEqual(found(findHexColors, 'x #12345 #fffg #abcd'), []);
    });

    test('LINEX-018: UUIDs', () => {
      assert.deepStrictEqual(found(findUuids, 'id=550e8400-e29b-41d4-a716-446655440000'), ['550e8400-e29b-41d4-a716-446655440000']);
      assert.deepStrictEqual(found(findUuids, 'x550e8400-e29b-41d4-a716-446655440000'), []);
      assert.deepStrictEqual(found(findUuids, '550e8400-e29b-41d4-a716-4466554400001'), []);
    });

    test('LINEX-019: ISO dates (Gregorian leap years)', () => {
      const cases: [string, string[]][] = [
        ['from 2026-10-01 to 2026-10-31', ['2026-10-01', '2026-10-31']],
        ['at 2026-10-01T12:34:56.789+09:00 ok', ['2026-10-01T12:34:56.789+09:00']],
        ['at 2026-10-01 12:34Z ok', ['2026-10-01 12:34Z']],
        ['bad 2026-13-01 2026-02-30', []],
        ['leap 2024-02-29 2000-02-29', ['2024-02-29', '2000-02-29']],
        ['no 2025-02-29 1900-02-29', []],
        ['x 2026-10-01 25:00', ['2026-10-01']],
        ['x 2026-10-01T25:00', []],
        ['12026-10-01 2026-10-011', []],
      ];
      for (const [text, expected] of cases) {
        assert.deepStrictEqual(found(findDates, text), expected, text);
      }
      assert.ok(isValidDate(2024, 2, 29));
      assert.ok(!isValidDate(2023, 2, 29));
      assert.ok(!isValidDate(2026, 4, 31));
      assert.ok(!isValidDate(2026, 0, 1));
    });

    test('the fixed patterns stay fast on long inputs', () => {
      const started = Date.now();
      findIps('1:'.repeat(500_000));
      findIps('1.'.repeat(500_000));
      findDates('2026-10-01 '.repeat(100_000));
      findHexColors('#'.repeat(1_000_000));
      findUuids('0'.repeat(1_000_000));
      assert.ok(Date.now() - started < 3000, `${Date.now() - started} ms`);
    });
  });

  suite('blank lines (shared definition)', () => {
    test('empty, spaces, tabs, U+3000 and U+00A0 are blank; U+FEFF, U+200B and text are not', () => {
      for (const blank of ['', '  ', '\t', '　', ' ']) {
        assert.ok(isBlankLine(blank), JSON.stringify(blank));
      }
      for (const notBlank of ['﻿', '​', ' a ']) {
        assert.ok(!isBlankLine(notBlank), JSON.stringify(notBlank));
      }
    });
  });

  suite('LINEX-020 expand-to-sentence', () => {
    const cases: [string, string][] = [
      ['Hi. This is| a pen. Bye.', 'Hi. [This is a pen.] Bye.'],
      ['こんにちは。今日は|晴れ！明日は？', 'こんにちは。[今日は晴れ！]明日は？'],
      ['Ver 1.2 is| out. Next.', '[Ver 1.2 is out.] Next.'],
      ['Line one⏎⏎Line| two', 'Line one⏎⏎[Line two]'],
      ['A b|c d|e. F.', '[A bc de.] F.'],
      ['Hi there⏎··⏎Next| one.', 'Hi there⏎··⏎[Next one.]'],
      ['Hi there⏎　⏎Next| one.', 'Hi there⏎　⏎[Next one.]'],
      ['A one. B t[wo. C th]ree. D.', 'A one. [B two. C three.] D.'],
      ['First [one.⏎⏎Sec]ond. Next.', '[First one.⏎⏎Second.] Next.'],
      ['One⏎two. Th|ree', 'One⏎two. [Three]'],
      ['A.| B.', '[A.] B.'],
      ['A. | B.', 'A.··[B.]'],
    ];
    for (const [input, expected] of cases) {
      test(`${input} → ${expected}`, () => {
        assert.strictEqual(apply(expandToSentence, input), expandNotation(expected));
      });
    }

    test('a cursor on a blank line does not move', () => {
      assert.strictEqual(apply(expandToSentence, 'a.⏎|⏎b.'), 'unchanged');
    });

    test('sentencesOf: terminators, full-width terminators and the paragraph end', () => {
      const sentences = (value: string) => sentencesOf(value).map(([start, end]) => value.slice(start, end));
      assert.deepStrictEqual(sentences(' Hi.  This is it! Ok? end '), ['Hi.', 'This is it!', 'Ok?', 'end']);
      assert.deepStrictEqual(sentences('a。b！c？d'), ['a。', 'b！', 'c？', 'd']);
      assert.deepStrictEqual(sentences('1.2.3 x.\nnext'), ['1.2.3 x.', 'next']);
    });
  });

  suite('LINEX-021 expand-to-paragraph', () => {
    const cases: [string, string][] = [
      ['p1⏎⏎a|b⏎cd⏎⏎p3', 'p1⏎⏎[ab⏎cd]⏎⏎p3'],
      ['a⏎b⏎··⏎c|⏎d', 'a⏎b⏎··⏎[c⏎d]'],
      ['a⏎b⏎　⏎c|⏎d', 'a⏎b⏎　⏎[c⏎d]'],
      ['p1⏎⏎a[b⏎⏎c]d⏎⏎p3', 'p1⏎⏎[ab⏎⏎cd]⏎⏎p3'],
      ['p1⏎[⏎a]b⏎⏎p3', 'p1⏎[⏎ab]⏎⏎p3'],
      ['p1⏎⏎a|b⏎c|d⏎⏎p3', 'p1⏎⏎[ab⏎cd]⏎⏎p3'],
      ['a|b⏎⏎c|d', '[ab]⏎⏎[cd]'],
      // Review carry-over: an end at the start of a line counts in that line; it is expanded only
      // when the paragraph goes on there (the line is not blank and not the first of a paragraph).
      ['p1⏎⏎[ab⏎]cd⏎⏎p3', 'p1⏎⏎[ab⏎cd]⏎⏎p3'],
      ['p1⏎⏎[ab⏎]⏎p3', 'unchanged'],
      ['[ab⏎⏎]cd', 'unchanged'],
      ['a[b⏎⏎]cd', '[ab⏎⏎]cd'],
    ];
    for (const [input, expected] of cases) {
      test(`${input} → ${expected}`, () => {
        assert.strictEqual(apply(expandToParagraph, input), expected === 'unchanged' ? expected : expandNotation(expected));
      });
    }

    test('a cursor on a blank line does not move', () => {
      assert.strictEqual(apply(expandToParagraph, 'p1⏎|⏎p3'), 'unchanged');
    });

    test('CRLF line breaks', () => {
      const text = 'p1\r\n\r\nab\r\ncd\r\n\r\np3';
      const result = expandToParagraph(text, [{ start: 7, end: 7 }]);
      assert.deepStrictEqual(result, { kind: 'select', ranges: [{ start: 6, end: 12, reversed: undefined }] });
    });

    test('many cursors in one long paragraph are answered quickly', () => {
      const text = Array.from({ length: 50_000 }, () => 'line').join('\n');
      const ranges = Array.from({ length: 50_000 }, (_value, i) => ({ start: i * 5, end: i * 5 }));
      const started = Date.now();
      const result = expandToParagraph(text, ranges);
      assert.deepStrictEqual(result, { kind: 'select', ranges: [{ start: 0, end: text.length, reversed: undefined }] });
      const sentences = expandToSentence(text, ranges);
      assert.strictEqual(sentences.kind, 'select');
      assert.ok(Date.now() - started < 3000, `${Date.now() - started} ms`);
    });
  });

  suite('LINEX-022 keep-duplicate-text', () => {
    test('keeps the selections whose text appears twice or more', () => {
      assert.strictEqual(apply(keepDuplicateText, '[a] [b] [a]'), '[a] b [a]');
      assert.strictEqual(apply(keepDuplicateText, '[a] [A] [a] [b] [b]'), '[a] A [a] [b] [b]');
    });

    test('none: a notification; all: unchanged; one selection: needs two', () => {
      assert.strictEqual(apply(keepDuplicateText, '[a] [b]'), `info: ${MSEL2_NO_DUPLICATES}`);
      assert.strictEqual(apply(keepDuplicateText, '[a] [a]'), 'unchanged');
      assert.strictEqual(apply(keepDuplicateText, '[a] b'), `warn: ${MSEL_NEED_TWO}`);
    });
  });

  suite('LINEX-023 join-into-first', () => {
    const edit = (value: string, delimiter: string) => {
      const { text, ranges } = marked(value);
      return joinIntoFirst(text, ranges, delimiter);
    };

    test('joins into the first selection and deletes the other texts', () => {
      assert.deepStrictEqual(edit('[a] [b] [c]', ', '), {
        kind: 'edit',
        edits: [{ start: 0, end: 1, text: 'a, b, c' }, { start: 2, end: 3, text: '' }, { start: 4, end: 5, text: '' }],
        ranges: [{ start: 0, end: 7 }],
      });
    });

    test('an empty delimiter joins without a separator', () => {
      const result = edit('[a] [b] [c]', '');
      assert.strictEqual(result.kind, 'edit');
      assert.strictEqual(result.kind === 'edit' ? result.edits[0].text : '', 'abc');
    });

    test('the delimiter is checked again: a line break throws MselInputError', () => {
      assert.throws(() => edit('[a] [b]', 'a\nb'), MselInputError);
      assert.throws(() => edit('[a] [b]', 'x'.repeat(101)), MselInputError);
    });

    test('needs two selections; a result over MAX_OUTPUT_LENGTH warns', () => {
      assert.deepStrictEqual(edit('[a] b', ', '), { kind: 'warn', message: MSEL_NEED_TWO });
      const long = 'x'.repeat(5_000_001);
      const result = joinIntoFirst(`${long} ${long}`, [{ start: 0, end: long.length }, { start: long.length + 1, end: 2 * long.length + 1 }], '');
      assert.strictEqual(result.kind, 'warn');
    });

    test('cursors count as empty texts', () => {
      const result = edit('[a] |', '-');
      assert.deepStrictEqual(result, { kind: 'edit', edits: [{ start: 0, end: 1, text: 'a-' }], ranges: [{ start: 0, end: 2 }] });
    });
  });

  test('the new modules use no code evaluation, processes, files, network or webviews', () => {
    const forbidden = [
      /\beval\s*\(/, /new\s+Function\b/, /child_process/, /from\s+'(?:node:)?fs'/, /require\(\s*'fs'\s*\)/,
      /from\s+'(?:node:)?(?:https?|net|dns|tls|dgram)'/, /\bfetch\s*\(/, /XMLHttpRequest/, /createWebviewPanel|Webview/, /new\s+RegExp\s*\(/,
    ];
    for (const file of ['src/handler/line2Transforms.ts', 'src/handler/line2CommandHandler.ts', 'src/handler/msel2Transforms.ts']) {
      const source = readRepoFile(file);
      for (const pattern of forbidden) {
        assert.doesNotMatch(source, pattern, `${file}: ${pattern}`);
      }
    }
  });
});
