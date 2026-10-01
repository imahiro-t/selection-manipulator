import * as assert from 'assert';
import * as fs from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';
import { cryptoRandom, findGenPromptProblem, GenInputError, GenLimitError, GenRandom } from '../../handler/genCommon';
import {
  defaultGenDependencies,
  GEN_NOT_CHANGED,
  GEN_NOTHING_SELECTED,
  GenDependencies,
  genCommandHandlerInternal,
} from '../../handler/genCommandHandler';
import { GEN_COMMAND_ENTRIES, GenCommandEntry } from '../../handler/genTransforms';
import { gen2CommandHandlerInternal } from '../../handler/gen2CommandHandler';
import { GEN2_COMMAND_ENTRIES } from '../../handler/gen2Transforms';
import { DATE2_MSEL_ENTRIES } from '../../handler/gen2Cartesian';
import { PASSPHRASE_WORDS } from '../../handler/gen2Words';
import { date2MselCommandHandlerInternal } from '../../handler/date2MselCommandHandler';
import { ALL_MSEL_COMMAND_ENTRIES, MselDependencies } from '../../handler/mselCommandHandler';
import { MSEL_NEED_TWO } from '../../handler/mselTransforms';
import { LINE_REGEX_MAX_INPUT_LENGTH } from '../../handler/lineTransforms';
import { runRegexInWorker, runRegexSplitInWorker } from '../../handler/lineRegex';
import { myCommands } from '../../handler/showCommandsHandler';
import { DATE2_EXAMPLES, SELECTIONS_SEPARATOR } from './date2Examples';
import { fakeRandom, GEN_TEST_NOW } from './genTestUtils';
import { createTextEditor, undoIn } from './testUtils';

const PREFIX = 'selection-manipulator.';
const CARTESIAN = DATE2_MSEL_ENTRIES[0];

/**
 * Records what the handlers show instead of touching VS Code's UI. The input boxes take their
 * answers from `answers` in order (`undefined` = cancelled) and record their options.
 */
const recorder = (answers: (string | undefined)[] = [], random: GenRandom = fakeRandom()) => {
  const warnings: string[] = [];
  const errors: string[] = [];
  const prompts: vscode.InputBoxOptions[] = [];
  const queue = [...answers];
  const dependencies: GenDependencies = {
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
    showInputBox: (options) => {
      prompts.push(options);
      return Promise.resolve(queue.shift());
    },
    showQuickPick: () => Promise.resolve(undefined),
    random,
    now: GEN_TEST_NOW,
  };
  return { dependencies, warnings, errors, prompts };
};

const mselRecorder = (answers: (string | undefined)[] = []) => {
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
  };
  return { dependencies, infos, warnings, errors, boxes };
};

const entryOf = (id: string): GenCommandEntry => {
  const found = GEN2_COMMAND_ENTRIES.find((entry) => entry.id === id);
  assert.ok(found, id);
  return found;
};

const run = (id: string, dependencies: GenDependencies) => gen2CommandHandlerInternal(dependencies)(entryOf(id).name);
const runCartesian = (dependencies: MselDependencies) => date2MselCommandHandlerInternal(dependencies)(CARTESIAN.name);

/** Opens `text` and selects the `[start, end]` offsets (all of it when none are given). */
const open = async (text: string, ranges?: [number, number][]): Promise<vscode.TextEditor> => {
  const editor = await createTextEditor(text);
  const document = editor.document;
  editor.selections = (ranges ?? [[0, text.length]]).map(([start, end]) => new vscode.Selection(document.positionAt(start), document.positionAt(end)));
  return editor;
};

/** Opens the parts separated by `|` and selects each part. */
const openParts = async (parts: string[]): Promise<vscode.TextEditor> => {
  const ranges: [number, number][] = [];
  let offset = 0;
  parts.forEach((part) => {
    ranges.push([offset, offset + part.length]);
    offset += part.length + 1;
  });
  return open(parts.join('|'), ranges);
};

/** Runs `body` and returns what was logged with console.error meanwhile. */
const capturingErrors = async (body: () => Promise<void>): Promise<string[]> => {
  const original = console.error;
  const logged: string[] = [];
  console.error = (message: string) => logged.push(message);
  try {
    await body();
  } finally {
    console.error = original;
  }
  return logged;
};

const readRepoFile = (file: string): string => fs.readFileSync(path.resolve(__dirname, '../../..', file), 'utf8');

suite('Extended Generator and Random Commands (DATEX-016..024) Test Suite', () => {

  suite('each command (showcase example)', () => {
    GEN2_COMMAND_ENTRIES.forEach((entry) => {
      const example = DATE2_EXAMPLES[entry.id];

      test(`${entry.id} ${entry.name}: the showcase example, prompts asked once`, async () => {
        const random = fakeRandom(example.random ?? []);
        const { dependencies, prompts, warnings, errors } = recorder(example.inputs, random);
        const editor = await open(example.input);
        await run(entry.id, dependencies)(editor);
        assert.deepStrictEqual([warnings, errors], [[], []]);
        assert.strictEqual(editor.document.getText(), example.expected);
        assert.strictEqual(prompts.length, example.inputs.length);
        if (example.random !== undefined) {
          assert.strictEqual(random.counts.length, example.random.length, 'one random value per word / character / swap');
        }
      });
    });
  });

  suite('targets', () => {
    test('brace expansion and shuffle: blank selections are skipped; only blank ones warn', async () => {
      const editor = await open('a{1,2}\n  \nb c', [[0, 6], [7, 9], [10, 13]]);
      const { dependencies, warnings } = recorder([], fakeRandom([0]));
      await run('DATEX-016', dependencies)(editor);
      assert.strictEqual(editor.document.getText(), 'a1\na2\n  \nb c');
      assert.deepStrictEqual(warnings, []);
      const blank = recorder();
      await run('DATEX-024', blank.dependencies)(await open('  \n\t', [[0, 4]]));
      assert.deepStrictEqual(blank.warnings, [GEN_NOTHING_SELECTED]);
    });

    test('brace expansion joins with the line break of the document (CRLF)', async () => {
      const editor = await createTextEditor('x{a,b}\ny');
      await editor.edit((editBuilder) => editBuilder.setEndOfLine(vscode.EndOfLine.CRLF));
      editor.selection = new vscode.Selection(0, 0, 1, 1);
      await run('DATEX-016', recorder().dependencies)(editor);
      assert.strictEqual(editor.document.getText(), 'xa\r\nxb\r\ny');
    });

    test('text or prompt: selections are read, empty cursors share one answer asked after the other prompts', async () => {
      const editor = await open('4\n\n', [[0, 1], [2, 2], [3, 3]]);
      const { dependencies, prompts } = recorder(['2x3']);
      await run('DATEX-017', dependencies)(editor);
      assert.strictEqual(prompts.length, 1);
      assert.strictEqual(prompts[0].value, '9');
      assert.strictEqual(editor.document.getText(), '1 2  3  4\n2 4  6  8\n3 6  9 12\n4 8 12 16\n1 2 3\n2 4 6\n1 2 3\n2 4 6');

      const times = await open('', [[0, 0]]);
      const second = recorder(['15', '2', '23:50']);
      await run('DATEX-020', second.dependencies)(times);
      assert.deepStrictEqual(second.prompts.map((p) => p.value), ['30', '3', '09:00']);
      assert.strictEqual(times.document.getText(), '23:50\n00:05');
    });

    test('primes: several targets with different N share the sieve of the run', async () => {
      const editor = await open('10\n30\n', [[0, 2], [3, 5], [6, 6]]);
      const { dependencies, prompts } = recorder(['5']);
      await run('DATEX-019', dependencies)(editor);
      assert.strictEqual(prompts.length, 1);
      assert.strictEqual(editor.document.getText(), '2 3 5 7\n2 3 5 7 11 13 17 19 23 29\n2 3 5');
    });

    test('random commands write one value per cursor, in one edit, from GenRandom only', async () => {
      const editor = await open('\n', [[0, 0], [1, 1]]);
      const random = fakeRandom([0, 0, 0, 'max', 'max', 'max']);
      const { dependencies } = recorder(['3', ' + '], random);
      await run('DATEX-022', dependencies)(editor);
      const words = PASSPHRASE_WORDS;
      const last = words[words.length - 1];
      assert.strictEqual(editor.document.getText(), `${words[0]} + ${words[0]} + ${words[0]}\n${last} + ${last} + ${last}`);
      assert.deepStrictEqual(random.counts, Array.from({ length: 6 }, () => words.length));
      await undoIn(editor);
      assert.strictEqual(editor.document.getText(), '\n');
    });

    test('the extension draws its random values from crypto', () => {
      assert.strictEqual(defaultGenDependencies.random, cryptoRandom);
    });
  });

  suite('limits (△): over a limit warns and changes nothing', () => {
    const warnsOnly = async (id: string, text: string, answers: string[], message: string, ranges?: [number, number][]) => {
      const { dependencies, warnings, errors } = recorder(answers);
      const editor = await open(text, ranges);
      const logged = await capturingErrors(() => run(id, dependencies)(editor));
      assert.strictEqual(editor.document.getText(), text, id);
      assert.deepStrictEqual([warnings, errors, logged], [[`${GEN_NOT_CHANGED}${message}`], [], []], id);
    };

    test('brace expansion: nesting, range terms, strings per line and per selection', async () => {
      await warnsOnly('DATEX-016', `${'{x,'.repeat(11)}y${'}'.repeat(11)}`, [], 'line 1: the braces are nested more than 10 deep');
      await warnsOnly('DATEX-016', 'a\n{1..10001}', [], 'line 2: a range has more than 10,000 terms');
      await warnsOnly('DATEX-016', '{1..100}{1..101}', [], 'line 1: the line expands to more than 10,000 strings');
      await warnsOnly('DATEX-016', Array.from({ length: 11 }, () => '{1..100}{1..100}').join('\n'), [], 'the selection expands to more than 100,000 strings');
      await warnsOnly('DATEX-016', 'ok{1,2}\n{1..10001}', [], 'selection 2 of 2: line 1: a range has more than 10,000 terms', [[0, 7], [8, 18]]);
    });

    test('multiplication table, Fibonacci and primes read from the selection', async () => {
      await warnsOnly('DATEX-017', '101', [], 'the numbers of rows and columns must be at most 100');
      await warnsOnly('DATEX-017', '3x101', [], 'the numbers of rows and columns must be at most 100');
      await warnsOnly('DATEX-018', '1001', [], 'the number of terms must be at most 1,000');
      await warnsOnly('DATEX-019', '1000001', [], 'N must be at most 1,000,000');
    });

    test('the values typed into the input boxes (validateInput and the check after it)', async () => {
      const cases: [string, number, string[], string, string][] = [
        ['DATEX-017', 0, ['101x3'], '', 'The numbers of rows and columns must be at most 100.'],
        ['DATEX-018', 0, ['1001'], '', 'Enter an integer from 1 to 1,000.'],
        ['DATEX-019', 0, ['1000001'], '', 'Enter an integer from 2 to 1,000,000.'],
        ['DATEX-020', 1, ['30', '10001'], '09:00', 'Enter an integer from 1 to 10,000.'],
        ['DATEX-020', 0, ['1441'], '09:00', 'Enter an integer from 1 to 1,440.'],
        ['DATEX-022', 0, ['21'], '', 'Enter an integer from 3 to 20.'],
        ['DATEX-022', 0, ['2'], '', 'Enter an integer from 3 to 20.'],
        ['DATEX-023', 1, ['ABC', '10001'], '', 'Enter an integer from 1 to 10,000.'],
      ];
      for (const [id, at, answers, text, message] of cases) {
        const { dependencies, warnings, errors, prompts } = recorder(answers);
        const editor = await open(text);
        await run(id, dependencies)(editor);
        assert.strictEqual(editor.document.getText(), text, id);
        assert.deepStrictEqual([warnings, errors], [[`${GEN_NOT_CHANGED}${message}`], []], `${id} ${answers.join(' ')}`);
        assert.strictEqual(prompts.length, at + 1, id);
        assert.strictEqual(prompts[at].validateInput!(answers[at]), message, id);
      }
    });

    test('the output limit is shared by all targets', async function () {
      this.timeout(60_000);
      // The primes up to 1,000,000 take 538,467 characters: 20 cursors exceed 10,000,000.
      const text = Array.from({ length: 20 }, () => '1000000').join('\n');
      const { dependencies, warnings, errors } = recorder();
      const editor = await open(text, Array.from({ length: 20 }, (_, i): [number, number] => [i * 8, i * 8 + 7]));
      await run('DATEX-019', dependencies)(editor);
      assert.strictEqual(editor.document.getText(), text);
      assert.deepStrictEqual([warnings, errors],
        [[`${GEN_NOT_CHANGED}the result would be longer than 10,000,000 characters. Use fewer cursors or a smaller amount.`], []]);
    });
  });

  suite('GenLimitError', () => {
    test('is a GenInputError (so it is expected, never logged, and a sentence in an input box)', () => {
      const error = new GenLimitError('too many');
      assert.ok(error instanceof GenInputError);
      assert.strictEqual(error.name, 'GenLimitError');
      const rule = entryOf('DATEX-017').emptyPrompts![0].rule;
      assert.doesNotThrow(() => findGenPromptProblem('101x3', rule));
      assert.strictEqual(findGenPromptProblem('101x3', rule), 'The numbers of rows and columns must be at most 100.');
      assert.strictEqual(findGenPromptProblem('0', rule), 'The numbers of rows and columns must be 1 or more.');
    });

    test('an input error is still an error message (the new warning does not change it)', async () => {
      const own = recorder();
      await run('DATEX-018', own.dependencies)(await open('abc'));
      assert.deepStrictEqual([own.warnings, own.errors], [[], [`${GEN_NOT_CHANGED}"abc" is not a whole number: enter the number of terms from 1 to 1,000`]]);
      const existing = recorder();
      await genCommandHandlerInternal(existing.dependencies)('random.dice')(await open('0d6'));
      assert.deepStrictEqual(existing.warnings, []);
      assert.strictEqual(existing.errors.length, 1);
      assert.ok(existing.errors[0].startsWith(GEN_NOT_CHANGED), existing.errors[0]);
    });

    test('an unexpected failure shows a fixed message and logs only the error name and stack', async () => {
      const random: GenRandom = {
        ...fakeRandom(),
        below: () => {
          throw new TypeError('secret');
        },
      };
      const { dependencies, warnings, errors } = recorder(['4', '-'], random);
      const editor = await open('');
      const logged = await capturingErrors(() => run('DATEX-022', dependencies)(editor));
      assert.deepStrictEqual([warnings, errors], [[], [`${GEN_NOT_CHANGED}the text could not be generated`]]);
      assert.ok(logged.every((message) => !message.includes('secret')), logged.join('\n'));
      assert.strictEqual(editor.document.getText(), '');
    });
  });

  suite('DATEX-021 cartesian product (MSEL handler with its own table)', () => {
    test('one selection warns before any input box', async () => {
      const { dependencies, warnings, boxes } = mselRecorder(['']);
      const editor = await open('a\nb');
      await runCartesian(dependencies)(editor);
      assert.deepStrictEqual(warnings, [MSEL_NEED_TWO]);
      assert.strictEqual(boxes.length, 0);
      assert.strictEqual(editor.document.getText(), 'a\nb');
    });

    test('the showcase example: the first selection gets the result, the others are deleted, in one edit', async () => {
      const example = DATE2_EXAMPLES['DATEX-021'];
      const parts = example.input.split(SELECTIONS_SEPARATOR);
      const { dependencies, warnings, errors, boxes } = mselRecorder(example.inputs);
      const editor = await openParts(parts);
      await runCartesian(dependencies)(editor);
      assert.deepStrictEqual([warnings, errors], [[], []]);
      assert.strictEqual(editor.document.getText(), `${example.expected}|`);
      assert.strictEqual(editor.selections.length, 1);
      assert.strictEqual(editor.document.getText(editor.selection), example.expected);
      assert.strictEqual(boxes.length, 1);
      assert.strictEqual(boxes[0].value, '');
      assert.strictEqual(boxes[0].validateInput!(''), undefined);
      assert.ok(boxes[0].validateInput!('a\nb') !== undefined);
      await undoIn(editor);
      assert.strictEqual(editor.document.getText(), parts.join('|'));
    });

    test('the delimiter, three selections and blank lines', async () => {
      const { dependencies } = mselRecorder(['-']);
      const editor = await openParts(['x\n\ny', '1', 'p\nq']);
      await runCartesian(dependencies)(editor);
      assert.strictEqual(editor.document.getText(), 'x-1-p\nx-1-q\ny-1-p\ny-1-q||');
    });

    test('cancelling the input box does nothing', async () => {
      const { dependencies, warnings } = mselRecorder([undefined]);
      const editor = await openParts(['a', 'b']);
      await runCartesian(dependencies)(editor);
      assert.strictEqual(editor.document.getText(), 'a|b');
      assert.deepStrictEqual(warnings, []);
    });

    test('△ more than 10,000 combinations warns and changes nothing', async () => {
      const lines = (n: number) => Array.from({ length: n }, (_, i) => String(i)).join('\n');
      const { dependencies, warnings, errors } = mselRecorder(['']);
      const parts = [lines(101), lines(100)];
      const editor = await openParts(parts);
      await runCartesian(dependencies)(editor);
      assert.strictEqual(editor.document.getText(), parts.join('|'));
      assert.deepStrictEqual([warnings, errors],
        [['The text was not changed: the selections make more than 10,000 combinations. Select fewer lines.'], []]);
    });

    test('△ a result over the output limit warns and changes nothing', async () => {
      const lines = Array.from({ length: 100 }, (_, i) => String(i).padStart(600, '0')).join('\n');
      const { dependencies, warnings } = mselRecorder(['']);
      const editor = await openParts([lines, lines]);
      await runCartesian(dependencies)(editor);
      assert.strictEqual(editor.document.getText(), `${lines}|${lines}`);
      assert.deepStrictEqual(warnings, ['The text was not changed: the result would be longer than 10,000,000 characters. Select fewer lines.']);
    });

    test('it is not one of the Multi Cursor submenu commands', () => {
      assert.ok(!ALL_MSEL_COMMAND_ENTRIES.some((entry) => entry.id === CARTESIAN.id || entry.name === CARTESIAN.name));
      assert.deepStrictEqual([CARTESIAN.id, CARTESIAN.name, CARTESIAN.when, CARTESIAN.needsTwo, CARTESIAN.edits],
        ['DATEX-021', 'generate.cartesian-product', 'multi', true, true]);
    });
  });

  suite('registration', () => {
    test('candidate IDs, command IDs, titles and examples match the DATEX commands of the showcase data', () => {
      const data = JSON.parse(readRepoFile('scripts/showcase-data/DATEX.json')).commands as { id: string; candidateId: string; example: { ja: string } }[];
      const titles = new Map<string, string>(JSON.parse(readRepoFile('package.json')).contributes.commands.map((c: { command: string; title: string }) => [c.command, c.title]));
      const rows = data.slice(15);
      const entries: { id: string; name: string; title: string }[] = [...GEN2_COMMAND_ENTRIES.slice(0, 5), CARTESIAN, ...GEN2_COMMAND_ENTRIES.slice(5)];
      assert.deepStrictEqual(rows.map((row) => row.candidateId), entries.map((entry) => entry.id));
      assert.deepStrictEqual(rows.map((row) => row.id), entries.map((entry) => `${PREFIX}${entry.name}`));
      entries.forEach((entry) => assert.strictEqual(titles.get(`${PREFIX}${entry.name}`), entry.title, entry.id));
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

    test('the command IDs are new: none is a GEN or MSEL command', () => {
      const names = new Set([...GEN_COMMAND_ENTRIES, ...ALL_MSEL_COMMAND_ENTRIES].map((entry) => entry.name));
      [...GEN2_COMMAND_ENTRIES, CARTESIAN].forEach((entry) => assert.ok(!names.has(entry.name), entry.name));
    });

    test('extension.ts registers every command exactly once (gen2CommandHandler; the cartesian product with date2MselCommandHandler)', () => {
      const source = readRepoFile('src/extension.ts');
      GEN2_COMMAND_ENTRIES.forEach((entry) => {
        const registration = `registerTextEditorCommand('${PREFIX}${entry.name}', gen2CommandHandler('${entry.name}'))`;
        assert.strictEqual(source.split(registration).length - 1, 1, registration);
        assert.strictEqual(source.split(`'${PREFIX}${entry.name}'`).length - 1, 1, entry.name);
      });
      const registration = `registerTextEditorCommand('${PREFIX}${CARTESIAN.name}', date2MselCommandHandler('${CARTESIAN.name}'))`;
      assert.strictEqual(source.split(registration).length - 1, 1, registration);
      assert.strictEqual(source.split(`'${PREFIX}${CARTESIAN.name}'`).length - 1, 1);
      assert.strictEqual(source.split(`mselCommandHandler('${CARTESIAN.name}')`).length - 1, 0);
    });

    test('package.json, the command palette, the Generate and Random submenus and Show Commands register every command exactly once', () => {
      const contributes = JSON.parse(readRepoFile('package.json')).contributes;
      type MenuItem = { command?: string; submenu?: string; group?: string; when?: string };
      const count = (items: MenuItem[], id: string) => items.filter((item) => item.command === id).length;
      const entries: { name: string; title: string; when?: string }[] = [
        ...GEN2_COMMAND_ENTRIES.map((entry) => ({ ...entry, when: entry.targets === 'lines' ? 'editorHasSelection' : undefined })),
        { ...CARTESIAN, when: 'editorHasMultipleSelections' },
      ];
      entries.forEach((entry) => {
        const id = `${PREFIX}${entry.name}`;
        assert.deepStrictEqual(contributes.commands.filter((c: MenuItem) => c.command === id),
          [{ command: id, title: entry.title, category: 'Selection Manipulator' }], id);
        assert.deepStrictEqual(myCommands.filter((c) => c.command === id), [{ command: id, title: entry.title, canMultiSelection: true }], id);
        // Only the commands that need selected text are hidden from the palette without one.
        assert.deepStrictEqual(contributes.menus.commandPalette.filter((c: MenuItem) => c.command === id),
          entry.when === undefined ? [] : [{ when: entry.when, command: id }], id);
        const submenu = entry.name.startsWith('random.') ? `${PREFIX}random.submenu` : `${PREFIX}generate.submenu`;
        Object.entries(contributes.menus).filter(([name]) => name !== 'commandPalette').forEach(([name, items]) =>
          assert.strictEqual(count(items as MenuItem[], id), name === submenu ? 1 : 0, `${name}: ${id}`));
      });
      const generate: MenuItem[] = contributes.menus[`${PREFIX}generate.submenu`];
      const random: MenuItem[] = contributes.menus[`${PREFIX}random.submenu`];
      assert.deepStrictEqual([generate.length, random.length], [17, 24], '11 + 6, 21 + 3');
      assert.deepStrictEqual(generate.slice(-6).map((item) => item.command),
        ['brace-expansion', 'multiplication-table', 'fibonacci', 'primes', 'time-sequence', 'cartesian-product'].map((name) => `${PREFIX}generate.${name}`));
      assert.deepStrictEqual(random.slice(-3).map((item) => item.command),
        ['passphrase', 'string-custom-charset', 'shuffle-words'].map((name) => `${PREFIX}random.${name}`));
      [...generate, ...random].forEach((item) => assert.ok(/^selection-manipulator@\d+$/.test(item.group ?? ''), item.command));
      generate.forEach((item, i) => assert.strictEqual(item.group, `selection-manipulator@${i}`, item.command));
      random.forEach((item, i) => assert.strictEqual(item.group, `selection-manipulator@${i}`, item.command));
    });

    test('no dependency was added', () => {
      const packageJson = JSON.parse(readRepoFile('package.json'));
      assert.deepStrictEqual(Object.keys(packageJson.dependencies).sort(), ['change-case', 'diff', 'js-yaml', 'xml-formatter']);
    });

    test('the new modules use no code evaluation, processes, files, network, webviews, dynamic regular expressions or Math.random', () => {
      const forbidden = [
        /\beval\s*\(/, /new\s+Function\b/, /\bFunction\s*\(/, /child_process/, /from\s+'(?:node:)?fs'/, /require\s*\(/, /\bimport\s*\(/,
        /from\s+'(?:node:)?(?:https?|net|dns|tls|dgram|vm|worker_threads|crypto)'/,
        /\bfetch\s*\(/, /XMLHttpRequest/, /createWebviewPanel|Webview/, /new\s+RegExp\s*\(/, /\bRegExp\s*\(/, /Math\.random/,
      ];
      const files = ['date2Convert.ts', 'date2Transforms.ts', 'date2CommandHandler.ts', 'gen2Generate.ts', 'gen2Random.ts', 'gen2Words.ts',
        'gen2Cartesian.ts', 'gen2Transforms.ts', 'gen2CommandHandler.ts', 'date2MselCommandHandler.ts'];
      for (const file of files) {
        // Comments may name what the module does not do: only code is checked. Random values come from genCommon.ts (crypto) only.
        const source = readRepoFile(`src/handler/${file}`).replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
        for (const pattern of forbidden) {
          assert.doesNotMatch(source, pattern, `${file}: ${pattern}`);
        }
      }
    });
  });
});
