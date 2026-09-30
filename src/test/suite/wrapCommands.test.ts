import * as assert from 'assert';
import { SQL_BACKSLASH_REASON, SQL_YEN_SIGN_REASON } from '../../handler/sqlSafety';
import * as path from 'path';
import * as fs from 'fs';
import * as vscode from 'vscode';
import {
  wrapHandler,
  wrapHandlerInternal,
  wrapInputHandlerInternal,
  WrapNotifier,
} from '../../handler/wrapHandler';
import { myCommands } from '../../handler/showCommandsHandler';
import {
  isWrapContentCommand,
  isWrapInputCommand,
  MAX_ADDED_LENGTH,
  WRAP_COMMANDS,
  WRAP_CONTENT_COMMANDS,
  WrapCommand,
  WrapInputCommand,
} from '../../handler/wrapTransforms';
import { createTextEditor } from './testUtils';
import { candidateRows } from './showcaseData';

type Runner = (editor: vscode.TextEditor) => Promise<void>;

interface CommandCase {
  id: string;
  name: WrapCommand;
  /** Answers given to the input boxes in order (input commands only). */
  answers?: (string | undefined)[];
  input: string;
  expected: string;
  /** Two blocks, each selected by its own cursor (separated by a `---` line in the document). */
  multiInput: [string, string];
  multiExpected: [string, string];
  /** Commands enclosing the whole selection: what an empty selection inserts at the cursor. */
  emptyInsert?: string;
}

/** Runs the command; the fake input box answers in order and counts how often it is shown. */
const runnerFor = (
  c: CommandCase,
  onPrompt: (options: vscode.InputBoxOptions) => void | Thenable<unknown> = () => undefined,
  notifier?: WrapNotifier
): Runner => {
  if (isWrapInputCommand(c.name)) {
    const answers = [...(c.answers ?? [])];
    return wrapInputHandlerInternal(async (options) => {
      await onPrompt(options);
      return answers.shift();
    }, notifier)(c.name);
  }
  const name = c.name as Exclude<WrapCommand, WrapInputCommand>;
  return notifier ? wrapHandlerInternal(notifier)(name) : wrapHandler(name);
};

/** ROADMAP examples (⏎ = \n) plus two-block multi-cursor cases. */
const cases: CommandCase[] = [
  { id: 'WRAP-001', name: 'enclose.custom', answers: ['<<', '>>'], input: 'abc', expected: '<<abc>>', multiInput: ['a', 'b'], multiExpected: ['<<a>>', '<<b>>'], emptyInsert: '<<>>' },
  { id: 'WRAP-002', name: 'enclose.each-line.custom', answers: ['[', ']'], input: 'a\nb', expected: '[a]\n[b]', multiInput: ['a\nb', 'c'], multiExpected: ['[a]\n[b]', '[c]'] },
  { id: 'WRAP-003', name: 'quote.each-line.double', input: 'a\nb', expected: '"a"\n"b"', multiInput: ['a\nb', 'c'], multiExpected: ['"a"\n"b"', '"c"'] },
  { id: 'WRAP-004', name: 'quote.each-line.single', input: 'a\nb', expected: "'a'\n'b'", multiInput: ['a\nb', 'c'], multiExpected: ["'a'\n'b'", "'c'"] },
  { id: 'WRAP-005', name: 'quote.each-word.double', input: 'a b', expected: '"a" "b"', multiInput: ['a b', 'c'], multiExpected: ['"a" "b"', '"c"'] },
  { id: 'WRAP-006', name: 'quote.list.sql-in', input: "a\nO'Neil", expected: "('a', 'O''Neil')", multiInput: ['a\nb', 'c'], multiExpected: ["('a', 'b')", "('c')"] },
  { id: 'WRAP-007', name: 'quote.list.array', input: 'a\nb', expected: '["a", "b"]', multiInput: ['a\nb', 'c'], multiExpected: ['["a", "b"]', '["c"]'] },
  { id: 'WRAP-008', name: 'quote.triple-double', input: 'abc', expected: '"""abc"""', multiInput: ['a', 'b'], multiExpected: ['"""a"""', '"""b"""'], emptyInsert: '""""""' },
  { id: 'WRAP-009', name: 'quote.guillemets', input: 'abc', expected: '«abc»', multiInput: ['a', 'b'], multiExpected: ['«a»', '«b»'], emptyInsert: '«»' },
  { id: 'WRAP-010', name: 'quote.smart-double', input: 'abc', expected: '“abc”', multiInput: ['a', 'b'], multiExpected: ['“a”', '“b”'], emptyInsert: '“”' },
  { id: 'WRAP-011', name: 'quote.smart-single', input: 'abc', expected: '‘abc’', multiInput: ['a', 'b'], multiExpected: ['‘a’', '‘b’'], emptyInsert: '‘’' },
  { id: 'WRAP-012', name: 'quote.double-escaped', input: 'say "hi"', expected: '"say \\"hi\\""', multiInput: ['"a"', 'b\\'], multiExpected: ['"\\"a\\""', '"b\\\\"'], emptyInsert: '""' },
  { id: 'WRAP-013', name: 'unquote.each-line', input: '"a"\n\'b\'', expected: 'a\nb', multiInput: ['"a"', '`b`'], multiExpected: ['a', 'b'] },
  { id: 'WRAP-014', name: 'enclose.japanese.white-lenticular', input: '注意', expected: '〖注意〗', multiInput: ['a', 'b'], multiExpected: ['〖a〗', '〖b〗'], emptyInsert: '〖〗' },
  { id: 'WRAP-015', name: 'enclose.japanese.tortoise-shell', input: '注', expected: '〔注〕', multiInput: ['a', 'b'], multiExpected: ['〔a〕', '〔b〕'], emptyInsert: '〔〕' },
  { id: 'WRAP-016', name: 'enclose.japanese.double-angle', input: '書名', expected: '《書名》', multiInput: ['a', 'b'], multiExpected: ['《a》', '《b》'], emptyInsert: '《》' },
  { id: 'WRAP-017', name: 'enclose.japanese.single-angle', input: '論文', expected: '〈論文〉', multiInput: ['a', 'b'], multiExpected: ['〈a〉', '〈b〉'], emptyInsert: '〈〉' },
  { id: 'WRAP-018', name: 'enclose.html-tag', answers: ['b'], input: 'abc', expected: '<b>abc</b>', multiInput: ['a', 'b'], multiExpected: ['<b>a</b>', '<b>b</b>'], emptyInsert: '<b></b>' },
  { id: 'WRAP-019', name: 'enclose.html-comment', input: 'abc', expected: '<!-- abc -->', multiInput: ['a', 'b'], multiExpected: ['<!-- a -->', '<!-- b -->'], emptyInsert: '<!--  -->' },
  { id: 'WRAP-020', name: 'enclose.block-comment', input: 'abc', expected: '/* abc */', multiInput: ['a', 'b'], multiExpected: ['/* a */', '/* b */'], emptyInsert: '/*  */' },
  { id: 'WRAP-021', name: 'enclose.placeholder', input: 'name', expected: '${name}', multiInput: ['a', 'b'], multiExpected: ['${a}', '${b}'], emptyInsert: '${}' },
  { id: 'WRAP-022', name: 'enclose.mustache', input: 'name', expected: '{{ name }}', multiInput: ['a', 'b'], multiExpected: ['{{ a }}', '{{ b }}'], emptyInsert: '{{  }}' },
  { id: 'WRAP-023', name: 'enclose.percent', input: 'PATH', expected: '%PATH%', multiInput: ['a', 'b'], multiExpected: ['%a%', '%b%'], emptyInsert: '%%' },
  { id: 'WRAP-024', name: 'enclose.pipes', input: 'abc', expected: '|abc|', multiInput: ['a', 'b'], multiExpected: ['|a|', '|b|'], emptyInsert: '||' },
  { id: 'WRAP-025', name: 'enclose.ascii-box', input: 'abc', expected: '+-----+\n| abc |\n+-----+', multiInput: ['a', 'bb'], multiExpected: ['+---+\n| a |\n+---+', '+----+\n| bb |\n+----+'] },
  { id: 'WRAP-026', name: 'enclose.each-word.paren', input: 'a b', expected: '(a) (b)', multiInput: ['a b', 'c'], multiExpected: ['(a) (b)', '(c)'] },
  { id: 'WRAP-027', name: 'enclose.lines-block', answers: ['BEGIN', 'END'], input: 'a\nb', expected: 'BEGIN\na\nb\nEND', multiInput: ['a', 'b'], multiExpected: ['BEGIN\na\nEND', 'BEGIN\nb\nEND'] },
  { id: 'WRAP-028', name: 'enclose.cycle-brackets', input: '(a)', expected: '[a]', multiInput: ['(a)', '{b}'], multiExpected: ['[a]', '(b)'] },
  { id: 'WRAP-029', name: 'enclose.remove-outer-brackets', input: '((a))', expected: '(a)', multiInput: ['(a)', '「b」'], multiExpected: ['a', 'b'] },
  { id: 'WRAP-030', name: 'enclose.markdown-inline-code', input: 'a`b', expected: '``a`b``', multiInput: ['a', '`b'], multiExpected: ['`a`', '`` `b ``'], emptyInsert: '``' },
];

const SEPARATOR = '\n---\n';

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

const toCrlf = async (editor: vscode.TextEditor) => {
  await editor.edit((editBuilder) => editBuilder.setEndOfLine(vscode.EndOfLine.CRLF));
};

/**
 * Reverts and closes the editors opened by a test, so that the suites running after this
 * one do not inherit hundreds of dirty untitled documents.
 */
const closeAllEditors = async () => {
  for (let i = 0; i < 20 && vscode.window.visibleTextEditors.length > 0; i++) {
    await vscode.commands.executeCommand('workbench.action.revertAndCloseActiveEditor');
  }
};

const recordingNotifier = () => {
  const warnings: string[] = [];
  const errors: string[] = [];
  const notifier: WrapNotifier = {
    showWarningMessage: (message) => {
      warnings.push(message);
      return Promise.resolve(undefined);
    },
    showErrorMessage: (message) => {
      errors.push(message);
      return Promise.resolve(undefined);
    },
  };
  return { notifier, warnings, errors };
};

const caseOf = (name: WrapCommand): CommandCase => {
  const found = cases.find((c) => c.name === name);
  assert.ok(found, name);
  return found;
};

suite('Wrap Commands (WRAP-001..030) Test Suite', () => {

  teardown(closeAllEditors);

  test('the test table covers all 30 commands; empty-selection behaviour follows the command group', () => {
    assert.deepStrictEqual(cases.map((c) => c.name), [...WRAP_COMMANDS]);
    cases.forEach((c) => {
      assert.strictEqual(c.emptyInsert === undefined, isWrapContentCommand(c.name), c.id);
      assert.strictEqual(c.answers !== undefined, isWrapInputCommand(c.name), c.id);
    });
  });

  cases.forEach((c) => {
    suite(`${c.id} ${c.name}`, () => {
      test('representative case (ROADMAP example)', async () => {
        const editor = await createTextEditor(c.input);
        selectWholeDocument(editor);
        await runnerFor(c)(editor);
        assert.strictEqual(editor.document.getText(), c.expected);
      });

      test('multi-cursor converts each selection independently', async () => {
        const editor = await createTextEditor(c.multiInput.join(SEPARATOR));
        selectBlocks(editor, c.multiInput);
        let prompts = 0;
        await runnerFor(c, () => {
          prompts++;
        })(editor);
        assert.strictEqual(editor.document.getText(), c.multiExpected.join(SEPARATOR));
        assert.strictEqual(prompts, c.answers?.length ?? 0, 'the input boxes are shown once per value');
      });

      if (c.emptyInsert === undefined) {
        test('empty selection leaves the document unchanged without asking', async () => {
          const editor = await createTextEditor(c.input);
          editor.selection = new vscode.Selection(0, 0, 0, 0);
          let prompts = 0;
          await runnerFor(c, () => {
            prompts++;
          })(editor);
          assert.strictEqual(editor.document.getText(), c.input);
          assert.strictEqual(prompts, 0, 'no input box for empty selections');
        });
      } else {
        const emptyInsert = c.emptyInsert;
        test('empty selection inserts the pair at the cursor (like the existing Enclose / Quote)', async () => {
          const editor = await createTextEditor(c.input);
          editor.selection = new vscode.Selection(0, 0, 0, 0);
          await runnerFor(c)(editor);
          assert.strictEqual(editor.document.getText(), emptyInsert + c.input);
        });

        test('empty selections among multiple cursors get the pair too', async () => {
          const second = c.multiInput[1];
          const editor = await createTextEditor(`x\n${second}`);
          editor.selections = [new vscode.Selection(0, 1, 0, 1), new vscode.Selection(1, 0, 1, second.length)];
          await runnerFor(c)(editor);
          assert.strictEqual(editor.document.getText(), `x${emptyInsert}\n${c.multiExpected[1]}`);
        });
      }
    });
  });

  suite('input commands (WRAP-001 / WRAP-002 / WRAP-018 / WRAP-027)', () => {
    cases.filter((c) => isWrapInputCommand(c.name)).forEach((c) => {
      test(`${c.id} ${c.name}: cancelling the first input box leaves the document unchanged`, async () => {
        const editor = await createTextEditor(c.input);
        selectWholeDocument(editor);
        let prompts = 0;
        await runnerFor({ ...c, answers: [undefined, ...(c.answers ?? []).slice(1)] }, () => {
          prompts++;
        })(editor);
        assert.strictEqual(editor.document.getText(), c.input);
        assert.strictEqual(prompts, 1, 'no further input box after cancelling');
      });

      if ((c.answers ?? []).length === 2) {
        test(`${c.id} ${c.name}: cancelling the second input box leaves the document unchanged`, async () => {
          const editor = await createTextEditor(c.input);
          selectWholeDocument(editor);
          await runnerFor({ ...c, answers: [c.answers?.[0], undefined] })(editor);
          assert.strictEqual(editor.document.getText(), c.input);
        });
      }

      test(`${c.id} ${c.name}: an invalid answer (bypassing validateInput) leaves the document unchanged`, async () => {
        const invalid = c.name === 'enclose.html-tag' ? ['b onclick=x'] : ['a\nb', ']'];
        const editor = await createTextEditor(c.input);
        selectWholeDocument(editor);
        await runnerFor({ ...c, answers: invalid })(editor);
        assert.strictEqual(editor.document.getText(), c.input);
      });

      test(`${c.id} ${c.name}: the selection is read again after the input boxes close`, async () => {
        const editor = await createTextEditor(`x\n${c.input}`);
        const document = editor.document;
        editor.selection = new vscode.Selection(new vscode.Position(1, 0), document.lineAt(document.lineCount - 1).range.end);
        let edited = false;
        await runnerFor(c, async () => {
          if (!edited) {
            edited = true;
            // The document changes while the input box is shown.
            await editor.edit((editBuilder) => editBuilder.insert(new vscode.Position(0, 0), 'zz\n'));
          }
        })(editor);
        assert.strictEqual(editor.document.getText(), `zz\nx\n${c.expected}`);
      });
    });

    test('WRAP-018 rejects tag names other than letters, digits and hyphens', async () => {
      for (const tagName of ['b onclick=x', '<b>', 'a_b', '', 'script>', 'x'.repeat(65)]) {
        const editor = await createTextEditor('abc');
        selectWholeDocument(editor);
        await runnerFor({ ...caseOf('enclose.html-tag'), answers: [tagName] })(editor);
        assert.strictEqual(editor.document.getText(), 'abc', tagName);
      }
    });

    test('WRAP-001 / WRAP-002 with an empty prefix and suffix leave the document unchanged', async () => {
      for (const name of ['enclose.custom', 'enclose.each-line.custom'] as const) {
        const editor = await createTextEditor('a\nb');
        selectWholeDocument(editor);
        await runnerFor({ ...caseOf(name), answers: ['', ''] })(editor);
        assert.strictEqual(editor.document.getText(), 'a\nb', name);
      }
    });

    test('the input boxes get validateInput and a prompt', async () => {
      const seen: vscode.InputBoxOptions[] = [];
      const editor = await createTextEditor('a');
      selectWholeDocument(editor);
      for (const c of cases.filter((x) => isWrapInputCommand(x.name))) {
        await runnerFor(c, (options) => {
          seen.push(options);
        })(editor);
      }
      assert.strictEqual(seen.length, 7);
      seen.forEach((options) => {
        assert.ok(options.validateInput, options.prompt);
        assert.ok(options.prompt);
      });
      const tagOptions = seen.find((options) => options.prompt?.startsWith('Tag name'));
      assert.ok(tagOptions?.validateInput?.('b onclick=x'));
      assert.strictEqual(tagOptions?.validateInput?.('my-tag'), undefined);
      assert.ok(seen[0].validateInput?.('a\nb'));
      assert.ok(seen[0].validateInput?.('x'.repeat(1001)));
    });
  });

  suite('CRLF documents', () => {
    test('WRAP-003 quote.each-line.double keeps CRLF', async () => {
      const editor = await createTextEditor('a\nb\nc');
      await toCrlf(editor);
      selectWholeDocument(editor);
      await wrapHandler('quote.each-line.double')(editor);
      assert.strictEqual(editor.document.getText(), '"a"\r\n"b"\r\n"c"');
    });

    test('WRAP-025 enclose.ascii-box keeps CRLF', async () => {
      const editor = await createTextEditor('a\nbc');
      await toCrlf(editor);
      selectWholeDocument(editor);
      await wrapHandler('enclose.ascii-box')(editor);
      assert.strictEqual(editor.document.getText(), '+----+\r\n| a  |\r\n| bc |\r\n+----+');
    });

    test('WRAP-027 enclose.lines-block uses CRLF for the inserted lines', async () => {
      const editor = await createTextEditor('a\nb');
      await toCrlf(editor);
      selectWholeDocument(editor);
      await runnerFor(caseOf('enclose.lines-block'))(editor);
      assert.strictEqual(editor.document.getText(), 'BEGIN\r\na\r\nb\r\nEND');
    });
  });

  suite('whole-line selections', () => {
    test('WRAP-003 keeps the final line break of the selection', async () => {
      const editor = await createTextEditor('a\nb\nz');
      editor.selection = new vscode.Selection(0, 0, 2, 0);
      await wrapHandler('quote.each-line.double')(editor);
      assert.strictEqual(editor.document.getText(), '"a"\n"b"\nz');
    });

    test('WRAP-006 keeps the next line on its own line', async () => {
      const editor = await createTextEditor('a\nb\nz');
      editor.selection = new vscode.Selection(0, 0, 2, 0);
      await wrapHandler('quote.list.sql-in')(editor);
      assert.strictEqual(editor.document.getText(), "('a', 'b')\nz");
    });

    test('WRAP-027 puts the after line before the next line', async () => {
      const editor = await createTextEditor('a\nb\nz');
      editor.selection = new vscode.Selection(0, 0, 2, 0);
      await runnerFor(caseOf('enclose.lines-block'))(editor);
      assert.strictEqual(editor.document.getText(), 'BEGIN\na\nb\nEND\nz');
    });
  });

  suite('WRAP-006 backslash (MySQL default mode)', () => {
    const REASON = SQL_BACKSLASH_REASON;

    test('a selection with a backslash is left unchanged with one error', async () => {
      const { notifier, warnings, errors } = recordingNotifier();
      const text = "a\nO\\'Neil";
      const editor = await createTextEditor(text);
      selectWholeDocument(editor);
      await wrapHandlerInternal(notifier)('quote.list.sql-in')(editor);
      assert.strictEqual(editor.document.getText(), text);
      assert.deepStrictEqual([warnings, errors], [[], [`The selection was not changed: line 2 contains ${REASON}`]]);
    });

    test('one selection with a backslash among several changes none of them', async () => {
      const { notifier, errors } = recordingNotifier();
      const blocks: [string, string] = ["a\nO'Neil", 'C:\\Users'];
      const editor = await createTextEditor(blocks.join(SEPARATOR));
      selectBlocks(editor, blocks);
      await wrapHandlerInternal(notifier)('quote.list.sql-in')(editor);
      assert.strictEqual(editor.document.getText(), blocks.join(SEPARATOR));
      assert.deepStrictEqual(errors, [`The selection was not changed: line 1 contains ${REASON}`]);
    });

    test('a selection with a yen sign (saved as a backslash in Shift_JIS / EUC-JP) is left unchanged with one error', async () => {
      const { notifier, warnings, errors } = recordingNotifier();
      const text = "a\n\u00A5' OR 1=1 --";
      const editor = await createTextEditor(text);
      selectWholeDocument(editor);
      await wrapHandlerInternal(notifier)('quote.list.sql-in')(editor);
      assert.strictEqual(editor.document.getText(), text);
      assert.deepStrictEqual(
        [warnings, errors],
        [[], [`The selection was not changed: line 2 contains ${SQL_YEN_SIGN_REASON}`]]
      );
    });

    test('single quotes alone are still doubled', async () => {
      const { notifier, warnings, errors } = recordingNotifier();
      const editor = await createTextEditor("'; DROP TABLE t; --");
      selectWholeDocument(editor);
      await wrapHandlerInternal(notifier)('quote.list.sql-in')(editor);
      assert.strictEqual(editor.document.getText(), "('''; DROP TABLE t; --')");
      assert.deepStrictEqual([warnings, errors], [[], []]);
    });
  });

  suite('output size limit', () => {
    const explosive = `${'k'.repeat(100000)}${'\na'.repeat(2000)}`;

    test('WRAP-025 ascii-box over the limit leaves the document unchanged and warns once', async () => {
      const { notifier, warnings, errors } = recordingNotifier();
      const editor = await createTextEditor(explosive);
      selectWholeDocument(editor);
      await wrapHandlerInternal(notifier)('enclose.ascii-box')(editor);
      assert.strictEqual(editor.document.getText(), explosive);
      assert.strictEqual(warnings.length, 1);
      assert.ok(warnings[0].startsWith('The selection was not changed: the result would add '), warnings[0]);
      assert.ok(warnings[0].includes(`(limit: ${MAX_ADDED_LENGTH.toLocaleString('en-US')})`), warnings[0]);
      assert.deepStrictEqual(errors, []);
    });

    test('WRAP-002 (input command) over the limit leaves the document unchanged and warns once', async () => {
      const { notifier, warnings, errors } = recordingNotifier();
      const text = 'a\n'.repeat(6000);
      const editor = await createTextEditor(text);
      selectWholeDocument(editor);
      await runnerFor(
        { ...caseOf('enclose.each-line.custom'), answers: ['x'.repeat(1000), 'y'.repeat(1000)] },
        () => undefined,
        notifier
      )(editor);
      assert.strictEqual(editor.document.getText(), text);
      assert.strictEqual(warnings.length, 1);
      assert.deepStrictEqual(errors, []);
    });

    test('the limit is shared by all selections: nothing is edited when they exceed it together', async () => {
      const { notifier, warnings } = recordingNotifier();
      // Each block adds about 6,000,000 characters (below the limit alone, above it together).
      const block = `${'k'.repeat(60000)}${'\na'.repeat(100)}`;
      const editor = await createTextEditor([block, block].join(SEPARATOR));
      selectBlocks(editor, [block, block]);
      await wrapHandlerInternal(notifier)('enclose.ascii-box')(editor);
      assert.strictEqual(editor.document.getText(), [block, block].join(SEPARATOR));
      assert.strictEqual(warnings.length, 1);
    });

    test('a result within the limit is applied without notifications', async () => {
      const { notifier, warnings, errors } = recordingNotifier();
      const editor = await createTextEditor('a b');
      selectWholeDocument(editor);
      await wrapHandlerInternal(notifier)('quote.each-word.double')(editor);
      assert.strictEqual(editor.document.getText(), '"a" "b"');
      assert.deepStrictEqual([warnings, errors], [[], []]);
    });
  });

  // Running the commands through executeCommand would activate the extension inside the test
  // host, which makes the existing "(New Doc)" tests of other suites pick up the wrong document.
  // The wiring in extension.ts is therefore checked statically.
  test('extension.ts registers every command with the matching handler exactly once', () => {
    const source = fs.readFileSync(path.resolve(__dirname, '../../../src/extension.ts'), 'utf8');
    WRAP_COMMANDS.forEach((name) => {
      const handler = isWrapInputCommand(name) ? 'wrapInputHandler' : 'wrapHandler';
      const registration = `registerTextEditorCommand('selection-manipulator.${name}', ${handler}('${name}'))`;
      assert.strictEqual(source.split(registration).length - 1, 1, registration);
      assert.strictEqual(source.split(`'selection-manipulator.${name}'`).length - 1, 1, name);
    });
  });

  /** The WRAP commands of the showcase data (scripts/showcase-data/WRAP.json): [id, command ID, title]. */
  const dataRows = (): [string, string, string][] =>
    candidateRows('WRAP').map(([id, , command, title]): [string, string, string] => [id, command, title]);

  test('command IDs and titles match the WRAP commands of the showcase data', () => {
    const rows = dataRows();
    assert.deepStrictEqual(rows.map(([id]) => id), cases.map((c) => c.id));
    assert.deepStrictEqual(rows.map(([, command]) => command), WRAP_COMMANDS.map((name) => `selection-manipulator.${name}`));
  });

  test('package.json and the Show Commands list register all 30 commands exactly once', () => {
    const packageJson = JSON.parse(fs.readFileSync(path.resolve(__dirname, '../../../package.json'), 'utf8'));
    const contributes = packageJson.contributes;
    const count = (entries: { command?: string }[], id: string) => entries.filter((entry) => entry.command === id).length;
    const submenu: { command: string; group: string }[] = contributes.menus['selection-manipulator.quote.submenu'];
    const titles = new Map(dataRows().map(([, command, title]) => [command, title]));
    WRAP_COMMANDS.forEach((name, i) => {
      const id = `selection-manipulator.${name}`;
      assert.strictEqual(count(contributes.commands, id), 1, `commands: ${id}`);
      assert.strictEqual(count(submenu, id), 1, `submenu: ${id}`);
      assert.strictEqual(count(myCommands, id), 1, `showCommands: ${id}`);
      const command = contributes.commands.find((entry: { command: string }) => entry.command === id);
      assert.strictEqual(command.title, titles.get(id), id);
      assert.strictEqual(command.category, 'Selection Manipulator');
      const shown = myCommands.find((entry) => entry.command === id);
      assert.strictEqual(shown?.title, `Enclose - ${titles.get(id)}`);
      assert.strictEqual(shown?.canMultiSelection, true);
      // The existing 14 Enclose / Quote entries come first (@0..@13).
      assert.strictEqual(submenu[14 + i].command, id);
      assert.strictEqual(submenu[14 + i].group, `selection-manipulator@${14 + i}`);
      const palette = contributes.menus.commandPalette.filter((entry: { command: string }) => entry.command === id);
      if (WRAP_CONTENT_COMMANDS.includes(name)) {
        assert.deepStrictEqual(palette, [{ when: 'editorHasSelection', command: id }], id);
      } else {
        assert.deepStrictEqual(palette, [], id);
      }
    });
    assert.strictEqual(submenu.length, 44);
    const allTitles = myCommands.map((entry) => entry.title);
    assert.strictEqual(new Set(allTitles).size, allTitles.length, 'Show Commands titles are unique');
  });
});
