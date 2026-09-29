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
  - Random values: Integer in Range (safe integers, up to 2^48 − 1 values), Float in Range (0 to 10 decimal places, computed without floating-point arithmetic: `0.1..0.3` gives exactly `0.100` to `0.300`, never `-0.000`), Date in Range (0001-01-01 to 9999-12-31), Boolean, Dice Roll (`NdM` from the selection, or asked once for empty cursors: `2d6` -> `7 (3+4)`), Pick One Line and Pick N Lines (without repeats, in random order; the warning `Select the lines to pick from.` when nothing is selected), MAC Address (unicast, locally administered) and Hex Color
  - Dummy data from small built-in lists: Dummy Email (`example.com` only), Dummy Name, Dummy Japanese Name (`佐藤 花子`), Dummy Phone Number (JP) (`090-0xxx-xxxx`; not guaranteed to be unassigned) and Japanese Dummy Text (1 to 1,000 sentences, picked independently)
  - Sequences in document order for multiple cursors: Alphabet (`a` … `z`, `aa`), Roman Numeral (up to 3,999), Date (from today by default), Hex (keeps the `0x` prefix, the width and the case), Kana (Gojūon 46 / Iroha 47, chosen with a quick pick), Circled Number (up to 50) and IPv4 (from `192.0.2.1` by default); more cursors than values is an error, and nothing wraps around
  - Generators: Number Range (`1..10 step 3` -> `1⏎4⏎7⏎10`, integers only, up to 100,000 numbers), Repeat Character to Width (1 to 16 characters with spaces kept, up to 10,000 characters) and Column Ruler (up to 1,000 columns)
  - All random values come from `crypto` (`randomBytes`, `randomInt`, `randomUUID`; no `Math.random`). Each selection and cursor gets its own value in one edit; a command that asks for input asks only once and does nothing if cancelled; if anything is invalid, nothing is changed and an error is shown. Up to 100,000 selections and cursors, a read selection of up to 1,000,000 characters, and a run whose results would exceed 10,000,000 characters is refused with a warning (see README for limitations). No new dependencies; the existing Random commands (UUID, Password, IPv4, IPv6, Lorem Ipsum) are unchanged
- 🐛 Pluralize / Singularize: keep acronyms ending with S (`DNS`, `HTTPS`, `iOS`) unchanged while still singularizing acronym plurals such as `DTOs` -> `DTO`, keep already plural words (`users`, `IDs`) and known file extensions (`file.ts`) unchanged, and use an upper-case suffix in all-caps identifiers (`USER_ID` -> `USER_IDS`)
- 🐛 JSON Keys to Camel / Snake / Kebab / Pascal: shorten each key shown in the key collision notification to 60 characters (with `…`) so that huge keys no longer produce a huge notification
- 🐛 Line commands that ask for input (both the replacing and the Clipboard versions): read the selections and their text after the input box closes, so that an edit made to the document while the input box is shown (by a formatter, a reload or another extension) no longer makes the command replace or copy an outdated range or outdated text; if no non-empty selection is left, nothing is done
- 🐛 Encode / Decode (ENC): the encoders that convert the text to UTF-8 bytes (Base64URL, Base32, Base58, Hex (also Replace), Binary, Quoted-Printable, Ascii85, Gzip Base64, Form, Base64 (Each Line) and Data URI) now reject a selection containing a lone surrogate with an error and change nothing, instead of silently replacing it with `�` (U+FFFD), like Unescape Unicode already does

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
