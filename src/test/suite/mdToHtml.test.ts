import * as assert from 'assert';
import { safeUrl } from '../../handler/mdInline';
import { MD_HTML_MAX_DEPTH, mdToHtml } from '../../handler/mdToHtml';

const html = (markdown: string): string => mdToHtml(markdown, '\n');

const fast = (label: string, ms: number, fn: () => unknown): void => {
  const started = Date.now();
  fn();
  const elapsed = Date.now() - started;
  assert.ok(elapsed < ms, `${label}: ${elapsed} ms`);
};

suite('Markdown to HTML (MD-019) Test Suite', () => {

  suite('the subset', () => {
    test('ATX headings (closing sequence removed) and paragraphs (lines kept, blank lines separate)', () => {
      assert.strictEqual(html('# a #\n###### b\n####### c\n\nline 1\n  line 2\n\nnext'),
        '<h1>a</h1>\n<h6>b</h6>\n<p>####### c</p>\n<p>line 1\nline 2</p>\n<p>next</p>');
    });

    test('emphasis, strong, strikethrough, inline code, backslash escapes', () => {
      assert.strictEqual(html('*a* _b_ **c** __d__ ***e*** ~~f~~ ~g~ `h *i*` \\*j\\* snake_case_x'),
        '<p><em>a</em> <em>b</em> <strong>c</strong> <strong>d</strong> <em><strong>e</strong></em> <del>f</del> ~g~ <code>h *i*</code> *j* snake_case_x</p>');
      assert.strictEqual(html('**a *b* c**'), '<p><strong>a <em>b</em> c</strong></p>');
      assert.strictEqual(html('`` a`b ``'), '<p><code>a`b</code></p>');
    });

    test('links, images, autolinks, titles', () => {
      assert.strictEqual(html('[a *b*](https://x.example "T") ![alt *x*](i.png) <https://y.example>'),
        '<p><a href="https://x.example" title="T">a <em>b</em></a> <img src="i.png" alt="alt x" /> <a href="https://y.example">https://y.example</a></p>');
      assert.strictEqual(html('[![badge](b.svg)](https://z.example)'), '<p><a href="https://z.example"><img src="b.svg" alt="badge" /></a></p>');
      assert.strictEqual(html('[a [b](c)](d)'), '<p>[a <a href="c">b</a>](d)</p>');
      assert.strictEqual(html('[a](<b c>)'), '<p><a href="b c">a</a></p>');
    });

    test('fenced code blocks: language class, content escaped, unclosed fence', () => {
      assert.strictEqual(html('```js\n<a> & "b"\n\n```\n~~~\nx\n'), '<pre><code class="language-js">&lt;a&gt; &amp; &quot;b&quot;\n\n</code></pre>\n<pre><code>x\n</code></pre>\n');
      assert.strictEqual(html('```\n```'), '<pre><code></code></pre>');
    });

    test('lists: bullet, ordered with start, nested, loose', () => {
      assert.strictEqual(html('- a\n- b\n  1. c\n  2. d\n\n3) e\n4) f'),
        '<ul>\n<li>a</li>\n<li>b\n<ol>\n<li>c</li>\n<li>d</li>\n</ol>\n</li>\n</ul>\n<ol start="3">\n<li>e</li>\n<li>f</li>\n</ol>');
      assert.strictEqual(html('* a\n\n* b'), '<ul>\n<li>\n<p>a</p>\n</li>\n<li>\n<p>b</p>\n</li>\n</ul>');
      assert.strictEqual(html('- a\n+ b'), '<ul>\n<li>a</li>\n</ul>\n<ul>\n<li>b</li>\n</ul>');
    });

    test('tight / loose: only blank lines between the items or between the blocks directly in an item count', () => {
      // The blank line is inside the nested item "c": the inner list is loose, the outer one tight.
      assert.strictEqual(html('3. a\n4. b\n   - c\n\n     d\n5. e'),
        '<ol start="3">\n<li>a</li>\n<li>b\n<ul>\n<li>\n<p>c</p>\n<p>d</p>\n</li>\n</ul>\n</li>\n<li>e</li>\n</ol>');
      // A blank line between two nested items makes only the nested list loose.
      assert.strictEqual(html('- a\n  - b\n\n  - c'), '<ul>\n<li>a\n<ul>\n<li>\n<p>b</p>\n</li>\n<li>\n<p>c</p>\n</li>\n</ul>\n</li>\n</ul>');
      // A blank line between two blocks directly in an item makes the list loose.
      assert.strictEqual(html('- a\n\n  b\n- c'), '<ul>\n<li>\n<p>a</p>\n<p>b</p>\n</li>\n<li>\n<p>c</p>\n</li>\n</ul>');
      // A blank line inside a fenced code block in an item does not.
      assert.strictEqual(html('- a\n  ```\n  x\n\n  y\n  ```\n- b'), '<ul>\n<li>a\n<pre><code>x\n\ny\n</code></pre>\n</li>\n<li>b</li>\n</ul>');
    });

    test('block quotes (nested, lazy continuation) and thematic breaks', () => {
      assert.strictEqual(html('> a\nb\n> > c\n\n***\n- - -'),
        '<blockquote>\n<p>a\nb</p>\n<blockquote>\n<p>c</p>\n</blockquote>\n</blockquote>\n<hr />\n<hr />');
    });

    test('outside the subset: paragraph text (setext, tables, reference links, footnotes, indented code)', () => {
      assert.strictEqual(html('Title\n===\nSub\n---'), '<p>Title\n===\nSub\n---</p>');
      assert.strictEqual(html('|a|b|\n|-|-|'), '<p>|a|b|\n|-|-|</p>');
      assert.strictEqual(html('[a][1] [^1]\n\n[1]: https://x'), '<p>[a][1] [^1]</p>\n<p>[1]: https://x</p>');
    });

    test('line breaks: the document\'s (CRLF), trailing line break kept', () => {
      assert.strictEqual(mdToHtml('# a\r\n**b**\r\nc\r\n\r\n```\r\nx\r\n```\r\n', '\r\n'),
        '<h1>a</h1>\r\n<p><strong>b</strong>\r\nc</p>\r\n<pre><code>x\r\n</code></pre>\r\n');
    });
  });

  suite('safety', () => {
    test('raw HTML is escaped, never passed through', () => {
      assert.strictEqual(html('<script>alert(1)</script>\n<img src=x onerror=alert(1)>'),
        '<p>&lt;script&gt;alert(1)&lt;/script&gt;\n&lt;img src=x onerror=alert(1)&gt;</p>');
      assert.strictEqual(html('# <b>"x" & \'y\''), '<h1>&lt;b&gt;&quot;x&quot; &amp; &#39;y&#39;</h1>');
    });

    test('javascript:, vbscript:, data: and file: URLs are replaced with #', () => {
      for (const url of ['javascript:alert(1)', 'JavaScript:alert(1)', ' javascript:x', 'java\tscript:x', 'vbscript:x', 'data:text/html,x', 'file:///etc/passwd', 'javascript\\:x']) {
        const out = html(`[a](<${url}>) ![b](<${url}>)`);
        assert.ok(!/(?:href|src)="(?!#")/.test(out), `${url}: ${out}`);
      }
      assert.strictEqual(html('<javascript:alert(1)>'), '<p><a href="#">javascript:alert(1)</a></p>');
      assert.strictEqual(safeUrl('https://x.example'), 'https://x.example');
      assert.strictEqual(safeUrl('\u0000java​script:x'), '#');
      assert.strictEqual(safeUrl('/relative/javascript:x'), '/relative/javascript:x');
    });

    test('attribute values are escaped: no way out of href / src / alt / title / class', () => {
      assert.strictEqual(html('[a](x"onmouseover="y) ![b"c](i.png \'t"\')'),
        '<p><a href="x&quot;onmouseover=&quot;y">a</a> <img src="i.png" alt="b&quot;c" title="t&quot;" /></p>');
      assert.strictEqual(html('```js" onclick="x\ny\n```'), '<pre><code>y\n</code></pre>');
      assert.strictEqual(html('```c++ extra\ny\n```'), '<pre><code class="language-c++">y\n</code></pre>');
    });
  });

  suite('limits and performance', () => {
    test(`quotes and lists deeper than ${MD_HTML_MAX_DEPTH} levels become paragraph text`, () => {
      const out = html(`${'>'.repeat(MD_HTML_MAX_DEPTH + 5)} a`);
      assert.strictEqual(out.split('<blockquote>').length - 1, MD_HTML_MAX_DEPTH + 1);
      assert.ok(out.includes('<p>&gt;&gt;&gt;&gt; a</p>'), out);
    });

    test('hostile inputs finish within 2 seconds each', function () {
      this.timeout(60_000);
      const N = 200_000;
      const inputs = [
        '*a '.repeat(N),
        '_'.repeat(N),
        `${'*'.repeat(N)}a${'*'.repeat(N)}`,
        '*a **b '.repeat(N / 2),
        '['.repeat(N) + '](x)'.repeat(N),
        '!['.repeat(N) + '](x)'.repeat(N),
        '[!['.repeat(N / 2) + '](x)'.repeat(N),
        '`'.repeat(N),
        '` `` ```'.repeat(N / 4),
        '<a'.repeat(N),
        '<https://'.repeat(N / 4),
        '[a]('.repeat(N),
        '>'.repeat(N),
        Array.from({ length: 3000 }, (_value, i) => `${' '.repeat(i * 2)}- a`).join('\n'),
        '- a\n'.repeat(N / 4),
        '> a\n'.repeat(N / 4),
        '```\n'.repeat(N / 4),
        // Emphasis and links in one long paragraph (unmatched delimiters below every link).
        'a *b* [c](d) '.repeat(40_000),
        Array.from({ length: 100_000 }, () => 'a *b* [c](d)').join('\n'),
        '**bold** _it_ [l](http://x) `c` ~~s~~ text *a b '.repeat(20_000),
        '[a](<)'.repeat(160_000),
      ];
      inputs.forEach((input, i) => fast(`input ${i}`, 2000, () => html(input)));
    });

    test('deeply nested emphasis is rendered without recursion', function () {
      this.timeout(20_000);
      const depth = 50_000;
      const out = html(`${'*a '.repeat(depth)}b${' c*'.repeat(depth)}`);
      assert.strictEqual(out.split('<em>').length - 1, depth);
      assert.strictEqual(out.split('</em>').length - 1, depth);
    });
  });
});
