#!/usr/bin/env node
// Generates docs/showcase.html, a self-contained bilingual (English / Japanese) page that explains
// how to use the extension and lists every command registered in package.json
// (contributes.commands), grouped by the categories of the showcase data
// (scripts/showcase-data/), with a description and an input -> output example in both languages.
//
//   node scripts/generate-showcase.mjs          write docs/showcase.html
//   node scripts/generate-showcase.mjs --check  verify the data and the page without writing
//
// Only Node.js built-in modules are used (no new dependency).

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

export const COMMAND_PREFIX = 'selection-manipulator.';
export const DATA_DIR = 'scripts/showcase-data';
export const CATEGORIES_FILE = 'categories.json';
export const LANGUAGES = ['en', 'ja'];
export const MARKETPLACE_URL = 'https://marketplace.visualstudio.com/items?itemName=erintheblack.selection-manipulator';
export const EXTENSION_ID = 'erintheblack.selection-manipulator';
export const LANGUAGE_STORAGE_KEY = 'selection-manipulator-showcase-lang';

/**
 * Candidate IDs whose English example may keep Japanese inside a full-width `（…）`: the
 * parentheses hold a translated note together with real Japanese data (the selected text or the
 * value typed into the input box), which must not be translated.
 */
export const NOTE_PARENTHESES_ALLOW_LIST = Object.freeze(['MD-022', 'MD-024']);

const ARROW = ' → ';

/** Hiragana, katakana or kanji. */
export const JAPANESE = /[\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Han}]/u;

export class ShowcaseError extends Error {
    constructor(message) {
        super(message);
        this.name = 'ShowcaseError';
    }
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
    ['nbsp', ' '],
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
// in the data) and skips backslash escapes.
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
 * Parses the inline Markdown of a description or an example into tokens in one
 * left-to-right scan:
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

/** The text of the tokens outside code spans (what a reader sees as prose). */
export function proseText(tokens) {
    return tokens
        .filter((token) => token.type !== 'code')
        .map((token) => (token.type === 'strong' ? proseText(token.children) : token.value))
        .join('');
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
// package.json and the showcase data
// ---------------------------------------------------------------------------

export function normalizeNewlines(text) {
    return text.replace(/\r\n?/g, '\n');
}

function parseJson(text, fileName) {
    try {
        return JSON.parse(normalizeNewlines(text));
    } catch (error) {
        throw new ShowcaseError(`${fileName}: invalid JSON (${error.message})`);
    }
}

function readPackage(packageJson) {
    const pkg = typeof packageJson === 'string' ? parseJson(packageJson, 'package.json') : packageJson;
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
    const keybindings = Array.isArray(pkg.contributes.keybindings) ? pkg.contributes.keybindings : [];
    return { commands, keybindings };
}

/** The kinds of data problems, in the order they are summarized. */
export const PROBLEM_KINDS = Object.freeze({
    invalidData: 'invalid data',
    categoryFile: 'category file mismatch',
    categoryName: 'missing category name',
    missingCommand: 'command missing from the data',
    duplicateCommand: 'command listed twice',
    unknownCommand: 'command not in package.json',
    descriptionEn: 'missing English description',
    descriptionJa: 'missing Japanese description',
    exampleSide: 'missing example side',
    japaneseInEnglish: 'Japanese in an English field',
    unclassified: 'unclassified Japanese example',
    untranslatedNote: 'untranslated note',
    partlyUntranslatedNote: 'partly untranslated note',
    translatedData: 'translated real data',
    misplacedClassification: 'classification without Japanese',
    changedWithoutJapanese: 'English example differs although there is nothing to translate',
    invalidClassification: 'invalid classification',
});

const isText = (value) => typeof value === 'string' && value.trim() !== '';
const hasJapanese = (text) => JAPANESE.test(text);
const japaneseInProse = (markdown) => hasJapanese(proseText(parseInline(markdown)));
const noteParentheses = (text) => [...text.matchAll(/（([^（）]*)）/g)].map((match) => match[1]);

/**
 * Validates the parsed showcase data against the command IDs of package.json.
 *
 *   categories     the parsed categories.json (array of { id, name: { en, ja } })
 *   files          Map of file name (e.g. "CASE.json") -> parsed category file
 *   commandIds     the command IDs of package.json
 *   allowList      candidate IDs whose English example may keep Japanese inside （…）
 *                  (default: NOTE_PARENTHESES_ALLOW_LIST)
 *
 * Returns the list of problems ({ kind, message }), empty when the data is fine.
 */
export function validateShowcaseData({ categories, files, commandIds, allowList = NOTE_PARENTHESES_ALLOW_LIST }) {
    const problems = [];
    const add = (kind, message) => problems.push({ kind, message });
    const allowed = new Set(allowList);
    const dir = DATA_DIR;

    if (!Array.isArray(categories)) {
        add(PROBLEM_KINDS.invalidData, `${dir}/${CATEGORIES_FILE}: must be an array of categories`);
        return problems;
    }
    const categoryIds = new Set();
    for (const category of categories) {
        if (typeof category?.id !== 'string' || !/^[A-Z]+$/.test(category.id)) {
            add(PROBLEM_KINDS.invalidData, `${dir}/${CATEGORIES_FILE}: a category has no valid ID (${JSON.stringify(category?.id)})`);
            continue;
        }
        if (categoryIds.has(category.id)) {
            add(PROBLEM_KINDS.invalidData, `${dir}/${CATEGORIES_FILE}: category ${category.id} is listed twice`);
        }
        categoryIds.add(category.id);
        for (const lang of LANGUAGES) {
            if (!isText(category.name?.[lang])) {
                add(PROBLEM_KINDS.categoryName, `${dir}/${CATEGORIES_FILE}: category ${category.id} has no name.${lang}`);
            }
        }
        if (!files.has(`${category.id}.json`)) {
            add(PROBLEM_KINDS.categoryFile, `${dir}/${category.id}.json: missing (category ${category.id} is in ${CATEGORIES_FILE})`);
        }
    }

    const expected = new Set(commandIds);
    const seen = new Map();
    for (const [fileName, file] of files) {
        const where = `${dir}/${fileName}`;
        const categoryId = fileName.replace(/\.json$/, '');
        if (!categoryIds.has(categoryId)) {
            add(PROBLEM_KINDS.categoryFile, `${where}: category ${categoryId} is not in ${CATEGORIES_FILE}`);
        }
        if (file?.category !== categoryId) {
            add(PROBLEM_KINDS.categoryFile, `${where}: "category" is ${JSON.stringify(file?.category)}, expected "${categoryId}" (the file name)`);
        }
        if (!Array.isArray(file?.commands)) {
            add(PROBLEM_KINDS.invalidData, `${where}: "commands" must be an array`);
            continue;
        }
        file.commands.forEach((command, index) => {
            if (typeof command?.id !== 'string' || command.id === '') {
                add(PROBLEM_KINDS.invalidData, `${where}: command #${index + 1} has no ID`);
                return;
            }
            const label = command.candidateId ? `${command.id} (${command.candidateId})` : command.id;
            const at = `${where}: ${label}`;
            if (seen.has(command.id)) {
                add(PROBLEM_KINDS.duplicateCommand, `${at}: already listed in ${seen.get(command.id)}`);
            } else {
                seen.set(command.id, where);
            }
            if (!expected.has(command.id)) {
                add(PROBLEM_KINDS.unknownCommand, `${at}: not registered in package.json`);
            }
            validateCommand(command, at, allowed, add);
        });
    }
    for (const id of commandIds) {
        if (!seen.has(id)) {
            add(PROBLEM_KINDS.missingCommand, `${id}: registered in package.json but not in any file of ${dir}`);
        }
    }
    return problems;
}

function validateCommand(command, at, allowed, add) {
    const description = command.description;
    if (!isText(description?.en)) {
        add(PROBLEM_KINDS.descriptionEn, `${at}: description.en is missing or empty`);
    } else if (japaneseInProse(description.en)) {
        add(PROBLEM_KINDS.japaneseInEnglish, `${at}: description.en has Japanese outside code spans`);
    }
    if (!isText(description?.ja)) {
        add(PROBLEM_KINDS.descriptionJa, `${at}: description.ja is missing or empty`);
    }
    const example = command.example;
    if (example === undefined) {
        return;
    }
    if (!isText(example?.en) || !isText(example?.ja)) {
        const missing = LANGUAGES.filter((lang) => !isText(example?.[lang])).map((lang) => `example.${lang}`);
        add(PROBLEM_KINDS.exampleSide, `${at}: ${missing.join(' and ')} is missing or empty (an example needs both en and ja)`);
        return;
    }
    const classification = example.japanese;
    if (classification !== undefined && classification !== 'note' && classification !== 'data') {
        add(PROBLEM_KINDS.invalidClassification, `${at}: example.japanese is ${JSON.stringify(classification)} (must be "note" or "data")`);
        return;
    }
    if (!hasJapanese(example.ja)) {
        if (classification !== undefined) {
            add(PROBLEM_KINDS.misplacedClassification, `${at}: example.japanese is "${classification}" but example.ja has no Japanese`);
        }
        if (example.en !== example.ja) {
            add(PROBLEM_KINDS.changedWithoutJapanese, `${at}: example.en differs from example.ja although example.ja has no Japanese to translate`);
        }
        if (japaneseInProse(example.en)) {
            add(PROBLEM_KINDS.japaneseInEnglish, `${at}: example.en has Japanese outside code spans`);
        }
        return;
    }
    if (classification === undefined) {
        add(PROBLEM_KINDS.unclassified, `${at}: example.ja has Japanese but no "japanese": "note" or "data"`);
        return;
    }
    if (classification === 'data') {
        // The Japanese is real input / output: example.en must be the same string.
        if (example.en !== example.ja) {
            add(PROBLEM_KINDS.translatedData, `${at}: example.japanese is "data" (real Japanese data) but example.en differs from example.ja`);
        }
        return;
    }
    if (example.en === example.ja) {
        add(PROBLEM_KINDS.untranslatedNote, `${at}: example.japanese is "note" but example.en is the same as example.ja (the note is not translated)`);
        return;
    }
    const allowListed = command.candidateId !== undefined && allowed.has(command.candidateId);
    if (!allowListed && noteParentheses(example.en).some(hasJapanese)) {
        add(PROBLEM_KINDS.partlyUntranslatedNote, `${at}: example.japanese is "note" but a （…） of example.en still has Japanese`);
    }
    // Remarks outside the full-width parentheses (and outside code spans) must be English too.
    if (japaneseInProse(example.en.replace(/（[^（）]*）/g, ''))) {
        add(PROBLEM_KINDS.japaneseInEnglish, `${at}: example.en has Japanese outside code spans`);
    }
}

/** Formats the problems with a count per kind. */
export function formatProblems(problems) {
    const counts = new Map();
    for (const problem of problems) {
        counts.set(problem.kind, (counts.get(problem.kind) ?? 0) + 1);
    }
    const order = Object.values(PROBLEM_KINDS);
    const summary = [...counts.entries()]
        .sort((a, b) => order.indexOf(a[0]) - order.indexOf(b[0]))
        .map(([kind, count]) => `${kind}: ${count}`)
        .join(', ');
    return [
        `the showcase data (${DATA_DIR}) has ${problems.length} problem(s):`,
        ...problems.map((problem) => `  ${problem.message} [${problem.kind}]`),
        `problems by kind: ${summary}`,
    ].join('\n');
}

/**
 * Reads package.json and the showcase data, validates them, and joins them.
 * Inputs are the file contents: { packageJson, categories, categoryFiles: { "CASE.json": text, … } }.
 * Throws a ShowcaseError listing every problem when the data is not complete.
 */
export function collectCommands({ packageJson, categories, categoryFiles, allowList }) {
    const { commands, keybindings } = readPackage(packageJson);
    const parsedCategories = parseJson(categories, `${DATA_DIR}/${CATEGORIES_FILE}`);
    const files = new Map(
        Object.keys(categoryFiles)
            .sort()
            .map((fileName) => [fileName, parseJson(categoryFiles[fileName], `${DATA_DIR}/${fileName}`)]),
    );
    const commandIds = commands.map((command) => command.command);
    const problems = validateShowcaseData({ categories: parsedCategories, files, commandIds, allowList });
    if (problems.length > 0) {
        throw new ShowcaseError(formatProblems(problems));
    }
    const titles = new Map(commands.map((command) => [command.command, typeof command.title === 'string' ? command.title : command.command]));
    const ordered = parsedCategories.map((category) => ({
        id: category.id,
        name: { en: category.name.en, ja: category.name.ja },
        items: files.get(`${category.id}.json`).commands.map((command) => ({
            id: command.id,
            title: titles.get(command.id),
            category: category.id,
            description: command.description,
            example: command.example,
        })),
    }));
    return { categories: ordered, total: commands.length, commandIds, titles, keybindings };
}

// ---------------------------------------------------------------------------
// Texts of the page (English / Japanese)
// ---------------------------------------------------------------------------

/**
 * Every fixed text of the page, in both languages. Values are HTML (already
 * escaped); `{count}` is replaced with the number of commands.
 */
export const UI_TEXT = Object.freeze({
    pageTitle: { en: 'Selection Manipulator Commands', ja: 'Selection Manipulator コマンド一覧' },
    skipLink: { en: 'Skip to main content', ja: '本文へ移動' },
    languageGroup: { en: 'Language', ja: '言語' },
    lead: {
        en: 'A VS Code extension with <strong>{count}</strong> commands that transform, generate and extract the text of your selections.',
        ja: '選択範囲のテキストを変換・生成・抽出する <strong>{count}</strong> 件のコマンドを持つ VS Code 拡張機能です。',
    },
    usageHeading: { en: 'Getting started', ja: '使い方' },
    overviewHeading: { en: 'Overview', ja: '概要' },
    overview: {
        en:
            'Selection Manipulator transforms, generates and extracts text in place, right in the editor: in the selection, or in every selection at once when you use multiple cursors. ' +
            'It has <strong>{count}</strong> commands for case conversion, whitespace and lines, sorting, encoding, hashing, data formats, tables, numbers, dates, generators, Japanese text, Unicode, programming, multiple cursors and Markdown. ' +
            'They are all listed below, with a description and an input → output example.',
        ja:
            'Selection Manipulator は、エディタで選択したテキスト（マルチカーソルなら各選択範囲）をその場で変換・生成・抽出する拡張機能です。' +
            '大文字小文字の変換、空白・行の整形、ソート、エンコード、ハッシュ、データ形式、表、数値、日付、生成、日本語テキスト、Unicode、プログラミング支援、マルチカーソル、Markdown など、全 <strong>{count}</strong> 件のコマンドがあります。' +
            'すべてのコマンドを、説明と入出力例付きで下に掲載しています。',
    },
    installHeading: { en: 'Installation', ja: 'インストール' },
    install: {
        en:
            'In VS Code, open the Extensions view (<code>Cmd+Shift+X</code> / <code>Ctrl+Shift+X</code>), search for “Selection Manipulator” and select <strong>Install</strong>. ' +
            `Or open Quick Open (<code>Cmd+P</code> / <code>Ctrl+P</code>) and run <code>ext install ${EXTENSION_ID}</code>. ` +
            `The extension is also on the <a href="${MARKETPLACE_URL}">Visual Studio Marketplace</a>.`,
        ja:
            'VS Code の拡張機能ビュー（<code>Cmd+Shift+X</code> / <code>Ctrl+Shift+X</code>）で「Selection Manipulator」を検索し、<strong>インストール</strong>を選びます。' +
            `または Quick Open（<code>Cmd+P</code> / <code>Ctrl+P</code>）を開いて <code>ext install ${EXTENSION_ID}</code> を実行します。` +
            `<a href="${MARKETPLACE_URL}">Visual Studio Marketplace のページ</a>からもインストールできます。`,
    },
    paletteHeading: { en: 'Command Palette', ja: 'コマンドパレット' },
    palette: {
        en:
            'Select some text, open the Command Palette (<code>Cmd+Shift+P</code> / <code>Ctrl+Shift+P</code>) and type <code>Selection Manipulator</code> to find the commands of this extension. ' +
            'The command <code>Show Selection Manipulator Commands</code> shows all of them in one list to pick from.',
        ja:
            'テキストを選択してコマンドパレット（<code>Cmd+Shift+P</code> / <code>Ctrl+Shift+P</code>）を開き、<code>Selection Manipulator</code> と入力すると、この拡張機能のコマンドが見つかります。' +
            'コマンド <code>Show Selection Manipulator Commands</code> を使うと、すべてのコマンドを 1 つの一覧から選べます。',
    },
    contextMenuHeading: { en: 'Context menu', ja: '右クリックメニュー' },
    contextMenu: {
        en: 'Right-click the selected text in the editor and open the <strong>Selection Manipulator</strong> submenu. The commands are grouped into submenus by kind.',
        ja: 'エディタで選択したテキストを右クリックし、<strong>Selection Manipulator</strong> サブメニューから実行します。コマンドは種類ごとのサブメニューにまとまっています。',
    },
    keybindingsHeading: { en: 'Keybindings', ja: 'キーバインド' },
    keybindings: {
        en: 'These commands have a default keybinding (you can change them in <strong>Keyboard Shortcuts</strong>):',
        ja: '次のコマンドには既定のキーバインドがあります（<strong>キーボード ショートカット</strong>で変更できます）。',
    },
    keybindingCommand: { en: 'Command', ja: 'コマンド' },
    keybindingMac: { en: 'Mac', ja: 'Mac' },
    keybindingOther: { en: 'Windows / Linux', ja: 'Windows・Linux' },
    multiSelectionHeading: { en: 'Multiple selections', ja: 'マルチセレクション' },
    multiSelection: {
        en:
            'With several selections (multiple cursors), a command is applied to each selection separately. ' +
            '<code>Convert to Multi Selection</code> splits a multi-line selection into one selection per line, and the Multi Cursor &amp; Selection commands keep, split, align or adjust selections.',
        ja:
            '選択範囲が複数あるとき（マルチカーソル）は、コマンドは各選択範囲に個別に適用されます。' +
            '<code>Convert to Multi Selection</code> で複数行の選択を 1 行ずつの選択に分けられ、マルチカーソル・選択操作のコマンドで選択を絞り込む・分割する・揃える・調整することもできます。',
    },
    outputHeading: { en: 'Where the result goes', ja: '結果の出力先' },
    outputs: {
        en: [
            '<strong>New read-only tab</strong>: many commands open the result in a new tab, which closes without asking to save.',
            '<strong>Replace the selection</strong>: the <code>(Replace)</code> versions, and the commands that edit text in place, replace the selected text with the result.',
            '<strong>Clipboard</strong>: the <code>(Clipboard)</code> versions copy the result to the clipboard.',
            '<strong>Notification</strong>: commands that count or check something show the result in a notification.',
        ],
        ja: [
            '<strong>新しい読み取り専用タブ</strong>: 多くのコマンドは結果を新しいタブに開きます。閉じるときに保存を確認されません。',
            '<strong>選択範囲の置き換え</strong>: <code>(Replace)</code> 版や、その場で編集するコマンドは、選択したテキストを結果で置き換えます。',
            '<strong>クリップボード</strong>: <code>(Clipboard)</code> 版は結果をクリップボードにコピーします。',
            '<strong>通知</strong>: 数えたり確かめたりするコマンドは、結果を通知で表示します。',
        ],
    },
    commandsHeading: { en: 'All commands', ja: 'コマンド一覧' },
    totalCount: { en: '<strong id="total-count">{count}</strong> commands', ja: '全 <strong id="total-count">{count}</strong> 件' },
    visibleBefore: { en: 'Showing', ja: '表示中' },
    visibleAfter: { en: '', ja: '件' },
    searchLabel: {
        en: 'Search (command ID, title, description or example; separate words with spaces to match all of them)',
        ja: 'キーワード検索（コマンド ID・タイトル・説明・例。空白区切りで AND）',
    },
    searchPlaceholder: { en: 'e.g. base64', ja: '例: base64' },
    filterLegend: { en: 'Filter by category', ja: 'カテゴリで絞り込み' },
    all: { en: 'All', ja: 'すべて' },
    unit: { en: 'commands', ja: '件' },
    sectionShowing: { en: 'Showing', ja: '表示' },
    empty: { en: 'No matching commands.', ja: '該当するコマンドはありません' },
    input: { en: 'Input', ja: '入力' },
    output: { en: 'Output', ja: '出力' },
    example: { en: 'Example', ja: '例' },
    legendSummary: { en: 'Notation of the examples', ja: '入出力例の表記' },
    legendItems: {
        en: [
            '<code>⏎</code> = line break',
            '<code>⇥</code> = tab',
            '<code>·</code> = a space that matters',
            '<code>{U+XXXX}</code> = an invisible character (its code point)',
            '<code>[a]</code> = a selection',
            '<code>|</code> = the cursor position',
            '<code>（notification）</code> = the result is shown in a notification',
            'Other remarks in full-width parentheses <code>（ ）</code> after an input are values typed when the command runs, the number of cursors, and similar notes.',
            '<code>\\n</code> in a string literal stands for the two characters “backslash + n” (a real line break is <code>⏎</code>).',
            'In the output of “Whitespace: Visualize Spaces and Tabs” and the input of “Whitespace: Restore Visualized Spaces and Tabs”, <code>·</code> and <code>→</code> are real characters, not notation.',
        ],
        ja: [
            '<code>⏎</code> = 改行',
            '<code>⇥</code> = タブ',
            '<code>·</code> = 意味のある空白',
            '<code>{U+XXXX}</code> = 不可視文字（コードポイント）',
            '<code>[a]</code> = 選択範囲',
            '<code>|</code> = カーソル位置',
            '<code>（通知）</code> = 結果を通知で表示する',
            '入力の後ろの全角括弧 <code>（ ）</code> は、コマンド実行時に入力する値やカーソル数などの補足です。',
            '文字列リテラルの <code>\\n</code> などは「バックスラッシュ + n」の 2 文字を表します（実際の改行は <code>⏎</code>）。',
            '「Whitespace: Visualize Spaces and Tabs」の出力側と「Whitespace: Restore Visualized Spaces and Tabs」の入力側では、<code>·</code> と <code>→</code> は表記記号ではなく実際の文字です。',
        ],
    },
});

function checkUiText() {
    for (const [key, value] of Object.entries(UI_TEXT)) {
        for (const lang of LANGUAGES) {
            const text = value[lang];
            const ok = Array.isArray(text) ? text.length > 0 && text.every((item) => item !== '') : typeof text === 'string';
            if (!ok) {
                throw new ShowcaseError(`UI_TEXT.${key} has no ${lang} text`);
            }
        }
        if (Array.isArray(value.en) !== Array.isArray(value.ja) || (Array.isArray(value.en) && value.en.length !== value.ja.length)) {
            throw new ShowcaseError(`UI_TEXT.${key}: the en and ja lists differ in length`);
        }
    }
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
  --control-border: #6e7781;
  --accent: #0b5cad;
  --accent-text: #ffffff;
  --code-bg: #eff1f3;
  --code-text: #1f2328;
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
    --control-border: #7d8590;
    --accent: #7cb4f5;
    --accent-text: #0d1117;
    --code-bg: #2a2e35;
    --code-text: #e6e8eb;
    --focus: #7cb4f5;
  }
}
html[data-lang="en"] [data-l="ja"], html[data-lang="ja"] [data-l="en"] { display: none !important; }
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
a { color: var(--accent); }
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
.top-row { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 8px 16px; }
h1 { font-size: 1.5rem; line-height: 1.3; margin: 0; }
.lang { display: flex; gap: 6px; }
.lang button {
  font: inherit;
  font-size: 0.9rem;
  padding: 3px 12px;
  border: 1px solid var(--control-border);
  border-radius: 8px;
  background: var(--surface);
  color: var(--text);
  cursor: pointer;
}
.lang button[aria-pressed="true"] { background: var(--accent); border-color: var(--accent); color: var(--accent-text); }
.lead { margin: 8px 0 0; color: var(--muted); }
.lead strong { color: var(--text); }
main { padding-top: 8px; padding-bottom: 32px; }
h2 { font-size: 1.3rem; line-height: 1.4; margin: 24px 0 8px; }
.usage { background: var(--surface); border: 1px solid var(--border); border-radius: 10px; padding: 4px 16px 12px; margin-top: 16px; }
.usage h3 { font-size: 1.05rem; margin: 16px 0 4px; }
.usage p, .usage ul { margin: 4px 0; }
.usage ul { padding-left: 1.2em; }
.keys { border-collapse: collapse; margin: 6px 0; font-size: 0.9rem; max-width: 100%; }
.keys th, .keys td { border: 1px solid var(--border); padding: 4px 8px; text-align: left; vertical-align: top; }
.keys-scroll { overflow-x: auto; }
.search { display: block; width: 100%; max-width: 560px; }
.search span.label { display: block; font-size: 0.85rem; color: var(--muted); margin-bottom: 2px; }
.search input {
  width: 100%;
  font: inherit;
  padding: 8px 10px;
  border: 1px solid var(--control-border);
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
  border: 1px solid var(--control-border);
  border-radius: 999px;
  background: var(--surface);
  color: var(--text);
  cursor: pointer;
  text-align: left;
}
.chip .n { color: var(--muted); margin-left: 2px; }
.sr-only {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  margin: -1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  white-space: nowrap;
  border: 0;
}
.chip[aria-pressed="true"] { background: var(--accent); border-color: var(--accent); color: var(--accent-text); }
.chip[aria-pressed="true"] .n { color: inherit; }
:focus-visible { outline: 2px solid var(--focus); outline-offset: 2px; }
.legend { margin-top: 12px; font-size: 0.85rem; color: var(--muted); }
.legend summary { cursor: pointer; }
.legend ul { margin: 6px 0 0; padding-left: 1.2em; }
.legend li { margin: 2px 0; }
.empty { padding: 24px 0; color: var(--muted); }
.empty p { margin: 0; }
section.cat { margin-top: 24px; }
h3.cat-h { font-size: 1.1rem; line-height: 1.4; margin: 0 0 10px; display: flex; flex-wrap: wrap; align-items: baseline; gap: 4px 10px; }
.cat-count { font-size: 0.85rem; font-weight: normal; color: var(--muted); }
.grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(min(100%, 320px), 1fr)); gap: 10px; }
.cmd {
  min-width: 0;
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: 10px;
  padding: 10px 12px;
}
.cmd h4 { font-size: 1rem; line-height: 1.4; margin: 0 0 4px; }
.meta { margin: 0 0 6px; display: flex; flex-wrap: wrap; gap: 4px 6px; align-items: center; min-width: 0; }
.meta code { font-size: 0.8rem; min-width: 0; }
.desc { margin: 0 0 6px; font-size: 0.9rem; }
.ex { margin: 0; display: grid; grid-template-columns: auto minmax(0, 1fr); gap: 2px 8px; font-size: 0.85rem; }
.ex dt { color: var(--muted); }
.ex dd { margin: 0; min-width: 0; }
`;

const HEAD_SCRIPT = (titles) => `
(function () {
  var root = document.documentElement;
  var lang = null;
  try {
    var saved = window.localStorage.getItem(${JSON.stringify(LANGUAGE_STORAGE_KEY)});
    if (saved === 'en' || saved === 'ja') { lang = saved; }
  } catch (e) {}
  if (!lang) {
    lang = String(navigator.language || '').toLowerCase().indexOf('ja') === 0 ? 'ja' : 'en';
  }
  root.setAttribute('lang', lang);
  root.setAttribute('data-lang', lang);
  document.title = ${JSON.stringify(titles)}[lang];
})();
`;

const BODY_SCRIPT = (titles) => `
(function () {
  var root = document.documentElement;
  var titles = ${JSON.stringify(titles)};
  var input = document.getElementById('q');
  var visible = document.getElementById('visible-count');
  var empty = document.getElementById('empty');
  var langButtons = Array.prototype.slice.call(document.querySelectorAll('button[data-set-lang]'));
  function applyLanguage(lang) {
    root.setAttribute('lang', lang);
    root.setAttribute('data-lang', lang);
    document.title = titles[lang];
    input.setAttribute('placeholder', input.getAttribute('data-placeholder-' + lang) || '');
    langButtons.forEach(function (button) {
      button.setAttribute('aria-pressed', String(button.getAttribute('data-set-lang') === lang));
    });
  }
  langButtons.forEach(function (button) {
    button.addEventListener('click', function () {
      var lang = button.getAttribute('data-set-lang');
      applyLanguage(lang);
      try { window.localStorage.setItem(${JSON.stringify(LANGUAGE_STORAGE_KEY)}, lang); } catch (e) {}
    });
  });
  applyLanguage(root.getAttribute('data-lang') === 'ja' ? 'ja' : 'en');

  var chips = Array.prototype.slice.call(document.querySelectorAll('.chip'));
  var sections = Array.prototype.slice.call(document.querySelectorAll('section.cat')).map(function (section) {
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

const fill = (html, count) => html.replace(/\{count\}/g, String(count));

/** Inline bilingual text: one span per language, only the current one is shown. */
function bi(pair, count = '') {
    return `<span data-l="en" lang="en">${fill(pair.en, count)}</span><span data-l="ja" lang="ja">${fill(pair.ja, count)}</span>`;
}

/** A block element per language, e.g. <p data-l="en" lang="en">…</p><p data-l="ja" lang="ja">…</p>. */
function biBlock(tag, attributes, pair, count = '') {
    const attrs = attributes ? ` ${attributes}` : '';
    return LANGUAGES.map((lang) => `<${tag}${attrs} data-l="${lang}" lang="${lang}">${fill(pair[lang], count)}</${tag}>`).join('');
}

function renderLegend() {
    const lists = LANGUAGES.map(
        (lang) => `<ul data-l="${lang}" lang="${lang}">\n${UI_TEXT.legendItems[lang].map((item) => `<li>${item}</li>`).join('\n')}\n</ul>`,
    );
    return `<details class="legend"><summary>${bi(UI_TEXT.legendSummary)}</summary>\n${lists.join('\n')}\n</details>`;
}

function exampleList(tokens, labels) {
    const split = splitExample(tokens);
    if (split) {
        return `<dt>${labels.input}</dt><dd>${renderInline(split.input)}</dd><dt>${labels.output}</dt><dd>${renderInline(split.output)}</dd>`;
    }
    return `<dt>${labels.example}</dt><dd>${renderInline(tokens)}</dd>`;
}

function renderExample(example) {
    if (example.en === example.ja) {
        // Nothing to translate: one list with bilingual labels.
        const labels = { input: bi(UI_TEXT.input), output: bi(UI_TEXT.output), example: bi(UI_TEXT.example) };
        return `<dl class="ex">${exampleList(parseInline(example.en), labels)}</dl>`;
    }
    return LANGUAGES.map((lang) => {
        const labels = { input: UI_TEXT.input[lang], output: UI_TEXT.output[lang], example: UI_TEXT.example[lang] };
        return `<dl class="ex" data-l="${lang}" lang="${lang}">${exampleList(parseInline(example[lang]), labels)}</dl>`;
    }).join('');
}

function renderItem(item) {
    const parts = [item.id, item.title];
    const body = [];
    body.push(`<h4>${escapeHtml(item.title)}</h4>`);
    body.push(`<p class="meta"><code>${escapeHtml(item.id)}</code></p>`);
    const descriptions = LANGUAGES.map((lang) => {
        const tokens = parseInline(item.description[lang]);
        parts.push(searchText(tokens));
        return `<p class="desc" data-l="${lang}" lang="${lang}">${renderInline(tokens)}</p>`;
    });
    body.push(descriptions.join(''));
    if (item.example !== undefined) {
        for (const lang of LANGUAGES) {
            if (lang === 'en' || item.example.ja !== item.example.en) {
                parts.push(searchText(parseInline(item.example[lang])));
            }
        }
        body.push(renderExample(item.example));
    }
    const search = parts.join(' ').normalize('NFKC').toLowerCase();
    return (
        `<article class="cmd" data-category="${escapeHtml(item.category)}" data-command-id="${escapeHtml(item.id)}" data-search="${escapeHtml(search)}">\n` +
        `${body.join('\n')}\n</article>`
    );
}

function escapedPair(pair) {
    return { en: escapeHtml(pair.en), ja: escapeHtml(pair.ja) };
}

function renderSection(category) {
    const id = escapeHtml(category.id);
    const count = category.items.length;
    return [
        `<section id="cat-${id}" class="cat" data-category="${id}" aria-labelledby="h-${id}">`,
        `<h3 id="h-${id}" class="cat-h">${bi(escapedPair(category.name))} ` +
            `<span class="cat-count">${bi(UI_TEXT.sectionShowing)} <span class="sec-visible">${count}</span> / ${count}` +
            `<span data-l="ja" lang="ja"> 件</span></span></h3>`,
        '<div class="grid">',
        ...category.items.map(renderItem),
        '</div>',
        '</section>',
    ].join('\n');
}

/**
 * A category filter button. The visible text is the category name in the
 * current language and the count; the unit is only for screen readers, so the
 * accessible name reads e.g. "Case and naming 30 commands". No title attribute.
 */
function renderChip({ filter, name, count, pressed }) {
    return (
        `<button type="button" class="chip" data-filter="${escapeHtml(filter)}" aria-pressed="${pressed}">` +
        `${bi(name)} <span class="n">${count}</span><span class="sr-only"> ${bi(UI_TEXT.unit)}</span></button>`
    );
}

function renderKeybindings(keybindings, titles) {
    const rows = keybindings.map((binding) => {
        const other = binding.win && binding.key && binding.win !== binding.key ? `${binding.win} (Windows) / ${binding.key} (Linux)` : (binding.win ?? binding.key ?? '');
        const title = titles.get(binding.command) ?? binding.command;
        return (
            `<tr data-keybinding="${escapeHtml(binding.command)}"><td>${escapeHtml(title)}<br><code>${escapeHtml(binding.command)}</code></td>` +
            `<td><code>${escapeHtml(binding.mac ?? binding.key ?? '')}</code></td><td><code>${escapeHtml(other)}</code></td></tr>`
        );
    });
    return [
        biBlock('p', '', UI_TEXT.keybindings),
        '<div class="keys-scroll"><table class="keys">',
        `<thead><tr><th scope="col">${bi(UI_TEXT.keybindingCommand)}</th><th scope="col">${bi(UI_TEXT.keybindingMac)}</th><th scope="col">${bi(UI_TEXT.keybindingOther)}</th></tr></thead>`,
        `<tbody>\n${rows.join('\n')}\n</tbody>`,
        '</table></div>',
    ].join('\n');
}

function renderUsage(total, keybindings, titles) {
    const outputs = LANGUAGES.map(
        (lang) => `<ul data-l="${lang}" lang="${lang}">\n${UI_TEXT.outputs[lang].map((item) => `<li>${item}</li>`).join('\n')}\n</ul>`,
    );
    return [
        '<section id="usage" class="usage" aria-labelledby="usage-h">',
        `<h2 id="usage-h">${bi(UI_TEXT.usageHeading)}</h2>`,
        `<h3 id="usage-overview">${bi(UI_TEXT.overviewHeading)}</h3>`,
        biBlock('p', '', UI_TEXT.overview, total),
        `<h3 id="usage-install">${bi(UI_TEXT.installHeading)}</h3>`,
        biBlock('p', '', UI_TEXT.install),
        `<h3 id="usage-palette">${bi(UI_TEXT.paletteHeading)}</h3>`,
        biBlock('p', '', UI_TEXT.palette),
        `<h3 id="usage-context-menu">${bi(UI_TEXT.contextMenuHeading)}</h3>`,
        biBlock('p', '', UI_TEXT.contextMenu),
        `<h3 id="usage-keybindings">${bi(UI_TEXT.keybindingsHeading)}</h3>`,
        renderKeybindings(keybindings, titles),
        `<h3 id="usage-multi-selection">${bi(UI_TEXT.multiSelectionHeading)}</h3>`,
        biBlock('p', '', UI_TEXT.multiSelection),
        `<h3 id="usage-output">${bi(UI_TEXT.outputHeading)}</h3>`,
        ...outputs,
        '</section>',
    ].join('\n');
}

/**
 * Builds the showcase page. Deterministic: the same inputs give the same
 * bytes (LF newlines, one final newline, no dates or paths).
 * Inputs: { packageJson, categories, categoryFiles } (file contents), see readInputs.
 */
export function buildShowcase(inputs) {
    checkUiText();
    const { categories, total, commandIds, titles, keybindings } = collectCommands(inputs);
    const pageTitles = { en: UI_TEXT.pageTitle.en, ja: UI_TEXT.pageTitle.ja };
    const chips = [renderChip({ filter: '', name: UI_TEXT.all, count: total, pressed: true })];
    for (const category of categories) {
        chips.push(renderChip({ filter: category.id, name: escapedPair(category.name), count: category.items.length, pressed: false }));
    }
    const html = [
        '<!doctype html>',
        '<html lang="en" data-lang="en">',
        '<head>',
        '<meta charset="utf-8">',
        '<meta name="viewport" content="width=device-width, initial-scale=1">',
        `<title>${escapeHtml(pageTitles.en)}</title>`,
        `<script>${HEAD_SCRIPT(pageTitles)}</script>`,
        `<style>${STYLE}</style>`,
        '</head>',
        '<body>',
        `<a class="skip" href="#main">${bi(UI_TEXT.skipLink)}</a>`,
        '<header class="top">',
        '<div class="wrap">',
        '<div class="top-row">',
        `<h1>${bi(escapedPair(UI_TEXT.pageTitle))}</h1>`,
        `<div class="lang" role="group" aria-label="Language / 言語">` +
            '<button type="button" data-set-lang="en" lang="en" aria-pressed="true">English</button>' +
            '<button type="button" data-set-lang="ja" lang="ja" aria-pressed="false">日本語</button></div>',
        '</div>',
        biBlock('p', 'class="lead"', UI_TEXT.lead, total),
        '</div>',
        '</header>',
        '<main id="main" class="wrap">',
        renderUsage(total, keybindings, titles),
        '<section id="commands" aria-labelledby="commands-h">',
        `<h2 id="commands-h">${bi(UI_TEXT.commandsHeading)}</h2>`,
        `<p class="lead">${bi(UI_TEXT.totalCount, total)} ・ ` +
            `<span role="status">${bi(UI_TEXT.visibleBefore)} <strong id="visible-count">${total}</strong><span data-l="ja" lang="ja"> ${UI_TEXT.visibleAfter.ja}</span></span></p>`,
        `<label class="search"><span class="label">${bi(UI_TEXT.searchLabel)}</span>` +
            `<input type="search" id="q" autocomplete="off" spellcheck="false" placeholder="${escapeHtml(UI_TEXT.searchPlaceholder.en)}" ` +
            `data-placeholder-en="${escapeHtml(UI_TEXT.searchPlaceholder.en)}" data-placeholder-ja="${escapeHtml(UI_TEXT.searchPlaceholder.ja)}"></label>`,
        `<fieldset class="filters"><legend>${bi(UI_TEXT.filterLegend)}</legend>`,
        ...chips,
        '</fieldset>',
        renderLegend(),
        `<div id="empty" class="empty" hidden>${biBlock('p', '', UI_TEXT.empty)}</div>`,
        ...categories.map(renderSection),
        '</section>',
        '</main>',
        `<script>${BODY_SCRIPT(pageTitles)}</script>`,
        '</body>',
        '</html>',
        '',
    ].join('\n');
    const counts = Object.fromEntries(categories.map((c) => [c.id, c.items.length]));
    return { html, stats: { total, counts, commandIds } };
}

// ---------------------------------------------------------------------------
// Verification
// ---------------------------------------------------------------------------

/**
 * Patterns of external resources the page must not load. A link (`<a href>`)
 * is a navigation, not a load, so the href of <a> elements is allowed.
 */
export const EXTERNAL_RESOURCE_PATTERNS = [
    /\bsrc\s*=\s*["']?\s*(https?:)?\/\//i,
    /<(?!a[\s>])[a-z][a-z0-9-]*\b[^>]*?\shref\s*=\s*["']?\s*(https?:)?\/\//i,
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
 * `commandIds` is the list of command ID strings (e.g. `stats.commandIds`
 * from `buildShowcase`).
 * Returns the list of problems (empty when the page is fine).
 */
export function checkShowcase(html, commandIds) {
    const errors = [];
    const found = new Map();
    for (const match of html.matchAll(/data-command-id="([^"]*)"/g)) {
        const id = unescapeAttribute(match[1]);
        found.set(id, (found.get(id) ?? 0) + 1);
    }
    const expectedSet = new Set(commandIds);
    for (const id of commandIds) {
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

/** Reads package.json, categories.json and every category file of the showcase data. */
export function readInputs(root = ROOT) {
    const dataDir = path.join(root, ...DATA_DIR.split('/'));
    const categoryFiles = {};
    for (const fileName of fs.readdirSync(dataDir).sort()) {
        if (fileName.endsWith('.json') && fileName !== CATEGORIES_FILE) {
            categoryFiles[fileName] = fs.readFileSync(path.join(dataDir, fileName), 'utf8');
        }
    }
    return {
        packageJson: fs.readFileSync(path.join(root, 'package.json'), 'utf8'),
        categories: fs.readFileSync(path.join(dataDir, CATEGORIES_FILE), 'utf8'),
        categoryFiles,
    };
}

function runCheck(root) {
    const inputs = readInputs(root);
    const first = buildShowcase(inputs);
    const second = buildShowcase(inputs);
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
    } else if (normalizeNewlines(onDisk) !== first.html) {
        errors.push(`${OUTPUT} is out of date; run "npm run showcase" and commit the result`);
    }
    errors.push(...checkShowcase(first.html, first.stats.commandIds));
    if (errors.length > 0) {
        for (const error of errors) {
            process.stderr.write(`error: ${error}\n`);
        }
        return 1;
    }
    process.stdout.write(`${OUTPUT} is up to date (${first.stats.total} commands, English and Japanese)\n`);
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
        if (error instanceof ShowcaseError || error instanceof SyntaxError || error?.code === 'ENOENT') {
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
