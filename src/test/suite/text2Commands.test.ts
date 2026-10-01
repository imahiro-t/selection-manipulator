import * as assert from 'assert';
import * as fs from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';
import {
  TEXT2_NOT_CHANGED,
  TEXT2_NOT_SHOWN,
  TEXT2_NOTHING_SELECTED,
  text2CommandHandlerInternal,
  Text2Dependencies,
} from '../../handler/text2CommandHandler';
import { TEXT2_COMMAND_ENTRIES, TEXT2_MAX_INPUT_LENGTH, Text2CommandEntry, Text2InputError } from '../../handler/text2Transforms';
import { myCommands } from '../../handler/showCommandsHandler';
import { expandText2, TEXT2_EXAMPLES } from './text2Examples';
import { createTextEditor, undoIn } from './testUtils';
import { candidateRows } from './showcaseData';

const PREFIX = 'selection-manipulator.';
const SUBMENU = 'selection-manipulator.text-transform.submenu';

/**
 * Records what the handlers show; the input boxes answer with `answers` in turn (`undefined` =
 * cancelled) and the results that would open in a new editor are collected.
 */
const recorder = (answers: (string | undefined)[] = []) => {
  const infos: string[] = [];
  const warnings: string[] = [];
  const errors: string[] = [];
  const boxes: vscode.InputBoxOptions[] = [];
  const opened: string[] = [];
  const queue = [...answers];
  const dependencies: Text2Dependencies = {
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
    openResult: (content) => {
      opened.push(content);
      return Promise.resolve(undefined);
    },
  };
  return { dependencies, infos, warnings, errors, boxes, opened };
};

const entryOf = (id: string): Text2CommandEntry => {
  const found = TEXT2_COMMAND_ENTRIES.find((entry) => entry.id === id);
  assert.ok(found, id);
  return found;
};

const run = (entry: Text2CommandEntry, dependencies: Text2Dependencies, entries: readonly Text2CommandEntry[] = TEXT2_COMMAND_ENTRIES) =>
  text2CommandHandlerInternal(dependencies, entries)(entry.name);

/** Opens `text` and selects the `[start, end]` offsets (all of it when none are given). */
const open = async (text: string, ranges?: [number, number][]): Promise<vscode.TextEditor> => {
  const editor = await createTextEditor(text);
  const document = editor.document;
  editor.selections = (ranges ?? [[0, text.length]]).map(([start, end]) => new vscode.Selection(document.positionAt(start), document.positionAt(end)));
  return editor;
};

const readRepoFile = (file: string): string => fs.readFileSync(path.resolve(__dirname, '../../..', file), 'utf8');

/** The content of a Markdown code span. */
const codeSpan = (span: string): string => {
  const ticks = /^`+/.exec(span)?.[0] ?? '';
  assert.ok(ticks.length > 0 && span.endsWith(ticks), span);
  const content = span.slice(ticks.length, span.length - ticks.length);
  return content.length >= 2 && content.startsWith(' ') && content.endsWith(' ') ? content.slice(1, -1) : content;
};

suite('Text Transform Commands (TEXTX-001..023) Test Suite', () => {

  suite('each command (showcase example)', () => {
    TEXT2_COMMAND_ENTRIES.forEach((entry) => {
      const example = TEXT2_EXAMPLES[entry.id];

      test(`${entry.id} ${entry.name}: ${JSON.stringify(example.input)} → ${JSON.stringify(example.expected)}`, async () => {
        const { dependencies, infos, warnings, errors, boxes, opened } = recorder(example.inputs);
        const editor = await open(example.input);
        await run(entry, dependencies)(editor);
        assert.deepStrictEqual([infos, warnings, errors], [[], [], []]);
        assert.strictEqual(boxes.length, entry.inputs?.length ?? 0);
        if (entry.output === 'new-tab') {
          assert.deepStrictEqual(opened, [example.expected]);
          assert.strictEqual(editor.document.getText(), example.input, 'the selection is not changed');
          return;
        }
        assert.deepStrictEqual(opened, []);
        assert.strictEqual(editor.document.getText(), example.expected);
        await undoIn(editor);
        assert.strictEqual(editor.document.getText(), example.input, 'one undo restores the text');
      });
    });
  });

  suite('selections', () => {
    test('several selections: one value for all, one edit, one undo', async () => {
      const text = 'ab cd ef';
      const { dependencies, boxes } = recorder(['2', '+']);
      const editor = await open(text, [[6, 8], [0, 2]]);
      await run(entryOf('TEXTX-001'), dependencies)(editor);
      assert.strictEqual(boxes.length, 2);
      assert.strictEqual(editor.document.getText(), 'ab+ab cd ef+ef');
      await undoIn(editor);
      assert.strictEqual(editor.document.getText(), text, 'one undo restores the text');
    });

    test('empty selections are ignored; only cursors warn without asking anything', async () => {
      const mixed = await open('abc def', [[0, 3], [4, 4]]);
      await run(entryOf('TEXTX-022'), recorder().dependencies)(mixed);
      assert.strictEqual(mixed.document.getText(), '4bc def');
      for (const entry of TEXT2_COMMAND_ENTRIES) {
        const { dependencies, boxes, warnings, opened } = recorder(['1', '1']);
        const editor = await open('abc', [[1, 1]]);
        await run(entry, dependencies)(editor);
        assert.strictEqual(editor.document.getText(), 'abc', entry.id);
        assert.deepStrictEqual([boxes.length, warnings, opened], [0, [TEXT2_NOTHING_SELECTED], []], entry.id);
      }
    });

    test('new-tab: the table is made from all selections together, with the EOL of the document', async () => {
      const editor = await createTextEditor('x y\r\ny z x');
      assert.strictEqual(editor.document.eol, vscode.EndOfLine.CRLF);
      editor.selections = [new vscode.Selection(0, 0, 0, 3), new vscode.Selection(1, 0, 1, 5)];
      const { dependencies, opened } = recorder();
      await run(entryOf('TEXTX-018'), dependencies)(editor);
      assert.deepStrictEqual(opened, ['x\t2\r\ny\t2\r\nz\t1']);
    });

    test('new-tab: nothing to count informs instead of opening an empty editor', async () => {
      const { dependencies, infos, opened } = recorder();
      const editor = await open('   ');
      await run(entryOf('TEXTX-018'), dependencies)(editor);
      assert.deepStrictEqual([infos, opened], [[entryOf('TEXTX-018').emptyMessage], []]);
    });

    test('multi-line selections in a CRLF document keep their line breaks (TEXTX-013, TEXTX-021)', async () => {
      const editor = await createTextEditor('ab cd\r\nef');
      editor.selection = new vscode.Selection(0, 0, 1, 2);
      await run(entryOf('TEXTX-013'), recorder().dependencies)(editor);
      assert.strictEqual(editor.document.getText(), 'ba dc\r\nfe');
      editor.selection = new vscode.Selection(0, 0, 1, 2);
      await run(entryOf('TEXTX-021'), recorder(['1']).dependencies)(editor);
      assert.strictEqual(editor.document.getText(), '*****\r\n*e', 'spaces are masked; only line breaks stay');
    });
  });

  suite('limits and failures', () => {
    test('a result over the output limit changes nothing and warns (TEXTX-001)', async () => {
      const text = 'x'.repeat(2000);
      const { dependencies, warnings, errors } = recorder(['10000', '']);
      const editor = await open(text);
      await run(entryOf('TEXTX-001'), dependencies)(editor);
      assert.strictEqual(editor.document.getText(), text);
      assert.strictEqual(warnings.length, 1);
      assert.ok(warnings[0].startsWith(`${TEXT2_NOT_CHANGED}the result would be longer than 10,000,000 characters`), warnings[0]);
      assert.deepStrictEqual(errors, []);
    });

    test('the output limit counts all selections together; nothing is changed when the total is too long', async () => {
      const text = `${'x'.repeat(600)} ${'y'.repeat(600)}`;
      const { dependencies, warnings } = recorder(['10000', '']);
      const editor = await open(text, [[0, 600], [601, 1201]]);
      await run(entryOf('TEXTX-001'), dependencies)(editor);
      assert.strictEqual(editor.document.getText(), text, 'the first selection fits on its own but is not changed either');
      assert.strictEqual(warnings.length, 1);
    });

    test('selections over the input limit are refused before anything is asked', async () => {
      const text = 'a'.repeat(TEXT2_MAX_INPUT_LENGTH + 1);
      const { dependencies, boxes, warnings } = recorder(['3', '-']);
      const editor = await open(text);
      await run(entryOf('TEXTX-001'), dependencies)(editor);
      assert.strictEqual(boxes.length, 0);
      assert.deepStrictEqual(warnings, [`${TEXT2_NOT_CHANGED}the selections are longer than 1,000,000 characters in total.`]);
      assert.strictEqual(editor.document.getText().length, text.length);
    });

    test('cancelling any input box changes nothing', async () => {
      for (const entry of TEXT2_COMMAND_ENTRIES.filter((candidate) => candidate.inputs !== undefined)) {
        for (let cancelAt = 0; cancelAt < entry.inputs!.length; cancelAt++) {
          const answers: (string | undefined)[] = TEXT2_EXAMPLES[entry.id].inputs!.slice(0, cancelAt);
          answers.push(undefined);
          const { dependencies, boxes, infos, warnings, errors } = recorder(answers);
          const editor = await open('abc');
          await run(entry, dependencies)(editor);
          assert.strictEqual(editor.document.getText(), 'abc', `${entry.id} #${cancelAt}`);
          assert.deepStrictEqual([boxes.length, infos, warnings, errors], [cancelAt + 1, [], [], []], `${entry.id} #${cancelAt}`);
        }
      }
    });

    test('the input boxes validate; an invalid value that gets past a box changes nothing', async () => {
      const cases: [string, string[]][] = [
        ['TEXTX-001', ['10001']],
        ['TEXTX-002', ['0']],
        ['TEXTX-004', ['6', 'ab']],
        ['TEXTX-006', ['4', '']],
        ['TEXTX-007', ['ab', 'x']],
        ['TEXTX-007', ['aa']],
        ['TEXTX-008', ['']],
        ['TEXTX-021', ['-1']],
        ['TEXTX-023', ['(', 'x'.repeat(101)]],
      ];
      for (const [id, answers] of cases) {
        const { dependencies, boxes, warnings, errors } = recorder(answers);
        const editor = await open('abc');
        await run(entryOf(id), dependencies)(editor);
        const last = boxes[boxes.length - 1];
        assert.strictEqual(boxes.length, answers.length, id);
        assert.ok((last.validateInput as (value: string) => string | undefined)(answers[answers.length - 1]), id);
        assert.strictEqual(editor.document.getText(), 'abc', id);
        assert.deepStrictEqual([warnings, errors], [[], []], id);
      }
    });

    test('a failure of the transform tells which selection, without the selected text', async () => {
      const failing: Text2CommandEntry = {
        id: 'FAKE-1', name: 'test.failing', title: 'Failing', output: 'replace',
        transform: (text) => {
          if (text === 'secret2') {
            throw new Text2InputError('the value cannot be used');
          }
          return text.toUpperCase();
        },
      };
      const { dependencies, warnings } = recorder();
      const editor = await open('secret1 secret2', [[0, 7], [8, 15]]);
      await run(failing, dependencies, [failing])(editor);
      assert.strictEqual(editor.document.getText(), 'secret1 secret2');
      assert.deepStrictEqual(warnings, [`${TEXT2_NOT_CHANGED}selection 2 of 2: the value cannot be used.`]);
    });

    test('an unexpected failure shows a fixed message and logs no selected text', async () => {
      const broken: Text2CommandEntry = {
        id: 'FAKE-2', name: 'test.broken', title: 'Broken', output: 'new-tab',
        combine: () => {
          throw new TypeError('secret selected text');
        },
      };
      const { dependencies, errors, opened } = recorder();
      const editor = await open('secret');
      const originalError = console.error;
      const logged: string[] = [];
      console.error = (message: string) => logged.push(message);
      try {
        await run(broken, dependencies, [broken])(editor);
      } finally {
        console.error = originalError;
      }
      assert.deepStrictEqual([errors, opened], [[`${TEXT2_NOT_SHOWN}the text could not be processed.`], []]);
      assert.ok(logged.every((message) => !message.includes('secret selected text')), logged.join('\n'));
    });

    test('TEXTX-021: the masked value never appears in a notification', async () => {
      const { dependencies, infos, warnings, errors } = recorder(['4']);
      const editor = await open('4111111111111111');
      await run(entryOf('TEXTX-021'), dependencies)(editor);
      assert.deepStrictEqual([infos, warnings, errors], [[], [], []]);
    });
  });

  suite('registration', () => {
    test('command IDs, kinds, titles and examples match the TEXTX commands of the showcase data, in its order', () => {
      const rows = candidateRows('TEXTX');
      assert.strictEqual(rows.length, 23);
      const order = rows.map(([id]) => id);
      assert.deepStrictEqual(TEXT2_COMMAND_ENTRIES.map((entry) => entry.id), order);
      assert.deepStrictEqual(order, Array.from({ length: 23 }, (_, i) => `TEXTX-${String(i + 1).padStart(3, '0')}`));
      assert.deepStrictEqual(Object.keys(TEXT2_EXAMPLES).sort(), [...order].sort(), 'an example for every command');
      for (const [id, kind, command, title, example] of rows) {
        const entry = entryOf(id);
        assert.strictEqual(kind, '基本', id);
        assert.strictEqual(command, `${PREFIX}${entry.name}`, id);
        assert.strictEqual(title, entry.title, id);
        const sides = example.split(' → ');
        assert.strictEqual(sides.length, 2, `${id}: ${example}`);
        const expected = TEXT2_EXAMPLES[id];
        const input = codeSpan(sides[0]);
        const noted = /^(.*)（(.*)）$/s.exec(input);
        assert.strictEqual(expandText2(noted ? noted[1] : input), expected.input, id);
        assert.strictEqual(noted ? noted[2] : undefined, expected.note, id);
        assert.strictEqual(expandText2(codeSpan(sides[1])), expected.expected, id);
      }
    });

    test('extension.ts registers every command with text2CommandHandler exactly once', () => {
      const source = readRepoFile('src/extension.ts');
      TEXT2_COMMAND_ENTRIES.forEach((entry) => {
        const registration = `registerTextEditorCommand('${PREFIX}${entry.name}', text2CommandHandler('${entry.name}'))`;
        assert.strictEqual(source.split(registration).length - 1, 1, registration);
        assert.strictEqual(source.split(`'${PREFIX}${entry.name}'`).length - 1, 1, entry.name);
      });
    });

    test('package.json, the command palette, the submenu and Show Commands register every command exactly once', () => {
      const contributes = JSON.parse(readRepoFile('package.json')).contributes;
      type MenuItem = { command?: string; submenu?: string; group?: string; when?: string };
      const count = (items: MenuItem[], id: string) => items.filter((item) => item.command === id).length;
      TEXT2_COMMAND_ENTRIES.forEach((entry) => {
        const id = `${PREFIX}${entry.name}`;
        assert.deepStrictEqual(contributes.commands.filter((c: MenuItem) => c.command === id),
          [{ command: id, title: entry.title, category: 'Selection Manipulator' }], id);
        assert.deepStrictEqual(myCommands.filter((c) => c.command === id), [{ command: id, title: entry.title, canMultiSelection: true }], id);
        assert.deepStrictEqual(contributes.menus.commandPalette.filter((c: MenuItem) => c.command === id),
          [{ when: 'editorHasSelection', command: id }], id);
        Object.entries(contributes.menus).filter(([name]) => name !== 'commandPalette').forEach(([name, items]) =>
          assert.strictEqual(count(items as MenuItem[], id), name === SUBMENU ? 1 : 0, `${name}: ${id}`));
      });
      const ids = contributes.commands.map((c: { command: string }) => c.command);
      assert.strictEqual(new Set(ids).size, ids.length, 'command IDs are unique');
      const titles = contributes.commands.map((c: { title: string; category?: string }) => `${c.category ?? ''}:${c.title}`);
      assert.strictEqual(new Set(titles).size, titles.length, 'command titles are unique');
      const shown = myCommands.map((c) => c.title);
      assert.strictEqual(new Set(shown).size, shown.length, 'Show Commands titles are unique');
    });

    test('the Text Transform submenu holds the commands in order and is in the root submenu once', () => {
      const contributes = JSON.parse(readRepoFile('package.json')).contributes;
      assert.deepStrictEqual(contributes.submenus.filter((s: { id: string }) => s.id === SUBMENU), [{ id: SUBMENU, label: 'Text Transform' }]);
      const items: { command: string; group: string }[] = contributes.menus[SUBMENU];
      assert.deepStrictEqual(items, TEXT2_COMMAND_ENTRIES.map((entry, i) => ({ command: `${PREFIX}${entry.name}`, group: `selection-manipulator@${i}` })));
      const root: { submenu?: string; group: string }[] = contributes.menus['selection-manipulator.submenu'];
      assert.strictEqual(root.filter((item) => item.submenu === SUBMENU).length, 1);
      root.forEach((item, i) => assert.strictEqual(item.group, `selection-manipulator@${i}`, item.submenu));
    });

    test('no dependency was added', () => {
      const packageJson = JSON.parse(readRepoFile('package.json'));
      assert.deepStrictEqual(Object.keys(packageJson.dependencies).sort(), ['change-case', 'diff', 'js-yaml', 'xml-formatter']);
    });

    test('the new modules use no code evaluation, processes, files, network or webviews', () => {
      const forbidden = [
        /\beval\s*\(/, /new\s+Function\b/, /child_process/, /from\s+'fs'/, /require\(\s*'fs'\s*\)/, /from\s+'(?:node:)?(?:https?|net|dns|tls|dgram)'/,
        /\bfetch\s*\(/, /XMLHttpRequest/, /createWebviewPanel|Webview/, /new\s+RegExp\s*\(/,
      ];
      for (const file of ['src/handler/text2Transforms.ts', 'src/handler/text2CommandHandler.ts']) {
        const source = readRepoFile(file);
        for (const pattern of forbidden) {
          assert.doesNotMatch(source, pattern, `${file}: ${pattern}`);
        }
      }
    });
  });
});
