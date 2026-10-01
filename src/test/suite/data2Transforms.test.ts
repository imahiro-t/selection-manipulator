import * as assert from 'assert';
import { EncOutputTooLargeError } from '../../handler/encodeTransforms';
import { CountLimitError, DATA_MAX_PATH_LENGTH, DataInputError, findPathProblem } from '../../handler/dataCommon';
import { TableInputError, TableTooLargeError } from '../../handler/tableCsv';
import { parseToml } from '../../handler/tomlParser';
import { DATA_COMMAND_ENTRIES, isTransformEntry, YAML_MAX_ALIAS_WORK } from '../../handler/dataTransforms';
import { SPLIT_MAX_ADDED_COLUMNS } from '../../handler/data2Csv';
import { checkXml, XML_MAX_PATH_LINES, XmlWellFormednessError } from '../../handler/data2Xml';
import {
  CHUNK_MAX_SIZE,
  compareCodePoints,
  DATA2_COMMAND_ENTRIES,
  Data2CommandEntry,
  escapeLtsv,
  escapeMarkdownCell,
  findChunkSizeProblem,
  findFilterProblem,
  findJsonValueProblem,
  findKeyListProblem,
  findOptionalPathProblem,
  unescapeLtsv,
  YAML_MAX_DOCUMENTS,
} from '../../handler/data2Transforms';
import { DATA2_EXAMPLES, expectedResult } from './data2Examples';

const entryOf = (id: string): Data2CommandEntry => {
  const found = DATA2_COMMAND_ENTRIES.find((entry) => entry.id === id);
  assert.ok(found, id);
  return found;
};

/** Runs a command on one selection: the converted text, or the notification of a check. */
const run = (id: string, text: string, inputs: readonly string[] = []): string => {
  const entry = entryOf(id);
  return entry.output === 'notify' ? entry.check(text).message : entry.transform(text, inputs);
};

const fails = (id: string, text: string, inputs: readonly string[], message: RegExp, type: Function = DataInputError): void => {
  assert.throws(() => run(id, text, inputs), (error: unknown) => {
    assert.ok(error instanceof type, `${id} ${JSON.stringify(text)}: ${String(error)}`);
    assert.match((error as Error).message, message, `${id} ${JSON.stringify(text)}`);
    return true;
  });
};

/** Whether anything was added to Object.prototype (prototype pollution). */
const assertNotPolluted = (): void => {
  const probe = {} as Record<string, unknown>;
  for (const key of ['polluted', 'x', 'isAdmin']) {
    assert.strictEqual(probe[key], undefined, key);
    assert.ok(!Object.prototype.hasOwnProperty.call(Object.prototype, key), key);
  }
};

const timed = <T>(action: () => T, limitMs: number): T => {
  const start = Date.now();
  const result = action();
  const elapsed = Date.now() - start;
  assert.ok(elapsed < limitMs, `took ${elapsed} ms (limit ${limitMs} ms)`);
  return result;
};

/** A YAML of ~400 characters whose JSON form would have 10^10 strings (nested aliases). */
const billionLaughs = (): string => {
  let text = 'a: &a ["x","x","x","x","x","x","x","x","x","x"]\n';
  let previous = 'a';
  for (let i = 0; i < 9; i++) {
    const name = String.fromCharCode(98 + i);
    text += `${name}: &${name} [${Array(10).fill(`*${previous}`).join(',')}]\n`;
    previous = name;
  }
  return text;
};

suite('DATA2 Data Format Transforms (DATAX-001..024) Test Suite', () => {

  test('the table: 24 commands in showcase order; 22 convert, 2 only notify', () => {
    assert.deepStrictEqual(DATA2_COMMAND_ENTRIES.map((entry) => entry.id), Array.from({ length: 24 }, (_, i) => `DATAX-${String(i + 1).padStart(3, '0')}`));
    assert.deepStrictEqual(DATA2_COMMAND_ENTRIES.filter((entry) => entry.output === 'notify').map((entry) => entry.name), ['yaml.validate', 'xml.validate']);
    const existing = new Set(DATA_COMMAND_ENTRIES.map((entry) => entry.name));
    DATA2_COMMAND_ENTRIES.forEach((entry) => assert.ok(!existing.has(entry.name), entry.name));
  });

  suite('the showcase examples', () => {
    DATA2_COMMAND_ENTRIES.forEach((entry) => {
      test(`${entry.id} ${entry.name}`, () => {
        const example = DATA2_EXAMPLES[entry.id];
        assert.strictEqual(run(entry.id, example.input, example.answers ?? []), expectedResult(example));
      });
    });
  });

  suite('DATAX-001 sort-array', () => {
    test('every type, in the order number < string < boolean < array < object < null', () => {
      assert.strictEqual(run('DATAX-001', '[null, {"a":1}, "x", [2], true, 1]', ['']), '[1,"x",true,[2],{"a":1},null]');
    });

    test('within a type: numbers by value, strings by code point, false before true, arrays / objects by canonical JSON', () => {
      assert.strictEqual(run('DATAX-001', '[10,-1,2.5,2]', ['']), '[-1,2,2.5,10]');
      // U+FF61 sorts before U+1F600 by code point, after it by UTF-16 code unit.
      assert.strictEqual(run('DATAX-001', '["\uD83D\uDE00","\uFF61","b","B","a"]', ['']), '["B","a","b","\uFF61","\uD83D\uDE00"]');
      assert.strictEqual(compareCodePoints('\uFF61', '\uD83D\uDE00') < 0, true);
      assert.strictEqual(run('DATAX-001', '[true,false,true]', ['']), '[false,true,true]');
      // By the canonical JSON text: "[1,5]" < "[1]" because "," < "]".
      assert.strictEqual(run('DATAX-001', '[[2],[1,5],[1]]', ['']), '[[1,5],[1],[2]]');
    });

    test('stable: objects with the same canonical JSON (keys in another order) keep their order', () => {
      assert.strictEqual(run('DATAX-001', '[{"b":1,"a":2,"i":0},{"a":2,"b":1,"i":1}]', ['i']), '[{"b":1,"a":2,"i":0},{"a":2,"b":1,"i":1}]');
      assert.strictEqual(run('DATAX-001', '[{"k":{"b":1,"a":2},"i":0},{"k":{"a":2,"b":1},"i":1},{"k":{"a":1},"i":2}]', ['k']),
        '[{"k":{"a":1},"i":2},{"k":{"b":1,"a":2},"i":0},{"k":{"a":2,"b":1},"i":1}]');
    });

    test('by key path: elements without the path come last, in their order', () => {
      assert.strictEqual(run('DATAX-001', '[{"u":{"a":3}},{"x":1},{"u":{"a":1}},5]', ['u.a']), '[{"u":{"a":1}},{"u":{"a":3}},{"x":1},5]');
    });

    test('the layout of the input is kept; errors', () => {
      assert.strictEqual(run('DATAX-001', '[\n2,\n1\n]', ['']), '[\n  1,\n  2\n]');
      fails('DATAX-001', '{"a":1}', [''], /needs a JSON array/);
      fails('DATAX-001', '[1]', ['a..b'], /Invalid path/);
      assert.strictEqual(findOptionalPathProblem(''), undefined);
      assert.ok(findOptionalPathProblem('a..b'));
    });
  });

  suite('DATAX-002 filter-array', () => {
    const data = '[{"s":200},{"s":"200"},{"s":2},{"t":200}]';

    test('a JSON value matches the equal value and the string with the same text', () => {
      assert.strictEqual(run('DATAX-002', data, ['s=200']), '[{"s":200},{"s":"200"}]');
    });

    test('a quoted value matches only the string', () => {
      assert.strictEqual(run('DATAX-002', data, ['s="200"']), '[{"s":"200"}]');
    });

    test('a value that is not JSON matches the string; true / null match the value and the string', () => {
      assert.strictEqual(run('DATAX-002', '[{"s":"on"},{"s":"off"},{"s":true}]', ['s=on']), '[{"s":"on"}]');
      assert.strictEqual(run('DATAX-002', '[{"f":true},{"f":"true"},{"f":false},{"f":null},{"f":"null"}]', ['f=true']), '[{"f":true},{"f":"true"}]');
      assert.strictEqual(run('DATAX-002', '[{"f":null},{"f":"null"},{}]', ['f=null']), '[{"f":null},{"f":"null"}]');
    });

    test('objects match whatever the key order; a missing field never matches; later "=" belong to the value', () => {
      assert.strictEqual(run('DATAX-002', '[{"k":{"a":1,"b":2}},{"k":{"a":1}}]', ['k={"b":2,"a":1}']), '[{"k":{"a":1,"b":2}}]');
      assert.strictEqual(run('DATAX-002', '[{"q":"a=b"},{"q":"a"}]', ['q=a=b']), '[{"q":"a=b"}]');
      assert.strictEqual(run('DATAX-002', '[{"x":""},{}]', ['x=']), '[{"x":""}]');
      assert.strictEqual(run('DATAX-002', '[{"u":{"id":1}},{"u":{"id":2}}]', ['u.id=2']), '[{"u":{"id":2}}]');
    });

    test('the condition is checked: "=" needed, the key is a path', () => {
      assert.ok(findFilterProblem('status'));
      assert.ok(findFilterProblem('a..b=1'));
      assert.strictEqual(findFilterProblem('a=1'), undefined);
      fails('DATAX-002', '[1]', ['status'], /key=value/);
    });
  });

  suite('JSON keys and prototype pollution (DATAX-003 / 004 / 005 / 006 / 009 / 011 / 023)', () => {
    test('DATAX-003 pick-keys: objects and arrays of objects; the original key order', () => {
      assert.strictEqual(run('DATAX-003', '[{"a":1,"b":2},{"b":3,"c":4}]', [' b , a ']), '[{"a":1,"b":2},{"b":3}]');
      fails('DATAX-003', '[{"a":1},2]', ['a'], /element \[1\] is not an object/);
      fails('DATAX-003', '"x"', ['a'], /JSON object or an array/);
      assert.ok(findKeyListProblem('a,,b'));
      assert.ok(findKeyListProblem(Array.from({ length: 1_001 }, (_, i) => `k${i}`).join(',')));
    });

    test('DATAX-004 omit-keys: top level only or recursive', () => {
      const text = '{"a":{"pw":1,"b":[{"pw":2}]},"pw":3}';
      assert.strictEqual(run('DATAX-004', text, ['pw', 'Top level only']), '{"a":{"pw":1,"b":[{"pw":2}]}}');
      assert.strictEqual(run('DATAX-004', text, ['pw', 'Recursive']), '{"a":{"b":[{}]}}');
      assert.strictEqual(run('DATAX-004', '[{"a":1,"b":2},3]', ['a', 'Top level only']), '[{"b":2},3]');
    });

    test('DATAX-005 rename-key: every level, key order kept, conflicts named', () => {
      assert.strictEqual(run('DATAX-005', '{"x":1,"old":{"old":2,"y":3},"z":[{"old":4}]}', ['old', 'new']), '{"x":1,"new":{"new":2,"y":3},"z":[{"new":4}]}');
      fails('DATAX-005', '{"a":[{"old":1,"new":2}]}', ['old', 'new'], /the object at a\[0\] already has the key "new"/);
      fails('DATAX-005', '{}', ['same', 'same'], /same as the old one/);
    });

    test('__proto__, constructor and prototype are ordinary keys and never reach Object.prototype', () => {
      const proto = '{"__proto__":{"polluted":true},"constructor":{"prototype":{"isAdmin":true}},"a":1}';
      assert.strictEqual(run('DATAX-003', proto, ['__proto__,constructor']), '{"__proto__":{"polluted":true},"constructor":{"prototype":{"isAdmin":true}}}');
      assert.strictEqual(run('DATAX-004', proto, ['a', 'Recursive']), '{"__proto__":{"polluted":true},"constructor":{"prototype":{"isAdmin":true}}}');
      assert.strictEqual(run('DATAX-005', '{"a":{"polluted":true}}', ['a', '__proto__']), '{"__proto__":{"polluted":true}}');
      assert.strictEqual(run('DATAX-006', '{"__proto__":{"polluted":true,"e":""}}'), '{"__proto__":{"polluted":true}}');
      assert.strictEqual(run('DATAX-009', '[{"id":"__proto__","polluted":true},{"id":"constructor"}]', ['id']),
        '{"__proto__":{"id":"__proto__","polluted":true},"constructor":{"id":"constructor"}}');
      assert.strictEqual(run('DATAX-011', '{}', ['["__proto__"].polluted', 'true']), '{"__proto__":{"polluted":true}}');
      assert.strictEqual(run('DATAX-011', '{"__proto__":{}}', ['["__proto__"].x', '1']), '{"__proto__":{"x":1}}');
      assert.strictEqual(run('DATAX-023', '__proto__:x\tconstructor:y'), '[\n  {\n    "__proto__": "x",\n    "constructor": "y"\n  }\n]');
      assertNotPolluted();
    });

    test('DATAX-006 remove-empty: "", [], {} and null at every level; parents that become empty too', () => {
      assert.strictEqual(run('DATAX-006', '{"a":{"b":{"c":null}},"d":[1,"",[],{}],"e":0,"f":false}'), '{"d":[1],"e":0,"f":false}');
      assert.strictEqual(run('DATAX-006', '{"a":""}'), '{}');
      assert.strictEqual(run('DATAX-006', '[[],[null]]'), '[]');
    });

    test('DATAX-009 array-to-object: string or number keys; duplicates and missing keys are errors', () => {
      assert.strictEqual(run('DATAX-009', '[{"u":{"id":1}},{"u":{"id":"x"}}]', ['u.id']), '{"1":{"u":{"id":1}},"x":{"u":{"id":"x"}}}');
      fails('DATAX-009', '[{"id":"a"},{"id":"b"},{"id":"a"}]', ['id'], /element \[2\] repeats the key "a"/);
      fails('DATAX-009', '[{"id":"a"},{"x":1}]', ['id'], /element \[1\] has no string or number at id/);
      fails('DATAX-009', '[{"id":true}]', ['id'], /element \[0\]/);
    });

    test('DATAX-010 object-to-entries', () => {
      assert.strictEqual(run('DATAX-010', '{"b":[1],"a":null}'), '[{"key":"b","value":[1]},{"key":"a","value":null}]');
      fails('DATAX-010', '[1]', [], /needs a JSON object/);
    });
  });

  suite('DATAX-011 set-path', () => {
    test('replaces values, creates missing objects, $ replaces everything', () => {
      assert.strictEqual(run('DATAX-011', '{"a":[1,{"b":2}]}', ['a[1].b', '{"c":[true]}']), '{"a":[1,{"b":{"c":[true]}}]}');
      assert.strictEqual(run('DATAX-011', '{}', ['x.y["z-1"]', '"v"']), '{"x":{"y":{"z-1":"v"}}}');
      assert.strictEqual(run('DATAX-011', '{"a":1}', ['$', '[1,2]']), '[1,2]');
      assert.strictEqual(run('DATAX-011', '[0,1]', ['[1]', 'null']), '[0,null]');
    });

    test('array indexes only within the array (no sparse array); no index through other values', () => {
      fails('DATAX-011', '{"a":[1]}', ['a[1]', '2'], /out of range/);
      fails('DATAX-011', '{"a":[]}', ['a[999999999]', '2'], /out of range/);
      fails('DATAX-011', '{"a":{}}', ['a[0]', '2'], /not an array/);
      fails('DATAX-011', '{}', ['a[0]', '2'], /does not exist/);
      fails('DATAX-011', '{"a":"s"}', ['a.b', '2'], /is not an object/);
      fails('DATAX-011', '[1]', ['a', '2'], /is not an object/);
    });

    test('the path goes through findPathProblem: a path longer than DATA_MAX_PATH_LENGTH is refused by the box and the transform', () => {
      const long = `a${'.b'.repeat(DATA_MAX_PATH_LENGTH / 2)}`;
      assert.strictEqual(long.length, DATA_MAX_PATH_LENGTH + 1);
      assert.match(findPathProblem(long)!, /too long/);
      const prompt = entryOf('DATAX-011').prompts[0];
      assert.ok(prompt.type === 'input' && prompt.validate === findPathProblem);
      fails('DATAX-011', '{}', [long, '1'], /too long/);
      const ok = `a${'.b'.repeat(DATA_MAX_PATH_LENGTH / 2 - 1)}`;
      assert.strictEqual(findPathProblem(ok), undefined);
    });

    test('the value is JSON only (never evaluated); a value that is not JSON is refused', () => {
      assert.ok(findJsonValueProblem('alert(1)'));
      assert.ok(findJsonValueProblem("'x'"));
      assert.strictEqual(findJsonValueProblem(' 1 '), undefined);
      fails('DATAX-011', '{}', ['a', 'process.exit()'], /Enter a JSON value/);
      fails('DATAX-011', '{}', ['a', `${'['.repeat(600)}${']'.repeat(600)}`], /nesting is too deep/);
    });
  });

  suite('DATAX-007 to-markdown-table', () => {
    test('the columns are all keys in order of first appearance; missing cells are empty; values as JSON', () => {
      assert.strictEqual(run('DATAX-007', '[{"a":"x","b":[1]},{"c":null,"a":true}]'),
        '| a | b | c |\n| --- | --- | --- |\n| x | [1] |  |\n| true |  | null |');
    });

    test('|, \\ and line breaks (LF, CRLF, CR) are escaped in cells and headers, so rows and columns stay intact', () => {
      assert.strictEqual(escapeMarkdownCell('a|b\\c\r\nd\re\nf'), 'a\\|b\\\\c<br>d<br>e<br>f');
      const result = run('DATAX-007', '[{"k|1":"x|y","k\\n2":"l1\\r\\nl2\\\\"}]');
      assert.strictEqual(result, '| k\\|1 | k<br>2 |\n| --- | --- |\n| x\\|y | l1<br>l2\\\\ |');
      const lines = result.split('\n');
      assert.strictEqual(lines.length, 3);
      // Every row has 3 unescaped `|`.
      lines.forEach((line) => assert.strictEqual(line.replace(/\\\\/g, '').replace(/\\\|/g, '').split('|').length - 1, 3, line));
    });

    test('an empty array, an element that is not an object or no key is an error', () => {
      fails('DATAX-007', '[]', [], /empty/);
      fails('DATAX-007', '[1]', [], /not an object/);
      fails('DATAX-007', '[{}]', [], /no keys/);
    });
  });

  suite('DATAX-008 chunk-array', () => {
    test('chunks of N; N from 1 to 1,000,000', () => {
      assert.strictEqual(run('DATAX-008', '[1,2,3,4]', ['4']), '[[1,2,3,4]]');
      assert.strictEqual(run('DATAX-008', '[]', ['1']), '[]');
      assert.strictEqual(run('DATAX-008', '[1,2]', ['1000000']), '[[1,2]]');
      for (const invalid of ['0', '-1', '1.5', '', 'a', '01', String(CHUNK_MAX_SIZE + 1)]) {
        assert.ok(findChunkSizeProblem(invalid), invalid);
      }
      fails('DATAX-008', '[1]', ['0'], /integer from 1/);
    });
  });

  suite('YAML (DATAX-012..014)', () => {
    test('DATAX-012: flow style; anchors and aliases are kept as references', () => {
      assert.strictEqual(run('DATAX-012', 'a: &x [1, 2]\nb: *x\nc:\n  d: x\n'), '{a: &ref_0 [1, 2], b: *ref_0, c: {d: x}}\n');
      assert.strictEqual(run('DATAX-012', 'd: 2026-10-01\nm: <<\n'), '{d: 2026-10-01, m: <<}\n');
      fails('DATAX-012', '# only a comment', [], /no YAML value/);
      fails('DATAX-012', 'a: !!js/function "x"', [], /invalid YAML/);
    });

    test('DATAX-012: nested aliases (billion laughs) are written as aliases quickly, never expanded', () => {
      const text = billionLaughs();
      const result = timed(() => run('DATAX-012', text), 2_000);
      assert.ok(result.length < text.length * 3, String(result.length));
      assert.ok(result.includes('&ref_') && result.includes('*ref_'));
    });

    test('DATAX-012: with aliases, mappings and sequences x references over YAML_MAX_ALIAS_WORK is refused', () => {
      // 20,000 sequences each holding the shared one: 20,002 containers x 40,000 references.
      const count = 20_000;
      const text = `s: &s [1]\nl:\n${'  - [*s, *s]\n'.repeat(count)}`;
      assert.ok((count + 2) * (2 * count + count + 1) > YAML_MAX_ALIAS_WORK);
      fails('DATAX-012', text, [], /anchors and aliases is too large/);
    });

    test('DATAX-012: nesting deeper than the limit and recursive aliases are errors', () => {
      fails('DATAX-012', `${'['.repeat(600)}${']'.repeat(600)}`, [], /nest|deep/);
      fails('DATAX-012', 'a: &a [*a]', [], /./);
    });

    test('DATAX-013: valid, invalid with line and column; several documents', () => {
      assert.strictEqual(run('DATAX-013', 'a: 1\n---\nb: [1, 2]\n'), 'Valid YAML');
      assert.match(run('DATAX-013', 'a: [1, 2\nb: 3'), /^Invalid YAML: line \d+, column \d+: /);
      const entry = entryOf('DATAX-013');
      assert.ok(entry.output === 'notify');
      assert.deepStrictEqual([entry.check('a: 1\n  b: 2').valid, entry.check('a: 1').valid], [false, true]);
    });

    test('DATAX-013: nested aliases are only loaded (shared, not expanded): valid, quickly', () => {
      assert.strictEqual(timed(() => run('DATAX-013', billionLaughs()), 2_000), 'Valid YAML');
    });

    test('DATAX-014: documents to an array; empty documents are null', () => {
      assert.strictEqual(run('DATAX-014', '---\na: 1\n---\n---\n- x\n'), JSON.stringify([{ a: 1 }, null, ['x']], null, 2));
      fails('DATAX-014', '# nothing', [], /no YAML document/);
      fails('DATAX-014', 'a: .inf', [], /\.inf and \.nan/);
    });

    test('DATAX-014: nested aliases are refused before the JSON is built, quickly', () => {
      timed(() => fails('DATAX-014', billionLaughs(), [], /longer than 10,000,000 characters/, EncOutputTooLargeError), 2_000);
    });

    test('DATAX-014: at most YAML_MAX_DOCUMENTS documents', () => {
      assert.doesNotThrow(() => run('DATAX-014', `${'a\n---\n'.repeat(YAML_MAX_DOCUMENTS - 1)}a`));
      fails('DATAX-014', `${'a\n---\n'.repeat(YAML_MAX_DOCUMENTS)}a`, [], /more than 10,000 documents/, CountLimitError);
    });
  });

  suite('DATAX-015 toml.format', () => {
    test('floats, dates / times, arrays of tables and inline tables keep their types', () => {
      const text = 'f = 1.0\ne = 1e3\nn = -0.0\ni = 7\nd = 1979-05-27T07:32:00Z\nld = 1979-05-27\nlt = 07:32:00\nsp = 1979-05-27 07:32:00\narr = [1979-05-27, 2.5]\n'
        + '[[p]]\nx = 1\n[[p]]\nx = 2\n[t]\nin = { a = 1.5, b = "s" }\n';
      const formatted = run('DATAX-015', text);
      assert.strictEqual(formatted,
        'f = 1.0\ne = 1000.0\nn = -0.0\ni = 7\nd = 1979-05-27T07:32:00Z\nld = 1979-05-27\nlt = 07:32:00\nsp = 1979-05-27 07:32:00\narr = [1979-05-27, 2.5]\n'
        + '\n[[p]]\nx = 1\n\n[[p]]\nx = 2\n\n[t.in]\na = 1.5\nb = "s"\n');
      // Reading the result again gives the same values and types.
      assert.deepStrictEqual(JSON.stringify(parseToml(formatted, { preserveTypes: true })), JSON.stringify(parseToml(text, { preserveTypes: true })));
      assert.strictEqual(run('DATAX-015', formatted), formatted);
    });

    test('the default of parseToml (TOML to JSON) is unchanged: floats are numbers, dates strings', () => {
      assert.deepStrictEqual(JSON.parse(JSON.stringify(parseToml('f = 1.0\nd = 1979-05-27\n'))), { f: 1, d: '1979-05-27' });
      const toJson = DATA_COMMAND_ENTRIES.find((entry) => entry.name === 'toml.to-json');
      assert.ok(toJson && isTransformEntry(toJson));
      assert.strictEqual(toJson.transform('f = 1.0\nd = 1979-05-27T07:32:00Z', []), '{\n  "f": 1,\n  "d": "1979-05-27T07:32:00Z"\n}');
      const toToml = DATA_COMMAND_ENTRIES.find((entry) => entry.name === 'json.to-toml');
      assert.ok(toToml && isTransformEntry(toToml));
      assert.strictEqual(toToml.transform('{"a":{"b":1.5,"c":[{"d":1}]}}', []), '[a]\nb = 1.5\n\n[[a.c]]\nd = 1');
    });

    test('a date cannot be extended as a table; comments are dropped; empty TOML is an error', () => {
      fails('DATAX-015', 'a = 1979-05-27\n[a.b]\nc = 1', [], /not a table/);
      assert.strictEqual(run('DATAX-015', '# c\na = "x" # c\n'), 'a = "x"\n');
      fails('DATAX-015', '# only', [], /no TOML key/);
      fails('DATAX-015', 'a = inf', [], /inf/);
    });
  });

  suite('XML (DATAX-016 / 017)', () => {
    const invalid = (text: string, reason: RegExp, line?: number, column?: number) => {
      assert.throws(() => checkXml(text), (error: unknown) => {
        assert.ok(error instanceof XmlWellFormednessError, `${text}: ${String(error)}`);
        assert.match(error.reason, reason, text);
        if (line !== undefined) {
          assert.deepStrictEqual([error.line, error.column], [line, column], text);
        }
        return true;
      });
    };

    test('well-formed documents', () => {
      for (const text of [
        '<a/>',
        '\uFEFF<?xml version="1.0" encoding="UTF-8"?>\n<!-- c -->\n<a x="1" y=\'2\'><b>t &amp; &#65; &#x1F600;</b><![CDATA[<raw> & ]]><?pi data?></a>\n<!-- end -->',
        '<!DOCTYPE a><a/>',
        '<ns:a xmlns:ns="urn:x"><ns:b/></ns:a>',
        '<日本語>値</日本語>',
      ]) {
        assert.strictEqual(run('DATAX-016', text), 'Well-formed XML', text);
      }
    });

    test('the main errors, with their line and column', () => {
      invalid('<a><b></a>', /mismatched end tag/, 1, 7);
      invalid('<a>\n<b>', /not closed/, 2, 1);
      invalid('<a/><b/>', /only one root/, 1, 5);
      invalid('<a x="1" x="2"/>', /repeated/, 1, 10);
      invalid('<a x=1/>', /quoted/);
      invalid('<a>&#0;</a>', /character reference/);
      invalid('<a>&#xD800;</a>', /character reference/);
      invalid('<a>&foo;</a>', /undefined entity/);
      invalid('<a>&</a>', /must start a reference/);
      invalid('text<a/>', /before the root/);
      invalid('<a/>text', /after the root/);
      invalid('<a><!-- x -- y --></a>', /"--"/);
      invalid('<a/><?xml version="1.0"?>', /XML declaration/);
      invalid('', /no root element/);
      invalid('<a>\u0001</a>', /does not allow/);
      invalid('<1a/>', /invalid element name/);
      invalid('<a>]]></a>', /"]]>"/);
      invalid('<a><![CDATA[x</a>', /CDATA/);
      invalid('</a>', /without a start tag/);
    });

    test('DOCTYPE entities are never resolved: external entities (XXE) and nested entities are errors, not expanded', () => {
      invalid('<!DOCTYPE a [<!ENTITY x SYSTEM "file:///etc/passwd">]><a>&x;</a>', /undefined entity.*never resolved/);
      invalid('<!DOCTYPE a [<!ENTITY a "aaaa"><!ENTITY b "&a;&a;&a;">]><a>&b;</a>', /undefined entity/);
      invalid('<!DOCTYPE a SYSTEM "http://example.invalid/x.dtd"><a attr="&x;"/>', /undefined entity/);
      // Declared but not referenced: only the syntax is read.
      assert.strictEqual(run('DATAX-016', '<!DOCTYPE a [<!ENTITY x SYSTEM "file:///etc/passwd"> <!-- ] > --> <!ATTLIST a b CDATA "]">]><a/>'), 'Well-formed XML');
      invalid('<!DOCTYPE a><!DOCTYPE a><a/>', /only allowed once/);
    });

    test('nesting is limited to 500 levels', () => {
      assert.strictEqual(run('DATAX-016', `${'<a>'.repeat(500)}${'</a>'.repeat(500)}`), 'Well-formed XML');
      invalid(`${'<a>'.repeat(501)}${'</a>'.repeat(501)}`, /nested too deeply/);
    });

    test('the notification never quotes the selected text', () => {
      const message = run('DATAX-016', '<secretName><other></secretName>');
      assert.match(message, /^Invalid XML: line 1, column 20: mismatched end tag/);
      assert.ok(!message.includes('secretName') && !message.includes('other'), message);
    });

    test('DATAX-017: only the leaf elements; [n] only for names shared by siblings', () => {
      assert.strictEqual(run('DATAX-017', '<r><a><b/></a><c>t</c></r>'), '/r/a/b\n/r/c');
      assert.strictEqual(run('DATAX-017', '<r/>'), '/r');
      assert.strictEqual(run('DATAX-017', '<r><i><n>1</n></i><x/><i><n>2</n><n>3</n></i></r>'), '/r/i[1]/n\n/r/x\n/r/i[2]/n[1]\n/r/i[2]/n[2]');
      fails('DATAX-017', '<r><a></r>', [], /invalid XML: line 1, column 7/);
    });

    test('DATAX-017: at most 100,000 lines', () => {
      assert.strictEqual(run('DATAX-017', `<r>${'<a/>'.repeat(XML_MAX_PATH_LINES)}</r>`).split('\n').length, XML_MAX_PATH_LINES);
      fails('DATAX-017', `<r>${'<a/>'.repeat(XML_MAX_PATH_LINES + 1)}</r>`, [], /more than 100,000 lines/, CountLimitError);
    });
  });

  suite('CSV (DATAX-018..022)', () => {
    test('DATAX-018 reorder-columns: every column once; quoted cells and ragged rows', () => {
      assert.strictEqual(run('DATAX-018', 'a,b,c\n1,"x,y"\n', ['2, 3,1']), 'b,c,a\n"x,y",,1\n');
      fails('DATAX-018', 'a,b,c', ['1,2'], /exactly once/, TableInputError);
      fails('DATAX-018', 'a,b', ['1,2,3'], /exactly once/, TableInputError);
      fails('DATAX-018', 'a,b', ['1,1'], /only once/, TableInputError);
      fails('DATAX-018', 'a,b', ['0,1'], /column numbers/, TableInputError);
    });

    test('DATAX-019 merge-columns: by number or header name; empty separator; same column is an error', () => {
      assert.strictEqual(run('DATAX-019', 'first,mid,last\nA,x,B', ['last', 'first', '']), 'mid,lastfirst\nx,BA');
      assert.strictEqual(run('DATAX-019', 'a,b,c\n1,2,3', ['1', '3', ', ']), '"a, c",b\n"1, 3",2');
      fails('DATAX-019', 'a,b', ['1', 'a', '-'], /same column/, TableInputError);
    });

    test('DATAX-020 split-column: plain-text delimiter; ragged results padded; the header too', () => {
      assert.strictEqual(run('DATAX-020', 'd,x\n2026-10-01,a\n2026-10,b\n', ['d', '-']), 'd,,,x\n2026,10,01,a\n2026,10,,b\n');
      assert.strictEqual(run('DATAX-020', 'a.b|c', ['1', '.']), 'a,b|c');
      assert.strictEqual(run('DATAX-020', 'a(+)b', ['1', '(+)']), 'a,b');
    });

    test('DATAX-020: at most 1,000 added columns and TABLE_MAX_GRID_CELLS', () => {
      assert.strictEqual(run('DATAX-020', `x${'-x'.repeat(SPLIT_MAX_ADDED_COLUMNS)}`, ['1', '-']).split(',').length, SPLIT_MAX_ADDED_COLUMNS + 1);
      fails('DATAX-020', `x${'-x'.repeat(SPLIT_MAX_ADDED_COLUMNS + 1)}`, ['1', '-'], /more than 1,000 added columns/, CountLimitError);
      // 20,000 rows x (1 + 600) columns is more than 10,000,000 cells.
      fails('DATAX-020', `${'-'.repeat(600)}\n${'a\n'.repeat(19_999)}`, ['1', '-'], /the table is too large/, TableTooLargeError);
    });

    test('DATAX-021 group-count: first appearance order; header name', () => {
      assert.strictEqual(run('DATAX-021', 'n,c\na,red\nb,blue\nc,red\nd,\n', ['c']), 'c,count\nred,2\nblue,1\n,1\n');
      assert.strictEqual(run('DATAX-021', 'v\n__proto__\nconstructor\n__proto__', ['1']), 'v,count\n__proto__,2\nconstructor,1');
      fails('DATAX-021', 'a', ['1'], /no data rows/, TableInputError);
      assertNotPolluted();
    });

    test('DATAX-022 fill-empty: empty and missing cells, the header too; the value is quoted when needed', () => {
      assert.strictEqual(run('DATAX-022', ',b,c\n1\n', ['-']), '-,b,c\n1,-,-\n');
      assert.strictEqual(run('DATAX-022', 'a,,c', ['x, "y"']), 'a,"x, ""y""",c');
      fails('DATAX-022', 'a,,c', [''], /Enter a value/, TableInputError);
    });
  });

  suite('LTSV (DATAX-023 / 024)', () => {
    test('escapes and unescapes are the four of each other; unknown escapes stay', () => {
      assert.strictEqual(escapeLtsv('a\\b\tc\nd\re'), 'a\\\\b\\tc\\nd\\re');
      assert.strictEqual(unescapeLtsv('a\\\\b\\tc\\nd\\re'), 'a\\b\tc\nd\re');
      assert.strictEqual(unescapeLtsv('C:\\path\\x'), 'C:\\path\\x');
      assert.strictEqual(unescapeLtsv('end\\'), 'end\\');
      assert.strictEqual(unescapeLtsv('\\\\t'), '\\t');
    });

    test('string values round trip exactly; other values come back as their JSON text', () => {
      for (const value of ['', 'a\tb', 'l1\nl2\r\nl3\r', 'C:\\path\\new', '\\t', 'end\\', 'x:y', 'あ😀']) {
        const ltsv = run('DATAX-024', JSON.stringify({ v: value }));
        assert.ok(!/[\t\r\n]/.test(ltsv.slice(2)), JSON.stringify(ltsv));
        assert.deepStrictEqual(JSON.parse(run('DATAX-023', ltsv)), [{ v: value }], JSON.stringify(value));
      }
      const ltsv = run('DATAX-024', '[{"n":1,"b":true,"z":null,"o":{"a":[1]}},{"s":"x"}]');
      assert.strictEqual(ltsv, 'n:1\tb:true\tz:null\to:{"a":[1]}\ns:x');
      assert.deepStrictEqual(JSON.parse(run('DATAX-023', ltsv)), [{ n: '1', b: 'true', z: 'null', o: '{"a":[1]}' }, { s: 'x' }]);
    });

    test('DATAX-023: CRLF, empty lines skipped; errors name the line and the field', () => {
      assert.deepStrictEqual(JSON.parse(run('DATAX-023', 'a:1\r\n\r\nb:2:3\tc:\r\n')), [{ a: '1' }, { b: '2:3', c: '' }]);
      fails('DATAX-023', 'a:1\nb', [], /line 2, field 1: no ":"/);
      fails('DATAX-023', 'a:1\t:2', [], /line 1, field 2: the label is empty/);
      fails('DATAX-023', 'a:1\ta:2', [], /line 1, field 2: the label "a" is repeated/);
      fails('DATAX-023', '\n\n', [], /no LTSV record/);
    });

    test('DATAX-024: labels are letters, digits, _, . and -; objects only', () => {
      fails('DATAX-024', '{"a b":1}', [], /cannot be an LTSV label/);
      fails('DATAX-024', '{"a:b":1}', [], /cannot be an LTSV label/);
      fails('DATAX-024', '[1]', [], /not an object/);
      fails('DATAX-024', '[]', [], /empty/);
      fails('DATAX-024', '"x"', [], /JSON object or an array/);
    });
  });
});
