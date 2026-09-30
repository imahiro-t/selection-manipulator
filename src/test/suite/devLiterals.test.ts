import * as assert from 'assert';
import { EncOutputTooLargeError } from '../../handler/encodeTransforms';
import { DEV_MAX_INPUT_LENGTH, DevInputError, splitDevLines } from '../../handler/devCommon';
import {
  escapeCsvField,
  escapeMarkdown,
  escapeRegex,
  escapeSql,
  escapeTemplateLiteral,
  quotePosixShell,
  quotePowerShell,
  toGoRawString,
  toJavaString,
  toJsString,
  toPythonString,
  toTemplateLiteral,
} from '../../handler/devLiterals';
import { DEV_COMMAND_ENTRIES } from '../../handler/devTransforms';
import { writeCell } from '../../handler/tableCsv';

const transformOf = (id: string) => {
  const entry = DEV_COMMAND_ENTRIES.find((candidate) => candidate.id === id);
  assert.ok(entry, id);
  return entry.transform;
};

suite('Developer Literals (DEV-001..011) Test Suite', () => {

  suite('splitDevLines', () => {
    test('keeps CRLF, LF and lone CR with the line before them', () => {
      assert.deepStrictEqual(splitDevLines('a\r\nb\nc\rd'), [
        { text: 'a', lineBreak: '\r\n' },
        { text: 'b', lineBreak: '\n' },
        { text: 'c', lineBreak: '\r' },
        { text: 'd', lineBreak: '' },
      ]);
    });

    test('a text that ends with a line break has an empty last line', () => {
      assert.deepStrictEqual(splitDevLines('a\n'), [{ text: 'a', lineBreak: '\n' }, { text: '', lineBreak: '' }]);
      assert.deepStrictEqual(splitDevLines(''), [{ text: '', lineBreak: '' }]);
      assert.deepStrictEqual(splitDevLines('\r'), [{ text: '', lineBreak: '\r' }, { text: '', lineBreak: '' }]);
    });
  });

  suite('DEV-001 to-js-string', () => {
    test('quotes, backslashes and line breaks get their short escapes', () => {
      assert.strictEqual(toJsString('it\'s\nok'), '\'it\\\'s\\nok\'');
      assert.strictEqual(toJsString('a\\b"c'), '\'a\\\\b"c\'');
      assert.strictEqual(toJsString('a\r\nb\tc'), '\'a\\r\\nb\\tc\'');
    });

    test('other control characters become \\xhh; U+2028 / U+2029 become \\uhhhh', () => {
      assert.strictEqual(toJsString('\u0000\u0007\u000b\u001f\u007f'), '\'\\x00\\x07\\x0b\\x1f\\x7f\'');
      assert.strictEqual(toJsString('a\u2028b\u2029c'), '\'a\\u2028b\\u2029c\'');
      // `\x00` followed by a digit stays unambiguous (unlike `\0` + digit).
      assert.strictEqual(toJsString('\u00001'), '\'\\x001\'');
    });

    test('surrogate pairs and other characters stay; lone surrogates are escaped', () => {
      assert.strictEqual(toJsString('😀é漢'), '\'😀é漢\'');
      assert.strictEqual(toJsString('a\ud800b\udc00'), '\'a\\ud800b\\udc00\'');
      assert.strictEqual(toJsString('\udc00\ud83d\ude00\ud800'), '\'\\udc00😀\\ud800\'');
    });

    test('blank text is quoted as it is', () => {
      assert.strictEqual(toJsString('   '), '\'   \'');
    });
  });

  suite('DEV-002 to-python-string', () => {
    test('the quotes are chosen like repr()', () => {
      assert.strictEqual(toPythonString('it\'s'), '"it\'s"');
      assert.strictEqual(toPythonString('say "hi"'), '\'say "hi"\'');
      assert.strictEqual(toPythonString('it\'s "x"'), '\'it\\\'s "x"\'');
      assert.strictEqual(toPythonString('plain'), '\'plain\'');
    });

    test('backslashes and control characters are escaped; non-ASCII text stays', () => {
      assert.strictEqual(toPythonString('a\\b\n\r\t'), '\'a\\\\b\\n\\r\\t\'');
      assert.strictEqual(toPythonString('\u0000\u001b\u007f\u0085'), '\'\\x00\\x1b\\x7f\\x85\'');
      assert.strictEqual(toPythonString('café 😀 漢'), '\'café 😀 漢\'');
      assert.strictEqual(toPythonString('\ud800'), '\'\\ud800\'');
    });
  });

  suite('DEV-003 to-java-string', () => {
    test('one literal per line, joined with + and the document line break', () => {
      assert.strictEqual(toJavaString('a\nb', '\n'), '"a\\n" +\n"b"');
      assert.strictEqual(toJavaString('a\r\nb\rc', '\r\n'), '"a\\n" +\r\n"b\\n" +\r\n"c"');
    });

    test('a final line break ends the last literal with \\n (no empty "" is added)', () => {
      assert.strictEqual(toJavaString('a\nb\n', '\n'), '"a\\n" +\n"b\\n"');
      assert.strictEqual(toJavaString('\n', '\n'), '"\\n"');
      assert.strictEqual(toJavaString('\n\n', '\n'), '"\\n" +\n"\\n"');
      assert.strictEqual(toJavaString('a', '\n'), '"a"');
      assert.strictEqual(toJavaString('   ', '\n'), '"   "');
    });

    test('quotes, backslashes, tab, backspace and form feed get short escapes; other controls octal', () => {
      assert.strictEqual(toJavaString('say "hi"\t\\', '\n'), '"say \\"hi\\"\\t\\\\"');
      assert.strictEqual(toJavaString('\b\f\u0001\u001f\u007f', '\n'), '"\\b\\f\\001\\037\\177"');
    });

    test('a literal \\u escape in the text cannot become a Java Unicode escape', () => {
      // `\\u000a` in Java source is a backslash and `u000a`, not a line break.
      assert.strictEqual(toJavaString('\\u000a', '\n'), '"\\\\u000a"');
    });
  });

  suite('DEV-004 to-go-raw-string', () => {
    test('line breaks stay; backquotes are concatenated', () => {
      assert.strictEqual(toGoRawString('a\nb'), '`a\nb`');
      assert.strictEqual(toGoRawString('a`b'), '`a` + "`" + `b`');
      assert.strictEqual(toGoRawString('`'), '`` + "`" + ``');
      assert.strictEqual(toGoRawString('a\\n"'), '`a\\n"`');
    });
  });

  suite('DEV-005 to-template-literal', () => {
    test('backslashes, backquotes and ${ are escaped; line breaks and lone $ or { stay', () => {
      assert.strictEqual(toTemplateLiteral('cost ${x}'), '`cost \\${x}`');
      assert.strictEqual(toTemplateLiteral('a\\b`c\nd$e{f}$'), '`a\\\\b\\`c\nd$e{f}$`');
      assert.strictEqual(escapeTemplateLiteral('$${'), '$\\${');
    });
  });

  suite('DEV-006 escape-regex', () => {
    test('every special character gets a backslash', () => {
      assert.strictEqual(escapeRegex('a.b*c?'), 'a\\.b\\*c\\?');
      assert.strictEqual(escapeRegex('\\^$.*+?()[]{}|/'), '\\\\\\^\\$\\.\\*\\+\\?\\(\\)\\[\\]\\{\\}\\|\\/');
      assert.strictEqual(escapeRegex('a-b,c=d'), 'a-b,c=d');
    });

    test('the result matches the text literally, with and without the u flag', () => {
      for (const text of ['\\^$.*+?()[]{}|/', 'a-b [x] (y)', '😀.+', 'C:\\path\\*.txt']) {
        for (const flags of ['', 'u']) {
          const expression = new RegExp(`^${escapeRegex(text)}$`, flags);
          assert.ok(expression.test(text), `${text} /${flags}`);
          assert.ok(!expression.test(`${text}x`), `${text} /${flags}`);
        }
      }
    });
  });

  suite('DEV-007 escape-sql', () => {
    test('single quotes are doubled; nothing else changes', () => {
      assert.strictEqual(escapeSql('O\'Reilly'), 'O\'\'Reilly');
      assert.strictEqual(escapeSql('\'; DROP TABLE t; --'), '\'\'; DROP TABLE t; --');
      assert.strictEqual(escapeSql('a\'b"c'), 'a\'\'b"c');
      assert.strictEqual(escapeSql(''), '');
    });

    test('text with a backslash is refused (MySQL default mode reads \\\' as an escaped quote)', () => {
      for (const text of ['a\\\'b"c', 'C:\\Users', '\\', 'O\'Neil\n\\']) {
        assert.throws(
          () => escapeSql(text),
          (error: unknown) =>
            error instanceof DevInputError &&
            error.message === 'the text contains a backslash (\\), which is not safe in MySQL\'s default mode (the SQL is written as standard SQL)',
          text
        );
      }
    });

    test('text with a yen sign (U+00A5, saved as a backslash in Shift_JIS / EUC-JP) is refused', () => {
      for (const text of ['\u00A5\' OR 1=1 --', '\u00A5100', 'O\'Neil\n\u00A5']) {
        assert.throws(
          () => escapeSql(text),
          (error: unknown) =>
            error instanceof DevInputError &&
            error.message === 'the text contains a yen sign (\u00A5), which is saved as a backslash in Shift_JIS, CP932 and EUC-JP and is not safe in MySQL\'s default mode (the SQL is written as standard SQL)',
          text
        );
      }
      assert.strictEqual(escapeSql('\uFFE5100 O\'Neil'), '\uFFE5100 O\'\'Neil');
    });
  });

  suite('DEV-008 quote-posix-shell', () => {
    test('single quotes close, get escaped and reopen', () => {
      assert.strictEqual(quotePosixShell('it\'s'), '\'it\'\\\'\'s\'');
      assert.strictEqual(quotePosixShell('\''), '\'\'\\\'\'\'');
    });

    test('shell syntax is quoted as plain text', () => {
      assert.strictEqual(quotePosixShell('\'; rm -rf / #'), '\'\'\\\'\'; rm -rf / #\'');
      assert.strictEqual(quotePosixShell('$(whoami) `id` $HOME\n*'), '\'$(whoami) `id` $HOME\n*\'');
    });
  });

  suite('DEV-009 quote-powershell', () => {
    test('single quotes and the curly single quotes are doubled', () => {
      assert.strictEqual(quotePowerShell('it\'s'), '\'it\'\'s\'');
      assert.strictEqual(quotePowerShell('\u2018a\u2019 \u201a\u201b'), '\'\u2018\u2018a\u2019\u2019 \u201a\u201a\u201b\u201b\'');
      assert.strictEqual(quotePowerShell('$env:X; \u2019; Remove-Item x'), '\'$env:X; \u2019\u2019; Remove-Item x\'');
    });

    test('double quotes and backquotes stay', () => {
      assert.strictEqual(quotePowerShell('"a" `b'), '\'"a" `b\'');
    });
  });

  suite('DEV-010 escape-csv-field', () => {
    test('quoted only when it holds a comma, a double quote, CR or LF', () => {
      assert.strictEqual(escapeCsvField('a,"b"'), '"a,""b"""');
      assert.strictEqual(escapeCsvField('a\nb'), '"a\nb"');
      assert.strictEqual(escapeCsvField('a\rb'), '"a\rb"');
      assert.strictEqual(escapeCsvField('"'), '""""');
      assert.strictEqual(escapeCsvField('plain'), 'plain');
    });

    test('spaces around the text alone do not quote it (as the TABLE commands write cells)', () => {
      for (const text of ['  a  ', '   ', 'a;b\tc', '=1+2']) {
        assert.strictEqual(escapeCsvField(text), text);
        assert.strictEqual(escapeCsvField(text), writeCell(text, ','));
      }
    });
  });

  suite('DEV-011 escape-markdown', () => {
    test('the markup characters are always escaped', () => {
      assert.strictEqual(escapeMarkdown('*a* _b_'), '\\*a\\* \\_b\\_');
      assert.strictEqual(escapeMarkdown('\\`*_[]<>#|~'), '\\\\\\`\\*\\_\\[\\]\\<\\>\\#\\|\\~');
    });

    test('list markers, underlines and ordered list numbers are escaped only at the line start', () => {
      const input = '# Title\n- item\n  + x\n1. one\n22) two\n===\n\ta-b 3.5 1. 2)\r\n-x\r+y';
      const expected = '\\# Title\n\\- item\n  \\+ x\n1\\. one\n22\\) two\n\\===\n\ta-b 3.5 1. 2)\r\n\\-x\r\\+y';
      assert.strictEqual(escapeMarkdown(input), expected);
      assert.strictEqual(escapeMarkdown('12a. b'), '12a. b');
    });

    test('& is escaped only when it starts a character reference', () => {
      assert.strictEqual(escapeMarkdown('A & B &amp; &copy; &x &; &1;'), 'A & B \\&amp; \\&copy; &x &; &1;');
      // `#` is always escaped as well.
      assert.strictEqual(escapeMarkdown('&#169; &#x1F600; &#; &#xZ;'), '\\&\\#169; \\&\\#x1F600; &\\#; &\\#xZ;');
    });

    test('other characters stay', () => {
      assert.strictEqual(escapeMarkdown('Hello, 世界! (ok) 😀 a+b=c'), 'Hello, 世界! (ok) 😀 a+b=c');
    });
  });

  suite('limits', () => {
    test('input over the limit is refused by every command', () => {
      const long = 'a'.repeat(DEV_MAX_INPUT_LENGTH + 1);
      for (const entry of DEV_COMMAND_ENTRIES) {
        assert.throws(() => entry.transform(long, { eol: '\n' }, 10_000_000), DevInputError, entry.id);
      }
    });

    test('a result over the budget throws EncOutputTooLargeError', () => {
      assert.throws(() => transformOf('DEV-001')('\u0001'.repeat(1000), { eol: '\n' }, 3000), EncOutputTooLargeError);
      assert.strictEqual(transformOf('DEV-001')('\u0001'.repeat(1000), { eol: '\n' }, 4002).length, 4002);
    });

    test('1,000,000 characters are converted quickly (linear time)', function () {
      this.timeout(20_000);
      const inputs = ['*'.repeat(DEV_MAX_INPUT_LENGTH), '\u0001\n\'&#1;'.repeat(DEV_MAX_INPUT_LENGTH / 8), '\n'.repeat(DEV_MAX_INPUT_LENGTH)];
      for (const entry of DEV_COMMAND_ENTRIES) {
        for (const input of inputs) {
          const started = Date.now();
          try {
            entry.transform(input, { eol: '\r\n' }, 10_000_000);
          } catch (error) {
            // Commands that parse their input (JSON, SQL, CSS) may refuse it; only the time counts.
            assert.ok(error instanceof DevInputError, `${entry.id}: ${error}`);
          }
          assert.ok(Date.now() - started < 3000, `${entry.id}: ${Date.now() - started} ms`);
        }
      }
    });
  });
});
