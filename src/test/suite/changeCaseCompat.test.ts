import * as assert from 'assert';
import * as compat from '../../handler/changeCaseCompat';

/**
 * Outputs recorded with change-case 4.1.2 (before the upgrade to v5). They are
 * literals on purpose: the v5-based wrapper must keep producing exactly these
 * values, which is the evidence that the case commands did not change.
 * `capitalUnderscore` is `capitalCase(v, { delimiter: '_' })` and `noCaseEmpty`
 * is `noCase(v, { delimiter: '' })` (used by adaCase / flatCase).
 */
type GoldenRow = [string, {
  camelCase: string;
  capitalCase: string;
  constantCase: string;
  dotCase: string;
  kebabCase: string;
  noCase: string;
  pascalCase: string;
  pathCase: string;
  sentenceCase: string;
  snakeCase: string;
  trainCase: string;
  capitalUnderscore: string;
  noCaseEmpty: string;
}];

const V4_GOLDEN: GoldenRow[] = [
  [
    "",
    {
      camelCase: "",
      capitalCase: "",
      constantCase: "",
      dotCase: "",
      kebabCase: "",
      noCase: "",
      pascalCase: "",
      pathCase: "",
      sentenceCase: "",
      snakeCase: "",
      trainCase: "",
      capitalUnderscore: "",
      noCaseEmpty: "",
    },
  ],
  [
    "userName",
    {
      camelCase: "userName",
      capitalCase: "User Name",
      constantCase: "USER_NAME",
      dotCase: "user.name",
      kebabCase: "user-name",
      noCase: "user name",
      pascalCase: "UserName",
      pathCase: "user/name",
      sentenceCase: "User name",
      snakeCase: "user_name",
      trainCase: "User-Name",
      capitalUnderscore: "User_Name",
      noCaseEmpty: "username",
    },
  ],
  [
    "XMLHttpRequest",
    {
      camelCase: "xmlHttpRequest",
      capitalCase: "Xml Http Request",
      constantCase: "XML_HTTP_REQUEST",
      dotCase: "xml.http.request",
      kebabCase: "xml-http-request",
      noCase: "xml http request",
      pascalCase: "XmlHttpRequest",
      pathCase: "xml/http/request",
      sentenceCase: "Xml http request",
      snakeCase: "xml_http_request",
      trainCase: "Xml-Http-Request",
      capitalUnderscore: "Xml_Http_Request",
      noCaseEmpty: "xmlhttprequest",
    },
  ],
  [
    "version 1.2.3",
    {
      camelCase: "version_1_2_3",
      capitalCase: "Version 1 2 3",
      constantCase: "VERSION_1_2_3",
      dotCase: "version.1.2.3",
      kebabCase: "version-1-2-3",
      noCase: "version 1 2 3",
      pascalCase: "Version_1_2_3",
      pathCase: "version/1/2/3",
      sentenceCase: "Version 1 2 3",
      snakeCase: "version_1_2_3",
      trainCase: "Version-1-2-3",
      capitalUnderscore: "Version_1_2_3",
      noCaseEmpty: "version123",
    },
  ],
  [
    "user_id2Name",
    {
      camelCase: "userId2Name",
      capitalCase: "User Id2 Name",
      constantCase: "USER_ID2_NAME",
      dotCase: "user.id2.name",
      kebabCase: "user-id2-name",
      noCase: "user id2 name",
      pascalCase: "UserId2Name",
      pathCase: "user/id2/name",
      sentenceCase: "User id2 name",
      snakeCase: "user_id2_name",
      trainCase: "User-Id2-Name",
      capitalUnderscore: "User_Id2_Name",
      noCaseEmpty: "userid2name",
    },
  ],
  [
    "ユーザー名",
    {
      camelCase: "",
      capitalCase: "",
      constantCase: "",
      dotCase: "",
      kebabCase: "",
      noCase: "",
      pascalCase: "",
      pathCase: "",
      sentenceCase: "",
      snakeCase: "",
      trainCase: "",
      capitalUnderscore: "",
      noCaseEmpty: "",
    },
  ],
  [
    "café au lait",
    {
      camelCase: "cafAuLait",
      capitalCase: "Caf Au Lait",
      constantCase: "CAF_AU_LAIT",
      dotCase: "caf.au.lait",
      kebabCase: "caf-au-lait",
      noCase: "caf au lait",
      pascalCase: "CafAuLait",
      pathCase: "caf/au/lait",
      sentenceCase: "Caf au lait",
      snakeCase: "caf_au_lait",
      trainCase: "Caf-Au-Lait",
      capitalUnderscore: "Caf_Au_Lait",
      noCaseEmpty: "cafaulait",
    },
  ],
  [
    "__proto__",
    {
      camelCase: "proto",
      capitalCase: "Proto",
      constantCase: "PROTO",
      dotCase: "proto",
      kebabCase: "proto",
      noCase: "proto",
      pascalCase: "Proto",
      pathCase: "proto",
      sentenceCase: "Proto",
      snakeCase: "proto",
      trainCase: "Proto",
      capitalUnderscore: "Proto",
      noCaseEmpty: "proto",
    },
  ],
  [
    "  Hello World  ",
    {
      camelCase: "helloWorld",
      capitalCase: "Hello World",
      constantCase: "HELLO_WORLD",
      dotCase: "hello.world",
      kebabCase: "hello-world",
      noCase: "hello world",
      pascalCase: "HelloWorld",
      pathCase: "hello/world",
      sentenceCase: "Hello world",
      snakeCase: "hello_world",
      trainCase: "Hello-World",
      capitalUnderscore: "Hello_World",
      noCaseEmpty: "helloworld",
    },
  ],
  [
    "TestV2",
    {
      camelCase: "testV2",
      capitalCase: "Test V2",
      constantCase: "TEST_V2",
      dotCase: "test.v2",
      kebabCase: "test-v2",
      noCase: "test v2",
      pascalCase: "TestV2",
      pathCase: "test/v2",
      sentenceCase: "Test v2",
      snakeCase: "test_v2",
      trainCase: "Test-V2",
      capitalUnderscore: "Test_V2",
      noCaseEmpty: "testv2",
    },
  ],
  [
    "a1b2",
    {
      camelCase: "a1b2",
      capitalCase: "A1b2",
      constantCase: "A1B2",
      dotCase: "a1b2",
      kebabCase: "a1b2",
      noCase: "a1b2",
      pascalCase: "A1b2",
      pathCase: "a1b2",
      sentenceCase: "A1b2",
      snakeCase: "a1b2",
      trainCase: "A1b2",
      capitalUnderscore: "A1b2",
      noCaseEmpty: "a1b2",
    },
  ],
  [
    "IDs",
    {
      camelCase: "iDs",
      capitalCase: "I Ds",
      constantCase: "I_DS",
      dotCase: "i.ds",
      kebabCase: "i-ds",
      noCase: "i ds",
      pascalCase: "IDs",
      pathCase: "i/ds",
      sentenceCase: "I ds",
      snakeCase: "i_ds",
      trainCase: "I-Ds",
      capitalUnderscore: "I_Ds",
      noCaseEmpty: "ids",
    },
  ],
  [
    "iPhone12Pro",
    {
      camelCase: "iPhone12Pro",
      capitalCase: "I Phone12 Pro",
      constantCase: "I_PHONE12_PRO",
      dotCase: "i.phone12.pro",
      kebabCase: "i-phone12-pro",
      noCase: "i phone12 pro",
      pascalCase: "IPhone12Pro",
      pathCase: "i/phone12/pro",
      sentenceCase: "I phone12 pro",
      snakeCase: "i_phone12_pro",
      trainCase: "I-Phone12-Pro",
      capitalUnderscore: "I_Phone12_Pro",
      noCaseEmpty: "iphone12pro",
    },
  ],
  [
    "İstanbul",
    {
      camelCase: "stanbul",
      capitalCase: "Stanbul",
      constantCase: "STANBUL",
      dotCase: "stanbul",
      kebabCase: "stanbul",
      noCase: "stanbul",
      pascalCase: "Stanbul",
      pathCase: "stanbul",
      sentenceCase: "Stanbul",
      snakeCase: "stanbul",
      trainCase: "Stanbul",
      capitalUnderscore: "Stanbul",
      noCaseEmpty: "stanbul",
    },
  ],
  [
    "foo--bar",
    {
      camelCase: "fooBar",
      capitalCase: "Foo Bar",
      constantCase: "FOO_BAR",
      dotCase: "foo.bar",
      kebabCase: "foo-bar",
      noCase: "foo bar",
      pascalCase: "FooBar",
      pathCase: "foo/bar",
      sentenceCase: "Foo bar",
      snakeCase: "foo_bar",
      trainCase: "Foo-Bar",
      capitalUnderscore: "Foo_Bar",
      noCaseEmpty: "foobar",
    },
  ],
  [
    "Ünïcödé Straße",
    {
      camelCase: "nCDStraE",
      capitalCase: "N C D Stra E",
      constantCase: "N_C_D_STRA_E",
      dotCase: "n.c.d.stra.e",
      kebabCase: "n-c-d-stra-e",
      noCase: "n c d stra e",
      pascalCase: "NCDStraE",
      pathCase: "n/c/d/stra/e",
      sentenceCase: "N c d stra e",
      snakeCase: "n_c_d_stra_e",
      trainCase: "N-C-D-Stra-E",
      capitalUnderscore: "N_C_D_Stra_E",
      noCaseEmpty: "ncdstrae",
    },
  ],
  [
    "ABC123def",
    {
      camelCase: "abc123def",
      capitalCase: "Abc123def",
      constantCase: "ABC123DEF",
      dotCase: "abc123def",
      kebabCase: "abc123def",
      noCase: "abc123def",
      pascalCase: "Abc123def",
      pathCase: "abc123def",
      sentenceCase: "Abc123def",
      snakeCase: "abc123def",
      trainCase: "Abc123def",
      capitalUnderscore: "Abc123def",
      noCaseEmpty: "abc123def",
    },
  ],
  [
    "hello.world/foo",
    {
      camelCase: "helloWorldFoo",
      capitalCase: "Hello World Foo",
      constantCase: "HELLO_WORLD_FOO",
      dotCase: "hello.world.foo",
      kebabCase: "hello-world-foo",
      noCase: "hello world foo",
      pascalCase: "HelloWorldFoo",
      pathCase: "hello/world/foo",
      sentenceCase: "Hello world foo",
      snakeCase: "hello_world_foo",
      trainCase: "Hello-World-Foo",
      capitalUnderscore: "Hello_World_Foo",
      noCaseEmpty: "helloworldfoo",
    },
  ],
  [
    "123abc",
    {
      camelCase: "123abc",
      capitalCase: "123abc",
      constantCase: "123ABC",
      dotCase: "123abc",
      kebabCase: "123abc",
      noCase: "123abc",
      pascalCase: "123abc",
      pathCase: "123abc",
      sentenceCase: "123abc",
      snakeCase: "123abc",
      trainCase: "123abc",
      capitalUnderscore: "123abc",
      noCaseEmpty: "123abc",
    },
  ],
  [
    "a_b_c",
    {
      camelCase: "aBC",
      capitalCase: "A B C",
      constantCase: "A_B_C",
      dotCase: "a.b.c",
      kebabCase: "a-b-c",
      noCase: "a b c",
      pascalCase: "ABC",
      pathCase: "a/b/c",
      sentenceCase: "A b c",
      snakeCase: "a_b_c",
      trainCase: "A-B-C",
      capitalUnderscore: "A_B_C",
      noCaseEmpty: "abc",
    },
  ],
  [
    "IIIi",
    {
      camelCase: "iiIi",
      capitalCase: "Ii Ii",
      constantCase: "II_II",
      dotCase: "ii.ii",
      kebabCase: "ii-ii",
      noCase: "ii ii",
      pascalCase: "IiIi",
      pathCase: "ii/ii",
      sentenceCase: "Ii ii",
      snakeCase: "ii_ii",
      trainCase: "Ii-Ii",
      capitalUnderscore: "Ii_Ii",
      noCaseEmpty: "iiii",
    },
  ],
  [
    "TITLE",
    {
      camelCase: "title",
      capitalCase: "Title",
      constantCase: "TITLE",
      dotCase: "title",
      kebabCase: "title",
      noCase: "title",
      pascalCase: "Title",
      pathCase: "title",
      sentenceCase: "Title",
      snakeCase: "title",
      trainCase: "Title",
      capitalUnderscore: "Title",
      noCaseEmpty: "title",
    },
  ],
  [
    "snake_Case-and-KEBAB",
    {
      camelCase: "snakeCaseAndKebab",
      capitalCase: "Snake Case And Kebab",
      constantCase: "SNAKE_CASE_AND_KEBAB",
      dotCase: "snake.case.and.kebab",
      kebabCase: "snake-case-and-kebab",
      noCase: "snake case and kebab",
      pascalCase: "SnakeCaseAndKebab",
      pathCase: "snake/case/and/kebab",
      sentenceCase: "Snake case and kebab",
      snakeCase: "snake_case_and_kebab",
      trainCase: "Snake-Case-And-Kebab",
      capitalUnderscore: "Snake_Case_And_Kebab",
      noCaseEmpty: "snakecaseandkebab",
    },
  ],
  [
    "ÀB",
    {
      camelCase: "b",
      capitalCase: "B",
      constantCase: "B",
      dotCase: "b",
      kebabCase: "b",
      noCase: "b",
      pascalCase: "B",
      pathCase: "b",
      sentenceCase: "B",
      snakeCase: "b",
      trainCase: "B",
      capitalUnderscore: "B",
      noCaseEmpty: "b",
    },
  ],
  [
    "x\ty\nz",
    {
      camelCase: "xYZ",
      capitalCase: "X Y Z",
      constantCase: "X_Y_Z",
      dotCase: "x.y.z",
      kebabCase: "x-y-z",
      noCase: "x y z",
      pascalCase: "XYZ",
      pathCase: "x/y/z",
      sentenceCase: "X y z",
      snakeCase: "x_y_z",
      trainCase: "X-Y-Z",
      capitalUnderscore: "X_Y_Z",
      noCaseEmpty: "xyz",
    },
  ],
  [
    "---",
    {
      camelCase: "",
      capitalCase: "",
      constantCase: "",
      dotCase: "",
      kebabCase: "",
      noCase: "",
      pascalCase: "",
      pathCase: "",
      sentenceCase: "",
      snakeCase: "",
      trainCase: "",
      capitalUnderscore: "",
      noCaseEmpty: "",
    },
  ],
  [
    "user_Name_ID",
    {
      camelCase: "userNameId",
      capitalCase: "User Name Id",
      constantCase: "USER_NAME_ID",
      dotCase: "user.name.id",
      kebabCase: "user-name-id",
      noCase: "user name id",
      pascalCase: "UserNameId",
      pathCase: "user/name/id",
      sentenceCase: "User name id",
      snakeCase: "user_name_id",
      trainCase: "User-Name-Id",
      capitalUnderscore: "User_Name_Id",
      noCaseEmpty: "usernameid",
    },
  ],
];

const actual = (value: string): GoldenRow[1] => ({
  camelCase: compat.camelCase(value),
  capitalCase: compat.capitalCase(value),
  constantCase: compat.constantCase(value),
  dotCase: compat.dotCase(value),
  kebabCase: compat.kebabCase(value),
  noCase: compat.noCase(value),
  pascalCase: compat.pascalCase(value),
  pathCase: compat.pathCase(value),
  sentenceCase: compat.sentenceCase(value),
  snakeCase: compat.snakeCase(value),
  trainCase: compat.trainCase(value),
  capitalUnderscore: compat.capitalCase(value, { delimiter: '_' }),
  noCaseEmpty: compat.noCase(value, { delimiter: '' }),
});

suite('change-case v4 compatibility (change-case 5 wrapper) Unit Test Suite', () => {

  suite('outputs match change-case 4.1.2', () => {
    V4_GOLDEN.forEach(([input, expected]) => {
      test(`${JSON.stringify(input)}`, () => {
        assert.deepStrictEqual(actual(input), expected);
      });
    });
  });

  suite('splitV4', () => {
    const cases: [string, string[]][] = [
      ['', []],
      ['---', []],
      [' _-./ ', []],
      ['  hello  world  ', ['hello', 'world']],
      ['__a__', ['a']],
      ['XMLHttpRequest', ['XML', 'Http', 'Request']],
      ['ABCDef', ['ABC', 'Def']],
      ['ABC', ['ABC']],
      ['userName2ID', ['user', 'Name2', 'ID']],
      ['a1B2', ['a1', 'B2']],
      ['café', ['caf']],
      ['ユーザー名', []],
      ['a\0b', ['a', 'b']],
    ];
    cases.forEach(([input, expected]) => {
      test(`${JSON.stringify(input)}`, () => {
        assert.deepStrictEqual(compat.splitV4(input), expected);
      });
    });

    test('long inputs are split in linear time', () => {
      const input = 'aA'.repeat(50000) + '-'.repeat(50000) + 'Ab'.repeat(50000);
      const started = Date.now();
      assert.strictEqual(compat.splitV4(input).length, 100001);
      assert.ok(Date.now() - started < 2000);
    });
  });

  suite('locale independence', () => {
    // v5 lower-cases with the host locale unless `locale: false` is given; the
    // wrapper must always behave like String#toLowerCase / String#toUpperCase.
    const inputs = ['TITLE', 'IIIi', 'Istanbul Izmir', 'ÄÖÜ IDs', 'i İ ı I'];
    inputs.forEach((input) => {
      test(`${JSON.stringify(input)}`, () => {
        const words = compat.splitV4(input);
        assert.strictEqual(compat.noCase(input), words.map((w) => w.toLowerCase()).join(' '));
        assert.strictEqual(compat.constantCase(input), words.map((w) => w.toUpperCase()).join('_'));
      });
    });
  });

  suite('options', () => {
    test('delimiter is honoured', () => {
      assert.strictEqual(compat.snakeCase('userName', { delimiter: '+' }), 'user+name');
      assert.strictEqual(compat.capitalCase('user name', { delimiter: '_' }), 'User_Name');
    });

    test('split and locale cannot be overridden by callers', () => {
      // Extra properties are dropped by the wrapper even when forced past the type.
      const forced = { delimiter: '-', split: (v: string) => [v], locale: 'tr' } as compat.CompatOptions;
      assert.strictEqual(compat.noCase('café Iİ', forced), 'caf-i');
    });
  });
});
