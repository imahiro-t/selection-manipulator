import * as assert from 'assert';
import { EncOutputTooLargeError, MAX_OUTPUT_LENGTH } from '../../handler/encodeTransforms';
import { DEV_MAX_INPUT_LENGTH, DEV_MAX_NESTING, DevInputError } from '../../handler/devCommon';
import { jsonToGoStruct, jsonToPythonTypedDict, jsonToTypeScript } from '../../handler/devJsonTypes';

const ts = (json: string, eol = '\n') => jsonToTypeScript(json, eol, MAX_OUTPUT_LENGTH);
const go = (json: string, eol = '\n') => jsonToGoStruct(json, eol, MAX_OUTPUT_LENGTH);
const py = (json: string, eol = '\n') => jsonToPythonTypedDict(json, eol, MAX_OUTPUT_LENGTH);
const lines = (...parts: string[]) => parts.join('\n');

const ALL = [ts, go, py];

suite('Developer JSON to Types (DEV-012..014) Test Suite', () => {

  suite('DEV-012 json-to-typescript', () => {
    test('primitives, arrays and nested objects (named after their keys, after Root)', () => {
      assert.strictEqual(ts('{"id":1,"price":1.5,"name":"a","ok":true,"tags":["a"],"matrix":[[1]],"user":{"id":2,"address":{"zip":"1"}}}'), lines(
        'interface Root {',
        '  id: number;',
        '  price: number;',
        '  name: string;',
        '  ok: boolean;',
        '  tags: string[];',
        '  matrix: number[][];',
        '  user: User;',
        '}',
        '',
        'interface User {',
        '  id: number;',
        '  address: Address;',
        '}',
        '',
        'interface Address {',
        '  zip: string;',
        '}',
      ));
    });

    test('arrays of objects are merged: keys missing from some objects are optional; null and mixed types make unions', () => {
      assert.strictEqual(ts('{"items":[{"a":1,"b":null},{"a":2,"b":"x","c":[]},{"a":3,"b":"y"}],"mixed":[1,"a",null,{"k":1}],"empty":[]}'), lines(
        'interface Root {',
        '  items: Items[];',
        '  mixed: (string | number | Mixed | null)[];',
        '  empty: unknown[];',
        '}',
        '',
        'interface Items {',
        '  a: number;',
        '  b: string | null;',
        '  c?: unknown[];',
        '}',
        '',
        'interface Mixed {',
        '  k: number;',
        '}',
      ));
    });

    test('a root array of objects is merged into Root', () => {
      assert.strictEqual(ts('[{"a":1},{"b":"x"}]'), lines('interface Root {', '  a?: number;', '  b?: string;', '}'));
      assert.strictEqual(ts('{}'), lines('interface Root {', '}'));
    });

    test('keys that are not identifiers are quoted like a JS string', () => {
      assert.strictEqual(ts('{"my-key":1,"$ok_1":2,"1st":3,"a b":4,"it\'s":5,"":6,"\\n":7}'), lines(
        'interface Root {',
        '  \'my-key\': number;',
        '  $ok_1: number;',
        '  \'1st\': number;',
        '  \'a b\': number;',
        '  \'it\\\'s\': number;',
        '  \'\': number;',
        '  \'\\n\': number;',
        '}',
      ));
    });

    test('type names are unique and never a global type name', () => {
      // `JSON.parse` puts integer-like keys ("123") first, as every JavaScript object does.
      assert.strictEqual(ts('{"root":{},"user":{"user":{}},"string":{},"123":{},"-":{}}'), lines(
        'interface Root {',
        '  \'123\': Type123;',
        '  root: Root2;',
        '  user: User;',
        '  string: String2;',
        '  \'-\': Type;',
        '}',
        '',
        'interface Type123 {',
        '}',
        '',
        'interface Root2 {',
        '}',
        '',
        'interface User {',
        '  user: User2;',
        '}',
        '',
        'interface String2 {',
        '}',
        '',
        'interface Type {',
        '}',
        '',
        'interface User2 {',
        '}',
      ));
    });

    test('the document line break is used', () => {
      assert.strictEqual(ts('{"a":{"b":1}}', '\r\n'), 'interface Root {\r\n  a: A;\r\n}\r\n\r\ninterface A {\r\n  b: number;\r\n}');
    });
  });

  suite('DEV-013 json-to-go-struct', () => {
    test('exported names with initialisms, gofmt alignment and json tags', () => {
      assert.strictEqual(go('{"user_id":1,"api_url":"u","HTTPServer":"s","price":1.5,"ok":true,"tags":["a"],"profile":{"name":"n"}}'), lines(
        'type Root struct {',
        '\tUserID     int      `json:"user_id"`',
        '\tAPIURL     string   `json:"api_url"`',
        '\tHTTPServer string   `json:"HTTPServer"`',
        '\tPrice      float64  `json:"price"`',
        '\tOk         bool     `json:"ok"`',
        '\tTags       []string `json:"tags"`',
        '\tProfile    Profile  `json:"profile"`',
        '}',
        '',
        'type Profile struct {',
        '\tName string `json:"name"`',
        '}',
      ));
    });

    test('merged arrays: omitempty, int and float merge to float64, null and mixed types to interface{}', () => {
      assert.strictEqual(go('[{"a":1,"b":null,"c":1,"d":"x"},{"a":2.5,"c":null,"d":1},{"a":3,"b":null,"e":[]}]'), lines(
        'type Root struct {',
        '\tA float64       `json:"a"`',
        '\tB interface{}   `json:"b,omitempty"`',
        '\tC int           `json:"c,omitempty"`',
        '\tD interface{}   `json:"d,omitempty"`',
        '\tE []interface{} `json:"e,omitempty"`',
        '}',
      ));
    });

    test('names that start with a digit or are empty get Field, duplicates a number', () => {
      assert.strictEqual(go('{"1st":1,"":2,"user-id":3,"user_id":4,"日本":5}'), lines(
        'type Root struct {',
        '\tField1St int `json:"1st"`',
        '\tField    int `json:""` // encoding/json cannot use this key as a tag name',
        '\tUserID   int `json:"user-id"`',
        '\tUserID2  int `json:"user_id"`',
        '\tField2   int `json:"日本"`',
        '}',
      ));
    });

    test('tags escape quotes and backslashes; a backquote makes an interpreted string literal', () => {
      assert.strictEqual(go('{"a\\"b":1,"c\\\\d":2,"e`f":3,"g,h":4,"i\\nj":5,"ok":6}'), lines(
        'type Root struct {',
        '\tAB int `json:"a\\"b"`  // encoding/json cannot use this key as a tag name',
        '\tCD int `json:"c\\\\d"`  // encoding/json cannot use this key as a tag name',
        '\tEF int "json:\\"e`f\\"" // encoding/json cannot use this key as a tag name',
        '\tGH int `json:"g,h"`   // encoding/json cannot use this key as a tag name',
        '\tIJ int `json:"i\\nj"`  // encoding/json cannot use this key as a tag name',
        '\tOk int `json:"ok"`',
        '}',
      ));
    });

    test('nested structs are named after their keys (initialisms too)', () => {
      assert.strictEqual(go('{"api":{"id":1},"items":[{"x":{}}]}'), lines(
        'type Root struct {',
        '\tAPI   API     `json:"api"`',
        '\tItems []Items `json:"items"`',
        '}',
        '',
        'type API struct {',
        '\tID int `json:"id"`',
        '}',
        '',
        'type Items struct {',
        '\tX X `json:"x"`',
        '}',
        '',
        'type X struct {',
        '}',
      ));
    });
  });

  suite('DEV-014 json-to-python-typeddict', () => {
    test('nested classes come first; only the names that are used are imported', () => {
      assert.strictEqual(py('{"id":1,"price":1.5,"name":"a","ok":true,"tags":["a"],"user":{"address":{"zip":"1"}},"x":null}'), lines(
        'from typing import TypedDict',
        '',
        '',
        'class Address(TypedDict):',
        '    zip: str',
        '',
        '',
        'class User(TypedDict):',
        '    address: Address',
        '',
        '',
        'class Root(TypedDict):',
        '    id: int',
        '    price: float',
        '    name: str',
        '    ok: bool',
        '    tags: list[str]',
        '    user: User',
        '    x: None',
      ));
    });

    test('NotRequired, unions with None and list[Any]', () => {
      assert.strictEqual(py('[{"a":1,"b":null,"c":[]},{"a":2.5,"b":"x"}]'), lines(
        'from typing import Any, NotRequired, TypedDict',
        '',
        '',
        'class Root(TypedDict):',
        '    a: float',
        '    b: str | None',
        '    c: NotRequired[list[Any]]',
      ));
    });

    test('keys that are not attributes (keywords, dashes, name mangling) make the functional form', () => {
      assert.strictEqual(py('{"class":1,"my-key":"a","__x":true,"ok":null,"it\'s":1}'), lines(
        'from typing import TypedDict',
        '',
        '',
        'Root = TypedDict(\'Root\', {',
        '    \'class\': int,',
        '    \'my-key\': str,',
        '    \'__x\': bool,',
        '    \'ok\': None,',
        '    "it\'s": int,',
        '})',
      ));
      assert.strictEqual(py('{"__dunder__":1,"_x":2,"match":3}'), lines(
        'from typing import TypedDict',
        '',
        '',
        'class Root(TypedDict):',
        '    __dunder__: int',
        '    _x: int',
        '    match: int',
      ));
    });

    test('class names never shadow a keyword or an imported name', () => {
      assert.strictEqual(py('{"none":{},"typed_dict":{},"any":{}}'), lines(
        'from typing import TypedDict',
        '',
        '',
        'class Any2(TypedDict):',
        '    pass',
        '',
        '',
        'class TypedDict2(TypedDict):',
        '    pass',
        '',
        '',
        'class None2(TypedDict):',
        '    pass',
        '',
        '',
        'class Root(TypedDict):',
        '    none: None2',
        '    typed_dict: TypedDict2',
        '    any: Any2',
      ));
    });

    test('the document line break is used', () => {
      assert.strictEqual(py('{"a":1}', '\r\n'), 'from typing import TypedDict\r\n\r\n\r\nclass Root(TypedDict):\r\n    a: int');
    });
  });

  suite('common rules', () => {
    test('integers are told from decimals by the parsed value: 1.0 and 1e2 are integers', () => {
      const json = '{"a":1.0,"b":1e2,"c":1.5,"d":-0}';
      assert.strictEqual(go(json).split('\n').slice(1, 5).join('\n'), lines(
        '\tA int     `json:"a"`',
        '\tB int     `json:"b"`',
        '\tC float64 `json:"c"`',
        '\tD int     `json:"d"`',
      ));
      assert.ok(py(json).endsWith(lines('    a: int', '    b: int', '    c: float', '    d: int')));
    });

    test('__proto__, constructor, toString and hasOwnProperty are ordinary fields; Object.prototype is not changed', () => {
      const json = '{"__proto__": 1, "constructor": "x", "toString": true, "hasOwnProperty": null}';
      const before = Object.getOwnPropertyNames(Object.prototype).sort();
      assert.strictEqual(ts(json), lines(
        'interface Root {',
        '  __proto__: number;',
        '  constructor: string;',
        '  toString: boolean;',
        '  hasOwnProperty: null;',
        '}',
      ));
      assert.strictEqual(go(json), lines(
        'type Root struct {',
        '\tProto          int         `json:"__proto__"`',
        '\tConstructor    string      `json:"constructor"`',
        '\tToString       bool        `json:"toString"`',
        '\tHasOwnProperty interface{} `json:"hasOwnProperty"`',
        '}',
      ));
      assert.strictEqual(py(json), lines(
        'from typing import TypedDict',
        '',
        '',
        'class Root(TypedDict):',
        '    __proto__: int',
        '    constructor: str',
        '    toString: bool',
        '    hasOwnProperty: None',
      ));
      // Nested objects under those keys are named after them without looking anything up.
      assert.ok(ts('{"__proto__":{"a":1},"constructor":{"b":2}}').includes('interface Proto {\n  a: number;\n}'));
      assert.deepStrictEqual(Object.getOwnPropertyNames(Object.prototype).sort(), before);
      assert.strictEqual(({} as Record<string, unknown>).a, undefined);
    });

    test('invalid input is refused with a message', () => {
      const cases: [string, RegExp][] = [
        ['{"a":', /^the selection is not valid JSON/],
        ['{a:1}', /^the selection is not valid JSON/],
        ['1', /^the JSON must be an object or an array of objects$/],
        ['"x"', /^the JSON must be an object or an array of objects$/],
        ['null', /^the JSON must be an object or an array of objects$/],
        ['[1,2]', /^the JSON must be an object or an array of objects$/],
        ['[{"a":1},2]', /^the JSON must be an object or an array of objects$/],
        ['[[{"a":1}]]', /^the JSON must be an object or an array of objects$/],
        ['[]', /^the JSON array is empty/],
      ];
      for (const convert of ALL) {
        for (const [json, message] of cases) {
          assert.throws(() => convert(json), (error: Error) => error instanceof DevInputError && message.test(error.message), json);
        }
      }
    });

    test(`nesting deeper than ${DEV_MAX_NESTING} levels is refused; ${DEV_MAX_NESTING} levels work`, () => {
      const nested = (depth: number) => '{"a":'.repeat(depth - 1) + '{}' + '}'.repeat(depth - 1);
      for (const convert of ALL) {
        assert.ok(convert(nested(DEV_MAX_NESTING)).length > 0);
        assert.throws(() => convert(nested(DEV_MAX_NESTING + 1)), /nested deeper than 200 levels/);
        assert.throws(() => convert(`{"a":${'['.repeat(DEV_MAX_NESTING)}${']'.repeat(DEV_MAX_NESTING)}}`), DevInputError);
      }
      // Very deep input fails fast without a stack overflow.
      assert.throws(() => ts('['.repeat(400_000) + ']'.repeat(400_000)), DevInputError);
    });

    test('a result over the budget throws EncOutputTooLargeError', () => {
      for (const convert of [jsonToTypeScript, jsonToGoStruct, jsonToPythonTypedDict]) {
        assert.throws(() => convert('{"a":1,"b":2}', '\n', 20), EncOutputTooLargeError);
      }
    });

    test('large input is converted quickly', function () {
      this.timeout(30_000);
      const manyKeys = `{${Array.from({ length: 60_000 }, (_, i) => `"k${i}":${i}`).join(',')}}`;
      const manyObjects = `[${Array.from({ length: 40_000 }, (_, i) => `{"k${i % 100}":{"x":${i}}}`).join(',')}]`;
      assert.ok(manyKeys.length < DEV_MAX_INPUT_LENGTH && manyObjects.length < DEV_MAX_INPUT_LENGTH);
      for (const convert of ALL) {
        for (const json of [manyKeys, manyObjects]) {
          const started = Date.now();
          convert(json);
          assert.ok(Date.now() - started < 5000, `${Date.now() - started} ms`);
        }
      }
    });
  });
});
