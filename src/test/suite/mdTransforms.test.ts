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
      assert.strictEqual(run('MD-023', text, { ranges }), '[a][1]\n\n[1]: x\n[b][1] [c][2]\n\n[2]: y\nplain');
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
      assert.strictEqual(run('MD-014', '  foo  ', { inputs: [''], ranges: [{ start: 2, end: 5 }] }), '  ```\nfoo\n```  ');
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

    test('MD-023: a selection ending inside a line puts its definitions after the end of the line', () => {
      const text = 'see [a](http://b) here';
      assert.strictEqual(run('MD-023', text, { ranges: [select(text, '[a](http://b)')] }), 'see [a][1] here\n\n[1]: http://b');
      assert.deepStrictEqual(selectedAfter('MD-023', text, { ranges: [select(text, '[a](http://b)')] }), ['[a][1]']);
      // A selection ending at the end of its line (or before trailing spaces) keeps them in the selection.
      assert.deepStrictEqual(selectedAfter('MD-023', 'see [a](u)', { ranges: [{ start: 4, end: 10 }] }), ['[a][1]\n\n[1]: u']);
      assert.strictEqual(run('MD-023', 'see [a](u)  \nnext', { ranges: [{ start: 4, end: 10 }] }), 'see [a][1]\n\n[1]: u  \nnext');
    });

    test('MD-023: selections ending on the same line share one block of definitions after it', () => {
      const text = 'x [a](u) y [b](v) z\nnext';
      const ranges = [select(text, '[a](u)'), select(text, '[b](v)')];
      assert.strictEqual(run('MD-023', text, { ranges }), 'x [a][1] y [b][2] z\n\n[1]: u\n[2]: v\nnext');
      assert.deepStrictEqual(selectedAfter('MD-023', text, { ranges }), ['[a][1]', '[b][2]']);
      // A later selection that starts on that line and ends at a line end takes the definitions.
      const across = 'x [a](u) y [b](v)\n[c](w) z';
      assert.strictEqual(run('MD-023', across, { ranges: [select(across, '[a](u)'), { start: across.indexOf('[b]'), end: across.indexOf('\n') }] }),
        'x [a][1] y [b][2]\n\n[1]: u\n[2]: v\n[c](w) z');
      // A later selection that goes on to the next lines carries them to the end of its own last line.
      assert.strictEqual(run('MD-023', across, { ranges: [select(across, '[a](u)'), { start: across.indexOf(' y'), end: across.indexOf(' z') }] }),
        'x [a][1] y [b][2]\n[c][3] z\n\n[1]: u\n[2]: v\n[3]: w');
      // Selections on different lines: each line gets its own definitions; numbers continue.
      const lines = 'p [a](u) q\nr [b](v) s';
      assert.strictEqual(run('MD-023', lines, { ranges: [select(lines, '[a](u)'), select(lines, '[b](v)')] }),
        'p [a][1] q\n\n[1]: u\nr [b][2] s\n\n[2]: v');
    });

    test('MD-023: cursors and unchanged selections around pending definitions keep their place', () => {
      const text = 'x [a](u) y\nz';
      const lineEnd = text.indexOf('\n');
      const outcome = result('MD-023', text, { ranges: [select(text, '[a](u)'), { start: lineEnd, end: lineEnd }, { start: text.length - 1, end: text.length }] });
      assert.ok(outcome.kind === 'edit');
      const edited = applied(text, outcome);
      assert.strictEqual(edited, 'x [a][1] y\n\n[1]: u\nz');
      // The cursor at the end of the line stays before the definitions; "z" is still selected.
      assert.strictEqual(outcome.ranges[1].start, edited.indexOf('\n'));
      assert.strictEqual(edited.slice(outcome.ranges[2].start, outcome.ranges[2].end), 'z');
      assert.strictEqual(run('MD-023', text, { ranges: [select(text, '[a](u)')], eol: '\r\n' }), 'x [a][1] y\r\n\r\n[1]: u\nz');
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
