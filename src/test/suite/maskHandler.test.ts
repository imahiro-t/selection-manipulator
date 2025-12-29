import * as assert from 'assert';
import { maskHandler } from '../../handler/maskHandler';
import { createTextEditor, getDocumentText, selectAll } from './testUtils';

suite('Mask Handler Test Suite', () => {
  test('Mask single line text', async () => {
    const editor = await createTextEditor('password');
    await selectAll(editor);
    await maskHandler(editor);
    assert.strictEqual(getDocumentText(editor), '********');
  });

  test('Mask multi-line text', async () => {
    const editor = await createTextEditor('line1\nline2');
    await selectAll(editor);
    await maskHandler(editor);
    // Assuming maskHandler treats newline as a character to be masked or keeps it?
    // Implementation: '*'.repeat(text.length)
    // If text is "a\nb" (length 3), it becomes "***". Newline is replaced.
    // Let's verify this behavior.
    assert.strictEqual(getDocumentText(editor), '***********');
  });

  test('Mask text with spaces', async () => {
    const editor = await createTextEditor('a b c');
    await selectAll(editor);
    await maskHandler(editor);
    assert.strictEqual(getDocumentText(editor), '*****');
  });
});
