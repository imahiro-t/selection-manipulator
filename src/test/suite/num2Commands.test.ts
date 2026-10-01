import * as assert from 'assert';
import * as fs from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';
import { num2CommandHandlerInternal } from '../../handler/num2CommandHandler';
import { NUM2_COMMAND_ENTRIES } from '../../handler/num2Transforms';
import { findNumPromptProblem } from '../../handler/numCommon';
import { NumDependencies, NUM_NOTHING_SELECTED } from '../../handler/numHandler';
import { NUM_COMMAND_ENTRIES, NumCommandEntry } from '../../handler/numTransforms';
import { myCommands } from '../../handler/showCommandsHandler';
import { NUM2_EXAMPLES } from './num2Examples';
import { createTextEditor } from './testUtils';
import { candidateRows } from './showcaseData';

const PREFIX = 'selection-manipulator.';
const SEPARATOR = '\n---\n';
const NOT_CHANGED = 'The selection was not changed: ';
const NOT_SHOWN = 'No result was shown: ';

/**
 * Records what the handlers show and open instead of touching VS Code's UI. The input boxes take
 * their answers from `answers` in order (`undefined` = cancelled) and record their options.
 */
const recorder = (answers: (string | undefined)[] = []) => {
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
    showInputBox: (options) => {
      prompts.push(options);
      return Promise.resolve(queue.shift());
    },
  };
  const everything = () => [warnings, errors, opened];
  return { dependencies, warnings, errors, opened, prompts, everything };
};

const entryOf = (id: string): NumCommandEntry => {
  const found = NUM2_COMMAND_ENTRIES.find((entry) => entry.id === id);
  assert.ok(found, id);
  return found;
};

const run = (id: string, dependencies: NumDependencies) => num2CommandHandlerInternal(dependencies)(entryOf(id).name);

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

/** The title of a command in the Show Commands list (the NUM rules). */
const shownTitle = (entry: NumCommandEntry): string => {
  if (entry.name.startsWith('math.')) {
    return entry.title;
  }
  if (entry.name.startsWith('number.')) {
    return `Replace - ${entry.title}`;
  }
  return entry.title.replace(/^Unit: /, 'Unit - ');
};

/** The context menu of a command: gcd / lcm under Calculate, units under Unit Conversion, the rest under Replace > Number. */
const menuOf = (entry: NumCommandEntry): string => {
  if (entry.output === 'new-tab') {
    return `${PREFIX}calculation.submenu`;
  }
  return entry.name.startsWith('unit.') ? `${PREFIX}unit.submenu` : `${PREFIX}number.submenu`;
};

suite('Extended Number Commands (NUMX-001..023) Test Suite', () => {

  suite('each command (showcase example)', () => {
    NUM2_COMMAND_ENTRIES.forEach((entry) => {
      const example = NUM2_EXAMPLES[entry.id];

      test(`${entry.id} ${entry.name}: each selection on its own, prompts asked once`, async () => {
        const { dependencies, prompts, opened, everything } = recorder(example.inputs);
        const blocks = [example.input, example.input];
        const editor = await openBlocks(blocks);
        await run(entry.id, dependencies)(editor);
        if (entry.output === 'replace') {
          assert.strictEqual(editor.document.getText(), [example.expected, example.expected].join(SEPARATOR));
          assert.deepStrictEqual(everything(), [[], [], []]);
        } else {
          assert.strictEqual(editor.document.getText(), blocks.join(SEPARATOR), 'the document is not changed');
          assert.deepStrictEqual(everything(), [[], [], [[example.expected, example.expected].join('\n')]]);
        }
        assert.strictEqual(prompts.length, entry.prompts.length);
        assert.deepStrictEqual(opened.length, entry.output === 'new-tab' ? 1 : 0);
      });

      test(`${entry.id} ${entry.name}: only empty or blank selections warn and ask nothing`, async () => {
        const { dependencies, prompts, everything } = recorder(example.inputs);
        const editor = await open('x  \n\t', [[0, 0], [1, 5]]);
        await run(entry.id, dependencies)(editor);
        assert.strictEqual(editor.document.getText(), 'x  \n\t');
        assert.deepStrictEqual(everything(), [[NUM_NOTHING_SELECTED], [], []]);
        assert.strictEqual(prompts.length, 0);
      });

      test(`${entry.id} ${entry.name}: unreadable input is reported and changes nothing`, async () => {
        const { dependencies, warnings, errors, opened } = recorder(example.inputs);
        const editor = await open('a?c');
        await run(entry.id, dependencies)(editor);
        assert.strictEqual(editor.document.getText(), 'a?c');
        assert.deepStrictEqual(opened, []);
        if (entry.output === 'new-tab') {
          assert.deepStrictEqual([warnings, errors], [[`${NOT_SHOWN}no numbers found`], []]);
        } else {
          assert.deepStrictEqual(warnings, []);
          assert.strictEqual(errors.length, 1, JSON.stringify(errors));
          assert.ok(errors[0].startsWith(NOT_CHANGED), errors[0]);
        }
      });

      if (entry.prompts.length > 0) {
        test(`${entry.id} ${entry.name}: cancelling any prompt does nothing`, async () => {
          for (let cancelAt = 0; cancelAt < entry.prompts.length; cancelAt++) {
            const { dependencies, prompts, everything } = recorder([...example.inputs.slice(0, cancelAt), undefined]);
            const editor = await open(example.input);
            await run(entry.id, dependencies)(editor);
            assert.strictEqual(editor.document.getText(), example.input);
            assert.deepStrictEqual(everything(), [[], [], []], `cancelled at ${cancelAt}`);
            assert.strictEqual(prompts.length, cancelAt + 1);
          }
        });
      }
    });
  });

  suite('selections and line breaks', () => {
    test('several selections are converted in document order; CRLF line breaks are kept', async () => {
      const editor = await createTextEditor('4\n6\n---\n7');
      await editor.edit((editBuilder) => editBuilder.setEndOfLine(vscode.EndOfLine.CRLF));
      editor.selections = [new vscode.Selection(3, 0, 3, 1), new vscode.Selection(0, 0, 1, 1)];
      const { dependencies, opened } = recorder();
      await run('NUMX-013', dependencies)(editor);
      assert.deepStrictEqual(opened, ['12\r\n7']);
      const { dependencies: d2 } = recorder();
      await run('NUMX-004', d2)(editor);
      assert.strictEqual(editor.document.getText(), 'IV\r\nVI\r\n---\r\nVII');
      const { dependencies: d3 } = recorder();
      editor.selection = new vscode.Selection(0, 0, 1, 2);
      await run('NUMX-005', d3)(editor);
      assert.strictEqual(editor.document.getText(), '4\r\n6\r\n---\r\nVII');
    });

    test('diff-consecutive separates with the line breaks of the selection', async () => {
      const editor = await createTextEditor('1\n4\n9');
      await editor.edit((editBuilder) => editBuilder.setEndOfLine(vscode.EndOfLine.CRLF));
      editor.selection = new vscode.Selection(0, 0, 2, 1);
      const { dependencies } = recorder();
      await run('NUMX-015', dependencies)(editor);
      assert.strictEqual(editor.document.getText(), '3\r\n5');
    });

    test('one invalid selection among several changes nothing; the message names the selection and the line', async () => {
      const { dependencies, errors } = recorder();
      const blocks = ['XII', 'IV\nIIII'];
      const editor = await open(blocks.join(SEPARATOR), [[0, 3], [3 + SEPARATOR.length, 3 + SEPARATOR.length + 7]]);
      await run('NUMX-005', dependencies)(editor);
      assert.strictEqual(editor.document.getText(), blocks.join(SEPARATOR));
      assert.deepStrictEqual(errors, [`${NOT_CHANGED}selection 2 of 2: line 2: "IIII" is not a Roman numeral in standard form (I to MMMCMXCIX)`]);
    });
  });

  suite('prompts', () => {
    test('clamp: a minimum greater than the maximum warns and changes nothing', async () => {
      const { dependencies, prompts, everything } = recorder(['100', '0']);
      const editor = await open('50');
      await run('NUMX-003', dependencies)(editor);
      assert.strictEqual(editor.document.getText(), '50');
      assert.strictEqual(prompts.length, 2);
      assert.deepStrictEqual(everything(), [[`${NOT_CHANGED}The minimum (100) is greater than the maximum (0).`], [], []]);
    });

    test('the input boxes validate their values (no bounds, not 0, choices, ranges)', async () => {
      const cases: [string, string[], string, string][] = [
        ['NUMX-001', ['2'], '22', 'Enter an integer from 1 to 21.'],
        ['NUMX-002', ['5'], '-0', 'Enter a number other than 0.'],
        ['NUMX-003', ['0', '100'], '1e400', 'Enter a number.'],
        ['NUMX-008', ['1.1'], 'x', 'Enter a number.'],
        ['NUMX-009', ['64'], '16', 'Enter one of 64, 32.'],
        ['NUMX-011', ['32'], '12', 'Enter one of 8, 16, 32, 64.'],
      ];
      for (const [id, inputs, bad, message] of cases) {
        const { dependencies, prompts } = recorder([undefined]);
        await run(id, dependencies)(await open('1'));
        assert.strictEqual(prompts.length, 1, id);
        const rule = entryOf(id).prompts[0].rule;
        assert.strictEqual(prompts[0].validateInput!(bad), message, id);
        assert.strictEqual(findNumPromptProblem(bad, rule), message, id);
        assert.strictEqual(prompts[0].validateInput!(inputs[0]), undefined, id);
        assert.strictEqual(prompts[0].ignoreFocusOut, true, id);
        assert.strictEqual(prompts[0].value, undefined, id);
      }
    });

    test('a refused value that comes back anyway ends with a warning and changes nothing', async () => {
      const cases: [string, string[], string][] = [
        ['NUMX-002', ['0'], `${NOT_CHANGED}Enter a number other than 0.`],
        ['NUMX-009', ['16'], `${NOT_CHANGED}Enter one of 64, 32.`],
        ['NUMX-011', ['7'], `${NOT_CHANGED}Enter one of 8, 16, 32, 64.`],
        ['NUMX-003', ['0', 'max'], `${NOT_CHANGED}Enter a number.`],
      ];
      for (const [id, answers, message] of cases) {
        const { dependencies, everything } = recorder(answers);
        const editor = await open('12');
        await run(id, dependencies)(editor);
        assert.deepStrictEqual(everything(), [[message], [], []], id);
        assert.strictEqual(editor.document.getText(), '12');
      }
    });
  });

  suite('limits and failures', () => {
    test('△ expand-ranges: more than 10,000 integers warns and changes nothing', async () => {
      const { dependencies, everything } = recorder();
      const editor = await open('0-10000');
      await run('NUMX-017', dependencies)(editor);
      assert.strictEqual(editor.document.getText(), '0-10000');
      assert.deepStrictEqual(everything(), [[`${NOT_CHANGED}the ranges expand to more than 10,000 integers`], [], []]);
    });

    test('△ lcm: more than 1,000 digits is an error', async () => {
      const { dependencies, everything } = recorder();
      await run('NUMX-013', dependencies)(await open(`${'9'.repeat(999)} 1${'0'.repeat(999)}`));
      assert.deepStrictEqual(everything(), [[], [`${NOT_SHOWN}the result has more than 1,000 digits`], []]);
    });

    test('△ prime-factors: the trial divisions are shared by all selections of one run', async function () {
      this.timeout(30_000);
      const prime = '9007199254740881';
      const blocks = [prime, prime, prime, prime];
      const { dependencies, everything } = recorder();
      const editor = await openBlocks(blocks);
      await run('NUMX-014', dependencies)(editor);
      assert.strictEqual(editor.document.getText(), blocks.join(SEPARATOR));
      assert.deepStrictEqual(everything(), [[], [`${NOT_CHANGED}selection 4 of 4: line 1: the factorization needs more than 100,000,000 trial divisions; select fewer or smaller numbers`], []]);
      // A new run starts counting again.
      const again = recorder();
      await run('NUMX-014', again.dependencies)(await open(prime));
      assert.deepStrictEqual(again.everything(), [[], [], []]);
    });

    test('the output limit is shared by all selections', async function () {
      this.timeout(60_000);
      // Each selection expands to 10,000 integers of 16 digits (about 180,000 characters): 60 of them exceed 10,000,000.
      const block = '9007199254730000-9007199254739999';
      const blocks = Array.from({ length: 60 }, () => block);
      const one = recorder();
      await run('NUMX-017', one.dependencies)(await open(block));
      assert.deepStrictEqual(one.everything().slice(0, 2), [[], []]);
      const { dependencies, everything } = recorder();
      const editor = await openBlocks(blocks);
      await run('NUMX-017', dependencies)(editor);
      assert.strictEqual(editor.document.getText(), blocks.join(SEPARATOR));
      assert.deepStrictEqual(everything(), [[`${NOT_CHANGED}the result would be longer than 10,000,000 characters. Select less text.`], [], []]);
    });

    test('an unexpected failure shows a fixed message and never the selected text', async () => {
      const { dependencies, errors } = recorder();
      dependencies.openResult = () => {
        throw new TypeError('secret selected text');
      };
      await run('NUMX-012', dependencies)(await open('12 18'));
      assert.deepStrictEqual(errors, [`${NOT_SHOWN}the numbers could not be processed`]);
    });
  });

  suite('registration', () => {
    test('candidate IDs, command IDs, titles and examples match the NUMX commands of the showcase data, in its order', () => {
      const rows = candidateRows('NUMX');
      assert.strictEqual(rows.length, 23);
      assert.deepStrictEqual(NUM2_COMMAND_ENTRIES.map((entry) => entry.id), rows.map(([id]) => id));
      assert.deepStrictEqual(Object.keys(NUM2_EXAMPLES).sort(), rows.map(([id]) => id).sort(), 'an example for every command');
      for (const [id, kind, command, title, example] of rows) {
        const entry = entryOf(id);
        assert.strictEqual(kind, '基本', id);
        assert.strictEqual(command, `${PREFIX}${entry.name}`, id);
        assert.strictEqual(title, entry.title, id);
        const match = /^`(.*)` → `(.*)`$/.exec(example);
        assert.ok(match, `${id}: ${example}`);
        const expected = NUM2_EXAMPLES[id];
        let input = match[1].replace(/⏎/g, '\n');
        const typed = /^(.*)（(.*)）$/s.exec(input);
        if (typed) {
          input = typed[1];
          assert.strictEqual(typed[2], expected.note, id);
        } else {
          assert.strictEqual(expected.note, undefined, id);
        }
        assert.strictEqual(input, expected.input, id);
        assert.strictEqual(match[2].replace(/⏎/g, '\n'), expected.expected, id);
      }
    });

    test('the command IDs are new: none is a NUM command', () => {
      const names = new Set(NUM_COMMAND_ENTRIES.map((entry) => entry.name));
      NUM2_COMMAND_ENTRIES.forEach((entry) => assert.ok(!names.has(entry.name), entry.name));
    });

    test('extension.ts registers every command with num2CommandHandler exactly once', () => {
      const source = readRepoFile('src/extension.ts');
      assert.strictEqual(source.split('// Number extended (NUMX-001..023, group NUM2)').length - 1, 1);
      NUM2_COMMAND_ENTRIES.forEach((entry) => {
        const registration = `registerTextEditorCommand('${PREFIX}${entry.name}', num2CommandHandler('${entry.name}'))`;
        assert.strictEqual(source.split(registration).length - 1, 1, registration);
        assert.strictEqual(source.split(`'${PREFIX}${entry.name}'`).length - 1, 1, entry.name);
      });
    });

    test('package.json, the command palette, the three submenus and Show Commands register every command exactly once', () => {
      const packageJson = JSON.parse(readRepoFile('package.json'));
      const contributes = packageJson.contributes;
      type MenuItem = { command?: string; submenu?: string; group?: string; when?: string };
      const count = (items: MenuItem[], id: string) => items.filter((item) => item.command === id).length;
      NUM2_COMMAND_ENTRIES.forEach((entry) => {
        const id = `${PREFIX}${entry.name}`;
        assert.deepStrictEqual(contributes.commands.filter((c: MenuItem) => c.command === id),
          [{ command: id, title: entry.title, category: 'Selection Manipulator' }], id);
        assert.deepStrictEqual(myCommands.filter((c) => c.command === id), [{ command: id, title: shownTitle(entry), canMultiSelection: true }], id);
        assert.deepStrictEqual(contributes.menus.commandPalette.filter((c: MenuItem) => c.command === id),
          [{ when: 'editorHasSelection', command: id }], id);
        Object.entries(contributes.menus).filter(([name]) => name !== 'commandPalette').forEach(([name, items]) =>
          assert.strictEqual(count(items as MenuItem[], id), name === menuOf(entry) ? 1 : 0, `${name}: ${id}`));
      });
      const sizes: Record<string, number> = {};
      for (const menu of [`${PREFIX}calculation.submenu`, `${PREFIX}number.submenu`, `${PREFIX}unit.submenu`]) {
        const items: MenuItem[] = contributes.menus[menu];
        const added = NUM2_COMMAND_ENTRIES.filter((entry) => menuOf(entry) === menu).map((entry) => `${PREFIX}${entry.name}`);
        assert.deepStrictEqual(items.slice(-added.length).map((item) => item.command), added, `${menu}: at the end, in order`);
        items.forEach((item, i) => assert.strictEqual(item.group, `selection-manipulator@${i}`, `${menu}: ${item.command}`));
        sizes[menu] = items.length;
      }
      assert.deepStrictEqual(sizes, {
        [`${PREFIX}calculation.submenu`]: 13,
        [`${PREFIX}number.submenu`]: 49,
        [`${PREFIX}unit.submenu`]: 16,
      }, '11 + 2, 34 + 15, 10 + 6');
      const ids = contributes.commands.map((c: { command: string }) => c.command);
      assert.strictEqual(ids.length, 1014, '946 before NUM2 + 23, then 24 of DATE2 and 21 of JAUNI2');
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
      ];
      for (const file of ['src/handler/num2Convert.ts', 'src/handler/num2Math.ts', 'src/handler/num2Transforms.ts', 'src/handler/num2CommandHandler.ts']) {
        // Comments may name what the module does not do (e.g. "no eval / new Function"): only code is checked.
        const source = readRepoFile(file).replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
        for (const pattern of forbidden) {
          assert.doesNotMatch(source, pattern, `${file}: ${pattern}`);
        }
      }
    });
  });
});
