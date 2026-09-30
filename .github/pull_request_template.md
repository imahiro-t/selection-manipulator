## Summary

<!-- What does this pull request change, and why? Link the related ticket or issue. -->

## Type of Change

- [ ] New command(s)
- [ ] Bug fix
- [ ] Refactoring / internal change
- [ ] Documentation
- [ ] Dependency update
- [ ] CI / build

## Testing

<!-- How did you verify the change? List the tests you added or ran. -->

- [ ] `npm run lint` passes (no errors)
- [ ] `npm run test-compile` passes
- [ ] `npm test` passes

## Security Checklist

See [SECURITY.md](https://github.com/imahiro-t/selection-manipulator/blob/main/SECURITY.md) for the full rules. Check every item, or explain below why it does not apply.

- [ ] **Local processing only** — the change processes only the selected text and values the user explicitly enters.
- [ ] **No arbitrary code execution** — no `eval`, `new Function`, string-based `setTimeout` / `setInterval`, `vm` or dynamic `require` / `import`.
- [ ] **No shell execution** — no `child_process` or other process spawning; shell / SQL / `curl` text is only converted, never run.
- [ ] **No network access** — no `http(s)`, `fetch`, `net`, `dns` or other outbound communication, and no Webview that loads remote scripts or resources.
- [ ] **Webview rules** (only if the change uses a Webview) — no remote scripts, stylesheets, images or fonts (libraries are bundled); strict CSP (`default-src 'none'`, nonce-based scripts, no remote origins or `'unsafe-inline'`); `localResourceRoots` limited to what is needed; the selected text is escaped before it is embedded.
- [ ] **No unnecessary file access** — no reading or writing of files other than the document being edited.
- [ ] **No new dependencies** — or, if one is added, its necessity, maintenance status, `npm audit` result and license are described below.
- [ ] **ReDoS-safe** — user-supplied regular expressions and very large inputs are handled within a reasonable time (or the change does not use them).
- [ ] **`npm audit` shows 0 findings of severity high or above.**
- [ ] **Tests added** for the new or changed behaviour.

### Notes on the checklist

<!-- Explain any unchecked item. If you added a dependency, write its necessity, maintenance status, npm audit result and license here. -->
