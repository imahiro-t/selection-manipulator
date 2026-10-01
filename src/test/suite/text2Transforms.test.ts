import * as assert from 'assert';
import { EncOutputTooLargeError } from '../../handler/encodeTransforms';
import {
  charFrequency,
  compareCodePoints,
  deleteChars,
  frequencyLabel,
  insertEveryN,
  keepDigits,
  leetspeak,
  maskKeepLast,
  numberValidator,
  padCharValidator,
  padEnd,
  padStart,
  removeBetween,
  removeDigits,
  removePunctuation,
  removeUrls,
  repeatText,
  reverseEachWord,
  sortCharacters,
  sortWords,
  squeezeChars,
  TEXT2_COMMAND_ENTRIES,
  TEXT2_MAX_GROUP,
  TEXT2_MAX_OUTPUT_LENGTH,
  TEXT2_MAX_REPEAT,
  TEXT2_MAX_WIDTH,
  Text2InputError,
  textValidator,
  translateChars,
  translationProblem,
  truncateMiddle,
  truncateText,
  uniqueCharacters,
  uniqueWords,
  wordFrequency,
} from '../../handler/text2Transforms';
import { TEXT2_EXAMPLES } from './text2Examples';

const FAMILY = '\u{1F468}‍\u{1F469}‍\u{1F467}';
const E_ACUTE = 'é';

suite('Text Transforms (TEXTX-001..023) Test Suite', () => {

  test('every example of the showcase data, through the command table', () => {
    for (const entry of TEXT2_COMMAND_ENTRIES) {
      const example = TEXT2_EXAMPLES[entry.id];
      assert.ok(example, entry.id);
      const context = { eol: '\n', inputs: example.inputs ?? [] };
      assert.strictEqual((entry.inputs ?? []).length, context.inputs.length, `${entry.id}: one value per input box`);
      (entry.inputs ?? []).forEach((step, i) =>
        assert.strictEqual(step.validate(context.inputs[i], context.inputs.slice(0, i)), undefined, `${entry.id}: input ${i + 1}`));
      const result = entry.output === 'replace'
        ? entry.transform!(example.input, context, TEXT2_MAX_OUTPUT_LENGTH)
        : entry.combine!([example.input], context, TEXT2_MAX_OUTPUT_LENGTH);
      assert.strictEqual(result, example.expected, entry.id);
    }
  });

  suite('TEXTX-001 repeat', () => {
    test('separators, an empty separator, N = 1 and the limit', () => {
      assert.strictEqual(repeatText('ab', 3, '-'), 'ab-ab-ab');
      assert.strictEqual(repeatText('ab', 3, ''), 'ababab');
      assert.strictEqual(repeatText('ab', 1, ', '), 'ab');
      assert.strictEqual(repeatText('x', TEXT2_MAX_REPEAT, '').length, TEXT2_MAX_REPEAT);
      assert.throws(() => repeatText('x', TEXT2_MAX_REPEAT + 1, ''), Text2InputError);
      assert.throws(() => repeatText('x', 0, ''), Text2InputError);
    });

    test('a result over the budget is refused before it is built', () => {
      assert.throws(() => repeatText('abcd', 10, '-', 39), EncOutputTooLargeError);
      assert.strictEqual(repeatText('abcd', 10, '-', 49).length, 49);
      assert.throws(() => repeatText('x'.repeat(1_000_000), 11, ''), EncOutputTooLargeError);
    });
  });

  suite('TEXTX-002 / 003 truncate', () => {
    test('graphemes, N = 1 and a text that is short enough', () => {
      assert.strictEqual(truncateText('Hello World', 8), 'Hello W…');
      assert.strictEqual(truncateText('Hello', 5), 'Hello');
      assert.strictEqual(truncateText('Hello', 1), '…');
      assert.strictEqual(truncateText(`${FAMILY}${E_ACUTE}ab`, 3), `${FAMILY}${E_ACUTE}…`);
    });

    test('the middle: ceil((N − 1) / 2) at the start, floor((N − 1) / 2) at the end', () => {
      assert.strictEqual(truncateMiddle('very-long-file-name.txt', 15), 'very-lo…ame.txt');
      assert.strictEqual(truncateMiddle('abcdefgh', 4), 'ab…h');
      assert.strictEqual(truncateMiddle('abcdefgh', 1), '…');
      assert.strictEqual(truncateMiddle('abc', 3), 'abc');
      assert.strictEqual(truncateMiddle(`${FAMILY}bcd${FAMILY}`, 3), `${FAMILY}…${FAMILY}`);
    });
  });

  suite('TEXTX-004 / 005 pad', () => {
    test('pads to the width in graphemes; a wide text is unchanged', () => {
      assert.strictEqual(padStart('42', 6, '*'), '****42');
      assert.strictEqual(padEnd('abc', 6, '.'), 'abc...');
      assert.strictEqual(padStart('abcdef', 3, '*'), 'abcdef');
      assert.strictEqual(padEnd(`${E_ACUTE}`, 3, FAMILY), `${E_ACUTE}${FAMILY}${FAMILY}`);
      assert.strictEqual(padStart('', 2, '0'), '00');
    });

    test('the width is limited to 10,000 and the result to the budget', () => {
      assert.strictEqual(padStart('', TEXT2_MAX_WIDTH, '-').length, TEXT2_MAX_WIDTH);
      assert.throws(() => padStart('', TEXT2_MAX_WIDTH + 1, '-'), Text2InputError);
      assert.throws(() => padEnd('a', 0, '-'), Text2InputError);
      assert.throws(() => padEnd('a', 10, '-', 9), EncOutputTooLargeError);
    });

    test('the pad character is exactly one grapheme without line breaks', () => {
      assert.strictEqual(padCharValidator('*'), undefined);
      assert.strictEqual(padCharValidator(FAMILY), undefined);
      assert.strictEqual(padCharValidator(E_ACUTE), undefined);
      for (const bad of ['', 'ab', '\n', '\r\n', 'á'.repeat(2)]) {
        assert.ok(padCharValidator(bad), JSON.stringify(bad));
      }
    });
  });

  suite('TEXTX-006 insert every N', () => {
    test('groups of N graphemes; nothing after the last group', () => {
      assert.strictEqual(insertEveryN('1234567890', 4, '-'), '1234-5678-90');
      assert.strictEqual(insertEveryN('12345678', 4, ' '), '1234 5678');
      assert.strictEqual(insertEveryN('abc', 5, '-'), 'abc');
      assert.strictEqual(insertEveryN('', 2, '-'), '');
      assert.strictEqual(insertEveryN(`${FAMILY}${FAMILY}${FAMILY}`, 1, '|'), `${FAMILY}|${FAMILY}|${FAMILY}`);
    });

    test('N is limited and the result is measured first', () => {
      assert.throws(() => insertEveryN('abc', 0, '-'), Text2InputError);
      assert.throws(() => insertEveryN('abc', TEXT2_MAX_GROUP + 1, '-'), Text2InputError);
      assert.throws(() => insertEveryN('abcdef', 1, '--', 15), EncOutputTooLargeError);
      assert.strictEqual(insertEveryN('abcdef', 1, '--', 16), 'a--b--c--d--e--f');
    });
  });

  suite('TEXTX-007..009 tr-like commands', () => {
    test('translate: position by position, by code point, no regular expression', () => {
      assert.strictEqual(translateChars('hello', 'el', 'ip'), 'hippo');
      assert.strictEqual(translateChars('a.b*c', '.*', '*.'), 'a*b.c');
      assert.strictEqual(translateChars('a😀b', '😀', 'x'), 'axb');
      assert.strictEqual(translateChars('[a-z]', 'a-z', 'xyz'), '[xyz]', 'a - is a character, not a range');
    });

    test('translate: unequal lengths and repeated characters are refused', () => {
      assert.ok(translationProblem('ab', 'x'));
      assert.ok(translationProblem('aa', 'xy'));
      assert.strictEqual(translationProblem('ab', 'xy'), undefined);
      assert.throws(() => translateChars('abc', 'ab', 'x'), Text2InputError);
      const [first, second] = TEXT2_COMMAND_ENTRIES.find((entry) => entry.id === 'TEXTX-007')!.inputs!;
      assert.ok(first.validate('aba', []));
      assert.strictEqual(first.validate('ab', []), undefined);
      assert.ok(second.validate('x', ['ab']));
      assert.strictEqual(second.validate('xy', ['ab']), undefined);
    });

    test('delete: every code point of the set', () => {
      assert.strictEqual(deleteChars('a-b_c', '-_'), 'abc');
      assert.strictEqual(deleteChars('a.b*c', '.*'), 'abc');
      assert.strictEqual(deleteChars('a😀b😀', '😀'), 'ab');
    });

    test('squeeze: runs of a character of the set, or of any character when the set is empty', () => {
      assert.strictEqual(squeezeChars('a   b---c', ' -'), 'a b-c');
      assert.strictEqual(squeezeChars('aabbcc--', '-'), 'aabbcc-');
      assert.strictEqual(squeezeChars('aabbcc  ', ''), 'abc ');
      assert.strictEqual(squeezeChars('😀😀x', ''), '😀x');
      assert.strictEqual(squeezeChars('abab', ''), 'abab');
    });
  });

  suite('TEXTX-010..012 digits and punctuation', () => {
    test('Unicode digits (Nd) and punctuation (P); symbols stay', () => {
      assert.strictEqual(removeDigits('abc123def'), 'abcdef');
      assert.strictEqual(removeDigits('a１２b٣'), 'ab');
      assert.strictEqual(removePunctuation('Hello, world!'), 'Hello world');
      assert.strictEqual(removePunctuation('「こんにちは」、世界。'), 'こんにちは世界');
      assert.strictEqual(removePunctuation('$1+2=3'), '$1+2=3');
      assert.strictEqual(keepDigits('TEL: 03-1234-5678'), '0312345678');
      assert.strictEqual(keepDigits('1\n2\r\n3'), '123');
      assert.strictEqual(keepDigits('abc'), '');
    });
  });

  suite('TEXTX-013..017 words and characters', () => {
    test('reverse each word: graphemes reversed, whitespace kept in place', () => {
      assert.strictEqual(reverseEachWord('hello world'), 'olleh dlrow');
      assert.strictEqual(reverseEachWord('  ab\tcd\r\nef '), '  ba\tdc\r\nfe ');
      assert.strictEqual(reverseEachWord(`a${E_ACUTE}${FAMILY}`), `${FAMILY}${E_ACUTE}a`);
    });

    test('sort words: code point order, one space, unchanged without words', () => {
      assert.strictEqual(sortWords('pear apple fig'), 'apple fig pear');
      assert.strictEqual(sortWords('b a\nC\r\nc'), 'C a b c');
      assert.strictEqual(sortWords('\u{1F600} ～'), '～ \u{1F600}', 'code points, not UTF-16 units');
      assert.strictEqual(sortWords('   '), '   ');
    });

    test('unique words: the first one stays, case-sensitive', () => {
      assert.strictEqual(uniqueWords('a b a c b'), 'a b c');
      assert.strictEqual(uniqueWords('A a\nA'), 'A a');
    });

    test('sort and unique characters work on graphemes', () => {
      assert.strictEqual(sortCharacters('banana'), 'aaabnn');
      assert.strictEqual(sortCharacters(`b${E_ACUTE}a`), `ab${E_ACUTE}`);
      assert.strictEqual(uniqueCharacters('banana'), 'ban');
      assert.strictEqual(uniqueCharacters(`${FAMILY}x${FAMILY}`), `${FAMILY}x`);
      assert.strictEqual(uniqueCharacters(`e${E_ACUTE}e`), `e${E_ACUTE}`);
    });

    test('compareCodePoints', () => {
      assert.ok(compareCodePoints('a', 'b') < 0);
      assert.ok(compareCodePoints('ab', 'a') > 0);
      assert.strictEqual(compareCodePoints('abc', 'abc'), 0);
      assert.ok(compareCodePoints('￿', '\u{10000}') < 0);
    });
  });

  suite('TEXTX-018 / 019 frequency tables', () => {
    test('words: highest count first, equal counts in order of appearance, all selections together', () => {
      assert.strictEqual(wordFrequency(['a b a'], '\n'), 'a\t2\nb\t1');
      assert.strictEqual(wordFrequency(['x y', 'y z x'], '\r\n'), 'x\t2\r\ny\t2\r\nz\t1');
      assert.strictEqual(wordFrequency(['  \n '], '\n'), '');
    });

    test('characters: whitespace and invisible characters as U+XXXX', () => {
      assert.strictEqual(charFrequency(['banana'], '\n'), 'a\t3\nn\t2\nb\t1');
      assert.strictEqual(charFrequency(['a a​\t'], '\n'), 'a\t2\nU+0020\t1\nU+200B\t1\nU+0009\t1');
      assert.strictEqual(charFrequency(['a\r\nb\nc'], '\n'), 'a\t1\nU+000D U+000A\t1\nb\t1\nU+000A\t1\nc\t1');
      assert.strictEqual(frequencyLabel(FAMILY), FAMILY, 'an emoji sequence is shown as it is');
      assert.strictEqual(frequencyLabel('　'), 'U+3000');
      assert.strictEqual(frequencyLabel(E_ACUTE), E_ACUTE);
      assert.strictEqual(charFrequency([''], '\n'), '');
    });

    test('a table over the budget is refused', () => {
      assert.throws(() => wordFrequency(['alpha beta'], '\n', 10), EncOutputTooLargeError);
    });
  });

  suite('TEXTX-020 remove URLs', () => {
    test('one space is left between the words around a URL', () => {
      assert.strictEqual(removeUrls('see https://a.example/x now'), 'see now');
      assert.strictEqual(removeUrls('see\thttp://a.example/x\t\tnow'), 'see now');
      assert.strictEqual(removeUrls('a https://x.example https://y.example b'), 'a b');
      assert.strictEqual(removeUrls('no url here'), 'no url here');
    });

    test('nothing is left at the start or end of a line; line breaks stay', () => {
      assert.strictEqual(removeUrls('https://a.example/x start'), 'start');
      assert.strictEqual(removeUrls('end https://a.example/x'), 'end');
      assert.strictEqual(removeUrls('a https://a.example\nb'), 'a\nb');
      assert.strictEqual(removeUrls('a\r\nhttps://a.example b'), 'a\r\nb');
      assert.strictEqual(removeUrls('https://a.example'), '');
    });

    test('a URL never runs over a space; a bare scheme is not a URL', () => {
      assert.strictEqual(removeUrls('x http://a b'), 'x b');
      assert.strictEqual(removeUrls('x http:// b'), 'x http:// b');
      assert.strictEqual(removeUrls('x https://.example b'), 'x https://.example b');
    });

    test('punctuation and unmatched closing brackets after a URL stay', () => {
      assert.strictEqual(removeUrls('Visit https://example.com.'), 'Visit.');
      assert.strictEqual(removeUrls('(see https://a.com) ok'), '(see) ok');
      assert.strictEqual(removeUrls('<https://a.com>'), '<>');
      assert.strictEqual(removeUrls('a https://x.example, https://y.example; b'), 'a,; b');
      assert.strictEqual(removeUrls('say "https://a.example/x!" now'), 'say "!" now');
      assert.strictEqual(removeUrls('[https://a.example/x] {https://b.example/y}'), '[] {}');
      assert.strictEqual(removeUrls('ok https://a.example/x?'), 'ok?');
    });

    test('brackets opened inside the URL are part of it', () => {
      assert.strictEqual(removeUrls('see https://en.wikipedia.org/wiki/Foo_(bar) now'), 'see now');
      assert.strictEqual(removeUrls('(see https://en.wikipedia.org/wiki/Foo_(bar)).'), '(see).');
      assert.strictEqual(removeUrls('a https://a.example/[x] b'), 'a b');
      assert.strictEqual(removeUrls('a https://a.example/x.html b'), 'a b');
      assert.strictEqual(removeUrls('x http://) b'), 'x b');
    });

    test('linear on a long run of blanks that is not at the end (no quadratic trim)', () => {
      const started = Date.now();
      assert.strictEqual(removeUrls(`a${' '.repeat(400_000)}b http://x/`), `a${' '.repeat(400_000)}b`);
      assert.strictEqual(removeUrls(`a${' \t'.repeat(200_000)}b https://x/ c`), `a${' \t'.repeat(200_000)}b c`);
      assert.strictEqual(removeUrls(`http://x/${' '.repeat(400_000)}b`), 'b');
      assert.ok(Date.now() - started < 2000, `${Date.now() - started} ms`);
    });

    test('linear on a long input without URLs and with many URLs', () => {
      const started = Date.now();
      removeUrls('http:/'.repeat(150_000));
      removeUrls('https://a '.repeat(100_000));
      removeUrls('https://a/'.concat(')'.repeat(300_000), '.'.repeat(300_000)));
      assert.ok(Date.now() - started < 2000, `${Date.now() - started} ms`);
    });
  });

  suite('TEXTX-021 mask except last N', () => {
    test('graphemes; line breaks stay and are not counted', () => {
      assert.strictEqual(maskKeepLast('4111111111111111', 4), '************1111');
      assert.strictEqual(maskKeepLast('ab\ncd', 1), '**\n*d');
      assert.strictEqual(maskKeepLast('ab\r\ncd', 3), '*b\r\ncd');
      assert.strictEqual(maskKeepLast('abc', 0), '***');
      assert.strictEqual(maskKeepLast('abc', 10), 'abc');
      assert.strictEqual(maskKeepLast(`${FAMILY}${E_ACUTE}x`, 1), '**x');
    });
  });

  suite('TEXTX-022 / 023', () => {
    test('Leetspeak with the fixed table', () => {
      assert.strictEqual(leetspeak('leet speak'), 'l337 5p34k');
      assert.strictEqual(leetspeak('LEET SPEAK'), 'L337 5P34K');
      assert.strictEqual(leetspeak('xyz'), 'xyz');
    });

    test('remove between: literal delimiters, no nesting, an unclosed start stays', () => {
      assert.strictEqual(removeBetween('a (note) b', '(', ')'), 'a  b');
      assert.strictEqual(removeBetween('a(1)b(2)c', '(', ')'), 'abc');
      assert.strictEqual(removeBetween('a((x))b', '(', ')'), 'a)b');
      assert.strictEqual(removeBetween('a (open b', '(', ')'), 'a (open b');
      assert.strictEqual(removeBetween('x <!-- c --> y', '<!--', '-->'), 'x  y');
      assert.strictEqual(removeBetween('a.*b.*c', '.*', '.*'), 'ac', 'regular expression characters are literal');
      assert.strictEqual(removeBetween('a)b(c', '(', ')'), 'a)b(c');
      assert.throws(() => removeBetween('a', '', ')'), Text2InputError);
    });
  });

  suite('input validation', () => {
    test('numbers: digits only, within the range', () => {
      const validate = numberValidator(1, 10_000);
      for (const good of ['1', '10000', '0042']) {
        assert.strictEqual(validate(good), undefined, good);
      }
      for (const bad of ['', '0', '10001', '-1', '1.5', '1e3', ' 1', '0x10', '99999999999999999999']) {
        assert.ok(validate(bad), bad);
      }
      assert.strictEqual(numberValidator(0, 5)('0'), undefined);
    });

    test('texts: up to 100 code points, no line breaks; may be empty only when allowed', () => {
      assert.strictEqual(textValidator('separator', 0)(''), undefined);
      assert.ok(textValidator('separator', 1)(''));
      assert.strictEqual(textValidator('separator', 1)('😀'.repeat(100)), undefined);
      assert.ok(textValidator('separator', 1)('x'.repeat(101)));
      assert.ok(textValidator('separator', 0)('a\nb'));
    });

    test('error messages never quote the value entered', () => {
      const secret = 'secret-value';
      for (const entry of TEXT2_COMMAND_ENTRIES) {
        for (const step of entry.inputs ?? []) {
          const message = step.validate(`${secret}\n`.repeat(30), ['ab']);
          assert.ok(message === undefined || !message.includes(secret), entry.id);
        }
      }
    });
  });
});
