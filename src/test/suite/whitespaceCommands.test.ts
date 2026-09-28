import * as assert from 'assert';
import * as path from 'path';
import * as fs from 'fs';
import * as vscode from 'vscode';
import { whitespaceHandler, whitespaceInputHandlerInternal } from '../../handler/whitespaceHandler';
import { myCommands } from '../../handler/showCommandsHandler';
import {
  WHITESPACE_COMMANDS,
  WHITESPACE_INPUT_COMMANDS,
  WhitespaceCommand,
  WhitespaceInputCommand,
} from '../../handler/whitespaceTransforms';
import { createTextEditor } from './testUtils';

type Runner = (editor: vscode.TextEditor) => Promise<void>;

interface CommandCase {
  id: string;
  name: WhitespaceCommand;
  /** Answer given to the input box (input commands only). */
  answer?: string;
  input: string;
  expected: string;
  /** Two blocks, each selected by its own cursor (separated by a `---` line in the document). */
  multiInput: [string, string];
  multiExpected: [string, string];
}

const isInputCommand = (name: WhitespaceCommand): name is WhitespaceInputCommand =>
  (WHITESPACE_INPUT_COMMANDS as WhitespaceCommand[]).includes(name);

const runnerFor = (c: CommandCase, onPrompt: () => void = () => undefined): Runner => {
  if (isInputCommand(c.name)) {
    return whitespaceInputHandlerInternal(() => {
      onPrompt();
      return Promise.resolve(c.answer);
    })(c.name);
  }
  return whitespaceHandler(c.name as Exclude<WhitespaceCommand, WhitespaceInputCommand>);
};

const words = (count: number) => Array(count).fill('abcdefghi').join(' ');
const line90 = `${words(8)} abcdefghij`; // 90 characters
const wrapped90 = `${words(8)}\nabcdefghij`;

const cases: CommandCase[] = [
  { id: 'WS-001', name: 'tabs-to-spaces-2', input: '\tfoo', expected: '  foo', multiInput: ['\ta', '\t\tb'], multiExpected: ['  a', '    b'] },
  { id: 'WS-002', name: 'tabs-to-spaces-4', input: '\tfoo', expected: '    foo', multiInput: ['\ta', '\t\tb'], multiExpected: ['    a', '        b'] },
  { id: 'WS-003', name: 'spaces-to-tabs-2', input: '    foo', expected: '\t\tfoo', multiInput: ['  a', '    b'], multiExpected: ['\ta', '\t\tb'] },
  { id: 'WS-004', name: 'spaces-to-tabs-4', input: '    foo', expected: '\tfoo', multiInput: ['    a', '        b'], multiExpected: ['\ta', '\t\tb'] },
  { id: 'WS-005', name: 'reindent-2-to-4', input: '  a\n    b', expected: '    a\n        b', multiInput: ['  a', '    b'], multiExpected: ['    a', '        b'] },
  { id: 'WS-006', name: 'reindent-4-to-2', input: '    a\n        b', expected: '  a\n    b', multiInput: ['    a', '        b'], multiExpected: ['  a', '    b'] },
  { id: 'WS-007', name: 'dedent', input: '    a\n      b', expected: 'a\n  b', multiInput: ['  a\n    b', '    c'], multiExpected: ['a\n  b', 'c'] },
  { id: 'WS-008', name: 'trim-leading', input: '  a  \n b', expected: 'a  \nb', multiInput: [' a', '\t b '], multiExpected: ['a', 'b '] },
  { id: 'WS-009', name: 'collapse-blank-lines', input: 'a\n\n\n\nb', expected: 'a\n\nb', multiInput: ['a\n\n\nb', 'c\n\n\n\nd'], multiExpected: ['a\n\nb', 'c\n\nd'] },
  { id: 'WS-010', name: 'remove-all', input: 'a b\tc\nd', expected: 'abcd', multiInput: ['a b', 'c\td'], multiExpected: ['ab', 'cd'] },
  { id: 'WS-011', name: 'unwrap-paragraphs', input: 'a\nb\n\nc\nd', expected: 'a b\n\nc d', multiInput: ['a\nb', 'c\nd'], multiExpected: ['a b', 'c d'] },
  { id: 'WS-012', name: 'hard-wrap-80', input: line90, expected: wrapped90, multiInput: [line90, line90], multiExpected: [wrapped90, wrapped90] },
  { id: 'WS-013', name: 'hard-wrap-n', answer: '5', input: 'aa bb cc', expected: 'aa bb\ncc', multiInput: ['aa bb cc', 'dd ee ff'], multiExpected: ['aa bb\ncc', 'dd ee\nff'] },
  { id: 'WS-014', name: 'nbsp-to-space', input: 'a b', expected: 'a b', multiInput: ['a b', 'c d'], multiExpected: ['a b', 'c d'] },
  { id: 'WS-015', name: 'visualize', input: 'a b\tc', expected: 'a·b→c', multiInput: ['a b', 'c\td'], multiExpected: ['a·b', 'c→d'] },
  { id: 'WS-016', name: 'unvisualize', input: 'a·b→c', expected: 'a b\tc', multiInput: ['a·b', 'c→d'], multiExpected: ['a b', 'c\td'] },
  { id: 'WS-017', name: 'center-align', input: 'a\nabc', expected: ' a\nabc', multiInput: ['a\nabc', 'b\nbbbbb'], multiExpected: [' a\nabc', '  b\nbbbbb'] },
  { id: 'WS-018', name: 'right-align', input: 'a\nabc', expected: '  a\nabc', multiInput: ['a\nabc', 'b\nbbbbb'], multiExpected: ['  a\nabc', '    b\nbbbbb'] },
  { id: 'WS-019', name: 'pad-to-longest', input: 'a\nabc', expected: 'a  \nabc', multiInput: ['a\nabc', 'b\nbbbbb'], multiExpected: ['a  \nabc', 'b    \nbbbbb'] },
  { id: 'WS-020', name: 'align-equals', input: 'a = 1\nbbb = 2', expected: 'a   = 1\nbbb = 2', multiInput: ['a = 1\nbb = 2', 'c = 3\ndddd = 4'], multiExpected: ['a  = 1\nbb = 2', 'c    = 3\ndddd = 4'] },
  { id: 'WS-021', name: 'align-colon', input: 'a: 1\nbbb: 2', expected: 'a:   1\nbbb: 2', multiInput: ['a: 1\nbb: 2', 'c: 3\ndddd: 4'], multiExpected: ['a:  1\nbb: 2', 'c:    3\ndddd: 4'] },
  { id: 'WS-022', name: 'align-comma', input: 'a,bb,c\nccc,d,e', expected: 'a,  bb,c\nccc,d, e', multiInput: ['a,b\ncc,d', 'e,f\nggg,h'], multiExpected: ['a, b\ncc,d', 'e,  f\nggg,h'] },
  { id: 'WS-023', name: 'align-custom', answer: '=>', input: 'a => 1\nbb => 2', expected: 'a  => 1\nbb => 2', multiInput: ['a => 1\nbb => 2', 'c => 3\nddd => 4'], multiExpected: ['a  => 1\nbb => 2', 'c   => 3\nddd => 4'] },
  { id: 'WS-024', name: 'blank-line-between', input: 'a\nb', expected: 'a\n\nb', multiInput: ['a\nb', 'c\nd'], multiExpected: ['a\n\nb', 'c\n\nd'] },
  { id: 'WS-025', name: 'remove-trailing-blank-lines', input: 'a\nb\n\n\n', expected: 'a\nb', multiInput: ['a\n\n', 'b\n  '], multiExpected: ['a', 'b'] },
  { id: 'WS-026', name: 'remove-leading-blank-lines', input: '\n\na\nb', expected: 'a\nb', multiInput: ['\na', '  \nb'], multiExpected: ['a', 'b'] },
  { id: 'WS-027', name: 'collapse-inline', input: '  a   b', expected: '  a b', multiInput: ['  a   b', 'c    d'], multiExpected: ['  a b', 'c d'] },
  { id: 'WS-028', name: 'space-around-operators', input: 'a=b+c', expected: 'a = b + c', multiInput: ['a=b', 'c+d'], multiExpected: ['a = b', 'c + d'] },
  { id: 'WS-029', name: 'remove-space-before-punctuation', input: 'hello , world !', expected: 'hello, world!', multiInput: ['a ,b', 'c !'], multiExpected: ['a,b', 'c!'] },
  { id: 'WS-030', name: 'space-after-comma', input: 'a,b,c', expected: 'a, b, c', multiInput: ['a,b', 'c,d'], multiExpected: ['a, b', 'c, d'] },
  { id: 'WS-031', name: 'indent-n', answer: '3', input: 'a\nb', expected: '   a\n   b', multiInput: ['a', 'b'], multiExpected: ['   a', '   b'] },
  { id: 'WS-032', name: 'outdent-n', answer: '2', input: '    a\n b', expected: '  a\nb', multiInput: ['   a', ' b'], multiExpected: [' a', 'b'] },
  { id: 'WS-033', name: 'expand-tabs', input: 'a\tb', expected: 'a   b', multiInput: ['a\tb', 'ab\tc'], multiExpected: ['a   b', 'ab  c'] },
  { id: 'WS-034', name: 'unexpand-tabs', input: 'a   b', expected: 'a\tb', multiInput: ['a   b', 'ab  c'], multiExpected: ['a\tb', 'ab\tc'] },
  { id: 'WS-035', name: 'clear-blank-only-lines', input: 'a\n  \nb', expected: 'a\n\nb', multiInput: ['  ', '\t'], multiExpected: ['', ''] },
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

suite('Whitespace Commands (WS-001..035) Test Suite', () => {

  teardown(closeAllEditors);

  test('the test table covers all 35 commands', () => {
    assert.deepStrictEqual(cases.map((c) => c.name), WHITESPACE_COMMANDS);
  });

  cases.forEach((c) => {
    suite(`${c.id} ${c.name}`, () => {
      test('representative case (ROADMAP example)', async () => {
        const editor = await createTextEditor(c.input);
        selectWholeDocument(editor);
        await runnerFor(c)(editor);
        assert.strictEqual(editor.document.getText(), c.expected);
      });

      test('empty selection leaves the document unchanged', async () => {
        const editor = await createTextEditor(c.input);
        editor.selection = new vscode.Selection(0, 0, 0, 0);
        let prompts = 0;
        await runnerFor(c, () => prompts++)(editor);
        assert.strictEqual(editor.document.getText(), c.input);
        assert.strictEqual(prompts, 0, 'no input box for empty selections');
      });

      test('multi-cursor converts each selection independently', async () => {
        const editor = await createTextEditor(c.multiInput.join(SEPARATOR));
        selectBlocks(editor, c.multiInput);
        let prompts = 0;
        await runnerFor(c, () => prompts++)(editor);
        assert.strictEqual(editor.document.getText(), c.multiExpected.join(SEPARATOR));
        assert.strictEqual(prompts, isInputCommand(c.name) ? 1 : 0, 'the input box is shown once');
      });
    });
  });

  suite('input commands (WS-013 / WS-023 / WS-031 / WS-032)', () => {
    cases.filter((c) => isInputCommand(c.name)).forEach((c) => {
      test(`${c.id} ${c.name}: cancelling leaves the document unchanged`, async () => {
        const editor = await createTextEditor(c.input);
        selectWholeDocument(editor);
        await runnerFor({ ...c, answer: undefined })(editor);
        assert.strictEqual(editor.document.getText(), c.input);
      });

      test(`${c.id} ${c.name}: an invalid answer (bypassing validateInput) leaves the document unchanged`, async () => {
        const invalid = c.name === 'align-custom' ? '   ' : '0';
        const editor = await createTextEditor(c.input);
        selectWholeDocument(editor);
        await runnerFor({ ...c, answer: invalid })(editor);
        assert.strictEqual(editor.document.getText(), c.input);
      });
    });

    test('the input box gets validateInput and a default value', async () => {
      const seen: vscode.InputBoxOptions[] = [];
      const capture = (command: WhitespaceInputCommand) => whitespaceInputHandlerInternal((options) => {
        seen.push(options);
        return Promise.resolve(undefined);
      })(command);
      const editor = await createTextEditor('a');
      selectWholeDocument(editor);
      for (const command of WHITESPACE_INPUT_COMMANDS) {
        await capture(command)(editor);
      }
      assert.strictEqual(seen.length, 4);
      seen.forEach((options) => assert.ok(options.validateInput, options.prompt));
      assert.strictEqual(seen[0].value, '80');
      assert.strictEqual(seen[0].validateInput?.('1001'), 'Enter an integer from 1 to 1000');
      assert.strictEqual(seen[2].value, '4');
      assert.ok(seen[1].validateInput?.('a\nb'));
    });
  });

  suite('CRLF documents', () => {
    test('WS-012 hard-wrap-80 keeps CRLF', async () => {
      const editor = await createTextEditor(`${line90}\nnext`);
      await toCrlf(editor);
      selectWholeDocument(editor);
      await whitespaceHandler('hard-wrap-80')(editor);
      assert.strictEqual(editor.document.getText(), `${wrapped90}\nnext`.replace(/\n/g, '\r\n'));
    });

    test('WS-024 blank-line-between keeps CRLF', async () => {
      const editor = await createTextEditor('a\nb\nc');
      await toCrlf(editor);
      selectWholeDocument(editor);
      await whitespaceHandler('blank-line-between')(editor);
      assert.strictEqual(editor.document.getText(), 'a\r\n\r\nb\r\n\r\nc');
    });

    test('WS-025 remove-trailing-blank-lines on a selection ending with a line break', async () => {
      const editor = await createTextEditor('a\n\n\nz');
      await toCrlf(editor);
      editor.selection = new vscode.Selection(0, 0, 3, 0);
      await whitespaceHandler('remove-trailing-blank-lines')(editor);
      assert.strictEqual(editor.document.getText(), 'az');
    });
  });

  // Running the commands through executeCommand would activate the extension inside the test
  // host, which makes the existing "(New Doc)" tests of other suites pick up the wrong document.
  // The wiring in extension.ts is therefore checked statically.
  test('extension.ts registers every command with the matching handler exactly once', () => {
    const source = fs.readFileSync(path.resolve(__dirname, '../../../src/extension.ts'), 'utf8');
    WHITESPACE_COMMANDS.forEach((name) => {
      const handler = isInputCommand(name) ? 'whitespaceInputHandler' : 'whitespaceHandler';
      const registration = `registerTextEditorCommand('selection-manipulator.whitespace.${name}', ${handler}('${name}'))`;
      assert.strictEqual(source.split(registration).length - 1, 1, registration);
      assert.strictEqual(source.split(`'selection-manipulator.whitespace.${name}'`).length - 1, 1, name);
    });
  });

  test('package.json and the Show Commands list register all 35 commands exactly once', () => {
    const packageJson = JSON.parse(fs.readFileSync(path.resolve(__dirname, '../../../package.json'), 'utf8'));
    const contributes = packageJson.contributes;
    const count = (entries: { command?: string }[], id: string) => entries.filter((entry) => entry.command === id).length;
    WHITESPACE_COMMANDS.forEach((name) => {
      const id = `selection-manipulator.whitespace.${name}`;
      assert.strictEqual(count(contributes.commands, id), 1, `commands: ${id}`);
      assert.strictEqual(count(contributes.menus.commandPalette, id), 1, `commandPalette: ${id}`);
      assert.strictEqual(count(contributes.menus['selection-manipulator.whitespace.submenu'], id), 1, `submenu: ${id}`);
      assert.strictEqual(count(myCommands, id), 1, `showCommands: ${id}`);
      const command = contributes.commands.find((entry: { command: string }) => entry.command === id);
      assert.ok(command.title.startsWith('Whitespace: '), command.title);
      assert.strictEqual(command.category, 'Selection Manipulator');
    });
    assert.strictEqual(contributes.menus['selection-manipulator.whitespace.submenu'].length, 35);
    assert.strictEqual(
      contributes.submenus.filter((submenu: { id: string }) => submenu.id === 'selection-manipulator.whitespace.submenu').length,
      1
    );
    assert.strictEqual(
      contributes.menus['selection-manipulator.submenu']
        .filter((entry: { submenu?: string }) => entry.submenu === 'selection-manipulator.whitespace.submenu').length,
      1
    );
  });
});
