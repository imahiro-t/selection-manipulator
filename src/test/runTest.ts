import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

import { runTests } from '@vscode/test-electron';

async function main() {
  // VS Code creates its IPC socket inside the user data dir, and the socket
  // path must stay under the OS limit (103 chars on macOS). The default
  // `.vscode-test/user-data` breaks that when the repo lives in a deep path
  // (e.g. a git worktree), so use a short directory under the OS temp dir.
  const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sm-test-'));
  // The test profile turns off what can take the focus from the test editor or type into it while
  // a test runs (text appearing in a test document, or `undo` not reaching the test editor):
  fs.mkdirSync(path.join(userDataDir, 'User'), { recursive: true });
  const settings = {
    // Recent VS Code builds start the chat / agent views; the tests do not use AI features.
    'chat.disableAIFeatures': true,
    // No welcome page, update / extension / tips notifications, or telemetry prompts.
    'workbench.startupEditor': 'none',
    'workbench.tips.enabled': false,
    'update.mode': 'none',
    'extensions.autoCheckUpdates': false,
    'extensions.autoUpdate': false,
    'telemetry.telemetryLevel': 'off',
    // No suggestion, inline completion or on-type edit that could insert text into a test document.
    'editor.quickSuggestions': { other: 'off', comments: 'off', strings: 'off' },
    'editor.suggestOnTriggerCharacters': false,
    'editor.acceptSuggestionOnEnter': 'off',
    'editor.inlineSuggest.enabled': false,
    'editor.formatOnType': false,
    'editor.formatOnPaste': false,
    // Closed untitled test documents are not kept or restored.
    'files.hotExit': 'off',
  };
  fs.writeFileSync(path.join(userDataDir, 'User', 'settings.json'), JSON.stringify(settings, null, 2));

  try {
    // The folder containing the Extension Manifest package.json
    // Passed to `--extensionDevelopmentPath`
    const extensionDevelopmentPath = path.resolve(__dirname, '../../');

    // The path to test runner
    // Passed to --extensionTestsPath
    const extensionTestsPath = path.resolve(__dirname, './suite/index');

    // Download VS Code, unzip it and run the integration test.
    // The `--user-data-dir=` form makes test-electron skip its own default.
    await runTests({
      extensionDevelopmentPath,
      extensionTestsPath,
      launchArgs: [`--user-data-dir=${userDataDir}`],
    });
  } catch (err) {
    console.error('Failed to run tests', err);
    process.exitCode = 1;
  } finally {
    fs.rmSync(userDataDir, { recursive: true, force: true });
  }
}

main();
