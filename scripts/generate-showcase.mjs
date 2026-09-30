#!/usr/bin/env node
// Generates docs/showcase.html, a self-contained page that lists every command
// registered in package.json (contributes.commands), grouped by the categories
// of docs/ROADMAP.md, with the description and input -> output example of the
// ROADMAP when there is one.
//
//   node scripts/generate-showcase.mjs          write docs/showcase.html
//   node scripts/generate-showcase.mjs --check  verify it without writing
//
// Only Node.js built-in modules are used (no new dependency).

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

export const COMMAND_PREFIX = 'selection-manipulator.';
export const EXISTING_CATEGORY = { id: 'EXISTING', name: '既存コマンド' };
export const OTHER_CATEGORY = { id: 'OTHER', name: 'その他（ROADMAP 未掲載）' };

const CANDIDATE_SECTION = 'カテゴリ別の候補表';
const INVENTORY_SECTION = '既存コマンド棚卸し';
const CANDIDATE_CELLS = 9;
const INVENTORY_CELLS = 5;
const CANDIDATE_ID = /^[A-Z]+-\d{3}$/;
const ARROW = ' → ';

export class ShowcaseError extends Error {
    constructor(message) {
        super(message);
        this.name = 'ShowcaseError';
    }
}

// ---------------------------------------------------------------------------
// Table rows (GFM: cells are split before any inline parsing)
// ---------------------------------------------------------------------------

/**
 * Splits a Markdown table row into cells the way GFM does: a `|` splits the
 * row unless it is preceded by `\` (also inside code spans), and `\|` is then
 * turned back into `|` in every cell, before the inline parsing.
 */
export function splitTableRow(line) {
    let row = line.trim();
    if (row.startsWith('|')) {
        row = row.slice(1);
    }
    if (row.endsWith('|') && !row.endsWith('\\|')) {
        row = row.slice(0, -1);
    }
    return row.split(/(?<!\\)\|/).map((cell) => cell.trim().replace(/\\\|/g, '|'));
}

// ---------------------------------------------------------------------------
// Inline Markdown (a single left-to-right scan)
// ---------------------------------------------------------------------------

const ASCII_PUNCTUATION = new Set('!"#$%&\'()*+,-./:;<=>?@[\\]^_`{|}~');
const NAMED_ENTITIES = new Map([
    ['lt', '<'],
    ['gt', '>'],
    ['amp', '&'],
    ['quot', '"'],
    ['apos', "'"],
    ['nbsp', ' '],
]);
const ENTITY = /^&(?:#[xX]([0-9a-fA-F]{1,6})|#([0-9]{1,7})|([A-Za-z][A-Za-z0-9]*));/;
const LINK = /^!?\[([^[\]`]*)\]\(([^\s()]*)\)/;

function backtickRun(src, index) {
    let end = index;
    while (src[end] === '`') {
        end++;
    }
    return end - index;
}

function decodeEntity(match) {
    const [, hex, dec, name] = match;
    if (name !== undefined) {
        return NAMED_ENTITIES.get(name);
    }
    const codePoint = parseInt(hex ?? dec, hex !== undefined ? 16 : 10);
    if (codePoint === 0 || codePoint > 0x10ffff || (codePoint >= 0xd800 && codePoint <= 0xdfff)) {
        return '�';
    }
    return String.fromCodePoint(codePoint);
}

// Index of the closing `**` of a strong span opened just before `start`, or -1.
// The search stops at the next backtick (strong spans never contain code spans
// in the ROADMAP) and skips backslash escapes.
function findStrongClose(src, start) {
    for (let i = start; i < src.length; i++) {
        const c = src[i];
        if (c === '`') {
            return -1;
        }
        if (c === '\\' && ASCII_PUNCTUATION.has(src[i + 1])) {
            i++;
            continue;
        }
        if (c === '*' && src[i + 1] === '*' && src[i + 2] !== '*' && i > start && !/\s/.test(src[i - 1])) {
            return i;
        }
        if (c === '*') {
            // Skip the rest of a longer run of asterisks.
            while (src[i + 1] === '*') {
                i++;
            }
        }
    }
    return -1;
}

/**
 * Parses the inline Markdown of a table cell (after `\|` was restored) into
 * tokens in one left-to-right scan:
 *   { type: 'text', value }, { type: 'code', value }, { type: 'strong', children }
 * Only code spans, backslash escapes, entity references, links / images (the
 * destination is dropped) and `**strong**` are recognized; everything else is
 * literal text. `diagnostics.unclosedBackticks` (optional) counts the backtick
 * runs that did not open a code span.
 */
export function parseInline(src, diagnostics) {
    const tokens = [];
    let text = '';
    const flush = () => {
        if (text !== '') {
            tokens.push({ type: 'text', value: text });
            text = '';
        }
    };
    let i = 0;
    while (i < src.length) {
        const c = src[i];

        // 1. Backslash escape of an ASCII punctuation character.
        if (c === '\\') {
            const next = src[i + 1];
            if (next !== undefined && ASCII_PUNCTUATION.has(next)) {
                text += next;
                i += 2;
            } else {
                text += c;
                i++;
            }
            continue;
        }

        // 2. Code span: a run of n backticks closed by a run of exactly n.
        if (c === '`') {
            const n = backtickRun(src, i);
            let close = -1;
            for (let j = i + n; j < src.length; ) {
                if (src[j] !== '`') {
                    j++;
                    continue;
                }
                const m = backtickRun(src, j);
                if (m === n) {
                    close = j;
                    break;
                }
                j += m;
            }
            if (close === -1) {
                text += src.slice(i, i + n);
                i += n;
                if (diagnostics) {
                    diagnostics.unclosedBackticks = (diagnostics.unclosedBackticks ?? 0) + 1;
                }
                continue;
            }
            let content = src.slice(i + n, close);
            if (content.length >= 2 && content.startsWith(' ') && content.endsWith(' ') && content.trim() !== '') {
                content = content.slice(1, -1);
            }
            flush();
            tokens.push({ type: 'code', value: content });
            i = close + n;
            continue;
        }

        // 3. Entity references, decoded once.
        if (c === '&') {
            const match = ENTITY.exec(src.slice(i));
            const decoded = match ? decodeEntity(match) : undefined;
            if (decoded !== undefined) {
                text += decoded;
                i += match[0].length;
            } else {
                text += c;
                i++;
            }
            continue;
        }

        // 4. Links and images: only the text is kept, the destination is dropped.
        if (c === '[' || (c === '!' && src[i + 1] === '[')) {
            const match = LINK.exec(src.slice(i));
            if (match) {
                text += parseInline(match[1]).map(plainText).join('');
                i += match[0].length;
                continue;
            }
        }

        // 5. Strong emphasis with exactly two asterisks.
        if (c === '*' && src[i + 1] === '*' && src[i + 2] !== '*' && src[i - 1] !== '*') {
            const next = src[i + 2];
            const close = next !== undefined && !/\s/.test(next) ? findStrongClose(src, i + 2) : -1;
            if (close !== -1) {
                flush();
                tokens.push({ type: 'strong', children: parseInline(src.slice(i + 2, close), diagnostics) });
                i = close + 2;
            } else {
                text += '**';
                i += 2;
            }
            continue;
        }

        // 6. / 7. Anything else is literal text.
        text += c;
        i++;
    }
    flush();
    return tokens;
}

function plainText(token) {
    if (token.type === 'strong') {
        return token.children.map(plainText).join('');
    }
    return token.value;
}

const HTML_ESCAPES = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };

export function escapeHtml(value) {
    return String(value).replace(/[&<>"']/g, (c) => HTML_ESCAPES[c]);
}

/** Renders tokens to HTML. The only tags produced are <code> and <strong>. */
export function renderInline(tokens) {
    return tokens
        .map((token) => {
            switch (token.type) {
                case 'code':
                    return `<code>${escapeHtml(token.value)}</code>`;
                case 'strong':
                    return `<strong>${renderInline(token.children)}</strong>`;
                default:
                    return escapeHtml(token.value);
            }
        })
        .join('');
}

/** The text of the tokens for the search index (no Markdown syntax left). */
export function searchText(tokens) {
    return tokens.map(plainText).join('');
}

/**
 * Splits an example into input and output tokens at the single ` → ` that is
 * outside code spans. Returns null when there is not exactly one.
 */
export function splitExample(tokens) {
    let count = 0;
    let at = -1;
    tokens.forEach((token, index) => {
        if (token.type === 'text') {
            const found = token.value.split(ARROW).length - 1;
            if (found > 0) {
                at = index;
            }
            count += found;
        }
    });
    if (count !== 1) {
        return null;
    }
    const [before, after] = tokens[at].value.split(ARROW);
    const input = [...tokens.slice(0, at)];
    const output = [];
    if (before.trim() !== '') {
        input.push({ type: 'text', value: before.replace(/\s+$/, '') });
    }
    if (after.trim() !== '') {
        output.push({ type: 'text', value: after.replace(/^\s+/, '') });
    }
    output.push(...tokens.slice(at + 1));
    return { input, output };
}

// ---------------------------------------------------------------------------
// ROADMAP and package.json
// ---------------------------------------------------------------------------

function normalizeNewlines(text) {
    return text.replace(/\r\n?/g, '\n');
}

function singleCodeSpan(cell) {
    const tokens = parseInline(cell);
    return tokens.length === 1 && tokens[0].type === 'code' ? tokens[0].value : undefined;
}

/**
 * Reads the candidate tables ("## カテゴリ別の候補表") and the inventory of the
 * existing commands ("## 既存コマンド棚卸し"). Tables of other sections are
 * ignored. Rows with a wrong number of cells, or whose command ID cell is not
 * a single code span, throw a ShowcaseError with the line number.
 */
export function parseRoadmap(roadmap, fileName = 'docs/ROADMAP.md') {
    const lines = normalizeNewlines(roadmap).split('\n');
    const categories = [];
    const candidates = new Map();
    const inventory = new Map();
    let section = '';
    let category;
    const fail = (lineNumber, message) => {
        throw new ShowcaseError(`${fileName}:${lineNumber}: ${message}`);
    };

    lines.forEach((line, index) => {
        const lineNumber = index + 1;
        if (line.startsWith('## ')) {
            section = line.slice(3).trim();
            category = undefined;
            return;
        }
        if (section === CANDIDATE_SECTION) {
            if (line.startsWith('### ')) {
                category = { id: line.slice(4).trim(), name: '' };
                categories.push(category);
                return;
            }
            const name = /^\*\*(.+?)\*\*\s*—/.exec(line);
            if (name && category && category.name === '') {
                category.name = name[1].trim();
                return;
            }
        }
        if (!line.trim().startsWith('|')) {
            return;
        }
        if (section === CANDIDATE_SECTION) {
            const cells = splitTableRow(line);
            if (!CANDIDATE_ID.test(cells[0])) {
                return;
            }
            const candidateId = cells[0];
            if (cells.length !== CANDIDATE_CELLS) {
                fail(lineNumber, `candidate ${candidateId} has ${cells.length} cells (expected ${CANDIDATE_CELLS}); escape "|" in a cell as "\\|"`);
            }
            if (!category) {
                fail(lineNumber, `candidate ${candidateId} is outside a "### <category>" heading`);
            }
            if (cells[1] !== category.id) {
                fail(lineNumber, `candidate ${candidateId} has category ${cells[1]} under "### ${category.id}"`);
            }
            const commandId = singleCodeSpan(cells[3]);
            if (commandId === undefined) {
                fail(lineNumber, `candidate ${candidateId}: the command ID cell must be a single code span`);
            }
            if (candidates.has(commandId)) {
                fail(lineNumber, `candidate ${candidateId}: command ID ${commandId} is listed twice`);
            }
            candidates.set(commandId, {
                candidateId,
                category: category.id,
                kind: cells[2],
                summary: cells[5],
                example: cells[6],
                line: lineNumber,
            });
        } else if (section === INVENTORY_SECTION) {
            const cells = splitTableRow(line);
            if (!/^\d+$/.test(cells[0])) {
                return;
            }
            if (cells.length !== INVENTORY_CELLS) {
                fail(lineNumber, `inventory row ${cells[0]} has ${cells.length} cells (expected ${INVENTORY_CELLS}); escape "|" in a cell as "\\|"`);
            }
            const baseId = singleCodeSpan(cells[1]);
            if (baseId === undefined) {
                fail(lineNumber, `inventory row ${cells[0]}: the command ID cell must be a single code span`);
            }
            inventory.set(COMMAND_PREFIX + baseId, { note: cells[4], line: lineNumber });
        }
    });
    return { categories, candidates, inventory };
}

function readCommands(packageJson) {
    const pkg = typeof packageJson === 'string' ? JSON.parse(normalizeNewlines(packageJson)) : packageJson;
    const commands = pkg?.contributes?.commands;
    if (!Array.isArray(commands)) {
        throw new ShowcaseError('package.json has no contributes.commands array');
    }
    const seen = new Set();
    for (const command of commands) {
        if (typeof command.command !== 'string' || command.command === '') {
            throw new ShowcaseError('package.json has a command without an ID');
        }
        if (seen.has(command.command)) {
            throw new ShowcaseError(`package.json registers ${command.command} twice`);
        }
        seen.add(command.command);
    }
    return commands;
}

function inventoryEntry(inventory, commandId) {
    if (inventory.has(commandId)) {
        return inventory.get(commandId);
    }
    const base = commandId.replace(/\.(replace|clipboard)$/, '');
    return base !== commandId ? inventory.get(base) : undefined;
}

function candidateNumber(candidateId) {
    return Number(candidateId.slice(candidateId.lastIndexOf('-') + 1));
}

/**
 * Joins the commands of package.json with the ROADMAP. Returns the categories
 * in display order, each with its items in display order.
 */
export function collectCommands({ packageJson, roadmap, warn = defaultWarn }) {
    const commands = readCommands(packageJson);
    const { categories, candidates, inventory } = parseRoadmap(roadmap);
    const groups = new Map(categories.map((c) => [c.id, { ...c, items: [] }]));
    const existing = { ...EXISTING_CATEGORY, items: [] };
    const other = { ...OTHER_CATEGORY, items: [] };

    for (const command of commands) {
        const id = command.command;
        const title = typeof command.title === 'string' ? command.title : id;
        const candidate = candidates.get(id);
        if (candidate) {
            groups.get(candidate.category).items.push({
                id,
                title,
                category: candidate.category,
                candidateId: candidate.candidateId,
                kind: candidate.kind,
                description: candidate.summary,
                example: candidate.example,
            });
            continue;
        }
        const entry = inventoryEntry(inventory, id);
        if (entry) {
            const note = entry.note.trim();
            existing.items.push({
                id,
                title,
                category: EXISTING_CATEGORY.id,
                description: note !== '' && note !== '—' ? note : undefined,
            });
            continue;
        }
        other.items.push({ id, title, category: OTHER_CATEGORY.id });
    }

    for (const group of groups.values()) {
        group.items.sort((a, b) => candidateNumber(a.candidateId) - candidateNumber(b.candidateId));
    }
    if (other.items.length > 0) {
        warn(
            `warning: ${other.items.length} command(s) are not in docs/ROADMAP.md and are listed under "${OTHER_CATEGORY.name}": ` +
                other.items.map((item) => item.id).join(', '),
        );
    }
    const ordered = [...groups.values(), existing];
    if (other.items.length > 0) {
        ordered.push(other);
    }
    return { categories: ordered, total: commands.length, unlisted: other.items.map((item) => item.id) };
}

function defaultWarn(message) {
    process.stderr.write(`${message}\n`);
}

// ---------------------------------------------------------------------------
// HTML
// ---------------------------------------------------------------------------

const STYLE = `
:root {
  color-scheme: light;
  --bg: #f7f7f5;
  --surface: #ffffff;
  --text: #1f2328;
  --muted: #59636e;
  --border: #d8dee4;
  --accent: #0b5cad;
  --accent-text: #ffffff;
  --code-bg: #eff1f3;
  --code-text: #1f2328;
  --badge-bg: #e7eefa;
  --badge-text: #0b4a8b;
  --focus: #0b5cad;
}
@media (prefers-color-scheme: dark) {
  :root {
    color-scheme: dark;
    --bg: #15171a;
    --surface: #1e2126;
    --text: #e6e8eb;
    --muted: #a2abb5;
    --border: #3a3f46;
    --accent: #7cb4f5;
    --accent-text: #0d1117;
    --code-bg: #2a2e35;
    --code-text: #e6e8eb;
    --badge-bg: #20344d;
    --badge-text: #b8d6fb;
    --focus: #7cb4f5;
  }
}
*, *::before, *::after { box-sizing: border-box; }
[hidden] { display: none !important; }
html { -webkit-text-size-adjust: 100%; }
body {
  margin: 0;
  background: var(--bg);
  color: var(--text);
  font-family: system-ui, -apple-system, "Segoe UI", "Hiragino Sans", "Noto Sans JP", "Yu Gothic UI", Meiryo, sans-serif;
  font-size: 15px;
  line-height: 1.6;
  overflow-wrap: anywhere;
}
code {
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, "Liberation Mono", monospace;
  font-size: 0.9em;
  background: var(--code-bg);
  color: var(--code-text);
  border-radius: 4px;
  padding: 0.05em 0.3em;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
  word-break: break-word;
}
.wrap { max-width: 1200px; margin: 0 auto; padding: 0 16px; }
.skip { position: absolute; left: -9999px; }
.skip:focus { left: 16px; top: 8px; background: var(--surface); padding: 4px 8px; z-index: 1; }
header.top { border-bottom: 1px solid var(--border); background: var(--surface); padding: 16px 0 12px; }
h1 { font-size: 1.5rem; line-height: 1.3; margin: 0 0 4px; }
.lead { margin: 0 0 12px; color: var(--muted); }
.lead strong { color: var(--text); }
.search { display: block; width: 100%; max-width: 560px; }
.search span { display: block; font-size: 0.85rem; color: var(--muted); margin-bottom: 2px; }
.search input {
  width: 100%;
  font: inherit;
  padding: 8px 10px;
  border: 1px solid var(--border);
  border-radius: 8px;
  background: var(--bg);
  color: var(--text);
}
.filters { display: flex; flex-wrap: wrap; gap: 6px; margin: 12px 0 0; padding: 0; border: 0; min-width: 0; }
.filters legend { font-size: 0.85rem; color: var(--muted); padding: 0; margin-bottom: 4px; }
.chip {
  font: inherit;
  font-size: 0.85rem;
  padding: 3px 10px;
  border: 1px solid var(--border);
  border-radius: 999px;
  background: var(--surface);
  color: var(--text);
  cursor: pointer;
}
.chip .n { color: var(--muted); margin-left: 2px; }
.chip[aria-pressed="true"] { background: var(--accent); border-color: var(--accent); color: var(--accent-text); }
.chip[aria-pressed="true"] .n { color: inherit; }
:focus-visible { outline: 2px solid var(--focus); outline-offset: 2px; }
.legend { margin-top: 12px; font-size: 0.85rem; color: var(--muted); }
.legend summary { cursor: pointer; }
.legend ul { margin: 6px 0 0; padding-left: 1.2em; }
.legend li { margin: 2px 0; }
main { padding-top: 8px; padding-bottom: 32px; }
.empty { padding: 24px 0; color: var(--muted); }
section { margin-top: 24px; }
h2 { font-size: 1.15rem; line-height: 1.4; margin: 0 0 10px; display: flex; flex-wrap: wrap; align-items: baseline; gap: 4px 10px; }
.cat-id { font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; color: var(--accent); }
.cat-count { font-size: 0.85rem; font-weight: normal; color: var(--muted); }
.grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(min(100%, 320px), 1fr)); gap: 10px; }
.cmd {
  min-width: 0;
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: 10px;
  padding: 10px 12px;
}
.cmd h3 { font-size: 1rem; line-height: 1.4; margin: 0 0 4px; }
.meta { margin: 0 0 6px; display: flex; flex-wrap: wrap; gap: 4px 6px; align-items: center; min-width: 0; }
.meta code { font-size: 0.8rem; min-width: 0; }
.badge { font-size: 0.75rem; background: var(--badge-bg); color: var(--badge-text); border-radius: 4px; padding: 0 6px; white-space: nowrap; }
.desc { margin: 0 0 6px; font-size: 0.9rem; }
.ex { margin: 0; display: grid; grid-template-columns: auto minmax(0, 1fr); gap: 2px 8px; font-size: 0.85rem; }
.ex dt { color: var(--muted); }
.ex dd { margin: 0; min-width: 0; }
`;

const SCRIPT = `
(function () {
  var input = document.getElementById('q');
  var visible = document.getElementById('visible-count');
  var empty = document.getElementById('empty');
  var chips = Array.prototype.slice.call(document.querySelectorAll('.chip'));
  var sections = Array.prototype.slice.call(document.querySelectorAll('main section')).map(function (section) {
    return {
      el: section,
      count: section.querySelector('.sec-visible'),
      items: Array.prototype.slice.call(section.querySelectorAll('article.cmd')).map(function (el) {
        return { el: el, text: el.getAttribute('data-search') || '' };
      })
    };
  });
  var category = '';
  function update() {
    var terms = input.value.normalize('NFKC').toLowerCase().split(/\\s+/).filter(Boolean);
    var total = 0;
    sections.forEach(function (section) {
      var shown = 0;
      var inCategory = category === '' || section.el.getAttribute('data-category') === category;
      section.items.forEach(function (item) {
        var match = inCategory && terms.every(function (term) { return item.text.indexOf(term) !== -1; });
        item.el.hidden = !match;
        if (match) { shown++; }
      });
      section.el.hidden = shown === 0;
      section.count.textContent = String(shown);
      total += shown;
    });
    visible.textContent = String(total);
    empty.hidden = total !== 0;
  }
  chips.forEach(function (chip) {
    chip.addEventListener('click', function () {
      category = chip.getAttribute('data-filter') || '';
      chips.forEach(function (other) { other.setAttribute('aria-pressed', String(other === chip)); });
      update();
    });
  });
  input.addEventListener('input', update);
  if (input.value) { update(); }
})();
`;

const LEGEND = [
    ['⏎', '改行'],
    ['⇥', 'タブ'],
    ['·', '意味のある空白'],
    ['{U+XXXX}', '不可視文字（コードポイント）'],
    ['[a]', '選択範囲'],
    ['|', 'カーソル位置'],
    ['（通知）', '結果を通知で表示する'],
];

function renderLegend() {
    const items = LEGEND.map(([symbol, meaning]) => `<li><code>${escapeHtml(symbol)}</code> = ${escapeHtml(meaning)}</li>`);
    items.push('<li>入力の後ろの（ ）は、コマンド実行時に入力する値やカーソル数などの補足です。</li>');
    items.push('<li>文字列リテラルの <code>\\n</code> などは「バックスラッシュ + n」の 2 文字を表します（実際の改行は <code>⏎</code>）。</li>');
    items.push(
        '<li>WS-015（空白の可視化）の出力側と WS-016（可視化を戻す）の入力側では、<code>·</code> と <code>→</code> は表記記号ではなく実際の文字です。</li>',
    );
    return `<details class="legend"><summary>入出力例の表記</summary><ul>\n${items.join('\n')}\n</ul></details>`;
}

function renderExample(example) {
    const tokens = parseInline(example);
    const split = splitExample(tokens);
    if (split) {
        return `<dl class="ex"><dt>入力</dt><dd>${renderInline(split.input)}</dd><dt>出力</dt><dd>${renderInline(split.output)}</dd></dl>`;
    }
    return `<dl class="ex"><dt>例</dt><dd>${renderInline(tokens)}</dd></dl>`;
}

function renderItem(item) {
    const parts = [item.id, item.title];
    if (item.candidateId) {
        parts.push(item.candidateId);
    }
    const body = [];
    body.push(`<h3>${escapeHtml(item.title)}</h3>`);
    const badges = item.candidateId
        ? ` <span class="badge">${escapeHtml(item.candidateId)}</span> <span class="badge">${escapeHtml(item.kind)}</span>`
        : '';
    body.push(`<p class="meta"><code>${escapeHtml(item.id)}</code>${badges}</p>`);
    if (item.description !== undefined) {
        const tokens = parseInline(item.description);
        parts.push(searchText(tokens));
        body.push(`<p class="desc">${renderInline(tokens)}</p>`);
    }
    if (item.example !== undefined) {
        parts.push(searchText(parseInline(item.example)));
        body.push(renderExample(item.example));
    }
    const search = parts.join(' ').normalize('NFKC').toLowerCase();
    return (
        `<article class="cmd" data-category="${escapeHtml(item.category)}" data-command-id="${escapeHtml(item.id)}" data-search="${escapeHtml(search)}">\n` +
        `${body.join('\n')}\n</article>`
    );
}

function renderSection(category) {
    const id = escapeHtml(category.id);
    const count = category.items.length;
    return [
        `<section id="cat-${id}" data-category="${id}" aria-labelledby="h-${id}">`,
        `<h2 id="h-${id}"><span class="cat-id">${id}</span> <span>${escapeHtml(category.name)}</span> ` +
            `<span class="cat-count">表示 <span class="sec-visible">${count}</span> / ${count} 件</span></h2>`,
        '<div class="grid">',
        ...category.items.map(renderItem),
        '</div>',
        '</section>',
    ].join('\n');
}

function renderChip(filter, label, count, title, pressed) {
    const titleAttr = title ? ` title="${escapeHtml(title)}"` : '';
    return `<button type="button" class="chip" data-filter="${escapeHtml(filter)}" aria-pressed="${pressed}"${titleAttr}>${escapeHtml(label)} <span class="n">${count}</span></button>`;
}

/**
 * Builds the showcase page. Deterministic: the same inputs give the same
 * bytes (LF newlines, one final newline, no dates or paths).
 */
export function buildShowcase({ packageJson, roadmap, warn = defaultWarn }) {
    const { categories, total, unlisted } = collectCommands({ packageJson, roadmap, warn });
    const chips = [renderChip('', 'すべて', total, '', true)];
    for (const category of categories) {
        chips.push(renderChip(category.id, category.id === EXISTING_CATEGORY.id || category.id === OTHER_CATEGORY.id ? category.name : category.id, category.items.length, category.name, false));
    }
    const html = [
        '<!doctype html>',
        '<html lang="ja">',
        '<head>',
        '<meta charset="utf-8">',
        '<meta name="viewport" content="width=device-width, initial-scale=1">',
        '<title>Selection Manipulator Commands</title>',
        `<style>${STYLE}</style>`,
        '</head>',
        '<body>',
        '<a class="skip" href="#commands">コマンド一覧へ移動</a>',
        '<header class="top">',
        '<div class="wrap">',
        '<h1>Selection Manipulator Commands</h1>',
        `<p class="lead">全 <strong id="total-count">${total}</strong> 件 ・ <span role="status">表示中 <strong id="visible-count">${total}</strong> 件</span></p>`,
        '<label class="search"><span>キーワード検索（ID・表示名・説明・例。空白区切りで AND）</span><input type="search" id="q" autocomplete="off" spellcheck="false"></label>',
        '<fieldset class="filters"><legend>カテゴリで絞り込み</legend>',
        ...chips,
        '</fieldset>',
        renderLegend(),
        '</div>',
        '</header>',
        '<main id="commands" class="wrap">',
        '<p id="empty" class="empty" hidden>該当するコマンドはありません</p>',
        ...categories.map(renderSection),
        '</main>',
        `<script>${SCRIPT}</script>`,
        '</body>',
        '</html>',
        '',
    ].join('\n');
    const counts = Object.fromEntries(categories.map((c) => [c.id, c.items.length]));
    return { html, stats: { total, counts, unlisted } };
}

// ---------------------------------------------------------------------------
// Verification
// ---------------------------------------------------------------------------

export const EXTERNAL_RESOURCE_PATTERNS = [
    /(src|href)\s*=\s*["']?\s*(https?:)?\/\//i,
    /<link/i,
    /@import/i,
    /url\(\s*["']?(https?:)?\/\//i,
];

function unescapeAttribute(value) {
    return value.replace(/&(amp|lt|gt|quot|#39);/g, (_, name) => ({ amp: '&', lt: '<', gt: '>', quot: '"', '#39': "'" })[name]);
}

/**
 * Checks a generated page: every command ID appears exactly once as
 * data-command-id, no other ID appears, and nothing is loaded from outside.
 * `commands` is a list of command IDs (or of package.json command objects).
 * Returns the list of problems (empty when the page is fine).
 */
export function checkShowcase(html, commands) {
    const errors = [];
    const expected = commands.map((c) => (typeof c === 'string' ? c : c.command));
    const found = new Map();
    for (const match of html.matchAll(/data-command-id="([^"]*)"/g)) {
        const id = unescapeAttribute(match[1]);
        found.set(id, (found.get(id) ?? 0) + 1);
    }
    const expectedSet = new Set(expected);
    for (const id of expected) {
        const count = found.get(id) ?? 0;
        if (count === 0) {
            errors.push(`missing command: ${id}`);
        } else if (count > 1) {
            errors.push(`command listed ${count} times: ${id}`);
        }
    }
    for (const id of found.keys()) {
        if (!expectedSet.has(id)) {
            errors.push(`unknown command listed: ${id}`);
        }
    }
    for (const pattern of EXTERNAL_RESOURCE_PATTERNS) {
        const match = pattern.exec(html);
        if (match) {
            errors.push(`external resource reference found (${pattern}): ${match[0]}`);
        }
    }
    return errors;
}

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUTPUT = 'docs/showcase.html';

export function readInputs(root = ROOT) {
    return {
        packageJson: fs.readFileSync(path.join(root, 'package.json'), 'utf8'),
        roadmap: fs.readFileSync(path.join(root, 'docs', 'ROADMAP.md'), 'utf8'),
    };
}

function runCheck(root) {
    const inputs = readInputs(root);
    const warnings = [];
    const first = buildShowcase({ ...inputs, warn: (message) => warnings.push(message) });
    const second = buildShowcase({ ...inputs, warn: () => {} });
    const errors = [];
    if (first.html !== second.html) {
        errors.push('the generation is not deterministic (two runs gave different output)');
    }
    const outputPath = path.join(root, OUTPUT);
    let onDisk;
    try {
        onDisk = fs.readFileSync(outputPath, 'utf8');
    } catch {
        onDisk = undefined;
    }
    if (onDisk === undefined) {
        errors.push(`${OUTPUT} does not exist; run "npm run showcase" to generate it`);
    } else if (onDisk !== first.html) {
        errors.push(`${OUTPUT} is out of date; run "npm run showcase" and commit the result`);
    }
    const commands = JSON.parse(inputs.packageJson).contributes.commands;
    errors.push(...checkShowcase(first.html, commands));
    for (const message of warnings) {
        process.stderr.write(`${message}\n`);
    }
    if (errors.length > 0) {
        for (const error of errors) {
            process.stderr.write(`error: ${error}\n`);
        }
        return 1;
    }
    process.stdout.write(`${OUTPUT} is up to date (${first.stats.total} commands)\n`);
    return 0;
}

function runGenerate(root) {
    const { html, stats } = buildShowcase(readInputs(root));
    fs.writeFileSync(path.join(root, OUTPUT), html);
    process.stdout.write(`wrote ${OUTPUT} (${stats.total} commands)\n`);
    return 0;
}

export function main(argv, root = ROOT) {
    const args = argv.slice(2);
    const unknown = args.filter((arg) => arg !== '--check');
    if (unknown.length > 0) {
        process.stderr.write(`usage: node scripts/generate-showcase.mjs [--check]\nunknown argument: ${unknown.join(' ')}\n`);
        return 2;
    }
    try {
        return args.includes('--check') ? runCheck(root) : runGenerate(root);
    } catch (error) {
        if (error instanceof ShowcaseError || error instanceof SyntaxError) {
            process.stderr.write(`error: ${error.message}\n`);
            return 1;
        }
        throw error;
    }
}

function isMainModule() {
    if (!process.argv[1]) {
        return false;
    }
    const resolved = path.resolve(process.argv[1]);
    if (import.meta.url === pathToFileURL(resolved).href) {
        return true;
    }
    try {
        return import.meta.url === pathToFileURL(fs.realpathSync(resolved)).href;
    } catch {
        return false;
    }
}

if (isMainModule()) {
    process.exitCode = main(process.argv);
}
