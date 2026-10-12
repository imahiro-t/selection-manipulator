import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

import { runTests } from '@vscode/test-electron';

async function main() {
  // VS Code creates its IPC socket inside the user data dir, and the socket
  // path must stay under the OS limit (103 chars on macOS). The default
  // `.vscode-test/user-data` breaks that when the repo lives in a deep path
  // (e.g. a git worktree), so use a short directory under the OS temp dir.
  // If this throws, nothing was created and there is nothing to clean up.
  const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sm-test-'));

  // Removes the user data dir once. A failure (e.g. a file VS Code still holds) only warns:
  // it must not change the test result.
  let cleanedUp = false;
  const cleanup = () => {
    if (cleanedUp) {
      return;
    }
    cleanedUp = true;
    try {
      fs.rmSync(userDataDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
    } catch (err) {
      console.warn(`Failed to remove the test user data dir ${userDataDir}`, err);
    }
  };

  // Ctrl+C (SIGINT) or a kill (SIGTERM) would otherwise end this process at once, skipping the
  // `finally` below and leaving the directory behind. Removing it right away does not work either:
  // VS Code keeps writing to it until it has closed. So wait for VS Code to close and let the
  // `finally` remove the directory, then exit with the usual 128 + signal number code.
  // test-electron closes VS Code on SIGINT itself (a second Ctrl+C force-closes it), and only calls
  // `process.exit(1)` when no other SIGINT listener is left, which is why `on` (not `once`) is used.
  // SIGTERM is turned into a SIGINT to reuse that. If VS Code does not close in time, give up.
  let exitCodeOnSignal: number | undefined;
  let forceExitTimer: NodeJS.Timeout | undefined;
  const onSignal = (code: number) => {
    if (exitCodeOnSignal !== undefined) {
      return;
    }
    exitCodeOnSignal = code;
    forceExitTimer = setTimeout(() => {
      cleanup();
      process.exit(code);
    }, 15_000);
  };
  const onSigint = () => onSignal(130);
  const onSigterm = () => {
    onSignal(143);
    process.kill(process.pid, 'SIGINT');
  };
  process.on('SIGINT', onSigint);
  process.on('SIGTERM', onSigterm);

  try {
    writeTestSettings(userDataDir);

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
    cleanup();
    clearTimeout(forceExitTimer);
    process.removeListener('SIGINT', onSigint);
    process.removeListener('SIGTERM', onSigterm);
    if (exitCodeOnSignal !== undefined) {
      process.exitCode = exitCodeOnSignal;
    }
  }
}

function writeTestSettings(userDataDir: string) {
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
}

main();
