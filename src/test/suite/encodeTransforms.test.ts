import * as assert from 'assert';
import { domainToASCII, domainToUnicode } from 'node:url';
import { gunzipSync, gzipSync } from 'node:zlib';
import {
  BASE58_MAX_DECODE_LENGTH,
  BASE58_MAX_ENCODE_BYTES,
  ENC_COMMAND_ENTRIES,
  ENC_COMMANDS,
  EncCommand,
  EncInputError,
  EncOptions,
  encTransforms,
  estimateMaxOutputLength,
  GUNZIP_MAX_OUTPUT_BYTES,
  HTML_NAMED_ENTITIES,
  PUNYCODE_MAX_INPUT_LENGTH,
} from '../../handler/encodeTransforms';
import { ENC_ROADMAP_EXAMPLES } from './encodeExamples';

const LF: EncOptions = { eol: '\n' };

const run = (command: EncCommand, text: string, options: Partial<EncOptions> = {}): string =>
  encTransforms[command](text, { ...LF, ...options });

const assertInputError = (command: EncCommand, text: string, options: Partial<EncOptions> = {}) => {
  assert.throws(() => run(command, text, options), EncInputError, `${command}: ${JSON.stringify(text)}`);
};

/** Encoder / decoder pairs that must round-trip any text. */
const ROUND_TRIPS: [EncCommand, EncCommand][] = [
  ['html-encode', 'html-decode'],
  ['html-encode-numeric', 'html-decode'],
  ['unicode-escape', 'unicode-unescape'],
  ['unicode-escape-es6', 'unicode-unescape'],
  ['base64url-encode', 'base64url-decode'],
  ['base32-encode', 'base32-decode'],
  ['base58-encode', 'base58-decode'],
  ['hex-encode', 'hex-decode'],
  ['binary-encode', 'binary-decode'],
  ['qp-encode', 'qp-decode'],
  ['ascii85-encode', 'ascii85-decode'],
  ['gzip', 'gunzip'],
  ['form-encode', 'form-decode'],
  ['base64-encode-each-line', 'base64-decode-each-line'],
];

/** ASCII, Japanese, emoji, whitespace, line breaks, NUL and characters that expand when upper-cased or normalised. */
const REPRESENTATIVE_INPUTS = [
  'hello',
  'a',
  '',
  '日本語のテキスト',
  '😀👍🏽',
  ' \t spaces \t ',
  'line1\nline2\r\nline3\n',
  '\u0000\u0000abc\u0000',
  'ßﬃ\u212Aſ㍿',
  '<&>"\' mixed ASCII & 記号 😀\n',
  'x'.repeat(200),
];

suite('Encode Transforms (ENC-001..040) Test Suite', () => {

  test('34 transforms, 40 commands (34 basic + 6 Replace variants)', () => {
    assert.strictEqual(ENC_COMMANDS.length, 34);
    assert.strictEqual(new Set(ENC_COMMANDS).size, 34);
    assert.strictEqual(ENC_COMMAND_ENTRIES.length, 40);
    assert.strictEqual(ENC_COMMAND_ENTRIES.filter((e) => e.output === 'new-tab').length, 34);
    assert.strictEqual(ENC_COMMAND_ENTRIES.filter((e) => e.output === 'replace').length, 6);
    assert.deepStrictEqual(ENC_COMMAND_ENTRIES.slice(0, 34).map((e) => e.transform), [...ENC_COMMANDS]);
    assert.deepStrictEqual(Object.keys(ENC_ROADMAP_EXAMPLES), ENC_COMMAND_ENTRIES.map((e) => e.id));
  });

  suite('ROADMAP examples', () => {
    ENC_COMMAND_ENTRIES.forEach((entry) => {
      const example = ENC_ROADMAP_EXAMPLES[entry.id];
      test(`${entry.id} ${entry.name}`, () => {
        const options = example.shift === undefined ? {} : { shift: example.shift };
        assert.strictEqual(run(entry.transform, example.input, options), example.expected);
      });
    });
  });

  suite('invalid input throws EncInputError', () => {
    const invalid: [EncCommand, string][] = [
      ['html-decode', '&#0;'],
      ['html-decode', '&#x110000;'],
      ['html-decode', '&#xD800;'],
      ['html-decode', '&#55357;'],
      ['html-decode', '&#99999999999999999999;'],
      ['unicode-unescape', '\\u{110000}'],
      ['unicode-unescape', '\\ud83d'],
      ['unicode-unescape', '\\ude00'],
      ['unicode-unescape', '\\ud83dA'],
      ['unicode-unescape', '\\ud83d\\u0041'],
      ['unicode-unescape', '\\u{D800}'],
      ['unicode-unescape', '\\u{dfff}'],
      ['base64url-decode', 'Zm9vP'],
      ['base64url-decode', 'Zm9v+w'],
      ['base64url-decode', 'Zm9vPw='],
      ['base64url-decode', 'Zm9vPx'],
      ['base32-decode', 'MZXW6=='],
      ['base32-decode', 'MZXW1==='],
      ['base32-decode', 'MZXW7==='],
      ['base32-decode', 'MZX'],
      ['base58-decode', '0abc'],
      ['base58-decode', 'OIl'],
      ['base58-decode', '2NEpo7TZRRrLZSi2U'.replace('2', '+')],
      ['hex-decode', '6'],
      ['hex-decode', '616'],
      ['hex-decode', 'zz'],
      ['hex-decode', 'ff'],
      ['hex-decode', 'c3'],
      ['binary-decode', '0100'],
      ['binary-decode', '01001000 0110100x'],
      ['binary-decode', '11111111'],
      ['punycode-encode', 'a b'],
      ['punycode-decode', ' '],
      ['qp-decode', '=ZZ'],
      ['qp-decode', 'a=4'],
      ['qp-decode', '=C3'],
      ['ascii85-decode', '<~Bz~>'],
      ['ascii85-decode', '<~B~>'],
      ['ascii85-decode', '<~uuuuu~>'],
      ['ascii85-decode', '<~BP@v~>'],
      ['gunzip', 'aGk='],
      ['gunzip', 'not base64!'],
      ['gunzip', 'H4sIAAAAAAAAE8vIBACsKpPY'],
      ['form-decode', '%'],
      ['form-decode', '%E0%A4%A'],
      ['form-decode', '%ED%A0%80'],
      ['base64-decode-each-line', 'YQ==\n@@'],
      ['base64-decode-each-line', 'YQ'.repeat(1) + '='],
      ['base64-decode-each-line', '/w=='],
    ];
    invalid.forEach(([command, text]) => {
      test(`${command}: ${JSON.stringify(text)}`, () => assertInputError(command, text));
    });

    test('caesar without a safe integer shift', () => {
      assertInputError('caesar', 'abc');
      assertInputError('caesar', 'abc', { shift: 1.5 });
      assertInputError('caesar', 'abc', { shift: Number.NaN });
      assertInputError('caesar', 'abc', { shift: 2 ** 60 });
    });

    test('the message says which line of ENC-032 is invalid', () => {
      assert.throws(() => run('base64-decode-each-line', 'YQ==\n\n@@'), /line 3/);
    });
  });

  suite('round trips', () => {
    ROUND_TRIPS.forEach(([encode, decode]) => {
      test(`${encode} -> ${decode}`, () => {
        REPRESENTATIVE_INPUTS.forEach((text) => {
          assert.strictEqual(run(decode, run(encode, text)), text, JSON.stringify(text));
        });
      });
    });

    test('caesar with N then -N, rot13 twice, rot47 twice, atbash twice', () => {
      REPRESENTATIVE_INPUTS.forEach((text) => {
        assert.strictEqual(run('caesar', run('caesar', text, { shift: 7 }), { shift: -7 }), text);
        assert.strictEqual(run('rot13', run('rot13', text)), text);
        assert.strictEqual(run('rot47', run('rot47', text)), text);
        assert.strictEqual(run('atbash', run('atbash', text)), text);
      });
    });
  });

  suite('details', () => {
    test('html-decode: named, decimal and hexadecimal references; unknown names and bare & stay', () => {
      assert.strictEqual(run('html-decode', '&amp;&quot;&apos;&nbsp;&copy;&hellip;&euro;&#x41;&#X42;&#128512;'), '&"\'\u00a0©…€AB😀');
      assert.strictEqual(run('html-decode', '&foo; &amp &constructor; &toString; a & b'), '&foo; &amp &constructor; &toString; a & b');
      assert.strictEqual(run('html-decode', '&AElig;&yuml;'), 'Æÿ');
    });

    test('html-decode: every named entity is a single BMP character (keeps the output estimate valid)', () => {
      HTML_NAMED_ENTITIES.forEach((value, name) => {
        assert.strictEqual(value.length, 1, name);
      });
    });

    test('html-encode / html-encode-numeric', () => {
      assert.strictEqual(run('html-encode', `a&b<c>d"e'f`), 'a&amp;b&lt;c&gt;d&quot;e&#39;f');
      assert.strictEqual(run('html-encode-numeric', 'a😀é<'), 'a&#128512;&#233;<');
    });

    test('unicode escapes: lower-case \\uxxxx, upper-case \\u{H}, surrogate pairs are joined', () => {
      assert.strictEqual(run('unicode-escape', 'aé'), 'a\\u00e9');
      assert.strictEqual(run('unicode-escape-es6', 'é😀'), '\\u{E9}\\u{1F600}');
      assert.strictEqual(run('unicode-unescape', '\\ud83d\\ude00'), '😀');
      assert.strictEqual(run('unicode-unescape', '\\uD83D\\uDE00 \\u{1f600} \\u{41}\\u0042'), '😀 😀 AB');
      assert.strictEqual(run('unicode-unescape', 'C:\\users\\u12 \\u{} \\u{1234567}'), 'C:\\users\\u12 \\u{} \\u{1234567}');
    });

    test('base64url / base32 / base58 / hex / binary accept whitespace; decoders are case-insensitive where it makes sense', () => {
      assert.strictEqual(run('base64url-decode', 'Zm9v\nPw'), 'foo?');
      assert.strictEqual(run('base64url-decode', 'Zm9vPw=='), 'foo?');
      assert.strictEqual(run('base32-decode', 'mzxw6'), 'foo');
      assert.strictEqual(run('base32-decode', 'MZXW 6===\n'), 'foo');
      assert.strictEqual(run('base58-decode', ' Cn8e\nVZg '), 'hello');
      assert.strictEqual(run('base58-encode', '\u0000\u0000a'), '112g');
      assert.strictEqual(run('base58-decode', '112g'), '\u0000\u0000a');
      assert.strictEqual(run('hex-decode', '0x61 0X62\n0x630x64 6566'), 'abcdef');
      assert.strictEqual(run('hex-decode', '4A4b'), 'JK');
      assert.strictEqual(run('binary-decode', '0100100001101001'), 'Hi');
      assert.strictEqual(run('binary-encode', 'é'), '11000011 10101001');
    });

    test('punycode: UTS #46 mappings (the result equals node:url)', () => {
      assert.strictEqual(run('punycode-decode', 'ﬃ'), 'ffi');
      assert.strictEqual(run('punycode-decode', '㍿'), '株式会社');
      assert.strictEqual(run('punycode-encode', '㍿'), 'xn--6oqv20b1zgzxr');
      assert.strictEqual(run('punycode-encode', '㍿'), domainToASCII('㍿'));
      assert.strictEqual(run('punycode-decode', 'ﬃ'), domainToUnicode('ﬃ'));
      assert.strictEqual(run('punycode-encode', '  EXAMPLE.com \n'), 'example.com');
    });

    test('quoted-printable encode: soft line breaks at 76 characters, trailing whitespace, original line breaks', () => {
      const encoded = run('qp-encode', `${'x'.repeat(80)} \na\t\r\nb=`);
      assert.strictEqual(encoded, `${'x'.repeat(75)}=\nxxxxx=20\na=09\r\nb=3D`);
      encoded.split(/\r?\n/).forEach((line) => assert.ok(line.length <= 76, line));
      // `=XX` is never split by a soft line break.
      const multibyte = run('qp-encode', 'é'.repeat(30));
      multibyte.split('\n').forEach((line) => {
        assert.ok(line.length <= 76, line);
        assert.ok(/^(=[0-9A-F]{2})*=?$/.test(line), line);
      });
      assert.strictEqual(run('qp-encode', `${'x'.repeat(80)}`, { eol: '\r\n' }), `${'x'.repeat(75)}=\r\nxxxxx`);
    });

    test('quoted-printable decode: trailing whitespace is removed, encoded whitespace stays, soft line breaks join', () => {
      assert.strictEqual(run('qp-decode', 'abc  \ndef'), 'abc\ndef');
      assert.strictEqual(run('qp-decode', 'ab=  \ncd'), 'abcd');
      assert.strictEqual(run('qp-decode', 'a=20'), 'a ');
      assert.strictEqual(run('qp-decode', 'a=09\r\nb'), 'a\t\r\nb');
      assert.strictEqual(run('qp-decode', 'caf=c3=a9 é'), 'café é');
      assert.strictEqual(run('qp-decode', 'end='), 'end');
    });

    test('ciphers only touch ASCII letters (rot47: ASCII 33..126)', () => {
      const special = 'ßﬃ\u212Aſé';
      assert.strictEqual(run('rot13', special), special);
      assert.strictEqual(run('rot47', special), special);
      assert.strictEqual(run('caesar', special, { shift: 5 }), special);
      assert.strictEqual(run('atbash', special), special);
      assert.strictEqual(run('rot13', 'Hello, World! 123'), 'Uryyb, Jbeyq! 123');
      assert.strictEqual(run('rot47', 'Hello, World! 123'), 'w6==@[ (@C=5P `ab');
      assert.strictEqual(run('caesar', 'xyz XYZ', { shift: 3 }), 'abc ABC');
      assert.strictEqual(run('caesar', 'abc', { shift: -3 }), 'xyz');
      assert.strictEqual(run('caesar', 'abc', { shift: 29 }), 'def');
      assert.strictEqual(run('caesar', 'abc', { shift: -55 }), 'xyz');
      assert.strictEqual(run('atbash', 'Hello'), 'Svool');
    });

    test('ascii85: z for four zero bytes, partial groups, optional delimiters', () => {
      assert.strictEqual(run('ascii85-encode', '\u0000\u0000\u0000\u0000a'), '<~z@/~>');
      assert.strictEqual(run('ascii85-encode', ''), '<~~>');
      assert.strictEqual(run('ascii85-decode', 'zzzz'), '\u0000'.repeat(16));
      assert.strictEqual(run('ascii85-decode', 'BP@'), 'hi');
      assert.strictEqual(run('ascii85-decode', '<~87cURD]i,"Ebo80~>'), 'Hello World!');
      assert.strictEqual(run('ascii85-decode', '<~87cU\n RD]i,"Ebo80~>'), 'Hello World!');
    });

    test('gzip output equals the ROADMAP example exactly, with fixed header fields', () => {
      const encoded = run('gzip', 'hi');
      assert.strictEqual(encoded, 'H4sIAAAAAAAAE8vIBACsKpPYAgAAAA==');
      const bytes = Buffer.from(encoded, 'base64');
      assert.strictEqual(bytes.readUInt32LE(4), 0, 'MTIME');
      assert.strictEqual(bytes[8], 0, 'XFL');
      assert.strictEqual(bytes[9], 0x13, 'OS');
      assert.strictEqual(gunzipSync(bytes).toString('utf8'), 'hi');
      const long = run('gzip', 'あいう'.repeat(1000));
      const longBytes = Buffer.from(long, 'base64');
      assert.deepStrictEqual([longBytes.readUInt32LE(4), longBytes[8], longBytes[9]], [0, 0, 0x13]);
      assert.strictEqual(gunzipSync(longBytes).toString('utf8'), 'あいう'.repeat(1000));
    });

    test('form encoding: WHATWG x-www-form-urlencoded', () => {
      assert.strictEqual(run('form-encode', 'a b*-._~!あ\n'), 'a+b*-._%7E%21%E3%81%82%0A');
      assert.strictEqual(run('form-encode', 'a b*-._~!あ'), new URLSearchParams({ x: 'a b*-._~!あ' }).toString().slice(2));
      assert.strictEqual(run('form-decode', 'a+b%2Bc%e3%81%82'), 'a b+cあ');
    });

    test('base64 each line keeps empty lines and CRLF', () => {
      assert.strictEqual(run('base64-encode-each-line', 'a\r\n\r\nbc\n'), 'YQ==\r\n\r\nYmM=\n');
      assert.strictEqual(run('base64-decode-each-line', ' YQ== \r\n\r\nYmM=\n'), 'a\r\n\r\nbc\n');
    });

    test('NATO: whitespace, other characters and line breaks', () => {
      assert.strictEqual(run('nato', ' ab 1 '), 'Alfa Bravo / One');
      assert.strictEqual(run('nato', 'AZ  x,9\n   \nq'), 'Alfa Zulu / X-ray , Nine\n\nQuebec');
      assert.strictEqual(run('nato', 'é😀\u212Aßﬃſ'), 'é 😀 \u212A ß ﬃ ſ');
      assert.strictEqual(run('nato', 'a\r\nb'), 'Alfa\r\nBravo');
    });

    test('data URI', () => {
      assert.strictEqual(run('data-uri', 'あ'), 'data:text/plain;charset=utf-8;base64,44GC');
    });

    test('decoded bytes that are not valid UTF-8 are rejected', () => {
      assertInputError('base64url-decode', '_w');
      assertInputError('base32-decode', '74======');
      assertInputError('base58-decode', '5Q');
      assertInputError('ascii85-decode', 's8');
      assertInputError('gunzip', gzipSync(Buffer.from([0xff, 0xfe])).toString('base64'));
      assertInputError('qp-decode', '=FF');
    });
  });

  suite('input and output limits', () => {
    test('gunzip refuses data that decompresses to more than 10 MiB', () => {
      const bomb = gzipSync(Buffer.alloc(GUNZIP_MAX_OUTPUT_BYTES + 1)).toString('base64');
      assert.throws(() => run('gunzip', bomb), (error: unknown) =>
        error instanceof EncInputError && /larger than 10,485,760 bytes/.test(error.message));
      const withinLimit = gzipSync(Buffer.alloc(1000, 0x61)).toString('base64');
      assert.strictEqual(run('gunzip', withinLimit), 'a'.repeat(1000));
    });

    test('base58 input limits', () => {
      assertInputError('base58-encode', 'x'.repeat(BASE58_MAX_ENCODE_BYTES + 1));
      assertInputError('base58-decode', '2'.repeat(BASE58_MAX_DECODE_LENGTH + 1));
      const started = Date.now();
      const encoded = run('base58-encode', 'x'.repeat(BASE58_MAX_ENCODE_BYTES));
      assert.strictEqual(run('base58-decode', encoded), 'x'.repeat(BASE58_MAX_ENCODE_BYTES));
      assert.ok(Date.now() - started < 5000, 'the largest allowed input finishes in a reasonable time');
    });

    test('punycode input limit (1,000 characters)', () => {
      const atLimit = 'a'.repeat(PUNYCODE_MAX_INPUT_LENGTH);
      assert.strictEqual(run('punycode-encode', atLimit), atLimit);
      assert.strictEqual(run('punycode-decode', atLimit), atLimit);
      assertInputError('punycode-encode', 'a'.repeat(PUNYCODE_MAX_INPUT_LENGTH + 1));
      assertInputError('punycode-decode', 'a'.repeat(PUNYCODE_MAX_INPUT_LENGTH + 1));
    });

    test('estimateMaxOutputLength is undefined for punycode and gunzip only', () => {
      ENC_COMMANDS.forEach((command) => {
        const expected = ['punycode-encode', 'punycode-decode', 'gunzip'].includes(command);
        assert.strictEqual(estimateMaxOutputLength(command, 'abc') === undefined, expected, command);
      });
    });

    test('estimateMaxOutputLength is at least the actual output length', () => {
      const encoders = new Map(ROUND_TRIPS.map(([encode, decode]) => [decode, encode]));
      const extraInputs: Partial<Record<EncCommand, string[]>> = {
        'ascii85-decode': ['zzzz', 'z', '<~zzzz~>', 'zz!!'],
        'html-decode': ['&lt;'.repeat(50), '&#65536;', '&#9;&#x9;', '&amp;&nbsp;&hellip;'],
        'unicode-unescape': ['\\u{10000}\\u{A0}\\u0041', '\\ud83d\\ude00'],
        'hex-decode': ['0x61 0x62', 'c3a9'],
        'form-decode': ['%E3%81%82++', 'é+é'],
        'qp-decode': ['é=C3=A9', 'a=\nb'],
        'base58-decode': ['1111', '1112'],
      };
      ENC_COMMANDS.forEach((command) => {
        if (estimateMaxOutputLength(command, '') === undefined) {
          return;
        }
        const encoder = encoders.get(command);
        let inputs: string[];
        if (encoder !== undefined) {
          inputs = REPRESENTATIVE_INPUTS.map((text) => run(encoder, text));
        } else if (command === 'unicode-unescape') {
          inputs = REPRESENTATIVE_INPUTS.map((text) => run('unicode-escape-es6', text));
        } else {
          inputs = [...REPRESENTATIVE_INPUTS];
        }
        inputs.push(...(extraInputs[command] ?? []));
        inputs.forEach((text) => {
          const actual = run(command, text, { shift: 3 }).length;
          const estimate = estimateMaxOutputLength(command, text) ?? -1;
          assert.ok(actual <= estimate, `${command}: ${JSON.stringify(text).slice(0, 60)} -> ${actual} > ${estimate}`);
        });
      });
    });
  });
});
