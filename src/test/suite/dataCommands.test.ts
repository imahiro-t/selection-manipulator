import * as assert from 'assert';
import * as fs from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';
import { DataDependencies, dataHandlerInternal } from '../../handler/dataHandler';
import { dataStructHandler } from '../../handler/dataStructHandler';
import { findPathProblem } from '../../handler/dataCommon';
import { MAX_OUTPUT_LENGTH } from '../../handler/encodeTransforms';
import { myCommands } from '../../handler/showCommandsHandler';
import { DATA_COMMAND_ENTRIES, DataCommandEntry } from '../../handler/dataTransforms';
import { CHROME_ON_WINDOWS_UA, DATA_ROADMAP_EXAMPLES, pretty } from './dataExamples';
import { createTextEditor } from './testUtils';
import { candidateRows } from './showcaseData';

const SEPARATOR = '\n---\n';

/**
 * Records what the handlers show and open instead of touching VS Code's UI. The input box answers
 * `answer.value` (`undefined` = cancelled) and records the options it was shown with.
 */
const recorder = (answer: { value: string | undefined } = { value: undefined }, onPrompt: () => void | Thenable<unknown> = () => undefined) => {
  const infos: string[] = [];
  const warnings: string[] = [];
  const errors: string[] = [];
  const opened: string[] = [];
  const prompts: vscode.InputBoxOptions[] = [];
  const dependencies: DataDependencies = {
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
      return answer.value;
    },
  };
  const everything = () => [infos, warnings, errors, opened];
  return { dependencies, infos, warnings, errors, opened, prompts, everything };
};

const run = (entry: DataCommandEntry, dependencies: DataDependencies) => dataHandlerInternal(dependencies)(entry.name);

const entryOf = (id: string): DataCommandEntry => {
  const found = DATA_COMMAND_ENTRIES.find((entry) => entry.id === id);
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

/** The DATA commands of the showcase data (scripts/showcase-data/DATA.json): [id, kind, command ID, title, example]. */
const dataRows = (): [string, string, string, string, string][] => candidateRows('DATA');

/** Inputs that the command cannot convert (the default is broken JSON). */
const INVALID_INPUTS: Record<string, string> = {
  'DATA-008': 'no separator here',
  'DATA-010': 'a=1\na.b=2',
  'DATA-020': 'a: [1',
  'DATA-021': 'a: [1',
  'DATA-040': 'a: [1',
  'DATA-029': 'no value',
  'DATA-031': 'no colon here',
};

/** Expands the `⏎` / `··` notation of the ROADMAP examples. */
const expand = (text: string): string => text.replace(/⏎/g, '\n').replace(/·/g, ' ');

suite('Data Format Commands (DATA-001..040) Test Suite', () => {

  teardown(closeAllEditors);

  suite('each command (ROADMAP example)', () => {
    DATA_COMMAND_ENTRIES.forEach((entry) => {
      const example = DATA_ROADMAP_EXAMPLES[entry.id];

      if (entry.output === 'replace') {
        test(`${entry.id} ${entry.name}: replaces each selection and opens nothing`, async () => {
          const { dependencies, everything } = recorder();
          const blocks = [example.input, example.input];
          const editor = await createTextEditor(blocks.join(SEPARATOR));
          selectBlocks(editor, blocks);
          await run(entry, dependencies)(editor);
          assert.strictEqual(editor.document.getText(), [example.expected, example.expected].join(SEPARATOR));
          assert.deepStrictEqual(everything(), [[], [], [], []]);
        });
      } else if (entry.output === 'notify') {
        test(`${entry.id} ${entry.name}: notifies and does not change the text`, async () => {
          const { dependencies, infos, errors, everything } = recorder();
          const editor = await createTextEditor(example.input);
          selectWholeDocument(editor);
          await run(entry, dependencies)(editor);
          assert.deepStrictEqual([...infos, ...errors], [example.expected]);
          assert.strictEqual(editor.document.getText(), example.input);
          assert.deepStrictEqual(everything()[3], []);
        });
      } else if (entry.output === 'merge') {
        test(`${entry.id} ${entry.name}: merges all selections into one new editor`, async () => {
          const { dependencies, opened, everything } = recorder();
          const blocks = example.selections!;
          const editor = await createTextEditor(blocks.join(SEPARATOR));
          selectBlocks(editor, blocks, SEPARATOR, true);
          await run(entry, dependencies)(editor);
          assert.deepStrictEqual(opened, [example.expected]);
          assert.strictEqual(editor.document.getText(), blocks.join(SEPARATOR));
          assert.deepStrictEqual(everything().slice(0, 3), [[], [], []]);
        });
      } else {
        test(`${entry.id} ${entry.name}: opens the results of all selections in one new editor`, async () => {
          const { dependencies, opened, prompts, everything } = recorder({ value: example.path });
          const blocks = [example.input, example.input];
          const editor = await createTextEditor(blocks.join(SEPARATOR));
          selectBlocks(editor, blocks, SEPARATOR, true);
          await run(entry, dependencies)(editor);
          assert.deepStrictEqual(opened, [[example.expected, example.expected].join('\n')]);
          assert.strictEqual(editor.document.getText(), blocks.join(SEPARATOR));
          assert.deepStrictEqual(everything().slice(0, 3), [[], [], []]);
          assert.strictEqual(prompts.length, entry.prompt ? 1 : 0);
        });
      }

      test(`${entry.id} ${entry.name}: only empty selections do nothing (no input box)`, async () => {
        const { dependencies, prompts, everything } = recorder({ value: 'a' });
        const editor = await createTextEditor(example.input);
        editor.selections = [new vscode.Selection(0, 0, 0, 0), new vscode.Selection(0, 1, 0, 1)];
        await run(entry, dependencies)(editor);
        assert.strictEqual(editor.document.getText(), example.input);
        assert.deepStrictEqual(everything(), [[], [], [], []]);
        assert.strictEqual(prompts.length, 0);
      });

      // DATA-032 accepts any line (an unknown User-Agent gives "Unknown").
      if (entry.output !== 'merge' && entry.id !== 'DATA-032') {
        test(`${entry.id} ${entry.name}: invalid input ends with an error notification and changes nothing`, async () => {
          const { dependencies, errors, opened } = recorder({ value: 'a' });
          const invalid = INVALID_INPUTS[entry.id] ?? '{"a": [1, @';
          const editor = await createTextEditor(invalid);
          selectWholeDocument(editor);
          await run(entry, dependencies)(editor);
          assert.strictEqual(editor.document.getText(), invalid);
          assert.deepStrictEqual(opened, []);
          assert.strictEqual(errors.length, 1, `${entry.id}: ${JSON.stringify(errors)}`);
          if (entry.output !== 'notify') {
            assert.ok(errors[0].startsWith('The selection was not changed: '), errors[0]);
          }
        });
      }
    });
  });

  suite('selections and errors', () => {
    test('one invalid selection among several: nothing is replaced, the message names the selection', async () => {
      const { dependencies, errors } = recorder();
      const blocks = ['{"b":1,"a":2}', '{"b":'];
      const editor = await createTextEditor(blocks.join(SEPARATOR));
      selectBlocks(editor, blocks);
      await run(entryOf('DATA-034'), dependencies)(editor);
      assert.strictEqual(editor.document.getText(), blocks.join(SEPARATOR));
      assert.deepStrictEqual(errors, ['The selection was not changed: selection 2 of 2: invalid JSON: line 1, column 6: unexpected end of input']);
    });

    test('the output limit is shared by all selections and only warns', async () => {
      const { dependencies, opened, warnings, errors } = recorder();
      // Each selection gives about 4,900,000 characters of paths; together they exceed the limit.
      const block = `{"k":[${Array(500_000).fill('0').join(',')}]}`;
      const editor = await createTextEditor([block, block, block].join(SEPARATOR));
      selectBlocks(editor, [block, block, block]);
      await run(entryOf('DATA-016'), dependencies)(editor);
      assert.deepStrictEqual([opened, errors], [[], []]);
      assert.strictEqual(warnings.length, 1);
      assert.ok(warnings[0].startsWith('The selection was not changed: '), warnings[0]);
      assert.ok(warnings[0].includes(MAX_OUTPUT_LENGTH.toLocaleString('en-US')), warnings[0]);
    });

    test('a selection longer than 5,000,000 characters is refused', async () => {
      const { dependencies, errors, opened } = recorder();
      const editor = await createTextEditor(`[${' '.repeat(5_000_000)}]`);
      selectWholeDocument(editor);
      await run(entryOf('DATA-001'), dependencies)(editor);
      assert.deepStrictEqual(opened, []);
      assert.deepStrictEqual(errors, ['The selection was not changed: the selection is longer than 5,000,000 characters']);
    });

    test('long selected text is never quoted in full in a message', async () => {
      const { dependencies, errors } = recorder();
      const secret = 'S'.repeat(200);
      const editor = await createTextEditor(`{"${secret} x":1}`);
      selectWholeDocument(editor);
      await run(entryOf('DATA-004'), dependencies)(editor);
      assert.strictEqual(errors.length, 1);
      assert.ok(!errors[0].includes(secret), errors[0]);
      assert.ok(errors[0].includes('…'), errors[0]);
    });

    test('DATA-018 needs two or more selections', async () => {
      const { dependencies, warnings, opened } = recorder();
      const editor = await createTextEditor('{"a":1}');
      selectWholeDocument(editor);
      await run(entryOf('DATA-018'), dependencies)(editor);
      assert.deepStrictEqual(opened, []);
      assert.deepStrictEqual(warnings, ['Select two or more JSON objects to merge (one per selection).']);
    });

    test('DATA-018 names the selection that is not an object', async () => {
      const { dependencies, errors, opened } = recorder();
      const blocks = ['{"a":1}', '[1]', '{"b":2}'];
      const editor = await createTextEditor(blocks.join(SEPARATOR));
      selectBlocks(editor, blocks);
      await run(entryOf('DATA-018'), dependencies)(editor);
      assert.deepStrictEqual(opened, []);
      assert.deepStrictEqual(errors, ['The selection was not changed: selection 2 of 3: Merge JSON Objects needs a JSON object in every selection']);
    });

    test('DATA-025 lists several selections', async () => {
      const { dependencies, infos } = recorder();
      const blocks = ['[1,2,3]', '{"a":1}'];
      const editor = await createTextEditor(blocks.join(SEPARATOR));
      selectBlocks(editor, blocks, SEPARATOR, true);
      await run(entryOf('DATA-025'), dependencies)(editor);
      assert.deepStrictEqual(infos, ['Selection 1: 3 elements (4 nodes in total); Selection 2: 1 key (2 nodes in total)']);
    });
  });

  suite('DATA-019 Validate JSON', () => {
    const validate = entryOf('DATA-019');

    test('the ROADMAP example selects the "}" at line 1, column 8', async () => {
      const { dependencies, errors } = recorder();
      const editor = await createTextEditor('{"a":1,}');
      selectWholeDocument(editor);
      await run(validate, dependencies)(editor);
      assert.deepStrictEqual(errors, ['Invalid JSON at line 1, column 8: unexpected character "}"']);
      assert.strictEqual(editor.selections.length, 1);
      assert.ok(editor.selection.isEqual(new vscode.Selection(0, 7, 0, 8)));
      assert.strictEqual(editor.document.getText(editor.selection), '}');
    });

    test('a missing end gives an empty selection at the end of the selection', async () => {
      const { dependencies, errors } = recorder();
      const editor = await createTextEditor('{"a":1');
      selectWholeDocument(editor);
      await run(validate, dependencies)(editor);
      assert.deepStrictEqual(errors, ['Invalid JSON at line 1, column 7: unexpected end of input']);
      assert.ok(editor.selection.isEqual(new vscode.Selection(0, 6, 0, 6)));
    });

    test('line and column are those of the document when the selection starts in the middle', async () => {
      const { dependencies, errors } = recorder();
      const editor = await crlfEditor('x\nlet a = {\n  "k": [1 2]\n};');
      editor.selection = new vscode.Selection(1, 8, 2, 12);
      await run(validate, dependencies)(editor);
      assert.deepStrictEqual(errors, ['Invalid JSON at line 3, column 11: unexpected character "2"']);
      assert.ok(editor.selection.isEqual(new vscode.Selection(2, 10, 2, 11)));
    });

    test('several selections: "Valid JSON (n selections)" or the first error only', async () => {
      const valid = recorder();
      const blocks = ['[1]', '{"a":null}'];
      const editor = await createTextEditor(blocks.join(SEPARATOR));
      selectBlocks(editor, blocks);
      await run(validate, valid.dependencies)(editor);
      assert.deepStrictEqual(valid.infos, ['Valid JSON (2 selections)']);

      const invalid = recorder();
      const badBlocks = ['[1]', '[1,]', '{'];
      const second = await createTextEditor(badBlocks.join(SEPARATOR));
      selectBlocks(second, badBlocks, SEPARATOR, true);
      await run(validate, invalid.dependencies)(second);
      assert.deepStrictEqual(invalid.errors, ['Invalid JSON at line 3, column 4: unexpected character "]"']);
      assert.strictEqual(second.selections.length, 1);
      assert.strictEqual(second.document.getText(second.selection), ']');
    });
  });

  suite('input box (DATA-015 / 023 / 024)', () => {
    test('prompt options and validateInput', async () => {
      const { dependencies, prompts } = recorder({ value: undefined });
      const editor = await createTextEditor('{"a":1}');
      selectWholeDocument(editor);
      await run(entryOf('DATA-015'), dependencies)(editor);
      await run(entryOf('DATA-023'), dependencies)(editor);
      assert.strictEqual(prompts.length, 2);
      assert.strictEqual(prompts[0].prompt, 'JSON path (e.g. a.b[0])');
      assert.strictEqual(prompts[1].prompt, 'Field (e.g. id or user.name)');
      prompts.forEach((prompt) => {
        assert.strictEqual(prompt.ignoreFocusOut, true);
        assert.strictEqual(prompt.value, undefined);
        assert.strictEqual(prompt.password, undefined);
        assert.strictEqual(prompt.validateInput, findPathProblem);
      });
    });

    test('cancelling does nothing', async () => {
      for (const id of ['DATA-015', 'DATA-023', 'DATA-024']) {
        const { dependencies, everything } = recorder({ value: undefined });
        const editor = await createTextEditor('[{"a":1}]');
        selectWholeDocument(editor);
        await run(entryOf(id), dependencies)(editor);
        assert.deepStrictEqual(everything(), [[], [], [], []], id);
      }
    });

    test('an invalid path that comes back anyway is refused with a warning', async () => {
      const { dependencies, warnings, opened } = recorder({ value: 'a..b' });
      const editor = await createTextEditor('{"a":1}');
      selectWholeDocument(editor);
      await run(entryOf('DATA-015'), dependencies)(editor);
      assert.deepStrictEqual(opened, []);
      assert.strictEqual(warnings.length, 1);
      assert.ok(warnings[0].startsWith('The selection was not changed: Invalid path.'), warnings[0]);
    });

    test('a path that finds nothing is an error', async () => {
      const { dependencies, errors } = recorder({ value: 'a.x' });
      const editor = await createTextEditor('{"a":{"b":1}}');
      selectWholeDocument(editor);
      await run(entryOf('DATA-015'), dependencies)(editor);
      assert.deepStrictEqual(errors, ['The selection was not changed: nothing found at the path a.x']);
    });

    test('the selections are read again after the input box closes', async () => {
      const editor = await createTextEditor('x\n{"a":[5]}');
      editor.selection = new vscode.Selection(1, 0, 1, 9);
      const { dependencies, opened } = recorder({ value: 'a[0]' }, async () => {
        await editor.edit((editBuilder) => editBuilder.insert(new vscode.Position(0, 0), 'zz\n'));
      });
      await run(entryOf('DATA-015'), dependencies)(editor);
      assert.deepStrictEqual(opened, ['5']);
    });
  });

  suite('line breaks (document EOL)', () => {
    test('CRLF documents get CRLF results (XML, TOML, JSON Lines, JSON)', async () => {
      const cases: [string, string, string][] = [
        ['DATA-004', '{"a":{"b":1}}', '<a>\r\n  <b>1</b>\r\n</a>'],
        ['DATA-005', '{"a":{"b":1}}', '[a]\r\nb = 1'],
        ['DATA-012', '[1,2]', '1\r\n2'],
        ['DATA-006', '[a]\nb = 1', '{\r\n  "a": {\r\n    "b": 1\r\n  }\r\n}'],
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
      const blocks = ['[1,2]', '[3]'];
      const editor = await crlfEditor(blocks.join(SEPARATOR));
      selectBlocks(editor, blocks, SEPARATOR.replace(/\n/g, '\r\n'));
      await run(entryOf('DATA-012'), dependencies)(editor);
      assert.deepStrictEqual(opened, ['1\r\n2\r\n3']);
    });

    test('YAML Replace in a CRLF document: CRLF output, the trailing CRLF is kept', async () => {
      const { dependencies } = recorder();
      const editor = await crlfEditor('a:   {b: 1}\nc: [1, 2]\n\nnext');
      editor.selection = new vscode.Selection(0, 0, 2, 0);
      await run(entryOf('DATA-040'), dependencies)(editor);
      assert.strictEqual(editor.document.getText(), 'a:\r\n  b: 1\r\nc:\r\n  - 1\r\n  - 2\r\n\r\nnext');
    });

    test('YAML Replace without a trailing line break adds none', async () => {
      const { dependencies } = recorder();
      const editor = await crlfEditor('b: 1\na: 2\nrest');
      editor.selection = new vscode.Selection(0, 0, 1, 4);
      await run(entryOf('DATA-040'), dependencies)(editor);
      assert.strictEqual(editor.document.getText(), 'b: 1\r\na: 2\r\nrest');
      const sorted = recorder();
      await run(entryOf('DATA-021'), sorted.dependencies)(editor);
      assert.deepStrictEqual(sorted.opened, ['a: 2\r\nb: 1']);
    });
  });

  suite('round trips with existing commands', () => {
    test('DATA-003 output reads back with the existing Env to JSON command', async () => {
      const { dependencies, opened } = recorder();
      const json = '{"A":"1","B":"x y","C":"say \\"hi\\"","D":"","E.f-g":"#x"}';
      const editor = await createTextEditor(json);
      selectWholeDocument(editor);
      await run(entryOf('DATA-003'), dependencies)(editor);
      const env = await createTextEditor(opened[0]);
      selectWholeDocument(env);
      await dataStructHandler('env-to-json', true)(env);
      // The existing handler does not wait for its edit.
      for (let i = 0; i < 50 && env.document.getText() === opened[0]; i++) {
        await new Promise((resolve) => setTimeout(resolve, 20));
      }
      assert.deepStrictEqual(JSON.parse(env.document.getText()), JSON.parse(json));
    });
  });

  suite('registration', () => {
    test('command IDs, titles and examples match the DATA commands of the showcase data', async () => {
      const rows = dataRows();
      assert.deepStrictEqual(rows.map(([id]) => id), DATA_COMMAND_ENTRIES.map((entry) => entry.id));
      assert.deepStrictEqual(rows.map(([, , command]) => command), DATA_COMMAND_ENTRIES.map((entry) => `selection-manipulator.${entry.name}`));
      assert.deepStrictEqual(rows.map(([, , , title]) => title), DATA_COMMAND_ENTRIES.map((entry) => entry.title));
      assert.deepStrictEqual(rows.map(([, kind]) => kind), DATA_COMMAND_ENTRIES.map((entry) =>
        entry.output === 'replace' ? `派生:${DATA_COMMAND_ENTRIES.find((base) => base.name === entry.name.replace(/\.replace$/, ''))!.id}` : '基本'));

      for (const [id, , , , example] of rows) {
        const match = /^`(.*)` → `(.*)`$/.exec(example);
        assert.ok(match, `${id}: ${example}`);
        const expected = DATA_ROADMAP_EXAMPLES[id];
        let input = expand(match[1]);
        const output = expand(match[2]);
        // `（…）` after the input is the value typed into the input box.
        const typed = /^(.*)（(.*)）$/.exec(input);
        if (typed) {
          input = typed[1];
          assert.strictEqual(typed[2], expected.path, id);
        }
        if (id === 'DATA-018') {
          // `[a] [b]` stands for two selections.
          assert.deepStrictEqual(input.split(' ').map((part) => part.slice(1, -1)), expected.selections, id);
        } else if (id === 'DATA-032') {
          // The ROADMAP shortens the User-Agent with `…`.
          const [head, tail] = input.split('…');
          assert.ok(CHROME_ON_WINDOWS_UA.startsWith(head) && CHROME_ON_WINDOWS_UA.includes(tail), input);
        } else {
          assert.strictEqual(input, expected.input, id);
        }
        if (id === 'DATA-019') {
          assert.strictEqual(output, '1 行 8 列目でエラー（通知）');
          assert.ok(expected.expected.includes('line 1, column 8'));
        } else if (id === 'DATA-025') {
          assert.strictEqual(output, '3 elements（通知）');
          assert.ok(expected.expected.startsWith('3 elements'));
        } else if (output !== expected.expected && /^[[{]/.test(expected.expected) && expected.expected.includes('\n')) {
          // JSON written with 2 spaces: compared as values. DATA-026 adds `$schema` / `required` to the ROADMAP example.
          const actual = JSON.parse(expected.expected);
          const shown = JSON.parse(output);
          if (id === 'DATA-026') {
            Object.entries(shown).forEach(([key, value]) => assert.deepStrictEqual(actual[key], value, `${id}: ${key}`));
          } else {
            assert.deepStrictEqual(actual, shown, id);
          }
        } else {
          assert.strictEqual(output, expected.expected, id);
        }
      }
    });

    // The wiring in extension.ts is checked statically (as for the ENC / HASH commands), because
    // running the commands through executeCommand would activate the extension inside the test host.
    test('extension.ts registers every command with the matching handler exactly once', () => {
      const source = fs.readFileSync(path.resolve(__dirname, '../../../src/extension.ts'), 'utf8');
      DATA_COMMAND_ENTRIES.forEach((entry) => {
        const registration = `registerTextEditorCommand('selection-manipulator.${entry.name}', dataHandler('${entry.name}'))`;
        assert.strictEqual(source.split(registration).length - 1, 1, registration);
        assert.strictEqual(source.split(`'selection-manipulator.${entry.name}'`).length - 1, 1, entry.name);
      });
    });

    test('package.json and the Show Commands list register all 40 commands exactly once', () => {
      const packageJson = JSON.parse(fs.readFileSync(path.resolve(__dirname, '../../../package.json'), 'utf8'));
      const contributes = packageJson.contributes;
      type MenuItem = { command?: string; submenu?: string; group?: string; when?: string };
      const count = (entries: MenuItem[], id: string) => entries.filter((entry) => entry.command === id).length;
      const dataMenu: MenuItem[] = contributes.menus['selection-manipulator.data.submenu'];
      const replaceMenu: MenuItem[] = contributes.menus['selection-manipulator.data.replace.submenu'];
      DATA_COMMAND_ENTRIES.forEach((entry) => {
        const id = `selection-manipulator.${entry.name}`;
        assert.strictEqual(count(contributes.commands, id), 1, `commands: ${id}`);
        assert.strictEqual(count(myCommands, id), 1, `showCommands: ${id}`);
        const command = contributes.commands.find((c: { command: string }) => c.command === id);
        assert.deepStrictEqual(command, { command: id, title: entry.title, category: 'Selection Manipulator' });
        const shown = myCommands.find((c) => c.command === id);
        assert.strictEqual(shown?.title, `Transform - Data Format - ${entry.title}`);
        assert.strictEqual(shown?.canMultiSelection, true);
        const palette = contributes.menus.commandPalette.filter((c: MenuItem) => c.command === id);
        assert.deepStrictEqual(palette, [{ when: 'editorHasSelection', command: id }], id);
        const [menu, other] = entry.output === 'replace' ? [replaceMenu, dataMenu] : [dataMenu, replaceMenu];
        assert.strictEqual(count(menu, id), 1, `menu: ${id}`);
        assert.strictEqual(count(other, id), 0, `other menu: ${id}`);
        Object.entries(contributes.menus).filter(([name]) => !name.startsWith('selection-manipulator.data.') && name !== 'commandPalette')
          .forEach(([name, items]) => assert.strictEqual(count(items as MenuItem[], id), 0, `${name}: ${id}`));
      });
      assert.deepStrictEqual(dataMenu.map((item) => item.command),
        DATA_COMMAND_ENTRIES.filter((e) => e.output !== 'replace').map((e) => `selection-manipulator.${e.name}`));
      assert.deepStrictEqual(replaceMenu.map((item) => item.command),
        DATA_COMMAND_ENTRIES.filter((e) => e.output === 'replace').map((e) => `selection-manipulator.${e.name}`));
      [dataMenu, replaceMenu].forEach((menu) =>
        menu.forEach((item, i) => assert.strictEqual(item.group, `selection-manipulator@${i}`, item.command)));
      const submenus: { id: string; label: string }[] = contributes.submenus;
      assert.deepStrictEqual(submenus.filter((s) => s.id.startsWith('selection-manipulator.data.')), [
        { id: 'selection-manipulator.data.submenu', label: 'Data Format' },
        { id: 'selection-manipulator.data.replace.submenu', label: 'Data Format' },
      ]);
      // The Data Format submenus keep their fixed places (right after Checksum / Encode) when later submenus are added.
      const transform: MenuItem[] = contributes.menus['selection-manipulator.transform.submenu'];
      const dataIndex = transform.findIndex((item) => item.submenu === 'selection-manipulator.data.submenu');
      assert.deepStrictEqual(transform.filter((item) => item.submenu === 'selection-manipulator.data.submenu'),
        [{ when: 'editorHasSelection', submenu: 'selection-manipulator.data.submenu', group: 'selection-manipulator@18' }]);
      assert.strictEqual(transform[dataIndex - 1].submenu, 'selection-manipulator.checksum.submenu');
      const replace: MenuItem[] = contributes.menus['selection-manipulator.replace.submenu'];
      const dataReplaceIndex = replace.findIndex((item) => item.submenu === 'selection-manipulator.data.replace.submenu');
      assert.deepStrictEqual(replace.filter((item) => item.submenu === 'selection-manipulator.data.replace.submenu'),
        [{ when: 'editorHasSelection', submenu: 'selection-manipulator.data.replace.submenu', group: 'selection-manipulator@8' }]);
      assert.strictEqual(replace[dataReplaceIndex - 1].submenu, 'selection-manipulator.encode.replace.submenu');
      const ids = contributes.commands.map((c: { command: string }) => c.command);
      assert.strictEqual(new Set(ids).size, ids.length, 'command IDs are unique');
      const allTitles = myCommands.map((c) => c.title);
      assert.strictEqual(new Set(allTitles).size, allTitles.length, 'Show Commands titles are unique');
    });

    test('no dependency was added', () => {
      const packageJson = JSON.parse(fs.readFileSync(path.resolve(__dirname, '../../../package.json'), 'utf8'));
      assert.deepStrictEqual(Object.keys(packageJson.dependencies).sort(), ['change-case', 'diff', 'js-yaml', 'xml-formatter']);
    });
  });
});
