import * as assert from 'assert';
import * as fs from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';
import { MAX_OUTPUT_LENGTH } from '../../handler/encodeTransforms';
import {
  JA_MAX_SELECT_RANGES,
  JA_NO_MATCH,
  JA_NOTHING_SELECTED,
  jaCommandHandlerInternal,
  JaDependencies,
  JaPickItem,
} from '../../handler/jaCommandHandler';
import { JaInputError } from '../../handler/jaCommon';
import { JA_COMMAND_ENTRIES, JA_DERIVED_FROM, JaCommandEntry } from '../../handler/jaTransforms';
import { JA2_COMMAND_ENTRIES } from '../../handler/ja2Transforms';
import { myCommands } from '../../handler/showCommandsHandler';
import { JA_ROADMAP_EXAMPLES } from './jaExamples';
import { createTextEditor, undoIn } from './testUtils';
import { candidateRows } from './showcaseData';

const SEPARATOR = '\n---\n';
const NOT_CHANGED = 'The selection was not changed: ';
const NOT_SHOWN = 'No result was shown: ';
const NOT_SELECTED = 'Nothing was selected: ';

const prefixOf = (entry: JaCommandEntry): string =>
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
  const picks: { items: JaPickItem[]; options: vscode.QuickPickOptions }[] = [];
  const dependencies: JaDependencies = {
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

const run = (entry: JaCommandEntry, dependencies: JaDependencies, entries: readonly JaCommandEntry[] = JA_COMMAND_ENTRIES) =>
  jaCommandHandlerInternal(dependencies, entries)(entry.name);

const entryOf = (id: string): JaCommandEntry => {
  const found = JA_COMMAND_ENTRIES.find((entry) => entry.id === id);
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

/** The JA commands of the showcase data (scripts/showcase-data/JA.json): [id, kind, command ID, title, example]. */
const dataRows = (): [string, string, string, string, string][] => candidateRows('JA');

/** Commands of a fake table that exercise the notify / select / quick pick paths in isolation. */
const FAKE_ENTRIES: readonly JaCommandEntry[] = [
  {
    id: 'FAKE-1', name: 'test.count', title: 'Count', output: 'notify',
    combine: (texts) => {
      if (texts.some((text) => text.includes('!'))) {
        throw new JaInputError('bad text');
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
];

const fake = (name: string): JaCommandEntry => FAKE_ENTRIES.find((entry) => entry.name === name)!;

suite('Japanese Text Commands (JA-001..035) Test Suite', () => {

  teardown(closeAllEditors);

  suite('each command (ROADMAP example)', () => {
    JA_COMMAND_ENTRIES.forEach((entry) => {
      const example = JA_ROADMAP_EXAMPLES[entry.id];

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
            assert.deepStrictEqual([infos, opened], [[], []]);
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
        assert.deepStrictEqual([warnings, errors, opened, infos], [[JA_NOTHING_SELECTED], [], [], []]);
        assert.strictEqual(picks.length, 0);
      });
    });
  });

  suite('derived (Replace) commands', () => {
    Object.entries(JA_DERIVED_FROM).forEach(([derivedId, baseId]) => {
      test(`${derivedId} gives the same result as ${baseId} and replaces the selection`, async () => {
        const derived = entryOf(derivedId);
        const base = entryOf(baseId);
        assert.strictEqual(derived.transform, base.transform);
        assert.strictEqual(derived.output, 'replace');
        assert.strictEqual(derived.title, `${base.title} (Replace)`);
        assert.strictEqual(derived.name, `${base.name}.replace`);
        const input = `${JA_ROADMAP_EXAMPLES[baseId].input}\n\n${JA_ROADMAP_EXAMPLES[baseId].input}`;
        const baseRun = recorder();
        const baseEditor = await createTextEditor(input);
        selectWholeDocument(baseEditor);
        await run(base, baseRun.dependencies)(baseEditor);
        const derivedRun = recorder();
        const derivedEditor = await createTextEditor(input);
        selectWholeDocument(derivedEditor);
        await run(derived, derivedRun.dependencies)(derivedEditor);
        assert.strictEqual(baseRun.opened.length, 1);
        assert.strictEqual(derivedEditor.document.getText(), baseRun.opened[0]);
      });
    });
  });

  suite('selections and errors', () => {
    test('new editor: results in document order, blank selections skipped', async () => {
      const { dependencies, opened } = recorder();
      const blocks = ['1', '   ', '10\n\n0'];
      const editor = await createTextEditor(blocks.join(SEPARATOR));
      selectBlocks(editor, blocks, SEPARATOR, true);
      await run(entryOf('JA-003'), dependencies)(editor);
      assert.deepStrictEqual(opened, ['一\n十\n\n〇']);
    });

    test('one invalid selection among several changes nothing; the message names the selection and the line', async () => {
      const { dependencies, errors } = recorder();
      const blocks = ['12', '5\nabc'];
      const editor = await createTextEditor(blocks.join(SEPARATOR));
      selectBlocks(editor, blocks);
      await run(entryOf('JA-032'), dependencies)(editor);
      assert.strictEqual(editor.document.getText(), blocks.join(SEPARATOR));
      assert.deepStrictEqual(errors, ['The selection was not changed: selection 2 of 2: line 2: "abc" is not a whole number']);
    });

    test('one selection: the message names only the line', async () => {
      const { dependencies, errors, opened } = recorder();
      const editor = await createTextEditor('一\n万万');
      selectWholeDocument(editor);
      await run(entryOf('JA-004'), dependencies)(editor);
      assert.deepStrictEqual([opened, errors], [[], ['No result was shown: line 2: "万万" is not a kanji numeral']]);
    });

    test('Replace: only the selections whose result differs are edited, in one step', async () => {
      const blocks = ['國', '国'];
      const editor = await createTextEditor(blocks.join(SEPARATOR));
      selectBlocks(editor, blocks);
      await run(entryOf('JA-034'), recorder().dependencies)(editor);
      assert.strictEqual(editor.document.getText(), ['国', '国'].join(SEPARATOR));
      await undoIn(editor);
      assert.strictEqual(editor.document.getText(), blocks.join(SEPARATOR));
    });

    test('text-wide conversions keep the text around the converted characters', async () => {
      const { dependencies } = recorder();
      const text = 'Tokyo は東京、Osaka は大阪。\n  sushi と tempura';
      const editor = await createTextEditor(text);
      selectWholeDocument(editor);
      await run(entryOf('JA-006'), dependencies)(editor);
      assert.strictEqual(editor.document.getText(), 'Tokyo は東京，Osaka は大阪．\n  sushi と tempura');
      await run(entryOf('JA-031'), recorder().dependencies)(editor);
      assert.strictEqual(editor.document.getText(), 'ときょ は東京，おさか は大阪．\n  すし と てんぷら');
    });

    test('the output limit only warns', async function () {
      this.timeout(60_000);
      const { dependencies, warnings, errors, opened } = recorder();
      // Every っ that no consonant follows becomes `xtsu`: 3 × 999,999 × 4 characters exceed the limit.
      const block = 'っ'.repeat(999_999);
      const blocks = [block, block, block];
      const editor = await createTextEditor(blocks.join(SEPARATOR));
      selectBlocks(editor, blocks);
      await run(entryOf('JA-001'), dependencies)(editor);
      assert.deepStrictEqual([opened, errors], [[], []]);
      assert.deepStrictEqual(warnings, [`${NOT_SHOWN}the result would be longer than ${MAX_OUTPUT_LENGTH.toLocaleString('en-US')} characters. Select less text.`]);
    });

    test('a selection over 1,000,000 characters is refused (new editor and Replace)', async function () {
      this.timeout(60_000);
      const editor = await createTextEditor('1'.repeat(1_000_001));
      selectWholeDocument(editor);
      for (const id of ['JA-003', 'JA-032']) {
        const { dependencies, errors, opened } = recorder();
        await run(entryOf(id), dependencies)(editor);
        assert.deepStrictEqual(opened, []);
        assert.deepStrictEqual(errors, [`${prefixOf(entryOf(id))}the selection is longer than 1,000,000 characters`]);
      }
      assert.strictEqual(editor.document.getText().length, 1_000_001);
    });

    test('long selected text is never quoted in full in a message', async () => {
      const secret = 'S'.repeat(200);
      const { dependencies, errors } = recorder();
      const editor = await createTextEditor(secret);
      selectWholeDocument(editor);
      await run(entryOf('JA-003'), dependencies)(editor);
      assert.strictEqual(errors.length, 1);
      assert.ok(!errors[0].includes(secret), errors[0]);
      assert.ok(errors[0].includes('…'), errors[0]);
    });

    test('surrogate pairs are kept whole', async () => {
      const { dependencies } = recorder();
      const editor = await createTextEditor('𠮷野家の國');
      selectWholeDocument(editor);
      await run(entryOf('JA-034'), dependencies)(editor);
      assert.strictEqual(editor.document.getText(), '𠮷野家の国');
    });
  });

  suite('commands JA-011..029, JA-035', () => {
    test('JA-016: the quick pick offers both characters once; cancelling changes nothing', async () => {
      const text = '1〜3、4～5';
      for (const [choice, expected] of [['～', '1～3、4～5'], [undefined, text]] as const) {
        const { dependencies, picks, errors } = recorder(choice);
        const editor = await createTextEditor(text);
        selectWholeDocument(editor);
        await run(entryOf('JA-016'), dependencies)(editor);
        assert.strictEqual(editor.document.getText(), expected);
        assert.deepStrictEqual(picks.map(({ items }) => items.map((item) => item.value)), [['〜', '～']]);
        assert.deepStrictEqual(errors, []);
      }
    });

    test('JA-020: selections of only ideographic spaces warn like empty ones; JA-011 counts them', async () => {
      const blank = recorder();
      const blankEditor = await createTextEditor('\u3000\u3000');
      selectWholeDocument(blankEditor);
      await run(entryOf('JA-020'), blank.dependencies)(blankEditor);
      assert.deepStrictEqual([blank.infos, blank.warnings, blank.errors], [[], [JA_NOTHING_SELECTED], []]);
      const { dependencies, infos } = recorder();
      const editor = await createTextEditor('\u3000a\nb');
      selectWholeDocument(editor);
      await run(entryOf('JA-011'), dependencies)(editor);
      assert.deepStrictEqual(infos, ['3 字 / 原稿用紙 0.0 枚']);
    });

    test('JA-018 / 019: nothing found shows a message instead of an empty editor', async () => {
      for (const [id, message] of [['JA-018', 'No kanji was found in the selection.'], ['JA-019', 'No katakana word was found in the selection.']]) {
        const { dependencies, infos, opened } = recorder();
        const blocks = ['ひらがな', 'かな'];
        const editor = await createTextEditor(blocks.join(SEPARATOR));
        selectBlocks(editor, blocks);
        await run(entryOf(id), dependencies)(editor);
        assert.deepStrictEqual([infos, opened], [[message], []], id);
      }
      const { dependencies, opened } = recorder();
      const blocks = ['ひらがな', '漢字'];
      const editor = await createTextEditor(blocks.join(SEPARATOR));
      selectBlocks(editor, blocks);
      await run(entryOf('JA-018'), dependencies)(editor);
      assert.deepStrictEqual(opened, ['\n漢字']);
    });

    test('JA-022 / 023: a value that cannot be converted names the line', async () => {
      for (const [id, text, message] of [
        ['JA-022', '東京都\n東京府', 'No result was shown: line 2: "東京府" is not a prefecture name or code'],
        ['JA-023', '1000001\n12345', 'The selection was not changed: line 2: "12345" is not a 7-digit postal code'],
      ]) {
        const { dependencies, errors, opened } = recorder();
        const editor = await createTextEditor(text);
        selectWholeDocument(editor);
        await run(entryOf(id), dependencies)(editor);
        assert.deepStrictEqual([opened, errors], [[], [message]], id);
        assert.strictEqual(editor.document.getText(), text);
      }
    });

    test('JA-029: surrogate pairs are selected whole; nothing found keeps the selection', async () => {
      const found = recorder();
      const editor = await createTextEditor('𠮷野家\n①');
      selectWholeDocument(editor);
      await run(entryOf('JA-029'), found.dependencies)(editor);
      assert.deepStrictEqual(editor.selections.map((selection) => editor.document.getText(selection)), ['𠮷', '①']);

      const none = recorder();
      const plain = await createTextEditor('東京タワー');
      selectWholeDocument(plain);
      await run(entryOf('JA-029'), none.dependencies)(plain);
      assert.deepStrictEqual(none.infos, [entryOf('JA-029').noMatchMessage]);
      assert.strictEqual(plain.document.getText(plain.selection), '東京タワー');
    });

    test('JA-029: more than the limit of characters selects nothing', async () => {
      const { dependencies, errors } = recorder();
      const editor = await createTextEditor('①'.repeat(JA_MAX_SELECT_RANGES + 1));
      selectWholeDocument(editor);
      await run(entryOf('JA-029'), dependencies)(editor);
      assert.deepStrictEqual(errors, ['Nothing was selected: more than 10,000 places were found; select less text']);
      assert.strictEqual(editor.selections.length, 1);
    });

    test('JA-017 / 025 / 026: Replace keeps the CRLF line breaks', async () => {
      const editor = await crlfEditor('コ−ヒ− 03ー1234\n日本 語\nVue3で');
      selectWholeDocument(editor);
      for (const id of ['JA-017', 'JA-025', 'JA-035']) {
        await run(entryOf(id), recorder().dependencies)(editor);
      }
      assert.strictEqual(editor.document.getText(), 'コーヒー 03-1234\r\n日本語\r\nVue3 で');
    });
  });

  suite('line breaks (document EOL)', () => {
    test('Replace keeps the CRLF line breaks', async () => {
      const editor = await crlfEditor('1234\n\n10000\n');
      editor.selection = new vscode.Selection(0, 0, 3, 0);
      await run(entryOf('JA-032'), recorder().dependencies)(editor);
      assert.strictEqual(editor.document.getText(), '千二百三十四\r\n\r\n一万\r\n');
    });

    test('new editor results of several selections are joined with the document EOL', async () => {
      const blocks = ['しんじゅく', 'コーヒー'];
      const { dependencies, opened } = recorder();
      const editor = await crlfEditor(blocks.join(SEPARATOR));
      selectBlocks(editor, blocks, SEPARATOR.replace(/\n/g, '\r\n'));
      await run(entryOf('JA-001'), dependencies)(editor);
      assert.deepStrictEqual(opened, ['shinjuku\r\nkoohii']);
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

    test('select: nothing found keeps the selections and says so', async () => {
      for (const [name, message] of [['test.select-x', 'No x was found.'], ['test.select-none', JA_NO_MATCH]]) {
        const { dependencies, infos } = recorder();
        const editor = await createTextEditor('abc');
        selectWholeDocument(editor);
        await run(fake(name), dependencies, FAKE_ENTRIES)(editor);
        assert.deepStrictEqual(infos, [message]);
        assert.strictEqual(editor.document.getText(editor.selection), 'abc');
      }
    });

    test(`select: more than ${JA_MAX_SELECT_RANGES} places select nothing`, async () => {
      const { dependencies, errors } = recorder();
      const editor = await createTextEditor('x'.repeat(JA_MAX_SELECT_RANGES + 1));
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

  suite('registration', () => {
    test('command IDs, kinds, titles and examples match the JA commands of the showcase data, in its order', () => {
      const rows = dataRows();
      assert.strictEqual(rows.length, 35);
      const byId = new Map(rows.map((row) => [row[0], row]));
      const order = rows.map(([id]) => id);
      assert.deepStrictEqual(JA_COMMAND_ENTRIES.map((entry) => entry.id), order, 'every ROADMAP row, in its order');
      assert.deepStrictEqual(Object.keys(JA_ROADMAP_EXAMPLES).sort(), [...order].sort(), 'an example for every row');
      for (const entry of JA_COMMAND_ENTRIES) {
        const row = byId.get(entry.id);
        assert.ok(row, entry.id);
        const [id, kind, command, title, example] = row;
        assert.strictEqual(command, `selection-manipulator.${entry.name}`, id);
        assert.strictEqual(title, entry.title, id);
        const base = JA_DERIVED_FROM[id];
        assert.strictEqual(kind, base === undefined ? '基本' : `派生:${base}`, id);
        const match = /^`(.*)` → `(.*)`$/.exec(example);
        assert.ok(match, `${id}: ${example}`);
        const expected = JA_ROADMAP_EXAMPLES[id];
        let input = match[1].replace(/⏎/g, '\n');
        const typed = /^(.*)（(.*)）$/s.exec(input);
        if (expected.roadmapInput !== undefined) {
          // The ROADMAP describes the text; the test uses a concrete one.
          assert.strictEqual(input, expected.roadmapInput, id);
        } else if (typed) {
          input = typed[1];
          assert.strictEqual(typed[2], expected.note, id);
          assert.strictEqual(input, expected.input, id);
        } else {
          assert.strictEqual(expected.note, undefined, id);
          assert.strictEqual(input, expected.input, id);
        }
        assert.strictEqual(match[2].replace(/⏎/g, '\n'), expected.roadmapOutput ?? expected.expected, id);
      }
    });

    // The wiring in extension.ts is checked statically (as for the other categories).
    test('extension.ts registers every command with jaCommandHandler exactly once', () => {
      const source = readRepoFile('src/extension.ts');
      JA_COMMAND_ENTRIES.forEach((entry) => {
        const registration = `registerTextEditorCommand('selection-manipulator.${entry.name}', jaCommandHandler('${entry.name}'))`;
        assert.strictEqual(source.split(registration).length - 1, 1, registration);
        assert.strictEqual(source.split(`'selection-manipulator.${entry.name}'`).length - 1, 1, entry.name);
      });
    });

    test('package.json and the Show Commands list register every command exactly once', () => {
      const contributes = JSON.parse(readRepoFile('package.json')).contributes;
      type MenuItem = { command?: string; submenu?: string; group?: string; when?: string };
      const count = (entries: MenuItem[], id: string) => entries.filter((entry) => entry.command === id).length;
      JA_COMMAND_ENTRIES.forEach((entry) => {
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
          assert.strictEqual(count(items as MenuItem[], id), name === 'selection-manipulator.japanese.submenu' ? 1 : 0, `${name}: ${id}`));
      });
      const ids = contributes.commands.map((c: { command: string }) => c.command);
      assert.strictEqual(new Set(ids).size, ids.length, 'command IDs are unique');
      const titles = contributes.commands.map((c: { title: string; category?: string }) => `${c.category ?? ''}:${c.title}`);
      assert.strictEqual(new Set(titles).size, titles.length, 'command titles are unique');
      const allTitles = myCommands.map((c) => c.title);
      assert.strictEqual(new Set(allTitles).size, allTitles.length, 'Show Commands titles are unique');
    });

    test('the existing items of the Japanese submenu keep their places; the new ones follow in ROADMAP order, then JAUNIX-001..007', () => {
      const items: { command: string; group: string }[] = JSON.parse(readRepoFile('package.json')).contributes.menus['selection-manipulator.japanese.submenu'];
      const existing = ['full-to-half', 'full-to-half.replace', 'half-to-full', 'half-to-full.replace',
        'hiragana-to-katakana', 'hiragana-to-katakana.replace', 'katakana-to-hiragana', 'katakana-to-hiragana.replace']
        .map((name) => `selection-manipulator.japanese.${name}`);
      assert.deepStrictEqual(items.map((item) => item.command),
        [...existing, ...[...JA_COMMAND_ENTRIES, ...JA2_COMMAND_ENTRIES].map((entry) => `selection-manipulator.${entry.name}`)]);
      items.forEach((item, i) => assert.strictEqual(item.group, `selection-manipulator@${i}`, item.command));
    });

    test('the existing Japanese commands keep their handlers', () => {
      const source = readRepoFile('src/extension.ts');
      for (const [name, handler] of [
        ['full-to-half', 'fullWidthToHalfWidthHandler(false)'], ['full-to-half.replace', 'fullWidthToHalfWidthHandler(true)'],
        ['half-to-full', 'halfWidthToFullWidthHandler(false)'], ['half-to-full.replace', 'halfWidthToFullWidthHandler(true)'],
        ['hiragana-to-katakana', 'hiraganaToKatakanaHandler(false)'], ['hiragana-to-katakana.replace', 'hiraganaToKatakanaHandler(true)'],
        ['katakana-to-hiragana', 'katakanaToHiraganaHandler(false)'], ['katakana-to-hiragana.replace', 'katakanaToHiraganaHandler(true)'],
      ]) {
        assert.strictEqual(source.split(`registerTextEditorCommand('selection-manipulator.japanese.${name}', ${handler})`).length - 1, 1, name);
      }
    });

    test('no dependency was added', () => {
      const packageJson = JSON.parse(readRepoFile('package.json'));
      assert.deepStrictEqual(Object.keys(packageJson.dependencies).sort(), ['change-case', 'diff', 'js-yaml', 'xml-formatter']);
    });
  });
});
