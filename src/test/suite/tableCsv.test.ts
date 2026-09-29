import * as assert from 'assert';
import { EncOutputTooLargeError } from '../../handler/encodeTransforms';
import {
  findDelimiterProblem,
  findPromptProblem,
  hasTrailingLineBreak,
  normalizeRows,
  parseDelimited,
  parseDelimiterInput,
  resolveColumn,
  TABLE_MAX_GRID_CELLS,
  TABLE_MAX_INPUT_LENGTH,
  TableInputError,
  TableTooLargeError,
  trimSpaceTab,
  writeDelimited,
} from '../../handler/tableCsv';

const csv = (text: string) => parseDelimited(text, ',');
const tsv = (text: string) => parseDelimited(text, '\t');

const rejects = (convert: () => unknown, pattern?: RegExp): void => {
  assert.throws(convert, (error: unknown) => {
    assert.ok(error instanceof TableInputError, `expected TableInputError, got ${String(error)}`);
    if (pattern) {
      assert.match((error as Error).message, pattern);
    }
    return true;
  });
};

/** A deterministic pseudo-random generator (mulberry32) so that the round-trip tests are repeatable. */
const random = (seed: number) => () => {
  seed = (seed + 0x6d2b79f5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};

suite('Table CSV parser and writer (tableCsv) Test Suite', () => {
  suite('parseDelimited (RFC 4180)', () => {
    test('plain fields, LF / CRLF / CR records and a mix of them', () => {
      assert.deepStrictEqual(csv('a,b\n1,2'), [['a', 'b'], ['1', '2']]);
      assert.deepStrictEqual(csv('a,b\r\n1,2'), [['a', 'b'], ['1', '2']]);
      assert.deepStrictEqual(csv('a,b\r1,2'), [['a', 'b'], ['1', '2']]);
      assert.deepStrictEqual(csv('a\r\nb\nc\rd'), [['a'], ['b'], ['c'], ['d']]);
    });

    test('quoted fields: "" is one quote, the delimiter and line breaks are kept', () => {
      assert.deepStrictEqual(csv('"a,b","say ""hi""",c'), [['a,b', 'say "hi"', 'c']]);
      assert.deepStrictEqual(csv('"x\ny",1\n"p\r\nq",2\n"r\rs",3'), [['x\ny', '1'], ['p\r\nq', '2'], ['r\rs', '3']]);
      assert.deepStrictEqual(csv('"",""'), [['', '']]);
      assert.deepStrictEqual(csv('""'), [['']]);
    });

    test('empty fields, a trailing delimiter and a final line break', () => {
      assert.deepStrictEqual(csv('a,,c'), [['a', '', 'c']]);
      assert.deepStrictEqual(csv('a,\n'), [['a', '']]);
      assert.deepStrictEqual(csv(','), [['', '']]);
      assert.deepStrictEqual(csv('a\n'), [['a']]);
      assert.deepStrictEqual(csv('a\r\n'), [['a']]);
    });

    test('completely empty lines are skipped; a line of spaces is a record', () => {
      assert.deepStrictEqual(csv('\n\na\n\r\n\rb\n\n'), [['a'], ['b']]);
      assert.deepStrictEqual(csv('a\n  \nb'), [['a'], ['  '], ['b']]);
    });

    test('a leading BOM is removed', () => {
      assert.deepStrictEqual(csv('\ufeffid,name\n1,x'), [['id', 'name'], ['1', 'x']]);
      assert.deepStrictEqual(csv('a,\ufeffb'), [['a', '\ufeffb']]);
    });

    test('a quote in the middle of an unquoted field is an ordinary character', () => {
      assert.deepStrictEqual(csv('5",x\na"b"c'), [['5"', 'x'], ['a"b"c']]);
    });

    test('spaces / tabs after a closing quote are skipped (Align Columns output reads back)', () => {
      assert.deepStrictEqual(csv('"a,b"   ,c\n"x" \t\n"y"  '), [['a,b', 'c'], ['x'], ['y']]);
    });

    test('TSV: the delimiter after a closing quote is checked first', () => {
      assert.deepStrictEqual(tsv('"a"\tb'), [['a', 'b']]);
      assert.deepStrictEqual(tsv('"a" \tb'), [['a', 'b']]);
      assert.deepStrictEqual(tsv('"a"\t\tb'), [['a', '', 'b']]);
      assert.deepStrictEqual(tsv('"a\tb"\tc,d'), [['a\tb', 'c,d']]);
    });

    test('an unclosed quote and a character after a closing quote are errors naming the line', () => {
      rejects(() => csv('"abc'), /^line 1: a quoted field is not closed$/);
      rejects(() => csv('a\nb\n"x\ny\nz'), /^line 3: a quoted field is not closed$/);
      rejects(() => csv('"a"b'), /^line 1: a closing quote must be followed by a delimiter or a line break$/);
      rejects(() => csv('a\n"x\r\ny"z'), /^line 3: /);
      rejects(() => csv('a\r\n\r\n"x\ry" z'), /^line 4: /);
      rejects(() => tsv('"a" b'), /^line 1: /);
    });

    test('no record (empty, only line breaks) is an error', () => {
      for (const text of ['', '\n', '\r\n\r\n', '\r', '\ufeff', '\ufeff\n']) {
        rejects(() => csv(text), /^no rows found$/);
      }
    });

    test('input length limit', () => {
      rejects(() => csv('a'.repeat(TABLE_MAX_INPUT_LENGTH + 1)), /longer than 5,000,000 characters/);
      assert.strictEqual(csv('a'.repeat(TABLE_MAX_INPUT_LENGTH))[0][0].length, TABLE_MAX_INPUT_LENGTH);
    });

    test('grid limit: rows x (the widest row) above 10,000,000 cells is refused with a warning error', () => {
      // 1 row of 2,000 cells and 5,000 short rows: 5,001 x 2,000 > 10,000,000.
      const text = `${','.repeat(1_999)}\n${'a\n'.repeat(5_000)}`;
      assert.throws(() => csv(text), (error: unknown) => {
        assert.ok(error instanceof TableTooLargeError && error instanceof EncOutputTooLargeError, String(error));
        assert.strictEqual((error as Error).message,
          'the table is too large: 5,001 rows × 2,000 columns is more than 10,000,000 cells');
        return true;
      });
      // Exactly at the limit is accepted.
      const atLimit = `${','.repeat(1_999)}\n${'a\n'.repeat(4_999)}`;
      assert.strictEqual(csv(atLimit).length * 2_000, TABLE_MAX_GRID_CELLS);
    });

    test('quotes: long runs of "" and long quoted fields are read in linear time', () => {
      const start = Date.now();
      const rows = csv(`"${'""'.repeat(1_000_000)}",x\n${'"a",'.repeat(200_000)}b`);
      assert.strictEqual(rows[0][0].length, 1_000_000);
      assert.strictEqual(rows[1].length, 200_001);
      assert.ok(Date.now() - start < 5_000, `${Date.now() - start} ms`);
    });
  });

  suite('writeDelimited', () => {
    test('minimal quoting: only cells with the delimiter, a quote, CR or LF', () => {
      assert.strictEqual(writeDelimited([['a', 'b,c', 'say "hi"', 'x\ny', 'p\rq', ' s ', '']], ','),
        'a,"b,c","say ""hi""","x\ny","p\rq", s ,');
      assert.strictEqual(writeDelimited([['a,b', 'c\td']], '\t'), 'a,b\t"c\td"');
    });

    test('quoteAll quotes every cell, the empty ones too', () => {
      assert.strictEqual(writeDelimited([['a', ''], ['"', 'b']], ',', { quoteAll: true }), '"a",""\n"""","b"');
    });

    test('a row that would be an empty line is written as ""', () => {
      assert.strictEqual(writeDelimited([['a'], [''], [], ['b']], ','), 'a\n""\n""\nb');
      assert.deepStrictEqual(csv(writeDelimited([['a'], [''], ['b']], ',')), [['a'], [''], ['b']]);
    });

    test('lines are joined with LF', () => {
      assert.strictEqual(writeDelimited([['a'], ['b']], ';'), 'a\nb');
    });

    test('a delimiter of two code units (an emoji) is used and checked as a whole', () => {
      assert.strictEqual(writeDelimited([['a', 'b😀c', 'd\ud83d']], '😀'), 'a😀"b😀c"😀d\ud83d');
    });

    test('the output limit stops the writer', () => {
      const rows = Array.from({ length: 11 }, () => ['x'.repeat(1_000_000)]);
      assert.throws(() => writeDelimited(rows, ','), EncOutputTooLargeError);
    });

    test('round trip: parse(write(rows)) === rows for random cells', () => {
      const next = random(4180);
      const alphabet = ['a', 'b', ',', '"', '\n', '\r', '\r\n', ' ', '\t', 'é', '😀', ';'];
      for (let round = 0; round < 500; round++) {
        const columns = 1 + Math.floor(next() * 4);
        const rows = Array.from({ length: 1 + Math.floor(next() * 4) }, () =>
          Array.from({ length: columns }, () =>
            Array.from({ length: Math.floor(next() * 5) }, () => alphabet[Math.floor(next() * alphabet.length)]).join('')));
        for (const delimiter of [',', '\t']) {
          const written = writeDelimited(rows, delimiter);
          assert.deepStrictEqual(parseDelimited(written, delimiter), rows, JSON.stringify(written));
          const quoted = writeDelimited(rows, delimiter, { quoteAll: true });
          assert.deepStrictEqual(parseDelimited(quoted, delimiter), rows, JSON.stringify(quoted));
        }
      }
    });
  });

  suite('helpers', () => {
    test('normalizeRows pads to the widest row without changing the input', () => {
      const rows = [['a'], ['b', 'c', 'd'], []];
      assert.deepStrictEqual(normalizeRows(rows), [['a', '', ''], ['b', 'c', 'd'], ['', '', '']]);
      assert.deepStrictEqual(rows, [['a'], ['b', 'c', 'd'], []]);
    });

    test('hasTrailingLineBreak', () => {
      assert.strictEqual(hasTrailingLineBreak('a\n'), true);
      assert.strictEqual(hasTrailingLineBreak('a\r\n'), true);
      assert.strictEqual(hasTrailingLineBreak('a\r'), true);
      assert.strictEqual(hasTrailingLineBreak('a'), false);
      assert.strictEqual(hasTrailingLineBreak(''), false);
    });

    test('trimSpaceTab removes only spaces and tabs, in linear time', () => {
      assert.strictEqual(trimSpaceTab(' \ta b\t '), 'a b');
      assert.strictEqual(trimSpaceTab('\u3000a\u3000'), '\u3000a\u3000');
      assert.strictEqual(trimSpaceTab('   '), '');
      const start = Date.now();
      assert.strictEqual(trimSpaceTab(`${' '.repeat(2_000_000)}x${' '.repeat(2_000_000)}y`).length, 2_000_002);
      assert.ok(Date.now() - start < 2_000);
    });

    test('resolveColumn: numbers are 1-based, names are exact and case-sensitive', () => {
      const header = ['id', 'Name', 'name', '2', 'dup', 'dup', ' sp '];
      assert.strictEqual(resolveColumn(header, 7, '1'), 0);
      assert.strictEqual(resolveColumn(header, 7, ' 7 '), 6);
      assert.strictEqual(resolveColumn(header, 7, '007'), 6);
      assert.strictEqual(resolveColumn(header, 7, 'Name'), 1);
      assert.strictEqual(resolveColumn(header, 7, 'name'), 2);
      assert.strictEqual(resolveColumn(header, 7, ' sp '), 6);
      // Digits are always a column number: the header "2" is column 4, but "2" means column 2.
      assert.strictEqual(resolveColumn(header, 7, '2'), 1);
      rejects(() => resolveColumn(header, 7, '0'), /^column 0 is out of range: the table has 7 columns$/);
      rejects(() => resolveColumn(header, 7, '8'), /out of range/);
      rejects(() => resolveColumn(['a'], 1, '99999999999999999999'), /^column 999999999999… is out of range: the table has 1 column$/);
      rejects(() => resolveColumn(header, 7, 'NAME'), /^no column named "NAME" in the header$/);
      rejects(() => resolveColumn(header, 7, 'dup'), /^2 columns are named "dup"; use the column number$/);
      rejects(() => resolveColumn(header, 7, 'x'.repeat(200)), /…"/);
    });

    test('a column beyond the header can be chosen by number (ragged rows)', () => {
      assert.strictEqual(resolveColumn(['a'], 3, '3'), 2);
    });
  });

  suite('typed values', () => {
    test('findPromptProblem: length, empty and control characters (tabs and line breaks included)', () => {
      assert.strictEqual(findPromptProblem('name'), undefined);
      assert.strictEqual(findPromptProblem('x'.repeat(1_000)), undefined);
      assert.match(findPromptProblem('x'.repeat(1_001))!, /longer than 1,000 characters/);
      assert.strictEqual(findPromptProblem(''), 'Enter a value.');
      assert.strictEqual(findPromptProblem('', { allowEmpty: true }), undefined);
      for (const value of ['a\tb', 'a\nb', 'a\rb', '\u0000', '\u001f', '\u007f']) {
        assert.strictEqual(findPromptProblem(value), 'The value must not contain tabs, line breaks or other control characters.', JSON.stringify(value));
        assert.ok(findPromptProblem(value, { allowEmpty: true }) !== undefined);
      }
    });

    test('TABLE-017 delimiter: exactly one code point, \\t for a tab (a typed tab is refused)', () => {
      for (const [input, delimiter] of [[';', ';'], ['|', '|'], ['\\t', '\t'], ['😀', '😀'], [' ', ' '], [',', ','], ['é', 'é']]) {
        assert.strictEqual(findDelimiterProblem(input), undefined, input);
        assert.strictEqual(findPromptProblem(input, { delimiter: true }), undefined, input);
        assert.strictEqual(parseDelimiterInput(input), delimiter, input);
      }
      const refused: [string, RegExp][] = [
        ['', /^Enter one character/],
        [';;', /exactly one character/],
        ['😀😀', /exactly one character/],
        ['é', /exactly one character/],
        ['\ud800', /lone surrogate/],
        ['\udc00', /lone surrogate/],
        ['"', /double quote/],
        ['\n', /line break or a control character \(type \\t for a tab\)/],
        ['\r', /control character/],
        ['\t', /control character \(type \\t for a tab\)/],
        ['\u0000', /control character/],
        ['\u007f', /control character/],
      ];
      for (const [input, pattern] of refused) {
        assert.match(findDelimiterProblem(input)!, pattern, JSON.stringify(input));
        assert.match(findPromptProblem(input, { delimiter: true })!, pattern, JSON.stringify(input));
        rejects(() => parseDelimiterInput(input), pattern);
      }
      assert.match(findPromptProblem(';'.repeat(1_001), { delimiter: true })!, /longer than 1,000/);
    });
  });
});
