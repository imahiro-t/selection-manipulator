import * as assert from 'assert';
import { YAML_MAX_ALIAS_WORK } from '../../handler/dataTransforms';
import { MAX_OUTPUT_LENGTH } from '../../handler/encodeTransforms';
import {
  codeSpans,
  escapeLinkText,
  findInlineLinks,
  FENCE_LANGUAGE_MAX_LENGTH,
  ForwardSearch,
  githubSlug,
  isFenceLanguage,
  isQuoteLine,
  LineContext,
  lineSpans,
  LinkTailParser,
  MdEol,
  parseAtxHeading,
  parseListItem,
  SlugCounter,
} from '../../handler/mdCommon';
import {
  documentHeadings,
  MD_COMMAND_ENTRIES,
  MD_NO_HEADINGS,
  MdEdit,
  MdInputError,
  MdRange,
  MdResult,
  replaceSelections,
  validateLabelInput,
  validateLanguageInput,
} from '../../handler/mdTransforms';
import { expandMd, MD_ROADMAP_EXAMPLES } from './mdExamples';

/**
 * The document after applying a result (or `unchanged` / `info: …`). The edits are in document
 * order and may touch (an insertion right where the next edit starts), so they are applied from
 * the last one back, like the editor does.
 */
const applied = (text: string, result: MdResult): string => {
  if (result.kind === 'unchanged') {
    return 'unchanged';
  }
  if (result.kind === 'info') {
    return `info: ${result.message}`;
  }
  if (result.kind === 'open') {
    return `open: ${result.content}`;
  }
  let edited = text;
  [...result.edits].reverse().forEach(({ start, end, text: value }) => {
    edited = edited.slice(0, start) + value + edited.slice(end);
  });
  return edited;
};

const entry = (id: string) => {
  const found = MD_COMMAND_ENTRIES.find((candidate) => candidate.id === id);
  assert.ok(found, id);
  return found;
};

interface RunOptions {
  inputs?: string[];
  ranges?: MdRange[];
  eol?: MdEol;
}

/** Runs a command on `text` (all of it selected unless `ranges` is given) and returns the result. */
const result = (id: string, text: string, options: RunOptions = {}): MdResult =>
  entry(id).run({ text, ranges: options.ranges ?? [{ start: 0, end: text.length }], eol: options.eol ?? '\n', inputs: options.inputs ?? [] });

/** Runs a command and returns the document after it. */
const run = (id: string, text: string, options: RunOptions = {}): string => applied(text, result(id, text, options));

/** Runs a command that must fail and returns its warning. */
const failure = (id: string, text: string, options: RunOptions = {}): string => {
  try {
    result(id, text, options);
  } catch (error) {
    assert.ok(error instanceof MdInputError, String(error));
    return error.message;
  }
  assert.fail(`${id} did not fail`);
};

/** Asserts that `fn` finishes within `ms` milliseconds. */
const fast = (label: string, ms: number, fn: () => unknown): void => {
  const started = Date.now();
  fn();
  const elapsed = Date.now() - started;
  assert.ok(elapsed < ms, `${label}: ${elapsed} ms`);
};

suite('Markdown Transforms (MD-001..025) Test Suite', () => {

  suite('ROADMAP examples', () => {
    MD_COMMAND_ENTRIES.forEach(({ id }) => {
      const example = MD_ROADMAP_EXAMPLES[id];
      test(`${id}: ${example.input} → ${example.expected}`, () => {
        const text = expandMd(example.input);
        const ranges = example.selection === undefined ? undefined : [{ start: example.selection[0], end: example.selection[1] }];
        assert.strictEqual(run(id, text, { inputs: example.inputs, ranges }), expandMd(example.expected));
      });
    });

    test('the same examples in a CRLF document use CRLF line breaks', () => {
      MD_COMMAND_ENTRIES.forEach(({ id }) => {
        const example = MD_ROADMAP_EXAMPLES[id];
        const text = expandMd(example.input).replace(/\n/g, '\r\n');
        const ranges = example.selection === undefined ? undefined : [{ start: example.selection[0], end: example.selection[1] }];
        assert.strictEqual(run(id, text, { inputs: example.inputs, ranges, eol: '\r\n' }), expandMd(example.expected).replace(/\n/g, '\r\n'), id);
      });
    });
  });

  suite('common rules', () => {
    test('every command but MD-003 ignores empty selections; nothing selected changes nothing', () => {
      MD_COMMAND_ENTRIES.filter(({ id }) => id !== 'MD-003').forEach(({ id }) => {
        const inputs = MD_ROADMAP_EXAMPLES[id].inputs;
        assert.strictEqual(run(id, '# a', { inputs, ranges: [{ start: 1, end: 1 }] }), 'unchanged', id);
      });
    });

    test('each selection is transformed on its own; unchanged and empty ones keep their place', () => {
      const text = 'a b c';
      const outcome = result('MD-010', text, { ranges: [{ start: 0, end: 1 }, { start: 2, end: 2 }, { start: 4, end: 5 }] });
      assert.strictEqual(applied(text, outcome), '**a** b **c**');
      assert.ok(outcome.kind === 'edit');
      assert.deepStrictEqual(outcome.ranges, [{ start: 0, end: 5 }, { start: 6, end: 6, reversed: undefined }, { start: 8, end: 13 }]);
    });

    test('the line commands keep one line break at the end of the selection as it is', () => {
      assert.strictEqual(run('MD-004', 'a\nb\n'), '- a\n- b\n');
      assert.strictEqual(run('MD-015', 'a\r\n', { eol: '\r\n' }), '> a\r\n');
      assert.strictEqual(run('MD-004', 'a\n\nb'), '- a\n\n- b');
    });

    test('a result longer than the output limit is refused', () => {
      const text = 'a';
      assert.throws(() => replaceSelections(text, [{ start: 0, end: 1 }], ['x'.repeat(MAX_OUTPUT_LENGTH + 1)]), MdInputError);
    });

    test('the command table has the 25 commands in ROADMAP order', () => {
      assert.deepStrictEqual(MD_COMMAND_ENTRIES.map(({ id }) => id), Array.from({ length: 25 }, (_value, i) => `MD-${String(i + 1).padStart(3, '0')}`));
      assert.deepStrictEqual(MD_COMMAND_ENTRIES.filter((candidate) => candidate.cursor).map(({ id }) => id), ['MD-003']);
      assert.deepStrictEqual(MD_COMMAND_ENTRIES.filter((candidate) => candidate.inputs !== undefined).map(({ id }) => id), ['MD-014', 'MD-016', 'MD-024']);
    });
  });

  suite('headings (MD-001, 002, 013, 021)', () => {
    test('MD-001: ###### stays, other lines become level 1, blank lines and code fences stay', () => {
      assert.strictEqual(run('MD-001', '###### a\n\n  text\n```\n# code\n```'), '###### a\n\n# text\n```\n# code\n```');
      assert.strictEqual(run('MD-001', '#tag'), '# #tag');
      assert.strictEqual(run('MD-001', '###### a'), 'unchanged');
    });

    test('MD-002: a level-1 heading becomes its text (closing #s removed); other lines stay', () => {
      assert.strictEqual(run('MD-002', '# a #\n### b\ntext\n```\n## c\n```'), 'a\n## b\ntext\n```\n## c\n```');
      assert.strictEqual(run('MD-002', 'text'), 'unchanged');
    });

    test('MD-013: multi-line paragraphs, thematic breaks, === without a paragraph, fences', () => {
      assert.strictEqual(run('MD-013', 'a\nb\n===\n\n---\n\n===\n```\nx\n---\n```'), '# a b\n\n---\n\n===\n```\nx\n---\n```');
      assert.strictEqual(run('MD-013', '- item\n---'), 'unchanged');
    });

    test('MD-021: GitHub slugs (Unicode, symbols, markup), lines without # and blank lines', () => {
      assert.strictEqual(run('MD-021', '# 日本語 Title_1\n\nplain line\n## **Bold** `code` [x](y)'),
        '[日本語 Title_1](#日本語-title_1)\n\n[plain line](#plain-line)\n[**Bold** `code` \\[x\\](y)](#bold-code-x)');
      assert.strictEqual(run('MD-021', '```\n# a\n```'), 'unchanged');
    });

    test('slugs: repeated slugs are numbered like GitHub', () => {
      const counter = new SlugCounter();
      assert.deepStrictEqual(['a', 'a', 'a-1', 'a'].map((slug) => counter.unique(slug)), ['a', 'a-1', 'a-1-1', 'a-2']);
      assert.strictEqual(githubSlug('Hello,  World! (v2.0)'), 'hello--world-v20');
      assert.strictEqual(escapeLinkText('a [b] \\[c'), 'a \\[b\\] \\[c');
    });
  });

  suite('MD-003 table of contents', () => {
    test('a cursor inserts the table of contents of the whole document', () => {
      const text = '\n# A\n## B\n### C\n```\n# not\n```';
      // The cursor's empty line becomes a blank line after the list (a text line follows it).
      assert.strictEqual(run('MD-003', text, { ranges: [{ start: 0, end: 0 }] }), `- [A](#a)\n  - [B](#b)\n    - [C](#c)\n${text}`);
    });

    test('a selection is replaced with the table of contents of its headings; other lines go', () => {
      const text = 'intro\n## B\ntext\n### C\nend';
      assert.strictEqual(run('MD-003', text, { ranges: [{ start: 6, end: text.indexOf('\nend') }] }), 'intro\n\n- [B](#b)\n  - [C](#c)\n\nend');
    });

    test('repeated headings are numbered over the whole document', () => {
      const text = '# A\n# A\n## A';
      // Only the last heading is selected: it is the third "a" of the document.
      assert.strictEqual(run('MD-003', text, { ranges: [{ start: 8, end: 12 }] }), '# A\n# A\n\n- [A](#a-2)');
      assert.deepStrictEqual(documentHeadings(text).map(({ slug }) => slug), ['a', 'a-1', 'a-2']);
    });

    test('selections without headings are left; no headings at all informs', () => {
      assert.strictEqual(run('MD-003', 'text'), `info: ${MD_NO_HEADINGS}`);
      assert.strictEqual(run('MD-003', 'text', { ranges: [{ start: 0, end: 0 }] }), `info: ${MD_NO_HEADINGS}`);
      assert.strictEqual(run('MD-003', 'x\n# A', { ranges: [{ start: 0, end: 1 }, { start: 2, end: 5 }] }), 'x\n\n- [A](#a)');
    });

    test('skipped levels nest only one step deeper; a shallower heading goes back to its parent', () => {
      // "#### D" under "# A" is one step (2 spaces) deeper, not 3: 4 or more spaces more than the
      // parent item would make CommonMark read the line as a continuation of the item above.
      assert.strictEqual(run('MD-003', '# A\n#### D\n### C\n## B\n###### E\n# F', { ranges: [{ start: 0, end: 0 }] }).split('\n\n')[0],
        '- [A](#a)\n  - [D](#d)\n  - [C](#c)\n  - [B](#b)\n    - [E](#e)\n- [F](#f)');
      // A first heading deeper than a later one is not indented.
      assert.strictEqual(run('MD-003', '### C\n# A'), '- [C](#c)\n- [A](#a)');
    });

    test('many selections and cursors: headings found in one walk, the output limit checked first', function () {
      this.timeout(20_000);
      const count = 100_000;
      const text = Array.from({ length: count }, (_value, i) => `# h${i}`).join('\n');
      const ranges: MdRange[] = [];
      let offset = 0;
      for (let i = 0; i < count; i++) {
        ranges.push({ start: offset, end: offset + 1 });
        offset += `# h${i}`.length + 1;
      }
      fast('MD-003 100,000 selections x 100,000 headings', 2000, () => assert.strictEqual(result('MD-003', text, { ranges }).kind, 'edit'));
      const headings = Array.from({ length: 5000 }, (_value, i) => `# h${i}`).join('\n');
      const cursors = Array.from({ length: 3000 }, () => ({ start: 0, end: 0 }));
      fast('MD-003 3,000 cursors x 5,000 headings', 2000, () => assert.ok(failure('MD-003', headings, { ranges: cursors }).includes('longer than')));
    });

    test('many selections of spaces after the tables of contents: read past in one walk (SELEC-00144)', function () {
      this.timeout(20_000);
      const count = 50_000;
      // One selection with many headings, then many selections of one space on the line it ends on.
      const block = `${Array.from({ length: count }, (_value, i) => `# h${i}`).join('\n')}\nfoo`;
      const text = `${block}${' '.repeat(count + 4)}bar`;
      const ranges: MdRange[] = [{ start: 0, end: block.length }];
      for (let i = 0; i < count; i++) {
        ranges.push({ start: block.length + i, end: block.length + i + 1 });
      }
      fast('MD-003 1 selection x 50,000 headings + 50,000 selections of spaces', 2000, () => {
        const done = result('MD-003', text, { ranges });
        assert.ok(done.kind === 'edit');
        assert.ok(applied(text, done).endsWith('\n\nbar'));
      });
      // Many tables of contents, each followed by a selection of spaces on its last line.
      let many = '';
      const pairs: MdRange[] = [];
      for (let i = 0; i < count; i++) {
        const start = many.length;
        many += `# h${i}\nfoo`;
        pairs.push({ start, end: many.length }, { start: many.length, end: many.length + 2 });
        many += '      bar\n';
      }
      const outcomes: MdResult[] = [];
      fast('MD-003 50,000 selections with headings + 50,000 selections of spaces', 2000, () => outcomes.push(result('MD-003', many, { ranges: pairs })));
      const done = outcomes[0];
      // Checked outside the timing: `applied` rebuilds the text once per edit.
      assert.ok(done.kind === 'edit');
      assert.ok(done.edits.every(({ end }) => many.slice(end, end + 3) === 'bar'));
    });

    test('CRLF: the table of contents uses CRLF', () => {
      assert.strictEqual(run('MD-003', '# A\r\n## B', { eol: '\r\n' }), '- [A](#a)\r\n  - [B](#b)');
    });
  });

  suite('lists and quotes (MD-004..009, 015)', () => {
    test('MD-004: markers become "-", checkboxes stay, indentation stays', () => {
      assert.strictEqual(run('MD-004', '* a\n  + b\n3) c\n- [x] d\n1. [ ] e'), '- a\n  - b\n- c\n- [x] d\n- [ ] e');
      assert.strictEqual(run('MD-004', '- [x] a'), 'unchanged');
    });

    test('MD-005: numbered through the selection (non-blank lines), checkboxes stay', () => {
      assert.strictEqual(run('MD-005', 'a\n\n- [ ] b\n  * c'), '1. a\n\n2. [ ] b\n  3. c');
    });

    test('MD-006: existing checkboxes keep their state', () => {
      assert.strictEqual(run('MD-006', '- [x] a\n* b\n\nc'), '- [x] a\n- [ ] b\n\n- [ ] c');
    });

    test('MD-007: [ ] <-> [x] / [X]; lines without a task stay', () => {
      assert.strictEqual(run('MD-007', '- [x] a\n* [X] b\n1. [ ] c\ntext\n- d'), '- [ ] a\n* [ ] b\n1. [x] c\ntext\n- d');
    });

    test('MD-008: markers, numbers and checkboxes go; indentation stays', () => {
      assert.strictEqual(run('MD-008', '  - [x] a\n10) b\ntext'), '  a\nb\ntext');
    });

    test('MD-009: levels by indentation, delimiters kept, resets', () => {
      assert.strictEqual(run('MD-009', '3. a\n   7. b\n   9) c\n4. d\n\n8. e\ntext\n5. f'),
        '1. a\n   1. b\n   2) c\n2. d\n\n3. e\ntext\n1. f');
      assert.strictEqual(run('MD-009', '2. a\n- b\n5. c'), '1. a\n- b\n1. c');
      assert.strictEqual(run('MD-009', '```\n5. a\n```'), 'unchanged');
    });

    test('MD-015: blank lines become ">"', () => {
      assert.strictEqual(run('MD-015', 'a\n\n  b'), '> a\n>\n>   b');
    });

    test('list item parsing', () => {
      assert.strictEqual(parseListItem('-a'), undefined);
      assert.strictEqual(parseListItem('1234567890. a'), undefined);
      assert.deepStrictEqual(parseListItem('- [ ]'), { indent: '', marker: '-', ordered: false, number: undefined, delimiter: undefined, spacing: ' ', checkbox: '[ ]', checkboxSpacing: '', rest: '' });
      assert.strictEqual(parseAtxHeading('####### a'), undefined);
      assert.strictEqual(parseAtxHeading('#a'), undefined);
      assert.strictEqual(parseAtxHeading('    # a'), undefined);
      assert.strictEqual(parseAtxHeading('## a ## ')?.text, 'a');
      assert.strictEqual(parseAtxHeading('## a#')?.text, 'a#');
    });
  });

  suite('wrapping (MD-010..012, 014, 016, 024)', () => {
    test('MD-010..012: whitespace stays outside; whitespace only is left; multi-line is wrapped once', () => {
      assert.strictEqual(run('MD-010', ' a b '), ' **a b** ');
      assert.strictEqual(run('MD-011', '\t\n'), 'unchanged');
      assert.strictEqual(run('MD-012', 'a\n\nb\n'), '~~a\n\nb~~\n');
    });

    test('MD-014: the fence is longer than any backtick run; empty language; trailing line break', () => {
      assert.strictEqual(run('MD-014', 'a ```` b\n', { inputs: [''] }), '`````\na ```` b\n`````\n');
      assert.strictEqual(run('MD-014', 'x', { inputs: ['c++'] }), '```c++\nx\n```');
      assert.ok(failure('MD-014', 'x', { inputs: ['a`b'] }));
      assert.ok(failure('MD-014', 'x', { inputs: ['a\nb'] }));
    });

    test('MD-014: the language box accepts letters, digits and _ + # . - up to 50 characters', () => {
      assert.strictEqual(validateLanguageInput(''), undefined);
      assert.strictEqual(validateLanguageInput('objective-c++.1_#'), undefined);
      for (const bad of ['a b', 'a`', '"', 'a\n', '<x>', 'x'.repeat(51)]) {
        assert.ok(validateLanguageInput(bad), bad);
      }
    });

    test('MD-016: alt text escaping, <…> for unusual URLs, whitespace outside, line breaks refused', () => {
      assert.strictEqual(run('MD-016', ' a.png ', { inputs: ['a [b] \\c'] }), ' ![a \\[b\\] \\\\c](a.png) ');
      assert.strictEqual(run('MD-016', 'my image (1.png', { inputs: [''] }), '![](<my image (1.png>)');
      assert.strictEqual(run('MD-016', 'a<b>.png', { inputs: [''] }), '![](<a%3Cb%3E.png>)');
      assert.strictEqual(run('MD-016', 'f(1).png', { inputs: [''] }), '![](f(1).png)');
      assert.ok(failure('MD-016', 'a\nb', { inputs: [''] }).includes('line break'));
      assert.ok(failure('MD-016', 'a', { inputs: ['x\ny'] }));
      assert.strictEqual(run('MD-016', '  ', { inputs: [''] }), 'unchanged');
    });

    test('MD-024: summary escaping, default summary, trailing line break', () => {
      assert.strictEqual(run('MD-024', 'x\n', { inputs: ['<b>"&\''] }), '<details><summary>&lt;b&gt;&quot;&amp;&#39;</summary>\n\nx\n\n</details>\n');
      assert.strictEqual(run('MD-024', 'x', { inputs: ['  '] }), '<details><summary>Details</summary>\n\nx\n\n</details>');
      assert.ok(failure('MD-024', 'x', { inputs: ['a\rb'] }));
      assert.strictEqual(validateLabelInput('x'.repeat(1000)), undefined);
      assert.ok(validateLabelInput('x'.repeat(1001)));
    });
  });

  suite('MD-017 linkify URLs', () => {
    test('trailing punctuation and unmatched brackets stay outside', () => {
      assert.strictEqual(run('MD-017', '(see https://a.example/x_(y).) and http://b.example.'), '(see <https://a.example/x_(y)>.) and <http://b.example>.');
    });

    test('URLs in code, <…>, links, images, reference definitions are left', () => {
      const text = [
        '`https://a.example` <https://b.example> <a href="https://c.example">',
        '[https://d.example](https://e.example) ![i](https://f.example)',
        '[1]: https://g.example',
        '```',
        'https://h.example',
        '```',
        'https://i.example',
      ].join('\n');
      assert.strictEqual(run('MD-017', text), text.replace('https://i.example', '<https://i.example>'));
      assert.strictEqual(run('MD-017', 'no url here https://'), 'unchanged');
    });
  });

  suite('MD-018 format table', () => {
    test('alignments are kept and used; missing cells are added; escaped | and code spans', () => {
      assert.strictEqual(run('MD-018', '|a|b|c|d\n|:-|:-:|-:|\n|x|`a|b`|\\||'),
        [
          '| a   |   b   |   c | d |',
          '| :-- | :---: | --: | - |',
          '| x   | `a|b` |  \\| |   |',
        ].join('\n'));
    });

    test('widths count code points; indentation of the first row', () => {
      assert.strictEqual(run('MD-018', '  |😀|b|\n|-|-|'), '  | 😀 | b |\n  | - | - |');
    });

    test('a table whose result would be too long is refused before the cells are padded', () => {
      const text = `|${'x'.repeat(1_000_000)}|\n|-|\n${'|a|\n'.repeat(1000)}`;
      fast('MD-018 1,000,000-character cell x 1,000 rows', 1000, () => assert.ok(failure('MD-018', text).includes('longer than')));
      // Just under the limit is still formatted.
      const rows = Math.floor(MAX_OUTPUT_LENGTH / 1005) - 3;
      const fits = `|${'x'.repeat(1000)}|\n|-|\n${'|a|\n'.repeat(rows)}`;
      assert.strictEqual(result('MD-018', fits).kind, 'edit');
    });

    test('not a table: warns', () => {
      assert.ok(failure('MD-018', 'a\nb').startsWith('the selection is not a Markdown table'));
      assert.ok(failure('MD-018', '|a|\n|b|'));
      assert.ok(failure('MD-018', '|a|'));
      assert.ok(failure('MD-018', '|a|\n|-|\n\n|b|'));
    });
  });

  suite('MD-020 strip formatting', () => {
    test('block markup, inline markup, escapes; code fences keep their lines', () => {
      assert.strictEqual(run('MD-020', [
        '> ## Title ##',
        '- [x] **bold** _it_ ~~del~~ `code`',
        '1. ![alt](i.png) [link](u "t") <https://a.example>',
        '---',
        'a \\*b\\* snake_case_name',
        'Setext',
        '===',
        '```js',
        '**kept**',
        '```',
      ].join('\n')), [
        'Title',
        'bold it del code',
        'alt link https://a.example',
        'a *b* snake_case_name',
        'Setext',
        '**kept**',
      ].join('\n'));
    });

    test('emphasis across lines of a paragraph', () => {
      assert.strictEqual(run('MD-020', '**a\nb**\n\n*c*'), 'a\nb\n\nc');
    });
  });

  suite('MD-022 footnotes', () => {
    const footnote = (text: string, ranges: [number, number][], eol: MdEol = '\n') =>
      run('MD-022', text, { ranges: ranges.map(([start, end]) => ({ start, end })), eol });

    test('the end of the document: no line break, one line break, a blank line', () => {
      assert.strictEqual(footnote('a b', [[2, 3]]), 'a [^1]\n\n[^1]: b');
      assert.strictEqual(footnote('a b\n', [[2, 3]]), 'a [^1]\n\n[^1]: b\n');
      assert.strictEqual(footnote('a b\n\n', [[2, 3]]), 'a [^1]\n\n[^1]: b\n');
      assert.strictEqual(footnote('a b\r\n', [[2, 3]], '\r\n'), 'a [^1]\r\n\r\n[^1]: b\r\n');
    });

    test('numbers continue from the document, in document order; multi-line definitions are indented', () => {
      const text = 'x[^3] a b\nc\n\n[^3]: old';
      const result = footnote(text, [[6, 7], [8, 11]]);
      assert.strictEqual(result, 'x[^3] [^4] [^5]\n\n[^3]: old\n\n[^4]: a\n[^5]: b\n    c');
    });

    test('a selection that ends the document; trailing line breaks of the selection stay; blank selections are left', () => {
      assert.strictEqual(footnote('a b\n', [[2, 4]]), 'a [^1]\n\n[^1]: b\n');
      assert.strictEqual(footnote('a  b', [[1, 3]]), 'unchanged');
    });

    test('the selections after the edit are the [^n]', () => {
      const outcome = result('MD-022', 'ab cd', { ranges: [{ start: 0, end: 2 }, { start: 3, end: 5 }] });
      assert.ok(outcome.kind === 'edit');
      assert.deepStrictEqual(outcome.ranges, [{ start: 0, end: 4 }, { start: 5, end: 9 }]);
    });
  });

  suite('MD-023 reference links', () => {
    test('titles, repeated URLs, numbers after the existing definitions, images and code left', () => {
      const text = '[a](u1 "T") [b](<u 2>) [c](u1 "T") ![i](img) `[d](u3)` [e](u1)\n\n[7]: old';
      assert.strictEqual(run('MD-023', text, { ranges: [{ start: 0, end: text.indexOf('\n') }] }),
        '[a][8] [b][9] [c][8] ![i](img) `[d](u3)` [e][10]\n\n[8]: u1 "T"\n[9]: <u 2>\n[10]: u1\n\n[7]: old');
    });

    test('several selections share the numbers; a selection without links is left', () => {
      const text = '[a](x)\n[b](x) [c](y)\nplain';
      const ranges = [{ start: 0, end: 6 }, { start: 7, end: 20 }, { start: 21, end: 26 }];
      // The three lines are one paragraph: the definitions go after its last line (SELEC-00151).
      assert.strictEqual(run('MD-023', text, { ranges }), '[a][1]\n[b][1] [c][2]\nplain\n\n[1]: x\n[2]: y');
    });

    test('a link around an image; an empty destination is left', () => {
      assert.strictEqual(run('MD-023', '[![i](s)](h)'), '[![i](s)][1]\n\n[1]: h');
      assert.strictEqual(run('MD-023', '[a]()'), 'unchanged');
    });
  });

  suite('MD-025 front matter', () => {
    test('body stays, empty front matter, "..." closing, non-mapping YAML, CORE schema', () => {
      assert.strictEqual(run('MD-025', '---\nt: a\nn: [1, 2]\n...\nbody\n'), '{"t":"a","n":[1,2]}\nbody\n');
      assert.strictEqual(run('MD-025', '---\n# comment\n---'), '{}');
      assert.strictEqual(run('MD-025', '---\n- a\n---'), '["a"]');
      assert.strictEqual(run('MD-025', '---\nd: 2024-01-01\n---'), '{"d":"2024-01-01"}');
      assert.strictEqual(run('MD-025', '---\r\nt: a\r\n---\r\nb', { eol: '\r\n' }), '{"t":"a"}\r\nb');
    });

    test('no front matter, no closing line, invalid YAML, dangerous tags: warns without quoting the text', () => {
      assert.ok(failure('MD-025', 'title: a').includes('front matter'));
      assert.ok(failure('MD-025', '---\ntitle: a').includes('closing'));
      assert.ok(failure('MD-025', '---\nsecret: [\n---').startsWith('invalid YAML: line'));
      assert.ok(!failure('MD-025', '---\nsecret: [\n---').includes('secret'));
      for (const tag of ['!!js/function "function () {}"', '!!js/undefined ""', '!!js/regexp /a/', '!!python/object:os.system x']) {
        assert.ok(failure('MD-025', `---\na: ${tag}\n---`).includes('unknown tag'), tag);
      }
    });

    test('an alias explosion is refused before the JSON is built', function () {
      this.timeout(20_000);
      const lines = ['---', 'a0: &a0 [x, x, x, x, x, x, x, x, x, x]'];
      for (let i = 1; i <= 9; i++) {
        lines.push(`a${i}: &a${i} [${Array.from({ length: 10 }, () => `*a${i - 1}`).join(', ')}]`);
      }
      lines.push('---');
      assert.ok(YAML_MAX_ALIAS_WORK > 0);
      fast('alias explosion', 3000, () => assert.ok(failure('MD-025', lines.join('\n')).includes('longer than')));
      const wide = ['---', 'a: &a [1]', `b: [${Array.from({ length: 20000 }, () => '*a').join(', ')}]`, `c: [${Array.from({ length: 20000 }, () => '*a').join(', ')}]`, '---'];
      assert.doesNotThrow(() => run('MD-025', wide.join('\n')));
    });
  });

  suite('partial lines: blocks and definitions stay on lines of their own (MD-003, 014, 023, 024)', () => {
    /** The selection of `part` (its first occurrence at or after `from`). */
    const select = (text: string, part: string, from = 0): MdRange => {
      const start = text.indexOf(part, from);
      assert.ok(start !== -1, part);
      return { start, end: start + part.length };
    };
    /** The texts selected after the edit. */
    const selectedAfter = (id: string, text: string, options: RunOptions): string[] => {
      const outcome = result(id, text, options);
      assert.ok(outcome.kind === 'edit');
      const edited = applied(text, outcome);
      return outcome.ranges.map(({ start, end }) => edited.slice(start, end));
    };

    test('MD-014: line breaks around the fences when the selection starts or ends inside a line', () => {
      const text = 'say a=1 now';
      // The spaces where the line is split are dropped.
      assert.strictEqual(run('MD-014', text, { inputs: ['js'], ranges: [select(text, 'a=1')] }), 'say\n```js\na=1\n```\nnow');
      assert.strictEqual(run('MD-014', 'x foo', { inputs: [''], ranges: [{ start: 2, end: 5 }] }), 'x\n```\nfoo\n```');
      assert.strictEqual(run('MD-014', 'foo y', { inputs: [''], ranges: [{ start: 0, end: 3 }] }), '```\nfoo\n```\ny');
      assert.strictEqual(run('MD-014', 'x \t foo \t y', { inputs: [''], ranges: [{ start: 4, end: 7 }] }), 'x\n```\nfoo\n```\ny');
      // Only indentation before, only spaces after, a selection ending with its line break: no extra line breaks.
      // The indentation of up to 3 columns before the selection is written before its first line and
      // the closing fence too (SELEC-00082), so that the line stays as it was; rendered, it is still "foo".
      assert.strictEqual(run('MD-014', '  foo  ', { inputs: [''], ranges: [{ start: 2, end: 5 }] }), '  ```\n  foo\n  ```  ');
      assert.strictEqual(run('MD-014', 'x foo\ny', { inputs: [''], ranges: [{ start: 2, end: 6 }] }), 'x\n```\nfoo\n```\ny');
      // The closing fence ends the block: a text line right after it needs no blank line.
      assert.strictEqual(run('MD-014', 'foo\nbar', { inputs: [''], ranges: [{ start: 0, end: 3 }] }), '```\nfoo\n```\nbar');
      // Two selections on one line; CRLF.
      const two = 'a b c';
      assert.strictEqual(run('MD-014', two, { inputs: [''], ranges: [select(two, 'a'), select(two, 'c')] }), '```\na\n```\nb\n```\nc\n```');
      assert.strictEqual(run('MD-014', 'say a=1 now', { inputs: [''], ranges: [{ start: 4, end: 7 }], eol: '\r\n' }), 'say\r\n```\r\na=1\r\n```\r\nnow');
      // The dropped spaces never reach into another selection (here a cursor right after the space).
      const cursor = result('MD-014', 'a  b', { inputs: [''], ranges: [{ start: 0, end: 1 }, { start: 2, end: 2 }] });
      assert.ok(cursor.kind === 'edit');
      assert.strictEqual(applied('a  b', cursor), '```\na\n```\n b');
      assert.deepStrictEqual(cursor.ranges.map(({ start, end }) => [start, end]), [[0, 10], [10, 10]]);
    });

    test('MD-024: a line break before <details>, a blank line after </details> when text follows', () => {
      const text = 'x foo y';
      assert.strictEqual(run('MD-024', text, { inputs: ['s'], ranges: [select(text, 'foo')] }),
        'x\n<details><summary>s</summary>\n\nfoo\n\n</details>\n\ny');
      // A whole line followed by a text line: a blank line ends the HTML block.
      assert.strictEqual(run('MD-024', 'foo\ny', { inputs: [''], ranges: [{ start: 0, end: 4 }] }),
        '<details><summary>Details</summary>\n\nfoo\n\n</details>\n\ny');
      // Already followed by a blank line, or by nothing: nothing is added.
      assert.strictEqual(run('MD-024', 'foo\n\ny', { inputs: [''], ranges: [{ start: 0, end: 5 }] }),
        '<details><summary>Details</summary>\n\nfoo\n\n</details>\n\ny');
      assert.strictEqual(run('MD-024', 'foo\n', { inputs: [''], ranges: [{ start: 0, end: 3 }] }),
        '<details><summary>Details</summary>\n\nfoo\n\n</details>\n');
    });

    test('MD-024: a selection ending at the end of its line without the line break, followed by a text line (QA round 2)', () => {
      // Shift+End on "foo": the next line would be part of the HTML block without a blank line.
      assert.strictEqual(run('MD-024', 'foo\nbar', { inputs: ['S'], ranges: [{ start: 0, end: 3 }] }),
        '<details><summary>S</summary>\n\nfoo\n\n</details>\n\nbar');
      assert.strictEqual(run('MD-024', 'foo\r\n**bar**', { inputs: ['S'], ranges: [{ start: 0, end: 3 }], eol: '\r\n' }),
        '<details><summary>S</summary>\r\n\r\nfoo\r\n\r\n</details>\r\n\r\n**bar**');
      // Spaces at the end of the line make it a blank line; the next line is blank or missing: nothing added.
      assert.strictEqual(run('MD-024', 'foo  \nbar', { inputs: ['S'], ranges: [{ start: 0, end: 3 }] }),
        '<details><summary>S</summary>\n\nfoo\n\n</details>\n  \nbar');
      assert.strictEqual(run('MD-024', 'foo\n\nbar', { inputs: ['S'], ranges: [{ start: 0, end: 3 }] }),
        '<details><summary>S</summary>\n\nfoo\n\n</details>\n\nbar');
      assert.strictEqual(run('MD-024', 'foo\n  \nbar', { inputs: ['S'], ranges: [{ start: 0, end: 3 }] }),
        '<details><summary>S</summary>\n\nfoo\n\n</details>\n  \nbar');
      assert.strictEqual(run('MD-024', 'x\nfoo', { inputs: ['S'], ranges: [{ start: 2, end: 5 }] }),
        'x\n<details><summary>S</summary>\n\nfoo\n\n</details>');
      // Several lines selected up to the end of the last one.
      assert.strictEqual(run('MD-024', 'a\nb\nc', { inputs: ['S'], ranges: [{ start: 0, end: 3 }] }),
        '<details><summary>S</summary>\n\na\nb\n\n</details>\n\nc');
    });

    test('MD-014/023/024: the final line break of the text is kept, and none is added (SELEC-00066)', () => {
      // The whole text selected, up to its final line break (LF, CRLF).
      assert.strictEqual(run('MD-014', 'foo\n', { inputs: ['js'] }), '```js\nfoo\n```\n');
      assert.strictEqual(run('MD-014', 'foo\r\n', { inputs: ['js'], eol: '\r\n' }), '```js\r\nfoo\r\n```\r\n');
      assert.strictEqual(run('MD-024', 'foo\n', { inputs: ['S'] }), '<details><summary>S</summary>\n\nfoo\n\n</details>\n');
      assert.strictEqual(run('MD-024', 'foo\r\n', { inputs: ['S'], eol: '\r\n' }), '<details><summary>S</summary>\r\n\r\nfoo\r\n\r\n</details>\r\n');
      assert.strictEqual(run('MD-023', '[a](u)\n'), '[a][1]\n\n[1]: u\n');
      assert.strictEqual(run('MD-023', '[a](u)\r\n', { eol: '\r\n' }), '[a][1]\r\n\r\n[1]: u\r\n');
      // The selection ends before the final line break: it stays (not doubled).
      assert.strictEqual(run('MD-014', 'foo\n', { inputs: ['js'], ranges: [{ start: 0, end: 3 }] }), '```js\nfoo\n```\n');
      assert.strictEqual(run('MD-024', 'foo\n', { inputs: ['S'], ranges: [{ start: 0, end: 3 }] }), '<details><summary>S</summary>\n\nfoo\n\n</details>\n');
      assert.strictEqual(run('MD-023', '[a](u)\n', { ranges: [{ start: 0, end: 6 }] }), '[a][1]\n\n[1]: u\n');
      // No final line break: none is added.
      assert.strictEqual(run('MD-014', 'foo', { inputs: ['js'] }), '```js\nfoo\n```');
      assert.strictEqual(run('MD-024', 'foo', { inputs: ['S'] }), '<details><summary>S</summary>\n\nfoo\n\n</details>');
      assert.strictEqual(run('MD-023', '[a](u)'), '[a][1]\n\n[1]: u');
      // From the middle of the last line to the end of the text, with and without the final line break.
      assert.strictEqual(run('MD-014', 'x foo\n', { inputs: ['js'], ranges: [{ start: 2, end: 6 }] }), 'x\n```js\nfoo\n```\n');
      assert.strictEqual(run('MD-014', 'x foo', { inputs: ['js'], ranges: [{ start: 2, end: 5 }] }), 'x\n```js\nfoo\n```');
      assert.strictEqual(run('MD-024', 'x foo\n', { inputs: ['S'], ranges: [{ start: 2, end: 6 }] }), 'x\n<details><summary>S</summary>\n\nfoo\n\n</details>\n');
      assert.strictEqual(run('MD-024', 'x foo', { inputs: ['S'], ranges: [{ start: 2, end: 5 }] }), 'x\n<details><summary>S</summary>\n\nfoo\n\n</details>');
      assert.strictEqual(run('MD-023', 'x [a](u)\n', { ranges: [{ start: 2, end: 9 }] }), 'x [a][1]\n\n[1]: u\n');
      assert.strictEqual(run('MD-023', 'x [a](u)', { ranges: [{ start: 2, end: 8 }] }), 'x [a][1]\n\n[1]: u');
      // MD-023: the definitions go after the end of the line, before the final line break.
      const inside = 'see [a](u) here\n';
      assert.strictEqual(run('MD-023', inside, { ranges: [select(inside, '[a](u)')] }), 'see [a][1] here\n\n[1]: u\n');
    });

    test('MD-014/024: indentation of 4 columns or more before the block is dropped (SELEC-00066)', () => {
      // After a blank line, 4 spaces or a tab would make the fence or the tag an indented code block.
      assert.strictEqual(run('MD-014', 'para\n\n    foo', { inputs: ['js'], ranges: [{ start: 10, end: 13 }] }), 'para\n\n```js\nfoo\n```');
      assert.strictEqual(run('MD-014', 'para\n\n\tfoo', { inputs: ['js'], ranges: [{ start: 7, end: 10 }] }), 'para\n\n```js\nfoo\n```');
      assert.strictEqual(run('MD-014', 'para\n\n    foo\n', { inputs: ['js'], ranges: [{ start: 10, end: 14 }] }), 'para\n\n```js\nfoo\n```\n');
      assert.strictEqual(run('MD-024', 'para\n\n    foo', { inputs: ['S'], ranges: [{ start: 10, end: 13 }] }),
        'para\n\n<details><summary>S</summary>\n\nfoo\n\n</details>');
      assert.strictEqual(run('MD-024', 'para\n\n\tfoo', { inputs: ['S'], ranges: [{ start: 7, end: 10 }] }),
        'para\n\n<details><summary>S</summary>\n\nfoo\n\n</details>');
      // Boundaries: 3 spaces stay; 4 spaces, more than 4, and 2 spaces and a tab (4 columns) are dropped.
      // MD-014 (SELEC-00082) and MD-024 (SELEC-00135) write the 3 spaces before the first line in the
      // block and the closing fence or tag too: the fence's indentation is removed from the line when
      // rendered, so it still renders as "foo".
      assert.strictEqual(run('MD-014', '   foo', { inputs: [''], ranges: [{ start: 3, end: 6 }] }), '   ```\n   foo\n   ```');
      assert.strictEqual(run('MD-014', '    foo', { inputs: [''], ranges: [{ start: 4, end: 7 }] }), '```\nfoo\n```');
      assert.strictEqual(run('MD-014', '      foo', { inputs: [''], ranges: [{ start: 6, end: 9 }] }), '```\nfoo\n```');
      assert.strictEqual(run('MD-014', '  \tfoo', { inputs: [''], ranges: [{ start: 3, end: 6 }] }), '```\nfoo\n```');
      assert.strictEqual(run('MD-024', '   foo', { inputs: ['S'], ranges: [{ start: 3, end: 6 }] }), '   <details><summary>S</summary>\n\n   foo\n\n   </details>');
      assert.strictEqual(run('MD-024', '  \tfoo', { inputs: ['S'], ranges: [{ start: 3, end: 6 }] }), '<details><summary>S</summary>\n\nfoo\n\n</details>');
      // The indentation selected with the text stays in the block, as before.
      assert.strictEqual(run('MD-014', '    foo', { inputs: [''] }), '```\n    foo\n```');
      // From inside the indentation: the 2 columns before the selection are written before the line
      // in the block and the closing fence as well (SELEC-00082), so the line is as it was, and the
      // 2 selected columns stay when rendered ("  foo"; before SELEC-00082 the block was "  foo" and
      // rendered as "foo").
      assert.strictEqual(run('MD-014', '    foo', { inputs: [''], ranges: [{ start: 2, end: 7 }] }), '  ```\n    foo\n  ```');
      // From inside 4 columns or more: only the indentation before the selection is removed; the
      // spaces and tabs selected with the text stay in the block (SELEC-00082).
      assert.strictEqual(run('MD-014', '      foo', { inputs: [''], ranges: [{ start: 4, end: 9 }] }), '```\n  foo\n```');
      assert.strictEqual(run('MD-014', '\t  foo', { inputs: [''], ranges: [{ start: 1, end: 6 }] }), '```\n  foo\n```');
      // CRLF.
      assert.strictEqual(run('MD-014', 'p\r\n\r\n    foo\r\n', { inputs: [''], ranges: [{ start: 9, end: 14 }], eol: '\r\n' }), 'p\r\n\r\n```\r\nfoo\r\n```\r\n');
      assert.strictEqual(run('MD-024', 'p\r\n\r\n\tfoo\r\n', { inputs: ['S'], ranges: [{ start: 6, end: 11 }], eol: '\r\n' }),
        'p\r\n\r\n<details><summary>S</summary>\r\n\r\nfoo\r\n\r\n</details>\r\n');
      // Text after the selection on its line: split as before.
      assert.strictEqual(run('MD-014', '    foo  bar', { inputs: [''], ranges: [{ start: 4, end: 7 }] }), '```\nfoo\n```\nbar');
      // Two selections on one line: the second follows text, so it starts on a new line as before.
      assert.strictEqual(run('MD-014', '    a b', { inputs: [''], ranges: [{ start: 4, end: 5 }, { start: 6, end: 7 }] }), '```\na\n```\n\n```\nb\n```');
      // A cursor inside the indentation does not cut it short (SELEC-00135): the whole indentation
      // is counted and taken into the edit, as with no cursor, and the cursor moves to the start of
      // the line.
      assert.strictEqual(run('MD-014', '    foo', { inputs: [''], ranges: [{ start: 2, end: 2 }, { start: 4, end: 7 }] }), '```\nfoo\n```');
      assert.strictEqual(run('MD-024', '    foo', { inputs: ['S'], ranges: [{ start: 2, end: 2 }, { start: 4, end: 7 }] }),
        '<details><summary>S</summary>\n\nfoo\n\n</details>');
      // The block and the selection after it start at the start of the line.
      assert.deepStrictEqual(selectedAfter('MD-014', 'para\n\n    foo', { inputs: [''], ranges: [{ start: 10, end: 13 }] }), ['```\nfoo\n```']);
    });

    test('MD-014: lines selected from after the indentation of the first one keep their relative indentation (SELEC-00082)', () => {
      const wrap = (text: string, start: number, eol: '\n' | '\r\n' = '\n'): string =>
        run('MD-014', text, { inputs: ['js'], ranges: [{ start, end: text.length }], eol });
      // Up to 3 columns, every later line starting with them: both fences stay after them and the
      // first line gets them too, so every line is as it was (rendered: "a\n  b", "a\nb").
      assert.strictEqual(wrap('  a\n    b', 2), '  ```js\n  a\n    b\n  ```');
      assert.strictEqual(wrap('   a\n     b', 3), '   ```js\n   a\n     b\n   ```');
      assert.strictEqual(wrap('  a\n  b', 2), '  ```js\n  a\n  b\n  ```');
      // A blank line (or one with fewer spaces only) does not count.
      assert.strictEqual(wrap('  a\n\n  b', 2), '  ```js\n  a\n\n  b\n  ```');
      assert.strictEqual(wrap('  a\n \n  b', 2), '  ```js\n  a\n \n  b\n  ```');
      // 4 columns or more: the fence starts the line and the shared indentation is removed.
      assert.strictEqual(wrap('    a\n    b', 4), '```js\na\nb\n```');
      assert.strictEqual(wrap('    a\n      b', 4), '```js\na\n  b\n```');
      assert.strictEqual(wrap('    a\n  b', 4), '```js\n  a\nb\n```');
      assert.strictEqual(wrap('\ta\n\tb', 1), '```js\na\nb\n```');
      // From inside 4 columns or more: no more than the indentation before the selection is removed,
      // so the spaces selected with the text stay on every line.
      assert.strictEqual(wrap('      a\n      b', 4), '```js\n  a\n  b\n```');
      assert.strictEqual(wrap('      a\n        b', 4), '```js\n  a\n    b\n```');
      assert.strictEqual(wrap('      a\n     b', 4), '```js\n  a\n b\n```');
      assert.strictEqual(wrap('\t  a\n\t  b', 1), '```js\n  a\n  b\n```');
      // A tab and spaces never match, even when they are as wide.
      assert.strictEqual(wrap('\ta\n    b', 1), '```js\n\ta\n    b\n```');
      // Blank lines lose only what matches the shared indentation.
      assert.strictEqual(wrap('    a\n\n  \n      \n    b', 4), '```js\na\n\n\n  \nb\n```');
      // Up to 3 columns, but a later line does not start with them: the fence goes to the start of
      // the line instead, so that no line loses columns the others keep when rendered.
      assert.strictEqual(wrap('  a\nb', 2), '```js\n  a\nb\n```');
      assert.strictEqual(wrap('  a\n\tb', 2), '```js\n  a\n\tb\n```');
      assert.strictEqual(wrap('  a\n b', 2), '```js\n a\nb\n```');
      // CRLF and a final line break of the selection are kept.
      assert.strictEqual(wrap('    a\r\n      b\r\n', 4, '\r\n'), '```js\r\na\r\n  b\r\n```\r\n');
      assert.strictEqual(wrap('  a\r\n    b\r\n', 2, '\r\n'), '  ```js\r\n  a\r\n    b\r\n  ```\r\n');
      // Mixed line breaks in the selection stay as they are.
      assert.strictEqual(wrap('    a\r\n    b\n    c\r    d', 4), '```js\na\r\nb\nc\rd\n```');
      // From the start of the line: the selected text is written as it is.
      assert.strictEqual(wrap('    a\n    b', 0), '```js\n    a\n    b\n```');
      assert.strictEqual(wrap('  a\n    b', 0), '```js\n  a\n    b\n```');
      // After other text on the line: nothing is added or removed.
      assert.strictEqual(wrap('x   a\n    b', 4), 'x\n```js\na\n    b\n```');
      // Inside a list item: both fences are indented as the item's content, so the block stays in
      // the item (a closing fence at the start of the line would end the item and open a new
      // block that is never closed). Block quotes ("> ") are not indentation and are not handled.
      assert.strictEqual(run('MD-014', '- item\n\n  a\n    b\n', { inputs: [''], ranges: [{ start: 10, end: 18 }] }), '- item\n\n  ```\n  a\n    b\n  ```\n');
      assert.strictEqual(run('MD-014', '1. item\n\n   a\n\nafter', { inputs: [''], ranges: [{ start: 12, end: 13 }] }), '1. item\n\n   ```\n   a\n   ```\n\nafter');
      // The edit and the selection after it.
      const taken = result('MD-014', 'p\n\n    a\n      b', { inputs: [''], ranges: [{ start: 7, end: 16 }] });
      assert.ok(taken.kind === 'edit');
      assert.strictEqual(applied('p\n\n    a\n      b', taken), 'p\n\n```\na\n  b\n```');
      assert.deepStrictEqual(selectedAfter('MD-014', '  a\n    b', { inputs: [''], ranges: [{ start: 2, end: 9 }] }), ['```\n  a\n    b\n  ```']);
    });

    test('MD-014: several selections each count only the indentation after the previous one (SELEC-00082)', () => {
      // Two selections on one line: the second follows text, so nothing is added to it.
      assert.strictEqual(run('MD-014', '  a b', { inputs: [''], ranges: [{ start: 2, end: 3 }, { start: 4, end: 5 }] }), '  ```\n  a\n  ```\n\n```\nb\n```');
      // Two lines selected separately: each counts its own indentation.
      const text = '  a\n    b';
      assert.strictEqual(run('MD-014', text, { inputs: [''], ranges: [{ start: 2, end: 3 }, { start: 8, end: 9 }] }), '  ```\n  a\n  ```\n```\nb\n```');
    });

    test('MD-014/024: a cursor inside the indentation does not cut it short (SELEC-00135)', () => {
      const ranges = (outcome: MdResult): number[][] => {
        assert.ok(outcome.kind === 'edit');
        return outcome.ranges.map(({ start, end }) => [start, end]);
      };
      // The case from the ticket: the fence starts the line (it is not 4 columns deep, which would
      // make it an indented code block), the lines keep their relative indentation, and the cursor
      // inside the indentation taken into the edit moves to the start of the line.
      const lines = '    a\n    b';
      const fenced = result('MD-014', lines, { inputs: [''], ranges: [{ start: 2, end: 2 }, { start: 4, end: 11 }] });
      assert.strictEqual(applied(lines, fenced), '```\na\nb\n```');
      assert.deepStrictEqual(ranges(fenced), [[0, 0], [0, 11]]);
      // The same as with no cursor; MD-024 too.
      assert.strictEqual(run('MD-014', '    foo', { inputs: [''], ranges: [{ start: 4, end: 7 }] }), '```\nfoo\n```');
      const details = result('MD-024', '    foo', { inputs: ['S'], ranges: [{ start: 2, end: 2 }, { start: 4, end: 7 }] });
      assert.strictEqual(applied('    foo', details), '<details><summary>S</summary>\n\nfoo\n\n</details>');
      assert.deepStrictEqual(ranges(details), [[0, 0], [0, 46]]);
      // Several cursors inside the indentation all move to the start of the line.
      const several = result('MD-014', '    foo', { inputs: [''], ranges: [{ start: 1, end: 1 }, { start: 3, end: 3 }, { start: 4, end: 7 }] });
      assert.strictEqual(applied('    foo', several), '```\nfoo\n```');
      assert.deepStrictEqual(ranges(several), [[0, 0], [0, 0], [0, 11]]);
      // A cursor inside indentation of tabs (a tab counts to the next multiple of 4): before
      // SELEC-00135 the tab before the cursor was left before the fence (`\t` + "```", an indented code block).
      const tabs = result('MD-014', '\t\tfoo', { inputs: [''], ranges: [{ start: 1, end: 1 }, { start: 2, end: 5 }] });
      assert.strictEqual(applied('\t\tfoo', tabs), '```\nfoo\n```');
      assert.deepStrictEqual(ranges(tabs), [[0, 0], [0, 11]]);
      // Up to 3 columns that stay: the whole indentation is written before the first line and the
      // closing fence (before SELEC-00135 only the column after the cursor was), and the cursor stays.
      const three = '   a\n   b';
      const kept = result('MD-014', three, { inputs: [''], ranges: [{ start: 1, end: 1 }, { start: 3, end: 9 }] });
      assert.strictEqual(applied(three, kept), '   ```\n   a\n   b\n   ```');
      assert.deepStrictEqual(ranges(kept), [[1, 1], [3, 23]]);
    });

    test('MD-014/024: a cursor in the spaces after other text keeps its place, as before (SELEC-00135)', () => {
      // The spaces split off after other text are not taken from before a cursor (unchanged by
      // SELEC-00135): the text and the cursor are as before.
      const text = 'x    foo';
      const fenced = result('MD-014', text, { inputs: [''], ranges: [{ start: 3, end: 3 }, { start: 5, end: 8 }] });
      assert.strictEqual(applied(text, fenced), 'x  \n```\nfoo\n```');
      assert.ok(fenced.kind === 'edit');
      assert.deepStrictEqual(fenced.ranges.map(({ start, end }) => [start, end]), [[3, 3], [3, 15]]);
      const details = result('MD-024', text, { inputs: ['S'], ranges: [{ start: 3, end: 3 }, { start: 5, end: 8 }] });
      assert.strictEqual(applied(text, details), 'x  \n<details><summary>S</summary>\n\nfoo\n\n</details>');
      assert.ok(details.kind === 'edit');
      assert.deepStrictEqual(details.ranges.map(({ start, end }) => [start, end]), [[3, 3], [3, 50]]);
    });

    test('MD-014: a cursor is moved by the next non-empty selection only, never by a later one (SELEC-00135)', () => {
      // The cursor is in the 3 columns kept before the first selection, so it stays; the second
      // selection (on the next line, 4 columns taken into its edit) does not move it either.
      const text = '   a\n    b';
      const outcome = result('MD-014', text, { inputs: [''], ranges: [{ start: 1, end: 1 }, { start: 3, end: 4 }, { start: 9, end: 10 }] });
      assert.strictEqual(applied(text, outcome), '   ```\n   a\n   ```\n```\nb\n```');
      assert.ok(outcome.kind === 'edit');
      assert.deepStrictEqual(outcome.ranges.map(({ start, end }) => [start, end]), [[1, 1], [3, 18], [19, 28]]);
    });

    test('MD-014/024: a cursor in the spaces after the selection does not leave 4 columns at the start of the next line (SELEC-00143)', () => {
      const outcome = (id: string, text: string, ranges: MdRange[], eol: MdEol = '\n'): [string, number[][]] => {
        const done = result(id, text, { inputs: [id === 'MD-014' ? '' : 'S'], ranges, eol });
        assert.ok(done.kind === 'edit');
        return [applied(text, done), done.ranges.map(({ start, end }) => [start, end])];
      };
      const cursors = (...offsets: number[]): MdRange[] => offsets.map((offset) => ({ start: offset, end: offset }));
      const a = { start: 0, end: 1 };
      const details = '<details><summary>S</summary>\n\na\n\n</details>\n\n';
      // Before SELEC-00143 the edit stopped at the cursor, and the 4 spaces after it started the
      // next line (`    b`, an indented code block). Now they are taken into the edit and the
      // cursor moves to the start of the next line.
      assert.deepStrictEqual(outcome('MD-014', 'a     b', [a, ...cursors(2)]), ['```\na\n```\nb', [[0, 10], [10, 10]]]);
      assert.deepStrictEqual(outcome('MD-024', 'a     b', [a, ...cursors(2)]), [`${details}b`, [[0, 46], [46, 46]]]);
      // 4 columns after the first cursor but 1 after the last: what the first cursor would leave
      // counts, so the spaces are taken past both cursors, which both move to the start of the next line.
      assert.deepStrictEqual(outcome('MD-014', 'a     b', [a, ...cursors(2, 5)]), ['```\na\n```\nb', [[0, 10], [10, 10], [10, 10]]]);
      assert.deepStrictEqual(outcome('MD-024', 'a     b', [a, ...cursors(2, 5)]), [`${details}b`, [[0, 46], [46, 46], [46, 46]]]);
      // Several cursors, 4 columns or more after each.
      assert.deepStrictEqual(outcome('MD-014', 'a      b', [a, ...cursors(2, 3)]), ['```\na\n```\nb', [[0, 10], [10, 10], [10, 10]]]);
      assert.deepStrictEqual(outcome('MD-024', 'a      b', [a, ...cursors(2, 3)]), [`${details}b`, [[0, 46], [46, 46], [46, 46]]]);
      // A tab counts to the next multiple of 4 (` \t ` at the start of a line is 5 columns).
      assert.deepStrictEqual(outcome('MD-014', 'a  \t b', [a, ...cursors(2)]), ['```\na\n```\nb', [[0, 10], [10, 10]]]);
      assert.deepStrictEqual(outcome('MD-024', 'a  \t b', [a, ...cursors(2)]), [`${details}b`, [[0, 46], [46, 46]]]);
      // CRLF.
      assert.deepStrictEqual(outcome('MD-014', 'a     b\r\nc', [a, ...cursors(2)], '\r\n'), ['```\r\na\r\n```\r\nb\r\nc', [[0, 13], [13, 13]]]);
      assert.deepStrictEqual(outcome('MD-024', 'a     b\r\nc', [a, ...cursors(2)], '\r\n'),
        ['<details><summary>S</summary>\r\n\r\na\r\n\r\n</details>\r\n\r\nb\r\nc', [[0, 52], [52, 52]]]);
      // Up to 3 columns after the cursor stay, and the cursor keeps its place (unchanged).
      assert.deepStrictEqual(outcome('MD-014', 'a    b', [a, ...cursors(2)]), ['```\na\n```\n   b', [[0, 10], [10, 10]]]);
      assert.deepStrictEqual(outcome('MD-024', 'a    b', [a, ...cursors(2)]), [`${details}   b`, [[0, 46], [46, 46]]]);
      // The spaces are taken up to the next non-empty selection, never into it.
      assert.deepStrictEqual(outcome('MD-014', 'a      b', [a, ...cursors(2), { start: 7, end: 8 }]),
        ['```\na\n```\n\n```\nb\n```', [[0, 10], [10, 10], [10, 20]]]);
      assert.deepStrictEqual(outcome('MD-014', 'a      b', [a, { start: 4, end: 8 }]), ['```\na\n```\n\n```\n   b\n```', [[0, 10], [10, 23]]]);
    });

    test('MD-024: lines selected from after the indentation of the first one keep their relative indentation (SELEC-00135)', () => {
      const wrap = (text: string, start: number, eol: '\n' | '\r\n' = '\n'): string =>
        run('MD-024', text, { inputs: ['S'], ranges: [{ start, end: text.length }], eol });
      // Up to 3 columns, every later line starting with them: both tags stay after them and the
      // first line gets them too, so every line is as it was.
      assert.strictEqual(wrap('  a\n    b', 2), '  <details><summary>S</summary>\n\n  a\n    b\n\n  </details>');
      assert.strictEqual(wrap('  a\n\n  b', 2), '  <details><summary>S</summary>\n\n  a\n\n  b\n\n  </details>');
      // Up to 3 columns, but a later line does not start with them: the tags start the line.
      assert.strictEqual(wrap('  a\nb', 2), '<details><summary>S</summary>\n\n  a\nb\n\n</details>');
      // 4 columns or more, or a tab: the tags start the line and the shared indentation is removed.
      assert.strictEqual(wrap('    a\n    b', 4), '<details><summary>S</summary>\n\na\nb\n\n</details>');
      assert.strictEqual(wrap('    a\n      b', 4), '<details><summary>S</summary>\n\na\n  b\n\n</details>');
      assert.strictEqual(wrap('\ta\n\tb', 1), '<details><summary>S</summary>\n\na\nb\n\n</details>');
      // CRLF.
      assert.strictEqual(wrap('  a\r\n    b', 2, '\r\n'), '  <details><summary>S</summary>\r\n\r\n  a\r\n    b\r\n\r\n  </details>');
      assert.strictEqual(wrap('    a\r\n      b\r\n', 4, '\r\n'), '<details><summary>S</summary>\r\n\r\na\r\n  b\r\n\r\n</details>\r\n');
      // From the start of the line: the selected text is written as it is.
      assert.strictEqual(wrap('    a\n    b', 0), '<details><summary>S</summary>\n\n    a\n    b\n\n</details>');
      // After other text on the line: nothing is added or removed.
      assert.strictEqual(wrap('x   a\n    b', 4), 'x\n<details><summary>S</summary>\n\na\n    b\n\n</details>');
      // Inside a list item: both tags are indented as the item's content, so the block stays in the item.
      assert.strictEqual(run('MD-024', '- item\n\n  a\n    b\n', { inputs: ['S'], ranges: [{ start: 10, end: 18 }] }),
        '- item\n\n  <details><summary>S</summary>\n\n  a\n    b\n\n  </details>\n');
    });

    test('MD-023: indentation before the link does not reach the definitions (SELEC-00066)', () => {
      // The definitions always start a line of their own after a blank line, with no indentation.
      const continuation = 'para\n    [a](u)';
      assert.strictEqual(run('MD-023', continuation, { ranges: [select(continuation, '[a](u)')] }), 'para\n    [a][1]\n\n[1]: u');
      const inside = 'para\n    [a](u) x\n';
      assert.strictEqual(run('MD-023', inside, { ranges: [select(inside, '[a](u)')] }), 'para\n    [a][1] x\n\n[1]: u\n');
      const blank = 'para\n\n    [a](u)\n';
      assert.strictEqual(run('MD-023', blank, { ranges: [select(blank, '[a](u)')] }), 'para\n\n    [a][1]\n\n[1]: u\n');
      assert.strictEqual(run('MD-023', '\t[a](u)', { ranges: [{ start: 1, end: 7 }] }), '\t[a][1]\n\n[1]: u');
    });

    test('MD-023: a selection ending inside a line puts its definitions after the end of the line', () => {
      const text = 'see [a](http://b) here';
      assert.strictEqual(run('MD-023', text, { ranges: [select(text, '[a](http://b)')] }), 'see [a][1] here\n\n[1]: http://b');
      assert.deepStrictEqual(selectedAfter('MD-023', text, { ranges: [select(text, '[a](http://b)')] }), ['[a][1]']);
      // A selection ending at the end of its line (or before trailing spaces) keeps them in the selection.
      assert.deepStrictEqual(selectedAfter('MD-023', 'see [a](u)', { ranges: [{ start: 4, end: 10 }] }), ['[a][1]\n\n[1]: u']);
      assert.strictEqual(run('MD-023', 'see [a](u)  \n\nnext', { ranges: [{ start: 4, end: 10 }] }), 'see [a][1]\n\n[1]: u  \n\nnext');
      // When the next line goes on with the paragraph, the definitions go after the paragraph (SELEC-00151).
      assert.strictEqual(run('MD-023', 'see [a](u)  \nnext', { ranges: [{ start: 4, end: 10 }] }), 'see [a][1]  \nnext\n\n[1]: u');
    });

    test('MD-023: selections ending on the same line share one block of definitions after it', () => {
      const text = 'x [a](u) y [b](v) z\n\nnext';
      const ranges = [select(text, '[a](u)'), select(text, '[b](v)')];
      assert.strictEqual(run('MD-023', text, { ranges }), 'x [a][1] y [b][2] z\n\n[1]: u\n[2]: v\n\nnext');
      assert.deepStrictEqual(selectedAfter('MD-023', text, { ranges }), ['[a][1]', '[b][2]']);
      // A later selection that starts on that line and ends at a line end takes the definitions
      // along; the next line goes on with the paragraph, so they go after it (SELEC-00151).
      const across = 'x [a](u) y [b](v)\n[c](w) z';
      assert.strictEqual(run('MD-023', across, { ranges: [select(across, '[a](u)'), { start: across.indexOf('[b]'), end: across.indexOf('\n') }] }),
        'x [a][1] y [b][2]\n[c](w) z\n\n[1]: u\n[2]: v');
      // A later selection that goes on to the next lines carries them to the end of its own last line.
      assert.strictEqual(run('MD-023', across, { ranges: [select(across, '[a](u)'), { start: across.indexOf(' y'), end: across.indexOf(' z') }] }),
        'x [a][1] y [b][2]\n[c][3] z\n\n[1]: u\n[2]: v\n[3]: w');
      // Selections on lines of different paragraphs: each gets its own definitions; numbers continue.
      // On lines of the same paragraph, they share one block after it (SELEC-00151).
      const lines = 'p [a](u) q\n\nr [b](v) s';
      assert.strictEqual(run('MD-023', lines, { ranges: [select(lines, '[a](u)'), select(lines, '[b](v)')] }),
        'p [a][1] q\n\n[1]: u\n\nr [b][2] s\n\n[2]: v');
      const paragraph = 'p [a](u) q\nr [b](v) s';
      assert.strictEqual(run('MD-023', paragraph, { ranges: [select(paragraph, '[a](u)'), select(paragraph, '[b](v)')] }),
        'p [a][1] q\nr [b][2] s\n\n[1]: u\n[2]: v');
    });

    test('MD-023: cursors and unchanged selections around pending definitions keep their place', () => {
      // `# z` after the line is a heading of its own (with `z` alone, the paragraph would go on and
      // the definitions would go after it, SELEC-00151).
      const text = 'x [a](u) y\n# z';
      const lineEnd = text.indexOf('\n');
      const outcome = result('MD-023', text, { ranges: [select(text, '[a](u)'), { start: lineEnd, end: lineEnd }, { start: text.length - 1, end: text.length }] });
      assert.ok(outcome.kind === 'edit');
      const edited = applied(text, outcome);
      assert.strictEqual(edited, 'x [a][1] y\n\n[1]: u\n# z');
      // The cursor at the end of the line stays before the definitions; "z" is still selected.
      assert.strictEqual(outcome.ranges[1].start, edited.indexOf('\n'));
      assert.strictEqual(edited.slice(outcome.ranges[2].start, outcome.ranges[2].end), 'z');
      assert.strictEqual(run('MD-023', text, { ranges: [select(text, '[a](u)')], eol: '\r\n' }), 'x [a][1] y\r\n\r\n[1]: u\n# z');
    });

    test('MD-003: a cursor or selection inside a line puts the table of contents on lines of its own', () => {
      const text = '# A\n## B';
      assert.strictEqual(run('MD-003', text, { ranges: [{ start: 0, end: 0 }] }), '- [A](#a)\n  - [B](#b)\n\n# A\n## B');
      assert.strictEqual(run('MD-003', text, { ranges: [{ start: 3, end: 3 }] }), '# A\n\n- [A](#a)\n  - [B](#b)\n\n## B');
      assert.strictEqual(run('MD-003', 'x\n# A', { ranges: [{ start: 1, end: 5 }] }), 'x\n\n- [A](#a)');
      // The spaces where the line is split are dropped.
      assert.strictEqual(run('MD-003', '# A tail', { ranges: [{ start: 0, end: 3 }] }), '- [A tail](#a-tail)\n\ntail');
      assert.strictEqual(run('MD-003', 'a  b\n# A', { ranges: [{ start: 2, end: 2 }] }), 'a\n\n- [A](#a)\n\nb\n# A');
    });

    test('MD-003: a text line right after the table of contents is not taken into its last item (QA round 2)', () => {
      // A cursor on the blank line under the title, followed by a paragraph.
      const text = '# Title\n\nIntro\n## B';
      assert.strictEqual(run('MD-003', text, { ranges: [{ start: 8, end: 8 }] }), '# Title\n\n- [Title](#title)\n  - [B](#b)\n\nIntro\n## B');
      // Headings selected up to the end of the last one (without its line break), then a text line.
      assert.strictEqual(run('MD-003', '# A\n## B\ntail', { ranges: [{ start: 0, end: 8 }] }), '- [A](#a)\n  - [B](#b)\n\ntail');
      // With the line break: the text line starts right after the selection.
      assert.strictEqual(run('MD-003', '# A\n## B\ntail', { ranges: [{ start: 0, end: 9 }] }), '- [A](#a)\n  - [B](#b)\n\ntail');
      // With the line break and the blank line after it: the blank line stays.
      assert.strictEqual(run('MD-003', '# A\n## B\n\ntail', { ranges: [{ start: 0, end: 9 }] }), '- [A](#a)\n  - [B](#b)\n\ntail');
      // A cursor on an empty first line, followed by the headings.
      assert.strictEqual(run('MD-003', '\n# A\n## B', { ranges: [{ start: 0, end: 0 }] }), '- [A](#a)\n  - [B](#b)\n\n# A\n## B');
      // Nothing follows, or a blank line already does: nothing is added.
      assert.strictEqual(run('MD-003', '# A\n## B', { ranges: [{ start: 0, end: 8 }] }), '- [A](#a)\n  - [B](#b)');
      assert.strictEqual(run('MD-003', '# A\n## B\n\ntail', { ranges: [{ start: 0, end: 8 }] }), '- [A](#a)\n  - [B](#b)\n\ntail');
      assert.strictEqual(run('MD-003', '# A\n## B\n  \ntail', { ranges: [{ start: 0, end: 8 }] }), '- [A](#a)\n  - [B](#b)\n  \ntail');
      // CRLF.
      assert.strictEqual(run('MD-003', '# A\r\n## B\r\ntail', { ranges: [{ start: 0, end: 9 }], eol: '\r\n' }), '- [A](#a)\r\n  - [B](#b)\r\n\r\ntail');
    });

    test('MD-003: a blank line before the table of contents when a text line comes right before it', () => {
      // A list item right before would take the table of contents into its list.
      assert.strictEqual(run('MD-003', '- item\n\n# A', { ranges: [{ start: 7, end: 7 }] }), '- item\n\n- [A](#a)\n\n# A');
      assert.strictEqual(run('MD-003', '- item\n# A', { ranges: [{ start: 7, end: 10 }] }), '- item\n\n- [A](#a)');
      // Indentation only before the cursor: it is dropped with the new blank line.
      assert.strictEqual(run('MD-003', '- item\n  \n# A', { ranges: [{ start: 9, end: 9 }] }), '- item\n\n- [A](#a)\n\n# A');
      // A blank line (or the start of the text) before: nothing is added, and indentation stays.
      assert.strictEqual(run('MD-003', 'x\n\n# A', { ranges: [{ start: 3, end: 6 }] }), 'x\n\n- [A](#a)');
      assert.strictEqual(run('MD-003', '  # A', { ranges: [{ start: 2, end: 5 }] }), '  - [A](#a)');
      // CRLF.
      assert.strictEqual(run('MD-003', 'p\r\n# A', { ranges: [{ start: 3, end: 6 }], eol: '\r\n' }), 'p\r\n\r\n- [A](#a)');
    });

    test('MD-003: the final line break of the text is kept when the edit reaches the end', () => {
      // The selection takes the final line break: it is written again after the list.
      assert.strictEqual(run('MD-003', '# A\n## B\n', { ranges: [{ start: 0, end: 9 }] }), '- [A](#a)\n  - [B](#b)\n');
      assert.strictEqual(run('MD-003', '# A\r\n## B\r\n', { eol: '\r\n' }), '- [A](#a)\r\n  - [B](#b)\r\n');
      assert.strictEqual(run('MD-003', '# A\r## B\r', { eol: '\n' }), '- [A](#a)\n  - [B](#b)\r');
      // No final line break: none is added.
      assert.strictEqual(run('MD-003', '# A\n## B'), '- [A](#a)\n  - [B](#b)');
      // The selection ends before the final line break: it stays where it is (not doubled).
      assert.strictEqual(run('MD-003', '# A\n## B\n', { ranges: [{ start: 0, end: 8 }] }), '- [A](#a)\n  - [B](#b)\n');
      // Text before the selection; a cursor at the end; blank lines at the end (one line break kept).
      assert.strictEqual(run('MD-003', 'x\n# A\n', { ranges: [{ start: 2, end: 6 }] }), 'x\n\n- [A](#a)\n');
      assert.strictEqual(run('MD-003', '# A\n', { ranges: [{ start: 4, end: 4 }] }), '# A\n\n- [A](#a)\n');
      assert.strictEqual(run('MD-003', '# A\n\n', { ranges: [{ start: 5, end: 5 }] }), '# A\n\n- [A](#a)\n');
      assert.strictEqual(run('MD-003', '# A\n\n'), '- [A](#a)\n');
    });

    test('MD-003: indentation of 4 columns or more before the list is dropped (no indented code block)', () => {
      assert.strictEqual(run('MD-003', '# A\n\n    \n## B', { ranges: [{ start: 9, end: 9 }] }), '# A\n\n- [A](#a)\n  - [B](#b)\n\n## B');
      // At the start of the text; a tab (4 columns); more than 4 spaces; a selection after the indentation.
      assert.strictEqual(run('MD-003', '    \n# A', { ranges: [{ start: 4, end: 4 }] }), '- [A](#a)\n\n# A');
      assert.strictEqual(run('MD-003', '\t\n# A', { ranges: [{ start: 1, end: 1 }] }), '- [A](#a)\n\n# A');
      assert.strictEqual(run('MD-003', '  \t\n# A', { ranges: [{ start: 3, end: 3 }] }), '- [A](#a)\n\n# A');
      assert.strictEqual(run('MD-003', '      \n# A', { ranges: [{ start: 6, end: 6 }] }), '- [A](#a)\n\n# A');
      assert.strictEqual(run('MD-003', 'x\n\n    \n# A', { ranges: [{ start: 7, end: 11 }] }), 'x\n\n- [A](#a)');
      // Up to 3 columns stay, as before.
      assert.strictEqual(run('MD-003', '  \n# A', { ranges: [{ start: 2, end: 2 }] }), '  - [A](#a)\n\n# A');
      assert.strictEqual(run('MD-003', '   # A', { ranges: [{ start: 3, end: 6 }] }), '   - [A](#a)');
      // Text before the cursor on its line: split as before.
      assert.strictEqual(run('MD-003', 'a  b\n# A', { ranges: [{ start: 2, end: 2 }] }), 'a\n\n- [A](#a)\n\nb\n# A');
      // Two cursors on one line of spaces: each list starts at the start of a line, with a blank line between them.
      assert.strictEqual(run('MD-003', '        \n# A', { ranges: [{ start: 4, end: 4 }, { start: 8, end: 8 }] }), '- [A](#a)\n\n- [A](#a)\n\n# A');
    });

    test('MD-003: the tables of contents of several cursors on one line are separate lists (a blank line between them)', () => {
      const at = (...offsets: number[]) => offsets.map((offset) => ({ start: offset, end: offset }));
      // A line of spaces at the end of the text, without and with a final line break.
      assert.strictEqual(run('MD-003', '# A\n\n    ', { ranges: at(5, 9) }), '# A\n\n- [A](#a)\n\n- [A](#a)');
      assert.strictEqual(run('MD-003', '# A\n\n    \n', { ranges: at(5, 9) }), '# A\n\n- [A](#a)\n\n- [A](#a)\n');
      // A line of spaces followed by an empty line.
      assert.strictEqual(run('MD-003', '# A\n\n    \n\nx', { ranges: at(5, 9) }), '# A\n\n- [A](#a)\n\n- [A](#a)\n\nx');
      assert.strictEqual(run('MD-003', '# A\n\n  \n\nx', { ranges: at(5, 7) }), '# A\n\n- [A](#a)\n\n- [A](#a)\n\nx');
      // Three cursors; a table of contents of several lines.
      assert.strictEqual(run('MD-003', '# A\n\n  ', { ranges: at(5, 6, 7) }), '# A\n\n- [A](#a)\n\n- [A](#a)\n\n- [A](#a)');
      assert.strictEqual(run('MD-003', '# A\n\n        \n# B', { ranges: at(9, 13) }), '# A\n\n- [A](#a)\n- [B](#b)\n\n- [A](#a)\n- [B](#b)\n\n# B');
      // CRLF.
      assert.strictEqual(run('MD-003', '# A\r\n\r\n    ', { ranges: at(7, 11), eol: '\r\n' }), '# A\r\n\r\n- [A](#a)\r\n\r\n- [A](#a)');
      assert.strictEqual(run('MD-003', '# A\r\n\r\n    \r\n', { ranges: at(7, 11), eol: '\r\n' }), '# A\r\n\r\n- [A](#a)\r\n\r\n- [A](#a)\r\n');
      // A line with text: one blank line between the lists; at the start and the end of the line.
      assert.strictEqual(run('MD-003', '# A\n\nfoo bar\n', { ranges: at(8, 9) }), '# A\n\nfoo\n\n- [A](#a)\n\n- [A](#a)\n\nbar\n');
      assert.strictEqual(run('MD-003', '# A\n\nfoo\n', { ranges: at(5, 8) }), '# A\n\n- [A](#a)\n\nfoo\n\n- [A](#a)\n');
      // Empty lines next to each other.
      assert.strictEqual(run('MD-003', '# A\n\n\n', { ranges: at(5, 6) }), '# A\n\n- [A](#a)\n\n- [A](#a)\n');
      // The end of a line and the indentation of the next line: the second list is not nested.
      assert.strictEqual(run('MD-003', '# A\nfoo\n  bar', { ranges: at(7, 10) }), '# A\nfoo\n\n- [A](#a)\n\n- [A](#a)\n\nbar');
      assert.strictEqual(run('MD-003', '# A\n\nfoo\n  bar', { ranges: at(8, 11) }), '# A\n\nfoo\n\n- [A](#a)\n\n- [A](#a)\n\nbar');
      // Lines of 1 to 3 columns of indentation next to each other: the second list is not nested.
      assert.strictEqual(run('MD-003', '# A\n\n\n   ', { ranges: at(5, 9) }), '# A\n\n- [A](#a)\n\n- [A](#a)');
      assert.strictEqual(run('MD-003', '# A\n\n  \n  ', { ranges: at(7, 10) }), '# A\n\n  - [A](#a)\n\n- [A](#a)');
      // A blank line already between them: none is added, and the indentation of the second is dropped.
      assert.strictEqual(run('MD-003', '# A\n\n\n\n  ', { ranges: at(5, 9) }), '# A\n\n- [A](#a)\n\n- [A](#a)');
    });

    test('MD-003: a selection of only spaces, tabs and line breaks between the tables of contents is seen through (SELEC-00068)', () => {
      const span = (start: number, end: number) => ({ start, end });
      const rangesOf = (text: string, ranges: MdRange[]) => {
        const outcome = result('MD-003', text, { ranges });
        assert.strictEqual(outcome.kind, 'edit');
        return outcome.ranges.map(({ start, end }) => [start, end]);
      };
      // A selected space between two cursors: the lists are still separated by a blank line.
      assert.strictEqual(run('MD-003', '# A\n\n    ', { ranges: [span(5, 5), span(6, 7), span(9, 9)] }), '# A\n\n- [A](#a)\n\n- [A](#a)');
      // The selection is left as a cursor at the start of what replaces its spaces: the line breaks before the second list.
      assert.deepStrictEqual(rangesOf('# A\n\n    ', [span(5, 5), span(6, 7), span(9, 9)]), [[5, 14], [14, 14], [14, 25]]);
      // A selected indentation right before the cursor: the indentation is still dropped (no indented code block).
      assert.strictEqual(run('MD-003', '# A\n\n    \n', { ranges: [span(5, 9), span(9, 9)] }), '# A\n\n- [A](#a)\n');
      assert.deepStrictEqual(rangesOf('# A\n\n    \n', [span(5, 9), span(9, 9)]), [[5, 5], [5, 14]]);
      // Tabs; several selections of spaces next to each other; CRLF.
      assert.strictEqual(run('MD-003', '# A\n\n\t\t', { ranges: [span(5, 5), span(5, 6), span(7, 7)] }), '# A\n\n- [A](#a)\n\n- [A](#a)');
      assert.strictEqual(run('MD-003', '# A\n\n    ', { ranges: [span(5, 5), span(6, 7), span(7, 8), span(9, 9)] }), '# A\n\n- [A](#a)\n\n- [A](#a)');
      assert.strictEqual(run('MD-003', '# A\r\n\r\n    ', { ranges: [span(7, 7), span(8, 9), span(11, 11)], eol: '\r\n' }), '# A\r\n\r\n- [A](#a)\r\n\r\n- [A](#a)');
      assert.strictEqual(run('MD-003', '# A\r\n\r\n    \r\n', { ranges: [span(7, 11), span(11, 11)], eol: '\r\n' }), '# A\r\n\r\n- [A](#a)\r\n');
      // A selection across a line break: the same text as without it; only its spaces taken into the edit leave it.
      const lines = '# A\n\n    \n    ';
      assert.strictEqual(run('MD-003', lines, { ranges: [span(5, 5), span(8, 11), span(14, 14)] }), run('MD-003', lines, { ranges: [span(5, 5), span(14, 14)] }));
      assert.deepStrictEqual(rangesOf(lines, [span(5, 5), span(8, 11), span(14, 14)]), [[5, 14], [17, 19], [19, 29]]);
      // After the last table of contents: nothing changes for it.
      assert.strictEqual(run('MD-003', '# A\n\n    ', { ranges: [span(5, 5), span(7, 9)] }), '# A\n\n- [A](#a)    ');
      // A selection with other text is not seen through, as before.
      assert.strictEqual(run('MD-003', '# A\n\nx   ', { ranges: [span(5, 5), span(5, 6), span(9, 9)] }), '# A\n\n- [A](#a)\n\nx\n\n- [A](#a)');
      assert.strictEqual(run('MD-003', '# A\n\nx   \n', { ranges: [span(5, 6), span(9, 9)] }), '# A\n\nx\n\n- [A](#a)\n');
      // No headings at all: still only the information.
      assert.strictEqual(run('MD-003', '  \n  ', { ranges: [span(0, 2), span(3, 5)] }), `info: ${MD_NO_HEADINGS}`);
      assert.strictEqual(run('MD-003', '  \n  ', { ranges: [span(0, 0), span(2, 4)] }), `info: ${MD_NO_HEADINGS}`);
    });

    test('MD-003: a selection of only spaces after the table of contents does not leave 4 columns at the start of the next line (SELEC-00144)', () => {
      const span = (start: number, end: number) => ({ start, end });
      const outcome = (text: string, ranges: MdRange[], eol: MdEol = '\n'): [string, number[][]] => {
        const done = result('MD-003', text, { ranges, eol });
        assert.ok(done.kind === 'edit');
        return [applied(text, done), done.ranges.map(({ start, end }) => [start, end])];
      };
      const text = '# A\nfoo      bar';
      // Before SELEC-00144 the edit stopped at the selection of spaces (`editRange`'s ceiling), which
      // has no table of contents and was left as it was, so the line after the list started with 6
      // spaces (`      bar`, an indented code block). Now the spaces are taken into the edit past
      // it, and it is left as a cursor at the start of the next line.
      assert.deepStrictEqual(outcome(text, [span(0, 7), span(7, 9)]), ['- [A](#a)\n\nbar', [[0, 11], [11, 11]]]);
      // The same when a cursor inserts the table of contents and the selection of spaces follows it
      // (before: `foo\n\n- [A](#a)\n\n    bar`).
      assert.deepStrictEqual(outcome('foo      bar\n# A', [span(5, 5), span(5, 7)]), ['foo\n\n- [A](#a)\n\nbar\n# A', [[3, 16], [16, 16]]]);
      // Exactly 4 columns, with or without spaces between the table of contents and the selection.
      assert.deepStrictEqual(outcome('# A\nfoo    bar', [span(0, 7), span(7, 8)]), ['- [A](#a)\n\nbar', [[0, 11], [11, 11]]]);
      assert.deepStrictEqual(outcome('# A\nfoo        bar', [span(0, 7), span(9, 11)]), ['- [A](#a)\n\nbar', [[0, 11], [11, 11]]]);
      // Up to 3 columns from the selection on stay, and the selection keeps its place (as before).
      assert.deepStrictEqual(outcome('# A\nfoo   bar', [span(0, 7), span(7, 8)]), ['- [A](#a)\n\n   bar', [[0, 11], [11, 12]]]);
      assert.deepStrictEqual(outcome('# A\nfoo   bar', [span(0, 7), span(8, 9)]), ['- [A](#a)\n\n  bar', [[0, 11], [11, 12]]]);
      // A tab counts to the next multiple of 4 (` \t` and `\t` from the selection on are 4 columns).
      assert.deepStrictEqual(outcome('# A\nfoo \tbar', [span(0, 7), span(7, 8)]), ['- [A](#a)\n\nbar', [[0, 11], [11, 11]]]);
      assert.deepStrictEqual(outcome('# A\nfoo  \tbar', [span(0, 7), span(8, 9)]), ['- [A](#a)\n\nbar', [[0, 11], [11, 11]]]);
      // Several selections of spaces: all are read past and left at the start of the next line.
      assert.deepStrictEqual(outcome(text, [span(0, 7), span(7, 8), span(8, 9), span(10, 11)]), ['- [A](#a)\n\nbar', [[0, 11], [11, 11], [11, 11], [11, 11]]]);
      // A cursor after the selection of spaces stops the reading: with 4 columns up to it they are
      // taken, and the cursor's own table of contents takes the spaces after it.
      assert.deepStrictEqual(outcome(text, [span(0, 7), span(7, 9), span(11, 11)]), ['- [A](#a)\n\n- [A](#a)\n\nbar', [[0, 11], [11, 11], [11, 22]]]);
      // With fewer than 4 columns up to the cursor, its table of contents takes them (the lists are adjacent).
      assert.deepStrictEqual(outcome('# A\nfoo        bar', [span(0, 7), span(7, 8), span(9, 9)]), ['- [A](#a)\n\n- [A](#a)\n\nbar', [[0, 11], [11, 11], [11, 22]]]);
      // A selection with other text or with a heading stops the reading too: the spaces are taken
      // up to it, never into it.
      assert.deepStrictEqual(outcome(text, [span(0, 7), span(7, 8), span(13, 16)]), ['- [A](#a)\n\nbar', [[0, 11], [11, 11], [11, 14]]]);
      assert.deepStrictEqual(outcome('# A\nfoo      x bar', [span(0, 7), span(7, 8), span(11, 14)]), ['- [A](#a)\n\n  x bar', [[0, 11], [11, 11], [11, 14]]]);
      // CRLF.
      assert.deepStrictEqual(outcome('# A\r\nfoo      bar\r\nx', [span(0, 8), span(8, 10)], '\r\n'), ['- [A](#a)\r\n\r\nbar\r\nx', [[0, 13], [13, 13]]]);
      // A later table of contents still sees the moved selection through.
      assert.deepStrictEqual(outcome('# A\nfoo      bar\n\n', [span(0, 7), span(7, 9), span(18, 18)]), ['- [A](#a)\n\nbar\n\n- [A](#a)\n', [[0, 11], [11, 11], [16, 26]]]);
    });

    test('MD-003: a selection of spaces moved to the start of the next line keeps its direction (SELEC-00146)', () => {
      const rangesOf = (text: string, ranges: MdRange[]): MdRange[] => {
        const done = result('MD-003', text, { ranges });
        assert.ok(done.kind === 'edit');
        return done.ranges;
      };
      // Read past by the split (SELEC-00144): one selection, then two.
      assert.deepStrictEqual(rangesOf('# A\nfoo      bar', [{ start: 0, end: 7 }, { start: 7, end: 9, reversed: true }]),
        [{ start: 0, end: 11 }, { start: 11, end: 11, reversed: true }]);
      assert.deepStrictEqual(rangesOf('# A\nfoo      bar', [{ start: 0, end: 7 }, { start: 7, end: 8, reversed: true }, { start: 8, end: 9, reversed: true }]),
        [{ start: 0, end: 11 }, { start: 11, end: 11, reversed: true }, { start: 11, end: 11, reversed: true }]);
      // Taken with the indentation of a continuation line (SELEC-00146).
      assert.deepStrictEqual(rangesOf('# A\nfoo  \n    bar', [{ start: 0, end: 7 }, { start: 7, end: 10, reversed: true }]),
        [{ start: 0, end: 11 }, { start: 11, end: 11, reversed: true }]);
      // A selection that is not reversed stays so.
      assert.deepStrictEqual(rangesOf('# A\nfoo      bar', [{ start: 0, end: 7 }, { start: 7, end: 9 }]),
        [{ start: 0, end: 11 }, { start: 11, end: 11, reversed: undefined }]);
    });

    test('MD-003: a selection of spaces on a heading line has a table of contents of its own and is not read past (SELEC-00144)', () => {
      const span = (start: number, end: number) => ({ start, end });
      const outcome = (text: string, ranges: MdRange[]): [string, number[][]] => {
        const done = result('MD-003', text, { ranges });
        assert.ok(done.kind === 'edit');
        return [applied(text, done), done.ranges.map(({ start, end }) => [start, end])];
      };
      // The whole line `# A      B` is the heading, so the selected spaces in it make a table of
      // contents too: the first edit stops at them (no overlapping edits), and they are replaced by
      // their own list.
      const toc = '- [A      B](#a------b)';
      assert.deepStrictEqual(outcome('# A      B\nx', [span(0, 3), span(7, 9)]), [`${toc}\n\n${toc}\n\nB\nx`, [[0, 25], [25, 50]]]);
      // The same after a cursor in the heading line.
      assert.deepStrictEqual(outcome('# A      B\nx', [span(3, 3), span(7, 9)]), [`# A\n\n${toc}\n\n${toc}\n\nB\nx`, [[3, 30], [30, 55]]]);
      // On the line after the heading line, the same selection of spaces is read past (the heading
      // line is told apart line by line, also after a reading on the heading line).
      assert.deepStrictEqual(outcome('# A      B\nfoo      bar', [span(0, 3), span(7, 9), span(14, 14), span(14, 16)]),
        [`${toc}\n\n${toc}\n\nB\nfoo\n\n${toc}\n\nbar`, [[0, 25], [25, 50], [55, 82], [82, 82]]]);
    });

    test('MD-003: where nothing is left at the start of the next line, as before SELEC-00144', () => {
      const span = (start: number, end: number) => ({ start, end });
      const outcome = (text: string, ranges: MdRange[]): [string, number[][]] => {
        const done = result('MD-003', text, { ranges });
        assert.ok(done.kind === 'edit');
        return [applied(text, done), done.ranges.map(({ start, end }) => [start, end])];
      };
      // A cursor in the spaces inserts a table of contents of its own; the two lists are adjacent
      // (nothing before it on the line), and `textAfter` (read on the original text) makes its edit
      // take the spaces after it, so `bar` starts its line.
      assert.deepStrictEqual(outcome('# A\nfoo      bar', [span(0, 7), span(9, 9)]), ['- [A](#a)\n\n- [A](#a)\n\nbar', [[0, 11], [11, 22]]]);
      // A selection of spaces with a line break: it is not read past by this split (no 4 columns
      // are left on the line it ends), but since SELEC-00146 the indented continuation line after it
      // loses its indentation (with the rest of the line and the line break) and the selection is
      // left as a cursor at the start of its text.
      assert.deepStrictEqual(outcome('# A\nfoo  \n    bar', [span(0, 7), span(7, 10)]), ['- [A](#a)\n\nbar', [[0, 11], [11, 11]]]);
      assert.deepStrictEqual(outcome('# A\nfoo  \n    bar', [span(0, 7)]), ['- [A](#a)\n\nbar', [[0, 11]]]);
    });

    test('MD-003: a paragraph continuation line indented by 4 columns or more after the list loses its indentation (SELEC-00146)', () => {
      const span = (start: number, end: number) => ({ start, end });
      const outcome = (text: string, ranges: MdRange[], eol: MdEol = '\n'): [string, number[][]] => {
        const done = result('MD-003', text, { ranges, eol });
        assert.ok(done.kind === 'edit');
        return [applied(text, done), done.ranges.map(({ start, end }) => [start, end])];
      };
      // Before SELEC-00146: `- [A](#a)\n  \n    bar`, where `bar` is taken into the last item of the
      // list (its second paragraph) instead of staying a paragraph of its own.
      assert.deepStrictEqual(outcome('# A\nfoo  \n    bar', [span(0, 7)]), ['- [A](#a)\n\nbar', [[0, 11]]]);
      // Without spaces at the end of the line; a selection that ends right after the line break.
      assert.deepStrictEqual(outcome('# A\nfoo\n    bar', [span(0, 7)]), ['- [A](#a)\n\nbar', [[0, 11]]]);
      assert.deepStrictEqual(outcome('# A\nfoo\n    bar', [span(0, 8)]), ['- [A](#a)\n\nbar', [[0, 11]]]);
      // A cursor at the end of the line and at the start of the next line.
      assert.deepStrictEqual(outcome('# A\nfoo\n    bar', [span(7, 7)]), ['# A\nfoo\n\n- [A](#a)\n\nbar', [[7, 20]]]);
      assert.deepStrictEqual(outcome('# A\nfoo\n    bar', [span(8, 8)]), ['# A\nfoo\n\n- [A](#a)\n\nbar', [[8, 20]]]);
      // A tab, 6 columns, a nested table of contents.
      assert.strictEqual(run('MD-003', '# A\nfoo\n\tbar', { ranges: [span(0, 7)] }), '- [A](#a)\n\nbar');
      assert.strictEqual(run('MD-003', '# A\nfoo\n      bar', { ranges: [span(0, 7)] }), '- [A](#a)\n\nbar');
      assert.strictEqual(run('MD-003', '# A\n## B\nfoo\n    bar', { ranges: [span(0, 12)] }), '- [A](#a)\n  - [B](#b)\n\nbar');
      // Only the first continuation line: the next one continues its paragraph as before.
      assert.strictEqual(run('MD-003', '# A\nfoo\n    bar\n    baz', { ranges: [span(0, 7)] }), '- [A](#a)\n\nbar\n    baz');
      // A paragraph line in a list item without the marker.
      assert.strictEqual(run('MD-003', '# A\n- foo\n  bar\n    baz', { ranges: [span(0, 15)] }), '- [A](#a)\n\nbaz');
      // CRLF, and a lone CR (one line break; the line breaks written are the document's).
      assert.deepStrictEqual(outcome('# A\r\nfoo  \r\n    bar', [span(0, 8)], '\r\n'), ['- [A](#a)\r\n\r\nbar', [[0, 13]]]);
      assert.deepStrictEqual(outcome('# A\rfoo  \r    bar', [span(0, 7)]), ['- [A](#a)\n\nbar', [[0, 11]]]);
      // Selections of spaces and line breaks in what is taken are left as cursors at the start of the text.
      assert.deepStrictEqual(outcome('# A\nfoo  \n    bar', [span(0, 7), span(7, 9), span(10, 12)]), ['- [A](#a)\n\nbar', [[0, 11], [11, 11], [11, 11]]]);
      assert.deepStrictEqual(outcome('# A\nfoo\n    bar', [span(0, 7), span(9, 10)]), ['- [A](#a)\n\nbar', [[0, 11], [11, 11]]]);
      // A cursor in what is taken inserts a list of its own: the first edit stops at the end of the
      // line as before, and the cursor's own edit (it is at the start of the line) takes the indentation.
      assert.deepStrictEqual(outcome('# A\nfoo\n    bar', [span(0, 7), span(8, 8)]), ['- [A](#a)\n\n- [A](#a)\n\nbar', [[0, 10], [11, 22]]]);
      assert.deepStrictEqual(outcome('# A\nfoo\n    bar', [span(0, 7), span(10, 10)]), ['- [A](#a)\n\n- [A](#a)\n\nbar', [[0, 10], [11, 22]]]);
      // A selection with other text starting in what is taken: as before.
      assert.deepStrictEqual(outcome('# A\nfoo\n    bar', [span(0, 7), span(7, 13)]), ['- [A](#a)\n\n    bar', [[0, 10], [10, 16]]]);
      // A cursor at the start of the text, and later tables of contents: one blank line between the parts.
      assert.deepStrictEqual(outcome('# A\nfoo\n    bar', [span(0, 7), span(12, 12)]), ['- [A](#a)\n\n- [A](#a)\n\nbar', [[0, 11], [11, 22]]]);
      assert.deepStrictEqual(outcome('# A\nfoo\n    bar\n# B\nfoo\n    bar', [span(0, 7), span(16, 23)]),
        ['- [A](#a)\n\nbar\n\n- [B](#b)\n\nbar', [[0, 11], [15, 27]]]);
      assert.deepStrictEqual(outcome('# A\nfoo\n    bar\n\n', [span(0, 7), span(17, 17)]), ['- [A](#a)\n\nbar\n\n- [A](#a)\n', [[0, 11], [16, 26]]]);
    });

    test('MD-003: what is not a paragraph continuation line to be unindented stays as before (SELEC-00146)', () => {
      const span = (start: number, end: number) => ({ start, end });
      const asBefore = (text: string, start: number, end: number, expected: string): void =>
        assert.strictEqual(run('MD-003', text, { ranges: [span(start, end)] }), expected, JSON.stringify([text, start, end]));
      // The text of the line would start a block without its indentation that no backslash keeps
      // shown the same way (since SELEC-00150, the others get a backslash: see below).
      for (const line of ['```', '~~~', '<div>', '[x]: /u', '| a |']) {
        asBefore(`# A\nfoo\n    ${line}`, 0, 7, `- [A](#a)\n\n    ${line}`);
      }
      // The line before is a heading (a selection and cursors at its end and after its line break).
      asBefore('# A\n    code', 0, 3, '- [A](#a)\n\n    code');
      asBefore('# A\n    code', 3, 3, '# A\n\n- [A](#a)\n\n    code');
      asBefore('# A\n    code', 4, 4, '# A\n\n- [A](#a)\n\n    code');
      // The line before is blank: an indented code block.
      asBefore('# A\nfoo\n\n    code', 0, 8, '- [A](#a)\n\n    code');
      asBefore('# A\nfoo\n\n    code', 0, 7, '- [A](#a)\n\n    code');
      asBefore('# A\nfoo\n\n    code', 9, 9, '# A\nfoo\n\n- [A](#a)\n\n    code');
      // The line before is a fence or in fenced code.
      asBefore('# A\n```\n    bar\n```', 0, 7, '- [A](#a)\n\n    bar\n```');
      asBefore('# A\n```\nfoo\n    bar\n```', 11, 11, '# A\n```\nfoo\n\n- [A](#a)\n\n    bar\n```');
      // The line before is a thematic break or a setext underline.
      asBefore('# A\n***\n    bar', 0, 7, '- [A](#a)\n\n    bar');
      asBefore('# A\nfoo\n===\n    bar', 0, 11, '- [A](#a)\n\n    bar');
      // The line before is itself indented by 4 columns or more.
      asBefore('# A\n     foo\n    bar', 0, 12, '- [A](#a)\n\n    bar');
      // The line before is a list item and the line is a nested list in it (since SELEC-00150, a
      // continuation line of a list item or a quote is unindented: see below).
      asBefore('# A\n- foo\n    - bar', 0, 9, '- [A](#a)\n\n    - bar');
    });
  });

  suite('MD-003 / 014 / 024: paragraph continuation lines after the block (SELEC-00150)', () => {
    const span = (start: number, end: number) => ({ start, end });
    /** MD-003 on `text` with one selection `[start, end)`. */
    const toc = (text: string, start: number, end: number, eol: MdEol = '\n'): string =>
      run('MD-003', text, { ranges: [span(start, end)], eol });
    const outcome = (id: string, text: string, ranges: MdRange[], eol: MdEol = '\n'): [string, number[][]] => {
      const inputs = id === 'MD-014' ? [''] : ['S'];
      const done = result(id, text, { inputs, ranges, eol });
      assert.ok(done.kind === 'edit');
      return [applied(text, done), done.ranges.map(({ start, end }) => [start, end])];
    };

    test('MD-003: a continuation line indented by 1 to 3 columns loses its indentation (condition 1)', () => {
      // Before: `- [A](#a)\n\n  bar`, where `bar` is the second paragraph of the last item.
      assert.strictEqual(toc('# A\nfoo\n  bar', 0, 7), '- [A](#a)\n\nbar');
      assert.strictEqual(toc('# A\nfoo\n bar', 0, 7), '- [A](#a)\n\nbar');
      assert.strictEqual(toc('# A\nfoo\n   bar', 0, 7), '- [A](#a)\n\nbar');
      assert.strictEqual(toc('# A\nfoo\n \tbar', 0, 7), '- [A](#a)\n\nbar');
      // CRLF and a lone CR (the line breaks written are the document's).
      assert.deepStrictEqual(outcome('MD-003', '# A\r\nfoo\r\n  bar', [span(0, 8)], '\r\n'), ['- [A](#a)\r\n\r\nbar', [[0, 13]]]);
      assert.deepStrictEqual(outcome('MD-003', '# A\rfoo  \r  bar', [span(0, 7)]), ['- [A](#a)\n\nbar', [[0, 11]]]);
      // A selection that ends right after the line break, and cursors at the end of the line and at the start of the next one.
      assert.deepStrictEqual(outcome('MD-003', '# A\nfoo\n  bar', [span(0, 8)]), ['- [A](#a)\n\nbar', [[0, 11]]]);
      assert.deepStrictEqual(outcome('MD-003', '# A\nfoo\n  bar', [span(7, 7)]), ['# A\nfoo\n\n- [A](#a)\n\nbar', [[7, 20]]]);
      assert.deepStrictEqual(outcome('MD-003', '# A\nfoo\n  bar', [span(8, 8)]), ['# A\nfoo\n\n- [A](#a)\n\nbar', [[8, 20]]]);
      // A selection of spaces in what is taken is left as a cursor at the start of the text.
      assert.deepStrictEqual(outcome('MD-003', '# A\nfoo\n  bar', [span(0, 7), span(8, 9)]), ['- [A](#a)\n\nbar', [[0, 11], [11, 11]]]);
    });

    test('MD-003: a continuation line whose text would start a block gets one backslash (condition 2)', () => {
      // Indented by 4 columns (before: left indented, taken into the last item).
      const escaped: [string, string][] = [
        ['# x', '\\# x'], ['- x', '\\- x'], ['* x', '\\* x'], ['+ x', '\\+ x'], ['1. x', '1\\. x'], ['12. x', '12\\. x'],
        ['3) x', '3\\) x'], ['> x', '\\> x'], ['***', '\\***'], ['___', '\\___'], ['- - -', '\\- - -'], ['* * *', '\\* * *'],
        ['---', '\\---'], ['-', '\\-'], ['1.', '1\\.'],
      ];
      for (const [line, expected] of escaped) {
        assert.strictEqual(toc(`# A\nfoo\n    ${line}`, 0, 7), `- [A](#a)\n\n${expected}`, line);
      }
      // 1 to 3 columns, and no indentation: only what cannot interrupt the paragraph is a
      // continuation line (an ordered item not starting with 1, an empty item).
      assert.strictEqual(toc('# A\nfoo\n  2. x', 0, 7), '- [A](#a)\n\n2\\. x');
      assert.strictEqual(toc('# A\nfoo\n  *', 0, 7), '- [A](#a)\n\n\\*');
      assert.strictEqual(toc('# A\nfoo\n2. x', 0, 7), '- [A](#a)\n\n2\\. x');
      assert.strictEqual(toc('# A\nfoo\n*', 0, 7), '- [A](#a)\n\n\\*');
      assert.strictEqual(toc('# A\nfoo\n+', 0, 7), '- [A](#a)\n\n\\+');
      assert.strictEqual(toc('# A\nfoo\n1.', 0, 7), '- [A](#a)\n\n1\\.');
      assert.strictEqual(toc('# A\nfoo\n2. x', 0, 8), '- [A](#a)\n\n2\\. x');
      // Without indentation, a line that stays a paragraph after the list is left as before.
      assert.strictEqual(toc('# A\nfoo\nbar', 0, 7), '- [A](#a)\n\nbar');
      assert.strictEqual(toc('# A\nfoo\n#x', 0, 7), '- [A](#a)\n\n#x');
      // What does not start a block without the indentation only loses it (`===` indented by 4
      // columns: with less, it is the setext underline of the paragraph).
      for (const line of ['#x', '*emph*', '-x', '~~x~~', '`code`', '[x](y)', '[x] y', '<b>x</b> foo', '<http://x>', '2024 年']) {
        assert.strictEqual(toc(`# A\nfoo\n  ${line}`, 0, 7), `- [A](#a)\n\n${line}`, line);
      }
      assert.strictEqual(toc('# A\nfoo\n    ===', 0, 7), '- [A](#a)\n\n===');
      // Cursors: at the end of the line and at the start of the escaped line.
      assert.deepStrictEqual(outcome('MD-003', '# A\nfoo\n2. x', [span(7, 7)]), ['# A\nfoo\n\n- [A](#a)\n\n2\\. x', [[7, 22]]]);
      assert.deepStrictEqual(outcome('MD-003', '# A\nfoo\n2. x', [span(8, 8)]), ['# A\nfoo\n\n- [A](#a)\n\n2\\. x', [[8, 22]]]);
      assert.deepStrictEqual(outcome('MD-003', '# A\r\nfoo\r\n    - x', [span(0, 8)], '\r\n'), ['- [A](#a)\r\n\r\n\\- x', [[0, 14]]]);
      // A cursor in what is taken or where the edit would end inserts a list of its own: the first
      // edit stops at the end of the line as before, and the cursor's list (at the start of the
      // line) takes the line as its own continuation line.
      assert.deepStrictEqual(outcome('MD-003', '# A\nfoo\n2. x', [span(0, 7), span(8, 8)]), ['- [A](#a)\n\n- [A](#a)\n\n2\\. x', [[0, 10], [11, 24]]]);
      assert.deepStrictEqual(outcome('MD-003', '# A\nfoo\n  2. x', [span(0, 7), span(10, 10)]), ['- [A](#a)\n\n- [A](#a)\n\n2. x', [[0, 10], [11, 22]]]);
      assert.deepStrictEqual(outcome('MD-003', '# A\nfoo\n  2. x', [span(0, 7), span(11, 11)]), ['- [A](#a)\n\n  2\n\n- [A](#a)\n\n. x', [[0, 10], [14, 27]]]);
      // A selection of spaces in what is taken is left as a cursor at the end of the edit (after the backslash).
      assert.deepStrictEqual(outcome('MD-003', '# A\nfoo\n  2. x', [span(0, 7), span(9, 10)]), ['- [A](#a)\n\n2\\. x', [[0, 13], [13, 13]]]);
    });

    test('MD-003: what cannot stay a paragraph shown the same way, or interrupts the paragraph, stays as before (condition 2)', () => {
      // No backslash keeps these shown the same way: fences, HTML blocks (kind 7 included), definitions, tables.
      for (const line of ['```', '~~~', '<div>', '<div class="a">', '<custom-tag>', '</span>', '<!-- c -->', '[x]: /u', '[^1]: note', '[x', '| a |']) {
        assert.strictEqual(toc(`# A\nfoo\n  ${line}`, 0, 7), `- [A](#a)\n\n  ${line}`, line);
      }
      assert.strictEqual(toc('# A\nfoo\n    bar\n| - |', 0, 7), '- [A](#a)\n\n    bar\n| - |');
      // 3 columns or less, or none: a block that interrupts the paragraph (not a continuation line).
      // Indented by 1 to 3 columns, a heading, a thematic break and a quote lose the indentation
      // (SELEC-00151, see its own test); the others stay as they are.
      for (const line of ['# x', '- x', '* x', '+ x', '1. x', '> x', '---', '***', '===', '```']) {
        const unindented = ['# x', '> x', '***'].includes(line);
        assert.strictEqual(toc(`# A\nfoo\n  ${line}`, 0, 7), `- [A](#a)\n\n${unindented ? '' : '  '}${line}`, line);
        assert.strictEqual(toc(`# A\nfoo\n${line}`, 0, 7), `- [A](#a)\n\n${line}`, line);
      }
      // `-` alone right after the paragraph is a setext underline (the line before is a heading).
      assert.strictEqual(toc('# A\nfoo\n-', 0, 7), '- [A](#a)\n\n-');
    });

    test('MD-003: the line before in a list item, a quote, or indented by 4 columns or more (condition 3)', () => {
      // A list item line and a quote line (before: left indented, taken into the last item).
      assert.strictEqual(toc('# A\n- foo\n    bar', 0, 9), '- [A](#a)\n\nbar');
      assert.strictEqual(toc('# A\n- foo\n  bar', 0, 9), '- [A](#a)\n\nbar');
      assert.strictEqual(toc('# A\n1. foo\n     bar', 0, 10), '- [A](#a)\n\nbar');
      assert.strictEqual(toc('# A\n> foo\n    bar', 0, 9), '- [A](#a)\n\nbar');
      assert.strictEqual(toc('# A\n> foo\n  bar', 0, 9), '- [A](#a)\n\nbar');
      assert.strictEqual(toc('# A\n- foo\n  2. x', 0, 9), '- [A](#a)\n\n2\\. x');
      // A continuation line indented by 4 columns or more.
      assert.strictEqual(toc('# A\nfoo\n    bar\n    baz', 0, 15), '- [A](#a)\n\nbaz');
      // A lazy continuation line in a list item or a quote.
      assert.strictEqual(toc('# A\n- foo\nbar\n    baz', 0, 13), '- [A](#a)\n\nbaz');
      assert.strictEqual(toc('# A\n> foo\nbar\n    baz', 0, 13), '- [A](#a)\n\nbaz');
      // A paragraph after a blank line in a list item.
      assert.strictEqual(toc('# A\n- x\n\n  foo\n    bar', 0, 15), '- [A](#a)\n\nbar');
      // A paragraph line starting with inline HTML (not an HTML block): no regression from SELEC-00146.
      assert.strictEqual(toc('# A\n<b>x</b> foo\n    bar', 0, 16), '- [A](#a)\n\nbar');
      assert.strictEqual(toc('# A\n<b>x</b> foo\n  bar', 0, 16), '- [A](#a)\n\nbar');
      // A cursor at the end of a quote line: the quote stays, the line after the list does not go into it.
      assert.strictEqual(run('MD-003', '# A\n> foo\n    bar', { ranges: [span(9, 9)] }), '# A\n> foo\n\n- [A](#a)\n\nbar');
    });

    test('MD-003: what is not certain in a list item or a quote stays as before (condition 3)', () => {
      const asBefore = (text: string, end: number): void => {
        const expected = `- [A](#a)\n\n${text.slice(text.indexOf('\n', end) + 1)}`;
        assert.strictEqual(toc(text, 0, end), expected, JSON.stringify(text));
      };
      // Nested containers, 5 columns after the marker (indented code), an empty item, content that may start a block.
      asBefore('# A\n> - foo\n    bar', 11);
      asBefore('# A\n- > foo\n    bar', 11);
      asBefore('# A\n- - foo\n    bar', 11);
      asBefore('# A\n-     foo\n      bar', 13);
      asBefore('# A\n- *a* foo\n    bar', 13);
      // A quote line whose content is indented code or may start a block, or after a tab.
      asBefore('# A\n>     foo\n    bar', 13);
      asBefore('# A\n>   - x\n    bar', 11);
      asBefore('# A\n>\tfoo\n    bar', 9);
      // In a list item or a quote: a fence, a block after a paragraph.
      asBefore('# A\n- ```\n  foo\n    bar', 15);
      asBefore('# A\n> foo\n> - x\n    bar', 15);
      // In an HTML block (kinds 1 to 7) and in fenced code.
      asBefore('# A\n<div>\nfoo\n    bar', 13);
      asBefore('# A\n<custom>\nfoo\n    bar', 16);
      asBefore('# A\n<pre>\n\nfoo\n    bar', 14);
      asBefore('# A\n<!--\n\nfoo\n    bar', 13);
      asBefore('# A\n~~~\nfoo\n    bar', 11);
      // After a quote line, a line with `>` stays in the quote; a sibling item is not a continuation line.
      asBefore('# A\n> foo\n> bar', 9);
      asBefore('# A\n- foo\n2. x', 9);
      asBefore('# A\n- foo\n* x', 9);
      // A later line of the paragraph that may start a block (it would be read differently at the top level).
      asBefore('# A\n- foo\n    bar\n    - baz', 9);
      asBefore('# A\n> foo\n    bar\n> baz', 9);
      // A table header row, a possible definition.
      asBefore('# A\nfoo | x\n--- | -\n    bar', 11);
      asBefore('# A\n[x]:\n/u\n    bar', 11);
    });

    test('MD-014 / 024: a continuation line that would be read as code or as a block after the block (condition 4)', () => {
      const details = '<details><summary>S</summary>\n\nfoo\n\n</details>\n\n';
      const foo = span(0, 3);
      // Before: `bar` was an indented code block after the closing fence / the blank line.
      assert.deepStrictEqual(outcome('MD-014', 'foo\n    bar', [foo]), ['```\nfoo\n```\nbar', [[0, 12]]]);
      assert.deepStrictEqual(outcome('MD-014', 'foo\n    bar', [span(0, 4)]), ['```\nfoo\n```\nbar', [[0, 12]]]);
      assert.deepStrictEqual(outcome('MD-014', 'foo  \n\tbar', [foo]), ['```\nfoo\n```\nbar', [[0, 12]]]);
      assert.deepStrictEqual(outcome('MD-024', 'foo\n    bar', [foo]), [`${details}bar`, [[0, 48]]]);
      assert.deepStrictEqual(outcome('MD-024', 'foo\n    bar', [span(0, 4)]), [`${details}bar`, [[0, 48]]]);
      assert.deepStrictEqual(outcome('MD-014', 'foo\r\n    bar', [foo], '\r\n'), ['```\r\nfoo\r\n```\r\nbar', [[0, 15]]]);
      // Before: `2. x` became an ordered list. With or without indentation, it gets a backslash.
      assert.deepStrictEqual(outcome('MD-014', 'foo\n2. x', [foo]), ['```\nfoo\n```\n2\\. x', [[0, 14]]]);
      assert.deepStrictEqual(outcome('MD-014', 'foo\n  2. x', [foo]), ['```\nfoo\n```\n2\\. x', [[0, 14]]]);
      assert.deepStrictEqual(outcome('MD-014', 'foo\n*', [span(0, 4)]), ['```\nfoo\n```\n\\*', [[0, 13]]]);
      assert.deepStrictEqual(outcome('MD-024', 'foo\n2. x', [foo]), [`${details}2\\. x`, [[0, 50]]]);
      assert.deepStrictEqual(outcome('MD-024', 'foo\n    - x', [foo]), [`${details}\\- x`, [[0, 49]]]);
      // Up to 3 columns without a backslash: still a paragraph after the block, left as it is.
      assert.strictEqual(run('MD-014', 'foo\n  bar', { inputs: [''], ranges: [foo] }), '```\nfoo\n```\n  bar');
      assert.strictEqual(run('MD-024', 'foo\n  bar', { inputs: ['S'], ranges: [foo] }), `${details}  bar`);
      assert.strictEqual(run('MD-014', 'foo\nbar', { inputs: [''], ranges: [foo] }), '```\nfoo\n```\nbar');
      // What cannot stay a paragraph shown the same way, and what is not a continuation line: as before.
      assert.strictEqual(run('MD-014', 'foo\n    ```', { inputs: [''], ranges: [foo] }), '```\nfoo\n```\n    ```');
      assert.strictEqual(run('MD-024', 'foo\n    <div>', { inputs: ['S'], ranges: [foo] }), `${details}    <div>`);
      assert.strictEqual(run('MD-014', 'foo\n1. x', { inputs: [''], ranges: [foo] }), '```\nfoo\n```\n1. x');
      // The line before in a list item or a quote, with the block written at the start of the line.
      assert.strictEqual(run('MD-014', '- foo\n    bar', { inputs: [''], ranges: [span(2, 5)] }), '-\n```\nfoo\n```\nbar');
      assert.strictEqual(run('MD-014', '> foo\n    bar', { inputs: [''], ranges: [span(2, 5)] }), '>\n```\nfoo\n```\nbar');
      // The line before indented by up to 3 columns: the fence keeps the indentation, the line loses its own.
      assert.strictEqual(run('MD-014', '  foo\n    bar', { inputs: [''], ranges: [span(2, 5)] }), '  ```\n  foo\n  ```\nbar');
    });

    test('MD-014 / 024: the line before in a list item, with the block written indented in the item (condition 3, 4)', () => {
      const fence = (text: string, start: number, end: number): string => run('MD-014', text, { inputs: [''], ranges: [span(start, end)] });
      // Before: `bar` was an indented code block in the item (`      bar`) and `2. x` a list in it.
      // The line keeps the item's content indentation and loses only what is beyond it.
      assert.deepStrictEqual(outcome('MD-014', '- a\n\n  foo\n      bar', [span(7, 10)]), ['- a\n\n  ```\n  foo\n  ```\n  bar', [[7, 25]]]);
      assert.deepStrictEqual(outcome('MD-014', '- a\n\n  foo\n      bar', [span(7, 11)]), ['- a\n\n  ```\n  foo\n  ```\n  bar', [[7, 25]]]);
      assert.strictEqual(fence('- a\n\n  foo\n  2. x', 7, 10), '- a\n\n  ```\n  foo\n  ```\n  2\\. x');
      assert.strictEqual(fence('- a\n\n  foo\n      - x', 7, 10), '- a\n\n  ```\n  foo\n  ```\n  \\- x');
      // 2 columns from the content, `- x` interrupts the paragraph (a nested list): as before.
      assert.strictEqual(fence('- a\n\n  foo\n    - x', 7, 10), '- a\n\n  ```\n  foo\n  ```\n    - x');
      assert.strictEqual(fence('- a\n\n  foo\n  \t  bar', 7, 10), '- a\n\n  ```\n  foo\n  ```\n  bar');
      assert.strictEqual(fence('1. a\n\n   foo\n       bar', 9, 12), '1. a\n\n   ```\n   foo\n   ```\n   bar');
      assert.strictEqual(fence(' - a\n\n   foo\n       bar', 9, 12), ' - a\n\n   ```\n   foo\n   ```\n   bar');
      // L a continuation line of the item's first paragraph (the fence interrupts it in the item).
      assert.strictEqual(fence('- a\n  foo\n      bar', 6, 9), '- a\n  ```\n  foo\n  ```\n  bar');
      assert.strictEqual(run('MD-024', '- a\n\n  foo\n      bar', { inputs: ['S'], ranges: [span(7, 10)] }),
        '- a\n\n  <details><summary>S</summary>\n\n  foo\n\n  </details>\n\n  bar');
      // Indented by up to 3 columns from the content without a backslash: still a paragraph of the item, as before.
      assert.strictEqual(fence('- a\n\n  foo\n  bar', 7, 10), '- a\n\n  ```\n  foo\n  ```\n  bar');
      assert.strictEqual(fence('- a\n\n  foo\n     bar', 7, 10), '- a\n\n  ```\n  foo\n  ```\n     bar');
      // A lazy line (less indented than the content) would leave the item after the block, and a tab
      // that goes past the content's column cannot be split: as before.
      assert.strictEqual(fence('- a\n\n  foo\nbar', 7, 10), '- a\n\n  ```\n  foo\n  ```\nbar');
      assert.strictEqual(fence('- a\n\n  foo\n2. x', 7, 10), '- a\n\n  ```\n  foo\n  ```\n2. x');
      assert.strictEqual(fence('- a\n\n  foo\n\t  bar', 7, 10), '- a\n\n  ```\n  foo\n  ```\n\t  bar');
      // A lazy line of a list item or a quote with the block written indented by less than the
      // content (outside the item or the quote): the line loses all its indentation.
      assert.strictEqual(fence('> a\n  foo\n      bar', 6, 9), '> a\n  ```\n  foo\n  ```\nbar');
      assert.strictEqual(fence('- a\n foo\n      bar', 5, 8), '- a\n ```\n foo\n ```\nbar');
      // A later line of the paragraph that may start a block (it is the nested list of the item): as before.
      assert.strictEqual(fence('- a\n\n  foo\n      bar\n    - x', 7, 10), '- a\n\n  ```\n  foo\n  ```\n      bar\n    - x');
    });

    test('MD-014 / 024: cursors and selections in or at the end of what is taken (condition 4)', () => {
      // A cursor in what is taken moves to the end of the edit (the start of the text).
      assert.deepStrictEqual(outcome('MD-014', 'foo\n    bar', [span(0, 3), span(4, 4), span(6, 6)]), ['```\nfoo\n```\nbar', [[0, 12], [12, 12], [12, 12]]]);
      assert.deepStrictEqual(outcome('MD-024', 'foo  \n    bar', [span(0, 3), span(4, 4)]), ['<details><summary>S</summary>\n\nfoo\n\n</details>\n\nbar', [[0, 48], [48, 48]]]);
      // With a backslash, the edit ends after the number: a cursor before it or right after it
      // (where the edit ends) is at the end of the edit; one after the delimiter stays after it.
      assert.deepStrictEqual(outcome('MD-014', 'foo\n2. x', [span(0, 4), span(4, 4)]), ['```\nfoo\n```\n2\\. x', [[0, 14], [14, 14]]]);
      assert.deepStrictEqual(outcome('MD-014', 'foo\n2. x', [span(0, 4), span(5, 5)]), ['```\nfoo\n```\n2\\. x', [[0, 14], [14, 14]]]);
      assert.deepStrictEqual(outcome('MD-014', 'foo\n2. x', [span(0, 4), span(6, 6)]), ['```\nfoo\n```\n2\\. x', [[0, 14], [15, 15]]]);
      assert.deepStrictEqual(outcome('MD-014', 'foo\n*', [span(0, 4), span(4, 4)]), ['```\nfoo\n```\n\\*', [[0, 13], [13, 13]]]);
      // A non-empty selection in what would be taken, or where the edit would end: as before.
      assert.deepStrictEqual(outcome('MD-014', 'foo\n2. x', [span(0, 3), span(5, 8)]), ['```\nfoo\n```\n2\n```\n. x\n```', [[0, 11], [13, 25]]]);
      assert.deepStrictEqual(outcome('MD-014', 'foo\n2. x', [span(0, 3), span(4, 5)]), ['```\nfoo\n```\n```\n2\n```\n. x', [[0, 11], [12, 22]]]);
      assert.strictEqual(applied('foo\n    bar', result('MD-014', 'foo\n    bar', { inputs: [''], ranges: [span(0, 3), span(8, 11)] })), '```\nfoo\n```\n```\nbar\n```');
    });

    test('MD-001: a continuation line after the heading written in place of the line (condition 4)', () => {
      // Before: `# foo\n    bar` (an indented code block after the heading) and `# foo\n2. x` (an ordered list).
      assert.deepStrictEqual(outcome('MD-001', 'foo\n    bar', [span(0, 3)]), ['# foo\nbar', [[0, 6]]]);
      assert.deepStrictEqual(outcome('MD-001', 'foo  \n    bar', [span(0, 3)]), ['# foo\nbar', [[0, 6]]]);
      assert.deepStrictEqual(outcome('MD-001', 'foo\n    bar', [span(0, 4)]), ['# foo\nbar', [[0, 6]]]);
      assert.deepStrictEqual(outcome('MD-001', 'foo\n2. x', [span(0, 3)]), ['# foo\n2\\. x', [[0, 8]]]);
      assert.deepStrictEqual(outcome('MD-001', 'foo\r\n\tbar', [span(0, 3)], '\r\n'), ['# foo\r\nbar', [[0, 7]]]);
      assert.deepStrictEqual(outcome('MD-001', '  foo\n    bar', [span(2, 5)]), ['  # foo\nbar', [[2, 8]]]);
      // A cursor in what is taken moves to the end of the edit; a non-empty selection there: as before.
      assert.deepStrictEqual(outcome('MD-001', 'foo\n2. x', [span(0, 3), span(4, 4)]), ['# foo\n2\\. x', [[0, 8], [8, 8]]]);
      assert.deepStrictEqual(outcome('MD-001', 'foo\n    bar', [span(0, 3), span(8, 11)]), ['# foo\n    # bar', [[0, 5], [10, 15]]]);
      // Still a paragraph after the heading, or not a heading: as before.
      assert.strictEqual(run('MD-001', 'foo\n  bar', { ranges: [span(0, 3)] }), '# foo\n  bar');
      assert.strictEqual(run('MD-001', 'x foo\n    bar', { ranges: [span(2, 5)] }), 'x # foo\n    bar');
      assert.strictEqual(run('MD-001', 'foo\n    ```', { ranges: [span(0, 3)] }), '# foo\n    ```');
    });

    test('MD-004..006, MD-015: a continuation line that would start a new list after the item or quote written (condition 4)', () => {
      // Before: `2. x` / `*` (less indented than the item's content) started a new list or item.
      assert.deepStrictEqual(outcome('MD-004', 'foo\n2. x', [span(0, 3)]), ['- foo\n2\\. x', [[0, 8]]]);
      assert.deepStrictEqual(outcome('MD-004', 'foo\n*', [span(0, 3)]), ['- foo\n\\*', [[0, 7]]]);
      assert.deepStrictEqual(outcome('MD-005', 'foo\n2. x', [span(0, 3)]), ['1. foo\n2\\. x', [[0, 9]]]);
      assert.deepStrictEqual(outcome('MD-005', 'foo\n  2. x', [span(0, 3)]), ['1. foo\n  2\\. x', [[0, 11]]]);
      assert.deepStrictEqual(outcome('MD-005', 'foo\nbar\n2. x', [span(0, 7)]), ['1. foo\n2. bar\n2\\. x', [[0, 16]]]);
      assert.deepStrictEqual(outcome('MD-006', 'foo\n2. x', [span(0, 4)]), ['- [ ] foo\n2\\. x', [[0, 12]]]);
      assert.deepStrictEqual(outcome('MD-015', 'foo\n2. x', [span(0, 3)]), ['> foo\n2\\. x', [[0, 8]]]);
      assert.deepStrictEqual(outcome('MD-015', 'foo\n  *', [span(0, 4)]), ['> foo\n  \\*', [[0, 9]]]);
      // In the item's content (as indented as it), indented by 4 columns or more, or not a list item:
      // still a lazy continuation line, as before.
      assert.strictEqual(run('MD-004', 'foo\n  2. x', { ranges: [span(0, 3)] }), '- foo\n  2. x');
      assert.strictEqual(run('MD-004', 'foo\n    bar', { ranges: [span(0, 3)] }), '- foo\n    bar');
      assert.strictEqual(run('MD-015', 'foo\n    bar', { ranges: [span(0, 3)] }), '> foo\n    bar');
      assert.strictEqual(run('MD-015', 'foo\n#x', { ranges: [span(0, 3)] }), '> foo\n#x');
      // The line before in a list item (not at the top level): as before.
      assert.strictEqual(run('MD-004', '- foo\n2. x', { ranges: [span(2, 5)] }), '- - foo\n2. x');
    });

    test('MD-004..006, MD-015: the later lines of the paragraph are lazy continuation lines too (condition 4, SELEC-00151 condition 1)', () => {
      // Every later line of the paragraph that would start a block after the item or quote written
      // gets its backslash too (SELEC-00151; before, `foo⏎2. x⏎3. y` was left as before as a whole,
      // and `foo⏎bar⏎2. x` turned `2. x` into a new list).
      assert.strictEqual(run('MD-005', 'foo\n2. x\n3. y', { ranges: [span(0, 3)] }), '1. foo\n2\\. x\n3\\. y');
      assert.strictEqual(run('MD-004', 'foo\n2. x\n*', { ranges: [span(0, 3)] }), '- foo\n2\\. x\n\\*');
      assert.strictEqual(run('MD-006', 'foo\n2. x\n3. y', { ranges: [span(0, 3)] }), '- [ ] foo\n2\\. x\n3\\. y');
      assert.strictEqual(run('MD-005', 'foo\n2. x\nbar', { ranges: [span(0, 3)] }), '1. foo\n2\\. x\nbar');
      // A line that needs no backslash before the one that does (N itself unchanged). The backslash
      // is an edit of its own: the selection selects its result only, not the lines after it.
      assert.deepStrictEqual(outcome('MD-004', 'foo\nbar\n2. x', [span(0, 3)]), ['- foo\nbar\n2\\. x', [[0, 5]]]);
      assert.strictEqual(run('MD-004', 'foo\nbar\n*', { ranges: [span(0, 3)] }), '- foo\nbar\n\\*');
      assert.strictEqual(run('MD-005', 'foo\nbar\nbaz\n2. x', { ranges: [span(0, 3)] }), '1. foo\nbar\nbaz\n2\\. x');
      assert.strictEqual(run('MD-006', 'foo\nbar\n2. x', { ranges: [span(0, 3)] }), '- [ ] foo\nbar\n2\\. x');
      assert.strictEqual(run('MD-015', 'foo\nbar\n2. x', { ranges: [span(0, 3)] }), '> foo\nbar\n2\\. x');
      assert.strictEqual(run('MD-015', 'foo\n    bar\n2. x', { ranges: [span(0, 3)] }), '> foo\n    bar\n2\\. x');
      assert.strictEqual(run('MD-005', '  foo\nbar\n2. x', { ranges: [span(2, 5)] }), '  1. foo\nbar\n2\\. x');
      // A later line indented into the item's content (a nested list in it before).
      assert.strictEqual(run('MD-004', 'foo\nbar\n    - x', { ranges: [span(0, 3)] }), '- foo\nbar\n    \\- x');
      assert.strictEqual(run('MD-004', 'foo\n    - x\n3. y', { ranges: [span(0, 3)] }), '- foo\n    \\- x\n3\\. y');
      // After a quote, indented by 4 columns or more: still a lazy continuation line, left as it is.
      assert.strictEqual(run('MD-015', 'foo\n2. x\n    3. y', { ranges: [span(0, 3)] }), '> foo\n2\\. x\n    3. y');
      assert.strictEqual(run('MD-015', 'foo\nbar\n    - x', { ranges: [span(0, 3)] }), '> foo\nbar\n    - x');
      // Selected with the line break, CRLF and a lone CR.
      assert.strictEqual(run('MD-004', 'foo\nbar\n2. x', { ranges: [span(0, 4)] }), '- foo\nbar\n2\\. x');
      assert.deepStrictEqual(outcome('MD-004', 'foo\r\nbar\r\n2. x', [span(0, 3)], '\r\n'), ['- foo\r\nbar\r\n2\\. x', [[0, 5]]]);
      assert.deepStrictEqual(outcome('MD-004', 'foo\rbar\r2. x', [span(0, 3)]), ['- foo\rbar\r2\\. x', [[0, 5]]]);
      // The end of the paragraph: a blank line, or a block that interrupted it and still does after
      // the item written (a list item at the start of the line goes on with the list written, as it did).
      assert.strictEqual(run('MD-015', 'foo\n2. x\nbar\n\n3. y', { ranges: [span(0, 3)] }), '> foo\n2\\. x\nbar\n\n3. y');
      assert.strictEqual(run('MD-004', 'foo\n2. x\n- y', { ranges: [span(0, 3)] }), '- foo\n2\\. x\n- y');
      assert.strictEqual(run('MD-004', 'foo\n2. x\n# y', { ranges: [span(0, 3)] }), '- foo\n2\\. x\n# y');
      // After a heading (MD-001), N starts a paragraph of its own, which the later lines continue.
      assert.strictEqual(run('MD-001', 'foo\n2. x\n3. y', { ranges: [span(0, 3)] }), '# foo\n2\\. x\n3. y');
    });

    test('MD-004..006, MD-015: the paragraph is left as before as a whole when a line of it cannot be kept (SELEC-00151 condition 1)', () => {
      // The quote would take a `>` line that ends the paragraph in.
      assert.strictEqual(run('MD-015', 'foo\n2. x\n> y', { ranges: [span(0, 3)] }), '> foo\n2. x\n> y');
      // A setext underline: the paragraph was a heading.
      assert.strictEqual(run('MD-004', 'foo\n2. x\n===', { ranges: [span(0, 3)] }), '- foo\n2. x\n===');
      assert.strictEqual(run('MD-004', 'foo\n2. x\n---', { ranges: [span(0, 3)] }), '- foo\n2. x\n---');
      // A block indented as far as the item's content would be a block in the item.
      assert.strictEqual(run('MD-004', 'foo\n2. x\n  # y', { ranges: [span(0, 3)] }), '- foo\n2. x\n  # y');
      // A line that no backslash keeps shown the same way, or one that is not certain.
      assert.strictEqual(run('MD-004', 'foo\n2. x\n    ```', { ranges: [span(0, 3)] }), '- foo\n2. x\n    ```');
      assert.strictEqual(run('MD-004', 'foo\n2. x\n<custom>', { ranges: [span(0, 3)] }), '- foo\n2. x\n<custom>');
      assert.strictEqual(run('MD-004', 'foo\n2. x\n[x]: /u', { ranges: [span(0, 3)] }), '- foo\n2. x\n[x]: /u');
      assert.strictEqual(run('MD-004', 'foo\n2. x\nbar | x\n--- | -', { ranges: [span(0, 3)] }), '- foo\n2. x\nbar | x\n--- | -');
    });

    test('MD-004..006, MD-015: selections and cursors in the lines taken (SELEC-00151 condition 1)', () => {
      // N's backslash is in the edit of the selection (as since SELEC-00150): a cursor in the rest of
      // L or in N up to N's own edit moves to the end of that edit, and the selection selects up to it.
      assert.deepStrictEqual(outcome('MD-004', 'foo\n2. x\nbar\n3. y', [span(0, 3), span(4, 4)]), ['- foo\n2\\. x\nbar\n3\\. y', [[0, 8], [8, 8]]]);
      assert.deepStrictEqual(outcome('MD-004', 'foo\n2. x\nbar\n3. y', [span(0, 3), span(5, 5)]), ['- foo\n2\\. x\nbar\n3\\. y', [[0, 8], [8, 8]]]);
      // The later lines' backslashes are edits of their own: no cursor jumps lines away, and the
      // selection does not reach into lines the user did not select (code review of SELEC-00151).
      // A cursor after the selection when N is unchanged stays where it is.
      assert.deepStrictEqual(outcome('MD-004', 'foo\nbar\n3. y', [span(0, 3), span(4, 4)]), ['- foo\nbar\n3\\. y', [[0, 5], [6, 6]]]);
      assert.deepStrictEqual(outcome('MD-004', 'foo\nbar\n3. y', [span(0, 3), span(3, 3)]), ['- foo\nbar\n3\\. y', [[0, 5], [5, 5]]]);
      assert.deepStrictEqual(outcome('MD-004', 'foo\nbar\nbaz\nqux\n2. x', [span(0, 3), span(4, 4)]), ['- foo\nbar\nbaz\nqux\n2\\. x', [[0, 5], [6, 6]]]);
      // A cursor in a later line keeps its place in its text (before a backslash inserted where it is).
      assert.deepStrictEqual(outcome('MD-004', 'foo\n2. x\nbar\n3. y', [span(0, 3), span(9, 9)]), ['- foo\n2\\. x\nbar\n3\\. y', [[0, 8], [12, 12]]]);
      assert.deepStrictEqual(outcome('MD-004', 'foo\nbar\n3. y', [span(0, 3), span(5, 5)]), ['- foo\nbar\n3\\. y', [[0, 5], [7, 7]]]);
      assert.deepStrictEqual(outcome('MD-004', 'foo\nbar\n3. y', [span(0, 3), span(8, 8), span(9, 9), span(10, 10)]),
        ['- foo\nbar\n3\\. y', [[0, 5], [10, 10], [11, 11], [13, 13]]]);
      assert.deepStrictEqual(outcome('MD-005', 'foo\nbar\n10. x', [span(0, 3), span(9, 9)]), ['1. foo\nbar\n10\\. x', [[0, 6], [12, 12]]]);
      // CRLF: the same.
      assert.deepStrictEqual(outcome('MD-004', 'foo\r\nbar\r\n3. y', [span(0, 3), span(6, 6)], '\r\n'), ['- foo\r\nbar\r\n3\\. y', [[0, 5], [8, 8]]]);
      // A non-empty selection in what would be taken: as before (the later selection makes its own edit).
      assert.strictEqual(run('MD-004', 'foo\n2. x\nbar\n3. y', { ranges: [span(0, 3), span(9, 12)] }), '- foo\n2. x\n- bar\n3\\. y');
      // A non-empty selection after the paragraph: both edits are made, in order.
      assert.deepStrictEqual(outcome('MD-004', 'foo\nbar\n2. x\n\nbaz\nq\n3. y', [span(0, 3), span(14, 17)]),
        ['- foo\nbar\n2\\. x\n\n- baz\nq\n3\\. y', [[0, 5], [17, 22]]]);
    });

    test('MD-004..006, MD-015: the list written next to a list after a blank line, and L in a list item (SELEC-00151, item 7)', () => {
      // The list written goes on with the user's list after the blank line (a loose list), as it
      // does for `foo⏎⏎3. y`: the lines of the paragraph stay text of the item (`2\. x`, `bar`).
      assert.strictEqual(run('MD-005', 'foo\n2. x\nbar\n\n3. y', { ranges: [span(0, 3)] }), '1. foo\n2\\. x\nbar\n\n3. y');
      assert.strictEqual(run('MD-005', 'foo\n\n3. y', { ranges: [span(0, 3)] }), '1. foo\n\n3. y');
      // L a lazy line of a list item: the line written leaves the item or becomes a sibling of it, so
      // the later lines are left as before.
      assert.strictEqual(run('MD-005', '- a\nfoo\n  2. x', { ranges: [span(4, 7)] }), '- a\n1. foo\n  2. x');
      assert.strictEqual(run('MD-004', '- a\nfoo\n  2. x', { ranges: [span(4, 7)] }), '- a\n- foo\n  2. x');
      assert.strictEqual(run('MD-015', '- a\nfoo\n  2. x', { ranges: [span(4, 7)] }), '- a\n> foo\n  2. x');
    });

    test('MD-004..006: a continuation line indented into the content of the item written (condition 4)', () => {
      // Before: indented as far as the item's content or further (by 3 columns or less from there),
      // N was a line of the item and started a nested list, a heading, a quote or a thematic break
      // in it, or made L a setext heading. Its indentation is kept and one backslash is put in.
      assert.deepStrictEqual(outcome('MD-004', 'foo\n    - x', [span(0, 3)]), ['- foo\n    \\- x', [[0, 11]]]);
      assert.strictEqual(run('MD-004', 'foo\n    + x', { ranges: [span(0, 3)] }), '- foo\n    \\+ x');
      assert.strictEqual(run('MD-004', 'foo\n     - x', { ranges: [span(0, 3)] }), '- foo\n     \\- x');
      assert.strictEqual(run('MD-004', 'foo\n    1. x', { ranges: [span(0, 3)] }), '- foo\n    1\\. x');
      assert.strictEqual(run('MD-006', 'foo\n    - x', { ranges: [span(0, 3)] }), '- [ ] foo\n    \\- x');
      assert.strictEqual(run('MD-005', 'foo\n     - x', { ranges: [span(0, 3)] }), '1. foo\n     \\- x');
      assert.strictEqual(run('MD-005', 'foo\n    - x', { ranges: [span(0, 3)] }), '1. foo\n    \\- x');
      assert.strictEqual(run('MD-004', 'foo\n    # x', { ranges: [span(0, 3)] }), '- foo\n    \\# x');
      assert.strictEqual(run('MD-005', 'foo\n    # x', { ranges: [span(0, 3)] }), '1. foo\n    \\# x');
      assert.strictEqual(run('MD-005', 'foo\n    > x', { ranges: [span(0, 3)] }), '1. foo\n    \\> x');
      assert.strictEqual(run('MD-004', 'foo\n    ***', { ranges: [span(0, 3)] }), '- foo\n    \\***');
      assert.strictEqual(run('MD-004', 'foo\n    ---', { ranges: [span(0, 3)] }), '- foo\n    \\---');
      assert.strictEqual(run('MD-004', 'foo\n    ===', { ranges: [span(0, 3)] }), '- foo\n    \\===');
      assert.strictEqual(run('MD-004', 'foo\n    -', { ranges: [span(0, 3)] }), '- foo\n    \\-');
      assert.strictEqual(run('MD-004', 'foo\r\n    - x', { ranges: [span(0, 3)], eol: '\r\n' }), '- foo\r\n    \\- x');
      assert.strictEqual(run('MD-004', 'foo  \n    - x', { ranges: [span(0, 3)] }), '- foo  \n    \\- x');
      // Selected with its line break: the same.
      assert.strictEqual(run('MD-004', 'foo\n    - x', { ranges: [span(0, 4)] }), '- foo\n    \\- x');
      // Text that does not interrupt a paragraph, indented by 4 columns or more from the content, or
      // a later line that may start a block: as before.
      assert.strictEqual(run('MD-004', 'foo\n    2. x', { ranges: [span(0, 3)] }), '- foo\n    2. x');
      assert.strictEqual(run('MD-004', 'foo\n    #x', { ranges: [span(0, 3)] }), '- foo\n    #x');
      assert.strictEqual(run('MD-004', 'foo\n      - x', { ranges: [span(0, 3)] }), '- foo\n      - x');
      // A fence or an HTML block that no backslash keeps shown the same way: as before.
      assert.strictEqual(run('MD-004', 'foo\n    ```', { ranges: [span(0, 3)] }), '- foo\n    ```');
      assert.strictEqual(run('MD-004', 'foo\n    <div>', { ranges: [span(0, 3)] }), '- foo\n    <div>');
      // In a quote, the line stays a lazy continuation line of its paragraph: as before.
      assert.strictEqual(run('MD-015', 'foo\n    - x', { ranges: [span(0, 3)] }), '> foo\n    - x');
      // A non-empty selection where the edit would end: as before.
      assert.strictEqual(run('MD-004', 'foo\n    - x', { ranges: [span(0, 3), span(8, 9)] }), '- foo\n    - x');
    });

    test('MD-019 and the commands that write inline markup: checked, not changed (condition 4)', () => {
      // Inline markup (MD-010, 016, 021, JAUNIX-021 `<kbd>` with text after the tag) and footnotes
      // (MD-022) leave the line a paragraph line: the next line continues it as before.
      assert.strictEqual(run('MD-010', 'foo\n    bar', { ranges: [span(0, 3)] }), '**foo**\n    bar');
      assert.strictEqual(run('MD-010', 'foo\n2. x', { ranges: [span(0, 3)] }), '**foo**\n2. x');
      assert.strictEqual(run('MD-021', 'foo\n2. x', { ranges: [span(0, 3)] }), '[foo](#foo)\n2. x');
      assert.strictEqual(run('MD-022', 'foo\n    bar', { ranges: [span(0, 3)] }), '[^1]\n    bar\n\n[^1]: foo');
      assert.strictEqual(run('MD-013', 'foo\n    bar', { ranges: [span(0, 3)] }), 'unchanged');
      // MD-019: `<p>` starts an HTML block (kind 6) that runs to the next blank line, so the next line
      // was taken into it as raw HTML whatever its indentation. Since SELEC-00151 a blank line is
      // written after it (see the MD-019 suite): the paragraph is split there.
      assert.strictEqual(run('MD-019', 'foo\n    bar', { ranges: [span(0, 3)] }), '<p>foo</p>\n\nbar');
      assert.strictEqual(run('MD-019', 'foo\nbar', { ranges: [span(0, 3)] }), '<p>foo</p>\n\nbar');
    });
  });

  suite('the rest of the paragraph and the blocks around what is written (SELEC-00151)', () => {
    const span = (start: number, end: number) => ({ start, end });
    const toc = (text: string, start: number, end: number, eol: MdEol = '\n'): string =>
      run('MD-003', text, { ranges: [span(start, end)], eol });
    const outcome = (id: string, text: string, ranges: MdRange[], eol: MdEol = '\n'): [string, number[][]] => {
      const done = result(id, text, { inputs: id === 'MD-014' ? [''] : [], ranges, eol });
      assert.ok(done.kind === 'edit');
      return [applied(text, done), done.ranges.map(({ start, end }) => [start, end])];
    };

    test('MD-003: a block indented by 1 to 3 columns after the paragraph loses its indentation (condition 4)', () => {
      // Before: `- [A](#a)\n\n  # x`, where `# x` was a heading in the last item of the list.
      assert.strictEqual(toc('# A\nfoo\n  # x', 0, 7), '- [A](#a)\n\n# x');
      assert.strictEqual(toc('# A\nfoo\n # x', 0, 7), '- [A](#a)\n\n# x');
      assert.strictEqual(toc('# A\nfoo\n   # x', 0, 7), '- [A](#a)\n\n# x');
      assert.strictEqual(toc('# A\nfoo\n  ***', 0, 7), '- [A](#a)\n\n***');
      assert.strictEqual(toc('# A\nfoo\n  - - -', 0, 7), '- [A](#a)\n\n- - -');
      assert.strictEqual(toc('# A\nfoo\n  > x', 0, 7), '- [A](#a)\n\n> x');
      // The later lines of the quote stay in it, with their own indentation or lazily.
      assert.strictEqual(toc('# A\nfoo\n  > x\n  > y\nz', 0, 7), '- [A](#a)\n\n> x\n  > y\nz');
      // A tab is 4 columns: the line is a continuation line (escaped, as before).
      assert.strictEqual(toc('# A\nfoo\n\t# x', 0, 7), '- [A](#a)\n\n\\# x');
      // Selected with the line break, CRLF, and a cursor at the end of the line.
      assert.deepStrictEqual(outcome('MD-003', '# A\nfoo\n  # x', [span(0, 8)]), ['- [A](#a)\n\n# x', [[0, 11]]]);
      assert.deepStrictEqual(outcome('MD-003', '# A\r\nfoo\r\n  # x', [span(0, 8)], '\r\n'), ['- [A](#a)\r\n\r\n# x', [[0, 13]]]);
      assert.deepStrictEqual(outcome('MD-003', '# A\nfoo\n  > x', [span(7, 7)]), ['# A\nfoo\n\n- [A](#a)\n\n> x', [[7, 20]]]);
    });

    test('MD-003: what would change with the indentation dropped stays as before (condition 4)', () => {
      // A list item (its content column would move, and `- x` would go on with the list), a fence
      // or an HTML block (read relative to that indentation), a table, a setext underline.
      for (const line of ['- x', '1. x', '```', '<div>', '| a |', '---', '===']) {
        assert.strictEqual(toc(`# A\nfoo\n  ${line}`, 0, 7), `- [A](#a)\n\n  ${line}`, line);
      }
      // The line before in a list item or a quote.
      assert.strictEqual(toc('# A\n- foo\n  # x', 0, 9), '- [A](#a)\n\n  # x');
      assert.strictEqual(toc('# A\n> foo\n  # x', 0, 9), '- [A](#a)\n\n  # x');
      // A selection in the indentation of the heading has a table of contents of its own, and a
      // cursor there inserts one: the first list stops at the end of the line as before.
      assert.deepStrictEqual(outcome('MD-003', '# A\nfoo\n  # x', [span(0, 7), span(8, 9)]), ['- [A](#a)\n\n- [x](#x)\n\n# x', [[0, 10], [11, 22]]]);
      assert.deepStrictEqual(outcome('MD-003', '# A\nfoo\n  > x', [span(0, 7), span(8, 9)]), ['- [A](#a)\n\n  > x', [[0, 10], [11, 12]]]);
    });

    test('MD-003: a list item after the lazy line that goes to the top level gets a blank line before it (item 7)', () => {
      // Before: `bar\n2. x` became one paragraph after the list (`2. x`, a list after the quote, became text).
      assert.deepStrictEqual(outcome('MD-003', '# A\n> foo\nbar\n2. x', [span(0, 9)]), ['- [A](#a)\n\nbar\n\n2. x', [[0, 16]]]);
      assert.strictEqual(toc('# A\n- foo\nbar\n2. x', 0, 9), '- [A](#a)\n\nbar\n\n2. x');
      assert.strictEqual(toc('# A\n- foo\n  bar\n2. x', 0, 9), '- [A](#a)\n\nbar\n\n2. x');
      assert.strictEqual(toc('# A\n> foo\n    bar\n2. x', 0, 9), '- [A](#a)\n\nbar\n\n2. x');
      assert.strictEqual(toc('# A\n> foo\nbar\nbaz\n*', 0, 9), '- [A](#a)\n\nbar\nbaz\n\n*');
      assert.strictEqual(toc('# A\n> foo\r\nbar\r\n2. x', 0, 9, '\r\n'), '- [A](#a)\r\n\r\nbar\r\n\r\n2. x');
      // An item that interrupts a paragraph at the top level too, or one in the quote: as before.
      assert.strictEqual(toc('# A\n> foo\nbar\n1. x', 0, 9), '- [A](#a)\n\nbar\n1. x');
      assert.strictEqual(toc('# A\n> foo\nbar\n> 2. x', 0, 9), '- [A](#a)\n\nbar\n> 2. x');
      // A selection in the lines taken: as before (a cursor there inserts a list of its own).
      assert.strictEqual(run('MD-003', '# A\n> foo\nbar\n2. x', { ranges: [span(0, 9), span(13, 13)] }), '- [A](#a)\n\nbar\n\n- [A](#a)\n\n2. x');
    });

    test('a task list item as the line before (condition 6)', () => {
      // Before: `    bar` (taken into the last item of the list, or code after the fence) and `  2. x`
      // were left as they were, since the item's text starts with `[`.
      assert.strictEqual(toc('# A\n- [ ] foo\n    bar', 0, 13), '- [A](#a)\n\nbar');
      assert.strictEqual(toc('# A\n- [x] foo\n  2. x', 0, 13), '- [A](#a)\n\n2\\. x');
      assert.strictEqual(toc('# A\n- [X] foo\n    bar', 0, 13), '- [A](#a)\n\nbar');
      assert.strictEqual(toc('# A\n1. [ ] foo\n     bar', 0, 14), '- [A](#a)\n\nbar');
      assert.strictEqual(toc('# A\n- [ ]\tfoo\n    bar', 0, 13), '- [A](#a)\n\nbar');
      assert.deepStrictEqual(outcome('MD-014', '- [ ] foo\n    bar', [span(6, 9)]), ['- [ ]\n```\nfoo\n```\nbar', [[5, 18]]]);
      assert.deepStrictEqual(outcome('MD-014', '- [x] foo\n  2. x', [span(6, 9)]), ['- [x]\n```\nfoo\n```\n2\\. x', [[5, 20]]]);
      assert.strictEqual(run('MD-014', '- [ ]\tfoo\n    bar', { inputs: [''], ranges: [span(6, 9)] }), '- [ ]\n```\nfoo\n```\nbar');
      // As before: an empty task item, a block after the checkbox, a possible definition, a tab after the marker.
      assert.strictEqual(toc('# A\n- [ ]\n    bar', 0, 9), '- [A](#a)\n\n    bar');
      assert.strictEqual(toc('# A\n- [ ] # x\n    bar', 0, 13), '- [A](#a)\n\n    bar');
      assert.strictEqual(toc('# A\n- [x]: foo\n    bar', 0, 14), '- [A](#a)\n\n    bar');
      assert.strictEqual(toc('# A\n-\t[ ] foo\n    bar', 0, 13), '- [A](#a)\n\n    bar');
    });

    test('MD-019: a blank line after the HTML block, at the top level (condition 2)', () => {
      const html = (text: string, start: number, end: number, eol: MdEol = '\n'): string => run('MD-019', text, { ranges: [span(start, end)], eol });
      // Before: `<p>foo</p>\nbar` (`bar` raw HTML in the block). The paragraph is now split in two.
      assert.deepStrictEqual(outcome('MD-019', 'foo\nbar', [span(0, 3)]), ['<p>foo</p>\n\nbar', [[0, 12]]]);
      assert.deepStrictEqual(outcome('MD-019', 'foo\nbar', [span(0, 4)]), ['<p>foo</p>\n\nbar', [[0, 12]]]);
      assert.strictEqual(html('foo  \nbar', 0, 3), '<p>foo</p>\n\nbar');
      assert.strictEqual(html('foo\r\nbar', 0, 3, '\r\n'), '<p>foo</p>\r\n\r\nbar');
      assert.strictEqual(html('  foo\nbar', 2, 5), '  <p>foo</p>\n\nbar');
      // The continuation line keeps being read as before: indentation of 4 columns or more is taken,
      // and a text that would start a block gets a backslash; a block that interrupted the paragraph stays.
      assert.strictEqual(html('foo\n    bar', 0, 3), '<p>foo</p>\n\nbar');
      assert.strictEqual(html('foo\n2. x', 0, 3), '<p>foo</p>\n\n2\\. x');
      assert.strictEqual(html('foo\n    - x', 0, 3), '<p>foo</p>\n\n\\- x');
      assert.strictEqual(html('foo\n# x', 0, 3), '<p>foo</p>\n\n# x');
      assert.strictEqual(html('foo\n- x', 0, 3), '<p>foo</p>\n\n- x');
      // Several lines, the ROADMAP example followed by a line.
      assert.strictEqual(html('# a\n**b**\nc', 0, 9), '<h1>a</h1>\n<p><strong>b</strong></p>\n\nc');
      // Several selections: a cursor in what is taken moves to the end of the edit; a non-empty
      // selection on the next line makes its own HTML (inside the block, as before).
      assert.deepStrictEqual(outcome('MD-019', 'foo\nbar', [span(0, 3), span(5, 5)]), ['<p>foo</p>\n\nbar', [[0, 12], [13, 13]]]);
      assert.deepStrictEqual(outcome('MD-019', 'foo\nbar', [span(0, 3), span(4, 4)]), ['<p>foo</p>\n\nbar', [[0, 12], [12, 12]]]);
      assert.strictEqual(run('MD-019', 'foo\nbar', { ranges: [span(0, 3), span(4, 7)] }), '<p>foo</p>\n<p>bar</p>');
      // Nothing after the block: the whole text, a blank line after, a block closed by itself.
      assert.strictEqual(html('foo\nbar', 0, 7), '<p>foo\nbar</p>');
      assert.strictEqual(html('foo\n\nbar', 0, 3), '<p>foo</p>\n\nbar');
      assert.strictEqual(html('```\ncode\n```\nbar', 0, 12), '<pre><code>code\n</code></pre>\nbar');
    });

    test('MD-019: a blank line in a block quote (condition 2)', () => {
      const html = (text: string, start: number, end: number): string => run('MD-019', text, { ranges: [span(start, end)] });
      // Before: `> <p>foo</p>\n> bar` (`bar` raw HTML in the block). The blank line keeps the quote open.
      assert.deepStrictEqual(outcome('MD-019', '> foo\n> bar', [span(2, 5)]), ['> <p>foo</p>\n>\n> bar', [[2, 15]]]);
      assert.strictEqual(html('  > foo\n  > bar', 4, 7), '  > <p>foo</p>\n  >\n  > bar');
      assert.strictEqual(html('> foo\n>     bar', 2, 5), '> <p>foo</p>\n>\n> bar');
      assert.strictEqual(html('> foo\n> 2. x', 2, 5), '> <p>foo</p>\n>\n> 2\\. x');
      assert.strictEqual(html('> foo\n> # x', 2, 5), '> <p>foo</p>\n>\n> # x');
      // `>` without a space after it counts; a tab after it is not certain (as before).
      assert.strictEqual(html('>foo\n>bar', 1, 4), '><p>foo</p>\n>\n>bar');
      assert.strictEqual(html('>\tfoo\n>\tbar', 2, 5), '>\t<p>foo</p>\n>\tbar');
      assert.strictEqual(html('> foo\n>\tbar', 2, 5), '> <p>foo</p>\n>\tbar');
      // A lazy continuation line gets the quote's marker; a block after the quote stays.
      assert.strictEqual(html('> foo\nbar', 2, 5), '> <p>foo</p>\n>\n> bar');
      assert.strictEqual(html('> foo\n# x', 2, 5), '> <p>foo</p>\n>\n# x');
      // Not certain: a lazy line indented by 4 columns or that may start a block, an HTML of several lines.
      assert.strictEqual(html('> foo\n    bar', 2, 5), '> <p>foo</p>\n    bar');
      assert.strictEqual(html('> foo\n#x', 2, 5), '> <p>foo</p>\n#x');
      assert.strictEqual(html('> foo **a\nb** c\n> bar', 2, 13), '> <p>foo <strong>a\nb</strong></p> c\n> bar');
      // N followed by a table's delimiter row would be a table's header row after the blank line:
      // left as before, in a quote as at the top level (the next line is read after its `>` too).
      assert.strictEqual(html('> foo\n> a | b\n> --|--', 2, 5), '> <p>foo</p>\n> a | b\n> --|--');
      assert.strictEqual(html('> foo\n>a | b\n>--|--', 2, 5), '> <p>foo</p>\n>a | b\n>--|--');
      assert.strictEqual(html('> foo\na | b\n> --|--', 2, 5), '> <p>foo</p>\na | b\n> --|--');
      assert.strictEqual(html('> foo\na | b\n--|--', 2, 5), '> <p>foo</p>\na | b\n--|--');
      // A next line that is no delimiter row does not change anything.
      assert.strictEqual(html('> foo\n> a | b\n> c', 2, 5), '> <p>foo</p>\n>\n> a | b\n> c');
    });

    test('MD-019: what is left as before (condition 2)', () => {
      const html = (text: string, start: number, end: number): string => run('MD-019', text, { ranges: [span(start, end)] });
      // After other text on the line, the HTML is inline: the paragraph goes on as before.
      assert.strictEqual(html('x foo\nbar', 2, 5), 'x <p>foo</p>\nbar');
      assert.strictEqual(html('> x foo\n> bar', 4, 7), '> x <p>foo</p>\n> bar');
      // In a list item: a blank line would make the whole list loose (every item in a `<p>`), a
      // change beyond the item selected. Left as it is (a candidate for another ticket).
      assert.strictEqual(html('- foo\n  bar', 2, 5), '- <p>foo</p>\n  bar');
      assert.strictEqual(html('- foo\nbar', 2, 5), '- <p>foo</p>\nbar');
      assert.strictEqual(html('1. foo\n   bar', 3, 6), '1. <p>foo</p>\n   bar');
      assert.strictEqual(html('> - foo\n>   bar', 4, 7), '> - <p>foo</p>\n>   bar');
      // Text after the selection on its own line is in the block on that line (another ticket).
      assert.strictEqual(html('foo bar\nbaz', 0, 3), '<p>foo</p> bar\nbaz');
      // The paragraph was a setext heading; a line that would start an HTML block, a definition or
      // code after the blank line (no closer to how it was shown than raw HTML in the block).
      assert.strictEqual(html('foo\n===', 0, 3), '<p>foo</p>\n===');
      assert.strictEqual(html('foo\n    <div>', 0, 3), '<p>foo</p>\n    <div>');
      assert.strictEqual(html('foo\n<custom>', 0, 3), '<p>foo</p>\n<custom>');
      assert.strictEqual(html('foo\n[x]: /u', 0, 3), '<p>foo</p>\n[x]: /u');
      // A table's delimiter row after N (N would be its header row), at the top level.
      assert.strictEqual(html('foo\na | b\n--|--', 0, 3), '<p>foo</p>\na | b\n--|--');
    });

    test('MD-019: the paragraph goes on to a setext underline after N (code review of SELEC-00151)', () => {
      const html = (text: string, start: number, end: number): string => run('MD-019', text, { ranges: [span(start, end)] });
      // The paragraph was a heading as a whole (`foo bar`, an h2). It is split in any case, and its rest
      // stays that heading (`bar`, an h2): closer to how it was shown than raw HTML text in the block
      // (`<p>foo</p>\nbar\n---` before). Unlike MD-004..006/015 and MD-023, which leave a setext
      // heading as before, since they do not split the paragraph.
      assert.strictEqual(html('foo\nbar\n---', 0, 3), '<p>foo</p>\n\nbar\n---');
      assert.strictEqual(html('foo\nbar\nbaz\n===', 0, 3), '<p>foo</p>\n\nbar\nbaz\n===');
      assert.strictEqual(html('> foo\n> bar\n> ---', 2, 5), '> <p>foo</p>\n>\n> bar\n> ---');
      // N itself the underline: as before.
      assert.strictEqual(html('foo\n---', 0, 3), '<p>foo</p>\n---');
    });

    test('MD-023: the definitions go after the end of the paragraph (condition 5)', () => {
      // Before: `[a][1]\n\n[1]: u\nbar`, which split the paragraph in two.
      assert.deepStrictEqual(outcome('MD-023', '[a](u)\nbar', [span(0, 6)]), ['[a][1]\nbar\n\n[1]: u', [[0, 6]]]);
      assert.strictEqual(run('MD-023', 'x [a](u) y\nbar', { ranges: [span(2, 8)] }), 'x [a][1] y\nbar\n\n[1]: u');
      assert.strictEqual(run('MD-023', 'foo\n[a](u)\nbar\nbaz\n\nq', { ranges: [span(4, 10)] }), 'foo\n[a][1]\nbar\nbaz\n\n[1]: u\n\nq');
      assert.strictEqual(run('MD-023', '[a](u)\nbar\n# h', { ranges: [span(0, 6)] }), '[a][1]\nbar\n\n[1]: u\n# h');
      assert.strictEqual(run('MD-023', '[a](u)\r\nbar', { ranges: [span(0, 6)], eol: '\r\n' }), '[a][1]\r\nbar\r\n\r\n[1]: u');
      // Selected with the line break: the selection selects its own text only, the definitions are after the paragraph.
      assert.deepStrictEqual(outcome('MD-023', '[a](u)\nbar', [span(0, 7)]), ['[a][1]\nbar\n\n[1]: u', [[0, 7]]]);
      // Two selections in the same paragraph share one block of definitions; a cursor at the end of
      // the paragraph stays before them.
      assert.deepStrictEqual(outcome('MD-023', '[a](u)\n[b](v) x\nbar', [span(0, 6), span(7, 13), span(19, 19)]),
        ['[a][1]\n[b][2] x\nbar\n\n[1]: u\n[2]: v', [[0, 6], [7, 13], [19, 19]]]);
      // A selection on the paragraph's last line ending at its end writes them in its own edit, as before.
      assert.deepStrictEqual(outcome('MD-023', '[a](u)\n[b](v)', [span(0, 6), span(7, 13)]), ['[a][1]\n[b][2]\n\n[1]: u\n[2]: v', [[0, 6], [7, 28]]]);
    });

    test('MD-023: what is left as before (condition 5)', () => {
      // In a list item or a quote: definitions at the top level would close the container.
      assert.strictEqual(run('MD-023', '- [a](u)\n  bar', { ranges: [span(2, 8)] }), '- [a][1]\n\n[1]: u\n  bar');
      assert.strictEqual(run('MD-023', '> [a](u)\n> bar', { ranges: [span(2, 8)] }), '> [a][1]\n\n[1]: u\n> bar');
      // The paragraph is a setext heading, or what follows it is not certain (a table).
      assert.strictEqual(run('MD-023', '[a](u)\nbar\n===', { ranges: [span(0, 6)] }), '[a][1]\n\n[1]: u\nbar\n===');
      assert.strictEqual(run('MD-023', '[a](u)\nbar | x\n--- | -', { ranges: [span(0, 6)] }), '[a][1]\n\n[1]: u\nbar | x\n--- | -');
      // A blank line right after (unchanged).
      assert.strictEqual(run('MD-023', '[a](u)\n\nbar', { ranges: [span(0, 6)] }), '[a][1]\n\n[1]: u\n\nbar');
    });
  });

  suite('replaceSelections: later edits that replace text (SELEC-00152)', () => {
    /** Calls replaceSelections, checks that it made an edit, and returns its edits, ranges and the edited text. */
    const call = (text: string, ranges: readonly MdRange[], replacements: readonly (string | undefined)[], later: readonly MdEdit[]) => {
      const result = replaceSelections(text, ranges, replacements, later);
      assert.ok(result.kind === 'edit', result.kind);
      return { edits: result.edits, ranges: result.ranges, text: applied(text, result) };
    };
    const cursor = (at: number, reversed?: boolean): MdRange => ({ start: at, end: at, reversed });
    // 'cde' -> 'XY' (shift -1): 'abcdefgh' becomes 'abXYfgh', and the edit ends at 4 afterwards.
    const text = 'abcdefgh';
    const later: MdEdit[] = [{ start: 2, end: 5, text: 'XY' }];

    test('a cursor before, at the start of, inside, at the end of and after the replaced text (condition 2)', () => {
      const cases: [number, number, string][] = [
        [1, 1, 'before: stays'],
        [2, 2, 'at the start: stays before the replacement'],
        [3, 4, 'inside: moves to the end of the edit'],
        [4, 4, 'inside, right before the end: moves to the end of the edit'],
        [5, 4, 'at the end: stays at the end of the edit (shifted by -1)'],
        [7, 6, 'after: shifted by -1'],
      ];
      cases.forEach(([at, expected, label]) => {
        const result = call(text, [cursor(at)], [undefined], later);
        assert.deepStrictEqual(result.edits, [{ start: 2, end: 5, text: 'XY' }], label);
        assert.deepStrictEqual(result.ranges, [{ start: expected, end: expected, reversed: undefined }], label);
        assert.strictEqual(result.text, 'abXYfgh', label);
      });
      // All of them in one call: the edit is made once, and the cursors keep their order. The cursor at 4
      // moves too, although the edit around it was already made for the cursor at 3.
      const all = call(text, [1, 2, 3, 4, 5, 7].map((at) => cursor(at)), [], later);
      assert.deepStrictEqual(all.edits, [{ start: 2, end: 5, text: 'XY' }]);
      assert.deepStrictEqual(
        all.ranges.map(({ start, end }) => [start, end]),
        [[1, 1], [2, 2], [4, 4], [4, 4], [4, 4], [6, 6]],
      );
      // A reversed cursor that moves stays reversed.
      assert.deepStrictEqual(call(text, [cursor(3, true)], [undefined], later).ranges, [{ start: 4, end: 4, reversed: true }]);
    });

    test('later -> selection -> later, with a later edit right after the selection (condition 3)', () => {
      // 'a' -> 'PQR' (+2) before the selection; 'cd' -> 'C' starts at 2 + 2 = 4; 'ef' -> 'W' touches its end.
      const result = call(text, [{ start: 2, end: 4 }], ['C'], [{ start: 0, end: 1, text: 'PQR' }, { start: 4, end: 6, text: 'W' }]);
      assert.deepStrictEqual(result.edits, [
        { start: 0, end: 1, text: 'PQR' },
        { start: 2, end: 4, text: 'C' },
        { start: 4, end: 6, text: 'W' },
      ]);
      assert.deepStrictEqual(result.ranges, [{ start: 4, end: 5 }]);
      assert.strictEqual(result.text, 'PQRbCWgh');
      assert.strictEqual(result.text.slice(4, 5), 'C');
    });

    test('a later edit that ends where the selection starts (condition 3)', () => {
      // 'ab' -> 'Z' (-1) is made first; the selection 'c' -> 'K' then starts at 2 - 1 = 1.
      const replaced = call(text, [{ start: 2, end: 3 }], ['K'], [{ start: 0, end: 2, text: 'Z' }]);
      assert.deepStrictEqual(replaced.edits, [{ start: 0, end: 2, text: 'Z' }, { start: 2, end: 3, text: 'K' }]);
      assert.deepStrictEqual(replaced.ranges, [{ start: 1, end: 2 }]);
      assert.strictEqual(replaced.text, 'ZKdefgh');
      // Left as it is, the selection only shifts (it is not moved like a cursor inside the edit).
      const kept = call(text, [{ start: 2, end: 3, reversed: true }], [undefined], [{ start: 0, end: 2, text: 'Z' }]);
      assert.deepStrictEqual(kept.edits, [{ start: 0, end: 2, text: 'Z' }]);
      assert.deepStrictEqual(kept.ranges, [{ start: 1, end: 2, reversed: true }]);
      assert.strictEqual(kept.text, 'Zcdefgh');
      assert.strictEqual(kept.text.slice(1, 2), 'c');
    });

    test('selections and later edits in turn: the shifts add up (condition 3)', () => {
      // 'abcdefghij': 'b' -> '' (-1); 'd' -> 'DD' at 3 - 1 = 2 (+1, shift 0); the cursor at 6 is inside
      // 'fg' -> '1234' (+2, shift 2) and moves to its end 7 + 2 = 9; 'i' -> 'II' at 8 + 2 = 10.
      const result = call(
        'abcdefghij',
        [{ start: 3, end: 4 }, cursor(6), { start: 8, end: 9 }],
        ['DD', undefined, 'II'],
        [{ start: 1, end: 2, text: '' }, { start: 5, end: 7, text: '1234' }],
      );
      assert.deepStrictEqual(result.edits, [
        { start: 1, end: 2, text: '' },
        { start: 3, end: 4, text: 'DD' },
        { start: 5, end: 7, text: '1234' },
        { start: 8, end: 9, text: 'II' },
      ]);
      assert.deepStrictEqual(result.ranges, [{ start: 2, end: 4 }, { start: 9, end: 9, reversed: undefined }, { start: 10, end: 12 }]);
      assert.strictEqual(result.text, 'acDDe1234hIIj');
      assert.strictEqual(result.text.slice(2, 4), 'DD');
      assert.strictEqual(result.text.slice(5, 9), '1234');
      assert.strictEqual(result.text.slice(10, 12), 'II');
    });

    test('a later edit that starts at a cursor, right before a selection (condition 3)', () => {
      // The cursor at 2 stays before 'cd' -> 'Q' (-1); the edit is made before the selection 'e' -> 'E',
      // which then starts at 4 - 1 = 3.
      const result = call(text, [cursor(2), { start: 4, end: 5 }], [undefined, 'E'], [{ start: 2, end: 4, text: 'Q' }]);
      assert.deepStrictEqual(result.edits, [{ start: 2, end: 4, text: 'Q' }, { start: 4, end: 5, text: 'E' }]);
      assert.deepStrictEqual(result.ranges, [{ start: 2, end: 2, reversed: undefined }, { start: 3, end: 4 }]);
      assert.strictEqual(result.text, 'abQEfgh');
    });
  });

  suite('helpers', () => {
    test('code spans', () => {
      // The escaped backtick cannot open a span; the next two runs of one backtick make "` `".
      assert.deepStrictEqual(codeSpans('a `b` ``c`d`` \\`e` `f'), [[2, 5], [6, 13], [17, 20]]);
      assert.deepStrictEqual(codeSpans('`a\\`'), [[0, 4]]);
      assert.deepStrictEqual(codeSpans('```'), []);
    });

    test('inline links: nesting, titles, invalid tails', () => {
      const links = findInlineLinks('[a [b](c)](d) [e](f "g") [h](i j) [k] (l) ![m](n)');
      assert.deepStrictEqual(links.map((link) => [link.image, link.tail.destination, link.tail.title]), [
        [false, 'c', undefined],
        [false, 'f', 'g'],
        [true, 'n', undefined],
      ]);
    });

    test('line spans', () => {
      assert.deepStrictEqual(lineSpans('a\r\nb\rc\n'), [
        { start: 0, end: 1, next: 3 },
        { start: 3, end: 4, next: 5 },
        { start: 5, end: 6, next: 7 },
        { start: 7, end: 7, next: 7 },
      ]);
    });

    test('line context: text before / after an offset on its line, the line end', () => {
      const text = 'ab  \n  cd\r\n';
      const lines = new LineContext(text);
      assert.deepStrictEqual([0, 1, 2, 5, 7, 8].map((offset) => lines.textBefore(offset)), [false, true, true, false, false, true]);
      // Out of order still answers correctly.
      assert.strictEqual(lines.textBefore(1), true);
      assert.deepStrictEqual([0, 2, 5, 7, 9, 11].map((offset) => lines.textAfter(offset)), [true, false, true, true, false, false]);
      assert.deepStrictEqual([0, 3, 4, 5, 11].map((offset) => lines.lineEnd(offset)), [4, 4, 4, 9, 11]);
    });

    test('line context: text on the previous / next line', () => {
      const text = 'ab\n  \r\ncd\rx';
      const offsets = [0, 1, 3, 5, 7, 8, 10, 11];
      const lines = new LineContext(text);
      assert.deepStrictEqual(offsets.map((offset) => lines.textOnPreviousLine(offset)), [false, false, true, true, false, false, true, true]);
      // Out of order still answers correctly.
      assert.deepStrictEqual([...offsets].reverse().map((offset) => lines.textOnPreviousLine(offset)), [true, true, false, false, true, true, false, false]);
      const next = new LineContext(text);
      assert.deepStrictEqual(offsets.map((offset) => next.textOnNextLine(offset)), [false, false, true, true, true, true, false, false]);
    });

    test('forward search: remembered searches give the same answers', () => {
      const search = new ForwardSearch('aa bb  c', (c) => c === ' ');
      assert.deepStrictEqual([0, 1, 2, 3, 4, 1, 5, 7].map((from) => search.find(from)), [2, 2, 2, 5, 5, 2, 5, 8]);
    });

    test('link tails: <…> destinations stop at the matching ) and at < ; titles', () => {
      const text = '(<a b>) (<a) (<a<b>) (x "t") (x"t") (<a> \'t\')';
      const tails = new LinkTailParser(text);
      const at = (part: string) => tails.parse(text.indexOf(part));
      assert.deepStrictEqual(at('(<a b>)'), { end: 7, destination: 'a b', destinationSource: '<a b>' });
      assert.strictEqual(at('(<a)'), undefined);
      assert.strictEqual(at('(<a<b>)'), undefined);
      assert.strictEqual(at('(x "t")')?.title, 't');
      assert.strictEqual(at('(x"t")')?.destination, 'x"t"');
      assert.strictEqual(at('(<a> \'t\')')?.titleSource, '\'t\'');
    });

    test('fence languages and quote lines are one shared rule', () => {
      assert.ok(isFenceLanguage('') && isFenceLanguage('c++') && isFenceLanguage('x'.repeat(FENCE_LANGUAGE_MAX_LENGTH)));
      assert.ok(!isFenceLanguage('x'.repeat(FENCE_LANGUAGE_MAX_LENGTH + 1)) && !isFenceLanguage('a"b') && !isFenceLanguage('a b'));
      assert.deepStrictEqual(['>a', '   > a', '    > a', 'a > b'].map(isQuoteLine), [true, true, false, false]);
    });
  });

  suite('performance (large selections)', () => {
    const N = 200_000;
    const hostile: Record<string, string> = {
      stars: '*a '.repeat(N),
      underscores: '_a_'.repeat(N),
      brackets: '['.repeat(N) + ']('.repeat(N),
      images: '!['.repeat(N) + ']()'.repeat(N),
      backticks: '` ``'.repeat(N),
      parentheses: '[a]('.repeat(N),
      angles: '<a'.repeat(N),
      nested: `${'*'.repeat(N)}a${'*'.repeat(N)}`,
      urls: 'https://a.example/('.repeat(N / 4),
      spaces: `a${' '.repeat(N * 5)}b`,
      pipes: `|a|\n|-|\n${'|`|`\\|'.repeat(N / 4)}`,
    };
    // Inputs that took quadratic time before (seconds to minutes at these sizes).
    const linear: Record<string, string> = {
      // Unmatched delimiters left on the stack below every link (processEmphasis walked the whole stack).
      emphasisAndLinks: 'a *b* [c](d) '.repeat(40_000),
      emphasisAndLinksLines: Array.from({ length: 100_000 }, () => 'a *b* [c](d)').join('\n'),
      ordinary: '**bold** _it_ [l](http://x) `c` ~~s~~ text *a b '.repeat(20_000),
      // Images and links (MD-023 compared every link with every image).
      imagesAndLinks: '![a](b)[c](d) '.repeat(80_000),
      // <…> destinations without ">" (each searched to the end of the text).
      angleDestinations: '[a](<)'.repeat(160_000),
      // Nested parentheses sharing one run of spaces / destination characters.
      nestedTails: `${'[a]('.repeat(N / 2)} x${')'.repeat(N / 2)}`,
      nestedDestinations: `${'[a](b'.repeat(N / 2)}${' '.repeat(N)}x${')'.repeat(N / 2)}`,
    };
    for (const id of ['MD-003', 'MD-017', 'MD-019', 'MD-020', 'MD-021', 'MD-023']) {
      test(`${id} is linear on inputs that used to be quadratic`, function () {
        this.timeout(60_000);
        for (const [name, text] of Object.entries(linear)) {
          fast(`${id} ${name}`, 2000, () => {
            try {
              result(id, text);
            } catch (error) {
              assert.ok(error instanceof MdInputError, `${id} ${name}: ${error}`);
            }
          });
        }
      });
    }

    test('many selections on one long line (MD-014, 023, 024) are linear', function () {
      this.timeout(20_000);
      const text = 'ab'.repeat(500_000);
      const ranges = Array.from({ length: 500_000 }, (_value, i) => ({ start: 2 * i, end: 2 * i + 1 }));
      fast('MD-014', 2000, () => result('MD-014', text, { inputs: [''], ranges }));
      const spaces = ' '.repeat(1_000_000);
      const inSpaces = Array.from({ length: 200_000 }, (_value, i) => ({ start: 5 * i + 1, end: 5 * i + 2 }));
      fast('MD-024', 2000, () => {
        try {
          result('MD-024', spaces, { inputs: [''], ranges: inSpaces });
        } catch (error) {
          assert.ok(error instanceof MdInputError);
        }
      });
      const links = '[a](u) '.repeat(100_000);
      fast('MD-023', 2000, () => result('MD-023', links, { ranges: Array.from({ length: 100_000 }, (_value, i) => ({ start: 7 * i, end: 7 * i + 6 })) }));
    });

    test('many selections in one long paragraph (MD-004, MD-019, MD-023, SELEC-00151) are linear', function () {
      this.timeout(20_000);
      const text = `${'foo\n'.repeat(100_000)}2. x`;
      const ranges = Array.from({ length: 100_000 }, (_value, i) => ({ start: 4 * i, end: 4 * i + 3 }));
      fast('MD-004', 3000, () => result('MD-004', text, { ranges }));
      fast('MD-019', 3000, () => result('MD-019', text, { ranges }));
      const links = '[a](u)\n'.repeat(100_000);
      fast('MD-023', 3000, () => result('MD-023', links, { ranges: Array.from({ length: 100_000 }, (_value, i) => ({ start: 7 * i, end: 7 * i + 6 })) }));
    });

    test('many large results over the output limit are refused', function () {
      this.timeout(20_000);
      const line = 'a'.repeat(1_000_000);
      const text = Array.from({ length: 12 }, () => line).join('\n');
      const ranges = Array.from({ length: 12 }, (_value, i) => ({ start: i * (line.length + 1), end: i * (line.length + 1) + line.length }));
      fast('MD-015 12 x 1,000,000 characters', 2000, () => assert.ok(failure('MD-015', text, { ranges }).includes('longer than')));
    });

    for (const id of ['MD-017', 'MD-018', 'MD-019', 'MD-020', 'MD-021', 'MD-023', 'MD-010', 'MD-003']) {
      test(`${id} finishes quickly on hostile input`, function () {
        this.timeout(60_000);
        for (const [name, text] of Object.entries(hostile)) {
          fast(`${id} ${name}`, 2000, () => {
            try {
              result(id, text);
            } catch (error) {
              assert.ok(error instanceof MdInputError, `${id} ${name}: ${error}`);
            }
          });
        }
      });
    }
  });
});
