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
    parseInline,
    renderInline,
    searchText,
    splitExample,
    buildShowcase,
    checkShowcase,
    readInputs,
    validateShowcaseData,
    formatProblems,
    ShowcaseError,
    EXTERNAL_RESOURCE_PATTERNS,
    NOTE_PARENTHESES_ALLOW_LIST,
    PROBLEM_KINDS,
    MARKETPLACE_URL,
    JAPANESE,
    normalizeNewlines,
    UI_TEXT,
} from './generate-showcase.mjs';

const SCRIPT = fileURLToPath(new URL('./generate-showcase.mjs', import.meta.url));
const ROOT = path.resolve(path.dirname(SCRIPT), '..');
const DATA_DIR = path.join(ROOT, 'scripts', 'showcase-data');
const INPUTS = readInputs(ROOT);
const PACKAGE = JSON.parse(INPUTS.packageJson);
const COMMANDS = PACKAGE.contributes.commands;
const CATEGORIES = JSON.parse(INPUTS.categories);
const FILES = new Map(Object.entries(INPUTS.categoryFiles).map(([name, text]) => [name, JSON.parse(text)]));
const DATA_COMMANDS = CATEGORIES.flatMap((category) => FILES.get(`${category.id}.json`).commands.map((command) => ({ ...command, category: category.id })));
const CANDIDATES = DATA_COMMANDS.filter((command) => command.candidateId !== undefined);

const EXPECTED_COUNTS = {
    CASE: 30, WS: 35, LINE: 40, SORT: 30, WRAP: 30, ENC: 40, HASH: 20, DATA: 40, TABLE: 30,
    NUM: 40, DATE: 30, GEN: 30, JA: 35, UNI: 30, DEV: 35, MSEL: 30, MD: 25, TEXTX: 23, LINEX: 23, ENCX: 22, EXISTING: 281,
};
const CANDIDATE_ID_TEXT = /\b(?:CASE|WS|LINE|SORT|WRAP|ENC|HASH|DATA|TABLE|NUM|DATE|GEN|JA|UNI|DEV|MSEL|MD|TEXTX|LINEX|ENCX)-\d{3}\b/;

const real = buildShowcase(INPUTS);

function articleOf(html, commandId) {
    const start = html.indexOf(`data-command-id="${commandId}"`);
    assert.notEqual(start, -1, `no article for ${commandId}`);
    const open = html.lastIndexOf('<article', start);
    const close = html.indexOf('</article>', start);
    return html.slice(open, close + '</article>'.length);
}

function candidate(candidateId) {
    const found = CANDIDATES.find((command) => command.candidateId === candidateId);
    assert.ok(found, `no candidate ${candidateId}`);
    return found;
}

function articleOfCandidate(candidateId) {
    return articleOf(real.html, candidate(candidateId).id);
}

/** The description of an article in one language (inner HTML). */
function descriptionOf(article, lang) {
    const match = new RegExp(`<p class="desc" data-l="${lang}" lang="${lang}">([\\s\\S]*?)</p>`).exec(article);
    assert.ok(match, `no ${lang} description`);
    return match[1];
}

/**
 * The example of an article in one language as [label, html] pairs. An example
 * without anything to translate is one list with bilingual labels.
 */
function exampleSides(article, lang = 'ja') {
    const own = new RegExp(`<dl class="ex" data-l="${lang}" lang="${lang}">([\\s\\S]*?)</dl>`).exec(article);
    const shared = /<dl class="ex">([\s\S]*?)<\/dl>/.exec(article);
    const body = own?.[1] ?? shared?.[1];
    assert.ok(body, 'no example');
    return [...body.matchAll(/<dt>([\s\S]*?)<\/dt><dd>([\s\S]*?)<\/dd>/g)].map((m) => {
        const label = m[1].includes('data-l=') ? new RegExp(`<span data-l="${lang}" lang="${lang}">([^<]*)</span>`).exec(m[1])[1] : m[1];
        return [label, m[2]];
    });
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

/** Body of the first `<script>` element in an HTML fragment (the generator writes the tags in lower case). */
function firstScript(html) {
    const start = html.indexOf('<script>') + '<script>'.length;
    return html.slice(start, html.indexOf('</script>', start));
}

/** Visible text of an HTML fragment in one language (drops the other language and the tags). */
function visibleText(html, lang) {
    const other = lang === 'en' ? 'ja' : 'en';
    let text = html;
    // Remove elements of the other language (they are never nested in the page).
    for (const tag of ['span', 'p', 'ul', 'dl']) {
        text = text.replace(new RegExp(`<${tag}[^>]* data-l="${other}"[^>]*>[\\s\\S]*?</${tag}>`, 'g'), '');
    }
    return text
        .split('<')
        .map((part, i) => (i === 0 ? part : part.slice(part.indexOf('>') + 1)))
        .join('')
        .replace(/\s+/g, ' ')
        .trim();
}

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const P = 'selection-manipulator.';

function fixtureCommand(overrides = {}) {
    return {
        id: `${P}a`,
        candidateId: 'AAA-001',
        description: { en: 'Converts something.', ja: '何かを変換する' },
        example: { en: '`a` → `b`', ja: '`a` → `b`' },
        ...overrides,
    };
}

/**
 * A small, valid data set: category AAA (candidates) and EXISTING. `mutate`
 * receives { categories, files, packageIds } to break it.
 */
function fixture(mutate) {
    const state = {
        categories: [
            { id: 'AAA', name: { en: 'Test category', ja: 'テスト用カテゴリ' } },
            { id: 'EXISTING', name: { en: 'Core commands', ja: '定番コマンド' } },
        ],
        files: new Map([
            ['AAA.json', { category: 'AAA', commands: [fixtureCommand(), fixtureCommand({ id: `${P}b`, candidateId: 'AAA-002', derivedFrom: 'AAA-001' })] }],
            ['EXISTING.json', { category: 'EXISTING', commands: [{ id: `${P}foo`, description: { en: 'Does foo.', ja: 'foo をする' } }] }],
        ]),
        packageIds: [`${P}a`, `${P}b`, `${P}foo`],
    };
    mutate?.(state);
    return state;
}

function fixtureInputs(state) {
    return {
        packageJson: JSON.stringify({ contributes: { commands: state.packageIds.map((id) => ({ command: id, title: `Title of ${id}` })) } }),
        categories: JSON.stringify(state.categories),
        categoryFiles: Object.fromEntries([...state.files].map(([name, file]) => [name, JSON.stringify(file)])),
    };
}

function problemsOf(state, allowList) {
    return validateShowcaseData({ categories: state.categories, files: state.files, commandIds: state.packageIds, allowList });
}

function firstAAA(state) {
    return state.files.get('AAA.json').commands[0];
}

// ---------------------------------------------------------------------------

describe('module', () => {
    test('exports the functions and does not run the CLI on import', async () => {
        const output = path.join(ROOT, 'docs', 'showcase.html');
        const before = fs.statSync(output).mtimeMs;
        const mod = await import(`./generate-showcase.mjs?reimport=${Date.now()}`);
        for (const name of ['parseInline', 'renderInline', 'searchText', 'splitExample', 'buildShowcase', 'checkShowcase', 'validateShowcaseData', 'readInputs']) {
            assert.equal(typeof mod[name], 'function', name);
        }
        assert.equal(fs.statSync(output).mtimeMs, before);
    });

    test('imports only node: built-ins and relative files, and no longer reads the old planning document', () => {
        for (const file of ['generate-showcase.mjs', 'generate-showcase.test.mjs']) {
            const source = fs.readFileSync(path.join(ROOT, 'scripts', file), 'utf8');
            const specifiers = [...source.matchAll(/^import\s[^'"]*['"]([^'"]+)['"]/gm)].map((m) => m[1]);
            assert.ok(specifiers.length > 0);
            for (const specifier of specifiers) {
                assert.match(specifier, /^(node:|\.\/)/, `${file}: ${specifier}`);
            }
        }
        const generator = fs.readFileSync(SCRIPT, 'utf8');
        assert.ok(!generator.includes('parseRoadmap'));
        assert.doesNotMatch(generator, /ROADMAP\.md/);
    });
});

describe('real data: files and counts', () => {
    test('categories.json lists 21 categories in display order, each with an English and a Japanese name', () => {
        assert.deepEqual(CATEGORIES.map((c) => c.id), Object.keys(EXPECTED_COUNTS));
        for (const category of CATEGORIES) {
            assert.ok(category.name.en.trim() !== '' && category.name.ja.trim() !== '', category.id);
            assert.doesNotMatch(category.name.en, JAPANESE, category.id);
        }
        const existing = CATEGORIES.find((c) => c.id === 'EXISTING');
        assert.equal(existing.name.en, 'Core commands');
        assert.equal(existing.name.ja, '定番コマンド');
    });

    test('there is exactly one file per category, named after it, and nothing else', () => {
        const names = fs.readdirSync(DATA_DIR).filter((name) => name.endsWith('.json')).sort();
        assert.deepEqual(names, ['categories.json', ...CATEGORIES.map((c) => `${c.id}.json`)].sort());
        for (const [name, file] of FILES) {
            assert.equal(file.category, name.replace(/\.json$/, ''), name);
        }
    });

    test('the category counts match and every command of package.json is in the data exactly once', () => {
        for (const [id, count] of Object.entries(EXPECTED_COUNTS)) {
            assert.equal(FILES.get(`${id}.json`).commands.length, count, id);
            assert.equal(real.stats.counts[id], count, id);
        }
        assert.equal(CANDIDATES.length, 618);
        assert.equal(DATA_COMMANDS.length, 899);
        assert.equal(COMMANDS.length, 899);
        assert.deepEqual(DATA_COMMANDS.map((c) => c.id).sort(), COMMANDS.map((c) => c.command).sort());
        assert.equal(new Set(DATA_COMMANDS.map((c) => c.id)).size, 899);
        assert.equal(real.stats.total, 899);
    });

    test('only the candidates have candidate IDs, in order within each category; 49 of them are derived', () => {
        for (const category of CATEGORIES) {
            const commands = FILES.get(`${category.id}.json`).commands;
            if (category.id === 'EXISTING') {
                assert.ok(commands.every((c) => c.candidateId === undefined && c.derivedFrom === undefined));
                continue;
            }
            assert.deepEqual(commands.map((c) => c.candidateId), commands.map((_, i) => `${category.id}-${String(i + 1).padStart(3, '0')}`));
        }
        const derived = CANDIDATES.filter((c) => c.derivedFrom !== undefined);
        assert.equal(derived.length, 49);
        const byCategory = {};
        for (const command of derived) {
            byCategory[command.category] = (byCategory[command.category] ?? 0) + 1;
            assert.ok(CANDIDATES.some((c) => c.candidateId === command.derivedFrom && c.category === command.category), command.candidateId);
        }
        assert.deepEqual(byCategory, { LINE: 6, SORT: 5, ENC: 6, HASH: 3, DATA: 7, TABLE: 5, DATE: 5, JA: 6, DEV: 6 });
        assert.equal(candidate('LINE-035').derivedFrom, 'LINE-001');
    });

    test('the data has no titles (they come from package.json)', () => {
        for (const command of DATA_COMMANDS) {
            assert.equal(command.title, undefined, command.id);
        }
    });

    test('the real data passes the validation', () => {
        assert.deepEqual(validateShowcaseData({ categories: CATEGORIES, files: FILES, commandIds: COMMANDS.map((c) => c.command) }), []);
    });
});

describe('real data: English and Japanese', () => {
    test('every command has an English and a Japanese description; English has no Japanese outside code spans', () => {
        for (const command of DATA_COMMANDS) {
            assert.ok(command.description.en.trim() !== '' && command.description.ja.trim() !== '', command.id);
            assert.doesNotMatch(textOf(parseInline(command.description.en)), JAPANESE, command.id);
        }
    });

    test('every candidate has an example in both languages, with one arrow outside code spans and code on both sides', () => {
        for (const command of CANDIDATES) {
            for (const lang of ['en', 'ja']) {
                const split = splitExample(parseInline(command.example[lang]));
                assert.ok(split, `${command.candidateId} ${lang}`);
                assert.ok(split.input.some((t) => t.type === 'code'), `${command.candidateId} ${lang} input`);
                assert.ok(split.output.some((t) => t.type === 'code'), `${command.candidateId} ${lang} output`);
            }
            assert.doesNotMatch(textOf(parseInline(command.example.en)), JAPANESE, command.candidateId);
        }
    });

    test('no description or example has an unclosed backtick run', () => {
        for (const command of DATA_COMMANDS) {
            for (const text of [command.description.en, command.description.ja, command.example?.en, command.example?.ja]) {
                if (text === undefined) {
                    continue;
                }
                const diagnostics = {};
                parseInline(text, diagnostics);
                assert.equal(diagnostics.unclosedBackticks ?? 0, 0, `${command.id}: ${text}`);
            }
        }
    });

    test('all 125 examples with Japanese are classified: notes are translated, real data is kept', () => {
        const withJapanese = CANDIDATES.filter((c) => JAPANESE.test(c.example.ja));
        assert.equal(withJapanese.length, 125);
        for (const command of withJapanese) {
            const { en, ja, japanese } = command.example;
            assert.ok(japanese === 'note' || japanese === 'data', command.candidateId);
            if (japanese === 'note') {
                assert.notEqual(en, ja, command.candidateId);
                if (!NOTE_PARENTHESES_ALLOW_LIST.includes(command.candidateId)) {
                    for (const [, inside] of en.matchAll(/（([^（）]*)）/g)) {
                        assert.doesNotMatch(inside, JAPANESE, command.candidateId);
                    }
                }
            } else {
                assert.equal(en, ja, command.candidateId);
            }
        }
        for (const command of CANDIDATES.filter((c) => !JAPANESE.test(c.example.ja))) {
            assert.equal(command.example.japanese, undefined, command.candidateId);
            assert.equal(command.example.en, command.example.ja, command.candidateId);
        }
    });

    test('notes use full-width parentheses in English too; real Japanese output is kept (DATE-016, CASE-014, JA-029)', () => {
        assert.equal(candidate('CASE-014').example.japanese, 'note');
        assert.match(candidate('CASE-014').example.en, /（notification）/);
        assert.equal(candidate('DATE-016').example.japanese, 'data');
        assert.ok(candidate('DATE-016').example.en.includes('1 時間 30 分'));
        const ja029 = candidate('JA-029').example;
        assert.equal(ja029.japanese, 'note');
        assert.ok(!ja029.en.includes('を選択'));
        assert.ok(ja029.en.includes('①') && ja029.en.includes('髙'));
    });

    test('the allow-list only names note examples that exist', () => {
        for (const id of NOTE_PARENTHESES_ALLOW_LIST) {
            assert.equal(candidate(id).example.japanese, 'note', id);
        }
    });
});

describe('real data: the page', () => {
    test('every command of package.json is listed exactly once', () => {
        const ids = [...real.html.matchAll(/data-command-id="([^"]*)"/g)].map((m) => m[1]);
        assert.equal(ids.length, COMMANDS.length);
        assert.deepEqual([...ids].sort(), COMMANDS.map((c) => c.command).sort());
        assert.deepEqual(checkShowcase(real.html, COMMANDS.map((c) => c.command)), []);
    });

    test('each item shows the full command ID, the package.json title and a description in both languages', () => {
        for (const command of COMMANDS) {
            const article = articleOf(real.html, command.command);
            assert.ok(article.includes(`<code>${command.command}</code>`), command.command);
            const title = /<h4 lang="en">([\s\S]*?)<\/h4>/.exec(article)[1];
            assert.equal(title, command.title.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;'));
            descriptionOf(article, 'en');
            descriptionOf(article, 'ja');
        }
    });

    test('a candidate command has its description and example; no candidate ID or kind badge', () => {
        const article = articleOf(real.html, 'selection-manipulator.case.swap');
        assert.equal(descriptionOf(article, 'ja'), '大文字と小文字を入れ替える');
        assert.doesNotMatch(descriptionOf(article, 'en'), JAPANESE);
        assert.deepEqual(exampleSides(article, 'ja'), [
            ['入力', '<code>Hello World</code>'],
            ['出力', '<code>hELLO wORLD</code>'],
        ]);
        assert.deepEqual(exampleSides(article, 'en'), [
            ['Input', '<code>Hello World</code>'],
            ['Output', '<code>hELLO wORLD</code>'],
        ]);
        assert.ok(!real.html.includes('class="badge"'));
        assert.doesNotMatch(visibleText(real.html.slice(real.html.indexOf('<body>'), real.html.indexOf('<script>', real.html.indexOf('<body>'))), 'en'), CANDIDATE_ID_TEXT);
        assert.doesNotMatch(visibleText(real.html.slice(real.html.indexOf('<body>'), real.html.indexOf('<script>', real.html.indexOf('<body>'))), 'ja'), CANDIDATE_ID_TEXT);
    });

    test('a note example is shown translated in English and as is in Japanese', () => {
        const article = articleOfCandidate('CASE-014');
        const en = exampleSides(article, 'en').map(([, html]) => html).join(' ');
        const ja = exampleSides(article, 'ja').map(([, html]) => html).join(' ');
        assert.ok(en.includes('（notification）') && !en.includes('通知'));
        assert.ok(ja.includes('（通知）'));
        const data = articleOfCandidate('DATE-016');
        assert.ok(exampleSides(data, 'en')[1][1].includes('1 時間 30 分'));
    });

    test('the page is English by default, with a language switch and no planning words', () => {
        assert.match(real.html, /^<!doctype html>\n<html lang="en" data-lang="en">\n/);
        assert.ok(real.html.includes('<button type="button" data-set-lang="en" lang="en" aria-pressed="true">English</button>'));
        assert.ok(real.html.includes('<button type="button" data-set-lang="ja" lang="ja" aria-pressed="false">日本語</button>'));
        assert.match(real.html, /html\[data-lang="en"\] \[data-l="ja"\], html\[data-lang="ja"\] \[data-l="en"\] \{ display: none !important; \}/);
        for (const word of ['ROADMAP', '未掲載', '既存', 'その他（']) {
            assert.ok(!real.html.includes(word), word);
        }
        assert.ok(!real.html.includes('docs/ROADMAP'));
    });

    test('every Japanese element has lang="ja" and every English element lang="en"', () => {
        const ja = [...real.html.matchAll(/<[a-z0-9]+ [^>]*data-l="ja"[^>]*>/g)];
        const en = [...real.html.matchAll(/<[a-z0-9]+ [^>]*data-l="en"[^>]*>/g)];
        assert.ok(ja.length > 899 && en.length > 899);
        for (const [tag] of ja) {
            assert.ok(tag.includes('lang="ja"'), tag);
        }
        for (const [tag] of en) {
            assert.ok(tag.includes('lang="en"'), tag);
        }
    });

    test('the head script picks the language before the body: saved choice, then navigator.language, in try/catch', () => {
        const head = real.html.slice(0, real.html.indexOf('</head>'));
        const script = firstScript(head);
        assert.ok(script.includes('localStorage.getItem('));
        assert.ok(script.includes('navigator.language'));
        assert.match(script, /try \{[\s\S]*localStorage\.getItem[\s\S]*\} catch \(e\) \{\}/);
        assert.match(script, /saved === 'en' \|\| saved === 'ja'/);
        assert.match(script, /indexOf\('ja'\) === 0 \? 'ja' : 'en'/);
        assert.match(script, /setAttribute\('lang', lang\)/);
        assert.match(script, /setAttribute\('data-lang', lang\)/);
        const body = real.html.slice(real.html.lastIndexOf('<script>'));
        assert.match(body, /try \{ window\.localStorage\.setItem\([^)]*\); \} catch \(e\) \{\}/);
        assert.ok(body.includes("'data-placeholder-' + lang"));
        assert.ok(body.includes('document.title = titles[lang]'));
    });

    test('the head script chooses the language as specified', () => {
        const head = real.html.slice(0, real.html.indexOf('</head>'));
        const script = firstScript(head);
        const run = ({ saved, language, throws = false }) => {
            const attributes = {};
            const document = { documentElement: { setAttribute: (name, value) => (attributes[name] = value) }, title: '' };
            const localStorage = {
                getItem: () => {
                    if (throws) {
                        throw new Error('blocked');
                    }
                    return saved ?? null;
                },
            };
            new Function('window', 'document', 'navigator', script)({ localStorage }, document, { language });
            return { ...attributes, title: document.title };
        };
        for (const [language, expected] of [['ja', 'ja'], ['ja-JP', 'ja'], ['en-US', 'en'], ['en', 'en'], ['fr-FR', 'en'], ['zh-CN', 'en']]) {
            const result = run({ language });
            assert.equal(result.lang, expected, language);
            assert.equal(result['data-lang'], expected, language);
        }
        assert.equal(run({ saved: 'en', language: 'ja-JP' }).lang, 'en');
        assert.equal(run({ saved: 'ja', language: 'en-US' }).lang, 'ja');
        assert.equal(run({ saved: 'de', language: 'ja-JP' }).lang, 'ja');
        assert.equal(run({ throws: true, language: 'ja-JP' }).lang, 'ja');
        assert.equal(run({ language: 'ja-JP' }).title, 'Selection Manipulator コマンド一覧');
        assert.equal(run({ language: 'en' }).title, 'Selection Manipulator Commands');
    });

    test('the usage section comes before the commands and has the same headings in both languages', () => {
        const usage = /<section id="usage"[\s\S]*?<\/section>/.exec(real.html)[0];
        assert.ok(real.html.indexOf('id="usage"') < real.html.indexOf('id="commands"'));
        const headings = [...usage.matchAll(/<h[23][^>]*>([\s\S]*?)<\/h[23]>/g)].map((m) => [visibleText(m[1], 'en'), visibleText(m[1], 'ja')]);
        assert.deepEqual(headings, [
            ['Getting started', '使い方'],
            ['Overview', '概要'],
            ['Installation', 'インストール'],
            ['Command Palette', 'コマンドパレット'],
            ['Context menu', '右クリックメニュー'],
            ['Keybindings', 'キーバインド'],
            ['Multiple selections', 'マルチセレクション'],
            ['Where the result goes', '結果の出力先'],
        ]);
        for (const lang of ['en', 'ja']) {
            const text = visibleText(usage, lang);
            for (const phrase of ['899', 'Selection Manipulator', 'ext install erintheblack.selection-manipulator', 'Cmd+Shift+P', 'Ctrl+Shift+P', 'Show Selection Manipulator Commands', 'Convert to Multi Selection', '(Replace)', '(Clipboard)']) {
                assert.ok(text.includes(phrase), `${lang}: ${phrase}`);
            }
        }
        assert.ok(visibleText(usage, 'ja').includes('拡張機能ビュー') && visibleText(usage, 'ja').includes('読み取り専用タブ') && visibleText(usage, 'ja').includes('通知'));
        assert.ok(visibleText(usage, 'en').includes('Extensions view') && visibleText(usage, 'en').includes('read-only tab') && visibleText(usage, 'en').includes('notification'));
        assert.equal(usage.split(`<a href="${MARKETPLACE_URL}">`).length - 1, 2);
    });

    test('the keybindings table lists the 3 keybindings of package.json', () => {
        const rows = [...real.html.matchAll(/<tr data-keybinding="([^"]+)">([\s\S]*?)<\/tr>/g)].map((m) => [m[1], ...[...m[2].matchAll(/<td><code>([^<]*)<\/code><\/td>/g)].map((c) => c[1])]);
        assert.deepEqual(rows, [
            ['selection-manipulator.remove-cursor-above', 'cmd+alt+pageup', 'ctrl+alt+pageup'],
            ['selection-manipulator.remove-cursor-below', 'cmd+alt+pagedown', 'ctrl+alt+pagedown'],
            ['selection-manipulator.remove-character-from-each-side', 'cmd+shift+backspace', 'ctrl+shift+backspace'],
        ]);
        assert.equal(PACKAGE.contributes.keybindings.length, 3);
        // The titles stay English in the Japanese page, so their cells are marked lang="en".
        for (const [, row] of real.html.matchAll(/<tr data-keybinding="[^"]+">([\s\S]*?)<\/tr>/g)) {
            assert.match(row, /^<td lang="en">/);
        }
    });

    test('every id in the page is unique', () => {
        const ids = [...real.html.matchAll(/\sid="([^"]*)"/g)].map((m) => m[1]);
        assert.ok(ids.length > 20);
        const duplicates = ids.filter((id, index) => ids.indexOf(id) !== index);
        assert.deepEqual(duplicates, []);
    });

    test('the language group is named in the display language', () => {
        assert.ok(
            real.html.includes(
                `<div class="lang" role="group" id="lang-switch" aria-label="${UI_TEXT.languageGroup.en}" data-label-en="${UI_TEXT.languageGroup.en}" data-label-ja="${UI_TEXT.languageGroup.ja}">`,
            ),
        );
        const body = real.html.slice(real.html.indexOf('<body>'));
        assert.ok(body.includes("langGroup.setAttribute('aria-label', langGroup.getAttribute('data-label-' + lang) || '');"));
    });

    test('the count units come from UI_TEXT: a Japanese unit only, no empty English span', () => {
        assert.deepEqual(UI_TEXT.countUnit, { en: '', ja: '件' });
        assert.ok(real.html.includes('<strong id="visible-count">899</strong><span data-l="ja" lang="ja"> 件</span></span>'));
        assert.ok(!real.html.includes('<span data-l="en" lang="en"> </span>'));
        assert.ok(!('visibleAfter' in UI_TEXT));
    });

    test('sections follow categories.json, with the category name and count in both languages', () => {
        const order = [...real.html.matchAll(/<section id="cat-([A-Z]+)" class="cat" data-category="([A-Z]+)"/g)].map((m) => m[2]);
        assert.deepEqual(order, CATEGORIES.map((c) => c.id));
        for (const category of CATEGORIES) {
            const heading = new RegExp(`<h3 id="h-${category.id}" class="cat-h">([\\s\\S]*?)</h3>`).exec(real.html)[1];
            const count = real.stats.counts[category.id];
            assert.equal(visibleText(heading, 'en'), `${category.name.en.replace(/&/g, '&amp;')} Showing ${count} / ${count}`);
            assert.equal(visibleText(heading, 'ja'), `${category.name.ja} 表示 ${count} / ${count} 件`);
        }
    });

    test('items keep the order of the data files', () => {
        const ids = [...real.html.matchAll(/data-command-id="([^"]*)"/g)].map((m) => m[1]);
        assert.deepEqual(ids, DATA_COMMANDS.map((c) => c.id));
    });

    test('filter buttons show the category name and count; the unit is for screen readers, in both languages', () => {
        const names = new Map();
        for (const match of real.html.matchAll(/<button type="button" class="chip" data-filter="([^"]*)"([^>]*)>([\s\S]*?)<\/button>/g)) {
            assert.doesNotMatch(match[2], /\stitle=/);
            names.set(match[1], [visibleText(match[3], 'en'), visibleText(match[3], 'ja')]);
        }
        assert.deepEqual(names.get(''), [`All 899 commands`, `すべて 899 件`]);
        for (const category of CATEGORIES) {
            const count = real.stats.counts[category.id];
            assert.deepEqual(names.get(category.id), [`${category.name.en.replace(/&/g, '&amp;')} ${count} commands`, `${category.name.ja} ${count} 件`], category.id);
        }
        assert.ok(real.html.includes('data-filter="" aria-pressed="true"'));
        assert.match(real.html, /<span class="sr-only"> <span data-l="en" lang="en">commands<\/span><span data-l="ja" lang="ja">件<\/span><\/span>/);
        assert.match(real.html, /\.sr-only \{[^}]*clip: rect\(0, 0, 0, 0\)/);
    });

    test('the search box, filter and language buttons use the high-contrast control border', () => {
        assert.match(real.html, /\.search input \{[^}]*border: 1px solid var\(--control-border\);/);
        assert.match(real.html, /\.chip \{[^}]*border: 1px solid var\(--control-border\);/);
        assert.match(real.html, /\.lang button \{[^}]*border: 1px solid var\(--control-border\);/);
        assert.match(real.html, /--control-border: #6e7781;/);
        assert.match(real.html, /--control-border: #7d8590;/);
    });

    test('the search box has a placeholder per language; the status and empty message exist', () => {
        assert.ok(real.html.includes('placeholder="e.g. base64" data-placeholder-en="e.g. base64" data-placeholder-ja="例: base64"'));
        assert.match(real.html, /<span role="status">[\s\S]*?<strong id="visible-count">899<\/strong>/);
        assert.ok(real.html.includes('<div id="empty" class="empty" hidden>'));
        assert.ok(real.html.includes('<a class="skip" href="#main">'));
        assert.ok(real.html.includes('<main id="main" class="wrap">'));
    });

    test('no external resource is loaded; the Marketplace link is allowed', () => {
        for (const pattern of EXTERNAL_RESOURCE_PATTERNS) {
            assert.doesNotMatch(real.html, pattern);
        }
        assert.ok(real.html.includes(`<a href="${MARKETPLACE_URL}">`));
        assert.ok(real.html.includes('<meta charset="utf-8">'));
        assert.ok(real.html.includes('<meta name="viewport" content="width=device-width, initial-scale=1">'));
        assert.ok(real.html.includes('<title>Selection Manipulator Commands</title>'));
        assert.ok(!/<script[^>]*\ssrc=/i.test(real.html));
        assert.ok(!/@font-face/i.test(real.html));
        assert.ok(real.html.includes('@media (prefers-color-scheme: dark)'));
    });

    test('the output is deterministic, LF only, and matches docs/showcase.html', () => {
        const again = buildShowcase(readInputs(ROOT));
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
        const crlf = (text) => text.replace(/\r?\n/g, '\r\n');
        const inputs = {
            packageJson: crlf(INPUTS.packageJson),
            categories: crlf(INPUTS.categories),
            categoryFiles: Object.fromEntries(Object.entries(INPUTS.categoryFiles).map(([name, text]) => [name, crlf(text)])),
        };
        assert.equal(buildShowcase(inputs).html, real.html);
    });

    test('the legend explains the notation in both languages', () => {
        const legend = /<details class="legend">([\s\S]*?)<\/details>/.exec(real.html)[1];
        for (const symbol of ['⏎', '⇥', '·', '[a]', '|', '→', '{U+XXXX}']) {
            assert.ok(visibleText(legend, 'en').includes(symbol), `en ${symbol}`);
            assert.ok(visibleText(legend, 'ja').includes(symbol), `ja ${symbol}`);
        }
        assert.ok(visibleText(legend, 'en').includes('（notification）'));
        assert.ok(visibleText(legend, 'ja').includes('（通知）'));
        assert.ok(visibleText(legend, 'en').includes('Whitespace: Visualize Spaces and Tabs'));
        assert.doesNotMatch(legend, CANDIDATE_ID_TEXT);
    });

    test('data-search is well-formed and has both languages', () => {
        for (const match of real.html.matchAll(/<article [^>]*>/g)) {
            assert.match(match[0], /^<article class="cmd" data-category="[A-Z]+" data-command-id="[^"<>]+" data-search="[^"<>]*">$/);
        }
        const search = dataSearch(articleOf(real.html, 'selection-manipulator.case.swap'));
        assert.ok(search.includes('大文字'));
        assert.ok(search.includes('uppercase'), search);
        assert.ok(search.includes('change case swap'));
    });
});

describe('real data: inline rendering of specific rows', () => {
    test('WRAP-030: code spans delimited by several backticks', () => {
        assert.deepEqual(exampleSides(articleOfCandidate('WRAP-030')), [
            ['入力', '<code>a`b</code>'],
            ['出力', '<code>``a`b``</code>'],
        ]);
    });

    test('DEV-004', () => {
        assert.equal(exampleSides(articleOfCandidate('DEV-004'))[1][1], '<code>`a⏎b`</code>');
    });

    test('MD-014: code span delimited by four backticks', () => {
        assert.deepEqual(exampleSides(articleOfCandidate('MD-014')), [
            ['入力', '<code>a = 1（python）</code>'],
            ['出力', '<code>```python⏎a = 1⏎```</code>'],
        ]);
    });

    test('DEV-013', () => {
        const output = exampleSides(articleOfCandidate('DEV-013'))[1][1];
        assert.equal((output.match(/<code>/g) ?? []).length, 1);
        assert.ok(output.includes('`json:&quot;user_id&quot;`'));
    });

    test('DEV-025', () => {
        assert.equal(exampleSides(articleOfCandidate('DEV-025'))[1][1], '<code>`Hi ${name}!`</code>');
    });

    test('DEV-005: escapes in the description and the example', () => {
        const article = articleOfCandidate('DEV-005');
        for (const lang of ['en', 'ja']) {
            const desc = descriptionOf(article, lang);
            assert.ok(desc.includes('`') && desc.includes('${'), lang);
            assert.ok(!desc.includes('\\`'), lang);
        }
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
        assert.equal(exampleSides(articleOfCandidate('MSEL-012'))[0][1].match(/<code>([^<]*)<\/code>/)[1], '&quot;he|llo&quot;');
        for (const id of ['MSEL-012', 'MSEL-023']) {
            for (const lang of ['en', 'ja']) {
                assert.ok(descriptionOf(articleOfCandidate(id), lang).includes('<code>`</code>'), `${id} ${lang}`);
            }
        }
    });

    test('DEV-011: backslash escapes are removed from the search text of the description', () => {
        const article = articleOfCandidate('DEV-011');
        const search = dataSearch(article);
        assert.ok(search.includes('*a* _b_ → \\*a\\* \\_b\\_'));
    });

    test('GEN-016: strong', () => {
        const article = articleOfCandidate('GEN-016');
        for (const lang of ['en', 'ja']) {
            const desc = descriptionOf(article, lang);
            assert.ok(desc.includes('<strong>'), lang);
            assert.ok(!desc.includes('**'), lang);
        }
        assert.ok(!dataSearch(article).includes('**'));
    });

    test('JA-012: a bar in a code span of the description, ruby in the example', () => {
        const article = articleOfCandidate('JA-012');
        assert.ok(descriptionOf(article, 'ja').includes('<code>|</code>'));
        assert.deepEqual(exampleSides(article), [
            ['入力', '<code>｜東京《とうきょう》</code>'],
            ['出力', '<code>東京</code>'],
        ]);
    });

    test('ENC-001: entity references and code spans', () => {
        const article = articleOfCandidate('ENC-001');
        assert.equal(exampleSides(article)[1][1], '<code>&amp;lt;a href=&amp;quot;x&amp;quot;&amp;gt;</code>');
        for (const lang of ['en', 'ja']) {
            assert.ok(!descriptionOf(article, lang).includes('&amp;amp;#39;'), lang);
        }
    });

    test('MD-017: an entity in the description is decoded once', () => {
        const article = articleOfCandidate('MD-017');
        for (const lang of ['en', 'ja']) {
            assert.ok(descriptionOf(article, lang).includes('&lt;URL&gt;'), lang);
            assert.ok(!descriptionOf(article, lang).includes('&amp;lt;'), lang);
        }
        assert.ok(dataSearch(article).includes('&lt;url&gt;'));
    });
});

describe('validation: problems make the check and the generation fail', () => {
    const cases = [
        ['an empty description.en', (s) => (firstAAA(s).description.en = ''), PROBLEM_KINDS.descriptionEn],
        ['an empty description.ja', (s) => (firstAAA(s).description.ja = ' '), PROBLEM_KINDS.descriptionJa],
        ['only example.en missing', (s) => delete firstAAA(s).example.en, PROBLEM_KINDS.exampleSide],
        ['only example.ja missing', (s) => delete firstAAA(s).example.ja, PROBLEM_KINDS.exampleSide],
        ['Japanese outside code spans in description.en', (s) => (firstAAA(s).description.en = 'Converts 文字.'), PROBLEM_KINDS.japaneseInEnglish],
        ['a Japanese example without "japanese"', (s) => (firstAAA(s).example = { en: '`あ` → `ア`', ja: '`あ` → `ア`' }), PROBLEM_KINDS.unclassified],
        ['a note copied untranslated', (s) => (firstAAA(s).example = { en: '`foo_bar` → `fooBar`（通知）', ja: '`foo_bar` → `fooBar`（通知）', japanese: 'note' }), PROBLEM_KINDS.untranslatedNote],
        ['a note partly translated', (s) => (firstAAA(s).example = { en: '`a`（column 2） → `b`（通知）', ja: '`a`（列 2） → `b`（通知）', japanese: 'note' }), PROBLEM_KINDS.partlyUntranslatedNote],
        ['real data translated', (s) => (firstAAA(s).example = { en: '`PT1H30M` → `1 h 30 min`', ja: '`PT1H30M` → `1 時間 30 分`', japanese: 'data' }), PROBLEM_KINDS.translatedData],
        ['"japanese" without Japanese', (s) => (firstAAA(s).example.japanese = 'data'), PROBLEM_KINDS.misplacedClassification],
        ['a changed example without Japanese', (s) => (firstAAA(s).example.en = '`a` → `c`'), PROBLEM_KINDS.changedWithoutJapanese],
        ['an invalid "japanese" value', (s) => (firstAAA(s).example = { en: '`あ` → `ア`', ja: '`あ` → `ア`', japanese: 'both' }), PROBLEM_KINDS.invalidClassification],
    ];

    for (const [name, mutate, kind] of cases) {
        test(name, () => {
            const state = fixture(mutate);
            const problems = problemsOf(state);
            assert.equal(problems.length, 1, JSON.stringify(problems));
            assert.equal(problems[0].kind, kind);
            assert.ok(problems[0].message.includes('scripts/showcase-data/AAA.json'), problems[0].message);
            assert.ok(problems[0].message.includes('selection-manipulator.a (AAA-001)'), problems[0].message);
            assert.throws(
                () => buildShowcase(fixtureInputs(state)),
                (error) =>
                    error instanceof ShowcaseError &&
                    error.message.includes('scripts/showcase-data/AAA.json: selection-manipulator.a (AAA-001)') &&
                    error.message.includes(`[${kind}]`) &&
                    error.message.includes(`problems by kind: ${kind}: 1`),
            );
        });
    }

    test('the problems are counted per kind', () => {
        const state = fixture((s) => {
            firstAAA(s).description.en = '';
            s.files.get('AAA.json').commands[1].description.en = '';
            firstAAA(s).example.en = '`a` → `c`';
        });
        const message = formatProblems(problemsOf(state));
        assert.ok(message.includes('has 3 problem(s)'));
        assert.ok(message.includes(`problems by kind: ${PROBLEM_KINDS.descriptionEn}: 2, ${PROBLEM_KINDS.changedWithoutJapanese}: 1`), message);
    });

    const structure = [
        ['a command of package.json missing from the data', (s) => s.packageIds.push(`${P}new`), PROBLEM_KINDS.missingCommand, `${P}new`],
        ['a command listed twice', (s) => s.files.get('EXISTING.json').commands.push({ id: `${P}a`, description: { en: 'x.', ja: 'x' } }), PROBLEM_KINDS.duplicateCommand, `${P}a`],
        ['a command not in package.json', (s) => (s.packageIds = s.packageIds.filter((id) => id !== `${P}foo`)), PROBLEM_KINDS.unknownCommand, `${P}foo`],
        ['a category file not in categories.json', (s) => s.files.set('BBB.json', { category: 'BBB', commands: [] }), PROBLEM_KINDS.categoryFile, 'BBB'],
        ['a category file whose "category" differs from its name', (s) => (s.files.get('AAA.json').category = 'CCC'), PROBLEM_KINDS.categoryFile, 'AAA'],
        ['a category of categories.json without a file', (s) => s.categories.push({ id: 'DDD', name: { en: 'D', ja: 'D' } }), PROBLEM_KINDS.categoryFile, 'DDD'],
        ['a category without name.en', (s) => (s.categories[0].name.en = ''), PROBLEM_KINDS.categoryName, 'AAA'],
        ['a category without name.ja', (s) => delete s.categories[1].name.ja, PROBLEM_KINDS.categoryName, 'EXISTING'],
    ];

    for (const [name, mutate, kind, id] of structure) {
        test(name, () => {
            const state = fixture(mutate);
            const problems = problemsOf(state);
            assert.equal(problems.length, 1, JSON.stringify(problems));
            assert.equal(problems[0].kind, kind);
            assert.ok(problems[0].message.includes(id), problems[0].message);
            assert.throws(() => buildShowcase(fixtureInputs(state)), (error) => error instanceof ShowcaseError && error.message.includes(id));
        });
    }

    test('a command missing from the data is not put in an "other" category', () => {
        const state = fixture((s) => s.packageIds.push(`${P}new`));
        assert.throws(() => buildShowcase(fixtureInputs(state)), ShowcaseError);
    });
});

describe('validation: correct data passes (not too strict)', () => {
    const cases = [
        ['a note translated in full-width parentheses', (s) => (firstAAA(s).example = { en: '`foo_bar` → `fooBar`（notification）', ja: '`foo_bar` → `fooBar`（通知）', japanese: 'note' })],
        ['real Japanese data copied as "data"', (s) => (firstAAA(s).example = { en: '`PT1H30M` → `1 時間 30 分`', ja: '`PT1H30M` → `1 時間 30 分`', japanese: 'data' })],
        ['an example without Japanese, copied, without "japanese"', () => {}],
        ['a description with Japanese inside a code span', (s) => (firstAAA(s).description.en = 'Converts `ひらがな` to katakana.')],
        ['a command without an example', (s) => delete firstAAA(s).example],
    ];
    for (const [name, mutate] of cases) {
        test(name, () => {
            const state = fixture(mutate);
            assert.deepEqual(problemsOf(state), []);
            assert.doesNotThrow(() => buildShowcase(fixtureInputs(state)));
        });
    }

    test('an allow-listed candidate may keep Japanese inside the parentheses of a translated note', () => {
        const state = fixture((s) => (firstAAA(s).example = { en: '`本文補足（selects "補足"）` → `本文[^1]`', ja: '`本文補足（「補足」を選択）` → `本文[^1]`', japanese: 'note' }));
        assert.equal(problemsOf(state, [])[0].kind, PROBLEM_KINDS.partlyUntranslatedNote);
        assert.deepEqual(problemsOf(state, ['AAA-001']), []);
        assert.equal(problemsOf(state, ['AAA-002']).length, 1);
        assert.deepEqual(problemsOf(fixture((s) => (firstAAA(s).candidateId = 'MD-022', firstAAA(s).example = state.files.get('AAA.json').commands[0].example))), []);
    });

    test('the fixture page is rendered with titles from package.json and escaped descriptions', () => {
        const state = fixture((s) => (firstAAA(s).description.ja = '一番目 <script>alert(1)</script>'));
        const { html, stats } = buildShowcase(fixtureInputs(state));
        assert.deepEqual(stats.counts, { AAA: 2, EXISTING: 1 });
        const first = articleOf(html, `${P}a`);
        assert.ok(first.includes(`<h4 lang="en">Title of ${P}a</h4>`));
        assert.ok(first.includes('&lt;script&gt;alert(1)&lt;/script&gt;'));
        assert.ok(!first.includes('<script>'));
        assert.ok(!articleOf(html, `${P}foo`).includes('class="ex"'));
        assert.deepEqual(checkShowcase(html, state.packageIds), []);
    });
});

describe('checkShowcase', () => {
    const ids = ['selection-manipulator.a', 'selection-manipulator.b'];
    const page = (body) => `<!doctype html><html><body>${body}</body></html>`;
    const item = (id) => `<article class="cmd" data-command-id="${id}"></article>`;

    test('passes for a complete page, even with a URL in the text or a link', () => {
        assert.deepEqual(checkShowcase(page(item(ids[0]) + item(ids[1]) + '<p>https://cdn.jsdelivr.net/npm/x</p>'), ids), []);
        assert.deepEqual(checkShowcase(page(item(ids[0]) + item(ids[1]) + `<a href="${MARKETPLACE_URL}">Marketplace</a>`), ids), []);
        assert.deepEqual(checkShowcase(page(item(ids[0]) + item(ids[1]) + '<a class="x" href="https://example.com">x</a>'), ids), []);
    });

    test('fails for a missing, duplicated or unknown ID', () => {
        assert.equal(checkShowcase(page(item(ids[0])), ids).length, 1);
        assert.equal(checkShowcase(page(item(ids[0]) + item(ids[1]) + item(ids[1])), ids).length, 1);
        assert.equal(checkShowcase(page(item(ids[0]) + item(ids[1]) + item('selection-manipulator.z')), ids).length, 1);
    });

    test('fails for an external resource other than a link', () => {
        for (const resource of [
            '<script src="https://example.com/a.js"></script>',
            '<img src=//example.com/a.png>',
            '<area href="http://example.com">',
            '<abbr href="https://example.com">x</abbr>',
            '<base href="//example.com/">',
            '<link rel="stylesheet" href="a.css">',
            '<style>@import "a.css";</style>',
            '<style>body{background:url( "https://example.com/a.png")}</style>',
        ]) {
            const errors = checkShowcase(page(item(ids[0]) + item(ids[1]) + resource), ids);
            assert.ok(errors.length >= 1, resource);
            assert.ok(errors.every((error) => /external resource/.test(error)), resource);
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
        fs.cpSync(DATA_DIR, path.join(dir, 'scripts', 'showcase-data'), { recursive: true });
        fs.writeFileSync(path.join(dir, 'package.json'), INPUTS.packageJson);
        mutate?.(dir);
        return dir;
    }
    function run(dir, ...args) {
        return spawnSync(process.execPath, [path.join(dir, 'scripts', 'generate-showcase.mjs'), ...args], { encoding: 'utf8' });
    }
    function editData(dir, fileName, edit) {
        const file = path.join(dir, 'scripts', 'showcase-data', fileName);
        const data = JSON.parse(fs.readFileSync(file, 'utf8'));
        edit(data);
        fs.writeFileSync(file, JSON.stringify(data, null, 2));
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
            fs.writeFileSync(path.join(dir, 'docs', 'showcase.html'), real.html);
            editData(dir, 'CASE.json', (data) => (data.commands[0].description.en = 'Swaps the case of letters (edited).'));
            const stale = run(dir, '--check');
            assert.notEqual(stale.status, 0);
            assert.match(stale.stderr, /docs\/showcase\.html is out of date; run "npm run showcase"/);
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
            const pkg = JSON.parse(INPUTS.packageJson);
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

    test('a command missing from the data makes generation and --check fail, and the page is not written', () => {
        const dir = workspace((d) => {
            fs.writeFileSync(path.join(d, 'docs', 'showcase.html'), real.html);
            const pkg = JSON.parse(INPUTS.packageJson);
            pkg.contributes.commands.push({ command: 'selection-manipulator.unlisted', title: 'Unlisted' });
            fs.writeFileSync(path.join(d, 'package.json'), JSON.stringify(pkg, null, 2));
        });
        try {
            for (const args of [[], ['--check']]) {
                const result = run(dir, ...args);
                assert.equal(result.status, 1);
                assert.match(result.stderr, /selection-manipulator\.unlisted: registered in package\.json but not in any file/);
                assert.match(result.stderr, /command missing from the data: 1/);
            }
            assert.equal(fs.readFileSync(path.join(dir, 'docs', 'showcase.html'), 'utf8'), real.html);
        } finally {
            fs.rmSync(dir, { recursive: true, force: true });
        }
    });

    test('an untranslated note makes generation and --check fail with the file, the command and the reason', () => {
        const dir = workspace((d) => {
            fs.writeFileSync(path.join(d, 'docs', 'showcase.html'), real.html);
        });
        try {
            editData(dir, 'CASE.json', (data) => {
                const command = data.commands.find((c) => c.candidateId === 'CASE-014');
                command.example.en = command.example.ja;
            });
            for (const args of [[], ['--check']]) {
                const result = run(dir, ...args);
                assert.equal(result.status, 1);
                assert.match(result.stderr, /scripts\/showcase-data\/CASE\.json: selection-manipulator\.\S+ \(CASE-014\): .*\[untranslated note\]/);
                assert.match(result.stderr, /problems by kind: untranslated note: 1/);
            }
            assert.equal(fs.readFileSync(path.join(dir, 'docs', 'showcase.html'), 'utf8'), real.html);
        } finally {
            fs.rmSync(dir, { recursive: true, force: true });
        }
    });

    test('broken JSON in the data fails with the file name', () => {
        const dir = workspace((d) => {
            fs.writeFileSync(path.join(d, 'scripts', 'showcase-data', 'WS.json'), '{');
        });
        try {
            const result = run(dir);
            assert.equal(result.status, 1);
            assert.match(result.stderr, /scripts\/showcase-data\/WS\.json: invalid JSON/);
        } finally {
            fs.rmSync(dir, { recursive: true, force: true });
        }
    });
});
