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
  // `finally` below and leaving the directory behind. While VS Code runs, removing the directory
  // right away does not work either: VS Code keeps writing to it until it has closed. So:
  // - If VS Code is not running (still downloading it, writing the settings, or already closed),
  //   remove the directory and exit at once. Exiting also stops a pending download or launch, so
  //   no VS Code is started after the signal.
  // - If VS Code is running, wait for it to close and let the `finally` remove the directory.
  // Either way the exit code is the usual 128 + signal number.
  // test-electron closes VS Code on SIGINT itself: it adds its SIGINT listener right after spawning
  // VS Code and removes it once VS Code has closed, so that listener tells whether VS Code runs.
  // The first SIGINT closes VS Code gracefully and a second one kills its process tree. It only
  // calls `process.exit(1)` when no other SIGINT listener is left, which is why `on` (not `once`)
  // is used. SIGTERM is turned into a SIGINT to reuse that.
  let exitCodeOnSignal: number | undefined;
  let forceExitTimer: NodeJS.Timeout | undefined;
  const exitNow = (code: number) => {
    cleanup();
    process.exit(code);
  };
  const isVSCodeRunning = () => process.listeners('SIGINT').some((listener) => listener !== onSigint);
  const onSignal = (code: number) => {
    if (exitCodeOnSignal !== undefined) {
      return;
    }
    exitCodeOnSignal = code;
    if (!isVSCodeRunning()) {
      exitNow(code);
    }
    // If VS Code has not closed in time, send a second SIGINT so test-electron kills VS Code's
    // process tree; the `finally` then removes the directory. Exit anyway if that does not end
    // the run either, rather than hang (VS Code may then be left running).
    forceExitTimer = setTimeout(() => {
      if (!isVSCodeRunning()) {
        exitNow(code);
      }
      process.kill(process.pid, 'SIGINT');
      forceExitTimer = setTimeout(() => exitNow(code), 5_000);
    }, 15_000);
  };
  const onSigint = () => onSignal(130);
  const onSigterm = () => {
    const vscodeRunning = isVSCodeRunning();
    onSignal(143);
    if (vscodeRunning) {
      process.kill(process.pid, 'SIGINT');
    }
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
