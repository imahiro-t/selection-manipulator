import * as assert from 'assert';
import * as fs from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';
import { DATA2_NOT_CHANGED, data2CommandHandlerInternal, Data2Dependencies } from '../../handler/data2CommandHandler';
import { DATA2_COMMAND_ENTRIES, Data2CommandEntry, OMIT_SCOPES } from '../../handler/data2Transforms';
import { DATA_MAX_PATH_LENGTH, findPathProblem } from '../../handler/dataCommon';
import { myCommands } from '../../handler/showCommandsHandler';
import { DATA2_EXAMPLES, expandData2, expectedResult } from './data2Examples';
import { createTextEditor } from './testUtils';
import { candidateRows } from './showcaseData';

const PREFIX = 'selection-manipulator.';

/**
 * Records what the handlers show; the input boxes and QuickPicks answer with `answers` in turn
 * (`undefined` = cancelled) and the results that would open in a new editor are collected.
 */
const recorder = (answers: (string | undefined)[] = []) => {
  const infos: string[] = [];
  const warnings: string[] = [];
  const errors: string[] = [];
  const boxes: vscode.InputBoxOptions[] = [];
  const picks: string[][] = [];
  const opened: string[] = [];
  const logged: string[] = [];
  const queue = [...answers];
  const dependencies: Data2Dependencies = {
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
    showQuickPick: (items) => {
      picks.push(items);
      return Promise.resolve(queue.shift());
    },
    openResult: (content) => {
      opened.push(content);
      return Promise.resolve(undefined);
    },
    logError: (message) => {
      logged.push(message);
    },
  };
  const messages = () => [...infos, ...warnings, ...errors];
  return { dependencies, infos, warnings, errors, boxes, picks, opened, logged, messages };
};

const entryOf = (id: string): Data2CommandEntry => {
  const found = DATA2_COMMAND_ENTRIES.find((entry) => entry.id === id);
  assert.ok(found, id);
  return found;
};

const run = (id: string, dependencies: Data2Dependencies) => data2CommandHandlerInternal(dependencies)(entryOf(id).name);

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

/** The menu of a command: the five CSV commands go to CSV / TSV, the others to Data Format. */
const submenuOf = (entry: Data2CommandEntry): string =>
  entry.name.startsWith('csv.') ? 'selection-manipulator.table.submenu' : 'selection-manipulator.data.submenu';

suite('Extended Data Format Commands (DATAX-001..024) Test Suite', () => {

  suite('each command (showcase example)', () => {
    DATA2_COMMAND_ENTRIES.forEach((entry) => {
      const example = DATA2_EXAMPLES[entry.id];

      test(`${entry.id} ${entry.name}: ${JSON.stringify(example.input)}`, async () => {
        const { dependencies, infos, warnings, errors, boxes, picks, opened } = recorder(example.answers ?? []);
        const editor = await open(example.input);
        await run(entry.id, dependencies)(editor);
        assert.strictEqual(boxes.length + picks.length, entry.prompts.length);
        assert.strictEqual(editor.document.getText(), example.input, 'the document is never changed');
        assert.deepStrictEqual(warnings, []);
        if (entry.output === 'notify') {
          assert.deepStrictEqual([opened, infos, errors], [[], [], [example.expected]], 'an invalid example is shown as an error');
        } else {
          assert.deepStrictEqual([opened, infos, errors], [[expectedResult(example)], [], []]);
        }
      });
    });
  });

  suite('selections', () => {
    test('several selections: converted in document order and joined with the EOL of the document', async () => {
      const editor = await createTextEditor('[{"a":1,"b":2}]\r\n{"b":3,"a":4}');
      assert.strictEqual(editor.document.eol, vscode.EndOfLine.CRLF);
      editor.selections = [new vscode.Selection(1, 0, 1, 13), new vscode.Selection(0, 0, 0, 15)];
      const { dependencies, boxes, opened } = recorder(['a']);
      await run('DATAX-003', dependencies)(editor);
      assert.strictEqual(boxes.length, 1, 'asked once for all selections');
      assert.deepStrictEqual(opened, ['[{"a":1}]\r\n{"a":4}']);
    });

    test('multi-line results follow the EOL of the document', async () => {
      const text = 'a: 1\r\n---\r\na: 2';
      const { dependencies, opened } = recorder();
      await run('DATAX-014', dependencies)(await open(text));
      assert.deepStrictEqual(opened, [JSON.stringify([{ a: 1 }, { a: 2 }], null, 2).replace(/\n/g, '\r\n')]);
    });

    test('empty selections are ignored; only cursors do nothing and ask nothing', async () => {
      for (const entry of DATA2_COMMAND_ENTRIES) {
        const { dependencies, boxes, picks, opened, messages } = recorder(['1', '1', '1']);
        const editor = await open('abc', [[1, 1]]);
        await run(entry.id, dependencies)(editor);
        assert.deepStrictEqual([boxes.length, picks.length, opened, messages()], [0, 0, [], []], entry.id);
      }
    });

    test('validation: one notification for several selections; an invalid one makes it an error; nothing is edited', async () => {
      const text = 'a: 1|b: [1|c: 2';
      const editor = await open(text, [[11, 15], [0, 4], [5, 10]]);
      const { dependencies, infos, errors, boxes, opened } = recorder();
      await run('DATAX-013', dependencies)(editor);
      assert.deepStrictEqual(infos, []);
      assert.strictEqual(errors.length, 1);
      assert.match(errors[0], /^Selection 1: Valid YAML; Selection 2: Invalid YAML: line \d+, column \d+: .+; Selection 3: Valid YAML$/);
      assert.deepStrictEqual([boxes.length, opened, editor.document.getText()], [0, [], text]);

      const xml = await open('<a/>|<b></b>', [[0, 4], [5, 12]]);
      const second = recorder();
      await run('DATAX-016', second.dependencies)(xml);
      assert.deepStrictEqual([second.infos, second.errors], [['Selection 1: Well-formed XML; Selection 2: Well-formed XML'], []]);
    });
  });

  suite('limits and failures', () => {
    test('invalid input: nothing is opened, the reason and the selection are told', async () => {
      const editor = await open('[1] {"a":1}', [[0, 3], [4, 11]]);
      const { dependencies, errors, opened } = recorder(['2']);
      await run('DATAX-008', dependencies)(editor);
      assert.deepStrictEqual(opened, []);
      assert.deepStrictEqual(errors, [`${DATA2_NOT_CHANGED}selection 2 of 2: Split JSON Array into Chunks needs a JSON array at the top level`]);
    });

    test('a count limit is a warning (XML paths, YAML documents, added columns)', async () => {
      const { dependencies, warnings, errors, opened } = recorder();
      await run('DATAX-017', dependencies)(await open(`<r>${'<a/>'.repeat(100_001)}</r>`));
      assert.deepStrictEqual([opened, errors], [[], []]);
      assert.deepStrictEqual(warnings, [`${DATA2_NOT_CHANGED}the result would have more than 100,000 lines (element paths). Select less text.`]);
    });

    test('nested YAML aliases are refused by Multi-document YAML to JSON with a warning, before the JSON is built', async () => {
      let text = 'a: &a ["x","x","x","x","x","x","x","x","x","x"]\n';
      let previous = 'a';
      for (let i = 0; i < 9; i++) {
        const name = String.fromCharCode(98 + i);
        text += `${name}: &${name} [${Array(10).fill(`*${previous}`).join(',')}]\n`;
        previous = name;
      }
      const { dependencies, warnings, opened } = recorder();
      const start = Date.now();
      await run('DATAX-014', dependencies)(await open(text));
      assert.ok(Date.now() - start < 3_000);
      assert.deepStrictEqual(opened, []);
      assert.deepStrictEqual(warnings, [`${DATA2_NOT_CHANGED}the result would be longer than 10,000,000 characters. Select less text.`]);
    });

    test('the output limit counts all selections together', async () => {
      // A multi-line array is written indented: each result (about 7,000,000 characters) fits on its
      // own, both together do not.
      const text = `[\n${'1,'.repeat(999_999)}1]`;
      const editor = await createTextEditor(`${text}\n${text}`);
      editor.selections = [new vscode.Selection(0, 0, 1, text.length - 2), new vscode.Selection(2, 0, 3, text.length - 2)];
      const one = recorder(['1000000']);
      await run('DATAX-008', one.dependencies)(await open(text));
      assert.strictEqual(one.opened.length, 1);
      assert.ok(one.opened[0].length > 5_000_000 && one.opened[0].length < 10_000_000, String(one.opened[0].length));
      const { dependencies, warnings, opened } = recorder(['1000000']);
      await run('DATAX-008', dependencies)(editor);
      assert.deepStrictEqual(opened, []);
      assert.strictEqual(warnings.length, 1);
    });

    test('an unexpected failure shows a fixed message and logs no selected text', async () => {
      const { dependencies, errors, logged } = recorder();
      dependencies.openResult = () => {
        throw new TypeError('secret selected text');
      };
      await run('DATAX-010', dependencies)(await open('{"secret":1}'));
      assert.deepStrictEqual(errors, [`${DATA2_NOT_CHANGED}the text could not be converted`]);
      assert.ok(logged.some((message) => message.includes('(TypeError)')), logged.join('\n'));
      assert.ok(logged.every((message) => !message.includes('secret')), logged.join('\n'));
    });
  });

  suite('prompts', () => {
    test('cancelling any prompt does nothing; the QuickPick offers the two scopes', async () => {
      for (const answers of [[undefined], ['pw', undefined]]) {
        const { dependencies, picks, opened, messages } = recorder(answers);
        await run('DATAX-004', dependencies)(await open('{"pw":1}'));
        assert.deepStrictEqual([opened, messages()], [[], []], JSON.stringify(answers));
        if (answers.length === 2) {
          assert.deepStrictEqual(picks, [[...OMIT_SCOPES]]);
        }
      }
      const second = recorder(['old', undefined]);
      await run('DATAX-005', second.dependencies)(await open('{"old":1}'));
      assert.deepStrictEqual([second.boxes.length, second.opened, second.messages()], [2, [], []]);
    });

    test('a refused value that gets past the box is refused again with its fixed message (never the value)', async () => {
      const { dependencies, warnings, opened } = recorder(['secret-without-equals']);
      await run('DATAX-002', dependencies)(await open('[{"a":1}]'));
      assert.deepStrictEqual(opened, []);
      assert.deepStrictEqual(warnings, [`${DATA2_NOT_CHANGED}Enter key=value (e.g. status=active or user.id=1).`]);
      const picked = recorder(['a', 'Everything']);
      await run('DATAX-004', picked.dependencies)(await open('{"a":1}'));
      assert.deepStrictEqual(picked.warnings, [`${DATA2_NOT_CHANGED}choose one of Top level only, Recursive.`]);
    });

    test('set-path: the path box validates with findPathProblem (length limit included), checked again before running', async () => {
      const { dependencies, boxes, warnings, opened } = recorder([`a${'.b'.repeat(DATA_MAX_PATH_LENGTH / 2)}`, '1']);
      await run('DATAX-011', dependencies)(await open('{}'));
      assert.strictEqual(boxes[0].validateInput, findPathProblem);
      assert.strictEqual(boxes[0].ignoreFocusOut, true);
      assert.strictEqual(boxes.length, 1, 'the value is not asked after a refused path');
      assert.deepStrictEqual(opened, []);
      assert.deepStrictEqual(warnings, [`${DATA2_NOT_CHANGED}The path is too long (limit: 1,000 characters).`]);
    });

    test('every input box validates what is typed', () => {
      const cases: [string, number, string, string][] = [
        ['DATAX-001', 0, 'a..b', ''], ['DATAX-002', 0, 'x', 'x='], ['DATAX-003', 0, 'a,,b', 'a'], ['DATAX-005', 0, '', 'k'],
        ['DATAX-008', 0, '0', '1'], ['DATAX-009', 0, '', 'id'], ['DATAX-011', 1, 'abc', '"abc"'], ['DATAX-018', 0, '1,1', '2,1'],
        ['DATAX-019', 2, '\t', ''], ['DATAX-020', 1, '', '-'], ['DATAX-021', 0, '', 'name'], ['DATAX-022', 0, '', 'N/A'],
      ];
      for (const [id, index, invalid, valid] of cases) {
        const prompt = entryOf(id).prompts[index];
        assert.ok(prompt.type === 'input', id);
        assert.ok(prompt.validate(invalid), `${id}: ${JSON.stringify(invalid)}`);
        assert.strictEqual(prompt.validate(valid), undefined, `${id}: ${JSON.stringify(valid)}`);
      }
    });
  });

  suite('registration', () => {
    test('candidate IDs, command IDs, titles and examples match the DATAX commands of the showcase data, in its order', () => {
      const rows = candidateRows('DATAX');
      assert.strictEqual(rows.length, 24);
      const order = rows.map(([id]) => id);
      assert.deepStrictEqual(DATA2_COMMAND_ENTRIES.map((entry) => entry.id), order);
      assert.deepStrictEqual(Object.keys(DATA2_EXAMPLES).sort(), [...order].sort(), 'an example for every command');
      for (const [id, kind, command, title, example] of rows) {
        const entry = entryOf(id);
        assert.strictEqual(kind, '基本', id);
        assert.strictEqual(command, `${PREFIX}${entry.name}`, id);
        assert.strictEqual(title, entry.title, id);
        const sides = example.split(' → ');
        assert.strictEqual(sides.length, 2, `${id}: ${example}`);
        const expected = DATA2_EXAMPLES[id];
        const input = codeSpan(sides[0]);
        const noted = /^(.*)（(.*)）$/s.exec(input);
        assert.strictEqual(expandData2(noted ? noted[1] : input), expected.input, id);
        assert.strictEqual(noted ? noted[2] : undefined, expected.note, id);
        const output = expandData2(codeSpan(sides[1]));
        if (entry.output === 'notify') {
          assert.ok(output.endsWith('（通知）'), id);
          assert.ok(expected.expected.startsWith(output.slice(0, -'（通知）'.length)), id);
        } else if (expected.pretty) {
          assert.deepStrictEqual(JSON.parse(output), JSON.parse(expected.expected), id);
          assert.strictEqual(output, expected.expected, id);
        } else {
          assert.strictEqual(output, expected.expected, id);
        }
      }
    });

    test('extension.ts registers every command with data2CommandHandler exactly once', () => {
      const source = readRepoFile('src/extension.ts');
      assert.strictEqual(source.split('// Data formats extended (DATAX-001..024, group DATA2)').length - 1, 1);
      DATA2_COMMAND_ENTRIES.forEach((entry) => {
        const registration = `registerTextEditorCommand('${PREFIX}${entry.name}', data2CommandHandler('${entry.name}'))`;
        assert.strictEqual(source.split(registration).length - 1, 1, registration);
        assert.strictEqual(source.split(`'${PREFIX}${entry.name}'`).length - 1, 1, entry.name);
      });
    });

    test('package.json, the command palette, one submenu each and Show Commands register every command exactly once', () => {
      const contributes = JSON.parse(readRepoFile('package.json')).contributes;
      type MenuItem = { command?: string; submenu?: string; group?: string; when?: string };
      const count = (items: MenuItem[], id: string) => items.filter((item) => item.command === id).length;
      DATA2_COMMAND_ENTRIES.forEach((entry) => {
        const id = `${PREFIX}${entry.name}`;
        assert.deepStrictEqual(contributes.commands.filter((c: MenuItem) => c.command === id),
          [{ command: id, title: entry.title, category: 'Selection Manipulator' }], id);
        assert.deepStrictEqual(myCommands.filter((c) => c.command === id), [{ command: id, title: entry.showTitle, canMultiSelection: true }], id);
        assert.deepStrictEqual(contributes.menus.commandPalette.filter((c: MenuItem) => c.command === id),
          [{ when: 'editorHasSelection', command: id }], id);
        Object.entries(contributes.menus).filter(([name]) => name !== 'commandPalette').forEach(([name, items]) =>
          assert.strictEqual(count(items as MenuItem[], id), name === submenuOf(entry) ? 1 : 0, `${name}: ${id}`));
        assert.strictEqual(entry.showTitle, entry.name.startsWith('csv.') ? `Transform - ${entry.title}` : `Transform - Data Format - ${entry.title}`);
      });
      const sizes: Record<string, number> = {};
      for (const submenu of new Set(DATA2_COMMAND_ENTRIES.map(submenuOf))) {
        const items: MenuItem[] = contributes.menus[submenu];
        const added = DATA2_COMMAND_ENTRIES.filter((entry) => submenuOf(entry) === submenu).map((entry) => `${PREFIX}${entry.name}`);
        sizes[submenu] = added.length;
        assert.deepStrictEqual(items.slice(-added.length).map((item) => item.command), added, `${submenu}: at the end, in order`);
        items.forEach((item, i) => assert.strictEqual(item.group, `selection-manipulator@${i}`, `${submenu}: ${item.command}`));
      }
      assert.deepStrictEqual(sizes, { 'selection-manipulator.data.submenu': 19, 'selection-manipulator.table.submenu': 5 });
      const ids = contributes.commands.map((c: { command: string }) => c.command);
      assert.strictEqual(ids.length, 923, '899 before DATA2 + 24');
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

    test('the new and changed modules use no code evaluation, processes, files, network, webviews or dynamic regular expressions', () => {
      const forbidden = [
        /\beval\s*\(/, /new\s+Function\b/, /child_process/, /from\s+'(?:node:)?fs'/, /require\(\s*'(?:node:)?fs'\s*\)/,
        /from\s+'(?:node:)?(?:https?|net|dns|tls|dgram|vm|worker_threads)'/, /require\(\s*'(?:node:)?(?:https?|net|dns|tls|dgram|vm|worker_threads)'\s*\)/,
        /\bfetch\s*\(/, /XMLHttpRequest/, /createWebviewPanel|Webview/, /new\s+RegExp\s*\(/,
      ];
      for (const file of [
        'src/handler/data2Transforms.ts', 'src/handler/data2Xml.ts', 'src/handler/data2Csv.ts', 'src/handler/data2CommandHandler.ts',
        'src/handler/tomlParser.ts', 'src/handler/dataWriters.ts',
      ]) {
        // Comments may name what the module does not do (e.g. "no eval / new Function"): only code is checked.
        const source = readRepoFile(file).replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
        for (const pattern of forbidden) {
          assert.doesNotMatch(source, pattern, `${file}: ${pattern}`);
        }
      }
      // The XML scanner never names a URL scheme (it resolves nothing).
      assert.doesNotMatch(readRepoFile('src/handler/data2Xml.ts'), /https?:\/\/|file:\/\//);
    });
  });
});
