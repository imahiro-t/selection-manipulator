import * as assert from 'assert';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import * as vm from 'vm';
import * as vscode from 'vscode';
import {
  createDocument,
  ensureBundledMermaid,
  getWebviewContent,
  MERMAID_LOAD_FAILED_MESSAGE,
  MERMAID_MISSING_MESSAGE,
  WEBVIEW_BOOT_SCRIPT,
} from '../../handler/harToMermaidHandler';
import { notificationRecorder } from './testUtils';

const ROOT = path.resolve(__dirname, '../../..');
const NONCE = 'dGVzdC1ub25jZS0xMjM0NQ==';
const SCRIPT_URI = 'vscode-resource://file/ext/media/mermaid/mermaid.min.js';
const CSP_SOURCE = 'vscode-resource:';

const render = (content = 'sequenceDiagram\nUser ->> a: GET /', theme: 'dark' | 'default' = 'default') =>
  getWebviewContent(content, theme, SCRIPT_URI, CSP_SOURCE, NONCE);

const cspOf = (html: string): string => {
  const metas = html.match(/<meta http-equiv="Content-Security-Policy" content="([^"]*)">/g) ?? [];
  assert.strictEqual(metas.length, 1, 'exactly one CSP meta');
  return /content="([^"]*)"/.exec(metas[0])![1];
};

/** The body of the inline (nonce, no `src`) script of `html`. */
const inlineScriptOf = (html: string): string => {
  const scripts = [...html.matchAll(/<script nonce="[^"]*">([\s\S]*?)<\/script>/g)];
  assert.strictEqual(scripts.length, 1, 'exactly one inline script');
  return scripts[0][1] ?? '';
};

/**
 * Runs `script` against minimal stubs of the webview's `window` / `document` (only the DOM members
 * the boot script uses), with or without a loaded `mermaid`.
 */
const runBootScript = (script: string, mermaid: { initialize(config: unknown): void } | undefined, theme = 'default') => {
  const errorElement = { hidden: true };
  const diagramElement = { hidden: false };
  const document = {
    body: { dataset: { theme } },
    getElementById: (id: string) => (id === 'mermaid-error' ? errorElement : null),
    querySelector: (selector: string) => (selector === 'pre.mermaid' ? diagramElement : null),
  };
  const window: Record<string, unknown> = { document };
  if (mermaid) {
    window.mermaid = mermaid;
  }
  vm.runInNewContext(script, { window, document });
  return { errorElement, diagramElement };
};

suite('HAR to Mermaid Handler Test Suite', () => {
  test('Create Mermaid Diagram from HAR Entry', () => {
    const entry = {
      request: {
        method: 'GET',
        url: 'https://example.com/api',
        queryString: [],
        cookies: [],
        headers: []
      },
      response: {
        status: 200,
        statusText: 'OK',
        cookies: []
      }
    };
    const doc = createDocument([entry], false, false);
    assert.ok(doc.includes('sequenceDiagram'));
    assert.ok(doc.includes('participant example_com as example.com'));
    assert.ok(doc.includes('User ->>+ example_com: GET /api'));
  });

  test('webview CSP is default-src none with a nonce-only script-src', () => {
    const csp = cspOf(render());
    const directives = csp.split(';').map(d => d.trim()).filter(d => d !== '');
    assert.ok(directives.includes("default-src 'none'"));
    const scriptSrc = directives.filter(d => d.startsWith('script-src'));
    assert.deepStrictEqual(scriptSrc, [`script-src 'nonce-${NONCE}'`]);
    assert.ok(!csp.includes("'unsafe-eval'"));
    assert.ok(!/script-src[^;]*'unsafe-inline'/.test(csp));
    assert.ok(!/https?:/.test(csp));
  });

  test('every script tag carries the nonce; no module script or import', () => {
    const html = render();
    const scripts = html.match(/<script\b[^>]*>/gi) ?? [];
    assert.strictEqual(scripts.length, 2);
    for (const tag of scripts) {
      assert.ok(tag.includes(`nonce="${NONCE}"`), tag);
    }
    assert.ok(html.includes(`<script nonce="${NONCE}" src="${SCRIPT_URI}"></script>`));
    assert.ok(!html.includes('type="module"'));
    assert.ok(!/\bimport\b/.test(html));
  });

  test('webview HTML has no external URL', () => {
    const html = render();
    assert.ok(!/cdn\.jsdelivr\.net/i.test(html));
    assert.ok(!/https?:\/\//.test(html.replace(SCRIPT_URI, '')));
  });

  test('diagram text is escaped', () => {
    const html = render('A ->> B: </pre><script>alert(1)</script>"\'&');
    assert.ok(!html.includes('</pre><script>alert(1)'));
    assert.ok(html.includes('&lt;/pre&gt;&lt;script&gt;alert(1)&lt;/script&gt;&quot;&#039;&amp;'));
    assert.strictEqual((html.match(/<script\b/g) ?? []).length, 2);
  });

  test('theme is passed only as a fixed data-theme attribute', () => {
    assert.ok(render(undefined, 'dark').includes('<body data-theme="dark">'));
    assert.ok(render(undefined, 'default').includes('<body data-theme="default">'));
    const injected = getWebviewContent('x', '"><script>alert(1)</script>' as unknown as 'dark', SCRIPT_URI, CSP_SOURCE, NONCE);
    assert.ok(injected.includes('<body data-theme="default">'));
    assert.strictEqual((injected.match(/<script\b/g) ?? []).length, 2);
  });

  // Supplementary checks of the bundled mermaid. They only look at files and at the text of
  // .vscodeignore, so they can miss a future pattern change (for example `**` combined with a
  // negation). Whether the VSIX really contains media/mermaid/ is verified with `vsce ls`.
  test('bundled mermaid is present, pinned and not excluded from the VSIX', () => {
    assert.ok(fs.existsSync(path.join(ROOT, 'media', 'mermaid', 'mermaid.min.js')));
    assert.ok(fs.existsSync(path.join(ROOT, 'media', 'mermaid', 'LICENSE')));
    const packageJson = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
    assert.match(packageJson.devDependencies.mermaid, /^\d+\.\d+\.\d+$/);
    const ignoreLines = fs.readFileSync(path.join(ROOT, '.vscodeignore'), 'utf8')
      .split(/\r?\n/).map(l => l.trim()).filter(l => l !== '' && !l.startsWith('#') && !l.startsWith('!'));
    for (const line of ignoreLines) {
      assert.ok(!/^(\*\*\/)?media(\/|$)/.test(line), line);
      assert.notStrictEqual(line, '**');
    }
  });

  suite('missing bundled mermaid', () => {
    let tempRoot: string;

    setup(() => {
      tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'har-mermaid-'));
    });

    teardown(() => {
      fs.rmSync(tempRoot, { recursive: true, force: true });
    });

    test('no media/mermaid/mermaid.min.js: false and the error message', async () => {
      const recorder = notificationRecorder();
      assert.strictEqual(await ensureBundledMermaid(vscode.Uri.file(tempRoot), { notifier: recorder.notifier }), false);
      assert.deepStrictEqual(recorder.errors, [MERMAID_MISSING_MESSAGE]);
      assert.deepStrictEqual(recorder.infos, []);
      assert.deepStrictEqual(recorder.warnings, []);
    });

    test('a directory in place of mermaid.min.js: false and the error message', async () => {
      fs.mkdirSync(path.join(tempRoot, 'media', 'mermaid', 'mermaid.min.js'), { recursive: true });
      const recorder = notificationRecorder();
      assert.strictEqual(await ensureBundledMermaid(vscode.Uri.file(tempRoot), { notifier: recorder.notifier }), false);
      assert.deepStrictEqual(recorder.errors, [MERMAID_MISSING_MESSAGE]);
    });

    test('the file present: true and no message', async () => {
      fs.mkdirSync(path.join(tempRoot, 'media', 'mermaid'), { recursive: true });
      fs.writeFileSync(path.join(tempRoot, 'media', 'mermaid', 'mermaid.min.js'), '');
      const recorder = notificationRecorder();
      assert.strictEqual(await ensureBundledMermaid(vscode.Uri.file(tempRoot), { notifier: recorder.notifier }), true);
      assert.deepStrictEqual(recorder.errors, []);
    });

    test('the extension root of this build: true', async () => {
      const recorder = notificationRecorder();
      assert.strictEqual(await ensureBundledMermaid(vscode.Uri.file(ROOT), { notifier: recorder.notifier }), true);
      assert.deepStrictEqual(recorder.errors, []);
    });

    test('the message has a fixed text and names no data of the user', () => {
      assert.strictEqual(MERMAID_MISSING_MESSAGE, 'HAR to Sequence Diagram Image could not start: the bundled mermaid (media/mermaid/mermaid.min.js) is missing. Reinstall the extension.');
      assert.ok(!MERMAID_MISSING_MESSAGE.includes(os.tmpdir()));
    });
  });

  suite('webview when mermaid does not load', () => {
    test('the HTML has one hidden error element with a fixed text', () => {
      const html = render('A ->> B: <secret-ish label>');
      const errors = html.match(/<p id="mermaid-error"[^>]*>[^<]*<\/p>/g) ?? [];
      assert.deepStrictEqual(errors, [`<p id="mermaid-error" hidden>${MERMAID_LOAD_FAILED_MESSAGE}</p>`]);
      assert.strictEqual(MERMAID_LOAD_FAILED_MESSAGE, 'Could not load the bundled mermaid. Reinstall the extension.');
      assert.ok(!errors.join('').includes('secret-ish'));
    });

    test('the inline script is the fixed boot script and checks for mermaid', () => {
      const script = inlineScriptOf(render());
      assert.strictEqual(script, WEBVIEW_BOOT_SCRIPT);
      assert.ok(script.includes("typeof window.mermaid === 'undefined'"));
      // The diagram text never reaches the script.
      assert.strictEqual(inlineScriptOf(render('A ->> B: payload-xyz')), WEBVIEW_BOOT_SCRIPT);
    });

    test('mermaid undefined: the error is shown, the diagram hidden, nothing initialized', () => {
      const { errorElement, diagramElement } = runBootScript(inlineScriptOf(render()), undefined);
      assert.strictEqual(errorElement.hidden, false);
      assert.strictEqual(diagramElement.hidden, true);
    });

    test('mermaid loaded: initialize is called once with the theme, the error stays hidden', () => {
      for (const theme of ['dark', 'default'] as const) {
        const calls: unknown[] = [];
        const { errorElement, diagramElement } = runBootScript(
          inlineScriptOf(render(undefined, theme)),
          { initialize: (config) => { calls.push(config); } },
          theme);
        // The config object comes from the vm context (another Object.prototype): compare its JSON.
        assert.deepStrictEqual(JSON.parse(JSON.stringify(calls)), [{ startOnLoad: true, theme }]);
        assert.strictEqual(errorElement.hidden, true);
        assert.strictEqual(diagramElement.hidden, false);
      }
    });
  });
});
