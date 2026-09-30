import * as assert from 'assert';
import * as fs from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';
import { MAX_OUTPUT_LENGTH } from '../../handler/encodeTransforms';
import { myCommands } from '../../handler/showCommandsHandler';
import { DEV_NOTHING_SELECTED, devCommandHandlerInternal, DevDependencies, DevPickItem } from '../../handler/devCommandHandler';
import { DevInputError } from '../../handler/devCommon';
import { DEV_COMMAND_ENTRIES, DevCommandEntry } from '../../handler/devTransforms';
import { createTextEditor } from './testUtils';
import { DEV_ROADMAP_EXAMPLES } from './devExamples';
import { candidateRows } from './showcaseData';

const SEPARATOR = '\n---\n';
const NOT_CHANGED = 'The selection was not changed: ';
const NOT_SHOWN = 'No result was shown: ';
const PREFIX = 'selection-manipulator.';

const prefixOf = (entry: DevCommandEntry): string => (entry.output === 'replace' ? NOT_CHANGED : NOT_SHOWN);

/**
 * Records what the handlers show and open instead of touching VS Code's UI. The quick pick answers
 * with the item whose value is `choice` (`undefined` = cancelled) and records its items.
 */
const recorder = (choice?: string, options: { onPick?: () => void | Thenable<unknown> } = {}) => {
  const warnings: string[] = [];
  const errors: string[] = [];
  const opened: string[] = [];
  const picks: { items: DevPickItem[]; options: vscode.QuickPickOptions }[] = [];
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
      return Promise.resolve();
    },
    showQuickPick: async (items, pickOptions) => {
      picks.push({ items, options: pickOptions });
      await options.onPick?.();
      return choice === undefined ? undefined : items.find((item) => item.value === choice) ?? { label: choice, value: choice };
    },
  };
  return { dependencies, warnings, errors, opened, picks };
};

const run = (entry: DevCommandEntry, dependencies: DevDependencies, entries: readonly DevCommandEntry[] = DEV_COMMAND_ENTRIES) =>
  devCommandHandlerInternal(dependencies, entries)(entry.name);

const entryOf = (id: string): DevCommandEntry => {
  const found = DEV_COMMAND_ENTRIES.find((entry) => entry.id === id);
  assert.ok(found, id);
  return found;
};

const selectWholeDocument = (editor: vscode.TextEditor) => {
  const document = editor.document;
  editor.selection = new vscode.Selection(new vscode.Position(0, 0), document.lineAt(document.lineCount - 1).range.end);
};

/** Selects the blocks of a `block---block---...` document with one cursor each. */
const selectBlocks = (editor: vscode.TextEditor, blocks: string[], separator = SEPARATOR, reversed = false) => {
  const document = editor.document;
  const selections: vscode.Selection[] = [];
  let offset = 0;
  blocks.forEach((block) => {
    selections.push(new vscode.Selection(document.positionAt(offset), document.positionAt(offset + block.length)));
    offset += block.length + separator.length;
  });
  editor.selections = reversed ? selections.reverse() : selections;
};

const crlfEditor = async (text: string): Promise<vscode.TextEditor> => {
  const editor = await createTextEditor(text);
  await editor.edit((editBuilder) => editBuilder.setEndOfLine(vscode.EndOfLine.CRLF));
  assert.strictEqual(editor.document.getText(), text.replace(/\n/g, '\r\n'));
  return editor;
};

const closeAllEditors = async () => {
  for (let i = 0; i < 20 && vscode.window.visibleTextEditors.length > 0; i++) {
    await vscode.commands.executeCommand('workbench.action.revertAndCloseActiveEditor');
  }
};

const readRepoFile = (file: string): string => fs.readFileSync(path.resolve(__dirname, '../../..', file), 'utf8');

/** The content of a Markdown code span (`` `x` `` or ``` `` x `` ```). */
const codeSpan = (span: string): string => {
  const ticks = /^`+/.exec(span)?.[0] ?? '';
  assert.ok(ticks.length > 0 && span.endsWith(ticks) && span.length >= ticks.length * 2, span);
  const inner = span.slice(ticks.length, span.length - ticks.length);
  return inner.length >= 2 && inner.startsWith(' ') && inner.endsWith(' ') && inner.trim() !== '' ? inner.slice(1, -1) : inner;
};

/** The DEV commands of the showcase data (scripts/showcase-data/DEV.json): [id, kind, command ID, title, example]. */
const dataRows = (): [string, string, string, string, string][] => candidateRows('DEV');

/** Expands the notation of the ROADMAP examples: `⏎` (line break), `⇥` (tab) and `·` (space). */
const expandNotation = (text: string): string => text.replace(/⏎/g, '\n').replace(/⇥/g, '\t').replace(/·/g, ' ');

/** Commands of a fake table that exercise the error, blank and quick pick paths in isolation. */
const FAKE_ENTRIES: readonly DevCommandEntry[] = [
  {
    id: 'FAKE-1', name: 'test.upper', title: 'Upper', output: 'replace', acceptsBlank: false,
    transform: (text) => {
      if (text.includes('!')) {
        throw new DevInputError(`${JSON.stringify(text)} has a "!"`);
      }
      return text.toUpperCase();
    },
  },
  {
    id: 'FAKE-2', name: 'test.pick', title: 'Pick', output: 'replace', acceptsBlank: false,
    quickPick: { placeHolder: 'Choose', items: [{ label: 'A', description: 'the letter a', value: 'a' }, { label: 'B', value: 'b' }] },
    transform: (text, context) => text.replace(/[ab]/g, context.choice!),
  },
  {
    id: 'FAKE-3', name: 'test.broken', title: 'Broken', output: 'new-tab', acceptsBlank: false,
    transform: () => {
      throw new TypeError('secret selected text');
    },
  },
];

const fake = (name: string): DevCommandEntry => FAKE_ENTRIES.find((entry) => entry.name === name)!;

suite('Developer Commands (DEV-001..035) Test Suite', () => {

  teardown(closeAllEditors);

  suite('each command (ROADMAP example)', () => {
    DEV_COMMAND_ENTRIES.forEach((entry) => {
      const example = DEV_ROADMAP_EXAMPLES[entry.id];

      test(`${entry.id} ${entry.name}: ${entry.output} for two selections`, async () => {
        const { dependencies, warnings, errors, opened } = recorder(example.choice);
        const blocks = [example.input, example.input];
        const editor = await createTextEditor(blocks.join(SEPARATOR));
        selectBlocks(editor, blocks, SEPARATOR, true);
        await run(entry, dependencies)(editor);
        assert.deepStrictEqual([warnings, errors], [[], []]);
        if (entry.output === 'replace') {
          assert.strictEqual(editor.document.getText(), [example.expected, example.expected].join(SEPARATOR));
          assert.deepStrictEqual(opened, []);
          await vscode.commands.executeCommand('undo');
          assert.strictEqual(editor.document.getText(), blocks.join(SEPARATOR));
        } else {
          assert.deepStrictEqual(opened, [[example.expected, example.expected].join('\n')]);
          assert.strictEqual(editor.document.getText(), blocks.join(SEPARATOR));
        }
      });

      test(`${entry.id} ${entry.name}: only empty selections${entry.acceptsBlank ? '' : ' or blank selections'} warn`, async () => {
        const { dependencies, warnings, errors, opened, picks } = recorder(example.choice);
        const text = `${example.input}\n  \n\t\n`;
        // The blank lines follow the example, which may have several lines.
        const blank = example.input.split('\n').length;
        const editor = await createTextEditor(text);
        editor.selections = entry.acceptsBlank
          ? [new vscode.Selection(0, 0, 0, 0), new vscode.Selection(blank, 1, blank, 1)]
          : [new vscode.Selection(0, 0, 0, 0), new vscode.Selection(blank, 0, blank + 2, 0)];
        await run(entry, dependencies)(editor);
        assert.strictEqual(editor.document.getText(), text);
        assert.deepStrictEqual([warnings, errors, opened], [[DEV_NOTHING_SELECTED], [], []]);
        assert.strictEqual(picks.length, 0);
      });
    });
  });

  suite('selections and errors', () => {
    test('the literal and escaping commands convert blank selections too', async () => {
      const blocks = ['   ', '\t'];
      const editor = await createTextEditor(blocks.join(SEPARATOR));
      selectBlocks(editor, blocks);
      const shown = recorder();
      await run(entryOf('DEV-001'), shown.dependencies)(editor);
      assert.deepStrictEqual(shown.opened, ['\'   \'\n\'\\t\'']);
      await run(entryOf('DEV-030'), recorder().dependencies)(editor);
      assert.strictEqual(editor.document.getText(), ['\'   \'', '\'\\t\''].join(SEPARATOR));
    });

    test('only the 14 literal and escaping commands (DEV-001..011, DEV-030..032) accept blank selections', () => {
      const literals = new Set([
        'DEV-001', 'DEV-002', 'DEV-003', 'DEV-004', 'DEV-005', 'DEV-006', 'DEV-007',
        'DEV-008', 'DEV-009', 'DEV-010', 'DEV-011', 'DEV-030', 'DEV-031', 'DEV-032',
      ]);
      for (const entry of DEV_COMMAND_ENTRIES) {
        assert.strictEqual(entry.acceptsBlank, literals.has(entry.id), entry.id);
      }
    });

    test('other commands skip blank selections and convert the rest', async () => {
      const { dependencies, warnings } = recorder();
      const blocks = ['ab', '   ', 'c\n\nd'];
      const editor = await createTextEditor(blocks.join(SEPARATOR));
      selectBlocks(editor, blocks, SEPARATOR, true);
      await run(fake('test.upper'), dependencies, FAKE_ENTRIES)(editor);
      assert.strictEqual(editor.document.getText(), ['AB', '   ', 'C\n\nD'].join(SEPARATOR));
      assert.deepStrictEqual(warnings, []);
    });

    test('new editor: results in document order', async () => {
      const { dependencies, opened } = recorder();
      const blocks = ['a.b', 'c|d', 'e'];
      const editor = await createTextEditor(blocks.join(SEPARATOR));
      selectBlocks(editor, blocks, SEPARATOR, true);
      await run(entryOf('DEV-006'), dependencies)(editor);
      assert.deepStrictEqual(opened, ['a\\.b\nc\\|d\ne']);
    });

    test('Replace: only the selections that change are edited, in one step', async () => {
      const blocks = ['O\'Reilly', 'plain', '\'\''];
      const editor = await createTextEditor(blocks.join(SEPARATOR));
      selectBlocks(editor, blocks);
      await run(entryOf('DEV-032'), recorder().dependencies)(editor);
      assert.strictEqual(editor.document.getText(), ['O\'\'Reilly', 'plain', '\'\'\'\''].join(SEPARATOR));
      await vscode.commands.executeCommand('undo');
      assert.strictEqual(editor.document.getText(), blocks.join(SEPARATOR));
    });

    test('DEV-032 (Replace) with a backslash in one selection changes nothing (MySQL default mode)', async () => {
      const { dependencies, errors } = recorder();
      const blocks = ['O\'Reilly', 'C:\\Users'];
      const editor = await createTextEditor(blocks.join(SEPARATOR));
      selectBlocks(editor, blocks);
      await run(entryOf('DEV-032'), dependencies)(editor);
      assert.strictEqual(editor.document.getText(), blocks.join(SEPARATOR));
      assert.deepStrictEqual(errors, [
        `${NOT_CHANGED}selection 2 of 2: the text contains a backslash (\\), which is not safe in MySQL's default mode (the SQL is written as standard SQL)`,
      ]);
    });

    test('DEV-032 (Replace) with a yen sign (saved as a backslash in Shift_JIS / EUC-JP) changes nothing', async () => {
      const { dependencies, errors } = recorder();
      const editor = await createTextEditor('\u00A5\' OR 1=1 --');
      selectWholeDocument(editor);
      await run(entryOf('DEV-032'), dependencies)(editor);
      assert.strictEqual(editor.document.getText(), '\u00A5\' OR 1=1 --');
      assert.strictEqual(errors.length, 1);
      assert.ok(errors[0].startsWith(`${NOT_CHANGED}the text contains a yen sign (\u00A5)`), errors[0]);
    });

    test('DEV-007 (new editor) with a backslash shows no result', async () => {
      const { dependencies, errors, opened } = recorder();
      const editor = await createTextEditor('O\\\'Neil');
      selectWholeDocument(editor);
      await run(entryOf('DEV-007'), dependencies)(editor);
      assert.deepStrictEqual(opened, []);
      assert.strictEqual(errors.length, 1);
      assert.ok(errors[0].startsWith(`${NOT_SHOWN}the text contains a backslash`), errors[0]);
    });

    test('one invalid selection among several changes nothing; the message names the selection', async () => {
      const { dependencies, errors } = recorder();
      const blocks = ['ok', 'no!'];
      const editor = await createTextEditor(blocks.join(SEPARATOR));
      selectBlocks(editor, blocks);
      await run(fake('test.upper'), dependencies, FAKE_ENTRIES)(editor);
      assert.strictEqual(editor.document.getText(), blocks.join(SEPARATOR));
      assert.deepStrictEqual(errors, [`${NOT_CHANGED}selection 2 of 2: "no!" has a "!"`]);
    });

    test('one selection: the message has no selection number', async () => {
      const { dependencies, errors } = recorder();
      const editor = await createTextEditor('no!');
      selectWholeDocument(editor);
      await run(fake('test.upper'), dependencies, FAKE_ENTRIES)(editor);
      assert.deepStrictEqual(errors, [`${NOT_CHANGED}"no!" has a "!"`]);
    });

    test('an unexpected failure shows a fixed text, never the error message', async () => {
      const { dependencies, errors, opened } = recorder();
      const editor = await createTextEditor('abc');
      selectWholeDocument(editor);
      await run(fake('test.broken'), dependencies, FAKE_ENTRIES)(editor);
      assert.deepStrictEqual([errors, opened], [[`${NOT_SHOWN}the text could not be processed`], []]);
    });

    test('the output limit only warns', async function () {
      this.timeout(60_000);
      const { dependencies, warnings, errors, opened } = recorder();
      // Every control character becomes `\xhh`: 3 × 999,999 × 4 characters exceed the limit.
      const block = '\u0001'.repeat(999_999);
      const blocks = [block, block, block];
      const editor = await createTextEditor(blocks.join(SEPARATOR));
      selectBlocks(editor, blocks);
      await run(entryOf('DEV-001'), dependencies)(editor);
      assert.deepStrictEqual([opened, errors], [[], []]);
      assert.deepStrictEqual(warnings, [`${NOT_SHOWN}the result would be longer than ${MAX_OUTPUT_LENGTH.toLocaleString('en-US')} characters. Select less text.`]);
    });

    test('a selection over 1,000,000 characters is refused (new editor and Replace)', async function () {
      this.timeout(60_000);
      const editor = await createTextEditor('a'.repeat(1_000_001));
      selectWholeDocument(editor);
      for (const id of ['DEV-001', 'DEV-030']) {
        const { dependencies, errors, opened } = recorder();
        await run(entryOf(id), dependencies)(editor);
        assert.deepStrictEqual(opened, [], id);
        assert.deepStrictEqual(errors, [`${prefixOf(entryOf(id))}the selection is longer than 1,000,000 characters`], id);
      }
      assert.strictEqual(editor.document.getText().length, 1_000_001);
    });
  });

  suite('commands DEV-001..011, DEV-030..032', () => {
    test('DEV-003: the literals are joined with the document EOL (CRLF)', async () => {
      const editor = await crlfEditor('a\n"b"\n');
      selectWholeDocument(editor);
      const { dependencies, opened } = recorder();
      await run(entryOf('DEV-003'), dependencies)(editor);
      assert.deepStrictEqual(opened, ['"a\\n" +\r\n"\\"b\\"\\n"']);
    });

    test('DEV-001 / 002 / 005: CRLF line breaks are escaped as \\r\\n or kept', async () => {
      const editor = await crlfEditor('a\nb');
      selectWholeDocument(editor);
      for (const [id, expected] of [['DEV-001', '\'a\\r\\nb\''], ['DEV-002', '\'a\\r\\nb\''], ['DEV-005', '`a\r\nb`'], ['DEV-004', '`a\r\nb`']]) {
        const { dependencies, opened } = recorder();
        await run(entryOf(id), dependencies)(editor);
        assert.deepStrictEqual(opened, [expected], id);
      }
    });

    test('DEV-030 / 031 / 032: Replace keeps the rest of the document', async () => {
      const editor = await createTextEditor('x = it\'s;\ny = a.b;');
      editor.selections = [new vscode.Selection(0, 4, 0, 8), new vscode.Selection(1, 4, 1, 7)];
      await run(entryOf('DEV-030'), recorder().dependencies)(editor);
      assert.strictEqual(editor.document.getText(), 'x = \'it\\\'s\';\ny = \'a.b\';');
      const regex = await createTextEditor('a.b');
      selectWholeDocument(regex);
      await run(entryOf('DEV-031'), recorder().dependencies)(regex);
      assert.strictEqual(regex.document.getText(), 'a\\.b');
    });

    test('DEV-008 / 009: shell and PowerShell text is only quoted', async () => {
      const editor = await createTextEditor('\'; rm -rf ~ #\n$(id)\u2019');
      selectWholeDocument(editor);
      const posix = recorder();
      await run(entryOf('DEV-008'), posix.dependencies)(editor);
      assert.deepStrictEqual(posix.opened, ['\'\'\\\'\'; rm -rf ~ #\n$(id)\u2019\'']);
      const powershell = recorder();
      await run(entryOf('DEV-009'), powershell.dependencies)(editor);
      assert.deepStrictEqual(powershell.opened, ['\'\'\'; rm -rf ~ #\n$(id)\u2019\u2019\'']);
    });
  });

  suite('commands DEV-012..019, DEV-033..034', () => {
    test('DEV-012 / 013 / 014 / 015 / 019: multi-line results use the document EOL (CRLF)', async () => {
      const cases: [string, string, string][] = [
        ['DEV-012', '{"a":{"b":1}}', 'interface Root {\r\n  a: A;\r\n}\r\n\r\ninterface A {\r\n  b: number;\r\n}'],
        ['DEV-013', '{"a":1}', 'type Root struct {\r\n\tA int `json:"a"`\r\n}'],
        ['DEV-014', '{"a":1}', 'from typing import TypedDict\r\n\r\n\r\nclass Root(TypedDict):\r\n    a: int'],
        ['DEV-015', 'select a\nfrom t', 'SELECT a\r\nFROM t'],
        ['DEV-019', 'a{b:c}', 'a {\r\n  b: c;\r\n}'],
      ];
      for (const [id, input, expected] of cases) {
        const editor = await crlfEditor(input);
        selectWholeDocument(editor);
        const { dependencies, opened, errors } = recorder();
        await run(entryOf(id), dependencies)(editor);
        assert.deepStrictEqual([opened, errors], [[expected], []], id);
      }
    });

    test('DEV-016 / 017 / 018: the line breaks of the selection are kept or removed', async () => {
      const editor = await crlfEditor('select a\n-- c\nfrom t');
      selectWholeDocument(editor);
      const minified = recorder();
      await run(entryOf('DEV-016'), minified.dependencies)(editor);
      assert.deepStrictEqual(minified.opened, ['select a from t']);
      const upper = recorder();
      await run(entryOf('DEV-017'), upper.dependencies)(editor);
      assert.deepStrictEqual(upper.opened, ['SELECT a\r\n-- c\r\nFROM t']);
      const css = await crlfEditor('a {\n  b: c;\n}');
      selectWholeDocument(css);
      const minifiedCss = recorder();
      await run(entryOf('DEV-018'), minifiedCss.dependencies)(css);
      assert.deepStrictEqual(minifiedCss.opened, ['a{b:c}']);
    });

    test('invalid JSON, SQL or CSS in one selection shows nothing and names the selection', async () => {
      const cases: [string, string[], string][] = [
        ['DEV-012', ['{"a":1}', '{"a":'], 'selection 2 of 2: the selection is not valid JSON'],
        ['DEV-014', ['[]', '{}'], 'selection 1 of 2: the JSON array is empty: there is nothing to infer the types from'],
        ['DEV-015', ['select \'a', 'select 1'], 'selection 1 of 2: a \' string is not closed'],
        ['DEV-018', ['a{}', 'a{'], 'selection 2 of 2: a { is not closed'],
      ];
      for (const [id, blocks, message] of cases) {
        const editor = await createTextEditor(blocks.join(SEPARATOR));
        selectBlocks(editor, blocks);
        const { dependencies, opened, errors } = recorder();
        await run(entryOf(id), dependencies)(editor);
        assert.deepStrictEqual(opened, [], id);
        assert.strictEqual(errors.length, 1, id);
        assert.ok(errors[0].startsWith(`${NOT_SHOWN}${message}`), errors[0]);
      }
    });

    test('DEV-033 / 034: Replace changes nothing when one selection is invalid, and keeps the rest of the document', async () => {
      const blocks = ['select a from t', 'select (b'];
      const editor = await createTextEditor(blocks.join(SEPARATOR));
      selectBlocks(editor, blocks);
      const failed = recorder();
      await run(entryOf('DEV-034'), failed.dependencies)(editor);
      assert.strictEqual(editor.document.getText(), blocks.join(SEPARATOR));
      assert.deepStrictEqual(failed.errors, [`${NOT_CHANGED}selection 2 of 2: the parentheses are not balanced`]);
      const json = await createTextEditor('const x = {"id":1};');
      json.selection = new vscode.Selection(0, 10, 0, 18);
      await run(entryOf('DEV-033'), recorder().dependencies)(json);
      assert.strictEqual(json.document.getText(), 'const x = interface Root {\n  id: number;\n};');
    });
  });

  suite('commands DEV-020..029, DEV-035', () => {
    test('DEV-023 / 024 / 026 / 029: line breaks of the selection and multi-line results use the document EOL (CRLF)', async () => {
      const cases: [string, string, string][] = [
        ['DEV-023', 'a();\nconsole.log(1);\nb();', 'a();\r\nb();'],
        ['DEV-024', 'import b from \'b\';\nimport a from \'a\';', 'import a from \'a\';\r\nimport b from \'b\';'],
        ['DEV-026', 'curl -I \\\n  https://x.test', 'fetch(\'https://x.test\', {\r\n  method: \'HEAD\',\r\n});'],
        ['DEV-029', '755\n\nrw-r--r--', 'rwxr-xr-x\r\n\r\n644'],
        ['DEV-022', '#aabbcc\n#abc', '#abc\r\n#aabbcc'],
      ];
      for (const [id, input, expected] of cases) {
        const editor = await crlfEditor(input);
        selectWholeDocument(editor);
        const { dependencies, opened, errors } = recorder();
        await run(entryOf(id), dependencies)(editor);
        assert.deepStrictEqual([opened, errors], [[expected], []], id);
      }
    });

    test('DEV-028: the part is asked once for all selections; cancelling changes nothing', async () => {
      const blocks = ['1.2.3', 'v0.9.9-rc.1'];
      const editor = await createTextEditor(blocks.join(SEPARATOR));
      selectBlocks(editor, blocks);
      const { dependencies, opened, picks } = recorder('major');
      await run(entryOf('DEV-028'), dependencies)(editor);
      assert.deepStrictEqual(opened, ['2.0.0\nv1.0.0']);
      assert.strictEqual(picks.length, 1);
      assert.deepStrictEqual(picks[0].items.map((item) => item.value), ['patch', 'minor', 'major']);
      assert.deepStrictEqual(picks[0].options, { placeHolder: 'Choose the part of the version to raise', ignoreFocusOut: true });
      const cancelled = recorder(undefined);
      await run(entryOf('DEV-028'), cancelled.dependencies)(editor);
      assert.deepStrictEqual([cancelled.opened, cancelled.errors, cancelled.warnings], [[], [], []]);
    });

    test('an invalid color, command or version in one selection shows nothing and names the selection', async () => {
      const cases: [string, string[], string, string?][] = [
        ['DEV-021', ['hsl(0, 0%, 0%)', 'hsl(0, 0, 0)'], 'selection 2 of 2: "hsl(0, 0, 0)" is not an HSL color'],
        ['DEV-026', ['wget x', 'curl https://x.test'], 'selection 1 of 2: the selection is not a curl command'],
        ['DEV-025', ['\'a\' + b', '\'a\' + b - 1'], 'selection 2 of 2: the expression has a top-level binary "-"'],
        ['DEV-028', ['1.2.3', '1.2'], 'selection 2 of 2: "1.2" is not a semantic version', 'patch'],
        ['DEV-027', ['<p>', '<p class="a'], 'selection 2 of 2: the value of the attribute "class" of "<p" is not closed'],
      ];
      for (const [id, blocks, message, choice] of cases) {
        const editor = await createTextEditor(blocks.join(SEPARATOR));
        selectBlocks(editor, blocks);
        const { dependencies, opened, errors } = recorder(choice);
        await run(entryOf(id), dependencies)(editor);
        assert.deepStrictEqual(opened, [], id);
        assert.strictEqual(errors.length, 1, id);
        assert.ok(errors[0].startsWith(`${NOT_SHOWN}${message}`), errors[0]);
      }
    });

    test('DEV-035: Replace keeps the rest of the document, and changes nothing when one selection is invalid', async () => {
      const editor = await createTextEditor('return (\n  <label class="a" for="b">x</label>\n);');
      editor.selection = new vscode.Selection(1, 2, 1, 36);
      await run(entryOf('DEV-035'), recorder().dependencies)(editor);
      assert.strictEqual(editor.document.getText(), 'return (\n  <label className="a" htmlFor="b">x</label>\n);');
      const blocks = ['<br>', '<p class="a'];
      const failing = await createTextEditor(blocks.join(SEPARATOR));
      selectBlocks(failing, blocks);
      const failed = recorder();
      await run(entryOf('DEV-035'), failed.dependencies)(failing);
      assert.strictEqual(failing.document.getText(), blocks.join(SEPARATOR));
      assert.deepStrictEqual(failed.errors, [`${NOT_CHANGED}selection 2 of 2: the value of the attribute "class" of "<p" is not closed`]);
    });
  });

  suite('quick pick (fake command table)', () => {
    test('asked once for all selections, with its items; the choice is used', async () => {
      const { dependencies, picks } = recorder('b');
      const blocks = ['a-a', 'b-a'];
      const editor = await createTextEditor(blocks.join(SEPARATOR));
      selectBlocks(editor, blocks);
      await run(fake('test.pick'), dependencies, FAKE_ENTRIES)(editor);
      assert.strictEqual(editor.document.getText(), ['b-b', 'b-b'].join(SEPARATOR));
      assert.strictEqual(picks.length, 1);
      assert.deepStrictEqual(picks[0].items, [{ label: 'A', description: 'the letter a', value: 'a' }, { label: 'B', value: 'b' }]);
      assert.deepStrictEqual(picks[0].options, { placeHolder: 'Choose', ignoreFocusOut: true });
    });

    test('cancelling or an unknown value does nothing', async () => {
      for (const choice of [undefined, 'z']) {
        const { dependencies, warnings, errors } = recorder(choice);
        const editor = await createTextEditor('a-b');
        selectWholeDocument(editor);
        await run(fake('test.pick'), dependencies, FAKE_ENTRIES)(editor);
        assert.strictEqual(editor.document.getText(), 'a-b');
        assert.deepStrictEqual([warnings, errors], [[], []]);
      }
    });

    test('the selections are read again after it closes', async () => {
      const editor = await createTextEditor('x\na');
      editor.selection = new vscode.Selection(1, 0, 1, 1);
      const { dependencies } = recorder('b', {
        onPick: async () => {
          await editor.edit((editBuilder) => editBuilder.insert(new vscode.Position(0, 0), 'y\n'));
        },
      });
      await run(fake('test.pick'), dependencies, FAKE_ENTRIES)(editor);
      assert.strictEqual(editor.document.getText(), 'y\nx\nb');
    });
  });

  suite('source files', () => {
    // Invisible, format, bidi control and combining characters are written as \u escapes so that
    // the sources can be read and reviewed; tab, LF, CR and the space are the only white space
    // written as they are.
    const HIDDEN = /[\p{Cc}\p{Cf}\p{Z}\p{M}]/u;
    const devSources = (): string[] => [
      ...fs.readdirSync(path.resolve(__dirname, '../../../src/handler')).filter((name) => /^dev[A-Z]\w*(\.test)?\.ts$/.test(name)).map((name) => `src/handler/${name}`),
      ...fs.readdirSync(path.resolve(__dirname, '../../../src/test/suite')).filter((name) => /^dev[A-Z]\w*(\.test)?\.ts$/.test(name)).map((name) => `src/test/suite/${name}`),
    ];

    test('the DEV sources hold no literal invisible, format or combining characters', () => {
      const files = devSources();
      assert.ok(files.length >= 7, files.join(', '));
      assert.ok(files.some((file) => file.endsWith('.test.ts')), files.join(', '));
      for (const file of files) {
        readRepoFile(file).split('\n').forEach((line, index) => {
          const hidden = [...line].find((ch) => ch !== '\t' && ch !== '\r' && ch !== ' ' && HIDDEN.test(ch));
          assert.strictEqual(hidden, undefined, `${file}:${index + 1}: U+${hidden?.codePointAt(0)!.toString(16).toUpperCase()}`);
        });
      }
    });

    test('the DEV handlers evaluate nothing and use no process, file or network API', () => {
      const files = devSources().filter((file) => file.startsWith('src/handler/'));
      const forbidden = /\beval\s*\(|new\s+Function\b|child_process|\bimport\s*\(|\brequire\s*\(|from\s+'(node:)?(fs|http|https|net|dns|tls|dgram|child_process|worker_threads|vm)'/;
      for (const file of files) {
        // Comments may name what is not used; only the code is checked.
        const source = readRepoFile(file).replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
        assert.ok(!forbidden.test(source), `${file}: ${forbidden.exec(source)?.[0]}`);
        if (file !== 'src/handler/devCommandHandler.ts') {
          assert.ok(!/from 'vscode'/.test(source), `${file} must not depend on vscode`);
        }
      }
    });
  });

  suite('registration', () => {
    test('command IDs, kinds, titles and examples match the DEV commands of the showcase data, in its order', () => {
      const rows = dataRows();
      assert.strictEqual(rows.length, 35);
      // All 35 commands are implemented: 29 base commands (new editor) and 6 Replace variants.
      assert.deepStrictEqual(DEV_COMMAND_ENTRIES.map((entry) => entry.id), rows.map(([id]) => id));
      assert.strictEqual(DEV_COMMAND_ENTRIES.filter((entry) => entry.output === 'new-tab').length, 29);
      assert.strictEqual(DEV_COMMAND_ENTRIES.filter((entry) => entry.output === 'replace').length, 6);
      assert.strictEqual(Object.keys(DEV_ROADMAP_EXAMPLES).length, 35);
      const byId = new Map(rows.map((row) => [row[0], row]));
      const implemented = new Set(DEV_COMMAND_ENTRIES.map((entry) => entry.id));
      assert.deepStrictEqual(DEV_COMMAND_ENTRIES.map((entry) => entry.id), rows.map(([id]) => id).filter((id) => implemented.has(id)),
        'the ROADMAP rows, in their order');
      assert.deepStrictEqual(Object.keys(DEV_ROADMAP_EXAMPLES).sort(), [...implemented].sort(), 'an example for every command');
      for (const entry of DEV_COMMAND_ENTRIES) {
        const row = byId.get(entry.id);
        assert.ok(row, entry.id);
        const [id, kind, command, title, example] = row;
        if (entry.output === 'replace') {
          const baseEntry = DEV_COMMAND_ENTRIES.find((candidate) => `${candidate.name}.replace` === entry.name);
          assert.ok(baseEntry, id);
          assert.strictEqual(kind, `派生:${baseEntry.id}`, id);
          assert.strictEqual(entry.transform, baseEntry.transform, id);
          assert.strictEqual(entry.acceptsBlank, baseEntry.acceptsBlank, id);
          assert.strictEqual(entry.title, `${baseEntry.title} (Replace)`, id);
        } else {
          assert.strictEqual(kind, '基本', id);
        }
        assert.ok(entry.name.startsWith('programmatic.'), id);
        assert.strictEqual(command, `${PREFIX}${entry.name}`, id);
        assert.strictEqual(title, entry.title, id);
        const parts = example.split(' → ');
        assert.strictEqual(parts.length, 2, `${id}: ${example}`);
        const expected = DEV_ROADMAP_EXAMPLES[id];
        let input = expandNotation(codeSpan(parts[0]));
        const noted = /^(.*)（(.*)）$/s.exec(input);
        if (noted) {
          input = noted[1];
          assert.strictEqual(noted[2], expected.note, id);
        } else {
          assert.strictEqual(expected.note, undefined, id);
        }
        assert.strictEqual(input, expected.input, id);
        assert.strictEqual(expandNotation(codeSpan(parts[1])), expected.expected, id);
      }
    });

    // The wiring in extension.ts is checked statically (as for the other categories).
    test('extension.ts registers every command with devCommandHandler exactly once', () => {
      const source = readRepoFile('src/extension.ts');
      DEV_COMMAND_ENTRIES.forEach((entry) => {
        const registration = `registerTextEditorCommand('${PREFIX}${entry.name}', devCommandHandler('${entry.name}'))`;
        assert.strictEqual(source.split(registration).length - 1, 1, registration);
        assert.strictEqual(source.split(`'${PREFIX}${entry.name}'`).length - 1, 1, entry.name);
      });
    });

    test('package.json and the Show Commands list register every command exactly once', () => {
      const contributes = JSON.parse(readRepoFile('package.json')).contributes;
      type MenuItem = { command?: string; submenu?: string; group?: string; when?: string };
      const count = (entries: MenuItem[], id: string) => entries.filter((entry) => entry.command === id).length;
      DEV_COMMAND_ENTRIES.forEach((entry) => {
        const id = `${PREFIX}${entry.name}`;
        assert.strictEqual(count(contributes.commands, id), 1, `commands: ${id}`);
        assert.strictEqual(count(myCommands, id), 1, `showCommands: ${id}`);
        const command = contributes.commands.find((c: { command: string }) => c.command === id);
        assert.deepStrictEqual(command, { command: id, title: entry.title, category: 'Selection Manipulator' });
        const shown = myCommands.find((c) => c.command === id);
        assert.strictEqual(shown?.title, entry.title);
        assert.strictEqual(shown?.canMultiSelection, true);
        const palette = contributes.menus.commandPalette.filter((c: MenuItem) => c.command === id);
        assert.deepStrictEqual(palette, [{ when: 'editorHasSelection', command: id }], id);
        Object.entries(contributes.menus).filter(([name]) => name !== 'commandPalette').forEach(([name, items]) =>
          assert.strictEqual(count(items as MenuItem[], id), name === 'selection-manipulator.programmatic.submenu' ? 1 : 0, `${name}: ${id}`));
      });
      const ids = contributes.commands.map((c: { command: string }) => c.command);
      assert.strictEqual(new Set(ids).size, ids.length, 'command IDs are unique');
      const titles = contributes.commands.map((c: { title: string; category?: string }) => `${c.category ?? ''}:${c.title}`);
      assert.strictEqual(new Set(titles).size, titles.length, 'command titles are unique');
      const allTitles = myCommands.map((c) => c.title);
      assert.strictEqual(new Set(allTitles).size, allTitles.length, 'Show Commands titles are unique');
    });

    test('the Programmatic submenu keeps its existing commands first and then lists the DEV commands in ROADMAP order', () => {
      const contributes = JSON.parse(readRepoFile('package.json')).contributes;
      const items: { command: string; group: string }[] = contributes.menus['selection-manipulator.programmatic.submenu'];
      const existing = [
        'json-to-yaml', 'json-to-yaml.replace', 'yaml-to-json', 'yaml-to-json.replace',
        'hex-to-rgb', 'hex-to-rgb.replace', 'rgb-to-hex', 'rgb-to-hex.replace', 'toggle-quotes',
      ].map((name) => `${PREFIX}programmatic.${name}`);
      assert.deepStrictEqual(items.map((item) => item.command),
        [...existing, ...DEV_COMMAND_ENTRIES.map((entry) => `${PREFIX}${entry.name}`)]);
      items.forEach((item, i) => assert.strictEqual(item.group, `selection-manipulator@${i}`, item.command));
    });

    test('no dependency was added', () => {
      const packageJson = JSON.parse(readRepoFile('package.json'));
      assert.deepStrictEqual(Object.keys(packageJson.dependencies).sort(), ['change-case', 'diff', 'js-yaml', 'xml-formatter']);
    });
  });
});
