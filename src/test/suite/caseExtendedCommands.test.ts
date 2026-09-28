import * as assert from 'assert';
import * as path from 'path';
import * as fs from 'fs';
import * as vscode from 'vscode';
import { caseHandler } from '../../handler/caseHandler';
import { caseDetectHandlerInternal } from '../../handler/caseDetectHandler';
import { caseLocaleHandlerInternal, validateLocaleInput } from '../../handler/caseLocaleHandler';
import { caseJsonKeysHandlerInternal } from '../../handler/caseJsonKeysHandler';
import { createTextEditor } from './testUtils';

type Runner = (editor: vscode.TextEditor) => Promise<void>;

interface CommandCase {
  id: string;
  name: string;
  run: Runner;
  input: string;
  expected: string;
  multiInput: [string, string];
  multiExpected: [string, string];
}

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** caseHandler does not return the edit promise, so wait like the existing case tests. */
const viaCaseHandler = (name: Parameters<typeof caseHandler>[0]): Runner => async (editor) => {
  caseHandler(name)(editor);
  await wait(100);
};

const noop = () => Promise.resolve(undefined);
const localeRunner = (mode: 'upper' | 'lower', answer: string | undefined): Runner =>
  caseLocaleHandlerInternal(() => Promise.resolve(answer))(mode);
const jsonRunner = (style: 'camel' | 'snake' | 'kebab' | 'pascal'): Runner =>
  caseJsonKeysHandlerInternal(noop)(style);

const replaceCases: CommandCase[] = [
  { id: 'CASE-001', name: 'swap', run: viaCaseHandler('swap'), input: 'Hello World', expected: 'hELLO wORLD', multiInput: ['Hello', 'wORLD'], multiExpected: ['hELLO', 'World'] },
  { id: 'CASE-002', name: 'sentence-preserve-acronyms', run: viaCaseHandler('sentence-preserve-acronyms'), input: 'the API URL is ready', expected: 'The API URL is ready', multiInput: ['the API', 'an URL'], multiExpected: ['The API', 'An URL'] },
  { id: 'CASE-003', name: 'title-apa', run: viaCaseHandler('title-apa'), input: 'a guide through the woods', expected: 'A Guide Through the Woods', multiInput: ['a tale of two', 'the end'], multiExpected: ['A Tale of Two', 'The End'] },
  { id: 'CASE-004', name: 'upper-first', run: viaCaseHandler('upper-first'), input: 'hello World', expected: 'Hello World', multiInput: ['hello', 'world'], multiExpected: ['Hello', 'World'] },
  { id: 'CASE-005', name: 'lower-first', run: viaCaseHandler('lower-first'), input: 'HelloWorld', expected: 'helloWorld', multiInput: ['Hello', 'World'], multiExpected: ['hello', 'world'] },
  { id: 'CASE-006', name: 'cobol', run: viaCaseHandler('cobol'), input: 'userName', expected: 'USER-NAME', multiInput: ['userName', 'itemCount'], multiExpected: ['USER-NAME', 'ITEM-COUNT'] },
  { id: 'CASE-007', name: 'ada', run: viaCaseHandler('ada'), input: 'user name', expected: 'User_Name', multiInput: ['userName', 'itemCount'], multiExpected: ['User_Name', 'Item_Count'] },
  { id: 'CASE-008', name: 'flat', run: viaCaseHandler('flat'), input: 'User Name', expected: 'username', multiInput: ['userName', 'itemCount'], multiExpected: ['username', 'itemcount'] },
  { id: 'CASE-009', name: 'upper-flat', run: viaCaseHandler('upper-flat'), input: 'user name', expected: 'USERNAME', multiInput: ['userName', 'itemCount'], multiExpected: ['USERNAME', 'ITEMCOUNT'] },
  { id: 'CASE-010', name: 'camel-snake', run: viaCaseHandler('camel-snake'), input: 'user name id', expected: 'user_Name_Id', multiInput: ['user name id', 'item count'], multiExpected: ['user_Name_Id', 'item_Count'] },
  { id: 'CASE-011', name: 'pascal-snake', run: viaCaseHandler('pascal-snake'), input: 'user name id', expected: 'User_Name_Id', multiInput: ['userName', 'itemCount'], multiExpected: ['User_Name', 'Item_Count'] },
  { id: 'CASE-012', name: 'alternating-words', run: viaCaseHandler('alternating-words'), input: 'one two three', expected: 'ONE two THREE', multiInput: ['one two', 'three four'], multiExpected: ['ONE two', 'THREE four'] },
  { id: 'CASE-013', name: 'acronym', run: viaCaseHandler('acronym'), input: 'portable network graphics', expected: 'PNG', multiInput: ['portable network graphics', 'as soon as possible'], multiExpected: ['PNG', 'ASAP'] },
  { id: 'CASE-015', name: 'cycle', run: viaCaseHandler('cycle'), input: 'userName', expected: 'user_name', multiInput: ['userName', 'user_name'], multiExpected: ['user_name', 'user-name'] },
  { id: 'CASE-016', name: 'upper-acronyms', run: viaCaseHandler('upper-acronyms'), input: 'userId apiUrl', expected: 'userID apiURL', multiInput: ['userId', 'apiUrl'], multiExpected: ['userID', 'apiURL'] },
  { id: 'CASE-017', name: 'sentence-each', run: viaCaseHandler('sentence-each'), input: 'hello. how are you? fine.', expected: 'Hello. How are you? Fine.', multiInput: ['hi. ok', 'yes! no'], multiExpected: ['Hi. Ok', 'Yes! No'] },
  { id: 'CASE-018', name: 'capitalize-lines', run: viaCaseHandler('capitalize-lines'), input: 'foo bar\nbaz', expected: 'Foo bar\nBaz', multiInput: ['foo', 'bar'], multiExpected: ['Foo', 'Bar'] },
  { id: 'CASE-019', name: 'lower-line-start', run: viaCaseHandler('lower-line-start'), input: 'Foo\nBar', expected: 'foo\nbar', multiInput: ['Foo', 'Bar'], multiExpected: ['foo', 'bar'] },
  { id: 'CASE-020', name: 'upper-locale', run: localeRunner('upper', 'tr'), input: 'istanbul', expected: 'İSTANBUL', multiInput: ['istanbul', 'izmir'], multiExpected: ['İSTANBUL', 'İZMİR'] },
  { id: 'CASE-021', name: 'lower-locale', run: localeRunner('lower', 'tr'), input: 'İSTANBUL', expected: 'istanbul', multiInput: ['İSTANBUL', 'İZMİR'], multiExpected: ['istanbul', 'izmir'] },
  { id: 'CASE-022', name: 'json-keys-camel', run: jsonRunner('camel'), input: '{"user_name":"a_b"}', expected: '{"userName":"a_b"}', multiInput: ['{"user_name":1}', '{"item_count":2}'], multiExpected: ['{"userName":1}', '{"itemCount":2}'] },
  { id: 'CASE-023', name: 'json-keys-snake', run: jsonRunner('snake'), input: '{"userName":1}', expected: '{"user_name":1}', multiInput: ['{"userName":1}', '{"itemCount":2}'], multiExpected: ['{"user_name":1}', '{"item_count":2}'] },
  { id: 'CASE-024', name: 'json-keys-kebab', run: jsonRunner('kebab'), input: '{"userName":1}', expected: '{"user-name":1}', multiInput: ['{"userName":1}', '{"itemCount":2}'], multiExpected: ['{"user-name":1}', '{"item-count":2}'] },
  { id: 'CASE-025', name: 'json-keys-pascal', run: jsonRunner('pascal'), input: '{"user_name":1}', expected: '{"UserName":1}', multiInput: ['{"user_name":1}', '{"item_count":2}'], multiExpected: ['{"UserName":1}', '{"ItemCount":2}'] },
  { id: 'CASE-026', name: 'css-variable', run: viaCaseHandler('css-variable'), input: 'primaryColor', expected: '--primary-color', multiInput: ['primaryColor', 'fontSize'], multiExpected: ['--primary-color', '--font-size'] },
  { id: 'CASE-027', name: 'bem', run: viaCaseHandler('bem'), input: 'card title active', expected: 'card__title--active', multiInput: ['card title active', 'menu item'], multiExpected: ['card__title--active', 'menu__item'] },
  { id: 'CASE-028', name: 'pluralize', run: viaCaseHandler('pluralize'), input: 'category\nchild', expected: 'categories\nchildren', multiInput: ['category', 'child'], multiExpected: ['categories', 'children'] },
  { id: 'CASE-029', name: 'singularize', run: viaCaseHandler('singularize'), input: 'categories\nchildren', expected: 'category\nchild', multiInput: ['categories', 'children'], multiExpected: ['category', 'child'] },
  { id: 'CASE-030', name: 'hashtag', run: viaCaseHandler('hashtag'), input: 'hello world', expected: '#HelloWorld', multiInput: ['hello world', 'foo bar'], multiExpected: ['#HelloWorld', '#FooBar'] },
];

const selectWholeDocument = (editor: vscode.TextEditor) => {
  const document = editor.document;
  editor.selection = new vscode.Selection(new vscode.Position(0, 0), document.lineAt(document.lineCount - 1).range.end);
};

const selectEachLine = (editor: vscode.TextEditor) => {
  editor.selections = [0, 1].map((line) => {
    const range = editor.document.lineAt(line).range;
    return new vscode.Selection(range.start, range.end);
  });
};

suite('Extended Case Commands (CASE-001..030) Test Suite', () => {

  replaceCases.forEach((c) => {
    suite(`${c.id} ${c.name}`, () => {
      test('representative case (ROADMAP example)', async () => {
        const editor = await createTextEditor(c.input);
        selectWholeDocument(editor);
        await c.run(editor);
        assert.strictEqual(editor.document.getText(), c.expected);
      });

      test('empty selection leaves the document unchanged', async () => {
        const editor = await createTextEditor(c.input);
        editor.selection = new vscode.Selection(0, 0, 0, 0);
        await c.run(editor);
        assert.strictEqual(editor.document.getText(), c.input);
      });

      test('multi-cursor converts each selection independently', async () => {
        const editor = await createTextEditor(c.multiInput.join('\n'));
        selectEachLine(editor);
        await c.run(editor);
        assert.strictEqual(editor.document.getText(), c.multiExpected.join('\n'));
      });
    });
  });

  suite('CASE-014 detect', () => {
    const detectWith = () => {
      const messages: string[] = [];
      const handler = caseDetectHandlerInternal((message) => {
        messages.push(message);
        return Promise.resolve(undefined);
      });
      return { messages, handler };
    };

    test('representative case: notifies and does not modify the document', async () => {
      const editor = await createTextEditor('user_name');
      selectWholeDocument(editor);
      const { messages, handler } = detectWith();
      await handler(editor);
      assert.deepStrictEqual(messages, ['Detected case: snake_case']);
      assert.strictEqual(editor.document.getText(), 'user_name');
    });

    test('empty selection', async () => {
      const editor = await createTextEditor('user_name');
      editor.selection = new vscode.Selection(0, 0, 0, 0);
      const { messages, handler } = detectWith();
      await handler(editor);
      assert.deepStrictEqual(messages, ['Select text to detect its case.']);
      assert.strictEqual(editor.document.getText(), 'user_name');
    });

    test('multi-cursor lists each result in document order', async () => {
      const editor = await createTextEditor('userName\nuser_name');
      selectEachLine(editor);
      editor.selections = [...editor.selections].reverse();
      const { messages, handler } = detectWith();
      await handler(editor);
      assert.deepStrictEqual(messages, ['Detected case: 1) camelCase, 2) snake_case']);
      assert.strictEqual(editor.document.getText(), 'userName\nuser_name');
    });

    test('more than 10 selections are summarised', async () => {
      const lines = Array.from({ length: 12 }, () => 'user');
      const editor = await createTextEditor(lines.join('\n'));
      editor.selections = lines.map((_, line) => new vscode.Selection(line, 0, line, 4));
      const { messages, handler } = detectWith();
      await handler(editor);
      assert.strictEqual(messages.length, 1);
      assert.ok(messages[0].startsWith('Detected case: 1) flatcase, '), messages[0]);
      assert.ok(messages[0].includes('10) flatcase, ... (+2 more)'), messages[0]);
      assert.ok(!messages[0].includes('11)'), messages[0]);
    });
  });

  suite('CASE-020/021 locale input', () => {
    test('cancel leaves the document unchanged', async () => {
      const editor = await createTextEditor('istanbul');
      selectWholeDocument(editor);
      await localeRunner('upper', undefined)(editor);
      assert.strictEqual(editor.document.getText(), 'istanbul');
    });

    test('blank answer (defensive path) leaves the document unchanged', async () => {
      const editor = await createTextEditor('İSTANBUL');
      selectWholeDocument(editor);
      await localeRunner('lower', '')(editor);
      await localeRunner('lower', '   ')(editor);
      assert.strictEqual(editor.document.getText(), 'İSTANBUL');
    });

    test('asks only once for multiple selections and passes validateInput', async () => {
      const editor = await createTextEditor('istanbul\nizmir');
      selectEachLine(editor);
      const received: vscode.InputBoxOptions[] = [];
      await caseLocaleHandlerInternal((options) => {
        received.push(options);
        return Promise.resolve(' tr ');
      })('upper')(editor);
      assert.strictEqual(received.length, 1);
      assert.strictEqual(received[0].validateInput, validateLocaleInput);
      assert.strictEqual(editor.document.getText(), 'İSTANBUL\nİZMİR');
    });

    test('validateInput', () => {
      assert.strictEqual(validateLocaleInput('@@invalid'), 'Invalid locale tag');
      assert.strictEqual(validateLocaleInput(''), 'Enter a locale tag (e.g. tr)');
      assert.strictEqual(validateLocaleInput('  '), 'Enter a locale tag (e.g. tr)');
      assert.strictEqual(validateLocaleInput('tr'), undefined);
      assert.strictEqual(validateLocaleInput('en-US'), undefined);
    });
  });

  suite('CASE-022..025 invalid JSON', () => {
    (['camel', 'snake', 'kebab', 'pascal'] as const).forEach((style) => {
      test(`${style}: only valid selections change and one error is shown`, async () => {
        const editor = await createTextEditor('{"user_name":1}\n{bad');
        selectEachLine(editor);
        const errors: string[] = [];
        await caseJsonKeysHandlerInternal((message) => {
          errors.push(message);
          return Promise.resolve(undefined);
        })(style)(editor);
        const expectedFirst = {
          camel: '{"userName":1}',
          snake: '{"user_name":1}',
          kebab: '{"user-name":1}',
          pascal: '{"UserName":1}',
        }[style];
        assert.strictEqual(editor.document.getText(), `${expectedFirst}\n{bad`);
        assert.strictEqual(errors.length, 1);
        assert.ok(errors[0].startsWith('Invalid JSON: '), errors[0]);
      });
    });

    test('two invalid selections still show a single error', async () => {
      const editor = await createTextEditor('{bad\n[1,');
      selectEachLine(editor);
      const errors: string[] = [];
      await caseJsonKeysHandlerInternal((message) => {
        errors.push(message);
        return Promise.resolve(undefined);
      })('camel')(editor);
      assert.strictEqual(editor.document.getText(), '{bad\n[1,');
      assert.strictEqual(errors.length, 1);
    });
  });

  test('package.json registers all 30 commands exactly once in each place', () => {
    const packageJson = JSON.parse(fs.readFileSync(path.resolve(__dirname, '../../../package.json'), 'utf8'));
    const names = [...replaceCases.map((c) => c.name), 'detect'];
    assert.strictEqual(new Set(names).size, 30);
    const count = (entries: { command?: string }[], id: string) => entries.filter((entry) => entry.command === id).length;
    names.forEach((name) => {
      const id = `selection-manipulator.case.${name}`;
      assert.strictEqual(count(packageJson.contributes.commands, id), 1, `commands: ${id}`);
      assert.strictEqual(count(packageJson.contributes.menus.commandPalette, id), 1, `commandPalette: ${id}`);
      assert.strictEqual(count(packageJson.contributes.menus['selection-manipulator.case.submenu'], id), 1, `submenu: ${id}`);
    });
  });
});
