import * as assert from 'assert';
import {
  compareSemver,
  isNumericKey,
  toCellKey,
  parseDateKey,
  parseHexKey,
  parseIp,
  parseSemver,
  parseSortDelimiter,
  SortLineCommand,
  sortLines,
  SortOptions,
  SortSelectionCommand,
  sortSelectionItems,
  validateSortColumnInput,
  validateSortDelimiterInput,
  validateSortLocaleInput,
} from '../../handler/sortTransforms';

/** Lines are written with `\n` in the tests; the result is joined the same way. */
const sortText = (text: string, command: SortLineCommand, descending = false, options: SortOptions = {}) =>
  sortLines(text.split('\n'), command, descending, options).join('\n');

interface LineCase {
  id: string;
  command: SortLineCommand;
  descending: boolean;
  options?: SortOptions;
  input: string;
  expected: string;
}

interface SelectionCase {
  id: string;
  command: SortSelectionCommand;
  descending: boolean;
  input: string[];
  expected: string[];
}

// The ROADMAP examples (the clipboard versions use the example of their base command).
const lineCases: LineCase[] = [
  { id: 'SORT-001', command: 'natural', descending: false, input: 'file10\nfile2', expected: 'file2\nfile10' },
  { id: 'SORT-002', command: 'natural', descending: true, input: 'file2\nfile10', expected: 'file10\nfile2' },
  { id: 'SORT-003', command: 'ignore-case', descending: false, input: 'b\nA\na', expected: 'A\na\nb' },
  { id: 'SORT-004', command: 'ignore-case', descending: true, input: 'A\nb\na', expected: 'b\nA\na' },
  { id: 'SORT-005', command: 'locale', descending: false, options: { locale: 'en' }, input: 'f\né\ne', expected: 'e\né\nf' },
  { id: 'SORT-006', command: 'locale', descending: true, options: { locale: 'en' }, input: 'e\né\nf', expected: 'f\né\ne' },
  { id: 'SORT-007', command: 'japanese', descending: false, input: 'カ\nあ\nき', expected: 'あ\nカ\nき' },
  { id: 'SORT-008', command: 'column', descending: false, options: { delimiter: ',', column: 2 }, input: 'b,2\na,1', expected: 'a,1\nb,2' },
  { id: 'SORT-009', command: 'column', descending: true, options: { delimiter: ',', column: 2 }, input: 'a,1\nb,2', expected: 'b,2\na,1' },
  { id: 'SORT-010', command: 'regex-key', descending: false, options: { regexKeys: ['10', '9'] }, input: 'id=10\nid=9', expected: 'id=9\nid=10' },
  { id: 'SORT-011', command: 'date', descending: false, input: '2026-03-01 b\n2025-12-31 a', expected: '2025-12-31 a\n2026-03-01 b' },
  { id: 'SORT-012', command: 'date', descending: true, input: '2025-12-31 a\n2026-03-01 b', expected: '2026-03-01 b\n2025-12-31 a' },
  { id: 'SORT-013', command: 'semver', descending: false, input: '1.10.0\n1.2.0\n1.2.0-rc.1', expected: '1.2.0-rc.1\n1.2.0\n1.10.0' },
  { id: 'SORT-014', command: 'ip', descending: false, input: '10.0.0.10\n10.0.0.9', expected: '10.0.0.9\n10.0.0.10' },
  { id: 'SORT-015', command: 'word-count', descending: false, input: 'a b c\na', expected: 'a\na b c' },
  { id: 'SORT-016', command: 'last-word', descending: false, input: 'Ann Smith\nBob Adams', expected: 'Bob Adams\nAnn Smith' },
  { id: 'SORT-017', command: 'suffix', descending: false, input: 'a.ts\nb.js\nc.ts', expected: 'b.js\na.ts\nc.ts' },
  { id: 'SORT-018', command: 'unique', descending: false, input: 'b\na\nb', expected: 'a\nb' },
  { id: 'SORT-019', command: 'paragraph', descending: false, input: 'b\nb2\n\na\na2', expected: 'a\na2\n\nb\nb2' },
  { id: 'SORT-020', command: 'indent-block', descending: false, input: 'b\n  b1\na\n  a1', expected: 'a\n  a1\nb\n  b1' },
  { id: 'SORT-021', command: 'hex', descending: false, input: '0x1F\n0xA', expected: '0xA\n0x1F' },
  { id: 'SORT-026', command: 'natural', descending: false, input: 'file10\nfile2', expected: 'file2\nfile10' },
  { id: 'SORT-027', command: 'ignore-case', descending: false, input: 'b\nA\na', expected: 'A\na\nb' },
  { id: 'SORT-028', command: 'column', descending: false, options: { delimiter: ',', column: 2 }, input: 'b,2\na,1', expected: 'a,1\nb,2' },
  { id: 'SORT-029', command: 'semver', descending: false, input: '1.10.0\n1.2.0\n1.2.0-rc.1', expected: '1.2.0-rc.1\n1.2.0\n1.10.0' },
];

const selectionCases: SelectionCase[] = [
  { id: 'SORT-022', command: 'natural', descending: false, input: ['v10', 'v2'], expected: ['v2', 'v10'] },
  { id: 'SORT-023', command: 'ignore-case', descending: false, input: ['b', 'A'], expected: ['A', 'b'] },
  { id: 'SORT-024', command: 'length', descending: false, input: ['ccc', 'a'], expected: ['a', 'ccc'] },
  { id: 'SORT-025', command: 'length', descending: true, input: ['a', 'ccc'], expected: ['ccc', 'a'] },
  { id: 'SORT-030', command: 'natural', descending: false, input: ['v10', 'v2'], expected: ['v2', 'v10'] },
];

suite('Sort Transforms (SORT-001..030) Test Suite', () => {

  suite('ROADMAP examples', () => {
    lineCases.forEach((c) => {
      test(`${c.id} ${c.command}${c.descending ? ' descending' : ''}`, () => {
        assert.strictEqual(sortText(c.input, c.command, c.descending, c.options), c.expected);
      });
    });
    selectionCases.forEach((c) => {
      test(`${c.id} selections ${c.command}${c.descending ? ' descending' : ''}`, () => {
        assert.deepStrictEqual(sortSelectionItems(c.input, c.command, c.descending), c.expected);
      });
    });
  });

  suite('stable order and lines without a key', () => {
    test('descending flips the comparison, so equal keys keep their order (A before a)', () => {
      assert.strictEqual(sortText('A\nb\na', 'ignore-case', true), 'b\nA\na');
      assert.strictEqual(sortText('a\nb\nA', 'ignore-case', true), 'b\na\nA');
    });

    test('lines without a key stay last in their order, ascending and descending', () => {
      const input = 'x\n2026-01-02\ny\n2026-01-01';
      assert.strictEqual(sortText(input, 'date'), '2026-01-01\n2026-01-02\nx\ny');
      assert.strictEqual(sortText(input, 'date', true), '2026-01-02\n2026-01-01\nx\ny');
    });

    test('natural order compares digit runs as numbers and is linguistic otherwise', () => {
      assert.strictEqual(sortText('a10\nB\na2\na1', 'natural'), 'a1\na2\na10\nB');
    });
  });

  suite('SORT-005 / 006 locale', () => {
    test('the given locale is used', () => {
      assert.strictEqual(sortText('b\né\na\ne', 'locale', false, { locale: 'fr' }), 'a\nb\ne\né');
      assert.strictEqual(sortText('b\né\na\ne', 'locale', true, { locale: 'fr' }), 'é\ne\nb\na');
    });

    test('validation', () => {
      assert.strictEqual(validateSortLocaleInput('en'), undefined);
      assert.strictEqual(validateSortLocaleInput(' fr '), undefined);
      assert.strictEqual(validateSortLocaleInput('ja-JP'), undefined);
      assert.ok(validateSortLocaleInput(''));
      assert.ok(validateSortLocaleInput('   '));
      assert.ok(validateSortLocaleInput('xx-!!'));
      assert.ok(validateSortLocaleInput('a'.repeat(65)));
      assert.ok(validateSortLocaleInput('en\nfr'));
    });
  });

  suite('SORT-007 kana order', () => {
    test('half-width katakana, katakana and hiragana are ordered together', () => {
      assert.strictEqual(sortText('ｷ\nか\nア\nく', 'japanese'), 'ア\nか\nｷ\nく');
    });

    test('lines with the same kana keep their order', () => {
      assert.strictEqual(sortText('カ\nか\nあ', 'japanese'), 'あ\nカ\nか');
      assert.strictEqual(sortText('か\nカ\nあ', 'japanese'), 'あ\nか\nカ');
    });
  });

  suite('SORT-008 / 009 column', () => {
    const column = (delimiter: string, n: number): SortOptions => ({ delimiter, column: n });

    test('numeric columns compare as numbers, text columns in natural order', () => {
      assert.strictEqual(sortText('a,10\nb,9\nc,-1.5', 'column', false, column(',', 2)), 'c,-1.5\nb,9\na,10');
      assert.strictEqual(sortText('1,b10\n2,b9', 'column', false, column(',', 2)), '2,b9\n1,b10');
    });

    test('numbers come before text in a mixed column (consistent order)', () => {
      assert.strictEqual(sortText('x,b\ny,10\nz,a\nw,2', 'column', false, column(',', 2)), 'w,2\ny,10\nz,a\nx,b');
    });

    test('cells are trimmed and lines without the column are last', () => {
      assert.strictEqual(sortText('a, 2\nshort\nb,1 ', 'column', false, column(',', 2)), 'b,1 \na, 2\nshort');
      assert.strictEqual(sortText('a, 2\nshort\nb,1 ', 'column', true, column(',', 2)), 'a, 2\nb,1 \nshort');
    });

    test('\\t is a tab; other delimiters are literal', () => {
      assert.strictEqual(parseSortDelimiter('\\t'), '\t');
      assert.strictEqual(parseSortDelimiter(';'), ';');
      assert.strictEqual(parseSortDelimiter('.*'), '.*');
      assert.strictEqual(sortText('b\t2\na\t1', 'column', false, column(parseSortDelimiter('\\t'), 2)), 'a\t1\nb\t2');
      assert.strictEqual(sortText('b.*2\na.*1', 'column', false, column('.*', 2)), 'a.*1\nb.*2');
    });

    test('delimiter validation', () => {
      assert.strictEqual(validateSortDelimiterInput(','), undefined);
      assert.strictEqual(validateSortDelimiterInput('x'.repeat(100)), undefined);
      assert.ok(validateSortDelimiterInput(''));
      assert.ok(validateSortDelimiterInput('x'.repeat(101)));
      assert.ok(validateSortDelimiterInput('a\nb'));
      assert.ok(validateSortDelimiterInput('\r'));
    });

    test('column validation', () => {
      assert.strictEqual(validateSortColumnInput('1'), undefined);
      assert.strictEqual(validateSortColumnInput('1000'), undefined);
      assert.strictEqual(validateSortColumnInput(' 2 '), undefined);
      ['0', '1001', '1.5', '-1', '', 'abc', '1e2', '12345678'].forEach((value) =>
        assert.ok(validateSortColumnInput(value), value));
    });
  });

  suite('isNumericKey (SORT-008 / 009 / 010)', () => {
    test('numbers', () => {
      ['1', '-1.5', '.5', '1e3', '1.', '+2', '0.25E-2'].forEach((key) => assert.ok(isNumericKey(key), key));
    });

    test('not numbers', () => {
      ['1.2.3', '1e', 'abc', '', '.', '-', '0x10', 'Infinity', ' 1'].forEach((key) => assert.ok(!isNumericKey(key), key));
    });

    test('a very long run of digits followed by a non-digit fails quickly (linear)', () => {
      const start = Date.now();
      assert.strictEqual(isNumericKey(`${'9'.repeat(200_000)}x`), false);
      assert.ok(Date.now() - start < 1000, `${Date.now() - start} ms`);
    });

    test('toCellKey classifies a key once (number / text / no key)', () => {
      assert.deepStrictEqual(toCellKey('-1.5'), { numeric: true, value: -1.5 });
      assert.deepStrictEqual(toCellKey('abc'), { numeric: false, text: 'abc' });
      assert.strictEqual(toCellKey(undefined), undefined);
      assert.strictEqual(toCellKey(null), undefined);
    });

    test('a huge number that is not finite as a Number is text', () => {
      assert.strictEqual(isNumericKey('9'.repeat(400)), false);
    });
  });

  suite('SORT-010 regex keys', () => {
    test('lines whose key is null (no match / group 1 not taking part) are last in their order', () => {
      const lines = 'id=10\nnone\nid=9\nb';
      assert.strictEqual(
        sortText(lines, 'regex-key', false, { regexKeys: ['10', null, '9', null] }),
        'id=9\nid=10\nnone\nb'
      );
    });
  });

  suite('SORT-011 / 012 date', () => {
    test('formats, times and time zones', () => {
      assert.strictEqual(parseDateKey('2026-03-01'), Date.UTC(2026, 2, 1));
      assert.strictEqual(parseDateKey('on 2026/03/01 x'), Date.UTC(2026, 2, 1));
      assert.strictEqual(parseDateKey('2026.03.01'), Date.UTC(2026, 2, 1));
      assert.strictEqual(parseDateKey('2026-03-01T10:20'), Date.UTC(2026, 2, 1, 10, 20));
      assert.strictEqual(parseDateKey('2026-03-01 10:20:30.5'), Date.UTC(2026, 2, 1, 10, 20, 30, 500));
      assert.strictEqual(parseDateKey('2026-03-01T10:00:00Z'), Date.UTC(2026, 2, 1, 10));
      assert.strictEqual(parseDateKey('2026-03-01T10:00:00+09:00'), Date.UTC(2026, 2, 1, 1));
      assert.strictEqual(parseDateKey('2026-03-01T10:00:00-0130'), Date.UTC(2026, 2, 1, 11, 30));
      assert.strictEqual(parseDateKey('2024-02-29'), Date.UTC(2024, 1, 29));
    });

    test('invalid dates and lines without a date have no key', () => {
      ['2026-02-30', '2025-02-29', '2026-13-01', '2026-00-10', '2026-03-01T24:00', '2026-03/01',
        '12026-03-01', 'no date', '03/01/2026', '2026-3-1'].forEach((line) =>
        assert.strictEqual(parseDateKey(line), undefined, line));
    });

    test('a zone after a fraction of 10 or more digits is still applied', () => {
      assert.strictEqual(parseDateKey('2026-03-01T10:00:00.123456789+09:00'), Date.UTC(2026, 2, 1, 1, 0, 0, 123));
      assert.strictEqual(parseDateKey('2026-03-01T10:00:00.1234567890+09:00'), Date.UTC(2026, 2, 1, 1, 0, 0, 123));
      assert.strictEqual(parseDateKey('2026-03-01T10:00:00.12345678901234567890Z'), Date.UTC(2026, 2, 1, 10, 0, 0, 123));
      assert.strictEqual(parseDateKey('2026-03-01T10:00:00.1234567890-0130'), Date.UTC(2026, 2, 1, 11, 30, 0, 123));
    });

    test('a very long fraction is parsed in linear time', () => {
      const line = `2026-03-01T10:00:00.${'9'.repeat(200_000)}x`;
      assert.strictEqual(parseDateKey(line), Date.UTC(2026, 2, 1, 10, 0, 0, 999));
      assert.strictEqual(parseDateKey(`2026-03-01T10:00:00.${'9'.repeat(200_000)}+09:001`), Date.UTC(2026, 2, 1, 10, 0, 0, 999));
    });

    test('dates in different time zones are compared as instants', () => {
      const input = 'a 2026-03-01T01:00:00Z\nb 2026-03-01T09:00:00+09:00\nc 2026-02-28';
      assert.strictEqual(sortText(input, 'date'), 'c 2026-02-28\nb 2026-03-01T09:00:00+09:00\na 2026-03-01T01:00:00Z');
    });
  });

  suite('SORT-013 semver', () => {
    test('the SemVer 2.0.0 precedence example', () => {
      const ordered = ['1.0.0-alpha', '1.0.0-alpha.1', '1.0.0-alpha.beta', '1.0.0-beta', '1.0.0-beta.2', '1.0.0-beta.11', '1.0.0-rc.1', '1.0.0'];
      assert.strictEqual(sortText([...ordered].reverse().join('\n'), 'semver'), ordered.join('\n'));
    });

    test('v prefix, build metadata and huge numbers', () => {
      assert.strictEqual(sortText('v2.0.0\n1.0.0+build.2\nV1.5.0\n1.0.0+build.1', 'semver'), '1.0.0+build.2\n1.0.0+build.1\nV1.5.0\nv2.0.0');
      assert.strictEqual(
        sortText('100000000000000000000.0.0\n99999999999999999999.0.0', 'semver'),
        '99999999999999999999.0.0\n100000000000000000000.0.0'
      );
      assert.ok(compareSemver(parseSemver('1.0.0-1')!, parseSemver('1.0.0-a')!) < 0);
    });

    test('invalid versions have no key', () => {
      ['1.2', '1.2.3.4', '01.2.3', '1.2.3-01', '1.2.3-', '1.2.3-a..b', '1.2.3+', 'x1.2.3', '1.2.3 x', ''].forEach((line) =>
        assert.strictEqual(parseSemver(line), undefined, line));
      assert.strictEqual(sortText('bad\n1.0.0\n2', 'semver'), '1.0.0\nbad\n2');
    });
  });

  suite('SORT-014 ip', () => {
    test('IPv4 before IPv6, numeric order, prefix length', () => {
      const input = '::1\n10.0.0.10/24\n10.0.0.10\n::ffff:1.2.3.4\n2001:db8::1\n10.0.0.9\n10.0.0.10/8';
      assert.strictEqual(
        sortText(input, 'ip'),
        '10.0.0.9\n10.0.0.10\n10.0.0.10/8\n10.0.0.10/24\n::1\n::ffff:1.2.3.4\n2001:db8::1'
      );
    });

    test('parsing', () => {
      assert.deepStrictEqual(parseIp('::1'), { version: 6, value: 1n, prefix: -1 });
      assert.deepStrictEqual(parseIp('::ffff:1.2.3.4'), { version: 6, value: 0xffff01020304n, prefix: -1 });
      assert.deepStrictEqual(parseIp('fe80::1%eth0'), { version: 6, value: 0xfe80n << 112n | 1n, prefix: -1 });
      assert.deepStrictEqual(parseIp('  192.168.0.1/16 host'), { version: 4, value: 0xc0a80001n, prefix: 16 });
      assert.deepStrictEqual(parseIp('1:2:3:4:5:6:7:8'), { version: 6, value: 0x00010002000300040005000600070008n, prefix: -1 });
      assert.deepStrictEqual(parseIp('::'), { version: 6, value: 0n, prefix: -1 });
    });

    test('invalid addresses have no key', () => {
      ['256.0.0.1', '01.2.3.4', '1.2.3', '1.2.3.4.5', ':::', '1::2::3', '1:2:3:4:5:6:7:8:9', '1:2:3:4:5:6:7', '12345::',
        '1.2.3.4/33', '::1/129', '1.2.3.4/8/8', '%eth0', '::1%', 'host', '', '::1.2.3.4:5'].forEach((line) =>
        assert.strictEqual(parseIp(line), undefined, line));
    });
  });

  suite('SORT-015..017', () => {
    test('word count counts non-empty tokens of any white space', () => {
      assert.strictEqual(sortText('a　b\tc\n  \na  b', 'word-count'), '  \na  b\na　b\tc');
    });

    test('last word (a blank line has an empty key)', () => {
      assert.strictEqual(sortText('x b \ny a\n', 'last-word'), '\ny a\nx b ');
    });

    test('reversed string counts surrogate pairs as one character', () => {
      assert.strictEqual(sortText('b😀\na😀', 'suffix'), 'a😀\nb😀');
    });
  });

  suite('SORT-018 unique', () => {
    test('only exact duplicates are removed; case and NFC / NFD variants are kept', () => {
      const nfc = 'é';
      const nfd = 'é';
      assert.strictEqual(sortText(`x\n${nfc}\n${nfd}\n${nfc}\nx\nX`, 'unique'), [nfc, nfd, 'x', 'X'].join('\n'));
    });
  });

  suite('SORT-019 paragraph', () => {
    test('blank lines are normalized to one between paragraphs', () => {
      assert.strictEqual(sortText('\n\nc\n\n\n  \nb\nb2\n\na\n\n', 'paragraph'), 'a\n\nb\nb2\n\nc');
    });

    test('paragraphs are compared by their whole text', () => {
      assert.strictEqual(sortText('a\nz\n\na\nb', 'paragraph'), 'a\nb\n\na\nz');
    });
  });

  suite('SORT-020 indent block', () => {
    test('children (deeper and blank lines) move with their parent; only the top level is sorted', () => {
      const input = 'c\n\tc2\n\tc1\nb\n\n  b1\n    b11\na';
      assert.strictEqual(sortText(input, 'indent-block'), 'a\nb\n\n  b1\n    b11\nc\n\tc2\n\tc1');
    });

    test('the minimum indentation defines the parents', () => {
      assert.strictEqual(sortText('  b\n    b1\n  a', 'indent-block'), '  a\n  b\n    b1');
    });

    test('lines before the first parent (leading blank lines) stay at the top', () => {
      assert.strictEqual(sortText('\n  \nb\na', 'indent-block'), '\n  \na\nb');
    });

    test('parents without children and input without non-blank lines', () => {
      assert.strictEqual(sortText('b\na\nc', 'indent-block'), 'a\nb\nc');
      assert.strictEqual(sortText('\n  ', 'indent-block'), '\n  ');
    });
  });

  suite('SORT-020 large input', () => {
    test('more than 200k non-blank lines do not overflow the call stack', () => {
      const lines: string[] = [];
      for (let i = 200_000; i > 0; i--) {
        lines.push(i % 2 === 0 ? `p${String(i).padStart(6, '0')}` : `  c${i}`);
      }
      const sorted = sortLines(lines, 'indent-block', false);
      assert.strictEqual(sorted.length, lines.length);
      assert.strictEqual(sorted[0], 'p000002');
      assert.strictEqual(sorted[1], '  c1');
      assert.strictEqual(sorted[sorted.length - 2], 'p200000');
      assert.strictEqual(sorted[sorted.length - 1], '  c199999');
    });
  });

  suite('SORT-021 hex', () => {
    test('0x prefix, case and huge values', () => {
      assert.strictEqual(parseHexKey('0x1F'), 31n);
      assert.strictEqual(parseHexKey('0Xff'), 255n);
      assert.strictEqual(parseHexKey('  a rest'), 10n);
      assert.strictEqual(parseHexKey('face'), 0xfacen);
      assert.strictEqual(parseHexKey('0x' + 'f'.repeat(40)), (1n << 160n) - 1n);
      assert.strictEqual(sortText('ff\n0x10\n0XA\n1', 'hex'), '1\n0XA\n0x10\nff');
    });

    test('tokens that are not entirely hex have no key and stay last', () => {
      ['deadline', 'bad-name', '0x', '0xZZ', '0x1g', '', 'x10'].forEach((line) =>
        assert.strictEqual(parseHexKey(line), undefined, line));
      assert.strictEqual(sortText('deadline\n0x2\nbad-name\n0x\n0xZZ\n0x1', 'hex'), '0x1\n0x2\ndeadline\nbad-name\n0x\n0xZZ');
    });
  });

  suite('SORT-022..025 selections', () => {
    test('ignore case keeps the order of equal items', () => {
      assert.deepStrictEqual(sortSelectionItems(['b', 'a', 'A'], 'ignore-case', false), ['a', 'A', 'b']);
    });

    test('length counts surrogate pairs as one character and is stable', () => {
      assert.deepStrictEqual(sortSelectionItems(['abc', '😀😀', 'xy'], 'length', false), ['😀😀', 'xy', 'abc']);
      assert.deepStrictEqual(sortSelectionItems(['a', '😀😀', 'xy', 'bcd'], 'length', true), ['bcd', '😀😀', 'xy', 'a']);
    });
  });
});
