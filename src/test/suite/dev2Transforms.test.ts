import * as assert from 'assert';
import { removeJsComments, RUST_MAX_HASHES, toCSharpVerbatimString, toHeredoc, toRustRawString } from '../../handler/dev2Code';
import { colorContrastRatio, colorInvert, contrastLevel, hexToOklch } from '../../handler/dev2Color';
import { cssSortProperties, cssToJsObject, jsObjectToCss } from '../../handler/dev2Css';
import { jsonToCSharpClass, jsonToKotlinDataClass, jsonToRustStruct, jsonToSwiftCodable, jsonToZod } from '../../handler/dev2JsonTypes';
import { HTTP_STATUS_PHRASES, httpStatusDescribe, MIME_TYPES, mimeTypeLookup } from '../../handler/dev2Lookup';
import { cidrInfo, ipToInteger, ipv6Compress, ipv6Expand, uuidNormalize } from '../../handler/dev2Network';
import { DEV2_COMMAND_ENTRIES } from '../../handler/dev2Transforms';
import { DEV_MAX_INPUT_LENGTH, DEV_MAX_NESTING, DevInputError } from '../../handler/devCommon';
import { sqlLowercaseKeywords, sqlUppercaseKeywords } from '../../handler/devSql';
import { EncOutputTooLargeError, MAX_OUTPUT_LENGTH } from '../../handler/encodeTransforms';
import { DEV2_EXAMPLES } from './dev2Examples';

const BUDGET = MAX_OUTPUT_LENGTH;

const lines = (...values: string[]): string => values.join('\n');

/** Asserts that `run` throws a DevInputError whose message matches `pattern`. */
const assertInputError = (run: () => unknown, pattern: RegExp): void => {
  assert.throws(run, (error: unknown) => error instanceof DevInputError && pattern.test(error.message));
};

suite('Extended Developer Transforms (DEVX-001..023) Test Suite', () => {

  test('every showcase example (through the command table)', () => {
    for (const entry of DEV2_COMMAND_ENTRIES) {
      const example = DEV2_EXAMPLES[entry.id];
      assert.strictEqual(entry.transform(example.input, { eol: '\n' }, BUDGET), example.expected, entry.id);
      assert.strictEqual(entry.output, 'new-tab', entry.id);
    }
  });

  test('only the three literal commands (DEVX-014..016) accept blank selections; nothing asks a question', () => {
    for (const entry of DEV2_COMMAND_ENTRIES) {
      assert.strictEqual(entry.acceptsBlank, ['DEVX-014', 'DEVX-015', 'DEVX-016'].includes(entry.id), entry.id);
      assert.strictEqual(entry.quickPick, undefined, entry.id);
    }
  });

  test('the input limit applies to every command', () => {
    const long = 'a'.repeat(DEV_MAX_INPUT_LENGTH + 1);
    for (const entry of DEV2_COMMAND_ENTRIES) {
      assertInputError(() => entry.transform(long, { eol: '\n' }, BUDGET), /longer than 1,000,000 characters/);
    }
  });

  suite('JSON to types (DEVX-001..005)', () => {
    test('Rust: serde use line, derive, snake_case with rename, raw identifiers, Option and serde_json::Value', () => {
      const json = '[{"userId":1,"type":"a","self":true,"price":1.5,"tags":["x"],"meta":{"a b":null},"mixed":[1,"a"],"$\\"\\\\\\n":0},{"userId":2}]';
      assert.strictEqual(jsonToRustStruct(json, '\n', BUDGET), lines(
        'use serde::{Deserialize, Serialize};',
        '',
        '#[derive(Serialize, Deserialize)]',
        'struct Root {',
        '    #[serde(rename = "userId")]',
        '    user_id: i64,',
        '    r#type: Option<String>,',
        '    #[serde(rename = "self")]',
        '    self_: Option<bool>,',
        '    price: Option<f64>,',
        '    tags: Option<Vec<String>>,',
        '    meta: Option<Meta>,',
        '    mixed: Option<Vec<serde_json::Value>>,',
        '    #[serde(rename = "$\\"\\\\\\n")]',
        '    field: Option<i64>,',
        '}',
        '',
        '#[derive(Serialize, Deserialize)]',
        'struct Meta {',
        '    #[serde(rename = "a b")]',
        '    a_b: serde_json::Value,',
        '}',
      ));
    });

    test('Rust: digits, non-ASCII keys and colliding names get safe unique identifiers; CRLF follows the EOL', () => {
      const result = jsonToRustStruct('{"1st":1,"名前":2,"a-b":3,"a_b":4,"Option":{"x":1}}', '\r\n', BUDGET);
      assert.strictEqual(result, [
        'use serde::{Deserialize, Serialize};',
        '',
        '#[derive(Serialize, Deserialize)]',
        'struct Root {',
        '    #[serde(rename = "1st")]',
        '    _1_st: i64,',
        '    #[serde(rename = "名前")]',
        '    field: i64,',
        '    #[serde(rename = "a-b")]',
        '    a_b: i64,',
        '    #[serde(rename = "a_b")]',
        '    a_b2: i64,',
        '    #[serde(rename = "Option")]',
        '    option: Option2,',
        '}',
        '',
        '#[derive(Serialize, Deserialize)]',
        'struct Option2 {',
        '    x: i64,',
        '}',
      ].join('\r\n'));
      for (const name of [...result.matchAll(/^ {4}(?:r#)?([^:#\s]+):/gm)].map((match) => match[1])) {
        assert.match(name, /^[a-z_][a-z0-9_]*$/, name);
      }
    });

    test('Rust and Swift refuse a key with a lone surrogate; Kotlin and C# escape it', () => {
      const json = '{"\\ud800":1}';
      assertInputError(() => jsonToRustStruct(json, '\n', BUDGET), /lone surrogate, which a Rust string cannot hold/);
      assertInputError(() => jsonToSwiftCodable(json, '\n', BUDGET), /lone surrogate, which a Swift string cannot hold/);
      assert.ok(jsonToKotlinDataClass(json, '\n', BUDGET).includes('@SerialName("\\uD800")'));
      assert.ok(jsonToCSharpClass(json, '\n', BUDGET).includes('[JsonPropertyName("\\uD800")]'));
    });

    test('Kotlin: every class @Serializable, SerialName only when needed (with its import), keywords, JsonElement, defaults', () => {
      const json = '[{"user_id":1,"class":"x","$p":null,"o":{},"m":[1,"a"]},{"user_id":2,"o":{}}]';
      assert.strictEqual(jsonToKotlinDataClass(json, '\n', BUDGET), lines(
        'import kotlinx.serialization.SerialName',
        'import kotlinx.serialization.Serializable',
        'import kotlinx.serialization.json.JsonElement',
        '',
        '@Serializable',
        'data class Root(',
        '    @SerialName("user_id") val userId: Long,',
        '    val `class`: String? = null,',
        '    @SerialName("\\$p") val p: JsonElement? = null,',
        '    val o: O,',
        '    val m: List<JsonElement>? = null,',
        ')',
        '',
        '@Serializable',
        'class O',
      ));
      const plain = jsonToKotlinDataClass('{"a":1,"b":{"c":"x"}}', '\n', BUDGET);
      assert.ok(!plain.includes('SerialName'), 'no SerialName import when no name changes');
      assert.strictEqual(plain.split('@Serializable').length - 1, 2, 'every class is @Serializable');
      assert.ok(jsonToKotlinDataClass('{"a":"\\"$\\\\"}', '\n', BUDGET).includes('val a: String'));
      assert.ok(jsonToKotlinDataClass('{"a b":"x"}', '\n', BUDGET).includes('(@SerialName("a b") val aB: String)'));
    });

    test('C#: JsonPropertyName on every property, usings as needed, PascalCase, class-name clash, nullable', () => {
      const json = '[{"root":1,"tags":["a"],"m":[1,"a"],"o":{"x":null},"say \\"hi\\"":true},{"root":2}]';
      assert.strictEqual(jsonToCSharpClass(json, '\n', BUDGET), lines(
        'using System.Collections.Generic;',
        'using System.Text.Json;',
        'using System.Text.Json.Serialization;',
        '',
        'public class Root',
        '{',
        '    [JsonPropertyName("root")]',
        '    public long Root_ { get; set; }',
        '',
        '    [JsonPropertyName("tags")]',
        '    public List<string>? Tags { get; set; }',
        '',
        '    [JsonPropertyName("m")]',
        '    public List<JsonElement>? M { get; set; }',
        '',
        '    [JsonPropertyName("o")]',
        '    public O? O { get; set; }',
        '',
        '    [JsonPropertyName("say \\"hi\\"")]',
        '    public bool? SayHi { get; set; }',
        '}',
        '',
        'public class O',
        '{',
        '    [JsonPropertyName("x")]',
        '    public JsonElement? X { get; set; }',
        '}',
      ));
      const named = jsonToCSharpClass('{"user_id":1,"userId":2,"__proto__":3,"2":4}', '\n', BUDGET);
      assert.ok(named.includes('public long UserId { get; set; }'), named);
      assert.ok(named.includes('public long UserId2 { get; set; }'), named);
      assert.ok(named.includes('[JsonPropertyName("__proto__")]\n    public long Proto { get; set; }'), named);
      assert.ok(named.includes('[JsonPropertyName("2")]\n    public long _2 { get; set; }'), named);
    });

    test('Zod: single line when short, multi-line otherwise, unions, nullable, optional, empty arrays and safe keys', () => {
      assert.strictEqual(jsonToZod('{"a":"x","b":true,"c":null,"d":[]}', '\n', BUDGET),
        // On one line it would be 82 characters.
        lines('z.object({', '  a: z.string(),', '  b: z.boolean(),', '  c: z.null(),', '  d: z.array(z.unknown()),', '})'));
      assert.strictEqual(jsonToZod('{"a":"x","b":true,"c":null}', '\n', BUDGET), 'z.object({ a: z.string(), b: z.boolean(), c: z.null() })');
      const json = '[{"__proto__":1,"a-b":[1,"x",null],"n":{"deep":{"x":1.5}},"constructor":"c","long_key_number_one":"aaaaaaaa"},{"__proto__":2}]';
      assert.strictEqual(jsonToZod(json, '\r\n', BUDGET), [
        'z.object({',
        '  [\'__proto__\']: z.number(),',
        '  \'a-b\': z.array(z.union([z.string(), z.number()]).nullable()).optional(),',
        '  n: z.object({ deep: z.object({ x: z.number() }) }).optional(),',
        '  constructor: z.string().optional(),',
        '  long_key_number_one: z.string().optional(),',
        '})',
      ].join('\r\n'));
      assert.strictEqual(jsonToZod('{"\'":1,"\\n":2}', '\n', BUDGET), 'z.object({ \'\\\'\': z.number(), \'\\n\': z.number() })');
      assert.strictEqual(jsonToZod('{}', '\n', BUDGET), 'z.object({})');
      assert.strictEqual(jsonToZod('{"a":[1,{"b":1}]}', '\n', BUDGET), 'z.object({ a: z.array(z.union([z.number(), z.object({ b: z.number() })])) })');
    });

    test('Zod: nested multi-line objects, arrays and unions keep their prefixes, suffixes and indentation', () => {
      const long = 'x'.repeat(70);
      const json = `[{"list":[{"${long}":1,"b":"y"}],"u":[1,{"${long}":true}],"o":{"p":{"${long}":null}}},{"u":null}]`;
      assert.strictEqual(jsonToZod(json, '\n', BUDGET), lines(
        'z.object({',
        '  list: z.array(z.object({',
        `    ${long}: z.number(),`,
        '    b: z.string(),',
        '  })).optional(),',
        '  u: z.array(z.union([',
        '    z.number(),',
        '    z.object({',
        `      ${long}: z.boolean(),`,
        '    }),',
        '  ])).nullable(),',
        '  o: z.object({',
        '    p: z.object({',
        `      ${long}: z.null(),`,
        '    }),',
        '  }).optional(),',
        '})',
      ));
    });

    test('Zod: the output limit is checked line by line, so a deep and wide input fails fast', () => {
      // About 1 MB of input: 199 nested objects and 90,000 keys at the bottom. The schema would be
      // far over the output limit (each bottom line is indented by about 400 spaces).
      const keys = Array.from({ length: 90_000 }, (_, i) => `"k${i}":1`).join(',');
      const json = `${'{"a":'.repeat(199)}{${keys}}${'}'.repeat(199)}`;
      assert.ok(json.length < DEV_MAX_INPUT_LENGTH);
      const started = Date.now();
      assert.throws(() => jsonToZod(json, '\n', BUDGET), EncOutputTooLargeError);
      assert.ok(Date.now() - started < 1500, `took ${Date.now() - started} ms`);
      // A small budget stops at the first line that does not fit.
      assert.throws(() => jsonToZod('{"a":{"b":{"c":"' + 'x'.repeat(100) + '"}}}', '\n', 30), EncOutputTooLargeError);
    });

    test('Swift: CodingKeys list every property when a name changes; keywords in backquotes; optional', () => {
      assert.strictEqual(jsonToSwiftCodable('[{"user_id":1,"default":"x","o":{"a":true}},{"user_id":2,"default":"y"}]', '\n', BUDGET), lines(
        'struct Root: Codable {',
        '    let userId: Int',
        '    let `default`: String',
        '    let o: O?',
        '',
        '    enum CodingKeys: String, CodingKey {',
        '        case userId = "user_id"',
        '        case `default`',
        '        case o',
        '    }',
        '}',
        '',
        'struct O: Codable {',
        '    let a: Bool',
        '}',
      ));
      assert.ok(!jsonToSwiftCodable('{"a":1,"b":[1.5]}', '\n', BUDGET).includes('CodingKeys'));
      assert.ok(jsonToSwiftCodable('{"a\\"b":1}', '\n', BUDGET).includes('case aB = "a\\"b"'));
    });

    test('Swift: self and init get a trailing _ (backquotes would not make them readable), mapped back by CodingKeys', () => {
      assert.strictEqual(jsonToSwiftCodable('{"self":1,"init":"x","Self":true,"self_":2}', '\n', BUDGET), lines(
        'struct Root: Codable {',
        '    let self_: Int',
        '    let init_: String',
        '    let self_2: Bool',
        '    let self_3: Int',
        '',
        '    enum CodingKeys: String, CodingKey {',
        '        case self_ = "self"',
        '        case init_ = "init"',
        '        case self_2 = "Self"',
        '        case self_3 = "self_"',
        '    }',
        '}',
      ));
    });

    test('Swift: values of different types, null alone and empty arrays are errors (nothing is guessed)', () => {
      assertInputError(() => jsonToSwiftCodable('{"a":[1,"x"]}', '\n', BUDGET), /"a" has values of different types \(or only null\)/);
      assertInputError(() => jsonToSwiftCodable('{"a":null}', '\n', BUDGET), /"a" has values of different types \(or only null\)/);
      assertInputError(() => jsonToSwiftCodable('{"a":[]}', '\n', BUDGET), /"a" has an empty array/);
      assert.ok(jsonToSwiftCodable('{"a":1.5,"b":2}', '\n', BUDGET).includes('let a: Double'));
    });

    test('invalid JSON, a non-object root, too deep nesting and the output budget', () => {
      const all = [jsonToRustStruct, jsonToKotlinDataClass, jsonToCSharpClass, jsonToZod, jsonToSwiftCodable];
      for (const convert of all) {
        assertInputError(() => convert('{a:1}', '\n', BUDGET), /not valid JSON/);
        assertInputError(() => convert('[1,2]', '\n', BUDGET), /must be an object or an array of objects/);
        const deep = `${'{"a":'.repeat(DEV_MAX_NESTING + 1)}1${'}'.repeat(DEV_MAX_NESTING + 1)}`;
        assertInputError(() => convert(deep, '\n', BUDGET), /nested deeper than 200 levels/);
        assert.throws(() => convert('{"a":1,"b":2}', '\n', 20), EncOutputTooLargeError);
      }
    });

    test('the generated code is text only: keys never become code (quotes, backslashes and line breaks are escaped)', () => {
      const key = '"); drop(); //\n';
      const json = JSON.stringify({ [key]: 1 });
      assert.ok(jsonToRustStruct(json, '\n', BUDGET).includes('#[serde(rename = "\\"); drop(); //\\n")]'));
      assert.ok(jsonToKotlinDataClass(json, '\n', BUDGET).includes('@SerialName("\\"); drop(); //\\n")'));
      assert.ok(jsonToCSharpClass(json, '\n', BUDGET).includes('[JsonPropertyName("\\"); drop(); //\\n")]'));
      assert.ok(jsonToSwiftCodable(json, '\n', BUDGET).includes('= "\\"); drop(); //\\n"'));
      assert.ok(jsonToZod(json, '\n', BUDGET).includes('\'"); drop(); //\\n\': z.number()'));
    });
  });

  suite('SQL (DEVX-006)', () => {
    test('lowercases the keywords DEV-017 uppercases; strings, quoted names and comments are kept', () => {
      const sql = 'SELECT "FROM", \'WHERE\' FROM T -- SELECT\nWHERE A = 1 /* AND */ AND t.DATE IS NULL';
      assert.strictEqual(sqlLowercaseKeywords(sql), 'select "FROM", \'WHERE\' from T -- SELECT\nwhere A = 1 /* AND */ and t.DATE is null');
      assert.strictEqual(sqlLowercaseKeywords(sqlUppercaseKeywords('select a from b')), 'select a from b');
    });
  });

  suite('colors (DEVX-007..009)', () => {
    test('OKLCH: known values, grays, alpha, short forms and line by line', () => {
      assert.strictEqual(hexToOklch(lines('#ff0000', '  #FFF', '000', '', '#00ff0080', '#808080', '#0000ff'), BUDGET), lines(
        'oklch(62.8% 0.258 29.23)', '  oklch(100% 0 0)', 'oklch(0% 0 0)', '', 'oklch(86.6% 0.295 142.5 / 0.5)', 'oklch(60% 0 0)',
        'oklch(45.2% 0.313 264.05)'));
      assertInputError(() => hexToOklch(lines('#fff', 'red'), BUDGET), /line 2: "red" is not a hex color/);
    });

    test('contrast ratio: the WCAG levels and their boundaries; the ratio is cut, never rounded up', () => {
      assert.strictEqual(colorContrastRatio(lines('#000000 #ffffff', '#fff, #000', '#767676 #ffffff', '#777 #fff', '#949494,#fff', '#fff #fff'), BUDGET),
        lines('21:1 (AAA)', '21:1 (AAA)', '4.54:1 (AA)', '4.47:1 (AA Large)', '3.03:1 (AA Large)', '1:1 (Fail)'));
      assert.deepStrictEqual([7, 6.99, 4.5, 4.49, 3, 2.99].map(contrastLevel), ['AAA', 'AA', 'AA', 'AA Large', 'AA Large', 'Fail']);
      assertInputError(() => colorContrastRatio('#000000', BUDGET), /two hex colors/);
      assertInputError(() => colorContrastRatio('#00000080 #fff', BUDGET), /two hex colors/);
      assertInputError(() => colorContrastRatio('#000 #fff #888', BUDGET), /two hex colors/);
    });

    test('invert: digits, #, alpha and case are kept', () => {
      assert.strictEqual(colorInvert(lines('#112233', 'ABC', '#AbCdEf80', '#fff8', '#000000FF'), BUDGET),
        lines('#eeddcc', '543', '#54321080', '#0008', '#FFFFFFFF'));
      assertInputError(() => colorInvert('#12345', BUDGET), /not a hex color/);
    });
  });

  suite('CSS (DEVX-010..012)', () => {
    test('sort: the layout stays, comments before a declaration move with it, nested rules and statements end a run', () => {
      const css = lines(
        'a {',
        '  z-index: 1;',
        '  /* note */ color: red;',
        '  @media (min-width: 1px) { b: 1; A: 2 }',
        '  background: url(a;b) ;',
        '  align: "x;y";',
        '}',
        '@import "z";',
        'b{y:1;x:2}',
      );
      assert.strictEqual(cssSortProperties(css, BUDGET), lines(
        'a {',
        '  /* note */ color: red;',
        '  z-index: 1;',
        '  @media (min-width: 1px) { A: 2; b: 1 }',
        '  align: "x;y" ;',
        '  background: url(a;b);',
        '}',
        '@import "z";',
        'b{x:2;y:1}',
      ));
      assert.strictEqual(cssSortProperties('color: red; --b: 1; align-items: center;', BUDGET), '--b: 1; align-items: center; color: red;');
      assert.strictEqual(cssSortProperties('a{b:1;a:1;b:0;a:0}', BUDGET), 'a{a:1;a:0;b:1;b:0}', 'stable');
      assertInputError(() => cssSortProperties('a{b:1', BUDGET), /a \{ is not closed/);
    });

    test('sort: a comment after the ; at the end of the same line stays with its declaration', () => {
      assert.strictEqual(cssSortProperties('{\n  b: 1; /* about b */\n  a: 2;\n}', BUDGET), '{\n  a: 2;\n  b: 1; /* about b */\n}');
      assert.strictEqual(cssSortProperties(lines(
        'p {',
        '  z: 1; /* z1 */ /* z2 */',
        '  /* before y */',
        '  y: 2;   /* y */',
        '  x: 3; /* x',
        '     more */',
        '}',
      ), BUDGET), lines(
        'p {',
        '  x: 3; /* x',
        '     more */',
        '  /* before y */',
        '  y: 2;   /* y */',
        '  z: 1; /* z1 */ /* z2 */',
        '}',
      ));
      // The last declaration has no ;: the comment goes before the spaces of its new place.
      assert.strictEqual(cssSortProperties('{ b: 1; /* about b */\n a: 2 }', BUDGET), '{ a: 2;\n b: 1 /* about b */ }');
      assert.strictEqual(cssSortProperties('{c:1; /* c */}', BUDGET), '{c:1; /* c */}');
      assert.strictEqual(cssSortProperties('b: 1; /* b */\r\na: 2; /* a */', BUDGET), 'a: 2; /* a */\r\nb: 1; /* b */');
      // Code after the comment on the same line: the comment comes before that declaration and moves with it.
      assert.strictEqual(cssSortProperties('a{z:1; /* z */ y:2}', BUDGET), 'a{/* z */ y:2; z:1}');
    });

    test('CSS to style object: camelCase, vendor prefixes, custom properties and escaped values (never evaluated)', () => {
      assert.strictEqual(cssToJsObject('{ -webkit-transition: a; -ms-transform: b; --main-color: #fff; FONT-SIZE: 1px }', BUDGET),
        '{ WebkitTransition: \'a\', msTransform: \'b\', \'--main-color\': \'#fff\', fontSize: \'1px\' }');
      assert.strictEqual(cssToJsObject('content: "it\'s \\\\ </script>" !important; /* c */ margin: 0 /* x */ auto;', BUDGET),
        '{ content: \'"it\\\'s \\\\\\\\ </script>" !important\', margin: \'0 auto\' }');
      assert.strictEqual(cssToJsObject('background: url(a;b); grid-template-areas:\n  "a"\n  "b"', BUDGET),
        '{ background: \'url(a;b)\', gridTemplateAreas: \'"a" "b"\' }');
      assertInputError(() => cssToJsObject('a { color: red }', BUDGET), /nested block/);
      assertInputError(() => cssToJsObject('color red', BUDGET), /not a declaration/);
      assertInputError(() => cssToJsObject('col$r: red', BUDGET), /not a CSS property name/);
      assertInputError(() => cssToJsObject(';;', BUDGET), /no declarations/);
    });

    test('CSS to style object: a property written twice is one key with the last value, in the first place', () => {
      assert.strictEqual(cssToJsObject('color: red; margin: 0; COLOR: blue; --x: 1; --x: 2', BUDGET),
        '{ color: \'blue\', margin: \'0\', \'--x\': \'2\' }');
      assert.strictEqual(cssToJsObject('--X: 1; --x: 2', BUDGET), '{ \'--X\': \'1\', \'--x\': \'2\' }', 'custom properties are case-sensitive');
      assert.strictEqual(cssToJsObject('a: 1; a: 2', 16), '{ a: \'2\' }', 'the budget counts the result, not the replaced values');
    });

    test('style object to CSS: kebab-case, numbers without units, EOL; values that would break a declaration are refused', () => {
      assert.strictEqual(jsObjectToCss('{ WebkitTransition: \'a\', msTransform: "b", \'--x\': 1, zIndex: 2, \'font-size\': `3px`, margin: -1.5 }', '\r\n', BUDGET),
        ['-webkit-transition: a;', '-ms-transform: b;', '--x: 1;', 'z-index: 2;', 'font-size: 3px;', 'margin: -1.5;'].join('\r\n'));
      assertInputError(() => jsObjectToCss('{ content: \'"a;b"\' }', '\n', BUDGET), /holds ; \{ \} or a line break/);
      for (const [value, reason] of [
        ['red; x: y', /holds ; \{ \} or a line break/], ['a}', /holds ; \{ \} or a line break/], ['a\\nb', /holds ; \{ \} or a line break/],
        ['a /* b', /comment marker/], ['red\\\\', /ends with a backslash/], ['"abc', /not closed/], ['calc(1px', /bracket that is not closed/],
        ['a)', /bracket that does not match/], ['', /is empty/],
      ] as [string, RegExp][]) {
        assertInputError(() => jsObjectToCss(`{ color: '${value}' }`, '\n', BUDGET), reason);
      }
      assert.strictEqual(jsObjectToCss('{ content: \'"\\\\201C"\' }', '\n', BUDGET), 'content: "\\201C";');
      assertInputError(() => jsObjectToCss('{ a: { b: 1 } }', '\n', BUDGET), /must be a string or a number/);
      assertInputError(() => jsObjectToCss('{ a: true }', '\n', BUDGET), /must be a string or a number/);
      assertInputError(() => jsObjectToCss('{ a: null }', '\n', BUDGET), /must be a string or a number/);
      assertInputError(() => jsObjectToCss('[1]', '\n', BUDGET), /must be a JavaScript object/);
      assertInputError(() => jsObjectToCss('{}', '\n', BUDGET), /no properties/);
      assertInputError(() => jsObjectToCss('{ a: alert(1) }', '\n', BUDGET), /not a JavaScript object literal/);
      assertInputError(() => jsObjectToCss('{ \'a b\': 1 }', '\n', BUDGET), /not a style property name/);
      assertInputError(() => jsObjectToCss('{ "__proto__": "x" }', '\n', BUDGET), /"__proto__" is not a style property name/);
      assert.strictEqual(jsObjectToCss('{ constructor: "y", toString: "z" }', '\n', BUDGET), 'constructor: y;\nto-string: z;');
    });
  });

  suite('remove JS / TS comments (DEVX-013)', () => {
    const remove = (text: string) => removeJsComments(text, BUDGET);

    test('strings, regular expressions and template literals are never changed', () => {
      const code = 'const s = "// a /* b */"; const r = /\\/\\/*x/g; const t = `\n\n// c\n/* d */`; // e';
      assert.strictEqual(remove(code), 'const s = "// a /* b */"; const r = /\\/\\/*x/g; const t = `\n\n// c\n/* d */`;');
    });

    test('the spaces left at the end of a line after a removed comment are dropped; other spaces stay', () => {
      assert.strictEqual(remove('a = 1; // x'), 'a = 1;');
      assert.strictEqual(remove('a = 1;   /* x */  \nb = 2; /* y */ // z\r\nc = 3;'), 'a = 1;\nb = 2;\r\nc = 3;');
      assert.strictEqual(remove('x = a /* c */ - b;  '), 'x = a  - b;  ', 'spaces before code and spaces of a line whose comment is not last stay');
      assert.strictEqual(remove('  f(); /* a\n  b */  g();'), '  f();\n  g();');
      assert.strictEqual(remove('const s = "a  "; // x'), 'const s = "a  ";', 'spaces inside a string are code');
    });

    test('a block comment with line breaks keeps them, so ASI reads the code as before', () => {
      assert.strictEqual(remove('return /*\n*/ x'), 'return\n x');
      assert.strictEqual(remove('a /*\n*/ ++b'), 'a\n ++b');
      assert.strictEqual(remove('x /*\n*/ (y)'), 'x\n (y)');
      assert.strictEqual(remove('return /*\r\n\r\n*/ x'), 'return\r\n x', 'the lines left with only spaces in between go, one line break stays');
      assert.strictEqual(remove('a /* \u2028 */ b'), 'a\u2028 b');
      assert.strictEqual(remove('a /*\r*/ b'), 'a\r b');
      assert.strictEqual(remove('foo /*\n*/\n++b'), 'foo\n++b');
    });

    test('only lines that had a comment and are blank afterwards are removed; empty lines stay', () => {
      const code = lines('a();', '', '  // only a comment', '/**', ' * doc', ' */', 'b(); // after code', '   ', 'c(/* x */);', '\t/* y */  ', 'd();');
      assert.strictEqual(remove(code), lines('a();', '', 'b();', '   ', 'c();', 'd();'));
      assert.strictEqual(remove('a();\n\u3000\u00a0\ufeff/* only spaces of every kind around it */\u2003\nb();'), 'a();\nb();');
    });

    test('a removed comment between code that would join becomes one space', () => {
      assert.strictEqual(remove('a/**/b; +/**/+c; x/**//y/; f(/**/a/**/, /**/b/**/);'), 'a b; + +c; x /y/; f(a, b);');
      assert.strictEqual(remove('a/**//**/b'), 'a b');
      assert.strictEqual(remove('a /**/b'), 'a b');
    });

    test('a hashbang is kept; a comment-only last line is removed but the line break before it stays', () => {
      assert.strictEqual(remove('#!/usr/bin/env node\n// c\nrun();'), '#!/usr/bin/env node\nrun();');
      assert.strictEqual(remove('#!/usr/bin/env node /* not a comment */'), '#!/usr/bin/env node /* not a comment */');
      assert.strictEqual(remove('a();\n// end'), 'a();\n');
      assert.strictEqual(remove('a();\r\n/* end */'), 'a();\r\n');
      assert.strictEqual(remove('// only'), '');
      assert.strictEqual(remove('no comments\n'), 'no comments\n');
    });

    test('unclosed strings, comments and template literals are errors', () => {
      assertInputError(() => remove('a /* b'), /comment is not closed/);
      assertInputError(() => remove('"abc'), /string is not closed/);
      assertInputError(() => remove('`abc'), /template literal is not closed/);
    });
  });

  suite('literals (DEVX-014..016)', () => {
    test('C# verbatim string', () => {
      assert.strictEqual(toCSharpVerbatimString('C:\\a "b"\r\nc'), '@"C:\\a ""b""\r\nc"');
      assert.strictEqual(toCSharpVerbatimString('   '), '@"   "');
    });

    test('Rust raw string: the fewest # that cannot close it early, at most 255; a lone CR is refused', () => {
      assert.strictEqual(toRustRawString('ab\\n'), 'r"ab\\n"');
      assert.strictEqual(toRustRawString('say "hi"'), 'r#"say "hi""#');
      assert.strictEqual(toRustRawString('a"#b"###c'), 'r####"a"#b"###c"####');
      assert.strictEqual(toRustRawString('a\r\nb'), 'r"a\r\nb"');
      const most = `"${'#'.repeat(RUST_MAX_HASHES - 1)}`;
      assert.strictEqual(toRustRawString(most), `r${'#'.repeat(RUST_MAX_HASHES)}"${most}"${'#'.repeat(RUST_MAX_HASHES)}`);
      assertInputError(() => toRustRawString(`"${'#'.repeat(RUST_MAX_HASHES)}`), /more than 255 #/);
      assertInputError(() => toRustRawString('a\rb'), /carriage return/);
    });

    test('here-document: quoted delimiter, no clash with any line, LF only, a final line break added', () => {
      assert.strictEqual(toHeredoc('echo $X `id`', BUDGET), 'cat <<\'EOF\'\necho $X `id`\nEOF');
      assert.strictEqual(toHeredoc('EOF\nEOF_1\r\nx\n', BUDGET), 'cat <<\'EOF_2\'\nEOF\nEOF_1\nx\nEOF_2');
      assert.strictEqual(toHeredoc(' EOF\nEOF \n', BUDGET), 'cat <<\'EOF\'\n EOF\nEOF \nEOF');
      assertInputError(() => toHeredoc('a\rb', BUDGET), /carriage return/);
      assert.throws(() => toHeredoc('abc', 10), EncOutputTooLargeError);
      assert.strictEqual(toHeredoc('', BUDGET), 'cat <<\'EOF\'\nEOF', 'an empty text has no body line');
      assert.strictEqual(toHeredoc('\n', BUDGET), 'cat <<\'EOF\'\n\nEOF', 'one empty line stays one empty line');
    });
  });

  suite('lookups (DEVX-017..018)', () => {
    test('HTTP status: 61 IANA codes with a reason phrase and 418, current RFC 9110 wording', () => {
      assert.strictEqual(HTTP_STATUS_PHRASES.size, 62);
      assert.strictEqual(httpStatusDescribe(lines('200', ' 404 ', '413', '418', '422', '451', '511', '', '103'), BUDGET),
        lines('200 OK', ' 404 Not Found ', '413 Content Too Large', '418 I\'m a teapot', '422 Unprocessable Content',
          '451 Unavailable For Legal Reasons', '511 Network Authentication Required', '', '103 Early Hints'));
      for (const code of ['306', '509', '600', '099', '104', '4040', '40', 'abc', '+404']) {
        assertInputError(() => httpStatusDescribe(code, BUDGET), /registered reason phrase/);
      }
    });

    test('MIME type: extension, file name or path, any case; unknown extensions are errors', () => {
      assert.ok(MIME_TYPES.size >= 90, String(MIME_TYPES.size));
      assert.strictEqual(mimeTypeLookup(lines('report.pdf', '.PNG', 'json', 'C:\\docs\\a.tar.GZ', '/var/www/index.html', 'font.woff2'), BUDGET),
        lines('application/pdf', 'image/png', 'application/json', 'application/gzip', 'text/html', 'font/woff2'));
      for (const name of ['a.unknownext', 'a.', 'a.p-f', '__proto__', 'constructor', 'toString']) {
        assertInputError(() => mimeTypeLookup(name, BUDGET), /known MIME type/);
      }
    });
  });

  suite('UUID and network (DEVX-019..023)', () => {
    test('UUID: braces, URN, no hyphens, any case; misplaced hyphens are refused', () => {
      assert.strictEqual(uuidNormalize(lines('{550E8400E29B41D4A716446655440000}', 'urn:uuid:550E8400-E29B-41D4-A716-446655440000',
        'URN:UUID:550e8400e29b41d4a716446655440000', '{550e8400-e29b-41d4-a716-446655440000}'), BUDGET),
      lines(...Array<string>(4).fill('550e8400-e29b-41d4-a716-446655440000')));
      for (const value of ['550e8400-e29b41d4-a716-446655440000', '{550e8400e29b41d4a716446655440000', '550e8400e29b41d4a71644665544000g', 'urn:uuid:{550e8400e29b41d4a716446655440000}']) {
        assertInputError(() => uuidNormalize(value, BUDGET), /not a UUID/);
      }
    });

    test('CIDR: IPv4 /0 /24 /31 /32, host bits set, IPv6 /0 /32 /128; nothing listed', () => {
      assert.strictEqual(cidrInfo(lines('192.168.1.77/24', '10.0.0.5/31', '1.2.3.4/32', '0.0.0.0/0'), BUDGET), lines(
        'network 192.168.1.0 / broadcast 192.168.1.255 / first 192.168.1.1 / last 192.168.1.254 / hosts 254',
        'network 10.0.0.4 / first 10.0.0.4 / last 10.0.0.5 / hosts 2',
        'network 1.2.3.4 / first 1.2.3.4 / last 1.2.3.4 / hosts 1',
        'network 0.0.0.0 / broadcast 255.255.255.255 / first 0.0.0.1 / last 255.255.255.254 / hosts 4294967294',
      ));
      assert.strictEqual(cidrInfo(lines('2001:db8::1/32', '::/0', '::1/128'), BUDGET), lines(
        'network 2001:db8:: / last 2001:db8:ffff:ffff:ffff:ffff:ffff:ffff / addresses 79228162514264337593543950336',
        'network :: / last ffff:ffff:ffff:ffff:ffff:ffff:ffff:ffff / addresses 340282366920938463463374607431768211456',
        'network ::1 / last ::1 / addresses 1',
      ));
      for (const value of ['192.168.1.0', '192.168.1.0/33', '192.168.1.0/024', '256.0.0.0/8', '2001:db8::/129', 'fe80::1%eth0/64', 'a/8']) {
        assertInputError(() => cidrInfo(value, BUDGET), /not a CIDR block/);
      }
    });

    test('IPv6 expand and compress (RFC 5952: the longest run, the first of equal runs, no single-group ::)', () => {
      assert.strictEqual(ipv6Expand(lines('2001:db8::1', '::', '::ffff:1.2.3.4', 'FE80::1%eth0/64'), BUDGET), lines(
        '2001:0db8:0000:0000:0000:0000:0000:0001', '0000:0000:0000:0000:0000:0000:0000:0000',
        '0000:0000:0000:0000:0000:ffff:0102:0304', 'fe80:0000:0000:0000:0000:0000:0000:0001%eth0/64'));
      assert.strictEqual(ipv6Compress(lines(
        '2001:0DB8:0000:0000:0000:0000:0000:0001', '2001:db8:0:0:1:0:0:1', '2001:db8:0:1:1:1:1:1', '0:0:0:0:0:0:0:0',
        '2001:0:0:1:0:0:0:1', '::ffff:1.2.3.4', 'fe80:0:0:0:0:0:0:1%eth0/64', '1:0:0:0:0:0:0:0'), BUDGET), lines(
        '2001:db8::1', '2001:db8::1:0:0:1', '2001:db8:0:1:1:1:1:1', '::', '2001:0:0:1::1', '::ffff:102:304', 'fe80::1%eth0/64', '1::'));
      for (const value of ['1::2::3', '1:2:3:4:5:6:7', '1:2:3:4:5:6:7:8:9', '12345::', 'g::', '1:2:3:4:5:6:7::8', '::1.2.3', '1.2.3.4', ':1::', 'fe80::1%', 'fe80::1%a b', '::/129']) {
        assertInputError(() => ipv6Expand(value, BUDGET), /not an IPv6 address/);
      }
    });

    test('IPv4 and integers both ways; leading zeros and out-of-range values are refused', () => {
      assert.strictEqual(ipToInteger(lines('192.168.0.1', '3232235521', '0', '4294967295', '255.255.255.255', '0.0.0.0'), BUDGET),
        lines('3232235521', '192.168.0.1', '0.0.0.0', '255.255.255.255', '4294967295', '0'));
      for (const value of ['192.168.01.1', '4294967296', '01', '256.1.1.1', '1.2.3', '-1', '1e3']) {
        assertInputError(() => ipToInteger(value, BUDGET), /not an IPv4 address or an integer/);
      }
    });
  });
});
