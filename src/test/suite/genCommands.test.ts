import * as assert from 'assert';
import * as fs from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';
import { cryptoRandom, GEN_MAX_INPUT_LENGTH, GenRandom } from '../../handler/genCommon';
import { GEN_NOT_CHANGED, GEN_NOTHING_SELECTED, GenDependencies, genCommandHandlerInternal, GenQuickPickItem } from '../../handler/genCommandHandler';
import { JA_SENTENCES } from '../../handler/genRandom';
import { GEN_COMMAND_ENTRIES, GEN_RANDOM_ENTRIES, GEN_SEQUENCE_ENTRIES, GenCommandEntry } from '../../handler/genTransforms';
import { myCommands } from '../../handler/showCommandsHandler';
import { fakeRandom, GEN_TEST_NOW } from './genTestUtils';
import { createTextEditor } from './testUtils';

/**
 * Records what the handlers show instead of touching VS Code's UI. The input boxes take their
 * answers from `answers` in order (`undefined` = cancelled) and record their options; the quick
 * picks choose the item whose value is next in `picks` (`undefined` = cancelled).
 */
const recorder = (
  answers: (string | undefined)[] = [],
  random: GenRandom = fakeRandom(),
  onPrompt?: () => void | Thenable<unknown>,
  picks: (string | undefined)[] = []
) => {
  const warnings: string[] = [];
  const errors: string[] = [];
  const prompts: vscode.InputBoxOptions[] = [];
  const quickPicks: { items: GenQuickPickItem[]; options: vscode.QuickPickOptions }[] = [];
  const queue = [...answers];
  const pickQueue = [...picks];
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
    showInputBox: async (options) => {
      prompts.push(options);
      await onPrompt?.();
      return queue.shift();
    },
    showQuickPick: (items, options) => {
      quickPicks.push({ items, options });
      const value = pickQueue.shift();
      return Promise.resolve(items.find((item) => item.value === value));
    },
    random,
    now: GEN_TEST_NOW,
  };
  return { dependencies, warnings, errors, prompts, quickPicks };
};

const entryOf = (id: string): GenCommandEntry => {
  const found = GEN_COMMAND_ENTRIES.find((entry) => entry.id === id);
  assert.ok(found, id);
  return found;
};

const run = async (id: string, editor: vscode.TextEditor, dependencies: GenDependencies) =>
  genCommandHandlerInternal(dependencies)(entryOf(id).name)(editor);

const cursorsAtLineStarts = (editor: vscode.TextEditor, reversed = false) => {
  const selections = Array.from({ length: editor.document.lineCount }, (_, line) => new vscode.Selection(line, 0, line, 0));
  editor.selections = reversed ? selections.reverse() : selections;
};

const selectLines = (editor: vscode.TextEditor, lines: number[]) => {
  editor.selections = lines.map((line) => new vscode.Selection(line, 0, line, editor.document.lineAt(line).text.length));
};

const crlfEditor = async (text: string): Promise<vscode.TextEditor> => {
  const editor = await createTextEditor(text);
  await editor.edit((editBuilder) => editBuilder.setEndOfLine(vscode.EndOfLine.CRLF));
  assert.strictEqual(editor.document.getText(), text.replace(/\n/g, '\r\n'));
  return editor;
};

const closeAllEditors = async () => {
  for (let i = 0; i < 100 && vscode.window.visibleTextEditors.length > 0; i++) {
    await vscode.commands.executeCommand('workbench.action.revertAndCloseActiveEditor');
  }
};

const readRepoFile = (file: string): string => fs.readFileSync(path.resolve(__dirname, '../../..', file), 'utf8');

/** The GEN rows of docs/ROADMAP.md: [id, kind, command ID, title]. */
const roadmapRows = (): [string, string, string, string][] =>
  readRepoFile('docs/ROADMAP.md').split('\n')
    .filter((line) => /^\| GEN-\d{3} \|/.test(line))
    .map((line) => {
      const cells = line.split(' | ').map((cell) => cell.trim());
      return [cells[0].replace(/^\| /, ''), cells[2], cells[3].replace(/`/g, ''), cells[4]];
    });

suite('Generator Commands (GEN) Test Suite', () => {
  teardown(closeAllEditors);

  suite('targets', () => {
    test('every cursor gets a value, in document order, in one edit', async () => {
      const editor = await createTextEditor('a\nb\nc\n');
      cursorsAtLineStarts(editor, true);
      const { dependencies, warnings, errors, prompts } = recorder([], fakeRandom([1, 0, 1, 0]));
      const versionBefore = editor.document.version;
      await run('GEN-018', editor, dependencies);
      assert.strictEqual(editor.document.getText(), 'truea\nfalseb\ntruec\nfalse');
      assert.strictEqual(editor.document.version, versionBefore + 1);
      assert.deepStrictEqual([warnings, errors, prompts.length], [[], [], 0]);
    });

    test('selections are replaced, empty cursors get an insertion', async () => {
      const editor = await createTextEditor('xx yy\n');
      editor.selections = [new vscode.Selection(0, 3, 0, 5), new vscode.Selection(1, 0, 1, 0), new vscode.Selection(0, 0, 0, 2)];
      await run('GEN-011', editor, recorder([], fakeRandom([], [[0x11, 0x22, 0x33], [0x44, 0x55, 0x66], [0x77, 0x88, 0x99]])).dependencies);
      assert.strictEqual(editor.document.getText(), '#112233 #445566\n#778899');
    });

    test('UUID v7 / ULID: the values of one run are in ascending order in the document', async () => {
      for (const id of ['GEN-001', 'GEN-002']) {
        const editor = await createTextEditor('\n\n');
        cursorsAtLineStarts(editor, true);
        await run(id, editor, recorder([], fakeRandom([], [repeat(0xff, 10), repeat(0x00, 10), repeat(0x80, 10)])).dependencies);
        const values = editor.document.getText().split('\n');
        assert.deepStrictEqual(values, [...values].sort(), id);
        assert.strictEqual(new Set(values).size, 3, id);
        const time = GEN_TEST_NOW().getTime();
        if (id === 'GEN-001') {
          values.forEach((value) => assert.strictEqual(value.replace(/-/g, '').slice(0, 12), time.toString(16).padStart(12, '0')));
        }
      }
    });

    test('the output limit stops the generation and only warns', async function () {
      this.timeout(60_000);
      const editor = await createTextEditor('\n'.repeat(999));
      cursorsAtLineStarts(editor);
      assert.strictEqual(editor.selections.length, 1000);
      // 1,000 cursors × 1,000 sentences of 12 characters = 12,000,000 > 10,000,000.
      assert.strictEqual(JA_SENTENCES[0].length, 12);
      const { dependencies, warnings, errors } = recorder(['1000']);
      await run('GEN-017', editor, dependencies);
      assert.strictEqual(editor.document.getText(), '\n'.repeat(999));
      assert.deepStrictEqual(errors, []);
      assert.deepStrictEqual(warnings, [`${GEN_NOT_CHANGED}the result would be longer than 10,000,000 characters. Use fewer cursors or a smaller amount.`]);
    });
  });

  suite('prompts', () => {
    test('input box options: prompt, default value, ignoreFocusOut, validateInput', async () => {
      const editor = await createTextEditor('');
      const { dependencies, prompts } = recorder([undefined]);
      await run('GEN-004', editor, dependencies);
      assert.strictEqual(prompts.length, 1);
      assert.strictEqual(prompts[0].value, '16');
      assert.strictEqual(prompts[0].placeHolder, '16');
      assert.strictEqual(prompts[0].ignoreFocusOut, true);
      assert.match(prompts[0].prompt ?? '', /1 to 1,024/);
      assert.strictEqual(prompts[0].validateInput?.('1024'), undefined);
      assert.strictEqual(prompts[0].validateInput?.('1025'), 'Enter an integer from 1 to 1,024.');
      assert.strictEqual(prompts[0].validateInput?.('0'), 'Enter an integer from 1 to 1,024.');
    });

    test('the defaults of every prompt pass their own check', async () => {
      const now = GEN_TEST_NOW();
      for (const entry of GEN_COMMAND_ENTRIES) {
        const answers: string[] = [];
        for (const prompt of [...entry.prompts, ...(entry.emptyPrompts ?? [])]) {
          const editor = await createTextEditor('');
          const { dependencies, prompts } = recorder([...answers, undefined]);
          if (entry.targets === 'lines') {
            break;
          }
          await run(entry.id, editor, dependencies);
          const options = prompts[prompts.length - 1];
          assert.strictEqual(options.value, prompt.value(now), entry.id);
          assert.strictEqual(options.validateInput?.(options.value ?? ''), undefined, entry.id);
          answers.push(options.value ?? '');
        }
      }
      assert.strictEqual(entryOf('GEN-012').prompts[0].value(now), '2026-01-01..2026-12-31');
      assert.strictEqual(entryOf('GEN-009').prompts[0].value(now), '2');
      assert.strictEqual(entryOf('GEN-022').prompts[0].value(now), '2026-09-29');
      assert.strictEqual(entryOf('GEN-030').prompts[0].value(now), '192.0.2.1');
    });

    test('cancelling a prompt does nothing', async () => {
      for (const [id, answers] of [['GEN-004', [undefined]], ['GEN-007', ['0..1', undefined]], ['GEN-012', [undefined]]] as const) {
        const editor = await createTextEditor('keep');
        const { dependencies, warnings, errors } = recorder([...answers]);
        await run(id, editor, dependencies);
        assert.strictEqual(editor.document.getText(), 'keep', id);
        assert.deepStrictEqual([warnings, errors], [[], []], id);
      }
    });

    test('a refused value that comes back anyway ends with a warning and changes nothing', async () => {
      const editor = await createTextEditor('keep');
      const { dependencies, warnings } = recorder(['6..1']);
      await run('GEN-006', editor, dependencies);
      assert.strictEqual(editor.document.getText(), 'keep');
      assert.deepStrictEqual(warnings, [`${GEN_NOT_CHANGED}The first number must not be greater than the second.`]);
    });

    test('GEN-006 / 007 / 012: typed values are used; spaces around them are ignored', async () => {
      const editor = await createTextEditor('');
      await run('GEN-006', editor, recorder([' 1..6 '], fakeRandom([3])).dependencies);
      assert.strictEqual(editor.document.getText(), '4');
      const floatEditor = await createTextEditor('');
      await run('GEN-007', floatEditor, recorder(['0..1', '3'], fakeRandom([582])).dependencies);
      assert.strictEqual(floatEditor.document.getText(), '0.582');
      const dateEditor = await createTextEditor('');
      await run('GEN-012', dateEditor, recorder(['2026-01-01..2026-12-31'], fakeRandom([136])).dependencies);
      assert.strictEqual(dateEditor.document.getText(), '2026-05-17');
    });

    test('GEN-007: the number of decimal places is checked together with the range', async () => {
      const editor = await createTextEditor('');
      const { dependencies, prompts } = recorder(['1000000000..1000000000', undefined]);
      await run('GEN-007', editor, dependencies);
      assert.strictEqual(prompts.length, 2);
      assert.match(prompts[1].validateInput?.('10') as string, /^The ends times 10\^10 must be at most 9007199254740991/);
      assert.strictEqual(prompts[1].validateInput?.('6'), undefined);
      assert.strictEqual(prompts[1].validateInput?.('11'), 'Enter a number of decimal places from 0 to 10.');
      assert.match(prompts[0].validateInput?.('1e9..2') as string, /^Enter a range of decimal numbers/);
    });

    test('GEN-004 / 005 / 009 / 017: the typed amount is used', async () => {
      const editor = await createTextEditor('');
      await run('GEN-004', editor, recorder(['3'], fakeRandom([], [[0xab, 0xcd, 0xef]])).dependencies);
      assert.strictEqual(editor.document.getText(), 'abcdef');
      const base64 = await createTextEditor('');
      await run('GEN-005', base64, recorder(['24']).dependencies);
      assert.strictEqual(base64.document.getText().length, 32);
      const text = await createTextEditor('');
      await run('GEN-017', text, recorder(['2'], fakeRandom([0, 1])).dependencies);
      assert.strictEqual(text.document.getText(), JA_SENTENCES[0] + JA_SENTENCES[1]);
    });
  });

  suite('commands that read the selection (GEN-008 / 009 / 019)', () => {
    test('Pick One Line: each selection independently; empty and blank selections are left alone', async () => {
      const editor = await createTextEditor('a\nb\nc\n  \nd\ne\n');
      editor.selections = [
        new vscode.Selection(4, 0, 5, 1),
        new vscode.Selection(0, 0, 2, 1),
        new vscode.Selection(3, 0, 3, 2),
        new vscode.Selection(6, 0, 6, 0),
      ];
      await run('GEN-008', editor, recorder([], fakeRandom([1, 0])).dependencies);
      assert.strictEqual(editor.document.getText(), 'b\n  \nd\n');
    });

    test('Pick N Lines: the ROADMAP example; lines are joined with the document line break (CRLF)', async () => {
      const editor = await createTextEditor('a\nb\nc\nd');
      editor.selection = new vscode.Selection(0, 0, 3, 1);
      const { dependencies, prompts } = recorder(['2'], fakeRandom([3, 2]));
      await run('GEN-009', editor, dependencies);
      assert.strictEqual(editor.document.getText(), 'd\na');
      assert.strictEqual(prompts[0].value, '2');

      const crlf = await crlfEditor('a\nb\nc\nd');
      crlf.selection = new vscode.Selection(0, 0, 3, 1);
      await run('GEN-009', crlf, recorder(['2'], fakeRandom([3, 2])).dependencies);
      assert.strictEqual(crlf.document.getText(), 'd\r\na');
    });

    test('only empty or blank selections: a warning, no prompt, no change', async () => {
      for (const id of ['GEN-008', 'GEN-009']) {
        const editor = await createTextEditor('  \n\nx');
        editor.selections = [new vscode.Selection(0, 0, 1, 0), new vscode.Selection(2, 0, 2, 0)];
        const { dependencies, warnings, prompts } = recorder(['1']);
        await run(id, editor, dependencies);
        assert.strictEqual(editor.document.getText(), '  \n\nx', id);
        assert.deepStrictEqual([warnings, prompts.length], [[GEN_NOTHING_SELECTED], 0], id);
      }
    });

    test('one selection that fails changes nothing; the message names the selection', async () => {
      const editor = await createTextEditor('a\nb\nc\nd');
      editor.selections = [new vscode.Selection(0, 0, 1, 1), new vscode.Selection(2, 0, 2, 1)];
      const { dependencies, errors } = recorder(['2']);
      await run('GEN-009', editor, dependencies);
      assert.strictEqual(editor.document.getText(), 'a\nb\nc\nd');
      assert.deepStrictEqual(errors, [`${GEN_NOT_CHANGED}selection 2 of 2: the selection has only 1 non-blank line; cannot pick 2`]);
    });

    test('a selection over 1,000,000 characters is refused before any prompt', async function () {
      this.timeout(60_000);
      for (const id of ['GEN-008', 'GEN-009', 'GEN-019']) {
        const text = `${'a'.repeat(GEN_MAX_INPUT_LENGTH + 1)}\nb`;
        const editor = await createTextEditor(text);
        editor.selections = [new vscode.Selection(0, 0, 0, GEN_MAX_INPUT_LENGTH + 1), new vscode.Selection(1, 1, 1, 1)];
        const { dependencies, errors, prompts } = recorder(['1', '1d6']);
        await run(id, editor, dependencies);
        assert.strictEqual(editor.document.getText(), text, id);
        assert.strictEqual(prompts.length, 0, id);
        assert.strictEqual(errors.length, 1, id);
        assert.match(errors[0], /the selection is longer than 1,000,000 characters$/, id);
      }
      const exact = await createTextEditor('a'.repeat(GEN_MAX_INPUT_LENGTH));
      exact.selection = new vscode.Selection(0, 0, 0, GEN_MAX_INPUT_LENGTH);
      await run('GEN-008', exact, recorder().dependencies);
      assert.strictEqual(exact.document.getText().length, GEN_MAX_INPUT_LENGTH);
    });

    test('Dice Roll: selections are rolled; the dice for empty cursors are asked once', async () => {
      const editor = await createTextEditor('2d6\n\n\n1D20');
      editor.selections = [
        new vscode.Selection(0, 0, 0, 3),
        new vscode.Selection(1, 0, 1, 0),
        new vscode.Selection(2, 0, 2, 0),
        new vscode.Selection(3, 0, 3, 4),
      ];
      const { dependencies, prompts } = recorder(['1d6'], fakeRandom([2, 3, 0, 'max', 19]));
      await run('GEN-019', editor, dependencies);
      assert.strictEqual(prompts.length, 1);
      assert.strictEqual(prompts[0].value, '1d6');
      assert.strictEqual(editor.document.getText(), '7 (3+4)\n1 (1)\n6 (6)\n20 (20)');
    });

    test('Dice Roll: no prompt without an empty cursor; an invalid selection is quoted and changes nothing', async () => {
      const editor = await createTextEditor('3d4');
      editor.selection = new vscode.Selection(0, 0, 0, 3);
      const first = recorder([], fakeRandom([0, 1, 2]));
      await run('GEN-019', editor, first.dependencies);
      assert.deepStrictEqual([first.prompts.length, editor.document.getText()], [0, '6 (1+2+3)']);

      const invalid = await createTextEditor('2d6\nabc');
      selectLines(invalid, [0, 1]);
      const second = recorder();
      await run('GEN-019', invalid, second.dependencies);
      assert.strictEqual(invalid.document.getText(), '2d6\nabc');
      assert.deepStrictEqual(second.errors, [`${GEN_NOT_CHANGED}selection 2 of 2: "abc" is not a dice roll: enter dice such as 2d6 (N dice with M sides)`]);

      const cursor = await createTextEditor('');
      const third = recorder(['0d6']);
      await run('GEN-019', cursor, third.dependencies);
      assert.strictEqual(cursor.document.getText(), '');
      assert.deepStrictEqual(third.warnings, [`${GEN_NOT_CHANGED}The number of dice must be from 1 to 100.`]);
    });

    test('the selections are read again after the prompt closes', async () => {
      const editor = await createTextEditor('a\nb\nc');
      editor.selection = new vscode.Selection(0, 0, 2, 1);
      const { dependencies } = recorder(['1'], fakeRandom([0]), () => {
        editor.selection = new vscode.Selection(1, 0, 2, 1);
      });
      await run('GEN-009', editor, dependencies);
      assert.strictEqual(editor.document.getText(), 'a\nb');
    });
  });

  suite('sequences and generators (GEN-020..030)', () => {
    const threeCursors = async (reversed = true) => {
      const editor = await createTextEditor('\n\n');
      cursorsAtLineStarts(editor, reversed);
      return editor;
    };

    test('the ROADMAP examples: each cursor gets the next value in document order, in one edit', async () => {
      const cases: [string, string[], string[], string][] = [
        ['GEN-020', [], [], 'a\nb\nc'],
        ['GEN-021', [], [], 'I\nII\nIII'],
        ['GEN-022', ['2026-09-28'], [], '2026-09-28\n2026-09-29\n2026-09-30'],
        ['GEN-025', ['0x0A'], [], '0x0A\n0x0B\n0x0C'],
        ['GEN-026', [], ['gojuon'], 'あ\nい\nう'],
        ['GEN-026', [], ['iroha'], 'イ\nロ\nハ'],
        ['GEN-027', [], [], '①\n②\n③'],
        ['GEN-030', ['192.0.2.1'], [], '192.0.2.1\n192.0.2.2\n192.0.2.3'],
      ];
      for (const [id, answers, picks, expected] of cases) {
        const editor = await threeCursors();
        const { dependencies, warnings, errors } = recorder(answers, fakeRandom(), undefined, picks);
        const versionBefore = editor.document.version;
        await run(id, editor, dependencies);
        assert.strictEqual(editor.document.getText(), expected, id);
        assert.strictEqual(editor.document.version, versionBefore + 1, id);
        assert.deepStrictEqual([warnings, errors], [[], []], id);
      }
    });

    test('selections are replaced by the values of their positions', async () => {
      const editor = await createTextEditor('x y z');
      editor.selections = [new vscode.Selection(0, 4, 0, 5), new vscode.Selection(0, 0, 0, 1), new vscode.Selection(0, 2, 0, 3)];
      await run('GEN-020', editor, recorder().dependencies);
      assert.strictEqual(editor.document.getText(), 'a b c');
    });

    test('Number Range / Column Ruler / Repeat Character: every cursor gets the whole text; line breaks follow the document', async () => {
      const editor = await crlfEditor('\n');
      cursorsAtLineStarts(editor);
      await run('GEN-023', editor, recorder(['1..10 step 3']).dependencies);
      assert.strictEqual(editor.document.getText(), '1\r\n4\r\n7\r\n10\r\n1\r\n4\r\n7\r\n10');
      const ruler = await crlfEditor('');
      await run('GEN-028', ruler, recorder(['30']).dependencies);
      assert.strictEqual(ruler.document.getText(), '·········1·········2·········3\r\n123456789012345678901234567890');
      const line = await createTextEditor('');
      await run('GEN-024', line, recorder(['=', '20']).dependencies);
      assert.strictEqual(line.document.getText(), '====================');
    });

    test('Repeat Character: the spaces of the typed characters are kept', async () => {
      const editor = await createTextEditor('');
      const { dependencies, prompts } = recorder([' -', '5']);
      await run('GEN-024', editor, dependencies);
      assert.strictEqual(editor.document.getText(), ' - - ');
      assert.strictEqual(prompts[0].validateInput?.(' '), undefined);
      assert.strictEqual(prompts[0].validateInput?.(''), 'Enter 1 to 16 characters to repeat.');
      assert.match(prompts[0].validateInput?.('\t') as string, /control characters/);
      assert.strictEqual(prompts[1].validateInput?.('10001'), 'Enter an integer from 1 to 10,000.');
    });

    test('GUID: the UUID of the random source, braced and in upper case, for each cursor', async () => {
      const editor = await createTextEditor('\n');
      cursorsAtLineStarts(editor);
      await run('GEN-029', editor, recorder().dependencies);
      assert.strictEqual(editor.document.getText(), '{3F2504E0-4F89-41D3-9A0C-0305E82C3301}\n{3F2504E0-4F89-41D3-9A0C-0305E82C3301}');
    });

    test('Kana Sequence: the order is chosen with a quick pick; cancelling it does nothing', async () => {
      const editor = await createTextEditor('keep');
      const { dependencies, warnings, errors, prompts, quickPicks } = recorder([], fakeRandom(), undefined, [undefined]);
      await run('GEN-026', editor, dependencies);
      assert.strictEqual(editor.document.getText(), 'keep');
      assert.deepStrictEqual([warnings, errors, prompts.length], [[], [], 0]);
      assert.strictEqual(quickPicks.length, 1);
      assert.deepStrictEqual(quickPicks[0].items.map((item) => item.value), ['gojuon', 'iroha']);
      assert.strictEqual(quickPicks[0].options.ignoreFocusOut, true);
    });

    test('a sequence too short for the cursors is refused before anything is written', async function () {
      this.timeout(60_000);
      const cases: [string, number, string[], string[], RegExp][] = [
        ['GEN-021', 4000, [], [], /4,000 selections and cursors, but the Roman numeral sequence/],
        ['GEN-026', 47, [], ['gojuon'], /47 selections and cursors, but the gojūon order/],
        ['GEN-026', 48, [], ['iroha'], /48 selections and cursors, but the iroha order/],
        ['GEN-027', 51, [], [], /51 selections and cursors, but the circled number sequence/],
        ['GEN-022', 3, ['9999-12-30'], [], /past 9999-12-31/],
        ['GEN-030', 3, ['255.255.255.254'], [], /past 255\.255\.255\.255/],
      ];
      for (const [id, count, answers, picks, message] of cases) {
        const text = '\n'.repeat(count - 1);
        const editor = await createTextEditor(text);
        cursorsAtLineStarts(editor);
        const { dependencies, warnings, errors } = recorder(answers, fakeRandom(), undefined, picks);
        await run(id, editor, dependencies);
        assert.strictEqual(editor.document.getText(), text, id);
        assert.deepStrictEqual(warnings, [], id);
        assert.strictEqual(errors.length, 1, id);
        assert.ok(errors[0].startsWith(GEN_NOT_CHANGED), errors[0]);
        assert.match(errors[0], message, id);
      }
    });

    test('the longest sequences fit exactly (3,999 Roman numerals, 50 circled numbers, 47 iroha kana)', async function () {
      this.timeout(60_000);
      const cases: [string, number, string[], string][] = [
        ['GEN-021', 3999, [], 'MMMCMXCIX'],
        ['GEN-027', 50, [], '㊿'],
        ['GEN-026', 47, ['iroha'], 'ス'],
      ];
      for (const [id, count, picks, last] of cases) {
        const editor = await createTextEditor('\n'.repeat(count - 1));
        cursorsAtLineStarts(editor);
        const { dependencies, errors } = recorder([], fakeRandom(), undefined, picks);
        await run(id, editor, dependencies);
        assert.deepStrictEqual(errors, [], id);
        const lines = editor.document.getText().split('\n');
        assert.strictEqual(lines.length, count, id);
        assert.strictEqual(lines[count - 1], last, id);
      }
    });

    test('Number Range: the output limit stops the generation and only warns', async function () {
      this.timeout(60_000);
      const editor = await createTextEditor('\n'.repeat(19));
      cursorsAtLineStarts(editor);
      // 20 cursors × 100,000 numbers of up to 16 digits + line breaks > 10,000,000 characters.
      const { dependencies, warnings, errors } = recorder(['1000000000000000..1000000000099999']);
      await run('GEN-023', editor, dependencies);
      assert.strictEqual(editor.document.getText(), '\n'.repeat(19));
      assert.deepStrictEqual(errors, []);
      assert.strictEqual(warnings.length, 1);
      assert.match(warnings[0], /longer than 10,000,000 characters/);
    });

    test('invalid typed values are refused while typing and again before running', async () => {
      const cases: [string, string, RegExp][] = [
        ['GEN-022', '2026-02-30', /^The date must be a valid date/],
        ['GEN-023', '1..10 step 0', /^The step must not be 0\./],
        ['GEN-025', '0xZZ', /^Enter a hexadecimal number/],
        ['GEN-028', '1001', /^Enter an integer from 1 to 1,000\./],
        ['GEN-030', '192.0.2.256', /^Each part of the address/],
      ];
      for (const [id, value, message] of cases) {
        const editor = await createTextEditor('keep');
        const { dependencies, warnings, prompts } = recorder([value]);
        await run(id, editor, dependencies);
        assert.match(prompts[0].validateInput?.(value) as string, message, id);
        assert.strictEqual(editor.document.getText(), 'keep', id);
        assert.strictEqual(warnings.length, 1, id);
        assert.match(warnings[0].slice(GEN_NOT_CHANGED.length), message, id);
      }
    });
  });

  suite('crypto (smoke test, forms only)', () => {
    test('the real random source gives values of the right form', async () => {
      const forms: [string, string[], RegExp][] = [
        ['GEN-001', [], /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/],
        ['GEN-002', [], /^[0-7][0-9A-HJKMNP-TV-Z]{25}$/],
        ['GEN-003', [], /^[A-Za-z0-9_-]{21}$/],
        ['GEN-004', ['16'], /^[0-9a-f]{32}$/],
        ['GEN-005', ['24'], /^[A-Za-z0-9_-]{32}$/],
        ['GEN-006', ['1..6'], /^[1-6]$/],
        ['GEN-007', ['0..1', '3'], /^(0\.\d{3}|1\.000)$/],
        ['GEN-010', [], /^[0-9a-f][26ae](:[0-9a-f]{2}){5}$/],
        ['GEN-011', [], /^#[0-9a-f]{6}$/],
        ['GEN-012', ['2026-01-01..2026-12-31'], /^2026-\d{2}-\d{2}$/],
        ['GEN-013', [], /^[a-z]+\d{4}@example\.com$/],
        ['GEN-014', [], /^[A-Z][a-z]+ [A-Z][a-z]+$/],
        ['GEN-015', [], /^\S+ \S+$/],
        ['GEN-016', [], /^090-0\d{3}-\d{4}$/],
        ['GEN-017', ['3'], /^([^。]+。){3}$/],
        ['GEN-018', [], /^(true|false)$/],
        ['GEN-019', ['2d6'], /^(\d+) \([1-6]\+[1-6]\)$/],
        ['GEN-029', [], /^\{[0-9A-F]{8}-[0-9A-F]{4}-4[0-9A-F]{3}-[89AB][0-9A-F]{3}-[0-9A-F]{12}\}$/],
      ];
      for (const [id, answers, form] of forms) {
        const editor = await createTextEditor('');
        const { dependencies, errors, warnings } = recorder(answers, cryptoRandom);
        await run(id, editor, { ...dependencies, now: () => new Date() });
        assert.deepStrictEqual([errors, warnings], [[], []], id);
        assert.match(editor.document.getText(), form, id);
      }
    });
  });

  suite('registration', () => {
    test('command IDs and titles match the GEN table of docs/ROADMAP.md', () => {
      const rows = roadmapRows();
      assert.strictEqual(rows.length, 30);
      GEN_COMMAND_ENTRIES.forEach((entry) => {
        const row = rows.find(([id]) => id === entry.id);
        assert.ok(row, entry.id);
        assert.deepStrictEqual(row, [entry.id, '基本', `selection-manipulator.${entry.name}`, entry.title]);
      });
      // In ROADMAP order.
      assert.deepStrictEqual(GEN_COMMAND_ENTRIES.map((entry) => entry.id), rows.map(([id]) => id).slice(0, GEN_COMMAND_ENTRIES.length));
      assert.deepStrictEqual(GEN_RANDOM_ENTRIES.map((entry) => entry.id), rows.map(([id]) => id).slice(0, 19));
      assert.deepStrictEqual(GEN_SEQUENCE_ENTRIES.map((entry) => entry.id), rows.map(([id]) => id).slice(19));
      assert.strictEqual(GEN_COMMAND_ENTRIES.length, 30);
      assert.strictEqual(new Set(GEN_COMMAND_ENTRIES.map((entry) => entry.name)).size, 30);
    });

    // The wiring in extension.ts is checked statically (as for the other categories).
    test('extension.ts registers every command with genCommandHandler exactly once', () => {
      const source = readRepoFile('src/extension.ts');
      GEN_COMMAND_ENTRIES.forEach((entry) => {
        const registration = `registerTextEditorCommand('selection-manipulator.${entry.name}', genCommandHandler('${entry.name}'))`;
        assert.strictEqual(source.split(registration).length - 1, 1, registration);
        assert.strictEqual(source.split(`'selection-manipulator.${entry.name}'`).length - 1, 1, entry.name);
      });
    });

    test('package.json and the Show Commands list register every command exactly once', () => {
      const contributes = JSON.parse(readRepoFile('package.json')).contributes;
      type MenuItem = { command?: string; submenu?: string; group?: string; when?: string };
      const count = (entries: MenuItem[], id: string) => entries.filter((entry) => entry.command === id).length;
      GEN_COMMAND_ENTRIES.forEach((entry) => {
        const id = `selection-manipulator.${entry.name}`;
        assert.strictEqual(count(contributes.commands, id), 1, `commands: ${id}`);
        assert.strictEqual(count(myCommands, id), 1, `showCommands: ${id}`);
        assert.deepStrictEqual(contributes.commands.find((c: { command: string }) => c.command === id),
          { command: id, title: entry.title, category: 'Selection Manipulator' });
        const shown = myCommands.find((c) => c.command === id);
        assert.strictEqual(shown?.title, entry.title);
        assert.strictEqual(shown?.canMultiSelection, true);
        // Only the commands that need selected text are hidden from the palette without a selection.
        const palette = contributes.menus.commandPalette.filter((c: MenuItem) => c.command === id);
        assert.deepStrictEqual(palette, entry.targets === 'lines' ? [{ when: 'editorHasSelection', command: id }] : [], id);
        const submenu = entry.name.startsWith('random.') ? 'selection-manipulator.random.submenu' : 'selection-manipulator.generate.submenu';
        Object.entries(contributes.menus).filter(([name]) => name !== 'commandPalette').forEach(([name, items]) =>
          assert.strictEqual(count(items as MenuItem[], id), name === submenu ? 1 : 0, `${name}: ${id}`));
      });
      const ids = contributes.commands.map((c: { command: string }) => c.command);
      assert.strictEqual(new Set(ids).size, ids.length, 'command IDs are unique');
      const titles = contributes.commands.map((c: { title: string; category?: string }) => `${c.category ?? ''}:${c.title}`);
      assert.strictEqual(new Set(titles).size, titles.length, 'command titles are unique');
      const allTitles = myCommands.map((c) => c.title);
      assert.strictEqual(new Set(allTitles).size, allTitles.length, 'Show Commands titles are unique');
    });

    test('the Random submenu keeps UUID and Lorem Ipsum first; GEN-001..019 follow in ROADMAP order', () => {
      const items: { command: string; group: string }[] = JSON.parse(readRepoFile('package.json')).contributes.menus['selection-manipulator.random.submenu'];
      assert.deepStrictEqual(items.map((item) => item.command), [
        'selection-manipulator.random.uuid',
        'selection-manipulator.random.lorem-ipsum',
        ...GEN_RANDOM_ENTRIES.map((entry) => `selection-manipulator.${entry.name}`),
      ]);
      items.forEach((item, i) => assert.strictEqual(item.group, `selection-manipulator@${i}`, item.command));
    });

    test('the new Generate submenu holds GEN-020..030 in ROADMAP order, after the existing items of the root submenu', () => {
      const contributes = JSON.parse(readRepoFile('package.json')).contributes;
      assert.deepStrictEqual(contributes.submenus.filter((s: { id: string }) => s.id === 'selection-manipulator.generate.submenu'),
        [{ id: 'selection-manipulator.generate.submenu', label: 'Generate' }]);
      const items: { command: string; group: string }[] = contributes.menus['selection-manipulator.generate.submenu'];
      assert.deepStrictEqual(items.map((item) => item.command), GEN_SEQUENCE_ENTRIES.map((entry) => `selection-manipulator.${entry.name}`));
      items.forEach((item, i) => assert.strictEqual(item.group, `selection-manipulator@${i}`, item.command));
      const root: { submenu?: string; group: string }[] = contributes.menus['selection-manipulator.submenu'];
      assert.deepStrictEqual(root.filter((item) => item.submenu === 'selection-manipulator.generate.submenu'),
        [{ submenu: 'selection-manipulator.generate.submenu', group: 'selection-manipulator@15' }]);
      // The existing items keep their places (@0..@14), Generate follows them (Unicode, added
      // later, comes after it) and no group is used twice.
      root.forEach((item, i) => assert.strictEqual(item.group, `selection-manipulator@${i}`, item.submenu));
      assert.strictEqual(root[15].submenu, 'selection-manipulator.generate.submenu');
      assert.strictEqual(new Set(root.map((item) => item.group)).size, root.length);
    });

    test('the existing random commands keep their handlers, titles and menus', () => {
      const source = readRepoFile('src/extension.ts');
      for (const name of ['uuid', 'password', 'ipv4', 'ipv6', 'lorem-ipsum']) {
        assert.strictEqual(source.split(`registerTextEditorCommand('selection-manipulator.random.${name}', randomHandler('${name}'))`).length - 1, 1, name);
      }
      const contributes = JSON.parse(readRepoFile('package.json')).contributes;
      const titleOf = (name: string) => contributes.commands.find((c: { command: string }) => c.command === `selection-manipulator.random.${name}`)?.title;
      assert.deepStrictEqual(['uuid', 'password', 'ipv4', 'ipv6', 'lorem-ipsum'].map(titleOf),
        ['Random UUID', 'Random - Random Password', 'Random - Random IPv4', 'Random - Random IPv6', 'Random: Lorem Ipsum']);
      const submenu = contributes.menus['selection-manipulator.submenu'].find((item: { submenu?: string }) => item.submenu === 'selection-manipulator.random.submenu');
      assert.strictEqual(submenu.group, 'selection-manipulator@7');
    });

    test('no dependency was added', () => {
      const packageJson = JSON.parse(readRepoFile('package.json'));
      assert.deepStrictEqual(Object.keys(packageJson.dependencies).sort(), ['change-case', 'diff', 'js-yaml', 'xml-formatter']);
    });
  });

  suite('source code rules (SECURITY.md)', () => {
    const files = ['genCommon.ts', 'genRandom.ts', 'genSequence.ts', 'genTransforms.ts', 'genCommandHandler.ts'];
    files.forEach((file) => {
      test(`${file} uses no Math.random, eval, Function constructor, processes, network, files, dynamic require or regular expressions built from text`, () => {
        // Comments are removed first: they may mention what the code avoids.
        const source = fs.readFileSync(path.resolve(__dirname, '../../../src/handler', file), 'utf8')
          .replace(/\/\*[\s\S]*?\*\//g, '')
          .replace(/^\s*\/\/.*$/gm, '');
        [/Math\.random/, /\beval\s*\(/, /\bnew\s+Function\b/, /\bFunction\s*\(/, /child_process/, /\brequire\s*\(/, /\bimport\s*\(/,
          /from 'node:(?:fs|net|http|https|dns|vm)'/, /from '(?:fs|net|http|https|dns|vm)'/, /\bfetch\s*\(/, /setTimeout\s*\(\s*['"`]/,
          /\bnew\s+RegExp\b/, /\bRegExp\s*\(/, /createWebviewPanel/]
          .forEach((pattern) => assert.ok(!pattern.test(source), `${file}: ${pattern}`));
      });
    });

    test('only genCommon.ts touches crypto', () => {
      files.filter((file) => file !== 'genCommon.ts').forEach((file) => {
        const source = fs.readFileSync(path.resolve(__dirname, '../../../src/handler', file), 'utf8');
        assert.ok(!/from '(?:node:)?crypto'/.test(source), file);
      });
    });
  });
});

function repeat(value: number, n: number): number[] {
  return new Array<number>(n).fill(value);
}
