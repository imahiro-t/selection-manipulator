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
  // Recent VS Code builds start the chat / agent views, which can take the focus from the test
  // editor: `undo` (run by many integration tests) then does not reach the editor. The tests do
  // not use AI features, so they are turned off in the test profile.
  fs.mkdirSync(path.join(userDataDir, 'User'), { recursive: true });
  fs.writeFileSync(path.join(userDataDir, 'User', 'settings.json'), JSON.stringify({ 'chat.disableAIFeatures': true }));

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
