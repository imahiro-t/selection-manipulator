# Security Policy

Selection Manipulator transforms, generates and extracts the text you select in VS Code. Because it runs inside your editor with access to whatever you are editing, we keep its behaviour deliberately narrow: every command works on the selected text locally and nothing else. This document describes how to report a vulnerability and the rules every new feature must follow.

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
- Results go back to the editor (replacing the selection or opening a new untitled document), to the clipboard, or to a notification — nowhere else.

### 2. Forbidden operations

New code must not perform any of the following:

- **Arbitrary code execution**: `eval`, `new Function`, `setTimeout` / `setInterval` with a string argument, `vm` module, dynamic `require` / `import` of user-controlled paths, or any other way of executing text as code. Parsers for JavaScript-like input (for example JSON5 or object literals) must be hand-written or use an existing dependency, never evaluate the input.
- **Shell or process execution**: `child_process` (`exec`, `spawn`, `execFile`, ...) or anything that starts another process. Commands that deal with shell, SQL or `curl` text only *convert or generate strings*; they never run them.
- **Network access**: `http` / `https`, `fetch`, `net`, `tls`, `dgram`, `dns`, WebSocket or any other outbound communication.
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

## Known Exception: DNS Lookup Commands

The DNS Lookup commands (`selection-manipulator.dns.*`, 14 commands, implemented with `node:dns/promises`) existed as of v0.0.42 and send DNS queries over the network. They are a **known exception** to the "no network access" rule above. **No new commands of this kind will be added.** Any future change to these commands will be handled in a dedicated ticket.

## Dependency Vulnerabilities

- We keep `npm audit` findings of severity **high or above at zero** (v0.0.42 reached 0 vulnerabilities in total).
- Pull requests must not introduce new high or critical findings.
- Continuous checking in CI (running `npm audit --audit-level=high`, Dependabot and CodeQL) is being implemented in a separate ticket.
