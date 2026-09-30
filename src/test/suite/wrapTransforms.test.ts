import * as assert from 'assert';
import {
  MAX_ADDED_LENGTH,
  REMOVABLE_BRACKETS,
  validateAffixInput,
  validateTagNameInput,
  WRAP_COMMANDS,
  WRAP_CONTENT_COMMANDS,
  WRAP_INPUT_COMMANDS,
  WrapCommand,
  WrapOptions,
  WrapOutputTooLargeError,
  wrapTransforms,
} from '../../handler/wrapTransforms';

const LF: WrapOptions = { eol: '\n' };
const CRLF: WrapOptions = { eol: '\r\n' };

const run = (command: WrapCommand, text: string, options: Partial<WrapOptions> = {}): string =>
  wrapTransforms[command](text, { ...LF, ...options });

interface Example {
  id: string;
  command: WrapCommand;
  input: string;
  expected: string;
  options?: Partial<WrapOptions>;
}

/** The input / output examples of the WRAP commands of the showcase data (scripts/showcase-data/WRAP.json), as they are (⏎ = \n). */
const roadmapExamples: Example[] = [
  { id: 'WRAP-001', command: 'enclose.custom', input: 'abc', expected: '<<abc>>', options: { prefix: '<<', suffix: '>>' } },
  { id: 'WRAP-002', command: 'enclose.each-line.custom', input: 'a\nb', expected: '[a]\n[b]', options: { prefix: '[', suffix: ']' } },
  { id: 'WRAP-003', command: 'quote.each-line.double', input: 'a\nb', expected: '"a"\n"b"' },
  { id: 'WRAP-004', command: 'quote.each-line.single', input: 'a\nb', expected: "'a'\n'b'" },
  { id: 'WRAP-005', command: 'quote.each-word.double', input: 'a b', expected: '"a" "b"' },
  { id: 'WRAP-006', command: 'quote.list.sql-in', input: "a\nO'Neil", expected: "('a', 'O''Neil')" },
  { id: 'WRAP-007', command: 'quote.list.array', input: 'a\nb', expected: '["a", "b"]' },
  { id: 'WRAP-008', command: 'quote.triple-double', input: 'abc', expected: '"""abc"""' },
  { id: 'WRAP-009', command: 'quote.guillemets', input: 'abc', expected: '«abc»' },
  { id: 'WRAP-010', command: 'quote.smart-double', input: 'abc', expected: '“abc”' },
  { id: 'WRAP-011', command: 'quote.smart-single', input: 'abc', expected: '‘abc’' },
  { id: 'WRAP-012', command: 'quote.double-escaped', input: 'say "hi"', expected: '"say \\"hi\\""' },
  { id: 'WRAP-013', command: 'unquote.each-line', input: '"a"\n\'b\'', expected: 'a\nb' },
  { id: 'WRAP-014', command: 'enclose.japanese.white-lenticular', input: '注意', expected: '〖注意〗' },
  { id: 'WRAP-015', command: 'enclose.japanese.tortoise-shell', input: '注', expected: '〔注〕' },
  { id: 'WRAP-016', command: 'enclose.japanese.double-angle', input: '書名', expected: '《書名》' },
  { id: 'WRAP-017', command: 'enclose.japanese.single-angle', input: '論文', expected: '〈論文〉' },
  { id: 'WRAP-018', command: 'enclose.html-tag', input: 'abc', expected: '<b>abc</b>', options: { tagName: 'b' } },
  { id: 'WRAP-019', command: 'enclose.html-comment', input: 'abc', expected: '<!-- abc -->' },
  { id: 'WRAP-020', command: 'enclose.block-comment', input: 'abc', expected: '/* abc */' },
  { id: 'WRAP-021', command: 'enclose.placeholder', input: 'name', expected: '${name}' },
  { id: 'WRAP-022', command: 'enclose.mustache', input: 'name', expected: '{{ name }}' },
  { id: 'WRAP-023', command: 'enclose.percent', input: 'PATH', expected: '%PATH%' },
  { id: 'WRAP-024', command: 'enclose.pipes', input: 'abc', expected: '|abc|' },
  { id: 'WRAP-025', command: 'enclose.ascii-box', input: 'abc', expected: '+-----+\n| abc |\n+-----+' },
  { id: 'WRAP-026', command: 'enclose.each-word.paren', input: 'a b', expected: '(a) (b)' },
  { id: 'WRAP-027', command: 'enclose.lines-block', input: 'a\nb', expected: 'BEGIN\na\nb\nEND', options: { before: 'BEGIN', after: 'END' } },
  { id: 'WRAP-028', command: 'enclose.cycle-brackets', input: '(a)', expected: '[a]' },
  { id: 'WRAP-029', command: 'enclose.remove-outer-brackets', input: '((a))', expected: '(a)' },
  { id: 'WRAP-030', command: 'enclose.markdown-inline-code', input: 'a`b', expected: '``a`b``' },
];

suite('Wrap Transforms (WRAP-001..030) Test Suite', () => {

  suite('ROADMAP examples', () => {
    test('the example table covers all 30 commands in ROADMAP order', () => {
      assert.deepStrictEqual(roadmapExamples.map((e) => e.command), [...WRAP_COMMANDS]);
      assert.deepStrictEqual(
        roadmapExamples.map((e) => e.id),
        Array.from({ length: 30 }, (_, i) => `WRAP-${String(i + 1).padStart(3, '0')}`)
      );
    });

    roadmapExamples.forEach((e) => {
      test(`${e.id} ${e.command}`, () => {
        assert.strictEqual(run(e.command, e.input, e.options), e.expected);
      });
    });
  });

  suite('command groups', () => {
    test('4 input commands and 12 content commands, all known', () => {
      assert.strictEqual(WRAP_INPUT_COMMANDS.length, 4);
      assert.strictEqual(WRAP_CONTENT_COMMANDS.length, 12);
      assert.strictEqual(new Set(WRAP_CONTENT_COMMANDS).size, 12);
      [...WRAP_INPUT_COMMANDS, ...WRAP_CONTENT_COMMANDS].forEach((c) => assert.ok(WRAP_COMMANDS.includes(c), c));
    });
  });

  suite('enclose whole selection (empty text gets the pair)', () => {
    const pairs: [WrapCommand, string][] = [
      ['quote.triple-double', '""""""'],
      ['quote.guillemets', '«»'],
      ['quote.smart-double', '“”'],
      ['quote.smart-single', '‘’'],
      ['quote.double-escaped', '""'],
      ['enclose.japanese.white-lenticular', '〖〗'],
      ['enclose.japanese.tortoise-shell', '〔〕'],
      ['enclose.japanese.double-angle', '《》'],
      ['enclose.japanese.single-angle', '〈〉'],
      ['enclose.html-comment', '<!--  -->'],
      ['enclose.block-comment', '/*  */'],
      ['enclose.placeholder', '${}'],
      ['enclose.mustache', '{{  }}'],
      ['enclose.percent', '%%'],
      ['enclose.pipes', '||'],
      ['enclose.markdown-inline-code', '``'],
    ];
    pairs.forEach(([command, expected]) => {
      test(`${command} on empty text`, () => {
        assert.strictEqual(run(command, ''), expected);
      });
    });

    test('multi-line text is enclosed as a whole, line breaks kept', () => {
      assert.strictEqual(run('quote.smart-double', 'a\nb\n'), '“a\nb\n”');
      assert.strictEqual(run('enclose.block-comment', 'a\r\nb', CRLF), '/* a\r\nb */');
    });

    test('WRAP-019 / WRAP-020 do not change the text inside', () => {
      assert.strictEqual(run('enclose.html-comment', 'a --> b'), '<!-- a --> b -->');
      assert.strictEqual(run('enclose.block-comment', 'a */ b'), '/* a */ b */');
    });
  });

  suite('WRAP-001 / WRAP-002 custom prefix and suffix', () => {
    test('empty text gets prefix and suffix (WRAP-001)', () => {
      assert.strictEqual(run('enclose.custom', '', { prefix: '<', suffix: '>' }), '<>');
    });

    test('prefix only / suffix only', () => {
      assert.strictEqual(run('enclose.custom', 'a', { prefix: '- ' }), '- a');
      assert.strictEqual(run('enclose.custom', 'a', { suffix: ';' }), 'a;');
    });

    test('both empty leaves the text unchanged', () => {
      assert.strictEqual(run('enclose.custom', 'a', { prefix: '', suffix: '' }), 'a');
      assert.strictEqual(run('enclose.each-line.custom', 'a\nb', { prefix: '', suffix: '' }), 'a\nb');
    });

    test('WRAP-002 keeps empty lines and the trailing line break, joins with the document EOL', () => {
      assert.strictEqual(run('enclose.each-line.custom', 'a\n\nb\n', { prefix: '[', suffix: ']' }), '[a]\n\n[b]\n');
      assert.strictEqual(
        run('enclose.each-line.custom', 'a\r\nb\r\n', { ...CRLF, prefix: '[', suffix: ']' }),
        '[a]\r\n[b]\r\n'
      );
      // Whitespace-only lines are not empty.
      assert.strictEqual(run('enclose.each-line.custom', ' \nb', { prefix: '[', suffix: ']' }), '[ ]\n[b]');
    });
  });

  suite('WRAP-003 / WRAP-004 / WRAP-013 each line', () => {
    test('empty lines are kept, the trailing line break is not a line', () => {
      assert.strictEqual(run('quote.each-line.double', 'a\n\nb\n'), '"a"\n\n"b"\n');
      assert.strictEqual(run('quote.each-line.single', 'a\r\nb', CRLF), "'a'\r\n'b'");
      assert.strictEqual(run('quote.each-line.double', '  a'), '"  a"');
    });

    test('WRAP-013 removes one matching pair and keeps the surrounding whitespace', () => {
      assert.strictEqual(run('unquote.each-line', '  "a"  \n`b`\n""x""'), '  a  \nb\n"x"');
      assert.strictEqual(run('unquote.each-line', '"a"\r\n\'b\'\r\n', CRLF), 'a\r\nb\r\n');
    });

    test('WRAP-013 leaves mismatched quotes, single characters and unquoted lines alone', () => {
      assert.strictEqual(run('unquote.each-line', '"a\'\n"\na\n\n  '), '"a\'\n"\na\n\n  ');
      assert.strictEqual(run('unquote.each-line', '""'), '');
      assert.strictEqual(run('unquote.each-line', '“a”'), '“a”');
    });
  });

  suite('WRAP-005 / WRAP-026 each word', () => {
    test('whitespace runs and line breaks are kept', () => {
      assert.strictEqual(run('quote.each-word.double', '  a\t b\n\nc '), '  "a"\t "b"\n\n"c" ');
      assert.strictEqual(run('enclose.each-word.paren', 'a  b\r\nc', CRLF), '(a)  (b)\r\n(c)');
      assert.strictEqual(run('enclose.each-word.paren', 'foo,bar baz'), '(foo,bar) (baz)');
    });

    test('whitespace only is unchanged', () => {
      assert.strictEqual(run('quote.each-word.double', ' \n '), ' \n ');
    });
  });

  suite('WRAP-006 / WRAP-007 lists', () => {
    test('blank and whitespace-only lines are skipped', () => {
      assert.strictEqual(run('quote.list.sql-in', 'a\n\n  \nb'), "('a', 'b')");
      assert.strictEqual(run('quote.list.array', 'a\n\n\t\nb'), '["a", "b"]');
    });

    test('line content is used as it is (spaces kept)', () => {
      assert.strictEqual(run('quote.list.sql-in', ' a '), "(' a ')");
    });

    test('WRAP-006 doubles every single quote', () => {
      assert.strictEqual(run('quote.list.sql-in', "'x''\nit's"), "('''x''''', 'it''s')");
    });

    test('WRAP-006 keeps an injection attempt inside the literal (single quotes only)', () => {
      assert.strictEqual(run('quote.list.sql-in', "'; DROP TABLE t; --"), "('''; DROP TABLE t; --')");
      assert.strictEqual(run('quote.list.sql-in', "O'Neil\r\nit's\r\n", CRLF), "('O''Neil', 'it''s')\r\n");
    });

    test('WRAP-006 refuses a line with a backslash (MySQL default mode), naming the line', () => {
      const refused = (text: string, lineNumber: number) =>
        assert.throws(
          () => run('quote.list.sql-in', text),
          (error: unknown) =>
            error instanceof Error &&
            error.message === `line ${lineNumber} contains a backslash (\\), which is not safe in MySQL's default mode (the SQL is written as standard SQL)`,
          text
        );
      refused('C:\\Users', 1);
      refused("O\\'Neil", 1);
      refused('a\nb\\', 2);
      // The line number counts the blank lines that are skipped in the list.
      refused('a\n\n  \n\\x', 4);
      refused('a\r\n\r\nb\\\r\n', 3);
    });

    test('WRAP-006 checks every line before building (no partial result, even over the size limit)', () => {
      // The size check would fail too; the backslash is reported first, so nothing is built at all.
      assert.throws(() => run('quote.list.sql-in', `${'a\n'.repeat(10)}\\`, { maxAddedLength: 1 }), /line 11 contains a backslash/);
    });

    test('WRAP-007 escapes backslashes and double quotes', () => {
      assert.strictEqual(run('quote.list.array', 'a\\b\nsay "hi"'), '["a\\\\b", "say \\"hi\\""]');
    });

    test('a trailing line break is kept after the list; CRLF input', () => {
      assert.strictEqual(run('quote.list.sql-in', 'a\r\nb\r\n', CRLF), "('a', 'b')\r\n");
      assert.strictEqual(run('quote.list.array', 'a\n'), '["a"]\n');
    });

    test('only blank lines leaves the text unchanged', () => {
      assert.strictEqual(run('quote.list.sql-in', '\n  \n'), '\n  \n');
      assert.strictEqual(run('quote.list.array', ' '), ' ');
    });
  });

  suite('WRAP-012 double with escaping', () => {
    test('backslashes are escaped before quotes, line breaks are kept', () => {
      assert.strictEqual(run('quote.double-escaped', 'a\\"b'), '"a\\\\\\"b"');
      assert.strictEqual(run('quote.double-escaped', 'a\nb'), '"a\nb"');
    });
  });

  suite('WRAP-018 HTML tag', () => {
    test('tag names with letters, digits and hyphens', () => {
      assert.strictEqual(run('enclose.html-tag', 'x', { tagName: 'my-tag' }), '<my-tag>x</my-tag>');
      assert.strictEqual(run('enclose.html-tag', '', { tagName: 'h1' }), '<h1></h1>');
    });

    test('an invalid tag name throws (checked again in the transform)', () => {
      ['b onclick=x', '<b>', 'a_b', '', 'x'.repeat(65), 'b\n'].forEach((tagName) => {
        assert.throws(() => run('enclose.html-tag', 'x', { tagName }), Error, JSON.stringify(tagName));
      });
      assert.throws(() => run('enclose.html-tag', 'x'), Error);
    });

    test('validateTagNameInput', () => {
      ['div', 'my-tag', 'h1', 'A', 'x'.repeat(64)].forEach((v) => assert.strictEqual(validateTagNameInput(v), undefined, v));
      ['b onclick=x', '<b>', 'a_b', '', 'x'.repeat(65), 'ä', ' div'].forEach((v) => assert.ok(validateTagNameInput(v), v));
    });
  });

  suite('validateAffixInput', () => {
    test('0 to 1,000 characters without line breaks', () => {
      ['', 'x', ' ', 'x'.repeat(1000), '<<', '${'].forEach((v) => assert.strictEqual(validateAffixInput(v), undefined));
      ['x'.repeat(1001), 'a\nb', 'a\r', '\r\n'].forEach((v) => assert.ok(validateAffixInput(v), JSON.stringify(v)));
    });
  });

  suite('WRAP-025 ASCII box', () => {
    test('several lines are padded to the longest line', () => {
      assert.strictEqual(
        run('enclose.ascii-box', 'a\nabc\n'),
        '+-----+\n| a   |\n| abc |\n+-----+\n'
      );
    });

    test('empty lines and CRLF', () => {
      assert.strictEqual(
        run('enclose.ascii-box', 'ab\r\n\r\nc', CRLF),
        '+----+\r\n| ab |\r\n|    |\r\n| c  |\r\n+----+'
      );
    });

    test('width is counted in code points', () => {
      assert.strictEqual(run('enclose.ascii-box', '😀\nab'), '+----+\n| 😀  |\n| ab |\n+----+');
      assert.strictEqual(run('enclose.ascii-box', '注意'), '+----+\n| 注意 |\n+----+');
    });
  });

  suite('WRAP-027 lines block', () => {
    test('selection ending with a line break gets the after line before the final EOL', () => {
      assert.strictEqual(run('enclose.lines-block', 'a\nb\n', { before: 'BEGIN', after: 'END' }), 'BEGIN\na\nb\nEND\n');
    });

    test('uses the document EOL', () => {
      assert.strictEqual(run('enclose.lines-block', 'a\r\nb', { ...CRLF, before: '{', after: '}' }), '{\r\na\r\nb\r\n}');
      assert.strictEqual(run('enclose.lines-block', 'a\r\n', { ...CRLF, before: '{', after: '}' }), '{\r\na\r\n}\r\n');
    });

    test('empty lines may be inserted', () => {
      assert.strictEqual(run('enclose.lines-block', 'a', { before: '', after: '' }), '\na\n');
    });
  });

  suite('WRAP-028 cycle brackets', () => {
    test('() -> [] -> {} -> ()', () => {
      assert.strictEqual(run('enclose.cycle-brackets', '(a)'), '[a]');
      assert.strictEqual(run('enclose.cycle-brackets', '[a]'), '{a}');
      assert.strictEqual(run('enclose.cycle-brackets', '{a}'), '(a)');
      assert.strictEqual(run('enclose.cycle-brackets', '((a))'), '[(a)]');
      assert.strictEqual(run('enclose.cycle-brackets', '(a(b)c)'), '[a(b)c]');
      assert.strictEqual(run('enclose.cycle-brackets', '()'), '[]');
      assert.strictEqual(run('enclose.cycle-brackets', '(\na\n)'), '[\na\n]');
    });

    test('unchanged when the outer pair does not match', () => {
      ['(a)(b)', '(a', 'a)', '(a]', 'a', '', '(', ' (a)', '(a) ', '<a>', '（a）'].forEach((text) => {
        assert.strictEqual(run('enclose.cycle-brackets', text), text, text);
      });
    });

    test('only the same kind of bracket is counted', () => {
      assert.strictEqual(run('enclose.cycle-brackets', '(a])'), '[a]]');
      assert.strictEqual(run('enclose.cycle-brackets', '([)]'), '([)]');
      assert.strictEqual(run('enclose.cycle-brackets', '([)])'), '([)])');
    });
  });

  suite('WRAP-029 remove matching outer brackets', () => {
    test('removes one matching outer pair of each supported kind', () => {
      REMOVABLE_BRACKETS.forEach(([open, close]) => {
        assert.strictEqual(run('enclose.remove-outer-brackets', `${open}a${close}`), 'a', open);
      });
      assert.strictEqual(run('enclose.remove-outer-brackets', '(a])'), 'a]');
      assert.strictEqual(run('enclose.remove-outer-brackets', '「a「b」」'), 'a「b」');
      assert.strictEqual(run('enclose.remove-outer-brackets', '()'), '');
    });

    test('unchanged when the outer pair does not match', () => {
      ['(a)(b)', '「a」「b」', '(a]', '"a"', 'a', '', ' (a)', '(a', '（a)'].forEach((text) => {
        assert.strictEqual(run('enclose.remove-outer-brackets', text), text, text);
      });
    });
  });

  suite('WRAP-030 backtick code', () => {
    test('the fence is longer than the longest backtick run', () => {
      assert.strictEqual(run('enclose.markdown-inline-code', 'abc'), '`abc`');
      assert.strictEqual(run('enclose.markdown-inline-code', 'a```b``c'), '````a```b``c````');
    });

    test('a space is added when the content starts or ends with a backtick', () => {
      assert.strictEqual(run('enclose.markdown-inline-code', '`a'), '`` `a ``');
      assert.strictEqual(run('enclose.markdown-inline-code', 'a`'), '`` a` ``');
      assert.strictEqual(run('enclose.markdown-inline-code', '```'), '```` ``` ````');
    });

    test('a space is added when the content starts and ends with a space (but is not all spaces)', () => {
      assert.strictEqual(run('enclose.markdown-inline-code', ' a '), '`  a  `');
      assert.strictEqual(run('enclose.markdown-inline-code', ' a'), '` a`');
      assert.strictEqual(run('enclose.markdown-inline-code', '  '), '`  `');
    });
  });

  suite('output size limit', () => {
    test('WRAP-025 throws before building a huge box', () => {
      const text = `${'k'.repeat(100000)}${'\na'.repeat(200)}`;
      assert.throws(() => run('enclose.ascii-box', text), (error: unknown) => {
        assert.ok(error instanceof WrapOutputTooLargeError);
        assert.ok(error.added > MAX_ADDED_LENGTH);
        assert.strictEqual(error.limit, MAX_ADDED_LENGTH);
        return true;
      });
    });

    test('WRAP-002 counts the prefix and suffix on every line', () => {
      const text = 'a\n'.repeat(6000);
      const options = { prefix: 'x'.repeat(1000), suffix: 'y'.repeat(1000) };
      assert.throws(() => run('enclose.each-line.custom', text, options), WrapOutputTooLargeError);
    });

    test('the limit given in the options is used', () => {
      assert.throws(() => run('quote.each-word.double', 'a b c', { maxAddedLength: 5 }), WrapOutputTooLargeError);
      assert.strictEqual(run('quote.each-word.double', 'a b c', { maxAddedLength: 6 }), '"a" "b" "c"');
      assert.throws(() => run('quote.guillemets', 'a', { maxAddedLength: 1 }), WrapOutputTooLargeError);
      assert.throws(() => run('enclose.markdown-inline-code', '``', { maxAddedLength: 7 }), WrapOutputTooLargeError);
    });

    test('the error message states the added characters and the limit', () => {
      const error = new WrapOutputTooLargeError(12345, MAX_ADDED_LENGTH);
      assert.strictEqual(error.message, 'The result would add 12,345 characters (limit: 10,000,000)');
    });
  });
});
