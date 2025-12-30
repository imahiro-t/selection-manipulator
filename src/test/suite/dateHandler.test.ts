import * as assert from 'assert';
import * as vscode from 'vscode';
import { dateHandler } from '../../handler/dateHandler';
import { createTextEditor, selectAll } from './testUtils';

suite('Date Handler Test Suite', () => {
  vscode.window.showInformationMessage('Start Date Handler tests.');

  test('Convert ISO to Timestamp (Seconds)', async () => {
    const isoString = '2023-01-01T00:00:00.000Z';
    const expectedTimestamp = '1672531200';

    const result = await runDateHandler(isoString, 'timestamp', 'replace');
    assert.strictEqual(result, expectedTimestamp);
  });

  test('Convert Timestamp (Seconds) to ISO', async () => {
    const timestamp = '1672531200';
    const expectedIso = '2023-01-01T00:00:00.000Z';

    const result = await runDateHandler(timestamp, 'iso', 'replace');
    assert.strictEqual(result, expectedIso);
  });

  test('Convert Timestamp (Milliseconds) to ISO', async () => {
    const timestampMs = '1672531200000';
    const expectedIso = '2023-01-01T00:00:00.000Z';

    const result = await runDateHandler(timestampMs, 'iso', 'replace');
    assert.strictEqual(result, expectedIso);
  });

  test('Convert "now" to ISO', async () => {
    // This test is tricky because time moves. We just check format.
    const result = await runDateHandler('now', 'iso', 'replace');
    assert.match(result, /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
  });

  test('Convert Invalid String (No Change)', async () => {
    const invalidDate = 'Not A Date';
    const result = await runDateHandler(invalidDate, 'iso', 'replace');
    assert.strictEqual(result, invalidDate);
  });

  test('Convert to Timestamp (Milliseconds)', async () => {
    const isoString = '2023-01-01T00:00:00.000Z';
    const expectedTimestampMs = '1672531200000';

    const result = await runDateHandler(isoString, 'timestamp-ms', 'replace');
    assert.strictEqual(result, expectedTimestampMs);
  });
});

async function runDateHandler(content: string, format: any, outputMode: any): Promise<string> {
  const editor = await createTextEditor(content);
  await selectAll(editor);

  await dateHandler(format, outputMode)(editor);

  return editor.document.getText();
}
