import * as assert from 'assert';
import { EncOutputTooLargeError, MAX_OUTPUT_LENGTH } from '../../handler/encodeTransforms';
import { DEV_MAX_INPUT_LENGTH, DEV_MAX_NESTING, DevInputError } from '../../handler/devCommon';
import { cssFormat, cssMinify } from '../../handler/devCss';
import { sqlFormat, sqlMinify, sqlUppercaseKeywords } from '../../handler/devSql';

const format = (sql: string, eol = '\n') => sqlFormat(sql, eol, MAX_OUTPUT_LENGTH);
const minifyCss = (css: string) => cssMinify(css, MAX_OUTPUT_LENGTH);
const formatCss = (css: string, eol = '\n') => cssFormat(css, eol, MAX_OUTPUT_LENGTH);
const lines = (...parts: string[]) => parts.join('\n');

const refuses = (convert: () => string, message: RegExp) =>
  assert.throws(convert, (error: Error) => error instanceof DevInputError && message.test(error.message), String(message));

suite('Developer SQL and CSS (DEV-015..019) Test Suite', () => {

  suite('DEV-017 sql-uppercase-keywords', () => {
    test('only keywords change; strings, quoted identifiers and comments stay', () => {
      assert.strictEqual(sqlUppercaseKeywords('select name from users'), 'SELECT name FROM users');
      assert.strictEqual(
        sqlUppercaseKeywords('select "from", `select`, [where], \'and or\' from t -- select from\n/* where */ where a is not null;'),
        'SELECT "from", `select`, [where], \'and or\' FROM t -- select from\n/* where */ WHERE a IS NOT NULL;',
      );
    });

    test('words next to a dot are names; the spacing is kept exactly', () => {
      assert.strictEqual(sqlUppercaseKeywords('select t.date, date.x ,\tcount(*)\r\nfrom t'), 'SELECT t.date, date.x ,\tcount(*)\r\nFROM t');
    });

    test('the rest of a # line (a MySQL comment, or a SQL Server #temp) is not uppercased', () => {
      assert.strictEqual(sqlUppercaseKeywords('select a # note from x where y\nfrom #t'), 'SELECT a # note from x where y\nFROM #t');
    });

    test('doubled quotes stay inside their literal', () => {
      assert.strictEqual(sqlUppercaseKeywords('select \'it\'\'s from\', "a""from" from t'), 'SELECT \'it\'\'s from\', "a""from" FROM t');
    });
  });

  suite('DEV-016 sql-minify', () => {
    test('comments become a space, white space runs one space', () => {
      assert.strictEqual(sqlMinify('SELECT a\n-- c\nFROM t'), 'SELECT a FROM t');
      assert.strictEqual(sqlMinify('  SELECT\ta ,\n  b\r\nFROM   t  /* x */ WHERE ( a = 1 ) ;  '), 'SELECT a, b FROM t WHERE (a = 1);');
    });

    test('removing a comment never joins tokens', () => {
      assert.strictEqual(sqlMinify('SELECT 1-/*x*/-1'), 'SELECT 1- -1');
      assert.strictEqual(sqlMinify('SELECT a/*x*/b'), 'SELECT a b');
      assert.strictEqual(sqlMinify('SELECT 1/*x*/*2'), 'SELECT 1 *2');
      assert.strictEqual(sqlMinify('x-- c\n-1'), 'x -1');
      assert.strictEqual(sqlMinify('x-- c'), 'x');
    });

    test('the line break after a # (a MySQL comment) is kept, so the next line never becomes comment', () => {
      assert.strictEqual(sqlMinify('DELETE FROM users # all?\nWHERE id = 1'), 'DELETE FROM users # all?\nWHERE id = 1');
      assert.strictEqual(sqlMinify('DELETE FROM users #all?\r\n  WHERE id = 1 -- c\n  AND b = 2'), 'DELETE FROM users #all?\r\nWHERE id = 1 AND b = 2');
      assert.strictEqual(sqlMinify('SELECT f(a # c\n) FROM t # end\n'), 'SELECT f(a # c\n) FROM t # end');
      // A SQL Server #temp table keeps a line break too, which does not change the query.
      assert.strictEqual(sqlMinify('SELECT #t.a\n  FROM #t\n  WHERE x = 1'), 'SELECT #t.a\nFROM #t\nWHERE x = 1');
    });

    test('the rest of a # line is copied as it is: nothing in it is read as a comment or joined', () => {
      assert.strictEqual(sqlMinify('DELETE FROM t WHERE id = 1   # OR   1 = 1  -- x\nAND b = 2'), 'DELETE FROM t WHERE id = 1 # OR   1 = 1  -- x\nAND b = 2');
      assert.strictEqual(sqlMinify('SELECT a#b ,  c  FROM t'), 'SELECT a#b ,  c  FROM t');
      assert.strictEqual(sqlMinify('SELECT a # /* x */ y\n  FROM t'), 'SELECT a # /* x */ y\nFROM t');
    });

    test('-- not followed by a space (code in MySQL: 1 --1 is 1 - -1) is kept with its line break', () => {
      // The security review (round 2): the minified query must not lose `AND id=3` in MySQL.
      assert.strictEqual(sqlMinify('DELETE FROM t WHERE 1 --1 AND id=3'), 'DELETE FROM t WHERE 1 --1 AND id=3');
      assert.strictEqual(sqlMinify('SELECT a --x\n  FROM t -- c\n  WHERE 1'), 'SELECT a --x\nFROM t WHERE 1');
      assert.strictEqual(sqlMinify('--------\nSELECT 1 --\n'), '--------\nSELECT 1');
    });

    test('optimizer hints and MySQL executable comments are kept', () => {
      assert.strictEqual(sqlMinify('SELECT /*+ INDEX(t i) */ a FROM t /*!40101 SET x=1 */'), 'SELECT /*+ INDEX(t i) */ a FROM t /*!40101 SET x=1 */');
    });

    test('literals are not touched', () => {
      assert.strictEqual(sqlMinify('SELECT \'a  --  b\' ,  "c   d" , `e  f` , [g  h]'), 'SELECT \'a  --  b\', "c   d", `e  f`, [g  h]');
      assert.strictEqual(sqlMinify('SELECT \'x\n\n y\''), 'SELECT \'x\n\n y\'');
    });
  });

  suite('DEV-015 sql-format', () => {
    test('the ROADMAP example', () => {
      assert.strictEqual(format('select a from t where b=1'), 'SELECT a\nFROM t\nWHERE b = 1');
    });

    test('clauses, joins, AND / OR, BETWEEN and subqueries', () => {
      assert.strictEqual(format(
        'select a.id, count(*) as n, -1 from users u left outer join orders o on o.uid = u.id where a between 1 and 2 and b in (select x from y where z=\'q\' or w>=2) or c is not null group by a order by n desc limit 10',
      ), lines(
        'SELECT a.id, count(*) AS n, -1',
        'FROM users u',
        'LEFT OUTER JOIN orders o ON o.uid = u.id',
        'WHERE a BETWEEN 1 AND 2',
        '  AND b IN (',
        '    SELECT x',
        '    FROM y',
        '    WHERE z = \'q\'',
        '      OR w >= 2',
        '  )',
        '  OR c IS NOT NULL',
        'GROUP BY a',
        'ORDER BY n DESC',
        'LIMIT 10',
      ));
    });

    test('statements are separated by a blank line; INSERT, UPDATE and DELETE', () => {
      assert.strictEqual(format('insert into t (a,b) values (1,\'x\'),(2,\'y\');update t set a=1 where b<>2;delete from t where exists (select 1 from u);'), lines(
        'INSERT INTO t (a, b)',
        'VALUES (1, \'x\'), (2, \'y\');',
        '',
        'UPDATE t',
        'SET a = 1',
        'WHERE b <> 2;',
        '',
        'DELETE FROM t',
        'WHERE EXISTS (',
        '  SELECT 1',
        '  FROM u',
        ');',
      ));
    });

    test('function parentheses stay on one line; UNION ALL; derived tables', () => {
      assert.strictEqual(format('select extract(year from d), coalesce(a,b), cast(x as varchar(10)) from (select * from t) s union all select 1, 2, 3'), lines(
        'SELECT extract(year FROM d), coalesce(a, b), CAST(x AS VARCHAR(10))',
        'FROM (',
        '  SELECT *',
        '  FROM t',
        ') s',
        'UNION ALL',
        'SELECT 1, 2, 3',
      ));
      assert.strictEqual(format('select left(s, 2) from a left join b on a.x in (1)'), 'SELECT LEFT(s, 2)\nFROM a\nLEFT JOIN b ON a.x IN (1)');
    });

    test('comments are kept; a line comment ends its line', () => {
      assert.strictEqual(format('-- head\nselect a, -- the a\nb /* bee */ from t'), lines(
        '-- head',
        'SELECT a, -- the a',
        '  b /* bee */',
        'FROM t',
      ));
    });

    test('other operators keep their spacing; N\'…\' stays together', () => {
      assert.strictEqual(format('select a+b, a - b, x||y, t.*, a::int, N\'x\' from t where c=-1'), lines(
        'SELECT a+b, a - b, x||y, t.*, a::INT, N\'x\'',
        'FROM t',
        'WHERE c = -1',
      ));
    });

    test('a comment inside a join prefix does not split the join', () => {
      assert.strictEqual(format('select a from t left /* c */ outer join u on t.id=u.id'),
        lines('SELECT a', 'FROM t', 'LEFT /* c */ OUTER JOIN u ON t.id = u.id'));
      assert.strictEqual(format('select a from t natural left outer join u cross /* c */ join v'),
        lines('SELECT a', 'FROM t', 'NATURAL LEFT OUTER JOIN u', 'CROSS /* c */ JOIN v'));
    });

    test('a line break after a # (a MySQL comment) is kept', () => {
      assert.strictEqual(format('select a # note\n, b from t'), lines('SELECT a # note', '  , b', 'FROM t'));
      assert.strictEqual(format('delete from users # no filter\nwhere id = 1'), lines('DELETE FROM users # no filter', 'WHERE id = 1'));
    });

    test('nothing after a # starts a new line or is uppercased, so a MySQL comment stays one (review round 2)', () => {
      assert.strictEqual(format('DELETE FROM t WHERE id = 1 # OR 1 = 1'), lines('DELETE FROM t', 'WHERE id = 1 # OR 1 = 1'));
      assert.strictEqual(format('DELETE FROM users WHERE id = 1 # OR 1=1\n'), lines('DELETE FROM users', 'WHERE id = 1 # OR 1=1'));
      assert.strictEqual(format('UPDATE t SET a = 1 WHERE id = 2 # OR 1 = 1'), lines('UPDATE t', 'SET a = 1', 'WHERE id = 2 # OR 1 = 1'));
      assert.strictEqual(format('UPDATE t SET a=1 # WHERE id=2\n'), lines('UPDATE t', 'SET a = 1 # WHERE id=2'));
      assert.strictEqual(format('SELECT a # note FROM x where y\nFROM t'), lines('SELECT a # note FROM x where y', 'FROM t'));
      assert.strictEqual(format('select a from t where x in (1) # (select 1)\nand z=3'), lines('SELECT a', 'FROM t', 'WHERE x IN (1) # (select 1)', '  AND z = 3'));
      assert.strictEqual(format('select * from t # where x=1 order by b'), lines('SELECT *', 'FROM t # where x=1 order by b'));
      // `a#b` (one name in SQL Server) keeps its spacing; `from#x` is not a keyword.
      assert.strictEqual(format('select a#b, c from t'), 'SELECT a#b, c from t');
      assert.strictEqual(format('select a from#x'), 'SELECT a from#x');
      // A SQL Server #temp line is kept as it is, which does not change the query.
      assert.strictEqual(format('select a from #t where x=1\norder by a'), lines('SELECT a', 'FROM #t where x=1', 'ORDER BY a'));
    });

    test('a # / -- comment that starts a line in the input stays on its own line (SELEC-00060)', () => {
      // `#`, `-- ` and `--x` at the start of a line do not move to the end of the line before them.
      assert.strictEqual(format('SELECT a\n# note\nFROM t'), lines('SELECT a', '  # note', 'FROM t'));
      assert.strictEqual(format('SELECT a\n-- note\nFROM t'), lines('SELECT a', '  -- note', 'FROM t'));
      assert.strictEqual(format('SELECT a\n--x\nFROM t'), lines('SELECT a', '  --x', 'FROM t'));
      assert.strictEqual(format('  # lead\nselect 1'), lines('# lead', 'SELECT 1'));
      // In the middle of a WHERE clause, after white space before the comment, and with CRLF.
      assert.strictEqual(format('select a from t where x=1\n# c\nand y=2'), lines('SELECT a', 'FROM t', 'WHERE x = 1', '  # c', '  AND y = 2'));
      assert.strictEqual(format('select a\n   \t# c\nfrom t'), lines('SELECT a', '  # c', 'FROM t'));
      assert.strictEqual(format('SELECT a\r\n# note\r\nFROM t', '\r\n'), 'SELECT a\r\n  # note\r\nFROM t');
      assert.strictEqual(format('SELECT a\r-- note\rFROM t'), lines('SELECT a', '  -- note', 'FROM t'));
      // After a line comment or a block comment on the line before.
      assert.strictEqual(format('select a -- c\n-- d\nfrom t'), lines('SELECT a -- c', '  -- d', 'FROM t'));
      assert.strictEqual(format('select a /* c */\n# d\nfrom t'), lines('SELECT a /* c */', '  # d', 'FROM t'));
      // A SQL Server #temp that starts a line stays a line of its own and does not join a name.
      assert.strictEqual(format('select a from\n#t where x=1'), lines('SELECT a', 'FROM', '  #t where x=1'));
    });

    test('code after a line-start comment is not taken into it; comments in a row stay apart (SELEC-00060)', () => {
      assert.strictEqual(format('SELECT a\n# note\nFROM t WHERE b=1'), lines('SELECT a', '  # note', 'FROM t', 'WHERE b = 1'));
      assert.strictEqual(format('# a\n# b\nselect 1'), lines('# a', '# b', 'SELECT 1'));
      assert.strictEqual(format('select a, # c\n  # d\n b from t'), lines('SELECT a, # c', '  # d', '  b', 'FROM t'));
      // Right after a statement: still one blank line between the statements.
      assert.strictEqual(format('select 1;\n# c\nselect 2'), lines('SELECT 1;', '', '# c', 'SELECT 2'));
    });

    test('a # or a line comment that does not start a line keeps its place (SELEC-00060)', () => {
      assert.strictEqual(format('select a # c\nfrom t'), lines('SELECT a # c', 'FROM t'));
      assert.strictEqual(format('select a -- c\nfrom t'), lines('SELECT a -- c', 'FROM t'));
      assert.strictEqual(format('select a /* c */ # d\nfrom t'), lines('SELECT a /* c */ # d', 'FROM t'));
      assert.strictEqual(format('select a/* c */# d\nfrom t'), lines('SELECT a /* c */ # d', 'FROM t'));
      assert.strictEqual(format('select a#b, c from t'), 'SELECT a#b, c from t');
      assert.strictEqual(format('select a from#x'), 'SELECT a from#x');
    });

    test('-- not followed by a space is kept as it is and ends its line', () => {
      assert.strictEqual(format('DELETE FROM t WHERE 1 --1 AND id=3'), lines('DELETE FROM t', 'WHERE 1 --1 AND id=3'));
    });

    test('the document line break is used', () => {
      assert.strictEqual(format('select a from t; select b from u', '\r\n'), 'SELECT a\r\nFROM t;\r\n\r\nSELECT b\r\nFROM u');
    });
  });

  suite('SQL errors and limits', () => {
    test('unclosed strings, quoted identifiers and comments are refused by every command', () => {
      const cases: [string, RegExp][] = [
        ['select \'abc', /^a ' string is not closed$/],
        ['select \'it\'\'s', /^a ' string is not closed$/],
        ['select "abc', /^a " quoted identifier is not closed$/],
        ['select `abc', /^a ` quoted identifier is not closed$/],
        ['select [abc', /^a \[ quoted identifier is not closed$/],
        ['select 1 /* x', /^a \/\* comment is not closed$/],
      ];
      for (const [sql, message] of cases) {
        refuses(() => sqlUppercaseKeywords(sql), message);
        refuses(() => sqlMinify(sql), message);
        refuses(() => format(sql), message);
      }
    });

    test('forms of other dialects that would be misread are refused by every command', () => {
      const cases: [string, RegExp][] = [
        ['SELECT $$a -- b\nc$$ FROM t', /dollar-quoted strings/],
        ['SELECT $body$ x $body$', /dollar-quoted strings/],
        ['SELECT /* a /* b */ c */ 1', /nested \/\* comments/],
        ['SELECT E\'it\\\'s -- x\' FROM t', /E'…' strings/],
        ['SELECT e\'\\n\' FROM t', /E'…' strings/],
        ['SELECT \'it\\\'s -- x\' FROM t', /backslash escape/],
        ['SELECT \'C:\\\' FROM t', /backslash escape/],
        // MySQL reads "…" as a string with backslash escapes too (security review round 2).
        ['DELETE FROM t WHERE name = "a\\" -- " AND id = 1 AND "\n\\" " IS NOT NULL', /backslash escape/],
        ['SELECT "C:\\" FROM t', /backslash escape/],
        // An odd number of backslashes before a doubled quote inside the token (security review round 3):
        // MySQL ends the string there, so the comment after it would swallow the next line when minified.
        ['DELETE FROM t WHERE c = \'\\\'\' -- it\'s the quote char\nAND id = 1', /backslash escape/],
        ['UPDATE t SET a = \'x\\\'\' # it\'s\nWHERE id = 1', /backslash escape/],
        ['DELETE FROM t WHERE c = "a\\"" -- x"\nAND id = 1', /backslash escape/],
        ['SELECT \'a\\\\\\\'\' -- x\' FROM t', /backslash escape/],
      ];
      for (const [sql, message] of cases) {
        refuses(() => sqlUppercaseKeywords(sql), message);
        refuses(() => sqlMinify(sql), message);
        refuses(() => format(sql), message);
      }
      // Still supported: $1 parameters, names with $, an E column, an even number of backslashes.
      assert.strictEqual(sqlMinify('SELECT a$b, E, \'\\\\\' FROM t WHERE x = $1'), 'SELECT a$b, E, \'\\\\\' FROM t WHERE x = $1');
      assert.strictEqual(sqlMinify('SELECT "a\\\\", `b\\`, [c\\] FROM t'), 'SELECT "a\\\\", `b\\`, [c\\] FROM t');
      // An even number of backslashes before a doubled quote ends the string where MySQL does too.
      assert.strictEqual(sqlMinify('SELECT \'a\\\\\'\'b\', "c\\\\""d" FROM t'), 'SELECT \'a\\\\\'\'b\', "c\\\\""d" FROM t');
    });

    test('a # or --x line that opens a string, a quoted name or a comment going on to the next line is refused', () => {
      const cases: [string, RegExp][] = [
        ['select a # that\'s\nfrom t', /^a line with # .* does not end on that line/],
        ['SELECT a # x /* y\n */ FROM t', /^a line with # .* does not end on that line/],
        ['SELECT a FROM #t WHERE b = \'x\ny -- \' AND id = 1', /^a line with # .* does not end on that line/],
        ['SELECT a # "b\n" FROM t', /^a line with # .* does not end on that line/],
        ['DELETE FROM t WHERE 1 --1 AND n = \'x\n-- \' AND id = 3', /^a line with -- not followed by a space .*put a space after --$/],
        ['SELECT 1 --x --\'y\n\'', /^a line with -- not followed by a space/],
        ['SELECT a # $$\nb$$', /dollar-quoted strings/],
      ];
      for (const [sql, message] of cases) {
        refuses(() => sqlUppercaseKeywords(sql), message);
        refuses(() => sqlMinify(sql), message);
        refuses(() => format(sql), message);
      }
      // Closed on its line, or after a -- comment on it: accepted.
      assert.strictEqual(sqlMinify('SELECT a # it\'\'s "x" [y] /* z */ -- that\'s\nFROM t'), 'SELECT a # it\'\'s "x" [y] /* z */ -- that\'s\nFROM t');
    });

    test('formatting refuses unbalanced or too deeply nested parentheses', () => {
      refuses(() => format('select (1'), /^the parentheses are not balanced$/);
      refuses(() => format('select 1)'), /^the parentheses are not balanced$/);
      refuses(() => format('select (1; select 2)'), /^the parentheses are not balanced$/);
      assert.ok(format(`select ${'('.repeat(DEV_MAX_NESTING)}1${')'.repeat(DEV_MAX_NESTING)}`).startsWith('SELECT (('));
      refuses(() => format(`select ${'('.repeat(DEV_MAX_NESTING + 1)}1${')'.repeat(DEV_MAX_NESTING + 1)}`), /nested deeper than 200 levels/);
      // Minify and uppercase do not need balanced parentheses.
      assert.strictEqual(sqlMinify('select ( 1'), 'select (1');
    });

    test('a result over the budget throws EncOutputTooLargeError', () => {
      assert.throws(() => sqlFormat('select a from t', '\n', 5), EncOutputTooLargeError);
    });

    test('1,000,000 characters are processed quickly', function () {
      this.timeout(30_000);
      const statement = 'select a, b from t where x = \'y\' and z in (1, 2) -- c\n;';
      const inputs = [
        statement.repeat(Math.floor(DEV_MAX_INPUT_LENGTH / statement.length)),
        '('.repeat(DEV_MAX_INPUT_LENGTH / 2) + ')'.repeat(DEV_MAX_INPUT_LENGTH / 2),
        '\'\''.repeat(DEV_MAX_INPUT_LENGTH / 2),
        '-'.repeat(DEV_MAX_INPUT_LENGTH),
        '# a\n'.repeat(DEV_MAX_INPUT_LENGTH / 4),
        'left /**/ '.repeat(DEV_MAX_INPUT_LENGTH / 10),
        // Join prefixes each on a line after a line comment (non-functional review round 2: was quadratic).
        'LEFT -- c\n'.repeat(DEV_MAX_INPUT_LENGTH / 10),
        `SELECT a FROM t ${'LEFT OUTER -- c\n'.repeat((DEV_MAX_INPUT_LENGTH - 16) / 16)}`,
        '#'.repeat(DEV_MAX_INPUT_LENGTH),
        '--x\n'.repeat(DEV_MAX_INPUT_LENGTH / 4),
        `SELECT 1 --${' a'.repeat((DEV_MAX_INPUT_LENGTH - 12) / 2)}`,
      ];
      for (const convert of [sqlUppercaseKeywords, sqlMinify, (sql: string) => sqlFormat(sql, '\n', 10_000_000)]) {
        for (const input of inputs) {
          const started = Date.now();
          try {
            convert(input);
          } catch (error) {
            assert.ok(error instanceof DevInputError, String(error));
          }
          assert.ok(Date.now() - started < 5000, `${Date.now() - started} ms`);
        }
      }
    });
  });

  suite('DEV-018 css-minify', () => {
    test('comments, white space and the last semicolon are removed', () => {
      assert.strictEqual(minifyCss('a {\n  color: red;\n}'), 'a{color:red}');
      assert.strictEqual(minifyCss('a , b > c {\n  color : red ;\n  margin : 0  auto !important ;\n}\n\n/* x */\nd{}'), 'a,b > c{color:red;margin:0 auto!important}d{}');
    });

    test('the spaces of selectors and values are kept', () => {
      assert.strictEqual(minifyCss('a :hover { width: calc(1px + 2px) ; margin : -1px - 2px }'), 'a :hover{width:calc(1px + 2px);margin:-1px - 2px}');
      assert.strictEqual(minifyCss('@media screen and (max-width: 100px) {\n  a:hover { color: red }\n}'), '@media screen and (max-width: 100px){a:hover{color:red}}');
    });

    test('a comment whose removal would join two tokens becomes /**/', () => {
      assert.strictEqual(minifyCss('a/**/b{}'), 'a/**/b{}');
      assert.strictEqual(minifyCss('a{margin:1px/**/2px}'), 'a{margin:1px/**/2px}');
      assert.strictEqual(minifyCss('a/* x */{color:red}'), 'a{color:red}');
      assert.strictEqual(minifyCss('a /* x */ b{}'), 'a b{}');
      assert.strictEqual(minifyCss('a/* x */ b{}'), 'a b{}');
      assert.strictEqual(minifyCss('a{width:1/* x */%}'), 'a{width:1/**/%}');
      assert.strictEqual(minifyCss('a{b:c/* x *//* y */d}'), 'a{b:c/**/d}');
      assert.strictEqual(minifyCss('a{b:f/* x */(1)}'), 'a{b:f/**/(1)}');
      assert.strictEqual(minifyCss('.a/* x */.b{}'), '.a/**/.b{}');
      assert.strictEqual(minifyCss('a/* x */>b{}'), 'a>b{}');
      assert.strictEqual(minifyCss('a{b:x/* x */,y}'), 'a{b:x,y}');
      // Joins that would make a comment or an HTML comment marker are kept apart.
      assert.strictEqual(minifyCss('a{b:1//**/*2}'), 'a{b:1//**/*2}');
      assert.strictEqual(minifyCss('a{b:x<!/**/--}'), 'a{b:x<!/**/--}');
      assert.strictEqual(minifyCss('a{b:x--/**/>}'), 'a{b:x--/**/>}');
    });

    test('/*! comments are kept; strings and url() are not touched', () => {
      assert.strictEqual(minifyCss('/*! License */\na { b: c }'), '/*! License */ a{b:c}');
      assert.strictEqual(minifyCss('a { content: "a  /* b */  ;}" ; background : url( a;b /* c */.png ) }'), 'a{content:"a  /* b */  ;}";background:url( a;b /* c */.png )}');
      assert.strictEqual(minifyCss('a { background: url( "x y.png" ) }'), 'a{background:url( "x y.png" )}');
    });

    test('a selected list of declarations', () => {
      assert.strictEqual(minifyCss('color : red;\nmargin : 0'), 'color:red;margin:0');
      assert.strictEqual(minifyCss('a :hover'), 'a :hover');
    });
  });

  suite('DEV-019 css-format', () => {
    test('the ROADMAP example', () => {
      assert.strictEqual(formatCss('a{color:red}'), 'a {\n  color: red;\n}');
    });

    test('rules, nested blocks, selector lists, statements and comments', () => {
      assert.strictEqual(formatCss('/* head */ @import url(x.css);@charset "utf-8";a,b\n> c{color:red;background:url(data:image/png;base64,xx)} /* c */ @media (min-width:1px){a:hover{color:blue;&.b{x:y}}}c{}'), lines(
        '/* head */',
        '@import url(x.css);',
        '@charset "utf-8";',
        '',
        'a, b > c {',
        '  color: red;',
        '  background: url(data:image/png;base64,xx);',
        '}',
        '',
        '/* c */',
        '@media (min-width:1px) {',
        '  a:hover {',
        '    color: blue;',
        '    &.b {',
        '      x: y;',
        '    }',
        '  }',
        '}',
        '',
        'c {',
        '}',
      ));
    });

    test('comments inside a declaration stay where they are', () => {
      assert.strictEqual(formatCss('a{/* first */color:/* x */red;margin:1px/**/2px}'), lines(
        'a {',
        '  /* first */',
        '  color: /* x */red;',
        '  margin: 1px/**/2px;',
        '}',
      ));
    });

    test('a selected list of declarations; the document line break', () => {
      assert.strictEqual(formatCss('color:red;margin : 0 auto'), 'color: red;\nmargin: 0 auto;');
      assert.strictEqual(formatCss('a{b:c}d{e:f}', '\r\n'), 'a {\r\n  b: c;\r\n}\r\n\r\nd {\r\n  e: f;\r\n}');
    });
  });

  suite('CSS errors and limits', () => {
    test('unclosed or unmatched parts are refused by both commands', () => {
      const cases: [string, RegExp][] = [
        ['a{color:red', /^a \{ is not closed$/],
        ['a{color:red}}', /^a \} does not match$/],
        ['a{b:f(1}', /^a \( is not closed$/],
        ['a{b:f(1]}', /^a \] does not match$/],
        ['a{content:"x}', /^a " string is not closed$/],
        ['a{content:\'x\n\'}', /^a ' string is not closed$/],
        ['a{} /* x', /^a \/\* comment is not closed$/],
        ['a{b:url(x}', /^a url\( is not closed$/],
      ];
      for (const [css, message] of cases) {
        refuses(() => minifyCss(css), message);
        refuses(() => formatCss(css), message);
      }
    });

    test(`blocks deeper than ${DEV_MAX_NESTING} levels are refused`, () => {
      const nested = (depth: number) => 'a{'.repeat(depth) + '}'.repeat(depth);
      assert.strictEqual(minifyCss(nested(DEV_MAX_NESTING)), nested(DEV_MAX_NESTING));
      assert.ok(formatCss(nested(DEV_MAX_NESTING)).length > 0);
      refuses(() => minifyCss(nested(DEV_MAX_NESTING + 1)), /nested deeper than 200 levels/);
      refuses(() => formatCss(nested(DEV_MAX_NESTING + 1)), /nested deeper than 200 levels/);
    });

    test('a result over the budget throws EncOutputTooLargeError', () => {
      assert.throws(() => cssFormat('a{b:c}', '\n', 5), EncOutputTooLargeError);
      assert.throws(() => cssMinify('a{b:c}', 3), EncOutputTooLargeError);
    });

    test('1,000,000 characters are processed quickly', function () {
      this.timeout(30_000);
      const rule = 'a , b:hover { color : red ; /* c */ margin : 0 }\n';
      const inputs = [
        rule.repeat(Math.floor(DEV_MAX_INPUT_LENGTH / rule.length)),
        'a/**/'.repeat(DEV_MAX_INPUT_LENGTH / 5),
        '/*!*/'.repeat(DEV_MAX_INPUT_LENGTH / 5),
        'a{'.repeat(DEV_MAX_INPUT_LENGTH / 4) + '}'.repeat(DEV_MAX_INPUT_LENGTH / 4),
        '('.repeat(DEV_MAX_INPUT_LENGTH),
        'x '.repeat(DEV_MAX_INPUT_LENGTH / 2),
      ];
      for (const convert of [(css: string) => cssMinify(css, 10_000_000), (css: string) => cssFormat(css, '\n', 10_000_000)]) {
        for (const input of inputs) {
          const started = Date.now();
          try {
            convert(input);
          } catch (error) {
            assert.ok(error instanceof DevInputError, String(error));
          }
          assert.ok(Date.now() - started < 5000, `${Date.now() - started} ms`);
        }
      }
    });
  });
});
