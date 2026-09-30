import * as assert from 'assert';
import * as fs from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';
import { runRegexCaptureInWorker, runRegexInWorker, runRegexSplitInWorker } from '../../handler/lineRegex';
import { LINE_REGEX_MAX_INPUT_LENGTH } from '../../handler/lineTransforms';
import {
  MSEL_DOCUMENT_CHANGED,
  MSEL_TOO_MANY_SELECTIONS,
  mselCommandHandlerInternal,
  MselDependencies,
} from '../../handler/mselCommandHandler';
import {
  MSEL_COMMAND_ENTRIES,
  MSEL_MAX_SELECTIONS,
  MSEL_NEED_TWO,
  MSEL_WHEN_CLAUSES,
  MselCommandEntry,
} from '../../handler/mselTransforms';
import { myCommands } from '../../handler/showCommandsHandler';
import { expandNotation, MSEL_ROADMAP_EXAMPLES, parseMarked, renderMarked } from './mselExamples';
import { createTextEditor } from './testUtils';
import { candidateRows } from './showcaseData';

const PREFIX = 'selection-manipulator.';

/**
 * Records what the handlers show instead of touching VS Code's UI. The input boxes answer with
 * `answers` in turn (`undefined` = cancelled) and are recorded. The real regex worker is used
 * unless it is replaced.
 */
const recorder = (answers: (string | undefined)[] = [], overrides: Partial<MselDependencies> = {}) => {
  const infos: string[] = [];
  const warnings: string[] = [];
  const errors: string[] = [];
  const boxes: vscode.InputBoxOptions[] = [];
  const queue = [...answers];
  const dependencies: MselDependencies = {
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
    showInputBox: (options) => {
      boxes.push(options);
      return Promise.resolve(queue.shift());
    },
    runRegex: runRegexInWorker,
    runRegexSplit: runRegexSplitInWorker,
    regexTimeoutMs: 2000,
    regexMaxInputLength: LINE_REGEX_MAX_INPUT_LENGTH,
    ...overrides,
  };
  return { dependencies, infos, warnings, errors, boxes };
};

const entryOf = (id: string): MselCommandEntry => {
  const found = MSEL_COMMAND_ENTRIES.find((entry) => entry.id === id);
  assert.ok(found, id);
  return found;
};

const run = (entry: MselCommandEntry, dependencies: MselDependencies, entries: readonly MselCommandEntry[] = MSEL_COMMAND_ENTRIES) =>
  mselCommandHandlerInternal(dependencies, entries)(entry.name);

/** Opens a marked text (`[…]` selection, `|` cursor, `⏎`, `·`) with its selections. */
const open = async (marked: string, reversed = false): Promise<vscode.TextEditor> => {
  const { text, ranges } = parseMarked(marked);
  const editor = await createTextEditor(text);
  const document = editor.document;
  const selections = ranges.map(([start, end]) => (reversed
    ? new vscode.Selection(document.positionAt(end), document.positionAt(start))
    : new vscode.Selection(document.positionAt(start), document.positionAt(end))));
  editor.selections = reversed ? selections.reverse() : selections;
  return editor;
};

/** The document text with the selections marked. */
const state = (editor: vscode.TextEditor): string => {
  const document = editor.document;
  return renderMarked(document.getText(), editor.selections.map((selection) => [document.offsetAt(selection.start), document.offsetAt(selection.end)]));
};

const closeAllEditors = async () => {
  for (let i = 0; i < 20 && vscode.window.visibleTextEditors.length > 0; i++) {
    await vscode.commands.executeCommand('workbench.action.revertAndCloseActiveEditor');
  }
};

const readRepoFile = (file: string): string => fs.readFileSync(path.resolve(__dirname, '../../..', file), 'utf8');

/** The content of a Markdown code span. */
const codeSpan = (span: string): string => {
  const ticks = /^`+/.exec(span)?.[0] ?? '';
  assert.ok(ticks.length > 0 && span.endsWith(ticks), span);
  return span.slice(ticks.length, span.length - ticks.length);
};

/** The MSEL commands of the showcase data (scripts/showcase-data/MSEL.json): [id, kind, command ID, title, example]. */
const dataRows = (): [string, string, string, string, string][] => candidateRows('MSEL');

const REDOS = '^(a+)+$';
const REDOS_TEXT = `[${'a'.repeat(34)}b] [${'a'.repeat(34)}c]`;

suite('Multi Cursor Commands (MSEL-001..030) Test Suite', () => {

  teardown(closeAllEditors);

  suite('each command (ROADMAP example)', () => {
    MSEL_COMMAND_ENTRIES.forEach((entry) => {
      const example = MSEL_ROADMAP_EXAMPLES[entry.id];

      test(`${entry.id} ${entry.name}: ${example.input} → ${example.expected}`, async () => {
        const { dependencies, infos, warnings, errors, boxes } = recorder(example.inputs);
        const editor = await open(example.input, true);
        const before = editor.document.getText();
        await run(entry, dependencies)(editor);
        assert.deepStrictEqual([warnings, errors], [[], []]);
        assert.strictEqual(boxes.length, entry.inputs?.length ?? 0);
        assert.strictEqual(state(editor), expandNotation(example.expected));
        assert.deepStrictEqual(infos, example.info === undefined ? [] : [example.info]);
        if (entry.edits) {
          await vscode.commands.executeCommand('undo');
          assert.strictEqual(editor.document.getText(), before, 'one undo restores the text');
        } else {
          assert.strictEqual(editor.document.getText(), before, 'the text is not changed');
        }
      });
    });
  });

  suite('selections', () => {
    test('two or more selections are needed: one warns before any input box', async () => {
      for (const entry of MSEL_COMMAND_ENTRIES.filter((candidate) => candidate.needsTwo)) {
        const { dependencies, warnings, boxes } = recorder(['2']);
        const editor = await open('[a] b');
        await run(entry, dependencies)(editor);
        assert.deepStrictEqual(warnings, [MSEL_NEED_TWO], entry.id);
        assert.strictEqual(boxes.length, 0, entry.id);
        assert.strictEqual(state(editor), '[a] b', entry.id);
      }
      assert.deepStrictEqual(MSEL_COMMAND_ENTRIES.filter((entry) => entry.needsTwo).map((entry) => entry.id),
        ['MSEL-001', 'MSEL-002', 'MSEL-003', 'MSEL-004', 'MSEL-005', 'MSEL-009', 'MSEL-010', 'MSEL-025', 'MSEL-026', 'MSEL-027', 'MSEL-028']);
    });

    test('the filters count in document order and keep the direction of the selections', async () => {
      const editor = await open('[a] [b] [c]', true);
      await run(entryOf('MSEL-004'), recorder().dependencies)(editor);
      assert.strictEqual(state(editor), 'a [b] [c]');
      assert.ok(editor.selections.every((selection) => selection.isReversed));
    });

    test('an empty result warns and changes nothing', async () => {
      const { dependencies, warnings } = recorder();
      const editor = await open('| |');
      await run(entryOf('MSEL-008'), dependencies)(editor);
      assert.deepStrictEqual(warnings, ['Every selection is empty; at least one selection must remain.']);
      assert.strictEqual(state(editor), '| |');
    });

    test('more than 100,000 new selections warn and change nothing', async () => {
      const { dependencies, warnings, errors } = recorder();
      const text = Array.from({ length: MSEL_MAX_SELECTIONS + 1 }, () => 'a').join(' ');
      const editor = await createTextEditor(text);
      editor.selection = new vscode.Selection(0, 0, 0, text.length);
      await run(entryOf('MSEL-019'), dependencies)(editor);
      assert.deepStrictEqual([warnings, errors], [[MSEL_TOO_MANY_SELECTIONS], []]);
      assert.strictEqual(editor.selections.length, 1);
    });

    test('CRLF documents: offsets and line breaks', async () => {
      const editor = await createTextEditor('··a\r\n····b'.replace(/·/g, ' '));
      assert.strictEqual(editor.document.eol, vscode.EndOfLine.CRLF);
      editor.selection = new vscode.Selection(0, 0, 1, 5);
      await run(entryOf('MSEL-030'), recorder().dependencies)(editor);
      assert.strictEqual(state(editor), '[  ]a\r\n[    ]b');
      editor.selections = [new vscode.Selection(0, 3, 0, 3), new vscode.Selection(1, 0, 1, 4)];
      const { dependencies, infos } = recorder();
      await run(entryOf('MSEL-029'), dependencies)(editor);
      assert.deepStrictEqual(infos, ['2 selections: L1 (0), L2 (4)']);
    });

    test('the edit commands select the new texts and undo in one step', async () => {
      const editor = await open('[a] [bbb]⏎[😀]');
      const before = editor.document.getText();
      await run(entryOf('MSEL-025'), recorder().dependencies)(editor);
      assert.strictEqual(state(editor), '[😀] [a]\n[bbb]');
      await run(entryOf('MSEL-028'), recorder().dependencies)(editor);
      assert.strictEqual(state(editor), '[😀] [😀]\n[😀]');
      await vscode.commands.executeCommand('undo');
      await vscode.commands.executeCommand('undo');
      assert.strictEqual(editor.document.getText(), before);
    });

    test('MSEL-010 uses the tab size of the editor', async () => {
      const editor = await open('\t|a⏎a|');
      editor.options = { tabSize: 2, insertSpaces: true };
      await run(entryOf('MSEL-010'), recorder().dependencies)(editor);
      assert.strictEqual(state(editor), '\t|a\na |');
    });

    test('an unexpected failure shows a fixed message without the selected text', async () => {
      const broken: MselCommandEntry = {
        id: 'FAKE-1', name: 'test.broken', title: 'Broken', when: 'selection',
        run: () => {
          throw new TypeError('secret selected text');
        },
      };
      const { dependencies, errors, warnings } = recorder();
      const editor = await open('[secret]');
      const originalError = console.error;
      const logged: string[] = [];
      console.error = (message: string) => logged.push(message);
      try {
        await run(broken, dependencies, [broken])(editor);
      } finally {
        console.error = originalError;
      }
      assert.deepStrictEqual([errors, warnings], [['The selections were not changed: the selections could not be processed.'], []]);
      assert.ok(logged.every((message) => !message.includes('secret selected text')), logged.join('\n'));
    });
  });

  suite('input boxes', () => {
    test('cancelling any input box changes nothing', async () => {
      for (const entry of MSEL_COMMAND_ENTRIES.filter((candidate) => candidate.inputs !== undefined)) {
        for (let cancelAt = 0; cancelAt < entry.inputs!.length; cancelAt++) {
          const answers: (string | undefined)[] = [...(MSEL_ROADMAP_EXAMPLES[entry.id].inputs ?? [])];
          answers[cancelAt] = undefined;
          const { dependencies, infos, warnings, errors, boxes } = recorder(answers, {
            runRegex: () => assert.fail('the worker must not run'),
            runRegexSplit: () => assert.fail('the worker must not run'),
          });
          const editor = await open('[a,1] [b,2]');
          await run(entry, dependencies)(editor);
          assert.strictEqual(state(editor), '[a,1] [b,2]', entry.id);
          assert.deepStrictEqual([infos, warnings, errors], [[], [], []], entry.id);
          assert.strictEqual(boxes.length, cancelAt + 1, entry.id);
        }
      }
    });

    test('MSEL-016 / 017 / 021: the delimiter box rejects an empty delimiter', async () => {
      for (const id of ['MSEL-016', 'MSEL-017', 'MSEL-021']) {
        const { dependencies, boxes, warnings } = recorder(['']);
        const editor = await open('[a],b');
        await run(entryOf(id), dependencies)(editor);
        const validate = boxes[0].validateInput as (value: string) => string | undefined;
        assert.strictEqual(validate(''), 'Enter a delimiter', id);
        assert.strictEqual(validate(','), undefined, id);
        assert.ok(validate('x'.repeat(101)), id);
        assert.ok(validate('a\nb'), id);
        // An empty answer that gets past the box anyway changes nothing.
        assert.strictEqual(state(editor), '[a],b', id);
        assert.deepStrictEqual(warnings, [], id);
      }
    });

    test('MSEL-021: the delimiter box starts with "," and the column box rejects 0, 1,001 and text', async () => {
      const { dependencies, boxes } = recorder([',', '0']);
      const editor = await open('a,b');
      await run(entryOf('MSEL-021'), dependencies)(editor);
      assert.strictEqual(boxes[0].value, ',');
      assert.strictEqual((boxes[0].validateInput as (value: string) => string | undefined)(''), 'Enter a delimiter');
      const column = boxes[1].validateInput as (value: string) => string | undefined;
      assert.ok(column('0'));
      assert.ok(column('1001'));
      assert.ok(column('x'));
      assert.strictEqual(column('1000'), undefined);
      assert.strictEqual(state(editor), '[a,b]');
    });

    test('MSEL-003: N is validated (1 to 1,000,000)', async () => {
      const { dependencies, boxes } = recorder(['0']);
      const editor = await open('[a] [b]');
      await run(entryOf('MSEL-003'), dependencies)(editor);
      const validate = boxes[0].validateInput as (value: string) => string | undefined;
      assert.ok(validate('0'));
      assert.strictEqual(validate('2'), undefined);
      assert.strictEqual(state(editor), '[a] [b]');
    });
  });

  suite('regular expressions (MSEL-006 / 007 / 018)', () => {
    const REGEX_IDS = ['MSEL-006', 'MSEL-007', 'MSEL-018'];

    test('the box rejects invalid and too long patterns; such a pattern never reaches the worker', async () => {
      for (const id of REGEX_IDS) {
        for (const pattern of ['(', 'a'.repeat(501)]) {
          const { dependencies, boxes, warnings, errors } = recorder([pattern], {
            runRegex: () => assert.fail('the worker must not run'),
            runRegexSplit: () => assert.fail('the worker must not run'),
          });
          const editor = await open('[a1] [b]');
          await run(entryOf(id), dependencies)(editor);
          assert.ok((boxes[0].validateInput as (value: string) => string | undefined)(pattern), id);
          assert.deepStrictEqual([warnings, errors], [[], []], id);
          assert.strictEqual(state(editor), '[a1] [b]', id);
        }
      }
    });

    test('a catastrophic pattern is stopped after the time limit in the real worker and nothing changes', async () => {
      for (const id of REGEX_IDS) {
        const { dependencies, warnings, errors } = recorder([REDOS], { regexTimeoutMs: 200 });
        const editor = await open(REDOS_TEXT);
        const started = Date.now();
        await run(entryOf(id), dependencies)(editor);
        const elapsed = Date.now() - started;
        assert.deepStrictEqual(warnings, ['The selections were not changed: The regular expression did not finish within 200 ms and was stopped.'], id);
        assert.deepStrictEqual(errors, [], id);
        assert.strictEqual(state(editor), expandNotation(REDOS_TEXT), id);
        assert.ok(elapsed < 5000, `${id} finished in ${elapsed} ms`);
      }
    });

    test('selections longer than the input limit are not given to the worker', async () => {
      for (const id of REGEX_IDS) {
        const { dependencies, warnings } = recorder(['a'], {
          regexMaxInputLength: 3,
          runRegex: () => assert.fail('the worker must not run'),
          runRegexSplit: () => assert.fail('the worker must not run'),
        });
        const editor = await open('[ab] [cd]');
        await run(entryOf(id), dependencies)(editor);
        assert.deepStrictEqual(warnings,
          ['The selections were not changed: The selections contain 4 characters (limit for regular expressions: 3).'], id);
        assert.strictEqual(state(editor), '[ab] [cd]', id);
      }
    });

    test('a document edited while the worker runs is not touched', async () => {
      for (const id of REGEX_IDS) {
        let editor: vscode.TextEditor | undefined;
        const edit = async () => {
          await editor!.edit((editBuilder) => editBuilder.insert(new vscode.Position(0, 0), 'x'));
        };
        const { dependencies, warnings } = recorder(['\\d'], {
          runRegex: async (_pattern, texts) => {
            await edit();
            return texts.map(() => false);
          },
          runRegexSplit: async (_pattern, texts) => {
            await edit();
            return texts.map(() => [[0, 1]]);
          },
        });
        editor = await open('[a1] [b]');
        await run(entryOf(id), dependencies)(editor);
        assert.deepStrictEqual(warnings, [MSEL_DOCUMENT_CHANGED], id);
        assert.strictEqual(state(editor), 'x[a1] [b]', id);
      }
    });

    test('MSEL-018: too many matches warn', async () => {
      const { dependencies, warnings } = recorder(['\\d'], { runRegexSplit: () => Promise.resolve(undefined) });
      const editor = await open('[a1b]');
      await run(entryOf('MSEL-018'), dependencies)(editor);
      assert.deepStrictEqual(warnings, [MSEL_TOO_MANY_SELECTIONS]);
      assert.strictEqual(state(editor), '[a1b]');
    });

    test('the worker: split mode, empty matches, the match limit; the other modes are unchanged', async () => {
      assert.deepStrictEqual(await runRegexSplitInWorker('\\d+', ['a1b22', '', 'x'], 2000, 10), [[[1, 2], [3, 5]], [], []]);
      assert.deepStrictEqual(await runRegexSplitInWorker('x*', ['😀x😀'], 2000, 10), [[[2, 3]]]);
      assert.deepStrictEqual(await runRegexSplitInWorker('(?:)', ['abc'], 2000, 10), [[]]);
      assert.strictEqual(await runRegexSplitInWorker('\\d', ['1 2', '3'], 2000, 2), undefined);
      assert.deepStrictEqual(await runRegexSplitInWorker('\\d', ['1 2', '3'], 2000, 3), [[[0, 1], [2, 3]], [[0, 1]]]);
      await assert.rejects(runRegexSplitInWorker(REDOS, [`${'a'.repeat(34)}b`], 200, 10), /did not finish within 200 ms/);
      assert.deepStrictEqual(await runRegexInWorker('\\d', ['a1', 'b'], 2000), [true, false]);
      assert.deepStrictEqual(await runRegexCaptureInWorker('(\\d)', ['a1', 'b'], 2000), ['1', null]);
    });
  });

  suite('registration', () => {
    test('command IDs, kinds, titles and examples match the MSEL commands of the showcase data, in its order', () => {
      const rows = dataRows();
      assert.strictEqual(rows.length, 30);
      const order = rows.map(([id]) => id);
      assert.deepStrictEqual(MSEL_COMMAND_ENTRIES.map((entry) => entry.id), order);
      assert.deepStrictEqual(Object.keys(MSEL_ROADMAP_EXAMPLES).sort(), [...order].sort(), 'an example for every command');
      for (const [id, kind, command, title, example] of rows) {
        const entry = entryOf(id);
        assert.strictEqual(kind, '基本', id);
        assert.strictEqual(command, `${PREFIX}${entry.name}`, id);
        assert.strictEqual(title, entry.title, id);
        const match = /^`(.*)` → `(.*)`$/.exec(example);
        assert.ok(match, `${id}: ${example}`);
        const expected = MSEL_ROADMAP_EXAMPLES[id];
        const input = match[1].replace(/\\\|/g, '|');
        const noted = /^(.*)（(.*)）$/s.exec(input);
        assert.strictEqual(noted ? noted[1] : input, expected.input, id);
        assert.strictEqual(noted ? noted[2] : undefined, expected.note, id);
        assert.strictEqual(match[2].replace(/\\\|/g, '|'), expected.roadmapOutput ?? expected.expected, id);
      }
    });

    test('extension.ts registers every command with mselCommandHandler exactly once', () => {
      const source = readRepoFile('src/extension.ts');
      MSEL_COMMAND_ENTRIES.forEach((entry) => {
        const registration = `registerTextEditorCommand('${PREFIX}${entry.name}', mselCommandHandler('${entry.name}'))`;
        assert.strictEqual(source.split(registration).length - 1, 1, registration);
        assert.strictEqual(source.split(`'${PREFIX}${entry.name}'`).length - 1, 1, entry.name);
      });
    });

    test('package.json, the command palette and Show Commands register every command exactly once', () => {
      const contributes = JSON.parse(readRepoFile('package.json')).contributes;
      type MenuItem = { command?: string; submenu?: string; group?: string; when?: string };
      const count = (items: MenuItem[], id: string) => items.filter((item) => item.command === id).length;
      MSEL_COMMAND_ENTRIES.forEach((entry) => {
        const id = `${PREFIX}${entry.name}`;
        assert.deepStrictEqual(contributes.commands.filter((c: MenuItem) => c.command === id),
          [{ command: id, title: entry.title, category: 'Selection Manipulator' }], id);
        assert.strictEqual(count(myCommands, id), 1, `showCommands: ${id}`);
        const shown = myCommands.find((c) => c.command === id);
        assert.deepStrictEqual(shown, { command: id, title: entry.title, canMultiSelection: true });
        const when = MSEL_WHEN_CLAUSES[entry.when];
        const palette = contributes.menus.commandPalette.filter((c: MenuItem) => c.command === id);
        assert.deepStrictEqual(palette, [when === undefined ? { command: id } : { when, command: id }], id);
        Object.entries(contributes.menus).filter(([name]) => name !== 'commandPalette').forEach(([name, items]) =>
          assert.strictEqual(count(items as MenuItem[], id), name === 'selection-manipulator.selection.submenu' ? 1 : 0, `${name}: ${id}`));
      });
      const ids = contributes.commands.map((c: { command: string }) => c.command);
      assert.strictEqual(new Set(ids).size, ids.length, 'command IDs are unique');
      const titles = myCommands.map((c) => c.title);
      assert.strictEqual(new Set(titles).size, titles.length, 'Show Commands titles are unique');
    });

    test('the when clauses: 14 need multiple selections, 10 a selection, 6 work with a cursor', () => {
      const ids = (when: string) => MSEL_COMMAND_ENTRIES.filter((entry) => entry.when === when).map((entry) => entry.id);
      const range = (from: number, to: number) => Array.from({ length: to - from + 1 }, (_value, i) => `MSEL-${String(from + i).padStart(3, '0')}`);
      assert.deepStrictEqual(ids('multi'), [...range(1, 10), ...range(25, 28)]);
      assert.deepStrictEqual(ids('selection'), [...range(14, 19), ...range(21, 24)]);
      assert.deepStrictEqual(ids('always'), [...range(11, 13), 'MSEL-020', 'MSEL-029', 'MSEL-030']);
    });

    test('the Multi Cursor submenu holds the commands in groups A to G, at @17 in the root submenu', () => {
      const contributes = JSON.parse(readRepoFile('package.json')).contributes;
      assert.deepStrictEqual(contributes.submenus.filter((s: { id: string }) => s.id === 'selection-manipulator.selection.submenu'),
        [{ id: 'selection-manipulator.selection.submenu', label: 'Multi Cursor' }]);
      const items: { command: string; group: string; when?: string }[] = contributes.menus['selection-manipulator.selection.submenu'];
      const order = [
        'MSEL-001', 'MSEL-002', 'MSEL-003', 'MSEL-004', 'MSEL-005', 'MSEL-006', 'MSEL-007', 'MSEL-008', 'MSEL-009',
        'MSEL-010', 'MSEL-011', 'MSEL-012', 'MSEL-013', 'MSEL-014', 'MSEL-015', 'MSEL-016',
        'MSEL-017', 'MSEL-018', 'MSEL-019',
        'MSEL-020', 'MSEL-021', 'MSEL-030',
        'MSEL-022', 'MSEL-023', 'MSEL-024',
        'MSEL-025', 'MSEL-026', 'MSEL-027', 'MSEL-028',
        'MSEL-029',
      ];
      assert.deepStrictEqual(items.map((item) => item.command), order.map((id) => `${PREFIX}${entryOf(id).name}`));
      items.forEach((item, i) => {
        const entry = entryOf(order[i]);
        const when = MSEL_WHEN_CLAUSES[entry.when];
        assert.deepStrictEqual(item, when === undefined
          ? { command: `${PREFIX}${entry.name}`, group: `selection-manipulator@${i}` }
          : { command: `${PREFIX}${entry.name}`, group: `selection-manipulator@${i}`, when }, entry.id);
      });
      const root: { submenu?: string; group: string }[] = contributes.menus['selection-manipulator.submenu'];
      assert.deepStrictEqual(root[root.length - 1], { submenu: 'selection-manipulator.selection.submenu', group: 'selection-manipulator@17' });
      root.forEach((item, i) => assert.strictEqual(item.group, `selection-manipulator@${i}`, item.submenu));
    });
  });
});
