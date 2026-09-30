import * as assert from 'assert';
import * as fs from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';
import { MD_TEXT_NOT_CHANGED, mdCommandHandlerInternal, MdDependencies } from '../../handler/mdCommandHandler';
import { MD_COMMAND_ENTRIES, MD_NO_HEADINGS, MD_WHEN_SELECTION, MdCommandEntry } from '../../handler/mdTransforms';
import { myCommands } from '../../handler/showCommandsHandler';
import { expandMd, MD_ROADMAP_EXAMPLES } from './mdExamples';
import { createTextEditor } from './testUtils';
import { candidateRows } from './showcaseData';

const PREFIX = 'selection-manipulator.';

/** Records what the handlers show; the input boxes answer with `answers` in turn (`undefined` = cancelled). */
const recorder = (answers: (string | undefined)[] = []) => {
  const infos: string[] = [];
  const warnings: string[] = [];
  const errors: string[] = [];
  const boxes: vscode.InputBoxOptions[] = [];
  const queue = [...answers];
  const dependencies: MdDependencies = {
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
  };
  return { dependencies, infos, warnings, errors, boxes };
};

const entryOf = (id: string): MdCommandEntry => {
  const found = MD_COMMAND_ENTRIES.find((entry) => entry.id === id);
  assert.ok(found, id);
  return found;
};

const run = (entry: MdCommandEntry, dependencies: MdDependencies, entries: readonly MdCommandEntry[] = MD_COMMAND_ENTRIES) =>
  mdCommandHandlerInternal(dependencies, entries)(entry.name);

/** Opens `text` and selects the `[start, end]` offsets (all of it when none are given). */
const open = async (text: string, ranges?: [number, number][]): Promise<vscode.TextEditor> => {
  const editor = await createTextEditor(text);
  const document = editor.document;
  editor.selections = (ranges ?? [[0, text.length]]).map(([start, end]) => new vscode.Selection(document.positionAt(start), document.positionAt(end)));
  return editor;
};

/** The selections as `[start, end]` offsets, in document order. */
const selectionsOf = (editor: vscode.TextEditor): [number, number][] => {
  const document = editor.document;
  return editor.selections
    .map((selection): [number, number] => [document.offsetAt(selection.start), document.offsetAt(selection.end)])
    .sort((a, b) => a[0] - b[0]);
};

const closeAllEditors = async () => {
  for (let i = 0; i < 20 && vscode.window.visibleTextEditors.length > 0; i++) {
    await vscode.commands.executeCommand('workbench.action.revertAndCloseActiveEditor');
  }
};

const readRepoFile = (file: string): string => fs.readFileSync(path.resolve(__dirname, '../../..', file), 'utf8');

/** The content of a Markdown code span. */
const codeSpan = (span: string): string => {
  const ticks = /^`+/.exec(span)?.[0] ?? '';
  assert.ok(ticks.length > 0 && span.endsWith(ticks), span);
  const content = span.slice(ticks.length, span.length - ticks.length);
  return content.length >= 2 && content.startsWith(' ') && content.endsWith(' ') ? content.slice(1, -1) : content;
};

/** The MD commands of the showcase data (scripts/showcase-data/MD.json): [id, kind, command ID, title, example]. */
const dataRows = (): [string, string, string, string, string][] => candidateRows('MD');

suite('Markdown Commands (MD-001..025) Test Suite', () => {

  teardown(closeAllEditors);

  suite('each command (ROADMAP example)', () => {
    MD_COMMAND_ENTRIES.forEach((entry) => {
      const example = MD_ROADMAP_EXAMPLES[entry.id];

      test(`${entry.id} ${entry.name}: ${example.input} → ${example.expected}`, async () => {
        const { dependencies, infos, warnings, errors, boxes } = recorder(example.inputs);
        const text = expandMd(example.input);
        const editor = await open(text, example.selection === undefined ? undefined : [example.selection]);
        await run(entry, dependencies)(editor);
        assert.deepStrictEqual([infos, warnings, errors], [[], [], []]);
        assert.strictEqual(boxes.length, entry.inputs?.length ?? 0);
        const expected = expandMd(example.expected);
        assert.strictEqual(editor.document.getText(), expected);
        if (entry.id === 'MD-022') {
          assert.deepStrictEqual(selectionsOf(editor), [[2, 6]], 'the new [^1] is selected');
        } else {
          assert.deepStrictEqual(selectionsOf(editor), [[0, expected.length]], 'the new text is selected');
        }
        await vscode.commands.executeCommand('undo');
        assert.strictEqual(editor.document.getText(), text, 'one undo restores the text');
      });
    });
  });

  suite('selections', () => {
    test('multiple cursors: each selection on its own; empty selections are ignored and stay', async () => {
      const editor = await open('a b c', [[0, 1], [2, 2], [4, 5]]);
      await run(entryOf('MD-010'), recorder().dependencies)(editor);
      assert.strictEqual(editor.document.getText(), '**a** b **c**');
      assert.deepStrictEqual(selectionsOf(editor), [[0, 5], [6, 6], [8, 13]]);
    });

    test('only cursors: nothing happens and no input box is shown (all but MD-003)', async () => {
      for (const entry of MD_COMMAND_ENTRIES.filter((candidate) => !candidate.cursor)) {
        const { dependencies, boxes, infos, warnings, errors } = recorder(['x']);
        const editor = await open('# a\nb', [[1, 1], [4, 4]]);
        await run(entry, dependencies)(editor);
        assert.strictEqual(editor.document.getText(), '# a\nb', entry.id);
        assert.deepStrictEqual([boxes.length, infos, warnings, errors], [0, [], [], []], entry.id);
      }
    });

    test('MD-003: a cursor inserts the table of contents of the whole document and selects it', async () => {
      const editor = await open('\n# A\n## B', [[0, 0]]);
      await run(entryOf('MD-003'), recorder().dependencies)(editor);
      assert.strictEqual(editor.document.getText(), '- [A](#a)\n  - [B](#b)\n\n# A\n## B');
      assert.deepStrictEqual(selectionsOf(editor), [[0, 22]]);
    });

    test('MD-003: repeated headings in several selections are numbered like the whole document', async () => {
      const text = '# A\n# A\ntext\n# A\n## B\n# B';
      // The second and third "# A" (and "## B" / "# B") are in two separate selections.
      const second = text.indexOf('# A', 1);
      const third = text.indexOf('# A', second + 1);
      const lastB = text.lastIndexOf('# B');
      const editor = await open(text, [[second, second + 3], [third, lastB + 3]]);
      await run(entryOf('MD-003'), recorder().dependencies)(editor);
      assert.strictEqual(editor.document.getText(), '# A\n\n- [A](#a-1)\n\ntext\n\n- [A](#a-2)\n  - [B](#b)\n- [B](#b-1)');
      assert.deepStrictEqual(selectionsOf(editor).length, 2);
      // The same anchors as a table of contents of the whole document (inserted at a cursor).
      const whole = await open(text, [[0, 0]]);
      await run(entryOf('MD-003'), recorder().dependencies)(whole);
      assert.ok(whole.document.getText().startsWith('- [A](#a)\n- [A](#a-1)\n- [A](#a-2)\n  - [B](#b)\n- [B](#b-1)\n\n# A\n'), whole.document.getText());
    });

    test('MD-003: no headings informs and changes nothing', async () => {
      const { dependencies, infos } = recorder();
      const editor = await open('text', [[0, 0]]);
      await run(entryOf('MD-003'), dependencies)(editor);
      assert.deepStrictEqual(infos, [MD_NO_HEADINGS]);
      assert.strictEqual(editor.document.getText(), 'text');
    });

    test('MD-022: numbered in document order after the existing footnotes; the definitions go to the end', async () => {
      const text = 'b a [^2]\nc';
      const editor = await open(text, [[2, 3], [0, 1], [9, 10]]);
      await run(entryOf('MD-022'), recorder().dependencies)(editor);
      assert.strictEqual(editor.document.getText(), '[^3] [^4] [^2]\n[^5]\n\n[^3]: b\n[^4]: a\n[^5]: c');
      assert.deepStrictEqual(selectionsOf(editor), [[0, 4], [5, 9], [15, 19]]);
      await vscode.commands.executeCommand('undo');
      assert.strictEqual(editor.document.getText(), text);
    });

    test('MD-023: numbers shared by the selections, definitions at the end of each selection', async () => {
      const text = '[a](x)\n\n[b](y) [c](x)';
      const editor = await open(text, [[0, 6], [8, 22]]);
      await run(entryOf('MD-023'), recorder().dependencies)(editor);
      assert.strictEqual(editor.document.getText(), '[a][1]\n\n[1]: x\n\n[b][2] [c][1]\n\n[2]: y');
      assert.deepStrictEqual(selectionsOf(editor), [[0, 14], [16, 37]]);
    });

    test('partial lines: fences and definitions stand on lines of their own (MD-014, MD-023)', async () => {
      const fence = await open('say a=1 now', [[4, 7]]);
      await run(entryOf('MD-014'), recorder(['js']).dependencies)(fence);
      assert.strictEqual(fence.document.getText(), 'say\n```js\na=1\n```\nnow');
      assert.deepStrictEqual(selectionsOf(fence), [[3, 18]]);
      const text = 'x [a](u) y [b](v) z\nnext';
      const links = await open(text, [[2, 8], [11, 17]]);
      await run(entryOf('MD-023'), recorder().dependencies)(links);
      assert.strictEqual(links.document.getText(), 'x [a][1] y [b][2] z\n\n[1]: u\n[2]: v\nnext');
      assert.deepStrictEqual(selectionsOf(links), [[2, 8], [11, 17]]);
      await vscode.commands.executeCommand('undo');
      assert.strictEqual(links.document.getText(), text, 'one undo restores the text');
    });

    test('a text line right after the block is not taken into it (MD-003, MD-024; QA round 2)', async () => {
      // MD-003: a cursor on the blank line under the title, followed by a paragraph.
      const text = '# Title\n\nIntro\n## B';
      const toc = await open(text, [[8, 8]]);
      await run(entryOf('MD-003'), recorder().dependencies)(toc);
      assert.strictEqual(toc.document.getText(), '# Title\n\n- [Title](#title)\n  - [B](#b)\n\nIntro\n## B');
      await vscode.commands.executeCommand('undo');
      assert.strictEqual(toc.document.getText(), text, 'one undo restores the text');
      // MD-003: the headings selected up to the end of the last one, then a text line.
      const selected = await open('# A\n## B\ntail', [[0, 8]]);
      await run(entryOf('MD-003'), recorder().dependencies)(selected);
      assert.strictEqual(selected.document.getText(), '- [A](#a)\n  - [B](#b)\n\ntail');
      // MD-024: "foo" selected without its line break (Shift+End), then a text line.
      const details = await open('foo\n**bar**', [[0, 3]]);
      await run(entryOf('MD-024'), recorder(['S']).dependencies)(details);
      assert.strictEqual(details.document.getText(), '<details><summary>S</summary>\n\nfoo\n\n</details>\n\n**bar**');
      await vscode.commands.executeCommand('undo');
      assert.strictEqual(details.document.getText(), 'foo\n**bar**', 'one undo restores the text');
    });

    test('CRLF documents: the new line breaks are CRLF (MD-019, MD-003, MD-022)', async () => {
      const editor = await createTextEditor('# a\r\n**b**');
      assert.strictEqual(editor.document.eol, vscode.EndOfLine.CRLF);
      editor.selection = new vscode.Selection(0, 0, 1, 5);
      await run(entryOf('MD-019'), recorder().dependencies)(editor);
      assert.strictEqual(editor.document.getText(), '<h1>a</h1>\r\n<p><strong>b</strong></p>');
      const toc = await createTextEditor('# A\r\n## B');
      toc.selection = new vscode.Selection(0, 0, 0, 0);
      await run(entryOf('MD-003'), recorder().dependencies)(toc);
      assert.strictEqual(toc.document.getText(), '- [A](#a)\r\n  - [B](#b)\r\n\r\n# A\r\n## B');
      const footnote = await createTextEditor('a b\r\n');
      footnote.selection = new vscode.Selection(0, 2, 0, 3);
      await run(entryOf('MD-022'), recorder().dependencies)(footnote);
      assert.strictEqual(footnote.document.getText(), 'a [^1]\r\n\r\n[^1]: b\r\n');
    });

    test('MD-003: the final line break is kept and code-block indentation is dropped (SELEC-00064)', async () => {
      // The whole document selected, up to the end of its final line break.
      const text = '# A\n## B\n';
      const whole = await open(text);
      await run(entryOf('MD-003'), recorder().dependencies)(whole);
      assert.strictEqual(whole.document.getText(), '- [A](#a)\n  - [B](#b)\n');
      await vscode.commands.executeCommand('undo');
      assert.strictEqual(whole.document.getText(), text, 'one undo restores the text');
      // CRLF: the final line break stays CRLF.
      const crlf = await open('# A\r\n## B\r\n');
      assert.strictEqual(crlf.document.eol, vscode.EndOfLine.CRLF);
      await run(entryOf('MD-003'), recorder().dependencies)(crlf);
      assert.strictEqual(crlf.document.getText(), '- [A](#a)\r\n  - [B](#b)\r\n');
      // A cursor after 4 spaces on a line after a blank line: the list starts at the line start.
      const indented = await open('# A\n\n    \n## B', [[9, 9]]);
      await run(entryOf('MD-003'), recorder().dependencies)(indented);
      assert.strictEqual(indented.document.getText(), '# A\n\n- [A](#a)\n  - [B](#b)\n\n## B');
    });

    test('MD-014/023/024: the final line break is kept and code-block indentation is dropped (SELEC-00066)', async () => {
      // The whole document selected, up to the end of its final line break (LF and CRLF).
      const cases: [string, string, string, string][] = [
        ['MD-014', 'js', 'foo\n', '```js\nfoo\n```\n'],
        ['MD-024', 'S', 'foo\n', '<details><summary>S</summary>\n\nfoo\n\n</details>\n'],
        ['MD-023', '', '[a](u)\n', '[a][1]\n\n[1]: u\n'],
        ['MD-014', 'js', 'foo\r\n', '```js\r\nfoo\r\n```\r\n'],
        ['MD-024', 'S', 'foo\r\n', '<details><summary>S</summary>\r\n\r\nfoo\r\n\r\n</details>\r\n'],
        ['MD-023', '', '[a](u)\r\n', '[a][1]\r\n\r\n[1]: u\r\n'],
      ];
      for (const [id, input, text, expected] of cases) {
        const editor = await open(text);
        await run(entryOf(id), recorder(id === 'MD-023' ? [] : [input]).dependencies)(editor);
        assert.strictEqual(editor.document.getText(), expected, `${id} ${JSON.stringify(text)}`);
        await vscode.commands.executeCommand('undo');
        assert.strictEqual(editor.document.getText(), text, `${id}: one undo restores the text`);
      }
      // 4 spaces before the selection on a line after a blank line: the block starts at the line start.
      const fence = await open('para\n\n    foo\n', [[10, 13]]);
      await run(entryOf('MD-014'), recorder(['js']).dependencies)(fence);
      assert.strictEqual(fence.document.getText(), 'para\n\n```js\nfoo\n```\n');
      assert.deepStrictEqual(selectionsOf(fence), [[6, 19]]);
      await vscode.commands.executeCommand('undo');
      assert.strictEqual(fence.document.getText(), 'para\n\n    foo\n', 'one undo restores the indentation');
      const details = await open('para\n\n\tfoo', [[7, 10]]);
      await run(entryOf('MD-024'), recorder(['S']).dependencies)(details);
      assert.strictEqual(details.document.getText(), 'para\n\n<details><summary>S</summary>\n\nfoo\n\n</details>');
      // MD-023: the definitions start at the line start after an indented link.
      const links = await open('para\n\n    [a](u)\n', [[10, 16]]);
      await run(entryOf('MD-023'), recorder().dependencies)(links);
      assert.strictEqual(links.document.getText(), 'para\n\n    [a][1]\n\n[1]: u\n');
    });

    test('MD-003: several cursors on one line of spaces insert separate lists (SELEC-00065)', async () => {
      // The second edit starts where the first one inserts its list: the editor keeps them in order.
      const text = '# A\n\n    ';
      const editor = await open(text, [[5, 5], [9, 9]]);
      await run(entryOf('MD-003'), recorder().dependencies)(editor);
      assert.strictEqual(editor.document.getText(), '# A\n\n- [A](#a)\n\n- [A](#a)');
      await vscode.commands.executeCommand('undo');
      assert.strictEqual(editor.document.getText(), text, 'one undo restores the text');
      // Followed by an empty line; CRLF with a final line break.
      const spaces = await open('# A\n\n  \n\nx', [[5, 5], [7, 7]]);
      await run(entryOf('MD-003'), recorder().dependencies)(spaces);
      assert.strictEqual(spaces.document.getText(), '# A\n\n- [A](#a)\n\n- [A](#a)\n\nx');
      const crlf = await open('# A\r\n\r\n    \r\n', [[7, 7], [11, 11]]);
      await run(entryOf('MD-003'), recorder().dependencies)(crlf);
      assert.strictEqual(crlf.document.getText(), '# A\r\n\r\n- [A](#a)\r\n\r\n- [A](#a)\r\n');
    });

    test('MD-003: a selection of spaces between cursors keeps the lists separate (SELEC-00068)', async () => {
      // The selected space is taken into the edit of the second list: the edits do not overlap.
      const text = '# A\n\n    ';
      const editor = await open(text, [[5, 5], [6, 7], [9, 9]]);
      await run(entryOf('MD-003'), recorder().dependencies)(editor);
      assert.strictEqual(editor.document.getText(), '# A\n\n- [A](#a)\n\n- [A](#a)');
      await vscode.commands.executeCommand('undo');
      assert.strictEqual(editor.document.getText(), text, 'one undo restores the text');
      // The selected indentation before a cursor is dropped.
      const indented = await open('# A\n\n    \n', [[5, 9], [9, 9]]);
      await run(entryOf('MD-003'), recorder().dependencies)(indented);
      assert.strictEqual(indented.document.getText(), '# A\n\n- [A](#a)\n');
    });

    test('a failure in one selection changes nothing and warns', async () => {
      const { dependencies, warnings, errors } = recorder();
      const text = '|a|\n|-|\n\nnot a table';
      const editor = await open(text, [[0, 7], [9, text.length]]);
      await run(entryOf('MD-018'), dependencies)(editor);
      assert.strictEqual(editor.document.getText(), text);
      assert.strictEqual(warnings.length, 1);
      assert.ok(warnings[0].startsWith(`${MD_TEXT_NOT_CHANGED}the selection is not a Markdown table`), warnings[0]);
      assert.deepStrictEqual(errors, []);
    });

    test('MD-025: invalid YAML warns without quoting the selected text', async () => {
      const { dependencies, warnings } = recorder();
      const editor = await open('---\nsecret: [\n---');
      await run(entryOf('MD-025'), dependencies)(editor);
      assert.strictEqual(editor.document.getText(), '---\nsecret: [\n---');
      assert.strictEqual(warnings.length, 1);
      assert.ok(warnings[0].startsWith(`${MD_TEXT_NOT_CHANGED}invalid YAML`), warnings[0]);
      assert.ok(!warnings[0].includes('secret'), warnings[0]);
    });

    test('an unexpected failure shows a fixed message without the selected text', async () => {
      const broken: MdCommandEntry = {
        id: 'FAKE-1', name: 'test.broken', title: 'Broken',
        run: () => {
          throw new TypeError('secret selected text');
        },
      };
      const { dependencies, errors, warnings } = recorder();
      const editor = await open('secret');
      const originalError = console.error;
      const logged: string[] = [];
      console.error = (message: string) => logged.push(message);
      try {
        await run(broken, dependencies, [broken])(editor);
      } finally {
        console.error = originalError;
      }
      assert.deepStrictEqual([errors, warnings], [[`${MD_TEXT_NOT_CHANGED}the selections could not be processed.`], []]);
      assert.ok(logged.every((message) => !message.includes('secret selected text')), logged.join('\n'));
    });
  });

  suite('input boxes (MD-014, 016, 024)', () => {
    test('cancelling changes nothing', async () => {
      for (const entry of MD_COMMAND_ENTRIES.filter((candidate) => candidate.inputs !== undefined)) {
        const { dependencies, boxes, infos, warnings, errors } = recorder([undefined]);
        const editor = await open('abc');
        await run(entry, dependencies)(editor);
        assert.strictEqual(editor.document.getText(), 'abc', entry.id);
        assert.deepStrictEqual([boxes.length, infos, warnings, errors], [1, [], [], []], entry.id);
      }
    });

    test('the boxes validate their values; an invalid value that gets past a box changes nothing', async () => {
      const cases: [string, string, string][] = [['MD-014', 'a b', 'python'], ['MD-016', 'a\nb', 'alt'], ['MD-024', 'x'.repeat(1001), 'summary']];
      for (const [id, bad, good] of cases) {
        const { dependencies, boxes, warnings } = recorder([bad]);
        const editor = await open('abc');
        await run(entryOf(id), dependencies)(editor);
        const validate = boxes[0].validateInput as (value: string) => string | undefined;
        assert.ok(validate(bad), id);
        assert.strictEqual(validate(good), undefined, id);
        assert.strictEqual(validate(''), undefined, `${id}: may be empty`);
        assert.strictEqual(editor.document.getText(), 'abc', id);
        assert.deepStrictEqual(warnings, [], id);
      }
    });

    test('one value is used for every selection', async () => {
      const { dependencies, boxes } = recorder(['S']);
      const editor = await open('a b', [[0, 1], [2, 3]]);
      await run(entryOf('MD-024'), dependencies)(editor);
      assert.strictEqual(boxes.length, 1);
      assert.strictEqual(editor.document.getText(), '<details><summary>S</summary>\n\na\n\n</details>\n\n\n<details><summary>S</summary>\n\nb\n\n</details>');
    });
  });

  suite('registration', () => {
    test('command IDs, kinds, titles and examples match the MD commands of the showcase data, in its order', () => {
      const rows = dataRows();
      assert.strictEqual(rows.length, 25);
      const order = rows.map(([id]) => id);
      assert.deepStrictEqual(MD_COMMAND_ENTRIES.map((entry) => entry.id), order);
      assert.deepStrictEqual(Object.keys(MD_ROADMAP_EXAMPLES).sort(), [...order].sort(), 'an example for every command');
      for (const [id, kind, command, title, example] of rows) {
        const entry = entryOf(id);
        assert.strictEqual(kind, '基本', id);
        assert.strictEqual(command, `${PREFIX}${entry.name}`, id);
        assert.strictEqual(title, entry.title, id);
        const sides = example.split(' → ');
        assert.strictEqual(sides.length, 2, `${id}: ${example}`);
        const expected = MD_ROADMAP_EXAMPLES[id];
        const input = codeSpan(sides[0]);
        const noted = /^(.*)（(.*)）$/s.exec(input);
        // The table writes spaces as spaces or as "·": compared after expanding the notation.
        assert.strictEqual(expandMd(noted ? noted[1] : input), expandMd(expected.input), id);
        assert.strictEqual(noted ? noted[2] : undefined, expected.note, id);
        assert.strictEqual(expandMd(codeSpan(sides[1])), expandMd(expected.expected), id);
      }
    });

    test('extension.ts registers every command with mdCommandHandler exactly once', () => {
      const source = readRepoFile('src/extension.ts');
      MD_COMMAND_ENTRIES.forEach((entry) => {
        const registration = `registerTextEditorCommand('${PREFIX}${entry.name}', mdCommandHandler('${entry.name}'))`;
        assert.strictEqual(source.split(registration).length - 1, 1, registration);
        assert.strictEqual(source.split(`'${PREFIX}${entry.name}'`).length - 1, 1, entry.name);
      });
    });

    test('package.json, the command palette and Show Commands register every command exactly once', () => {
      const contributes = JSON.parse(readRepoFile('package.json')).contributes;
      type MenuItem = { command?: string; submenu?: string; group?: string; when?: string };
      const count = (items: MenuItem[], id: string) => items.filter((item) => item.command === id).length;
      MD_COMMAND_ENTRIES.forEach((entry) => {
        const id = `${PREFIX}${entry.name}`;
        assert.deepStrictEqual(contributes.commands.filter((c: MenuItem) => c.command === id),
          [{ command: id, title: entry.title, category: 'Selection Manipulator' }], id);
        assert.deepStrictEqual(myCommands.filter((c) => c.command === id), [{ command: id, title: entry.title, canMultiSelection: true }], id);
        const palette = contributes.menus.commandPalette.filter((c: MenuItem) => c.command === id);
        assert.deepStrictEqual(palette, [entry.cursor ? { command: id } : { when: MD_WHEN_SELECTION, command: id }], id);
        Object.entries(contributes.menus).filter(([name]) => name !== 'commandPalette').forEach(([name, items]) =>
          assert.strictEqual(count(items as MenuItem[], id), name === 'selection-manipulator.markdown.submenu' ? 1 : 0, `${name}: ${id}`));
      });
      const ids = contributes.commands.map((c: { command: string }) => c.command);
      assert.strictEqual(new Set(ids).size, ids.length, 'command IDs are unique');
      const titles = myCommands.map((c) => c.title);
      assert.strictEqual(new Set(titles).size, titles.length, 'Show Commands titles are unique');
    });

    test('the Markdown submenu: Markdown: Link at @0, then MD-001..025 in ROADMAP order; its place in the Transform submenu is unchanged', () => {
      const contributes = JSON.parse(readRepoFile('package.json')).contributes;
      const items: { command: string; group: string; when?: string }[] = contributes.menus['selection-manipulator.markdown.submenu'];
      assert.deepStrictEqual(items[0], { command: `${PREFIX}markdown.link`, group: 'selection-manipulator@0' });
      assert.strictEqual(items.length, 26);
      MD_COMMAND_ENTRIES.forEach((entry, i) => {
        const command = `${PREFIX}${entry.name}`;
        assert.deepStrictEqual(items[i + 1], entry.cursor
          ? { command, group: `selection-manipulator@${i + 1}` }
          : { command, group: `selection-manipulator@${i + 1}`, when: MD_WHEN_SELECTION }, entry.id);
      });
      const transform: { submenu?: string; group: string }[] = contributes.menus['selection-manipulator.transform.submenu'];
      assert.deepStrictEqual(transform.filter((item) => item.submenu === 'selection-manipulator.markdown.submenu'),
        [{ submenu: 'selection-manipulator.markdown.submenu', group: 'selection-manipulator@15' }]);
    });
  });
});
