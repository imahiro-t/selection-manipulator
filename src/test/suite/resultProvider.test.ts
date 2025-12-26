import * as assert from 'assert';
import * as vscode from 'vscode';
import { openTextDocument } from '../../common';
import { ResultProvider } from '../../provider/resultProvider';
import { waitForNewDocument } from './testUtils';

suite('Result Provider Test Suite', () => {

  test('openTextDocument should open a read-only document with correct scheme', async () => {
    const content = 'Test Content';

    // We can't easily spy on workspace.openTextDocument in integration tests without more setup,
    // but we can check the result.

    const docPromise = waitForNewDocument();

    await openTextDocument(content);

    const doc = await docPromise;

    // Validate Scheme
    assert.strictEqual(doc.uri.scheme, ResultProvider.scheme, 'Document scheme should be selection-manipulator');

    // Validate Content
    assert.strictEqual(doc.getText(), content, 'Document content should match');

    // ResultProvider should have the content
    assert.strictEqual(ResultProvider.instance.provideTextDocumentContent(doc.uri), content, 'Provider should return correct content');

    // Close the document
    await vscode.commands.executeCommand('workbench.action.closeActiveEditor');
  });

  test('New document should not be dirty', async () => {
    const content = 'Dirty Check Content';
    const docPromise = waitForNewDocument();
    await openTextDocument(content);
    const doc = await docPromise;

    assert.strictEqual(doc.isDirty, false, 'Document should not be dirty');

    await vscode.commands.executeCommand('workbench.action.closeActiveEditor');
  });

  test('Subsequent calls should generate unique URIs', async () => {
    const content1 = 'Content 1';
    const content2 = 'Content 2';

    // Use registerContent directly as we can't easily check multiple open tabs in integration test purely via this API
    const uri1 = ResultProvider.instance.registerContent(content1);
    const uri2 = ResultProvider.instance.registerContent(content2);

    assert.notStrictEqual(uri1.toString(), uri2.toString(), 'URIs should be unique');
    assert.strictEqual(ResultProvider.instance.provideTextDocumentContent(uri1), content1);
    assert.strictEqual(ResultProvider.instance.provideTextDocumentContent(uri2), content2);
  });
});
