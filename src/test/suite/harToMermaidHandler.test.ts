import * as assert from 'assert';
import * as fs from 'fs';
import * as path from 'path';
import { createDocument, getWebviewContent } from '../../handler/harToMermaidHandler';

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
    const scripts = html.match(/<script\b[^>]*>/g) ?? [];
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
    assert.ok(!html.includes('cdn.jsdelivr.net'));
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
});
