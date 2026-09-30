import * as assert from 'assert';
import { SQL_BACKSLASH_REASON, SQL_YEN_SIGN_REASON } from '../../handler/sqlSafety';
import * as fs from 'fs';
import * as path from 'path';
import * as yaml from 'js-yaml';
import { EncOutputTooLargeError, MAX_OUTPUT_LENGTH } from '../../handler/encodeTransforms';
import { parseDelimited, TableInputError, TableTooLargeError } from '../../handler/tableCsv';
import {
  formatNumber,
  sqlTableName,
  TABLE_COMMAND_ENTRIES,
  TableCommandEntry,
  TableNotice,
} from '../../handler/tableTransforms';
import { TABLE_ROADMAP_EXAMPLES, VALID_INPUTS } from './tableExamples';

const entry = (id: string): TableCommandEntry => {
  const found = TABLE_COMMAND_ENTRIES.find((candidate) => candidate.id === id);
  assert.ok(found, id);
  return found;
};

/** Runs a transform command (the result text). */
const run = (id: string, text: string, inputs: string[] = VALID_INPUTS[id] ?? []): string => {
  const found = entry(id);
  assert.ok(found.output !== 'notify', id);
  return found.transform(text, inputs);
};

/** Runs a notify command (TABLE-015 / 023). */
const notice = (id: string, text: string, inputs: string[] = VALID_INPUTS[id] ?? []): TableNotice => {
  const found = entry(id);
  assert.ok(found.output === 'notify', id);
  return found.notify(text, inputs);
};

/** Runs either kind and returns the text (the notification message for 015 / 023). */
const runAny = (id: string, text: string, inputs: string[] = VALID_INPUTS[id] ?? []): string => {
  const found = entry(id);
  return found.output === 'notify' ? found.notify(text, inputs).message : found.transform(text, inputs);
};

const rejects = (convert: () => unknown, pattern?: RegExp): void => {
  assert.throws(convert, (error: unknown) => {
    assert.ok(error instanceof TableInputError, `expected TableInputError, got ${String(error)}`);
    if (pattern) {
      assert.match((error as Error).message, pattern);
    }
    return true;
  });
};

const tooLarge = (convert: () => unknown): void => {
  assert.throws(convert, (error: unknown) => {
    assert.ok(error instanceof EncOutputTooLargeError, `expected EncOutputTooLargeError, got ${String(error)}`);
    return true;
  });
};

/** Runs `convert` and fails when it took longer than `budget` milliseconds. */
const withinBudget = <T>(budget: number, convert: () => T): T => {
  const start = Date.now();
  try {
    return convert();
  } finally {
    const elapsed = Date.now() - start;
    assert.ok(elapsed < budget, `took ${elapsed} ms (budget: ${budget} ms)`);
  }
};

const ALL_IDS = TABLE_COMMAND_ENTRIES.map((e) => e.id);
const JSON_INPUT = new Set(['TABLE-002', 'TABLE-027']);

suite('Table Commands (TABLE-001..030) transforms Test Suite', function () {
  // Some tests below convert inputs of millions of characters and check a time budget (withinBudget
  // / Date.now). The budgets are at least about 10 times the time measured on a development machine
  // and far below that of the quadratic behaviour they guard against; Mocha's default of 2 seconds
  // per test would be stricter than them, so the whole suite gets 60 seconds (as DATA in da52348).
  this.timeout(60_000);

  suite('ROADMAP examples', () => {
    TABLE_COMMAND_ENTRIES.forEach(({ id }) => {
      test(`${id}`, () => {
        const example = TABLE_ROADMAP_EXAMPLES[id];
        assert.strictEqual(runAny(id, example.input, example.inputs), example.expected);
      });
    });
  });

  suite('command table', () => {
    test('30 commands: 23 new-tab, 2 notify, 5 replace; 7 ask for input', () => {
      assert.strictEqual(TABLE_COMMAND_ENTRIES.length, 30);
      const count = (output: string) => TABLE_COMMAND_ENTRIES.filter((e) => e.output === output).length;
      assert.deepStrictEqual([count('new-tab'), count('notify'), count('replace')], [23, 2, 5]);
      assert.deepStrictEqual(TABLE_COMMAND_ENTRIES.filter((e) => e.prompts.length > 0).map((e) => e.id),
        ['TABLE-006', 'TABLE-007', 'TABLE-008', 'TABLE-012', 'TABLE-014', 'TABLE-015', 'TABLE-017']);
      assert.deepStrictEqual(TABLE_COMMAND_ENTRIES.filter((e) => e.output === 'notify').map((e) => e.id), ['TABLE-015', 'TABLE-023']);
      assert.deepStrictEqual(ALL_IDS, Array.from({ length: 30 }, (_, i) => `TABLE-${String(i + 1).padStart(3, '0')}`));
    });

    test('each (Replace) variant runs the same conversion as its base command', () => {
      const pairs: [string, string][] = [['TABLE-026', 'TABLE-001'], ['TABLE-027', 'TABLE-002'], ['TABLE-028', 'TABLE-003'], ['TABLE-029', 'TABLE-005'], ['TABLE-030', 'TABLE-011']];
      const samples = ['a,b\n1,"x,y"\n', 'h\r\n"q""r",2', '[{"a":1},{"b":[2]}]\n'];
      for (const [replace, base] of pairs) {
        assert.strictEqual(entry(replace).name, `${entry(base).name}.replace`);
        for (const sample of samples) {
          const outcome = (id: string) => {
            try {
              return run(id, sample);
            } catch (error) {
              return `error: ${(error as Error).message}`;
            }
          };
          assert.strictEqual(outcome(replace), outcome(base), `${replace} ${JSON.stringify(sample)}`);
        }
      }
    });
  });

  suite('0 records and header-only tables', () => {
    test('a selection without any record is an error for all 30 commands', () => {
      for (const id of ALL_IDS) {
        const inputs = JSON_INPUT.has(id) ? ['[]'] : ['\n', '\r\n\r\n', '\r', ''];
        for (const text of inputs) {
          rejects(() => runAny(id, text), JSON_INPUT.has(id) ? /^the JSON array is empty$/ : /^no rows found$/);
        }
      }
      // TABLE-022 also skips lines of white space only.
      rejects(() => run('TABLE-022', ' \t \n  \n'), /^no rows found$/);
    });

    test('a header without data rows: [] / header-only table / error / notification as defined', () => {
      const headerOnly: Record<string, string> = { 'TABLE-004': 'a\tb', 'TABLE-022': 'a b' };
      const inputs: Record<string, string[]> = {
        'TABLE-006': ['a'], 'TABLE-007': ['a'], 'TABLE-008': ['a', 'b'], 'TABLE-014': ['a', 'Equals', 'x'], 'TABLE-015': ['b'],
      };
      const emptyArray = ['TABLE-001', 'TABLE-020', 'TABLE-026'];
      const headerTable: Record<string, string> = {
        'TABLE-006': 'a',
        'TABLE-007': 'b',
        'TABLE-008': 'b,a',
        'TABLE-011': '<table>\n  <tr><th>a</th><th>b</th></tr>\n</table>',
        'TABLE-013': 'a,b',
        'TABLE-014': 'a,b',
        'TABLE-016': '#,a,b',
        'TABLE-021': '+---+---+\n| a | b |\n+---+---+',
        'TABLE-030': '<table>\n  <tr><th>a</th><th>b</th></tr>\n</table>',
      };
      const errors = ['TABLE-012', 'TABLE-025'];
      const notices: Record<string, TableNotice> = {
        'TABLE-015': { message: 'no numeric cells in the column', warning: true },
        'TABLE-023': { message: '0 rows × 2 cols, no empty cells' },
      };
      const converted: Record<string, string> = {
        'TABLE-003': 'a\tb', 'TABLE-004': 'a,b', 'TABLE-005': 'a\nb', 'TABLE-009': 'a,b', 'TABLE-010': 'a,b', 'TABLE-017': 'a;b',
        'TABLE-018': '"a","b"', 'TABLE-019': 'a,b', 'TABLE-022': 'a,b', 'TABLE-024': 'a,b', 'TABLE-028': 'a\tb', 'TABLE-029': 'a\nb',
      };
      const jsonInput: Record<string, string> = { 'TABLE-002': 'a\nx', 'TABLE-027': 'a\nx' };
      const groups = [emptyArray.length, Object.keys(headerTable).length, errors.length, Object.keys(notices).length,
        Object.keys(converted).length, Object.keys(jsonInput).length];
      assert.deepStrictEqual(groups, [3, 9, 2, 2, 12, 2]);
      assert.deepStrictEqual([...emptyArray, ...Object.keys(headerTable), ...errors, ...Object.keys(notices), ...Object.keys(converted), ...Object.keys(jsonInput)].sort(), ALL_IDS);

      for (const id of ALL_IDS) {
        const text = JSON_INPUT.has(id) ? '[{"a":"x"}]' : headerOnly[id] ?? 'a,b';
        const typed = inputs[id] ?? VALID_INPUTS[id];
        if (emptyArray.includes(id)) {
          assert.strictEqual(run(id, text, typed), '[]', id);
          // With a final line break the result ends with one too (TABLE-020: js-yaml writes "[]").
          assert.strictEqual(run(id, `${text}\n`, typed), '[]\n', id);
        } else if (errors.includes(id)) {
          rejects(() => run(id, text, typed), /^no data rows \(only the header was found\)$/);
        } else if (notices[id]) {
          assert.deepStrictEqual(notice(id, text, typed), notices[id], id);
        } else {
          assert.strictEqual(run(id, text, typed), headerTable[id] ?? converted[id] ?? jsonInput[id], id);
        }
      }
    });
  });

  suite('final line break', () => {
    test('the result ends with one LF exactly when the selection ended with a line break', () => {
      for (const { id, output } of TABLE_COMMAND_ENTRIES) {
        if (output === 'notify') {
          continue;
        }
        const example = TABLE_ROADMAP_EXAMPLES[id];
        assert.ok(!run(id, example.input, example.inputs).endsWith('\n'), id);
        assert.strictEqual(run(id, `${example.input}\n`, example.inputs), `${example.expected}\n`, id);
        assert.strictEqual(run(id, `${example.input}\r\n`, example.inputs), `${example.expected}\n`, id);
        assert.strictEqual(run(id, `${example.input}\n\n\n`, example.inputs), `${example.expected}\n`, id);
      }
    });
  });

  suite('common rules', () => {
    test('rows longer than the header are errors, shorter rows get empty values (001 / 012 / 020 / 025)', () => {
      for (const id of ['TABLE-001', 'TABLE-012', 'TABLE-020', 'TABLE-025']) {
        rejects(() => run(id, 'a,b\n1,2\n3,4,5'), /^row 3 has more cells than the header \(3 > 2\)$/);
      }
      assert.deepStrictEqual(JSON.parse(run('TABLE-001', 'a,b\n1')), [{ a: '1', b: '' }]);
      assert.strictEqual(run('TABLE-012', 'a,b\n1', ['t']), "INSERT INTO t (a, b) VALUES ('1', '');");
      assert.strictEqual(run('TABLE-020', 'a,b\n1'), "- a: '1'\n  b: ''");
      assert.strictEqual(run('TABLE-025', 'a,b\n1,2\n3'), 'a: 1\nb: 2\n\na: 3\nb: ');
    });

    test('duplicate header names are errors for JSON / YAML; __proto__ is an ordinary key', () => {
      for (const id of ['TABLE-001', 'TABLE-020', 'TABLE-026']) {
        rejects(() => run(id, 'a,b,a\n1,2,3'), /^the header has the column name "a" more than once$/);
      }
      const json = run('TABLE-001', '__proto__,constructor\n{"x":1},y');
      assert.strictEqual(json, '[\n  {\n    "__proto__": "{\\"x\\":1}",\n    "constructor": "y"\n  }\n]');
      assert.strictEqual(({} as Record<string, unknown>).x, undefined);
      const parsed = yaml.load(run('TABLE-020', '__proto__,b\n1,2'), { schema: yaml.CORE_SCHEMA }) as Record<string, unknown>[];
      assert.deepStrictEqual(Object.keys(parsed[0]), ['__proto__', 'b']);
    });

    test('CSV output is rewritten with minimal quoting and LF line breaks', () => {
      assert.strictEqual(run('TABLE-019', '"a","b"\r\n"c ""q""","d\r\ne"\r\n'), 'a,b\n"c ""q""","d\r\ne"\n');
      assert.strictEqual(run('TABLE-013', '"h"\n"x"\nx'), 'h\nx');
    });

    test('the grid limit applies to every command, also to those that do not pad', () => {
      const text = `${','.repeat(1_999)}\n${'a\n'.repeat(5_000)}`;
      for (const id of ALL_IDS) {
        if (JSON_INPUT.has(id)) {
          continue;
        }
        // TABLE-004 reads tabs and TABLE-022 white space: the same shape with their separators.
        const shaped = id === 'TABLE-004' ? text.replace(/,/g, '\t') : id === 'TABLE-022' ? `${Array(2_000).fill('x').join(' ')}\n${'a\n'.repeat(5_000)}` : text;
        assert.throws(() => runAny(id, shaped), TableTooLargeError, id);
      }
      // TABLE-002: elements x the union of the keys.
      const wide = `[${Array.from({ length: 5_000 }, (_, i) => `{"k${i}":1}`).join(',')}]`;
      assert.throws(() => run('TABLE-002', wide), TableTooLargeError);
    });
  });

  suite('TABLE-001 / 002 JSON', () => {
    test('values are always strings; quoted cells keep commas, quotes and line breaks', () => {
      assert.deepStrictEqual(JSON.parse(run('TABLE-001', 'n,t\n1,"a,""b""\nc"\n2.0,true')), [{ n: '1', t: 'a,"b"\nc' }, { n: '2.0', t: 'true' }]);
    });

    test('JSON -> CSV: union of keys in first-seen order, null / missing empty, nested as compact JSON', () => {
      assert.strictEqual(run('TABLE-002', '[{"b":1,"a":null},{"c":{"x":[1,"y"]},"a":true},{"b":"q,\\"r\\"\\ns"}]'),
        'b,a,c\n1,,\n,true,"{""x"":[1,""y""]}"\n"q,""r""\ns",,');
      assert.strictEqual(run('TABLE-002', '[{"a":1.5e3,"b":-0.25,"c":""}]'), 'a,b,c\n1500,-0.25,');
    });

    test('JSON -> CSV errors: not an array, not objects, invalid JSON, too deep', () => {
      rejects(() => run('TABLE-002', '{"a":1}'), /needs a JSON array of objects/);
      rejects(() => run('TABLE-002', '[{"a":1},2]'), /^element 2 of the array is not an object$/);
      rejects(() => run('TABLE-002', '[[1]]'), /^element 1 of the array is not an object$/);
      rejects(() => run('TABLE-002', '[{},{}]'), /^the objects have no keys$/);
      rejects(() => run('TABLE-002', '[{"a":1},'), /^invalid JSON: line 1, column 10/);
      rejects(() => run('TABLE-002', `[{"a":${'['.repeat(600)}${']'.repeat(600)}}]`), /nesting is too deep/);
      assert.strictEqual(run('TABLE-002', `[{"a":${'['.repeat(400)}${']'.repeat(400)}}]`).split('\n')[0], 'a');
    });

    test('JSON -> CSV: a number out of the double range is an error, not the text null (002 / 027)', () => {
      for (const id of ['TABLE-002', 'TABLE-027']) {
        rejects(() => run(id, '[{"w":1e400}]'), /^element 1: a number is out of range$/);
        rejects(() => run(id, '[{"a":1},{"b":-1e400}]'), /^element 2: a number is out of range$/);
        rejects(() => run(id, '[{"a":{"b":[1,{"c":1e999}]}}]'), /^element 1: a number is out of range$/);
      }
      assert.strictEqual(run('TABLE-002', '[{"w":1e308,"x":null,"y":5e-324}]'), 'w,x,y\n1e+308,,5e-324');
    });

    test('CSV -> JSON -> CSV round trip', () => {
      const csv = 'id,name,note\n1,"O\'Neil, J","say ""hi"""\n2,,"x\ny"';
      assert.strictEqual(run('TABLE-002', run('TABLE-001', csv)), csv);
    });
  });

  suite('TABLE-003 / 004 TSV', () => {
    test('cells with a tab, a line break or a quote are quoted; commas are not', () => {
      assert.strictEqual(run('TABLE-003', '"a\tb","c,d","e""f","g\nh"'), '"a\tb"\tc,d\t"e""f"\t"g\nh"');
      assert.strictEqual(run('TABLE-004', '"a\tb"\tc,d\t"e""f"\t"g\nh"'), 'a\tb,"c,d","e""f","g\nh"');
    });

    test('TSV with quoted cells followed by tabs (Excel)', () => {
      assert.strictEqual(run('TABLE-004', '"a"\tb\n"c" \td\n"e"\t\tf'), 'a,b\nc,d\ne,,f');
    });
  });

  suite('TABLE-005 / 006 / 007 / 008 columns', () => {
    test('transpose pads ragged rows', () => {
      assert.strictEqual(run('TABLE-005', 'a,b,c\n1\n2,3'), 'a,1,2\nb,,3\nc,,');
      assert.strictEqual(run('TABLE-005', 'a'), 'a');
      assert.strictEqual(run('TABLE-005', run('TABLE-005', 'a,b\n1,2\n3,4')), 'a,b\n1,2\n3,4');
    });

    test('extract / remove / swap by number and by header name', () => {
      assert.strictEqual(run('TABLE-006', 'id,name\n1,x\n2', ['name']), 'name\nx\n""');
      assert.strictEqual(run('TABLE-007', 'a,b,c\n1,2,3\n4', ['c']), 'a,b\n1,2\n4');
      assert.strictEqual(run('TABLE-007', 'a,b,c\n1', ['1']), 'b,c\n""');
      assert.strictEqual(run('TABLE-008', 'a,b,c\n1,2,3\n4', ['c', '1']), 'c,b,a\n3,2,1\n,,4');
    });

    test('column errors: out of range, unknown, ambiguous, same column, one column', () => {
      rejects(() => run('TABLE-006', 'a,b\n1,2', ['3']), /^column 3 is out of range: the table has 2 columns$/);
      rejects(() => run('TABLE-006', 'a,b\n1,2', ['A']), /^no column named "A" in the header$/);
      rejects(() => run('TABLE-007', 'a,a\n1,2', ['a']), /^2 columns are named "a"; use the column number$/);
      rejects(() => run('TABLE-008', 'a,b\n1,2', ['a', '1']), /^the two columns are the same column$/);
      rejects(() => run('TABLE-007', 'a\n1', ['1']), /^the table has only one column$/);
    });

    test('a numeric header name is addressed by number, not by name', () => {
      assert.strictEqual(run('TABLE-006', '2,1\nx,y', ['1']), '2\nx');
    });
  });

  suite('TABLE-009 / 010 align and trim', () => {
    test('pads every cell but the last of each row to the widest cell of its column (quotes included)', () => {
      assert.strictEqual(run('TABLE-009', 'id,name,x\n1000,"a,b",1\n2,c'), 'id  ,name ,x\n1000,"a,b",1\n2   ,c');
    });

    test('width counts code points (an emoji is 1); a row of one empty cell stays ""', () => {
      assert.strictEqual(run('TABLE-009', '😀😀,a\nb,c\n""'), '😀😀,a\nb ,c\n""');
    });

    test('Align Columns output reads back and Trim Cell Padding undoes it', () => {
      const csv = 'id,name,note\n1,"O\'Neil, J",x\n200,,"say ""hi"""';
      const aligned = run('TABLE-009', csv);
      assert.deepStrictEqual(parseDelimited(aligned, ',').length, 3);
      assert.strictEqual(run('TABLE-010', aligned), csv);
    });

    test('trim removes spaces / tabs inside quotes too, and keeps other white space', () => {
      assert.strictEqual(run('TABLE-010', ' a\t,"  b\t" ,\u3000c'), 'a,b,\u3000c');
    });

    test('the output limit is checked before the aligned text is built', () => {
      // 2 columns: a very wide cell in the first row pads the first cell of every other row.
      const text = `${'x'.repeat(100_000)},y\n${'a,b\n'.repeat(200)}`;
      tooLarge(() => withinBudget(2_000, () => run('TABLE-009', text)));
    });
  });

  suite('TABLE-011 HTML', () => {
    test('escapes & < > " \' in every cell and pads ragged rows', () => {
      assert.strictEqual(run('TABLE-011', '<script>alert(1)</script>,"a&b ""c"" \'d\'"\n1'),
        '<table>\n  <tr><th>&lt;script&gt;alert(1)&lt;/script&gt;</th><th>a&amp;b &quot;c&quot; &#39;d&#39;</th></tr>\n  <tr><td>1</td><td></td></tr>\n</table>');
    });

    test('no raw markup from the cells reaches the output', () => {
      const html = run('TABLE-011', '"<img src=x onerror=alert(1)>",&lt;');
      assert.ok(!/<img/.test(html), html);
      assert.ok(html.includes('&amp;lt;'), html);
    });
  });

  suite('TABLE-012 SQL INSERT', () => {
    test('values are string literals with \' doubled; empty cells are \'\'', () => {
      assert.strictEqual(run('TABLE-012', "id,name\n1,O'Neil\n2,\n3,'; DROP TABLE users; --", ['users']), [
        "INSERT INTO users (id, name) VALUES ('1', 'O''Neil');",
        "INSERT INTO users (id, name) VALUES ('2', '');",
        "INSERT INTO users (id, name) VALUES ('3', '''; DROP TABLE users; --');",
      ].join('\n'));
    });

    test('names: plain identifiers and schema.table as they are, anything else quoted with " doubled', () => {
      assert.strictEqual(sqlTableName('users'), 'users');
      assert.strictEqual(sqlTableName('app.users'), 'app.users');
      assert.strictEqual(sqlTableName('_t1'), '_t1');
      assert.strictEqual(sqlTableName('my table'), '"my table"');
      assert.strictEqual(sqlTableName('app.my users'), '"app.my users"');
      assert.strictEqual(sqlTableName('a..b'), '"a..b"');
      assert.strictEqual(sqlTableName('1st'), '"1st"');
      assert.strictEqual(sqlTableName('x"; DROP TABLE t; --'), '"x""; DROP TABLE t; --"');
      assert.strictEqual(run('TABLE-012', '"first name","a""b",ok\n1,2,3', ['t']),
        'INSERT INTO t ("first name", "a""b", ok) VALUES (\'1\', \'2\', \'3\');');
    });

    test('control characters (tab / line breaks allowed) and empty names are errors', () => {
      assert.strictEqual(run('TABLE-012', 'a\n"x\ty\r\nz"', ['t']), "INSERT INTO t (a) VALUES ('x\ty\r\nz');");
      rejects(() => run('TABLE-012', 'a\nx\u0000', ['t']), /^row 2, column 1 contains a control character$/);
      rejects(() => run('TABLE-012', 'a,b\u001b\n1,2', ['t']), /^column 2 of the header contains a control character$/);
      rejects(() => run('TABLE-012', 'a,,c\n1,2,3', ['t']), /^column 2 of the header is empty$/);
      rejects(() => run('TABLE-012', 'a\n1', ['']), /^the table name is empty$/);
      rejects(() => run('TABLE-012', 'a\n1', ['t\u0000']), /^the table name contains a control character$/);
    });

    test('a backslash in a value, a column name or the table name is an error (MySQL reads it as an escape)', () => {
      const reason = SQL_BACKSLASH_REASON;
      const refused = (text: string, table: string, message: string) => assert.throws(() => run('TABLE-012', text, [table]),
        (error: unknown) => error instanceof TableInputError && error.message === message);
      // The attack of the security review: `\'` would end the first literal early in MySQL.
      refused('a,b\n\\,); DROP TABLE users; -- ', 'users', `row 2, column 1 contains ${reason}`);
      refused('a,b\n1,2\n3,x\\y', 't', `row 3, column 2 contains ${reason}`);
      refused('a,"b\\"""\n1,2', 't', `column 2 of the header contains ${reason}`);
      refused('a\n1', 'my\\table', `the table name contains ${reason}`);
      refused('a\n1', 'app.\\', `the table name contains ${reason}`);
      // Nothing else changed: characters that are special to MySQL only outside a literal stay inside it.
      assert.strictEqual(run('TABLE-012', 'a\n"%_""`/*"', ['t']), "INSERT INTO t (a) VALUES ('%_\"`/*');");
    });

    test('a yen sign (U+00A5, saved as a backslash in Shift_JIS / EUC-JP) in a value or a name is an error', () => {
      const reason = SQL_YEN_SIGN_REASON;
      const refused = (text: string, table: string, message: string) => assert.throws(() => run('TABLE-012', text, [table]),
        (error: unknown) => error instanceof TableInputError && error.message === message);
      refused('a,b\n\u00A5,); DROP TABLE users; -- ', 'users', `row 2, column 1 contains ${reason}`);
      refused('a,price\u00A5\n1,2', 't', `column 2 of the header contains ${reason}`);
      refused('a\n1', 'my\u00A5table', `the table name contains ${reason}`);
      // The fullwidth yen sign (U+FFE5) is not saved as 0x5C (Shift_JIS: 0x818F).
      assert.strictEqual(run('TABLE-012', 'a\n\uFFE5100', ['t']), "INSERT INTO t (a) VALUES ('\uFFE5100');");
    });

    test('the output limit stops long INSERT lists', () => {
      const text = `${Array.from({ length: 100 }, (_, i) => `column_${i}`).join(',')}\n${`${'1,'.repeat(99)}1\n`.repeat(20_000)}`;
      tooLarge(() => run('TABLE-012', text, ['t']));
    });
  });

  suite('TABLE-013 / 014 rows', () => {
    test('dedupe keeps the header and the first of each identical data row', () => {
      assert.strictEqual(run('TABLE-013', 'a,b\na,b\n1,2\n1,2\n1,"2"\n1,2,\n1'), 'a,b\na,b\n1,2\n1,2,\n1');
    });

    test('filter: Equals / Contains, case-sensitive, header kept, short rows compare with ""', () => {
      const csv = 'n,v\na,Apple\nb,apple pie\nc\nd,';
      assert.strictEqual(run('TABLE-014', csv, ['v', 'Equals', 'Apple']), 'n,v\na,Apple');
      assert.strictEqual(run('TABLE-014', csv, ['v', 'Contains', 'pple']), 'n,v\na,Apple\nb,apple pie');
      assert.strictEqual(run('TABLE-014', csv, ['v', 'Equals', '']), 'n,v\nc\nd,');
      assert.strictEqual(run('TABLE-014', csv, ['2', 'Contains', 'x']), 'n,v');
      assert.strictEqual(run('TABLE-014', csv, ['v', 'Contains', '.*']), 'n,v');
    });
  });

  suite('TABLE-015 Sum Column', () => {
    test('sum and average, rounded to 15 significant digits', () => {
      assert.deepStrictEqual(notice('TABLE-015', 'v\n0.1\n0.2', ['v']), { message: 'sum=0.3, avg=0.15' });
      assert.deepStrictEqual(notice('TABLE-015', 'v\n-1.5\n.5\n1e3\n+2\n 3 ', ['v']), { message: 'sum=1004, avg=200.8' });
      assert.strictEqual(formatNumber(0.1 + 0.2), '0.3');
      assert.strictEqual(formatNumber(1 / 3), '0.333333333333333');
      assert.strictEqual(formatNumber(1e21), '1e+21');
    });

    test('empty cells are ignored, non-numeric cells are counted', () => {
      assert.deepStrictEqual(notice('TABLE-015', 'v\n1\n\nx\n1,2\n0x10\n1e999\n2', ['v']), { message: 'sum=4, avg=1.33333333333333 (3 non-numeric cells skipped)' });
      assert.deepStrictEqual(notice('TABLE-015', 'v\n1\nabc', ['v']), { message: 'sum=1, avg=1 (1 non-numeric cell skipped)' });
      assert.deepStrictEqual(notice('TABLE-015', 'v\nabc\n', ['v']), { message: 'no numeric cells in the column (1 non-numeric cell skipped)', warning: true });
    });

    test('a sum past the double range is a warning, not Infinity', () => {
      assert.deepStrictEqual(notice('TABLE-015', 'n,v\na,1e308\nb,1e308', ['v']), { message: 'the sum is out of range', warning: true });
      assert.deepStrictEqual(notice('TABLE-015', 'v\n-1e308\n-1e308\nx', ['v']),
        { message: 'the sum is out of range (1 non-numeric cell skipped)', warning: true });
      assert.deepStrictEqual(notice('TABLE-015', 'v\n1e308\n-1e308', ['v']), { message: 'sum=0, avg=0' });
    });

    test('long runs of digits are checked in linear time', () => {
      const cell = `${'1'.repeat(2_000_000)}x`;
      withinBudget(2_000, () => notice('TABLE-015', `v\n${cell}\n${'.'.repeat(1_000_000)}1e`, ['v']));
    });
  });

  suite('TABLE-016 / 017 / 018 / 019', () => {
    test('index column', () => {
      assert.strictEqual(run('TABLE-016', 'a,b\nx\ny,z'), '#,a,b\n1,x\n2,y,z');
    });

    test('change delimiter: quoting follows the new delimiter', () => {
      assert.strictEqual(run('TABLE-017', 'a;b,c\n"x,y",z', [';']), '"a;b";c\nx,y;z');
      assert.strictEqual(run('TABLE-017', 'a,b', ['|']), 'a|b');
      assert.strictEqual(run('TABLE-017', 'a\tb,c', ['\\t']), '"a\tb"\tc');
      assert.strictEqual(run('TABLE-017', 'a,b😀', ['😀']), 'a😀"b😀"');
      for (const bad of ['', ';;', '"', '\n', '\t', '\ud800']) {
        rejects(() => run('TABLE-017', 'a,b', [bad]));
      }
    });

    test('quote all / remove unnecessary quotes', () => {
      assert.strictEqual(run('TABLE-018', 'a,,"b""c"\n"x\ny"'), '"a","","b""c"\n"x\ny"');
      assert.strictEqual(run('TABLE-019', '"a","","b""c","d,e","f\ng"," h "'), 'a,,"b""c","d,e","f\ng", h ');
    });
  });

  suite('TABLE-020 YAML', () => {
    test('values are strings (quoted when YAML would read another type), no aliases', () => {
      const text = run('TABLE-020', 'a,b,c\ntrue,null,x\n1.5,~,"multi\nline"');
      assert.deepStrictEqual(yaml.load(text, { schema: yaml.CORE_SCHEMA }),
        [{ a: 'true', b: 'null', c: 'x' }, { a: '1.5', b: '~', c: 'multi\nline' }]);
      assert.ok(!text.includes('&') && !text.includes('*'), text);
    });

    test('the output limit is checked before dumping', () => {
      const header = Array.from({ length: 200 }, (_, i) => `${'k'.repeat(40)}${i}`).join(',');
      const text = `${header}\n${`${'1,'.repeat(199)}1\n`.repeat(2_000)}`;
      tooLarge(() => withinBudget(3_000, () => run('TABLE-020', text)));
    });
  });

  suite('TABLE-021 ASCII table', () => {
    test('borders, padding by code points, ragged rows and line breaks in cells', () => {
      assert.strictEqual(run('TABLE-021', 'name,n\n"a\r\nb",10\né😀'), [
        '+------+----+',
        '| name | n  |',
        '+------+----+',
        '| a b  | 10 |',
        '| é😀   |    |',
        '+------+----+',
      ].join('\n'));
    });

    test('the output limit is checked before the table is built', () => {
      const text = `${'x'.repeat(50_000)}\n${'a\n'.repeat(250)}`;
      tooLarge(() => withinBudget(2_000, () => run('TABLE-021', text)));
    });

    test('tabs in cells become one space each, so that the borders stay aligned', () => {
      assert.strictEqual(run('TABLE-021', 'a\n"x\ty"\n"\t\tz"'), [
        '+-----+',
        '| a   |',
        '+-----+',
        '| x y |',
        '|   z |',
        '+-----+',
      ].join('\n'));
    });
  });

  suite('TABLE-022 whitespace-separated', () => {
    test('runs of spaces / tabs split, leading / trailing white space and blank lines ignored, no quotes', () => {
      assert.strictEqual(run('TABLE-022', '  NAME \t AGE  CITY\n\n\tbob   30  "New York"\r\n'), 'NAME,AGE,CITY\nbob,30,"""New","York"""\n');
      assert.strictEqual(run('TABLE-022', 'a,b c'), '"a,b",c');
    });
  });

  suite('TABLE-023 Show Row and Column Count', () => {
    test('empty and missing cells per column; names shortened; at most 10 columns listed', () => {
      assert.deepStrictEqual(notice('TABLE-023', 'a,b,c\n1\n,2,3'), { message: '2 rows × 3 cols, a: 1 empty, b: 1 empty, c: 1 empty' });
      assert.deepStrictEqual(notice('TABLE-023', 'a\nx'), { message: '1 row × 1 col, no empty cells' });
      assert.deepStrictEqual(notice('TABLE-023', ',b\n,1'), { message: '1 row × 2 cols, column 1: 1 empty' });
      const long = 'n'.repeat(100);
      assert.deepStrictEqual(notice('TABLE-023', `${long}\n""`), { message: `1 row × 1 col, ${'n'.repeat(60)}…: 1 empty` });
      assert.deepStrictEqual(notice('TABLE-023', '"a\nb"\n""'), { message: '1 row × 1 col, a\\nb: 1 empty' });
      const header = Array.from({ length: 13 }, (_, i) => `c${i + 1}`).join(',');
      const message = notice('TABLE-023', `${header}\n${','.repeat(12)}`).message;
      assert.strictEqual(message, `1 row × 13 cols, ${Array.from({ length: 10 }, (_, i) => `c${i + 1}: 1 empty`).join(', ')}, …and 3 more`);
    });
  });

  suite('TABLE-024 / 025', () => {
    test('fill down: every row is data, filled values are used further down, spaces are values', () => {
      assert.strictEqual(run('TABLE-024', ',h\na,\n,\n" ",x\n,'), ',h\na,h\na,h\n ,x\n ,x');
      assert.strictEqual(run('TABLE-024', 'a,b\n1'), 'a,b\n1,b');
    });

    test('records: header: value lines separated by one empty line', () => {
      assert.strictEqual(run('TABLE-025', 'a,b\n1,2\n3,4'), 'a: 1\nb: 2\n\na: 3\nb: 4');
    });

    test('records: line breaks in headers and values become one space each (one pair per line)', () => {
      // The cases of the code / QA reviews: an empty line inside a value, line breaks in a header.
      assert.strictEqual(run('TABLE-025', 'a,b\n"x\n\nb: z",2\n3,4'), 'a: x  b: z\nb: 2\n\na: 3\nb: 4');
      assert.strictEqual(run('TABLE-025', '"a\nx",b\n1,"2\r\n3"'), 'a x: 1\nb: 2 3');
      assert.strictEqual(run('TABLE-025', '"h\r1",h2\n"\n",""\n"a\r\n\r\nb",c'), 'h 1:  \nh2: \n\nh 1: a  b\nh2: c');
      // Every line is a pair or the empty line between records.
      const lines = run('TABLE-025', '"k\n\n",v\n"\n\n","\r\r"\n"x\ny",z').split('\n');
      assert.deepStrictEqual(lines.filter((line) => line === '').length, 1);
    });
  });

  suite('robustness', () => {
    test('random text never throws anything but TableInputError / DataInputError / EncOutputTooLargeError', () => {
      let seed = 20260929;
      const next = () => {
        seed = (seed * 1103515245 + 12345) & 0x7fffffff;
        return seed / 0x7fffffff;
      };
      const alphabet = ['a', '1', ',', '"', '\n', '\r', '\t', ' ', '[', ']', '{', '}', ':', '.', '-', 'e', '😀', '\u0000'];
      let calls = 0;
      for (let round = 0; round < 1_500; round++) {
        const text = Array.from({ length: Math.floor(next() * 20) }, () => alphabet[Math.floor(next() * alphabet.length)]).join('');
        for (const id of ALL_IDS) {
          calls++;
          try {
            runAny(id, text);
          } catch (error) {
            assert.ok(error instanceof TableInputError || (error as Error).name === 'DataInputError' || error instanceof EncOutputTooLargeError,
              `${id} threw ${String(error)} for ${JSON.stringify(text)}`);
          }
        }
      }
      assert.ok(calls >= 45_000, String(calls));
    });

    test('a 5,000,000-character selection is converted within the output limit or refused', () => {
      const text = 'abc,"d,e",123,x\n'.repeat(300_000);
      assert.ok(text.length <= 5_000_000);
      for (const id of ['TABLE-003', 'TABLE-005', 'TABLE-009', 'TABLE-013', 'TABLE-021', 'TABLE-026']) {
        withinBudget(15_000, () => {
          try {
            assert.ok(run(id, text).length <= MAX_OUTPUT_LENGTH, id);
          } catch (error) {
            assert.ok(error instanceof EncOutputTooLargeError, `${id}: ${String(error)}`);
          }
        });
      }
    });
  });

  suite('source code rules (SECURITY.md)', () => {
    const files = ['tableCsv.ts', 'tableTransforms.ts', 'tableHandler.ts'];
    files.forEach((file) => {
      test(`${file} uses no eval, Function constructor, processes, network, files, dynamic require or regular expressions built from text`, () => {
        // Comments are removed first: they may mention what the code avoids.
        const source = fs.readFileSync(path.resolve(__dirname, '../../../src/handler', file), 'utf8')
          .replace(/\/\*[\s\S]*?\*\//g, '')
          .replace(/^\s*\/\/.*$/gm, '');
        [/\beval\s*\(/, /\bnew\s+Function\b/, /\bFunction\s*\(/, /child_process/, /\brequire\s*\(/, /\bimport\s*\(/,
          /from 'node:(?:fs|net|http|https|dns|vm)'/, /from '(?:fs|net|http|https|dns|vm)'/, /\bfetch\s*\(/, /setTimeout\s*\(\s*['"`]/,
          /\bnew\s+RegExp\b/, /\bRegExp\s*\(/, /createWebviewPanel/]
          .forEach((pattern) => assert.ok(!pattern.test(source), `${file}: ${pattern}`));
      });
    });
  });
});
