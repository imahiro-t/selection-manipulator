import * as assert from 'assert';
import * as fs from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';
import {
  ENC2_NOT_CHANGED,
  enc2CommandHandlerInternal,
  Enc2Dependencies,
  SHAKE_LENGTH_PROMPT,
  UU_FILE_NAME_PROMPT,
} from '../../handler/enc2CommandHandler';
import { BASE62_MAX_ENCODE_BYTES, ENC2_COMMAND_ENTRIES, Enc2CommandEntry } from '../../handler/enc2Transforms';
import { KEY_EMPTY_MESSAGE } from '../../handler/hashTransforms';
import { myCommands } from '../../handler/showCommandsHandler';
import { ENC2_EXAMPLES, expandEnc2 } from './enc2Examples';
import { createTextEditor } from './testUtils';
import { candidateRows } from './showcaseData';

const PREFIX = 'selection-manipulator.';

/**
 * Records what the handlers show; the input boxes answer with `answers` in turn (`undefined` =
 * cancelled) and the results that would open in a new editor are collected.
 */
const recorder = (answers: (string | undefined)[] = []) => {
  const infos: string[] = [];
  const warnings: string[] = [];
  const errors: string[] = [];
  const boxes: vscode.InputBoxOptions[] = [];
  const opened: string[] = [];
  const titled: string[][][] = [];
  const logged: string[] = [];
  const queue = [...answers];
  const dependencies: Enc2Dependencies = {
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
    openResult: (content) => {
      opened.push(content);
      return Promise.resolve(undefined);
    },
    openResultWithTitles: (pairs) => {
      titled.push(pairs);
      return Promise.resolve(undefined);
    },
    logError: (message) => {
      logged.push(message);
    },
  };
  const messages = () => [...infos, ...warnings, ...errors];
  return { dependencies, infos, warnings, errors, boxes, opened, titled, logged, messages };
};

const entryOf = (id: string): Enc2CommandEntry => {
  const found = ENC2_COMMAND_ENTRIES.find((entry) => entry.id === id);
  assert.ok(found, id);
  return found;
};

const run = (id: string, dependencies: Enc2Dependencies) => enc2CommandHandlerInternal(dependencies)(entryOf(id).name);

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

suite('Encoding, Escaping & Hash Commands (ENCX-001..022) Test Suite', () => {

  suite('each command (showcase example)', () => {
    ENC2_COMMAND_ENTRIES.forEach((entry) => {
      const example = ENC2_EXAMPLES[entry.id];

      test(`${entry.id} ${entry.name}: ${JSON.stringify(example.input)}`, async () => {
        const { dependencies, infos, warnings, errors, boxes, opened, titled } = recorder(example.answer === undefined ? [] : [example.answer]);
        const editor = await open(example.input);
        await run(entry.id, dependencies)(editor);
        assert.strictEqual(boxes.length, entry.input === undefined ? 0 : 1);
        assert.strictEqual(editor.document.getText(), example.input, 'the document is never changed');
        assert.deepStrictEqual([warnings, errors], [[], []]);
        switch (entry.kind) {
          case 'transform':
            assert.deepStrictEqual([opened, titled, infos], [[example.expected], [], []]);
            break;
          case 'digest':
            assert.deepStrictEqual([opened, titled, infos], [[], [[[example.input, example.expected]]], []]);
            break;
          case 'notify':
            assert.deepStrictEqual([opened, titled, infos], [[], [], [example.expected]]);
            break;
        }
      });
    });
  });

  suite('selections', () => {
    test('several selections: converted in document order and joined with the EOL of the document', async () => {
      const editor = await createTextEditor('foo\r\nfoobar');
      assert.strictEqual(editor.document.eol, vscode.EndOfLine.CRLF);
      editor.selections = [new vscode.Selection(1, 0, 1, 6), new vscode.Selection(0, 0, 0, 3)];
      const { dependencies, opened } = recorder();
      await run('ENCX-001', dependencies)(editor);
      assert.deepStrictEqual(opened, ['CPNMU===\r\nCPNMUOJ1E8======']);
    });

    test('uuencode uses the EOL of the document and asks for the file name once for all selections', async () => {
      const editor = await createTextEditor('Cat\r\nDog');
      editor.selections = [new vscode.Selection(0, 0, 0, 3), new vscode.Selection(1, 0, 1, 3)];
      const { dependencies, boxes, opened } = recorder(['pets.txt']);
      await run('ENCX-007', dependencies)(editor);
      assert.strictEqual(boxes.length, 1);
      assert.deepStrictEqual(opened, ['begin 644 pets.txt\r\n#0V%T\r\n`\r\nend\r\nbegin 644 pets.txt\r\n#1&]G\r\n`\r\nend']);
    });

    test('hashes: one heading per selection, of the untrimmed text', async () => {
      const editor = await open(' abc|abc', [[0, 4], [5, 8]]);
      const { dependencies, titled } = recorder();
      await run('ENCX-019', dependencies)(editor);
      assert.deepStrictEqual(titled, [[[' abc', '2e58'], ['abc', '514a']]]);
    });

    test('empty selections are ignored; only cursors do nothing and ask nothing', async () => {
      for (const entry of ENC2_COMMAND_ENTRIES) {
        const { dependencies, boxes, opened, titled, messages } = recorder(['1']);
        const editor = await open('abc', [[1, 1]]);
        await run(entry.id, dependencies)(editor);
        assert.deepStrictEqual([boxes.length, opened, titled, messages()], [0, [], [], []], entry.id);
      }
      const { dependencies, opened } = recorder();
      const mixed = await open('foo bar', [[0, 3], [4, 4]]);
      await run('ENCX-009', dependencies)(mixed);
      assert.deepStrictEqual(opened, ['%66%6F%6F']);
    });

    test('IBAN / ISBN: several selections in one notification that never contains the selected text', async () => {
      const text = 'GB82 WEST 1234 5698 7654 32|GB82 WEST 1234 5698 7654 33|hello';
      const editor = await open(text, [[56, 61], [0, 27], [28, 55]]);
      const { dependencies, infos, boxes, opened, titled } = recorder();
      await run('ENCX-021', dependencies)(editor);
      assert.deepStrictEqual(infos, ['IBAN: #1 valid, #2 invalid, #3 not an IBAN']);
      assert.deepStrictEqual([boxes.length, opened, titled], [0, [], []]);
      assert.ok(!infos[0].includes('GB82') && !infos[0].includes('WEST'));

      const isbn = await open('978-4-00-310101-9');
      const second = recorder();
      await run('ENCX-022', second.dependencies)(isbn);
      assert.deepStrictEqual(second.infos, ['ISBN-13: invalid (the check digit should be 8)']);
      assert.ok(!second.infos[0].includes('310101'));
      assert.strictEqual(isbn.document.getText(), '978-4-00-310101-9');
    });

    test('ISBN-10 with a final X after a hyphen is accepted', async () => {
      const editor = await open('0-8044-2957-X');
      const { dependencies, infos } = recorder();
      await run('ENCX-022', dependencies)(editor);
      assert.deepStrictEqual(infos, ['ISBN-10: valid']);
    });
  });

  suite('limits and failures', () => {
    test('invalid input: nothing is opened, the reason and the selection are told', async () => {
      const editor = await open('6x7 6x-7', [[0, 3], [4, 8]]);
      const { dependencies, errors, opened } = recorder();
      await run('ENCX-006', dependencies)(editor);
      assert.deepStrictEqual(opened, []);
      assert.deepStrictEqual(errors, [`${ENC2_NOT_CHANGED}selection 2 of 2: "-" at position 3 is not a Base62 character`]);
    });

    test('Base62: the input limit is checked before converting', async () => {
      const editor = await open('x'.repeat(BASE62_MAX_ENCODE_BYTES + 1));
      const { dependencies, errors, opened } = recorder();
      await run('ENCX-005', dependencies)(editor);
      assert.deepStrictEqual(opened, []);
      assert.deepStrictEqual(errors, [`${ENC2_NOT_CHANGED}the input is too long (limit: 10,000 UTF-8 bytes)`]);
    });

    test('a result over the output limit is refused from the estimate, before converting', async () => {
      const editor = await open('a'.repeat(720_000));
      const { dependencies, warnings, errors, opened } = recorder();
      await run('ENCX-014', dependencies)(editor);
      assert.deepStrictEqual([opened, errors], [[], []]);
      assert.deepStrictEqual(warnings, [`${ENC2_NOT_CHANGED}the result would be longer than 10,000,000 characters. Select less text.`]);
    });

    test('the output limit counts all selections together', async () => {
      // Each estimate (14 per character) fits on its own, but the actual results (12 per character)
      // of both together are over the limit.
      const text = `${'あ'.repeat(450_000)}\n${'あ'.repeat(450_000)}`;
      const editor = await createTextEditor(text);
      editor.selections = [new vscode.Selection(0, 0, 0, 450_000), new vscode.Selection(1, 0, 1, 450_000)];
      assert.strictEqual(editor.selections.length, 2);
      const { dependencies, warnings, opened } = recorder();
      await run('ENCX-014', dependencies)(editor);
      assert.deepStrictEqual(opened, [], 'the first selection fits on its own but nothing is opened');
      assert.strictEqual(warnings.length, 1);
    });

    test('an unexpected failure shows a fixed message and logs no selected text', async () => {
      const { dependencies, errors, logged } = recorder();
      dependencies.openResult = () => {
        throw new TypeError('secret selected text');
      };
      const editor = await open('secret');
      await run('ENCX-009', dependencies)(editor);
      assert.deepStrictEqual(errors, [`${ENC2_NOT_CHANGED}the text could not be processed.`]);
      assert.ok(logged.some((message) => message.includes('(TypeError)')), logged.join('\n'));
      assert.ok(logged.every((message) => !message.includes('secret')), logged.join('\n'));
    });
  });

  suite('input boxes', () => {
    test('SHAKE256: 1 to 1,024 bytes (default 32); a value outside is refused, 1,024 gives 2,048 hex digits', async () => {
      assert.strictEqual(SHAKE_LENGTH_PROMPT.value, '32');
      const validate = SHAKE_LENGTH_PROMPT.validateInput as (value: string) => string | undefined;
      for (const invalid of ['0', '1025', '1.5', '-1', '', 'abc']) {
        assert.ok(validate(invalid), invalid);
        const { dependencies, opened, titled, messages } = recorder([invalid]);
        const editor = await open('abc');
        await run('ENCX-017', dependencies)(editor);
        assert.deepStrictEqual([opened, titled, messages()], [[], [], []], invalid);
      }
      const { dependencies, titled } = recorder(['1024']);
      const editor = await open('abc');
      await run('ENCX-017', dependencies)(editor);
      assert.strictEqual(titled[0][0][1].length, 2048);
      assert.ok(titled[0][0][1].endsWith('66a4b37f64d405bb6b040d9640ba423e8a7a7fc2a13c75e3b842a4713b49c008'));
    });

    test('HMAC-SHA3-512: the key is asked in a password box and never appears in a message or the result', async () => {
      const key = 'my-secret-key-123';
      const { dependencies, boxes, titled, messages } = recorder([key]);
      const editor = await open('abc');
      await run('ENCX-018', dependencies)(editor);
      assert.strictEqual(boxes.length, 1);
      assert.strictEqual(boxes[0].password, true);
      assert.strictEqual(boxes[0].ignoreFocusOut, true);
      assert.ok((boxes[0].validateInput as (value: string) => string | undefined)(''));
      assert.strictEqual(titled.length, 1);
      assert.ok(!JSON.stringify(titled).includes(key));
      assert.deepStrictEqual(messages(), []);
    });

    test('HMAC-SHA3-512: cancelling does nothing; an empty key that gets past the box is refused with a fixed text', async () => {
      const cancelled = recorder([undefined]);
      await run('ENCX-018', cancelled.dependencies)(await open('abc'));
      assert.deepStrictEqual([cancelled.titled, cancelled.messages()], [[], []]);
      const empty = recorder(['']);
      await run('ENCX-018', empty.dependencies)(await open('abc'));
      assert.deepStrictEqual([empty.titled, empty.warnings], [[], [`${ENC2_NOT_CHANGED}${KEY_EMPTY_MESSAGE}`]]);
    });

    test('uuencode: the file name box offers "data" and refuses unsafe names; cancelling does nothing', async () => {
      assert.strictEqual(UU_FILE_NAME_PROMPT.value, 'data');
      const validate = UU_FILE_NAME_PROMPT.validateInput as (value: string) => string | undefined;
      for (const invalid of ['a b', 'a/b', 'x\nend', '', undefined]) {
        if (invalid !== undefined) {
          assert.ok(validate(invalid), invalid);
        }
        const { dependencies, opened, messages } = recorder([invalid]);
        await run('ENCX-007', dependencies)(await open('Cat'));
        assert.deepStrictEqual([opened, messages()], [[], []], String(invalid));
      }
    });
  });

  suite('registration', () => {
    test('candidate IDs, command IDs, titles and examples match the ENCX commands of the showcase data, in its order', () => {
      const rows = candidateRows('ENCX');
      assert.strictEqual(rows.length, 22);
      const order = rows.map(([id]) => id);
      assert.deepStrictEqual(ENC2_COMMAND_ENTRIES.map((entry) => entry.id), order);
      assert.deepStrictEqual(Object.keys(ENC2_EXAMPLES).sort(), [...order].sort(), 'an example for every command');
      for (const [id, kind, command, title, example] of rows) {
        const entry = entryOf(id);
        assert.strictEqual(kind, '基本', id);
        assert.strictEqual(command, `${PREFIX}${entry.name}`, id);
        assert.strictEqual(title, entry.title, id);
        const sides = example.split(' → ');
        assert.strictEqual(sides.length, 2, `${id}: ${example}`);
        const expected = ENC2_EXAMPLES[id];
        const input = codeSpan(sides[0]);
        const noted = /^(.*)（(.*)）$/s.exec(input);
        assert.strictEqual(expandEnc2(noted ? noted[1] : input), expected.input, id);
        assert.strictEqual(noted ? noted[2] : undefined, expected.note, id);
        const output = expandEnc2(codeSpan(sides[1]));
        if (entry.kind === 'notify') {
          assert.strictEqual(output, 'valid（通知）', id);
          assert.ok(expected.expected.endsWith(': valid'), id);
        } else if (output.endsWith('…')) {
          assert.ok(expected.expected.startsWith(output.slice(0, -1)), id);
        } else {
          assert.strictEqual(output, expected.expected, id);
        }
      }
    });

    test('extension.ts registers every command with enc2CommandHandler exactly once', () => {
      const source = readRepoFile('src/extension.ts');
      assert.strictEqual(source.split('// Encoding, escaping & hashes extended (ENCX-001..022, group ENC2)').length - 1, 1);
      ENC2_COMMAND_ENTRIES.forEach((entry) => {
        const registration = `registerTextEditorCommand('${PREFIX}${entry.name}', enc2CommandHandler('${entry.name}'))`;
        assert.strictEqual(source.split(registration).length - 1, 1, registration);
        assert.strictEqual(source.split(`'${PREFIX}${entry.name}'`).length - 1, 1, entry.name);
      });
    });

    test('package.json, the command palette, one submenu each and Show Commands register every command exactly once', () => {
      const contributes = JSON.parse(readRepoFile('package.json')).contributes;
      type MenuItem = { command?: string; submenu?: string; group?: string; when?: string };
      const count = (items: MenuItem[], id: string) => items.filter((item) => item.command === id).length;
      const submenuOf = (entry: Enc2CommandEntry): string => {
        const index = Number(entry.id.slice(5));
        if (index <= 9) {
          return 'selection-manipulator.encode.submenu';
        }
        if (index <= 15) {
          return 'selection-manipulator.programmatic.submenu';
        }
        return index <= 18 ? 'selection-manipulator.crypto.submenu' : 'selection-manipulator.checksum.submenu';
      };
      ENC2_COMMAND_ENTRIES.forEach((entry) => {
        const id = `${PREFIX}${entry.name}`;
        assert.deepStrictEqual(contributes.commands.filter((c: MenuItem) => c.command === id),
          [{ command: id, title: entry.title, category: 'Selection Manipulator' }], id);
        assert.deepStrictEqual(myCommands.filter((c) => c.command === id), [{ command: id, title: entry.showTitle, canMultiSelection: true }], id);
        assert.deepStrictEqual(contributes.menus.commandPalette.filter((c: MenuItem) => c.command === id),
          [{ when: 'editorHasSelection', command: id }], id);
        Object.entries(contributes.menus).filter(([name]) => name !== 'commandPalette').forEach(([name, items]) =>
          assert.strictEqual(count(items as MenuItem[], id), name === submenuOf(entry) ? 1 : 0, `${name}: ${id}`));
      });
      for (const submenu of new Set(ENC2_COMMAND_ENTRIES.map(submenuOf))) {
        const items: MenuItem[] = contributes.menus[submenu];
        const added = ENC2_COMMAND_ENTRIES.filter((entry) => submenuOf(entry) === submenu).map((entry) => `${PREFIX}${entry.name}`);
        assert.deepStrictEqual(items.slice(-added.length).map((item) => item.command), added, `${submenu}: at the end, in order`);
        items.forEach((item, i) => assert.strictEqual(item.group, `selection-manipulator@${i}`, `${submenu}: ${item.command}`));
      }
      const ids = contributes.commands.map((c: { command: string }) => c.command);
      assert.strictEqual(ids.length, 899, '877 before ENC2 + 22');
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

    test('the new modules use no code evaluation, processes, files, network, webviews or node:crypto', () => {
      const forbidden = [
        /\beval\s*\(/, /new\s+Function\b/, /child_process/, /from\s+'(?:node:)?fs'/, /require\(\s*'(?:node:)?fs'\s*\)/,
        /from\s+'(?:node:)?(?:https?|net|dns|tls|dgram|vm|worker_threads)'/, /\bfetch\s*\(/, /XMLHttpRequest/,
        /createWebviewPanel|Webview/, /new\s+RegExp\s*\(/, /from\s+'(?:node:)?crypto'/,
      ];
      for (const file of ['src/handler/enc2Transforms.ts', 'src/handler/enc2CommandHandler.ts', 'src/handler/hash2Transforms.ts', 'src/handler/hashAlgorithms.ts']) {
        const source = readRepoFile(file);
        for (const pattern of forbidden) {
          assert.doesNotMatch(source, pattern, `${file}: ${pattern}`);
        }
      }
    });
  });
});
