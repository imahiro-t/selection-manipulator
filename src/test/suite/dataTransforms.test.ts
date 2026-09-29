import * as assert from 'assert';
import * as fs from 'fs';
import * as path from 'path';
import {
  DATA_MAX_DEPTH,
  DataInputError,
  findPathProblem,
  formatPath,
  inspectGraph,
  jsonLengthAtLeast,
  JsonValue,
  parsePath,
  PathSegment,
} from '../../handler/dataCommon';
import { EncOutputTooLargeError } from '../../handler/encodeTransforms';
import { parseIni, parseJsonLike, parseProperties } from '../../handler/dataParsers';
import {
  DATA_COMMAND_ENTRIES,
  DataCommandEntry,
  describeCount,
  findJsonError,
  formatYaml,
  mergeJsonObjects,
  parseJson,
  YAML_MAX_CONTAINERS_WITH_ALIASES,
} from '../../handler/dataTransforms';
import { parseToml } from '../../handler/tomlParser';
import { toXml } from '../../handler/dataWriters';

const entry = (id: string): DataCommandEntry => {
  const found = DATA_COMMAND_ENTRIES.find((candidate) => candidate.id === id);
  assert.ok(found?.transform, id);
  return found;
};

/** Runs the transform of a DATA command (the path for DATA-015 / 023 / 024 is given as text). */
const run = (id: string, text: string, pathText = ''): string =>
  entry(id).transform!(text, pathText === '' ? [] : parsePath(pathText));

/** Runs `convert` and fails when it took longer than `budget` milliseconds (catches quadratic / exponential time). */
const withinBudget = <T>(budget: number, convert: () => T): T => {
  const start = Date.now();
  let result: T;
  try {
    result = convert();
  } finally {
    const elapsed = Date.now() - start;
    assert.ok(elapsed < budget, `took ${elapsed} ms (budget: ${budget} ms)`);
  }
  return result;
};

const rejects = (convert: () => unknown, pattern?: RegExp): void => {
  assert.throws(convert, (error: unknown) => {
    assert.ok(error instanceof DataInputError, `expected DataInputError, got ${String(error)}`);
    if (pattern) {
      assert.match((error as Error).message, pattern);
    }
    return true;
  });
};

/** A deterministic pseudo-random generator (mulberry32) so that the robustness tests are repeatable. */
const random = (seed: number) => () => {
  seed = (seed + 0x6d2b79f5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};

suite('Data Transforms (DATA) Test Suite', () => {

  suite('command table', () => {
    test('40 commands in ROADMAP order: 33 basic followed by 7 Replace variants', () => {
      assert.strictEqual(DATA_COMMAND_ENTRIES.length, 40);
      DATA_COMMAND_ENTRIES.forEach((item, index) => assert.strictEqual(item.id, `DATA-${String(index + 1).padStart(3, '0')}`));
      assert.deepStrictEqual(DATA_COMMAND_ENTRIES.filter((item) => item.output === 'replace').map((item) => item.id),
        ['DATA-034', 'DATA-035', 'DATA-036', 'DATA-037', 'DATA-038', 'DATA-039', 'DATA-040']);
      DATA_COMMAND_ENTRIES.filter((item) => item.output === 'replace').forEach((item) => {
        const base = DATA_COMMAND_ENTRIES.find((candidate) => candidate.name === item.name.replace(/\.replace$/, ''));
        assert.ok(base, item.name);
        assert.strictEqual(item.transform, base.transform, `${item.id} uses the transform of ${base.id}`);
        assert.strictEqual(item.title, `${base.title} (Replace)`);
      });
      const withoutTransform = DATA_COMMAND_ENTRIES.filter((item) => item.transform === undefined).map((item) => item.id);
      assert.deepStrictEqual(withoutTransform, ['DATA-018', 'DATA-019', 'DATA-025']);
    });
  });

  suite('JSON layout (JSON -> JSON keeps one line or indents with 2 spaces)', () => {
    test('one line stays one line, several lines are indented', () => {
      assert.strictEqual(run('DATA-001', '  {"b":1, "a":2}  '), '{"a":2,"b":1}');
      assert.strictEqual(run('DATA-001', '{\n"b":1,"a":[{"d":1,"c":2}]}'), '{\n  "a": [\n    {\n      "c": 2,\n      "d": 1\n    }\n  ],\n  "b": 1\n}');
      assert.strictEqual(run('DATA-011', '{\n"a":null}'), '{}');
    });

    test('integer-like keys come first in numeric order (a JavaScript property order rule)', () => {
      assert.strictEqual(run('DATA-001', '{"b":1,"10":2,"a":3,"2":4}'), '{"2":4,"10":2,"a":3,"b":1}');
    });

    test('invalid JSON explains where the error is', () => {
      rejects(() => run('DATA-001', '{"a":1,}'), /^invalid JSON: line 1, column 8: unexpected character "\}"$/);
      rejects(() => run('DATA-001', '[1,\n2'), /^invalid JSON: line 2, column 2: unexpected end of input$/);
      rejects(() => run('DATA-001', ''), /invalid JSON/);
    });

    test(`nesting deeper than ${DATA_MAX_DEPTH} levels is an error, not a stack overflow`, () => {
      const deep = (levels: number) => `${'['.repeat(levels)}${']'.repeat(levels)}`;
      assert.doesNotThrow(() => run('DATA-001', deep(DATA_MAX_DEPTH)));
      ['DATA-001', 'DATA-004', 'DATA-011', 'DATA-016', 'DATA-022', 'DATA-026', 'DATA-027', 'DATA-033'].forEach((id) =>
        rejects(() => run(id, deep(DATA_MAX_DEPTH + 1)), /nesting is too deep \(limit: 500\)/));
      // js-yaml has its own, lower limit (100 levels).
      rejects(() => run('DATA-020', `${'- '.repeat(101)}1`), /nesting exceeded maxDepth \(100\)/);
      rejects(() => run('DATA-020', `${'['.repeat(DATA_MAX_DEPTH + 1)}${']'.repeat(DATA_MAX_DEPTH + 1)}`), /nesting/);
    });
  });

  suite('C1: JSON structure', () => {
    test('DATA-011 removes nulls recursively and keeps containers that become empty', () => {
      assert.strictEqual(run('DATA-011', '{"a":{"b":null},"c":[null,[null]],"d":0,"e":""}'), '{"a":{},"c":[[]],"d":0,"e":""}');
    });

    test('path notation: parse, format and validate', () => {
      const cases: [string, PathSegment[]][] = [
        ['a.b[0]', ['a', 'b', 0]],
        ['$.a["b-c"][1]', ['a', 'b-c', 1]],
        ['$', []],
        ['["a.b"]', ['a.b']],
        ['$a.$', ['$a', '$']],
        ['a["x\\"y"]', ['a', 'x"y']],
      ];
      cases.forEach(([text, segments]) => assert.deepStrictEqual(parsePath(text), segments, text));
      assert.strictEqual(formatPath(['a', 'b-c', 0, '0', '$', 'x y']), 'a["b-c"][0]["0"].$["x y"]');
      assert.strictEqual(formatPath(['$']), '["$"]');
      assert.strictEqual(formatPath([]), '$');
      ['', 'a.', '.a', 'a[', 'a[01]', 'a[-1]', 'a[x]', 'a b', 'a..b', '["unterminated]', '[1.5]'].forEach((text) =>
        assert.notStrictEqual(findPathProblem(text), undefined, text));
      assert.strictEqual(findPathProblem('a'.repeat(1_001)), 'The path is too long (limit: 1,000 characters).');
      assert.strictEqual(findPathProblem('a.b[0]'), undefined);
    });

    test('DATA-015 writes strings as they are and other values as JSON', () => {
      const text = '{"s":"x\\ny","o":{"k":[1]},"n":null,"b-c":true}';
      assert.strictEqual(run('DATA-015', text, 's'), 'x\ny');
      assert.strictEqual(run('DATA-015', text, 'o'), '{\n  "k": [\n    1\n  ]\n}');
      assert.strictEqual(run('DATA-015', text, 'n'), 'null');
      assert.strictEqual(run('DATA-015', text, '["b-c"]'), 'true');
      assert.strictEqual(run('DATA-015', text, '$'), JSON.stringify(JSON.parse(text), null, 2));
      rejects(() => run('DATA-015', text, 'o.k[1]'), /^nothing found at the path o\.k\[1\]$/);
      rejects(() => run('DATA-015', text, 'toString'), /nothing found/);
      rejects(() => run('DATA-015', '[1]', '["0"]'), /nothing found/);
    });

    test('DATA-016 lists the path of every leaf, and DATA-015 reads each of them back', () => {
      const text = '{"a":{"b":1,"e":{},"f":[]},"c":[2,{"x y":null}],"$":3,"0":4}';
      const paths = run('DATA-016', text).split('\n');
      assert.deepStrictEqual(paths, ['["0"]', 'a.b', 'a.e', 'a.f', 'c[0]', 'c[1]["x y"]', '["$"]']);
      const value = JSON.parse(text);
      assert.strictEqual(run('DATA-015', text, 'c[1]["x y"]'), 'null');
      paths.forEach((item) => assert.doesNotThrow(() => run('DATA-015', text, item), item));
      assert.strictEqual(run('DATA-015', text, '["$"]'), String(value.$));
      assert.strictEqual(run('DATA-016', '5'), '$');
      assert.strictEqual(run('DATA-016', '{}'), '$');
    });

    test('DATA-017 lists the top-level keys and needs an object', () => {
      assert.strictEqual(run('DATA-017', '{"b":{"x":1},"a":2}'), 'b\na');
      rejects(() => run('DATA-017', '[1]'), /needs a JSON object/);
    });

    test('DATA-018 merges deeply (later wins, arrays are replaced)', () => {
      const merged = mergeJsonObjects(['{"a":{"x":1,"y":[1,2]},"b":1}', '{"a":{"y":[3],"z":2},"b":{"c":1}}', '{"__proto__":{"p":1}}']);
      assert.strictEqual(merged, JSON.stringify({ a: { x: 1, y: [3], z: 2 }, b: { c: 1 }, ['__proto__']: { p: 1 } }, null, 2).replace('"["__proto__"]"', '"__proto__"'));
      assert.ok(merged.includes('"__proto__"'));
      assert.strictEqual(({} as Record<string, unknown>).p, undefined);
      rejects(() => mergeJsonObjects(['{"a":1}', '[1]']), /^selection 2 of 2: Merge JSON Objects needs a JSON object in every selection$/);
      rejects(() => mergeJsonObjects(['{"a":1', '{}']), /^selection 1 of 2: invalid JSON/);
    });

    test('DATA-019 finds the first error of strict JSON', () => {
      assert.strictEqual(findJsonError('{"a":[1,2]}'), undefined);
      assert.strictEqual(findJsonError('{"a":1,}')?.offset, 7);
      assert.strictEqual(findJsonError('{"a":1')?.offset, 6);
      assert.strictEqual(findJsonError('{"a":1')?.reason, 'unexpected end of input');
    });

    test('DATA-022 compares objects by content (key order ignored)', () => {
      assert.strictEqual(run('DATA-022', '[{"a":1,"b":2},{"b":2,"a":1},"1",1,[1],[1],null,null]'), '[{"a":1,"b":2},"1",1,[1],null]');
      rejects(() => run('DATA-022', '{"a":1}'), /needs a JSON array/);
    });

    test('DATA-023 plucks a (nested) field and keeps positions with null', () => {
      assert.strictEqual(run('DATA-023', '[{"u":{"n":"a"}},{"u":{}},3,{"u":{"n":null}}]', 'u.n'), '["a",null,null,null]');
      rejects(() => run('DATA-023', '{"id":1}', 'id'), /needs a JSON array/);
    });

    test('DATA-024 groups by a field in order of appearance', () => {
      const text = '[{"t":"b"},{"t":1},{"t":"b"},{"t":true},{"t":null},{"t":"1"},{"t":"__proto__"}]';
      assert.strictEqual(run('DATA-024', text, 't'),
        '{"1":[{"t":1},{"t":"1"}],"b":[{"t":"b"},{"t":"b"}],"true":[{"t":true}],"null":[{"t":null}],"__proto__":[{"t":"__proto__"}]}');
      rejects(() => run('DATA-024', '[{"t":"a"},{"x":1}]', 't'), /^element 1 has no field t$/);
      rejects(() => run('DATA-024', '[{"t":{"a":1}}]', 't'), /^the field t of element 0 is an object or array$/);
    });

    test('DATA-025 counts elements / keys / nodes', () => {
      assert.strictEqual(describeCount('[1,2,3]'), '3 elements (4 nodes in total)');
      assert.strictEqual(describeCount('[[1]]'), '1 element (3 nodes in total)');
      assert.strictEqual(describeCount('{"a":{"b":1},"c":[]}'), '2 keys (4 nodes in total)');
      assert.strictEqual(describeCount('{}'), '0 keys (1 node in total)');
      assert.strictEqual(describeCount('"x"'), '1 value (1 node in total)');
      rejects(() => describeCount('[1,'), /invalid JSON/);
    });

    test('DATA-026 builds a draft 2020-12 schema skeleton', () => {
      const schema = JSON.parse(run('DATA-026', '{"i":1,"n":1.5,"s":"x","b":true,"z":null,"a":[1,2],"m":[1,"x"],"e":[],"o":{}}'));
      assert.deepStrictEqual(schema, {
        $schema: 'https://json-schema.org/draft/2020-12/schema',
        type: 'object',
        properties: {
          i: { type: 'integer' },
          n: { type: 'number' },
          s: { type: 'string' },
          b: { type: 'boolean' },
          z: { type: 'null' },
          a: { type: 'array', items: { type: 'integer' } },
          m: { type: 'array', items: { anyOf: [{ type: 'integer' }, { type: 'string' }] } },
          e: { type: 'array', items: {} },
          o: { type: 'object', properties: {} },
        },
        required: ['i', 'n', 's', 'b', 'z', 'a', 'm', 'e', 'o'],
      });
    });

    test('DATA-033 expands JSON objects / arrays in strings, recursively, and leaves other strings', () => {
      assert.strictEqual(run('DATA-033', '{"a":"{\\"b\\":\\"[1,{\\\\\\"c\\\\\\":2}]\\"}","n":"123","t":"true","x":"{not json"," s":" [1] "}'),
        '{"a":{"b":[1,{"c":2}]},"n":"123","t":"true","x":"{not json"," s":[1]}');
      // 300 levels outside + 300 levels inside the string > 500.
      const inner = `${'['.repeat(300)}${']'.repeat(300)}`;
      rejects(() => run('DATA-033', `${'['.repeat(300)}${JSON.stringify(inner)}${']'.repeat(300)}`), /nesting is too deep/);
      assert.doesNotThrow(() => run('DATA-033', `${'['.repeat(200)}${JSON.stringify(inner)}${']'.repeat(200)}`));
    });
  });

  suite('C2: JSON to other formats', () => {
    test('DATA-002 query string: arrays repeat the key, null is empty, nested objects are errors', () => {
      assert.strictEqual(run('DATA-002', '{"q":"a&b=c","n":null,"t":true,"tags":[1,"x y"],"é":"ü"}'), 'q=a%26b%3Dc&n=&t=true&tags=1&tags=x+y&%C3%A9=%C3%BC');
      rejects(() => run('DATA-002', '{"a":{"b":1}}'), /is an object/);
      rejects(() => run('DATA-002', '{"a":[[1]]}'), /contains an object or array/);
      rejects(() => run('DATA-002', '[1]'), /needs a JSON object/);
    });

    test('DATA-003 .env quoting rules', () => {
      assert.strictEqual(run('DATA-003', '{"A":"plain","B":"has space","C":"say \\"hi\\"","D":"it\'s","E":"","F":null,"G":1.5,"H":"#x","I":"a=b"}'),
        'A=plain\nB="has space"\nC=\'say "hi"\'\nD="it\'s"\nE=\nF=\nG=1.5\nH="#x"\nI="a=b"');
      rejects(() => run('DATA-003', '{"A":"x\\"y\'z"}'), /contains both " and '/);
    });

    test('DATA-003 writes values with $, ` or \\ in single quotes (no expansion by shells, Compose or dotenv)', () => {
      assert.strictEqual(run('DATA-003', '{"A":"$(rm -rf ~)","B":"$HOME/bin","C":"`id`","D":"x\\\\ny","E":"${X}","F":"a\\"$b"}'),
        "A='$(rm -rf ~)'\nB='$HOME/bin'\nC='`id`'\nD='x\\ny'\nE='${X}'\nF='a\"$b'");
      rejects(() => run('DATA-003', '{"A":"it\'s $5"}'), /contains ' together with \$, ` or \\ and cannot be quoted safely/);
      rejects(() => run('DATA-003', '{"A":"a\'\\\\b"}'), /cannot be quoted safely/);
      rejects(() => run('DATA-003', '{"A":"x\\ny"}'), /contains a line break/);
      rejects(() => run('DATA-003', '{"A B":"x"}'), /cannot be used in \.env/);
      rejects(() => run('DATA-003', '{"A":{"b":1}}'), /only flat objects/);
    });

    test('DATA-004 XML: exact layout (collapseContent, LF), wrapping, escaping and names', () => {
      assert.strictEqual(toXml({ a: { b: 1 } }), '<a>\n  <b>1</b>\n</a>');
      assert.strictEqual(run('DATA-004', '{"a":{"b":"x & <y> \\"q\\" \'s\'","c":null,"d":[1,2],"e":{}}}'),
        '<a>\n  <b>x &amp; &lt;y&gt; &quot;q&quot; &apos;s&apos;</b>\n  <c/>\n  <d>1</d>\n  <d>2</d>\n  <e/>\n</a>');
      assert.strictEqual(run('DATA-004', '{"a":1,"b":2}'), '<root>\n  <a>1</a>\n  <b>2</b>\n</root>');
      assert.strictEqual(run('DATA-004', '[1,[2,3]]'), '<root>\n  <item>1</item>\n  <item>\n    <item>2</item>\n    <item>3</item>\n  </item>\n</root>');
      assert.strictEqual(run('DATA-004', '"text"'), '<root>text</root>');
      assert.strictEqual(run('DATA-004', '{"a":[1,2]}'), '<root>\n  <a>1</a>\n  <a>2</a>\n</root>');
      assert.strictEqual(run('DATA-004', '{"a":{"_b.c-1":"値"}}'), '<a>\n  <_b.c-1>値</_b.c-1>\n</a>');
      ['{"a b":1}', '{"名前":1}', '{"1a":1}', '{"xmlns":1}', '{"a":{"<script>":1}}', '{"":1}', '{"a:b":1}'].forEach((text) =>
        rejects(() => run('DATA-004', text), /is not a valid XML element name/));
      rejects(() => run('DATA-004', '{"a":"\\u0001"}'), /cannot be written in XML/);
      rejects(() => run('DATA-004', '{"a":"\\ud800"}'), /cannot be written in XML/);
    });

    test('DATA-005 TOML: tables, arrays of tables, inline values and escapes', () => {
      const text = '{"title":"x \\"q\\"\\n","n":1.5,"i":-3,"big":1e20,"arr":[1,"a",{"k":1}],"k y":true,"o":{"p":{"q":1}},"aot":[{"x":1},{"x":2,"y":{"z":3}}],"e":{}}';
      assert.strictEqual(run('DATA-005', text), [
        'title = "x \\"q\\"\\n"',
        'n = 1.5',
        'i = -3',
        'big = 100000000000000000000.0',
        'arr = [1, "a", { k = 1 }]',
        '"k y" = true',
        '',
        '[o.p]',
        'q = 1',
        '',
        '[[aot]]',
        'x = 1',
        '',
        '[[aot]]',
        'x = 2',
        '',
        '[aot.y]',
        'z = 3',
        '',
        '[e]',
      ].join('\n'));
      rejects(() => run('DATA-005', '{"a":{"b":null}}'), /^TOML has no null \(at "a\.b"\)$/);
      rejects(() => run('DATA-005', '[1]'), /needs a JSON object/);
    });

    test('DATA-005 -> DATA-006 round trip', () => {
      const text = '{"s":"a\\tb\\u0001\\\\","n":[1,2.5,-0.5,true],"t":{"u":{"v":"w"},"x":[{"y":1},{"y":2,"z":{"k":"v"}}]},"q k":{"a.b":1},"__proto__":{"x":1}}';
      assert.deepStrictEqual(JSON.parse(run('DATA-006', run('DATA-005', text))), JSON.parse(text));
    });

    test('DATA-007 INI: two levels, quoting, and the round trip through DATA-008', () => {
      const text = '{"top":1,"db":{"host":"x","pw":" spaced ","c":"a;b","q":"\\"x\\"","n":null,"t":true}}';
      const ini = run('DATA-007', text);
      assert.strictEqual(ini, 'top=1\n\n[db]\nhost=x\npw=" spaced "\nc="a;b"\nq=""x""\nn=\nt=true');
      assert.deepStrictEqual(JSON.parse(run('DATA-008', ini)), { top: '1', db: { host: 'x', pw: ' spaced ', c: 'a;b', q: '"x"', n: '', t: 'true' } });
      rejects(() => run('DATA-007', '{"a":{"b":{"c":1}}}'), /INI supports 2 levels/);
      rejects(() => run('DATA-007', '{"a":[1]}'), /INI supports 2 levels/);
      rejects(() => run('DATA-007', '{"a=b":1}'), /cannot be used in INI/);
      rejects(() => run('DATA-007', '{"a":"x\\ny"}'), /contains a line break/);
    });

    test('DATA-009 .properties: escapes, arrays, and the round trip through DATA-010', () => {
      const text = '{"a":{"b":"1","key with:=":" lead\\\\tail\\n"},"list":["x",{"y":"z"}],"empty":{},"n":null}';
      const properties = run('DATA-009', text);
      assert.strictEqual(properties, 'a.b=1\na.key\\ with\\:\\==\\ lead\\\\tail\\n\nlist[0]=x\nlist[1].y=z\nn=');
      assert.deepStrictEqual(JSON.parse(run('DATA-010', properties)),
        { a: { b: '1', 'key with:=': ' lead\\tail\n' }, list: ['x', { y: 'z' }], n: '' });
      rejects(() => run('DATA-009', '{"a.b":1}'), /cannot be used in \.properties/);
      // Empty containers outside arrays write nothing; inside an array they would shift the indexes.
      assert.strictEqual(run('DATA-009', '{"a":{},"b":[],"c":[["x"]]}'), 'c[0][0]=x');
      rejects(() => run('DATA-009', '{"a":[{},"x"]}'), /the element a\[0\] is an empty object or array/);
      rejects(() => run('DATA-009', '{"1":["é",{},"="]}'), /the element 1\[1\] is an empty object or array/);
      rejects(() => run('DATA-009', '{"a":["x",[]]}'), /the element a\[1\] is an empty object or array/);
      rejects(() => run('DATA-009', '{"a":[{"b":{}}]}'), /the element a\[0\] is an empty object or array/);
      rejects(() => run('DATA-009', '[1]'), /needs a JSON object/);
    });

    test('DATA-012 JSON Lines', () => {
      assert.strictEqual(run('DATA-012', '[\n  {"a": [1, 2]},\n  "x",\n  null\n]'), '{"a":[1,2]}\n"x"\nnull');
      assert.strictEqual(run('DATA-012', '[]'), '');
      rejects(() => run('DATA-012', '{"a":1}'), /needs a JSON array/);
    });

    test('DATA-027 JS object literal: quotes only where needed, 1 line or 2-space indentation', () => {
      assert.strictEqual(run('DATA-027', '{"a":1,"b-c":"it\'s","$d":[true,null],"e":{},"f":[],"1":"\\n"}'),
        "{ '1': '\\n', a: 1, 'b-c': 'it\\'s', $d: [true, null], e: {}, f: [] }");
      assert.strictEqual(run('DATA-027', '{\n"a":{"b":[1,2]}}'), "{\n  a: {\n    b: [\n      1,\n      2\n    ]\n  }\n}");
      assert.strictEqual(run('DATA-027', '"\\u2028\\ud800 \\ud83d\\ude00"'), "'\\u2028\\ud800 \u{1F600}'");
    });

    test('DATA-027 writes the key __proto__ as a computed name, and DATA-028 reads it back', () => {
      const literal = run('DATA-027', '{"__proto__":{"x":1},"a":{"__proto__":4}}');
      assert.strictEqual(literal, "{ ['__proto__']: { x: 1 }, a: { ['__proto__']: 4 } }");
      assert.deepStrictEqual(JSON.parse(run('DATA-028', literal)), JSON.parse('{"__proto__":{"x":1},"a":{"__proto__":4}}'));
      assert.strictEqual(run('DATA-028', literal), '{\n  "__proto__": {\n    "x": 1\n  },\n  "a": {\n    "__proto__": 4\n  }\n}');
      assert.strictEqual(({} as Record<string, unknown>).x, undefined);
      rejects(() => run('DATA-028', "{ ['a' + 'b']: 1 }"), /computed property names are not supported/);
      rejects(() => run('DATA-014', "{ ['a']: 1 }"), /computed property names are not supported/);
    });
  });

  suite('C3: other formats to JSON', () => {
    test('DATA-013 skips blank lines and names the line of an error', () => {
      assert.deepStrictEqual(JSON.parse(run('DATA-013', '1\r\n\r\n  "x"  \r\n{"a":null}')), [1, 'x', { a: null }]);
      rejects(() => run('DATA-013', '{"a":1}\n{"a":'), /^line 2, column 6: unexpected end of input$/);
      rejects(() => run('DATA-039', '1\r\n\r\n{b}'), /^line 3, column 2: unexpected character "b"$/);
    });

    test('DATA-014 / DATA-028 write 2-space JSON', () => {
      assert.strictEqual(run('DATA-014', "{a:1,/*x*/b:'y',}"), '{\n  "a": 1,\n  "b": "y"\n}');
      assert.strictEqual(run('DATA-028', "[`t`, 0x10, 'q']"), '[\n  "t",\n  16,\n  "q"\n]');
    });
  });

  suite('C4: YAML (Core schema)', () => {
    test('dates and times are not turned into Date values', () => {
      assert.strictEqual(formatYaml('d: 2020-01-01\nt: 2020-01-01T10:00:00Z', false), 'd: 2020-01-01\nt: 2020-01-01T10:00:00Z');
      assert.strictEqual(formatYaml('t: 2020-01-01T10:00:00Z\nd: 2020-01-01', true), 'd: 2020-01-01\nt: 2020-01-01T10:00:00Z');
    });

    test('Core-schema normalisation: << is an ordinary key, 0x1F becomes 31, ~ becomes null', () => {
      assert.strictEqual(formatYaml('base: &b {x: 1}\nuse:\n  <<: *b\n  k: 2', false), 'base: &ref_0\n  x: 1\nuse:\n  <<: *ref_0\n  k: 2');
      assert.strictEqual(formatYaml('a: 0x1F\nb: ~\nc: True\nd: "quoted"', false), 'a: 31\nb: null\nc: true\nd: quoted');
    });

    test('aliases stay references (no expansion)', () => {
      const text = 'a: &x [1, 2]\nb: *x\nc: *x';
      assert.strictEqual(formatYaml(text, false), 'a: &ref_0\n  - 1\n  - 2\nb: *ref_0\nc: *ref_0');
    });

    test('the trailing line break follows the selection (LF or CRLF)', () => {
      assert.strictEqual(run('DATA-021', 'b: 1\na: 2'), 'a: 2\nb: 1');
      assert.strictEqual(run('DATA-021', 'b: 1\na: 2\n'), 'a: 2\nb: 1\n');
      assert.strictEqual(run('DATA-021', 'b: 1\r\na: 2\r\n'), 'a: 2\nb: 1\n');
      assert.strictEqual(run('DATA-020', 'a:   {b: 1}\n\n'), 'a:\n  b: 1\n');
      assert.strictEqual(run('DATA-020', 'x'), 'x');
    });

    test('sort-keys sorts every level', () => {
      assert.strictEqual(run('DATA-021', 'z:\n  k: 1\n  j: [ {b: 1, a: 2} ]\na: 0'), 'a: 0\nz:\n  j:\n    - a: 2\n      b: 1\n  k: 1');
    });

    test('errors: tags outside the Core schema, several documents, invalid YAML, nothing', () => {
      rejects(() => run('DATA-020', 'a: !!binary aGk='), /^invalid YAML: line 1, column \d+: unknown tag/);
      rejects(() => run('DATA-020', 'a: !!timestamp 2020-01-01'), /unknown tag/);
      rejects(() => run('DATA-020', 'a: 1\n---\nb: 2'), /expected a single document/);
      rejects(() => run('DATA-020', 'a: [1'), /^invalid YAML: line \d+, column \d+: /);
      rejects(() => run('DATA-020', '# only a comment\n\n---'), /contains no YAML value/);
      assert.strictEqual(run('DATA-020', '~'), 'null');
    });
  });

  suite('C5: HTTP texts', () => {
    test('DATA-029 Cookie header', () => {
      assert.deepStrictEqual(JSON.parse(run('DATA-029', 'Cookie: a=1; b="x y"; a=2; c=; d=e=f;')), { a: ['1', '2'], b: 'x y', c: '', d: 'e=f' });
      rejects(() => run('DATA-029', 'a=1; b'), /name=value/);
      rejects(() => run('DATA-029', 'a=1;\nb=2'), /on one line/);
    });

    test('DATA-030 Set-Cookie attributes; several lines give an array', () => {
      assert.deepStrictEqual(JSON.parse(run('DATA-030', 'Set-Cookie: sid="abc"; Expires=Wed, 21 Oct 2026 07:28:00 GMT; Max-Age=3600; Domain=example.com; HttpOnly; SameSite=Lax; Partitioned; Priority=High; Custom=x; Flag')), {
        name: 'sid', value: 'abc', expires: 'Wed, 21 Oct 2026 07:28:00 GMT', maxAge: 3600, domain: 'example.com', httpOnly: true, sameSite: 'Lax', partitioned: true, priority: 'High', custom: 'x', flag: true,
      });
      assert.deepStrictEqual(JSON.parse(run('DATA-030', 'a=1; Max-Age=abc\nb=2')), [{ name: 'a', value: '1', maxAge: 'abc' }, { name: 'b', value: '2' }]);
      rejects(() => run('DATA-030', 'novalue; Path=/'), /must start with name=value/);
      rejects(() => run('DATA-030', 'a=1\nb'), /^line 2: the cookie must start with name=value$/);
      rejects(() => run('DATA-030', 'a=1; name=x'), /unexpected attribute/);
    });

    test('DATA-031 HTTP headers: status line, continuation lines, repeated names', () => {
      const text = 'HTTP/1.1 200 OK\r\nContent-Type: text/html\r\nSet-Cookie: a=1\r\nset-cookie: b=2\r\nX-Long: one\r\n  two\r\n\r\nX-Empty:';
      assert.deepStrictEqual(JSON.parse(run('DATA-031', text)), { 'Content-Type': 'text/html', 'Set-Cookie': ['a=1', 'b=2'], 'X-Long': 'one two', 'X-Empty': '' });
      assert.deepStrictEqual(JSON.parse(run('DATA-031', 'GET /index.html HTTP/1.1\nHost: x')), { Host: 'x' });
      rejects(() => run('DATA-031', 'Host: x\nno colon here'), /^line 2: expected "Name: value"$/);
      rejects(() => run('DATA-031', ' continued'), /continuation line needs a header/);
    });

    test('DATA-032 User-Agent detection', () => {
      const cases: [string, string, string][] = [
        ['Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36 Edg/120.0.2210.91', 'Edge 120', 'Windows 10'],
        ['Mozilla/5.0 (Windows NT 6.1; WOW64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/109.0.0.0 Safari/537.36 OPR/95.0.0.0', 'Opera 95', 'Windows 7'],
        ['Mozilla/5.0 (Linux; Android 13; SM-S918B) AppleWebKit/537.36 (KHTML, like Gecko) SamsungBrowser/23.0 Chrome/115.0.0.0 Mobile Safari/537.36', 'Samsung Internet 23', 'Android 13'],
        ['Mozilla/5.0 (X11; Linux x86_64; rv:121.0) Gecko/20100101 Firefox/121.0', 'Firefox 121', 'Linux'],
        ['Mozilla/5.0 (iPhone; CPU iPhone OS 17_1_2 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.1 Mobile/15E148 Safari/604.1', 'Safari 17', 'iOS 17.1.2'],
        ['Mozilla/5.0 (iPad; CPU OS 16_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/119.0.6045.169 Mobile/15E148 Safari/604.1', 'Chrome 119', 'iOS 16.6'],
        ['Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.2 Safari/605.1.15', 'Safari 17', 'macOS 10.15.7'],
        ['Mozilla/5.0 (X11; CrOS x86_64 14541.0.0) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36', 'Chrome 120', 'ChromeOS'],
        ['Mozilla/5.0 (Windows NT 6.3; Trident/7.0; rv:11.0) like Gecko', 'Internet Explorer 11', 'Windows 8.1'],
        ['Mozilla/4.0 (compatible; MSIE 8.0; Windows NT 6.2)', 'Internet Explorer 8', 'Windows 8'],
        ['curl/8.4.0', 'Unknown', 'Unknown'],
      ];
      cases.forEach(([ua, browser, os]) => assert.deepStrictEqual(JSON.parse(run('DATA-032', ua)), { browser, os }, ua));
      assert.deepStrictEqual(JSON.parse(run('DATA-032', `${cases[0][0]}\n\n${cases[3][0]}`)), [
        { browser: 'Edge 120', os: 'Windows 10' }, { browser: 'Firefox 121', os: 'Linux' },
      ]);
      rejects(() => run('DATA-032', 'x'.repeat(2_001)), /longer than 2,000 characters/);
    });
  });

  suite('output size limit', () => {
    test('list-paths stops as soon as the output would exceed the limit', () => {
      // 250,000 leaves with a 45-character path each: more than 10,000,000 characters.
      const key = 'k'.repeat(40);
      const text = `{"${key}":[${Array(250_000).fill('0').join(',')}]}`;
      assert.throws(() => run('DATA-016', text), EncOutputTooLargeError);
    });
  });

  suite('time and size limits of large or hostile input (regression)', () => {
    test('YAML aliases that share subtrees are visited once (no exponential "billion laughs" time)', () => {
      let text = 'a0: &a0 [x, x, x, x, x, x, x, x, x, x]\n';
      for (let i = 1; i <= 12; i++) {
        text += `a${i}: &a${i} [${Array(10).fill(`*a${i - 1}`).join(', ')}]\n`;
      }
      const result = withinBudget(1_000, () => formatYaml(text, false));
      // The references are kept (the output does not expand 10^12 values).
      assert.ok(result.length < 2 * text.length, String(result.length));
      assert.ok(result.includes('*ref_'));
    });

    test('YAML depth is measured through aliases, and a self-reference is an error', () => {
      const nest = (inner: string) => `${'['.repeat(90)}${inner}${']'.repeat(90)}`;
      let text = `l0: &l0 ${nest('1')}\n`;
      for (let i = 1; i <= 5; i++) {
        text += `l${i}: &l${i} ${nest(`*l${i - 1}`)}\n`;
      }
      // 6 x 90 levels: more than DATA_MAX_DEPTH although no single document part is deeper than js-yaml's 100.
      rejects(() => formatYaml(text, false), /nesting is too deep \(limit: 500\)/);
      rejects(() => formatYaml('a: &x [*x]', false), /nesting is too deep/);
    });

    test('inspectGraph: linear on DAGs, reports sharing, limits depth', () => {
      const leaf = [1];
      let shared: unknown = leaf;
      for (let i = 0; i < 60; i++) {
        shared = [shared, shared];
      }
      assert.deepStrictEqual(withinBudget(500, () => inspectGraph(shared)), { shared: true, containers: 61 });
      assert.deepStrictEqual(inspectGraph({ a: [1], b: { c: null } }), { shared: false, containers: 3 });
      const nested = (depth: number): unknown => {
        let value: unknown = [];
        for (let i = 1; i < depth; i++) {
          value = [value];
        }
        return value;
      };
      assert.doesNotThrow(() => inspectGraph(nested(DATA_MAX_DEPTH)));
      assert.throws(() => inspectGraph(nested(DATA_MAX_DEPTH + 1)), DataInputError);
      // A shared subtree of height 300 under a path of 250: too deep only through the second reference.
      const deep = nested(300);
      let wrapped: unknown = deep;
      for (let i = 0; i < 250; i++) {
        wrapped = [wrapped];
      }
      assert.doesNotThrow(() => inspectGraph({ a: deep, b: [deep] }));
      assert.throws(() => inspectGraph({ a: deep, b: wrapped }), DataInputError);
    });

    test('large YAML without aliases is written in linear time; with aliases the size is limited', () => {
      withinBudget(2_000, () => formatYaml('- []\n'.repeat(200_000), false));
      withinBudget(2_000, () => formatYaml('- a: 1\n'.repeat(200_000), false));
      const aliased = (count: number) => `a: &x {b: 1}\nc: *x\nl:\n${'  - []\n'.repeat(count)}`;
      assert.ok(formatYaml(aliased(1_000), false).includes('c: *ref_0'));
      rejects(() => formatYaml(aliased(YAML_MAX_CONTAINERS_WITH_ALIASES), false), /limited to 50,000 mappings and sequences/);
    });

    test('the "no YAML value" check has no quadratic regular expression', () => {
      assert.strictEqual(withinBudget(500, () => formatYaml(`${' '.repeat(1_000_000)}~`, false)), 'null');
      rejects(() => withinBudget(500, () => formatYaml(`${' '.repeat(1_000_000)}\n# c\n---\n...`, false)), /contains no YAML value/);
    });

    test('.properties continuation lines are joined in linear time', () => {
      // Every line is three backslashes: an escaped backslash and a continuation.
      const text = `k=${Array(300_000).fill('\\\\\\').join('\n')}`;
      const result = JSON.parse(withinBudget(1_500, () => run('DATA-010', text)));
      assert.strictEqual(result.k, '\\'.repeat(300_000));
      assert.deepStrictEqual(JSON.parse(run('DATA-010', 'k=a\\\n  b\\\\\\\n c\nx=\\\\')), { k: 'ab\\c', x: '\\' });
    });

    test('DATA-026 is linear in the input and stops early when the schema text would be too large', () => {
      const objects = Array.from({ length: 20_000 }, (_, index) => `{"k${index}":1}`).join(',');
      const wrap = (depth: number) => `${'['.repeat(depth)}[${objects}]${']'.repeat(depth)}`;
      assert.throws(() => withinBudget(1_500, () => run('DATA-026', wrap(100))), EncOutputTooLargeError);
      const schema = JSON.parse(withinBudget(1_500, () => run('DATA-026', wrap(2))));
      assert.strictEqual(schema.items.items.items.anyOf.length, 20_000);
      // Equal element schemas are merged whatever the key order inside; the order of "required" is kept.
      assert.deepStrictEqual(JSON.parse(run('DATA-026', '[[{"a":1,"b":"x"}],[{"a":2,"b":"y"}]]')).items,
        { type: 'array', items: { type: 'object', properties: { a: { type: 'integer' }, b: { type: 'string' } }, required: ['a', 'b'] } });
      assert.strictEqual(JSON.parse(run('DATA-026', '[{"a":1,"b":2},{"b":2,"a":1}]')).items.anyOf.length, 2);
    });

    test('indented JSON / JS output is refused before a huge string is built', () => {
      const deepArray = `${'['.repeat(498)}\n${Array(1_000_000).fill('1').join(',')}${']'.repeat(498)}`;
      assert.throws(() => withinBudget(1_500, () => run('DATA-001', deepArray)), EncOutputTooLargeError);
      const deepLine = `${'['.repeat(400)}1${']'.repeat(400)}`;
      assert.throws(() => withinBudget(1_500, () => run('DATA-013', `${deepLine}\n`.repeat(4_000))), EncOutputTooLargeError);
      const deepItems = Array(1_000).fill(`${'['.repeat(400)}1,2,3,4,5,6,7,8,9${']'.repeat(400)}`).join(',');
      assert.throws(() => withinBudget(1_500, () => run('DATA-027', `[\n${deepItems}]`)), EncOutputTooLargeError);
    });

    test('the JSON length estimate is exact without escapes and never above the real length', () => {
      const next = random(7);
      const make = (depth: number): JsonValue => {
        const pick = next();
        if (depth > 4 || pick < 0.3) {
          return [null, true, false, 0, -1.5, 1e21, '', 'text', 'q"\n'][Math.floor(next() * 9)];
        }
        if (pick < 0.65) {
          return Array.from({ length: Math.floor(next() * 4) }, () => make(depth + 1));
        }
        const object: Record<string, JsonValue> = {};
        for (let i = Math.floor(next() * 4); i > 0; i--) {
          object[['a', 'b-c', '10', ''][Math.floor(next() * 4)]] = make(depth + 1);
        }
        return object;
      };
      for (let i = 0; i < 5_000; i++) {
        const value = make(0);
        for (const indent of [0, 2]) {
          const real = JSON.stringify(value, null, indent === 0 ? undefined : indent).length;
          const estimate = jsonLengthAtLeast(value, indent);
          assert.ok(estimate <= real, `${JSON.stringify(value)}: ${estimate} > ${real}`);
          if (!JSON.stringify(value).includes('\\')) {
            assert.strictEqual(estimate, real, JSON.stringify(value));
          }
        }
      }
    });
  });

  suite('robustness (fixed-seed random invalid input)', () => {
    const seeds = [
      '{"a":{"b":[1,2,{"c":"x"}]},"d":null}',
      '[{"t":"a","v":1},{"t":"b","v":2}]',
      '[a]\nb = 1\n[[c]]\nd = "x"\ne = [1, 2]\nf = { g = 1979-05-27T07:32:00Z }',
      '[db]\nhost=x\n; comment\nport: 1',
      'a.b=1\nlist[0]=x\nk\\ ey = v \\\n  w',
      "{a: 1, // c\n'b': [0x1F, .5,], c: `t`}",
      'a:\n  - b: 1\n  - &x {c: 2}\nd: *x',
      'Set-Cookie: id=1; Path=/; Secure\nHTTP/1.1 200 OK\nAccept: a',
      'Mozilla/5.0 (Windows NT 10.0) Chrome/120.0',
    ];
    const alphabet = '{}[]:,"\'`\\/*#;=.-+_$ \n\r\tabcxyz0129eEnutrfl<>&!?()@~%^|';

    test('every transform and parser throws only DataInputError / EncOutputTooLargeError', () => {
      const next = random(20260929);
      const inputs: string[] = [];
      seeds.forEach((seed) => {
        for (let cut = 0; cut <= seed.length; cut++) {
          inputs.push(seed.slice(0, cut));
        }
        for (let i = 0; i < 40; i++) {
          const chars = [...seed];
          const position = Math.floor(next() * chars.length);
          chars[position] = alphabet[Math.floor(next() * alphabet.length)];
          inputs.push(chars.join(''));
        }
      });
      for (let i = 0; i < 400; i++) {
        let text = '';
        const length = Math.floor(next() * 30);
        for (let j = 0; j < length; j++) {
          text += alphabet[Math.floor(next() * alphabet.length)];
        }
        inputs.push(text);
      }
      const convert: [string, (text: string) => unknown][] = [
        ...DATA_COMMAND_ENTRIES.filter((item) => item.transform).map((item): [string, (text: string) => unknown] =>
          [item.id, (text) => item.transform!(text, item.prompt ? ['a', 0] : [])]),
        ['describeCount', describeCount],
        ['findJsonError', findJsonError],
        ['merge', (text) => mergeJsonObjects([text, text])],
        ['json', (text) => parseJsonLike(text, 'json')],
        ['json5', (text) => parseJsonLike(text, 'json5')],
        ['js-object', (text) => parseJsonLike(text, 'js-object')],
        ['toml', parseToml],
        ['ini', parseIni],
        ['properties', parseProperties],
        ['parseJson', parseJson],
      ];
      let calls = 0;
      inputs.forEach((text) => {
        convert.forEach(([name, fn]) => {
          calls++;
          try {
            fn(text);
          } catch (error) {
            assert.ok(error instanceof DataInputError || error instanceof EncOutputTooLargeError,
              `${name} threw ${String(error)} for ${JSON.stringify(text)}`);
          }
        });
      });
      assert.ok(calls > 50_000, String(calls));
    });
  });

  suite('source code rules (SECURITY.md)', () => {
    const files = ['dataCommon.ts', 'dataParsers.ts', 'tomlParser.ts', 'dataWriters.ts', 'dataTransforms.ts', 'dataHandler.ts'];
    files.forEach((file) => {
      test(`${file} uses no eval, Function constructor, processes, network, files or dynamic require`, () => {
        // Comments are removed first: they may mention what the code avoids.
        const source = fs.readFileSync(path.resolve(__dirname, '../../../src/handler', file), 'utf8')
          .replace(/\/\*[\s\S]*?\*\//g, '')
          .replace(/^\s*\/\/.*$/gm, '');
        [/\beval\s*\(/, /\bnew\s+Function\b/, /\bFunction\s*\(/, /child_process/, /\brequire\s*\(/, /\bimport\s*\(/,
          /from 'node:(?:fs|net|http|https|dns|vm)'/, /from '(?:fs|net|http|https|dns|vm)'/, /\bfetch\s*\(/, /setTimeout\s*\(\s*['"`]/]
          .forEach((pattern) => assert.ok(!pattern.test(source), `${file}: ${pattern}`));
      });
    });
  });
});
