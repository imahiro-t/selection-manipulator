# Security Policy

Selection Manipulator transforms, generates and extracts the text you select in VS Code. Because it runs inside your editor with access to whatever you are editing, we keep its behaviour deliberately narrow: commands work on the selected text locally. One group of existing commands (DNS Lookup, present since before v0.0.42) does communicate over the network; it is listed under [Known Exceptions](#known-exceptions) and no new commands of that kind will be added. This document describes how to report a vulnerability and the rules every new feature must follow.

## Supported Versions

Security fixes are made on the latest released version only. Please update to the latest version from the VS Code Marketplace before reporting.

## Reporting a Vulnerability

Please **do not open a public issue** for security problems.

Report vulnerabilities privately through GitHub's **Private vulnerability reporting**:

1. Open the repository's [Security tab](https://github.com/imahiro-t/selection-manipulator/security).
2. Choose **Report a vulnerability** (this creates a private Security Advisory draft visible only to the maintainers).
3. Describe the affected command(s) and version, the steps or input needed to reproduce, and the impact you expect.

We will acknowledge the report, investigate, and coordinate the fix and disclosure through the advisory.

## Implementation Rules for New Features

Every new command (and every change to an existing one) must follow these rules. Pull requests are checked against them using the security checklist in the [pull request template](.github/pull_request_template.md).

### 1. Local processing of the selected text only

- A command may only process the selected text (including every selection of a multi-cursor), plus values the user explicitly types into a prompt for that command (for example a delimiter, a column number or an HMAC key).
- Results go back to the editor (replacing the selection or opening a new untitled document), to the clipboard, to a notification, or to a Webview panel that follows the [Webview rules](#6-webviews) below — nowhere else.

### 2. Forbidden operations

New code must not perform any of the following:

- **Arbitrary code execution**: `eval`, `new Function`, `setTimeout` / `setInterval` with a string argument, `vm` module, dynamic `require` / `import` of user-controlled paths, or any other way of executing text as code. Parsers for JavaScript-like input (for example JSON5 or object literals) must be hand-written or use an existing dependency, never evaluate the input.
- **Shell or process execution**: `child_process` (`exec`, `spawn`, `execFile`, ...) or anything that starts another process. Commands that deal with shell, SQL or `curl` text only *convert or generate strings*; they never run them.
- **Network access**: `http` / `https`, `fetch`, `net`, `tls`, `dgram`, `dns`, WebSocket or any other outbound communication — including a Webview loading remote scripts, stylesheets, images or fonts (for example `<script src="https://...">`, `import ... from 'https://...'`, or a Content Security Policy that allows a remote origin).
- **Unnecessary file access**: reading or writing files other than the document being edited. Use the VS Code editor and clipboard APIs instead of `fs`.

### 3. Dependencies

- Do **not** add new runtime or development dependencies by default. Prefer Node.js built-ins (`crypto`, `zlib`, `Intl`, `String.prototype.normalize`, `node:url`, ...) and the existing dependencies (`change-case`, `diff`, `js-yaml`, `xml-formatter`).
- If a new dependency is truly necessary, the pull request must state:
  - **Necessity** — why the built-ins or existing dependencies cannot do the job;
  - **Maintenance status** — recent releases, open issues, number of maintainers;
  - **Known vulnerabilities** — the result of `npm audit` after adding it;
  - **License** — and that it is compatible with this project's license.

### 4. Robustness against hostile input

- When a command applies a user-supplied regular expression, guard against ReDoS: limit the pattern and input size and keep processing time reasonable even for very large selections.
- Decompression and expansion commands (for example inflate / gunzip, range generators) must cap the output size.
- Validate user-supplied values used to build markup (for example an HTML tag name) so that the output cannot be turned into something other than what the command promises.

### 5. Cryptography

- Do not add new commands that use deprecated or weak algorithms (such as MD5, SHA-1, DES, RC4 or ECB mode) for **encryption** or **password storage**.
- Weak hash algorithms may be offered only for checksum or compatibility purposes, and the command description must say so.
- Use `crypto.randomBytes` / `crypto.getRandomValues` / `crypto.randomUUID` for anything random that could be used as an identifier, token or password.

### 6. Webviews

A command should normally return its result as text. If a command really needs a Webview (for example to render a preview), it must:

- **Load no remote resources.** Do not load scripts, stylesheets, images or fonts from a CDN or any other remote origin. Bundle the libraries you need with the extension and load them through `webview.asWebviewUri`.
- **Use a strict Content Security Policy.** Start from `default-src 'none'`, allow scripts only with a per-load `nonce` (`script-src 'nonce-...'`), and do not allow remote origins, `'unsafe-inline'` scripts or `'unsafe-eval'`.
- **Limit `localResourceRoots`** to the directories the Webview actually needs (for example the bundled `media` directory), and enable scripts (`enableScripts: true`) only when they are required.
- **Escape the selected text** (and any other user-controlled value) before embedding it in the Webview HTML, and pass data to scripts with `postMessage` or escaped values rather than by building script source from it.

## Known Exceptions

The following commands existed as of v0.0.42 and communicate over the network. They are a **known exception** to the "no network access" rule above. **No new commands of this kind will be added.**

| Commands | What they do | Network access |
|---|---|---|
| DNS Lookup (`selection-manipulator.dns.*`, 14 commands) | Look up DNS records for the selected host name or IP address | DNS queries via `node:dns/promises` |

## Dependency Vulnerabilities

- We keep `npm audit` findings of severity **high or above at zero** (v0.0.42 reached 0 vulnerabilities in total).
- Pull requests must not introduce new high or critical findings.
- Continuous checking in CI (running `npm audit --audit-level=high`, Dependabot and CodeQL) is being implemented in a separate ticket.

### Accepted low findings

`npm audit` currently reports **2 low** findings and nothing of a higher severity. They are accepted for the reasons below (checked on 2026-10-13).

- **Finding**: katex, [GHSA-238p-pmpm-9mq7](https://github.com/advisories/GHSA-238p-pmpm-9mq7) "Existing prototype pollution can bypass trust restrictions" (low, affects `<0.18.2`), and mermaid, which depends on it. mermaid is a devDependency pinned to 11.17.2, but its prebuilt `mermaid.min.js` embeds katex 0.16.47 and is copied to `media/mermaid/mermaid.min.js`, so this katex code is in the VSIX.
- **Reachability**: in the Webview of HAR to Sequence Diagram Image, mermaid calls katex (`renderToString`, without the `trust` option, i.e. the default `false`) when a label contains `$$...$$`. A HAR text (a URL path, a status text, a cookie name) can contain that, so katex is reachable.
- **Why it has no effect here**: the advisory needs an existing prototype pollution in the page (for example `Object.prototype.trust`). Nothing in this Webview can cause one: the only scripts are the bundled mermaid and one fixed script with the per-load nonce, and the selected text is HTML-escaped into a `<pre>` and never passed to a script. Even if the `trust` check were bypassed, the commands it guards (`\href`, `\includegraphics`, ...) could neither load nor run anything: the Content Security Policy is `default-src 'none'` with nonce-only scripts and no external origin, and `localResourceRoots` is only `media/mermaid/` (§6).
- **Why the fix is not taken**: no mermaid release uses katex `>=0.18.2` yet (the latest, 12.1.0, still depends on `^0.16.47`). The fix that `npm audit fix --force` offers is a major downgrade to mermaid 10.8.0, which would undo the update to mermaid 11 made when loading mermaid from a CDN was replaced by the bundled copy. An `overrides` entry for katex would only silence `npm audit`: the katex code embedded in the prebuilt `mermaid.min.js` would not change.
- **When to revisit**: as soon as a mermaid release depends on katex `>=0.18.2`, update the pinned mermaid to it (`npm install mermaid@<version> --save-dev --save-exact`) and remove this entry.
