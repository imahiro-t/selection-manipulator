import * as assert from 'assert';
import * as path from 'path';
import * as fs from 'fs';
import * as vscode from 'vscode';
import { HashDependencies, hashExtendedHandlerInternal } from '../../handler/hashExtendedHandler';
import { myCommands } from '../../handler/showCommandsHandler';
import { MAX_OUTPUT_LENGTH } from '../../handler/encodeTransforms';
import {
  digestText,
  findKeyProblem,
  HASH_COMMAND_ENTRIES,
  HashCommandEntry,
  KEY_EMPTY_MESSAGE,
  KEY_LONE_SURROGATE_MESSAGE,
} from '../../handler/hashTransforms';
import { HASH_ROADMAP_EXAMPLES } from './hashExamples';
import { createTextEditor } from './testUtils';

const SEPARATOR = '\n---\n';
const SHA256_A = 'ca978112ca1bbdcafac231b39a23dc4da786eff8147c4e72b9807785afee48bb';
const SHA256_B = '3e23e8160039594a33894f6564e1b1348bbd7a0088d42c4acb73eeaed59c009d';
const SHA3_256_ABC = HASH_ROADMAP_EXAMPLES['HASH-003'].expected;
const BLAKE2B_ABC = HASH_ROADMAP_EXAMPLES['HASH-006'].expected;

/**
 * Records what the handlers show and open instead of touching VS Code's UI. The input box answers
 * `answer.value` (`undefined` = cancelled) and records the options it was shown with.
 */
const recorder = (answer: { value: string | undefined } = { value: 'key' }, onPrompt: () => void | Thenable<unknown> = () => undefined) => {
  const infos: string[] = [];
  const warnings: string[] = [];
  const errors: string[] = [];
  const opened: string[] = [];
  const openedWithTitles: string[][][] = [];
  const prompts: vscode.InputBoxOptions[] = [];
  const dependencies: HashDependencies = {
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
    openResult: (content) => {
      opened.push(content);
      return Promise.resolve();
    },
    openResultWithTitles: (pairs) => {
      openedWithTitles.push(pairs);
      return Promise.resolve();
    },
    showInputBox: async (options) => {
      prompts.push(options);
      await onPrompt();
      return answer.value;
    },
  };
  const everything = () => [infos, warnings, errors, opened, openedWithTitles];
  return { dependencies, infos, warnings, errors, opened, openedWithTitles, prompts, everything };
};

const run = (entry: HashCommandEntry, dependencies: HashDependencies) =>
  hashExtendedHandlerInternal(dependencies)(entry.name);

const entryOf = (id: string): HashCommandEntry => {
  const found = HASH_COMMAND_ENTRIES.find((entry) => entry.id === id);
  assert.ok(found, id);
  return found;
};

const selectWholeDocument = (editor: vscode.TextEditor) => {
  const document = editor.document;
  editor.selection = new vscode.Selection(new vscode.Position(0, 0), document.lineAt(document.lineCount - 1).range.end);
};

/** Selects the blocks of a `block---block---...` document with one cursor each. */
const selectBlocks = (editor: vscode.TextEditor, blocks: string[], reversed = false) => {
  const document = editor.document;
  const selections: vscode.Selection[] = [];
  let offset = 0;
  blocks.forEach((block) => {
    selections.push(new vscode.Selection(document.positionAt(offset), document.positionAt(offset + block.length)));
    offset += block.length + SEPARATOR.length;
  });
  editor.selections = reversed ? selections.reverse() : selections;
};

/** `openTextDocument({ content })` turns a lone surrogate into U+FFFD, so the text is inserted with an edit. */
const createEditorWith = async (text: string): Promise<vscode.TextEditor> => {
  const editor = await createTextEditor('');
  await editor.edit((builder) => builder.insert(new vscode.Position(0, 0), text));
  assert.strictEqual(editor.document.getText(), text);
  return editor;
};

const closeAllEditors = async () => {
  for (let i = 0; i < 20 && vscode.window.visibleTextEditors.length > 0; i++) {
    await vscode.commands.executeCommand('workbench.action.revertAndCloseActiveEditor');
  }
};

/** The HASH rows of docs/ROADMAP.md: [id, command ID, title, example]. */
const roadmapRows = (): [string, string, string, string][] => {
  const roadmap = fs.readFileSync(path.resolve(__dirname, '../../../docs/ROADMAP.md'), 'utf8');
  return roadmap.split('\n')
    .filter((line) => /^\| HASH-\d{3} \|/.test(line))
    .map((line) => {
      const cells = line.split('|').map((cell) => cell.trim());
      return [cells[1], cells[4].replace(/`/g, ''), cells[5], cells[7]];
    });
};

suite('Hash Commands (HASH-001..020) Test Suite', () => {

  teardown(closeAllEditors);

  suite('each command (ROADMAP example)', () => {
    HASH_COMMAND_ENTRIES.forEach((entry) => {
      const example = HASH_ROADMAP_EXAMPLES[entry.id];

      if (entry.output === 'replace') {
        test(`${entry.id} ${entry.name}: replaces each selection and opens nothing`, async () => {
          const { dependencies, everything } = recorder();
          const blocks = [example.input, 'x'];
          const editor = await createTextEditor(blocks.join(SEPARATOR));
          selectBlocks(editor, blocks);
          await run(entry, dependencies)(editor);
          assert.ok(entry.kind === 'digest');
          const expectedX = digestText(entry.algorithm, entry.encoding, 'x');
          assert.strictEqual(editor.document.getText(), [example.expected, expectedX].join(SEPARATOR));
          assert.deepStrictEqual(everything(), [[], [], [], [], []]);
        });
      } else if (entry.output === 'notify') {
        test(`${entry.id} ${entry.name}: notifies the result and leaves the document unchanged`, async () => {
          const { dependencies, infos, everything } = recorder();
          const editor = await createTextEditor(example.input);
          selectWholeDocument(editor);
          await run(entry, dependencies)(editor);
          assert.deepStrictEqual(infos, [example.expected]);
          assert.strictEqual(editor.document.getText(), example.input);
          assert.deepStrictEqual(everything().slice(1), [[], [], [], []]);
        });
      } else if (entry.kind === 'digest-each-line') {
        test(`${entry.id} ${entry.name}: opens the hashes of every line without headings`, async () => {
          const { dependencies, opened, everything } = recorder();
          const editor = await createTextEditor(example.input);
          selectWholeDocument(editor);
          await run(entry, dependencies)(editor);
          assert.deepStrictEqual(opened, [example.expected]);
          assert.strictEqual(editor.document.getText(), example.input);
          assert.deepStrictEqual(everything().filter((list) => list !== opened), [[], [], [], []]);
        });
      } else {
        test(`${entry.id} ${entry.name}: opens the selected text and its result in a new editor`, async () => {
          const { dependencies, openedWithTitles, prompts, everything } = recorder({ value: example.key });
          const blocks = [example.input, example.input];
          const editor = await createTextEditor(blocks.join(SEPARATOR));
          selectBlocks(editor, blocks, true);
          await run(entry, dependencies)(editor);
          assert.deepStrictEqual(openedWithTitles, [[[example.input, example.expected], [example.input, example.expected]]]);
          assert.strictEqual(editor.document.getText(), blocks.join(SEPARATOR));
          assert.deepStrictEqual(everything().filter((list) => list !== openedWithTitles), [[], [], [], []]);
          assert.strictEqual(prompts.length, entry.kind === 'hmac' ? 1 : 0);
        });
      }

      test(`${entry.id} ${entry.name}: only empty selections do nothing (no input box)`, async () => {
        const { dependencies, prompts, everything } = recorder();
        const editor = await createTextEditor(example.input);
        editor.selections = [new vscode.Selection(0, 0, 0, 0), new vscode.Selection(0, 1, 0, 1)];
        await run(entry, dependencies)(editor);
        assert.strictEqual(editor.document.getText(), example.input);
        assert.deepStrictEqual(everything(), [[], [], [], [], []]);
        assert.strictEqual(prompts.length, 0);
      });
    });
  });

  suite('selections', () => {
    test('results are in document order and empty selections are skipped', async () => {
      const { dependencies, openedWithTitles } = recorder();
      const editor = await createTextEditor('hello\nabc');
      editor.selections = [new vscode.Selection(1, 0, 1, 3), new vscode.Selection(0, 2, 0, 2), new vscode.Selection(0, 0, 0, 5)];
      await run(entryOf('HASH-011'), dependencies)(editor);
      assert.deepStrictEqual(openedWithTitles, [[['hello', '3610a686'], ['abc', '352441c2']]]);
    });

    test('the hash is of the untrimmed selected text', async () => {
      const { dependencies, openedWithTitles } = recorder();
      const editor = await createTextEditor(' abc ');
      selectWholeDocument(editor);
      await run(entryOf('HASH-003'), dependencies)(editor);
      assert.strictEqual(openedWithTitles[0][0][0], ' abc ');
      assert.strictEqual(openedWithTitles[0][0][1], digestText('sha3-256', 'hex', ' abc '));
      assert.notStrictEqual(openedWithTitles[0][0][1], SHA3_256_ABC);
    });

    test('Replace versions use the self-implemented SHA3-256 / BLAKE2b-512 per selection', async () => {
      for (const [id, expected] of [['HASH-019', SHA3_256_ABC], ['HASH-020', BLAKE2B_ABC]]) {
        const { dependencies } = recorder();
        const editor = await createTextEditor(['abc', 'abc'].join(SEPARATOR));
        selectBlocks(editor, ['abc', 'abc']);
        await run(entryOf(id), dependencies)(editor);
        assert.strictEqual(editor.document.getText(), [expected, expected].join(SEPARATOR), id);
      }
    });

    test('HASH-016 joins the results of several selections with the document EOL and keeps each line break', async () => {
      const { dependencies, opened } = recorder();
      const editor = await createTextEditor('a\n\nb\nx\na');
      await editor.edit((editBuilder) => editBuilder.setEndOfLine(vscode.EndOfLine.CRLF));
      editor.selections = [new vscode.Selection(0, 0, 2, 1), new vscode.Selection(4, 0, 4, 1)];
      await run(entryOf('HASH-016'), dependencies)(editor);
      assert.deepStrictEqual(opened, [`${SHA256_A}\r\n\r\n${SHA256_B}\r\n${SHA256_A}`]);
    });

    test('HASH-016 keeps a trailing line break of the selection as an empty line', async () => {
      const { dependencies, opened } = recorder();
      const editor = await createTextEditor('a\nb\n');
      editor.selection = new vscode.Selection(0, 0, 2, 0);
      await run(entryOf('HASH-016'), dependencies)(editor);
      assert.deepStrictEqual(opened, [`${SHA256_A}\n${SHA256_B}\n`]);
    });
  });

  suite('lone surrogates', () => {
    const cases: [string, string][] = [
      ['HASH-002', 'a\ud83d'],
      ['HASH-004', '\ud83db'],
      ['HASH-011', 'x\ud83d'],
      ['HASH-016', 'a\n\ud83d'],
      ['HASH-018', 'a\ud83d'],
      ['HASH-020', 'a\ud83d'],
      ['HASH-008', 'a\ud83d'],
      ['HASH-010', 'a\ud83d'],
    ];
    cases.forEach(([id, input]) => {
      test(`${id}: a lone surrogate in the selection shows an error and changes nothing`, async () => {
        const { dependencies, errors, everything } = recorder();
        const editor = await createEditorWith(input);
        selectWholeDocument(editor);
        await run(entryOf(id), dependencies)(editor);
        assert.strictEqual(editor.document.getText(), input);
        assert.deepStrictEqual(errors, ['The selection was not changed: the text contains a lone surrogate (\\ud83d)']);
        assert.deepStrictEqual(everything().filter((list) => list !== errors), [[], [], [], []]);
      });
    });

    test('one invalid selection among several: nothing is replaced, the message names the selection', async () => {
      const { dependencies, errors } = recorder();
      const blocks = ['abc', 'x\ud83d'];
      const editor = await createEditorWith(blocks.join(SEPARATOR));
      selectBlocks(editor, blocks);
      await run(entryOf('HASH-019'), dependencies)(editor);
      assert.strictEqual(editor.document.getText(), blocks.join(SEPARATOR));
      assert.deepStrictEqual(errors, ['The selection was not changed: selection 2 of 2: the text contains a lone surrogate (\\ud83d)']);
    });
  });

  suite('HMAC keys (HASH-008..010)', () => {
    const hmacEntries = HASH_COMMAND_ENTRIES.filter((entry) => entry.kind === 'hmac');

    test('the key is asked once as a password with validateInput', async () => {
      for (const entry of hmacEntries) {
        const { dependencies, prompts, openedWithTitles } = recorder({ value: 'key' });
        const blocks = ['abc', 'abc', 'abc'];
        const editor = await createTextEditor(blocks.join(SEPARATOR));
        selectBlocks(editor, blocks);
        await run(entry, dependencies)(editor);
        assert.strictEqual(prompts.length, 1, entry.id);
        assert.strictEqual(prompts[0].password, true);
        assert.strictEqual(prompts[0].ignoreFocusOut, true);
        assert.ok(prompts[0].prompt);
        assert.strictEqual(prompts[0].value, undefined, 'no initial value');
        assert.strictEqual(prompts[0].validateInput, findKeyProblem);
        assert.strictEqual(openedWithTitles[0].length, 3);
      }
    });

    test('validateInput rejects an empty key and a lone surrogate with fixed messages', async () => {
      const { dependencies, prompts } = recorder({ value: undefined });
      const editor = await createTextEditor('abc');
      selectWholeDocument(editor);
      await run(entryOf('HASH-009'), dependencies)(editor);
      const validate = prompts[0].validateInput;
      assert.ok(validate);
      assert.strictEqual(await validate(''), KEY_EMPTY_MESSAGE);
      assert.strictEqual(await validate('my\ud83dsecret'), KEY_LONE_SURROGATE_MESSAGE);
      assert.strictEqual(await validate('my secret'), undefined);
    });

    const rejected: [string, string | undefined, string[]][] = [
      ['cancelled', undefined, []],
      ['an empty key', '', [`The selection was not changed: ${KEY_EMPTY_MESSAGE}`]],
      ['a key with a lone surrogate', 'top\ud83dsecret', [`The selection was not changed: ${KEY_LONE_SURROGATE_MESSAGE}`]],
    ];
    rejected.forEach(([label, value, expectedWarnings]) => {
      test(`${label}: nothing is opened or changed`, async () => {
        for (const entry of hmacEntries) {
          const { dependencies, warnings, everything } = recorder({ value });
          const editor = await createTextEditor('abc');
          selectWholeDocument(editor);
          await run(entry, dependencies)(editor);
          assert.strictEqual(editor.document.getText(), 'abc');
          assert.deepStrictEqual(warnings, expectedWarnings, entry.id);
          assert.deepStrictEqual(everything().filter((list) => list !== warnings), [[], [], [], []], entry.id);
          warnings.forEach((warning) => assert.ok(!warning.includes('secret') && !warning.includes('\\u'), warning));
        }
      });
    });

    test('the key never appears in the result or in a message', async () => {
      for (const entry of hmacEntries) {
        const key = 'VerySecretKey';
        const { dependencies, openedWithTitles, errors } = recorder({ value: key });
        const blocks = ['abc', 'x\ud83d'];
        const editor = await createEditorWith(blocks.join(SEPARATOR));
        selectBlocks(editor, blocks);
        await run(entry, dependencies)(editor);
        assert.strictEqual(errors.length, 1);
        assert.ok(!errors[0].includes(key), errors[0]);

        editor.selections = [new vscode.Selection(0, 0, 0, 3)];
        await run(entry, dependencies)(editor);
        assert.ok(!JSON.stringify(openedWithTitles).includes(key));
        assert.strictEqual(openedWithTitles.length, 1);
      }
    });

    test('the selections are read again after the input box closes', async () => {
      const editor = await createTextEditor('x\nabc');
      editor.selection = new vscode.Selection(1, 0, 1, 3);
      const { dependencies, openedWithTitles } = recorder({ value: 'key' }, async () => {
        await editor.edit((editBuilder) => editBuilder.insert(new vscode.Position(0, 0), 'zz\n'));
      });
      await run(entryOf('HASH-010'), dependencies)(editor);
      assert.deepStrictEqual(openedWithTitles, [[['abc', HASH_ROADMAP_EXAMPLES['HASH-010'].expected]]]);
    });
  });

  suite('HASH-017 Luhn notifications', () => {
    const luhn = entryOf('HASH-017');

    const runLuhn = async (blocks: string[]) => {
      const recorded = recorder();
      const editor = await createTextEditor(blocks.join(SEPARATOR));
      selectBlocks(editor, blocks);
      await run(luhn, recorded.dependencies)(editor);
      assert.strictEqual(editor.document.getText(), blocks.join(SEPARATOR), 'the document is not changed');
      assert.deepStrictEqual(recorded.everything().slice(1), [[], [], [], []]);
      assert.strictEqual(recorded.infos.length, 1);
      blocks.forEach((block) => assert.ok(!recorded.infos[0].includes(block), recorded.infos[0]));
      return recorded.infos[0];
    };

    test('one selection', async () => {
      assert.strictEqual(await runLuhn(['79927398710']), 'Luhn: invalid');
      assert.strictEqual(await runLuhn(['7992-7398-71a']), 'Luhn: not a number (only digits, spaces and hyphens are allowed)');
      assert.strictEqual(await runLuhn(['7']), 'Luhn: not a number (at least 2 digits are required)');
    });

    test('several selections are listed by number in document order', async () => {
      assert.strictEqual(await runLuhn(['79927398713', '79927398710', 'abc']), 'Luhn: #1 valid, #2 invalid, #3 not a number');
    });

    test('11 or more selections are summarised', async () => {
      const blocks = [...Array(6).fill('79927398713'), ...Array(4).fill('79927398710'), 'x1'];
      assert.strictEqual(await runLuhn(blocks), 'Luhn: 11 selections: 6 valid, 4 invalid, 1 not a number');
    });
  });

  suite('output size limit', () => {
    test('HASH-016 refuses a selection whose estimate exceeds the limit and opens nothing', async () => {
      const { dependencies, opened, warnings, errors } = recorder();
      // 200,000 lines x 64 characters > 10,000,000.
      const text = 'a\n'.repeat(200_000);
      const editor = await createTextEditor(text);
      selectWholeDocument(editor);
      await run(entryOf('HASH-016'), dependencies)(editor);
      assert.deepStrictEqual([opened, errors], [[], []]);
      assert.strictEqual(warnings.length, 1);
      assert.ok(warnings[0].startsWith('The selection was not changed: '), warnings[0]);
      assert.ok(warnings[0].includes(MAX_OUTPUT_LENGTH.toLocaleString('en-US')), warnings[0]);
    });

    test('the limit is shared by all selections', async () => {
      const { dependencies, opened, warnings } = recorder();
      // Each block alone is below the limit (100,001 x 64), both together are above it.
      const block = 'a\n'.repeat(100_000);
      const editor = await createTextEditor([block, block].join(SEPARATOR));
      selectBlocks(editor, [block, block]);
      await run(entryOf('HASH-016'), dependencies)(editor);
      assert.deepStrictEqual(opened, []);
      assert.strictEqual(warnings.length, 1);
    });
  });

  suite('registration', () => {
    test('command IDs, titles and examples match the HASH table of docs/ROADMAP.md', () => {
      const rows = roadmapRows();
      assert.deepStrictEqual(rows.map(([id]) => id), HASH_COMMAND_ENTRIES.map((entry) => entry.id));
      assert.deepStrictEqual(rows.map(([, command]) => command), HASH_COMMAND_ENTRIES.map((entry) => `selection-manipulator.${entry.name}`));
      rows.forEach(([id, , , example]) => {
        const match = /^`(.*)` → `(.*)`$/.exec(example);
        assert.ok(match, `${id}: ${example}`);
        const expected = HASH_ROADMAP_EXAMPLES[id];
        const input = expected.key === undefined ? expected.input : `${expected.input}（鍵: ${expected.key}）`;
        assert.strictEqual(match[1].replace(/⏎/g, '\n'), input, id);
        if (id === 'HASH-017') {
          assert.strictEqual(match[2], 'valid（通知）', id);
          return;
        }
        // The ROADMAP shows the beginning of long results (and of each line for HASH-016) followed by `…`.
        const shown = match[2].split('⏎');
        const lines = expected.expected.split('\n');
        assert.strictEqual(shown.length, lines.length, id);
        shown.forEach((part, i) => {
          const prefix = part.endsWith('…') ? part.slice(0, -1) : part;
          assert.ok(part.endsWith('…') ? lines[i].startsWith(prefix) : lines[i] === prefix, `${id}: ${part}`);
        });
      });
    });

    // The wiring in extension.ts is checked statically (as for the ENC commands), because running
    // the commands through executeCommand would activate the extension inside the test host.
    test('extension.ts registers every command with the matching handler exactly once', () => {
      const source = fs.readFileSync(path.resolve(__dirname, '../../../src/extension.ts'), 'utf8');
      HASH_COMMAND_ENTRIES.forEach((entry) => {
        const registration = `registerTextEditorCommand('selection-manipulator.${entry.name}', hashExtendedHandler('${entry.name}'))`;
        assert.strictEqual(source.split(registration).length - 1, 1, registration);
        assert.strictEqual(source.split(`'selection-manipulator.${entry.name}'`).length - 1, 1, entry.name);
      });
    });

    test('package.json and the Show Commands list register all 20 commands exactly once', () => {
      const packageJson = JSON.parse(fs.readFileSync(path.resolve(__dirname, '../../../package.json'), 'utf8'));
      const contributes = packageJson.contributes;
      type MenuItem = { command?: string; submenu?: string; group?: string; when?: string };
      const count = (entries: MenuItem[], id: string) => entries.filter((entry) => entry.command === id).length;
      const cryptoMenu: MenuItem[] = contributes.menus['selection-manipulator.crypto.submenu'];
      const checksumMenu: MenuItem[] = contributes.menus['selection-manipulator.checksum.submenu'];
      const replaceMenu: MenuItem[] = contributes.menus['selection-manipulator.crypto.replace.submenu'];
      const titles = new Map(roadmapRows().map(([, command, title]) => [command, title]));
      HASH_COMMAND_ENTRIES.forEach((entry) => {
        const id = `selection-manipulator.${entry.name}`;
        assert.strictEqual(count(contributes.commands, id), 1, `commands: ${id}`);
        assert.strictEqual(count(myCommands, id), 1, `showCommands: ${id}`);
        const command = contributes.commands.find((c: { command: string }) => c.command === id);
        assert.strictEqual(command.title, titles.get(id), id);
        assert.strictEqual(command.category, 'Selection Manipulator');
        const shown = myCommands.find((c) => c.command === id);
        const group = entry.name.startsWith('checksum.') ? 'Checksum' : 'Crypto';
        assert.strictEqual(shown?.title, `Transform - ${group} - ${titles.get(id)}`);
        assert.strictEqual(shown?.canMultiSelection, true);
        const palette = contributes.menus.commandPalette.filter((c: MenuItem) => c.command === id);
        assert.deepStrictEqual(palette, [{ when: 'editorHasSelection', command: id }], id);
        const menu = entry.output === 'replace' ? replaceMenu : entry.name.startsWith('checksum.') ? checksumMenu : cryptoMenu;
        const others = [cryptoMenu, checksumMenu, replaceMenu].filter((m) => m !== menu);
        assert.strictEqual(count(menu, id), 1, `menu: ${id}`);
        others.forEach((other) => assert.strictEqual(count(other, id), 0, `other menu: ${id}`));
      });
      // The existing items keep their places; the new ones follow them in ROADMAP order.
      assert.strictEqual(cryptoMenu.length, 10 + 13);
      assert.strictEqual(checksumMenu.length, 4);
      assert.strictEqual(replaceMenu.length, 6 + 3);
      [cryptoMenu, checksumMenu, replaceMenu].forEach((menu) =>
        menu.forEach((item, i) => assert.strictEqual(item.group, `selection-manipulator@${i}`, item.command)));
      assert.deepStrictEqual(cryptoMenu.slice(10).map((item) => item.command),
        HASH_COMMAND_ENTRIES.filter((e) => e.output !== 'replace' && e.name.startsWith('crypto.')).map((e) => `selection-manipulator.${e.name}`));
      assert.deepStrictEqual(checksumMenu.map((item) => item.command),
        HASH_COMMAND_ENTRIES.filter((e) => e.name.startsWith('checksum.')).map((e) => `selection-manipulator.${e.name}`));
      assert.deepStrictEqual(replaceMenu.slice(6).map((item) => item.command),
        HASH_COMMAND_ENTRIES.filter((e) => e.output === 'replace').map((e) => `selection-manipulator.${e.name}`));
      const submenus: { id: string; label: string }[] = contributes.submenus;
      assert.deepStrictEqual(submenus.filter((s) => s.id === 'selection-manipulator.checksum.submenu'), [
        { id: 'selection-manipulator.checksum.submenu', label: 'Checksum' },
      ]);
      const parent: MenuItem[] = contributes.menus['selection-manipulator.transform.submenu'];
      assert.deepStrictEqual(parent.filter((item) => item.submenu === 'selection-manipulator.checksum.submenu'), [
        { when: 'editorHasSelection', submenu: 'selection-manipulator.checksum.submenu', group: `selection-manipulator@${parent.length - 1}` },
      ]);
      const ids = contributes.commands.map((c: { command: string }) => c.command);
      assert.strictEqual(new Set(ids).size, ids.length, 'command IDs are unique');
      const allTitles = myCommands.map((c) => c.title);
      assert.strictEqual(new Set(allTitles).size, allTitles.length, 'Show Commands titles are unique');
    });
  });
});
