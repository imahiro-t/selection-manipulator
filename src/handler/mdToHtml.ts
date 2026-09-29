/**
 * MD-019 Markdown: Convert to HTML, implemented without a new dependency as a subset of
 * CommonMark: ATX headings, paragraphs, bold / italic / strikethrough, inline code, fenced code
 * blocks, bullet and ordered lists (nested by indentation), block quotes, links, images,
 * thematic breaks and backslash escapes. Everything else (setext headings, tables, raw HTML,
 * reference links, footnotes, indented code blocks…) stays paragraph text.
 *
 * Safety: every text and attribute value is HTML-escaped (raw HTML is escaped, never passed
 * through); `href` / `src` with a `javascript:`, `vbscript:`, `data:` or `file:` URL become `#`;
 * the language of a code fence is only written as a class when it has letters, digits and
 * `_ + # . -` only. Block quotes and lists are nested at most `MD_HTML_MAX_DEPTH` levels (deeper
 * content is paragraph text) and the inline parser is linear (see `mdInline.ts`).
 *
 * The output uses the document's line break (LF or CRLF) between blocks, inside `<pre><code>`
 * and inside paragraphs, and ends with a line break only when the selection did.
 */
import {
  escapeHtml,
  fenceOpening,
  indentWidth,
  isBlank,
  isFenceClosing,
  isThematicBreak,
  MdEol,
  parseAtxHeading,
  parseListItem,
  splitLines,
} from './mdCommon';
import { inlineToHtml, parseInline } from './mdInline';

/** How deeply block quotes and lists may be nested; deeper content is paragraph text. */
export const MD_HTML_MAX_DEPTH = 32;

type Block =
  | { type: 'heading'; level: number; text: string }
  | { type: 'code'; language: string; lines: string[] }
  | { type: 'hr' }
  | { type: 'paragraph'; lines: string[] }
  | { type: 'quote'; children: Block[] }
  | { type: 'list'; ordered: boolean; start: number; tight: boolean; items: Block[][] };

const LANGUAGE = /^[A-Za-z0-9_+#.-]{1,50}$/;

const QUOTE_MARKER = /^ {0,3}>/;

/** Leading tabs become spaces (to the next multiple of 4), so that indentation can be sliced. */
const expandLeadingTabs = (line: string): string => {
  let end = 0;
  while (end < line.length && (line[end] === ' ' || line[end] === '\t')) {
    end++;
  }
  const whitespace = line.slice(0, end);
  return whitespace.includes('\t') ? ' '.repeat(indentWidth(whitespace)) + line.slice(end) : line;
};

const leadingWidth = (line: string): number => {
  let i = 0;
  while (i < line.length && line[i] === ' ') {
    i++;
  }
  return i;
};

/** A list item that may start a list (at most 3 spaces of indentation). */
const listStart = (line: string) => {
  const item = parseListItem(line);
  if (item === undefined || item.indent.length > 3) {
    return undefined;
  }
  return item;
};

/** Whether `line` starts a block that interrupts a paragraph. */
const interruptsParagraph = (line: string): boolean => {
  if (fenceOpening(line) !== undefined || parseAtxHeading(line) !== undefined || QUOTE_MARKER.test(line)) {
    return true;
  }
  if (isThematicBreak(line)) {
    // `---` under a paragraph line is a setext underline: outside the subset, so it stays text.
    return !/^ {0,3}-[- \t]*$/.test(line);
  }
  const item = listStart(line);
  return item !== undefined && item.rest.trim() !== '' && (!item.ordered || item.number === '1');
};

/** The same bullet character, or the same ordered delimiter. */
const sameListType = (a: { ordered: boolean; marker: string; delimiter?: string }, b: { ordered: boolean; marker: string; delimiter?: string }): boolean =>
  a.ordered === b.ordered && (a.ordered ? a.delimiter === b.delimiter : a.marker === b.marker);

const parseBlocks = (source: readonly string[], depth: number): Block[] => {
  if (depth > MD_HTML_MAX_DEPTH) {
    const lines = source.filter((line) => !isBlank(line));
    return lines.length === 0 ? [] : [{ type: 'paragraph', lines }];
  }
  const lines = source.map(expandLeadingTabs);
  const blocks: Block[] = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (isBlank(line)) {
      i++;
      continue;
    }
    const fence = fenceOpening(line);
    if (fence !== undefined) {
      const code: string[] = [];
      i++;
      while (i < lines.length && !isFenceClosing(lines[i], fence)) {
        // Up to the fence's indentation is removed from the content lines.
        code.push(lines[i].slice(Math.min(fence.indent, leadingWidth(lines[i]))));
        i++;
      }
      i++;
      const language = fence.info.split(/[ \t]/)[0];
      blocks.push({ type: 'code', language: LANGUAGE.test(language) ? language : '', lines: code });
      continue;
    }
    const heading = parseAtxHeading(line);
    if (heading !== undefined) {
      blocks.push({ type: 'heading', level: heading.level, text: heading.text });
      i++;
      continue;
    }
    if (isThematicBreak(line)) {
      blocks.push({ type: 'hr' });
      i++;
      continue;
    }
    if (QUOTE_MARKER.test(line)) {
      const inner: string[] = [];
      let lazy = false;
      while (i < lines.length) {
        const current = lines[i];
        if (QUOTE_MARKER.test(current)) {
          const content = current.slice(current.indexOf('>') + 1);
          inner.push(content.startsWith(' ') ? content.slice(1) : content);
          lazy = !isBlank(content);
        } else if (lazy && !isBlank(current) && !interruptsParagraph(current)) {
          // A lazy continuation line of a paragraph in the quote.
          inner.push(current);
        } else {
          break;
        }
        i++;
      }
      blocks.push({ type: 'quote', children: parseBlocks(inner, depth + 1) });
      continue;
    }
    const first = listStart(line);
    if (first !== undefined) {
      const list: Block & { type: 'list' } = {
        type: 'list',
        ordered: first.ordered,
        start: first.ordered ? Number(first.number) : 1,
        tight: true,
        items: [],
      };
      let item = first;
      while (true) {
        const markerWidth = item.indent.length + item.marker.length;
        const spacing = item.spacing.length;
        const contentIndent = item.rest === '' || spacing > 4 ? markerWidth + 1 : markerWidth + spacing;
        // A task checkbox is not in the subset: it stays text of the item.
        const content: string[] = [(item.checkbox === undefined ? '' : item.checkbox + (item.checkboxSpacing ?? '')) + item.rest];
        i++;
        let blankBefore = false;
        let lazy = !isBlank(content[0]);
        while (i < lines.length) {
          const current = lines[i];
          if (isBlank(current)) {
            content.push('');
            blankBefore = true;
            lazy = false;
            i++;
            continue;
          }
          if (leadingWidth(current) >= contentIndent) {
            if (blankBefore) {
              list.tight = false;
            }
            content.push(current.slice(contentIndent));
            blankBefore = false;
            lazy = true;
            i++;
            continue;
          }
          if (lazy && !interruptsParagraph(current) && listStart(current) === undefined) {
            content.push(current.trimStart());
            i++;
            continue;
          }
          break;
        }
        while (content.length > 0 && isBlank(content[content.length - 1])) {
          content.pop();
        }
        list.items.push(parseBlocks(content, depth + 1));
        const next = i < lines.length ? listStart(lines[i]) : undefined;
        if (next === undefined || !sameListType(first, next) || isThematicBreak(lines[i])) {
          break;
        }
        if (blankBefore) {
          list.tight = false;
        }
        item = next;
      }
      blocks.push(list);
      continue;
    }
    const paragraph: string[] = [line];
    i++;
    while (i < lines.length && !isBlank(lines[i]) && !interruptsParagraph(lines[i])) {
      paragraph.push(lines[i]);
      i++;
    }
    blocks.push({ type: 'paragraph', lines: paragraph });
  }
  return blocks;
};

const renderInline = (text: string): string => inlineToHtml(parseInline(text));

const renderParagraphText = (lines: readonly string[], eol: MdEol): string =>
  renderInline(lines.map((line) => line.trim()).join(eol));

const renderBlocks = (blocks: readonly Block[], eol: MdEol, tight: boolean): string[] => {
  const out: string[] = [];
  for (const block of blocks) {
    switch (block.type) {
      case 'heading':
        out.push(`<h${block.level}>${renderInline(block.text)}</h${block.level}>`);
        break;
      case 'code': {
        const language = block.language === '' ? '' : ` class="language-${escapeHtml(block.language)}"`;
        const body = block.lines.map((line) => escapeHtml(line) + eol).join('');
        out.push(`<pre><code${language}>${body}</code></pre>`);
        break;
      }
      case 'hr':
        out.push('<hr />');
        break;
      case 'paragraph':
        out.push(tight ? renderParagraphText(block.lines, eol) : `<p>${renderParagraphText(block.lines, eol)}</p>`);
        break;
      case 'quote':
        out.push(['<blockquote>', ...renderBlocks(block.children, eol, false), '</blockquote>'].join(eol));
        break;
      case 'list': {
        const tag = block.ordered ? 'ol' : 'ul';
        const start = block.ordered && block.start !== 1 ? ` start="${block.start}"` : '';
        const items = block.items.map((item) => {
          const parts = renderBlocks(item, eol, block.tight);
          if (parts.length === 0) {
            return '<li></li>';
          }
          if (block.tight && item[0].type === 'paragraph') {
            return parts.length === 1 ? `<li>${parts[0]}</li>` : [`<li>${parts[0]}`, ...parts.slice(1), '</li>'].join(eol);
          }
          return ['<li>', ...parts, '</li>'].join(eol);
        });
        out.push([`<${tag}${start}>`, ...items, `</${tag}>`].join(eol));
        break;
      }
    }
  }
  return out;
};

/** MD-019: the HTML of a Markdown text (see the file comment for the subset). */
export const mdToHtml = (text: string, eol: MdEol): string => {
  const { lines, trailing } = splitLines(text);
  return renderBlocks(parseBlocks(lines, 0), eol, false).join(eol) + trailing;
};
