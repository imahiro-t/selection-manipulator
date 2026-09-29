import * as assert from 'assert';
import { YAML_MAX_ALIAS_WORK } from '../../handler/dataTransforms';
import { MAX_OUTPUT_LENGTH } from '../../handler/encodeTransforms';
import {
  codeSpans,
  escapeLinkText,
  findInlineLinks,
  githubSlug,
  lineSpans,
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

/** The document after applying a result (or `unchanged` / `info: …`). */
const applied = (text: string, result: MdResult): string => {
  if (result.kind === 'unchanged') {
    return 'unchanged';
  }
  if (result.kind === 'info') {
    return `info: ${result.message}`;
  }
  let edited = text;
  [...result.edits].sort((a, b) => b.start - a.start).forEach(({ start, end, text: value }) => {
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
      assert.strictEqual(run('MD-003', text, { ranges: [{ start: 0, end: 0 }] }), `- [A](#a)\n  - [B](#b)\n    - [C](#c)${text}`);
    });

    test('a selection is replaced with the table of contents of its headings; other lines go', () => {
      const text = 'intro\n## B\ntext\n### C\nend';
      assert.strictEqual(run('MD-003', text, { ranges: [{ start: 6, end: text.indexOf('\nend') }] }), 'intro\n- [B](#b)\n  - [C](#c)\nend');
    });

    test('repeated headings are numbered over the whole document', () => {
      const text = '# A\n# A\n## A';
      // Only the last heading is selected: it is the third "a" of the document.
      assert.strictEqual(run('MD-003', text, { ranges: [{ start: 8, end: 12 }] }), '# A\n# A\n- [A](#a-2)');
      assert.deepStrictEqual(documentHeadings(text).map(({ slug }) => slug), ['a', 'a-1', 'a-2']);
    });

    test('selections without headings are left; no headings at all informs', () => {
      assert.strictEqual(run('MD-003', 'text'), `info: ${MD_NO_HEADINGS}`);
      assert.strictEqual(run('MD-003', 'text', { ranges: [{ start: 0, end: 0 }] }), `info: ${MD_NO_HEADINGS}`);
      assert.strictEqual(run('MD-003', 'x\n# A', { ranges: [{ start: 0, end: 1 }, { start: 2, end: 5 }] }), 'x\n- [A](#a)');
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
