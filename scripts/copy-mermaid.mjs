#!/usr/bin/env node
// Copies the bundled mermaid build (the single-file IIFE `mermaid.min.js`, which defines the
// global `mermaid`) and its LICENSE from node_modules into media/mermaid/, where the
// `HAR to Sequence Diagram Image` webview loads it through `asWebviewUri`.
//
// The files are generated from the exact mermaid version pinned in package.json /
// package-lock.json (a devDependency, so `npm audit` keeps covering it) and are not committed
// (media/mermaid/ is git-ignored). This script only copies local files; it never uses the network.
//
// Run by `npm run copy-media`, which `vscode:prepublish`, `esbuild` and `esbuild-watch` call first.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const sourceDir = path.join(root, 'node_modules', 'mermaid');
const targetDir = path.join(root, 'media', 'mermaid');

const files = [
  [path.join(sourceDir, 'dist', 'mermaid.min.js'), path.join(targetDir, 'mermaid.min.js')],
  [path.join(sourceDir, 'LICENSE'), path.join(targetDir, 'LICENSE')],
];

for (const [source] of files) {
  if (!fs.existsSync(source)) {
    console.error(`copy-mermaid: ${path.relative(root, source)} not found. Run \`npm ci\` first.`);
    process.exit(1);
  }
}

fs.mkdirSync(targetDir, { recursive: true });
for (const [source, target] of files) {
  fs.copyFileSync(source, target);
}
console.log(`copy-mermaid: copied ${files.length} files to ${path.relative(root, targetDir)}`);
