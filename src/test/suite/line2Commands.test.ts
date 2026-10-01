import * as assert from 'assert';
import * as fs from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';
import {
  LINE2_DOCUMENT_CHANGED,
  LINE2_TOO_MANY_MATCHES,
  line2CommandHandlerInternal,
  line2SelectionCountMessage,
  Line2Dependencies,
} from '../../handler/line2CommandHandler';
import { LineRegexSplitRunner, runRegexSplitInWorker } from '../../handler/lineRegex';
import { LINE2_COMMAND_ENTRIES, Line2CommandEntry } from '../../handler/line2Transforms';
import { MSEL2_COMMAND_ENTRIES } from '../../handler/msel2Transforms';
import { MSEL_WHEN_CLAUSES } from '../../handler/mselTransforms';
import { myCommands } from '../../handler/showCommandsHandler';
import { MSEL2_ROADMAP_EXAMPLES } from './msel2Examples';
import { expandNotation, parseMarked, renderMarked } from './mselExamples';
import { candidateRows } from './showcaseData';
import { createTextEditor, undoIn } from './testUtils';

const PREFIX = 'selection-manipulator.';

const readRepoFile = (file: string): string => fs.readFileSync(path.resolve(__dirname, '../../..', file), 'utf8');

/** Records what the handler shows; the input boxes answer with `answers` in turn (`undefined` = cancelled). */
const recorder = (answers: (string | undefined)[] = [], overrides: Partial<Line2Dependencies> = {}) => {
  const record = {
    boxes: [] as vscode.InputBoxOptions[],
    infos: [] as string[],
    warnings: [] as string[],
    errors: [] as string[],
  };
  const queue = [...answers];
  const deps: Partial<Line2Dependencies> = {
    showInputBox: (options) => {
      record.boxes.push(options);
      return Promise.resolve(queue.shift());
    },
    showInformationMessage: (message) => {
      record.infos.push(message);
      return Promise.resolve(undefined);
    },
    showWarningMessage: (message) => {
      record.warnings.push(message);
      return Promise.resolve(undefined);
    },
    showErrorMessage: (message) => {
      record.errors.push(message);
      return Promise.resolve(undefined);
    },
    runRegexSplit: runRegexSplitInWorker,
    regexTimeoutMs: 2000,
    ...overrides,
  };
  return { deps, record };
};

const entryOf = (id: string): Line2CommandEntry => {
  const found = LINE2_COMMAND_ENTRIES.find((entry) => entry.id === id);
  assert.ok(found, id);
  return found;
};

const run = (id: string, deps: Partial<Line2Dependencies>) => line2CommandHandlerInternal(deps)(entryOf(id).name);

/** Opens a marked text (`[…]` selection, `|` cursor, `⏎`, `·`; no marker = all selected). */
const open = async (markedText: string, reversedOrder = false): Promise<vscode.TextEditor> => {
  const { text, ranges } = parseMarked(markedText);
  const editor = await createTextEditor(text);
  const document = editor.document;
  const selections = ranges.map(([start, end]) => new vscode.Selection(document.positionAt(start), document.positionAt(end)));
  editor.selections = reversedOrder ? selections.reverse() : selections;
  return editor;
};

const state = (editor: vscode.TextEditor): string => {
  const document = editor.document;
  return renderMarked(document.getText(), editor.selections.map((selection) => [document.offsetAt(selection.start), document.offsetAt(selection.end)]));
};

const closeAllEditors = async () => {
  for (let i = 0; i < 20 && vscode.window.visibleTextEditors.length > 0; i++) {
    await vscode.commands.executeCommand('workbench.action.revertAndCloseActiveEditor');
  }
};

/** The example of every line command: [id, marked input, answers, expected document text]. */
const EXAMPLES: [string, string, string[], string][] = [
  ['LINEX-001', '1⏎2⏎3⏎4⏎5', ['2-3'], '2⏎3'],
  ['LINEX-002', 'a⏎b⏎c', ['1'], 'b⏎c'],
  ['LINEX-003', 'a⏎b⏎c', ['1'], 'a⏎b'],
  ['LINEX-004', '1⏎2⏎3⏎4⏎5⏎6', ['2'], '1⏎2⏎⏎3⏎4⏎⏎5⏎6'],
  ['LINEX-005', 'abcdefgh', ['3-5'], 'cde'],
  ['LINEX-006', '[a⏎b] [1⏎2]', [''], 'a\t1⏎b\t2 1⏎2'],
  ['LINEX-007', 'a⏎b⏎a', [], 'b⏎a'],
  ['LINEX-008', 'a1b22c', ['\\d+'], 'a⏎b⏎c'],
  ['LINEX-009', 'a⏎b⏎c', ['en'], 'a, b, and c'],
  ['LINEX-010', '[a⏎b⏎c] [b⏎c⏎d]', [], 'b⏎c b⏎c⏎d'],
  ['LINEX-011', '[a⏎b⏎c] [b]', [], 'a⏎c b'],
  ['LINEX-012', '[a⏎b] [b⏎c]', [], 'a⏎c b⏎c'],
  ['LINEX-013', 'a⏎⏎b', [], '1·a⏎⏎2·b'],
  ['LINEX-014', 'a⏎b⏎c⏎d', ['2'], 'a··c⏎b··d'],
];

suite('LINE2 Line Commands (LINEX-001..014) Test Suite', () => {

  teardown(closeAllEditors);

  test('the examples cover the 14 commands in order', () => {
    assert.deepStrictEqual(EXAMPLES.map(([id]) => id), LINE2_COMMAND_ENTRIES.map((entry) => entry.id));
  });

  suite('each command (example)', () => {
    for (const [id, input, answers, expected] of EXAMPLES) {
      test(`${id} ${entryOf(id).name}`, async () => {
        const { deps, record } = recorder(answers);
        const editor = await open(input);
        const before = editor.document.getText();
        await run(id, deps)(editor);
        assert.deepStrictEqual([record.infos, record.warnings, record.errors], [[], [], []]);
        assert.strictEqual(record.boxes.length, entryOf(id).inputs?.length ?? 0);
        assert.strictEqual(editor.document.getText(), expandNotation(expected));
        await undoIn(editor);
        assert.strictEqual(editor.document.getText(), before, 'one undo restores the text');
      });
    }
  });

  suite('common rules', () => {
    test('CRLF documents keep CRLF and the trailing line break', async () => {
      const editor = await createTextEditor('a\r\nb\r\nc\r\nx');
      editor.selection = new vscode.Selection(0, 0, 3, 0);
      const { deps } = recorder(['1']);
      await run('LINEX-002', deps)(editor);
      assert.strictEqual(editor.document.getText(), 'b\r\nc\r\nx');
    });

    test('several selections: one input box, one edit, one undo', async () => {
      const editor = await open('[a⏎b⏎c]⏎---⏎[x⏎y⏎z]');
      const before = editor.document.getText();
      const { deps, record } = recorder(['1']);
      await run('LINEX-003', deps)(editor);
      assert.strictEqual(record.boxes.length, 1);
      assert.strictEqual(editor.document.getText(), 'a\nb\n---\nx\ny');
      await undoIn(editor);
      assert.strictEqual(editor.document.getText(), before);
    });

    test('cancelling (or an invalid answer that gets past the box) changes nothing and says nothing', async () => {
      for (const entry of LINE2_COMMAND_ENTRIES.filter((candidate) => candidate.inputs !== undefined)) {
        const multi = ['LINEX-006'].includes(entry.id);
        // `(` is the invalid answer of the regex box ("\n" is a valid pattern).
        for (const answer of [undefined, entry.id === 'LINEX-008' ? '(' : '\n']) {
          const input = multi ? '[a⏎b] [1⏎2]' : '[a⏎b⏎c]';
          const { deps, record } = recorder([answer], { runRegexSplit: () => assert.fail('the worker must not run') });
          const editor = await open(input);
          await run(entry.id, deps)(editor);
          assert.strictEqual(state(editor), expandNotation(input), `${entry.id} ${JSON.stringify(answer)}`);
          assert.deepStrictEqual([record.infos, record.warnings, record.errors], [[], [], []], entry.id);
          assert.strictEqual(record.boxes.length, 1, entry.id);
        }
      }
    });

    test('no non-empty selection: no input box and no change', async () => {
      const { deps, record } = recorder(['1']);
      const editor = await open('a|b');
      await run('LINEX-002', deps)(editor);
      assert.strictEqual(record.boxes.length, 0);
      assert.strictEqual(state(editor), 'a|b');
    });

    test('every input box has validateInput and the defaults', async () => {
      const defaults: Record<string, string | undefined> = {
        'LINEX-001': undefined, 'LINEX-002': '1', 'LINEX-003': '1', 'LINEX-004': '2', 'LINEX-005': undefined,
        'LINEX-006': undefined, 'LINEX-008': undefined, 'LINEX-009': 'en', 'LINEX-014': '2',
      };
      for (const [id, value] of Object.entries(defaults)) {
        const { deps, record } = recorder([undefined]);
        await run(id, deps)(await open(id === 'LINEX-006' ? '[a] [b]' : '[a]'));
        assert.strictEqual(record.boxes[0].value, value, id);
        assert.strictEqual(record.boxes[0].ignoreFocusOut, true, id);
        assert.strictEqual(typeof record.boxes[0].validateInput, 'function', id);
      }
      const validate = async (id: string) => {
        const { deps, record } = recorder([undefined]);
        await run(id, deps)(await open(id === 'LINEX-006' ? '[a] [b]' : '[a]'));
        return record.boxes[0].validateInput as (value: string) => string | undefined;
      };
      const keepRange = await validate('LINEX-001');
      for (const invalid of ['3-2', '0-2', '1-1000001', 'abc', '']) {
        assert.ok(keepRange(invalid), invalid);
      }
      assert.strictEqual(keepRange('2-3'), undefined);
      const dropFirst = await validate('LINEX-002');
      assert.ok(dropFirst('0'));
      assert.ok(dropFirst('1000001'));
      const cut = await validate('LINEX-005');
      assert.ok(cut('5-3'));
      assert.strictEqual(cut('3'), undefined);
      const paste = await validate('LINEX-006');
      assert.strictEqual(paste(''), undefined);
      assert.ok(paste('x'.repeat(101)));
      const regex = await validate('LINEX-008');
      assert.ok(regex('('));
      assert.ok(regex('a'.repeat(501)));
      const locale = await validate('LINEX-009');
      assert.ok(locale('not a locale!'));
      assert.ok(locale(''));
      const columns = await validate('LINEX-014');
      assert.ok(columns('0'));
      assert.ok(columns('101'));
    });

    test('a selection over the output limit: nothing is changed and one warning is shown', async () => {
      const editor = await open('[a⏎b]⏎---⏎[a⏎b⏎c⏎d]');
      const before = editor.document.getText();
      const { deps, record } = recorder([], { maxAddedLength: 6 });
      await run('LINEX-013', deps)(editor);
      assert.strictEqual(editor.document.getText(), before);
      assert.deepStrictEqual(record.warnings, [
        'The selection was not changed: the result would add 8 characters (limit: 6). Select fewer or shorter lines.',
      ]);
    });

    test('the output budget is shared by all selections', async () => {
      const ok = await open('[a⏎b⏎c⏎d]⏎---⏎[a⏎b⏎c⏎d]');
      const first = recorder([], { maxAddedLength: 16 });
      await run('LINEX-013', first.deps)(ok);
      assert.strictEqual(ok.document.getText(), '1 a\n2 b\n3 c\n4 d\n---\n1 a\n2 b\n3 c\n4 d');
      const tooMuch = await open('[a⏎b⏎c⏎d]⏎---⏎[a⏎b⏎c⏎d]');
      const second = recorder([], { maxAddedLength: 15 });
      await run('LINEX-013', second.deps)(tooMuch);
      assert.strictEqual(tooMuch.document.getText(), 'a\nb\nc\nd\n---\na\nb\nc\nd');
      assert.strictEqual(second.record.warnings.length, 1);
    });

    test('LINEX-004 / 014: an increase over the limit is refused', async () => {
      for (const [id, answer] of [['LINEX-004', '1'], ['LINEX-014', '100']]) {
        const editor = await open('aaaa⏎b⏎c⏎d⏎e');
        const before = editor.document.getText();
        const { deps, record } = recorder([answer], { maxAddedLength: 2 });
        await run(id, deps)(editor);
        assert.strictEqual(editor.document.getText(), before, id);
        assert.strictEqual(record.warnings.length, 1, id);
      }
    });

    test('a selection starting in the middle of a line keeps that partial line (anchored commands)', async () => {
      const editor = await createTextEditor('xx a\nb\nc');
      editor.selection = new vscode.Selection(0, 3, 2, 1);
      const { deps } = recorder(['1']);
      await run('LINEX-002', deps)(editor);
      assert.strictEqual(editor.document.getText(), 'xx a\nc');
    });
  });

  suite('several selections (LINEX-006, 010..012)', () => {
    test('too few or too many non-empty selections warn before the input box', async () => {
      const cases: [string, string][] = [
        ['LINEX-006', '[a⏎b] |x'],
        ['LINEX-010', '[a⏎b] |x'],
        ['LINEX-010', '[a] [b] [c] |x'],
        ['LINEX-011', '[a]'],
        ['LINEX-012', '[a] [b] [c]'],
      ];
      for (const [id, input] of cases) {
        const { deps, record } = recorder(['']);
        const editor = await open(input);
        await run(id, deps)(editor);
        assert.strictEqual(record.boxes.length, 0, id);
        assert.deepStrictEqual(record.warnings, [line2SelectionCountMessage(entryOf(id).command as 'paste-columns')], id);
        assert.strictEqual(state(editor), expandNotation(input), id);
      }
      assert.strictEqual(line2SelectionCountMessage('paste-columns'), 'Select at least 2 blocks of lines (non-empty selections) first.');
      assert.strictEqual(line2SelectionCountMessage('intersect-selections'), 'Select exactly 2 blocks of lines (non-empty selections) first.');
    });

    test('cursors are not counted and not changed', async () => {
      const editor = await open('[a⏎b⏎c] [b] x|y');
      await run('LINEX-011', recorder().deps)(editor);
      assert.strictEqual(editor.document.getText(), 'a\nc b xy');
    });

    test('the selections are used in document order, whatever order they were made in', async () => {
      const editor = await open('[a⏎b] [1⏎2]', true);
      await run('LINEX-006', recorder([',']).deps)(editor);
      assert.strictEqual(editor.document.getText(), 'a,1\nb,2 1\n2');
    });

    test('three selections are pasted in document order; only the first is replaced', async () => {
      const editor = await open('[a⏎b] [1⏎2] [x⏎y]');
      await run('LINEX-006', recorder(['']).deps)(editor);
      assert.strictEqual(editor.document.getText(), 'a\t1\tx\nb\t2\ty 1\n2 x\ny');
    });
  });

  suite('LINEX-008 split-by-regex (worker, limits)', () => {
    test('the pattern runs once in the worker for all selections', async () => {
      let calls = 0;
      const runner: LineRegexSplitRunner = (pattern, texts, timeoutMs, maxMatches) => {
        calls++;
        return runRegexSplitInWorker(pattern, texts, timeoutMs, maxMatches);
      };
      const editor = await open('[a1b]⏎[c2d]');
      await run('LINEX-008', recorder(['\\d'], { runRegexSplit: runner }).deps)(editor);
      assert.strictEqual(calls, 1);
      assert.strictEqual(editor.document.getText(), 'a\nb\nc\nd');
    });

    test('no match: nothing changes', async () => {
      const editor = await open('abc');
      const { deps, record } = recorder(['\\d+']);
      await run('LINEX-008', deps)(editor);
      assert.strictEqual(editor.document.getText(), 'abc');
      assert.deepStrictEqual(record.warnings, []);
    });

    test('a catastrophic pattern is stopped after the time limit and nothing is edited', async () => {
      const text = `${'a'.repeat(34)}b`;
      const editor = await open(text);
      const { deps, record } = recorder(['^(a+)+$'], { regexTimeoutMs: 300 });
      await run('LINEX-008', deps)(editor);
      assert.strictEqual(editor.document.getText(), text);
      assert.deepStrictEqual(record.warnings, ['The selection was not changed: The regular expression did not finish within 300 ms and was stopped.']);
    });

    test('selections over the input limit are refused before the worker starts', async () => {
      const editor = await open('[aaaa]⏎[bbbb]');
      const { deps, record } = recorder(['a'], {
        regexMaxInputLength: 7,
        runRegexSplit: () => assert.fail('the worker must not run'),
      });
      await run('LINEX-008', deps)(editor);
      assert.strictEqual(editor.document.getText(), 'aaaa\nbbbb');
      assert.deepStrictEqual(record.warnings, [
        'The selection was not changed: The selections contain 8 characters (limit for regular expressions: 7).',
      ]);
    });

    test('too many matches warn and change nothing', async () => {
      const editor = await open('a1b');
      const { deps, record } = recorder(['\\d'], { runRegexSplit: () => Promise.resolve(undefined) });
      await run('LINEX-008', deps)(editor);
      assert.strictEqual(editor.document.getText(), 'a1b');
      assert.deepStrictEqual(record.warnings, [LINE2_TOO_MANY_MATCHES]);
    });

    test('a document edited while the worker runs is not overwritten', async () => {
      const editor = await open('a1b');
      const { deps, record } = recorder(['\\d'], {
        runRegexSplit: async (pattern, texts, timeoutMs, maxMatches) => {
          assert.ok(await editor.edit((editBuilder) => editBuilder.insert(new vscode.Position(0, 0), 'new\n')));
          return runRegexSplitInWorker(pattern, texts, timeoutMs, maxMatches);
        },
      });
      await run('LINEX-008', deps)(editor);
      assert.strictEqual(editor.document.getText(), 'new\na1b');
      assert.deepStrictEqual(record.warnings, [LINE2_DOCUMENT_CHANGED]);
    });

    test('an invalid pattern that gets past the box never reaches the worker', async () => {
      const editor = await open('a1b');
      const { deps, record } = recorder(['('], { runRegexSplit: () => assert.fail('the worker must not run') });
      await run('LINEX-008', deps)(editor);
      assert.strictEqual(editor.document.getText(), 'a1b');
      assert.deepStrictEqual(record.warnings, []);
    });
  });

  test('an unexpected failure shows a fixed message without the selected text', async () => {
    const editor = await open('secret');
    const { deps, record } = recorder(['\\d'], { runRegexSplit: () => Promise.reject(new TypeError('secret selected text')) });
    const originalError = console.error;
    const logged: string[] = [];
    console.error = (message: string) => logged.push(message);
    try {
      await run('LINEX-008', deps)(editor);
    } finally {
      console.error = originalError;
    }
    assert.deepStrictEqual(record.errors, ['The selection was not changed: the lines could not be processed.']);
    assert.ok(logged.every((message) => !message.includes('secret selected text')));
  });

  suite('registration (LINEX-001..023)', () => {
    test('the showcase data lists the 23 commands with the IDs, titles and order of the command tables', () => {
      const rows = candidateRows('LINEX');
      const entries: { id: string; name: string; title: string }[] = [...LINE2_COMMAND_ENTRIES, ...MSEL2_COMMAND_ENTRIES];
      assert.strictEqual(rows.length, 23);
      assert.deepStrictEqual(rows.map(([id, kind, command, title]) => [id, kind, command, title]),
        entries.map((entry) => [entry.id, '基本', `${PREFIX}${entry.name}`, entry.title]));
    });

    test('the showcase examples of LINEX-015..023 are the examples run by the MSEL tests', () => {
      for (const [id, , , , example] of candidateRows('LINEX').slice(14)) {
        const match = /^`(.*)` → `(.*)`$/.exec(example);
        assert.ok(match, `${id}: ${example}`);
        const expected = MSEL2_ROADMAP_EXAMPLES[id];
        const noted = /^(.*)（(.*)）$/s.exec(match[1]);
        assert.strictEqual(noted ? noted[1] : match[1], expected.input, id);
        assert.strictEqual(noted ? noted[2] : undefined, expected.note, id);
        assert.strictEqual(match[2], expected.expected, id);
      }
    });

    test('extension.ts registers every command exactly once with its handler', () => {
      const source = readRepoFile('src/extension.ts');
      for (const entry of LINE2_COMMAND_ENTRIES) {
        const registration = `registerTextEditorCommand('${PREFIX}${entry.name}', line2CommandHandler('${entry.name}'))`;
        assert.strictEqual(source.split(registration).length - 1, 1, registration);
        assert.strictEqual(source.split(`'${PREFIX}${entry.name}'`).length - 1, 1, entry.name);
      }
      for (const entry of MSEL2_COMMAND_ENTRIES) {
        const registration = `registerTextEditorCommand('${PREFIX}${entry.name}', mselCommandHandler('${entry.name}'))`;
        assert.strictEqual(source.split(registration).length - 1, 1, registration);
      }
    });

    test('package.json, the command palette, the Line submenu and Show Commands', () => {
      const contributes = JSON.parse(readRepoFile('package.json')).contributes;
      type MenuItem = { command?: string; when?: string; group?: string };
      const submenu: MenuItem[] = contributes.menus['selection-manipulator.line.submenu'];
      LINE2_COMMAND_ENTRIES.forEach((entry, i) => {
        const id = `${PREFIX}${entry.name}`;
        assert.deepStrictEqual(contributes.commands.filter((c: MenuItem) => c.command === id),
          [{ command: id, title: entry.title, category: 'Selection Manipulator' }], id);
        assert.deepStrictEqual(contributes.menus.commandPalette.filter((c: MenuItem) => c.command === id),
          [{ when: 'editorHasSelection', command: id }], id);
        // After the 40 LINE commands, without a when clause (as line.head).
        assert.deepStrictEqual(submenu[40 + i], { command: id, group: `selection-manipulator@${40 + i}` }, id);
        Object.entries(contributes.menus).filter(([name]) => name !== 'commandPalette' && name !== 'selection-manipulator.line.submenu')
          .forEach(([name, items]) => assert.strictEqual((items as MenuItem[]).filter((item) => item.command === id).length, 0, `${name}: ${id}`));
        assert.deepStrictEqual(myCommands.filter((c) => c.command === id), [{ command: id, title: entry.title, canMultiSelection: true }]);
      });
      assert.strictEqual(submenu.length, 54);
      // The selection commands follow the MSEL when rules (checked in mselCommands.test.ts too).
      assert.deepStrictEqual(MSEL2_COMMAND_ENTRIES.map((entry) => MSEL_WHEN_CLAUSES[entry.when]), [
        undefined, undefined, undefined, undefined, undefined, undefined, undefined, 'editorHasMultipleSelections', 'editorHasMultipleSelections',
      ]);
      const ids = contributes.commands.map((c: { command: string }) => c.command);
      assert.strictEqual(new Set(ids).size, ids.length);
      assert.strictEqual(ids.length, 899);
      assert.strictEqual(new Set(myCommands.map((c) => c.title)).size, myCommands.length);
    });

    test('no dependency was added', () => {
      const packageJson = JSON.parse(readRepoFile('package.json'));
      assert.deepStrictEqual(Object.keys(packageJson.dependencies).sort(), ['change-case', 'diff', 'js-yaml', 'xml-formatter']);
    });
  });
});
