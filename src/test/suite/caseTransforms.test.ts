import * as assert from 'assert';
import * as changeCase from 'change-case';
import * as t from '../../handler/caseTransforms';

suite('Case Transforms (CASE-001..030) Unit Test Suite', () => {

  suite('ROADMAP examples', () => {
    const examples: [string, (value: string) => string, string, string][] = [
      ['CASE-001', t.swapCase, 'Hello World', 'hELLO wORLD'],
      ['CASE-002', t.sentenceCasePreserveAcronyms, 'the API URL is ready', 'The API URL is ready'],
      ['CASE-003', t.titleCaseApa, 'a guide through the woods', 'A Guide Through the Woods'],
      ['CASE-004', t.upperFirst, 'hello World', 'Hello World'],
      ['CASE-005', t.lowerFirst, 'HelloWorld', 'helloWorld'],
      ['CASE-006', t.cobolCase, 'userName', 'USER-NAME'],
      ['CASE-007', t.adaCase, 'user name', 'User_Name'],
      ['CASE-008', t.flatCase, 'User Name', 'username'],
      ['CASE-009', t.upperFlatCase, 'user name', 'USERNAME'],
      ['CASE-010', t.camelSnakeCase, 'user name id', 'user_Name_Id'],
      ['CASE-011', t.pascalSnakeCase, 'user name id', 'User_Name_Id'],
      ['CASE-012', t.alternatingWordsCase, 'one two three', 'ONE two THREE'],
      ['CASE-013', t.acronymCase, 'portable network graphics', 'PNG'],
      ['CASE-014', t.detectCase, 'user_name', 'snake_case'],
      ['CASE-015', t.cycleCase, 'userName', 'user_name'],
      ['CASE-016', t.upperKnownAcronyms, 'userId apiUrl', 'userID apiURL'],
      ['CASE-017', t.sentenceCaseEach, 'hello. how are you? fine.', 'Hello. How are you? Fine.'],
      ['CASE-018', t.capitalizeLines, 'foo bar\nbaz', 'Foo bar\nBaz'],
      ['CASE-019', t.lowerLineStart, 'Foo\nBar', 'foo\nbar'],
      ['CASE-020', (v) => t.upperLocale(v, 'tr'), 'istanbul', 'İSTANBUL'],
      ['CASE-021', (v) => t.lowerLocale(v, 'tr'), 'İSTANBUL', 'istanbul'],
      ['CASE-022', (v) => t.convertJsonKeys(v, changeCase.camelCase), '{"user_name":"a_b"}', '{"userName":"a_b"}'],
      ['CASE-023', (v) => t.convertJsonKeys(v, changeCase.snakeCase), '{"userName":1}', '{"user_name":1}'],
      ['CASE-024', (v) => t.convertJsonKeys(v, changeCase.paramCase), '{"userName":1}', '{"user-name":1}'],
      ['CASE-025', (v) => t.convertJsonKeys(v, changeCase.pascalCase), '{"user_name":1}', '{"UserName":1}'],
      ['CASE-026', t.cssVariableCase, 'primaryColor', '--primary-color'],
      ['CASE-027', t.bemCase, 'card title active', 'card__title--active'],
      ['CASE-028', t.pluralize, 'category\nchild', 'categories\nchildren'],
      ['CASE-029', t.singularize, 'categories\nchildren', 'category\nchild'],
      ['CASE-030', t.hashtagCase, 'hello world', '#HelloWorld'],
    ];
    examples.forEach(([id, fn, input, expected]) => {
      test(`${id}: ${JSON.stringify(input)} -> ${JSON.stringify(expected)}`, () => {
        assert.strictEqual(fn(input), expected);
      });
    });
  });

  test('Every transform returns empty string for empty input', () => {
    const fns: ((value: string) => string)[] = [
      t.swapCase, t.sentenceCasePreserveAcronyms, t.titleCaseApa, t.upperFirst, t.lowerFirst,
      t.cobolCase, t.adaCase, t.flatCase, t.upperFlatCase, t.camelSnakeCase, t.pascalSnakeCase,
      t.alternatingWordsCase, t.acronymCase, t.detectCase, t.cycleCase, t.upperKnownAcronyms,
      t.sentenceCaseEach, t.capitalizeLines, t.lowerLineStart,
      (v) => t.upperLocale(v, 'tr'), (v) => t.lowerLocale(v, 'tr'),
      t.cssVariableCase, t.bemCase, t.pluralize, t.singularize, t.hashtagCase,
    ];
    fns.forEach((fn, index) => assert.strictEqual(fn(''), '', `transform #${index}`));
    // Separators only must not produce a bare prefix either.
    assert.strictEqual(t.hashtagCase('  -_ '), '');
    assert.strictEqual(t.cssVariableCase('--'), '');
    assert.strictEqual(t.bemCase('__'), '');
    assert.strictEqual(t.acronymCase('...'), '');
  });

  suite('Case-only transforms', () => {
    test('CASE-001 keeps non-letters and handles non-ASCII', () => {
      assert.strictEqual(t.swapCase('a1-B_ç!'), 'A1-b_Ç!');
      assert.strictEqual(t.swapCase('ß'), 'SS');
    });

    test('CASE-002 lowers other words, keeps symbols and the pronoun I', () => {
      assert.strictEqual(t.sentenceCasePreserveAcronyms('THE Http2 SERVER, I think'), 'THE http2 SERVER, I think');
      assert.strictEqual(t.sentenceCasePreserveAcronyms('Hello World! Use HTTP2.'), 'Hello world! use HTTP2.');
      assert.strictEqual(t.sentenceCasePreserveAcronyms('  foo\tBar'), '  Foo\tbar');
    });

    test('CASE-003 APA hyphenated words, subtitles and minor words', () => {
      assert.strictEqual(t.titleCaseApa('a self-report of the API'), 'A Self-Report of the API');
      assert.strictEqual(t.titleCaseApa('the book: a study in the rain'), 'The Book: A Study in the Rain');
      assert.strictEqual(t.titleCaseApa('what is it? an answer'), 'What Is It? An Answer');
      assert.strictEqual(t.titleCaseApa('walk with me'), 'Walk With Me');
    });

    test('CASE-004/005 skip leading whitespace and keep the rest', () => {
      assert.strictEqual(t.upperFirst('  hello World'), '  Hello World');
      assert.strictEqual(t.lowerFirst('\tHELLO'), '\thELLO');
      assert.strictEqual(t.upperFirst('   '), '   ');
      assert.strictEqual(t.upperFirst('1abc'), '1abc');
    });

    test('CASE-012 numbering continues across lines within one selection', () => {
      assert.strictEqual(t.alternatingWordsCase('one two\nthree four'), 'ONE two\nTHREE four');
      assert.strictEqual(t.alternatingWordsCase('one\ntwo\nthree'), 'ONE\ntwo\nTHREE');
    });

    test('CASE-017 handles ! and ? and leading whitespace', () => {
      assert.strictEqual(t.sentenceCaseEach('  wow! really? yes.'), '  Wow! Really? Yes.');
      assert.strictEqual(t.sentenceCaseEach('e.g. this'), 'E.g. This');
      assert.strictEqual(t.sentenceCaseEach('1. item'), '1. Item');
    });

    test('CASE-018/019 keep CRLF, indentation and symbol-led lines', () => {
      assert.strictEqual(t.capitalizeLines('foo\r\n  bar\r\n\tbaz\r\n- qux'), 'Foo\r\n  Bar\r\n\tBaz\r\n- qux');
      assert.strictEqual(t.lowerLineStart('Foo\r\n  BAR\r\n\r\nBaz'), 'foo\r\n  bAR\r\n\r\nbaz');
    });
  });

  suite('Naming conventions', () => {
    test('CASE-006..011 convert camelCase input', () => {
      assert.strictEqual(t.cobolCase('itemCount'), 'ITEM-COUNT');
      assert.strictEqual(t.adaCase('userName'), 'User_Name');
      assert.strictEqual(t.flatCase('user_name'), 'username');
      assert.strictEqual(t.upperFlatCase('userName'), 'USERNAME');
      assert.strictEqual(t.camelSnakeCase('UserNameId'), 'user_Name_Id');
      assert.strictEqual(t.pascalSnakeCase('user-name'), 'User_Name');
    });

    test('CASE-013 splits identifiers and keeps function words', () => {
      assert.strictEqual(t.acronymCase('as soon as possible'), 'ASAP');
      assert.strictEqual(t.acronymCase('portableNetwork_graphics'), 'PNG');
    });

    test('CASE-026 is idempotent', () => {
      assert.strictEqual(t.cssVariableCase('--primary-color'), '--primary-color');
      assert.strictEqual(t.cssVariableCase('font size'), '--font-size');
    });

    test('CASE-027 with 1, 2 and 4+ words', () => {
      assert.strictEqual(t.bemCase('card'), 'card');
      assert.strictEqual(t.bemCase('menu item'), 'menu__item');
      assert.strictEqual(t.bemCase('card title is active'), 'card__title--is-active');
      assert.strictEqual(t.bemCase('CardTitleActive'), 'card__title--active');
    });

    test('CASE-030 from other styles', () => {
      assert.strictEqual(t.hashtagCase('foo_bar'), '#FooBar');
    });
  });

  suite('CASE-014 detectCase', () => {
    const cases: [string, string][] = [
      ['--primary-color', '--css-variable'],
      ['#HelloWorld', '#Hashtag'],
      ['user_name', 'snake_case'],
      ['USER_NAME', 'CONSTANT_CASE'],
      ['user_Name_Id', 'camel_Snake_Case'],
      ['User_Name', 'Pascal_Snake_Case'],
      ['user-name', 'kebab-case'],
      ['USER-NAME', 'COBOL-CASE'],
      ['User-Name', 'Train-Case'],
      ['user.name', 'dot.case'],
      ['user/name', 'path/case'],
      ['userName', 'camelCase'],
      ['UserName', 'PascalCase'],
      ['User', 'PascalCase'],
      ['user', 'flatcase'],
      ['USER', 'UPPERFLATCASE'],
      ['A', 'UPPERFLATCASE'],
      ['hello world', 'lower case'],
      ['HELLO WORLD', 'UPPER CASE'],
      ['Hello World', 'Title Case'],
      ['Hello world', 'Sentence case'],
      ['hello World', 'unknown'],
      ['URLParser', 'unknown'],
      ['user_Name-x', 'unknown'],
      ['  user_name \n', 'snake_case'],
      ['   ', ''],
    ];
    cases.forEach(([input, expected]) => {
      test(`${JSON.stringify(input)} -> ${expected}`, () => {
        assert.strictEqual(t.detectCase(input), expected);
      });
    });
  });

  suite('CASE-015 cycleCase', () => {
    test('cycles through five styles and returns to the start', () => {
      const seen: string[] = [];
      let value = 'userName';
      for (let i = 0; i < 5; i++) {
        value = t.cycleCase(value);
        seen.push(value);
      }
      assert.deepStrictEqual(seen, ['user_name', 'user-name', 'UserName', 'USER_NAME', 'userName']);
    });

    test('styles outside the cycle start from camelCase', () => {
      assert.strictEqual(t.cycleCase('hello world'), 'helloWorld');
      assert.strictEqual(t.cycleCase('User-Name'), 'userName');
      assert.strictEqual(t.cycleCase('user.name'), 'userName');
      assert.strictEqual(t.cycleCase('USER'), 'user');
      // A single lower-case word is flatcase -> camelCase, which is the same text.
      assert.strictEqual(t.cycleCase('user'), 'user');
    });
  });

  suite('CASE-016 upperKnownAcronyms', () => {
    test('keeps the leading hump of lowerCamelCase', () => {
      assert.strictEqual(t.upperKnownAcronyms('jsonId'), 'jsonID');
      assert.strictEqual(t.upperKnownAcronyms('apiUrl'), 'apiURL');
    });

    test('standalone words and snake_case parts are upper-cased', () => {
      assert.strictEqual(t.upperKnownAcronyms('the url and json'), 'the URL and JSON');
      assert.strictEqual(t.upperKnownAcronyms('api_url'), 'API_URL');
      assert.strictEqual(t.upperKnownAcronyms('HttpClient'), 'HttpClient');
      assert.strictEqual(t.upperKnownAcronyms('getHttpUrl'), 'getHTTPURL');
    });

    test('unknown words and alphanumeric words are unchanged', () => {
      assert.strictEqual(t.upperKnownAcronyms('idea'), 'idea');
      assert.strictEqual(t.upperKnownAcronyms('utf8'), 'utf8');
      assert.strictEqual(t.upperKnownAcronyms('rest it us ok'), 'rest it us ok');
    });

    test('dictionary contents', () => {
      ['api', 'id', 'url', 'http', 'json', 'yaml', 'uuid'].forEach((word) => assert.ok(t.KNOWN_ACRONYMS.has(word), word));
      ['rest', 'it', 'us', 'ok', 'io', 'os', 'ram'].forEach((word) => assert.ok(!t.KNOWN_ACRONYMS.has(word), word));
    });
  });

  suite('CASE-022..025 convertJsonKeys', () => {
    test('nested objects and arrays; values unchanged', () => {
      const input = '{"user_name":{"first_name":"a_b","tag_list":[{"item_id":1},"x_y"]},"n":null}';
      assert.strictEqual(
        t.convertJsonKeys(input, changeCase.camelCase),
        '{"userName":{"firstName":"a_b","tagList":[{"itemId":1},"x_y"]},"n":null}');
    });

    test('top-level arrays and primitives', () => {
      assert.strictEqual(t.convertJsonKeys('[{"a_b":1},2]', changeCase.camelCase), '[{"aB":1},2]');
      assert.strictEqual(t.convertJsonKeys('"a_b"', changeCase.camelCase), '"a_b"');
    });

    test('indentation of multi-line input is preserved', () => {
      const spaces = '{\n    "user_name": 1\n}';
      assert.strictEqual(t.convertJsonKeys(spaces, changeCase.camelCase), '{\n    "userName": 1\n}');
      const tabs = '{\n\t"user_name": [\n\t\t1\n\t]\n}';
      assert.strictEqual(t.convertJsonKeys(tabs, changeCase.camelCase), '{\n\t"userName": [\n\t\t1\n\t]\n}');
      const flat = '{\n"user_name": 1\n}';
      assert.strictEqual(t.convertJsonKeys(flat, changeCase.camelCase), '{\n  "userName": 1\n}');
    });

    test('surrounding whitespace of the selection is kept', () => {
      assert.strictEqual(t.convertJsonKeys('  {"a_b":1}\n', changeCase.camelCase), '  {"aB":1}\n');
    });

    test('keys whose conversion is empty are kept as-is', () => {
      assert.strictEqual(t.convertJsonKeys('{"ユーザー":1,"__":2}', changeCase.snakeCase), '{"ユーザー":1,"__":2}');
    });

    test('duplicate keys after conversion: last value wins', () => {
      assert.strictEqual(t.convertJsonKeys('{"a_b":1,"aB":2}', changeCase.camelCase), '{"aB":2}');
    });

    test('invalid JSON throws', () => {
      assert.throws(() => t.convertJsonKeys('{bad', changeCase.camelCase));
    });

    test('__proto__ is converted like any key without prototype pollution', () => {
      const input = '{"__proto__":{"polluted":true},"a_b":1}';
      assert.strictEqual(t.convertJsonKeys(input, changeCase.camelCase), '{"proto":{"polluted":true},"aB":1}');
      assert.strictEqual(t.convertJsonKeys(input, changeCase.snakeCase), '{"proto":{"polluted":true},"a_b":1}');
      assert.strictEqual(t.convertJsonKeys(input, changeCase.paramCase), '{"proto":{"polluted":true},"a-b":1}');
      assert.strictEqual(t.convertJsonKeys(input, changeCase.pascalCase), '{"Proto":{"Polluted":true},"AB":1}');
      assert.strictEqual(t.convertJsonKeys('{"constructor":{"prototype":1}}', changeCase.pascalCase), '{"Constructor":{"Prototype":1}}');
      assert.strictEqual(({} as Record<string, unknown>).polluted, undefined);
      assert.strictEqual(Object.prototype.hasOwnProperty('polluted'), false);
    });

    test('defineSafeProperty sets __proto__ as an own property', () => {
      const target = Object.create(null) as object;
      t.defineSafeProperty(target, '__proto__', 1);
      assert.strictEqual(JSON.stringify(target), '{"__proto__":1}');
      assert.strictEqual(Object.getPrototypeOf(target), null);
      assert.strictEqual(({} as Record<string, unknown>).polluted, undefined);
    });
  });

  suite('CASE-028/029 pluralize / singularize', () => {
    const pairs: [string, string][] = [
      ['userAccount', 'userAccounts'],
      ['userCategory', 'userCategories'],
      ['userChild', 'userChildren'],
      ['BOX', 'BOXES'],
      ['CATEGORY', 'CATEGORIES'],
      ['CHILD', 'CHILDREN'],
      ['Child', 'Children'],
      ['USER_BOX', 'USER_BOXES'],
      ['user_account', 'user_accounts'],
      ['user account', 'user accounts'],
      ['box', 'boxes'],
      ['church', 'churches'],
      ['dish', 'dishes'],
      ['day', 'days'],
      ['bus', 'buses'],
      ['status', 'statuses'],
      ['class', 'classes'],
      ['analysis', 'analyses'],
      ['person', 'people'],
      ['movie', 'movies'],
      ['house', 'houses'],
      ['fly', 'flies'],
      ['tie', 'ties'],
      ['sheep', 'sheep'],
      ['HTTPServer', 'HTTPServers'],
    ];
    pairs.forEach(([singular, plural]) => {
      test(`${singular} <-> ${plural}`, () => {
        assert.strictEqual(t.pluralize(singular), plural);
        assert.strictEqual(t.singularize(plural), singular);
      });
    });

    test('already plural / singular irregular words stay', () => {
      assert.strictEqual(t.pluralize('people'), 'people');
      assert.strictEqual(t.singularize('person'), 'person');
      assert.strictEqual(t.singularize('analysis'), 'analysis');
    });

    test('uncountable words do not change', () => {
      ['data', 'metadata', 'media', 'series', 'software'].forEach((word) => {
        assert.strictEqual(t.pluralize(word), word);
        assert.strictEqual(t.singularize(word), word);
      });
      assert.strictEqual(t.pluralize('datum'), 'datums');
    });

    test('only the last word of each line changes; trailing symbols, CRLF and blank lines are kept', () => {
      assert.strictEqual(t.pluralize('the user account;\r\n\r\n123\r\nbox'), 'the user accounts;\r\n\r\n123\r\nboxes');
      assert.strictEqual(t.singularize('boxes, \r\n'), 'box, \r\n');
    });

    test('a single capital letter hump does not throw', () => {
      assert.doesNotThrow(() => t.pluralize('userA'));
      assert.doesNotThrow(() => t.singularize('userA'));
    });

    test('findLastWordRange', () => {
      assert.deepStrictEqual(t.findLastWordRange('foo bar1;'), { start: 4, end: 7 });
      assert.strictEqual(t.findLastWordRange('123 !'), null);
    });

    test('dictionaries are consistent', () => {
      const singulars = t.IRREGULAR_PLURALS.map(([singular]) => singular);
      const plurals = t.IRREGULAR_PLURALS.map(([, plural]) => plural);
      assert.strictEqual(new Set(singulars).size, singulars.length, 'duplicate singular');
      assert.strictEqual(new Set(plurals).size, plurals.length, 'duplicate plural');
      [...singulars, ...plurals].forEach((word) => assert.ok(!t.UNCOUNTABLE_WORDS.has(word), word));
    });
  });

  suite('Performance (ReDoS guard)', () => {
    const within = (label: string, fn: () => void) => {
      const start = Date.now();
      fn();
      const elapsed = Date.now() - start;
      assert.ok(elapsed < 1000, `${label} took ${elapsed}ms`);
    };

    test('CASE-028/029 long inputs', () => {
      const inputs = ['a'.repeat(200000) + ' x', 'a'.repeat(200000) + '1'.repeat(200000), 'item\n'.repeat(100000)];
      inputs.forEach((input, index) => {
        within(`pluralize #${index}`, () => t.pluralize(input));
        within(`singularize #${index}`, () => t.singularize(input));
      });
    });

    test('CASE-017/018/019 long inputs', () => {
      within('sentenceCaseEach', () => t.sentenceCaseEach('. ' + ' '.repeat(200000) + '1'));
      within('capitalizeLines spaces', () => t.capitalizeLines(' '.repeat(200000) + '\nfoo'));
      within('capitalizeLines tabs', () => t.capitalizeLines('\t \n'.repeat(100000)));
      within('lowerLineStart', () => t.lowerLineStart(' '.repeat(200000) + '\nFoo'));
    });

    test('CASE-014 long non-matching inputs', () => {
      within('camel-like', () => assert.strictEqual(t.detectCase('aB'.repeat(100000) + '-'), 'unknown'));
      within('snake-like', () => assert.strictEqual(t.detectCase('a_'.repeat(100000) + '!'), 'unknown'));
    });

    test('CASE-016 long input', () => {
      within('upperKnownAcronyms', () => t.upperKnownAcronyms('apiUrl'.repeat(50000)));
    });
  });
});
