import * as assert from 'assert';
import * as path from 'path';
import * as fs from 'fs';
import { gzipSync } from 'node:zlib';
import * as vscode from 'vscode';
import {
  EncDependencies,
  encodeHandlerInternal,
  encodeInputHandlerInternal,
  validateShiftInput,
} from '../../handler/encodeHandler';
import { myCommands } from '../../handler/showCommandsHandler';
import { ENC2_COMMAND_ENTRIES } from '../../handler/enc2Transforms';
import {
  ENC_COMMAND_ENTRIES,
  EncCommandEntry,
  MAX_OUTPUT_LENGTH,
} from '../../handler/encodeTransforms';
import { ENC_ROADMAP_EXAMPLES } from './encodeExamples';
import { createTextEditor } from './testUtils';
import { candidateRows } from './showcaseData';

const SEPARATOR = '\n---\n';

/** Records what the handlers show and open instead of touching VS Code's UI. */
const recorder = () => {
  const warnings: string[] = [];
  const errors: string[] = [];
  const opened: string[] = [];
  const dependencies: EncDependencies = {
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
  };
  return { dependencies, warnings, errors, opened };
};

type Runner = (editor: vscode.TextEditor) => Promise<void>;

/**
 * Runs a command with the recording dependencies. ENC-023 answers the input box with `answer.value`
 * (default: the shift of the ROADMAP example; a wrapper so that `undefined` means "cancelled") and counts how often it is shown.
 */
const runnerFor = (
  entry: EncCommandEntry,
  dependencies: EncDependencies,
  answer: { value: string | undefined } = { value: '3' },
  onPrompt: (options: vscode.InputBoxOptions) => void | Thenable<unknown> = () => undefined
): Runner => {
  if (entry.transform === 'caesar') {
    return encodeInputHandlerInternal(async (options) => {
      await onPrompt(options);
      return answer.value;
    }, dependencies)('caesar');
  }
  return encodeHandlerInternal(dependencies)(entry.transform, entry.output);
};

const entryOf = (name: string): EncCommandEntry => {
  const found = ENC_COMMAND_ENTRIES.find((entry) => entry.name === name);
  assert.ok(found, name);
  return found;
};

const selectWholeDocument = (editor: vscode.TextEditor) => {
  const document = editor.document;
  editor.selection = new vscode.Selection(new vscode.Position(0, 0), document.lineAt(document.lineCount - 1).range.end);
};

/** Selects the two blocks of a `blockA---blockB` document with one cursor each. */
const selectBlocks = (editor: vscode.TextEditor, blocks: [string, string], reversed = false) => {
  const document = editor.document;
  const secondStart = blocks[0].length + SEPARATOR.length;
  const selections = [
    new vscode.Selection(document.positionAt(0), document.positionAt(blocks[0].length)),
    new vscode.Selection(document.positionAt(secondStart), document.positionAt(secondStart + blocks[1].length)),
  ];
  editor.selections = reversed ? selections.reverse() : selections;
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

/** The ENC commands of the showcase data (scripts/showcase-data/ENC.json): [id, command ID, title, example]. */
const dataRows = (): [string, string, string, string][] =>
  candidateRows('ENC').map(([id, , command, title, example]): [string, string, string, string] => [id, command, title, example]);

suite('Encode Commands (ENC-001..040) Test Suite', () => {

  teardown(closeAllEditors);

  suite('each command (ROADMAP example)', () => {
    ENC_COMMAND_ENTRIES.forEach((entry) => {
      const example = ENC_ROADMAP_EXAMPLES[entry.id];

      if (entry.output === 'new-tab') {
        test(`${entry.id} ${entry.name}: opens the result in a new editor and leaves the document unchanged`, async () => {
          const { dependencies, opened, errors, warnings } = recorder();
          const editor = await createTextEditor(example.input);
          selectWholeDocument(editor);
          await runnerFor(entry, dependencies)(editor);
          assert.deepStrictEqual(opened, [example.expected]);
          assert.strictEqual(editor.document.getText(), example.input);
          assert.deepStrictEqual([errors, warnings], [[], []]);
        });

        test(`${entry.id} ${entry.name}: multi-cursor results are joined in document order`, async () => {
          const { dependencies, opened } = recorder();
          const blocks: [string, string] = [example.input, example.input];
          const editor = await createTextEditor(blocks.join(SEPARATOR));
          selectBlocks(editor, blocks, true);
          await runnerFor(entry, dependencies)(editor);
          assert.deepStrictEqual(opened, [`${example.expected}\n${example.expected}`]);
          assert.strictEqual(editor.document.getText(), blocks.join(SEPARATOR));
        });
      } else {
        test(`${entry.id} ${entry.name}: replaces the selection and opens nothing`, async () => {
          const { dependencies, opened, errors, warnings } = recorder();
          const editor = await createTextEditor(example.input);
          selectWholeDocument(editor);
          await runnerFor(entry, dependencies)(editor);
          assert.strictEqual(editor.document.getText(), example.expected);
          assert.deepStrictEqual(opened, []);
          assert.deepStrictEqual([errors, warnings], [[], []]);
        });

        test(`${entry.id} ${entry.name}: multi-cursor replaces each selection independently`, async () => {
          const { dependencies } = recorder();
          const blocks: [string, string] = [example.input, example.input];
          const editor = await createTextEditor(blocks.join(SEPARATOR));
          selectBlocks(editor, blocks);
          await runnerFor(entry, dependencies)(editor);
          assert.strictEqual(editor.document.getText(), [example.expected, example.expected].join(SEPARATOR));
        });
      }

      test(`${entry.id} ${entry.name}: an empty selection does nothing`, async () => {
        const { dependencies, opened, errors, warnings } = recorder();
        const editor = await createTextEditor(example.input);
        editor.selection = new vscode.Selection(0, 0, 0, 0);
        let prompts = 0;
        await runnerFor(entry, dependencies, { value: '3' }, () => {
          prompts++;
        })(editor);
        assert.strictEqual(editor.document.getText(), example.input);
        assert.deepStrictEqual([opened, errors, warnings], [[], [], []]);
        assert.strictEqual(prompts, 0);
      });
    });
  });

  suite('basic vs. Replace, multi-cursor and empty selections', () => {
    test('different selections are converted independently (new editor and Replace)', async () => {
      const blocks: [string, string] = ['abc', 'あ'];
      const basic = recorder();
      const editor = await createTextEditor(blocks.join(SEPARATOR));
      selectBlocks(editor, blocks, true);
      await runnerFor(entryOf('hex.encode'), basic.dependencies)(editor);
      assert.deepStrictEqual(basic.opened, ['616263\ne38182']);

      const replace = recorder();
      selectBlocks(editor, blocks);
      await runnerFor(entryOf('hex.encode.replace'), replace.dependencies)(editor);
      assert.strictEqual(editor.document.getText(), `616263${SEPARATOR}e38182`);
      assert.deepStrictEqual(replace.opened, []);
    });

    test('empty selections among multiple cursors are skipped', async () => {
      const { dependencies, opened } = recorder();
      const editor = await createTextEditor('x\n<b>');
      editor.selections = [new vscode.Selection(0, 1, 0, 1), new vscode.Selection(1, 0, 1, 3)];
      await runnerFor(entryOf('html.encode'), dependencies)(editor);
      assert.deepStrictEqual(opened, ['&lt;b&gt;']);

      await runnerFor(entryOf('html.encode.replace'), dependencies)(editor);
      assert.strictEqual(editor.document.getText(), 'x\n&lt;b&gt;');
    });

    test('Replace leaves selections whose result is the same untouched', async () => {
      const { dependencies } = recorder();
      const editor = await createTextEditor('plain\n<b>');
      editor.selections = [new vscode.Selection(0, 0, 0, 5), new vscode.Selection(1, 0, 1, 3)];
      await runnerFor(entryOf('html.encode.replace'), dependencies)(editor);
      assert.strictEqual(editor.document.getText(), 'plain\n&lt;b&gt;');
    });

    test('a new editor joins multi-cursor results with CRLF in a CRLF document', async () => {
      const { dependencies, opened } = recorder();
      const blocks: [string, string] = ['a', 'b'];
      const editor = await createTextEditor(blocks.join(SEPARATOR));
      await toCrlf(editor);
      const document = editor.document;
      editor.selections = [new vscode.Selection(0, 0, 0, 1), new vscode.Selection(2, 0, 2, 1)];
      assert.strictEqual(document.getText(editor.selections[1]), 'b');
      await runnerFor(entryOf('hex.encode'), dependencies)(editor);
      assert.deepStrictEqual(opened, ['61\r\n62']);
    });

    test('Quoted-Printable soft line breaks use the document EOL', async () => {
      const { dependencies, opened } = recorder();
      const editor = await createTextEditor('x'.repeat(80));
      await toCrlf(editor);
      selectWholeDocument(editor);
      await runnerFor(entryOf('quoted-printable.encode'), dependencies)(editor);
      assert.deepStrictEqual(opened, [`${'x'.repeat(75)}=\r\nxxxxx`]);
    });
  });

  suite('invalid input', () => {
    const invalidCases: [string, string][] = [
      ['html.decode', '&#0;'],
      ['html.decode.replace', '&#xD800;'],
      ['unicode.unescape', '\\ud83d'],
      ['unicode.unescape.replace', '\\u{110000}'],
      ['base64url.decode', 'Zm9vP'],
      ['base32.decode', 'MZXW1==='],
      ['base58.decode', '0abc'],
      ['hex.decode', 'zz'],
      ['hex.decode.replace', '616'],
      ['binary.decode', '0100'],
      ['punycode.encode', 'a b'],
      ['punycode.decode', 'a'.repeat(1001)],
      ['punycode.encode', '例え.jp\r\n例え.jp'],
      ['punycode.decode', 'xn--r8jz45g.jp\nexample.jp'],
      ['hex.decode', '100x20'],
      ['hex.decode.replace', '0x'],
      ['quoted-printable.decode', '=ZZ'],
      ['ascii85.decode', '<~Bz~>'],
      ['base64.gunzip', 'aGk='],
      ['url.decode-form', '%E0%A4%A'],
      ['base64.decode-each-line', 'YQ==\n@@'],
    ];
    invalidCases.forEach(([name, input]) => {
      test(`${name}: ${JSON.stringify(input.slice(0, 20))} shows an error and changes nothing`, async () => {
        const { dependencies, opened, errors, warnings } = recorder();
        const editor = await createTextEditor(input);
        selectWholeDocument(editor);
        await runnerFor(entryOf(name), dependencies)(editor);
        assert.strictEqual(editor.document.getText(), input);
        assert.deepStrictEqual(opened, []);
        assert.deepStrictEqual(warnings, []);
        assert.strictEqual(errors.length, 1);
        assert.ok(errors[0].startsWith('The selection was not changed: '), errors[0]);
      });
    });

    test('a huge invalid selection gives a short message', async () => {
      for (const [name, input] of [['hex.decode', 'g'.repeat(200_000)], ['html.decode.replace', `&#${'1'.repeat(200_000)};`]]) {
        const { dependencies, errors } = recorder();
        const editor = await createTextEditor(input);
        selectWholeDocument(editor);
        await runnerFor(entryOf(name), dependencies)(editor);
        assert.strictEqual(editor.document.getText(), input);
        assert.strictEqual(errors.length, 1);
        assert.ok(errors[0].length < 200, `${name}: ${errors[0].length}`);
      }
    });

    test('one invalid selection among several: nothing is changed, the message names the selection', async () => {
      for (const name of ['hex.decode', 'hex.decode.replace']) {
        const { dependencies, opened, errors } = recorder();
        const blocks: [string, string] = ['61 62', 'zz'];
        const editor = await createTextEditor(blocks.join(SEPARATOR));
        selectBlocks(editor, blocks);
        await runnerFor(entryOf(name), dependencies)(editor);
        assert.strictEqual(editor.document.getText(), blocks.join(SEPARATOR), name);
        assert.deepStrictEqual(opened, [], name);
        assert.strictEqual(errors.length, 1, name);
        assert.ok(errors[0].includes('selection 2 of 2'), errors[0]);
      }
    });
  });

  suite('lone surrogates', () => {
    /**
     * `openTextDocument({ content })` turns a lone surrogate into U+FFFD, so the text is inserted
     * with an edit, which keeps it as it is.
     */
    const createEditorWith = async (text: string): Promise<vscode.TextEditor> => {
      const editor = await createTextEditor('');
      await editor.edit((builder) => builder.insert(new vscode.Position(0, 0), text));
      assert.strictEqual(editor.document.getText(), text, 'the document keeps the lone surrogate');
      return editor;
    };

    const cases: [string, string][] = [
      ['hex.encode', 'a\ud83db'],
      ['hex.encode.replace', 'a\ude00b'],
      ['base64url.encode', 'ab\ud83d'],
      ['quoted-printable.encode', '😀\n\ud83d'],
      ['base64.gzip', '\ude00'],
      ['url.encode-form', 'a\ud83d'],
      ['data-uri.encode-text', 'a\ud83d'],
    ];
    cases.forEach(([name, input]) => {
      test(`${name}: ${JSON.stringify(input)} shows an error and changes nothing`, async () => {
        const { dependencies, opened, errors, warnings } = recorder();
        const editor = await createEditorWith(input);
        selectWholeDocument(editor);
        await runnerFor(entryOf(name), dependencies)(editor);
        assert.strictEqual(editor.document.getText(), input);
        assert.deepStrictEqual(opened, []);
        assert.deepStrictEqual(warnings, []);
        assert.strictEqual(errors.length, 1);
        assert.ok(errors[0].startsWith('The selection was not changed: the text contains a lone surrogate'), errors[0]);
      });
    });

    test('Encode Hex (Replace) names the lone code unit', async () => {
      const { dependencies, errors } = recorder();
      const editor = await createEditorWith('x\ud83dy');
      selectWholeDocument(editor);
      await runnerFor(entryOf('hex.encode.replace'), dependencies)(editor);
      assert.strictEqual(editor.document.getText(), 'x\ud83dy');
      assert.deepStrictEqual(errors, ['The selection was not changed: the text contains a lone surrogate (\\ud83d)']);
    });

    test('Encode Hex (Replace) still encodes a surrogate pair', async () => {
      const { dependencies, errors } = recorder();
      const editor = await createEditorWith('x😀y');
      selectWholeDocument(editor);
      await runnerFor(entryOf('hex.encode.replace'), dependencies)(editor);
      assert.deepStrictEqual(errors, []);
      assert.strictEqual(editor.document.getText(), '78f09f988079');
    });
  });

  suite('ENC-023 Caesar Shift input', () => {
    const caesar = entryOf('cipher.caesar');

    test('cancelling or answering a non-integer changes nothing', async () => {
      for (const answer of [undefined, '1.5', 'abc', '', '1e3', '9999999999']) {
        const { dependencies, opened, errors } = recorder();
        const editor = await createTextEditor('abc');
        selectWholeDocument(editor);
        let prompts = 0;
        await runnerFor(caesar, dependencies, { value: answer }, () => {
          prompts++;
        })(editor);
        assert.strictEqual(editor.document.getText(), 'abc', String(answer));
        assert.deepStrictEqual([opened, errors], [[], []], String(answer));
        assert.strictEqual(prompts, 1);
      }
    });

    test('the input box is shown once for several selections, negative shifts work', async () => {
      const { dependencies, opened } = recorder();
      const blocks: [string, string] = ['abc', 'XYZ'];
      const editor = await createTextEditor(blocks.join(SEPARATOR));
      selectBlocks(editor, blocks);
      let prompts = 0;
      await runnerFor(caesar, dependencies, { value: '-3' }, () => {
        prompts++;
      })(editor);
      assert.strictEqual(prompts, 1);
      assert.deepStrictEqual(opened, ['xyz\nUVW']);
    });

    test('the input box gets a prompt and validateInput', async () => {
      const { dependencies } = recorder();
      const editor = await createTextEditor('abc');
      selectWholeDocument(editor);
      const seen: vscode.InputBoxOptions[] = [];
      await runnerFor(caesar, dependencies, { value: '3' }, (options) => {
        seen.push(options);
      })(editor);
      assert.strictEqual(seen.length, 1);
      assert.ok(seen[0].prompt);
      assert.strictEqual(seen[0].validateInput, validateShiftInput);
      ['3', '-3', '+25', '0', '123456789'].forEach((value) => assert.strictEqual(validateShiftInput(value), undefined, value));
      ['1.5', 'abc', '', ' 3', '1e3', '1234567890', '--1'].forEach((value) => assert.ok(validateShiftInput(value), value));
    });

    test('the selection is read again after the input box closes', async () => {
      const { dependencies, opened } = recorder();
      const editor = await createTextEditor('x\nabc');
      editor.selection = new vscode.Selection(1, 0, 1, 3);
      await runnerFor(caesar, dependencies, { value: '1' }, async () => {
        // The document changes while the input box is shown.
        await editor.edit((editBuilder) => editBuilder.insert(new vscode.Position(0, 0), 'zz\n'));
      })(editor);
      assert.deepStrictEqual(opened, ['bcd']);
    });
  });

  suite('output size limit', () => {
    test('a selection whose estimate exceeds the limit is refused before converting', async () => {
      const { dependencies, opened, errors, warnings } = recorder();
      // binary-encode: 9 characters per byte, so 1.2 MB can produce more than 10,000,000 characters.
      const text = 'a'.repeat(1_200_000);
      const editor = await createTextEditor(text);
      selectWholeDocument(editor);
      await runnerFor(entryOf('binary.encode'), dependencies)(editor);
      assert.deepStrictEqual([opened, errors], [[], []]);
      assert.strictEqual(warnings.length, 1);
      assert.ok(warnings[0].startsWith('The selection was not changed: '), warnings[0]);
      assert.ok(warnings[0].includes(MAX_OUTPUT_LENGTH.toLocaleString('en-US')), warnings[0]);
    });

    test('the limit is shared by all selections (estimate stage)', async () => {
      const { dependencies, opened, warnings } = recorder();
      // hex.encode.replace: 2 characters per byte; each block alone is below the limit.
      const block = 'a'.repeat(3_000_000);
      const editor = await createTextEditor([block, block].join(SEPARATOR));
      selectBlocks(editor, [block, block]);
      await runnerFor(entryOf('hex.encode.replace'), dependencies)(editor);
      assert.strictEqual(editor.document.getText(), [block, block].join(SEPARATOR));
      assert.deepStrictEqual(opened, []);
      assert.strictEqual(warnings.length, 1);
    });

    test('gunzip (no estimate) is limited by the actual length of all results', async () => {
      const { dependencies, opened, errors, warnings } = recorder();
      // Each block decompresses to 6,000,000 characters: below the limit alone, above it together.
      const block = gzipSync(Buffer.alloc(6_000_000, 0x61)).toString('base64');
      const editor = await createTextEditor([block, block].join(SEPARATOR));
      selectBlocks(editor, [block, block]);
      await runnerFor(entryOf('base64.gunzip'), dependencies)(editor);
      assert.deepStrictEqual([opened, errors], [[], []]);
      assert.strictEqual(warnings.length, 1);
    });

    test('short gunzip and Punycode inputs are not refused by the estimate', async () => {
      for (const [name, input, expected] of [
        ['base64.gunzip', 'H4sIAAAAAAAAE8vIBACsKpPYAgAAAA==', 'hi'],
        ['punycode.encode', '例え.jp', 'xn--r8jz45g.jp'],
        ['punycode.decode', '㍿', '株式会社'],
      ]) {
        const { dependencies, opened, warnings } = recorder();
        const editor = await createTextEditor(input);
        selectWholeDocument(editor);
        await runnerFor(entryOf(name), dependencies)(editor);
        assert.deepStrictEqual(opened, [expected], name);
        assert.deepStrictEqual(warnings, [], name);
      }
    });
  });

  suite('registration', () => {
    test('command IDs, titles and examples match the ENC commands of the showcase data', () => {
      const rows = dataRows();
      assert.deepStrictEqual(rows.map(([id]) => id), ENC_COMMAND_ENTRIES.map((entry) => entry.id));
      assert.deepStrictEqual(rows.map(([, command]) => command), ENC_COMMAND_ENTRIES.map((entry) => `selection-manipulator.${entry.name}`));
      rows.forEach(([id, , , example]) => {
        const match = /^`(.*)` → `(.*)`$/.exec(example);
        assert.ok(match, `${id}: ${example}`);
        const expected = ENC_ROADMAP_EXAMPLES[id];
        const input = expected.shift === undefined ? expected.input : `${expected.input}（N=${expected.shift}）`;
        assert.strictEqual(match[1].replace(/⏎/g, '\n'), input, id);
        assert.strictEqual(match[2].replace(/⏎/g, '\n'), expected.expected, id);
      });
    });

    // Running the commands through executeCommand would activate the extension inside the test
    // host, which makes the existing "(New Doc)" tests of other suites pick up the wrong document.
    // The wiring in extension.ts is therefore checked statically.
    test('extension.ts registers every command with the matching handler exactly once', () => {
      const source = fs.readFileSync(path.resolve(__dirname, '../../../src/extension.ts'), 'utf8');
      ENC_COMMAND_ENTRIES.forEach((entry) => {
        const handler = entry.transform === 'caesar'
          ? "encodeInputHandler('caesar')"
          : `encodeHandler('${entry.transform}', '${entry.output}')`;
        const registration = `registerTextEditorCommand('selection-manipulator.${entry.name}', ${handler})`;
        assert.strictEqual(source.split(registration).length - 1, 1, registration);
        assert.strictEqual(source.split(`'selection-manipulator.${entry.name}'`).length - 1, 1, entry.name);
      });
    });

    test('package.json and the Show Commands list register all 40 commands exactly once', () => {
      const packageJson = JSON.parse(fs.readFileSync(path.resolve(__dirname, '../../../package.json'), 'utf8'));
      const contributes = packageJson.contributes;
      const count = (entries: { command?: string }[], id: string) => entries.filter((entry) => entry.command === id).length;
      const basicMenu: { command: string; group: string }[] = contributes.menus['selection-manipulator.encode.submenu'];
      const replaceMenu: { command: string; group: string }[] = contributes.menus['selection-manipulator.encode.replace.submenu'];
      const titles = new Map(dataRows().map(([, command, title]) => [command, title]));
      let basicIndex = 0;
      let replaceIndex = 0;
      ENC_COMMAND_ENTRIES.forEach((entry) => {
        const id = `selection-manipulator.${entry.name}`;
        assert.strictEqual(count(contributes.commands, id), 1, `commands: ${id}`);
        assert.strictEqual(count(myCommands, id), 1, `showCommands: ${id}`);
        const command = contributes.commands.find((c: { command: string }) => c.command === id);
        assert.strictEqual(command.title, titles.get(id), id);
        assert.strictEqual(command.category, 'Selection Manipulator');
        const shown = myCommands.find((c) => c.command === id);
        assert.strictEqual(shown?.title, `Transform - Encode - ${titles.get(id)}`);
        assert.strictEqual(shown?.canMultiSelection, true);
        const palette = contributes.menus.commandPalette.filter((c: { command: string }) => c.command === id);
        assert.deepStrictEqual(palette, [{ when: 'editorHasSelection', command: id }], id);
        const menu = entry.output === 'new-tab' ? basicMenu : replaceMenu;
        const index = entry.output === 'new-tab' ? basicIndex++ : replaceIndex++;
        assert.deepStrictEqual(menu[index], { command: id, group: `selection-manipulator@${index}` }, id);
      });
      // The ENC2 encoding commands (ENCX-001..009) follow the 34 ENC commands.
      assert.strictEqual(basicMenu.length, 34 + 9);
      assert.deepStrictEqual(basicMenu.slice(34), ENC2_COMMAND_ENTRIES.slice(0, 9).map((entry, i) => ({ command: `selection-manipulator.${entry.name}`, group: `selection-manipulator@${34 + i}` })));
      assert.strictEqual(replaceMenu.length, 6);
      const submenus: { id: string; label: string }[] = contributes.submenus;
      assert.deepStrictEqual(submenus.filter((s) => s.id.startsWith('selection-manipulator.encode.')), [
        { id: 'selection-manipulator.encode.submenu', label: 'Encode / Decode' },
        { id: 'selection-manipulator.encode.replace.submenu', label: 'Encode / Decode' },
      ]);
      const parentOf = (parent: string, submenu: string) =>
        (contributes.menus[parent] as { submenu?: string; when?: string }[]).filter((item) => item.submenu === submenu);
      assert.strictEqual(parentOf('selection-manipulator.transform.submenu', 'selection-manipulator.encode.submenu').length, 1);
      assert.strictEqual(parentOf('selection-manipulator.replace.submenu', 'selection-manipulator.encode.replace.submenu').length, 1);
      const ids = contributes.commands.map((c: { command: string }) => c.command);
      assert.strictEqual(new Set(ids).size, ids.length, 'command IDs are unique');
      const allTitles = myCommands.map((c) => c.title);
      assert.strictEqual(new Set(allTitles).size, allTitles.length, 'Show Commands titles are unique');
    });
  });
});
