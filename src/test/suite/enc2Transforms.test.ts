import * as assert from 'assert';
import { EncInputError } from '../../handler/encodeTransforms';
import {
  BASE62_MAX_DECODE_LENGTH,
  BASE62_MAX_ENCODE_BYTES,
  ENC2_COMMAND_ENTRIES,
  Enc2Options,
  Enc2TransformName,
  enc2Transforms,
  estimateEnc2OutputLength,
  findUuFileNameProblem,
  isEnc2TransformName,
} from '../../handler/enc2Transforms';

const LF: Enc2Options = { eol: '\n' };
const run = (name: Enc2TransformName, text: string, options: Enc2Options = LF): string => enc2Transforms[name](text, options);
const fails = (name: Enc2TransformName, text: string, message: RegExp | string, options: Enc2Options = LF): void => {
  assert.throws(() => run(name, text, options), (error: unknown) => {
    assert.ok(error instanceof EncInputError, `${name} ${JSON.stringify(text)}: ${String(error)}`);
    if (typeof message === 'string') {
      assert.strictEqual(error.message, message, `${name} ${JSON.stringify(text)}`);
    } else {
      assert.match(error.message, message, `${name} ${JSON.stringify(text)}`);
    }
    return true;
  });
};

/** Characters that every round trip test goes through. */
const SAMPLES = ['', 'a', 'foobar', 'あいう', '😀 emoji', 'line1\nline2\r\n\ttab', '\u0000\u0000lead', '\u00ff\u0100', 'x'.repeat(200)];

suite('ENC2 Encoding and Escaping Transforms (ENCX-001..015) Test Suite', () => {

  test('the table: 22 commands in showcase order, 15 of them pure transforms', () => {
    assert.deepStrictEqual(ENC2_COMMAND_ENTRIES.map((entry) => entry.id), Array.from({ length: 22 }, (_, i) => `ENCX-${String(i + 1).padStart(3, '0')}`));
    assert.deepStrictEqual(ENC2_COMMAND_ENTRIES.filter((entry) => isEnc2TransformName(entry.name)).map((entry) => entry.id),
      ENC2_COMMAND_ENTRIES.slice(0, 15).map((entry) => entry.id));
    assert.deepStrictEqual(Object.keys(enc2Transforms), ENC2_COMMAND_ENTRIES.slice(0, 15).map((entry) => entry.name));
    assert.strictEqual(isEnc2TransformName('constructor'), false);
    assert.strictEqual(isEnc2TransformName('__proto__'), false);
  });

  suite('ENCX-001 / ENCX-002 Base32hex', () => {
    test('RFC 4648 §10 test vectors, both ways', () => {
      const vectors: [string, string][] = [
        ['', ''], ['f', 'CO======'], ['fo', 'CPNG===='], ['foo', 'CPNMU==='], ['foob', 'CPNMUOG='], ['fooba', 'CPNMUOJ1'], ['foobar', 'CPNMUOJ1E8======'],
      ];
      for (const [plain, encoded] of vectors) {
        assert.strictEqual(run('base32.encode-hex', plain), encoded, plain);
        assert.strictEqual(run('base32.decode-hex', encoded), plain, encoded);
      }
    });

    test('decoding: whitespace ignored, lowercase and omitted padding accepted; invalid input is an error', () => {
      assert.strictEqual(run('base32.decode-hex', 'cpnmu'), 'foo');
      assert.strictEqual(run('base32.decode-hex', 'CPNM U===\n'), 'foo');
      fails('base32.decode-hex', 'CPNMW===', '"W" at position 5 is not a Base32hex character');
      fails('base32.decode-hex', 'MZXW6===', '"Z" at position 2 is not a Base32hex character');
      // The position counts the whitespace of the selection too.
      fails('base32.decode-hex', 'CP NM U!==', '"!" at position 8 is not a Base32hex character');
      fails('base32.decode-hex', '\r\n\tCPNMU\n===A', '"=" at position 10 is not a Base32hex character');
      fails('base32.decode-hex', 'CPNMU==', 'the padding (=) is invalid');
      fails('base32.decode-hex', 'C', 'the length of the encoded text is invalid');
      fails('base32.decode-hex', 'CP', 'the last character has non-zero unused bits');
      fails('base32.decode-hex', 'U0======', 'the decoded bytes are not valid UTF-8 text');
      fails('base32.decode-hex', 'CP=NG===', /is not a Base32hex character/);
      fails('base32.encode-hex', 'a\ud800', /lone surrogate/);
    });

    test('round trips', () => {
      for (const sample of SAMPLES) {
        assert.strictEqual(run('base32.decode-hex', run('base32.encode-hex', sample)), sample, sample);
      }
    });
  });

  suite('ENCX-003 / ENCX-004 Base45', () => {
    test('RFC 9285 examples, both ways', () => {
      const vectors: [string, string][] = [['AB', 'BB8'], ['Hello!!', '%69 VD92EX0'], ['base-45', 'UJCLQE7W581'], ['ietf!', 'QED8WEX0'], ['', '']];
      for (const [plain, encoded] of vectors) {
        assert.strictEqual(run('base45.encode', plain), encoded, plain);
        assert.strictEqual(run('base45.decode', encoded), plain, encoded);
      }
    });

    test('decoding keeps every space (a Base45 character) and removes only the line breaks around the text', () => {
      assert.strictEqual(run('base45.decode', '%69 VD92EX0'), 'Hello!!');
      assert.strictEqual(run('base45.decode', 'QED8WEX0\n'), 'ietf!');
      assert.strictEqual(run('base45.decode', '\r\nQED8WEX0\r\n'), 'ietf!');
      assert.strictEqual(run('base45.decode', '\n\n'), '', 'only line breaks: empty');
      // Surrounding spaces are data, not trimmed: here they make a last pair above 255.
      fails('base45.decode', ' %69 VD92EX0  ', 'the last 2-character group exceeds 255');
      fails('base45.decode', 'QED8\nWEX0', 'Base45 text must not contain line breaks (select one line per selection)');
      fails('base45.decode', 'QED8\r\nWEX0', 'Base45 text must not contain line breaks (select one line per selection)');
      fails('base45.decode', 'QED\t8WEX0', 'invalid Base45 character "\\t" at position 4');
      fails('base45.decode', 'qED8WEX0', 'invalid Base45 character "q" at position 1');
      fails('base45.decode', 'QED8WEX0　', /invalid Base45 character "　" at position 9/);
      fails('base45.decode', 'GGW', 'the 3-character group at position 1 exceeds 65535');
      fails('base45.decode', 'BB8GGW', 'the 3-character group at position 4 exceeds 65535');
      fails('base45.decode', '\nGGW', 'the 3-character group at position 2 exceeds 65535');
      // The position counts the removed leading line breaks too, as the 3-character group error does.
      fails('base45.decode', '\n\nBBa', 'invalid Base45 character "a" at position 5');
      fails('base45.decode', '\r\nBB8 a\r\n', 'invalid Base45 character "a" at position 7');
      fails('base45.decode', '::', 'the last 2-character group exceeds 255');
      fails('base45.decode', 'BB8A', 'the length must not leave a remainder of 1 when divided by 3');
      fails('base45.decode', 'FGW', 'the decoded bytes are not valid UTF-8 text');
    });

    test('round trips', () => {
      for (const sample of SAMPLES) {
        assert.strictEqual(run('base45.decode', run('base45.encode', sample)), sample, sample);
      }
    });
  });

  suite('ENCX-005 / ENCX-006 Base62', () => {
    test('examples, leading zero bytes and round trips', () => {
      assert.strictEqual(run('base62.encode', 'hi'), '6x7');
      assert.strictEqual(run('base62.decode', '6x7'), 'hi');
      assert.strictEqual(run('base62.encode', '\u0000\u0000hi'), '006x7');
      assert.strictEqual(run('base62.decode', '006x7'), '\u0000\u0000hi');
      assert.strictEqual(run('base62.encode', '\u0000'), '0');
      assert.strictEqual(run('base62.encode', ''), '');
      assert.strictEqual(run('base62.decode', '6x 7\n'), 'hi', 'whitespace is ignored');
      for (const sample of SAMPLES) {
        assert.strictEqual(run('base62.decode', run('base62.encode', sample)), sample, sample);
      }
    });

    test('invalid characters and bytes are errors', () => {
      fails('base62.decode', '6x-7', '"-" at position 3 is not a Base62 character');
      // The position counts the whitespace of the selection too.
      fails('base62.decode', '6x 7!', '"!" at position 5 is not a Base62 character');
      fails('base62.decode', '\n\t6x\r\n 7😀', '"😀" at position 9 is not a Base62 character');
      fails('base62.decode', '2A', 'the decoded bytes are not valid UTF-8 text');
      fails('base62.encode', 'a\udc00', /lone surrogate/);
    });

    test('the input limits are checked before converting (the conversion is quadratic)', () => {
      assert.strictEqual(BASE62_MAX_ENCODE_BYTES, 10_000);
      assert.strictEqual(BASE62_MAX_DECODE_LENGTH, 13_500);
      const maxEncoded = run('base62.encode', 'x'.repeat(BASE62_MAX_ENCODE_BYTES));
      assert.ok(maxEncoded.length <= BASE62_MAX_DECODE_LENGTH, `${maxEncoded.length}`);
      assert.strictEqual(run('base62.decode', maxEncoded), 'x'.repeat(BASE62_MAX_ENCODE_BYTES));
      fails('base62.encode', 'x'.repeat(BASE62_MAX_ENCODE_BYTES + 1), 'the input is too long (limit: 10,000 UTF-8 bytes)');
      fails('base62.encode', 'あ'.repeat(3334), 'the input is too long (limit: 10,000 UTF-8 bytes)');
      // Rejected before any character is looked at: the invalid characters are not reported.
      fails('base62.decode', '-'.repeat(BASE62_MAX_DECODE_LENGTH + 1), 'the input is too long (limit: 13,500 characters)');
      const started = Date.now();
      fails('base62.encode', 'x'.repeat(10_000_000), 'the input is too long (limit: 10,000 UTF-8 bytes)');
      assert.ok(Date.now() - started < 2000);
    });
  });

  suite('ENCX-007 / ENCX-008 uuencode', () => {
    test('the example, the EOL of the document and the 45-byte lines', () => {
      assert.strictEqual(run('uu.encode', 'Cat', { eol: '\n', fileName: 'data' }), 'begin 644 data\n#0V%T\n`\nend');
      assert.strictEqual(run('uu.encode', 'Cat', { eol: '\r\n', fileName: 'notes.txt' }), 'begin 644 notes.txt\r\n#0V%T\r\n`\r\nend');
      assert.strictEqual(run('uu.encode', 'Cat', { eol: '\n' }), 'begin 644 data\n#0V%T\n`\nend', 'the default name');
      const lines = run('uu.encode', 'x'.repeat(100), LF).split('\n');
      assert.deepStrictEqual(lines.map((line) => line.length), [14, 61, 61, 17, 1, 3]);
      assert.deepStrictEqual(lines.map((line) => line[0]).slice(1, 4), ['M', 'M', '*']);
      assert.deepStrictEqual(run('uu.encode', '\u0000\u0000\u0000', LF).split('\n').slice(1), ['#````', '`', 'end'], 'zero is a backquote, never a space');
      assert.strictEqual(run('uu.encode', '', LF), 'begin 644 data\n`\nend');
    });

    test('decoding: begin / end lines and empty lines are skipped; a space also means zero', () => {
      assert.strictEqual(run('uu.decode', 'begin 644 data\n#0V%T\n`\nend'), 'Cat');
      assert.strictEqual(run('uu.decode', 'begin 600 ../../etc/passwd\r\n#0V%T\r\n`\r\nend\r\n'), 'Cat', 'the name is never used');
      assert.strictEqual(run('uu.decode', '#0V%T'), 'Cat', 'without header and trailer');
      assert.strictEqual(run('uu.decode', '\n#0V%T\n\n'), 'Cat');
      assert.strictEqual(run('uu.decode', '#    '), '\u0000\u0000\u0000');
      for (const sample of SAMPLES) {
        assert.strictEqual(run('uu.decode', run('uu.encode', sample, { eol: '\r\n' })), sample, sample);
      }
    });

    test('decoding errors: the line length, characters, text after the end and invalid UTF-8', () => {
      fails('uu.decode', '#0V%', 'line 1: the length character announces 3 bytes (4 characters), but the line has 3');
      fails('uu.decode', 'begin 644 a\n#0V%TT', 'line 2: the length character announces 3 bytes (4 characters), but the line has 5');
      fails('uu.decode', '#0v%T', 'line 1: "v" at position 3 is not a uuencode character');
      fails('uu.decode', '~0V%T', 'line 1: "~" at position 1 is not a uuencode length character');
      fails('uu.decode', '#0V%T\nend\n#0V%T', 'line 3: there is text after the "end" line');
      fails('uu.decode', '#0V%T\n`\n#0V%T', 'line 3: there is data after the terminating line');
      fails('uu.decode', '!_P``', 'the decoded bytes are not valid UTF-8 text');
    });

    test('the file name is limited to safe characters (no header injection)', () => {
      for (const valid of ['data', 'a.b_c-d', 'x'.repeat(64), '..']) {
        assert.strictEqual(findUuFileNameProblem(valid), undefined, valid);
      }
      for (const invalid of ['', 'x'.repeat(65), 'a b', 'a/b', 'a\\b', 'a\nend', 'a\r', 'a\u0000', 'ファイル', 'a:b']) {
        assert.strictEqual(findUuFileNameProblem(invalid), 'Enter 1 to 64 letters, digits, ".", "_" or "-".', JSON.stringify(invalid));
      }
      fails('uu.encode', 'Cat', 'the file name is not valid', { eol: '\n', fileName: 'a\nend' });
    });
  });

  suite('ENCX-009 Percent-encode every byte', () => {
    test('every byte, in uppercase hex', () => {
      assert.strictEqual(run('url.encode-all', 'a b'), '%61%20%62');
      assert.strictEqual(run('url.encode-all', 'あ~'), '%E3%81%82%7E');
      assert.strictEqual(decodeURIComponent(run('url.encode-all', 'line\r\n😀')), 'line\r\n😀');
      fails('url.encode-all', '\ud800', /lone surrogate/);
    });
  });

  suite('ENCX-010 CSS identifier', () => {
    test('the CSS.escape rules', () => {
      const cases: [string, string][] = [
        ['1foo bar', '\\31 foo\\ bar'],
        ['-', '\\-'],
        ['--', '--'],
        ['-1a', '-\\31 a'],
        ['a1', 'a1'],
        ['_x-y', '_x-y'],
        ['\u0000a', '\uFFFDa'],
        ['\u0001\u001f\u007f', '\\1 \\1f \\7f '],
        ['a.b#c', 'a\\.b\\#c'],
        ['日本😀', '日本😀'],
        ['\u0080', '\u0080'],
        ['9', '\\39 '],
        ['-9', '-\\39 '],
        ['a-9', 'a-9'],
      ];
      for (const [input, expected] of cases) {
        assert.strictEqual(run('escape.css-identifier', input), expected, JSON.stringify(input));
      }
    });
  });

  suite('ENCX-011 / ENCX-012 LDAP', () => {
    test('RFC 4515 filter values', () => {
      assert.strictEqual(run('escape.ldap-filter', 'a*b(c)'), 'a\\2ab\\28c\\29');
      assert.strictEqual(run('escape.ldap-filter', 'x\\y\u0000'), 'x\\5cy\\00');
      assert.strictEqual(run('escape.ldap-filter', 'Smith, John #1 あ'), 'Smith, John #1 あ');
    });

    test('RFC 4514 DN attribute values', () => {
      assert.strictEqual(run('escape.ldap-dn', 'Smith, John'), 'Smith\\, John');
      assert.strictEqual(run('escape.ldap-dn', '"a"+b;c<d>e\\f'), '\\"a\\"\\+b\\;c\\<d\\>e\\\\f');
      assert.strictEqual(run('escape.ldap-dn', '#a #b'), '\\#a #b', 'only a leading #');
      assert.strictEqual(run('escape.ldap-dn', ' a b '), '\\ a b\\ ', 'leading and trailing spaces only');
      assert.strictEqual(run('escape.ldap-dn', ' '), '\\ ');
      assert.strictEqual(run('escape.ldap-dn', 'a\u0000b'), 'a\\00b');
      assert.strictEqual(run('escape.ldap-dn', 'Ä=1'), 'Ä=1');
    });
  });

  suite('ENCX-013 XPath literal', () => {
    test('apostrophes, quotation marks and both', () => {
      assert.strictEqual(run('escape.xpath-literal', 'abc'), "'abc'");
      assert.strictEqual(run('escape.xpath-literal', 'say "hi"'), '\'say "hi"\'');
      assert.strictEqual(run('escape.xpath-literal', "it's"), '"it\'s"');
      assert.strictEqual(run('escape.xpath-literal', 'It\'s "x"'), 'concat(\'It\', "\'", \'s "x"\')');
      assert.strictEqual(run('escape.xpath-literal', '\'\'"'), 'concat("\'\'", \'"\')', 'a run of apostrophes is one argument');
      assert.strictEqual(run('escape.xpath-literal', '"\''), 'concat(\'"\', "\'")', 'always at least 2 arguments');
      assert.strictEqual(run('escape.xpath-literal', ''), "''");
    });
  });

  suite('ENCX-014 C string literal', () => {
    test('escapes, \\xHH for control and non-ASCII characters, one line', () => {
      assert.strictEqual(run('escape.c-string', 'a"b\n'), '"a\\"b\\n"');
      assert.strictEqual(run('escape.c-string', 'C:\\dir\r\n\t'), '"C:\\\\dir\\r\\n\\t"');
      assert.strictEqual(run('escape.c-string', '\u0000\u0007\u001b\u007f'), '"\\x00\\x07\\x1b\\x7f"');
      assert.strictEqual(run('escape.c-string', 'é'), '"\\xc3\\xa9"');
      assert.strictEqual(run('escape.c-string', '😀'), '"\\xf0\\x9f\\x98\\x80"');
      assert.strictEqual(run('escape.c-string', ''), '""');
      assert.ok(!run('escape.c-string', 'a\nb\r\nc').includes('\n'));
      fails('escape.c-string', 'a\ud800', /lone surrogate/);
    });

    test('a hex digit after \\xHH starts a new literal; other characters do not', () => {
      assert.strictEqual(run('escape.c-string', 'あa'), '"\\xe3\\x81\\x82""a"');
      assert.strictEqual(run('escape.c-string', 'あ9F'), '"\\xe3\\x81\\x82""9F"');
      assert.strictEqual(run('escape.c-string', 'あg'), '"\\xe3\\x81\\x82g"');
      assert.strictEqual(run('escape.c-string', '\u0001f\nf'), '"\\x01""f\\nf"', 'only right after a \\x escape');
      assert.strictEqual(run('escape.c-string', 'あ"a'), '"\\xe3\\x81\\x82\\"a"');
    });

    test('no trigraph is left: a ? after a ? is escaped, also in runs of three or more', () => {
      assert.strictEqual(run('escape.c-string', '??='), '"?\\?="');
      assert.strictEqual(run('escape.c-string', '???='), '"?\\?\\?="');
      assert.strictEqual(run('escape.c-string', '?a?'), '"?a?"');
      for (const text of ['??=', '???=', '????/', '?? ??']) {
        assert.ok(!run('escape.c-string', text).includes('??'), text);
      }
    });
  });

  suite('ENCX-015 C / Java unescape', () => {
    test('the example and every simple escape', () => {
      assert.strictEqual(run('escape.c-unescape', 'a\\x41\\101'), 'aAA');
      assert.strictEqual(run('escape.c-unescape', '\\a\\b\\f\\n\\r\\t\\v\\\\\\\'\\"\\?'), '\u0007\b\f\n\r\t\u000b\\\'"?');
    });

    test('octal: up to 3 digits, greedy; \\0 is the 1-digit case; above \\377 is an error', () => {
      assert.strictEqual(run('escape.c-unescape', '\\0'), '\u0000');
      assert.strictEqual(run('escape.c-unescape', '\\012'), '\n');
      assert.strictEqual(run('escape.c-unescape', '\\0123'), '\n3');
      assert.strictEqual(run('escape.c-unescape', '\\7a'), '\u0007a');
      assert.strictEqual(run('escape.c-unescape', '\\177'), '\u007f');
      fails('escape.c-unescape', '\\377', 'the decoded bytes are not valid UTF-8 text');
      assert.strictEqual(run('escape.c-unescape', '\\303\\251'), 'é');
      fails('escape.c-unescape', '\\400', 'octal escape \\400 at position 1 is out of range (max \\377)');
      fails('escape.c-unescape', 'ab\\777', 'octal escape \\777 at position 3 is out of range (max \\377)');
      fails('escape.c-unescape', '\\8', 'unknown escape \\8 at position 1');
      fails('escape.c-unescape', '\\9', 'unknown escape \\9 at position 1');
    });

    test('hex: any number of digits, greedy (as in C); above \\xff is an error; the value never overflows', () => {
      assert.strictEqual(run('escape.c-unescape', '\\x41'), 'A');
      assert.strictEqual(run('escape.c-unescape', '\\x041'), 'A', 'leading zeros are fine while the value is at most 0xff');
      assert.strictEqual(run('escape.c-unescape', '\\x00000041'), 'A');
      assert.strictEqual(run('escape.c-unescape', '\\x4g'), '\u0004g');
      fails('escape.c-unescape', '\\x123', 'hex escape \\x123 at position 1 is out of range (max \\xff)');
      fails('escape.c-unescape', '\\x', '\\x at position 1 must be followed by a hex digit');
      fails('escape.c-unescape', '\\xg', '\\x at position 1 must be followed by a hex digit');
      fails('escape.c-unescape', `\\x${'f'.repeat(100_000)}`, 'hex escape \\xffffffff… at position 1 is out of range (max \\xff)');
      assert.strictEqual(run('escape.c-unescape', '\\xe3\\x81\\x82'), 'あ');
      fails('escape.c-unescape', '\\xff', 'the decoded bytes are not valid UTF-8 text');
      fails('escape.c-unescape', '\\xe3\\x81', 'the decoded bytes are not valid UTF-8 text');
    });

    test('\\u and \\U: exact digit counts, surrogate pairs joined, lone surrogates and values above U+10FFFF rejected', () => {
      assert.strictEqual(run('escape.c-unescape', '\\u00e9'), 'é');
      assert.strictEqual(run('escape.c-unescape', '\\U0001F600'), '😀');
      assert.strictEqual(run('escape.c-unescape', '\\uD83D\\uDE00'), '😀');
      assert.strictEqual(run('escape.c-unescape', '\\u00e9x'), 'éx');
      fails('escape.c-unescape', '\\u00e', '\\u at position 1 must be followed by exactly 4 hex digits');
      fails('escape.c-unescape', '\\U1F600', '\\U at position 1 must be followed by exactly 8 hex digits');
      fails('escape.c-unescape', '\\uD83D', '\\uD83D at position 1 is a lone surrogate');
      fails('escape.c-unescape', '\\uD83Dx', '\\uD83D at position 1 is a lone surrogate');
      fails('escape.c-unescape', '\\uDE00', '\\uDE00 at position 1 is a lone surrogate');
      fails('escape.c-unescape', '\\uD83D\\u0041', '\\uD83D at position 1 is a lone surrogate');
      fails('escape.c-unescape', '\\U0000D83D', '\\U0000D83D at position 1 is a lone surrogate');
      fails('escape.c-unescape', '\\U00110000', '\\U00110000 at position 1 is beyond U+10FFFF');
    });

    test('unknown escapes, a trailing backslash and a backslash before a line break are errors', () => {
      fails('escape.c-unescape', 'a\\q', 'unknown escape \\q at position 2');
      fails('escape.c-unescape', '\\e', 'unknown escape \\e at position 1');
      fails('escape.c-unescape', '\\s', 'unknown escape \\s at position 1');
      fails('escape.c-unescape', '\\😀', 'unknown escape \\😀 at position 1');
      fails('escape.c-unescape', 'a\\', 'a backslash at position 2 is not followed by an escape');
      fails('escape.c-unescape', 'a\\\nb', /a backslash at position 2 is followed by a line break/);
      fails('escape.c-unescape', 'a\ud800', /lone surrogate/);
    });

    test('body mode: an unescaped " and raw line breaks stay as they are', () => {
      assert.strictEqual(run('escape.c-unescape', 'say "hi"\\n'), 'say "hi"\n');
      assert.strictEqual(run('escape.c-unescape', 'a"b'), 'a"b');
      assert.strictEqual(run('escape.c-unescape', '"abc'), '"abc', 'starts with " but does not end with one');
      assert.strictEqual(run('escape.c-unescape', '"abc\\"'), '"abc"', 'the last " is escaped');
      assert.strictEqual(run('escape.c-unescape', '"'), '"', 'a single " is not a literal');
      assert.strictEqual(run('escape.c-unescape', 'x\ny\r\nz'), 'x\ny\r\nz');
      assert.strictEqual(run('escape.c-unescape', 'aあ😀'), 'aあ😀');
    });

    test('literal sequence mode: adjacent literals are joined, each escape ends with its literal', () => {
      assert.strictEqual(run('escape.c-unescape', '"abc"'), 'abc');
      assert.strictEqual(run('escape.c-unescape', '"a" "b"'), 'ab');
      assert.strictEqual(run('escape.c-unescape', '"a"\n\t"b"\r\n"c"'), 'abc');
      assert.strictEqual(run('escape.c-unescape', '"\\x4""1"'), '\u00041');
      assert.strictEqual(run('escape.c-unescape', '"\\xe3\\x81\\x82""a"'), 'あa');
      assert.strictEqual(run('escape.c-unescape', '"a\\\\"'), 'a\\', 'the last " follows an escaped backslash');
      assert.strictEqual(run('escape.c-unescape', '""'), '');
      assert.strictEqual(run('escape.c-unescape', '"say \\"hi\\""'), 'say "hi"');
      fails('escape.c-unescape', '"a" and "b"', 'unexpected text between string literals at position 5');
      fails('escape.c-unescape', '"a"x"b"', 'unexpected text between string literals at position 4');
      fails('escape.c-unescape', '"a\nb"', 'a string literal must not contain a line break (position 3)');
      assert.strictEqual(run('escape.c-unescape', '"a" "b'), '"a" "b', 'not ending with " is body mode');
      assert.strictEqual(run('escape.c-unescape', '"a" "b\\"'), '"a" "b"', 'ending with an escaped " is body mode');
      fails('escape.c-unescape', '"a" "', 'the string literal at position 5 is not closed');
    });

    test('round trip: c-unescape(c-string(s)) === s', () => {
      const texts = [
        ...SAMPLES,
        'a"b\\c', '??', '???=', '?\\?', 'あa', 'あ9', '\u0001f', '\u0000abc', 'tab\there', 'cr\rlf\n', 'é😀𠮷', '\u007f\u0080\u07ff\u0800\uffff',
        Array.from({ length: 256 }, (_, i) => String.fromCharCode(i)).join(''),
      ];
      for (const text of texts) {
        const literal = run('escape.c-string', text);
        assert.strictEqual(run('escape.c-unescape', literal), text, JSON.stringify(literal));
      }
    });
  });

  suite('output size estimates', () => {
    test('every estimate is an upper bound of the actual length', () => {
      const inputs = [
        'a', 'abc', 'あいう', '😀😀', '\u0000\u0001-1', '-', '9', "'\"'", "a'b\"c'", '\n\r\t?"\\', '??????', 'あa'.repeat(50), 'x'.repeat(1000), '#  ',
      ];
      const encoded: Partial<Record<Enc2TransformName, string[]>> = {
        'base32.decode-hex': ['CPNMUOJ1E8======', 'cpnmu'],
        'base45.decode': ['%69 VD92EX0', 'QED8WEX0\n'],
        'base62.decode': ['006x7', '6x7'],
        'uu.decode': ['begin 644 data\n#0V%T\n`\nend', '#    '],
        'escape.c-unescape': ['"a" "b"', '\\x41\\101', '\\U0001F600'],
      };
      for (const options of [LF, { eol: '\r\n', fileName: 'x'.repeat(64) }]) {
        for (const name of Object.keys(enc2Transforms) as Enc2TransformName[]) {
          for (const text of [...inputs, ...(encoded[name] ?? [])]) {
            let result: string;
            try {
              result = run(name, text, options);
            } catch {
              continue;
            }
            assert.ok(result.length <= estimateEnc2OutputLength(name, text, options), `${name} ${JSON.stringify(text)}: ${result.length}`);
          }
        }
      }
    });
  });
});
