import * as assert from 'assert';
import { isDelimiterRow, lineSpans } from '../../handler/mdCommon';
import {
  afterHtmlBlock,
  ContinuationLines,
  freshBlock,
  htmlBlockOpenAfter,
  htmlBlockStart,
  lineContinuation,
  mayStartBlock,
  ParagraphContainer,
  ParagraphContext,
  writtenLine,
  WrittenLine,
  writtenLineChange,
  writtenLineEdit,
} from '../../handler/mdContinuation';

const TOP: ParagraphContainer = { kind: 'top' };
const QUOTE: ParagraphContainer = { kind: 'quote' };
const list = (content: number): ParagraphContainer => ({ kind: 'list', content });

/** The paragraph context of every line of `text`: 'top', 'quote', 'list:c' or '-' (not a paragraph line). */
const contexts = (text: string): string[] => {
  const spans = lineSpans(text);
  const context = new ParagraphContext(text, spans);
  return spans.map((_, k) => {
    const found = context.at(k);
    if (found === undefined) {
      return '-';
    }
    return found.kind === 'list' ? `list:${found.content}` : found.kind;
  });
};

/** What `lineContinuation` does to `line` after a paragraph line in `container`: the line it leaves, or undefined. */
const continued = (container: ParagraphContainer, line: string, nextLine?: string): string | undefined => {
  const found = lineContinuation(container, line, nextLine);
  return found === undefined ? undefined : found.insert + line.slice(found.end);
};

suite('Markdown paragraph continuation lines (mdContinuation, SELEC-00150) Test Suite', () => {
  test('mayStartBlock', () => {
    for (const c of ['#', '-', '+', '*', '_', '>', '`', '~', '<', '[', '|', '=', '0', '9']) {
      assert.ok(mayStartBlock(c), c);
    }
    for (const c of ['a', ' ', '\\', '!', '', undefined]) {
      assert.ok(!mayStartBlock(c), String(c));
    }
  });

  test('htmlBlockStart: the 7 kinds of CommonMark 0.31', () => {
    const cases: [string, number | undefined][] = [
      ['<pre>', 1], ['<PRE class="x">', 1], ['<script', 1], ['<style>a', 1], ['<textarea>', 1],
      ['<!-- c', 2], ['<?php', 3], ['<!DOCTYPE html>', 4], ['<![CDATA[x', 5],
      ['<div>', 6], ['<div class="a">', 6], ['</div>', 6], ['<DIV', 6], ['<p/>', 6], ['<table>x</table>', 6], ['<source>', 6],
      ['<custom>', 7], ['<custom-tag a="1" b=\'2\' c=3 d/>', 7], ['</span>', 7], ['<span >  ', 7], ['<x\tb>', 7],
      // Not a complete tag alone on the line, or no tag at all: no HTML block (a paragraph).
      ['<b>x</b> foo', undefined], ['<b>x</b>', undefined], ['<http://x>', undefined], ['<a href="x', undefined], ['<a b=>', undefined],
      ['<1>', undefined], ['< div>', undefined], ['<pre/>', undefined], ['<scripts>', 7], ['x <div>', undefined],
      // What JAUNIX-021 writes: text follows the first tag.
      ['<kbd>Ctrl</kbd>+<kbd>C</kbd>', undefined], ['<kbd>x</kbd>', undefined],
    ];
    for (const [line, kind] of cases) {
      assert.strictEqual(htmlBlockStart(line), kind, line);
    }
  });

  test('isDelimiterRow (shared with MD-018 / JAUNIX-015 through tableCells)', () => {
    for (const line of ['|---|', '| :-- | --: |', '--|--', ' | - | ']) {
      assert.ok(isDelimiterRow(line), line);
    }
    // An escaped `|` does not split a cell.
    for (const line of ['---', '| a |', '|--x|', '', '| |', '--\\|--']) {
      assert.ok(!isDelimiterRow(line), line);
    }
  });

  test('freshBlock: plain, escape and unsafe at the start of a block', () => {
    const plain = ['bar', '#x', '#5', '*emph*', '-x', '+x', '===', '--', '~~x~~', '`code`', '``` a ` b', '[x](y)', '[x] y', '[x]y: z', '<b>x</b> foo',
      '<http://x>', '1234567890. x', '2024 年', '\\# x'];
    for (const t of plain) {
      assert.deepStrictEqual(freshBlock(t), { kind: 'plain' }, t);
    }
    const escapes: [string, number][] = [
      ['# x', 0], ['#', 0], ['###### x', 0], ['***', 0], ['---', 0], ['___', 0], ['- - -', 0], ['* * *', 0], ['- x', 0], ['-', 0],
      ['*', 0], ['+ x', 0], ['+\tx', 0], ['> x', 0], ['>', 0], ['1. x', 1], ['12. x', 2], ['3) x', 1], ['1.', 1], ['123456789. x', 9],
    ];
    for (const [t, at] of escapes) {
      assert.deepStrictEqual(freshBlock(t), { kind: 'escape', at }, t);
    }
    for (const t of ['```', '~~~', '```js', '<div>', '<custom>', '<!-- x -->', '[x]: /u', '[^1]: note', '[x', '[a\\]b]: /u', '| a |']) {
      assert.deepStrictEqual(freshBlock(t), { kind: 'unsafe' }, t);
    }
    // A line followed by a table delimiter row.
    assert.deepStrictEqual(freshBlock('a | b', '--|--'), { kind: 'unsafe' });
    assert.deepStrictEqual(freshBlock('bar', '| - |'), { kind: 'unsafe' });
    assert.deepStrictEqual(freshBlock('bar', 'baz'), { kind: 'plain' });
  });

  test('lineContinuation: the indentation is measured from the start of the line or from the content of the list item', () => {
    // At the top level: any indentation, and none only with a backslash (the caller decides what to do with plain lines).
    assert.deepStrictEqual(lineContinuation(TOP, '  bar'), { body: 2, width: 2, end: 2, insert: '', escaped: false });
    assert.deepStrictEqual(lineContinuation(TOP, '\tbar'), { body: 1, width: 4, end: 1, insert: '', escaped: false });
    assert.deepStrictEqual(lineContinuation(TOP, 'bar'), { body: 0, width: 0, end: 0, insert: '', escaped: false });
    assert.deepStrictEqual(lineContinuation(TOP, '  12. x'), { body: 2, width: 2, end: 4, insert: '12\\', escaped: true });
    assert.deepStrictEqual(lineContinuation(TOP, '    - x'), { body: 4, width: 4, end: 4, insert: '\\', escaped: true });
    assert.strictEqual(lineContinuation(TOP, ''), undefined);
    assert.strictEqual(lineContinuation(TOP, '   '), undefined);
    // In a list item whose content starts at column 2: `  - x` and `    - x` (relative 0 and 2) start
    // a nested list that interrupts the paragraph; `      - x` (relative 4) is a continuation line.
    assert.strictEqual(continued(list(2), '  - x'), undefined);
    assert.strictEqual(continued(list(2), '    - x'), undefined);
    assert.strictEqual(continued(list(2), '      - x'), '\\- x');
    assert.strictEqual(continued(list(2), '  2. x'), '2\\. x');
    assert.strictEqual(continued(list(2), '  bar'), 'bar');
    // Lazy lines (less indented than the content): any list item starts a new list.
    assert.strictEqual(continued(list(3), '2. x'), undefined);
    assert.strictEqual(continued(list(2), '*'), undefined);
    assert.strictEqual(continued(list(2), ' bar'), 'bar');
    assert.strictEqual(continued(list(6), '    - x'), '\\- x');
  });

  test('lineContinuation: what interrupts the paragraph is not a continuation line', () => {
    const interrupting = ['# x', '- x', '* x', '+ x', '1. x', '01. x', '> x', '---', '***', '===', '-', '```', '~~~', '<div>', '<!-- c', '<pre>'];
    for (const t of interrupting) {
      for (const indent of ['', ' ', '   ']) {
        assert.strictEqual(continued(TOP, indent + t), undefined, JSON.stringify(indent + t));
      }
    }
    // Not certain: a table, a possible definition.
    for (const t of ['| a |', '[x]: /u', '[x']) {
      assert.strictEqual(continued(TOP, `  ${t}`), undefined, t);
    }
    // Not interrupting: an ordered item not starting with 1, an empty item, a kind 7 tag (unsafe, so not kept either).
    assert.strictEqual(continued(TOP, '2. x'), '2\\. x');
    assert.strictEqual(continued(TOP, '*'), '\\*');
    assert.strictEqual(continued(TOP, '+'), '\\+');
    assert.strictEqual(continued(TOP, '1.'), '1\\.');
    assert.strictEqual(continued(TOP, '  <custom>'), undefined);
    assert.strictEqual(continued(TOP, '  [x](y) z'), '[x](y) z');
    // 4 columns or more: always a continuation line; kept when it can be.
    assert.strictEqual(continued(TOP, '    # x'), '\\# x');
    assert.strictEqual(continued(TOP, '    ```'), undefined);
    assert.strictEqual(continued(TOP, '    | a |'), undefined);
    assert.strictEqual(continued(TOP, '    bar', '| - |'), undefined);
    // After a quote line: a line with `>` stays in the quote; a lazy line, like a lazy list line.
    assert.strictEqual(continued(QUOTE, '> bar'), undefined);
    assert.strictEqual(continued(QUOTE, '   > bar'), undefined);
    assert.strictEqual(continued(QUOTE, '    > bar'), '\\> bar');
    assert.strictEqual(continued(QUOTE, '  bar'), 'bar');
    assert.strictEqual(continued(QUOTE, '2. x'), undefined);
    assert.strictEqual(continued(QUOTE, '<custom>'), undefined);
  });

  test('ParagraphContext: paragraph lines at the top level, in a list item and in a quote', () => {
    assert.deepStrictEqual(contexts('foo\n    bar\n\n    code\nbaz'), ['top', 'top', '-', '-', 'top']);
    assert.deepStrictEqual(contexts('# A\nfoo\n===\n***\n---'), ['-', 'top', '-', '-', '-']);
    assert.deepStrictEqual(contexts('- foo\n  bar\nbaz\n\n  qux\n\nend'), ['list:2', 'list:2', 'list:2', '-', 'list:2', '-', 'top']);
    assert.deepStrictEqual(contexts('1.  foo\n- bar\n2. x'), ['list:4', 'list:2', 'list:3']);
    assert.deepStrictEqual(contexts('foo\n2. x\n* \n1. y'), ['top', 'top', 'top', 'list:3']);
    assert.deepStrictEqual(contexts('> foo\n>     bar\nbaz\n>\n>     code\nqux'), ['quote', 'quote', 'quote', '-', '-', 'top']);
    assert.deepStrictEqual(contexts('> foo\n\nbar'), ['quote', '-', 'top']);
    assert.deepStrictEqual(contexts('<b>x</b> foo\n<custom>\nbar'), ['top', 'top', 'top']);
    assert.deepStrictEqual(contexts('[x](y) z\n[x]: /u'), ['top', 'top']);
  });

  test('ParagraphContext: fences, HTML blocks, tables and definitions are not paragraph lines', () => {
    assert.deepStrictEqual(contexts('```\nfoo\n```\nbar'), ['-', '-', '-', 'top']);
    assert.deepStrictEqual(contexts('~~~~\nfoo\n~~~\n~~~~\nbar'), ['-', '-', '-', '-', 'top']);
    // Kind 1 to 5 up to their end condition, kinds 6 and 7 up to a blank line.
    assert.deepStrictEqual(contexts('<pre>\n\nfoo\n</pre>\nbar'), ['-', '-', '-', '-', 'top']);
    assert.deepStrictEqual(contexts('<!-- a\n\nb -->\nbar'), ['-', '-', '-', 'top']);
    assert.deepStrictEqual(contexts('<!-- a -->\nbar'), ['-', 'top']);
    assert.deepStrictEqual(contexts('<?x\n?>\nbar'), ['-', '-', 'top']);
    assert.deepStrictEqual(contexts('<!X\n>\nbar'), ['-', '-', 'top']);
    assert.deepStrictEqual(contexts('<![CDATA[\n]]>\nbar'), ['-', '-', 'top']);
    assert.deepStrictEqual(contexts('<div>\nfoo\n\nbar'), ['-', '-', '-', 'top']);
    assert.deepStrictEqual(contexts('<custom>\nfoo\n\nbar'), ['-', '-', '-', 'top']);
    // A table (its header row), a possible definition: up to a blank line.
    assert.deepStrictEqual(contexts('a | b\n--|--\nc | d\n\nbar'), ['-', '-', '-', '-', 'top']);
    assert.deepStrictEqual(contexts('[x]:\n/u\n\nbar'), ['-', '-', '-', 'top']);
  });

  test('ParagraphContext: what is not certain in a container, up to a line at column 0 after a blank line', () => {
    assert.deepStrictEqual(contexts('> - foo\n  bar\n\nbaz'), ['-', '-', '-', 'top']);
    assert.deepStrictEqual(contexts('- - foo\n    bar\n\n  x\n\nbaz'), ['-', '-', '-', '-', '-', 'top']);
    assert.deepStrictEqual(contexts('-     foo\n      bar'), ['-', '-']);
    assert.deepStrictEqual(contexts('-\n  foo'), ['-', '-']);
    assert.deepStrictEqual(contexts('-\tfoo\n  bar'), ['-', '-']);
    assert.deepStrictEqual(contexts('- *a* b\n  c'), ['-', '-']);
    assert.deepStrictEqual(contexts('- foo\n  ```\n  bar\n  ```\n\nbaz'), ['list:2', '-', '-', '-', '-', 'top']);
    assert.deepStrictEqual(contexts('> foo\n> - x\n> bar'), ['quote', '-', '-']);
    assert.deepStrictEqual(contexts('>   - x\n> bar'), ['-', '-']);
    assert.deepStrictEqual(contexts('>\tfoo'), ['-']);
    assert.deepStrictEqual(contexts('- foo\n===\nbar'), ['list:2', '-', '-']);
  });

  test('ContinuationLines.indentPrefix: the indentation exactly as wide as a list item\'s content', () => {
    const lines = new ContinuationLines('- a\n      bar\n  \tbaz\n\t  q\nx\n  ');
    assert.strictEqual(lines.indentPrefix(1, 2), '  ');
    assert.strictEqual(lines.indentPrefix(2, 4), '  \t');
    assert.strictEqual(lines.indentPrefix(2, 2), '  ');
    // A tab that goes past the column, too little indentation, a line of spaces only.
    assert.strictEqual(lines.indentPrefix(3, 2), undefined);
    assert.strictEqual(lines.indentPrefix(4, 2), undefined);
    assert.strictEqual(lines.indentPrefix(5, 2), '  ');
    assert.strictEqual(lines.indentPrefix(4, 0), '');
  });

  test('ContinuationLines.restIsPlain: up to the end of the paragraph', () => {
    const lines = new ContinuationLines('foo\n2. x\nbar\n\n3. y\nfoo\n2. x\n> y\nz');
    assert.ok(lines.restIsPlain(2));
    assert.ok(lines.restIsPlain(3));
    assert.ok(!lines.restIsPlain(4));
    assert.ok(!lines.restIsPlain(7));
    assert.ok(lines.restIsPlain(8));
    assert.ok(lines.restIsPlain(9));
  });

  test('ContinuationLines: a later line of the paragraph that may start a block, after a list item or a quote line', () => {
    const at = (text: string, n: number): string | undefined => {
      const found = new ContinuationLines(text).at(n);
      return found === undefined ? undefined : `${found.container.kind}:${text.slice(found.body, found.end)}|${found.insert}`;
    };
    assert.strictEqual(at('- foo\n    bar\n    baz', 1), 'list:|');
    assert.strictEqual(at('- foo\n    bar\n    - baz', 1), undefined);
    assert.strictEqual(at('> foo\n    bar\n> baz', 1), undefined);
    assert.strictEqual(at('> foo\n    bar\n\n> baz', 1), 'quote:|');
    // At the top level, the later lines go on as they were (no check).
    assert.strictEqual(at('foo\n    bar\n    - baz', 1), 'top:|');
    assert.strictEqual(at('foo\n2. x', 1), 'top:2|2\\');
    // The first line, past the last line, and after a line that is not a paragraph line.
    assert.strictEqual(at('foo', 0), undefined);
    assert.strictEqual(at('foo\n bar', 2), undefined);
    assert.strictEqual(at('# A\n    bar', 1), undefined);
  });

  test('writtenLineEdit: a line indented into the content of the list item written', () => {
    /** The edit of N (`line`, after the top-level paragraph line L) after `written` in place of L. */
    const edit = (written: string, line: string) => {
      const how = writtenLine(written);
      const found = lineContinuation(TOP, line);
      assert.ok(how !== undefined, written);
      return found === undefined ? 'not a continuation line' : writtenLineEdit(how, found, line.slice(found.body));
    };
    // In the item (content 2), 3 columns or less from its content: a text that interrupts a paragraph gets a backslash.
    assert.deepStrictEqual(edit('- foo', '    - x'), { at: 0, insert: '\\' });
    assert.deepStrictEqual(edit('- foo', '     1. x'), { at: 1, insert: '1\\' });
    assert.deepStrictEqual(edit('1. foo', '    # x'), { at: 0, insert: '\\' });
    assert.deepStrictEqual(edit('- foo', '    ---'), { at: 0, insert: '\\' });
    assert.deepStrictEqual(edit('- foo', '    ==='), { at: 0, insert: '\\' });
    // Not interrupting, or 4 columns or more from the content: no edit.
    assert.strictEqual(edit('- foo', '    2. x'), undefined);
    assert.strictEqual(edit('- foo', '    *'), undefined);
    assert.strictEqual(edit('- foo', '      - x'), undefined);
    // A fence or an HTML block (`freshBlock` unsafe) is not taken as a continuation line to change at all.
    assert.strictEqual(edit('- foo', '    ~~~'), 'not a continuation line');
    assert.strictEqual(edit('- foo', '    <pre>'), 'not a continuation line');
    // After a quote line, a line indented by 4 columns or more stays a lazy continuation line.
    assert.strictEqual(edit('> foo', '    - x'), undefined);
    // Less indented than the content: only a list item, as before this round.
    assert.deepStrictEqual(edit('1. foo', '2. x'), { at: 1, insert: '2\\' });
    assert.strictEqual(edit('1. foo', '#x'), undefined);
    // After a heading: N's own edit.
    assert.deepStrictEqual(edit('# foo', '    - x'), { at: 0, insert: '\\' });
    assert.deepStrictEqual(edit('# foo', '    bar'), { at: 0, insert: '' });
  });

  test('ParagraphContext and ContinuationLines read the lines forward once (linear)', () => {
    const text = 'foo\n    bar\n'.repeat(50000);
    const started = Date.now();
    const lines = new ContinuationLines(text);
    for (let n = 1; n < 100000; n += 2) {
      assert.ok(lines.at(n) !== undefined);
    }
    const quoted = '> foo\n    bar\n'.repeat(50000);
    const quoteLines = new ContinuationLines(quoted);
    for (let n = 1; n < 100000; n += 2) {
      // The next line has `>`: a later line of the paragraph that may start a block.
      quoteLines.at(n);
    }
    const elapsed = Date.now() - started;
    assert.ok(elapsed < 3000, `${elapsed} ms`);
  });
  test('ParagraphContext: a task list item is judged by the text after its checkbox (SELEC-00151)', () => {
    assert.deepStrictEqual(contexts('- [ ] foo\n    bar'), ['list:2', 'list:2']);
    assert.deepStrictEqual(contexts('- [x] foo\n  bar'), ['list:2', 'list:2']);
    assert.deepStrictEqual(contexts('- [X] foo'), ['list:2']);
    assert.deepStrictEqual(contexts('1. [ ] foo\n   bar'), ['list:3', 'list:3']);
    assert.deepStrictEqual(contexts('* [ ]  foo'), ['list:2']);
    // A tab after the checkbox: the content column depends on the marker and the spaces after it only.
    assert.deepStrictEqual(contexts('- [ ]\tfoo\n  bar'), ['list:2', 'list:2']);
    // As before: an empty task item, a text that may start a block after the checkbox, a possible
    // definition (`[x]:` is no checkbox), a tab after the marker.
    assert.deepStrictEqual(contexts('- [ ]\n  bar'), ['-', '-']);
    assert.deepStrictEqual(contexts('- [ ] # x\n  bar'), ['-', '-']);
    assert.deepStrictEqual(contexts('- [ ] > x'), ['-']);
    assert.deepStrictEqual(contexts('- [x]: foo\n  bar'), ['-', '-']);
    assert.deepStrictEqual(contexts('-\t[ ] foo\n  bar'), ['-', '-']);
    // In a quote or nested: not a container this module judges (as before).
    assert.deepStrictEqual(contexts('> - [ ] foo\n>   bar'), ['-', '-']);
  });

  test('writtenLineChange: none, an edit, or unsafe (SELEC-00151)', () => {
    const change = (written: WrittenLine, line: string) => {
      const found = lineContinuation(TOP, line);
      assert.ok(found !== undefined, line);
      return writtenLineChange(written, found, line.slice(found.body));
    };
    const item: WrittenLine = { kind: 'lazy', content: 2 };
    assert.strictEqual(change(item, 'bar'), 'none');
    assert.strictEqual(change(item, '    2. x'), 'none');
    assert.deepStrictEqual(change(item, '2. x'), { at: 1, insert: '2\\' });
    assert.deepStrictEqual(change(item, '    - x'), { at: 0, insert: '\\' });
    assert.strictEqual(change({ kind: 'block' }, '  bar'), 'none');
    assert.deepStrictEqual(change({ kind: 'block' }, '    bar'), { at: 0, insert: '' });
  });

  test('ContinuationLines.writtenEdits: every later line of the paragraph after a list item or a quote line (SELEC-00151)', () => {
    /** The lines changed (as `line:insert`) after `written` in place of line 0 of `text`, from line `n`. */
    const edits = (text: string, written: string, n = 1): string[] | undefined => {
      const how = writtenLine(written);
      assert.ok(how !== undefined && how.kind === 'lazy', written);
      const found = new ContinuationLines(text).writtenEdits(n, how);
      return found?.map((edit) => `${edit.line}:${text.slice(edit.start, edit.end)}>${edit.insert}`);
    };
    assert.deepStrictEqual(edits('foo\nbar\n2. x', '- foo'), ['2:2>2\\']);
    assert.deepStrictEqual(edits('foo\n2. x\n3. y', '1. foo'), ['1:2>2\\', '2:3>3\\']);
    assert.deepStrictEqual(edits('foo\nbar\n    - x', '- foo'), ['2:>\\']);
    assert.deepStrictEqual(edits('foo\nbar', '- foo'), []);
    assert.deepStrictEqual(edits('foo\n2. x\n\n3. y', '1. foo'), ['1:2>2\\']);
    // After a quote: a list item at 3 columns or less only; `    - x` stays a lazy continuation line.
    assert.deepStrictEqual(edits('foo\nbar\n    - x', '> foo'), []);
    assert.deepStrictEqual(edits('foo\nbar\n  *', '> foo'), ['2:>\\']);
    // What ends the paragraph would be read differently, or a line cannot be kept: undefined.
    assert.strictEqual(edits('foo\n2. x\n> y', '> foo'), undefined);
    assert.strictEqual(edits('foo\n2. x\n===', '- foo'), undefined);
    assert.strictEqual(edits('foo\n2. x\n  # y', '- foo'), undefined);
    assert.strictEqual(edits('foo\n2. x\n    ```', '- foo'), undefined);
    assert.strictEqual(edits('foo\n2. x\nbar | x\n--- | -', '- foo'), undefined);
    // A block that still interrupts the paragraph after the item written ends it as before.
    assert.deepStrictEqual(edits('foo\n2. x\n- y', '- foo'), ['1:2>2\\']);
    assert.deepStrictEqual(edits('foo\n2. x\n> y', '- foo'), ['1:2>2\\']);
    // A later N in the same paragraph reuses the walk: only the lines from N on.
    const lines = new ContinuationLines('a\nb\n2. x\nc\n3. y');
    const item = writtenLine('- a');
    assert.ok(item !== undefined && item.kind === 'lazy');
    assert.deepStrictEqual(lines.writtenEdits(1, item)?.map((edit) => edit.line), [2, 4]);
    assert.deepStrictEqual(lines.writtenEdits(3, item)?.map((edit) => edit.line), [4]);
    assert.deepStrictEqual(lines.writtenEdits(4, item)?.map((edit) => edit.line), [4]);
  });

  test('ContinuationLines.topParagraphEnd: where the paragraph of a line ends (SELEC-00151)', () => {
    const end = (text: string, k: number): number | undefined => new ContinuationLines(text).topParagraphEnd(k);
    assert.strictEqual(end('foo\nbar\nbaz\n\nq', 0), 11);
    assert.strictEqual(end('foo\nbar\nbaz\n\nq', 1), 11);
    assert.strictEqual(end('foo\nbar\n# h', 0), 7);
    assert.strictEqual(end('foo', 0), 3);
    assert.strictEqual(end('foo\n<custom>\n[x]: y', 0), 19);
    // Not a paragraph line at the top level, a setext heading, a table: undefined.
    assert.strictEqual(end('- foo\n  bar', 0), undefined);
    assert.strictEqual(end('> foo\n> bar', 0), undefined);
    assert.strictEqual(end('foo\nbar\n===', 0), undefined);
    assert.strictEqual(end('foo\nbar | x\n--- | -', 0), undefined);
    assert.strictEqual(end('# h\nfoo', 0), undefined);
  });

  test('ContinuationLines.interruptingLine: a one-line block indented by 1 to 3 columns (SELEC-00151)', () => {
    const at = (text: string): string | undefined => {
      const found = new ContinuationLines(text).interruptingLine(1);
      return found === undefined ? undefined : `${found.width}:${text.slice(found.body)}`;
    };
    assert.strictEqual(at('foo\n  # x'), '2:# x');
    assert.strictEqual(at('foo\n # x'), '1:# x');
    assert.strictEqual(at('foo\n   ***'), '3:***');
    assert.strictEqual(at('foo\n  - - -'), '2:- - -');
    assert.strictEqual(at('foo\n  > x'), '2:> x');
    // Not indented, indented by 4 columns or more, other blocks, a setext underline, not after a
    // paragraph line at the top level.
    for (const text of ['foo\n# x', 'foo\n\t# x', 'foo\n  - x', 'foo\n  1. x', 'foo\n  ```', 'foo\n  <div>', 'foo\n  ---', 'foo\n  ===',
      'foo\n  bar', '- foo\n  # x', '> foo\n  # x', '# A\n  # x']) {
      assert.strictEqual(at(text), undefined, JSON.stringify(text));
    }
  });

  test('ContinuationLines.lazyListAfter: a list item that interrupted a lazy paragraph only as a lazy line (SELEC-00151)', () => {
    const at = (text: string): string | undefined => {
      const found = new ContinuationLines(text).lazyListAfter(1);
      return found === undefined ? undefined : `${found.found.container.kind}:${text.slice(found.before)}`;
    };
    assert.strictEqual(at('> foo\nbar\n2. x'), 'quote:2. x');
    assert.strictEqual(at('> foo\nbar\nbaz\n*'), 'quote:*');
    assert.strictEqual(at('- foo\nbar\n2. x'), 'list:2. x');
    assert.strictEqual(at('- foo\n  bar\n2. x'), 'list:2. x');
    // It would interrupt the paragraph at the top level too, it is in the container, a later line
    // may start a block, the paragraph ends first, or L is at the top level: undefined.
    for (const text of ['> foo\nbar\n1. x', '> foo\nbar\n- x', '> foo\nbar\n> 2. x', '- foo\nbar\n  2. x', '> foo\nbar\n#x\n2. x',
      '> foo\nbar\n\n2. x', '> foo\nbar', 'foo\nbar\n2. x']) {
      assert.strictEqual(at(text), undefined, JSON.stringify(text));
    }
  });

  test('htmlBlockOpenAfter and afterHtmlBlock (MD-019, SELEC-00151)', () => {
    assert.ok(htmlBlockOpenAfter('<p>foo</p>'));
    assert.ok(htmlBlockOpenAfter('<h1>a</h1>\n<p>b</p>'));
    assert.ok(htmlBlockOpenAfter('<ul>\n<li>a</li>\n</ul>'));
    assert.ok(!htmlBlockOpenAfter('<pre><code>x\n</code></pre>'));
    assert.ok(htmlBlockOpenAfter('<pre><code>x'));
    assert.ok(!htmlBlockOpenAfter('<p>a</p>\n'));
    assert.ok(!htmlBlockOpenAfter('foo'));
    assert.ok(!htmlBlockOpenAfter('<custom>'));
    assert.ok(!htmlBlockOpenAfter('    <p>a</p>'));
    /** N (`line`) after the blank line, as `keep`, the line it becomes, or undefined. */
    const after = (line: string, marker?: string): string | undefined => {
      const change = afterHtmlBlock(line, undefined, marker);
      return change === undefined || change === 'keep' ? change : line.slice(0, change.start) + change.insert + line.slice(change.end);
    };
    // At the top level.
    assert.strictEqual(after('bar'), 'keep');
    assert.strictEqual(after('  bar'), 'keep');
    assert.strictEqual(after('    bar'), 'bar');
    assert.strictEqual(after('2. x'), '2\\. x');
    assert.strictEqual(after('    - x'), '\\- x');
    assert.strictEqual(after('# x'), 'keep');
    assert.strictEqual(after('- x'), 'keep');
    assert.strictEqual(after('```'), 'keep');
    assert.strictEqual(after('==='), undefined);
    assert.strictEqual(after('---'), undefined);
    assert.strictEqual(after('    <div>'), undefined);
    assert.strictEqual(after('<custom>'), undefined);
    assert.strictEqual(after('[x]: /u'), undefined);
    // In a quote: a line with `>`, and a lazy line.
    assert.strictEqual(after('> bar', '>'), 'keep');
    assert.strictEqual(after('>     bar', '>'), '> bar');
    assert.strictEqual(after('> 2. x', '>'), '> 2\\. x');
    assert.strictEqual(after('> # x', '>'), 'keep');
    assert.strictEqual(after('>bar', '>'), 'keep');
    assert.strictEqual(after('  > bar', '  >'), 'keep');
    assert.strictEqual(after('>', '>'), undefined);
    assert.strictEqual(after('>\tbar', '>'), undefined);
    assert.strictEqual(after('>  \tbar', '>'), undefined);
    assert.strictEqual(after('bar', '>'), '> bar');
    assert.strictEqual(after('  bar', '  >'), '  > bar');
    assert.strictEqual(after('# x', '>'), 'keep');
    assert.strictEqual(after('2. x', '>'), 'keep');
    assert.strictEqual(after('    bar', '>'), undefined);
    assert.strictEqual(after('#x', '>'), undefined);
  });

  test('ContinuationLines.writtenEdits reads a long paragraph once for many selections (linear)', () => {
    const text = `foo\n${'bar\n'.repeat(100000)}2. x`;
    const lines = new ContinuationLines(text);
    const item = writtenLine('- foo');
    assert.ok(item !== undefined && item.kind === 'lazy');
    const started = Date.now();
    for (let n = 1; n <= 100000; n++) {
      assert.strictEqual(lines.writtenEdits(n, item)?.length, 1);
    }
    const elapsed = Date.now() - started;
    assert.ok(elapsed < 3000, `${elapsed} ms`);
  });
});
