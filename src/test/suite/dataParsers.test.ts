import * as assert from 'assert';
import { DATA_MAX_DEPTH, DATA_MAX_INPUT_LENGTH, DataInputError } from '../../handler/dataCommon';
import { JsonSyntaxError, lineColumnAt, parseIni, parseJsonLike, parseProperties } from '../../handler/dataParsers';
import { parseToml } from '../../handler/tomlParser';

/** JSON text of a parsed value (prototype-less objects included). */
const json = (value: unknown): string => JSON.stringify(value);

const rejects = (parse: () => unknown, pattern?: RegExp): void => {
  assert.throws(parse, (error: unknown) => {
    assert.ok(error instanceof DataInputError, `expected DataInputError, got ${String(error)}`);
    if (pattern) {
      assert.match((error as Error).message, pattern);
    }
    return true;
  });
};

const LINE_SEPARATOR = String.fromCharCode(0x2028);
const NBSP = String.fromCharCode(0xa0);

suite('Data Parsers (DATA) Test Suite', () => {

  suite('parseJsonLike: strict JSON (DATA-019)', () => {
    test('accepts RFC 8259 JSON', () => {
      assert.strictEqual(json(parseJsonLike(' {"a":[1,-2.5e3,true,false,null,"x\\u0041\\n"]} ', 'json')), '{"a":[1,-2500,true,false,null,"xA\\n"]}');
      assert.strictEqual(json(parseJsonLike('"\\/"', 'json')), '"/"');
      assert.strictEqual(json(parseJsonLike('-0', 'json')), '0');
    });

    const invalid: [string, number, string][] = [
      ['{"a":1,}', 7, 'unexpected character "}"'],
      ['{"a":1', 6, 'unexpected end of input'],
      ['[1,]', 3, 'unexpected character "]"'],
      ["{'a':1}", 1, 'unexpected character "\'"'],
      ['{a:1}', 1, 'unexpected character "a"'],
      ['01', 0, 'leading zeros are not allowed'],
      ['1.', 2, 'unexpected end of input'],
      ['.5', 0, 'unexpected character "."'],
      ['+1', 0, 'unexpected character "+"'],
      ['"a\tb"', 2, 'control character in string (it must be escaped)'],
      ['"\\x41"', 1, 'invalid escape sequence'],
      ['[1] 2', 4, 'unexpected character "2" after the value'],
      ['// c\n1', 0, 'unexpected character "/"'],
      ['NaN', 0, 'unexpected character "N"'],
      ['tru', 0, 'unexpected character "t"'],
      ['', 0, 'unexpected end of input'],
    ];
    invalid.forEach(([text, offset, reason]) => {
      test(`rejects ${JSON.stringify(text)} at offset ${offset}`, () => {
        assert.throws(() => parseJsonLike(text, 'json'), (error: unknown) => {
          assert.ok(error instanceof JsonSyntaxError);
          assert.strictEqual(error.offset, offset);
          assert.strictEqual(error.reason, reason);
          return true;
        });
      });
    });

    test('messages give 1-based line and column (CRLF is one line break)', () => {
      assert.deepStrictEqual(lineColumnAt('a\r\nbc', 4), { line: 2, column: 2 });
      assert.deepStrictEqual(lineColumnAt('a\rb\nc', 4), { line: 3, column: 1 });
      assert.throws(() => parseJsonLike('{\n  "a": 1,\n}', 'json'), /^JsonSyntaxError: line 3, column 1: unexpected character "\}"$/);
    });
  });

  suite('parseJsonLike: JSONC / JSON5 (DATA-014)', () => {
    test('comments, trailing commas, unquoted / single-quoted / numeric keys', () => {
      const text = `{
        // line comment
        a: 1, /* block */ 'b': 'x', "c": [1, 2,],
        0x10: 'hex key', $d_1: true,
      }`;
      assert.strictEqual(json(parseJsonLike(text, 'json5')), '{"16":"hex key","a":1,"b":"x","c":[1,2],"$d_1":true}');
    });

    test('numbers: hexadecimal, leading / trailing decimal point, explicit sign', () => {
      assert.strictEqual(json(parseJsonLike('[0x1F, -0xa, .5, 5., +1, 1e3, -.5e-1]', 'json5')), '[31,-10,0.5,5,1,1000,-0.05]');
    });

    test('strings: JavaScript escapes and line continuations', () => {
      assert.strictEqual(parseJsonLike("'it\\'s \\x41\\v\\0 \\q'", 'json5'), "it's A\v\0 q");
      assert.strictEqual(parseJsonLike("'a\\\nb'", 'json5'), 'ab');
      assert.strictEqual(parseJsonLike("'a\\\r\nb'", 'json5'), 'ab');
      assert.strictEqual(parseJsonLike(`'a${LINE_SEPARATOR}b'`, 'json5'), `a${LINE_SEPARATOR}b`);
    });

    test('extra white space (NBSP, BOM, line separators)', () => {
      assert.strictEqual(json(parseJsonLike(`${String.fromCharCode(0xfeff)}{${NBSP}a:${LINE_SEPARATOR}1}`, 'json5')), '{"a":1}');
    });

    const invalid: [string, RegExp][] = [
      ['{a: Infinity}', /line 1, column 5: Infinity cannot be represented in JSON/],
      ['[-Infinity]', /Infinity cannot be represented in JSON/],
      ['NaN', /NaN cannot be represented in JSON/],
      ['{a: undefined}', /undefined cannot be represented in JSON/],
      ['{a: b}', /unexpected identifier "b"/],
      ['[1,,2]', /empty array elements are not supported/],
      ['{a: 1', /unexpected end of input/],
      ['/* open', /unterminated comment/],
      ["'abc", /unterminated string/],
      ["'a\nb'", /unterminated string/],
      ['010', /leading zeros are not allowed/],
      ['1e999', /too large/],
      ['{,}', /unexpected character/],
      ['{a: `x`}', /unexpected character "`"/],
      ['{[a]: 1}', /computed property names are not supported/],
      ['"\\1"', /invalid escape sequence/],
    ];
    invalid.forEach(([text, pattern]) => {
      test(`rejects ${JSON.stringify(text)}`, () => rejects(() => parseJsonLike(text, 'json5'), pattern));
    });
  });

  suite('parseJsonLike: JS object literal (DATA-028)', () => {
    test('literal values, template literals without substitutions, numeric separators', () => {
      const text = "{ a: 1_000, 'b': [true, null], c: `x\\`y`, d: 0o17, e: 0b11, f: \"q\", g: '\\u{1F600}' }";
      assert.strictEqual(json(parseJsonLike(text, 'js-object')), '{"a":1000,"b":[true,null],"c":"x`y","d":15,"e":3,"f":"q","g":"\u{1F600}"}');
      assert.strictEqual(parseJsonLike('`a\r\nb`', 'js-object'), 'a\nb');
    });

    const invalid: [string, RegExp][] = [
      ['{ a: foo() }', /unexpected identifier "foo"/],
      ['{ a: () => 1 }', /unexpected character "\("/],
      ['{ a: function () {} }', /unexpected identifier "function"/],
      ['{ a: `x${y}` }', /template literals with \$\{…\} are not supported/],
      ['{ ...x }', /unexpected character "\."/],
      ['[...x]', /spread elements are not supported/],
      ['{ a: 10n }', /BigInt literals cannot be represented in JSON/],
      ['{ a: new Date() }', /unexpected identifier "new"/],
      ['{ a: 1 } + 1', /after the value/],
      ['{ [k]: 1 }', /computed property names are not supported/],
      ['{ a: this }', /unexpected identifier "this"/],
      ['{ a: 1__0 }', /unexpected identifier|unexpected character/],
    ];
    invalid.forEach(([text, pattern]) => {
      test(`rejects ${JSON.stringify(text)}`, () => rejects(() => parseJsonLike(text, 'js-object'), pattern));
    });
  });

  suite('parseToml (DATA-006 / 037)', () => {
    test('tables, dotted keys, quoted keys and comments', () => {
      const text = [
        '# comment',
        'title = "TOML" # trailing comment',
        'site."google.com" = true',
        "'literal key' = 1",
        '',
        '[owner]',
        'name = "Tom"',
        '[a.b.c]',
        'd = 1',
        '[ a . "x y" ]',
        'e = 2',
      ].join('\n');
      assert.strictEqual(json(parseToml(text)),
        '{"title":"TOML","site":{"google.com":true},"literal key":1,"owner":{"name":"Tom"},"a":{"b":{"c":{"d":1}},"x y":{"e":2}}}');
    });

    test('arrays of tables with sub-tables', () => {
      const text = '[[fruits]]\nname = "apple"\n[fruits.physical]\ncolor = "red"\n[[fruits.varieties]]\nname = "fuji"\n\n[[fruits]]\nname = "banana"';
      assert.strictEqual(json(parseToml(text)),
        '{"fruits":[{"name":"apple","physical":{"color":"red"},"varieties":[{"name":"fuji"}]},{"name":"banana"}]}');
    });

    test('inline tables and multi-line arrays (trailing comma, comments)', () => {
      const text = 'point = { x = 1, y.z = 2 }\nempty = {}\nnums = [\n  1, # one\n  2,\n]\nmixed = [ "a", 1, [2], { b = 3 } ]';
      assert.strictEqual(json(parseToml(text)), '{"point":{"x":1,"y":{"z":2}},"empty":{},"nums":[1,2],"mixed":["a",1,[2],{"b":3}]}');
    });

    test('strings: basic escapes, literal, multi-line basic (line-ending backslash) and multi-line literal', () => {
      const text = [
        'a = "tab\\there \\"q\\" \\\\ \\u00e9 \\U0001F600"',
        "b = 'C:\\path\\x'",
        'c = """',
        'line1',
        'line2 \\',
        '    continued"""',
        "d = '''",
        'raw \\n',
        "two''''",
        'e = """a ""quoted"" b"""""',
      ].join('\n');
      const value = parseToml(text);
      assert.strictEqual(value.a, 'tab\there "q" \\ \u00e9 \u{1F600}');
      assert.strictEqual(value.b, 'C:\\path\\x');
      assert.strictEqual(value.c, 'line1\nline2 continued');
      assert.strictEqual(value.d, "raw \\n\ntwo'");
      assert.strictEqual(value.e, 'a ""quoted"" b""');
    });

    test('CRLF line breaks', () => {
      assert.strictEqual(json(parseToml('[a]\r\nb = 1\r\nc = """\r\nx\r\ny"""\r\n')), '{"a":{"b":1,"c":"x\\ny"}}');
    });

    test('integers, floats and booleans', () => {
      const text = 'a = +99\nb = -17\nc = 1_000\nd = 0xDEAD_beef\ne = 0o755\nf = 0b1101\ng = 3.14\nh = -0.01\ni = 5e+22\nj = 6.626e-34\nk = 1_000.5\nl = true\nm = false\nn = 9007199254740991\no = -9007199254740991\np = 1e06';
      assert.strictEqual(json(parseToml(text)),
        '{"a":99,"b":-17,"c":1000,"d":3735928559,"e":493,"f":13,"g":3.14,"h":-0.01,"i":5e+22,"j":6.626e-34,"k":1000.5,"l":true,"m":false,"n":9007199254740991,"o":-9007199254740991,"p":1000000}');
    });

    test('dates and times are kept as written', () => {
      const text = 'a = 1979-05-27T07:32:00Z\nb = 1979-05-27 07:32:00-07:00\nc = 1979-05-27T00:32:00.999999\nd = 1979-05-27\ne = 07:32:00\nf = 00:32:00.5\ng = 1979-05-27 # a date and a comment';
      assert.strictEqual(json(parseToml(text)),
        '{"a":"1979-05-27T07:32:00Z","b":"1979-05-27 07:32:00-07:00","c":"1979-05-27T00:32:00.999999","d":"1979-05-27","e":"07:32:00","f":"00:32:00.5","g":"1979-05-27"}');
    });

    test('an implicit table may be defined later once; dotted-key tables may get sub-tables', () => {
      assert.strictEqual(json(parseToml('[a.b]\nc = 1\n[a]\nd = 2')), '{"a":{"b":{"c":1},"d":2}}');
      assert.strictEqual(json(parseToml('[f]\napple.color = "red"\n[f.apple.texture]\nsmooth = true')),
        '{"f":{"apple":{"color":"red","texture":{"smooth":true}}}}');
    });

    const invalid: [string, string, RegExp][] = [
      ['duplicate key', 'a = 1\na = 2', /line 2: duplicate key "a"/],
      ['duplicate table', '[a]\n[a]', /line 2: "a" is already defined/],
      ['a table over a value', 'a = 1\n[a]', /line 2: "a" is already defined/],
      ['a table defined by dotted keys', '[f]\napple.color = 1\n[f.apple]', /line 3: "f.apple" is already defined/],
      ['extending a table with a dotted key', '[a.b]\nc = 1\n[a]\nb.d = 2', /line 4: "b" is already defined and cannot be extended with a dotted key/],
      ['extending an inline table', 'a = { b = 1 }\n[a.c]', /line 2: "a" is an inline table/],
      ['extending an inline table with a dotted key', 'a = { b = 1 }\na.c = 2', /cannot be extended with a dotted key/],
      ['extending a static array', 'a = [1]\n[[a]]', /line 2: "a" is already defined and is not an array of tables/],
      ['[x] over [[x]]', '[[a]]\n[a]', /array of tables and cannot be defined/],
      ['inf', 'a = inf', /line 1: inf cannot be represented in JSON/],
      ['nan', 'a = -nan', /-nan cannot be represented in JSON/],
      ['an integer outside the safe range', 'a = 9007199254740992', /outside/],
      ['a hexadecimal integer outside the safe range', 'a = 0xFFFFFFFFFFFFFFF', /outside/],
      ['leading zeros', 'a = 012', /invalid value "012"/],
      ['a bare string', 'a = hello', /invalid value "hello" \(strings must be quoted\)/],
      ['an unterminated string', 'a = "abc', /unterminated string/],
      ['an unterminated multi-line string', 'a = """abc', /unterminated multi-line string/],
      ['an unterminated array', 'a = [1, 2', /unexpected end of input/],
      ['an unterminated inline table', 'a = { b = 1', /unexpected end of input/],
      ['a line break in an inline table', 'a = { b = 1,\n c = 2 }', /./],
      ['a trailing comma in an inline table', 'a = { b = 1, }', /trailing comma/],
      ['a missing value', 'a =', /unexpected end of input/],
      ['a missing "="', 'a 1', /expected "="/],
      ['text after a value', 'a = 1 2', /expected the end of the line/],
      ['an invalid escape', 'a = "\\x41"', /invalid escape sequence/],
      ['a surrogate escape', 'a = "\\uD800"', /not a Unicode scalar value/],
      ['an invalid month', 'a = 2020-13-01', /invalid date/],
      ['an invalid hour', 'a = 24:00:00', /invalid time/],
      ['a control character', 'a = "x\u0001"', /control characters must be escaped/],
      ['an unclosed header', '[a', /expected "\]"/],
      ['an empty bare key', '= 1', /expected a key/],
    ];
    invalid.forEach(([label, text, pattern]) => {
      test(`rejects ${label}`, () => rejects(() => parseToml(text), pattern));
    });
  });

  suite('parseIni (DATA-008)', () => {
    test('sections, comments, "=" and ":" separators, quotes', () => {
      const text = 'top = 1\n; comment\n# comment\n\n[db]\nhost = x\nport: 5432\nname = "my db"\nurl = a=b\n[ other ]\nk = \'v\'\n[db]\nuser=u';
      assert.strictEqual(json(parseIni(text)),
        '{"top":"1","db":{"host":"x","port":"5432","name":"my db","url":"a=b","user":"u"},"other":{"k":"v"}}');
    });

    test('a repeated key wins; CRLF', () => {
      assert.strictEqual(json(parseIni('[a]\r\nk=1\r\nk=2\r\n')), '{"a":{"k":"2"}}');
    });

    const invalid: [string, RegExp][] = [
      ['just text', /line 1: expected key=value/],
      ['[db\nhost=x', /line 1: a section header must end with "\]"/],
      ['[]', /the section name is empty/],
      ['=1', /the key is empty/],
      ['db=1\n[db]', /line 2: the section "db" has the same name as a key/],
    ];
    invalid.forEach(([text, pattern]) => {
      test(`rejects ${JSON.stringify(text)}`, () => rejects(() => parseIni(text), pattern));
    });
  });

  suite('parseProperties (DATA-010)', () => {
    test('separators, comments, continuations and escapes', () => {
      const text = [
        '# comment',
        '! comment',
        'a.b = 1',
        'a.c:2',
        'a.d 3',
        'key\\ with\\ spaces = v',
        'multi = one \\',
        '    two',
        'esc = tab\\there\\u0041\\n',
        'empty',
      ].join('\n');
      assert.strictEqual(json(parseProperties(text)),
        '{"a":{"b":"1","c":"2","d":"3"},"key with spaces":"v","multi":"one two","esc":"tab\\thereA\\n","empty":""}');
    });

    test('name[n] becomes an array; a repeated key wins', () => {
      assert.strictEqual(json(parseProperties('list[0]=a\nlist[1].x=b\nlist[1].y=c\nk=1\nk=2')), '{"list":["a",{"x":"b","y":"c"}],"k":"2"}');
    });

    const invalid: [string, RegExp][] = [
      ['a=1\na.b=2', /line 2: the key "a.b" is used both as a value and as a parent/],
      ['a.b=2\na=1', /line 2: the key "a" is used both as a value and as a parent/],
      ['a..b=1', /cannot be nested/],
      ['a[1]=x', /skips an element/],
      ['a[0]=x\na.b=y', /used both as a value and as a parent/],
      ['k=\\u12', /invalid \\u escape/],
      ['=v', /the key is empty/],
    ];
    invalid.forEach(([text, pattern]) => {
      test(`rejects ${JSON.stringify(text)}`, () => rejects(() => parseProperties(text), pattern));
    });
  });

  suite('limits and prototype pollution', () => {
    const deepJson = (levels: number) => `${'['.repeat(levels)}${']'.repeat(levels)}`;

    test(`nesting deeper than ${DATA_MAX_DEPTH} is an error in every parser`, () => {
      assert.doesNotThrow(() => parseJsonLike(deepJson(DATA_MAX_DEPTH), 'json5'));
      rejects(() => parseJsonLike(deepJson(DATA_MAX_DEPTH + 1), 'json5'), /nesting is too deep \(limit: 500\)/);
      rejects(() => parseJsonLike(deepJson(DATA_MAX_DEPTH + 1), 'js-object'), /nesting is too deep/);
      rejects(() => parseJsonLike(deepJson(100_000), 'json'), /nesting is too deep/);
      // The table that holds `a` is the first level.
      assert.doesNotThrow(() => parseToml(`a = ${deepJson(DATA_MAX_DEPTH - 1)}`));
      rejects(() => parseToml(`a = ${deepJson(DATA_MAX_DEPTH)}`), /nesting is too deep/);
      rejects(() => parseToml(`a = ${'{ b = '.repeat(600)}1${' }'.repeat(600)}`), /nesting is too deep/);
      rejects(() => parseToml(`[${Array(DATA_MAX_DEPTH + 1).fill('a').join('.')}]`), /nesting is too deep/);
      rejects(() => parseProperties(`${Array(DATA_MAX_DEPTH + 1).fill('a').join('.')}=1`), /nesting is too deep/);
    });

    test(`input longer than ${DATA_MAX_INPUT_LENGTH.toLocaleString('en-US')} characters is an error`, () => {
      const long = ' '.repeat(DATA_MAX_INPUT_LENGTH) + '1';
      rejects(() => parseJsonLike(long, 'json5'), /the selection is longer than 5,000,000 characters/);
      rejects(() => parseToml(long), /longer than/);
      rejects(() => parseIni(long), /longer than/);
      rejects(() => parseProperties(long), /longer than/);
    });

    test('__proto__, constructor and prototype are ordinary keys and Object.prototype is untouched', () => {
      const values = [
        parseJsonLike('{"__proto__": {"polluted": 1}, "constructor": {"prototype": {"polluted": 2}}}', 'json5'),
        parseJsonLike("{ __proto__: { polluted: 1 }, constructor: { prototype: { polluted: 2 } } }", 'js-object'),
        parseToml('__proto__.polluted = 1\n[constructor.prototype]\npolluted = 2'),
        parseIni('__proto__=1\n[constructor]\nprototype=2'),
        parseProperties('__proto__.polluted=1\nconstructor.prototype.polluted=2'),
      ];
      values.forEach((value) => {
        assert.ok(json(value).includes('"__proto__"'), json(value));
        assert.ok(json(value).includes('"constructor"'), json(value));
      });
      assert.strictEqual(({} as Record<string, unknown>).polluted, undefined);
      assert.strictEqual(Object.prototype.hasOwnProperty.call(Object.prototype, 'polluted'), false);
    });
  });
});
