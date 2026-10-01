# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

- ✨ Add 24 data format commands (group DATA2 of the plan to pass 1,000 commands; their showcase category is `DATAX`, candidates DATAX-001..024), added to the end of the existing `Data Format` (19) and `CSV / TSV` (5) submenus under `Transform`, and to the Command Palette when there is a selection; all 24 planned commands are added as planned, none was dropped or replaced (923 commands now)
  - JSON: Sort JSON Array (by the elements or a key path; stable; number < string < boolean < array < object < null < missing, strings by code point, arrays and objects by their compact JSON text with sorted keys, so `[1,5]` < `[1]` < `[]`), Filter JSON Array by Field Value (`key=value`, equality only: the field matches the value as JSON or, for a string field, the value exactly as typed, spaces included and not trimmed; `status=200` keeps `200` and `"200"`, `status="200"` only the string), Pick Keys from JSON Object, Omit Keys from JSON (top level only or recursive), Rename JSON Key (every level; an object that already has the new key is an error), Remove Empty Values from JSON (`""`, `[]`, `{}`, null), Convert JSON Array to Markdown Table (`\`, `|` and line breaks escaped), Split JSON Array into Chunks (N 1 to 1,000,000), Convert JSON Array to Object by Key, Convert JSON Object to Key-Value Array and Set JSON Value at Path (the value read with `JSON.parse` only; only existing array elements, so no sparse array)
  - YAML (Core schema): Convert YAML to Flow Style (anchors and aliases are kept as references and never expanded; js-yaml's `noRefs` is used only when no value is shared), Validate YAML (a notification `Valid YAML` / `Invalid YAML: line L, column C: reason`; the values are thrown away, so aliases are never expanded) and Convert Multi-document YAML to JSON Array (at most 10,000 documents; the JSON length is checked before it is built, so nested aliases are refused quickly; `.inf` / `.nan` are errors)
  - TOML: Format TOML (the TOML to JSON parser and the JSON to TOML writer; values and types are kept, but hex / octal / binary integers become decimal, `1e3` becomes `1000.0`, `inf` / `nan` / `1e400` and integers beyond ±(2^53 − 1) are kept as written, an integer outside the 64-bit range is an error, and comments, blank lines, key quoting and inline tables are not kept). Convert TOML to JSON is unchanged and still refuses `inf`, `nan` and integers beyond ±(2^53 − 1)
  - XML: Validate XML (Well-formedness) (a notification `Well-formed XML` / `Invalid XML: line L, column C: reason` that never quotes the selection) and List XML Element Paths (leaf elements only, `/r/i[1]`, `[n]` only for names shared by siblings; at most 100,000 lines), with the extension's own forward-only scanner: a DOCTYPE is read as syntax only, external identifiers are never fetched and no entity is ever expanded (only the five predefined entities and character references; no XXE or entity expansion), nesting up to 500 levels; DTD validity and the encoding declaration are not checked
  - LTSV: Convert LTSV to JSON and Convert JSON to LTSV with four escapes in values (`\\`, `\t`, `\n`, `\r`); other backslashes are kept (`C:\path`), but a literal `\n` (and the other three) in a source log becomes the real character. String values round-trip exactly, other values come back as their JSON text, and an empty object (`{}`) becomes an empty line, which Convert LTSV to JSON skips
  - CSV / TSV: CSV - Reorder Columns (`3,1,2`, every column once), CSV - Merge Two Columns (separator 0 to 100 characters), CSV - Split Column by Delimiter (plain text, not a regular expression; at most 1,000 added columns, counted before splitting), CSV - Count Rows by Column Value and CSV - Fill Empty Cells with Value (a result longer than 10,000,000 characters is refused with a warning, checked before it is built)
  - The results open in a new read-only editor and the document is never changed; if any selection fails nothing is opened, and a run whose results would exceed 10,000,000 characters in total is refused. Keys such as `__proto__` stay ordinary keys (objects without a prototype). Unexpected failures are logged with the error name and stack frames only
  - No network access, files, processes, code evaluation, Webviews or new dependencies (SECURITY.md); a static test checks the new modules for them. The new code is in `src/handler/data2Transforms.ts`, `src/handler/data2Xml.ts`, `src/handler/data2Csv.ts` and `src/handler/data2CommandHandler.ts` (with a `preserveTypes` option added to `src/handler/tomlParser.ts` and its output in `src/handler/dataWriters.ts`), and the showcase data in `scripts/showcase-data/DATAX.json`
- ✨ Add 22 encoding, escaping, hash and checksum commands (group ENC2 of the plan to pass 1,000 commands; their showcase category is `ENCX`, candidates ENCX-001..022), added to the existing `Encode / Decode` (9), `Programmatic` (6), `Crypto` (3) and `Checksum` (4) submenus under `Transform`, and to the Command Palette when there is a selection; all 22 planned commands are added as planned, none was dropped or replaced (899 commands now)
  - Encode / Decode: Base32hex (RFC 4648 §7), Base45 (RFC 9285; the space is a Base45 character, so only the line breaks at both ends of the selection are removed), Base62 (each leading zero byte is one `0`; at most 10,000 UTF-8 bytes to encode and 13,500 characters to decode, checked before computing, since the conversion is quadratic), uuencode (the file name of the `begin` line is 1 to 64 letters, digits, `.`, `_` and `-` and no file is written; the decoder ignores the name and mode and requires every data line to have exactly the length its length character announces, so data whose trailing spaces were removed is an error) and Encode All Characters as Percent-encoding (`a b` -> `%61%20%62`)
  - Escaping: Escape CSS Identifier (`CSS.escape` rules), Escape LDAP Filter Value (RFC 4515) and LDAP DN Value (RFC 4514) (text only, no LDAP connection), Convert to XPath String Literal (`concat()` when both quotes appear; never evaluated), Convert to C String Literal (`\xHH` per UTF-8 byte, `""` split before a following hex digit, `?\?` against trigraphs) and Unescape C / Java Style Escapes (a hand-written scanner, no `eval`; octal up to `\377`, greedy `\x` up to `\xff`, `\uXXXX` with surrogate pairs, `\UXXXXXXXX`; unknown escapes are errors). Unescape reads the selection as a sequence of C literals only when it starts exactly with `"` and ends with an unescaped `"`; otherwise (also with a line break at the end or indentation at the start) it is body text and its quotation marks stay, so `"a" and "b"` is an error (see README)
  - Hashes: Create Hash (SHA3-384), Create Hash (SHAKE256, Output Length N) (1 to 1,024 bytes, default 32) and Create HMAC (SHA3-512) (the key is asked in a password input box and never saved, logged or shown). **They are implemented in TypeScript, not with `node:crypto`**: the extension host of VS Code (Electron, with BoringSSL) does not provide SHA-3, so the extension's own Keccak implementation (already used by SHA3-256 / SHA3-512 / HMAC-SHA3-256) is generalized to any output length and checked against the FIPS 202 and NIST vectors; the ticket's note said `node:crypto` SHA3-384, which is not available there
  - Checksums: CRC-16/CCITT-FALSE (`29b1`), CRC-32C (Castagnoli, `e3069283`), IBAN Validate (ISO 13616 mod 97, general structure only, not the length of each country) and ISBN-10 / ISBN-13 Validate (shows the right check digit; an ISBN-13 must start with 978 or 979); IBAN and ISBN only show a notification, which never contains the selected text. **None of them are for cryptographic use**: they detect accidental errors or typing mistakes, not tampering
  - The results open in a new read-only editor (hashes and CRCs with the selected text as a heading) and the document is never changed; if any selection fails nothing is opened, and a run whose results would exceed 10,000,000 characters in total is refused. Unexpected failures are logged with the error name and stack frames only
  - No network access, files, processes, code evaluation, Webviews or new dependencies (SECURITY.md); a static test checks the new modules for them. The new code is in `src/handler/enc2Transforms.ts`, `src/handler/hash2Transforms.ts` and `src/handler/enc2CommandHandler.ts` (with additions to `src/handler/hashAlgorithms.ts`), and the showcase data in `scripts/showcase-data/ENCX.json`
- ✨ Add 23 line and selection commands (group LINE2 of the plan to pass 1,000 commands; their showcase category is `LINEX`, candidates LINEX-001..023): 14 **Line: …** commands in the existing `Line` context submenu and 9 **Selection - …** commands in the existing `Multi Cursor` submenu, and all of them in the Command Palette; all 23 planned commands are added as planned, none was dropped or replaced
  - Lines: Keep Lines N to M (`N-M`, like `sed -n 'N,Mp'`), Remove First / Last N Lines, Insert Blank Line Every N Lines, Cut Character Range of Each Line (`M-N` or `N`, grapheme clusters, like `cut -c`), Remove Duplicate Lines (Keep Last), Split into Lines by Regex, Join as Natural Language List (`Intl.ListFormat`; the locale is `en` by default, and an empty or unsupported locale is rejected), Add Numbers to Non-blank Lines and Arrange Lines into N Columns (N 1 to 100, like `column -c`; widths in code points, so a full-width character counts as one); positions and N are 1 to 1,000,000
  - Add Numbers to Non-blank Lines writes `1 a` (number and one space; Line: Add Line Numbers writes `1: a`), and blank lines keep their content and use up no number; unlike `nl -b t`, a line of only spaces, tabs or other white space (such as the full-width space) is blank too and gets no number
  - Two selections: Paste Selections Side by Side (two or more selections, like `paste`; an empty delimiter uses a tab), Lines Common to Two Selections, Lines Only in First Selection and Lines in Only One Selection (exactly two selections); the result replaces the first selection and the other selections are not changed
  - Select All Email Addresses / IP Addresses (IPv4 and IPv6, validated without the `net` module) / Hex Colors / UUIDs / ISO Dates (months and days checked, leap years included): they search inside the non-empty selections and ignore the cursors that are there too, and search the whole document only when every selection is empty; the patterns are fixed and run in linear time (email addresses are found like Extract Email, but with a linear scanner, since that pattern takes quadratic time on long runs of address characters; Extract Email itself is unchanged), and at most 100,000 selections are made
  - Expand to Sentence (`.!?` followed by a space or a line break, and `。！？`; abbreviations such as `Mr.` are not recognized) and Expand to Paragraph, which both use blank lines (empty or only white space; U+FEFF and U+200B are not white space) as paragraph boundaries; Keep Only Duplicate Texts; Join All Selections into First (the delimiter is `, ` by default and may be empty)
  - Limits: Split into Lines by Regex runs the pattern in the worker thread of the line regex commands (2-second timeout, pattern up to 500 characters, selections up to 10,000,000 characters, at most 1,000,000 matches); a run that would add more than 10,000,000 characters (shared by all selections) is refused; Insert Blank Line Every N Lines, Paste Selections Side by Side, Split into Lines by Regex, Add Numbers to Non-blank Lines and Arrange Lines into N Columns count the added characters before building the result, and Join as Natural Language List checks the length of its result before applying it; Join All Selections into First refuses a result longer than 10,000,000 characters
  - No network access, files, processes, code evaluation or new dependencies (SECURITY.md). The new code is in `src/handler/line2Transforms.ts`, `src/handler/line2CommandHandler.ts` and `src/handler/msel2Transforms.ts` (run by the existing Multi Cursor handler), and the showcase data in `scripts/showcase-data/LINEX.json`
- ✨ Add 23 text transform commands (group TEXT2 of the plan to pass 1,000 commands; their showcase category is `TEXTX`, candidates TEXTX-001..023, because showcase category IDs are upper-case letters only), in a new `Text Transform` context submenu (after `Multi Cursor`) and in the Command Palette when there is a selection; all 23 planned commands are added as planned, none was dropped or replaced
  - Length and padding: Repeat Selection N Times (N 1 to 10,000, a separator that may be empty), Truncate to N Characters, Shorten in the Middle, Pad Start / End to Width (Custom Character) (width 1 to 10,000, exactly one pad character), Insert Separator Every N Characters (N 1 to 10,000)
  - Character sets, like `tr`: Translate Characters (tr), Delete Characters in Set, Squeeze Repeated Characters (every character when the set is empty); the sets are plain characters (1 to 100 characters, 0 to 100 for Squeeze; no ranges), handled with `Set` / `Map`, never as a regular expression
  - Remove Digits (Unicode `Nd`), Remove Punctuation (Unicode `P`; symbols are kept), Keep Digits Only, Reverse Each Word, Sort Words in Selection, Remove Duplicate Words, Sort Characters, Remove Duplicate Characters (code point order, independent of the locale), Mask Except Last N Characters (line breaks stay; the value is never shown or logged), Leetspeak, Remove Text Between Delimiters (plain-text delimiters, no nesting)
  - Word Frequency Table and Character Frequency Table open one new editor for all selections (`item⇥count`, the most frequent first); spaces, line breaks and invisible characters are written as `U+XXXX`
  - Remove URLs removes `http://` / `https://` URLs (lower-case scheme only, like Extract URL) and accesses nothing. A URL ends at whitespace, at full-width punctuation (`。、，．！？：；｡､`) or at a closing bracket that the URL does not open (ASCII `)]}>` and full-width / quotation brackets such as `）」』】”`), so the text after it stays (`詳細は https://example.com。続き` -> `詳細は。続き`, `foo(https://x.com)bar` -> `foo()bar`); punctuation `.,;:!?'"` at its end is not part of it. The punctuation and closing brackets right after a URL are kept and joined to the word before it, and the spaces after them become one (none at the end of a line): `Visit https://example.com.` -> `Visit.`, `a   https://x.example.  b` -> `a. b`. At the start of a line the sentence punctuation after a URL is removed too (`https://x. Next` -> `Next`), and a line with only a URL becomes empty. The URLs are found with a fixed pattern and a single forward scan, in linear time
  - "Characters" are grapheme clusters, except for the `tr`-like commands and Leetspeak (code points); a value is asked once for all selections, every selection is converted in one edit (one undo step), and if any selection fails nothing is changed. The selections are limited to 1,000,000 characters and the results to 10,000,000; Repeat, Pad and Insert Separator compute the length of their result before building it. Messages and logs never quote the selected text or the values entered
  - No network access, files, processes, code evaluation or new dependencies (SECURITY.md); a static test checks the new modules for them. The new code is in `src/handler/text2Transforms.ts` and `src/handler/text2CommandHandler.ts`, and the showcase data in `scripts/showcase-data/TEXTX.json`

## [0.1.1] - 2026-10-01

- 🔒 Refuse a backslash in the commands that write SQL string literals, so the SQL they write cannot be changed by a value in MySQL / MariaDB's default mode (without `NO_BACKSLASH_ESCAPES`), where `\'` is an escaped quote and a value could end the string and add SQL of its own
  - Quote: SQL IN List (WRAP-006): a line with a backslash (`\`) is now an error and nothing is changed (`The selection was not changed: line 2 contains a backslash (\), …`); with several selections, nothing is changed if any of them is refused. Before, `\` was written as it is (`O\'Neil` -> `('O\''Neil')`). `'` is still doubled as before
  - Escape SQL String Literal (DEV-007) and its (Replace) version (DEV-032): text with a backslash is now an error and nothing is changed or opened (`the text contains a backslash (\), …`). Before, `\` was kept as it is
  - Also refuse a yen sign (`¥`, U+00A5) in these commands and in CSV - Convert to SQL INSERT (TABLE-012), because VS Code saves it as a backslash (the byte 0x5C) in Shift_JIS, CP932 and EUC-JP: **CSV - Convert to SQL INSERT now refuses a value, column name or table name with `¥`**, which it wrote as it is before (a backslash was already refused). The full-width `￥` (U+FFE5) and `＼` (U+FF3C) are still accepted
  - The reason is shared in a new module, `src/handler/sqlSafety.ts`; the message for a backslash is unchanged, and the one for a yen sign is `a yen sign (¥), which is saved as a backslash in Shift_JIS, CP932 and EUC-JP and is not safe in MySQL's default mode (the SQL is written as standard SQL)`
- 🔧 Make the integration tests (`npm test`) stable: runs no longer fail now and then on the same tests
  - `undo` in the tests runs in the editor of the test (shown and focused first), not in whichever editor has the focus
  - Tests wait for their own result document (Math, Shuffle, ...) and for their own edit (Random, Remove Surrounding Characters, ...) instead of the first opened document or a fixed sleep
  - Random results are checked over several tries: Shuffle Characters keeps the same characters and differs from the original in some try, SpongeBob Case mixes the cases in some try; the password check also covers the character set
  - The test profile turns off what can type into or take the focus from a test editor (suggestions, inline completions, update / welcome pages, hot exit), and every test closes its editors

## [0.1.0] - 2026-09-30

- 📚 Add a command showcase, published on GitHub Pages at https://imahiro-t.github.io/selection-manipulator/ and linked from the README: every command registered in `package.json` (831 now) by category, with its ID, title, description and input → output example in English and Japanese, a "Getting started" section (installation, Command Palette, context menu, keybindings, multiple selections, where results go), keyword search in both languages (ID, title, description, example) and category filters with counts, light / dark themes, and a layout that fits a 360px-wide screen; a single file with no external resources
  - English by default; the first language follows the browser (`navigator.language` starting with `ja` shows Japanese), and the English / 日本語 buttons switch it and remember the choice in `localStorage`; without JavaScript the page is shown in English
  - Generated as `docs/showcase.html` by `npm run showcase` (`scripts/generate-showcase.mjs`, Node.js built-ins only) from the bilingual data in `scripts/showcase-data/` (a file per category, with the English and Japanese description and example of every command); command titles come from `package.json`
  - `npm run showcase:check` fails when a command of `package.json` is missing from the data, listed twice or unknown, when an English or Japanese description or example is missing, when English text contains Japanese, or when the Japanese in an example is not marked as a note (translated in English) or real data (kept as is), and when the page is out of date, does not list every command exactly once or loads something from outside; `npm run test:showcase` runs its tests; both run in CI
  - A new `Pages` workflow checks the page and deploys only it (as `index.html`) to GitHub Pages on every push to `main`
  - The script, the data and the page are not packaged in the extension (`.vscodeignore`)
  - Remove `docs/ROADMAP.md`: all of its candidate commands are implemented; the showcase data and the tests that checked the commands against its tables now read `scripts/showcase-data/`

- 🐛 Fix small issues of the number commands (NUM)
  - Number - Add Thousands Separator: a zero loses its sign, like Absolute Value and Negate (`-000` -> `0`, `-0.00` -> `0.00`); other values keep their sign
  - Math - Standard Deviation / Variance / Statistics Summary: the mean is corrected for rounding, so many copies of one value give `σ=0` (before: about `σ=2.5e+296` for 300,000 copies of `1e308`)

- 🔧 Add CI (GitHub Actions `CI` workflow) run on every pull request and push to `main`: lint (new `npm run lint` script, `eslint src`), type check (`tsc -p ./`), build (esbuild), tests with `@vscode/test-electron` under xvfb, and `npm audit --audit-level=high`
  - Add a CodeQL workflow (`javascript-typescript`, on pull requests, pushes to `main` and weekly) and Dependabot updates for npm and GitHub Actions (weekly); `@types/vscode` gets only patch updates and `@types/node` no major updates, since both are raised by hand together with `engines.vscode` and the Node.js version of the extension host
  - Every workflow has only `contents: read` permission (CodeQL's job adds `security-events: write`), checks out without keeping credentials, and pins each action to a commit SHA with its tag in a comment

- 🔧 Update ESLint to 10 and typescript-eslint to 8 (the `typescript-eslint` package replaces `@typescript-eslint/parser` and `@typescript-eslint/eslint-plugin`), and move the ESLint configuration from `.eslintrc.json` to a flat config, `eslint.config.mjs`, with the same files, ignore patterns and rules
  - `@typescript-eslint/semi`, removed in typescript-eslint 8, is replaced with `@stylistic/semi` from `@stylistic/eslint-plugin`; the `lint` script is now `eslint src`, since ESLint 10 no longer has `--ext`
  - ESLint 10 needs Node.js `^20.19.0 || ^22.13.0 || >=24` for development; TypeScript stays at 5.x

- 🔧 Update change-case to 5 (ESM-only; replaces Dependabot PR #18), with no change to the output of the case commands
  - A new wrapper, `src/handler/changeCaseCompat.ts`, is the only module that imports change-case; it always splits words the way change-case 4 did and converts case without the locale, so non-ASCII text and locales such as Turkish give the same output as before (for example, Kebab Case of `café au lait` stays `caf-au-lait`); a new test compares every wrapped function with outputs recorded from change-case 4.1.2
  - Renamed functions: `paramCase` -> `kebabCase`, `headerCase` -> `trainCase`
  - The extension still loads change-case from its esbuild bundle (`out/main.js` has no `require("change-case")`), so older VS Code versions are not affected; for the tests compiled with `tsc`, TypeScript is updated to ^5.9.3 and `tsconfig.json` uses `"module": "node20"`, and the test VS Code loads change-case with `require(esm)`
  - change-case 5 has no dependencies, so its former sub-packages (`no-case`, `pascal-case` and others) are removed from `package-lock.json`

- ✨ Add 25 Markdown commands (ROADMAP MD-001..025), added to the existing `Markdown` context submenu under `Transform`
  - Headings: Increase / Decrease Heading Level, Generate Table of Contents (a selection is replaced with the table of contents of its headings; a cursor inserts the table of contents of the whole document; GitHub-style anchors, repeated headings numbered over the whole document; ATX headings only; the final line break of the document is kept; the tables of contents of several cursors on one line are separated by a blank line, also with a selection of only spaces between them), Convert Setext Headings to ATX, Heading to Anchor Link
  - Lists and tasks: Convert Lines to Bullet / Numbered / Task List, Toggle Task Checkbox, Remove List Markers, Renumber Ordered List (per nesting level), Blockquote
  - Inline: Bold, Italic, Strikethrough, Wrap in Code Fence (language: empty or up to 50 letters, digits and `_ + # . -`), Image (alt text up to 1,000 characters, escaped), Linkify URLs, Wrap in Details Block (summary up to 1,000 characters, HTML-escaped)
  - Format Table (column widths in code points, alignments kept) and Strip Formatting
  - Convert to HTML: the extension's own CommonMark subset with no new dependency (headings, paragraphs, bold / italic / strikethrough, inline code, code fences, bullet / ordered lists, block quotes, links, images, thematic breaks); raw HTML is escaped, and `javascript:` / `vbscript:` / `data:` / `file:` URLs become `#`
  - Convert to Footnote and Inline Links to Reference Links (numbered after the existing footnotes / definitions in the document; the definitions are added after a blank line)
  - Front Matter to JSON: reads the front matter with `js-yaml` (YAML 1.2 Core schema, no code is run) and writes one line of JSON, unlike the indented output of Convert YAML to JSON
  - Blocks written by Generate Table of Contents, Wrap in Code Fence, Wrap in Details Block and Inline Links to Reference Links never share a line with other text: when a selection starts or ends in the middle of a line, line breaks (and blank lines where the next line would continue the block) are added; indentation of 4 columns or more before a table of contents, a code fence or a details block is dropped so that it is not read as an indented code block
  - Each selection is converted on its own, as one undo step; empty selections are ignored except by Generate Table of Contents; if any selection fails, nothing is changed and a warning is shown, and a run whose results would exceed 10,000,000 characters is refused (see README for limitations)

- ✨ Add 30 multi-cursor and selection commands (ROADMAP MSEL-001..030), also grouped in a new `Multi Cursor` context submenu
  - Filtering: Keep Odd / Even Selections, Keep Every Nth Selection, Remove First / Last Selection, Keep / Remove Selections Matching Regex (`u` flag, case-sensitive; run in a worker thread and stopped after 2 seconds, pattern up to 500 characters, selections up to 10,000,000 characters; if the document is edited while the pattern is running, nothing is changed and a warning is shown), Remove Empty Selections, Deselect Duplicate Texts
  - Aligning, expanding and shrinking: Align Cursors (inserts spaces; tabs follow the editor's tab size), Expand to Word, Expand to Inside Quotes, Expand to Inside Brackets (running it again goes one level out), Trim Whitespace from Selections, Shrink Selections by One Character, Extend to Next Delimiter
  - Splitting: Split Selections by Delimiter (literal, 1 to 100 characters; empty parts become cursors), Split Selections by Regex (same worker and limits as above; empty matches are not used), Split into Words
  - Cursors on every line: Cursors to First Non-whitespace, Select Column N (delimiter and column number you enter; quoted CSV is not parsed), Select Leading Indentation
  - Selecting inside the selections: Select All Numbers, Select All Quoted Strings, Select All URLs (the same URL rule as Extract URL, without trailing punctuation)
  - Exchanging the texts: Rotate Texts Forward / Backward, Swap Two Selections, Copy First Selection to All (the new texts are selected, and one undo restores the text)
  - Show Selection Info (the number of selections and the line and length of each, in a notification)
  - The selections are counted in document order; a command whose result would leave no selection, or more than 100,000 selections, changes nothing and shows a warning (see README for limitations)

- ✨ Add 30 case conversion commands (ROADMAP CASE-001..030)
  - Case only: Swap, Sentence (Preserve Acronyms), Title (APA Style), Upper First, Lower First, Alternating Words, Uppercase Known Acronyms, Sentence (Each Sentence), Capitalize Each Line, Lowercase Each Line Start, Upper (Locale), Lower (Locale)
  - Naming conventions: Cobol, Ada, Flat, Upper Flat, Camel Snake, Pascal Snake, Acronym, CSS Custom Property, BEM, Hashtag
  - Detect Style (shows the naming convention in a notification) and Cycle (camel -> snake -> kebab -> Pascal -> CONSTANT)
  - JSON Keys to Camel / Snake / Kebab / Pascal (only keys change; values, formatting and key order are kept; key collisions are reported and the selection is left unchanged)
  - Pluralize / Singularize (rule-based with a small built-in dictionary; see README for limitations)
- ✨ Add 35 whitespace commands (ROADMAP WS-001..035), also grouped in a new `Whitespace` context submenu
  - Indentation: Leading Tabs to Spaces (2/4), Leading Spaces to Tabs (2/4), Re-indent 2 to 4 / 4 to 2 Spaces, Remove Common Indent (Dedent), Trim Leading Whitespace, Indent / Outdent Lines by N Spaces, Expand / Unexpand Tabs (tab stops of 4)
  - Blank lines and line breaks: Collapse Consecutive Blank Lines, Insert Blank Line Between Lines, Remove Trailing / Leading Blank Lines, Clear Whitespace-only Lines, Unwrap Paragraphs, Hard Wrap at 80 / N Columns
  - Spaces inside lines: Remove All Whitespace, Collapse Inline Spaces (Keep Indent), Special Spaces to Normal Space, Add Spaces Around Operators (strings, template literals and comments are kept), Remove Space Before Punctuation, Ensure Space After Comma
  - Visualize Spaces and Tabs (`·` U+00B7 / `→` U+2192) and Restore Visualized Spaces and Tabs
  - Alignment: Center Align, Right Align, Pad Lines to Same Length, Align by `=` / `:` / `,` / a custom delimiter (each selection is aligned on its own; a run that would add more than 10,000,000 characters is refused with a warning and leaves the text unchanged; see README for limitations)
  - Remove Trailing / Leading Blank Lines keep one line break so the text after the selection is not joined with the previous line when the selection starts in the middle of a line (`ab|⏎⏎⏎|z` -> `ab⏎z`), and Remove Trailing Blank Lines also does so when the selection starts at the start of a line and ends inside the indentation of a later line (`|a⏎⏎··|z` -> `a⏎z`; only the selected whitespace is removed, and nothing is removed if the selected part of the last line contains non-whitespace text)
- ✨ Add 40 line commands (ROADMAP LINE-001..040), also grouped in a new `Line` context submenu
  - Filter: Keep / Remove Lines Containing Text, Keep / Remove Lines Matching Regex (`u` flag, case-sensitive; run in a worker thread and stopped after 2 seconds, pattern up to 500 characters, selections up to 10,000,000 characters; if the document is edited while the pattern is running, nothing is changed and a warning is shown), Keep / Remove Every Nth Line, Keep Odd / Even Lines, Keep First / Last N Lines, Remove Comment Lines (`#` / `//`)
  - Duplicates: Keep Only Duplicated Lines, Keep Lines Appearing Once, Remove Duplicate Lines (Ignore Case / Ignore Whitespace), Remove Adjacent Duplicate Lines
  - Numbering and reordering: Add Line Numbers (`1: a`) / (Zero Padded, `01 a`), Reverse Word Order in Each Line, Rotate Lines Down, Swap Adjacent Line Pairs, Move Lines Containing Text to Top, Interleave First and Second Half, Duplicate Each Line
  - Join and split: Join Backslash-continued Lines (only an odd number of trailing backslashes continues a line; `\\` is literal; with CRLF the character before `\r\n` is checked; line breaks that are not joined keep their LF / CRLF / CR), Join Every N Lines (Custom Delimiter), Split Sentences into Lines (`.` `!` `?` followed by whitespace, and `。`), Split into Fixed-width Lines
  - Prefix / suffix and extraction: Remove Prefix / Suffix from Each Line, Extract Lines Between Markers, Extract Longest / Shortest Line
  - Count Lines, Words and Characters (shows the total in a notification)
  - Clipboard versions of Keep Lines Containing Text, Keep Lines Matching Regex, Keep Only Duplicated Lines, Keep Lines Appearing Once, Remove Adjacent Duplicate Lines and Extract Lines Between Markers (the results are joined with the document's line ending; empty results are skipped)
  - Commands that remove, reorder, number or extract lines leave a partial first / last line of a selection that starts or ends in the middle of a line unchanged, so the text around the selection is never joined with another line (they change nothing when no full line is selected); the Clipboard versions ignore where the selection starts and ends, so their result can differ from the replacing version (see README)
- ✨ Add 30 sort commands (ROADMAP SORT-001..030), added to the existing `Sort Lines` and `Sort Selections` context submenus
  - Sort Lines by natural order (Ascending / Descending), ignoring case (Ascending / Descending), a locale you enter (Ascending / Descending, `Intl.Collator`), Japanese kana order, a column (delimiter and column number you enter; Ascending / Descending), a regex capture (`u` flag; run in a worker thread and stopped after 2 seconds, pattern up to 500 characters, selections up to 10,000,000 characters), a year-first date (Ascending / Descending; a date without a time zone is taken as UTC), semantic version, IP address (IPv4 / IPv6, CIDR), hex number, word count, last word and reversed string; Sort Lines and remove duplicates, Sort Paragraphs, and Sort Lines keeping indented children
  - Sort Selections by natural order, ignoring case, and length (Ascending / Descending)
  - Clipboard versions of Sort Lines by natural order, ignoring case, column and semantic version, and of Sort Selections by natural order
  - Output: like the existing sort commands, the editor is never changed; the results open in a new editor, and the Clipboard versions copy them to the clipboard (joined with LF). This includes the selection sorts (Sort Selections by natural order / ignoring case / length). An empty result opens nothing and leaves the clipboard unchanged, with a notification
  - All sorts are stable, and lines without a key (no date, version, IP address, hex number, regex match or column) are put last in both orders; column and regex keys put numbers before text in the ascending order (see README for limitations)
- ✨ Add 30 enclose / quote commands (ROADMAP WRAP-001..030), added to the existing `Enclose` context submenu
  - Enclose the whole selection: Custom (Prefix / Suffix), HTML Tag (Custom; letters, digits and hyphens only, no attributes), Triple Double (`"""`), Guillemets (`«»`), Smart Double (`“”`) / Single (`‘’`), Double with Escaping (`\` and `"` are escaped), Japanese White Lenticular (`〖〗`) / Tortoise Shell (`〔〕`) / Double Angle (`《》`) / Single Angle (`〈〉`) Brackets, HTML Comment, Block Comment (`/* */`), Placeholder (`${}`), Mustache (`{{ }}`), Percent (`%%`), Pipes (`||`) and Backtick Code (Auto Fence; one more backtick than the longest run inside, with CommonMark space padding). Like the existing Enclose / Quote commands, an empty selection gets the pair inserted at the cursor
  - Lines, words and brackets: Enclose Each Line (Custom), Quote Each Line (Double / Single), Quote Each Word (Double), Enclose Each Word (Parentheses), SQL IN List (`'` becomes `''`), Array Literal (`\` and `"` are escaped), Unquote Each Line, ASCII Box, Lines Block (Before / After Lines), Cycle Brackets (`()` -> `[]` -> `{}`) and Remove Matching Outer Brackets. These change nothing for an empty selection
  - Commands that ask for input ask only once for all selections and change nothing when an input box is cancelled; prefixes, suffixes and lines are limited to 1,000 characters without line breaks, and a run that would add more than 10,000,000 characters is refused with a warning and leaves the text unchanged (see README for limitations)
- ✨ Add 40 encode / decode commands (ROADMAP ENC-001..040), grouped in new `Encode / Decode` context submenus under `Transform` and `Replace`
  - Encode / Decode HTML Entities (named and numeric references), Encode All Characters as Numeric Entities (non-ASCII characters only), Escape / Unescape Unicode (`\uXXXX`, also `\u{...}` when unescaping), Escape Unicode (`\u{...}`)
  - Encode / Decode Base64URL, Base32, Base58, Ascii85 and Base64 (Each Line), Gzip / Gunzip Base64 (the gzip header is fixed so the same text always gives the same result), Encode as Data URI (text/plain)
  - Encode / Decode Hex and Binary (UTF-8 bytes; Decode Hex accepts whitespace-separated tokens and `0x` prefixed groups of an even number of digits), Encode / Decode Punycode (IDN; `node:url`, one domain name without line breaks or tabs, up to 1,000 characters), Encode / Decode Quoted-Printable (76-character soft line breaks; trailing whitespace of encoded lines is removed when decoding), Encode / Decode Form (x-www-form-urlencoded)
  - Cipher: ROT13, ROT47, Caesar Shift (asks once for an integer shift) and Atbash (ASCII letters only; not encryption), Text to NATO Phonetic Alphabet
  - Output: the standard versions open the result in a new editor (with multiple selections, the results of all selections joined with the document's line ending); the (Replace) versions of Encode / Decode HTML Entities, Escape / Unescape Unicode (`\uXXXX`) and Encode / Decode Hex replace each selection. Empty selections are skipped
  - The decoders reject malformed input and decoded bytes that are not valid UTF-8 with an error, and then change nothing and open nothing (selected text quoted in the error is shortened to 60 characters); Gunzip Base64 rejects data that decompresses to more than 10 MiB, Base58 is limited to 10,000 bytes / 14,000 characters, and a run whose results would exceed 10,000,000 characters is refused with a warning (see README for limitations)
- ✨ Add 20 hash and checksum commands (ROADMAP HASH-001..020), added to the existing `Crypto` context submenus and a new `Checksum` context submenu under `Transform`
  - Create Hash (SHA-224, SHA-384, SHA-512/256, SHA3-256, SHA3-512, BLAKE2b-512, BLAKE2s-256), with (Replace) versions of SHA-384, SHA3-256 and BLAKE2b-512; SHA-3 and BLAKE2 are computed by the extension's own implementation, as the Node.js of VS Code does not provide them
  - Create Hash (SHA-256, Base64) for CSP, Create SRI Hash (sha384) and Create Hash per Line (SHA-256; line breaks and empty lines are kept)
  - Create HMAC (SHA-1, SHA-384, SHA3-256): asks once for the key in a password input box, does nothing when it is cancelled, and never saves or shows the key; HMAC-SHA1 is for compatibility with existing systems only
  - Checksum: CRC-32, Adler-32 and FNV-1a 32-bit (error detection, not tamper detection; no new dependencies), and Luhn Validate, which shows `valid` / `invalid` / `not a number` in a notification without changing the selection or showing the number (only digits and a single space or hyphen between two digits are allowed)
  - The selected text is hashed as its UTF-8 bytes without trimming (a lone surrogate is an error, and nothing is changed or opened), empty selections are skipped, and a run whose results would exceed 10,000,000 characters is refused with a warning (see README for limitations)
- ✨ Add 40 data format commands (ROADMAP DATA-001..040), grouped in new `Data Format` context submenus under `Transform` and `Replace`
  - JSON structure: Sort JSON Keys (also Replace), Remove Null Values, Extract JSON Value by Path, List JSON Paths, Extract JSON Keys, Merge JSON Objects (Selections; deep merge, a later value wins), Validate JSON (shows `Valid JSON` or `Invalid JSON at line L, column C: reason` and selects the character that caused the error), Remove Duplicates in JSON Array, Pluck / Group JSON Array by Field, Count JSON Elements (shown in a notification), Generate JSON Schema from JSON (draft 2020-12) and Parse Nested JSON Strings; paths are written as `a.b[0]`, `$["b-c"][1]` or `["a.b"]`
  - JSON to other formats: Query String, Env (values with `$`, a backtick or `\` are enclosed in single quotes so that they are not expanded), XML (also Replace; ASCII element names only), TOML (also Replace), INI, .properties, JSON Lines (also Replace) and JS Object Literal (`__proto__` is written as `['__proto__']`)
  - Other formats to JSON: TOML (also Replace), INI, .properties, JSON Lines (also Replace), JSONC / JSON5 and JS Object Literal; TOML, INI, .properties, JSONC / JSON5 and JS object literals are read by the extension's own parsers, which never evaluate the text, and TOML supports the main TOML 1.0 syntax (`inf`, `nan` and integers beyond ±(2^53−1) are errors) without new dependencies
  - YAML: Format YAML (also Replace) and Sort YAML Keys with the existing js-yaml and the YAML 1.2 Core schema, so dates stay as they are written, `<<` is kept as an ordinary key and the trailing line break follows the selection; comments are lost, and YAML with anchors and aliases is limited to (mappings and sequences) × (references to them) ≤ 300,000,000
  - HTTP: Parse Cookie Header, Set-Cookie, HTTP Headers and User-Agent (simple built-in rules) to JSON
  - Output: the standard versions open the result in a new editor (with multiple selections, joined with the document's line ending), the (Replace) versions replace each selection, and empty selections are skipped. A selection can be up to 5,000,000 characters and nested up to 500 levels (YAML: 100); if any selection fails, nothing is changed or opened and an error names the problem, and a run whose results would exceed 10,000,000 characters is refused with a warning (see README for limitations)
- ✨ Add 30 table commands (ROADMAP TABLE-001..030), grouped in new `CSV / TSV` context submenus under `Transform` and `Replace`
  - Convert: CSV to JSON Array (also Replace; values are strings, indented with 2 spaces), from JSON Array (also Replace; the header is the union of the keys, numbers out of range such as `1e400` are errors), to TSV (also Replace), from TSV, to HTML Table (also Replace; cells are HTML-escaped), to SQL INSERT, to YAML (with the existing js-yaml), to ASCII Table, from Whitespace-separated Table, and Rows to Key-Value Records
  - Columns and rows: Transpose (also Replace), Extract / Remove / Swap Columns (by number or exact header name), Align Columns, Trim Cell Padding, Remove Duplicate Rows, Filter Rows by Column Value (`Equals` / `Contains`, case-sensitive), Add Index Column, Fill Empty Cells from Above, Change Delimiter (one character; type `\t` for a tab), Quote All Fields and Remove Unnecessary Quotes
  - Notifications: Sum Column (`sum=…, avg=…`) and Show Row and Column Count (`2 rows × 2 cols, b: 1 empty`), which never change the selection
  - Convert to SQL INSERT writes standard SQL (`'` and `"` doubled) and only writes it, never runs it; a value, column name or table name with a backslash is an error, as MySQL / MariaDB in their default mode read it as an escape character
  - All commands share one RFC 4180 parser (quoted fields with `""`, delimiters and line breaks inside quotes, CRLF / LF) without new dependencies; the existing CSV <-> Markdown Table commands are unchanged
  - Output: the standard versions open the result in a new editor (with multiple selections, joined with the document's line ending), the (Replace) versions replace each selection, and empty selections are skipped. Cancelling an input box does nothing. A selection can be up to 5,000,000 characters and a table up to 10,000,000 cells; if any selection fails, nothing is changed or opened and an error names the problem, and a run whose results would exceed 10,000,000 characters is refused with a warning (see README for limitations)
- ✨ Add 40 number, statistics and unit commands (ROADMAP NUM-001..040), added to the existing `Calculate`, `Replace > Number` and `Transform > Unit Conversion` context submenus
  - Statistics (open the result in a new editor, one line for each selection): Median, Mode (ties in ascending order), Standard Deviation (`σ=…, s=…`), Variance (`population / sample`), Count Numbers, Product, Range, Percentile (0-100, linear interpolation like `PERCENTILE.INC`) and Statistics Summary. Unlike the existing Sum / Average / Min / Max, each selection is computed on its own; the numbers are the decimals in the text, and a comma separates numbers (`1,234` is 1 and 234)
  - Number conversions (replace each line): Cumulative Sum, Round (0-15 decimal places, half away from zero), Floor, Ceil, Truncate, Absolute Value and Negate (only the sign changes; a zero never gets `-`), Add / Remove Thousands Separator, Format by Locale (`Intl.NumberFormat`), Decimal to / from Hex, Binary and Octal, Convert Base (2-36; BigInt, up to 1,000 digits), To / From Scientific Notation, To Percent, Bytes to Human Readable (B to YiB) and back (SI and IEC units), To English Words (up to 36 digits), Add English Ordinal Suffix and Decimal to Fraction (exact, or a repeating decimal with a denominator up to 99 for 6 or more decimal places)
  - Unit conversions: Celsius <-> Fahrenheit, km <-> mile, cm <-> inch (rounded to 4 decimal places, without a unit symbol)
  - Rounding: results are shown without floating-point noise (safe integers as they are, anything else to 15 significant digits: `0.1` + `0.2` -> `0.3`); variance, standard deviation, the mean / σ / s of the summary and the unit conversions are rounded to 4 decimal places
  - Output: empty selections and selections of only whitespace are skipped (`Select the numbers to use.` when nothing is left), a command that asks for input asks once, and cancelling does nothing. A selection can be up to 5,000,000 characters; if any selection or line fails, nothing is changed or shown and the message names the selection and line, and a run whose results would exceed 10,000,000 characters is stopped and refused with a warning (see README for limitations). No new dependencies; the existing number commands are unchanged
- ✨ Add 30 date and time commands (ROADMAP DATE-001..030), added to the existing `Date Conversion` context submenu
  - Time zones (`Intl.DateTimeFormat`): Convert to UTC String (RFC 7231), Convert to Time Zone (asks for an IANA time zone; also Replace and Clipboard; daylight saving time is applied) and Show in Multiple Time Zones (the IANA names of a setting with `HH:mm` and ` (前日)` / ` (翌日)`: `UTC 00:00⏎Asia/Tokyo 09:00⏎America/Los_Angeles 17:00 (前日)`)
  - Weekdays and calendar: Show Weekday (notification), Append Weekday (`(月)` or `(Mon)`), ISO Week Number, Day of Year, Show Quarter and Fiscal Year (`2026 Q3 / FY2026 上期`), Insert Month Calendar (a `cal`-style calendar starting on Sunday) and Generate Date Range (up to 10,000 dates)
  - Calculation: Difference Between Two Dates (two dates on a line or two selections; `270 days`, `1 day 1 hour 30 minutes`), Add Days, Add Months (the end of the month for a day that does not exist), Convert to Relative Time (`Intl.RelativeTimeFormat`, `3 日前`) and Calculate Age
  - Formats: Format with Pattern (own tokens `yyyy` `MM` `dd` `HH` `mm` `ss` `SSS` `a` `EEEE` `E` …, text in `'…'`; also Replace), Convert to / from Compact (YYYYMMDD) (also Replace), Convert to Japanese Format (`2026年9月28日`), Convert to / from Excel Serial (1900 date system; `60` is an error, and a fraction that rounds to 24:00:00 moves to the next day), ISO 8601 Duration to Human (`1 時間 30 分`), Seconds to HH:MM:SS and back
  - Explain Cron Expression: 5 fields with names, lists, ranges and steps, explained in Japanese with the next 5 runs within 8 years (`毎週月曜 09:00（次回: 2026-10-05 09:00, …）`); `L`, `W`, `#`, `?` and macros are errors, and the day and the weekday are combined with OR as in standard cron
  - New settings: `selection-manipulator.date.timeZones` (default `UTC`, `Asia/Tokyo`, `America/Los_Angeles`; 1 to 20), `selection-manipulator.date.weekdayLanguage` (`ja` / `en`) and `selection-manipulator.date.fiscalYearStartMonth` (1-12, default 4); an invalid value stops only the commands that use it
  - Dates are read strictly (`YYYY-MM-DD` or `YYYY/MM/DD` with an optional time and offset; dates that do not exist are errors), and a date and time without an offset is local time. Each line is one value (spaces around it, empty lines and CRLF are kept); if any line or selection fails, nothing is changed, shown or copied and the message names the selection and line. A selection can be up to 1,000,000 characters, Explain Cron Expression reads up to 1,000 lines at once, and a run whose results would exceed 10,000,000 characters is refused with a warning (see README for limitations). Only `Date` and `Intl` are used, with no new dependencies; the existing date commands are unchanged
- ✨ Add 30 generator commands (ROADMAP GEN-001..030): the Random commands are added to the existing `Random` context submenu and the Generate commands are grouped in a new `Generate` context submenu
  - IDs and tokens: UUID v7 and ULID (sorted within one run so that they are in ascending order in the document), NanoID (21 characters), Hex String and Base64 Token (Base64URL; 1 to 1,024 random bytes), GUID (Braced Uppercase) (`{3F2504E0-…}`)
  - Random values: Integer in Range (safe integers, up to 2^48 − 1 values), Float in Range (0 to 10 decimal places, computed without floating-point arithmetic: `0.1..0.3` gives exactly `0.100` to `0.300`, never `-0.000`), Date in Range (0001-01-01 to 9999-12-31), Boolean, Dice Roll (`NdM` from the selection, or asked once for empty cursors: `2d6` -> `7 (3+4)`), Pick One Line and Pick N Lines (without repeats, in random order; the warning `Select the lines to pick from.` when no selection has anything but spaces, tabs and line breaks), MAC Address (unicast, locally administered) and Hex Color
  - Dummy data from small built-in lists: Dummy Email (`example.com` only), Dummy Name, Dummy Japanese Name (`佐藤 花子`), Dummy Phone Number (JP) (`090-0xxx-xxxx`; not guaranteed to be unassigned) and Japanese Dummy Text (1 to 1,000 sentences, picked independently)
  - Sequences in document order for multiple cursors: Alphabet (`a` … `z`, `aa`), Roman Numeral (up to 3,999), Date (from today by default), Hex (keeps the `0x` prefix, the width and the case), Kana (Gojūon 46 / Iroha 47, chosen with a quick pick), Circled Number (up to 50) and IPv4 (from `192.0.2.1` by default); more cursors than values is an error, and nothing wraps around
  - Generators: Number Range (`1..10 step 3` -> `1⏎4⏎7⏎10`, integers only, up to 100,000 numbers), Repeat Character to Width (1 to 16 characters with spaces kept, up to 10,000 characters) and Column Ruler (up to 1,000 columns)
  - All random values come from `crypto` (`randomBytes`, `randomInt`, `randomUUID`; no `Math.random`). Each selection and cursor gets its own value in one edit; a command that asks for input asks only once and does nothing if cancelled; if anything is invalid, nothing is changed and an error is shown. More than 100,000 selections and cursors is an error and changes nothing, a selection read by Pick One Line, Pick N Lines or Dice Roll can be up to 1,000,000 characters (a longer one is an error), and a run whose results would exceed 10,000,000 characters in total is refused with a warning and changes nothing (see README for limitations). No new dependencies; the existing Random commands (UUID, Password, IPv4, IPv6, Lorem Ipsum) are unchanged
- ✨ Add 35 Japanese text commands (ROADMAP JA-001..035), added to the existing `Japanese` context submenu under `Transform`
  - Romaji: Kana to Romaji (Hepburn; also Replace) and (Kunrei) (`しんじゅく` -> `shinjuku` / `sinzyuku`; `ん` before a vowel or `y` is `n'`, a `っ` without a consonant after it is `xtsu` / `xtu`, `を` is `o`), and Romaji to Hiragana (also Replace; Hepburn and Kunrei; a run of letters is converted only when all of it can be read, so `hello` stays; two equal consonants are `っ`, also `mamma` -> `まっま`)
  - Numbers: Number to Kanji Numeral (also Replace; `10000` -> `一万`), Kanji Numeral to Number (also Replace; place values, digit sequences such as `二〇二六`, mixed digits such as `3億5000万` and daiji; `万` and larger units need a number before them, so `一万`, not `万`) and Number to Daiji (`123` -> `壱百弐拾参`), from 0 to 10^20 − 1
  - Punctuation and kanji forms: Punctuation to Comma and Period (`，．`) and to Touten and Kuten (`、。`), Old Kanji to New (also Replace; the old forms of the Jōyō kanji table and the CJK compatibility ideographs U+FA30..FA6A) and New Kanji to Old (`弁` `芸` `欠` `予` `余` `台` `糸` `缶` `虫` are kept, as they have several old forms or are old characters of their own), Small Kana to Normal
  - Ruby: Remove Ruby Notation (`｜東京《とうきょう》`, `東京《とうきょう》` and a kana-only reading in parentheses right after a kanji; `《…》` after anything but a kanji is kept) and Ruby Notation to HTML (`<ruby>東京<rt>とうきょう</rt></ruby>`; the base and the ruby are HTML-escaped)
  - Width, spaces and dashes: Full-width Alphanumerics to Half (Keep Kana), Ideographic Space to Space, Normalize Wave Dash (`〜` or `～`, chosen with a quick pick), Normalize Hyphens and Long Vowel Marks (the ASCII `-` is kept, `ｰ` after half-width katakana), Remove Spaces Between Japanese Characters (spaces between full-width alphanumerics are kept), Add Space Between Japanese and Alphanumerics (also Replace; running it again changes nothing), Circled Numbers to Parentheses, Hiragana to Half-width Katakana (a `ー` right after converted hiragana becomes `ｰ`) and Compose Dakuten (only pairs that make one character)
  - Extraction: Extract Kanji and Extract Katakana Words (one per line; a `ヶ` alone, as in `3ヶ月`, is not a word), with a message instead of an empty editor when nothing is found
  - Counting (notifications for all selections together): Count Characters (Manuscript Paper) (`1,234 字 / 原稿用紙 3.1 枚`; code points without line breaks, spaces counted, selections of only spaces, tabs and line breaks skipped) and Count by Character Type (`漢字 2 / カタカナ 3 / ひらがな 1 / 英数字 2`, with `記号` for punctuation and symbols and `その他` for anything else, such as `①` and Hangul; white space is not counted)
  - Prefecture Name to/from JIS Code (official and short names, codes 01-47) and Format Postal Code (`1000001` -> `〒100-0001`; no address lookup), one value per line
  - Detect Platform-dependent Characters: selects every character outside JIS X 0208 / JIS X 0201 (`①`, `髙`, emoji, …), up to 10,000
  - Output: most commands open the result in a new editor (with multiple selections, joined with the document's line ending), the formatting commands and the (Replace) versions replace each selection (only those that change, in one edit), and empty selections and selections of only spaces, tabs and line breaks are skipped (`Select the text to convert.` when nothing is left). A selection can be up to 1,000,000 characters; if any selection or line fails, nothing is changed, shown or selected and the message names the selection and line, and a run whose results would exceed 10,000,000 characters is refused with a warning (see README for limitations). All tables are constants in the extension, with no new dependencies and no network access; the existing Japanese commands are unchanged
- ✨ Add 30 Unicode commands (ROADMAP UNI-001..030), grouped in a new `Unicode` context submenu
  - Normalization and cleanup: Normalize NFC / NFD / NFKC / NFKD, Remove Zero-width Characters (a ZWJ between two emoji is kept, so emoji ZWJ sequences are not broken), Remove Control Characters (C0 / C1 except tab and line breaks), Remove Non-ASCII Characters and Reveal Invisible Characters (`a{U+200B}b` -> `a<U+200B>b`; control, format and special space characters, keeping emoji sequences)
  - Code points: Show Code Points (`U+3042 U+1F600`), Code Points to Text (also reads `<U+XXXX>`, so it turns the results of Show Code Points and Reveal Invisible Characters back), Show UTF-8 Bytes per Character, Show UTF-16 Code Units and Count Graphemes (`1 grapheme / length 8`, by `Intl.Segmenter`)
  - Emoji: Remove Emoji and Extract Emoji (whole grapheme clusters with skin tone modifiers, ZWJ sequences, flags and keycaps)
  - Styled text: Mathematical Bold / Italic / Monospace, Circled Letters, Upside Down Text (the order of the lines is reversed too), Combining Strikethrough / Underline, and Superscript / Subscript (digits and `+ - = ( )` by default, or also letters, chosen with a quick pick)
  - Detection (selects what it finds and shows what was found): Detect Confusable Characters (Cyrillic and Greek homoglyphs in a word with Latin letters, and words made only of Cyrillic lookalikes on a line with Latin words; ordinary Russian and Greek text is not reported) and Detect Bidi Control Characters (U+202A..202E and U+2066..2069, Trojan Source), up to 10,000 characters
  - Typography and scripts: Convert to Smart Quotes, Typographic Dashes and Ellipsis (exactly `--` and `...`; `---` and `....` are kept), Detect Scripts (`Latin 3, Hiragana 1, …` for all selections together) and Transliterate Cyrillic to Latin (one fixed ASCII value per letter, the Russian value where languages differ, plus the Ukrainian, Belarusian, Serbian and Macedonian letters)
  - Output: most commands replace each selection (only those that change, in one edit); Show Code Points, Show UTF-8 Bytes, Show UTF-16 Code Units and Extract Emoji open a new editor; Count Graphemes and Detect Scripts show a notification. Surrogate pairs, combining marks and emoji sequences are never cut apart. Empty selections and selections of only spaces, tabs and line breaks are skipped; if any selection fails, nothing is changed, shown or selected. A selection can be up to 1,000,000 characters, and a run whose results would exceed 10,000,000 characters is refused with a warning (see README for limitations). Only built-in Unicode processing and constant tables, with no new dependencies and no network access; the existing Unicode escape commands and Unsmart Quotes are unchanged
- ✨ Add 35 developer commands (ROADMAP DEV-001..035), added to the existing `Programmatic` context submenu
  - String literals: Convert to JS String Literal (`it's⏎ok` -> `'it\'s\nok'`), Python String Literal (quotes chosen like `repr`), Java String Concatenation (one `"…\n" +` per line; octal escapes, never `\uXXXX`), Go Raw String (a backquote inside is concatenated) and JS Template Literal
  - Escaping: Escape Regex Special Characters, Escape SQL String Literal (`'` -> `''`, standard SQL), Quote for POSIX Shell (`'it'\''s'`), Quote for PowerShell (curly single quotes are doubled too), Escape CSV Field and Escape Markdown Special Characters (`+ - =` and the `.` of `1.` are escaped only at the start of a line)
  - Types from sample JSON: TypeScript interface, Go struct (json tags, `gofmt` alignment, initialisms) and Python TypedDict (functional form for keys that are not identifiers; needs Python 3.11 with `NotRequired`, otherwise 3.10); keys missing from some objects of an array are optional, and nested objects become named types
  - SQL: Format, Minify (optimizer hints `/*+ */` and `/*! */` are kept) and Uppercase Keywords, with a simple dialect-neutral tokenizer. `#` and `--` without a following space keep the rest of their line unchanged with its line break (a MySQL comment or SQL Server `#temp` code means the same either way), and forms the dialects read differently are refused: PostgreSQL `$$` / `$tag$` and `E'…'` strings, nested block comments, and `'…'` / `"…"` strings with an odd number of `\` before a quote (MySQL backslash escapes)
  - CSS: Minify (`/*! */` is kept; a removed comment that would join two tokens becomes `/**/`) and Format
  - Colors: Hex to HSL, HSL to Hex (comma and space syntax, `deg`, alpha) and Toggle Hex Color Short / Long, one color per line
  - Code: Remove console.log Statements (whole-line `console.log` / `console.debug` calls only; calls whose removal could change the meaning of the code are kept), Sort Import Statements (each run of consecutive imports; side-effect imports are not moved) and Convert String Concatenation to Template Literal (expressions with lower-precedence operators, `/` or comments outside parentheses are refused)
  - Convert curl Command to fetch: splits the command like a POSIX shell without expanding `$VAR` or `$(…)`, supports `-X -H -d --data-* --json -F -u -A -e -b -I -G --url --oauth2-bearer`, adds the `Content-Type` curl would send, never reads `@file` (a TODO comment is written instead) and refuses a body with GET / HEAD
  - Convert HTML to JSX: `className`, `htmlFor`, React attribute and event names, camelCase `-` / `:` names, `style` objects, self-closing void elements, `{/* */}` comments and escaped `{ } < >` in text; tag and attribute names that are not plain names (`{...x}`, `@click`) are refused
  - Bump Semantic Version (patch / minor / major chosen with a quick pick, npm `semver.inc` rules; build metadata is removed) and Convert chmod Numeric / Symbolic (setuid / setgid / sticky, `ls -l` forms)
  - (Replace) versions of Convert to JS String Literal, Escape Regex Special Characters, Escape SQL String Literal, Convert JSON to TypeScript Interface, Format SQL and Convert HTML to JSX
  - Output: the standard versions open the result in a new editor (with multiple selections, joined with the document's line ending), and the (Replace) versions replace each selection (only those that change, in one edit). Empty selections are skipped, and selections of only spaces, tabs and line breaks are skipped too except by the string literal and escaping commands. A selection can be up to 1,000,000 characters; if any selection fails, nothing is changed or shown and the message names the selection, and a run whose results would exceed 10,000,000 characters is refused with a warning (see README for limitations). Text conversion only: no SQL, shell or curl command is run, no file is read, no network access and no new dependencies; the existing Programmatic commands are unchanged
- 🐛 Pluralize / Singularize: keep acronyms ending with S (`DNS`, `HTTPS`, `iOS`) unchanged while still singularizing acronym plurals such as `DTOs` -> `DTO`, keep already plural words (`users`, `IDs`) and known file extensions (`file.ts`) unchanged, and use an upper-case suffix in all-caps identifiers (`USER_ID` -> `USER_IDS`)
- 🐛 JSON Keys to Camel / Snake / Kebab / Pascal: shorten each key shown in the key collision notification to 60 characters (with `…`) so that huge keys no longer produce a huge notification
- 🐛 Line commands that ask for input (both the replacing and the Clipboard versions): read the selections and their text after the input box closes, so that an edit made to the document while the input box is shown (by a formatter, a reload or another extension) no longer makes the command replace or copy an outdated range or outdated text; if no non-empty selection is left, nothing is done
- 🐛 Encode / Decode (ENC): the encoders that convert the text to UTF-8 bytes (Base64URL, Base32, Base58, Hex (also Replace), Binary, Quoted-Printable, Ascii85, Gzip Base64, Form, Base64 (Each Line) and Data URI) now reject a selection containing a lone surrogate with an error and change nothing, instead of silently replacing it with `�` (U+FFFD), like Unescape Unicode already does
- 🐛 Format SQL (also Replace): keep a line that starts with `#` or `--` in the input on a line of its own instead of moving it to the end of the previous line (`SELECT a⏎# note⏎FROM t` -> `SELECT a⏎  # note⏎FROM t`); this also applies to SQL Server code that starts a line, such as a `#temp` name (`select a from⏎#t where x=1` -> `SELECT a⏎FROM⏎  #t where x=1`), while a `#` or `--` after code on the same line (`a # c`, `from#x`, `FROM #temp`) is unchanged

## [0.0.42] - 2026-09-08

- 🔒 Remove insecure features (`client-credentials-flow`, `geo-ip`, `whois`) and remove vulnerable dependencies (`axios`, `whois`)
- 🔒 Replace `eval` with a safe mathematical expression parser in `Calculate Mathematical Expression` and `Date Calculation`
- 🔒 Prevent XSS in HAR Webview with HTML escaping and Content Security Policy
- 🔒 Use cryptographically secure random number generator (`crypto.randomInt`) for password generation
- 🔒 Guard against Prototype Pollution in JSON `unflatten` and XML to JSON parsing
- 🔒 Improve AES encryption/decryption with random IV generation per encryption
- 🔒 Remediate all npm audit vulnerabilities (0 vulnerabilities)

## [0.0.41]
- Add `Text - Select Matches` command

## [0.0.40] - 2026-01-10

- ✨ Add Reverse String tools (Reverse characters in selection)
- ✨ Add Convert to Multi Selection with Interval (Select every Nth line)
- ✨ Add Split/Join Lines with Custom Delimiter

## [0.0.39] - 2025-01-07

- ✨ Add Shuffle Selection Character tool (Replace, Clipboard, New Tab)
- ✨ Add Diff Selection tool (Show difference between two selections)

## [0.0.38] - 2025-12-31

- ✨ Add Japanese Era Conversion Feature (AD <-> Wareki)
- ✨ Add Morse Code Feature (Text <-> Morse Code, Japanese Kana Support)

## [0.0.37] - 2025-12-30

- ✨ Add Date Conversion Feature (ISO 8601, Locale String, Timestamp)
- ✨ Add Date Conversion Output Modes (Standard, Replace, Clipboard)

## [0.0.36] - 2025-12-30

- 🐛 Fix ASCII Art alignment and remove extra empty lines
- 💄 Adjust ASCII Art character positioning
- ✨ Add 6 new ASCII Art characters (Daemon, Dragon, Stegosaurus, Turkey, Turtle, Elephant)

## [0.0.35] - 2025-12-29

- ✨ Add Enclose Text tools (Parentheses, Square/Curly/Angle Brackets)
- ✨ Add Japanese Enclose tools (「」, 『』, 【】, etc.)
- ✨ Add Mask with Asterisk tool

## [0.0.34] - 2025-12-28

- ✨ Add Extract Lines Length Range feature
- ✨ Add Multiple ASCII Art Support (Tux, Ghost, Meow, Pig, Face)

## [0.0.33] - 2025-12-27

- 🐛 Fix `package.json` command registration and menus

## [0.0.32] - 2025-12-27

- ✨ Add Unit Conversion tools (px <-> rem, kg <-> lb)
- ✨ Add Math tools (Hex <-> Decimal)
- ✨ Add Text Cleanup tools (Normalize Whitespace, Strip HTML Tags, Unsmart Quotes)
- ✨ Add Sort features (Sort by Line Length)
- ✨ Add Advanced Case tools (Smart Title Case, SpongeBob Case, Screaming Snake, Humanize, Slugify)
- ✨ Add Text Style tools (Remove Accents)
- ✨ Add CSV tools (CSV <-> Markdown Table)
- ✨ Add Data Structure tools (Env to JSON)
- ✨ Add JSON tools (Flatten, Unflatten)
- ✨ Add XML tools (XML to JSON)
- ✨ Add URL tools (URL Params to JSON)
- ✨ Add Text Cleanup tools (Remove Empty Lines, Remove Line Numbers, Join Lines, Split Lines, Trim Lines)
- ✨ Add Math Statistics tools (Sum, Average, Min, Max)
- ✨ Add Random Generators (Password, IPv4, IPv6, Lorem Ipsum)
- ✨ Add Quote Enclosure tools (Single, Double, Backtick)
- ✨ Add Markdown Link tool
- ✨ Add Insert Date tools (ISO, Locale, Timestamp)
- ✨ Add Text Cleanup tools (Trim Trailing Whitespace, Remove Duplicate Lines)

## [0.0.31] - 2025-12-26

- ✨ Add Extract Lines by Length (Equal, Less, Greater)
- 🐛 Fix README and package.json description

## [0.0.30] - 2025-12-26

- 🐛 Fix Half-width Katakana conversion
- 💄 Suppress "Save changes?" confirmation for result tabs
- 💄 Ensure result tabs persist (disable preview mode)

## [0.0.29] - 2025-12-26

- ✨ Add ASCII Art (Cowsay) generation
- ✨ Enhance full-width to half-width conversion to support Kana

## [0.0.28] - 2025-12-25

- ✨ Add SHA1, SHA256, SHA512, MD5 Hash generation (with Replace option)
- ✨ Add Email, URL, IP Extraction tools (with Replace option)
- ✨ Add Japanese Text Conversion (Full/Half width, Hiragana/Katakana)
- ✨ Add Programmatic Tools (JSON<->YAML, Hex<->RGB, Toggle Quotes)

## [0.0.27] - 2025-12-24

- ✨ Add Random UUID generation
- ✨ Add Text Escape and Unescape tools (JSON style)

## [0.0.24] - 2025-04-20

- ✨ Add tool to copy to clipboard instead of open other document

## [0.0.23] - 2025-03-02

- ✨ Add tool to sort line by occurrence

## [0.0.22] - 2025-01-19

- ✨ Add tool to encrypt or decrypt by AES

## [0.0.21] - 2024-10-09

- 💄 no header or no footer accepted for decoding X509 Certification

## [0.0.20] - 2024-10-09

- ✨ Add tool to get token with Client Credentials Flow

## [0.0.19] - 2024-08-21

- ✨ Add tool to replace mode for json, xml and base64

## [0.0.18] - 2024-07-08

- ✨ Add tool to extract lines in selection

## [0.0.17] - 2024-07-07

- ✨ Add tool to sort line (not selection)

## [0.0.16] - 2024-07-05

- ✨ Add tool for IP Geolocation lookup

## [0.0.15] - 2024-01-21

- ✨ Add tool to remove one character from each side

## [0.0.14] - 2024-01-20

- ✨ Add tool to remove cursor above or below

## [0.0.13] - 2024-01-13

- ✨ Add tool to decode X509 Certification
- ✨ Add tool to create Hash
- ✨ Add tool to create HMAC

## [0.0.12] - 2024-01-09

- 🎨 Adjust second timestamp to millisecond timestamp

## [0.0.11] - 2024-01-07

- ✨ Add tool to transform HAR to Sequence Diagram

## [0.0.10] - 2024-01-05

- ✨ Add tool for DNS Lookup

## [0.0.9] - 2023-12-30

- ⚡️ Bundling Extensions

## [0.0.8] - 2023-12-30

- ✨ Add tools for WHOIS

## [0.0.7] - 2023-12-27

- ✨ Add tools for URL
- ✨ Add tool to decode JWT
- ✨ Add tool to decode SAML Request / Response

## [0.0.6] - 2023-12-26

- 💄 Commands that cannot be used in multiple selection mode are now hidden
- 💄 In base64, only single selection is allowed

## [0.0.5] - 2023-12-25

- 🐛 Fix Case tools to work
- ✨ Add tool to show command list at command pallet
- ✨ Add tools for DNS
- 💄 Change zero padding behavior to replace
- 💄 Open a new document in the beside column only when the first column is operated
- 💄 Change regex title decoration
- 💄 Change calculation output format

## [0.0.4] - 2023-12-23

- 💥 Remove select others tools (instead use ⇧⌘L)
- ✨ Add xml format tools
- ✨ Add tool converting multi selections from single selection
- ✨ Add tool extracting lines exclude blank rows
- ✨ Add tool to count up and make list
- ✨ Add zero padding tool
- ✨ Add add tools for increment from and decrement to
- ✨ Add add tools for increment by and decrement by
- ✨ Add add tools for case change
- 🎨 Change output format for date calculation

## [0.0.3] - 2023-12-20

- ✨ Add base64 tools
- ✨ Add regex check tool
- 💄 Change to open editor beside
- 💄 Change application name

## [0.0.2] - 2023-12-18

- ✨ Add transformer for JSON

## [0.0.1] - 2023-12-17

- 🎉 Initial release
