// Tests of scripts/generate-showcase.mjs (node:test, no dependency).
//   node --test scripts/generate-showcase.test.mjs

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import {
    splitTableRow,
    parseInline,
    renderInline,
    searchText,
    splitExample,
    buildShowcase,
    checkShowcase,
    parseRoadmap,
    ShowcaseError,
    EXTERNAL_RESOURCE_PATTERNS,
    normalizeNewlines,
} from './generate-showcase.mjs';

const SCRIPT = fileURLToPath(new URL('./generate-showcase.mjs', import.meta.url));
const ROOT = path.resolve(path.dirname(SCRIPT), '..');
const PACKAGE_JSON = fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8');
const ROADMAP = fs.readFileSync(path.join(ROOT, 'docs', 'ROADMAP.md'), 'utf8');
const COMMANDS = JSON.parse(PACKAGE_JSON).contributes.commands;
const quiet = () => {};

const real = buildShowcase({ packageJson: PACKAGE_JSON, roadmap: ROADMAP, warn: quiet });
const roadmapData = parseRoadmap(ROADMAP);

function articleOf(html, commandId) {
    const start = html.indexOf(`data-command-id="${commandId}"`);
    assert.notEqual(start, -1, `no article for ${commandId}`);
    const open = html.lastIndexOf('<article', start);
    const close = html.indexOf('</article>', start);
    return html.slice(open, close + '</article>'.length);
}

function commandOfCandidate(candidateId) {
    for (const [commandId, candidate] of roadmapData.candidates) {
        if (candidate.candidateId === candidateId) {
            return commandId;
        }
    }
    assert.fail(`no candidate ${candidateId}`);
}

function articleOfCandidate(candidateId) {
    return articleOf(real.html, commandOfCandidate(candidateId));
}

function part(article, className) {
    const match = new RegExp(`<(p|dl) class="${className}">([\\s\\S]*?)</\\1>`).exec(article);
    return match ? match[2] : undefined;
}

function exampleSides(article) {
    const ex = part(article, 'ex');
    assert.ok(ex, 'no example');
    const dd = [...ex.matchAll(/<dt>([^<]*)<\/dt><dd>([\s\S]*?)<\/dd>/g)].map((m) => [m[1], m[2]]);
    return dd;
}

function textOf(tokens) {
    return tokens
        .filter((t) => t.type !== 'code')
        .map((t) => (t.type === 'strong' ? textOf(t.children) : t.value))
        .join('');
}

function codesOf(tokens) {
    return tokens.filter((t) => t.type === 'code').map((t) => t.value);
}

function dataSearch(article) {
    return /data-search="([^"]*)"/.exec(article)[1];
}

// A small ROADMAP with the same structure as docs/ROADMAP.md.
function fixtureRoadmap({ candidateRows = [], inventoryRows = [], extra = '' } = {}) {
    return [
        '# Roadmap',
        '',
        '## 既存コマンド棚卸し',
        '',
        '| # | 基本コマンド ID | タイトル | 出力先違いの版 | 備考 |',
        '|---|---|---|---|---|',
        ...inventoryRows,
        '',
        '## カテゴリ別の候補表',
        '',
        '### AAA',
        '',
        '**テスト用カテゴリ** — 基本機能 1 件',
        '',
        '| ID | カテゴリ | 種別 | 提案コマンド ID | タイトル | 概要 | 入出力例 | 外部通信 | 新規依存 |',
        '|---|---|---|---|---|---|---|---|---|',
        ...candidateRows,
        '',
        '## 子チケット対応表',
        '',
        '| チケット ID | カテゴリ | ID 範囲 | 件数 |',
        '|---|---|---|---|',
        '| AAA-999 | AAA | 基本 | `selection-manipulator.from-other-table` | x | y | `a` → `b` | なし | なし |',
        extra,
        '',
    ].join('\n');
}

function fixturePackage(ids) {
    return JSON.stringify({ contributes: { commands: ids.map((id) => ({ command: id, title: `Title of ${id}` })) } });
}

// ---------------------------------------------------------------------------

describe('module', () => {
    test('exports the functions and does not run the CLI on import', async () => {
        const output = path.join(ROOT, 'docs', 'showcase.html');
        const before = fs.statSync(output).mtimeMs;
        const mod = await import(`./generate-showcase.mjs?reimport=${Date.now()}`);
        for (const name of ['splitTableRow', 'parseInline', 'renderInline', 'searchText', 'splitExample', 'buildShowcase', 'checkShowcase']) {
            assert.equal(typeof mod[name], 'function', name);
        }
        assert.equal(fs.statSync(output).mtimeMs, before);
    });

    test('imports only node: built-ins and relative files', () => {
        for (const file of ['generate-showcase.mjs', 'generate-showcase.test.mjs']) {
            const source = fs.readFileSync(path.join(ROOT, 'scripts', file), 'utf8');
            const specifiers = [...source.matchAll(/^import\s[^'"]*['"]([^'"]+)['"]/gm)].map((m) => m[1]);
            assert.ok(specifiers.length > 0);
            for (const specifier of specifiers) {
                assert.match(specifier, /^(node:|\.\/)/, `${file}: ${specifier}`);
            }
        }
    });
});

describe('real data: the whole page', () => {
    test('every command of package.json is listed exactly once', () => {
        const ids = [...real.html.matchAll(/data-command-id="([^"]*)"/g)].map((m) => m[1]);
        assert.equal(ids.length, COMMANDS.length);
        assert.deepEqual([...ids].sort(), COMMANDS.map((c) => c.command).sort());
        assert.deepEqual(checkShowcase(real.html, COMMANDS.map((c) => c.command)), []);
    });

    test('each item shows the full command ID and the package.json title', () => {
        for (const command of COMMANDS) {
            const article = articleOf(real.html, command.command);
            assert.ok(article.includes(`<code>${command.command}</code>`), command.command);
            const title = /<h3>([\s\S]*?)<\/h3>/.exec(article)[1];
            assert.equal(title, command.title.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;'));
        }
    });

    test('a candidate command has a description, an example and badges', () => {
        const article = articleOf(real.html, 'selection-manipulator.case.swap');
        assert.equal(part(article, 'desc'), '大文字と小文字を入れ替える');
        assert.deepEqual(exampleSides(article), [
            ['入力', '<code>Hello World</code>'],
            ['出力', '<code>hELLO wORLD</code>'],
        ]);
        assert.ok(article.includes('<span class="badge">CASE-001</span> <span class="badge">基本</span>'));
    });

    test('an existing command has no example block', () => {
        const article = articleOf(real.html, 'selection-manipulator.remove-cursor-above');
        assert.ok(article.includes('data-category="EXISTING"'));
        assert.ok(!article.includes('class="ex"'));
        assert.ok(!article.includes('class="desc"'));
    });

    test('category counts match the ROADMAP summary table and add up to the total', () => {
        const summary = new Map();
        let inSummary = false;
        for (const line of ROADMAP.replace(/\r\n?/g, '\n').split('\n')) {
            if (line.startsWith('## ')) {
                inSummary = line === '## 集計表';
                continue;
            }
            if (inSummary && line.startsWith('|')) {
                const cells = splitTableRow(line);
                if (/^[A-Z]+$/.test(cells[0])) {
                    summary.set(cells[0], Number(cells[4]));
                }
            }
        }
        assert.ok(summary.size > 0);
        const candidateTotal = [...summary.values()].reduce((a, b) => a + b, 0);
        for (const [id, count] of summary) {
            assert.equal(real.stats.counts[id], count, id);
        }
        assert.equal(real.stats.counts.EXISTING, COMMANDS.length - candidateTotal);
        assert.equal(real.stats.counts.OTHER, undefined);
        assert.deepEqual(real.stats.unlisted, []);
        const sum = Object.values(real.stats.counts).reduce((a, b) => a + b, 0);
        assert.equal(sum, real.stats.total);
        assert.equal(real.stats.total, COMMANDS.length);
        assert.ok(real.html.includes(`<strong id="total-count">${COMMANDS.length}</strong>`));
        assert.ok(real.html.includes(`<strong id="visible-count">${COMMANDS.length}</strong>`));
    });

    test('sections are in the ROADMAP order followed by the existing commands', () => {
        const order = [...real.html.matchAll(/<section id="cat-([A-Z]+)" data-category="([A-Z]+)"/g)].map((m) => m[2]);
        assert.deepEqual(order, [...roadmapData.categories.map((c) => c.id), 'EXISTING']);
        assert.deepEqual(roadmapData.categories.map((c) => c.id), [
            'CASE', 'WS', 'LINE', 'SORT', 'WRAP', 'ENC', 'HASH', 'DATA', 'TABLE', 'NUM', 'DATE', 'GEN', 'JA', 'UNI', 'DEV', 'MSEL', 'MD',
        ]);
        const heading = /<h2 id="h-CASE">([\s\S]*?)<\/h2>/.exec(real.html)[1];
        assert.ok(heading.includes('CASE'));
        assert.ok(heading.includes(roadmapData.categories[0].name));
        assert.ok(heading.includes(`/ ${real.stats.counts.CASE} 件`));
    });

    test('items are ordered by candidate ID, and existing commands by package.json order', () => {
        const ids = [...real.html.matchAll(/data-command-id="([^"]*)"/g)].map((m) => m[1]);
        const position = new Map(ids.map((id, index) => [id, index]));
        const byCategory = new Map();
        for (const [commandId, candidate] of roadmapData.candidates) {
            if (!byCategory.has(candidate.category)) {
                byCategory.set(candidate.category, []);
            }
            byCategory.get(candidate.category).push([candidate.candidateId, commandId]);
        }
        for (const list of byCategory.values()) {
            const expected = [...list].sort((a, b) => a[0].localeCompare(b[0])).map((x) => x[1]);
            const actual = [...list].sort((a, b) => position.get(a[1]) - position.get(b[1])).map((x) => x[1]);
            assert.deepEqual(actual, expected);
        }
        const existing = COMMANDS.map((c) => c.command).filter((id) => !roadmapData.candidates.has(id));
        assert.deepEqual(existing.map((id) => position.get(id)), [...existing.map((id) => position.get(id))].sort((a, b) => a - b));
    });

    test('there is a filter button with a count for every category', () => {
        assert.ok(real.html.includes(`data-filter="" aria-pressed="true">すべて <span class="n">${COMMANDS.length}</span>`));
        for (const [id, count] of Object.entries(real.stats.counts)) {
            assert.match(real.html, new RegExp(`data-filter="${id}" aria-pressed="false"[^>]*>.*? <span class="n">${count}</span>`), id);
        }
    });

    test('filter buttons have an accessible name that starts with the visible label and includes the category name and unit', () => {
        const names = new Map();
        for (const match of real.html.matchAll(/<button type="button" class="chip" data-filter="([^"]*)"[^>]*>(.*?)<\/button>/g)) {
            names.set(match[1], match[2].replace(/<[^>]*>/g, '').replace(/[<>]/g, '').replace(/\s+/g, ' ').trim());
        }
        assert.equal(names.get(''), `すべて ${COMMANDS.length} 件`);
        const caseName = roadmapData.categories.find((c) => c.id === 'CASE').name;
        assert.equal(names.get('CASE'), `CASE ${caseName} ${real.stats.counts.CASE} 件`);
        assert.equal(names.get('EXISTING'), `既存コマンド ${real.stats.counts.EXISTING} 件`);
        for (const [id, count] of Object.entries(real.stats.counts)) {
            assert.ok(names.get(id).endsWith(`${count} 件`), id);
        }
        assert.match(real.html, /\.sr-only \{[^}]*clip: rect\(0, 0, 0, 0\)/);
    });

    test('filter buttons have no title attribute (avoids announcing the category name twice)', () => {
        const chips = [...real.html.matchAll(/<button type="button" class="chip"[^>]*>(.*?)<\/button>/g)];
        assert.ok(chips.length > 0);
        // The chips include one with a hidden category name (the case that used to get a title).
        const caseName = roadmapData.categories.find((c) => c.id === 'CASE').name;
        assert.ok(chips.some(([whole]) => whole.includes(`<span class="sr-only">${caseName}</span>`)));
        for (const [whole] of chips) {
            const openTag = whole.slice(0, whole.indexOf('>') + 1);
            assert.doesNotMatch(openTag, /\stitle=/, openTag);
        }
    });

    test('the search box and filter buttons use the high-contrast control border', () => {
        assert.match(real.html, /\.search input \{[^}]*border: 1px solid var\(--control-border\);/);
        assert.match(real.html, /\.chip \{[^}]*border: 1px solid var\(--control-border\);/);
        assert.match(real.html, /--control-border: #6e7781;/);
        assert.match(real.html, /--control-border: #7d8590;/);
    });

    test('no external resource is loaded', () => {
        for (const pattern of EXTERNAL_RESOURCE_PATTERNS) {
            assert.doesNotMatch(real.html, pattern);
        }
        assert.match(real.html, /^<!doctype html>\n<html lang="ja">\n/);
        assert.ok(real.html.includes('<meta charset="utf-8">'));
        assert.ok(real.html.includes('<meta name="viewport" content="width=device-width, initial-scale=1">'));
        assert.ok(real.html.includes('<title>Selection Manipulator Commands</title>'));
        assert.ok(!/<script[^>]*\ssrc=/i.test(real.html));
        assert.ok(!/@font-face/i.test(real.html));
        assert.ok(real.html.includes('@media (prefers-color-scheme: dark)'));
    });

    test('the output is deterministic, LF only, and matches docs/showcase.html', () => {
        const again = buildShowcase({ packageJson: PACKAGE_JSON, roadmap: ROADMAP, warn: quiet });
        assert.equal(again.html, real.html);
        assert.ok(!real.html.includes('\r'));
        assert.ok(real.html.endsWith('</html>\n') && !real.html.endsWith('\n\n'));
        assert.ok(!real.html.includes(ROOT));
        assert.ok(!real.html.includes(os.homedir()));
        // A Windows checkout with core.autocrlf may give CRLF; compare line content only.
        const onDisk = normalizeNewlines(fs.readFileSync(path.join(ROOT, 'docs', 'showcase.html'), 'utf8'));
        assert.equal(onDisk, real.html, 'docs/showcase.html is out of date: run "npm run showcase"');
    });

    test('CRLF inputs give the same output', () => {
        const crlf = buildShowcase({
            packageJson: PACKAGE_JSON.replace(/\r?\n/g, '\r\n'),
            roadmap: ROADMAP.replace(/\r?\n/g, '\r\n'),
            warn: quiet,
        });
        assert.equal(crlf.html, real.html);
    });

    test('the legend explains the notation', () => {
        const legend = /<details class="legend">([\s\S]*?)<\/details>/.exec(real.html)[1];
        for (const symbol of ['⏎', '⇥', '·', '[a]', '|', '（通知）', 'WS-015', 'WS-016', '→']) {
            assert.ok(legend.includes(symbol), symbol);
        }
    });

    test('data-search attributes are well-formed', () => {
        for (const match of real.html.matchAll(/<article [^>]*>/g)) {
            assert.match(match[0], /^<article class="cmd" data-category="[A-Z]+" data-command-id="[^"<>]+" data-search="[^"<>]*">$/);
        }
    });
});

describe('real data: table structure invariants', () => {
    const lines = ROADMAP.replace(/\r\n?/g, '\n').split('\n');
    let section = '';
    const candidateRows = [];
    const inventoryRows = [];
    for (const line of lines) {
        if (line.startsWith('## ')) {
            section = line.slice(3);
            continue;
        }
        if (!line.startsWith('|')) {
            continue;
        }
        const cells = splitTableRow(line);
        if (section === 'カテゴリ別の候補表' && /^[A-Z]+-\d{3}$/.test(cells[0])) {
            candidateRows.push(cells);
        } else if (section === '既存コマンド棚卸し' && /^\d+$/.test(cells[0])) {
            inventoryRows.push(cells);
        }
    }

    test('candidate rows have 9 cells and inventory rows 5 (JA-012 included)', () => {
        assert.equal(candidateRows.length, roadmapData.candidates.size);
        assert.equal(inventoryRows.length, roadmapData.inventory.size);
        for (const cells of candidateRows) {
            assert.equal(cells.length, 9, cells[0]);
        }
        for (const cells of inventoryRows) {
            assert.equal(cells.length, 5, cells[0]);
        }
        assert.ok(candidateRows.some((cells) => cells[0] === 'JA-012'));
    });

    test('every candidate example has exactly one arrow outside code spans, with code on both sides', () => {
        for (const cells of candidateRows) {
            const split = splitExample(parseInline(cells[6]));
            assert.ok(split, cells[0]);
            assert.ok(split.input.some((t) => t.type === 'code'), `${cells[0]} input`);
            assert.ok(split.output.some((t) => t.type === 'code'), `${cells[0]} output`);
        }
    });

    test('no cell has an unclosed backtick run', () => {
        for (const cells of [...candidateRows, ...inventoryRows]) {
            for (const cell of cells) {
                const diagnostics = {};
                parseInline(cell, diagnostics);
                assert.equal(diagnostics.unclosedBackticks ?? 0, 0, `${cells[0]}: ${cell}`);
            }
        }
    });

    test('every candidate of the ROADMAP is registered in package.json', () => {
        const ids = new Set(COMMANDS.map((c) => c.command));
        for (const commandId of roadmapData.candidates.keys()) {
            assert.ok(ids.has(commandId), commandId);
        }
    });
});

describe('real data: inline rendering of specific rows', () => {
    test('WRAP-030: code spans delimited by several backticks', () => {
        const article = articleOf(real.html, 'selection-manipulator.enclose.markdown-inline-code');
        assert.deepEqual(exampleSides(article), [
            ['入力', '<code>a`b</code>'],
            ['出力', '<code>``a`b``</code>'],
        ]);
    });

    test('DEV-004', () => {
        const article = articleOf(real.html, 'selection-manipulator.programmatic.to-go-raw-string');
        assert.equal(exampleSides(article)[1][1], '<code>`a⏎b`</code>');
    });

    test('MD-014: code span delimited by four backticks', () => {
        const article = articleOf(real.html, 'selection-manipulator.markdown.code-block');
        assert.deepEqual(exampleSides(article), [
            ['入力', '<code>a = 1（python）</code>'],
            ['出力', '<code>```python⏎a = 1⏎```</code>'],
        ]);
    });

    test('DEV-013', () => {
        const output = exampleSides(articleOf(real.html, 'selection-manipulator.programmatic.json-to-go-struct'))[1][1];
        assert.equal((output.match(/<code>/g) ?? []).length, 1);
        assert.ok(output.includes('`json:&quot;user_id&quot;`'));
    });

    test('DEV-025', () => {
        assert.equal(exampleSides(articleOfCandidate('DEV-025'))[1][1], '<code>`Hi ${name}!`</code>');
    });

    test('DEV-005', () => {
        const article = articleOfCandidate('DEV-005');
        const desc = part(article, 'desc');
        assert.ok(desc.includes('` と ${ をエスケープ'));
        assert.ok(!desc.includes('\\'));
        assert.ok(!desc.includes('<code>'));
        assert.equal(exampleSides(article)[1][1], '<code>`cost \\${x}`</code>');
    });

    test('NUM-026: an arrow inside a code span does not split', () => {
        assert.deepEqual(exampleSides(articleOfCandidate('NUM-026')), [
            ['入力', '<code>zz（36 → 10）</code>'],
            ['出力', '<code>1295</code>'],
        ]);
    });

    test('WS-015 and WS-016 keep the arrow as a character', () => {
        for (const id of ['WS-015', 'WS-016']) {
            const sides = exampleSides(articleOfCandidate(id));
            assert.equal(sides.length, 2, id);
            assert.ok(sides.some(([, html]) => /<code>[^<]*→[^<]*<\/code>/.test(html)), id);
        }
    });

    test('MSEL-012 and MSEL-023', () => {
        const msel012 = articleOfCandidate('MSEL-012');
        assert.equal(exampleSides(msel012)[0][1].match(/<code>([^<]*)<\/code>/)[1], '&quot;he|llo&quot;');
        for (const id of ['MSEL-012', 'MSEL-023']) {
            assert.ok(part(articleOfCandidate(id), 'desc').includes('<code>`</code>'), id);
        }
    });

    test('WRAP-013: an escaped backtick', () => {
        const desc = part(articleOfCandidate('WRAP-013'), 'desc');
        assert.ok(desc.includes('`'));
        assert.ok(!desc.includes('<code>'));
    });

    test('DEV-011: several backslash escapes', () => {
        const article = articleOfCandidate('DEV-011');
        const desc = part(article, 'desc');
        assert.ok(desc.includes('* _ `'));
        assert.ok(!desc.includes('\\'));
        assert.ok(!desc.includes('<code>'));
        // The description part of data-search has the escapes removed. (The
        // example output of DEV-011 is literally `\*a\* \_b\_`, so the example
        // part of data-search does contain a backslash, as it should.)
        const search = dataSearch(article);
        const descriptionPart = search.slice(0, search.indexOf('*a*'));
        assert.ok(descriptionPart.includes('(* _ ` #'));
        assert.ok(!descriptionPart.includes('\\'));
        assert.ok(search.endsWith('*a* _b_ → \\*a\\* \\_b\\_'));
    });

    test('backslash escapes in descriptions', () => {
        assert.ok(part(articleOfCandidate('CASE-007'), 'desc').includes('Ada_Case'));
        const enc004 = part(articleOfCandidate('ENC-004'), 'desc');
        assert.ok(enc004.includes('\\uXXXX') && !enc004.includes('\\\\uXXXX'));
        const dev003 = articleOfCandidate('DEV-003');
        const desc = part(dev003, 'desc');
        assert.ok(desc.includes('&quot;…\\n&quot; +') && !desc.includes('\\\\n'));
        assert.ok(/<code>[^<]*\\n[^<]*<\/code>/.test(dev003));
    });

    test('GEN-016: strong', () => {
        const article = articleOf(real.html, 'selection-manipulator.random.phone-jp');
        const desc = part(article, 'desc');
        assert.ok(desc.includes('<strong>実在しない（未使用の）番号であることは保証しない</strong>'));
        assert.ok(!desc.includes('**'));
        assert.ok(dataSearch(article).includes('保証しない'));
        assert.ok(!dataSearch(article).includes('**'));
    });

    test('JA-012 after the ROADMAP fix', () => {
        const article = articleOf(real.html, 'selection-manipulator.japanese.remove-ruby');
        assert.ok(part(article, 'desc').includes('<code>|</code>'));
        assert.deepEqual(exampleSides(article), [
            ['入力', '<code>｜東京《とうきょう》</code>'],
            ['出力', '<code>東京</code>'],
        ]);
    });

    test('DATE-008: the spaces around a code span are removed', () => {
        assert.ok(part(articleOfCandidate('DATE-008'), 'desc').includes('<code>/</code>'));
    });

    test('ENC-001: entity references and code spans', () => {
        const article = articleOf(real.html, 'selection-manipulator.html.encode');
        const desc = part(article, 'desc');
        assert.ok(!desc.includes('&amp;lt;'));
        assert.ok(desc.includes('&amp;#39;'));
        assert.ok(!desc.includes('&amp;amp;#39;'));
        assert.equal(exampleSides(article)[1][1], '<code>&amp;lt;a href=&amp;quot;x&amp;quot;&amp;gt;</code>');
    });

    test('MD-017 and ENC-003', () => {
        const md017 = articleOf(real.html, 'selection-manipulator.markdown.linkify-urls');
        assert.ok(part(md017, 'desc').includes('&lt;URL&gt;'));
        assert.ok(!part(md017, 'desc').includes('&amp;lt;'));
        assert.ok(dataSearch(md017).includes('&lt;url&gt;'));
        assert.ok(!dataSearch(md017).includes('&amp;lt;'));
        const enc003 = part(articleOfCandidate('ENC-003'), 'desc');
        assert.ok(enc003.includes('&amp;#N;'));
    });
});

describe('splitTableRow', () => {
    test('an escaped bar does not split, inside or outside code spans', () => {
        assert.deepEqual(splitTableRow('| a \\| b | `c\\|d` | e |'), ['a | b', '`c|d`', 'e']);
    });

    test('an unescaped bar inside a code span splits (like GFM)', () => {
        assert.deepEqual(splitTableRow('| `a|b` | c |'), ['`a', 'b`', 'c']);
    });
});

describe('parseRoadmap errors', () => {
    const good = '| AAA-001 | AAA | 基本 | `selection-manipulator.a` | A | 概要 | `a` → `b` | なし | なし |';

    test('reads a well-formed fixture', () => {
        const data = parseRoadmap(fixtureRoadmap({ candidateRows: [good], inventoryRows: ['| 1 | `foo` | Foo | — |  |'] }));
        assert.deepEqual(data.categories, [{ id: 'AAA', name: 'テスト用カテゴリ' }]);
        assert.deepEqual([...data.candidates.keys()], ['selection-manipulator.a']);
        assert.deepEqual([...data.inventory.keys()], ['selection-manipulator.foo']);
    });

    test('tables of other sections are ignored', () => {
        const data = parseRoadmap(fixtureRoadmap({ candidateRows: [good] }));
        assert.ok(!data.candidates.has('selection-manipulator.from-other-table'));
    });

    test('a candidate row with a wrong number of cells fails with the line number and ID', () => {
        const bad = '| AAA-002 | AAA | 基本 | `selection-manipulator.b` | B | 縦棒 `|` を使う | `a` → `b` | なし | なし |';
        const roadmap = fixtureRoadmap({ candidateRows: [good, bad] });
        const lineNumber = roadmap.split('\n').indexOf(bad) + 1;
        assert.throws(
            () => buildShowcase({ packageJson: fixturePackage(['selection-manipulator.a']), roadmap, warn: quiet }),
            (error) => error instanceof ShowcaseError && error.message.includes(`:${lineNumber}:`) && error.message.includes('AAA-002'),
        );
    });

    test('an inventory row with a wrong number of cells fails', () => {
        assert.throws(() => parseRoadmap(fixtureRoadmap({ inventoryRows: ['| 1 | `foo` | Foo | — |'] })), ShowcaseError);
    });

    test('a command ID cell that is not a single code span fails', () => {
        const bad = '| AAA-002 | AAA | 基本 | selection-manipulator.b | B | 概要 | `a` → `b` | なし | なし |';
        assert.throws(() => parseRoadmap(fixtureRoadmap({ candidateRows: [bad] })), ShowcaseError);
        assert.throws(() => parseRoadmap(fixtureRoadmap({ inventoryRows: ['| 1 | foo | Foo | — |  |'] })), ShowcaseError);
    });
});

describe('joining package.json and the ROADMAP (fixtures)', () => {
    const roadmap = fixtureRoadmap({
        candidateRows: [
            '| AAA-002 | AAA | 派生 | `selection-manipulator.second` | Second | 二番目 | `x` → `y` | なし | なし |',
            '| AAA-001 | AAA | 基本 | `selection-manipulator.first` | Other Title | 一番目 <script>alert(1)</script> | `a` → `b` | なし | なし |',
            '| AAA-003 | AAA | 基本 | `selection-manipulator.roadmap-only` | Only | 未登録 | `a` → `b` | なし | なし |',
        ],
        inventoryRows: ['| 1 | `foo` | Foo | `.replace`, `.clipboard` |  |', '| 2 | `bar` | Bar | — | — |', '| 3 | `baz` | Baz | — | 備考あり |'],
    });
    const ids = [
        'selection-manipulator.foo.clipboard',
        'selection-manipulator.second',
        'selection-manipulator.unlisted',
        'selection-manipulator.foo',
        'selection-manipulator.first',
        'selection-manipulator.bar',
        'selection-manipulator.foo.replace',
        'selection-manipulator.baz',
    ];

    test('categories, order, suffixes, notes and the "other" category', () => {
        const warnings = [];
        const { html, stats } = buildShowcase({ packageJson: fixturePackage(ids), roadmap, warn: (m) => warnings.push(m) });
        assert.deepEqual(stats.counts, { AAA: 2, EXISTING: 5, OTHER: 1 });
        assert.deepEqual(stats.unlisted, ['selection-manipulator.unlisted']);
        assert.equal(warnings.length, 1);
        assert.ok(warnings[0].includes('1 command') && warnings[0].includes('selection-manipulator.unlisted'));
        const order = [...html.matchAll(/data-command-id="([^"]*)"/g)].map((m) => m[1]);
        assert.deepEqual(order, [
            'selection-manipulator.first',
            'selection-manipulator.second',
            'selection-manipulator.foo.clipboard',
            'selection-manipulator.foo',
            'selection-manipulator.bar',
            'selection-manipulator.foo.replace',
            'selection-manipulator.baz',
            'selection-manipulator.unlisted',
        ]);
        assert.deepEqual([...html.matchAll(/<section id="cat-([A-Z]+)"/g)].map((m) => m[1]), ['AAA', 'EXISTING', 'OTHER']);
        assert.ok(!html.includes('roadmap-only'));
        assert.ok(!html.includes('from-other-table'));
        const first = articleOf(html, 'selection-manipulator.first');
        assert.ok(first.includes('<h3>Title of selection-manipulator.first</h3>'));
        assert.ok(first.includes('&lt;script&gt;alert(1)&lt;/script&gt;'));
        assert.ok(!first.includes('<script>'));
        const bar = articleOf(html, 'selection-manipulator.bar');
        assert.ok(!bar.includes('class="desc"') && !bar.includes('class="ex"'));
        assert.ok(articleOf(html, 'selection-manipulator.baz').includes('<p class="desc">備考あり</p>'));
        const unlisted = articleOf(html, 'selection-manipulator.unlisted');
        assert.ok(unlisted.includes('data-category="OTHER"'));
        assert.ok(!unlisted.includes('class="desc"') && !unlisted.includes('class="ex"'));
        assert.ok(html.includes('その他（ROADMAP 未掲載）'));
        assert.deepEqual(checkShowcase(html, ids), []);
    });
});

describe('checkShowcase', () => {
    const ids = ['selection-manipulator.a', 'selection-manipulator.b'];
    const page = (body) => `<!doctype html><html><body>${body}</body></html>`;
    const item = (id) => `<article class="cmd" data-command-id="${id}"></article>`;

    test('passes for a complete page, even with a URL in the text', () => {
        assert.deepEqual(checkShowcase(page(item(ids[0]) + item(ids[1]) + '<p>https://cdn.jsdelivr.net/npm/x</p>'), ids), []);
    });

    test('fails for a missing, duplicated or unknown ID', () => {
        assert.equal(checkShowcase(page(item(ids[0])), ids).length, 1);
        assert.equal(checkShowcase(page(item(ids[0]) + item(ids[1]) + item(ids[1])), ids).length, 1);
        assert.equal(checkShowcase(page(item(ids[0]) + item(ids[1]) + item('selection-manipulator.z')), ids).length, 1);
    });

    test('fails for an external resource', () => {
        for (const resource of [
            '<script src="https://example.com/a.js"></script>',
            '<img src=//example.com/a.png>',
            '<a href="http://example.com">x</a>',
            '<link rel="stylesheet" href="a.css">',
            '<style>@import "a.css";</style>',
            '<style>body{background:url( "https://example.com/a.png")}</style>',
        ]) {
            const errors = checkShowcase(page(item(ids[0]) + item(ids[1]) + resource), ids);
            assert.equal(errors.length, 1, resource);
            assert.match(errors[0], /external resource/);
        }
    });
});

describe('parseInline: code spans', () => {
    for (const [cell, code] of [
        ['``a`b``', 'a`b'],
        ['`` ` ``', '`'],
        ['` / `', '/'],
        ['`a b`', 'a b'],
        ['`  `', '  '],
    ]) {
        test(cell, () => {
            assert.deepEqual(codesOf(parseInline(cell)), [code]);
        });
    }

    for (const [cell, text, codes] of [
        ['`a', '`a', []],
        ['``a`', '``a`', []],
        ['``a と`b`', '``a と', ['b']],
        ['``a ```x`b`', '``a ```x', ['b']],
    ]) {
        test(`unclosed: ${cell}`, () => {
            const diagnostics = {};
            const tokens = parseInline(cell, diagnostics);
            assert.equal(textOf(tokens), text);
            assert.deepEqual(codesOf(tokens), codes);
            assert.ok(diagnostics.unclosedBackticks > 0);
        });
    }

    test('the code span after an unclosed opener closes', () => {
        assert.deepEqual(parseInline('``a と `b`'), [
            { type: 'text', value: '``a と ' },
            { type: 'code', value: 'b' },
        ]);
    });

    test('an escaped backtick does not open a code span', () => {
        assert.deepEqual(parseInline('\\``x`'), [
            { type: 'text', value: '`' },
            { type: 'code', value: 'x' },
        ]);
    });

    test('nothing is interpreted inside a code span', () => {
        assert.deepEqual(parseInline('`\\ &lt; [a](b) **a**`'), [{ type: 'code', value: '\\ &lt; [a](b) **a**' }]);
    });
});

describe('parseInline: escapes, entities, links, strong', () => {
    for (const [cell, shown] of [
        ['\\*', '*'],
        ['\\_', '_'],
        ['\\`', '`'],
        ['\\[', '['],
        ['\\\\', '\\'],
        ['\\&lt;', '&lt;'],
        ['\\d', '\\d'],
        ['\\u', '\\u'],
        ['\\⏎', '\\⏎'],
    ]) {
        test(`escape ${cell}`, () => {
            assert.equal(textOf(parseInline(cell)), shown);
        });
    }

    test('an escaped entity is not decoded', () => {
        assert.equal(renderInline(parseInline('\\&lt;')), '&amp;lt;');
    });

    for (const [cell, shown] of [
        ['&lt;URL&gt;', '<URL>'],
        ['&amp;#39;', '&#39;'],
        ['&#12354;', 'あ'],
        ['&#x3042;', 'あ'],
        ['&#0;', '\ufffd'],
        ['&#xD800;', '\ufffd'],
        ['&#N;', '&#N;'],
        ['a & b', 'a & b'],
        ['&foo;', '&foo;'],
    ]) {
        test(`entity ${cell}`, () => {
            assert.equal(textOf(parseInline(cell)), shown);
        });
    }

    test('entities are rendered once', () => {
        assert.equal(renderInline(parseInline('&lt;URL&gt;')), '&lt;URL&gt;');
        assert.equal(renderInline(parseInline('&amp;#39;')), '&amp;#39;');
    });

    test('a decoded backtick does not open a code span', () => {
        const tokens = parseInline('&#96;x&#96;');
        assert.deepEqual(codesOf(tokens), []);
        assert.equal(textOf(tokens), '`x`');
    });

    test('links and images keep only their text', () => {
        const link = renderInline(parseInline('see [text](https://example.com) now'));
        assert.equal(link, 'see text now');
        const image = renderInline(parseInline('![alt](https://example.com/a.png)'));
        assert.equal(image, 'alt');
        assert.ok(!image.includes('<img') && !link.includes('href'));
    });

    test('escaped brackets are not a link', () => {
        assert.equal(textOf(parseInline('\\[a\\](b)')), '[a](b)');
    });

    test('link syntax inside code spans stays', () => {
        assert.equal(
            renderInline(parseInline('`![alt](https://example.com/a.png)` と `[a](https://x.example)`')),
            '<code>![alt](https://example.com/a.png)</code> と <code>[a](https://x.example)</code>',
        );
    });

    for (const [cell, html] of [
        ['**a b**', '<strong>a b</strong>'],
        ['**a', '**a'],
        ['** a**', '** a**'],
        ['\\*\\*a\\*\\*', '**a**'],
    ]) {
        test(`strong ${cell}`, () => {
            assert.equal(renderInline(parseInline(cell)), html);
        });
    }

    test('single * and _ and <…> are literal', () => {
        assert.equal(renderInline(parseInline('a * b _c_ <x>')), 'a * b _c_ &lt;x&gt;');
    });

    test('HTML is escaped', () => {
        const html = renderInline(parseInline('概要 <script>alert(1)</script> "q" \'s\''));
        assert.equal(html, '概要 &lt;script&gt;alert(1)&lt;/script&gt; &quot;q&quot; &#39;s&#39;');
    });

    test('searchText has no Markdown syntax', () => {
        assert.equal(searchText(parseInline('**強調** \\* `code` &lt;x&gt; [t](https://e.example)')), '強調 * code <x> t');
    });
});

describe('splitExample', () => {
    for (const example of ['`a`', '`a` → `b` → `c`', '`a → b`', '`a`→`b`']) {
        test(`does not split ${example}`, () => {
            assert.equal(splitExample(parseInline(example)), null);
        });
    }

    test('splits at the arrow outside code spans and keeps notes', () => {
        const split = splitExample(parseInline('`a`（値: 1） → `b`（通知）'));
        assert.equal(renderInline(split.input), '<code>a</code>（値: 1）');
        assert.equal(renderInline(split.output), '<code>b</code>（通知）');
    });
});

describe('CLI', () => {
    function workspace(mutate) {
        const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'showcase テスト '));
        fs.mkdirSync(path.join(dir, 'scripts'));
        fs.mkdirSync(path.join(dir, 'docs'));
        fs.copyFileSync(SCRIPT, path.join(dir, 'scripts', 'generate-showcase.mjs'));
        fs.writeFileSync(path.join(dir, 'package.json'), PACKAGE_JSON);
        fs.writeFileSync(path.join(dir, 'docs', 'ROADMAP.md'), ROADMAP);
        mutate?.(dir);
        return dir;
    }
    function run(dir, ...args) {
        return spawnSync(process.execPath, [path.join(dir, 'scripts', 'generate-showcase.mjs'), ...args], { encoding: 'utf8' });
    }

    test('generates, then --check passes without writing', () => {
        const dir = workspace();
        try {
            const generated = run(dir);
            assert.equal(generated.status, 0, generated.stderr);
            const output = path.join(dir, 'docs', 'showcase.html');
            assert.equal(fs.readFileSync(output, 'utf8'), real.html);
            const before = fs.statSync(output).mtimeMs;
            const checked = run(dir, '--check');
            assert.equal(checked.status, 0, checked.stderr);
            assert.equal(fs.statSync(output).mtimeMs, before);
        } finally {
            fs.rmSync(dir, { recursive: true, force: true });
        }
    });

    test('--check fails for a stale or missing page and asks to run npm run showcase', () => {
        const dir = workspace();
        try {
            const missing = run(dir, '--check');
            assert.notEqual(missing.status, 0);
            assert.match(missing.stderr, /npm run showcase/);
            fs.writeFileSync(path.join(dir, 'docs', 'showcase.html'), real.html.replace('</main>', '<!-- stale --></main>'));
            const stale = run(dir, '--check');
            assert.notEqual(stale.status, 0);
            assert.match(stale.stderr, /npm run showcase/);
        } finally {
            fs.rmSync(dir, { recursive: true, force: true });
        }
    });

    test('--check accepts an up-to-date page checked out with CRLF newlines', () => {
        const dir = workspace((d) => {
            fs.writeFileSync(path.join(d, 'docs', 'showcase.html'), real.html.replace(/\n/g, '\r\n'));
        });
        try {
            const checked = run(dir, '--check');
            assert.equal(checked.status, 0, checked.stderr);
            assert.match(checked.stdout, /is up to date/);
        } finally {
            fs.rmSync(dir, { recursive: true, force: true });
        }
    });

    test('--check validates package.json commands through the same reader as generation', () => {
        const dir = workspace((d) => {
            fs.writeFileSync(path.join(d, 'docs', 'showcase.html'), real.html);
            const pkg = JSON.parse(PACKAGE_JSON);
            pkg.contributes.commands.push({ ...pkg.contributes.commands[0] });
            fs.writeFileSync(path.join(d, 'package.json'), JSON.stringify(pkg, null, 2));
        });
        try {
            const checked = run(dir, '--check');
            assert.equal(checked.status, 1);
            assert.match(checked.stderr, /error: package\.json registers \S+ twice/);
        } finally {
            fs.rmSync(dir, { recursive: true, force: true });
        }
    });

    test('--check only warns about a command missing from the ROADMAP', () => {
        const dir = workspace((d) => {
            const pkg = JSON.parse(PACKAGE_JSON);
            pkg.contributes.commands.push({ command: 'selection-manipulator.unlisted', title: 'Unlisted' });
            fs.writeFileSync(path.join(d, 'package.json'), JSON.stringify(pkg, null, 2));
        });
        try {
            assert.equal(run(dir).status, 0);
            const output = path.join(dir, 'docs', 'showcase.html');
            const content = fs.readFileSync(output, 'utf8');
            const checked = run(dir, '--check');
            assert.equal(checked.status, 0, checked.stderr);
            assert.match(checked.stderr, /warning: 1 command\(s\) are not in docs\/ROADMAP\.md/);
            assert.equal(fs.readFileSync(output, 'utf8'), content);
        } finally {
            fs.rmSync(dir, { recursive: true, force: true });
        }
    });

    test('a broken ROADMAP row makes generation and --check fail', () => {
        const dir = workspace((d) => {
            fs.writeFileSync(path.join(d, 'docs', 'showcase.html'), real.html);
            fs.writeFileSync(path.join(d, 'docs', 'ROADMAP.md'), ROADMAP.replace('`\\|`（半角）も可', '`|`（半角）も可'));
        });
        try {
            for (const args of [[], ['--check']]) {
                const result = run(dir, ...args);
                assert.notEqual(result.status, 0);
                assert.match(result.stderr, /ROADMAP\.md:\d+: candidate JA-012 has 10 cells/);
            }
            assert.equal(fs.readFileSync(path.join(dir, 'docs', 'showcase.html'), 'utf8'), real.html);
        } finally {
            fs.rmSync(dir, { recursive: true, force: true });
        }
    });
});
