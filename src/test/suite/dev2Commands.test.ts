import * as assert from 'assert';
import * as fs from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';
import { dev2CommandHandlerInternal } from '../../handler/dev2CommandHandler';
import { DEV2_COMMAND_ENTRIES } from '../../handler/dev2Transforms';
import { DEV_NOTHING_SELECTED, DevDependencies } from '../../handler/devCommandHandler';
import { DevCommandEntry } from '../../handler/devTransforms';
import { myCommands } from '../../handler/showCommandsHandler';
import { DEV2_EXAMPLES, expandDev2 } from './dev2Examples';
import { createTextEditor } from './testUtils';
import { candidateRows } from './showcaseData';

const PREFIX = 'selection-manipulator.';
const NOT_SHOWN = 'No result was shown: ';

/** Records what the handlers show and the results that would open in a new editor. */
const recorder = () => {
  const warnings: string[] = [];
  const errors: string[] = [];
  const opened: string[] = [];
  let picks = 0;
  const dependencies: DevDependencies = {
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
      return Promise.resolve(undefined);
    },
    showQuickPick: () => {
      picks++;
      return Promise.resolve(undefined);
    },
  };
  return { dependencies, warnings, errors, opened, picks: () => picks };
};

const entryOf = (id: string): DevCommandEntry => {
  const found = DEV2_COMMAND_ENTRIES.find((entry) => entry.id === id);
  assert.ok(found, id);
  return found;
};

const run = (id: string, dependencies: DevDependencies) => dev2CommandHandlerInternal(dependencies)(entryOf(id).name);

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

suite('Extended Developer Commands (DEVX-001..023) Test Suite', () => {

  suite('each command (showcase example)', () => {
    DEV2_COMMAND_ENTRIES.forEach((entry) => {
      const example = DEV2_EXAMPLES[entry.id];

      test(`${entry.id} ${entry.name}: ${JSON.stringify(example.input)}`, async () => {
        const { dependencies, warnings, errors, opened, picks } = recorder();
        const editor = await open(example.input);
        await run(entry.id, dependencies)(editor);
        assert.strictEqual(editor.document.getText(), example.input, 'the document is never changed');
        assert.deepStrictEqual([opened, warnings, errors, picks()], [[example.expected], [], [], 0]);
      });
    });
  });

  suite('selections', () => {
    test('several selections: converted in document order and joined with the EOL of the document', async () => {
      const editor = await createTextEditor('{"b":2}\r\n{"a":1}');
      assert.strictEqual(editor.document.eol, vscode.EndOfLine.CRLF);
      editor.selections = [new vscode.Selection(1, 0, 1, 7), new vscode.Selection(0, 0, 0, 7)];
      const { dependencies, opened } = recorder();
      await run('DEVX-005', dependencies)(editor);
      assert.deepStrictEqual(opened, ['struct Root: Codable {\r\n    let b: Int\r\n}\r\nstruct Root: Codable {\r\n    let a: Int\r\n}']);
    });

    test('empty selections are skipped; only cursors warn and open nothing', async () => {
      for (const entry of DEV2_COMMAND_ENTRIES) {
        const { dependencies, warnings, errors, opened } = recorder();
        await run(entry.id, dependencies)(await open('abc', [[1, 1]]));
        assert.deepStrictEqual([warnings, errors, opened], [[DEV_NOTHING_SELECTED], [], []], entry.id);
      }
    });

    test('blank selections are converted only by the literal commands', async () => {
      for (const entry of DEV2_COMMAND_ENTRIES) {
        const { dependencies, warnings, opened } = recorder();
        await run(entry.id, dependencies)(await open('  '));
        if (entry.acceptsBlank) {
          assert.strictEqual(opened.length, 1, entry.id);
        } else {
          assert.deepStrictEqual([warnings, opened], [[DEV_NOTHING_SELECTED], []], entry.id);
        }
      }
    });

    test('the here-document keeps LF line breaks in a CRLF document', async () => {
      const editor = await createTextEditor('a\r\nb');
      editor.selection = new vscode.Selection(0, 0, 1, 1);
      const { dependencies, opened } = recorder();
      await run('DEVX-016', dependencies)(editor);
      assert.deepStrictEqual(opened, ['cat <<\'EOF\'\na\nb\nEOF']);
    });
  });

  suite('limits and failures', () => {
    test('invalid input: nothing is opened, the reason and the selection are told', async () => {
      const { dependencies, errors, opened } = recorder();
      await run('DEVX-017', dependencies)(await open('404 306', [[0, 3], [4, 7]]));
      assert.deepStrictEqual(opened, []);
      assert.deepStrictEqual(errors, [`${NOT_SHOWN}selection 2 of 2: "306" is not an HTTP status code with a registered reason phrase (e.g. 404)`]);
    });

    test('a Rust raw string that would need more than 255 # is refused', async () => {
      const { dependencies, errors, opened } = recorder();
      await run('DEVX-015', dependencies)(await open(`"${'#'.repeat(255)}`));
      assert.deepStrictEqual(opened, []);
      assert.deepStrictEqual(errors, [`${NOT_SHOWN}the text has a " followed by 255 #, so the raw string would need more than 255 #`]);
    });

    test('the output limit counts all selections together', async () => {
      // Each verbatim string of 900,000 quotes is 1,800,003 characters: one fits, six together do not.
      const half = '"'.repeat(900_000);
      const one = recorder();
      await run('DEVX-014', one.dependencies)(await open(half));
      assert.strictEqual(one.opened[0]?.length, 1_800_003);
      const editor = await open(`${half}\n${half}\n${half}\n${half}\n${half}\n${half}`,
        [0, 1, 2, 3, 4, 5].map((i) => [i * (half.length + 1), i * (half.length + 1) + half.length] as [number, number]));
      const { dependencies, warnings, opened } = recorder();
      await run('DEVX-014', dependencies)(editor);
      assert.deepStrictEqual(opened, []);
      assert.deepStrictEqual(warnings, [`${NOT_SHOWN}the result would be longer than 10,000,000 characters. Select less text.`]);
    });

    test('an unexpected failure shows a fixed message and never the selected text', async () => {
      const { dependencies, errors } = recorder();
      dependencies.openResult = () => {
        throw new TypeError('secret selected text');
      };
      await run('DEVX-004', dependencies)(await open('{"secret":1}'));
      assert.deepStrictEqual(errors, [`${NOT_SHOWN}the text could not be processed`]);
    });
  });

  suite('registration', () => {
    test('candidate IDs, command IDs, titles and examples match the DEVX commands of the showcase data, in its order', () => {
      const rows = candidateRows('DEVX');
      assert.strictEqual(rows.length, 23);
      const order = rows.map(([id]) => id);
      assert.deepStrictEqual(DEV2_COMMAND_ENTRIES.map((entry) => entry.id), order);
      assert.deepStrictEqual(Object.keys(DEV2_EXAMPLES).sort(), [...order].sort(), 'an example for every command');
      for (const [id, kind, command, title, example] of rows) {
        const entry = entryOf(id);
        assert.strictEqual(kind, '基本', id);
        assert.ok(entry.name.startsWith('programmatic.'), id);
        assert.strictEqual(entry.output, 'new-tab', id);
        assert.strictEqual(command, `${PREFIX}${entry.name}`, id);
        assert.strictEqual(title, entry.title, id);
        const sides = example.split(' → ');
        assert.strictEqual(sides.length, 2, `${id}: ${example}`);
        assert.strictEqual(expandDev2(codeSpan(sides[0])), DEV2_EXAMPLES[id].input, id);
        assert.strictEqual(expandDev2(codeSpan(sides[1])), DEV2_EXAMPLES[id].expected, id);
      }
    });

    test('extension.ts registers every command with dev2CommandHandler exactly once', () => {
      const source = readRepoFile('src/extension.ts');
      assert.strictEqual(source.split('// Developer extended (DEVX-001..023, group DEV2)').length - 1, 1);
      DEV2_COMMAND_ENTRIES.forEach((entry) => {
        const registration = `registerTextEditorCommand('${PREFIX}${entry.name}', dev2CommandHandler('${entry.name}'))`;
        assert.strictEqual(source.split(registration).length - 1, 1, registration);
        assert.strictEqual(source.split(`'${PREFIX}${entry.name}'`).length - 1, 1, entry.name);
      });
    });

    test('package.json, the command palette, the Programmatic submenu and Show Commands register every command exactly once', () => {
      const contributes = JSON.parse(readRepoFile('package.json')).contributes;
      type MenuItem = { command?: string; submenu?: string; group?: string; when?: string };
      const count = (items: MenuItem[], id: string) => items.filter((item) => item.command === id).length;
      const submenu = 'selection-manipulator.programmatic.submenu';
      DEV2_COMMAND_ENTRIES.forEach((entry) => {
        const id = `${PREFIX}${entry.name}`;
        assert.deepStrictEqual(contributes.commands.filter((c: MenuItem) => c.command === id),
          [{ command: id, title: entry.title, category: 'Selection Manipulator' }], id);
        assert.deepStrictEqual(myCommands.filter((c) => c.command === id), [{ command: id, title: entry.title, canMultiSelection: true }], id);
        assert.deepStrictEqual(contributes.menus.commandPalette.filter((c: MenuItem) => c.command === id),
          [{ when: 'editorHasSelection', command: id }], id);
        Object.entries(contributes.menus).filter(([name]) => name !== 'commandPalette').forEach(([name, items]) =>
          assert.strictEqual(count(items as MenuItem[], id), name === submenu ? 1 : 0, `${name}: ${id}`));
      });
      const items: MenuItem[] = contributes.menus[submenu];
      const added = DEV2_COMMAND_ENTRIES.map((entry) => `${PREFIX}${entry.name}`);
      assert.deepStrictEqual(items.slice(-added.length).map((item) => item.command), added, 'at the end, in order');
      items.forEach((item, i) => assert.strictEqual(item.group, `selection-manipulator@${i}`, item.command));
      assert.strictEqual(items.length, 73, '50 before DEV2 + 23');
      const ids = contributes.commands.map((c: { command: string }) => c.command);
      assert.strictEqual(ids.length, 993, '923 before DEV2 + 23, then 23 of NUM2 and 24 of DATE2');
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
        /\bfetch\s*\(/, /XMLHttpRequest/, /createWebviewPanel|Webview/, /new\s+RegExp\s*\(/, /\bRegExp\s*\(/,
      ];
      for (const file of [
        'src/handler/dev2JsonTypes.ts', 'src/handler/dev2Color.ts', 'src/handler/dev2Css.ts', 'src/handler/dev2Code.ts',
        'src/handler/dev2Lookup.ts', 'src/handler/dev2Network.ts', 'src/handler/dev2Transforms.ts', 'src/handler/dev2CommandHandler.ts',
      ]) {
        // Comments may name what the module does not do (e.g. "no eval / new Function"): only code is checked.
        const source = readRepoFile(file).replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
        for (const pattern of forbidden) {
          assert.doesNotMatch(source, pattern, `${file}: ${pattern}`);
        }
        assert.doesNotMatch(source, /from\s+'(?:node:)?http'|STATUS_CODES/, `${file}: the HTTP table is the module's own`);
      }
    });
  });
});
