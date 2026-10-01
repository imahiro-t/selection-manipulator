import * as assert from 'assert';
import * as fs from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';
import { JA_NOTHING_SELECTED, JaDependencies } from '../../handler/jaCommandHandler';
import { JA_COMMAND_ENTRIES, JaCommandEntry } from '../../handler/jaTransforms';
import { ja2CommandHandlerInternal } from '../../handler/ja2CommandHandler';
import { JA2_COMMAND_ENTRIES } from '../../handler/ja2Transforms';
import { UNI_NOTHING_SELECTED, UniDependencies } from '../../handler/uniCommandHandler';
import { UNI_COMMAND_ENTRIES, UniCommandEntry } from '../../handler/uniTransforms';
import { uni2CommandHandlerInternal } from '../../handler/uni2CommandHandler';
import { UNI2_COMMAND_ENTRIES } from '../../handler/uni2Transforms';
import { MD_TEXT_NOT_CHANGED, MdDependencies } from '../../handler/mdCommandHandler';
import { MD_COMMAND_ENTRIES, MD_WHEN_SELECTION, MdCommandEntry } from '../../handler/mdTransforms';
import { md2CommandHandlerInternal } from '../../handler/md2CommandHandler';
import { MD2_COMMAND_ENTRIES } from '../../handler/md2Transforms';
import { myCommands } from '../../handler/showCommandsHandler';
import { JAUNI2_EXAMPLES } from './jauni2Examples';
import { createTextEditor } from './testUtils';

const PREFIX = 'selection-manipulator.';
const SEPARATOR = '\n---\n';
const NOT_CHANGED = 'The selection was not changed: ';
const NOT_SHOWN = 'No result was shown: ';

type Family = 'ja' | 'uni' | 'md';
type Entry = JaCommandEntry | UniCommandEntry | MdCommandEntry;

const ENTRIES: { family: Family; entry: Entry }[] = [
  ...JA2_COMMAND_ENTRIES.map((entry) => ({ family: 'ja' as const, entry })),
  ...UNI2_COMMAND_ENTRIES.map((entry) => ({ family: 'uni' as const, entry })),
  ...MD2_COMMAND_ENTRIES.map((entry) => ({ family: 'md' as const, entry })),
];

/** Where a command puts its result. */
const outputOf = ({ family, entry }: { family: Family; entry: Entry }): 'replace' | 'new-tab' | 'notify' => {
  if (family === 'md') {
    return entry.id === 'JAUNIX-018' ? 'new-tab' : 'replace';
  }
  return (entry as JaCommandEntry).output as 'replace' | 'new-tab' | 'notify';
};

/**
 * Records what the handlers show and open instead of touching VS Code's UI. The input boxes and
 * quick picks take their answers from `answers` in order (`undefined` = cancelled); a quick pick
 * answer that matches no item comes back as an item with that value anyway.
 */
const recorder = (answers: (string | undefined)[] = []) => {
  const infos: string[] = [];
  const warnings: string[] = [];
  const errors: string[] = [];
  const opened: string[] = [];
  const picks: { label: string; value: string }[][] = [];
  const boxes: vscode.InputBoxOptions[] = [];
  const queue = [...answers];
  const dependencies = {
    notifier: {
      showInformationMessage: (message: string) => {
        infos.push(message);
        return Promise.resolve(undefined);
      },
      showWarningMessage: (message: string) => {
        warnings.push(message);
        return Promise.resolve(undefined);
      },
      showErrorMessage: (message: string) => {
        errors.push(message);
        return Promise.resolve(undefined);
      },
    },
    openResult: (content: string) => {
      opened.push(content);
      return Promise.resolve();
    },
    showInputBox: (options: vscode.InputBoxOptions) => {
      boxes.push(options);
      return Promise.resolve(queue.shift());
    },
    showQuickPick: <T extends { label: string; value: string }>(items: T[]) => {
      picks.push(items);
      const answer = queue.shift();
      return Promise.resolve(answer === undefined ? undefined : items.find((item) => item.value === answer) ?? ({ label: answer, value: answer } as T));
    },
  };
  const everything = () => [infos, warnings, errors, opened];
  return { dependencies, infos, warnings, errors, opened, picks, boxes, everything };
};

type Dependencies = ReturnType<typeof recorder>['dependencies'];

const handlerOf = (family: Family, dependencies: Dependencies) => {
  switch (family) {
    case 'ja':
      return ja2CommandHandlerInternal(dependencies as JaDependencies);
    case 'uni':
      return uni2CommandHandlerInternal(dependencies as UniDependencies);
    default:
      return md2CommandHandlerInternal(dependencies as MdDependencies);
  }
};

const itemOf = (id: string) => {
  const found = ENTRIES.find(({ entry }) => entry.id === id);
  assert.ok(found, id);
  return found;
};

const run = (id: string, dependencies: Dependencies) => {
  const { family, entry } = itemOf(id);
  return handlerOf(family, dependencies)(entry.name);
};

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

const NEW_MODULES = [
  'src/handler/ja2Convert.ts', 'src/handler/ja2Transforms.ts', 'src/handler/ja2CommandHandler.ts',
  'src/handler/uni2Convert.ts', 'src/handler/uni2Transforms.ts', 'src/handler/uni2CommandHandler.ts',
  'src/handler/md2Transforms.ts', 'src/handler/md2CommandHandler.ts',
];

suite('Japanese, Unicode and Markdown Extended Commands (JAUNIX-001..021) Test Suite', () => {

  suite('each command (showcase example)', () => {
    ENTRIES.forEach((item) => {
      const { entry } = item;
      const example = JAUNI2_EXAMPLES[entry.id];
      const output = outputOf(item);

      test(`${entry.id} ${entry.name}: the example, with the answers asked once`, async () => {
        const { dependencies, everything, picks, boxes } = recorder(example.inputs);
        const editor = await open(example.input);
        await run(entry.id, dependencies)(editor);
        if (output === 'replace') {
          assert.strictEqual(editor.document.getText(), example.expected);
          assert.deepStrictEqual(everything(), [[], [], [], []]);
        } else {
          assert.strictEqual(editor.document.getText(), example.input, 'the document is not changed');
          assert.deepStrictEqual(everything(), output === 'notify' ? [[example.expected], [], [], []] : [[], [], [], [example.expected]]);
        }
        assert.strictEqual(picks.length + boxes.length, example.inputs.length);
      });

      // JAUNIX-019 looks at the whole document and JAUNIX-020 at the lines around the selection: tested on their own.
      if (entry.id !== 'JAUNIX-019' && entry.id !== 'JAUNIX-020') {
        test(`${entry.id} ${entry.name}: every selection on its own (multiple cursors, document order)`, async () => {
          const { dependencies, everything, picks, boxes } = recorder(example.inputs);
          const editor = await openBlocks([example.input, example.input]);
          await run(entry.id, dependencies)(editor);
          if (output === 'replace') {
            assert.strictEqual(editor.document.getText(), [example.expected, example.expected].join(SEPARATOR));
            assert.deepStrictEqual(everything(), [[], [], [], []]);
          } else if (output === 'notify') {
            assert.deepStrictEqual(everything(), [['Corporate number: #1 valid, #2 valid'], [], [], []]);
          } else {
            assert.deepStrictEqual(everything(), [[], [], [], [[example.expected, example.expected].join('\n')]]);
          }
          assert.strictEqual(picks.length + boxes.length, example.inputs.length, 'asked once for all selections');
        });
      }

      test(`${entry.id} ${entry.name}: empty selections change nothing and ask nothing`, async () => {
        const { dependencies, everything, picks, boxes } = recorder(example.inputs);
        const editor = await open('x  \n\t', [[0, 0], [2, 2]]);
        await run(entry.id, dependencies)(editor);
        assert.strictEqual(editor.document.getText(), 'x  \n\t');
        const warning = item.family === 'ja' ? JA_NOTHING_SELECTED : UNI_NOTHING_SELECTED;
        assert.deepStrictEqual(everything(), item.family === 'md' ? [[], [], [], []] : [[], [warning], [], []]);
        assert.strictEqual(picks.length + boxes.length, 0);
      });

      if (example.inputs.length > 0) {
        test(`${entry.id} ${entry.name}: cancelling a question does nothing`, async () => {
          for (let step = 0; step < example.inputs.length; step++) {
            const { dependencies, everything } = recorder([...example.inputs.slice(0, step), undefined]);
            const editor = await open(example.input);
            await run(entry.id, dependencies)(editor);
            assert.strictEqual(editor.document.getText(), example.input, `step ${step}`);
            assert.deepStrictEqual(everything(), [[], [], [], []], `step ${step}`);
          }
        });
      }
    });
  });

  suite('JA and UNI selections', () => {
    test('blank selections warn and ask nothing', async () => {
      for (const id of ['JAUNIX-006', 'JAUNIX-008']) {
        const { dependencies, warnings, picks } = recorder(['spacing']);
        const editor = await open(' \n\t', [[0, 3]]);
        await run(id, dependencies)(editor);
        assert.strictEqual(warnings.length, 1, id);
        assert.strictEqual(picks.length, 0, id);
      }
    });

    test('a new tab joins the results with the document line break (CRLF)', async () => {
      const editor = await createTextEditor('あい\nう\n---\né');
      await editor.edit((editBuilder) => editBuilder.setEndOfLine(vscode.EndOfLine.CRLF));
      editor.selections = [new vscode.Selection(3, 0, 3, 1), new vscode.Selection(0, 0, 1, 1)];
      const { dependencies, opened } = recorder();
      await run('JAUNIX-001', dependencies)(editor);
      assert.deepStrictEqual(opened, ['うあ\r\n　い\r\né']);
      const second = recorder();
      await run('JAUNIX-012', second.dependencies)(editor);
      assert.deepStrictEqual(second.opened, ['\\u3042\\u3044\r\n\\u3046\r\n\\xe9']);
    });

    test('an unreadable line names the selection and the line, and nothing is changed', async () => {
      const { dependencies, errors, warnings } = recorder();
      const blocks = ['さとう', 'いとう\n123'];
      const editor = await open(blocks.join(SEPARATOR), [[0, 3], [3 + SEPARATOR.length, 3 + SEPARATOR.length + 7]]);
      await run('JAUNIX-002', dependencies)(editor);
      assert.strictEqual(editor.document.getText(), blocks.join(SEPARATOR));
      assert.deepStrictEqual([errors, warnings], [[`${NOT_CHANGED}selection 2 of 2: line 2: "123" does not start with kana`], []]);
    });

    test('JAUNIX-020 with several selections asks once and writes one block per selection', async () => {
      const { dependencies, picks, everything } = recorder(['TIP']);
      const editor = await open('a\n\nb', [[3, 4], [0, 1]]);
      await run('JAUNIX-020', dependencies)(editor);
      assert.strictEqual(editor.document.getText(), '> [!TIP]\n> a\n\n> [!TIP]\n> b');
      assert.deepStrictEqual([picks.length, everything()], [1, [[], [], [], []]]);
    });

    test('a quick pick value that was not offered changes nothing', async () => {
      const { dependencies, everything } = recorder(['other']);
      const editor = await open('が');
      await run('JAUNIX-006', dependencies)(editor);
      assert.strictEqual(editor.document.getText(), 'が');
      assert.deepStrictEqual(everything(), [[], [], [], []]);
    });
  });

  suite('limits and security measures', () => {
    test('JAUNIX-001: more than 1,000 lines or characters per line warns and shows nothing', async () => {
      const lines = Array.from({ length: 1001 }, () => 'あ').join('\n');
      const first = recorder();
      await run('JAUNIX-001', first.dependencies)(await open(lines));
      assert.deepStrictEqual(first.everything(), [[], [`${NOT_SHOWN}the selection has more than 1,000 lines`], [], []]);
      const second = recorder();
      await run('JAUNIX-001', second.dependencies)(await openBlocks(['あ', `い\n${'う'.repeat(1001)}`]));
      assert.deepStrictEqual(second.everything(), [[], [`${NOT_SHOWN}selection 2 of 2: line 2 has more than 1,000 characters`], [], []]);
    });

    test('JAUNIX-001: the output limit is shared by all selections', async () => {
      // One line of 1,000 characters and 999 lines of 1: 1,000 x 1,000 cells (mostly padding) and 999 line breaks per selection.
      const block = `${'あ'.repeat(1000)}${'\nい'.repeat(999)}`;
      const { dependencies, everything } = recorder();
      await run('JAUNIX-001', dependencies)(await openBlocks(Array.from({ length: 10 }, () => block)));
      assert.deepStrictEqual(everything(), [[], [`${NOT_SHOWN}the result would be longer than 10,000,000 characters. Select less text.`], [], []]);
    });

    test('JAUNIX-005: the notification never contains the selected text', async () => {
      const { dependencies, infos } = recorder();
      await run('JAUNIX-005', dependencies)(await openBlocks(['7000012050002', '1234567890123', 'secret']));
      assert.deepStrictEqual(infos, ['Corporate number: #1 valid, #2 invalid, #3 not a corporate number']);
    });

    test('JAUNIX-015 / 016: escaped pipes stay escaped', async () => {
      const table = '| k | v |\n|---|---|\n| b \\| 2 | x |\n| a | y |';
      const sorted = await open(table);
      await run('JAUNIX-015', recorder(['1', 'ascending']).dependencies)(sorted);
      assert.strictEqual(sorted.document.getText(), '| k | v |\n|---|---|\n| a | y |\n| b \\| 2 | x |');
      const transposed = await open(table);
      await run('JAUNIX-016', recorder().dependencies)(transposed);
      assert.strictEqual(transposed.document.getText(), '| k | b \\| 2 | a |\n| --- | --- | --- |\n| v | x | y |');
    });

    test('JAUNIX-015: an invalid column number that comes back anyway changes nothing; a non-table warns', async () => {
      const table = '| k |\n|---|\n| b |\n| a |';
      const first = recorder(['0', 'ascending']);
      const editor = await open(table);
      await run('JAUNIX-015', first.dependencies)(editor);
      assert.strictEqual(editor.document.getText(), table);
      assert.deepStrictEqual(first.everything(), [[], [], [], []]);
      assert.strictEqual(first.boxes[0].validateInput!('0'), 'Enter a column number from 1 to 1,000');
      const second = recorder(['1', 'ascending']);
      await run('JAUNIX-015', second.dependencies)(await open('not a table'));
      assert.strictEqual(second.warnings.length, 1);
      assert.ok(second.warnings[0].startsWith(`${MD_TEXT_NOT_CHANGED}the selection is not a Markdown table`), second.warnings[0]);
    });

    test('JAUNIX-020: only a type of the fixed list is written', async () => {
      const { dependencies, everything, picks } = recorder(['NOTE]\n<script>']);
      const editor = await open('text');
      await run('JAUNIX-020', dependencies)(editor);
      assert.strictEqual(editor.document.getText(), 'text');
      assert.deepStrictEqual(everything(), [[], [], [], []]);
      assert.deepStrictEqual(picks[0].map((item) => item.value), ['NOTE', 'TIP', 'IMPORTANT', 'WARNING', 'CAUTION']);
    });

    test('JAUNIX-021: key names are HTML-escaped', async () => {
      const editor = await open('Ctrl+<img src=x onerror=alert(1)>');
      await run('JAUNIX-021', recorder().dependencies)(editor);
      assert.strictEqual(editor.document.getText(), '<kbd>Ctrl</kbd>+<kbd>&lt;img src=x onerror=alert(1)&gt;</kbd>');
    });

    test('JAUNIX-018: nothing found is an information message; JAUNIX-019 converts with the definitions of the whole document', async () => {
      const first = recorder();
      await run('JAUNIX-018', first.dependencies)(await open('no links'));
      assert.deepStrictEqual(first.everything(), [['No links or images were found in the selection.'], [], [], []]);
      const text = '[a][1] [b][2]\n\n[1]: /u\n[2]: /v';
      const editor = await open(text, [[0, 6]]);
      await run('JAUNIX-019', recorder().dependencies)(editor);
      assert.strictEqual(editor.document.getText(), '[a](/u) [b][2]\n\n[1]: /u\n[2]: /v');
      const selected = editor.selections.map((selection) => editor.document.getText(selection));
      assert.deepStrictEqual(selected, ['[a](/u)']);
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
        await run('JAUNIX-012', dependencies)(await open('secret é'));
        await run('JAUNIX-018', dependencies)(await open('[secret](u)'));
      } finally {
        console.error = original;
      }
      assert.deepStrictEqual(errors, [`${NOT_SHOWN}the text could not be processed`, `${MD_TEXT_NOT_CHANGED}the selections could not be processed.`]);
      assert.ok(logged.every((message) => !message.includes('secret')), logged.join('\n'));
    });
  });

  suite('registration', () => {
    test('candidate IDs, command IDs, titles and examples match the JAUNIX commands of the showcase data', () => {
      const data = JSON.parse(readRepoFile('scripts/showcase-data/JAUNIX.json')).commands as { id: string; candidateId: string; example: { en: string } }[];
      assert.deepStrictEqual(data.map((row) => row.candidateId), ENTRIES.map(({ entry }) => entry.id));
      assert.deepStrictEqual(data.map((row) => row.id), ENTRIES.map(({ entry }) => `${PREFIX}${entry.name}`));
      for (const row of data) {
        const match = /^`(.*)` → `(.*)`$/s.exec(row.example.en);
        assert.ok(match, `${row.candidateId}: ${row.example.en}`);
        const expected = JAUNI2_EXAMPLES[row.candidateId];
        const expand = (text: string) => text.replace(/⏎/g, '\n').replace(/⇥/g, '\t');
        const input = expand(match[1]);
        // The note stands for the answers (JAUNIX-007 has real parentheses in its input).
        assert.strictEqual(input, expected.note === undefined ? expected.input : `${expected.input}（${expected.note}）`, row.candidateId);
        const output = outputOf(itemOf(row.candidateId)) === 'notify' ? `${expected.expected}（notification）` : expected.expected;
        assert.strictEqual(expand(match[2]), output, row.candidateId);
      }
    });

    test('the command IDs are new; the planned Remove Parenthesized Readings was replaced', () => {
      const names = new Set([...JA_COMMAND_ENTRIES, ...UNI_COMMAND_ENTRIES, ...MD_COMMAND_ENTRIES].map((entry) => entry.name));
      ENTRIES.forEach(({ entry }) => assert.ok(!names.has(entry.name), entry.name));
      const ids = JSON.parse(readRepoFile('package.json')).contributes.commands.map((c: { command: string }) => c.command);
      assert.ok(!ids.includes(`${PREFIX}japanese.remove-paren-reading`));
      assert.ok(ids.includes(`${PREFIX}japanese.remove-ruby`));
    });

    test('extension.ts registers every command with its handler exactly once', () => {
      const source = readRepoFile('src/extension.ts');
      assert.strictEqual(source.split('// Japanese, Unicode and Markdown extended (JAUNIX-001..021, group JAUNI2)').length - 1, 1);
      ENTRIES.forEach(({ family, entry }) => {
        const registration = `registerTextEditorCommand('${PREFIX}${entry.name}', ${family}2CommandHandler('${entry.name}'))`;
        assert.strictEqual(source.split(registration).length - 1, 1, registration);
        assert.strictEqual(source.split(`'${PREFIX}${entry.name}'`).length - 1, 1, entry.name);
      });
    });

    test('package.json, the command palette, the submenus and Show Commands register every command exactly once', () => {
      const contributes = JSON.parse(readRepoFile('package.json')).contributes;
      type MenuItem = { command?: string; submenu?: string; group?: string; when?: string };
      const count = (items: MenuItem[], id: string) => items.filter((item) => item.command === id).length;
      const submenus: Record<Family, string> = {
        ja: `${PREFIX}japanese.submenu`, uni: `${PREFIX}unicode.submenu`, md: `${PREFIX}markdown.submenu`,
      };
      ENTRIES.forEach(({ family, entry }) => {
        const id = `${PREFIX}${entry.name}`;
        assert.deepStrictEqual(contributes.commands.filter((c: MenuItem) => c.command === id),
          [{ command: id, title: entry.title, category: 'Selection Manipulator' }], id);
        assert.deepStrictEqual(myCommands.filter((c) => c.command === id), [{ command: id, title: entry.title, canMultiSelection: true }], id);
        assert.deepStrictEqual(contributes.menus.commandPalette.filter((c: MenuItem) => c.command === id),
          [{ when: 'editorHasSelection', command: id }], id);
        Object.entries(contributes.menus).filter(([name]) => name !== 'commandPalette').forEach(([name, items]) =>
          assert.strictEqual(count(items as MenuItem[], id), name === submenus[family] ? 1 : 0, `${name}: ${id}`));
      });
      const tail = (submenu: string, entries: readonly Entry[], when?: string) => {
        const items: MenuItem[] = contributes.menus[submenu];
        assert.deepStrictEqual(items.slice(-entries.length).map((item) => item.command), entries.map((entry) => `${PREFIX}${entry.name}`));
        items.forEach((item, i) => assert.strictEqual(item.group, `selection-manipulator@${i}`, item.command));
        items.slice(-entries.length).forEach((item) => assert.strictEqual(item.when, when, item.command));
        return items.length;
      };
      assert.strictEqual(tail(submenus.ja, JA2_COMMAND_ENTRIES), 50, '43 + 7');
      assert.strictEqual(tail(submenus.uni, UNI2_COMMAND_ENTRIES), 37, '30 + 7');
      assert.strictEqual(tail(submenus.md, MD2_COMMAND_ENTRIES, MD_WHEN_SELECTION), 33, '26 + 7');
      const ids = contributes.commands.map((c: { command: string }) => c.command);
      assert.strictEqual(ids.length, 1014, '993 before JAUNI2 + 21');
      assert.strictEqual(new Set(ids).size, ids.length, 'command IDs are unique');
      const titles = contributes.commands.map((c: { title: string; category?: string }) => `${c.category ?? ''}:${c.title}`);
      assert.strictEqual(new Set(titles).size, titles.length, 'command titles are unique');
      const shown = myCommands.map((c) => c.title);
      assert.strictEqual(new Set(shown).size, shown.length, 'Show Commands titles are unique');
    });

    test('no dependency was added', () => {
      const packageJson = JSON.parse(readRepoFile('package.json'));
      assert.deepStrictEqual(Object.keys(packageJson.dependencies).sort(), ['change-case', 'diff', 'js-yaml', 'xml-formatter']);
    });

    test('the new modules use no code evaluation, processes, files, network, webviews or dynamic regular expressions', () => {
      const forbidden = [
        /\beval\s*\(/, /new\s+Function\b/, /child_process/, /from\s+'(?:node:)?fs'/, /require\(\s*'(?:node:)?fs'\s*\)/,
        /from\s+'(?:node:)?(?:https?|net|dns|tls|dgram|vm|worker_threads)'/, /require\(\s*'(?:node:)?(?:https?|net|dns|tls|dgram|vm|worker_threads)'\s*\)/,
        /\bfetch\s*\(/, /XMLHttpRequest/, /createWebviewPanel|Webview/, /new\s+RegExp\s*\(/, /\bRegExp\s*\(/, /Math\.random/,
        /from\s+'vscode'/,
      ];
      for (const file of NEW_MODULES) {
        // Comments may name what the module does not do (e.g. "no eval / new Function"): only code is checked.
        const source = readRepoFile(file).replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
        for (const pattern of forbidden) {
          assert.doesNotMatch(source, pattern, `${file}: ${pattern}`);
        }
      }
    });
  });
});
