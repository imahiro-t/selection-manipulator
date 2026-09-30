import * as assert from 'assert';
import * as fs from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';
import { DATE_MAX_CRON_LINES, findDatePromptProblem, RawDateSettings } from '../../handler/dateCommon';
import { DATE_COPIED, DATE_NOTHING_SELECTED, DateDependencies, dateCommandHandlerInternal } from '../../handler/dateCommandHandler';
import { DATE_COMMAND_ENTRIES, DateCommandEntry } from '../../handler/dateTransforms';
import { MAX_OUTPUT_LENGTH } from '../../handler/encodeTransforms';
import { myCommands } from '../../handler/showCommandsHandler';
import { DATE_INVALID_INPUT, DATE_ROADMAP_EXAMPLES, DATE_TEST_NOW } from './dateExamples';
import { createTextEditor, undoIn } from './testUtils';
import { candidateRows } from './showcaseData';

const SEPARATOR = '\n---\n';
const NOT_CHANGED = 'The selection was not changed: ';
const NOT_SHOWN = 'No result was shown: ';
const NOT_COPIED = 'Nothing was copied: ';

const prefixOf = (entry: DateCommandEntry): string =>
  entry.output === 'replace' ? NOT_CHANGED : entry.output === 'clipboard' ? NOT_COPIED : NOT_SHOWN;

/**
 * Records what the handlers show, open and copy instead of touching VS Code's UI. The input boxes
 * take their answers from `answers` in order (`undefined` = cancelled) and record their options.
 */
const recorder = (answers: (string | undefined)[] = [], options: { settings?: RawDateSettings; onPrompt?: () => void | Thenable<unknown> } = {}) => {
  const infos: string[] = [];
  const warnings: string[] = [];
  const errors: string[] = [];
  const opened: string[] = [];
  const copied: string[] = [];
  const prompts: vscode.InputBoxOptions[] = [];
  const queue = [...answers];
  const dependencies: DateDependencies = {
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
    showInputBox: async (boxOptions) => {
      prompts.push(boxOptions);
      await options.onPrompt?.();
      return queue.shift();
    },
    writeClipboard: (text) => {
      copied.push(text);
      return Promise.resolve();
    },
    getSettings: () => options.settings ?? {},
    now: DATE_TEST_NOW,
  };
  /** Everything shown, opened or copied except the information messages. */
  const everything = () => [warnings, errors, opened, copied];
  return { dependencies, infos, warnings, errors, opened, copied, prompts, everything };
};

const run = (entry: DateCommandEntry, dependencies: DateDependencies) => dateCommandHandlerInternal(dependencies)(entry.name);

const entryOf = (id: string): DateCommandEntry => {
  const found = DATE_COMMAND_ENTRIES.find((entry) => entry.id === id);
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

/** The DATE commands of the showcase data (scripts/showcase-data/DATE.json): [id, kind, command ID, title, example]. */
const dataRows = (): [string, string, string, string, string][] => candidateRows('DATE');

/** The expected result of two selections of the ROADMAP example. */
const twice = (entry: DateCommandEntry, expected: string): string => {
  switch (entry.output) {
    case 'notify':
      return `${DATE_ROADMAP_EXAMPLES[entry.id].input}: ${expected}, ${DATE_ROADMAP_EXAMPLES[entry.id].input}: ${expected}`;
    case 'new-tab':
      return [expected, expected].join(entry.blankLineBetween ? '\n\n' : '\n');
    default:
      return [expected, expected].join('\n');
  }
};

suite('Date Commands (DATE-001..030) Test Suite', () => {

  teardown(closeAllEditors);

  suite('each command (ROADMAP example)', () => {
    DATE_COMMAND_ENTRIES.forEach((entry) => {
      const example = DATE_ROADMAP_EXAMPLES[entry.id];
      const prefix = prefixOf(entry);

      test(`${entry.id} ${entry.name}: ${entry.output} for two selections (prompts asked once)`, async () => {
        const { dependencies, prompts, infos, warnings, errors, opened, copied } = recorder(example.inputs);
        const blocks = [example.input, example.input];
        const editor = await createTextEditor(blocks.join(SEPARATOR));
        selectBlocks(editor, blocks, SEPARATOR, true);
        await run(entry, dependencies)(editor);
        assert.deepStrictEqual([warnings, errors], [[], []]);
        assert.strictEqual(prompts.length, entry.prompts.length);
        const expected = twice(entry, example.expected);
        switch (entry.output) {
          case 'replace':
            assert.strictEqual(editor.document.getText(), [example.expected, example.expected].join(SEPARATOR));
            assert.deepStrictEqual([infos, opened, copied], [[], [], []]);
            await undoIn(editor);
            assert.strictEqual(editor.document.getText(), blocks.join(SEPARATOR));
            break;
          case 'new-tab':
            assert.deepStrictEqual([opened, infos, copied], [[expected], [], []]);
            assert.strictEqual(editor.document.getText(), blocks.join(SEPARATOR));
            break;
          case 'clipboard':
            assert.deepStrictEqual([copied, infos, opened], [[expected], [DATE_COPIED], []]);
            assert.strictEqual(editor.document.getText(), blocks.join(SEPARATOR));
            break;
          case 'notify':
            assert.deepStrictEqual([infos, opened, copied], [[expected], [], []]);
            assert.strictEqual(editor.document.getText(), blocks.join(SEPARATOR));
            break;
        }
      });

      test(`${entry.id} ${entry.name}: only empty or blank selections warn and ask nothing`, async () => {
        const { dependencies, prompts, warnings, errors, opened, copied, infos } = recorder(example.inputs);
        const text = `${example.input}\n  \n\t\n`;
        const editor = await createTextEditor(text);
        const lines = example.input.split('\n').length;
        editor.selections = [new vscode.Selection(0, 0, 0, 0), new vscode.Selection(lines, 0, lines + 2, 0)];
        await run(entry, dependencies)(editor);
        assert.strictEqual(editor.document.getText(), text);
        assert.deepStrictEqual([warnings, errors, opened, copied, infos], [[DATE_NOTHING_SELECTED], [], [], [], []]);
        assert.strictEqual(prompts.length, 0);
      });

      test(`${entry.id} ${entry.name}: unreadable input is reported and changes nothing`, async () => {
        const { dependencies, warnings, errors, opened, copied, infos } = recorder(example.inputs);
        const editor = await createTextEditor(DATE_INVALID_INPUT);
        selectWholeDocument(editor);
        await run(entry, dependencies)(editor);
        assert.strictEqual(editor.document.getText(), DATE_INVALID_INPUT);
        assert.deepStrictEqual([warnings, opened, copied, infos], [[], [], [], []]);
        assert.strictEqual(errors.length, 1, `${entry.id}: ${JSON.stringify(errors)}`);
        if (entry.id === 'DATE-008') {
          assert.strictEqual(errors[0], `${prefix}select two dates, or write two dates on each line`);
        } else {
          assert.ok(errors[0].startsWith(`${prefix}line 1: "abc" is not`), errors[0]);
        }
      });

      if (entry.prompts.length > 0) {
        test(`${entry.id} ${entry.name}: cancelling the prompt does nothing`, async () => {
          const { dependencies, prompts, everything, infos } = recorder([undefined]);
          const editor = await createTextEditor(example.input);
          selectWholeDocument(editor);
          await run(entry, dependencies)(editor);
          assert.strictEqual(editor.document.getText(), example.input);
          assert.deepStrictEqual([...everything(), infos], [[], [], [], [], []]);
          assert.strictEqual(prompts.length, 1);
        });
      }
    });
  });

  suite('selections and errors', () => {
    test('new editor: results in document order, blank selections skipped', async () => {
      const { dependencies, opened } = recorder();
      const blocks = ['2026-09-28', '   ', '2026-01-01\n\n2026-12-31'];
      const editor = await createTextEditor(blocks.join(SEPARATOR));
      selectBlocks(editor, blocks, SEPARATOR, true);
      await run(entryOf('DATE-007'), dependencies)(editor);
      assert.deepStrictEqual(opened, ['271\n1\n\n365']);
    });

    test('one invalid selection among several changes nothing; the message names the selection and the line', async () => {
      const { dependencies, errors } = recorder();
      const blocks = ['2026-09-28', '2026-09-28\n2026-02-30'];
      const editor = await createTextEditor(blocks.join(SEPARATOR));
      selectBlocks(editor, blocks);
      await run(entryOf('DATE-029'), dependencies)(editor);
      assert.strictEqual(editor.document.getText(), blocks.join(SEPARATOR));
      assert.deepStrictEqual(errors, ['The selection was not changed: selection 2 of 2: line 2: "2026-02-30" is not a valid date']);
    });

    test('Replace: only the selections whose result differs are edited, in one step', async () => {
      const { dependencies } = recorder(['0']);
      const blocks = ['2026-09-28', '2026-09-29'];
      const editor = await createTextEditor(blocks.join(SEPARATOR));
      selectBlocks(editor, blocks);
      await run(entryOf('DATE-009'), dependencies)(editor);
      assert.strictEqual(editor.document.getText(), blocks.join(SEPARATOR));
      const next = recorder(['1']);
      await run(entryOf('DATE-009'), next.dependencies)(editor);
      assert.strictEqual(editor.document.getText(), ['2026-09-29', '2026-09-30'].join(SEPARATOR));
      await undoIn(editor);
      assert.strictEqual(editor.document.getText(), blocks.join(SEPARATOR));
    });

    test('DATE-004: values of several selections and lines in document order, blank lines not counted', async () => {
      const { dependencies, infos, errors } = recorder();
      const blocks = ['2026-09-29\n\n2026-09-30', '2026-09-28'];
      const editor = await createTextEditor(blocks.join(SEPARATOR));
      selectBlocks(editor, blocks, SEPARATOR, true);
      await run(entryOf('DATE-004'), dependencies)(editor);
      assert.deepStrictEqual(errors, []);
      assert.deepStrictEqual(infos, ['2026-09-29: Tuesday（火）, 2026-09-30: Wednesday（水）, 2026-09-28: Monday（月）']);
    });

    test('DATE-004: more than 20 values end with "… and N more"', async () => {
      const { dependencies, infos } = recorder();
      const text = Array.from({ length: 22 }, () => '2026-09-28').join('\n');
      const editor = await createTextEditor(text);
      selectWholeDocument(editor);
      await run(entryOf('DATE-004'), dependencies)(editor);
      assert.strictEqual(infos.length, 1);
      assert.ok(infos[0].endsWith('2026-09-28: Monday（月）, … and 2 more'), infos[0]);
    });

    test('DATE-004: an invalid line shows no result and names the selection and the line', async () => {
      const { dependencies, infos, errors } = recorder();
      const blocks = ['2026-09-28', '2026-09-28\nabc', '2026-09-28'];
      const editor = await createTextEditor(blocks.join(SEPARATOR));
      selectBlocks(editor, blocks);
      await run(entryOf('DATE-004'), dependencies)(editor);
      assert.deepStrictEqual([infos, errors], [[], ['No result was shown: selection 2 of 3: line 2: "abc" is not a date']]);
    });

    test('DATE-008: two selections of one date each make one pair', async () => {
      const { dependencies, opened, errors } = recorder();
      const blocks = ['2026-09-28', '2026-01-01'];
      const editor = await createTextEditor(blocks.join(SEPARATOR));
      selectBlocks(editor, blocks, SEPARATOR, true);
      await run(entryOf('DATE-008'), dependencies)(editor);
      assert.deepStrictEqual([opened, errors], [['-270 days'], []]);
    });

    test('DATE-025: 1,000 expressions in total are explained, 1,001 are refused before any search', async function () {
      this.timeout(60_000);
      const ok = recorder();
      const lines = Array.from({ length: DATE_MAX_CRON_LINES }, () => '0 0 30 2 *');
      const blocks = [lines.slice(0, 600).join('\n'), lines.slice(600).join('\n')];
      const editor = await createTextEditor(blocks.join(SEPARATOR));
      selectBlocks(editor, blocks);
      await run(entryOf('DATE-025'), ok.dependencies)(editor);
      assert.deepStrictEqual(ok.errors, []);
      assert.strictEqual(ok.opened.length, 1);
      assert.strictEqual(ok.opened[0].split('\n').filter((line) => line !== '').length, DATE_MAX_CRON_LINES);

      const over = recorder();
      const overBlocks = [lines.slice(0, 600).join('\n'), [...lines.slice(600), '0 0 30 2 *'].join('\n')];
      const overEditor = await createTextEditor(overBlocks.join(SEPARATOR));
      selectBlocks(overEditor, overBlocks);
      await run(entryOf('DATE-025'), over.dependencies)(overEditor);
      assert.deepStrictEqual([over.opened, over.errors],
        [[], ['No result was shown: too many cron expressions: at most 1,000 lines can be explained at once']]);
    });

    test('DATE-022: the output limit stops a growing range and only warns', async function () {
      this.timeout(60_000);
      const { dependencies, warnings, errors } = recorder();
      // 1,000 ranges of 10,000 dates give about 110,000,000 characters.
      const text = '2000-01-01..2027-05-18\n'.repeat(1_000);
      const editor = await createTextEditor(text);
      selectWholeDocument(editor);
      await run(entryOf('DATE-022'), dependencies)(editor);
      assert.strictEqual(editor.document.getText(), text);
      assert.deepStrictEqual(errors, []);
      assert.deepStrictEqual(warnings, [`${NOT_CHANGED}the result would be longer than ${MAX_OUTPUT_LENGTH.toLocaleString('en-US')} characters. Select less text.`]);
    });

    test('a selection longer than 1,000,000 characters is refused', async function () {
      this.timeout(60_000);
      const { dependencies, errors, opened } = recorder();
      const editor = await createTextEditor('1'.repeat(1_000_001));
      selectWholeDocument(editor);
      await run(entryOf('DATE-017'), dependencies)(editor);
      assert.deepStrictEqual(opened, []);
      assert.deepStrictEqual(errors, ['No result was shown: the selection is longer than 1,000,000 characters']);
    });

    test('long selected text is never quoted in full in a message', async () => {
      const secret = 'S'.repeat(200);
      const { dependencies, errors } = recorder();
      const editor = await createTextEditor(secret);
      selectWholeDocument(editor);
      await run(entryOf('DATE-013'), dependencies)(editor);
      assert.strictEqual(errors.length, 1);
      assert.ok(!errors[0].includes(secret), errors[0]);
      assert.ok(errors[0].includes('…'), errors[0]);
    });
  });

  suite('settings', () => {
    test('the settings change the results', async () => {
      const cases: [string, RawDateSettings, string, string][] = [
        ['DATE-003', { timeZones: ['Asia/Kolkata'] }, '2026-09-28T00:00:00Z', 'Asia/Kolkata 05:30'],
        ['DATE-005', { weekdayLanguage: 'en' }, '2026-09-28', '2026-09-28 (Mon)'],
        ['DATE-024', { fiscalYearStartMonth: 10 }, '2026-09-28', '2026 Q3 / FY2025 下期'],
      ];
      for (const [id, settings, input, expected] of cases) {
        const { dependencies, opened } = recorder([], { settings });
        const editor = await createTextEditor(input);
        selectWholeDocument(editor);
        await run(entryOf(id), dependencies)(editor);
        assert.strictEqual(entryOf(id).output === 'replace' ? editor.document.getText() : opened[0], expected, id);
      }
    });

    test('an invalid setting stops the commands that use it, before any prompt', async () => {
      const cases: [string, RawDateSettings, string][] = [
        ['DATE-003', { timeZones: ['Nowhere/City'] }, 'No result was shown: the setting selection-manipulator.date.timeZones is invalid'],
        ['DATE-005', { weekdayLanguage: 'fr' }, 'The selection was not changed: the setting selection-manipulator.date.weekdayLanguage is invalid'],
        ['DATE-024', { fiscalYearStartMonth: 13 }, 'No result was shown: the setting selection-manipulator.date.fiscalYearStartMonth is invalid'],
      ];
      for (const [id, settings, message] of cases) {
        const { dependencies, errors, opened, prompts } = recorder([], { settings });
        const editor = await createTextEditor('2026-09-28');
        selectWholeDocument(editor);
        await run(entryOf(id), dependencies)(editor);
        assert.deepStrictEqual([errors, opened, prompts.length], [[message], [], 0], id);
        assert.strictEqual(editor.document.getText(), '2026-09-28');
      }
    });

    test('a command that does not use a broken setting still runs', async () => {
      const { dependencies, opened, errors } = recorder([], { settings: { timeZones: [], weekdayLanguage: 'fr', fiscalYearStartMonth: 0 } });
      const editor = await createTextEditor('2026-09-28');
      selectWholeDocument(editor);
      await run(entryOf('DATE-006'), dependencies)(editor);
      assert.deepStrictEqual([opened, errors], [['2026-W40'], []]);
    });
  });

  suite('prompts', () => {
    test('input box options: prompt, ignoreFocusOut, nothing pre-filled, validateInput', async () => {
      const cases: [string, string, string, string][] = [
        ['DATE-002', 'Asia/Tokyo', 'Mars/Olympus', 'Asia/Tokyo; x'],
        ['DATE-009', '-1000000', '1000001', '1.5'],
        ['DATE-010', '120000', '-120001', 'x'],
        ['DATE-012', "yyyy'T'HH", 'EEE', "'open"],
      ];
      for (const [id, good, bad, alsoBad] of cases) {
        const { dependencies, prompts } = recorder([undefined]);
        const editor = await createTextEditor('2026-09-28');
        selectWholeDocument(editor);
        await run(entryOf(id), dependencies)(editor);
        assert.strictEqual(prompts.length, 1, id);
        const prompt = prompts[0];
        assert.strictEqual(prompt.ignoreFocusOut, true, id);
        assert.strictEqual(prompt.value, undefined, id);
        assert.strictEqual(prompt.password, undefined, id);
        assert.ok(prompt.prompt && prompt.placeHolder, id);
        const rule = entryOf(id).prompts[0].rule;
        assert.strictEqual(prompt.validateInput!(good), undefined, id);
        assert.strictEqual(prompt.validateInput!(bad), findDatePromptProblem(bad, rule), id);
        assert.notStrictEqual(prompt.validateInput!(bad), undefined, id);
        assert.notStrictEqual(prompt.validateInput!(alsoBad), undefined, id);
        assert.notStrictEqual(prompt.validateInput!('x'.repeat(101)), undefined, id);
      }
    });

    test('a refused value that comes back anyway ends with a warning and changes nothing', async () => {
      const cases: [string, string, string][] = [
        ['DATE-002', 'Nowhere/City', 'No result was shown: Enter an IANA time zone such as Asia/Tokyo, UTC or America/New_York.'],
        ['DATE-027', 'Nowhere/City', 'Nothing was copied: Enter an IANA time zone such as Asia/Tokyo, UTC or America/New_York.'],
        ['DATE-009', '1000001', 'The selection was not changed: Enter an integer from -1,000,000 to 1,000,000.'],
        ['DATE-028', 'EEE', 'The selection was not changed: Unsupported pattern token "EEE".'],
      ];
      for (const [id, answer, message] of cases) {
        const { dependencies, warnings, opened, errors, copied } = recorder([answer]);
        const editor = await createTextEditor('2026-09-28');
        selectWholeDocument(editor);
        await run(entryOf(id), dependencies)(editor);
        assert.deepStrictEqual([warnings, opened, errors, copied], [[message], [], [], []], id);
        assert.strictEqual(editor.document.getText(), '2026-09-28');
      }
    });

    test('spaces around a typed value are ignored', async () => {
      const { dependencies } = recorder([' -1 ']);
      const editor = await createTextEditor('2026-09-28');
      selectWholeDocument(editor);
      await run(entryOf('DATE-009'), dependencies)(editor);
      assert.strictEqual(editor.document.getText(), '2026-09-27');
    });

    test('the selections are read again after the prompt closes', async () => {
      const editor = await createTextEditor('x\n2026-09-28');
      editor.selection = new vscode.Selection(1, 0, 1, 10);
      const { dependencies, opened } = recorder(['UTC'], {
        onPrompt: async () => {
          await editor.edit((editBuilder) => editBuilder.insert(new vscode.Position(0, 0), 'y\n'));
        },
      });
      await run(entryOf('DATE-002'), dependencies)(editor);
      assert.deepStrictEqual(opened, ['2026-09-28 00:00:00 +00:00']);
    });
  });

  suite('line breaks (document EOL)', () => {
    test('Replace keeps the CRLF line breaks; a range is written with CRLF', async () => {
      const { dependencies } = recorder();
      const editor = await crlfEditor('2026-09-28..2026-09-29\n\n2026-10-01..2026-10-01\n');
      editor.selection = new vscode.Selection(0, 0, 3, 0);
      await run(entryOf('DATE-022'), dependencies)(editor);
      assert.strictEqual(editor.document.getText(), '2026-09-28\r\n2026-09-29\r\n\r\n2026-10-01\r\n');
    });

    test('new editor results of several selections are joined with the document EOL (an empty line for DATE-003)', async () => {
      const blocks = ['2026-09-28T00:00:00Z', '2026-09-28T20:00:00Z'];
      const { dependencies, opened } = recorder([], { settings: { timeZones: ['UTC', 'Asia/Tokyo'] } });
      const editor = await crlfEditor(blocks.join(SEPARATOR));
      selectBlocks(editor, blocks, SEPARATOR.replace(/\n/g, '\r\n'));
      await run(entryOf('DATE-003'), dependencies)(editor);
      assert.deepStrictEqual(opened, ['UTC 00:00\r\nAsia/Tokyo 09:00\r\n\r\nUTC 20:00\r\nAsia/Tokyo 05:00 (翌日)']);
      const next = recorder();
      await run(entryOf('DATE-013'), next.dependencies)(editor);
      assert.deepStrictEqual(next.opened, ['20260928\r\n20260928']);
    });
  });

  suite('registration', () => {
    test('command IDs, titles and examples match the DATE commands of the showcase data', () => {
      const rows = dataRows();
      assert.deepStrictEqual(rows.map(([id]) => id), DATE_COMMAND_ENTRIES.map((entry) => entry.id));
      assert.deepStrictEqual(rows.map(([, , command]) => command), DATE_COMMAND_ENTRIES.map((entry) => `selection-manipulator.${entry.name}`));
      assert.deepStrictEqual(rows.map(([, , , title]) => title), DATE_COMMAND_ENTRIES.map((entry) => entry.title));
      assert.deepStrictEqual(rows.map(([, kind]) => kind), DATE_COMMAND_ENTRIES.map((entry) => {
        const base = { 'DATE-026': 'DATE-002', 'DATE-027': 'DATE-002', 'DATE-028': 'DATE-012', 'DATE-029': 'DATE-013', 'DATE-030': 'DATE-014' }[entry.id];
        return base === undefined ? '基本' : `派生:${base}`;
      }));

      for (const [id, , , , example] of rows) {
        const match = /^`(.*)` → `(.*)`$/.exec(example);
        assert.ok(match, `${id}: ${example}`);
        const expected = DATE_ROADMAP_EXAMPLES[id];
        let input = match[1].replace(/⏎/g, '\n').replace(/·/g, ' ');
        const output = match[2].replace(/⏎/g, '\n').replace(/·/g, ' ');
        // `（…）` after the input stands for the typed values.
        const typed = /^(.*)（(.*)）$/s.exec(input);
        if (typed) {
          input = typed[1];
          assert.strictEqual(typed[2], expected.note, id);
        } else {
          assert.strictEqual(expected.note, undefined, id);
        }
        assert.strictEqual(input, expected.input, id);
        const ellipsis = output.indexOf('…');
        if (ellipsis !== -1) {
          // A shortened example: what comes before and after `…` must match.
          assert.ok(expected.expected.startsWith(output.slice(0, ellipsis).trimEnd()), `${id}: ${expected.expected}`);
          assert.ok(expected.expected.endsWith(output.slice(ellipsis + 1)), `${id}: ${expected.expected}`);
        } else {
          assert.strictEqual(output, expected.expected, id);
        }
      }
    });

    // The wiring in extension.ts is checked statically (as for the other categories).
    test('extension.ts registers every command with dateCommandHandler exactly once', () => {
      const source = readRepoFile('src/extension.ts');
      DATE_COMMAND_ENTRIES.forEach((entry) => {
        const registration = `registerTextEditorCommand('selection-manipulator.${entry.name}', dateCommandHandler('${entry.name}'))`;
        assert.strictEqual(source.split(registration).length - 1, 1, registration);
        assert.strictEqual(source.split(`'selection-manipulator.${entry.name}'`).length - 1, 1, entry.name);
      });
    });

    test('package.json and the Show Commands list register all 30 commands exactly once', () => {
      const packageJson = JSON.parse(readRepoFile('package.json'));
      const contributes = packageJson.contributes;
      type MenuItem = { command?: string; submenu?: string; group?: string; when?: string };
      const count = (entries: MenuItem[], id: string) => entries.filter((entry) => entry.command === id).length;
      DATE_COMMAND_ENTRIES.forEach((entry) => {
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
          assert.strictEqual(count(items as MenuItem[], id), name === 'selection-manipulator.date.submenu' ? 1 : 0, `${name}: ${id}`));
      });
      const ids = contributes.commands.map((c: { command: string }) => c.command);
      assert.strictEqual(new Set(ids).size, ids.length, 'command IDs are unique');
      const titles = contributes.commands.map((c: { title: string; category?: string }) => `${c.category ?? ''}:${c.title}`);
      assert.strictEqual(new Set(titles).size, titles.length, 'command titles are unique');
      const allTitles = myCommands.map((c) => c.title);
      assert.strictEqual(new Set(allTitles).size, allTitles.length, 'Show Commands titles are unique');
    });

    test('the existing items of the Date Conversion submenu keep their places; the new ones follow in ROADMAP order', () => {
      const items: { command: string; group: string }[] = JSON.parse(readRepoFile('package.json')).contributes.menus['selection-manipulator.date.submenu'];
      const existing = ['to-iso', 'to-iso.replace', 'to-iso.clipboard', 'to-locale', 'to-locale.replace', 'to-locale.clipboard',
        'to-timestamp', 'to-timestamp.replace', 'to-timestamp.clipboard', 'to-timestamp-ms', 'to-timestamp-ms.replace', 'to-timestamp-ms.clipboard',
        'era-conversion', 'era-conversion.replace'].map((name) => `selection-manipulator.date.${name}`);
      assert.deepStrictEqual(items.map((item) => item.command), [...existing, ...DATE_COMMAND_ENTRIES.map((entry) => `selection-manipulator.${entry.name}`)]);
      items.forEach((item, i) => assert.strictEqual(item.group, `selection-manipulator@${i}`, item.command));
    });

    test('the three settings are contributed with their defaults and the window scope', () => {
      const properties = JSON.parse(readRepoFile('package.json')).contributes.configuration.properties;
      assert.deepStrictEqual(Object.keys(properties).filter((key) => key.startsWith('selection-manipulator.date.')).sort(), [
        'selection-manipulator.date.fiscalYearStartMonth',
        'selection-manipulator.date.timeZones',
        'selection-manipulator.date.weekdayLanguage',
      ]);
      assert.deepStrictEqual(properties['selection-manipulator.date.timeZones'].default, ['UTC', 'Asia/Tokyo', 'America/Los_Angeles']);
      assert.strictEqual(properties['selection-manipulator.date.timeZones'].maxItems, 20);
      assert.strictEqual(properties['selection-manipulator.date.weekdayLanguage'].default, 'ja');
      assert.deepStrictEqual(properties['selection-manipulator.date.weekdayLanguage'].enum, ['ja', 'en']);
      assert.strictEqual(properties['selection-manipulator.date.fiscalYearStartMonth'].default, 4);
      Object.values(properties).forEach((property) => assert.strictEqual((property as { scope: string }).scope, 'window'));
      // The defaults are what VS Code gives the commands.
      const configuration = vscode.workspace.getConfiguration('selection-manipulator.date');
      assert.deepStrictEqual(configuration.get('timeZones'), ['UTC', 'Asia/Tokyo', 'America/Los_Angeles']);
      assert.strictEqual(configuration.get('weekdayLanguage'), 'ja');
      assert.strictEqual(configuration.get('fiscalYearStartMonth'), 4);
    });

    test('the existing date commands keep their handlers', () => {
      const source = readRepoFile('src/extension.ts');
      for (const [name, args] of [['to-iso', "'iso', 'new-tab'"], ['to-locale.replace', "'locale', 'replace'"], ['to-timestamp-ms.clipboard', "'timestamp-ms', 'clipboard'"]]) {
        assert.strictEqual(source.split(`registerTextEditorCommand('selection-manipulator.date.${name}', dateHandler(${args}))`).length - 1, 1, name);
      }
    });

    test('no dependency was added', () => {
      const packageJson = JSON.parse(readRepoFile('package.json'));
      assert.deepStrictEqual(Object.keys(packageJson.dependencies).sort(), ['change-case', 'diff', 'js-yaml', 'xml-formatter']);
    });
  });
});
