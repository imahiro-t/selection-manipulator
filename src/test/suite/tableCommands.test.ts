import * as assert from 'assert';
import * as fs from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';
import { TableDependencies, tableHandlerInternal } from '../../handler/tableHandler';
import { findPromptProblem } from '../../handler/tableCsv';
import { MAX_OUTPUT_LENGTH } from '../../handler/encodeTransforms';
import { myCommands } from '../../handler/showCommandsHandler';
import { TABLE_COMMAND_ENTRIES, TableCommandEntry } from '../../handler/tableTransforms';
import { DATA2_COMMAND_ENTRIES } from '../../handler/data2Transforms';
import { TABLE_ROADMAP_EXAMPLES, VALID_INPUTS } from './tableExamples';
import { createTextEditor, undoIn } from './testUtils';
import { candidateRows } from './showcaseData';

const SEPARATOR = '\n---\n';

/**
 * Records what the handlers show and open instead of touching VS Code's UI. The input boxes and
 * the QuickPick take their answers from `answers` in order (`undefined` = cancelled) and record
 * the options they were shown with.
 */
const recorder = (answers: (string | undefined)[] = [], onPrompt: () => void | Thenable<unknown> = () => undefined) => {
  const infos: string[] = [];
  const warnings: string[] = [];
  const errors: string[] = [];
  const opened: string[] = [];
  const prompts: vscode.InputBoxOptions[] = [];
  const picks: { items: string[]; options: vscode.QuickPickOptions }[] = [];
  const queue = [...answers];
  const dependencies: TableDependencies = {
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
    showInputBox: async (options) => {
      prompts.push(options);
      await onPrompt();
      return queue.shift();
    },
    showQuickPick: async (items, options) => {
      picks.push({ items, options });
      return queue.shift();
    },
  };
  const everything = () => [infos, warnings, errors, opened];
  return { dependencies, infos, warnings, errors, opened, prompts, picks, everything };
};

const run = (entry: TableCommandEntry, dependencies: TableDependencies) => tableHandlerInternal(dependencies)(entry.name);

const entryOf = (id: string): TableCommandEntry => {
  const found = TABLE_COMMAND_ENTRIES.find((entry) => entry.id === id);
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

/** The TABLE commands of the showcase data (scripts/showcase-data/TABLE.json): [id, kind, command ID, title, example]. */
const dataRows = (): [string, string, string, string, string][] => candidateRows('TABLE');

/** Expands the `⏎` / `⇥` / `··` notation and the `\|` escapes of the ROADMAP examples. */
const expand = (text: string): string => text.replace(/⏎/g, '\n').replace(/⇥/g, '\t').replace(/·/g, ' ').replace(/\\\|/g, '|');

/** Text the command cannot read (JSON for 002 / 027, only white space for 022, an unclosed quote otherwise: after a tab for 004). */
const invalidInput = (id: string): string => {
  if (id === 'TABLE-002' || id === 'TABLE-027') {
    return '{"a": [1, @';
  }
  if (id === 'TABLE-004') {
    return 'a\t"b\n1\t2';
  }
  return id === 'TABLE-022' ? ' \t ' : 'a,"b\n1,2';
};

/** The number of prompts of the command: [input boxes, QuickPicks]. */
const promptCounts = (entry: TableCommandEntry): [number, number] =>
  [entry.prompts.filter((p) => p.type === 'input').length, entry.prompts.filter((p) => p.type === 'pick').length];

suite('Table Commands (TABLE-001..030) Test Suite', () => {

  teardown(closeAllEditors);

  suite('each command (ROADMAP example)', () => {
    TABLE_COMMAND_ENTRIES.forEach((entry) => {
      const example = TABLE_ROADMAP_EXAMPLES[entry.id];
      const [inputBoxes, quickPicks] = promptCounts(entry);

      if (entry.output === 'replace') {
        test(`${entry.id} ${entry.name}: replaces each selection and opens nothing`, async () => {
          const { dependencies, everything } = recorder(example.inputs);
          const blocks = [example.input, example.input];
          const editor = await createTextEditor(blocks.join(SEPARATOR));
          selectBlocks(editor, blocks);
          await run(entry, dependencies)(editor);
          assert.strictEqual(editor.document.getText(), [example.expected, example.expected].join(SEPARATOR));
          assert.deepStrictEqual(everything(), [[], [], [], []]);
        });
      } else if (entry.output === 'notify') {
        test(`${entry.id} ${entry.name}: notifies and does not change the text or the selection`, async () => {
          const { dependencies, infos, prompts, everything } = recorder(example.inputs);
          const editor = await createTextEditor(example.input);
          selectWholeDocument(editor);
          const before = editor.selection;
          await run(entry, dependencies)(editor);
          assert.deepStrictEqual(infos, [example.expected]);
          assert.deepStrictEqual(everything().slice(1), [[], [], []]);
          assert.strictEqual(editor.document.getText(), example.input);
          assert.ok(editor.selection.isEqual(before));
          assert.strictEqual(prompts.length, inputBoxes);
        });
      } else {
        test(`${entry.id} ${entry.name}: opens the results of all selections in one new editor (prompts asked once)`, async () => {
          const { dependencies, opened, prompts, picks, everything } = recorder(example.inputs);
          const blocks = [example.input, example.input];
          const editor = await createTextEditor(blocks.join(SEPARATOR));
          selectBlocks(editor, blocks, SEPARATOR, true);
          await run(entry, dependencies)(editor);
          assert.deepStrictEqual(opened, [[example.expected, example.expected].join('\n')]);
          assert.strictEqual(editor.document.getText(), blocks.join(SEPARATOR));
          assert.deepStrictEqual(everything().slice(0, 3), [[], [], []]);
          assert.deepStrictEqual([prompts.length, picks.length], [inputBoxes, quickPicks]);
        });
      }

      test(`${entry.id} ${entry.name}: only empty selections do nothing (no prompt)`, async () => {
        const { dependencies, prompts, picks, everything } = recorder(VALID_INPUTS[entry.id]);
        const editor = await createTextEditor(example.input);
        editor.selections = [new vscode.Selection(0, 0, 0, 0), new vscode.Selection(0, 1, 0, 1)];
        await run(entry, dependencies)(editor);
        assert.strictEqual(editor.document.getText(), example.input);
        assert.deepStrictEqual(everything(), [[], [], [], []]);
        assert.deepStrictEqual([prompts.length, picks.length], [0, 0]);
      });

      test(`${entry.id} ${entry.name}: unreadable input ends with an error notification and changes nothing`, async () => {
        const { dependencies, errors, opened, infos } = recorder(VALID_INPUTS[entry.id]);
        const invalid = invalidInput(entry.id);
        const editor = await createTextEditor(invalid);
        selectWholeDocument(editor);
        await run(entry, dependencies)(editor);
        assert.strictEqual(editor.document.getText(), invalid);
        assert.deepStrictEqual([opened, infos], [[], []]);
        assert.strictEqual(errors.length, 1, `${entry.id}: ${JSON.stringify(errors)}`);
        assert.ok(errors[0].startsWith('The selection was not changed: '), errors[0]);
      });

      if (entry.prompts.length > 0) {
        test(`${entry.id} ${entry.name}: cancelling any prompt does nothing`, async () => {
          for (let cancelAt = 0; cancelAt < entry.prompts.length; cancelAt++) {
            const answers: (string | undefined)[] = example.inputs.slice(0, cancelAt);
            answers.push(undefined);
            const { dependencies, prompts, picks, everything } = recorder(answers);
            const editor = await createTextEditor(example.input);
            selectWholeDocument(editor);
            await run(entry, dependencies)(editor);
            assert.strictEqual(editor.document.getText(), example.input);
            assert.deepStrictEqual(everything(), [[], [], [], []], `${entry.id} cancelled at ${cancelAt}`);
            assert.strictEqual(prompts.length + picks.length, cancelAt + 1);
          }
        });
      }
    });
  });

  suite('selections and errors', () => {
    test('one invalid selection among several: nothing is replaced, the message names the selection', async () => {
      const { dependencies, errors } = recorder();
      const blocks = ['a,b\n1,2', 'a,"b'];
      const editor = await createTextEditor(blocks.join(SEPARATOR));
      selectBlocks(editor, blocks);
      await run(entryOf('TABLE-029'), dependencies)(editor);
      assert.strictEqual(editor.document.getText(), blocks.join(SEPARATOR));
      assert.deepStrictEqual(errors, ['The selection was not changed: selection 2 of 2: line 1: a quoted field is not closed']);
    });

    test('Replace: a selection of line breaks only is an error, so no selection becomes empty', async () => {
      const { dependencies, errors } = recorder();
      const text = 'a,b\n1,2\n\n\nx,y';
      const editor = await createTextEditor(text);
      editor.selections = [new vscode.Selection(0, 0, 1, 3), new vscode.Selection(2, 0, 3, 0), new vscode.Selection(4, 0, 4, 3)];
      await run(entryOf('TABLE-028'), dependencies)(editor);
      assert.strictEqual(editor.document.getText(), text);
      assert.deepStrictEqual(errors, ['The selection was not changed: selection 2 of 3: no rows found']);
    });

    test('Replace: only the selections whose result differs are edited, in one step', async () => {
      const { dependencies } = recorder();
      const blocks = ['a,b', 'x', 'c,d'];
      const editor = await createTextEditor(blocks.join(SEPARATOR));
      selectBlocks(editor, blocks);
      await run(entryOf('TABLE-028'), dependencies)(editor);
      assert.strictEqual(editor.document.getText(), ['a\tb', 'x', 'c\td'].join(SEPARATOR));
      await undoIn(editor);
      assert.strictEqual(editor.document.getText(), blocks.join(SEPARATOR));
    });

    test('the output limit is shared by all selections and only warns', async function () {
      // A document of millions of characters: Mocha's default of 2 seconds is too tight for a slow CI machine.
      this.timeout(60_000);
      const { dependencies, opened, warnings, errors } = recorder();
      // Each selection gives about 4,000,000 characters; together they exceed the limit.
      const block = `${'"a",'.repeat(1_000_000)}b`;
      const editor = await createTextEditor([block, block, block].join(SEPARATOR));
      selectBlocks(editor, [block, block, block]);
      await run(entryOf('TABLE-018'), dependencies)(editor);
      assert.deepStrictEqual([opened, errors], [[], []]);
      assert.strictEqual(warnings.length, 1);
      assert.ok(warnings[0].startsWith('The selection was not changed: '), warnings[0]);
      assert.ok(warnings[0].includes(MAX_OUTPUT_LENGTH.toLocaleString('en-US')), warnings[0]);
    });

    test('the grid limit warns and changes nothing', async function () {
      // A document of millions of characters: Mocha's default of 2 seconds is too tight for a slow CI machine.
      this.timeout(60_000);
      const { dependencies, warnings, errors } = recorder();
      const text = `${','.repeat(1_999)}\n${'a\n'.repeat(5_000)}`;
      const editor = await createTextEditor(text);
      selectWholeDocument(editor);
      await run(entryOf('TABLE-029'), dependencies)(editor);
      assert.strictEqual(editor.document.getText(), text);
      assert.deepStrictEqual(errors, []);
      assert.deepStrictEqual(warnings, ['The selection was not changed: the table is too large: 5,001 rows × 2,000 columns is more than 10,000,000 cells. Select less text.']);
    });

    test('a selection longer than 5,000,000 characters is refused', async function () {
      // A document of millions of characters: Mocha's default of 2 seconds is too tight for a slow CI machine.
      this.timeout(60_000);
      const { dependencies, errors, opened } = recorder();
      const editor = await createTextEditor('a'.repeat(5_000_001));
      selectWholeDocument(editor);
      await run(entryOf('TABLE-003'), dependencies)(editor);
      assert.deepStrictEqual(opened, []);
      assert.deepStrictEqual(errors, ['The selection was not changed: the selection is longer than 5,000,000 characters']);
    });

    test('long selected text is never quoted in full in a message', async () => {
      const secret = 'S'.repeat(200);
      const { dependencies, errors } = recorder([secret]);
      const editor = await createTextEditor('a,b\n1,2');
      selectWholeDocument(editor);
      await run(entryOf('TABLE-006'), dependencies)(editor);
      assert.strictEqual(errors.length, 1);
      assert.ok(!errors[0].includes(secret), errors[0]);
      assert.ok(errors[0].includes('…'), errors[0]);
    });

    test('notify commands: several selections are listed; a failure names the selection', async () => {
      const blocks = ['a,b\n1,', 'x\n1\n2'];
      const listed = recorder();
      const editor = await createTextEditor(blocks.join(SEPARATOR));
      selectBlocks(editor, blocks, SEPARATOR, true);
      await run(entryOf('TABLE-023'), listed.dependencies)(editor);
      assert.deepStrictEqual(listed.infos, ['Selection 1: 1 row × 2 cols, b: 1 empty; Selection 2: 2 rows × 1 col, no empty cells']);

      const summed = recorder(['1']);
      await run(entryOf('TABLE-015'), summed.dependencies)(editor);
      assert.deepStrictEqual(summed.infos, ['Selection 1: sum=1, avg=1; Selection 2: sum=3, avg=1.5']);

      const failed = recorder(['b']);
      await run(entryOf('TABLE-015'), failed.dependencies)(editor);
      assert.deepStrictEqual(failed.errors, ['The selection was not changed: selection 2 of 2: no column named "b" in the header']);
      assert.deepStrictEqual(failed.infos, []);
    });

    test('TABLE-015 without any number is a warning', async () => {
      const { dependencies, warnings, infos } = recorder(['v']);
      const editor = await createTextEditor('v\nx\n');
      selectWholeDocument(editor);
      await run(entryOf('TABLE-015'), dependencies)(editor);
      assert.deepStrictEqual(infos, []);
      assert.deepStrictEqual(warnings, ['no numeric cells in the column (1 non-numeric cell skipped)']);
    });
  });

  suite('prompts', () => {
    test('input box options: prompt, ignoreFocusOut, nothing pre-filled, validateInput', async () => {
      const { dependencies, prompts, picks } = recorder(['n', 'Contains', '']);
      const editor = await createTextEditor('n,v\na,1');
      selectWholeDocument(editor);
      await run(entryOf('TABLE-014'), dependencies)(editor);
      assert.deepStrictEqual(prompts.map((p) => p.prompt), ['Column number or header name', 'Value (case-sensitive; may be empty)']);
      prompts.forEach((prompt) => {
        assert.strictEqual(prompt.ignoreFocusOut, true);
        assert.strictEqual(prompt.value, undefined);
        assert.strictEqual(prompt.password, undefined);
      });
      assert.strictEqual(prompts[0].validateInput!(''), 'Enter a value.');
      assert.strictEqual(prompts[1].validateInput!(''), undefined);
      assert.strictEqual(prompts[0].validateInput!('a\tb'), findPromptProblem('a\tb'));
      assert.deepStrictEqual(picks.map((p) => p.items), [['Equals', 'Contains']]);
      assert.strictEqual(picks[0].options.ignoreFocusOut, true);
    });

    test('TABLE-017: the delimiter prompt accepts \\t and refuses a typed tab', async () => {
      const { dependencies, prompts, opened } = recorder(['\\t']);
      const editor = await createTextEditor('a,b');
      selectWholeDocument(editor);
      await run(entryOf('TABLE-017'), dependencies)(editor);
      assert.deepStrictEqual(opened, ['a\tb']);
      assert.strictEqual(prompts[0].validateInput!('\\t'), undefined);
      assert.match(String(prompts[0].validateInput!('\t')), /type \\t for a tab/);
      assert.match(String(prompts[0].validateInput!(';;')), /exactly one character/);
    });

    test('a refused value that comes back anyway ends with a warning and changes nothing', async () => {
      const cases: [string, string[]][] = [
        ['TABLE-006', ['a\tb']],
        ['TABLE-012', ['']],
        ['TABLE-017', ['\t']],
        ['TABLE-014', ['n', 'Starts with']],
      ];
      for (const [id, answers] of cases) {
        const { dependencies, warnings, opened, errors } = recorder(answers);
        const editor = await createTextEditor('n,v\na,1');
        selectWholeDocument(editor);
        await run(entryOf(id), dependencies)(editor);
        assert.deepStrictEqual([opened, errors], [[], []], id);
        assert.strictEqual(warnings.length, 1, id);
        assert.ok(warnings[0].startsWith('The selection was not changed: '), warnings[0]);
        assert.strictEqual(editor.document.getText(), 'n,v\na,1');
      }
    });

    test('the selections are read again after the prompts close', async () => {
      const editor = await createTextEditor('x\na,b\n1,2');
      editor.selection = new vscode.Selection(1, 0, 2, 3);
      const { dependencies, opened } = recorder(['b'], async () => {
        await editor.edit((editBuilder) => editBuilder.insert(new vscode.Position(0, 0), 'zz\n'));
      });
      await run(entryOf('TABLE-006'), dependencies)(editor);
      assert.deepStrictEqual(opened, ['b\n2']);
    });
  });

  suite('line breaks (document EOL)', () => {
    test('CRLF documents get CRLF results, also inside quoted cells', async () => {
      const cases: [string, string, string][] = [
        ['TABLE-003', 'a,b\n1,"x\ny"', 'a\tb\r\n1\t"x\r\ny"'],
        ['TABLE-011', 'a\n1', '<table>\r\n  <tr><th>a</th></tr>\r\n  <tr><td>1</td></tr>\r\n</table>'],
        ['TABLE-025', 'a,b\n1,2\n3,4', 'a: 1\r\nb: 2\r\n\r\na: 3\r\nb: 4'],
      ];
      for (const [id, input, expected] of cases) {
        const { dependencies, opened } = recorder();
        const editor = await crlfEditor(input);
        selectWholeDocument(editor);
        await run(entryOf(id), dependencies)(editor);
        assert.deepStrictEqual(opened, [expected], id);
      }
    });

    test('several results are joined with the document EOL', async () => {
      const { dependencies, opened } = recorder();
      const blocks = ['a,b', 'c'];
      const editor = await crlfEditor(blocks.join(SEPARATOR));
      selectBlocks(editor, blocks, SEPARATOR.replace(/\n/g, '\r\n'));
      await run(entryOf('TABLE-003'), dependencies)(editor);
      assert.deepStrictEqual(opened, ['a\tb\r\nc']);
    });

    test('Replace keeps the final line break of the selection (CRLF) and adds none otherwise', async () => {
      const { dependencies } = recorder();
      const editor = await crlfEditor('a,b\n1,2\n\nnext,x\nlast');
      editor.selections = [new vscode.Selection(0, 0, 2, 0), new vscode.Selection(3, 0, 3, 6)];
      await run(entryOf('TABLE-029'), dependencies)(editor);
      assert.strictEqual(editor.document.getText(), 'a,1\r\nb,2\r\n\r\nnext\r\nx\r\nlast');
    });
  });

  suite('registration', () => {
    test('command IDs, titles and examples match the TABLE commands of the showcase data', () => {
      const rows = dataRows();
      assert.deepStrictEqual(rows.map(([id]) => id), TABLE_COMMAND_ENTRIES.map((entry) => entry.id));
      assert.deepStrictEqual(rows.map(([, , command]) => command), TABLE_COMMAND_ENTRIES.map((entry) => `selection-manipulator.${entry.name}`));
      assert.deepStrictEqual(rows.map(([, , , title]) => title), TABLE_COMMAND_ENTRIES.map((entry) => entry.title));
      assert.deepStrictEqual(rows.map(([, kind]) => kind), TABLE_COMMAND_ENTRIES.map((entry) =>
        entry.output === 'replace' ? `派生:${TABLE_COMMAND_ENTRIES.find((base) => base.name === entry.name.replace(/\.replace$/, ''))!.id}` : '基本'));

      for (const [id, , , , example] of rows) {
        const match = /^`(.*)` → `(.*)`$/.exec(example);
        assert.ok(match, `${id}: ${example}`);
        const expected = TABLE_ROADMAP_EXAMPLES[id];
        let input = expand(match[1]);
        let output = expand(match[2]);
        // `（…）` after the input stands for the typed values.
        const typed = /^(.*)（(.*)）$/s.exec(input);
        if (typed) {
          input = typed[1];
          assert.strictEqual(typed[2], expected.note, id);
        } else {
          assert.strictEqual(expected.note, undefined, id);
        }
        assert.strictEqual(input, expected.input, id);
        const notified = /^(.*)（通知）$/.exec(output);
        if (notified) {
          output = notified[1];
          assert.strictEqual(entryOf(id).output, 'notify', id);
        }
        if (id === 'TABLE-001' || id === 'TABLE-026') {
          // JSON written with 2 spaces: compared as values.
          assert.deepStrictEqual(JSON.parse(expected.expected), JSON.parse(output), id);
        } else if (id === 'TABLE-011' || id === 'TABLE-030') {
          // `…` shortens the example; compared without the layout (line breaks and indentation).
          const [head, tail] = output.split('…');
          const compact = expected.expected.replace(/\n\s*/g, '');
          assert.ok(compact.startsWith(head) && compact.endsWith(tail), `${id}: ${compact}`);
        } else {
          assert.strictEqual(output, expected.expected, id);
        }
      }
    });

    // The wiring in extension.ts is checked statically (as for the ENC / HASH / DATA commands).
    test('extension.ts registers every command with the matching handler exactly once', () => {
      const source = fs.readFileSync(path.resolve(__dirname, '../../../src/extension.ts'), 'utf8');
      TABLE_COMMAND_ENTRIES.forEach((entry) => {
        const registration = `registerTextEditorCommand('selection-manipulator.${entry.name}', tableHandler('${entry.name}'))`;
        assert.strictEqual(source.split(registration).length - 1, 1, registration);
        assert.strictEqual(source.split(`'selection-manipulator.${entry.name}'`).length - 1, 1, entry.name);
      });
    });

    test('package.json and the Show Commands list register all 30 commands exactly once', () => {
      const packageJson = JSON.parse(fs.readFileSync(path.resolve(__dirname, '../../../package.json'), 'utf8'));
      const contributes = packageJson.contributes;
      type MenuItem = { command?: string; submenu?: string; group?: string; when?: string };
      const count = (entries: MenuItem[], id: string) => entries.filter((entry) => entry.command === id).length;
      const tableMenu: MenuItem[] = contributes.menus['selection-manipulator.table.submenu'];
      const replaceMenu: MenuItem[] = contributes.menus['selection-manipulator.table.replace.submenu'];
      TABLE_COMMAND_ENTRIES.forEach((entry) => {
        const id = `selection-manipulator.${entry.name}`;
        assert.strictEqual(count(contributes.commands, id), 1, `commands: ${id}`);
        assert.strictEqual(count(myCommands, id), 1, `showCommands: ${id}`);
        const command = contributes.commands.find((c: { command: string }) => c.command === id);
        assert.deepStrictEqual(command, { command: id, title: entry.title, category: 'Selection Manipulator' });
        const shown = myCommands.find((c) => c.command === id);
        assert.strictEqual(shown?.title, `Transform - ${entry.title}`);
        assert.strictEqual(shown?.canMultiSelection, true);
        const palette = contributes.menus.commandPalette.filter((c: MenuItem) => c.command === id);
        assert.deepStrictEqual(palette, [{ when: 'editorHasSelection', command: id }], id);
        const [menu, other] = entry.output === 'replace' ? [replaceMenu, tableMenu] : [tableMenu, replaceMenu];
        assert.strictEqual(count(menu, id), 1, `menu: ${id}`);
        assert.strictEqual(count(other, id), 0, `other menu: ${id}`);
        Object.entries(contributes.menus).filter(([name]) => !name.startsWith('selection-manipulator.table.') && name !== 'commandPalette')
          .forEach(([name, items]) => assert.strictEqual(count(items as MenuItem[], id), 0, `${name}: ${id}`));
      });
      // The five CSV commands of DATA2 (DATAX) follow the TABLE commands in the CSV / TSV submenu.
      assert.deepStrictEqual(tableMenu.map((item) => item.command), [
        ...TABLE_COMMAND_ENTRIES.filter((e) => e.output !== 'replace').map((e) => `selection-manipulator.${e.name}`),
        ...DATA2_COMMAND_ENTRIES.filter((e) => e.name.startsWith('csv.')).map((e) => `selection-manipulator.${e.name}`),
      ]);
      assert.deepStrictEqual(replaceMenu.map((item) => item.command),
        TABLE_COMMAND_ENTRIES.filter((e) => e.output === 'replace').map((e) => `selection-manipulator.${e.name}`));
      assert.strictEqual(tableMenu.length, 25 + 5);
      assert.strictEqual(replaceMenu.length, 5);
      [tableMenu, replaceMenu].forEach((menu) =>
        menu.forEach((item, i) => assert.strictEqual(item.group, `selection-manipulator@${i}`, item.command)));
      const submenus: { id: string; label: string }[] = contributes.submenus;
      assert.deepStrictEqual(submenus.filter((s) => s.id.startsWith('selection-manipulator.table.')), [
        { id: 'selection-manipulator.table.submenu', label: 'CSV / TSV' },
        { id: 'selection-manipulator.table.replace.submenu', label: 'CSV / TSV' },
      ]);
      // The new submenus follow the existing items, which keep their places.
      const transform: MenuItem[] = contributes.menus['selection-manipulator.transform.submenu'];
      assert.deepStrictEqual(transform[transform.length - 1],
        { when: 'editorHasSelection', submenu: 'selection-manipulator.table.submenu', group: 'selection-manipulator@19' });
      assert.strictEqual(transform[transform.length - 2].submenu, 'selection-manipulator.data.submenu');
      const replace: MenuItem[] = contributes.menus['selection-manipulator.replace.submenu'];
      assert.deepStrictEqual(replace[replace.length - 1],
        { when: 'editorHasSelection', submenu: 'selection-manipulator.table.replace.submenu', group: 'selection-manipulator@9' });
      assert.strictEqual(replace[replace.length - 2].submenu, 'selection-manipulator.data.replace.submenu');
      const ids = contributes.commands.map((c: { command: string }) => c.command);
      assert.strictEqual(new Set(ids).size, ids.length, 'command IDs are unique');
      const titles = contributes.commands.map((c: { title: string; category?: string }) => `${c.category ?? ''}:${c.title}`);
      assert.strictEqual(new Set(titles).size, titles.length, 'command titles are unique');
      const allTitles = myCommands.map((c) => c.title);
      assert.strictEqual(new Set(allTitles).size, allTitles.length, 'Show Commands titles are unique');
    });

    test('the existing CSV <-> Markdown commands keep their registration and are not in the new menus', () => {
      const packageJson = JSON.parse(fs.readFileSync(path.resolve(__dirname, '../../../package.json'), 'utf8'));
      const menus = packageJson.contributes.menus;
      const existing = ['csv.to-markdown', 'csv.to-markdown.replace', 'csv.from-markdown', 'csv.from-markdown.replace'];
      const source = fs.readFileSync(path.resolve(__dirname, '../../../src/extension.ts'), 'utf8');
      for (const name of existing) {
        const id = `selection-manipulator.${name}`;
        assert.strictEqual(packageJson.contributes.commands.filter((c: { command: string }) => c.command === id).length, 1, id);
        assert.ok(!source.includes(`tableHandler('${name}')`), id);
        for (const menu of ['selection-manipulator.table.submenu', 'selection-manipulator.table.replace.submenu']) {
          assert.ok(!menus[menu].some((item: { command?: string }) => item.command === id), `${menu}: ${id}`);
        }
      }
    });

    test('no dependency was added', () => {
      const packageJson = JSON.parse(fs.readFileSync(path.resolve(__dirname, '../../../package.json'), 'utf8'));
      assert.deepStrictEqual(Object.keys(packageJson.dependencies).sort(), ['change-case', 'diff', 'js-yaml', 'xml-formatter']);
    });
  });
});
