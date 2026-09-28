# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

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
- 🐛 Pluralize / Singularize: keep acronyms ending with S (`DNS`, `HTTPS`, `iOS`) unchanged while still singularizing acronym plurals such as `DTOs` -> `DTO`, keep already plural words (`users`, `IDs`) and known file extensions (`file.ts`) unchanged, and use an upper-case suffix in all-caps identifiers (`USER_ID` -> `USER_IDS`)
- 🐛 JSON Keys to Camel / Snake / Kebab / Pascal: shorten each key shown in the key collision notification to 60 characters (with `…`) so that huge keys no longer produce a huge notification
- 🐛 Line commands that ask for input (both the replacing and the Clipboard versions): read the selections and their text after the input box closes, so that an edit made to the document while the input box is shown (by a formatter, a reload or another extension) no longer makes the command replace or copy an outdated range or outdated text; if no non-empty selection is left, nothing is done

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
