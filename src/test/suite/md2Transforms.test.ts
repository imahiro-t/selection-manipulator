import * as assert from 'assert';
import {
  extractLinks,
  GITHUB_ALERT_TYPES,
  MD2_COMMAND_ENTRIES,
  MD_NO_LINKS,
  MD_NO_REFERENCES,
  parseDefinition,
  referenceToInline,
  sortTableByColumn,
  toGithubAlert,
  toKbd,
  transposeTable,
  unlink,
  validateColumnInput,
} from '../../handler/md2Transforms';
import { MdInputError, MdRange, MdResult } from '../../handler/mdTransforms';

/** The document after a result (or `unchanged` / `info: …` / `open: …`); the edits are applied from the last one. */
const applied = (text: string, result: MdResult): string => {
  switch (result.kind) {
    case 'unchanged':
      return 'unchanged';
    case 'info':
      return `info: ${result.message}`;
    case 'open':
      return `open: ${result.content}`;
    default: {
      let edited = text;
      [...result.edits].reverse().forEach(({ start, end, text: value }) => {
        edited = edited.slice(0, start) + value + edited.slice(end);
      });
      return edited;
    }
  }
};

const all = (text: string): MdRange[] => [{ start: 0, end: text.length }];

/** Runs a command on `text` with the given selections (all of it by default). */
const run = (id: string, text: string, inputs: string[] = [], ranges: MdRange[] = all(text), eol: '\n' | '\r\n' = '\n'): string => {
  const entry = MD2_COMMAND_ENTRIES.find((candidate) => candidate.id === id);
  assert.ok(entry, id);
  return applied(text, entry.run({ text, ranges, eol, inputs }));
};

const NOT_A_TABLE = /the selection is not a Markdown table/;

suite('Extended Markdown Transforms (JAUNIX-015..021) Test Suite', () => {
  suite('JAUNIX-015 sort table by column', () => {
    const table = '| name | n |\n|:-----|--:|\n| b | 10 |\n| a \\| x | 2 |\n| c | |\n| a | 1 |';

    test('natural order (numbers by value), header and delimiter fixed, equal cells keep their order', () => {
      assert.strictEqual(sortTableByColumn(table, '\n', 2, 'ascending'), '| name | n |\n|:-----|--:|\n| c | |\n| a | 1 |\n| a \\| x | 2 |\n| b | 10 |');
      assert.strictEqual(sortTableByColumn(table, '\n', 2, 'descending'), '| name | n |\n|:-----|--:|\n| b | 10 |\n| a \\| x | 2 |\n| a | 1 |\n| c | |');
      assert.strictEqual(sortTableByColumn('|k|\n|-|\n|b|\n|a|\n|b|\n|a|', '\n', 1, 'ascending'), '|k|\n|-|\n|a|\n|a|\n|b|\n|b|');
    });

    test('rows are moved as they are written: \\| escapes and code spans are kept', () => {
      const result = sortTableByColumn('| k |\n| - |\n| `z|y` |\n| a \\| b |', '\n', 1, 'ascending');
      assert.strictEqual(result, '| k |\n| - |\n| `z|y` |\n| a \\| b |');
      assert.strictEqual(sortTableByColumn('| k | v |\n|---|---|\n| z \\| 1 | 2 |\n| a | 3 |', '\n', 2, 'descending'),
        '| k | v |\n|---|---|\n| a | 3 |\n| z \\| 1 | 2 |');
    });

    test('a missing cell sorts as empty; a column beyond the header and a non-table are warnings', () => {
      assert.strictEqual(sortTableByColumn('| a | b |\n|---|---|\n| 1 | z |\n| 2 |', '\n', 2, 'ascending'), '| a | b |\n|---|---|\n| 2 |\n| 1 | z |');
      assert.throws(() => sortTableByColumn('| a | b |\n|---|---|\n| 1 | 2 |', '\n', 3, 'ascending'),
        (error: unknown) => error instanceof MdInputError && error.message === 'the table has 2 columns; enter a column number up to that');
      assert.throws(() => sortTableByColumn('a\nb', '\n', 1, 'ascending'), NOT_A_TABLE);
      assert.throws(() => sortTableByColumn('| a |\n| b |', '\n', 1, 'ascending'), NOT_A_TABLE);
    });

    test('CRLF and a trailing line break are kept; the command validates its inputs again', () => {
      const text = '| k |\r\n|---|\r\n| b |\r\n| a |\r\n';
      assert.strictEqual(run('JAUNIX-015', text, ['1', 'ascending'], all(text), '\r\n'), '| k |\r\n|---|\r\n| a |\r\n| b |\r\n');
      assert.throws(() => run('JAUNIX-015', text, ['0', 'ascending']), MdInputError);
      assert.throws(() => run('JAUNIX-015', text, ['1', 'up']), MdInputError);
    });

    test('the column input: 1 to 1,000', () => {
      assert.strictEqual(validateColumnInput('1'), undefined);
      assert.strictEqual(validateColumnInput(' 1000 '), undefined);
      for (const value of ['0', '1001', '', '1.5', '-1', 'a', '１']) {
        assert.strictEqual(validateColumnInput(value), 'Enter a column number from 1 to 1,000', value);
      }
    });
  });

  suite('JAUNIX-016 transpose table', () => {
    test('rows and columns are swapped; the delimiter row is written anew', () => {
      assert.strictEqual(transposeTable('|a|b|\n|-|-|\n|1|2|', '\n'), '| a | 1 |\n| --- | --- |\n| b | 2 |');
      assert.strictEqual(transposeTable('| h1 | h2 | h3 |\n|:-:|--:|---|\n| 1 | 2 |\n| x |', '\n'),
        '| h1 | 1 | x |\n| --- | --- | --- |\n| h2 | 2 |  |\n| h3 |  |  |');
    });

    test('cells are written as they are (\\| stays escaped); the indentation of the first line is used', () => {
      assert.strictEqual(transposeTable('  | a \\| b | `c|d` |\n  |---|---|\n  | 1 | 2 |', '\n'),
        '  | a \\| b | 1 |\n  | --- | --- |\n  | `c|d` | 2 |');
      assert.strictEqual(transposeTable(transposeTable('| a | 1 |\n| --- | --- |\n| b | 2 |', '\n'), '\n'), '| a | 1 |\n| --- | --- |\n| b | 2 |');
    });

    test('a huge result is refused before it is built', () => {
      const wide = `|${'a|'.repeat(5000)}\n|${'-|'.repeat(5000)}\n` + Array.from({ length: 1000 }, () => '|x|').join('\n');
      assert.throws(() => transposeTable(wide, '\n'), /the result would be longer than 10,000,000 characters/);
      assert.throws(() => transposeTable('a\nb', '\n'), NOT_A_TABLE);
    });
  });

  suite('JAUNIX-017 remove links', () => {
    test('links become their text; images stay; code is left', () => {
      assert.strictEqual(unlink('[Docs](https://x.example)'), 'Docs');
      assert.strictEqual(unlink('see [a *b*](u "t") and [c](<d e>)!'), 'see a *b* and c!');
      assert.strictEqual(unlink('![alt](i.png) [![a](i)](u)'), '![alt](i.png) ![a](i)');
      assert.strictEqual(unlink('`[x](y)` [e]() [f][1] [g]'), '`[x](y)` e [f][1] [g]');
      assert.strictEqual(unlink('```\n[x](y)\n```\n[z](w)'), '```\n[x](y)\n```\nz');
    });
  });

  suite('JAUNIX-018 extract links', () => {
    test('links and images in order as text<TAB>url; the URL is not changed', () => {
      const text = '[a](u1) ![b](u2)';
      assert.deepStrictEqual(extractLinks(text, all(text), '\n'), { kind: 'open', content: 'a\tu1\nb\tu2' });
      const linked = '[![i](img)](link) [t\tx](<a b> "title") `[c](d)`';
      assert.strictEqual(run('JAUNIX-018', linked), 'open: ![i](img)\tlink\ni\timg\nt x\ta b');
    });

    test('several selections in document order with the document line break; nothing found is a message', () => {
      const text = '[a](1)\nno\n[b](2)';
      assert.strictEqual(run('JAUNIX-018', text, [], [{ start: 0, end: 6 }, { start: 7, end: 9 }, { start: 10, end: 16 }], '\r\n'), 'open: a\t1\r\nb\t2');
      assert.strictEqual(run('JAUNIX-018', 'plain [x] text'), `info: ${MD_NO_LINKS}`);
    });
  });

  suite('JAUNIX-019 reference links to inline links', () => {
    test('full and collapsed references and images; the unused definitions in the selection are removed', () => {
      assert.strictEqual(run('JAUNIX-019', '[a][1]\n\n[1]: https://x.example'), '[a](https://x.example)');
      assert.strictEqual(run('JAUNIX-019', '[A][] ![img][Pic]\n\n[a]: /a\n[pic]: /p.png "Pic"\n'), '[A](/a) ![img](/p.png "Pic")\n');
      assert.strictEqual(run('JAUNIX-019', 'x [a][  Foo   BAR ]\n\n[foo bar]: /u\ny'), 'x [a](/u)\n\ny');
    });

    test('<…> destinations and titles with quotes are written so that they keep their meaning', () => {
      assert.strictEqual(run('JAUNIX-019', '[a][1]\n\n[1]: <https://x.example/a b> "say \\"hi\\""'), '[a](<https://x.example/a b> "say \\"hi\\"")');
      assert.strictEqual(run('JAUNIX-019', "[a][1]\n\n[1]: /u 'it\\'s'"), "[a](/u 'it\\'s')");
      assert.strictEqual(run('JAUNIX-019', '[a][1]\n\n[1]: /u (paren title)'), '[a](/u (paren title))');
      assert.strictEqual(run('JAUNIX-019', '[a][1]\n\n[1]: https://x.example/wiki/A_(b'), '[a](<https://x.example/wiki/A_(b>)');
      assert.strictEqual(run('JAUNIX-019', '[a][1]\n\n[1]: /a(b)c'), '[a](/a(b)c)');
    });

    test('definitions outside the selection are used and never changed; still referenced definitions stay', () => {
      const text = '[a][1] [b][1]\n\n[1]: /u';
      assert.strictEqual(run('JAUNIX-019', text, [], [{ start: 0, end: 6 }]), '[a](/u) [b][1]\n\n[1]: /u');
      const shortcut = '[a][1] and [1]\n\n[1]: /u';
      assert.strictEqual(run('JAUNIX-019', shortcut), '[a](/u) and [1]\n\n[1]: /u');
      const kept = '[a][1]\n\n[1]: /u\n[2]: /v';
      assert.strictEqual(run('JAUNIX-019', kept), '[a](/u)\n\n[2]: /v');
    });

    test('undefined labels, shortcut references and code are left; the first definition wins', () => {
      assert.strictEqual(run('JAUNIX-019', '[a][x] [b] `[c][1]`\n\n[1]: /u'), `info: ${MD_NO_REFERENCES}`);
      assert.strictEqual(run('JAUNIX-019', '```\n[c][1]\n```\n\n[1]: /u'), `info: ${MD_NO_REFERENCES}`);
      assert.strictEqual(run('JAUNIX-019', '[a][1]\n\n[1]: /first\n[1]: /second'), '[a](/first)\n\n[1]: /second');
      // `\[a]` is not a link text, so `[1]` is a shortcut reference.
      assert.strictEqual(run('JAUNIX-019', '\\[a][1]\n\n[1]: /u'), `info: ${MD_NO_REFERENCES}`);
    });

    test('several selections; CRLF; a definition in a selection is removed when a reference in another selection was its last', () => {
      const text = '[a][1]\r\n---\r\n[b][2]\r\n\r\n[1]: /u\r\n[2]: /v\r\n';
      const result = referenceToInline(text, [{ start: 0, end: 6 }, { start: 13, end: text.length }]);
      assert.strictEqual(applied(text, result), '[a](/u)\r\n---\r\n[b](/v)\r\n');
    });

    test('parseDefinition reads one-line definitions only', () => {
      assert.deepStrictEqual(parseDefinition('[Foo]: /u "t"'), { label: 'foo', destination: '/u', title: '"t"' });
      assert.deepStrictEqual(parseDefinition('   [a b]:<x y>'), { label: 'a b', destination: '<x y>' });
      for (const line of ['    [a]: /u', '[a]:', '[a] : /u', '[]: /u', '[a]: /u "t', '[a]: /u "t" x', '[a[b]]: /u', '[a]: <x', '[a]: /u "a"b"']) {
        assert.strictEqual(parseDefinition(line), undefined, line);
      }
    });
  });

  suite('JAUNIX-020 GitHub alert', () => {
    test('the marker and the lines after "> " (">" for a blank line)', () => {
      assert.strictEqual(toGithubAlert('text', '\n', 'NOTE'), '> [!NOTE]\n> text');
      assert.strictEqual(toGithubAlert('a\n\nb\n', '\r\n', 'WARNING'), '> [!WARNING]\r\n> a\r\n>\r\n> b\n');
      for (const type of GITHUB_ALERT_TYPES) {
        assert.ok(toGithubAlert('x', '\n', type).startsWith(`> [!${type}]\n`), type);
      }
    });

    test('only the fixed types are written (a value from elsewhere is refused)', () => {
      for (const type of ['note', 'INFO', 'NOTE]\n<script>alert(1)</script>', '', ' NOTE']) {
        assert.throws(() => toGithubAlert('x', '\n', type), (error: unknown) => error instanceof MdInputError
          && error.message === 'Choose one of NOTE, TIP, IMPORTANT, WARNING, CAUTION', type);
      }
    });

    test('the block is on lines of its own, with a blank line before text that follows', () => {
      const text = 'before text after\nnext';
      assert.strictEqual(run('JAUNIX-020', text, ['TIP'], [{ start: 7, end: 11 }]), 'before\n> [!TIP]\n> text\n\nafter\nnext');
      const lines = 'a\nb\nc';
      assert.strictEqual(run('JAUNIX-020', lines, ['NOTE'], [{ start: 2, end: 4 }]), 'a\n> [!NOTE]\n> b\n\nc');
    });
  });

  suite('JAUNIX-021 kbd', () => {
    test('keys separated by + in <kbd>', () => {
      const cases: [string, string][] = [
        ['Ctrl+C', '<kbd>Ctrl</kbd>+<kbd>C</kbd>'],
        ['Ctrl + Shift + P', '<kbd>Ctrl</kbd>+<kbd>Shift</kbd>+<kbd>P</kbd>'],
        ['Ctrl++', '<kbd>Ctrl</kbd>+<kbd>+</kbd>'],
        ['+', '<kbd>+</kbd>'],
        ['Shift+Page Up', '<kbd>Shift</kbd>+<kbd>Page Up</kbd>'],
        ['Alt+', '<kbd>Alt</kbd>+'],
        ['  Esc  ', '  <kbd>Esc</kbd>  '],
      ];
      for (const [line, expected] of cases) {
        assert.strictEqual(toKbd(line, '\n'), expected, line);
      }
      assert.strictEqual(toKbd('Ctrl+C\n\nCmd+V\n', '\r\n'), '<kbd>Ctrl</kbd>+<kbd>C</kbd>\r\n\r\n<kbd>Cmd</kbd>+<kbd>V</kbd>\n');
    });

    test('key names are HTML-escaped, so no tag can be injected', () => {
      assert.strictEqual(toKbd('<script>alert(1)</script>+"&\'', '\n'),
        '<kbd>&lt;script&gt;alert(1)&lt;/script&gt;</kbd>+<kbd>&quot;&amp;&#39;</kbd>');
      assert.strictEqual(toKbd('</kbd><b>x</b>', '\n'), '<kbd>&lt;/kbd&gt;&lt;b&gt;x&lt;/b&gt;</kbd>');
    });
  });
});
