import * as assert from 'assert';
import { EncOutputTooLargeError, MAX_OUTPUT_LENGTH } from '../../handler/encodeTransforms';
import { chmodConvert, concatToTemplate, removeConsoleLog, semverBump, sortImports } from '../../handler/devCode';
import { removeJsComments } from '../../handler/dev2Code';
import { hexToHsl, hslToHex, toggleHexLength } from '../../handler/devColor';
import { DEV_MAX_INPUT_LENGTH, DEV_MAX_NESTING, DevInputError } from '../../handler/devCommon';
import { curlToFetch, splitShellWords } from '../../handler/devCurl';
import { htmlToJsx, jsxAttributeName } from '../../handler/devHtmlJsx';
import { tokenizeJs } from '../../handler/devJsLexer';
import { DEV_COMMAND_ENTRIES } from '../../handler/devTransforms';

const B = MAX_OUTPUT_LENGTH;
const lines = (...parts: string[]) => parts.join('\n');
const refuses = (convert: () => string, message: RegExp) =>
  assert.throws(convert, (error: Error) => error instanceof DevInputError && message.test(error.message), String(message));

const removeLogs = (text: string) => removeConsoleLog(text, B);
const sort = (text: string) => sortImports(text, B);
const template = (text: string) => concatToTemplate(text, B);
const curl = (text: string, eol = '\n') => curlToFetch(text, eol, B);
const jsx = (html: string) => htmlToJsx(html, B);

suite('Developer Colors, Code, curl and HTML (DEV-020..029, DEV-035) Test Suite', () => {

  suite('DEV-020 hex-to-hsl', () => {
    test('3, 4, 6 and 8 digits, with or without #, any case', () => {
      assert.strictEqual(hexToHsl('#ff0000', B), 'hsl(0, 100%, 50%)');
      assert.strictEqual(hexToHsl('00FF00', B), 'hsl(120, 100%, 50%)');
      assert.strictEqual(hexToHsl('#abc', B), 'hsl(210, 25%, 73%)');
      assert.strictEqual(hexToHsl('#000', B), 'hsl(0, 0%, 0%)');
      assert.strictEqual(hexToHsl('#fff', B), 'hsl(0, 0%, 100%)');
      assert.strictEqual(hexToHsl('#808080', B), 'hsl(0, 0%, 50%)');
      assert.strictEqual(hexToHsl('#ff00ff80', B), 'hsla(300, 100%, 50%, 0.5)');
      assert.strictEqual(hexToHsl('#f00f', B), 'hsla(0, 100%, 50%, 1)');
      assert.strictEqual(hexToHsl('#0000ff40', B), 'hsla(240, 100%, 50%, 0.25)');
    });

    test('each line on its own; blank lines and the spaces around a color are kept', () => {
      assert.strictEqual(hexToHsl('  #ff0000\r\n\r\n\t#00f  ', B), '  hsl(0, 100%, 50%)\r\n\r\n\thsl(240, 100%, 50%)  ');
    });

    test('anything else is refused, naming the line', () => {
      refuses(() => hexToHsl('#ff000', B), /^"#ff000" is not a hex color/);
      refuses(() => hexToHsl('#fff\nred', B), /^line 2: "red" is not a hex color/);
      refuses(() => hexToHsl('#ggg', B), /is not a hex color/);
    });
  });

  suite('DEV-021 hsl-to-hex', () => {
    test('commas or spaces, deg, alpha as a number or a percentage', () => {
      assert.strictEqual(hslToHex('hsl(120, 100%, 25%)', B), '#008000');
      assert.strictEqual(hslToHex('hsl(0 100% 50%)', B), '#ff0000');
      assert.strictEqual(hslToHex('HSL(240deg, 100%, 50%)', B), '#0000ff');
      assert.strictEqual(hslToHex('hsla(120, 100%, 25%, 0.5)', B), '#00800080');
      assert.strictEqual(hslToHex('hsl(120 100% 25% / 50%)', B), '#00800080');
      assert.strictEqual(hslToHex('hsla(0, 100%, 50%, 1)', B), '#ff0000');
      assert.strictEqual(hslToHex('hsl(0, 0%, 100%)', B), '#ffffff');
    });

    test('the hue wraps around; saturation, lightness and alpha are clamped', () => {
      assert.strictEqual(hslToHex('hsl(-120, 100%, 50%)', B), '#0000ff');
      assert.strictEqual(hslToHex('hsl(480, 100%, 50%)', B), '#00ff00');
      assert.strictEqual(hslToHex('hsl(0, 150%, 120%)', B), '#ffffff');
      assert.strictEqual(hslToHex('hsl(0, 100%, 50%, 2)', B), '#ff0000');
      assert.strictEqual(hslToHex('hsl(.5e1, 0%, 0%)', B), '#000000');
    });

    test('anything else is refused', () => {
      for (const value of ['hsl(120, 100, 25%)', 'hsl(120, 100%)', 'rgb(1, 2, 3)', 'hsl(1 2% 3% / 4 / 5)', 'hsl(1turn, 1%, 1%)', 'hsl(120, 100%, 25%']) {
        refuses(() => hslToHex(value, B), /is not an HSL color/);
      }
    });
  });

  suite('DEV-022 hex-shorten-expand', () => {
    test('pairs shorten, short colors expand; case and # are kept', () => {
      assert.strictEqual(toggleHexLength('#aabbcc', B), '#abc');
      assert.strictEqual(toggleHexLength('#AABBCCDD', B), '#ABCD');
      assert.strictEqual(toggleHexLength('abc', B), 'aabbcc');
      assert.strictEqual(toggleHexLength('#AbCd', B), '#AAbbCCdd');
      assert.strictEqual(toggleHexLength('#aabbcd\n\n#fff', B), '#aabbcd\n\n#ffffff');
    });

    test('anything else is refused', () => {
      refuses(() => toggleHexLength('#abcde', B), /is not a hex color/);
    });
  });

  suite('DEV-023 remove-console-log', () => {
    test('whole-line calls go; a ; and a line comment may follow', () => {
      assert.strictEqual(removeLogs(lines('a();', '  console.log(x);  // why', 'console.debug(1)', 'b();')), lines('a();', 'b();'));
      assert.strictEqual(removeLogs(lines('a();', 'console . log (x);')), 'a();');
      assert.strictEqual(removeLogs('console.log(1);\r\nconsole.log(2)\r\nb();'), 'b();');
    });

    test('a call over several lines goes with all its lines; brackets in strings and comments do not count', () => {
      const text = lines('a();', 'console.log("(", `${f(")")}`,', '  /* ) */ /\\)/, [1, {b: 2}]);', 'b();');
      assert.strictEqual(removeLogs(text), lines('a();', 'b();'));
    });

    test('when the last line goes, the line break before it goes too', () => {
      assert.strictEqual(removeLogs(lines('a();', 'console.log(x);')), 'a();');
      assert.strictEqual(removeLogs(lines('a();', 'console.log(x);', '')), lines('a();', ''));
      assert.strictEqual(removeLogs('console.log(x);'), '');
    });

    test('calls sharing a line, chained calls, other methods and unclosed calls stay', () => {
      const kept = [
        'if (x) console.log(y);',
        'a(); console.log(y);',
        'console.log(y).then();',
        'console.log(y) + 1;',
        'console.info(y);',
        'logger.console.log(y);',
        'console.log(y',
      ];
      for (const text of kept) {
        assert.strictEqual(removeLogs(text), text, text);
      }
    });

    test('a call that is the body of if / for / while / else / do / an arrow stays', () => {
      const kept = [
        lines('if (x)', '  console.log(y);', 'b();'),
        lines('for (const a of b)', '  console.log(a);'),
        lines('while (f(x))', '  console.log(x);'),
        lines('if (a) b();', 'else', '  console.log(y);'),
        lines('const f = () =>', '  console.log(y);'),
        lines('const x = a +', '  console.log(y);'),
      ];
      for (const text of kept) {
        assert.strictEqual(removeLogs(text), text, text);
      }
      // After a call with parentheses that is not a control statement, the call goes.
      assert.strictEqual(removeLogs(lines('a()', 'console.log(1)', 'b()')), lines('a()', 'b()'));
    });

    test('a call whose removal would join code across lines stays', () => {
      const kept = [
        // Without a ;, the call continues into a next line that starts with ( [ ` or an operator.
        lines('x = y', 'console.log(1)', '[1, 2].forEach(f)'),
        lines('x = y;', 'console.log(1)', '(a || b).c()'),
        lines('x = y;', 'console.log(1)', '`t`'),
        lines('{', '  console.log(1)', '  .then(f)', '}'),
        // With a ;, the code before the call would continue into the next line.
        lines('x = y', 'console.log(1);', '[1, 2].forEach(f)'),
        lines('x = y', 'console.log(1);', '/re/.test(s)'),
        lines('x = {}', 'console.log(1);', '(f)()'),
      ];
      for (const text of kept) {
        assert.strictEqual(removeLogs(text), text, text);
      }
      // The next line starts a statement of its own (JavaScript inserts the ;): the call goes.
      assert.strictEqual(removeLogs(lines('x = y', 'console.log(1)', 'f()')), lines('x = y', 'f()'));
      assert.strictEqual(removeLogs(lines('x = y', 'console.log(1)', '++i')), lines('x = y', '++i'));
      assert.strictEqual(removeLogs(lines('x = y;', 'console.log(1);', '[1, 2].forEach(f)')), lines('x = y;', '[1, 2].forEach(f)'));
      assert.strictEqual(removeLogs(lines('{', '  console.log(1);', '  [a] = b', '}')), lines('{', '  [a] = b', '}'));
      assert.strictEqual(removeLogs(lines('x = y', 'console.log(1)', '// c', '}')), lines('x = y', '// c', '}'));
    });

    test('calls inside strings, template literals and comments stay', () => {
      const text = lines('const s = `', 'console.log(1)', '`;', '/*', 'console.log(2)', '*/');
      assert.strictEqual(removeLogs(text), text);
    });

    test('unclosed strings or comments are refused', () => {
      refuses(() => removeLogs('console.log("a);'), /a " string is not closed/);
      refuses(() => removeLogs('a(); /* x'), /a \/\* comment is not closed/);
      refuses(() => removeLogs('`${'), /template literal is not closed/);
    });
  });

  suite('DEV-024 sort-imports', () => {
    test('the ROADMAP examples', () => {
      assert.strictEqual(sort(lines('import b from \'b\';', 'import a from \'a\';')), lines('import a from \'a\';', 'import b from \'b\';'));
      assert.strictEqual(
        sort(lines('import b from \'b\';', 'import \'polyfill\';', 'import z from \'z\';', 'import a from \'a\';')),
        lines('import b from \'b\';', 'import \'polyfill\';', 'import a from \'a\';', 'import z from \'z\';'));
    });

    test('all import forms; multi-line imports move as a whole with their comments', () => {
      const text = lines(
        'import {',
        '  y,',
        '  x,',
        '} from \'Zed\';',
        'import type { T } from "alpha"; // types',
        'import * as m from \'M\'',
        'import def, { a as b } from \'./local\' with { type: \'json\' };',
      );
      assert.strictEqual(sort(text), lines(
        'import def, { a as b } from \'./local\' with { type: \'json\' };',
        'import type { T } from "alpha"; // types',
        'import * as m from \'M\'',
        'import {',
        '  y,',
        '  x,',
        '} from \'Zed\';',
      ));
    });

    test('case is ignored first, then code units; equal specifiers keep their order', () => {
      assert.strictEqual(sort(lines('import b from \'b\';', 'import B from \'B\';', 'import a2 from \'a\';', 'import a1 from \'a\';')),
        lines('import a2 from \'a\';', 'import a1 from \'a\';', 'import B from \'B\';', 'import b from \'b\';'));
    });

    test('blank lines, comments, side-effect imports and other code end a run; line breaks stay', () => {
      const text = lines('import d from \'d\';', 'import c from \'c\';', '', 'import b from \'b\';', '// x', 'import a from \'a\';',
        'import z from \'z\';', 'const x = 1;', 'import y from \'y\';', 'import w from \'w\';');
      assert.strictEqual(sort(text), lines('import c from \'c\';', 'import d from \'d\';', '', 'import b from \'b\';', '// x',
        'import a from \'a\';', 'import z from \'z\';', 'const x = 1;', 'import w from \'w\';', 'import y from \'y\';'));
      assert.strictEqual(sort('import b from \'b\';\r\nimport a from \'a\';\r\n'), 'import a from \'a\';\r\nimport b from \'b\';\r\n');
      assert.strictEqual(sort('import \'b\';\nimport \'a\';'), 'import \'b\';\nimport \'a\';');
    });

    test('dynamic imports, import.meta, require and statements sharing a line are not moved', () => {
      const text = lines('import b from \'b\'; foo();', 'import(\'a\');', 'const c = require(\'c\');', 'import.meta.url;', 'import a from \'a\';');
      assert.strictEqual(sort(text), text);
    });
  });

  suite('DEV-025 concat-to-template', () => {
    test('the ROADMAP example and the spaces and ; around the expression', () => {
      assert.strictEqual(template('\'Hi \' + name + \'!\''), '`Hi ${name}!`');
      assert.strictEqual(template('  "a" + b;  '), '  `a${b}`;  ');
    });

    test('escapes: quotes are unescaped, ` and ${ are escaped, other escapes stay', () => {
      assert.strictEqual(template('\'it\\\'s \' + x + "\\"q\\"" + \'`${y}`\\n\\\\\''), '`it\'s ${x}"q"\\`\\${y}\\`\\n\\\\`');
    });

    test('template literal terms go in as they are; tagged templates are expressions', () => {
      assert.strictEqual(template('`a${b}` + c + \'d\''), '`a${b}${c}d`');
      assert.strictEqual(template('tag`x` + \'a\''), '`${tag`x`}a`');
    });

    test('terms before the first string are added together first', () => {
      assert.strictEqual(template('1 + 2 + \'a\' + 3 + 4'), '`${1 + 2}a${3}${4}`');
      assert.strictEqual(template('x + \'a\''), '`${x}a`');
    });

    test('operators that bind more tightly than + stay in the term', () => {
      assert.strictEqual(template('\'a\' + x * 2'), '`a${x * 2}`');
      assert.strictEqual(template('\'a\' + (x - 1)'), '`a${(x - 1)}`');
      assert.strictEqual(template('\'a\' + -x'), '`a${-x}`');
      assert.strictEqual(template('\'a\' + x * -1 + !y + typeof z + a?.b[c](d)'), '`a${x * -1}${!y}${typeof z}${a?.b[c](d)}`');
      assert.strictEqual(template('\'a\' + f(x, y - 1, z ? 1 : 2)'), '`a${f(x, y - 1, z ? 1 : 2)}`');
    });

    test('operators that bind as loosely as + or more loosely are refused', () => {
      for (const text of ['\'a\' + x - 1', '\'a\' + x == y', 'c ? \'a\' : \'b\' + x', '\'a\' + x || y', '\'a\' + x ?? y', '\'a\' + x, y',
        's = \'a\' + x', 's += \'a\' + x', '\'a\' + x++', '\'a\' + x in y', '() => \'a\' + x', '\'a\' + x & 1', 'return \'a\' + x']) {
        refuses(() => template(text), /top-level/);
      }
      refuses(() => template('\'a\' + x / 2'), /top-level "\/".*parentheses/);
      refuses(() => template('\'a\' + /re/'), /top-level "\/"/);
    });

    test('no string, a dangling +, a comment, an octal escape or unbalanced brackets are refused', () => {
      refuses(() => template('x + y'), /no string literal/);
      refuses(() => template('\'a\' +'), /nothing on one side/);
      refuses(() => template('\'a\' /* c */ + x'), /comment/);
      refuses(() => template('\'\\1\' + x'), /octal escape/);
      refuses(() => template('\'a\' + f(x'), /not balanced/);
      refuses(() => template('\'a\' + x)'), /not balanced/);
    });
  });

  suite('DEV-028 semver-bump', () => {
    test('patch / minor / major like npm semver.inc; build metadata is dropped', () => {
      const cases: [string, string, string, string][] = [
        ['1.2.3', '1.2.4', '1.3.0', '2.0.0'],
        ['v1.2.3+build.5', 'v1.2.4', 'v1.3.0', 'v2.0.0'],
        ['1.2.3-rc.1', '1.2.3', '1.3.0', '2.0.0'],
        ['1.2.0-rc.1', '1.2.0', '1.2.0', '2.0.0'],
        ['1.0.0-alpha', '1.0.0', '1.0.0', '1.0.0'],
        ['0.0.0', '0.0.1', '0.1.0', '1.0.0'],
      ];
      for (const [input, patch, minor, major] of cases) {
        assert.deepStrictEqual(['patch', 'minor', 'major'].map((part) => semverBump(input, part as 'patch', B)), [patch, minor, major], input);
      }
    });

    test('numbers of any size; lines, blank lines and spaces are kept', () => {
      assert.strictEqual(semverBump('99999999999999999999.0.9', 'patch', B), '99999999999999999999.0.10');
      assert.strictEqual(semverBump(' 1.0.0 \r\n\r\nV2.0.0', 'minor', B), ' 1.1.0 \r\n\r\nV2.1.0');
    });

    test('anything else is refused, naming the line', () => {
      for (const value of ['1.2', '01.2.3', '1.2.3-01', '1.2.3-', '1.2.3+', '1.2.3-a..b', 'x1.2.3', '1.2.3.4']) {
        refuses(() => semverBump(value, 'patch', B), /is not a semantic version/);
      }
      refuses(() => semverBump('1.2.3\nnext', 'patch', B), /^line 2: "next"/);
    });

    test('the command asks for the part first and refuses to run without it', () => {
      const entry = DEV_COMMAND_ENTRIES.find((candidate) => candidate.id === 'DEV-028')!;
      assert.deepStrictEqual(entry.quickPick?.items.map((item) => item.value), ['patch', 'minor', 'major']);
      assert.strictEqual(entry.transform('1.2.3', { eol: '\n', choice: 'major' }, B), '2.0.0');
      assert.throws(() => entry.transform('1.2.3', { eol: '\n' }, B), DevInputError);
      assert.throws(() => entry.transform('1.2.3', { eol: '\n', choice: 'huge' }, B), DevInputError);
    });
  });

  suite('DEV-029 chmod-convert', () => {
    test('numeric → symbolic, with setuid / setgid / sticky', () => {
      assert.strictEqual(chmodConvert('755\n644\n000\n4755\n2750\n1777\n7644\n0755', B),
        'rwxr-xr-x\nrw-r--r--\n---------\nrwsr-xr-x\nrwxr-s---\nrwxrwxrwt\nrwSr-Sr-T\nrwxr-xr-x');
    });

    test('symbolic (also with the file type and mark of ls -l) → numeric', () => {
      assert.strictEqual(chmodConvert('rwxr-xr-x\n-rw-r--r--\ndrwxrwxrwt\n-rwsr-xr-x\nrwSr-Sr-T\n-rw-r--r--@\ndrwxr-xr-x+', B),
        '755\n644\n1777\n4755\n7644\n644\n755');
    });

    test('anything else is refused', () => {
      for (const value of ['789', '75', '77777', 'rwxr-xr-', 'rwxr-xr-xx', 'xwrr-xr-x', 'rwtr-xr-x', 'u+x']) {
        refuses(() => chmodConvert(value, B), /is not a file mode/);
      }
    });
  });

  suite('DEV-026 curl-to-fetch', () => {
    test('the ROADMAP example: -d is sent as a form-urlencoded POST, like curl', () => {
      assert.strictEqual(curl('curl -X POST -d \'a=1\' https://example.com'), lines(
        'fetch(\'https://example.com\', {',
        '  method: \'POST\',',
        '  headers: {',
        '    \'Content-Type\': \'application/x-www-form-urlencoded\',',
        '  },',
        '  body: \'a=1\',',
        '});',
      ));
    });

    test('a plain GET; a $ prompt and line continuations; the document line break', () => {
      assert.strictEqual(curl('curl https://example.com'), 'fetch(\'https://example.com\');');
      assert.strictEqual(curl('$ curl \\\r\n  -I \\\n  "https://example.com/a b"', '\r\n'),
        'fetch(\'https://example.com/a b\', {\r\n  method: \'HEAD\',\r\n});');
    });

    test('headers, user, user agent, referer, cookies; the same header is joined', () => {
      const result = curl('curl -sSL -H \'Accept: text/html\' -H "X-A: \\"q\\"" -H \'accept: */*\' -u user:pw -A agent -e ref -b \'a=1\' -b b=2 https://x.test');
      assert.strictEqual(result, lines(
        'fetch(\'https://x.test\', {',
        '  headers: {',
        '    \'Accept\': \'text/html, */*\',',
        '    \'X-A\': \'"q"\',',
        '    \'Authorization\': \'Basic dXNlcjpwdw==\',',
        '    \'User-Agent\': \'agent\',',
        '    \'Referer\': \'ref\',',
        '    \'Cookie\': \'a=1; b=2\',',
        '  },',
        '});',
      ));
    });

    test('several -d, --data-urlencode, --json and -G', () => {
      assert.strictEqual(curl('curl -d a=1 --data-raw @b --data-urlencode \'q=a b&c\' --data-urlencode =x/y https://x.test'), lines(
        'fetch(\'https://x.test\', {',
        '  method: \'POST\',',
        '  headers: {',
        '    \'Content-Type\': \'application/x-www-form-urlencoded\',',
        '  },',
        '  body: \'a=1&@b&q=a%20b%26c&x%2Fy\',',
        '});',
      ));
      assert.strictEqual(curl('curl --json \'{"a":1}\' -H \'Content-Type: application/vnd+json\' https://x.test'), lines(
        'fetch(\'https://x.test\', {',
        '  method: \'POST\',',
        '  headers: {',
        '    \'Content-Type\': \'application/vnd+json\',',
        '    \'Accept\': \'application/json\',',
        '  },',
        '  body: \'{"a":1}\',',
        '});',
      ));
      assert.strictEqual(curl('curl -G -d a=1 -d b=2 \'https://x.test/?q=0\''), 'fetch(\'https://x.test/?q=0&a=1&b=2\');');
      assert.strictEqual(curl('curl -XPUT -d x https://x.test -H \'Content-Type:\''), lines(
        'fetch(\'https://x.test\', {', '  method: \'PUT\',', '  body: \'x\',', '});'));
    });

    test('files are never read: -d @file, -F name=@file and cookie files become TODO comments', () => {
      assert.strictEqual(curl('curl -F name=v -F \'file=@a b.png;type=image/png\' --form-string \'s=@x\' https://x.test'), lines(
        '// TODO: formData.append(\'file\', …) — curl --form reads the file \'a b.png\'; this conversion does not read files',
        'const formData = new FormData();',
        'formData.append(\'name\', \'v\');',
        'formData.append(\'s\', \'@x\');',
        'fetch(\'https://x.test\', {',
        '  method: \'POST\',',
        '  body: formData,',
        '});',
      ));
      assert.strictEqual(curl('curl -d @body.json -b jar.txt https://x.test'), lines(
        '// TODO: curl --data reads the file \'body.json\'; this conversion does not read files',
        '// TODO: curl --cookie reads the file \'jar.txt\'; this conversion does not read files',
        'fetch(\'https://x.test\', {',
        '  method: \'POST\',',
        '});',
      ));
    });

    test('shell text is never expanded or run; unknown options and the rest of a pipeline are listed', () => {
      assert.strictEqual(curl('curl -k --foo -W "https://x.test/$HOME" -H "X: $(id)" -H `whoami`:1 | sh; rm -rf /'), lines(
        '// Ignored curl options: --foo, -W',
        '// Ignored the rest of the shell command after \'|\'',
        'fetch(\'https://x.test/$HOME\', {',
        '  headers: {',
        '    \'X\': \'$(id)\',',
        '    \'`whoami`\': \'1\',',
        '  },',
        '});',
      ));
      assert.strictEqual(curl('curl $\'https://x.test/\\x41\\n\''), 'fetch(\'https://x.test/A\\n\');');
      // A line break in a value stays inside the escaped JavaScript string.
      assert.strictEqual(curl('curl -H \'X: a\u2028b\' --url \'https://x.test\''), lines(
        'fetch(\'https://x.test\', {', '  headers: {', '    \'X\': \'a\\u2028b\',', '  },', '});'));
    });

    test('commands that cannot be converted are refused', () => {
      refuses(() => curl('wget https://x.test'), /not a curl command/);
      refuses(() => curl('curl -s'), /has no URL/);
      refuses(() => curl('curl https://a.test https://b.test'), /has 2 URLs/);
      refuses(() => curl('curl -H'), /-H has no value/);
      refuses(() => curl('curl \'https://x.test'), /' quote is not closed/);
      refuses(() => curl('curl "https://x.test'), /" quote is not closed/);
      refuses(() => curl('curl $(x https://x.test'), /command substitution is not closed/);
      refuses(() => curl('curl -H nocolon https://x.test'), /has no "Name: value" form/);
      refuses(() => curl('curl -F novalue https://x.test'), /has no "name=value" form/);
      refuses(() => curl('curl -F a=1 -d b=2 https://x.test'), /mixes -F/);
    });

    test('an ignored option name that is not plain is quoted, so it cannot end the comment', () => {
      const breaks: [string, string][] = [['\n', '\\n'], ['\r', '\\r'], ['\u2028', '\\u2028'], ['\u2029', '\\u2029']];
      for (const [breakChar, escaped] of breaks) {
        const result = curl(`curl '--x${breakChar}alert(document.cookie)' https://a.example`);
        assert.strictEqual(result, lines(`// Ignored curl options: '--x${escaped}alert(document.cookie)'`, 'fetch(\'https://a.example\');'), escaped);
      }
      // An unknown short option ends its word: the rest is not read as more options.
      assert.strictEqual(curl('curl $\'-\\u2028evil()\' http://a'), lines('// Ignored curl options: \'-\\u2028evil()\'', 'fetch(\'http://a\');'));
      assert.strictEqual(curl('curl -Wv --foo-bar --http1.1 http://a'), lines('// Ignored curl options: -Wv, --foo-bar', 'fetch(\'http://a\');'));
    });

    test('the method depends on the options, not on the text of a TODO comment', () => {
      assert.strictEqual(curl('curl -H @"--data" http://a'), lines(
        '// TODO: curl -H reads the file \'--data\'; this conversion does not read files', 'fetch(\'http://a\');'));
      for (const option of ['-d @f', '--data-urlencode n@f', '--json @f']) {
        assert.ok(curl(`curl ${option} http://a`).includes('method: \'POST\''), option);
      }
    });

    test('-G puts the data before the #fragment; -G with --json or -F is refused', () => {
      assert.strictEqual(curl('curl -G -d \'a=1\' \'https://e.com#frag\''), 'fetch(\'https://e.com?a=1#frag\');');
      assert.strictEqual(curl('curl -G --data-urlencode \'q=a b\' \'https://e.com/p?x=1#top\''), 'fetch(\'https://e.com/p?x=1&q=a%20b#top\');');
      refuses(() => curl('curl -G --json \'{"a":1}\' https://e.com'), /mixes -G with --json/);
      refuses(() => curl('curl -G -F a=1 https://e.com'), /mixes -G with -F/);
    });

    test('a body with GET or HEAD is refused (fetch() throws a TypeError for it)', () => {
      refuses(() => curl('curl -X GET -d x https://e.com'), /body with the GET method/);
      refuses(() => curl('curl -X get -d x https://e.com'), /body with the GET method/);
      refuses(() => curl('curl -I -d x https://e.com'), /body with the HEAD method/);
      refuses(() => curl('curl --head https://e.com -d x'), /body with the HEAD method/);
      refuses(() => curl('curl -X HEAD -d a https://e.com'), /body with the HEAD method/);
      refuses(() => curl('curl -I -F a=1 https://e.com'), /body with the HEAD method/);
      refuses(() => curl('curl -X GET -d @f https://e.com'), /body with the GET method/);
      // With -G the data goes in the URL: no body.
      assert.strictEqual(curl('curl -I -G -d x https://e.com'), lines('fetch(\'https://e.com?x\', {', '  method: \'HEAD\',', '});'));
    });

    test('a URL without a scheme gets http://, as curl does', () => {
      assert.strictEqual(curl('curl example.com/a'), 'fetch(\'http://example.com/a\');');
      assert.strictEqual(curl('curl localhost:3000/a'), 'fetch(\'http://localhost:3000/a\');');
      assert.strictEqual(curl('curl HTTPS://example.com'), 'fetch(\'HTTPS://example.com\');');
      assert.strictEqual(curl('curl //example.com/a'), 'fetch(\'http://example.com/a\');');
    });

    test('shell words: quotes, escapes, comments', () => {
      assert.deepStrictEqual(splitShellWords('a\'b c\'"d\\"e\\x"\\ f # g\nh\'\''), { words: ['ab cd"e\\x f', 'h'] });
      assert.deepStrictEqual(splitShellWords('a ""').words, ['a', '']);
      assert.deepStrictEqual(splitShellWords('a > b'), { words: ['a'], stoppedAt: '>' });
    });
  });

  suite('DEV-027 / DEV-035 html-to-jsx', () => {
    test('attribute names', () => {
      const names: [string, string][] = [
        ['class', 'className'], ['for', 'htmlFor'], ['CLASS', 'className'], ['tabindex', 'tabIndex'], ['readonly', 'readOnly'],
        ['http-equiv', 'httpEquiv'], ['stroke-width', 'strokeWidth'], ['xlink:href', 'xlinkHref'], ['viewbox', 'viewBox'],
        ['viewBox', 'viewBox'], ['onclick', 'onClick'], ['onmouseover', 'onMouseOver'], ['ondblclick', 'onDoubleClick'],
        ['oncustom', 'onCustom'], ['data-fooBar', 'data-foobar'], ['aria-label', 'aria-label'], ['href', 'href'],
        ['constructor', 'constructor'], ['__proto__', '__proto__'],
      ];
      for (const [html, react] of names) {
        assert.strictEqual(jsxAttributeName(html), react, html);
      }
    });

    test('the ROADMAP example; values; void elements; the spacing inside tags is kept', () => {
      assert.strictEqual(jsx('<label class="a" for="b">'), '<label className="a" htmlFor="b">');
      assert.strictEqual(jsx('<input type=text disabled value=\'say "hi"\'>'), '<input type="text" disabled value=\'say "hi"\' />');
      assert.strictEqual(jsx('<img src="a"\n     alt=\'it&apos;s "x"\'/>'), '<img src="a"\n     alt=\'it&apos;s "x"\' />');
      assert.strictEqual(jsx('<a title=a"b\'c&amp;>'), '<a title={\'a"b\\\'c&\'}>');
      assert.strictEqual(jsx('<br><hr/><BR></br><p/>'), '<br /><hr /><br /><p />');
      assert.strictEqual(jsx('<DIV Class="a"></DIV>'), '<div className="a"></div>');
    });

    test('style becomes an object', () => {
      assert.strictEqual(
        jsx('<p style="color: red; font-size: 12px; -webkit-transition: a; -ms-transform: b; --my-var: \'a;b\'; background: url(&quot;x;y&quot;);">'),
        '<p style={{ color: \'red\', fontSize: \'12px\', WebkitTransition: \'a\', msTransform: \'b\', \'--my-var\': \'\\\'a;b\\\'\', background: \'url("x;y")\' }}>');
      assert.strictEqual(jsx('<p style="">'), '<p style={{}}>');
      refuses(() => jsx('<p style="color">'), /style declaration "color"/);
    });

    test('text, comments, DOCTYPE, script and style', () => {
      assert.strictEqual(jsx('<!DOCTYPE html>\n<p>a {b} < c > d &amp; e</p>'), '<p>a {\'{\'}b{\'}\'} {\'<\'} c {\'>\'} d &amp; e</p>');
      assert.strictEqual(jsx('<!-- a */ b -->'), '{/* a * / b */}');
      assert.strictEqual(jsx('<script>if (a < b) { x = `${y}\\n`; }</script>'), '<script>{`if (a < b) { x = \\`\\${y}\\\\n\\`; }`}</script>');
      assert.strictEqual(jsx('<STYLE>a{}</Style>'), '<style>{`a{}`}</style>');
      assert.strictEqual(jsx('<div></div>\n<div></div>'), '<div></div>\n<div></div>');
    });

    test('unclosed or unsupported markup is refused', () => {
      refuses(() => jsx('<div class="a'), /attribute "class" of "<div" is not closed/);
      refuses(() => jsx('<div'), /"<div" is not closed/);
      refuses(() => jsx('<!-- x'), /comment is not closed/);
      refuses(() => jsx('<script>x'), /"<script>" element is not closed/);
      refuses(() => jsx('<![CDATA[x]]>'), /is not supported/);
      refuses(() => jsx('<div ="a">'), /unexpected "="/);
    });

    test('tag and attribute names that would be JSX syntax are refused', () => {
      refuses(() => jsx('<img {...evil()} src="a.png">'), /"\{\.\.\.evil\(\)\}" is not an attribute name/);
      refuses(() => jsx('<div {...alert(1)} class="a">x</div>'), /is not an attribute name/);
      refuses(() => jsx('<div{...evil()}>x</div>'), /"div\{\.\.\.evil\(\)\}" is not a tag name/);
      refuses(() => jsx('<b>x</b{evil()}>'), /"b\{evil\(\)\}" is not a tag name/);
      refuses(() => jsx('<br>x</br{evil()}>'), /is not a tag name/);
      refuses(() => jsx('<a x.y="1">'), /"x\.y" is not an attribute name/);
      refuses(() => jsx('<a @click="f">'), /is not an attribute name/);
      // Names with letters, digits, - _ and one : are kept.
      assert.strictEqual(
        jsx('<svg:rect xlink:href="a" data-x_1="1" stroke-width="2" _a></svg:rect><my-el>x</my-el>'),
        '<svg:rect xlinkHref="a" data-x_1="1" strokeWidth="2" _a></svg:rect><my-el>x</my-el>');
    });

    test('DEV-035 is the Replace variant of DEV-027', () => {
      const base = DEV_COMMAND_ENTRIES.find((entry) => entry.id === 'DEV-027')!;
      const replace = DEV_COMMAND_ENTRIES.find((entry) => entry.id === 'DEV-035')!;
      assert.strictEqual(replace.transform, base.transform);
      assert.deepStrictEqual([base.output, replace.output], ['new-tab', 'replace']);
    });
  });

  suite('JavaScript lexer', () => {
    test('strings, templates with nested substitutions, regex and division', () => {
      const kinds = (text: string) => tokenizeJs(text).filter((token) => token.kind !== 'space').map((token) => `${token.kind}:${token.text}`);
      assert.deepStrictEqual(kinds('a / b / c'), ['word:a', 'punct:/', 'word:b', 'punct:/', 'word:c']);
      assert.deepStrictEqual(kinds('x = /a\\/[/]/g'), ['word:x', 'punct:=', 'regex:/a\\/[/]/g']);
      assert.deepStrictEqual(kinds('`a${`b${c + "}"}`}` + 1'), ['template:`a${`b${c + "}"}`}`', 'punct:+', 'number:1']);
      assert.deepStrictEqual(kinds('1.5e-3 >>>= a?.b'), ['number:1.5e-3', 'punct:>>>=', 'word:a', 'punct:?.', 'word:b']);
    });

    test(`template literals nested more than ${DEV_MAX_NESTING} levels are refused without a stack overflow`, () => {
      refuses(() => String(tokenizeJs('`${'.repeat(DEV_MAX_NESTING + 1))), /nested more than/);
      assert.strictEqual(tokenizeJs(`${'`${'.repeat(DEV_MAX_NESTING - 1)}x${'}`'.repeat(DEV_MAX_NESTING - 1)}`).length, 1);
    });

    const split = (text: string) => tokenizeJs(text, { splitTemplates: true });
    const splitKinds = (text: string) => split(text).filter((token) => token.kind !== 'space').map((token) => `${token.kind}:${token.text}`);

    test('split mode: template chunks and the tokens of the code in ${…}', () => {
      assert.deepStrictEqual(splitKinds('`a${b /* c */}d${`e${f}`}g`'),
        ['template:`a${', 'word:b', 'comment:/* c */', 'template:}d${', 'template:`e${', 'word:f', 'template:}`', 'template:}g`']);
      // The code in ${…} is read with the same rules as outside: numbers, `?.5` and regular expressions.
      assert.deepStrictEqual(splitKinds('`${/re/.test(x) ? 1.5e-3 : a?.5:b}`'), [
        'template:`${', 'regex:/re/', 'punct:.', 'word:test', 'punct:(', 'word:x', 'punct:)', 'punct:?', 'number:1.5e-3', 'punct::',
        'word:a', 'punct:?', 'number:.5', 'punct::', 'word:b', 'template:}`',
      ]);
      assert.deepStrictEqual(splitKinds('`a\n${b}\\${c}`'), ['template:`a\n${', 'word:b', 'template:}\\${c}`'], 'a line break in a chunk stays in it');
      assert.deepStrictEqual(splitKinds('`${ {a: 1}.a }`'), ['template:`${', 'punct:{', 'word:a', 'punct::', 'number:1', 'punct:}', 'punct:.', 'word:a', 'template:}`']);
    });

    test('the default mode and the split mode find the same boundaries and throw the same errors', () => {
      const inputs = [
        'a / b / c', 'x = /a\\/[/]/g', '`a${`b${c + "}"}`}` + 1', '1.5e-3 >>>= a?.b', '`a${b /* c */}d${`e${f}`}g`',
        '`${/re/.test(x) ? 1.5e-3 : a?.5:b}`', '`${a / b / c}` / 2', '`${ {a: {b: 1}}.a }` + `${"}" + \'`\'}`',
        '`${f(// c\n  y)}`', '`${() => { return /*\n*/ x; }}`', 'x = `${`${`${a}`}`}` /re/', 'return `${x}` / 2',
        'const t = `a${x /* c */}b`;', '`${x} ` /* c */', 'f(`// a ${b} /* c */`)', '`${"/* s */" + /\\/\\*/.source}`',
        '`a\r\nb${c}\u2028`\n// end', 'tag`x${y}`.length',
      ];
      for (const input of inputs) {
        const whole = tokenizeJs(input);
        const parts = split(input);
        const outside = parts.filter((token) => !whole.some((t) => t.kind === 'template' && t.start <= token.start && token.end <= t.end));
        assert.deepStrictEqual(outside, whole.filter((token) => token.kind !== 'template'), input);
        for (const template of whole.filter((token) => token.kind === 'template')) {
          const inside = parts.filter((token) => template.start <= token.start && token.end <= template.end);
          assert.strictEqual(inside.map((token) => token.text).join(''), template.text, input);
          assert.strictEqual(inside[0].start, template.start, input);
          assert.strictEqual(inside[inside.length - 1].end, template.end, input);
        }
        assert.strictEqual(parts.map((token) => token.text).join(''), input, input);
      }
      // The messages are the ones the template scanner gave before it was merged into the main loop.
      const errors: [string, string][] = [
        ['`a', 'a ` template literal is not closed'],
        ['`${a', 'a ` template literal is not closed'],
        ['`${"a}`', 'a " string is not closed'],
        ['`${\'a}`', 'a \' string is not closed'],
        ['`${a /* b}`', 'a /* comment is not closed'],
        ['`${a // b}`', 'a ` template literal is not closed'],
        ['`${ /a}`', 'a regular expression is not closed'],
        ['`${`${`', 'a ` template literal is not closed'],
        ['`${a}', 'a ` template literal is not closed'],
        ['`${{}`', 'a ` template literal is not closed'],
        ['`' + '${`'.repeat(DEV_MAX_NESTING + 1), `the template literals are nested more than ${DEV_MAX_NESTING} levels deep`],
      ];
      for (const [input, message] of errors) {
        for (const run of [() => tokenizeJs(input), () => split(input)]) {
          assert.throws(run, (error: Error) => error instanceof DevInputError && error.message === message, input);
        }
      }
    });

    test(`split mode: ${DEV_MAX_NESTING - 1} nested template literals work, deeper ones are refused without a stack overflow`, () => {
      const nested = `${'`${'.repeat(DEV_MAX_NESTING - 1)}x${'}`'.repeat(DEV_MAX_NESTING - 1)}`;
      assert.strictEqual(split(nested).map((token) => token.text).join(''), nested);
      refuses(() => String(split('`${'.repeat(DEV_MAX_NESTING + 1))), /nested more than/);
    });
  });

  suite('limits', () => {
    const ids = ['DEV-020', 'DEV-021', 'DEV-022', 'DEV-023', 'DEV-024', 'DEV-025', 'DEV-026', 'DEV-027', 'DEV-028', 'DEV-029'];

    test('a result over the budget throws EncOutputTooLargeError', () => {
      const inputs: Record<string, string> = {
        'DEV-020': '#fff', 'DEV-021': 'hsl(0, 0%, 0%)', 'DEV-022': '#fff', 'DEV-023': 'a();', 'DEV-024': 'import a from \'a\';',
        'DEV-025': '\'a\' + b', 'DEV-026': 'curl https://x.test', 'DEV-027': '<p>', 'DEV-028': '1.2.3', 'DEV-029': '755',
      };
      for (const id of ids) {
        const entry = DEV_COMMAND_ENTRIES.find((candidate) => candidate.id === id)!;
        assert.throws(() => entry.transform(inputs[id], { eol: '\n', choice: 'patch' }, 2), EncOutputTooLargeError, id);
      }
    });

    test('1,000,000 characters of hostile input are processed quickly', function () {
      this.timeout(60_000);
      const n = DEV_MAX_INPUT_LENGTH;
      const inputs = [
        '('.repeat(n / 2) + ')'.repeat(n / 2),
        'console.log(\n'.repeat(Math.floor(n / 13)),
        'import {\n'.repeat(Math.floor(n / 9)),
        'import \'a\' with {\n'.repeat(Math.floor(n / 18)),
        '\'a\' + '.repeat(Math.floor(n / 6) - 1) + '\'b\'',
        '<a '.repeat(Math.floor(n / 3)),
        '<script>'.repeat(n / 8),
        '#fff\n'.repeat(n / 5),
        `curl $(${'('.repeat(n - 10)}`,
        `curl ${'-H a:b '.repeat(Math.floor(n / 8))}`,
        '`${`${'.repeat(Math.floor(n / 6)),
        '\\'.repeat(n),
        'x\nconsole.log(1);\n'.repeat(Math.floor(n / 17)),
        `curl ${'-\u2028'.repeat(Math.floor(n / 3) - 5)} a`,
        '<a b '.repeat(Math.floor(n / 5)),
        // Many comments on one line, each dropping the spaces before it (rule R2 of DEVX-013).
        'f(' + 'a /*c*/, '.repeat(Math.floor((n - 3) / 9)) + ')',
        '( /*c*/ )'.repeat(Math.floor(n / 9)),
        'a /**/)'.repeat(Math.floor(n / 7)),
        'x /**/ ;'.repeat(n / 8),
      ];
      for (const id of ids) {
        const entry = DEV_COMMAND_ENTRIES.find((candidate) => candidate.id === id)!;
        for (const input of inputs) {
          const started = Date.now();
          try {
            entry.transform(input, { eol: '\n', choice: 'minor' }, 50_000_000);
          } catch (error) {
            assert.ok(error instanceof DevInputError || error instanceof EncOutputTooLargeError, `${id}: ${error}`);
          }
          assert.ok(Date.now() - started < 5000, `${id}: ${Date.now() - started} ms`);
        }
      }
      // DEVX-013 (remove comments) reads the same lexer: the same inputs, and the ones above with
      // many comments on one line, are processed in linear time too.
      for (const input of inputs) {
        const started = Date.now();
        try {
          removeJsComments(input, 50_000_000);
        } catch (error) {
          assert.ok(error instanceof DevInputError || error instanceof EncOutputTooLargeError, `DEVX-013: ${error}`);
        }
        assert.ok(Date.now() - started < 5000, `DEVX-013: ${Date.now() - started} ms`);
      }
    });
  });
});
