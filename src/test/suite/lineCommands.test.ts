import * as assert from 'assert';
import * as path from 'path';
import * as fs from 'fs';
import * as vscode from 'vscode';
import {
  lineCountStatsHandlerInternal,
  LineHandlerDeps,
  lineHandlerInternal,
  NO_LINES_BETWEEN_MARKERS_MESSAGE,
  NO_LINES_TO_COPY_MESSAGE,
} from '../../handler/lineHandler';
import { LINE_REGEX_WORKER_PATH } from '../../handler/lineRegex';
import { myCommands } from '../../handler/showCommandsHandler';
import {
  LINE_CLIPBOARD_COMMANDS,
  LINE_COMMANDS,
  LINE_INPUT_COMMANDS,
  LineCommand,
  LineTransformCommand,
} from '../../handler/lineTransforms';
import { createTextEditor } from './testUtils';

type Output = 'replace' | 'clipboard' | 'notify';

interface CommandCase {
  id: string;
  name: LineCommand;
  output: Output;
  /** Answers given to the input boxes, in order (input commands only). */
  answers?: string[];
  input: string;
  /** The document (replace), the clipboard (clipboard) or the notification (notify). */
  expected: string;
  /** Two blocks, each selected by its own cursor (separated by a `---` line in the document). */
  multiInput: [string, string];
  multiExpected: [string, string] | string;
}

const tenLines = 'a\nb\nc\nd\ne\nf\ng\nh\ni\nj';

const cases: CommandCase[] = [
  { id: 'LINE-001', name: 'filter-contains', output: 'replace', answers: ['an'], input: 'apple\nbanana\ncherry', expected: 'banana', multiInput: ['apple\nbanana', 'manx\nb'], multiExpected: ['banana', 'manx'] },
  { id: 'LINE-002', name: 'filter-not-contains', output: 'replace', answers: ['an'], input: 'apple\nbanana\ncherry', expected: 'apple\ncherry', multiInput: ['apple\nbanana', 'manx\nb'], multiExpected: ['apple', 'b'] },
  { id: 'LINE-003', name: 'filter-regex', output: 'replace', answers: ['\\d'], input: 'a1\nb\nc2', expected: 'a1\nc2', multiInput: ['a1\nb', 'c\nd2'], multiExpected: ['a1', 'd2'] },
  { id: 'LINE-004', name: 'filter-not-regex', output: 'replace', answers: ['\\d'], input: 'a1\nb\nc2', expected: 'b', multiInput: ['a1\nb', 'c\nd2'], multiExpected: ['b', 'c'] },
  { id: 'LINE-005', name: 'add-numbers', output: 'replace', input: 'a\nb', expected: '1: a\n2: b', multiInput: ['a\nb', 'c'], multiExpected: ['1: a\n2: b', '1: c'] },
  { id: 'LINE-006', name: 'add-numbers-padded', output: 'replace', input: tenLines, expected: '01 a\n02 b\n03 c\n04 d\n05 e\n06 f\n07 g\n08 h\n09 i\n10 j', multiInput: ['a\nb', 'c'], multiExpected: ['1 a\n2 b', '1 c'] },
  { id: 'LINE-007', name: 'keep-duplicates', output: 'replace', input: 'a\nb\na\nc\nb', expected: 'a\nb', multiInput: ['a\na', 'b\nb\nc'], multiExpected: ['a', 'b'] },
  { id: 'LINE-008', name: 'keep-unique-only', output: 'replace', input: 'a\nb\na', expected: 'b', multiInput: ['a\nb\na', 'c\nc\nd'], multiExpected: ['b', 'd'] },
  { id: 'LINE-009', name: 'dedupe-ignore-case', output: 'replace', input: 'Apple\napple\nb', expected: 'Apple\nb', multiInput: ['A\na', 'B\nb'], multiExpected: ['A', 'B'] },
  { id: 'LINE-010', name: 'dedupe-ignore-whitespace', output: 'replace', input: 'a\n  a\nb', expected: 'a\nb', multiInput: ['a\n a', 'b\nb '], multiExpected: ['a', 'b'] },
  { id: 'LINE-011', name: 'dedupe-adjacent', output: 'replace', input: 'a\na\nb\na', expected: 'a\nb\na', multiInput: ['a\na', 'b\nb\nc'], multiExpected: ['a', 'b\nc'] },
  { id: 'LINE-012', name: 'reverse-words', output: 'replace', input: 'a b c\nd e', expected: 'c b a\ne d', multiInput: ['a b', 'c d e'], multiExpected: ['b a', 'e d c'] },
  { id: 'LINE-013', name: 'rotate', output: 'replace', input: 'a\nb\nc', expected: 'c\na\nb', multiInput: ['a\nb', 'c\nd\ne'], multiExpected: ['b\na', 'e\nc\nd'] },
  { id: 'LINE-014', name: 'keep-every-nth', output: 'replace', answers: ['2'], input: 'a\nb\nc\nd', expected: 'b\nd', multiInput: ['a\nb', 'c\nd\ne\nf'], multiExpected: ['b', 'd\nf'] },
  { id: 'LINE-015', name: 'remove-every-nth', output: 'replace', answers: ['2'], input: 'a\nb\nc\nd', expected: 'a\nc', multiInput: ['a\nb', 'c\nd\ne\nf'], multiExpected: ['a', 'c\ne'] },
  { id: 'LINE-016', name: 'keep-odd', output: 'replace', input: 'a\nb\nc', expected: 'a\nc', multiInput: ['a\nb', 'c\nd\ne'], multiExpected: ['a', 'c\ne'] },
  { id: 'LINE-017', name: 'keep-even', output: 'replace', input: 'a\nb\nc', expected: 'b', multiInput: ['a\nb', 'c\nd\ne'], multiExpected: ['b', 'd'] },
  { id: 'LINE-018', name: 'head', output: 'replace', answers: ['2'], input: 'a\nb\nc', expected: 'a\nb', multiInput: ['a\nb\nc', 'd\ne\nf'], multiExpected: ['a\nb', 'd\ne'] },
  { id: 'LINE-019', name: 'tail', output: 'replace', answers: ['2'], input: 'a\nb\nc', expected: 'b\nc', multiInput: ['a\nb\nc', 'd\ne\nf'], multiExpected: ['b\nc', 'e\nf'] },
  { id: 'LINE-020', name: 'duplicate-each', output: 'replace', input: 'a\nb', expected: 'a\na\nb\nb', multiInput: ['a', 'b\nc'], multiExpected: ['a\na', 'b\nb\nc\nc'] },
  { id: 'LINE-021', name: 'swap-pairs', output: 'replace', input: 'a\nb\nc\nd\ne', expected: 'b\na\nd\nc\ne', multiInput: ['a\nb', 'c\nd\ne'], multiExpected: ['b\na', 'd\nc\ne'] },
  { id: 'LINE-022', name: 'join-continuation', output: 'replace', input: 'ls \\\n  -l\npwd', expected: 'ls -l\npwd', multiInput: ['a \\\nb', 'c\\\\\nd'], multiExpected: ['a b', 'c\\\\\nd'] },
  { id: 'LINE-023', name: 'move-matching-to-top', output: 'replace', answers: ['x'], input: 'b\nx1\nc\nx2', expected: 'x1\nx2\nb\nc', multiInput: ['a\nxb', 'c\nxd'], multiExpected: ['xb\na', 'xd\nc'] },
  { id: 'LINE-024', name: 'remove-prefix', output: 'replace', answers: ['- '], input: '- a\n- b', expected: 'a\nb', multiInput: ['- a', '- b\nc'], multiExpected: ['a', 'b\nc'] },
  { id: 'LINE-025', name: 'remove-suffix', output: 'replace', answers: [';'], input: 'a;\nb;', expected: 'a\nb', multiInput: ['a;', 'b;\nc'], multiExpected: ['a', 'b\nc'] },
  { id: 'LINE-026', name: 'interleave-halves', output: 'replace', input: 'a\nb\n1\n2', expected: 'a\n1\nb\n2', multiInput: ['a\nb', 'c\nd\n1\n2'], multiExpected: ['a\nb', 'c\n1\nd\n2'] },
  { id: 'LINE-027', name: 'join-every-n', output: 'replace', answers: ['2', ','], input: 'a\nb\nc\nd', expected: 'a,b\nc,d', multiInput: ['a\nb', 'c\nd\ne'], multiExpected: ['a,b', 'c,d\ne'] },
  { id: 'LINE-028', name: 'split-sentences', output: 'replace', input: 'Hello. Bye!', expected: 'Hello.\nBye!', multiInput: ['A. B', 'C! D'], multiExpected: ['A.\nB', 'C!\nD'] },
  { id: 'LINE-029', name: 'split-fixed-width', output: 'replace', answers: ['2'], input: 'abcdef', expected: 'ab\ncd\nef', multiInput: ['abc', 'defg'], multiExpected: ['ab\nc', 'de\nfg'] },
  { id: 'LINE-030', name: 'remove-comment-lines', output: 'replace', input: '# a\nb\n// c', expected: 'b', multiInput: ['# a\nb', 'c\n// d'], multiExpected: ['b', 'c'] },
  { id: 'LINE-031', name: 'count-stats', output: 'notify', input: 'a b\nc', expected: '2 lines, 3 words, 5 chars', multiInput: ['a b', 'c'], multiExpected: '2 lines, 3 words, 4 chars (2 selections)' },
  { id: 'LINE-032', name: 'extract-between-markers', output: 'replace', answers: ['BEGIN', 'END'], input: 'x\nBEGIN\na\nEND\ny', expected: 'a', multiInput: ['BEGIN\na\nEND', 'x\nBEGIN\nb'], multiExpected: ['a', 'b'] },
  { id: 'LINE-033', name: 'extract-longest', output: 'replace', input: 'a\nabc\nab', expected: 'abc', multiInput: ['a\nab', 'abc\nb'], multiExpected: ['ab', 'abc'] },
  { id: 'LINE-034', name: 'extract-shortest', output: 'replace', input: 'abc\na\nab', expected: 'a', multiInput: ['ab\na', 'abc\nb'], multiExpected: ['a', 'b'] },
  { id: 'LINE-035', name: 'filter-contains', output: 'clipboard', answers: ['an'], input: 'apple\nbanana\ncherry', expected: 'banana', multiInput: ['apple\nbanana', 'manx\nb'], multiExpected: 'banana\nmanx' },
  { id: 'LINE-036', name: 'filter-regex', output: 'clipboard', answers: ['\\d'], input: 'a1\nb\nc2', expected: 'a1\nc2', multiInput: ['a1\nb', 'c\nd2'], multiExpected: 'a1\nd2' },
  { id: 'LINE-037', name: 'keep-duplicates', output: 'clipboard', input: 'a\nb\na\nc\nb', expected: 'a\nb', multiInput: ['a\na', 'b\nb\nc'], multiExpected: 'a\nb' },
  { id: 'LINE-038', name: 'keep-unique-only', output: 'clipboard', input: 'a\nb\na', expected: 'b', multiInput: ['a\nb\na', 'c\nc\nd'], multiExpected: 'b\nd' },
  { id: 'LINE-039', name: 'dedupe-adjacent', output: 'clipboard', input: 'a\na\nb\na', expected: 'a\nb\na', multiInput: ['a\na', 'b\nb\nc'], multiExpected: 'a\nb\nc' },
  { id: 'LINE-040', name: 'extract-between-markers', output: 'clipboard', answers: ['BEGIN', 'END'], input: 'x\nBEGIN\na\nEND\ny', expected: 'a', multiInput: ['BEGIN\na\nEND', 'x\nBEGIN\nb'], multiExpected: 'a\nb' },
];

const commandId = (c: { name: LineCommand; output: Output }) =>
  `selection-manipulator.line.${c.name}${c.output === 'clipboard' ? '.clipboard' : ''}`;

/** Records everything the handler does through its dependencies. */
const recorder = (answers: (string | undefined)[] = [], overrides: Partial<LineHandlerDeps> = {}) => {
  const record = {
    prompts: [] as vscode.InputBoxOptions[],
    infos: [] as string[],
    warnings: [] as string[],
    errors: [] as string[],
    clipboard: [] as string[],
  };
  const queue = [...answers];
  const deps: Partial<LineHandlerDeps> = {
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
    ...overrides,
  };
  return { deps, record };
};

const runnerFor = (c: { name: LineCommand; output: Output }, deps: Partial<LineHandlerDeps>) =>
  c.name === 'count-stats'
    ? lineCountStatsHandlerInternal(deps)
    : lineHandlerInternal(deps)(c.name as LineTransformCommand, c.output === 'clipboard' ? 'clipboard' : 'replace');

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

/** Reverts and closes the editors opened by a test (see whitespaceCommands.test.ts). */
const closeAllEditors = async () => {
  for (let i = 0; i < 20 && vscode.window.visibleTextEditors.length > 0; i++) {
    await vscode.commands.executeCommand('workbench.action.revertAndCloseActiveEditor');
  }
};

/** Runs a command on `text` with the given selections and returns the document text and the record. */
const runOn = async (
  c: { name: LineCommand; output: Output },
  answers: string[],
  text: string,
  selections: vscode.Selection[],
  crlf = false,
  overrides: Partial<LineHandlerDeps> = {}
) => {
  const editor = await createTextEditor(text);
  if (crlf) {
    await toCrlf(editor);
  }
  editor.selections = selections;
  const { deps, record } = recorder(answers, overrides);
  await runnerFor(c, deps)(editor);
  return { text: editor.document.getText(), record };
};

const sel = (startLine: number, startCharacter: number, endLine: number, endCharacter: number) =>
  new vscode.Selection(startLine, startCharacter, endLine, endCharacter);

suite('Line Commands (LINE-001..040) Test Suite', () => {

  teardown(closeAllEditors);

  test('the test table covers all 40 commands in ROADMAP order', () => {
    assert.strictEqual(cases.length, 40);
    assert.deepStrictEqual(cases.slice(0, 34).map((c) => c.name), LINE_COMMANDS);
    assert.deepStrictEqual(cases.slice(34).map((c) => c.name), LINE_CLIPBOARD_COMMANDS);
    cases.forEach((c, i) => assert.strictEqual(c.id, `LINE-${String(i + 1).padStart(3, '0')}`));
    cases.forEach((c) => assert.strictEqual(
      (c.answers ?? []).length > 0,
      (LINE_INPUT_COMMANDS as LineCommand[]).includes(c.name),
      c.id
    ));
  });

  cases.forEach((c) => {
    suite(`${c.id} ${commandId(c)}`, () => {
      test('representative case (ROADMAP example)', async () => {
        const editor = await createTextEditor(c.input);
        selectWholeDocument(editor);
        const { deps, record } = recorder(c.answers);
        await runnerFor(c, deps)(editor);
        if (c.output === 'replace') {
          assert.strictEqual(editor.document.getText(), c.expected);
          assert.deepStrictEqual(record.clipboard, []);
        } else {
          assert.strictEqual(editor.document.getText(), c.input, 'the editor is not changed');
          if (c.output === 'clipboard') {
            assert.deepStrictEqual(record.clipboard, [c.expected]);
            assert.deepStrictEqual(record.infos, [], 'no notification on success');
          } else {
            assert.deepStrictEqual(record.infos, [c.expected]);
          }
        }
        assert.deepStrictEqual([record.warnings, record.errors], [[], []]);
      });

      test('empty selection does nothing (no input box)', async () => {
        const editor = await createTextEditor(c.input);
        editor.selection = new vscode.Selection(0, 0, 0, 0);
        const { deps, record } = recorder(c.answers);
        await runnerFor(c, deps)(editor);
        assert.strictEqual(editor.document.getText(), c.input);
        assert.deepStrictEqual([record.prompts.length, record.clipboard, record.infos], [0, [], []]);
      });

      test('multi-cursor transforms each selection independently and asks once', async () => {
        const document = c.multiInput.join(SEPARATOR);
        const editor = await createTextEditor(document);
        selectBlocks(editor, c.multiInput);
        const { deps, record } = recorder(c.answers);
        await runnerFor(c, deps)(editor);
        if (c.output === 'replace') {
          assert.strictEqual(editor.document.getText(), (c.multiExpected as string[]).join(SEPARATOR));
        } else {
          assert.strictEqual(editor.document.getText(), document);
          assert.deepStrictEqual(c.output === 'clipboard' ? record.clipboard : record.infos, [c.multiExpected]);
        }
        assert.strictEqual(record.prompts.length, (c.answers ?? []).length, 'each value is asked once');
      });
    });
  });

  suite('input commands', () => {
    const inputCases = cases.filter((c) => c.answers !== undefined);

    inputCases.forEach((c) => {
      c.answers?.forEach((_, step) => {
        test(`${c.id}: cancelling input ${step + 1} leaves everything unchanged`, async () => {
          const answers: (string | undefined)[] = [...(c.answers ?? [])];
          answers[step] = undefined;
          const editor = await createTextEditor(c.input);
          selectWholeDocument(editor);
          const { deps, record } = recorder(answers);
          await runnerFor(c, deps)(editor);
          assert.strictEqual(editor.document.getText(), c.input);
          assert.deepStrictEqual(record.clipboard, []);
          assert.strictEqual(record.prompts.length, step + 1, 'no further input box after cancelling');
        });

        test(`${c.id}: an invalid input ${step + 1} (bypassing validateInput) leaves everything unchanged`, async () => {
          const answers = [...(c.answers ?? [])];
          const prompt = step;
          // Numbers reject 0, regular expressions a syntax error, texts / delimiters a line break.
          answers[prompt] = /^[0-9]+$/.test(answers[prompt]) ? '0'
            : c.name === 'filter-regex' || c.name === 'filter-not-regex' ? '(' : 'a\nb';
          const editor = await createTextEditor(c.input);
          selectWholeDocument(editor);
          const { deps, record } = recorder(answers);
          await runnerFor(c, deps)(editor);
          assert.strictEqual(editor.document.getText(), c.input);
          assert.deepStrictEqual([record.clipboard, record.warnings, record.errors], [[], [], []]);
        });
      });
    });

    test('every input box gets validateInput; counts and delimiters have default values', async () => {
      const seen = new Map<string, vscode.InputBoxOptions[]>();
      for (const c of inputCases) {
        const { deps, record } = recorder(c.answers);
        const editor = await createTextEditor(c.input);
        selectWholeDocument(editor);
        await runnerFor(c, deps)(editor);
        seen.set(c.id, record.prompts);
        record.prompts.forEach((options) => assert.ok(options.validateInput, `${c.id}: ${options.prompt}`));
      }
      assert.strictEqual(seen.get('LINE-014')?.[0].value, '2');
      assert.strictEqual(seen.get('LINE-018')?.[0].value, '10');
      assert.strictEqual(seen.get('LINE-029')?.[0].value, '80');
      assert.deepStrictEqual(seen.get('LINE-027')?.map((options) => options.value), ['2', ',']);
      assert.strictEqual(seen.get('LINE-027')?.[1].validateInput?.(''), undefined, 'an empty delimiter is allowed');
      assert.strictEqual(seen.get('LINE-014')?.[0].validateInput?.('1000001'), 'Enter an integer from 1 to 1,000,000');
      assert.ok(seen.get('LINE-003')?.[0].validateInput?.('('));
      assert.ok(seen.get('LINE-003')?.[0].validateInput?.('a'.repeat(501)));
      assert.ok(seen.get('LINE-001')?.[0].validateInput?.(''));
      assert.strictEqual(seen.get('LINE-032')?.length, 2);
    });
  });

  suite('CRLF documents', () => {
    test('LINE-013 rotate joins with CRLF', async () => {
      const { text } = await runOn({ name: 'rotate', output: 'replace' }, [], 'a\nb\nc\nnext', [sel(0, 0, 3, 0)], true);
      assert.strictEqual(text, 'c\r\na\r\nb\r\nnext');
    });

    test('LINE-020 duplicate-each joins with CRLF', async () => {
      const { text } = await runOn({ name: 'duplicate-each', output: 'replace' }, [], 'a\nb', [sel(0, 0, 1, 1)], true);
      assert.strictEqual(text, 'a\r\na\r\nb\r\nb');
    });

    test('LINE-022 join-continuation keeps CRLF', async () => {
      const { text } = await runOn({ name: 'join-continuation', output: 'replace' }, [], 'ls \\\n  -l\npwd', [sel(0, 0, 2, 3)], true);
      assert.strictEqual(text, 'ls -l\r\npwd');
    });

    test('LINE-035 joins the selections with CRLF', async () => {
      const blocks: [string, string] = ['a1\nb', 'a2'];
      const editor = await createTextEditor(blocks.join(SEPARATOR));
      await toCrlf(editor);
      const document = editor.document;
      editor.selections = [
        new vscode.Selection(0, 0, 1, 1),
        new vscode.Selection(3, 0, 3, 2),
      ];
      const { deps, record } = recorder(['a']);
      await runnerFor({ name: 'filter-contains', output: 'clipboard' }, deps)(editor);
      assert.deepStrictEqual(record.clipboard, ['a1\r\na2']);
      assert.strictEqual(document.getText(), 'a1\r\nb\r\n---\r\na2');
    });
  });

  suite('selections starting / ending in the middle of a line (lines are never joined)', () => {
    const removeQ = { name: 'filter-not-contains' as const, output: 'replace' as const };

    test('LINE-002: the partial first line stays and keeps its line break', async () => {
      // xx|q1⏎q2⏎|next
      assert.strictEqual((await runOn(removeQ, ['q'], 'xxq1\nq2\nnext', [sel(0, 2, 2, 0)])).text, 'xxq1\nnext');
      // xx|q1⏎q2|⏎next (ends at the end of a line)
      assert.strictEqual((await runOn(removeQ, ['q'], 'xxq1\nq2\nnext', [sel(0, 2, 1, 2)])).text, 'xxq1\nnext');
      // xx|q1⏎q2| (end of the document)
      assert.strictEqual((await runOn(removeQ, ['q'], 'xxq1\nq2', [sel(0, 2, 1, 2)])).text, 'xxq1');
      // Non-empty result.
      assert.strictEqual((await runOn(removeQ, ['q'], 'xxq1\nq2\nb\nnext', [sel(0, 2, 3, 0)])).text, 'xxq1\nb\nnext');
    });

    test('LINE-002: both partial lines stay with one line break between them', async () => {
      // xx|q1⏎q2⏎q3|yy
      assert.strictEqual((await runOn(removeQ, ['q'], 'xxq1\nq2\nq3yy', [sel(0, 2, 2, 2)])).text, 'xxq1\nq3yy');
    });

    test('LINE-002: whole lines and selections from the start of a line', async () => {
      // |q1⏎q2⏎|next
      assert.strictEqual((await runOn(removeQ, ['q'], 'q1\nq2\nnext', [sel(0, 0, 2, 0)])).text, 'next');
      // |q1⏎q2⏎zz|zz
      assert.strictEqual((await runOn(removeQ, ['q'], 'q1\nq2\nzzzz', [sel(0, 0, 2, 2)])).text, 'zzzz');
      // |q1⏎q2| at the end of the document
      assert.strictEqual((await runOn(removeQ, ['q'], 'x\nq1\nq2', [sel(1, 0, 2, 2)])).text, 'x\n');
    });

    test('LINE-002: CRLF documents and reversed selections', async () => {
      assert.strictEqual((await runOn(removeQ, ['q'], 'xxq1\nq2\nnext', [sel(0, 2, 2, 0)], true)).text, 'xxq1\r\nnext');
      assert.strictEqual((await runOn(removeQ, ['q'], 'xxq1\nq2\nq3yy', [sel(0, 2, 2, 2)], true)).text, 'xxq1\r\nq3yy');
      assert.strictEqual((await runOn(removeQ, ['q'], 'xxq1\nq2\nq3yy', [sel(2, 2, 0, 2)])).text, 'xxq1\nq3yy');
    });

    test('LINE-013: the partial lines are not moved', async () => {
      const rotate = { name: 'rotate' as const, output: 'replace' as const };
      assert.strictEqual((await runOn(rotate, [], 'xxa\nb\nc\nd', [sel(0, 2, 3, 0)])).text, 'xxa\nc\nb\nd');
      assert.strictEqual((await runOn(rotate, [], 'xxa\nb\nc\ndyy', [sel(0, 2, 3, 1)])).text, 'xxa\nc\nb\ndyy');
      assert.strictEqual((await runOn(rotate, [], 'xxa\nb\nc\ndyy', [sel(3, 1, 0, 2)], true)).text, 'xxa\r\nc\r\nb\r\ndyy');
    });

    test('LINE-005: the partial lines are not numbered and not counted', async () => {
      const numbers = { name: 'add-numbers' as const, output: 'replace' as const };
      assert.strictEqual((await runOn(numbers, [], 'xxa\nb\nc', [sel(0, 2, 2, 1)])).text, 'xxa\n1: b\n2: c');
      assert.strictEqual((await runOn(numbers, [], 'xxa\nb\ncyy', [sel(0, 2, 2, 1)])).text, 'xxa\n1: b\ncyy');
    });

    test('LINE-033: the partial lines are not candidates and stay', async () => {
      const longest = { name: 'extract-longest' as const, output: 'replace' as const };
      assert.strictEqual((await runOn(longest, [], 'xxa\nbbb\ncc\nnext', [sel(0, 2, 3, 0)])).text, 'xxa\nbbb\nnext');
      assert.strictEqual((await runOn(longest, [], 'a\nbbb\nzzzzzzz', [sel(0, 0, 2, 2)])).text, 'bbb\nzzzzzzz');
    });

    test('only a partial first line (no middle line): nothing changes', async () => {
      assert.strictEqual((await runOn(removeQ, ['q'], 'xxq1\nnext', [sel(0, 2, 1, 0)])).text, 'xxq1\nnext');
    });

    test('a selection inside one line is transformed as one line', async () => {
      assert.strictEqual((await runOn(removeQ, ['q'], 'xxq1yy', [sel(0, 2, 0, 4)])).text, 'xxyy');
    });

    test('category A (LINE-012 / LINE-027) transforms the partial lines as lines', async () => {
      assert.strictEqual(
        (await runOn({ name: 'reverse-words', output: 'replace' }, [], 'xxa b\nc d', [sel(0, 2, 1, 1)])).text,
        'xxb a\nc d'
      );
      assert.strictEqual(
        (await runOn({ name: 'join-every-n', output: 'replace' }, ['2', ','], 'xxa\nb\nc', [sel(0, 2, 2, 0)])).text,
        'xxa,b\nc'
      );
    });
  });

  suite('clipboard versions (LINE-035..040)', () => {
    const copyContaining = { name: 'filter-contains' as const, output: 'clipboard' as const };
    const copyBetween = { name: 'extract-between-markers' as const, output: 'clipboard' as const };

    test('results are joined without a final line break; empty results are left out', async () => {
      const blocks: [string, string] = ['a\nb\n', 'c'];
      const editor = await createTextEditor(blocks.join(SEPARATOR));
      selectBlocks(editor, blocks);
      const { deps, record } = recorder(['a']);
      await runnerFor(copyContaining, deps)(editor);
      assert.deepStrictEqual(record.clipboard, ['a']);
    });

    test('nothing to copy: the clipboard is not written and the user is told', async () => {
      const { text, record } = await runOn(copyContaining, ['zzz'], 'a\nb', [sel(0, 0, 1, 1)]);
      assert.strictEqual(text, 'a\nb');
      assert.deepStrictEqual(record.clipboard, []);
      assert.deepStrictEqual(record.infos, [NO_LINES_TO_COPY_MESSAGE]);
    });

    test('LINE-037..039 use the same message when every result is empty', async () => {
      const { record } = await runOn({ name: 'keep-duplicates', output: 'clipboard' }, [], 'a\nb', [sel(0, 0, 1, 1)]);
      assert.deepStrictEqual([record.clipboard, record.infos], [[], [NO_LINES_TO_COPY_MESSAGE]]);
    });

    test('LINE-040: selections without a start marker are left out', async () => {
      const blocks: [string, string] = ['BEGIN\na\nEND', 'x\ny'];
      const editor = await createTextEditor(blocks.join(SEPARATOR));
      selectBlocks(editor, blocks);
      const { deps, record } = recorder(['BEGIN', 'END']);
      await runnerFor(copyBetween, deps)(editor);
      assert.deepStrictEqual(record.clipboard, ['a']);
    });

    test('LINE-040: no start marker anywhere', async () => {
      const { record } = await runOn(copyBetween, ['BEGIN', 'END'], 'a\nb', [sel(0, 0, 1, 1)]);
      assert.deepStrictEqual([record.clipboard, record.infos], [[], [NO_LINES_BETWEEN_MARKERS_MESSAGE]]);
    });

    test('LINE-040: start markers but no lines between the markers gives the same message', async () => {
      const blocks: [string, string] = ['BEGIN\nEND', 'BEGIN'];
      const editor = await createTextEditor(blocks.join(SEPARATOR));
      selectBlocks(editor, blocks);
      const { deps, record } = recorder(['BEGIN', 'END']);
      await runnerFor(copyBetween, deps)(editor);
      assert.deepStrictEqual([record.clipboard, record.infos], [[], ['No lines were found between the markers']]);
    });

    test('the position of the selection is not used (a partial first line is filtered like any line)', async () => {
      // The replace version keeps `a` (start anchor); the clipboard version filters it out.
      const replaced = await runOn({ name: 'filter-contains', output: 'replace' }, ['q'], 'xxa\nq\nnext', [sel(0, 2, 2, 0)]);
      assert.strictEqual(replaced.text, 'xxa\nq\nnext');
      const copied = await runOn(copyContaining, ['q'], 'xxa\nq\nnext', [sel(0, 2, 2, 0)]);
      assert.deepStrictEqual(copied.record.clipboard, ['q']);
      assert.strictEqual(copied.text, 'xxa\nq\nnext');
    });
  });

  suite('LINE-032 extract-between-markers (replace)', () => {
    const extract = { name: 'extract-between-markers' as const, output: 'replace' as const };

    test('no start marker in any selection: unchanged, and the user is told', async () => {
      const { text, record } = await runOn(extract, ['BEGIN', 'END'], 'a\nb', [sel(0, 0, 1, 1)]);
      assert.strictEqual(text, 'a\nb');
      assert.deepStrictEqual(record.infos, [NO_LINES_BETWEEN_MARKERS_MESSAGE]);
    });

    test('selections without a start marker are left unchanged, the others are extracted', async () => {
      const blocks: [string, string] = ['x\ny', 'BEGIN\nb\nEND'];
      const editor = await createTextEditor(blocks.join(SEPARATOR));
      selectBlocks(editor, blocks);
      const { deps, record } = recorder(['BEGIN', 'END']);
      await runnerFor(extract, deps)(editor);
      assert.strictEqual(editor.document.getText(), `x\ny${SEPARATOR}b`);
      assert.deepStrictEqual(record.infos, []);
    });
  });

  suite('LINE-031 count-stats', () => {
    test('CRLF line breaks count as one character', async () => {
      const { record } = await runOn({ name: 'count-stats', output: 'notify' }, [], 'a b\nc', [sel(0, 0, 1, 1)], true);
      assert.deepStrictEqual(record.infos, ['2 lines, 3 words, 5 chars']);
    });
  });

  suite('regular expressions (LINE-003 / 004 / 036)', () => {
    const keepRegex = { name: 'filter-regex' as const, output: 'replace' as const };

    test('the worker script is shipped next to the handler', () => {
      assert.ok(fs.existsSync(LINE_REGEX_WORKER_PATH), LINE_REGEX_WORKER_PATH);
      assert.strictEqual(path.basename(LINE_REGEX_WORKER_PATH), 'lineRegexWorker.js');
    });

    test('the u flag and case-sensitive matching', async () => {
      const { text } = await runOn(keepRegex, ['^\\p{Lu}'], 'Apple\nbanana\nÉcole', [sel(0, 0, 2, 5)]);
      assert.strictEqual(text, 'Apple\nÉcole');
    });

    test('a catastrophic pattern is stopped after the time limit and nothing is edited', async () => {
      const input = `${'a'.repeat(34)}b\nc`;
      const started = Date.now();
      const { text, record } = await runOn(keepRegex, ['^(a+)+$'], input, [sel(0, 0, 1, 1)], false, { regexTimeoutMs: 200 });
      const elapsed = Date.now() - started;
      assert.strictEqual(text, input);
      assert.deepStrictEqual(record.warnings, [
        'The selection was not changed: The regular expression did not finish within 200 ms and was stopped.',
      ]);
      assert.deepStrictEqual(record.errors, []);
      assert.ok(elapsed < 5000, `finished in ${elapsed} ms`);
    });

    test('the clipboard version is stopped the same way', async () => {
      const input = `${'a'.repeat(34)}b`;
      const { record } = await runOn({ name: 'filter-regex', output: 'clipboard' }, ['^(a+)+$'], input, [sel(0, 0, 0, 35)], false, { regexTimeoutMs: 200 });
      assert.deepStrictEqual(record.clipboard, []);
      assert.deepStrictEqual(record.warnings, [
        'The clipboard was not changed: The regular expression did not finish within 200 ms and was stopped.',
      ]);
    });

    test('a failing worker shows an error and edits nothing', async () => {
      const { text, record } = await runOn(keepRegex, ['a'], 'a\nb', [sel(0, 0, 1, 1)], false, {
        runRegex: () => Promise.reject(new Error('boom')),
      });
      assert.strictEqual(text, 'a\nb');
      assert.deepStrictEqual(record.errors, ['The selection was not changed: boom']);
    });

    test('the pattern is run once for all selections', async () => {
      let calls = 0;
      const blocks: [string, string] = ['a1\nb', 'c\nd2'];
      const editor = await createTextEditor(blocks.join(SEPARATOR));
      selectBlocks(editor, blocks);
      const { deps } = recorder(['\\d'], {
        runRegex: (pattern, lines) => {
          calls++;
          assert.deepStrictEqual(lines, ['a1', 'b', 'c', 'd2']);
          return Promise.resolve(lines.map((line) => new RegExp(pattern, 'u').test(line)));
        },
      });
      await runnerFor(keepRegex, deps)(editor);
      assert.strictEqual(calls, 1);
      assert.strictEqual(editor.document.getText(), `a1${SEPARATOR}d2`);
    });

    test('an invalid pattern (bypassing validateInput) never reaches the worker', async () => {
      let calls = 0;
      const { text } = await runOn(keepRegex, ['('], 'a', [sel(0, 0, 0, 1)], false, {
        runRegex: () => {
          calls++;
          return Promise.resolve([true]);
        },
      });
      assert.strictEqual(text, 'a');
      assert.strictEqual(calls, 0);
    });

    test('selections over 10,000,000 characters in total are refused before the worker starts', async () => {
      let calls = 0;
      const block = 'a'.repeat(5_000_001);
      const editor = await createTextEditor(`${block}\n${block}`);
      editor.selections = [sel(0, 0, 0, 5_000_001), sel(1, 0, 1, 5_000_001)];
      const { deps, record } = recorder(['a'], {
        runRegex: () => {
          calls++;
          return Promise.resolve([]);
        },
      });
      await runnerFor(keepRegex, deps)(editor);
      assert.strictEqual(calls, 0);
      assert.deepStrictEqual(record.warnings, [
        'The selection was not changed: The selections contain 10,000,002 characters (limit for regular expressions: 10,000,000).',
      ]);
    });
  });

  suite('output size limit', () => {
    const joinAll = { name: 'join-every-n' as const, output: 'replace' as const };
    const longDelimiter = 'x'.repeat(100);
    const lines = (count: number) => Array(count).fill('a').join('\n');

    test('over the limit: nothing is edited and the user is warned once', async () => {
      const input = lines(120000);
      const { text, record } = await runOn(joinAll, ['1000000', longDelimiter], input, [sel(0, 0, 119999, 1)]);
      assert.strictEqual(text, input);
      assert.deepStrictEqual(record.warnings, [
        'The selection was not changed: the result would add 11,879,901 characters (limit: 10,000,000). '
        + 'Select fewer or shorter lines.',
      ]);
      assert.deepStrictEqual(record.errors, []);
    });

    test('the limit is shared by all selections', async () => {
      // Each block adds about 6,000,000 characters (below the limit alone, above it together).
      const block = lines(61000);
      const blocks: [string, string] = [block, block];
      const editor = await createTextEditor(blocks.join(SEPARATOR));
      selectBlocks(editor, blocks);
      const { deps, record } = recorder(['1000000', longDelimiter]);
      await runnerFor(joinAll, deps)(editor);
      assert.strictEqual(editor.document.getText(), blocks.join(SEPARATOR));
      assert.strictEqual(record.warnings.length, 1);
    });
  });

  // Running the commands through executeCommand would activate the extension inside the test
  // host, which makes the existing "(New Doc)" tests of other suites pick up the wrong document.
  // The wiring in extension.ts is therefore checked statically.
  test('extension.ts registers every command with the matching handler exactly once', () => {
    const source = fs.readFileSync(path.resolve(__dirname, '../../../src/extension.ts'), 'utf8');
    cases.forEach((c) => {
      const id = commandId(c);
      const handler = c.output === 'notify' ? 'lineCountStatsHandler' : `lineHandler('${c.name}', '${c.output}')`;
      const registration = `registerTextEditorCommand('${id}', ${handler})`;
      assert.strictEqual(source.split(registration).length - 1, 1, registration);
      assert.strictEqual(source.split(`'${id}'`).length - 1, 1, id);
    });
  });

  test('package.json and the Show Commands list register all 40 commands exactly once with the ROADMAP titles', () => {
    const root = path.resolve(__dirname, '../../..');
    const packageJson = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
    const roadmap = fs.readFileSync(path.join(root, 'docs/ROADMAP.md'), 'utf8');
    const contributes = packageJson.contributes;
    const submenu = contributes.menus['selection-manipulator.line.submenu'];
    const count = (entries: { command?: string }[], id: string) => entries.filter((entry) => entry.command === id).length;
    cases.forEach((c, i) => {
      const id = commandId(c);
      assert.strictEqual(count(contributes.commands, id), 1, `commands: ${id}`);
      assert.strictEqual(count(contributes.menus.commandPalette, id), 1, `commandPalette: ${id}`);
      assert.strictEqual(count(submenu, id), 1, `submenu: ${id}`);
      assert.strictEqual(count(myCommands, id), 1, `showCommands: ${id}`);
      const command = contributes.commands.find((entry: { command: string }) => entry.command === id);
      assert.ok(command.title.startsWith('Line: '), command.title);
      assert.strictEqual(command.category, 'Selection Manipulator');
      assert.ok(roadmap.includes(`| ${c.id} | LINE | `) && roadmap.includes(`\`${id}\` | ${command.title} |`), `${c.id} ROADMAP title`);
      assert.strictEqual(myCommands.find((entry) => entry.command === id)?.title, command.title);
      assert.strictEqual(
        contributes.menus.commandPalette.find((entry: { command: string }) => entry.command === id).when,
        'editorHasSelection'
      );
      assert.strictEqual(submenu[i].command, id, 'the submenu is in ID order');
      assert.strictEqual(submenu[i].group, `selection-manipulator@${i}`);
    });
    assert.strictEqual(submenu.length, 40);
    assert.strictEqual(
      contributes.submenus.filter((entry: { id: string }) => entry.id === 'selection-manipulator.line.submenu').length,
      1
    );
    const parentEntries = contributes.menus['selection-manipulator.submenu']
      .filter((entry: { submenu?: string }) => entry.submenu === 'selection-manipulator.line.submenu');
    assert.deepStrictEqual(parentEntries, [{ submenu: 'selection-manipulator.line.submenu', group: 'selection-manipulator@14' }]);
    // Show Commands looks commands up by title, so titles must stay unique.
    assert.strictEqual(new Set(myCommands.map((entry) => entry.title)).size, myCommands.length);
  });
});
