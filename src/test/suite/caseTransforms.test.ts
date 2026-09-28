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

    test('CASE-003 minor words after the first part of a hyphenated word stay lower-case', () => {
      assert.strictEqual(t.titleCaseApa('a state-of-the-art guide'), 'A State-of-the-Art Guide');
      assert.strictEqual(t.titleCaseApa('state-of-the-art'), 'State-of-the-Art');
      assert.strictEqual(t.titleCaseApa('a mother-in-law story'), 'A Mother-in-Law Story');
      assert.strictEqual(t.titleCaseApa('the up-to-date list'), 'The Up-to-Date List');
    });

    test('CASE-003 all-caps sentences are title-cased consistently; a single all-caps word is kept', () => {
      assert.strictEqual(t.titleCaseApa('THE LORD OF THE RINGS'), 'The Lord of the Rings');
      assert.strictEqual(t.titleCaseApa('STATE-OF-THE-ART TOOLS'), 'State-of-the-Art Tools');
      assert.strictEqual(t.titleCaseApa('API'), 'API');
      assert.strictEqual(t.titleCaseApa('the API of the web'), 'The API of the Web');
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

    test('whitespace, indentation and layout are kept byte for byte', () => {
      const spaces = '{\n    "user_name": 1\n}';
      assert.strictEqual(t.convertJsonKeys(spaces, changeCase.camelCase), '{\n    "userName": 1\n}');
      const tabs = '{\n\t"user_name": [\n\t\t1\n\t]\n}';
      assert.strictEqual(t.convertJsonKeys(tabs, changeCase.camelCase), '{\n\t"userName": [\n\t\t1\n\t]\n}');
      const flat = '{\n"user_name" :1 ,  "x_y":[ 1,2 ]\n}';
      assert.strictEqual(t.convertJsonKeys(flat, changeCase.camelCase), '{\n"userName" :1 ,  "xY":[ 1,2 ]\n}');
      const crlf = '{\r\n  "a_b": {\r\n    "c_d": true\r\n  }\r\n}';
      assert.strictEqual(t.convertJsonKeys(crlf, changeCase.camelCase), '{\r\n  "aB": {\r\n    "cD": true\r\n  }\r\n}');
    });

    test('surrounding whitespace of the selection is kept', () => {
      assert.strictEqual(t.convertJsonKeys('  {"a_b":1}\n', changeCase.camelCase), '  {"aB":1}\n');
    });

    test('values are never re-serialized (big integers, number forms, escapes)', () => {
      assert.strictEqual(
        t.convertJsonKeys('{"big_id": 12345678901234567890}', changeCase.camelCase),
        '{"bigId": 12345678901234567890}');
      assert.strictEqual(
        t.convertJsonKeys('{"a_b":1.0,"c_d":1e3,"e_f":-0.50E+2,"g_h":0}', changeCase.camelCase),
        '{"aB":1.0,"cD":1e3,"eF":-0.50E+2,"gH":0}');
      assert.strictEqual(
        t.convertJsonKeys('{"s_t":"\\u00e9\\n\\"q\\" \\\\","u_v":"\\/"}', changeCase.camelCase),
        '{"sT":"\\u00e9\\n\\"q\\" \\\\","uV":"\\/"}');
    });

    test('strings in value position that look like keys are not touched', () => {
      assert.strictEqual(
        t.convertJsonKeys('{"a_b":"c_d","e_f":["g_h",{"i_j":"k_l"}],"m_n":{"o_p":"q_r"}}', changeCase.camelCase),
        '{"aB":"c_d","eF":["g_h",{"iJ":"k_l"}],"mN":{"oP":"q_r"}}');
      assert.strictEqual(t.convertJsonKeys('["a_b",{"c_d":"e_f"},"g_h"]', changeCase.camelCase), '["a_b",{"cD":"e_f"},"g_h"]');
    });

    test('escaped quotes and brackets inside strings do not confuse the scanner', () => {
      assert.strictEqual(
        t.convertJsonKeys('{"a_b":"x\\",\\"y_z\\":{[","c_d":"}]"}', changeCase.camelCase),
        '{"aB":"x\\",\\"y_z\\":{[","cD":"}]"}');
    });

    test('keys with escapes: unchanged keys keep their escapes, converted keys are re-encoded', () => {
      assert.strictEqual(t.convertJsonKeys('{"\\u0061":1}', changeCase.camelCase), '{"\\u0061":1}');
      assert.strictEqual(t.convertJsonKeys('{"a\\u005fb":1}', changeCase.camelCase), '{"aB":1}');
    });

    test('key order is kept, including integer-like keys', () => {
      assert.strictEqual(t.convertJsonKeys('{"1":1,"b_c":2,"2":3}', changeCase.camelCase), '{"1":1,"bC":2,"2":3}');
    });

    test('keys whose conversion is empty are kept as-is', () => {
      assert.strictEqual(t.convertJsonKeys('{"ユーザー":1,"__":2}', changeCase.snakeCase), '{"ユーザー":1,"__":2}');
    });

    test('keys that would collide after conversion throw and nothing is lost', () => {
      assert.throws(() => t.convertJsonKeys('{"a_b":1,"aB":2}', changeCase.camelCase), t.JsonKeyCollisionError);
      assert.throws(() => t.convertJsonKeys('{"user_id":1,"userId":2}', changeCase.camelCase), /"user_id" and "userId" both become "userId"/);
      assert.throws(() => t.convertJsonKeys('{"x":{"a-b":1,"a_b":2}}', changeCase.camelCase), t.JsonKeyCollisionError);
    });

    test('the collision message quotes short keys in full', () => {
      assert.throws(
        () => t.convertJsonKeys('{"user_id":1,"userId":2}', changeCase.camelCase),
        (error: Error) => error.message === '"user_id" and "userId" both become "userId"',
      );
    });

    test('quoteKeyForMessage keeps up to 60 characters and adds an ellipsis beyond that', () => {
      assert.strictEqual(t.COLLISION_KEY_DISPLAY_LIMIT, 60);
      assert.strictEqual(t.quoteKeyForMessage(''), '""');
      assert.strictEqual(t.quoteKeyForMessage('a'.repeat(60)), `"${'a'.repeat(60)}"`);
      assert.strictEqual(t.quoteKeyForMessage('a'.repeat(61)), `"${'a'.repeat(60)}…"`);
      assert.strictEqual(t.quoteKeyForMessage('a\nb"c'), JSON.stringify('a\nb"c'));
    });

    test('quoteKeyForMessage never splits a surrogate pair', () => {
      assert.strictEqual(t.quoteKeyForMessage('a'.repeat(58) + '😀b'), `"${'a'.repeat(58)}😀…"`);
      assert.strictEqual(t.quoteKeyForMessage('a'.repeat(59) + '😀b'), `"${'a'.repeat(59)}…"`);
      assert.strictEqual(t.quoteKeyForMessage('😀'.repeat(40)), `"${'😀'.repeat(30)}…"`);
      assert.strictEqual(t.quoteKeyForMessage('a'.repeat(59) + '\ud800'), `"${'a'.repeat(59)}…"`);
      assert.strictEqual(t.quoteKeyForMessage('\ud800'), '"\\ud800"');
    });

    test('quoteKeyForMessage bounds the escaped form and never splits an escape sequence', () => {
      const quoted = t.quoteKeyForMessage('\u0001'.repeat(100));
      assert.strictEqual(quoted, `"${'\\u0001'.repeat(10)}…"`);
      assert.strictEqual(t.quoteKeyForMessage('a'.repeat(59) + '\n'), `"${'a'.repeat(59)}…"`);
      assert.strictEqual(t.quoteKeyForMessage('a'.repeat(58) + '\n'), JSON.stringify('a'.repeat(58) + '\n'));
    });

    test('colliding huge keys give a short message but keep the full keys on the error', () => {
      const first = `${'x'.repeat(100000)}_y`;
      const second = `${'x'.repeat(100000)}Y`;
      let caught: unknown;
      try {
        t.convertJsonKeys(JSON.stringify({ [first]: 1, [second]: 2 }), changeCase.camelCase);
      } catch (error) {
        caught = error;
      }
      assert.ok(caught instanceof t.JsonKeyCollisionError);
      assert.ok(caught.message.length <= 300, `length ${caught.message.length}`);
      const shown = `"${'x'.repeat(60)}…"`;
      assert.strictEqual(caught.message, `${shown} and ${shown} both become ${shown}`);
      assert.strictEqual(caught.first, first);
      assert.strictEqual(caught.second, second);
      assert.strictEqual(caught.converted, second);
    });

    test('the same name in different objects, and duplicate original keys, are not collisions', () => {
      assert.strictEqual(t.convertJsonKeys('[{"a_b":1},{"a_b":2}]', changeCase.camelCase), '[{"aB":1},{"aB":2}]');
      assert.strictEqual(t.convertJsonKeys('{"a_b":{"a_b":1}}', changeCase.camelCase), '{"aB":{"aB":1}}');
      assert.strictEqual(t.convertJsonKeys('{"a_b":1,"a_b":2}', changeCase.camelCase), '{"aB":1,"aB":2}');
    });

    test('invalid JSON throws', () => {
      assert.throws(() => t.convertJsonKeys('{bad', changeCase.camelCase));
      assert.throws(() => t.convertJsonKeys('{"a_b":1,}', changeCase.camelCase));
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

    test('deeply nested input does not overflow the stack', () => {
      const depth = 50000;
      const input = '{"a_b":'.repeat(depth) + '1' + '}'.repeat(depth);
      const expected = '{"aB":'.repeat(depth) + '1' + '}'.repeat(depth);
      assert.strictEqual(t.convertJsonKeys(input, changeCase.camelCase), expected);
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
      ['cache', 'caches'],
      ['userCache', 'userCaches'],
      ['niche', 'niches'],
      ['headache', 'headaches'],
      ['excuse', 'excuses'],
      ['fuse', 'fuses'],
      ['gas', 'gases'],
      ['alias', 'aliases'],
      ['bias', 'biases'],
      ['lens', 'lenses'],
      ['zombie', 'zombies'],
      ['calorie', 'calories'],
      ['match', 'matches'],
      ['branch', 'branches'],
      ['case', 'cases'],
      ['cause', 'causes'],
      ['response', 'responses'],
      ['process', 'processes'],
      ['bonus', 'bonuses'],
      ['virus', 'viruses'],
      ['API', 'APIs'],
      ['URL', 'URLs'],
      ['userID', 'userIDs'],
      ['apiURL', 'apiURLs'],
      ['fooXYZ', 'fooXYZs'],
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

    test('singular words already in the dictionary stay singular', () => {
      ['cache', 'alias', 'lens', 'gas', 'zombie', 'excuse'].forEach((word) => {
        assert.strictEqual(t.singularize(word), word);
      });
      ['caches', 'aliases', 'lenses'].forEach((word) => assert.strictEqual(t.pluralize(word), word));
    });

    test('all-caps words that are not known acronyms keep an upper-case suffix', () => {
      assert.strictEqual(t.pluralize('BOX'), 'BOXES');
      assert.strictEqual(t.pluralize('USER_BOX'), 'USER_BOXES');
      assert.strictEqual(t.singularize('URLS'), 'URL');
    });

    test('acronyms ending with S do not change in either direction', () => {
      ['DNS', 'HTTPS', 'CSS', 'OS', 'iOS', 'macOS', 'SMS', 'GPS', 'AWS', 'USER_DNS', 'getHTTPS', 'dns'].forEach((word) => {
        assert.strictEqual(t.pluralize(word), word);
        assert.strictEqual(t.singularize(word), word);
      });
    });

    test('acronym plurals whose last hump is Os are not treated as S-ending acronyms', () => {
      [['DTO', 'DTOs'], ['TODO', 'TODOs'], ['DAO', 'DAOs'], ['CEO', 'CEOs'], ['GPIO', 'GPIOs'], ['myDTO', 'myDTOs']]
        .forEach(([singular, plural]) => {
          assert.strictEqual(t.singularize(plural), singular);
          assert.strictEqual(t.pluralize(plural), plural);
        });
      ['iOS', 'macOS', 'getHTTPS', 'OS', 'os'].forEach((word) => {
        assert.strictEqual(t.pluralize(word), word);
        assert.strictEqual(t.singularize(word), word);
      });
    });

    test('all-caps words ending with S follow the same already-plural check as lower-case words', () => {
      [['CLASS', 'CLASSES'], ['STATUS', 'STATUSES'], ['BUS', 'BUSES'], ['GAS', 'GASES'], ['USER_STATUS', 'USER_STATUSES']]
        .forEach(([singular, plural]) => {
          assert.strictEqual(t.pluralize(singular), plural);
          assert.strictEqual(t.singularize(singular), singular);
        });
      assert.strictEqual(t.pluralize('ABS'), 'ABS');
      assert.strictEqual(t.singularize('ABS'), 'AB');
    });

    test('the guard length covers every file extension and S-ending acronym', () => {
      [...t.FILE_EXTENSIONS, ...t.S_ENDING_ACRONYMS].forEach((word) => {
        assert.ok(word.length <= t.MAX_GUARD_WORD_LENGTH, word);
        const text = `file.${word}`;
        if (t.FILE_EXTENSIONS.has(word)) {
          assert.strictEqual(t.pluralize(text), text);
          assert.strictEqual(t.singularize(text), text);
        }
      });
      t.S_ENDING_ACRONYMS.forEach((word) => {
        const upper = word.toUpperCase();
        assert.strictEqual(t.pluralize(upper), upper);
        assert.strictEqual(t.singularize(upper), upper);
      });
    });

    test('already plural words do not change with pluralize', () => {
      ['users', 'IDs', 'APIs', 'categories', 'children', 'boxes', 'userIds', 'USER_IDS', 'APIS', 'Users', 'statuses', 'classes']
        .forEach((word) => assert.strictEqual(t.pluralize(word), word));
    });

    test('singular -s / -ss / -us / -is words are still pluralized', () => {
      assert.strictEqual(t.pluralize('class'), 'classes');
      assert.strictEqual(t.pluralize('status'), 'statuses');
      assert.strictEqual(t.pluralize('bus'), 'buses');
      assert.strictEqual(t.pluralize('gas'), 'gases');
    });

    test('all-caps identifiers take an upper-case suffix', () => {
      [['USER_ID', 'USER_IDS'], ['USER_API', 'USER_APIS'], ['USER_BOX', 'USER_BOXES'], ['HTTP_API', 'HTTP_APIS']]
        .forEach(([singular, plural]) => {
          assert.strictEqual(t.pluralize(singular), plural);
          assert.strictEqual(t.singularize(plural), singular);
        });
      assert.strictEqual(t.pluralize('USER-ID'), 'USER-IDS');
      assert.strictEqual(t.singularize('APIS'), 'API');
    });

    test('stand-alone acronyms and acronyms in mixed-case identifiers keep a lower-case s', () => {
      [['API', 'APIs'], ['userID', 'userIDs'], ['the API', 'the APIs'], ['_API', '_APIs']].forEach(([singular, plural]) => {
        assert.strictEqual(t.pluralize(singular), plural);
        assert.strictEqual(t.singularize(plural), singular);
      });
    });

    test('known file extensions at the end of a line do not change', () => {
      ['file.ts', 'index.json', 'src/app.test.tsx', 'archive.tar.gz', 'index.js', '*.ts', 'FILE.TS'].forEach((text) => {
        assert.strictEqual(t.pluralize(text), text);
        assert.strictEqual(t.singularize(text), text);
      });
    });

    test('property access is still converted', () => {
      assert.strictEqual(t.pluralize('this.user'), 'this.users');
      assert.strictEqual(t.singularize('this.users'), 'this.user');
      assert.strictEqual(t.pluralize('obj.item;'), 'obj.items;');
      assert.strictEqual(t.pluralize('console.log'), 'console.logs');
    });

    test('a single letter is never changed', () => {
      ['s', 'a', 'I', 'x'].forEach((word) => {
        assert.strictEqual(t.pluralize(word), word);
        assert.strictEqual(t.singularize(word), word);
      });
      assert.strictEqual(t.singularize('plan a'), 'plan a');
      assert.strictEqual(t.pluralize('item s'), 'item s');
    });

    test('possessives and contractions are not changed', () => {
      ["user's", "it's", 'the users\'', "don't", "we're", 'user\u2019s', 'the users\u2019'].forEach((text) => {
        assert.strictEqual(t.pluralize(text), text);
        assert.strictEqual(t.singularize(text), text);
      });
      assert.strictEqual(t.singularize("the users\nuser's\nboxes\nit's"), "the user\nuser's\nbox\nit's");
      assert.strictEqual(t.pluralize("the user\nuser's\nbox\nit's"), "the users\nuser's\nboxes\nit's");
    });

    test('a single-quoted word is still converted', () => {
      assert.strictEqual(t.singularize("'users'"), "'user'");
      assert.strictEqual(t.pluralize("const name = 'user';"), "const name = 'users';");
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
      const inputs = [
        'a'.repeat(200000) + ' x',
        'a'.repeat(200000) + '1'.repeat(200000),
        'item\n'.repeat(100000),
        'A_'.repeat(100000) + 'ID',
        'A'.repeat(200000) + 'S',
        'x'.repeat(200000) + '.ts',
        's'.repeat(200000),
        'USER_ID\n'.repeat(100000),
        'foo.' + 'x'.repeat(200000),
        '_'.repeat(200000) + 'API',
      ];
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
