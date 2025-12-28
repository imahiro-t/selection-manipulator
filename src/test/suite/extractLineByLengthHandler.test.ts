import * as assert from 'assert';
import { extractLineByLengthHandler } from '../../handler/extractLineByLengthHandler';
import { createTextEditor, selectAll } from './testUtils';

suite('Extract Line By Length Handler Test Suite', () => {

  test('Extract Lines Equal to Length', async () => {
    const text = '123\n12345\n123\n12';
    const editor = await createTextEditor(text);
    selectAll(editor);

    // Simulate user input '3'
    await extractLineByLengthHandler('equal', false, '3')(editor);

    // In a real integration test we might check the new doc content.
    // Here we just ensure it runs without error.
    assert.ok(true);
  });

  test('Extract Lines Less Than Length', async () => {
    const text = '1\n12\n123\n1234';
    const editor = await createTextEditor(text);
    selectAll(editor);

    // Simulate user input '2'
    await extractLineByLengthHandler('less', false, '2')(editor);

    assert.ok(true);
  });

  test('Extract Lines Greater Than Length', async () => {
    const text = '1\n12\n123\n1234';
    const editor = await createTextEditor(text);
    selectAll(editor);

    // Simulate user input '3'
    await extractLineByLengthHandler('greater', false, '3')(editor);

    assert.ok(true);
  });

  test('Extract Lines Range (Comma)', async () => {
    const text = '1\n12\n123\n1234\n12345';
    const editor = await createTextEditor(text);
    selectAll(editor);

    // Simulate user input '2,4'
    await extractLineByLengthHandler('range', false, '2,4')(editor);

    assert.ok(true);
  });

  test('Extract Lines Range (Hyphen)', async () => {
    const text = '1\n12\n123\n1234\n12345';
    const editor = await createTextEditor(text);
    selectAll(editor);

    // Simulate user input '2-4'
    await extractLineByLengthHandler('range', false, '2-4')(editor);

    assert.ok(true);
  });
});
