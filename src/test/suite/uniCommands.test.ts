import * as assert from 'assert';
import * as fs from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';
import { MAX_OUTPUT_LENGTH } from '../../handler/encodeTransforms';
import { myCommands } from '../../handler/showCommandsHandler';
import {
  UNI_MAX_SELECT_RANGES,
  UNI_NO_MATCH,
  UNI_NOTHING_SELECTED,
  uniCommandHandlerInternal,
  UniDependencies,
  UniPickItem,
} from '../../handler/uniCommandHandler';
import { UniInputError } from '../../handler/uniCommon';
import { UNI_COMMAND_ENTRIES, UniCommandEntry } from '../../handler/uniTransforms';
import { UNI2_COMMAND_ENTRIES } from '../../handler/uni2Transforms';
import { createTextEditor, undoIn } from './testUtils';
import { UNI_ROADMAP_EXAMPLES } from './uniExamples';
import { candidateRows } from './showcaseData';

const SEPARATOR = '\n---\n';
const NOT_CHANGED = 'The selection was not changed: ';
const NOT_SHOWN = 'No result was shown: ';
const NOT_SELECTED = 'Nothing was selected: ';
const FAMILY = '\u{1F468}\u200D\u{1F469}\u200D\u{1F467}';

const prefixOf = (entry: UniCommandEntry): string =>
  entry.output === 'replace' ? NOT_CHANGED : entry.output === 'select' ? NOT_SELECTED : NOT_SHOWN;

/**
 * Records what the handlers show and open instead of touching VS Code's UI. The quick pick answers
 * with the item whose value is `choice` (`undefined` = cancelled) and records its items.
 */
const recorder = (choice?: string, options: { onPick?: () => void | Thenable<unknown> } = {}) => {
  const infos: string[] = [];
  const warnings: string[] = [];
  const errors: string[] = [];
  const opened: string[] = [];
  const picks: { items: UniPickItem[]; options: vscode.QuickPickOptions }[] = [];
  const dependencies: UniDependencies = {
    notifier: {
      showInformationMessage: (message) => {
        infos.push(message);
        return Promise.resolve(undefined);
      },
      showWarningMessage: (message) => {
        warnings.push(message);
        return Promise.resolve(undefined);
      },
      showErrorMessage: (message) => {
        errors.push(message);
        return Promise.resolve(undefined);
      },
    },
    openResult: (content) => {
      opened.push(content);
      return Promise.resolve();
    },
    showQuickPick: async (items, pickOptions) => {
      picks.push({ items, options: pickOptions });
      await options.onPick?.();
      return choice === undefined ? undefined : items.find((item) => item.value === choice) ?? { label: choice, value: choice };
    },
  };
  return { dependencies, infos, warnings, errors, opened, picks };
};

const run = (entry: UniCommandEntry, dependencies: UniDependencies, entries: readonly UniCommandEntry[] = UNI_COMMAND_ENTRIES) =>
  uniCommandHandlerInternal(dependencies, entries)(entry.name);

const entryOf = (id: string): UniCommandEntry => {
  const found = UNI_COMMAND_ENTRIES.find((entry) => entry.id === id);
  assert.ok(found, id);
  return found;
};

const selectWholeDocument = (editor: vscode.TextEditor) => {
  const document = editor.document;
  editor.selection = new vscode.Selection(new vscode.Position(0, 0), document.lineAt(document.lineCount - 1).range.end);
};

/** Selects the blocks of a `block---block---...` document with one cursor each. */
const selectBlocks = (editor: vscode.TextEditor, blocks: string[], separator = SEPARATOR, reversed = false) => {
  const document = editor.document;
  const selections: vscode.Selection[] = [];
  let offset = 0;
  blocks.forEach((block) => {
    selections.push(new vscode.Selection(document.positionAt(offset), document.positionAt(offset + block.length)));
    offset += block.length + separator.length;
  });
  editor.selections = reversed ? selections.reverse() : selections;
};

const crlfEditor = async (text: string): Promise<vscode.TextEditor> => {
  const editor = await createTextEditor(text);
  await editor.edit((editBuilder) => editBuilder.setEndOfLine(vscode.EndOfLine.CRLF));
  assert.strictEqual(editor.document.getText(), text.replace(/\n/g, '\r\n'));
  return editor;
};

const closeAllEditors = async () => {
  for (let i = 0; i < 20 && vscode.window.visibleTextEditors.length > 0; i++) {
    await vscode.commands.executeCommand('workbench.action.revertAndCloseActiveEditor');
  }
};

const readRepoFile = (file: string): string => fs.readFileSync(path.resolve(__dirname, '../../..', file), 'utf8');

/** The UNI commands of the showcase data (scripts/showcase-data/UNI.json): [id, kind, command ID, title, example]. */
const dataRows = (): [string, string, string, string, string][] => candidateRows('UNI');

/** Expands the notation of the ROADMAP examples: `{U+XXXX}`, `⏎` (line break) and `·` (space). */
const expandNotation = (text: string): string =>
  text
    .replace(/\{U\+([0-9A-F]{4,6})\}/g, (_match, hex: string) => String.fromCodePoint(parseInt(hex, 16)))
    .replace(/⏎/g, '\n')
    .replace(/·/g, ' ');

/** Commands of a fake table that exercise the notify / select / quick pick paths in isolation. */
const FAKE_ENTRIES: readonly UniCommandEntry[] = [
  {
    id: 'FAKE-1', name: 'test.count', title: 'Count', output: 'notify',
    combine: (texts) => {
      if (texts.some((text) => text.includes('!'))) {
        throw new UniInputError('bad text');
      }
      return `${texts.length} selections, ${texts.join('').length} characters`;
    },
  },
  {
    id: 'FAKE-2', name: 'test.select-x', title: 'Select X', output: 'select', noMatchMessage: 'No x was found.',
    select: (text) => {
      const ranges = [];
      for (let i = text.indexOf('x'); i !== -1; i = text.indexOf('x', i + 1)) {
        ranges.push({ start: i, end: i + 1 });
      }
      return ranges;
    },
  },
  {
    id: 'FAKE-3', name: 'test.select-none', title: 'Select Nothing', output: 'select', select: () => [],
  },
  {
    id: 'FAKE-4', name: 'test.pick', title: 'Pick', output: 'replace',
    quickPick: { placeHolder: 'Choose', items: [{ label: 'A', description: 'the letter a', value: 'a' }, { label: 'B', value: 'b' }] },
    transform: (text, context) => text.replace(/[ab]/g, context.choice!),
  },
  {
    id: 'FAKE-5', name: 'test.select-surrogate', title: 'Select Surrogate Pairs', output: 'select',
    select: (text) => {
      const ranges = [];
      for (const match of text.matchAll(/[\u{10000}-\u{10FFFF}]/gu)) {
        ranges.push({ start: match.index!, end: match.index! + match[0].length });
      }
      return ranges;
    },
    foundMessage: (found) => `${found.length} found: ${found.join(' ')}`,
  },
  {
    id: 'FAKE-6', name: 'test.select-x-bad-message', title: 'Select X (broken message)', output: 'select',
    select: (text) => (text.includes('x') ? [{ start: text.indexOf('x'), end: text.indexOf('x') + 1 }] : []),
    foundMessage: () => {
      throw new Error('broken');
    },
  },
];

const fake = (name: string): UniCommandEntry => FAKE_ENTRIES.find((entry) => entry.name === name)!;

suite('Unicode Commands (UNI-001..030) Test Suite', () => {

  teardown(closeAllEditors);

  suite('each command (ROADMAP example)', () => {
    UNI_COMMAND_ENTRIES.forEach((entry) => {
      const example = UNI_ROADMAP_EXAMPLES[entry.id];

      test(`${entry.id} ${entry.name}: ${entry.output} for two selections`, async () => {
        const { dependencies, infos, warnings, errors, opened } = recorder(example.choice);
        const blocks = [example.input, example.input];
        const editor = await createTextEditor(blocks.join(SEPARATOR));
        selectBlocks(editor, blocks, SEPARATOR, true);
        await run(entry, dependencies)(editor);
        assert.deepStrictEqual([warnings, errors], [[], []]);
        switch (entry.output) {
          case 'replace':
            assert.strictEqual(editor.document.getText(), [example.expected, example.expected].join(SEPARATOR));
            assert.deepStrictEqual([infos, opened], [[], []]);
            await undoIn(editor);
            assert.strictEqual(editor.document.getText(), blocks.join(SEPARATOR));
            break;
          case 'new-tab':
            assert.deepStrictEqual([opened, infos], [[[example.expected, example.expected].join('\n')], []]);
            assert.strictEqual(editor.document.getText(), blocks.join(SEPARATOR));
            break;
          case 'notify':
            assert.ok(example.twice !== undefined, entry.id);
            assert.deepStrictEqual([infos, opened], [[example.twice], []]);
            assert.strictEqual(editor.document.getText(), blocks.join(SEPARATOR));
            break;
          case 'select':
            assert.ok(example.selected !== undefined, entry.id);
            assert.deepStrictEqual([infos, opened], [example.foundTwice === undefined ? [] : [example.foundTwice], []]);
            assert.deepStrictEqual(editor.selections.map((selection) => editor.document.getText(selection)), [...example.selected, ...example.selected]);
            assert.strictEqual(editor.document.getText(), blocks.join(SEPARATOR));
            break;
          default:
            assert.fail(`${entry.id}: no test for the output ${entry.output}`);
        }
      });

      test(`${entry.id} ${entry.name}: only empty or blank selections warn`, async () => {
        const { dependencies, warnings, errors, opened, infos, picks } = recorder(example.choice);
        const text = `${example.input}\n  \n\t\n`;
        const editor = await createTextEditor(text);
        editor.selections = [new vscode.Selection(0, 0, 0, 0), new vscode.Selection(1, 0, 3, 0)];
        await run(entry, dependencies)(editor);
        assert.strictEqual(editor.document.getText(), text);
        assert.deepStrictEqual([warnings, errors, opened, infos], [[UNI_NOTHING_SELECTED], [], [], []]);
        assert.strictEqual(picks.length, 0);
      });
    });
  });

  suite('selections and errors', () => {
    test('new editor: results in document order, blank selections skipped', async () => {
      const { dependencies, opened } = recorder();
      const blocks = ['a', '   ', 'b\n\nc'];
      const editor = await createTextEditor(blocks.join(SEPARATOR));
      selectBlocks(editor, blocks, SEPARATOR, true);
      await run(entryOf('UNI-007'), dependencies)(editor);
      assert.deepStrictEqual(opened, ['U+0061\nU+0062\n\nU+0063']);
    });

    test('Replace: each selection is converted on its own; only those that change are edited, in one step', async () => {
      const blocks = ['a\u200Bb', 'plain', `x${FAMILY}\u200By`];
      const editor = await createTextEditor(blocks.join(SEPARATOR));
      selectBlocks(editor, blocks);
      await run(entryOf('UNI-005'), recorder().dependencies)(editor);
      assert.strictEqual(editor.document.getText(), ['ab', 'plain', `x${FAMILY}y`].join(SEPARATOR));
      await undoIn(editor);
      assert.strictEqual(editor.document.getText(), blocks.join(SEPARATOR));
    });

    test('one invalid selection among several changes nothing; the message names the selection', async () => {
      const { dependencies, errors } = recorder();
      const blocks = ['U+0041', 'U+D800'];
      const editor = await createTextEditor(blocks.join(SEPARATOR));
      selectBlocks(editor, blocks);
      await run(entryOf('UNI-008'), dependencies)(editor);
      assert.strictEqual(editor.document.getText(), blocks.join(SEPARATOR));
      assert.deepStrictEqual(errors, [`${NOT_CHANGED}selection 2 of 2: "U+D800" is a surrogate code point, not a character`]);
    });

    test('one selection: the message has no selection number', async () => {
      const { dependencies, errors } = recorder();
      const editor = await createTextEditor('U+110000');
      selectWholeDocument(editor);
      await run(entryOf('UNI-008'), dependencies)(editor);
      assert.deepStrictEqual(errors, [`${NOT_CHANGED}"U+110000" is beyond U+10FFFF, the last code point`]);
    });

    test('the output limit only warns', async function () {
      this.timeout(60_000);
      const { dependencies, warnings, errors, opened } = recorder();
      // Every code point becomes `U+XXXX` and a space: 2 × 999,999 × 7 characters exceed the limit.
      const block = 'a'.repeat(999_999);
      const blocks = [block, block];
      const editor = await createTextEditor(blocks.join(SEPARATOR));
      selectBlocks(editor, blocks);
      await run(entryOf('UNI-007'), dependencies)(editor);
      assert.deepStrictEqual([opened, errors], [[], []]);
      assert.deepStrictEqual(warnings, [`${NOT_SHOWN}the result would be longer than ${MAX_OUTPUT_LENGTH.toLocaleString('en-US')} characters. Select less text.`]);
    });

    test('a selection over 1,000,000 characters is refused (new editor, Replace and notification)', async function () {
      this.timeout(60_000);
      const editor = await createTextEditor('a'.repeat(1_000_001));
      selectWholeDocument(editor);
      for (const id of ['UNI-007', 'UNI-001', 'UNI-011']) {
        const { dependencies, errors, opened, infos } = recorder();
        await run(entryOf(id), dependencies)(editor);
        assert.deepStrictEqual([opened, infos], [[], []], id);
        assert.deepStrictEqual(errors, [`${prefixOf(entryOf(id))}the selection is longer than 1,000,000 characters`], id);
      }
      assert.strictEqual(editor.document.getText().length, 1_000_001);
    });

    test('long selected text is never quoted in full in a message', async () => {
      const secret = `U+${'1'.repeat(200)}`;
      const { dependencies, errors } = recorder();
      const editor = await createTextEditor(`${secret} U+D800 ${secret}`);
      selectWholeDocument(editor);
      await run(entryOf('UNI-008'), dependencies)(editor);
      assert.strictEqual(errors.length, 1);
      assert.ok(!errors[0].includes(secret), errors[0]);
    });

    test('surrogate pairs, combining marks and emoji sequences are kept whole', async () => {
      const text = `𠮷e\u0301${FAMILY}🇯🇵\u200B`;
      const editor = await createTextEditor(text);
      selectWholeDocument(editor);
      await run(entryOf('UNI-005'), recorder().dependencies)(editor);
      assert.strictEqual(editor.document.getText(), `𠮷e\u0301${FAMILY}🇯🇵`);
      await run(entryOf('UNI-014'), recorder().dependencies)(editor);
      assert.strictEqual(editor.document.getText(), '𠮷e\u0301');
    });
  });

  suite('commands UNI-001..015', () => {
    test('UNI-011: all selections are counted together', async () => {
      const { dependencies, infos } = recorder();
      const blocks = ['ab', `e\u0301${FAMILY}`];
      const editor = await createTextEditor(blocks.join(SEPARATOR));
      selectBlocks(editor, blocks);
      await run(entryOf('UNI-011'), dependencies)(editor);
      assert.deepStrictEqual(infos, ['4 graphemes / length 12']);
    });

    test('UNI-015: nothing found shows a message instead of an empty editor', async () => {
      const none = recorder();
      const blocks = ['no emoji', '© #1'];
      const editor = await createTextEditor(blocks.join(SEPARATOR));
      selectBlocks(editor, blocks);
      await run(entryOf('UNI-015'), none.dependencies)(editor);
      assert.deepStrictEqual([none.infos, none.opened], [['No emoji was found in the selection.'], []]);

      const some = recorder();
      const mixed = ['no emoji', 'go🚀'];
      const mixedEditor = await createTextEditor(mixed.join(SEPARATOR));
      selectBlocks(mixedEditor, mixed);
      await run(entryOf('UNI-015'), some.dependencies)(mixedEditor);
      assert.deepStrictEqual(some.opened, ['\n🚀']);
    });

    test('UNI-006 / 008 / 012: Replace keeps the CRLF line breaks', async () => {
      const editor = await crlfEditor('a\u200Bb\nc\u0007d');
      selectWholeDocument(editor);
      await run(entryOf('UNI-006'), recorder().dependencies)(editor);
      assert.strictEqual(editor.document.getText(), 'a<U+200B>b\r\nc<U+0007>d');
      await run(entryOf('UNI-008'), recorder().dependencies)(editor);
      assert.strictEqual(editor.document.getText(), 'a\u200Bb\r\nc\u0007d');
      await run(entryOf('UNI-012'), recorder().dependencies)(editor);
      assert.strictEqual(editor.document.getText(), 'a\u200Bb\r\ncd');
    });

    test('UNI-007 / 009: new editor results use the document EOL', async () => {
      const blocks = ['a\nb', 'c'];
      const editor = await crlfEditor(blocks.join(SEPARATOR));
      selectBlocks(editor, ['a\r\nb', 'c'], SEPARATOR.replace(/\n/g, '\r\n'));
      const codePoints = recorder();
      await run(entryOf('UNI-007'), codePoints.dependencies)(editor);
      assert.deepStrictEqual(codePoints.opened, ['U+0061\r\nU+0062\r\nU+0063']);
      const bytes = recorder();
      await run(entryOf('UNI-009'), bytes.dependencies)(editor);
      assert.deepStrictEqual(bytes.opened, ['a: 61\r\n<U+000D><U+000A>: 0D 0A\r\nb: 62\r\nc: 63']);
    });
  });

  suite('commands UNI-016..030', () => {
    test('UNI-023 / 024: the quick pick offers digits and signs first, and letters too', async () => {
      for (const [id, choice, input, expected] of [
        ['UNI-023', 'digits', 'x2 + n', 'x² ⁺ n'],
        ['UNI-023', 'letters', 'x2 + n', 'ˣ² ⁺ ⁿ'],
        ['UNI-024', 'digits', 'H2O a', 'H₂O a'],
        ['UNI-024', 'letters', 'H2O a', 'H₂O ₐ'],
      ]) {
        const { dependencies, picks } = recorder(choice);
        const editor = await createTextEditor(input);
        selectWholeDocument(editor);
        await run(entryOf(id), dependencies)(editor);
        assert.strictEqual(editor.document.getText(), expected, `${id} ${choice}`);
        assert.strictEqual(picks.length, 1);
        assert.deepStrictEqual(picks[0].items.map((item) => item.value), ['digits', 'letters']);
        assert.deepStrictEqual(picks[0].items.map((item) => item.label), ['Digits and Signs', 'Digits, Signs and Letters']);
      }
    });

    test('UNI-023: cancelling the quick pick changes nothing', async () => {
      const { dependencies, infos, warnings, errors } = recorder(undefined);
      const editor = await createTextEditor('x2');
      selectWholeDocument(editor);
      await run(entryOf('UNI-023'), dependencies)(editor);
      assert.strictEqual(editor.document.getText(), 'x2');
      assert.deepStrictEqual([infos, warnings, errors], [[], [], []]);
    });

    test('UNI-025: every confusable character is selected and each kind is listed once', async () => {
      const { dependencies, infos } = recorder();
      const blocks = ['pаypаl and login раура', 'Привет, а сок'];
      const editor = await createTextEditor(blocks.join(SEPARATOR));
      selectBlocks(editor, blocks, SEPARATOR, true);
      await run(entryOf('UNI-025'), dependencies)(editor);
      assert.deepStrictEqual(editor.selections.map((selection) => editor.document.getText(selection)), ['а', 'а', 'р', 'а', 'у', 'р', 'а']);
      assert.deepStrictEqual(editor.selections.map((selection) => editor.document.offsetAt(selection.start)), [1, 4, 17, 18, 19, 20, 21]);
      assert.deepStrictEqual(infos, ['7 confusable characters found: "а" (U+0430) looks like "a", "р" (U+0440) looks like "p", "у" (U+0443) looks like "y"']);
    });

    test('UNI-025 / 026: nothing found keeps the selection and says so', async () => {
      for (const [id, message] of [['UNI-025', 'No confusable characters were found.'], ['UNI-026', 'No bidi control characters were found.']]) {
        const { dependencies, infos, errors } = recorder();
        const editor = await createTextEditor('Το API και το SDK');
        selectWholeDocument(editor);
        await run(entryOf(id), dependencies)(editor);
        assert.deepStrictEqual([infos, errors], [[message], []], id);
        assert.strictEqual(editor.document.getText(editor.selection), 'Το API και το SDK', id);
      }
    });

    test('UNI-026: all bidi controls of all selections are selected', async () => {
      const { dependencies, infos } = recorder();
      const blocks = ['if (a\u202E) {\u2066x\u2069}', 'b\u202E'];
      const editor = await createTextEditor(blocks.join(SEPARATOR));
      selectBlocks(editor, blocks);
      await run(entryOf('UNI-026'), dependencies)(editor);
      assert.deepStrictEqual(editor.selections.map((selection) => editor.document.getText(selection)), ['\u202E', '\u2066', '\u2069', '\u202E']);
      assert.deepStrictEqual(infos, ['4 bidi control characters found: U+202E (right-to-left override), U+2066 (left-to-right isolate), U+2069 (pop directional isolate)']);
    });

    test('UNI-029: all selections are counted together; no letters gives a message', async () => {
      const { dependencies, infos } = recorder();
      const blocks = ['Hello 123', 'Привет 漢字'];
      const editor = await createTextEditor(blocks.join(SEPARATOR));
      selectBlocks(editor, blocks);
      await run(entryOf('UNI-029'), dependencies)(editor);
      assert.deepStrictEqual(infos, ['Latin 5, Cyrillic 6, Han 2']);

      const none = recorder();
      const digits = await createTextEditor('123 !?');
      selectWholeDocument(digits);
      await run(entryOf('UNI-029'), none.dependencies)(digits);
      assert.deepStrictEqual(none.infos, ['No letters of any script were found (only digits, symbols and spaces).']);
    });

    test('UNI-020 / 021 / 027 / 030: Replace keeps the CRLF line breaks', async () => {
      const editor = await crlfEditor('ab\ncd');
      selectWholeDocument(editor);
      await run(entryOf('UNI-020'), recorder().dependencies)(editor);
      assert.strictEqual(editor.document.getText(), 'pɔ\r\nqɐ');
      await run(entryOf('UNI-021'), recorder().dependencies)(editor);
      assert.strictEqual(editor.document.getText(), 'p\u0336ɔ\u0336\r\nq\u0336ɐ\u0336');

      const quotes = await crlfEditor('"a"\n\'b\'');
      selectWholeDocument(quotes);
      await run(entryOf('UNI-027'), recorder().dependencies)(quotes);
      assert.strictEqual(quotes.document.getText(), '“a”\r\n‘b’');

      const cyrillic = await crlfEditor('Жук\nПЛЮЩ');
      selectWholeDocument(cyrillic);
      await run(entryOf('UNI-030'), recorder().dependencies)(cyrillic);
      assert.strictEqual(cyrillic.document.getText(), 'Zhuk\r\nPLYUSHCH');
    });

    test('UNI-016 / 020 / 021: surrogate pairs, combining marks and emoji sequences are kept whole', async () => {
      const editor = await createTextEditor(`a𠮷e\u0301${FAMILY}`);
      selectWholeDocument(editor);
      await run(entryOf('UNI-016'), recorder().dependencies)(editor);
      assert.strictEqual(editor.document.getText(), `𝐚𠮷𝐞\u0301${FAMILY}`);
      await run(entryOf('UNI-020'), recorder().dependencies)(editor);
      assert.strictEqual(editor.document.getText(), `${FAMILY}𝐞\u0301𠮷𝐚`);
      await run(entryOf('UNI-021'), recorder().dependencies)(editor);
      assert.strictEqual(editor.document.getText(), `${FAMILY}\u0336𝐞\u0301\u0336𠮷\u0336𝐚\u0336`);
    });
  });

  suite('outputs for the other commands (fake command table)', () => {
    test('notify: all selections together in one message; a failure shows nothing', async () => {
      const ok = recorder();
      const blocks = ['ab', 'cde'];
      const editor = await createTextEditor(blocks.join(SEPARATOR));
      selectBlocks(editor, blocks);
      await run(fake('test.count'), ok.dependencies, FAKE_ENTRIES)(editor);
      assert.deepStrictEqual([ok.infos, ok.errors, ok.opened], [['2 selections, 5 characters'], [], []]);

      const bad = recorder();
      const badEditor = await createTextEditor('a!');
      selectWholeDocument(badEditor);
      await run(fake('test.count'), bad.dependencies, FAKE_ENTRIES)(badEditor);
      assert.deepStrictEqual([bad.infos, bad.errors], [[], ['No result was shown: bad text']]);
    });

    test('select: the ranges of every selection become the new selections', async () => {
      const { dependencies, infos, errors } = recorder();
      const blocks = ['axbx', '𠮷x'];
      const editor = await createTextEditor(blocks.join(SEPARATOR));
      selectBlocks(editor, blocks, SEPARATOR, true);
      await run(fake('test.select-x'), dependencies, FAKE_ENTRIES)(editor);
      assert.deepStrictEqual([infos, errors], [[], []]);
      assert.deepStrictEqual(editor.selections.map((selection) => editor.document.getText(selection)), ['x', 'x', 'x']);
      assert.deepStrictEqual(editor.selections.map((selection) => editor.document.offsetAt(selection.start)), [1, 3, 11]);
    });

    test('select: the found message tells what was selected in all selections', async () => {
      const { dependencies, infos, errors } = recorder();
      const blocks = ['a𠮷b', '😀'];
      const editor = await createTextEditor(blocks.join(SEPARATOR));
      selectBlocks(editor, blocks, SEPARATOR, true);
      await run(fake('test.select-surrogate'), dependencies, FAKE_ENTRIES)(editor);
      assert.deepStrictEqual(editor.selections.map((selection) => editor.document.getText(selection)), ['𠮷', '😀']);
      assert.deepStrictEqual([infos, errors], [['2 found: 𠮷 😀'], []]);
    });

    test('select: a found message that fails keeps the selection and shows nothing', async () => {
      const { dependencies, infos, errors } = recorder();
      const editor = await createTextEditor('axb');
      selectWholeDocument(editor);
      await run(fake('test.select-x-bad-message'), dependencies, FAKE_ENTRIES)(editor);
      assert.strictEqual(editor.document.getText(editor.selection), 'x');
      assert.deepStrictEqual([infos, errors], [[], []]);
    });

    test('select: nothing found keeps the selections and says so', async () => {
      for (const [name, message] of [['test.select-x', 'No x was found.'], ['test.select-none', UNI_NO_MATCH]]) {
        const { dependencies, infos } = recorder();
        const editor = await createTextEditor('abc');
        selectWholeDocument(editor);
        await run(fake(name), dependencies, FAKE_ENTRIES)(editor);
        assert.deepStrictEqual(infos, [message]);
        assert.strictEqual(editor.document.getText(editor.selection), 'abc');
      }
    });

    test(`select: more than ${UNI_MAX_SELECT_RANGES} places select nothing`, async () => {
      const { dependencies, errors } = recorder();
      const editor = await createTextEditor('x'.repeat(UNI_MAX_SELECT_RANGES + 1));
      selectWholeDocument(editor);
      await run(fake('test.select-x'), dependencies, FAKE_ENTRIES)(editor);
      assert.deepStrictEqual(errors, ['Nothing was selected: more than 10,000 places were found; select less text']);
      assert.strictEqual(editor.selections.length, 1);
    });

    test('quick pick: asked once for all selections, with its items; the choice is used', async () => {
      const { dependencies, picks } = recorder('b');
      const blocks = ['a-a', 'b-a'];
      const editor = await createTextEditor(blocks.join(SEPARATOR));
      selectBlocks(editor, blocks);
      await run(fake('test.pick'), dependencies, FAKE_ENTRIES)(editor);
      assert.strictEqual(editor.document.getText(), ['b-b', 'b-b'].join(SEPARATOR));
      assert.strictEqual(picks.length, 1);
      assert.deepStrictEqual(picks[0].items, [{ label: 'A', description: 'the letter a', value: 'a' }, { label: 'B', value: 'b' }]);
      assert.deepStrictEqual(picks[0].options, { placeHolder: 'Choose', ignoreFocusOut: true });
    });

    test('quick pick: cancelling or an unknown value does nothing', async () => {
      for (const choice of [undefined, 'z']) {
        const { dependencies, infos, warnings, errors } = recorder(choice);
        const editor = await createTextEditor('a-b');
        selectWholeDocument(editor);
        await run(fake('test.pick'), dependencies, FAKE_ENTRIES)(editor);
        assert.strictEqual(editor.document.getText(), 'a-b');
        assert.deepStrictEqual([infos, warnings, errors], [[], [], []]);
      }
    });

    test('quick pick: the selections are read again after it closes', async () => {
      const editor = await createTextEditor('x\na');
      editor.selection = new vscode.Selection(1, 0, 1, 1);
      const { dependencies } = recorder('b', {
        onPick: async () => {
          await editor.edit((editBuilder) => editBuilder.insert(new vscode.Position(0, 0), 'y\n'));
        },
      });
      await run(fake('test.pick'), dependencies, FAKE_ENTRIES)(editor);
      assert.strictEqual(editor.document.getText(), 'y\nx\nb');
    });
  });

  suite('source files', () => {
    // Invisible, format, bidi control and combining characters are written as \u escapes so that
    // the sources can be read and reviewed (and never carry a Trojan Source); tab, LF, CR and the
    // space are the only white space written as they are.
    const HIDDEN = /[\p{Cc}\p{Cf}\p{Z}\p{M}]/u;
    const BIDI_CONTROL = /[\u202A-\u202E\u2066-\u2069]/u;
    const sourceFiles = (dir: string): string[] =>
      fs.readdirSync(path.resolve(__dirname, '../../..', dir), { withFileTypes: true }).flatMap((dirent) =>
        dirent.isDirectory() ? sourceFiles(`${dir}/${dirent.name}`) : dirent.name.endsWith('.ts') ? [`${dir}/${dirent.name}`] : []);

    test('the UNI sources hold no literal invisible, format or combining characters', () => {
      const files = sourceFiles('src').filter((file) => /\/uni[A-Z][A-Za-z]*(\.test)?\.ts$/.test(file));
      assert.ok(files.length >= 8, files.join(', '));
      for (const file of files) {
        readRepoFile(file).split('\n').forEach((line, index) => {
          const hidden = [...line].find((ch) => ch !== '\t' && ch !== '\r' && ch !== ' ' && HIDDEN.test(ch));
          assert.strictEqual(hidden, undefined, `${file}:${index + 1}: U+${hidden?.codePointAt(0)!.toString(16).toUpperCase()}`);
        });
      }
    });

    test('no source holds a bidi control character', () => {
      for (const file of sourceFiles('src')) {
        assert.ok(!BIDI_CONTROL.test(readRepoFile(file)), file);
      }
    });
  });

  suite('registration', () => {
    test('command IDs, kinds, titles and examples match the UNI commands of the showcase data, in its order', () => {
      const rows = dataRows();
      assert.strictEqual(rows.length, 30);
      const byId = new Map(rows.map((row) => [row[0], row]));
      const order = rows.map(([id]) => id);
      assert.deepStrictEqual(UNI_COMMAND_ENTRIES.map((entry) => entry.id), order, 'the ROADMAP rows, in their order');
      assert.deepStrictEqual(Object.keys(UNI_ROADMAP_EXAMPLES).sort(), [...order].sort(), 'an example for every command');
      for (const entry of UNI_COMMAND_ENTRIES) {
        const row = byId.get(entry.id);
        assert.ok(row, entry.id);
        const [id, kind, command, title, example] = row;
        assert.strictEqual(kind, '基本', id);
        assert.strictEqual(command, `selection-manipulator.${entry.name}`, id);
        assert.strictEqual(title, entry.title, id);
        const match = /^`(.*)` → `(.*)`$/.exec(example);
        assert.ok(match, `${id}: ${example}`);
        const expected = UNI_ROADMAP_EXAMPLES[id];
        let input = expandNotation(match[1]);
        const noted = /^(.*)（(.*)）$/s.exec(input);
        if (noted) {
          input = noted[1];
          assert.strictEqual(noted[2], expected.note, id);
        } else {
          assert.strictEqual(expected.note, undefined, id);
        }
        assert.strictEqual(input, expected.input, id);
        assert.strictEqual(expandNotation(match[2]), expected.roadmapOutput ?? expected.expected, id);
      }
    });

    // The wiring in extension.ts is checked statically (as for the other categories).
    test('extension.ts registers every command with uniCommandHandler exactly once', () => {
      const source = readRepoFile('src/extension.ts');
      UNI_COMMAND_ENTRIES.forEach((entry) => {
        const registration = `registerTextEditorCommand('selection-manipulator.${entry.name}', uniCommandHandler('${entry.name}'))`;
        assert.strictEqual(source.split(registration).length - 1, 1, registration);
        assert.strictEqual(source.split(`'selection-manipulator.${entry.name}'`).length - 1, 1, entry.name);
      });
    });

    test('package.json and the Show Commands list register every command exactly once', () => {
      const contributes = JSON.parse(readRepoFile('package.json')).contributes;
      type MenuItem = { command?: string; submenu?: string; group?: string; when?: string };
      const count = (entries: MenuItem[], id: string) => entries.filter((entry) => entry.command === id).length;
      UNI_COMMAND_ENTRIES.forEach((entry) => {
        const id = `selection-manipulator.${entry.name}`;
        assert.strictEqual(count(contributes.commands, id), 1, `commands: ${id}`);
        assert.strictEqual(count(myCommands, id), 1, `showCommands: ${id}`);
        const command = contributes.commands.find((c: { command: string }) => c.command === id);
        assert.deepStrictEqual(command, { command: id, title: entry.title, category: 'Selection Manipulator' });
        const shown = myCommands.find((c) => c.command === id);
        assert.strictEqual(shown?.title, entry.title);
        assert.strictEqual(shown?.canMultiSelection, true);
        const palette = contributes.menus.commandPalette.filter((c: MenuItem) => c.command === id);
        assert.deepStrictEqual(palette, [{ when: 'editorHasSelection', command: id }], id);
        Object.entries(contributes.menus).filter(([name]) => name !== 'commandPalette').forEach(([name, items]) =>
          assert.strictEqual(count(items as MenuItem[], id), name === 'selection-manipulator.unicode.submenu' ? 1 : 0, `${name}: ${id}`));
      });
      const ids = contributes.commands.map((c: { command: string }) => c.command);
      assert.strictEqual(new Set(ids).size, ids.length, 'command IDs are unique');
      const titles = contributes.commands.map((c: { title: string; category?: string }) => `${c.category ?? ''}:${c.title}`);
      assert.strictEqual(new Set(titles).size, titles.length, 'command titles are unique');
      const allTitles = myCommands.map((c) => c.title);
      assert.strictEqual(new Set(allTitles).size, allTitles.length, 'Show Commands titles are unique');
    });

    test('the new Unicode submenu holds the commands in ROADMAP order (then JAUNIX-008..014), at @16 in the root submenu', () => {
      const contributes = JSON.parse(readRepoFile('package.json')).contributes;
      assert.deepStrictEqual(contributes.submenus.filter((s: { id: string }) => s.id === 'selection-manipulator.unicode.submenu'),
        [{ id: 'selection-manipulator.unicode.submenu', label: 'Unicode' }]);
      const items: { command: string; group: string }[] = contributes.menus['selection-manipulator.unicode.submenu'];
      assert.deepStrictEqual(items.map((item) => item.command),
        [...UNI_COMMAND_ENTRIES, ...UNI2_COMMAND_ENTRIES].map((entry) => `selection-manipulator.${entry.name}`));
      items.forEach((item, i) => assert.strictEqual(item.group, `selection-manipulator@${i}`, item.command));
      const root: { submenu?: string; group: string }[] = contributes.menus['selection-manipulator.submenu'];
      assert.deepStrictEqual(root.filter((item) => item.submenu === 'selection-manipulator.unicode.submenu'),
        [{ submenu: 'selection-manipulator.unicode.submenu', group: 'selection-manipulator@16' }]);
      root.forEach((item, i) => assert.strictEqual(item.group, `selection-manipulator@${i}`, item.submenu));
    });

    test('the existing Unicode escape commands stay in the Encode submenu with their handlers', () => {
      const menus: Record<string, { command?: string }[]> = JSON.parse(readRepoFile('package.json')).contributes.menus;
      const source = readRepoFile('src/extension.ts');
      for (const [name, submenu, handler] of [
        ['unicode.escape', 'encode.submenu', "encodeHandler('unicode-escape', 'new-tab')"],
        ['unicode.unescape', 'encode.submenu', "encodeHandler('unicode-unescape', 'new-tab')"],
        ['unicode.escape-es6', 'encode.submenu', "encodeHandler('unicode-escape-es6', 'new-tab')"],
        ['unicode.escape.replace', 'encode.replace.submenu', "encodeHandler('unicode-escape', 'replace')"],
        ['unicode.unescape.replace', 'encode.replace.submenu', "encodeHandler('unicode-unescape', 'replace')"],
      ]) {
        const id = `selection-manipulator.${name}`;
        const places = Object.entries(menus)
          .filter(([, items]) => items.some((item) => item.command === id))
          .map(([menu]) => menu);
        assert.deepStrictEqual(places, ['commandPalette', `selection-manipulator.${submenu}`], name);
        assert.strictEqual(source.split(`registerTextEditorCommand('${id}', ${handler})`).length - 1, 1, name);
      }
    });

    test('no dependency was added', () => {
      const packageJson = JSON.parse(readRepoFile('package.json'));
      assert.deepStrictEqual(Object.keys(packageJson.dependencies).sort(), ['change-case', 'diff', 'js-yaml', 'xml-formatter']);
    });
  });
});
