import * as assert from 'assert';
import * as fs from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';
import { MAX_OUTPUT_LENGTH } from '../../handler/encodeTransforms';
import { findNumPromptProblem } from '../../handler/numCommon';
import { NumDependencies, numHandlerInternal, NUM_NOTHING_SELECTED } from '../../handler/numHandler';
import { NUM_COMMAND_ENTRIES, NumCommandEntry } from '../../handler/numTransforms';
import { myCommands } from '../../handler/showCommandsHandler';
import { NUM_INVALID_INPUT, NUM_ROADMAP_BEFORE_UPDATE, NUM_ROADMAP_EXAMPLES } from './numExamples';
import { createTextEditor } from './testUtils';

const SEPARATOR = '\n---\n';
const NOT_CHANGED = 'The selection was not changed: ';
const NOT_SHOWN = 'No result was shown: ';

/**
 * Records what the handlers show and open instead of touching VS Code's UI. The input boxes take
 * their answers from `answers` in order (`undefined` = cancelled) and record their options.
 */
const recorder = (answers: (string | undefined)[] = [], onPrompt: () => void | Thenable<unknown> = () => undefined) => {
  const warnings: string[] = [];
  const errors: string[] = [];
  const opened: string[] = [];
  const prompts: vscode.InputBoxOptions[] = [];
  const queue = [...answers];
  const dependencies: NumDependencies = {
    notifier: {
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
    showInputBox: async (options) => {
      prompts.push(options);
      await onPrompt();
      return queue.shift();
    },
  };
  const everything = () => [warnings, errors, opened];
  return { dependencies, warnings, errors, opened, prompts, everything };
};

const run = (entry: NumCommandEntry, dependencies: NumDependencies) => numHandlerInternal(dependencies)(entry.name);

const entryOf = (id: string): NumCommandEntry => {
  const found = NUM_COMMAND_ENTRIES.find((entry) => entry.id === id);
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

/** The NUM rows of docs/ROADMAP.md: [id, kind, command ID, title, example]. */
const roadmapRows = (): [string, string, string, string, string][] =>
  readRepoFile('docs/ROADMAP.md').split('\n')
    .filter((line) => /^\| NUM-\d{3} \|/.test(line))
    .map((line) => {
      const cells = line.split(' | ').map((cell) => cell.trim());
      return [cells[0].replace(/^\| /, ''), cells[2], cells[3].replace(/`/g, ''), cells[4], cells[6]];
    });

/** The title of a command in the Show Commands list. */
const shownTitle = (entry: NumCommandEntry): string => {
  if (entry.name.startsWith('math.')) {
    return entry.title;
  }
  if (entry.name.startsWith('number.')) {
    return `Replace - ${entry.title}`;
  }
  return entry.title.replace(/^Unit: /, 'Unit - ');
};

/** The context menu of a command: statistics under Calculate, number conversions under Replace > Number, units under Unit Conversion. */
const menuOf = (entry: NumCommandEntry): string => {
  const n = Number(entry.id.slice(4));
  if (n <= 9) {
    return 'selection-manipulator.calculation.submenu';
  }
  return n <= 34 ? 'selection-manipulator.number.submenu' : 'selection-manipulator.unit.submenu';
};

suite('Number Commands (NUM-001..040) Test Suite', () => {

  teardown(closeAllEditors);

  suite('each command (ROADMAP example)', () => {
    NUM_COMMAND_ENTRIES.forEach((entry) => {
      const example = NUM_ROADMAP_EXAMPLES[entry.id];
      const prefix = entry.output === 'new-tab' ? NOT_SHOWN : NOT_CHANGED;

      if (entry.output === 'replace') {
        test(`${entry.id} ${entry.name}: replaces each selection on its own (prompts asked once)`, async () => {
          const { dependencies, prompts, everything } = recorder(example.inputs);
          const blocks = [example.input, example.input];
          const editor = await createTextEditor(blocks.join(SEPARATOR));
          selectBlocks(editor, blocks, SEPARATOR, true);
          await run(entry, dependencies)(editor);
          assert.strictEqual(editor.document.getText(), [example.expected, example.expected].join(SEPARATOR));
          assert.deepStrictEqual(everything(), [[], [], []]);
          assert.strictEqual(prompts.length, entry.prompts.length);
        });
      } else {
        test(`${entry.id} ${entry.name}: opens one line per selection in a new editor (prompts asked once)`, async () => {
          const { dependencies, opened, prompts, everything } = recorder(example.inputs);
          const blocks = [example.input, example.input];
          const editor = await createTextEditor(blocks.join(SEPARATOR));
          selectBlocks(editor, blocks, SEPARATOR, true);
          await run(entry, dependencies)(editor);
          assert.deepStrictEqual(opened, [[example.expected, example.expected].join('\n')]);
          assert.strictEqual(editor.document.getText(), blocks.join(SEPARATOR));
          assert.deepStrictEqual(everything().slice(0, 2), [[], []]);
          assert.strictEqual(prompts.length, entry.prompts.length);
        });
      }

      test(`${entry.id} ${entry.name}: only empty or blank selections warn and ask nothing`, async () => {
        const { dependencies, prompts, warnings, errors, opened } = recorder(example.inputs);
        const text = `${example.input}\n  \n\t\n`;
        const editor = await createTextEditor(text);
        const lines = example.input.split('\n').length;
        editor.selections = [new vscode.Selection(0, 0, 0, 0), new vscode.Selection(lines, 0, lines + 2, 0)];
        await run(entry, dependencies)(editor);
        assert.strictEqual(editor.document.getText(), text);
        assert.deepStrictEqual([warnings, errors, opened], [[NUM_NOTHING_SELECTED], [], []]);
        assert.strictEqual(prompts.length, 0);
      });

      if (entry.id !== 'NUM-005') {
        test(`${entry.id} ${entry.name}: unreadable input is reported and changes nothing`, async () => {
          const { dependencies, warnings, errors, opened } = recorder(example.inputs);
          const editor = await createTextEditor(NUM_INVALID_INPUT);
          selectWholeDocument(editor);
          await run(entry, dependencies)(editor);
          assert.strictEqual(editor.document.getText(), NUM_INVALID_INPUT);
          assert.deepStrictEqual(opened, []);
          if (entry.output === 'new-tab') {
            // No number in the selection: a warning.
            assert.deepStrictEqual([warnings, errors], [[`${NOT_SHOWN}no numbers found`], []]);
          } else {
            assert.deepStrictEqual(warnings, []);
            assert.strictEqual(errors.length, 1, `${entry.id}: ${JSON.stringify(errors)}`);
            assert.ok(errors[0].startsWith(`${prefix}line 1: "a?c" is not`), errors[0]);
          }
        });
      }

      if (entry.prompts.length > 0) {
        test(`${entry.id} ${entry.name}: cancelling any prompt does nothing`, async () => {
          for (let cancelAt = 0; cancelAt < entry.prompts.length; cancelAt++) {
            const answers: (string | undefined)[] = example.inputs.slice(0, cancelAt);
            answers.push(undefined);
            const { dependencies, prompts, everything } = recorder(answers);
            const editor = await createTextEditor(example.input);
            selectWholeDocument(editor);
            await run(entry, dependencies)(editor);
            assert.strictEqual(editor.document.getText(), example.input);
            assert.deepStrictEqual(everything(), [[], [], []], `${entry.id} cancelled at ${cancelAt}`);
            assert.strictEqual(prompts.length, cancelAt + 1);
          }
        });
      }
    });
  });

  suite('selections and errors', () => {
    test('statistics are computed per selection, in document order, skipping blank selections', async () => {
      const { dependencies, opened } = recorder();
      const blocks = ['1 2 3', '   ', '10\n20'];
      const editor = await createTextEditor(blocks.join(SEPARATOR));
      selectBlocks(editor, blocks, SEPARATOR, true);
      await run(entryOf('NUM-009'), dependencies)(editor);
      assert.deepStrictEqual(opened, [[
        'count=3, sum=6, mean=2, min=1, max=3, median=2, σ=0.8165, s=1',
        'count=2, sum=30, mean=15, min=10, max=20, median=15, σ=5, s=7.0711',
      ].join('\n')]);
    });

    test('statistics: a selection without numbers stops everything with a warning naming it', async () => {
      const { dependencies, warnings, errors, opened } = recorder();
      const blocks = ['1 2', 'abc', '3'];
      const editor = await createTextEditor(blocks.join(SEPARATOR));
      selectBlocks(editor, blocks);
      await run(entryOf('NUM-001'), dependencies)(editor);
      assert.deepStrictEqual([warnings, errors, opened], [['No result was shown: selection 2 of 3: no numbers found'], [], []]);
    });

    test('count writes 0 for a selection without numbers', async () => {
      const { dependencies, opened, warnings } = recorder();
      const blocks = ['1 2', 'abc'];
      const editor = await createTextEditor(blocks.join(SEPARATOR));
      selectBlocks(editor, blocks);
      await run(entryOf('NUM-005'), dependencies)(editor);
      assert.deepStrictEqual([opened, warnings], [['2\n0'], []]);
    });

    test('statistics: other failures are errors naming the selection', async () => {
      const { dependencies, errors, opened } = recorder();
      const blocks = ['1 1', '1 2'];
      const editor = await createTextEditor(blocks.join(SEPARATOR));
      selectBlocks(editor, blocks);
      await run(entryOf('NUM-002'), dependencies)(editor);
      assert.deepStrictEqual([errors, opened], [['No result was shown: selection 2 of 2: every number appears once, so there is no mode'], []]);
    });

    test('Replace: one invalid selection among several changes nothing; the message names the selection and the line', async () => {
      const { dependencies, errors } = recorder();
      const blocks = ['1\n2', '3\n4\nfive'];
      const editor = await createTextEditor(blocks.join(SEPARATOR));
      selectBlocks(editor, blocks);
      await run(entryOf('NUM-016'), dependencies)(editor);
      assert.strictEqual(editor.document.getText(), blocks.join(SEPARATOR));
      assert.deepStrictEqual(errors, ['The selection was not changed: selection 2 of 2: line 3: "five" is not a number']);
    });

    test('Replace: blank selections are left alone, only the selections whose result differs are edited, in one step', async () => {
      const { dependencies, warnings } = recorder();
      const blocks = ['5', ' \n ', '7', '0'];
      const editor = await createTextEditor(blocks.join(SEPARATOR));
      selectBlocks(editor, blocks);
      await run(entryOf('NUM-015'), dependencies)(editor);
      await run(entryOf('NUM-016'), dependencies)(editor);
      assert.strictEqual(editor.document.getText(), ['-5', ' \n ', '-7', '0'].join(SEPARATOR));
      assert.deepStrictEqual(warnings, []);
      await vscode.commands.executeCommand('undo');
      assert.strictEqual(editor.document.getText(), blocks.join(SEPARATOR));
    });

    test('the output limit stops a growing conversion early and only warns', async function () {
      this.timeout(60_000);
      const { dependencies, warnings, errors } = recorder();
      // 20,000 lines of 7 characters give about 20,000,000 characters.
      const text = '1e1000\n'.repeat(20_000);
      const editor = await createTextEditor(text);
      selectWholeDocument(editor);
      await run(entryOf('NUM-028'), dependencies)(editor);
      assert.strictEqual(editor.document.getText(), text);
      assert.deepStrictEqual(errors, []);
      assert.deepStrictEqual(warnings, [`${NOT_CHANGED}the result would be longer than ${MAX_OUTPUT_LENGTH.toLocaleString('en-US')} characters. Select less text.`]);
    });

    test('the output limit is shared by all selections', async function () {
      this.timeout(60_000);
      const { dependencies, warnings, errors } = recorder();
      // Each selection gives about 4,000,000 characters (within the limit); together they exceed it.
      const block = '1e1000\n'.repeat(3_990).trimEnd();
      const blocks = [block, block, block];
      const editor = await createTextEditor(blocks.join(SEPARATOR));
      selectBlocks(editor, blocks);
      await run(entryOf('NUM-028'), dependencies)(editor);
      assert.strictEqual(editor.document.getText(), blocks.join(SEPARATOR));
      assert.deepStrictEqual(errors, []);
      assert.strictEqual(warnings.length, 1);
      assert.ok(warnings[0].startsWith(NOT_CHANGED), warnings[0]);
    });

    test('a selection longer than 5,000,000 characters is refused', async function () {
      this.timeout(60_000);
      const { dependencies, errors, opened } = recorder();
      const editor = await createTextEditor('1'.repeat(5_000_001));
      selectWholeDocument(editor);
      await run(entryOf('NUM-005'), dependencies)(editor);
      assert.deepStrictEqual(opened, []);
      assert.deepStrictEqual(errors, ['No result was shown: the selection is longer than 5,000,000 characters']);
    });

    test('long selected text is never quoted in full in a message', async () => {
      const secret = 'S'.repeat(200);
      const { dependencies, errors } = recorder();
      const editor = await createTextEditor(secret);
      selectWholeDocument(editor);
      await run(entryOf('NUM-012'), dependencies)(editor);
      assert.strictEqual(errors.length, 1);
      assert.ok(!errors[0].includes(secret), errors[0]);
      assert.ok(errors[0].includes('…'), errors[0]);
    });
  });

  suite('prompts', () => {
    test('input box options: prompt, ignoreFocusOut, nothing pre-filled, validateInput', async () => {
      const { dependencies, prompts } = recorder(['16', '10']);
      const editor = await createTextEditor('ff');
      selectWholeDocument(editor);
      await run(entryOf('NUM-026'), dependencies)(editor);
      assert.strictEqual(editor.document.getText(), '255');
      assert.deepStrictEqual(prompts.map((p) => p.prompt), ['Base of the selected numbers (2-36)', 'Base to convert to (2-36)']);
      prompts.forEach((prompt) => {
        assert.strictEqual(prompt.ignoreFocusOut, true);
        assert.strictEqual(prompt.value, undefined);
        assert.strictEqual(prompt.password, undefined);
        assert.strictEqual(prompt.validateInput!('1'), 'Enter an integer from 2 to 36.');
        assert.strictEqual(prompt.validateInput!('37'), 'Enter an integer from 2 to 36.');
        assert.strictEqual(prompt.validateInput!('36'), undefined);
      });
    });

    test('the other prompts validate their ranges', async () => {
      const cases: [string, string, string, string][] = [
        ['NUM-008', '1 2', '101', '-1'],
        ['NUM-011', '1.5', '16', '1.5'],
        ['NUM-019', '1', 'xx_YY', ''],
      ];
      for (const [id, input, bad, alsoBad] of cases) {
        const { dependencies, prompts } = recorder([undefined]);
        const editor = await createTextEditor(input);
        selectWholeDocument(editor);
        await run(entryOf(id), dependencies)(editor);
        assert.strictEqual(prompts.length, 1, id);
        const rule = entryOf(id).prompts[0].rule;
        assert.strictEqual(prompts[0].validateInput!(bad), findNumPromptProblem(bad, rule), id);
        assert.notStrictEqual(prompts[0].validateInput!(bad), undefined, id);
        assert.notStrictEqual(prompts[0].validateInput!(alsoBad), undefined, id);
        assert.strictEqual(prompts[0].validateInput!(NUM_ROADMAP_EXAMPLES[id].inputs[0]), undefined, id);
      }
    });

    test('a refused value that comes back anyway ends with a warning and changes nothing', async () => {
      const cases: [string, string[], string][] = [
        ['NUM-008', ['101'], 'No result was shown: Enter a number from 0 to 100.'],
        ['NUM-011', ['16'], 'The selection was not changed: Enter an integer from 0 to 15.'],
        ['NUM-019', ['not a locale'], 'The selection was not changed: Enter a supported locale such as en-US, de-DE or ja-JP.'],
        ['NUM-026', ['10', '1'], 'The selection was not changed: Enter an integer from 2 to 36.'],
      ];
      for (const [id, answers, message] of cases) {
        const { dependencies, warnings, opened, errors } = recorder(answers);
        const editor = await createTextEditor('12');
        selectWholeDocument(editor);
        await run(entryOf(id), dependencies)(editor);
        assert.deepStrictEqual([warnings, opened, errors], [[message], [], []], id);
        assert.strictEqual(editor.document.getText(), '12');
      }
    });

    test('spaces around a typed value are ignored', async () => {
      const { dependencies } = recorder([' 2 ']);
      const editor = await createTextEditor('3.14159');
      selectWholeDocument(editor);
      await run(entryOf('NUM-011'), dependencies)(editor);
      assert.strictEqual(editor.document.getText(), '3.14');
    });

    test('the selections are read again after the prompts close', async () => {
      const editor = await createTextEditor('x\n1\n2\n3\n4\n5');
      editor.selection = new vscode.Selection(1, 0, 5, 1);
      const { dependencies, opened } = recorder(['50'], async () => {
        await editor.edit((editBuilder) => editBuilder.insert(new vscode.Position(0, 0), '100\n'));
      });
      await run(entryOf('NUM-008'), dependencies)(editor);
      assert.deepStrictEqual(opened, ['3']);
    });
  });

  suite('line breaks (document EOL)', () => {
    test('Replace keeps the CRLF line breaks and the final line break of the selection', async () => {
      const { dependencies } = recorder();
      const editor = await crlfEditor('1\n2\n\n3\n');
      editor.selection = new vscode.Selection(0, 0, 4, 0);
      await run(entryOf('NUM-010'), dependencies)(editor);
      assert.strictEqual(editor.document.getText(), '1\r\n3\r\n\r\n6\r\n');
    });

    test('statistics results of several selections are joined with the document EOL', async () => {
      const { dependencies, opened } = recorder();
      const blocks = ['1\n2', '3'];
      const editor = await crlfEditor(blocks.join(SEPARATOR));
      selectBlocks(editor, blocks.map((block) => block.replace(/\n/g, '\r\n')), SEPARATOR.replace(/\n/g, '\r\n'));
      await run(entryOf('NUM-006'), dependencies)(editor);
      assert.deepStrictEqual(opened, ['2\r\n3']);
    });
  });

  suite('registration', () => {
    test('command IDs, titles and examples match the NUM table of docs/ROADMAP.md', () => {
      const rows = roadmapRows();
      assert.deepStrictEqual(rows.map(([id]) => id), NUM_COMMAND_ENTRIES.map((entry) => entry.id));
      assert.deepStrictEqual(rows.map(([, kind]) => kind), NUM_COMMAND_ENTRIES.map(() => '基本'));
      assert.deepStrictEqual(rows.map(([, , command]) => command), NUM_COMMAND_ENTRIES.map((entry) => `selection-manipulator.${entry.name}`));
      assert.deepStrictEqual(rows.map(([, , , title]) => title), NUM_COMMAND_ENTRIES.map((entry) => entry.title));

      for (const [id, , , , example] of rows) {
        const match = /^`(.*)` → `(.*)`$/.exec(example);
        assert.ok(match, `${id}: ${example}`);
        const expected = NUM_ROADMAP_EXAMPLES[id];
        let input = match[1].replace(/⏎/g, '\n');
        const output = match[2].replace(/⏎/g, '\n');
        // `（…）` after the input stands for the typed values.
        const typed = /^(.*)（(.*)）$/s.exec(input);
        if (typed) {
          input = typed[1];
          assert.strictEqual(typed[2], expected.note, id);
        } else {
          assert.strictEqual(expected.note, undefined, id);
        }
        assert.strictEqual(input, expected.input, id);
        if (output.endsWith('…')) {
          // NUM-009: the example is shortened.
          assert.ok(expected.expected.startsWith(output.slice(0, -1)), `${id}: ${expected.expected}`);
        } else if (NUM_ROADMAP_BEFORE_UPDATE[id] !== undefined && output === NUM_ROADMAP_BEFORE_UPDATE[id]) {
          // Written with 3 decimals before the rounding was fixed; the documentation step updates it.
          assert.ok(expected.expected !== output, id);
        } else {
          assert.strictEqual(output, expected.expected, id);
        }
      }
    });

    // The wiring in extension.ts is checked statically (as for the TABLE / DATA commands).
    test('extension.ts registers every command with numHandler exactly once', () => {
      const source = readRepoFile('src/extension.ts');
      NUM_COMMAND_ENTRIES.forEach((entry) => {
        const registration = `registerTextEditorCommand('selection-manipulator.${entry.name}', numHandler('${entry.name}'))`;
        assert.strictEqual(source.split(registration).length - 1, 1, registration);
        assert.strictEqual(source.split(`'selection-manipulator.${entry.name}'`).length - 1, 1, entry.name);
      });
    });

    test('package.json and the Show Commands list register all 40 commands exactly once', () => {
      const packageJson = JSON.parse(readRepoFile('package.json'));
      const contributes = packageJson.contributes;
      type MenuItem = { command?: string; submenu?: string; group?: string; when?: string };
      const count = (entries: MenuItem[], id: string) => entries.filter((entry) => entry.command === id).length;
      NUM_COMMAND_ENTRIES.forEach((entry) => {
        const id = `selection-manipulator.${entry.name}`;
        assert.strictEqual(count(contributes.commands, id), 1, `commands: ${id}`);
        assert.strictEqual(count(myCommands, id), 1, `showCommands: ${id}`);
        const command = contributes.commands.find((c: { command: string }) => c.command === id);
        assert.deepStrictEqual(command, { command: id, title: entry.title, category: 'Selection Manipulator' });
        const shown = myCommands.find((c) => c.command === id);
        assert.strictEqual(shown?.title, shownTitle(entry));
        assert.strictEqual(shown?.canMultiSelection, true);
        const palette = contributes.menus.commandPalette.filter((c: MenuItem) => c.command === id);
        assert.deepStrictEqual(palette, [{ when: 'editorHasSelection', command: id }], id);
        Object.entries(contributes.menus).filter(([name]) => name !== 'commandPalette').forEach(([name, items]) =>
          assert.strictEqual(count(items as MenuItem[], id), name === menuOf(entry) ? 1 : 0, `${name}: ${id}`));
      });
      const ids = contributes.commands.map((c: { command: string }) => c.command);
      assert.strictEqual(new Set(ids).size, ids.length, 'command IDs are unique');
      const titles = contributes.commands.map((c: { title: string; category?: string }) => `${c.category ?? ''}:${c.title}`);
      assert.strictEqual(new Set(titles).size, titles.length, 'command titles are unique');
      const allTitles = myCommands.map((c) => c.title);
      assert.strictEqual(new Set(allTitles).size, allTitles.length, 'Show Commands titles are unique');
    });

    test('the existing items of the three submenus keep their places; the new ones follow (9 + 25 + 6)', () => {
      const menus = JSON.parse(readRepoFile('package.json')).contributes.menus;
      const expected: [string, string[]][] = [
        ['selection-manipulator.calculation.submenu', ['calculation', 'calculation.date']],
        ['selection-manipulator.number.submenu', ['zero-padding', 'increment-from-1', 'increment-from-n', 'decrement-to-1', 'decrement-to-n',
          'increment-by-1', 'increment-by-n', 'decrement-by-1', 'decrement-by-n']],
        ['selection-manipulator.unit.submenu', ['unit.px-to-rem', 'unit.rem-to-px', 'unit.kg-to-lb', 'unit.lb-to-kg']],
      ];
      for (const [menu, existing] of expected) {
        const added = NUM_COMMAND_ENTRIES.filter((entry) => menuOf(entry) === menu).map((entry) => entry.name);
        const items: { command: string; group: string }[] = menus[menu];
        assert.deepStrictEqual(items.map((item) => item.command), [...existing, ...added].map((name) => `selection-manipulator.${name}`), menu);
        items.forEach((item, i) => assert.strictEqual(item.group, `selection-manipulator@${i}`, item.command));
      }
      assert.deepStrictEqual(NUM_COMMAND_ENTRIES.map(menuOf).reduce((counts, menu) => ({ ...counts, [menu]: (counts[menu] ?? 0) + 1 }), {} as Record<string, number>), {
        'selection-manipulator.calculation.submenu': 9,
        'selection-manipulator.number.submenu': 25,
        'selection-manipulator.unit.submenu': 6,
      });
    });

    test('the existing Math and Unit commands keep their handlers and titles', () => {
      const source = readRepoFile('src/extension.ts');
      const packageJson = JSON.parse(readRepoFile('package.json'));
      for (const name of ['sum', 'average', 'min', 'max']) {
        assert.strictEqual(source.split(`registerTextEditorCommand('selection-manipulator.math.${name}', mathHandler('${name}'))`).length - 1, 1, name);
      }
      for (const name of ['px-to-rem', 'rem-to-px', 'kg-to-lb', 'lb-to-kg']) {
        assert.strictEqual(source.split(`registerTextEditorCommand('selection-manipulator.unit.${name}', unitConvertHandler('${name}'))`).length - 1, 1, name);
      }
      const titleOf = (id: string) => packageJson.contributes.commands.find((c: { command: string }) => c.command === `selection-manipulator.${id}`)?.title;
      assert.deepStrictEqual(['math.sum', 'math.average', 'math.min', 'math.max', 'unit.px-to-rem', 'unit.kg-to-lb'].map(titleOf),
        ['Math - Sum', 'Math - Average', 'Math - Min', 'Math - Max', 'Unit: px to rem', 'Unit: kg to lb']);
      assert.ok(!source.includes("numHandler('math.sum')"));
    });

    test('no dependency was added', () => {
      const packageJson = JSON.parse(readRepoFile('package.json'));
      assert.deepStrictEqual(Object.keys(packageJson.dependencies).sort(), ['change-case', 'diff', 'js-yaml', 'xml-formatter']);
    });
  });
});
