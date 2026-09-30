import * as assert from 'assert';
import * as fs from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';
import {
  NO_LINES_TO_COPY_MESSAGE,
  NO_LINES_TO_OPEN_MESSAGE,
  SortHandlerDeps,
  sortLineExtendedHandlerInternal,
  SortOutput,
  sortSelectionExtendedHandlerInternal,
} from '../../handler/sortExtendedHandler';
import { runRegexInWorker } from '../../handler/lineRegex';
import { myCommands } from '../../handler/showCommandsHandler';
import { SortLineCommand, SortSelectionCommand } from '../../handler/sortTransforms';
import { createTextEditor } from './testUtils';
import { candidateRows } from './showcaseData';

type Kind = 'sort-line' | 'sort';

interface CommandCase {
  id: string;
  kind: Kind;
  key: SortLineCommand | SortSelectionCommand;
  descending: boolean;
  output: SortOutput;
  /** Answers given to the input boxes, in order (input commands only). */
  answers?: string[];
  input: string;
  expected: string;
  /** Two blocks, each selected by its own cursor (separated by a `---` line in the document). */
  multiInput: [string, string];
  multiExpected: string;
}

const line = (
  id: string,
  key: SortLineCommand,
  descending: boolean,
  output: SortOutput,
  input: string,
  expected: string,
  multiInput: [string, string],
  multiExpected: string,
  answers?: string[]
): CommandCase => ({ id, kind: 'sort-line', key, descending, output, input, expected, multiInput, multiExpected, answers });

const selection = (
  id: string,
  key: SortSelectionCommand,
  descending: boolean,
  output: SortOutput,
  multiInput: [string, string],
  multiExpected: string
): CommandCase => ({
  id, kind: 'sort', key, descending, output,
  // The ROADMAP example `[v10] [v2]` is two selections; the single-selection case uses its lines.
  input: multiInput.join('\n'), expected: multiExpected, multiInput, multiExpected,
});

const NEW = 'new-document';
const CLIP = 'clipboard';

const cases: CommandCase[] = [
  line('SORT-001', 'natural', false, NEW, 'file10\nfile2', 'file2\nfile10', ['f10\nf3', 'f2'], 'f2\nf3\nf10'),
  line('SORT-002', 'natural', true, NEW, 'file2\nfile10', 'file10\nfile2', ['f2\nf10', 'f3'], 'f10\nf3\nf2'),
  line('SORT-003', 'ignore-case', false, NEW, 'b\nA\na', 'A\na\nb', ['b\nA', 'a'], 'A\na\nb'),
  line('SORT-004', 'ignore-case', true, NEW, 'A\nb\na', 'b\nA\na', ['A\nb', 'a'], 'b\nA\na'),
  line('SORT-005', 'locale', false, NEW, 'f\né\ne', 'e\né\nf', ['f\né', 'e'], 'e\né\nf', ['en']),
  line('SORT-006', 'locale', true, NEW, 'e\né\nf', 'f\né\ne', ['e\né', 'f'], 'f\né\ne', ['en']),
  line('SORT-007', 'japanese', false, NEW, 'カ\nあ\nき', 'あ\nカ\nき', ['カ\nき', 'あ'], 'あ\nカ\nき'),
  line('SORT-008', 'column', false, NEW, 'b,2\na,1', 'a,1\nb,2', ['b,2\nc,3', 'a,1'], 'a,1\nb,2\nc,3', [',', '2']),
  line('SORT-009', 'column', true, NEW, 'a,1\nb,2', 'b,2\na,1', ['a,1\nc,3', 'b,2'], 'c,3\nb,2\na,1', [',', '2']),
  line('SORT-010', 'regex-key', false, NEW, 'id=10\nid=9', 'id=9\nid=10', ['id=10\nid=9', 'id=2'], 'id=2\nid=9\nid=10', ['id=(\\d+)']),
  line('SORT-011', 'date', false, NEW, '2026-03-01 b\n2025-12-31 a', '2025-12-31 a\n2026-03-01 b', ['2026-03-01 b', '2025-12-31 a'], '2025-12-31 a\n2026-03-01 b'),
  line('SORT-012', 'date', true, NEW, '2025-12-31 a\n2026-03-01 b', '2026-03-01 b\n2025-12-31 a', ['2025-12-31 a', '2026-03-01 b'], '2026-03-01 b\n2025-12-31 a'),
  line('SORT-013', 'semver', false, NEW, '1.10.0\n1.2.0\n1.2.0-rc.1', '1.2.0-rc.1\n1.2.0\n1.10.0', ['1.10.0\n1.2.0', '1.2.0-rc.1'], '1.2.0-rc.1\n1.2.0\n1.10.0'),
  line('SORT-014', 'ip', false, NEW, '10.0.0.10\n10.0.0.9', '10.0.0.9\n10.0.0.10', ['10.0.0.10', '10.0.0.9'], '10.0.0.9\n10.0.0.10'),
  line('SORT-015', 'word-count', false, NEW, 'a b c\na', 'a\na b c', ['a b c', 'a'], 'a\na b c'),
  line('SORT-016', 'last-word', false, NEW, 'Ann Smith\nBob Adams', 'Bob Adams\nAnn Smith', ['Ann Smith', 'Bob Adams'], 'Bob Adams\nAnn Smith'),
  line('SORT-017', 'suffix', false, NEW, 'a.ts\nb.js\nc.ts', 'b.js\na.ts\nc.ts', ['a.ts\nb.js', 'c.ts'], 'b.js\na.ts\nc.ts'),
  line('SORT-018', 'unique', false, NEW, 'b\na\nb', 'a\nb', ['b\na', 'b'], 'a\nb'),
  line('SORT-019', 'paragraph', false, NEW, 'b\nb2\n\na\na2', 'a\na2\n\nb\nb2', ['b\n\na', 'c'], 'a\nc\n\nb'),
  line('SORT-020', 'indent-block', false, NEW, 'b\n  b1\na\n  a1', 'a\n  a1\nb\n  b1', ['b\n  b1', 'a\n  a1'], 'a\n  a1\nb\n  b1'),
  line('SORT-021', 'hex', false, NEW, '0x1F\n0xA', '0xA\n0x1F', ['0x1F', '0xA'], '0xA\n0x1F'),
  selection('SORT-022', 'natural', false, NEW, ['v10', 'v2'], 'v2\nv10'),
  selection('SORT-023', 'ignore-case', false, NEW, ['b', 'A'], 'A\nb'),
  selection('SORT-024', 'length', false, NEW, ['ccc', 'a'], 'a\nccc'),
  selection('SORT-025', 'length', true, NEW, ['a', 'ccc'], 'ccc\na'),
  line('SORT-026', 'natural', false, CLIP, 'file10\nfile2', 'file2\nfile10', ['f10\nf3', 'f2'], 'f2\nf3\nf10'),
  line('SORT-027', 'ignore-case', false, CLIP, 'b\nA\na', 'A\na\nb', ['b\nA', 'a'], 'A\na\nb'),
  line('SORT-028', 'column', false, CLIP, 'b,2\na,1', 'a,1\nb,2', ['b,2\nc,3', 'a,1'], 'a,1\nb,2\nc,3', [',', '2']),
  line('SORT-029', 'semver', false, CLIP, '1.10.0\n1.2.0\n1.2.0-rc.1', '1.2.0-rc.1\n1.2.0\n1.10.0', ['1.10.0\n1.2.0', '1.2.0-rc.1'], '1.2.0-rc.1\n1.2.0\n1.10.0'),
  selection('SORT-030', 'natural', false, CLIP, ['v10', 'v2'], 'v2\nv10'),
];

const commandId = (c: CommandCase) =>
  `selection-manipulator.${c.kind}.${c.key}.${c.descending ? 'descending' : 'ascending'}${c.output === CLIP ? '.clipboard' : ''}`;

const handlerSource = (c: CommandCase) =>
  `${c.kind === 'sort-line' ? 'sortLineExtendedHandler' : 'sortSelectionExtendedHandler'}('${c.key}', ${c.descending}, '${c.output}')`;

/** Records everything the handler does through its dependencies. */
const recorder = (answers: (string | undefined)[] = [], overrides: Partial<SortHandlerDeps> = {}) => {
  const record = {
    prompts: [] as vscode.InputBoxOptions[],
    infos: [] as string[],
    warnings: [] as string[],
    errors: [] as string[],
    clipboard: [] as string[],
    opened: [] as string[],
  };
  const queue = [...answers];
  const deps: Partial<SortHandlerDeps> = {
    showInputBox: (options) => {
      record.prompts.push(options);
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
    writeClipboard: (text) => {
      record.clipboard.push(text);
      return Promise.resolve();
    },
    openTextDocument: (content) => {
      record.opened.push(content);
      return Promise.resolve();
    },
    defaultLocale: 'en',
    ...overrides,
  };
  return { deps, record };
};

const runnerFor = (c: CommandCase, deps: Partial<SortHandlerDeps>) =>
  c.kind === 'sort-line'
    ? sortLineExtendedHandlerInternal(deps)(c.key as SortLineCommand, c.descending, c.output)
    : sortSelectionExtendedHandlerInternal(deps)(c.key as SortSelectionCommand, c.descending, c.output);

const SEPARATOR = '\n---\n';

const sel = (startLine: number, startCharacter: number, endLine: number, endCharacter: number) =>
  new vscode.Selection(startLine, startCharacter, endLine, endCharacter);

const selectWholeDocument = (editor: vscode.TextEditor) => {
  const document = editor.document;
  editor.selection = new vscode.Selection(new vscode.Position(0, 0), document.lineAt(document.lineCount - 1).range.end);
};

/** Selects the two blocks of a `blockA---blockB` document with one cursor each. */
const selectBlocks = (editor: vscode.TextEditor, blocks: [string, string]) => {
  const document = editor.document;
  const secondStart = blocks[0].length + SEPARATOR.length;
  editor.selections = [
    new vscode.Selection(document.positionAt(0), document.positionAt(blocks[0].length)),
    new vscode.Selection(document.positionAt(secondStart), document.positionAt(secondStart + blocks[1].length)),
  ];
};

/** Reverts and closes the editors opened by a test (see whitespaceCommands.test.ts). */
const closeAllEditors = async () => {
  for (let i = 0; i < 20 && vscode.window.visibleTextEditors.length > 0; i++) {
    await vscode.commands.executeCommand('workbench.action.revertAndCloseActiveEditor');
  }
};

/** What the command produced: the opened document or the clipboard, whichever is used. */
const produced = (c: CommandCase, record: ReturnType<typeof recorder>['record']) =>
  c.output === CLIP ? record.clipboard : record.opened;

const unused = (c: CommandCase, record: ReturnType<typeof recorder>['record']) =>
  c.output === CLIP ? record.opened : record.clipboard;

const assertNothingOutput = (record: ReturnType<typeof recorder>['record']) => {
  assert.deepStrictEqual(record.opened, []);
  assert.deepStrictEqual(record.clipboard, []);
};

const regexKey = cases.find((c) => c.id === 'SORT-010')!;

suite('Sort Commands (SORT-001..030) Test Suite', () => {

  teardown(closeAllEditors);

  test('the test table covers all 30 commands in ROADMAP order', () => {
    assert.strictEqual(cases.length, 30);
    cases.forEach((c, i) => assert.strictEqual(c.id, `SORT-${String(i + 1).padStart(3, '0')}`));
    assert.strictEqual(new Set(cases.map(commandId)).size, 30);
    assert.strictEqual(cases.filter((c) => c.output === CLIP).length, 5);
  });

  cases.forEach((c) => {
    suite(`${c.id} ${commandId(c)}`, () => {
      test('representative case (ROADMAP example); the editor is not changed', async () => {
        const editor = await createTextEditor(c.input);
        selectWholeDocument(editor);
        const { deps, record } = recorder(c.answers);
        await runnerFor(c, deps)(editor);
        assert.deepStrictEqual(produced(c, record), [c.expected]);
        assert.deepStrictEqual(unused(c, record), []);
        assert.strictEqual(record.prompts.length, (c.answers ?? []).length);
        assert.strictEqual(editor.document.getText(), c.input);
        assert.deepStrictEqual([...record.infos, ...record.warnings, ...record.errors], []);
      });

      test('multiple selections are sorted together', async () => {
        const document = c.multiInput.join(SEPARATOR);
        const editor = await createTextEditor(document);
        selectBlocks(editor, c.multiInput);
        const { deps, record } = recorder(c.answers);
        await runnerFor(c, deps)(editor);
        assert.deepStrictEqual(produced(c, record), [c.multiExpected]);
        assert.strictEqual(record.prompts.length, (c.answers ?? []).length, 'asked once for all selections');
        assert.strictEqual(editor.document.getText(), document);
      });

      test('no non-empty selection: nothing is asked or output', async () => {
        const editor = await createTextEditor(c.input);
        editor.selection = sel(0, 0, 0, 0);
        const { deps, record } = recorder(c.answers);
        await runnerFor(c, deps)(editor);
        assert.strictEqual(record.prompts.length, 0);
        assertNothingOutput(record);
      });

      if (c.answers) {
        c.answers.forEach((_answer, i) => {
          test(`cancel at input box ${i + 1}: nothing is output`, async () => {
            const editor = await createTextEditor(c.input);
            selectWholeDocument(editor);
            const answers: (string | undefined)[] = [...c.answers!.slice(0, i), undefined];
            const { deps, record } = recorder(answers);
            await runnerFor(c, deps)(editor);
            assert.strictEqual(record.prompts.length, i + 1);
            assertNothingOutput(record);
            assert.strictEqual(editor.document.getText(), c.input);
          });
        });
      }
    });
  });

  suite('input boxes', () => {
    const locale = cases.find((c) => c.id === 'SORT-005')!;
    const column = cases.find((c) => c.id === 'SORT-008')!;
    const columnClipboard = cases.find((c) => c.id === 'SORT-028')!;

    const run = async (c: CommandCase, answers: (string | undefined)[], overrides: Partial<SortHandlerDeps> = {}) => {
      const editor = await createTextEditor(c.input);
      selectWholeDocument(editor);
      const { deps, record } = recorder(answers, overrides);
      await runnerFor(c, deps)(editor);
      assert.strictEqual(editor.document.getText(), c.input);
      return record;
    };

    test('the locale box starts with the display language and validates the value', async () => {
      const record = await run(locale, ['fr'], { defaultLocale: 'ja' });
      assert.strictEqual(record.prompts[0].value, 'ja');
      assert.strictEqual(record.prompts[0].validateInput!('xx-!!') !== undefined, true);
      assert.strictEqual(record.prompts[0].validateInput!('fr'), undefined);
      assert.deepStrictEqual(record.opened, ['e\né\nf']);
    });

    test('the column boxes start with "," and 1', async () => {
      const record = await run(column, [',', '1']);
      assert.deepStrictEqual(record.prompts.map((prompt) => prompt.value), [',', '1']);
      assert.deepStrictEqual(record.opened, ['a,1\nb,2']);
    });

    test('\\t as the delimiter means a tab', async () => {
      const editor = await createTextEditor('b\t2\na\t1');
      selectWholeDocument(editor);
      const { deps, record } = recorder(['\\t', '2']);
      await runnerFor(columnClipboard, deps)(editor);
      assert.deepStrictEqual(record.clipboard, ['a\t1\nb\t2']);
    });

    // validateInput keeps these values from being accepted; the handler checks them again.
    const invalid: [CommandCase, (string | undefined)[]][] = [
      [locale, ['xx-!!']],
      [locale, ['']],
      [locale, ['a'.repeat(65)]],
      [cases.find((c) => c.id === 'SORT-006')!, ['zz-!!']],
      [column, ['', '2']],
      [column, ['a\nb', '2']],
      [column, [',', '0']],
      [column, [',', '1001']],
      [column, [',', '1.5']],
      [cases.find((c) => c.id === 'SORT-009')!, [',', 'x']],
      [columnClipboard, [',', '-1']],
      [regexKey, ['(']],
      [regexKey, ['a'.repeat(501)]],
    ];
    invalid.forEach(([c, answers]) => {
      test(`${c.id}: an invalid value (${JSON.stringify(answers).slice(0, 40)}) outputs nothing`, async () => {
        let workerCalls = 0;
        const record = await run(c, answers, {
          runRegexCapture: () => {
            workerCalls++;
            return Promise.resolve([]);
          },
        });
        assertNothingOutput(record);
        assert.strictEqual(workerCalls, 0);
        assert.deepStrictEqual([...record.warnings, ...record.errors], []);
      });
    });
  });

  suite('SORT-010 regex key (real worker)', () => {
    const run = async (text: string, pattern: string, overrides: Partial<SortHandlerDeps> = {}) => {
      const editor = await createTextEditor(text);
      selectWholeDocument(editor);
      const { deps, record } = recorder([pattern], overrides);
      await runnerFor(regexKey, deps)(editor);
      assert.strictEqual(editor.document.getText(), text);
      return record;
    };

    test('without a capture group the whole match is the key', async () => {
      const record = await run('b 30\na 4\nc 100', '\\d+');
      assert.deepStrictEqual(record.opened, ['a 4\nb 30\nc 100']);
    });

    test('text keys use natural order, numbers come first', async () => {
      const record = await run('k=b10\nk=b9\nk=5', 'k=(\\w+)');
      assert.deepStrictEqual(record.opened, ['k=5\nk=b9\nk=b10']);
    });

    test('lines that do not match, or where group 1 does not take part, are last in their order', async () => {
      const record = await run('b\nzz\nab\nx\naab', '(a+)?b');
      // Keys: "b" -> group 1 missing, "zz"/"x" -> no match, "ab" -> "a", "aab" -> "aa".
      assert.deepStrictEqual(record.opened, ['ab\naab\nb\nzz\nx']);
    });

    test('a catastrophic pattern is stopped at the time limit and nothing is output', async () => {
      const record = await run(`${'a'.repeat(40)}!`, '^(a+)+$', { regexTimeoutMs: 200 });
      assertNothingOutput(record);
      assert.deepStrictEqual(record.warnings, [
        'The result was not opened: The regular expression did not finish within 200 ms and was stopped.',
      ]);
    });

    test('the clipboard wording is used for the clipboard target', async () => {
      const editor = await createTextEditor('a');
      selectWholeDocument(editor);
      const { deps, record } = recorder(['a'], {
        runRegexCapture: () => Promise.reject(new Error('boom')),
      });
      await sortLineExtendedHandlerInternal(deps)('regex-key', false, 'clipboard')(editor);
      assert.deepStrictEqual(record.errors, ['The clipboard was not changed: boom']);
      assertNothingOutput(record);
    });

    test('selections over 10,000,000 characters in total are refused before the worker starts', async () => {
      let calls = 0;
      const block = 'a'.repeat(5_000_001);
      const editor = await createTextEditor(`${block}\n${block}`);
      editor.selections = [sel(0, 0, 0, 5_000_001), sel(1, 0, 1, 5_000_001)];
      const { deps, record } = recorder(['a'], {
        runRegexCapture: () => {
          calls++;
          return Promise.resolve([]);
        },
      });
      await runnerFor(regexKey, deps)(editor);
      assert.strictEqual(calls, 0);
      assertNothingOutput(record);
      assert.deepStrictEqual(record.warnings, [
        'The result was not opened: The selections contain 10,000,002 characters (limit for regular expressions: 10,000,000).',
      ]);
    });

    test('the line filter mode of the shared worker still works', async () => {
      assert.deepStrictEqual(await runRegexInWorker('\\d', ['a1', 'b'], 2000), [true, false]);
    });
  });

  suite('lines and output', () => {
    test('one trailing line break of each selection is not a line', async () => {
      const editor = await createTextEditor('b\na\n---\nd\nc\n');
      editor.selections = [sel(0, 0, 2, 0), sel(3, 0, 5, 0)];
      const { deps, record } = recorder();
      await sortLineExtendedHandlerInternal(deps)('natural', false, 'new-document')(editor);
      assert.deepStrictEqual(record.opened, ['a\nb\nc\nd']);
    });

    test('CRLF lines are split and the result is joined with \\n', async () => {
      const editor = await createTextEditor('b\na');
      await editor.edit((editBuilder) => editBuilder.setEndOfLine(vscode.EndOfLine.CRLF));
      selectWholeDocument(editor);
      const { deps, record } = recorder();
      await sortLineExtendedHandlerInternal(deps)('natural', false, 'clipboard')(editor);
      assert.deepStrictEqual(record.clipboard, ['a\nb']);
    });

    test('selection sorts drop blank lines (like the existing sort.* commands)', async () => {
      const editor = await createTextEditor('v10\n\n  \nv2');
      selectWholeDocument(editor);
      const { deps, record } = recorder();
      await sortSelectionExtendedHandlerInternal(deps)('natural', false, 'new-document')(editor);
      assert.deepStrictEqual(record.opened, ['v2\nv10']);
    });

    test('clipboard version with an empty result: the clipboard is not changed and the user is told', async () => {
      const editor = await createTextEditor('  \n\t');
      selectWholeDocument(editor);
      const { deps, record } = recorder();
      await sortSelectionExtendedHandlerInternal(deps)('natural', false, 'clipboard')(editor);
      assertNothingOutput(record);
      assert.deepStrictEqual(record.infos, [NO_LINES_TO_COPY_MESSAGE]);

      const lineEditor = await createTextEditor('\nx');
      lineEditor.selection = sel(0, 0, 1, 0);
      const second = recorder();
      await sortLineExtendedHandlerInternal(second.deps)('natural', false, 'clipboard')(lineEditor);
      assertNothingOutput(second.record);
      assert.deepStrictEqual(second.record.infos, [NO_LINES_TO_COPY_MESSAGE]);
    });

    test('new-document version with an empty result: no document is opened', async () => {
      const editor = await createTextEditor('\n\n');
      selectWholeDocument(editor);
      const { deps, record } = recorder();
      await sortLineExtendedHandlerInternal(deps)('paragraph', false, 'new-document')(editor);
      assertNothingOutput(record);
      assert.deepStrictEqual(record.infos, [NO_LINES_TO_OPEN_MESSAGE]);
    });

    test('the selection is read after the input box closes', async () => {
      const editor = await createTextEditor('x\nb,2\na,1');
      editor.selection = sel(1, 0, 2, 3);
      const { deps, record } = recorder();
      const queue = [',', '2'];
      deps.showInputBox = async (options) => {
        record.prompts.push(options);
        if (record.prompts.length === 1) {
          assert.ok(await editor.edit((editBuilder) => editBuilder.insert(new vscode.Position(0, 0), 'c,0\n')));
          editor.selection = sel(0, 0, 3, 3);
        }
        return queue.shift();
      };
      await sortLineExtendedHandlerInternal(deps)('column', false, 'new-document')(editor);
      // The inserted line is part of the current selection; "x" has no second column.
      assert.deepStrictEqual(record.opened, ['c,0\na,1\nb,2\nx']);
    });

    test('the selection became a cursor while the box was shown: nothing is output', async () => {
      const editor = await createTextEditor('b,2\na,1');
      selectWholeDocument(editor);
      const { deps, record } = recorder();
      deps.showInputBox = async () => {
        editor.selection = sel(0, 0, 0, 0);
        return ',';
      };
      await sortLineExtendedHandlerInternal(deps)('column', false, 'clipboard')(editor);
      assertNothingOutput(record);
    });
  });

  // Running the commands through executeCommand would activate the extension inside the test
  // host (see lineCommands.test.ts), so the wiring in extension.ts is checked statically.
  test('extension.ts registers every command with the matching handler exactly once', () => {
    const source = fs.readFileSync(path.resolve(__dirname, '../../../src/extension.ts'), 'utf8');
    cases.forEach((c) => {
      const id = commandId(c);
      const registration = `registerTextEditorCommand('${id}', ${handlerSource(c)})`;
      assert.strictEqual(source.split(registration).length - 1, 1, registration);
      assert.strictEqual(source.split(`'${id}'`).length - 1, 1, id);
    });
  });

  test('package.json and the Show Commands list register all 30 commands exactly once, as in the showcase data', () => {
    const root = path.resolve(__dirname, '../../..');
    const packageJson = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
    const rows = new Map(candidateRows('SORT').map(([candidate, , command]) => [candidate, command]));
    const contributes = packageJson.contributes;
    const count = (entries: { command?: string }[], id: string) => entries.filter((entry) => entry.command === id).length;
    cases.forEach((c) => {
      const id = commandId(c);
      const submenu = contributes.menus[`selection-manipulator.${c.kind}.submenu`];
      assert.strictEqual(count(contributes.commands, id), 1, `commands: ${id}`);
      assert.strictEqual(count(contributes.menus.commandPalette, id), 1, `commandPalette: ${id}`);
      assert.strictEqual(count(submenu, id), 1, `submenu: ${id}`);
      assert.strictEqual(count(myCommands, id), 1, `showCommands: ${id}`);
      const command = contributes.commands.find((entry: { command: string }) => entry.command === id);
      assert.strictEqual(command.category, 'Selection Manipulator');
      assert.strictEqual(rows.get(c.id), id, `${c.id} showcase data`);
      assert.strictEqual(myCommands.find((entry) => entry.command === id)?.title, `Extract - ${command.title}`);
      assert.strictEqual(
        contributes.menus.commandPalette.find((entry: { command: string }) => entry.command === id).when,
        'editorHasSelection'
      );
    });
    // Each submenu keeps sequential groups, and each base command is followed by its clipboard version.
    for (const kind of ['sort-line', 'sort'] as const) {
      const submenu: { command: string; group: string }[] = contributes.menus[`selection-manipulator.${kind}.submenu`];
      submenu.forEach((entry, i) => assert.strictEqual(entry.group, `selection-manipulator@${i}`));
      cases.filter((c) => c.kind === kind && c.output === CLIP).forEach((c) => {
        const index = submenu.findIndex((entry) => entry.command === commandId(c));
        assert.strictEqual(submenu[index - 1].command, commandId({ ...c, output: NEW }));
      });
    }
    assert.strictEqual(contributes.menus['selection-manipulator.sort-line.submenu'].length, 12 + 25);
    assert.strictEqual(contributes.menus['selection-manipulator.sort.submenu'].length, 8 + 5);
    // Show Commands looks commands up by title, so titles must stay unique.
    assert.strictEqual(new Set(myCommands.map((entry) => entry.title)).size, myCommands.length);
  });
});
