import * as assert from 'assert';
import * as fs from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';
import { findDatePromptProblem } from '../../handler/dateCommon';
import { DATE_NOTHING_SELECTED, DateDependencies } from '../../handler/dateCommandHandler';
import { DATE_COMMAND_ENTRIES, DateCommandEntry } from '../../handler/dateTransforms';
import { date2CommandHandlerInternal } from '../../handler/date2CommandHandler';
import { DATE2_COMMAND_ENTRIES } from '../../handler/date2Transforms';
import { myCommands } from '../../handler/showCommandsHandler';
import { DATE2_EXAMPLES } from './date2Examples';
import { DATE_TEST_NOW } from './dateExamples';
import { createTextEditor } from './testUtils';

const PREFIX = 'selection-manipulator.';
const SEPARATOR = '\n---\n';
const NOT_CHANGED = 'The selection was not changed: ';
const NOT_SHOWN = 'No result was shown: ';

/**
 * Records what the handlers show and open instead of touching VS Code's UI. The input boxes take
 * their answers from `answers` in order (`undefined` = cancelled) and record their options.
 */
const recorder = (answers: (string | undefined)[] = []) => {
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
    showInputBox: (options) => {
      prompts.push(options);
      return Promise.resolve(queue.shift());
    },
    writeClipboard: (text) => {
      copied.push(text);
      return Promise.resolve();
    },
    getSettings: () => ({}),
    now: DATE_TEST_NOW,
  };
  const everything = () => [infos, warnings, errors, opened, copied];
  return { dependencies, warnings, errors, opened, prompts, everything };
};

const entryOf = (id: string): DateCommandEntry => {
  const found = DATE2_COMMAND_ENTRIES.find((entry) => entry.id === id);
  assert.ok(found, id);
  return found;
};

const run = (id: string, dependencies: DateDependencies) => date2CommandHandlerInternal(dependencies)(entryOf(id).name);

/** Opens `text` and selects the `[start, end]` offsets (all of it when none are given). */
const open = async (text: string, ranges?: [number, number][]): Promise<vscode.TextEditor> => {
  const editor = await createTextEditor(text);
  const document = editor.document;
  editor.selections = (ranges ?? [[0, text.length]]).map(([start, end]) => new vscode.Selection(document.positionAt(start), document.positionAt(end)));
  return editor;
};

/** Selects the blocks of a `block---block---...` document with one cursor each (last block first). */
const openBlocks = async (blocks: string[]): Promise<vscode.TextEditor> => {
  const ranges: [number, number][] = [];
  let offset = 0;
  for (const block of blocks) {
    ranges.push([offset, offset + block.length]);
    offset += block.length + SEPARATOR.length;
  }
  return open(blocks.join(SEPARATOR), ranges.reverse());
};

const readRepoFile = (file: string): string => fs.readFileSync(path.resolve(__dirname, '../../..', file), 'utf8');

suite('Extended Date Commands (DATEX-001..015) Test Suite', () => {

  suite('each command (showcase example)', () => {
    DATE2_COMMAND_ENTRIES.forEach((entry) => {
      const example = DATE2_EXAMPLES[entry.id];

      test(`${entry.id} ${entry.name}: each selection on its own, prompts asked once`, async () => {
        const { dependencies, prompts, opened, everything } = recorder(example.inputs);
        const blocks = [example.input, `  ${example.input}\n\n${example.input}`];
        const editor = await openBlocks(blocks);
        await run(entry.id, dependencies)(editor);
        const second = `  ${example.expected}\n\n${example.expected}`;
        if (entry.output === 'replace') {
          assert.strictEqual(editor.document.getText(), [example.expected, second].join(SEPARATOR));
          assert.deepStrictEqual(everything(), [[], [], [], [], []]);
        } else {
          assert.strictEqual(editor.document.getText(), blocks.join(SEPARATOR), 'the document is not changed');
          assert.deepStrictEqual(everything(), [[], [], [], [[example.expected, second].join('\n')], []]);
        }
        assert.strictEqual(prompts.length, entry.prompts.length);
        assert.strictEqual(opened.length, entry.output === 'new-tab' ? 1 : 0);
      });

      test(`${entry.id} ${entry.name}: only empty or blank selections warn and ask nothing`, async () => {
        const { dependencies, prompts, everything } = recorder(example.inputs);
        const editor = await open('x  \n\t', [[0, 0], [1, 5]]);
        await run(entry.id, dependencies)(editor);
        assert.strictEqual(editor.document.getText(), 'x  \n\t');
        assert.deepStrictEqual(everything(), [[], [DATE_NOTHING_SELECTED], [], [], []]);
        assert.strictEqual(prompts.length, 0);
      });

      test(`${entry.id} ${entry.name}: an unreadable line is reported with its line number and changes nothing`, async () => {
        const { dependencies, warnings, errors, opened } = recorder(example.inputs);
        const text = `${example.input}\na?c`;
        const editor = await open(text);
        await run(entry.id, dependencies)(editor);
        assert.strictEqual(editor.document.getText(), text);
        assert.deepStrictEqual([warnings, opened], [[], []]);
        assert.strictEqual(errors.length, 1, JSON.stringify(errors));
        const prefix = entry.output === 'replace' ? NOT_CHANGED : NOT_SHOWN;
        assert.ok(errors[0].startsWith(`${prefix}line 2: "a?c"`), errors[0]);
      });

      if (entry.prompts.length > 0) {
        test(`${entry.id} ${entry.name}: cancelling the prompt does nothing`, async () => {
          const { dependencies, prompts, everything } = recorder([undefined]);
          const editor = await open(example.input);
          await run(entry.id, dependencies)(editor);
          assert.strictEqual(editor.document.getText(), example.input);
          assert.deepStrictEqual(everything(), [[], [], [], [], []]);
          assert.strictEqual(prompts.length, 1);
        });
      }
    });
  });

  suite('selections and line breaks', () => {
    test('several selections in document order; CRLF line breaks are kept', async () => {
      const editor = await createTextEditor('2026-10-15\n2026-02-10\n---\n2024-02-01');
      await editor.edit((editBuilder) => editBuilder.setEndOfLine(vscode.EndOfLine.CRLF));
      editor.selections = [new vscode.Selection(3, 0, 3, 10), new vscode.Selection(0, 0, 1, 10)];
      const { dependencies } = recorder();
      await run('DATEX-004', dependencies)(editor);
      assert.strictEqual(editor.document.getText(), '2026-10-31\r\n2026-02-28\r\n---\r\n2024-02-29');
      const second = recorder();
      const pairs = await createTextEditor('2026-10-01 2026-10-08\n2026-10-08 2026-10-01');
      await pairs.edit((editBuilder) => editBuilder.setEndOfLine(vscode.EndOfLine.CRLF));
      pairs.selection = new vscode.Selection(0, 0, 1, 21);
      await run('DATEX-006', second.dependencies)(pairs);
      assert.deepStrictEqual(second.opened, ['5\r\n-5']);
    });

    test('one invalid selection among several changes nothing; the message names the selection and the line', async () => {
      const { dependencies, errors } = recorder();
      const blocks = ['14:30', '9:00\n24:00'];
      const editor = await open(blocks.join(SEPARATOR), [[0, 5], [5 + SEPARATOR.length, 5 + SEPARATOR.length + 10]]);
      await run('DATEX-010', dependencies)(editor);
      assert.strictEqual(editor.document.getText(), blocks.join(SEPARATOR));
      assert.deepStrictEqual(errors, [`${NOT_CHANGED}selection 2 of 2: line 2: "24:00" is not a time from 0:00 to 23:59`]);
    });
  });

  suite('prompts', () => {
    test('the input boxes validate their values (duration, integer range, time zone, epoch choice)', async () => {
      const cases: [string, string, string, string][] = [
        ['DATEX-001', 'P1DT2H', '1 day', '"1 day" is not an ISO 8601 duration such as P1DT2H (elements of up to 9 digits).'],
        ['DATEX-001', '-pt90m', 'P1234567890D', '"P1234567890D" is not an ISO 8601 duration such as P1DT2H (elements of up to 9 digits).'],
        ['DATEX-005', '-100000', '100001', 'Enter an integer from -100,000 to 100,000.'],
        ['DATEX-007', 'Asia/Tokyo', 'Mars/Olympus', 'Enter an IANA time zone such as Asia/Tokyo, UTC or America/New_York.'],
        ['DATEX-012', ' Twitter ', 'x', 'Enter one of discord, twitter.'],
      ];
      for (const [id, good, bad, message] of cases) {
        const { dependencies, prompts } = recorder([undefined]);
        await run(id, dependencies)(await open('2026-10-01'));
        assert.strictEqual(prompts.length, 1, id);
        const rule = entryOf(id).prompts[0].rule;
        assert.strictEqual(prompts[0].validateInput!(bad), message, id);
        assert.strictEqual(findDatePromptProblem(bad, rule), message, id);
        assert.strictEqual(prompts[0].validateInput!(good), undefined, id);
        assert.strictEqual(prompts[0].ignoreFocusOut, true, id);
      }
    });

    test('a refused value that comes back anyway ends with a warning and changes nothing', async () => {
      const cases: [string, string, string][] = [
        ['DATEX-001', 'P', `${NOT_CHANGED}"P" is not an ISO 8601 duration such as P1DT2H (elements of up to 9 digits).`],
        ['DATEX-005', '100001', `${NOT_CHANGED}Enter an integer from -100,000 to 100,000.`],
        ['DATEX-012', 'unix', `${NOT_SHOWN}Enter one of discord, twitter.`],
      ];
      for (const [id, answer, message] of cases) {
        const { dependencies, everything } = recorder([answer]);
        const editor = await open('2026-10-01');
        await run(id, dependencies)(editor);
        assert.deepStrictEqual(everything(), [[], [message], [], [], []], id);
        assert.strictEqual(editor.document.getText(), '2026-10-01');
      }
    });

    test('the epoch is read in any case; the typed duration is trimmed', async () => {
      const { dependencies, opened } = recorder(['TWITTER']);
      await run('DATEX-012', dependencies)(await open('1541815603606036480'));
      assert.deepStrictEqual(opened, ['2022-06-28T16:07:40.105Z']);
      const second = recorder(['  -P1D  ']);
      const editor = await open('2026-10-01');
      await run('DATEX-001', second.dependencies)(editor);
      assert.strictEqual(editor.document.getText(), '2026-09-30');
    });
  });

  suite('limits and failures', () => {
    test('the output limit is shared by all selections', async () => {
      const { dependencies, everything } = recorder();
      // About 2,400,000 characters per selection (100,000 lines of "2026-W40"): five of them exceed 10,000,000 in a new tab.
      const block = Array.from({ length: 100_000 }, () => '2026-W40').join('\n');
      const editor = await openBlocks([block, block, block, block, block]);
      await run('DATEX-008', dependencies)(editor);
      assert.deepStrictEqual(everything(), [[], [`${NOT_SHOWN}the result would be longer than 10,000,000 characters. Select less text.`], [], [], []]);
    });

    test('an unexpected failure shows a fixed message and never the selected text', async () => {
      const { dependencies, errors } = recorder();
      dependencies.openResult = () => {
        throw new TypeError('secret selected text');
      };
      const original = console.error;
      const logged: string[] = [];
      console.error = (message: string) => logged.push(message);
      try {
        await run('DATEX-013', dependencies)(await open('01ARZ3NDEKTSV4RRFFQ69G5FAV'));
      } finally {
        console.error = original;
      }
      assert.deepStrictEqual(errors, [`${NOT_SHOWN}the dates could not be processed`]);
      assert.ok(logged.every((message) => !message.includes('secret') && !message.includes('01ARZ3')), logged.join('\n'));
    });
  });

  suite('registration', () => {
    test('candidate IDs, command IDs, titles and examples match the DATEX commands of the showcase data', () => {
      const data = JSON.parse(readRepoFile('scripts/showcase-data/DATEX.json')).commands as { id: string; candidateId: string; example: { ja: string } }[];
      const rows = data.slice(0, 15);
      assert.deepStrictEqual(rows.map((row) => row.candidateId), DATE2_COMMAND_ENTRIES.map((entry) => entry.id));
      assert.deepStrictEqual(rows.map((row) => row.id), DATE2_COMMAND_ENTRIES.map((entry) => `${PREFIX}${entry.name}`));
      for (const row of rows) {
        const match = /^`(.*)` → `(.*)`$/.exec(row.example.ja);
        assert.ok(match, `${row.candidateId}: ${row.example.ja}`);
        const expected = DATE2_EXAMPLES[row.candidateId];
        let input = match[1].replace(/⏎/g, '\n');
        const typed = /^(.*)（(.*)）$/s.exec(input);
        if (typed) {
          input = typed[1];
          assert.strictEqual(typed[2], expected.note, row.candidateId);
        } else {
          assert.strictEqual(expected.note, undefined, row.candidateId);
        }
        assert.strictEqual(input, expected.input, row.candidateId);
        assert.strictEqual(match[2].replace(/⏎/g, '\n'), expected.expected, row.candidateId);
      }
    });

    test('the command IDs are new: none is a DATE command', () => {
      const names = new Set(DATE_COMMAND_ENTRIES.map((entry) => entry.name));
      DATE2_COMMAND_ENTRIES.forEach((entry) => assert.ok(!names.has(entry.name), entry.name));
    });

    test('extension.ts registers every command with date2CommandHandler exactly once', () => {
      const source = readRepoFile('src/extension.ts');
      assert.strictEqual(source.split('// Date, generate and random extended (DATEX-001..024, group DATE2)').length - 1, 1);
      DATE2_COMMAND_ENTRIES.forEach((entry) => {
        const registration = `registerTextEditorCommand('${PREFIX}${entry.name}', date2CommandHandler('${entry.name}'))`;
        assert.strictEqual(source.split(registration).length - 1, 1, registration);
        assert.strictEqual(source.split(`'${PREFIX}${entry.name}'`).length - 1, 1, entry.name);
      });
    });

    test('package.json, the command palette, the Date Conversion submenu and Show Commands register every command exactly once', () => {
      const contributes = JSON.parse(readRepoFile('package.json')).contributes;
      type MenuItem = { command?: string; submenu?: string; group?: string; when?: string };
      const count = (items: MenuItem[], id: string) => items.filter((item) => item.command === id).length;
      DATE2_COMMAND_ENTRIES.forEach((entry) => {
        const id = `${PREFIX}${entry.name}`;
        assert.deepStrictEqual(contributes.commands.filter((c: MenuItem) => c.command === id),
          [{ command: id, title: entry.title, category: 'Selection Manipulator' }], id);
        assert.deepStrictEqual(myCommands.filter((c) => c.command === id), [{ command: id, title: entry.title, canMultiSelection: true }], id);
        assert.deepStrictEqual(contributes.menus.commandPalette.filter((c: MenuItem) => c.command === id),
          [{ when: 'editorHasSelection', command: id }], id);
        Object.entries(contributes.menus).filter(([name]) => name !== 'commandPalette').forEach(([name, items]) =>
          assert.strictEqual(count(items as MenuItem[], id), name === `${PREFIX}date.submenu` ? 1 : 0, `${name}: ${id}`));
      });
      const items: MenuItem[] = contributes.menus[`${PREFIX}date.submenu`];
      assert.strictEqual(items.length, 59, '44 + 15');
      assert.deepStrictEqual(items.slice(-15).map((item) => item.command), DATE2_COMMAND_ENTRIES.map((entry) => `${PREFIX}${entry.name}`));
      items.forEach((item, i) => assert.strictEqual(item.group, `selection-manipulator@${i}`, item.command));
      const ids = contributes.commands.map((c: { command: string }) => c.command);
      assert.strictEqual(ids.length, 993, '969 before DATE2 + 24');
      assert.strictEqual(new Set(ids).size, ids.length, 'command IDs are unique');
      const titles = contributes.commands.map((c: { title: string; category?: string }) => `${c.category ?? ''}:${c.title}`);
      assert.strictEqual(new Set(titles).size, titles.length, 'command titles are unique');
      const shown = myCommands.map((c) => c.title);
      assert.strictEqual(new Set(shown).size, shown.length, 'Show Commands titles are unique');
    });
  });
});
