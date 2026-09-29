# Selection Manipulator

**The Ultimate Text Processing Toolkit for VS Code**

Selection Manipulator offers over **250 powerful tools** to manipulate, transform, and analyze text directly in your editor. From everyday tasks like sorting and JSON formatting to advanced cryptography, network analysis, and Japanese text conversion, this extension supercharges your workflow.

## ✨ Features

### 📝 Text Manipulation
*   **Sort**: Organize lines or selections by string, number, occurrence, or length (Ascending/Descending), and by natural order, ignoring case, locale, kana order, a column, a regex capture, date, semantic version, IP address, hex number, word count, last word or reversed string; sort and remove duplicates, sort paragraphs, or sort lines keeping their indented children (several with a Clipboard version).
*   **Unique**: Instantly remove duplicate lines.
*   **Extract**: Filter and extract matching text, lines, emails, URLs, IPs, or lines by length (equal/less/greater) to a new tab or clipboard.
*   **Edit**: Reverse text, shuffle content (lines or characters), remove cursors, separate multi-selections, remove characters from edges, mask text.
*   **Insert**: Date (ISO, Locale, Timestamp, Era), Markdown Link, Enclosed Text (Quotes, Brackets, Japanese Symbols).
*   **Enclose**: Enclose with a custom prefix/suffix or HTML tag, quote each line or word, build SQL IN lists and array literals, triple/smart quotes, guillemets, escaped double quotes, Japanese brackets, HTML/block comments, `${}` / `{{ }}` / `%%` placeholders, ASCII box, Markdown code span with an automatic fence, add lines before/after, unquote each line, cycle or remove outer brackets.
*   **Convert Date**: Convert between ISO 8601, Locale String, and Timestamp (Seconds/Milliseconds), AD <-> Wareki.
*   **Morse Code**: Convert text to Morse Code (Alphanumeric/Japanese Kana) and vice versa.
*   **Format**: Remove blank rows, zero-pad numbers, and more.
*   **Cleanup**: Remove empty lines, line numbers, join/split lines, trim lines (Start/End/All), normalize whitespace, strip HTML, unsmart quotes, remove duplicate lines.
*   **Whitespace**: Convert leading tabs/spaces, re-indent (2 <-> 4), dedent, indent/outdent by N, expand/unexpand tabs, collapse or remove blank lines, unwrap paragraphs, hard wrap, visualize spaces and tabs, center/right align, align by `=` / `:` / `,` / a custom delimiter, add spaces around operators.
*   **Line**: Keep/remove lines containing text or matching a regex, keep every Nth / odd / even / first N / last N lines, keep duplicated or unique lines, remove duplicates (ignore case/whitespace, adjacent), add line numbers, reverse words, rotate/swap/interleave lines, join backslash-continued lines, join every N lines, split sentences or fixed-width lines, remove comment lines, extract lines between markers or the longest/shortest line, count lines/words/characters (several with a Clipboard version).
*   **Advanced Case**: Smart Title Case, APA Title Case, SpongeBob Case, Screaming Snake, Humanize, Slugify, Remove Accents, Swap Case, Sentence Case per sentence, Locale-aware Upper/Lower, Pluralize/Singularize, Detect/Cycle naming style.
*   **Math**: Sum, Average, Min, Max, Hex <-> Decimal, Date Calculation.
*   **Unit Conversion**: px <-> rem, kg <-> lb.
*   **CSV**: Convert between CSV and Markdown Table.

### 💻 Developer Utilities
*   **JSON & XML**: Format (Pretty Print), Minify, Stringify, Parse, Flatten/Unflatten JSON, XML<->JSON.
*   **Encoding**: Base64 Encode/Decode/Deflate/Inflate.
*   **Encode / Decode**: HTML entities (named and numeric), Unicode escapes (`\uXXXX` / `\u{...}`), Base64URL, Base32, Base58, Ascii85, Base64 per line, Gzip/Gunzip Base64, Data URI, Hex and binary UTF-8 bytes, Punycode (IDN), Quoted-Printable, form encoding (`x-www-form-urlencoded`), ROT13/ROT47/Caesar/Atbash, NATO phonetic alphabet.
*   **Case Conversion**: Switch between Camel, Snake, Kebab, Pascal, Constant, Dot, Path, Sentence, Title, Cobol, Ada, Flat, Camel_Snake, Pascal_Snake, CSS Custom Property, BEM and Hashtag cases. Convert only the keys of a JSON document (Camel/Snake/Kebab/Pascal).
*   **Escaping**: Escape/Unescape text (JSON stringify/parse compatibility).
*   **Programmatic**: Convert between JSON<->YAML, Hex<->RGB, Toggle quotes, Env file to JSON.
*   **Data Format**: Convert JSON to and from TOML, INI, .properties, JSON Lines and JS object literals, JSONC / JSON5 to JSON, and JSON to Query String, Env and XML; sort, merge, validate, count and clean up JSON, extract values by path, pluck and group arrays, generate a JSON Schema, format and sort YAML, and parse Cookie, Set-Cookie, HTTP headers and User-Agent strings to JSON.

### 🔐 Cryptography & Security
*   **Hashing**: Generate MD5, SHA-1, SHA-224, SHA-256, SHA-384, SHA-512, SHA-512/256, SHA3-256, SHA3-512, BLAKE2b-512 and BLAKE2s-256 hashes, SHA-256 per line, SHA-256 as Base64 (CSP) and SRI (`sha384-…`) values.
*   **HMAC**: Create HMAC-SHA256, HMAC-SHA512, HMAC-MD5, HMAC-SHA1 (for compatibility only), HMAC-SHA384 and HMAC-SHA3-256 signatures.
*   **Checksum**: CRC-32, Adler-32 and FNV-1a 32-bit (error detection, not tamper detection), Luhn check digit validation.
*   **Encryption**: Securely Encrypt and Decrypt text using AES.
*   **Decoders**: Decode JWT, SAML Request/Response, and X.509 Certificates.

### 🌐 Network & Analysis
*   **URL**: Parse URL to JSON, Parse URL Parameters to JSON.
*   **DNS**: Perform comprehensive DNS lookups (A, AAAA, MX, NS, TXT, etc.).
*   **HAR Visualization**: Visualize HTTP Archive (HAR) logs as Mermaid Sequence Diagrams.

### 🇯🇵 Japanese Text Support
*   **Width Conversion**: Convert between Full-width and Half-width characters (including Katakana).
*   **Kana Conversion**: Convert between Hiragana and Katakana.

### 🎨 Fun & Generators
*   **Mock Data**: Generate Random UUIDs, Passwords, IPv4, IPv6, Lorem Ipsum.
*   **ASCII Art**: Generate "Cowsay" speech bubbles.
*   **Math**: Evaluate expressions, calculate Sum/Average/Min/Max.

## 🚀 Key Usage

1.  **Select** the text you want to process.
2.  Open **Command Palette** (`Cmd+Shift+P` / `Ctrl+Shift+P`).
3.  Type `Selection Manipulator` to explore all commands.
4.  (Or right-click and use the context menu).

> **Pro Tip**: Commands that generate output in a new tab (e.g., Base64 Encode) now open a **Read-Only** tab. This prevents the "Save changes?" prompt when closing the tab. These tabs persist until manually closed.

## Usage Guide

This document provides a comprehensive list of features available in **Selection Manipulator**, along with examples of their usage.
Many commands come in two variables:
1.  **Standard**: Opens the result in a new tab.
2.  **Replace**: Replaces the selected text directly.

### 1. Text Modification

#### Remove Cursor / Characters
*   **Remove Cursor Above/Below**: Helps align multi-cursor selections.
*   **Remove Character from Each Side**: Trims one character from both start and end of selection.
*   **Convert to Multi Selection**: Splits a multi-line selection into individual cursors (one per line). Supports interval (every Nth line).
*   **Select Matches**: Select all occurrences of a specific string within the current selection(s).

#### Edit & Enclose
*   **Reverse Selections**: Reverses the order of characters in the selection.
*   **Reverse String**: Reverses the characters within the selection (e.g., `abc` -> `cba`).
*   **Mask with Asterisk**: Masks the selected text with asterisks (`*`) (e.g., `pass` -> `****`).
*   **Toggle Quotes**: Toggles between single (`'`) and double (`"`) quotes.
*   **Enclose Text**: Wrap text with:
    *   **Quotes**: `'Single'`, `"Double"`, `` `Backtick` ``
    *   **Brackets**: `(Paren)`, `[Square]`, `{Curly}`, `<Angle>`
    *   **Japanese**: `「Single」`, `『Double』`, `【Bracket】`, `＜Angle＞`, `（Paren）`, `［Square］`, `｛Curly｝`

#### Extended Enclose & Quote Commands
These commands replace each selection in place. With multiple selections, each selection is processed on its own, and a command that asks for input asks only once. They are added to the **Enclose** submenu of the context menu, after the existing Enclose / Quote commands.
In the examples, `·` is a space and `⏎` is a line break. A value in parentheses is the value you enter.

*   **Enclose the whole selection** (like the existing Enclose / Quote commands, an empty selection gets the pair inserted at the cursor):
    *   **Enclose: Custom (Prefix / Suffix)**: Asks for a prefix and then a suffix: `abc` (`<<`, `>>`) -> `<<abc>>`. If both are empty, nothing is changed.
    *   **Quote: Triple Double (""" """)**: `abc` -> `"""abc"""`.
    *   **Quote: Guillemets («»)**, **Smart Double (“”)**, **Smart Single (‘’)**: `abc` -> `«abc»`, `“abc”`, `‘abc’`.
    *   **Quote: Double with Escaping**: Escapes `\` as `\\` and `"` as `\"`, then adds double quotes: `say "hi"` -> `"say \"hi\""`. Line breaks are not escaped.
    *   **Enclose: Japanese White Lenticular (〖〗) / Tortoise Shell (〔〕) / Double Angle (《》) / Single Angle (〈〉) Bracket**: `注意` -> `〖注意〗`, `注` -> `〔注〕`, `書名` -> `《書名》`, `論文` -> `〈論文〉`.
    *   **Enclose: HTML Tag (Custom)**: Asks for a tag name (1-64 letters, digits and hyphens): `abc` (`b`) -> `<b>abc</b>`.
    *   **Enclose: HTML Comment**: `abc` -> `<!--·abc·-->`. **Block Comment (/\* \*/)**: `abc` -> `/*·abc·*/`.
    *   **Enclose: Placeholder (${})**: `name` -> `${name}`. **Mustache ({{ }})**: `name` -> `{{·name·}}`. **Percent (%%)**: `PATH` -> `%PATH%`. **Pipes (||)**: `abc` -> `|abc|`.
    *   **Enclose: Backtick Code (Auto Fence)**: Encloses the text in one more backtick than the longest run of backticks inside, so the result is a valid Markdown code span: `` a`b `` -> ``` ``a`b`` ```. A space is added on both sides when the text starts or ends with a backtick (`` `a `` -> ``` ``·`a·`` ```), or when it starts and ends with a space or line break and is not only spaces (`·a·` -> `` `··a··` ``), as CommonMark removes one such space.
*   **Process the lines, words or brackets of the selection** (an empty selection is not changed, and no input box is shown):
    *   **Enclose Each Line: Custom**: Asks for a prefix and then a suffix: `a⏎b` (`[`, `]`) -> `[a]⏎[b]`. If both are empty, nothing is changed.
    *   **Quote Each Line: Double ("") / Single ('')**: `a⏎b` -> `"a"⏎"b"` / `'a'⏎'b'`.
    *   **Quote Each Word: Double ("")**, **Enclose Each Word: Parentheses (())**: Every run of non-whitespace characters is a word; the whitespace and line breaks between the words are kept: `a·b` -> `"a"·"b"` / `(a)·(b)`.
    *   **Quote: SQL IN List**: Quotes each line in single quotes (an inner `'` becomes `''`) and joins them with `, ` in parentheses on one line: `a⏎O'Neil` -> `('a', 'O''Neil')`.
    *   **Quote: Array Literal**: Quotes each line in double quotes (an inner `\` becomes `\\` and `"` becomes `\"`) and joins them with `, ` in square brackets on one line: `a⏎b` -> `["a", "b"]`.
    *   **Unquote Each Line**: Removes one pair of matching quotes (`"` `'` `` ` ``) around the text of each line: `"a"⏎'b'` -> `a⏎b`. Whitespace before and after the quotes is kept (`··"a"` -> `··a`).
    *   **Enclose: ASCII Box**: Draws a box as wide as the longest line: `abc` -> `+-----+⏎|·abc·|⏎+-----+`. Shorter lines are padded with spaces.
    *   **Enclose: Lines Block (Before / After Lines)**: Asks for a line to insert before and then a line to insert after the selection: `a⏎b` (`BEGIN`, `END`) -> `BEGIN⏎a⏎b⏎END`. If the selection ends with a line break (for example a selection of whole lines), the after line is added after that line break and followed by another one, so the next line is not joined: `a⏎b⏎` -> `BEGIN⏎a⏎b⏎END⏎`. Either line may be empty (an empty line is inserted).
    *   **Enclose: Cycle Brackets**: Changes the outer brackets `()` -> `[]` -> `{}` -> `()`: `(a)` -> `[a]`.
    *   **Enclose: Remove Matching Outer Brackets**: Removes the outer pair only: `((a))` -> `(a)`. Handles `()` `[]` `{}` `<>` and `「」` `『』` `【】` `（）` `［］` `｛｝` `＜＞` `〔〕` `〖〗` `《》` `〈〉`.
*   Line-wise commands (Enclose Each Line, Quote Each Line, Unquote Each Line, ASCII Box) do not count one trailing line break of a selection as a line and keep it, and join the lines with the document's line ending (LF or CRLF).

> **Limitations of the extended enclose & quote commands**
> *   **Empty and blank lines**: Enclose Each Line and Quote Each Line leave empty lines as they are but enclose lines that contain only whitespace (`a⏎⏎··` -> `"a"⏎⏎"··"`). SQL IN List and Array Literal skip empty and whitespace-only lines, use the other lines as they are (leading and trailing spaces are not trimmed: `·a` -> `('·a')`), keep one trailing line break of the selection after the list, and change nothing if every line is blank.
> *   **Unquote Each Line**: Only straight quotes are removed (not `“”` or `‘’`), only when the same quote character is at both ends of the trimmed line text (`"a'` and a lone `"` are not changed), and only one pair (`""a""` -> `"a"`).
> *   **ASCII Box**: The width is counted in code points. Full-width characters, emoji and tabs count as one column, so the box is not aligned when they are displayed wider.
> *   **HTML Tag**: Attributes are not supported (`b onclick=x` is rejected), and the selected text is not HTML-escaped (`<script>` becomes `<b><script></b>`).
> *   **HTML Comment / Block Comment**: A `-->` or `*/` inside the selection is not changed, so the comment can end early.
> *   **Cycle Brackets / Remove Matching Outer Brackets**: The text must start with an opening bracket and end with the matching closing bracket (no surrounding spaces). Only brackets of the same kind are counted to find the match, and brackets inside quotes are counted too. Text where the first bracket closes before the end (`(a)(b)`) is not changed, while a mix of kinds such as `(a])` is treated as enclosed. Cycle Brackets handles only `()`, `[]` and `{}`.
> *   **Input**: Prefixes, suffixes and the before / after lines can be 0-1,000 characters without line breaks; tag names 1-64 characters. If you cancel an input box, nothing is changed. The selections are read again after the input boxes close, so an edit made while an input box is shown does not make the command change an outdated range.
> *   **Output size**: A run that would add more than 10,000,000 characters in total (shared by all selections, for example a long prefix on many lines or an ASCII Box around many lines of different lengths) is refused with a warning and leaves the text unchanged.

#### Format & Insert
*   **Zero Padding**: Pads numbers with leading zeros (e.g., `1` -> `001`).
*   **Markdown Link**: Creates a Markdown link from selection and clipboard URL.
*   **Insert Date**: Inserts ISO 8601, Locale String, or Unix Timestamp.

### 2. Text Cleanup
Comprehensive tools to clean up and normalize code or text.
*   **Remove Empty Lines**: Removes lines containing only whitespace.
*   **Remove Line Numbers**: Removes leading numbering (e.g., `1.`, `[1]`, `1)`).
*   **Trim Lines**: Trim Start, End, or All whitespace.
*   **Join / Split Lines**: Join lines with space/comma, or split text by space/comma.
*   **Normalize Whitespace**: Replaces multiple spaces with a single space (`a   b` -> `a b`).
*   **Strip HTML Tags**: Removes HTML tags, keeping inner text (`<b>bold</b>` -> `bold`).
*   **Unsmart Quotes**: Converts smart quotes (`“`, `”`) to straight quotes (`"`).
*   **Remove Duplicate Lines**: Keeps only the first occurrence of identical lines.
*   **Split/Join Lines (Custom)**: Split or join text using a custom delimiter.

#### Whitespace Commands
All whitespace commands replace each selection in place. With multiple selections, each selection is processed on its own. They are also grouped in the **Whitespace** submenu at the end of the Selection Manipulator context menu.
In the examples, `·` is a space, `⇥` is a tab and `⏎` is a line break (except where noted for Visualize / Restore).

*   **Indentation**:
    *   **Leading Tabs to Spaces (2) / (4)**: `⇥foo` -> `····foo` (4). Only tabs at the start of a line are converted.
    *   **Leading Spaces to Tabs (2) / (4)**: `····foo` -> `⇥foo` (4). Leftover spaces that do not fill a tab are kept (`······foo` -> `⇥··foo`).
    *   **Re-indent 2 to 4 / 4 to 2 Spaces**: `··a⏎····b` -> `····a⏎········b`. Leftover spaces are kept.
    *   **Remove Common Indent (Dedent)**: `····a⏎······b` -> `a⏎··b`. Whitespace-only lines are ignored when finding the common indent; a space and a tab are not treated as the same.
    *   **Trim Leading Whitespace**: `··a··⏎·b` -> `a··⏎b`.
    *   **Indent / Outdent Lines by N Spaces**: Asks for N (1-100, default `4`) once, then applies it to every selection: `a⏎b` (N=3) -> `···a⏎···b`, `····a⏎·b` (N=2) -> `··a⏎b`.
    *   **Expand All Tabs / Unexpand Spaces to Tabs (Tab Stops)**: Uses tab stops of 4, including tabs inside a line: `a⇥b` <-> `a···b`.
*   **Blank Lines & Line Breaks**:
    *   **Collapse Consecutive Blank Lines**: `a⏎⏎⏎⏎b` -> `a⏎⏎b` (whitespace-only lines count as blank).
    *   **Insert Blank Line Between Lines**: `a⏎b` -> `a⏎⏎b`.
    *   **Remove Trailing / Leading Blank Lines**: `a⏎b⏎⏎⏎` -> `a⏎b`, `⏎⏎a⏎b` -> `a⏎b`.
    *   **Clear Whitespace-only Lines**: `a⏎··⏎b` -> `a⏎⏎b`.
    *   **Unwrap Paragraphs**: `a⏎b⏎⏎c⏎d` -> `a b⏎⏎c d` (blank lines between paragraphs are kept).
    *   **Hard Wrap at 80 / N Columns**: Wraps at word boundaries. The N version asks for N (1-1000, default `80`) once: `aa bb cc` (N=5) -> `aa bb⏎cc`.
*   **Spaces Inside Lines**:
    *   **Remove All Whitespace**: `a·b⇥c⏎d` -> `abcd`.
    *   **Collapse Inline Spaces (Keep Indent)**: `··a···b` -> `··a b`.
    *   **Special Spaces to Normal Space**: `a{U+00A0}b` -> `a·b` (NBSP, thin space and similar spaces).
    *   **Add Spaces Around Operators**: `a=b+c` -> `a = b + c`. Strings, template literals and comments are not changed.
    *   **Remove Space Before Punctuation**: `hello , world !` -> `hello, world!` (`,` `.` `!` `?` `;` `:`).
    *   **Ensure Space After Comma**: `a,b,c` -> `a, b, c`.
*   **Visualize**:
    *   **Visualize Spaces and Tabs**: Replaces a space with `·` (U+00B7) and a tab with `→` (U+2192): `a·b⇥c` -> `a·b→c` (the `·` and `→` in the output are the real characters).
    *   **Restore Visualized Spaces and Tabs**: The reverse: `a·b→c` -> `a·b⇥c` (the `·` and `→` in the input are the real characters U+00B7 and U+2192).
*   **Alignment**:
    *   **Center Align / Right Align Lines**: Pads each line with leading spaces based on the longest line: `a⏎abc` -> `·a⏎abc` / `··a⏎abc`.
    *   **Pad Lines to Same Length**: `a⏎abc` -> `a··⏎abc`.
    *   **Align by Equals Sign (=)**: `a = 1⏎bbb = 2` -> `a···= 1⏎bbb = 2`.
    *   **Align by Colon (:)**: `a: 1⏎bbb: 2` -> `a:···1⏎bbb: 2`.
    *   **Align Columns by ","**: `a,bb,c⏎ccc,d,e` -> `a,··bb,c⏎ccc,d,·e`.
    *   **Align by Custom Delimiter**: Asks for a delimiter once: `a => 1⏎bb => 2` (`=>`) -> `a··=> 1⏎bb·=> 2`.

> **Limitations of the whitespace commands**
> *   **Line breaks**: Line-based commands keep one line break at the end of the selection and insert line breaks with the document's line ending (LF or CRLF).
> *   **Width**: Widths are counted in code points. A full-width character (such as Japanese), an emoji or a combining character counts as one column, and a tab counts as one column except in Expand / Unexpand Tabs. So text with Japanese characters or tabs does not look aligned after the alignment and hard wrap commands.
> *   **Alignment is per selection**: Center / Right Align, Pad Lines and the Align commands align the lines inside each selection. Select all the lines as one selection; one cursor per line does not align them.
> *   **Output size limit**: Center / Right Align, Pad Lines, the Align commands and Indent Lines by N stop if one run would add more than 10,000,000 characters in total (counted over all selections), for example Pad Lines on a selection with a very long minified line. Nothing is changed and a warning is shown. If any selection fails, no selection is changed.
> *   **U+FEFF (BOM)**: It is not treated as whitespace, except by Remove All Whitespace, which removes it. A BOM at the start of a line is kept by Trim Leading Whitespace, and a line with only a BOM is not a blank line.
> *   **Special Spaces to Normal Space**: Converts U+00A0, U+1680, U+2000-U+200A, U+202F and U+205F. The ideographic space (U+3000), the zero-width space (U+200B) and U+FEFF are not converted.
> *   **Visualize / Restore**: Restore also turns `·` and `→` that were in the text before visualizing into spaces and tabs, so a round trip is not always lossless.
> *   **Unwrap Paragraphs**: Lines in a paragraph are joined with one space, also in Japanese text. The indent of the first line is kept.
> *   **Hard Wrap**: A word longer than the width is not split. Wrapped lines get the indent of the original line. A line longer than the width is refilled word by word, so runs of spaces inside it (such as the spaces before an aligned comment) become one space. Lines within the width are not changed.
> *   **Indent / Outdent / Unexpand**: Indent Lines by N does not add spaces to whitespace-only lines. Outdent Lines by N stops at a tab. Unexpand never turns a single space between words into a tab.
> *   **Align by Equals Sign**: Lines are aligned at the start of the operator that contains the first `=`, and operators such as `+=`, `!=`, `<=`, `==` and `=>` are not split. So `a = 1⏎bb += 2` becomes `a··= 1⏎bb += 2` (the `=` and the `+` are in the same column). The right side is not changed: `a=1⏎bb = 2` -> `a··=1⏎bb = 2`.
> *   **Align by Colon**: The `:` in `::` is not a delimiter. Lines with a URL (`http://...`) or a ternary operator may be aligned at an unexpected `:`. A `key:` line with an empty value gets no trailing spaces.
> *   **Align Columns by ","**: Commas inside quoted CSV fields are not recognized. The width of a column is decided only by the cells that are not the last cell of their line. Empty cells at the end of a line (`a,b,`) are not padded, so no trailing spaces are added.
> *   **Align by Equals / Colon / Comma / Custom Delimiter**: A line with nothing (or only whitespace) before the delimiter is left unchanged and is not used for the width.
> *   **Align by Custom Delimiter**: The delimiter is literal text (not a regular expression) of 1-100 characters, without line breaks and not only whitespace. With `=`, `a += 1` can become `a + = 1`, so use Align by Equals Sign for code.
> *   **Add Spaces Around Operators**: This is not a full parser; it assumes C-like or JavaScript-like code.
>     *   Target operators: `===` `!==` `**=` `==` `!=` `<=` `>=` `+=` `-=` `*=` `/=` `%=` `=>` `&&` `||` `**` `=` `+` `-` `*` `/` `%`. Other operators such as `<`, `>`, `++`, `--`, `->`, `::`, `?`, `:`, `&`, `|`, `^`, `<<=` and `??=` are not changed (and not split).
>     *   `+`, `-`, `*` and `**` are treated as unary (not changed) at the start of a line, after another operator or `(`, and after the keywords `return` `case` `typeof` `void` `delete` `throw` `yield` `await` `in` `of` `instanceof` `new` `else` `do` `function` (so `return -1` and `function* g()` are kept).
>     *   Strings, template literals (including nested `${...}`), `//` comments and `/* */` comments are not changed. Template literals and block comments that span lines are tracked only inside the selection.
>     *   Not recognized: regular expression literals (`/a+b/` -> `/ a + b /`), `#` comments, Python's `//` (treated as a comment) and keywords of other languages (such as Python's `not`). A `)` always ends a value, so `if (a) -b` -> `if (a) - b`. A property with the same name as a keyword is treated as the keyword (`obj.function*2` is not changed).
>     *   Whitespace at the end of a line after an operator is kept as it is.
> *   **Remove Space Before Punctuation**: Spaces at the start of a line (indentation such as `··.foo()`) and at the start of the selection are kept. It also changes code such as `a ? b : c` -> `a? b: c`.
> *   **Ensure Space After Comma**: Digit grouping is not recognized (`1,000` -> `1, 000`), and `a,,b` becomes `a, , b`.
> *   **Remove Trailing Blank Lines**: When the selection ends at the start of a line and more lines follow (a selection made with `Shift+Down`, `Cmd+L` / `Ctrl+L` or a triple click), one line break is kept so the next line is not joined. Only when the selection reaches the end of the document is the last line break removed too (`a⏎b⏎⏎⏎` -> `a⏎b`).
> *   **Remove Trailing / Leading Blank Lines**: If the selection starts in the middle of a line (for example at the end of `ab`), the start of the selection is treated as the rest of that line, not as a blank line, and one line break is kept so that line is not joined with the text after the selection (selecting from the end of `ab` to the start of `z` in `ab⏎⏎⏎z` gives `ab⏎z`). Likewise, if the selection starts at the start of a line and ends inside the indentation (leading whitespace) of a later line, Remove Trailing Blank Lines removes the blank lines and the selected whitespace but keeps one line break, so the text after the selection is not joined with the previous line (selecting from the start of `a` to just before `z` in `a⏎⏎··z` gives `a⏎z`). Only the selected whitespace is removed: if the selection ends partway through the indentation, the unselected part of it is kept (selecting from the start of `a` to the middle of the indentation in `a⏎⏎····z` gives `a⏎··z`). If the selected part of the last line contains any non-whitespace text, nothing is removed.

#### Line Commands
All line commands except Count Lines, Words and Characters and the (Clipboard) versions replace each selection in place. With multiple selections, each selection is processed on its own, and a command that asks for a value asks only once. Empty selections are ignored. They are also grouped in the **Line** submenu at the end of the Selection Manipulator context menu.
In the examples, `·` is a space, `⇥` is a tab and `⏎` is a line break. A value in parentheses is the value you enter.

*   **Filter**:
    *   **Keep / Remove Lines Containing Text**: `apple⏎banana⏎cherry` (`an`) -> `banana` / `apple⏎cherry`. The text is literal and case-sensitive.
    *   **Keep / Remove Lines Matching Regex**: `a1⏎b⏎c2` (`\d`) -> `a1⏎c2` / `b`. JavaScript syntax with the `u` flag, case-sensitive (see the limitations below).
    *   **Keep Every Nth Line / Remove Every Nth Line**: Keeps / removes the lines whose line number is a multiple of N (N: 1-1,000,000, default `2`): `a⏎b⏎c⏎d` (N=2) -> `b⏎d` / `a⏎c`.
    *   **Keep Odd Lines / Keep Even Lines**: `a⏎b⏎c` -> `a⏎c` / `b` (the first line is line 1).
    *   **Keep First N Lines / Keep Last N Lines**: N: 1-1,000,000, default `10`: `a⏎b⏎c` (N=2) -> `a⏎b` / `b⏎c`. Nothing changes if N is not less than the number of lines.
    *   **Remove Comment Lines**: Removes lines starting with `#` or `//` (leading whitespace is ignored): `# a⏎b⏎// c` -> `b`.
*   **Duplicates**:
    *   **Keep Only Duplicated Lines**: Keeps one copy of each line that appears two or more times, in the order of first appearance: `a⏎b⏎a⏎c⏎b` -> `a⏎b`.
    *   **Keep Lines Appearing Once**: `a⏎b⏎a` -> `b`.
    *   **Remove Duplicate Lines (Ignore Case)**: `Apple⏎apple⏎b` -> `Apple⏎b` (the first line is kept).
    *   **Remove Duplicate Lines (Ignore Whitespace)**: Ignores leading and trailing whitespace (not whitespace inside a line) and keeps the first line as it is: `a⏎··a⏎b` -> `a⏎b`.
    *   **Remove Adjacent Duplicate Lines**: Like `uniq`: `a⏎a⏎b⏎a` -> `a⏎b⏎a`.
    *   Blank lines are counted as normal lines.
*   **Numbering**:
    *   **Add Line Numbers**: `a⏎b` -> `1: a⏎2: b`.
    *   **Add Line Numbers (Zero Padded)**: Pads to the digit count of the number of lines, without a colon: 10 lines `a⏎…⏎j` -> `01 a⏎…⏎10 j`.
    *   Numbers start from 1 in each selection. Both formats can be removed with **Remove Line Numbers**.
*   **Reorder**:
    *   **Reverse Word Order in Each Line**: `a b c⏎d e` -> `c b a⏎e d`. The whitespace between words and at the start / end of a line stays in place: `··a·b⇥c` -> `··c·b⇥a`.
    *   **Rotate Lines Down**: `a⏎b⏎c` -> `c⏎a⏎b`.
    *   **Swap Adjacent Line Pairs**: `a⏎b⏎c⏎d⏎e` -> `b⏎a⏎d⏎c⏎e` (with an odd number of lines, the last line stays).
    *   **Move Lines Containing Text to Top**: `b⏎x1⏎c⏎x2` (`x`) -> `x1⏎x2⏎b⏎c` (both groups keep their order).
    *   **Interleave First and Second Half**: `a⏎b⏎1⏎2` -> `a⏎1⏎b⏎2`. With an odd number of lines, the first half is the larger one: `a⏎b⏎c⏎1⏎2` -> `a⏎1⏎b⏎2⏎c`.
    *   **Duplicate Each Line**: `a⏎b` -> `a⏎a⏎b⏎b`.
*   **Join & Split**:
    *   **Join Backslash-continued Lines**: `ls·\⏎··-l⏎pwd` -> `ls·-l⏎pwd` (see the rules below).
    *   **Join Every N Lines (Custom Delimiter)**: Asks for N (1-1,000,000, default `2`) and then a delimiter (literal text of 0-100 characters, default `,`; empty joins without a delimiter): `a⏎b⏎c⏎d` (N=2, `,`) -> `a,b⏎c,d`. The last group may have fewer than N lines.
    *   **Split Sentences into Lines**: `Hello. Bye!` -> `Hello.⏎Bye!`. Splits after `.` `!` `?` followed by whitespace, and after `。`. Closing quotes and brackets after the punctuation (`"` `'` `”` `’` `)` `]` `」` `』`) stay with the sentence, and the whitespace at the split is removed.
    *   **Split into Fixed-width Lines**: Asks for a width (1-1,000, default `80`): `abcdef` (N=2) -> `ab⏎cd⏎ef`. Each line is split on its own, counted in code points.
*   **Prefix / Suffix**:
    *   **Remove Prefix / Suffix from Each Line**: `- a⏎- b` (`- `) -> `a⏎b`, `a;⏎b;` (`;`) -> `a⏎b`. The text is removed once, only from lines that start / end with exactly that text (indentation and trailing spaces are not ignored).
*   **Extract**:
    *   **Extract Lines Between Markers**: Asks for a start marker and then an end marker: `x⏎BEGIN⏎a⏎END⏎y` (`BEGIN`, `END`) -> `a`. A marker line is a line that contains the marker, and the marker lines are not included. All blocks are extracted in order. The start and end markers may be the same text. A block without an end marker runs to the end of the selection. A selection without a start marker line is left unchanged; if no selection has one, `No lines were found between the markers` is shown.
    *   **Extract Longest Line / Extract Shortest Line**: `a⏎abc⏎ab` -> `abc`, `abc⏎a⏎ab` -> `a`. Counted in code points; on a tie the first line is taken. Extract Shortest Line skips blank and whitespace-only lines.
*   **Count**:
    *   **Count Lines, Words and Characters**: Shows the total of all selections in a notification and does not change the text: `a b⏎c` -> `2 lines, 3 words, 5 chars`. A trailing line break is not counted as a line, words are runs of non-whitespace characters, and characters are code points with each line break (including CRLF) counted as one. With several selections, ` (N selections)` is added.
*   **Clipboard versions**: Keep Lines Containing Text, Keep Lines Matching Regex, Keep Only Duplicated Lines, Keep Lines Appearing Once, Remove Adjacent Duplicate Lines and Extract Lines Between Markers also have a **(Clipboard)** version that copies the result to the clipboard instead of changing the editor (no notification on success).
    *   The results of the selections are joined with the document's line ending, without a line break at the end. Selections whose result is empty are skipped, and so are selections without a start marker line (Extract Lines Between Markers).
    *   If nothing is left, the clipboard is not changed and a notification is shown (`No lines to copy. The clipboard was not changed.`, or `No lines were found between the markers`).

> **Limitations of the line commands**
> *   **Line breaks**: A trailing line break of the selection is kept, and lines are joined with the document's line ending (LF or CRLF), so a selection with mixed line endings gets the document's line ending. Join Backslash-continued Lines is the exception (see below). If every line of the selection is removed, the result is empty and no line break is left.
> *   **Selections starting or ending in the middle of a line**: Commands that remove, reorder, number or extract lines (all commands in Filter, Duplicates, Numbering, Prefix / Suffix and Extract, and Rotate, Swap, Move to Top, Interleave and Duplicate Each Line) treat a partial first line (the selection starts after the start of a line) and a partial last line (the selection ends before the end of a line) as parts of lines outside the selection: they are left unchanged, are not counted, and one line break is kept next to them, so the text before or after the selection is never joined with another line. For example, selecting from `a` to just before `yy` in `xxa⏎b⏎cyy` and removing lines containing `b` gives `xxa⏎cyy`. So, for example, Extract Lines Between Markers does not see a marker that is only in a partial first or last line. When the selection has no full line (such as from the middle of `xxa` to the start of the next line), these commands change nothing. A selection within one line is treated as one line.
> *   **Commands that keep partial lines**: Reverse Word Order, Join Backslash-continued Lines, Join Every N Lines, Split Sentences and Split into Fixed-width Lines treat partial first and last lines as normal lines (the width of Split into Fixed-width Lines is counted from the start of the selection).
> *   **Clipboard versions**: They ignore where the selection starts and ends and treat the selected text as whole lines, so the result can differ from the replacing version. For example, selecting from `a` to the start of `next` in `xxa⏎q⏎next` and running Keep Lines Containing Text (`q`) leaves the editor unchanged, but the (Clipboard) version copies `q`.
> *   **Join Backslash-continued Lines**: A line is continued only if it ends with an odd number of backslashes; only the last one is removed (`a\⏎b` -> `ab`, `a\\\⏎b` -> `a\\b`), and an even number (`a\\⏎b`) is literal and not joined. A line with whitespace after the backslash is not continued. The spaces and tabs at the start of the next line are removed, the spaces before the backslash are kept, and no space is added. Continuations chain (`a·\⏎b·\⏎c` -> `a·b·c`). With CRLF, the character before `\r\n` is checked. The last line of the selection and the line before the trailing line break are not joined, because the next line is outside the selection. The line breaks that are not joined are kept as they are (LF, CRLF or CR).
> *   **Regular expressions** (Keep / Remove Lines Matching Regex and its Clipboard version): The pattern is 1-500 characters and is checked when you enter it. It runs in a separate worker thread and is stopped after 2 seconds (for example `^(a+)+$` on a long line), and the selections can be up to 10,000,000 characters in total. In both cases a warning is shown and nothing is changed. If the document is edited while the pattern is running, the selection is not changed and a warning is shown.
> *   **Output size limit**: Add Line Numbers (both versions), Duplicate Each Line, Join Every N Lines, Split Sentences and Split into Fixed-width Lines stop if one run would add more than 10,000,000 characters in total (counted over all selections). Nothing is changed and a warning is shown.
> *   **Input values**: Text and markers are literal and case-sensitive, 1-1,000 characters without line breaks (they are not regular expressions). The selections and their text are read after you finish entering the values, so edits made to the document while an input box is shown (for example by a formatter) are taken into account; if no non-empty selection is left by then, nothing is done.
> *   **Split Sentences**: Abbreviations such as `e.g.` or `Mr.` are also treated as sentence ends. `.` without whitespace after it (`3.14`) is not a split, a line is not split at its end, and existing line breaks are kept. Full-width `？` and `！` are not treated as sentence ends.
> *   **Remove Duplicate Lines (Ignore Case)**: Lines are compared with `toLowerCase()`, which does not depend on the locale (for example, Turkish `İ` is not handled specially).

### 3. Sort, Unique & Shuffle

#### Sort Lines
Sorts selected lines based on various criteria.
*   **Criteria**: String, Number, Line Length, Occurrence Count.
*   **Order**: Ascending, Descending.
*   **Variations**: Sort the entire line or just the selection.

#### Extended Sort Commands
These commands never change the editor: like the existing sort commands, they open the result in a new editor, and the (Clipboard) versions copy it to the clipboard instead. They are in the **Sort Lines** and **Sort Selections** submenus of the context menu.
In the examples, `·` is a space and `⏎` is a line break. A value in parentheses is the value you enter, and `[a]` is a selection.

*   **Sort Lines** (the lines of all selections are sorted as one list; one trailing line break of each selection is not counted as a line):
    *   **Natural Order (Ascending / Descending)**: Numbers in the text are compared as numbers: `file10⏎file2` -> `file2⏎file10`. Letters are compared linguistically (`a` < `B`), not by code point.
    *   **Ignoring Case (Ascending / Descending)**: `b⏎A⏎a` -> `A⏎a⏎b`. Lines that differ only in case keep their order, also in the descending order (`A⏎b⏎a` -> `b⏎A⏎a`).
    *   **Locale (Ascending / Descending)**: Asks for a locale (a BCP 47 tag such as `en`, `fr` or `ja`, up to 64 characters; the default is the VS Code display language) and sorts with `Intl.Collator`: `f⏎é⏎e` (`en`) -> `e⏎é⏎f`. A malformed or unsupported locale is rejected when you enter it.
    *   **Kana Order**: Sorts in Japanese syllabary order, treating hiragana, katakana and half-width katakana as the same: `カ⏎あ⏎き` -> `あ⏎カ⏎き`.
    *   **Column (Ascending / Descending)**: Asks for a delimiter (literal text of 1-100 characters, default `,`; enter `\t` for a tab) and then a column number (1-1,000, default `1`): `b,2⏎a,1` (`,`, `2`) -> `a,1⏎b,2`. The cell is trimmed; numbers are compared by value and other text in natural order.
    *   **Regex Capture**: Asks for a regular expression and uses its first capture group (or the whole match if the pattern has no group) as the key: `id=10⏎id=9` (`id=(\d+)`) -> `id=9⏎id=10`. Numbers are compared by value and other text in natural order.
    *   **Date (Ascending / Descending)**: Uses the first year-first date of each line (`2026-03-01`, `2026/03/01` or `2026.03.01`, optionally with a time such as `T10:00:00.123` or `·10:00` and a time zone `Z`, `+09:00` or `+0900`): `2026-03-01 b⏎2025-12-31 a` -> `2025-12-31 a⏎2026-03-01 b`.
    *   **Semantic Version**: SemVer 2.0.0 precedence, with an optional leading `v` or `V`. The whole line (ignoring leading and trailing whitespace) must be a version; a line such as `pkg 1.2.0` or `1.2.0 release` has no key: `1.10.0⏎1.2.0⏎1.2.0-rc.1` -> `1.2.0-rc.1⏎1.2.0⏎1.10.0`. Build metadata (`+build`) does not change the order.
    *   **IP Address**: Uses the IPv4 / IPv6 address at the start of each line (a `/prefix` and an IPv6 zone ID `%eth0` are allowed): `10.0.0.10⏎10.0.0.9` -> `10.0.0.9⏎10.0.0.10`. IPv4 addresses come before IPv6 addresses, and the same address sorts without a prefix first, then by prefix length.
    *   **Hex Number**: Uses the first token of each line as a hex number (`0x` is optional): `0x1F⏎0xA` -> `0xA⏎0x1F`.
    *   **Word Count**: `a b c⏎a` -> `a⏎a b c`.
    *   **Last Word**: `Ann Smith⏎Bob Adams` -> `Bob Adams⏎Ann Smith`.
    *   **Reversed String**: Sorts by the line read backwards, so lines with the same ending (such as a file extension) are grouped: `a.ts⏎b.js⏎c.ts` -> `b.js⏎a.ts⏎c.ts`.
    *   **Remove Duplicates**: Sorts ascending and removes duplicate lines (like `sort -u`): `b⏎a⏎b` -> `a⏎b`.
    *   **Paragraphs**: Sorts blocks of lines separated by blank lines: `b⏎b2⏎⏎a⏎a2` -> `a⏎a2⏎⏎b⏎b2`.
    *   **Keeping Indented Children**: The least indented lines are sorted, and the lines below each of them (more deeply indented lines and blank lines) move with it: `b⏎··b1⏎a⏎··a1` -> `a⏎··a1⏎b⏎··b1`.
*   **Sort Selections** (the non-blank lines of all selections are sorted, like the existing Sort Selections commands):
    *   **Natural Order**: `[v10] [v2]` -> `v2⏎v10`.
    *   **Ignoring Case**: `[b] [A]` -> `A⏎b`.
    *   **Length (Ascending / Descending)**: Counted in code points: `[ccc] [a]` -> `a⏎ccc`.
*   **Clipboard versions**: Natural Order, Ignoring Case, Column and Semantic Version of Sort Lines, and Natural Order of Sort Selections also have a **(Clipboard)** version.
*   The result is joined with LF (`⏎`), also in a CRLF document. If the result is empty (for example, only blank lines are selected for Paragraphs), no editor is opened and the clipboard is not changed; a notification is shown instead (`No lines to sort. No document was opened.` / `No lines to copy. The clipboard was not changed.`).
*   The sorts are stable: lines with the same key keep their original order.

> **Limitations of the extended sort commands**
> *   **Lines without a key**: Lines without a key (no date, no semantic version, no IP address, no hex number, no match of the regular expression, or too few columns) are put last in their original order, in both the ascending and the descending order.
> *   **Column and Regex Capture**: Numbers and text are kept apart so that the order stays consistent when they are mixed: in the ascending order all numbers come first (by value) and then the text (in natural order), and the descending order is the exact reverse (text first): `b,10⏎a,9⏎c,x` (`,`, `2`) -> `a,9⏎b,10⏎c,x` / `c,x⏎b,10⏎a,9`. A number is a decimal such as `1`, `-1.5`, `.5` or `1e3`. The Column sort splits each line at the literal delimiter and does not handle quoted CSV fields (`"a,b"`).
> *   **Regular expressions** (Regex Capture): JavaScript syntax with the `u` flag, case-sensitive, 1-500 characters, checked when you enter it. It runs in a separate worker thread and is stopped after 2 seconds (for example `^(a+)+$` on a long line), and the selections can be up to 10,000,000 characters in total. In both cases a warning is shown and nothing is opened. A line where the first group does not take part in the match (the line `b` for `(a)?b`) has no key.
> *   **Date**: Only year-first dates are read (`MM/DD/YYYY` and `DD/MM/YYYY` cannot be told apart). Only the first date of a line is used; if it is not a valid date (`2026-02-30`, `25:00`) or has an out-of-range time zone (`+25:00`, `+09:60`), the line has no key. A date or time without a time zone is taken as UTC, and so is one with a malformed time zone such as `+09:001` (the time zone is ignored, unlike an out-of-range one). Only the first three digits of a fraction of a second are used.
> *   **Hex Number**: The first token counts as a hex number whenever the whole token is hex digits (with an optional `0x`), so words such as `face`, `bad` or `add` also get a hex key. Tokens with other characters (`deadline`, `bad-name`, `0xZZ`) and `0x` alone have no key.
> *   **Remove Duplicates**: Only lines that are exactly the same are duplicates. Lines that differ only in case or in Unicode normalization (NFC / NFD) are all kept.
> *   **Paragraphs**: Lines with only whitespace separate paragraphs. The result has exactly one empty line between paragraphs; leading, trailing and repeated blank lines are removed. With several selections, the boundaries between selections do not separate paragraphs.
> *   **Keeping Indented Children**: Only the top level is sorted; the children keep their order. Indentation is counted in characters (a tab counts as one). Lines before the first least indented line (leading blank lines or more deeply indented lines) stay at the top in their order.
> *   **Locale and kana order**: The order comes from `Intl.Collator` of the VS Code runtime and may differ slightly between versions.

#### Unique & Shuffle
*   **Unique Selections**: Removes duplicate lines.
*   **Unique Selections**: Removes duplicate lines.
*   **Shuffle**: Randomly shuffles the selected lines, selections, or characters.
*   **Diff Selection**: Shows the difference between two selections.

### 4. Extraction
Filter and move data to a new tab or clipboard.
*   **Extract Lines**: By Regex match or manual selection.
*   **Extract by Length**: Equal to, Less than, Greater than, or Range of N characters.
*   **Extract Specific Data**:
    *   **Email**: `support@example.com`
    *   **URL**: `https://example.com`
    *   **IP Address**: `192.168.1.1`

### 5. Case Conversion
Convert text between naming conventions and cases.
*   **Code Cases**: Camel, Pascal, Snake, Kebab, Constant (`UPPER_SNAKE`), Dot, Path.
*   **Text Cases**: Upper, Lower, Capital, Sentence, Title (Smart).
*   **Fun/Other**: SpongeBob (`sPoNgEbOb`), Screaming Snake, Humanize, Slugify.
*   **Remove Accents**: `Crème` -> `Creme`.

#### Extended Case Commands
*   **Case Only (delimiters kept)**:
    *   **Swap**: `Hello World` -> `hELLO wORLD`.
    *   **Sentence (Preserve Acronyms)**: `the API URL is ready` -> `The API URL is ready`.
    *   **Title (APA Style)**: `a guide through the woods` -> `A Guide Through the Woods` (words of 4+ letters are capitalized; hyphenated words too: `state-of-the-art` -> `State-of-the-Art`).
    *   **Upper First / Lower First**: `hello World` -> `Hello World`, `HelloWorld` -> `helloWorld`.
    *   **Alternating Words**: `one two three` -> `ONE two THREE`.
    *   **Uppercase Known Acronyms**: `userId apiUrl` -> `userID apiURL` (built-in list of 42 acronyms such as `id`, `url`, `http`, `json`).
    *   **Sentence (Each Sentence)**: `hello. how are you? fine.` -> `Hello. How are you? Fine.`
    *   **Capitalize Each Line / Lowercase Each Line Start**: lines `foo bar` / `baz` -> `Foo bar` / `Baz` (indentation is kept).
    *   **Upper (Locale) / Lower (Locale)**: Asks for a locale tag (e.g. `tr`) once, then applies it to every selection: `istanbul` (tr) -> `İSTANBUL`.
*   **Naming Conventions**:
    *   **Cobol**: `userName` -> `USER-NAME`
    *   **Ada**: `user name` -> `User_Name`
    *   **Flat / Upper Flat**: `User Name` -> `username` / `USERNAME`
    *   **Camel Snake / Pascal Snake**: `user name id` -> `user_Name_Id` / `User_Name_Id`
    *   **Acronym**: `portable network graphics` -> `PNG`
    *   **CSS Custom Property**: `primaryColor` -> `--primary-color`
    *   **BEM**: `card title active` -> `card__title--active` (4th and later words join the modifier)
    *   **Hashtag**: `hello world` -> `#HelloWorld`
*   **Detect & Cycle**:
    *   **Detect Style**: Shows the naming convention of each selection in a notification (e.g. `Detected case: snake_case`) without changing the text.
    *   **Cycle**: camelCase -> snake_case -> kebab-case -> PascalCase -> CONSTANT_CASE -> camelCase (`userName` -> `user_name`).
*   **JSON Keys to Camel / Snake / Kebab / Pascal**: Converts only the object keys of the selected JSON (nested objects and arrays included): `{"user_name":"a_b"}` -> `{"userName":"a_b"}`. Values, whitespace, indentation, key order and escapes are kept byte for byte.
*   **Pluralize / Singularize**: Converts the last English word of each line, keeping its case: lines `category` / `child` -> `categories` / `children`, `userAccount` -> `userAccounts`, `API` -> `APIs`, `USER_BOX` -> `USER_BOXES`.

> **Limitations of the extended case commands**
> *   **Sentence (Preserve Acronyms)**: Words written only in capitals are treated as acronyms, so an all-caps sentence (`THE API IS READY`) is left unchanged. Mixed-case words such as `iOS` are lowercased (`ios`).
> *   **Title (APA Style)**: An all-caps input of two or more words is lowercased first, so acronyms in it are not kept (`THE API GUIDE` -> `The Api Guide`). A single all-caps word (`API`) is left as is.
> *   **Detect Style**: PascalCase is recognized only when it starts with a capital followed by a lowercase letter or digit, so identifiers starting with an acronym (`URLParser`) are reported as `unknown`.
> *   **Cycle**: A single word stops at `user` (`User` -> `USER` -> `user`), because flatcase goes back to the start of the cycle. Leading and trailing whitespace is removed.
> *   **Uppercase Known Acronyms**: The first part of a word with two or more parts is never changed (`IdToken` stays, `ApiUrl` -> `ApiURL`); words with digits (`utf8`) are not in the list; consecutive acronyms can be hard to read (`getHttpsUrl` -> `getHTTPSURL`).
> *   **Sentence (Each Sentence)**: A sentence starting with a quote (`"hello.`) and a position with no space after the period (`hello.world`) are not capitalized.
> *   **JSON Keys**: If two different keys in the same object would become the same key (`{"user_id":1,"userId":2}` to camel), that selection is left unchanged and an error is shown; other selections are still converted. Invalid JSON shows `Invalid JSON: ...` and is left unchanged. Keys that would become empty (non-ASCII only such as `ユーザー`, or `__`) are kept as is, and symbols or emoji inside a key are dropped (`"😀_x"` -> `"x"`).
> *   **Pluralize / Singularize**: Rule-based with a small built-in dictionary, so irregular words not in the dictionary are not guaranteed (`waltzes` -> `waltze`, `bases` always becomes `base`).
>     *   Only the last run of letters on each line is converted, including letters before a symbol. A known file extension right after a `.` is left unchanged (`file.ts`, `index.json`), but extensions not in the built-in list and common member names are still converted (`console.log` -> `console.logs`).
>     *   Lines ending with a one-letter word (`a`, `s`), a possessive or a contraction (`user's`, `it's`, `we're`, `the users'`) are left unchanged. A single word in single quotes (`'users'`) is converted, but several words in single quotes (`'the users'`) are not.
>     *   Known acronyms ending with `S` (`DNS`, `HTTPS`, `CSS`, `OS`, `iOS`, `SMS`, `GPS`, `AWS`) are left unchanged in both directions. An all-caps word ending with `S` that is not in this list follows the same already-plural check as lower-case words: singular `-ss` / `-us` / `-is` words and dictionary words are still pluralized (`CLASS` -> `CLASSES`, `STATUS` -> `STATUSES`, `GAS` -> `GASES`), while other words are treated as plurals (`ABS` is unchanged by Pluralize and becomes `AB` with Singularize). Acronym plurals with a lowercase `s` are not affected (`DTOs` -> `DTO`, `TODOs` -> `TODO`).
>     *   In an all-caps identifier the suffix is upper-case too (`USER_ID` -> `USER_IDS`, `USER_BOX` -> `USER_BOXES`); a stand-alone acronym or an all-caps part after a lowercase letter gets a lowercase `s` (`API` -> `APIs`, `userID` -> `userIDs`).
>     *   Words that are already plural are left unchanged by Pluralize (`users`, `IDs`, `APIs`, `categories`, `children`). The check is: a word ending with `s` whose singular pluralizes back to it. So singular words ending with `s` that are not `-ss` / `-us` / `-is` words and not in the dictionary are left unchanged too, even when the correct plural is different (`chaos`, `pancreas`, `thermos`, `yes`, `ms`).

### 6. Data Transformation

#### JSON / XML / YAML
*   **Format (Pretty Print)**: Formats minified JSON/XML.
*   **Minify**: Compresses code.
*   **Convert**:
    *   JSON <-> YAML
    *   XML -> JSON
    *   Env File -> JSON
*   **Stringify/Parse**: Escape/Unescape JSON strings.
*   **Flatten/Unflatten**: Convert between nested JSON and dot-notation.

#### CSV
*   **CSV <-> Markdown Table**: Convert between Comma-Separated Values and Markdown table syntax.

#### Encoding
*   **Base64**: Encode, Decode, Deflate, Inflate.
*   **URL**: Encode/Decode URI or URI Components.
*   **Escape/Unescape**: Handle standard string escaping (newlines, quotes).

#### Encode / Decode Commands
The standard versions open the result in a new read-only editor and never change the text, like the existing Base64 commands. The (Replace) versions of Encode / Decode HTML Entities, Escape / Unescape Unicode (\uXXXX) and Encode / Decode Hex replace each selection in place. With multiple selections, each selection is converted on its own: the standard versions open one editor with the results in document order, joined with the document's line ending (LF or CRLF), and the (Replace) versions replace every selection. Empty selections are skipped, and nothing happens if every selection is empty. The standard versions are in the **Encode / Decode** submenu of the **Transform** context submenu, and the (Replace) versions in the **Encode / Decode** submenu of the **Replace** context submenu.
In the examples, `·` is a space and `⏎` is a line break. A value in parentheses is the value you enter.

*   **HTML**:
    *   **Encode HTML Entities**: Escapes `&` `<` `>` `"` `'` (as `&amp;` `&lt;` `&gt;` `&quot;` `&#39;`): `<a href="x">` -> `&lt;a href=&quot;x&quot;&gt;`.
    *   **Decode HTML Entities**: Decodes decimal (`&#12354;`) and hexadecimal (`&#x3042;`) character references and the supported named entities: `&lt;b&gt;·&#12354;` -> `<b>·あ`.
    *   **Encode All Characters as Numeric Entities**: Despite the title, only non-ASCII characters are converted, one decimal reference per code point; ASCII is kept: `aあ` -> `a&#12354;`.
*   **Unicode escapes**:
    *   **Escape Unicode (\uXXXX)**: Non-ASCII UTF-16 code units become `\u` with 4 lower-case hex digits (a surrogate pair becomes two escapes): `あ😀` -> `\u3042\ud83d\ude00`.
    *   **Unescape Unicode (\uXXXX)**: Decodes `\uXXXX` (4 hex digits) and `\u{…}` (1-6 hex digits), joining a surrogate pair written as two `\uXXXX`: `\u3042` -> `あ`, `\ud83d\ude00` -> `😀`. A `\u` that is not in one of these forms (`C:\users`) is kept.
    *   **Escape Unicode (\u{...})**: Non-ASCII characters become `\u{…}` per code point with upper-case hex digits: `😀` -> `\u{1F600}`.
*   **Base encodings** (text is encoded as UTF-8 bytes):
    *   **Encode / Decode Base64URL**: URL-safe alphabet (`-` `_`) without padding: `foo?` <-> `Zm9vPw`. The decoder also accepts correct `=` padding.
    *   **Encode / Decode Base32**: RFC 4648 alphabet with `=` padding: `foo` <-> `MZXW6===`. The decoder ignores case, and the padding may be omitted.
    *   **Encode / Decode Base58**: Bitcoin alphabet; each leading zero byte is `1`: `hello` <-> `Cn8eVZg`.
    *   **Encode / Decode Ascii85**: Adobe variant enclosed in `<~` `~>`, with `z` for four zero bytes: `hi` <-> `<~BP@~>`. The decoder accepts the text with or without `<~` `~>`.
    *   **Encode / Decode Base64 (Each Line)**: Encodes or decodes each line on its own; empty lines stay empty and the line breaks (LF or CRLF) are kept: `a⏎b` <-> `YQ==⏎Yg==`. The decoder ignores spaces and tabs at both ends of a line.
    *   **Gzip Base64** / **Gunzip Base64**: Compresses with gzip and encodes the result as standard Base64, and the reverse: `hi` <-> `H4sIAAAAAAAAE8vIBACsKpPYAgAAAA==`. This is a different format from the existing Deflate / Inflate commands. The time stamp, extra flags and operating system fields of the gzip header are fixed values, so the same text always gives the same result.
    *   **Encode as Data URI (text/plain)**: `hi` -> `data:text/plain;charset=utf-8;base64,aGk=`.
*   **Bytes as hex and binary**:
    *   **Encode Hex (UTF-8 Bytes)**: Lower-case hex digits without separators: `abc` -> `616263`.
    *   **Decode Hex (UTF-8 Bytes)**: Tokens are separated by spaces, tabs or line breaks, and case is ignored: `61·62·63` -> `abc`. A token is either bare hex digits (`6162`) or starts with `0x` / `0X`, and each `0x` group must have an even number of digits (`0x61·0X62`, `0x6162` and `0x610x62` are all `ab`). A `0x` in the middle of bare digits (`100x20`), a doubled prefix (`0x0x61`), a `0x` without digits and an odd number of digits are errors.
    *   **Encode Binary (UTF-8 Bytes)**: Eight bits per byte, separated by a space: `Hi` -> `01001000·01101001`. **Decode Binary** ignores whitespace and needs a multiple of 8 bits of `0` and `1`.
*   **Internationalized domain names**:
    *   **Encode Punycode (IDN)** / **Decode Punycode (IDN)**: Converts the whole selection, as one domain name, with the `domainToASCII` / `domainToUnicode` functions of Node.js: `例え.jp` <-> `xn--r8jz45g.jp`. Spaces, tabs and line breaks at both ends are ignored.
*   **Mail and forms**:
    *   **Encode Quoted-Printable**: UTF-8 bytes other than printable ASCII, and `=`, become `=XX` (upper-case); a space or tab at the end of a line becomes `=20` / `=09`, and lines longer than 76 characters get a soft line break (`=` and a line break of the document's line ending) without splitting an `=XX`: `café` -> `caf=C3=A9`. The original line breaks are kept.
    *   **Decode Quoted-Printable**: Decodes `=XX` (any case) and removes soft line breaks: `caf=C3=A9` -> `café`. As in RFC 2045, spaces and tabs at the end of each encoded line are removed first (`abc··⏎def` -> `abc⏎def`); encoded ones (`=20` / `=09`) are kept.
    *   **Encode Form (x-www-form-urlencoded)**: Like an HTML form: a space becomes `+`, and everything except letters, digits and `*` `-` `.` `_` becomes `%XX` of its UTF-8 bytes: `a·b&c` -> `a+b%26c`. Line breaks are encoded as they are (`%0A`).
    *   **Decode Form (x-www-form-urlencoded)**: `+` becomes a space and `%XX` is decoded: `a+b%26c` -> `a·b&c`.
*   **Ciphers** (for obfuscation, puzzles and learning only; they are not encryption):
    *   **Cipher: ROT13**: `Hello` -> `Uryyb`. **ROT47** (also rotates ASCII digits and symbols, `!` to `~`): `Hello` -> `w6==@`. **Atbash** (`a` <-> `z`): `abc` -> `zyx`.
    *   **Cipher: Caesar Shift (N)**: Asks once for the shift (an integer with an optional sign and up to 9 digits; a negative number shifts backwards): `abc` (`3`) -> `def`. If you cancel the input box, nothing is done. The selections are read again after the input box closes.
    *   Only the ASCII letters `A`-`Z` / `a`-`z` are changed (ROT47: the ASCII characters `!`-`~`); other letters such as `é`, `ß` or `ﬃ` are kept.
*   **Text to NATO Phonetic Alphabet**: Letters (any case) and digits become code words (`Alfa`, `Bravo`, … `X-ray`, … `Zulu`, `Zero` … `Nine`), joined with a space; a run of whitespace inside a line becomes one `/`, and any other character is kept as its own word: `ab1` -> `Alfa·Bravo·One`, `·ab·1·` -> `Alfa·Bravo·/·One`. Whitespace at both ends of each line is dropped, and line breaks are kept.

> **Limitations of the encode / decode commands**
> *   **Errors**: The decoders reject malformed input (characters outside the alphabet, a wrong length or padding, a last character with non-zero unused bits, broken gzip, an invalid `%XX` or `=XX`, …) and decoded bytes that are not valid UTF-8 text. They are stricter than the existing Base64 Decode, which replaces invalid bytes with `�`. If any selection fails, no selection is changed and no editor is opened, and an error names the problem (and which selection, when there are several); selected text quoted in the message is shortened to 60 characters (with `…`).
> *   **Decode HTML Entities**: The named entities supported are the five XML entities (`amp` `lt` `gt` `quot` `apos`), the Latin-1 entities (`nbsp` to `yuml`, U+00A0-U+00FF) and common symbols such as `copy` `reg` `trade` `hellip` `mdash` `ndash` `lsquo` `rsquo` `ldquo` `rdquo` `bull` `euro` `larr` `rarr` `ne` `le` `ge` (not all HTML5 entities). Unknown names and an `&` without `;` are kept as they are. A numeric reference to 0, a surrogate (`&#xD800;`) or a value beyond U+10FFFF is an error.
> *   **Lone surrogates**: The encoders that work on UTF-8 bytes (Base64URL, Base32, Base58, Hex, Binary, Quoted-Printable, Ascii85, Gzip Base64, Form, Base64 (Each Line) and Data URI) reject a selection that contains a lone surrogate (half of a surrogate pair, such as U+D83D without the following U+DE00) with an error instead of replacing it with `�`, and no selection is changed.
> *   **Unescape Unicode**: A lone surrogate (`\ud83d` without a following low surrogate, `\ude00` alone, `\u{D800}`) and `\u{…}` beyond U+10FFFF are errors. A valid escape is decoded wherever it appears, for example in a Windows path such as `C:\u0041`, and a preceding `\` is not treated as escaping it.
> *   **Punycode**: The domain name must be on one line: a line break or tab inside the selection is an error (select one domain name at a time). An invalid domain name is an error, and the selection can be up to 1,000 characters. Node.js applies the UTS #46 mapping in both directions, so ASCII letters become lower case and some characters are expanded or removed: `ﬃ` -> `ffi`, `㍿` -> `株式会社` (Decode) or `xn--6oqv20b1zgzxr` (Encode), and Encode removes a soft hyphen (U+00AD). Because of this expansion, the result can be longer than the selection; it is covered by the output size limit below.
> *   **Base58**: Encode accepts up to 10,000 UTF-8 bytes and Decode up to 14,000 characters (whitespace excluded), as the conversion slows down quadratically with longer input.
> *   **Gunzip Base64**: Data that decompresses to more than 10 MiB (10,485,760 bytes) is rejected.
> *   **Output size**: A run whose results would exceed 10,000,000 characters in total (shared by all selections) is refused with a warning, and nothing is changed or opened. For most commands this is checked with a conservative estimate before converting, so input close to the limit may be refused even if the actual result would be smaller (for example, Encode Binary refuses more than about 1.1 million bytes).
> *   **Quoted-Printable**: Unencoded spaces and tabs at the end of a line are lost when decoding, as required by RFC 2045 (text encoded with Encode Quoted-Printable round-trips, as it encodes them).

#### Data Format Commands
The standard versions open the result in a new read-only editor and never change the text; with multiple selections, each selection is converted on its own and the results are joined in document order with the document's line ending (LF or CRLF). The (Replace) versions replace each selection with its result. **Validate JSON** and **Count JSON Elements** show their result in a notification, and **Merge JSON Objects (Selections)** merges all selections into one result. Empty selections are skipped, and nothing happens if every selection is empty. If any selection fails, no selection is changed and no editor is opened, and an error names the problem (and which selection, as `selection 2 of 3: …`, when there are several). The standard versions are in the new **Data Format** submenu of the **Transform** context submenu, and the (Replace) versions in the new **Data Format** submenu of the **Replace** context submenu. The existing JSON, XML and YAML commands are unchanged.
In the examples, `·` is a space and `⏎` is a line break. A value in parentheses is the value you enter.

*   **Output format**: A command that turns JSON into JSON (Sort JSON Keys, Remove Null Values, Remove Duplicates in JSON Array, Pluck, Group by and Parse Nested JSON Strings) keeps the layout of the selection: a selection on one line gives one line without spaces, and a selection on several lines gives JSON indented with 2 spaces. Commands that turn another format into JSON write JSON indented with 2 spaces, like the existing Format and YAML to JSON commands.
*   **JSON structure**:
    *   **Sort JSON Keys** / **(Replace)**: Sorts the keys of every object in UTF-16 code unit order; the order of arrays is kept: `{"b":1,"a":{"d":2,"c":3}}` -> `{"a":{"c":3,"d":2},"b":1}`.
    *   **Remove Null Values from JSON**: Removes keys and array elements whose value is `null`, at every level; objects and arrays that become empty are kept: `{"a":null,"b":[1,null]}` -> `{"b":[1]}`.
    *   **Extract JSON Value by Path**: Asks for a path and shows the value there; a string is shown without quotes, and other values as JSON: `{"a":{"b":[5]}}` (`a.b[0]`) -> `5`. A path that does not exist is an error.
    *   **List JSON Paths**: Lists the path of every leaf (a value that is not an object or array, or an empty object or array), one per line: `{"a":{"b":1},"c":[2]}` -> `a.b⏎c[0]`. Each line can be entered as is in Extract JSON Value by Path. A value at the top level that is not an object or array gives `$`.
    *   **Extract JSON Keys**: The keys of the top-level object, one per line: `{"a":1,"b":2}` -> `a⏎b`.
    *   **Merge JSON Objects (Selections)**: Deep-merges the JSON objects of two or more selections in document order (a later value wins, and arrays are replaced, not merged) and opens one editor: `{"a":1}` and `{"b":2}` -> `{"a":1,"b":2}`. With fewer than two non-empty selections, only a warning is shown.
    *   **Validate JSON**: Checks each selection as strict JSON (RFC 8259) and shows `Valid JSON` (`Valid JSON (3 selections)` with several), or `Invalid JSON at line L, column C: reason` for the first error, with the line and column in the document, and selects the character that caused it: for `{"a":1,}`, `Invalid JSON at line 1, column 8: unexpected character "}"` and the `}` is selected. When the text ends too early, the cursor is put at the end of the selection.
    *   **Remove Duplicates in JSON Array**: Removes repeated elements of the top-level array and keeps the first one; objects are compared by their content, ignoring the order of their keys: `[1,2,1,{"a":1},{"a":1}]` -> `[1,2,{"a":1}]`.
    *   **Pluck Field from JSON Array**: Asks for a field (a path such as `id` or `user.name`) and gives an array of that field of every element; an element without it gives `null`, so the positions are kept: `[{"id":1},{"id":2}]` (`id`) -> `[1,2]`.
    *   **Group JSON Array by Field**: Asks for a field and groups the elements of the array by its value, in the order the groups first appear: `[{"t":"a","v":1},{"t":"a","v":2}]` (`t`) -> `{"a":[{"t":"a","v":1},{"t":"a","v":2}]}`. An element without the field, or with an object or array there, is an error that names the element.
    *   **Count JSON Elements**: Shows the number of elements of an array, keys of an object, and nodes in total in a notification: `[1,2,3]` -> `3 elements (4 nodes in total)`; `1 key`, `1 value` for a value that is not an object or array. With several selections: `Selection 1: …; Selection 2: …`.
    *   **Generate JSON Schema from JSON**: Makes a draft 2020-12 schema from a sample, with `$schema`, `type`, `properties` and `required` (the keys of the sample), `items` for arrays (the element schema, `anyOf` when the elements differ, `{}` for an empty array), and `integer` for whole numbers: `{"a":1}` -> `{"$schema":"https://json-schema.org/draft/2020-12/schema","type":"object","properties":{"a":{"type":"integer"}},"required":["a"]}` (written with 2 spaces). The `$schema` URL is only written as text; nothing is downloaded.
    *   **Parse Nested JSON Strings**: Replaces string values that hold a JSON object or array (starting with `{` or `[`) with their parsed value, at every level: `{"a":"{\"b\":1}"}` -> `{"a":{"b":1}}`. Strings such as `"123"` or `"true"` stay strings.
*   **Paths**: Extract JSON Value by Path, Pluck and Group by use the same notation as List JSON Paths: `.name` for a key that is an identifier, `[0]` for an array index and `["any key"]` (a JSON string) for any other key, with an optional `$` at the start: `a.b[0]`, `$["b-c"][1]`, `["a.b"]`. `$` alone is the whole value. A path can be up to 1,000 characters; a wrong path is shown in the input box. If you cancel the input box, nothing is done, and the selections are read again after it closes.
*   **JSON to other formats**:
    *   **Convert JSON to Query String**: A flat object with `URLSearchParams`: `{"a":1,"b":"x·y"}` -> `a=1&b=x+y`. An array of values repeats the key (`{"a":[1,2]}` -> `a=1&a=2`), `null` is an empty value, and a nested object is an error.
    *   **Convert JSON to Env**: A flat object as `KEY=VALUE` lines that the existing Env to JSON reads back: `{"A":"1","B":"x·y"}` -> `A=1⏎B="x·y"`. A value with spaces, `#`, `=` or quotes is enclosed in `"…"` (or `'…'` when it contains `"`), and a value with `$`, a backtick or `\` is always enclosed in single quotes (`{"A":"$HOME"}` -> `A='$HOME'`), so that shells, Docker Compose and dotenv do not expand it. `null` is an empty value.
    *   **Convert JSON to XML** / **(Replace)**: Builds XML and formats it with the existing xml-formatter: `{"a":{"b":1}}` -> `<a>⏎··<b>1</b>⏎</a>`. An object with one key becomes the root element; anything else (several keys, an array, a single value, or one key whose value is an array) is enclosed in `<root>`. An array becomes repeated elements with the same name (`<item>` for an array inside an array), `null` an empty element, and `& < > " '` are escaped.
    *   **Convert JSON to TOML** / **(Replace)**: `{"a":{"b":1}}` -> `[a]⏎b = 1`. Values come first, then `[table]` headers (a table that only holds other tables gets no header of its own), and an array of objects becomes `[[array]]` tables. `null` is an error, as TOML has no null; an integer beyond ±(2^53−1) is written as a float (`.0`).
    *   **Convert JSON to INI**: Up to two levels: top-level values first, then a `[section]` for each object: `{"db":{"host":"x"}}` -> `[db]⏎host=x`. A value with spaces at either end, `;` or `#`, or enclosed in quotes is written in `"…"` so that Convert INI to JSON reads it back.
    *   **Convert JSON to .properties**: Nested keys joined with `.` and array elements as `name[n]`: `{"a":{"b":1}}` -> `a.b=1`. Spaces, `:` `=` `#` `!` in keys, a leading space in values, `\` and control characters are escaped; other non-ASCII characters are written as they are (a UTF-8 `.properties` file).
    *   **Convert JSON Array to JSON Lines** / **(Replace)**: `[{"a":1},{"a":2}]` -> `{"a":1}⏎{"a":2}`.
    *   **Convert JSON to JS Object Literal**: Quotes keys only when needed and uses single quotes: `{"a":1,"b-c":2}` -> `{·a:·1,·'b-c':·2·}` (one line for a selection on one line, 2 spaces otherwise). The key `__proto__` is written as `['__proto__']`, so that it stays an ordinary key when the code runs.
*   **Other formats to JSON**:
    *   **Convert TOML to JSON** / **(Replace)**: `[a]⏎b = 1` -> `{"a":{"b":1}}`. Uses the extension's own parser for the main TOML 1.0 syntax (no new dependencies; see the limitations below).
    *   **Convert INI to JSON**: `[section]`, `key=value` or `key: value`, and comment lines starting with `;` or `#`: `[db]⏎host=x` -> `{"db":{"host":"x"}}`. Keys before the first section go to the top level, values are strings, and quotes around a whole value are removed. A later duplicate key wins, and sections with the same name are merged.
    *   **Convert .properties to JSON**: `#` / `!` comments, `=`, `:` or whitespace as the separator, continuation lines and escapes; keys are split at `.` into nested objects and `name[n]` into arrays: `a.b=1` -> `{"a":{"b":"1"}}`. Values are strings. A key that is both a value and a parent (`a=1` and `a.b=2`) is an error.
    *   **Convert JSON Lines to JSON Array** / **(Replace)**: Empty lines are skipped: `{"a":1}⏎{"a":2}` -> `[{"a":1},{"a":2}]`. An error is reported as `line L, column C: reason`.
    *   **Convert JSONC / JSON5 to JSON**: Accepts comments, trailing commas, unquoted and numeric keys, single-quoted strings, line continuations, hex numbers, `.5` / `5.` and `+`: `{a:·1,·//·c⏎}` -> `{"a":1}`.
    *   **Convert JS Object Literal to JSON**: A JavaScript object literal with literal values only; in addition to the JSON5 syntax, it accepts template literals without `${`, `_` in numbers, `0o` / `0b`, `\u{…}` and a computed key that is a single string literal (`['a']`): `{·a:·1,·'b':·[true]·}` -> `{"a":1,"b":[true]}`. The text is parsed, never run.
*   **YAML**:
    *   **Format YAML** / **(Replace)**: Reads and writes the YAML again with the existing js-yaml, indented with 2 spaces: `a:···{b:·1}` -> `a:⏎··b:·1`.
    *   **Sort YAML Keys**: Also sorts the keys at every level: `b:·1⏎a:·2` -> `a:·2⏎b:·1`.
    *   Both use the YAML 1.2 Core schema, so dates and times stay as they are written (`2020-01-01` is not turned into a time stamp). The result ends with a line break only if the selection does (in a CRLF document, a selection ending with CRLF), so the Replace version does not add or remove one.
*   **HTTP**:
    *   **Parse Cookie Header to JSON**: `a=1;·b=x` -> `{"a":"1","b":"x"}`. A leading `Cookie:` is removed, values are not decoded (quotes around a whole value are removed), and a repeated name gives an array of its values.
    *   **Parse Set-Cookie to JSON**: `id=1;·Path=/;·Secure` -> `{"name":"id","value":"1","path":"/","secure":true}`. Known attributes (any case) are `expires`, `maxAge` (a number when it is an integer), `domain`, `path`, `secure`, `httpOnly`, `sameSite`, `partitioned` and `priority`; other attributes use their lower-case name (an attribute named `name` or `value` is an error). Several lines give an array, one cookie per line.
    *   **Parse HTTP Headers to JSON**: `Accept:·a⏎X-Id:·1` -> `{"Accept":"a","X-Id":"1"}`. A request or status line at the start (`GET / HTTP/1.1`, `HTTP/1.1 200 OK`) and empty lines are skipped, a line starting with whitespace continues the previous value, and a repeated name (any case) gives an array. A line without `:` is an error.
    *   **Parse User-Agent to JSON**: Tells the browser (major version) and OS with built-in rules: a Chrome on Windows 10 User-Agent -> `{"browser":"Chrome 120","os":"Windows 10"}`. It knows Edge, Opera, Samsung Internet, Firefox, Chrome, Safari and Internet Explorer, and Windows, iOS, Android, macOS, ChromeOS and Linux; anything else is `Unknown`. Several lines give an array.

> **Limitations of the data format commands**
> *   **Size and nesting**: A selection can be up to 5,000,000 characters, and objects and arrays can be nested up to 500 levels (YAML: see below). A run whose results would exceed 10,000,000 characters in total (shared by all selections) is refused with a warning, and nothing is changed or opened; for indented JSON, JS object literals and JSON Schema, this is estimated before the result is built, so a deeply nested result that would be too large is refused at once.
> *   **JSON values**: Like the existing JSON commands, keys that look like integers (`"0"`, `"10"`) always come first in numeric order (so Sort JSON Keys puts `"10"` before `"a"` and `"2"` before `"10"`), integers beyond `Number.MAX_SAFE_INTEGER` lose precision, and a later duplicate key wins. Keys such as `__proto__` and `constructor` are kept as ordinary keys.
> *   **Group by**: A group name is the value itself for a string and its JSON text otherwise, so the number `1` and the string `"1"` (likewise `null` and `"null"`, `true` and `"true"`) end up in the same group.
> *   **TOML**: Convert TOML to JSON supports comments, bare, quoted and dotted keys, `[table]`, `[[array of tables]]`, inline tables, arrays (also on several lines, with trailing commas and comments), the four kinds of strings (with a line-ending `\` in multi-line basic strings), decimal / hex / octal / binary integers with `_`, floats, booleans, and offset date-times, local date-times, local dates and local times, which are written to JSON as strings exactly as written. Redefining a key or table, extending an inline table or a static array, mixing `[x]` with `[[x]]`, and extending a table made by a `[header]` with a dotted key in its parent table are errors. `inf`, `nan` and integers beyond ±(2^53−1) are errors, as JSON cannot hold them exactly. Dates and times are checked for their format and ranges (month 01-12, day 01-31, …), not against the calendar (`2024-02-30` is accepted). Errors are reported as `line L: reason`.
> *   **JSONC / JSON5 and JS object literals**: Only literal values are accepted. `Infinity`, `NaN`, `undefined`, identifiers used as values, functions, computed keys other than one string literal, spread, `${}` in template literals and BigInt are errors.
> *   **YAML**: Format YAML and Sort YAML Keys go through a JavaScript object, so comments are lost and the value is written again in js-yaml's style: numbers are written in decimal (`0x1F` -> `31`), `~` and `Null` become `null`, `True` becomes `true`, quotes may be added or removed, and anchors are renamed (`&ref_0` / `*ref_0`; aliases are kept as references, not expanded). Keys that look like integers become quoted string keys and move to the front in numeric order, even without sorting (`10:·a⏎2:·b` -> `'2':·b⏎'10':·a`). The merge key `<<` is kept as an ordinary key and not merged (`<<:·*ref_0`). Tags outside the Core schema (`!!binary`, `!!timestamp`, `!!set`, …), several documents (`---`) and a selection with only comments, empty lines or `---` are errors. YAML can be nested up to 100 levels (js-yaml's own limit; through aliases, up to 500 levels), and an alias that refers to itself is an error. YAML with anchors and aliases is limited to (number of mappings and sequences) × (number of references to them) ≤ 300,000,000; YAML without anchors has no such limit.
> *   **XML**: Element names are limited to ASCII letters, digits, `_`, `.` and `-`, start with a letter or `_`, and must not start with `xml` (in any case); any other key (non-ASCII letters, spaces or other symbols) is an error, as the bundled xml-formatter cannot format other names. An empty array produces no element, and a value with control characters or a lone surrogate is an error.
> *   **Env**: Keys are limited to letters, digits, `_`, `.` and `-`. A value with a line break, a value with both `"` and `'`, and a value with `'` together with `$`, a backtick or `\` are errors, as they cannot be quoted safely. An object or array as a value is an error.
> *   **INI**: Two levels only; arrays, a third level, a line break in a value, and `=` `[` `]` `;` `#`, a line break, spaces at either end or an empty string in a key are errors.
> *   **.properties**: An empty object or empty array is not written, and an empty object or array inside an array is an error (reading it back would shift the indices). A key with `.`, `[` or `]` cannot be converted, as it would be read back as nesting. When reading, an index can be at most the current length of the array (`a[1]=x` alone is an error).
> *   **Set-Cookie and User-Agent**: The User-Agent detection is simple and rule based, and Windows 11 cannot be told from Windows 10 (both are `Windows 10`). A User-Agent can be up to 2,000 characters on each line.

### 7. Cryptography & Security

#### Hashing & Encryption
*   **Hash**: MD5, SHA-1, SHA-256, SHA-512.
*   **HMAC**: Keyed-hash for the above algorithms.
*   **AES Encryption**: Encrypt/Decrypt text with a passphrase.

#### Hash and Checksum Commands
Every command hashes the selected text exactly as it is selected, as UTF-8 bytes: the text is not trimmed, and a CRLF line break is hashed as the two characters CR and LF. Hex output is lower case. The standard versions open a new read-only editor, like the existing Create Hash commands: for each selection, the selected text (trimmed, as a heading) followed by its result. The (Replace) versions replace each selection with its result. Multiple selections are processed in document order; empty selections are skipped, and nothing happens if every selection is empty. The **Crypto** submenu of the **Transform** context submenu has the Create Hash, Create HMAC and SRI commands, the new **Checksum** submenu of **Transform** has the four Checksum commands, and the **Crypto** submenu of the **Replace** context submenu has the (Replace) versions.
In the examples, `⏎` is a line break, a value in parentheses is the value you enter, and a long result is shortened with `…`.

*   **Create Hash**:
    *   **SHA-224**, **SHA-384**, **SHA-512/256**: `abc` -> `23097d22…` (SHA-224), `cb00753f…` (SHA-384), `53048e26…` (SHA-512/256).
    *   **SHA3-256**, **SHA3-512**, **BLAKE2b-512**, **BLAKE2s-256**: `abc` -> `3a985da7…` (SHA3-256), `b751850b…` (SHA3-512), `ba80a53f…` (BLAKE2b-512), `508c5e8c…` (BLAKE2s-256). The Node.js of VS Code does not provide these algorithms, so the extension computes them with its own implementation (FIPS 202 and RFC 7693, checked against OpenSSL); the results are the standard values.
    *   **Create Hash (SHA-384) (Replace)**, **Create Hash (SHA3-256) (Replace)**, **Create Hash (BLAKE2b-512) (Replace)**: Replace each selection with its hash.
*   **Hashes for the web**:
    *   **Create Hash (SHA-256, Base64)**: SHA-256 as standard Base64, for example for a CSP `'sha256-…'` source: `abc` -> `ungWv48Bz+pBQUDeXa4iI7ADYaOWF3qctBD/YfIAFa0=`.
    *   **Create SRI Hash (sha384)**: A Subresource Integrity `integrity` value: `abc` -> `sha384-ywB1P0WjXou1oD1pmsZQBycs…`.
*   **Create Hash per Line (SHA-256)**: Hashes each line on its own and keeps the line breaks (LF, CRLF or CR); empty lines stay empty, and a line break at the end is kept: `a⏎b` -> `ca978112…⏎3e23e816…`. The result opens in a new read-only editor without headings; with multiple selections, the results are joined with the document's line ending.
*   **Create HMAC** (**SHA-1**, **SHA-384**, **SHA3-256**): Asks once for the key in a password input box and computes the HMAC of each selection: `abc` (`key`) -> `4fd0b215…` (SHA-1), `30ddb9c8…` (SHA-384), `09b6dbab…` (SHA3-256). If you cancel the input box, nothing is done. The key must not be empty or contain a lone surrogate. The key is not saved, logged or shown in the result or in a message. The input box is not shown if every selection is empty, and the selections are read again after it closes. HMAC-SHA3-256 uses the extension's own SHA3-256 (block size 136 bytes).
    *   **HMAC-SHA1 is for checking compatibility with existing systems only.** For a new design, use HMAC-SHA256 or stronger.
*   **Checksum** (**CRC-32** (IEEE), **Adler-32**, **FNV-1a 32-bit**): Eight lower-case hex digits: `hello` -> `3610a686` (CRC-32), `062c0215` (Adler-32), `4f9f2cab` (FNV-1a). The extension computes them itself, without new dependencies.
    *   **These checksums detect accidental errors only; they cannot detect tampering.** Use a cryptographic hash or an HMAC for that.
*   **Checksum: Luhn Validate**: Checks the check digit of a number with the Luhn algorithm and shows the result in a notification; the selection is not changed, and the number is not shown in the notification: `79927398713` -> `Luhn: valid`.
    *   Spaces, tabs and line breaks at both ends are ignored, and a single space or hyphen between two digits is ignored as a separator (`4111 1111 1111 1111`, `4111-1111-1111-1111`). A leading or trailing hyphen (`-79927398713`), two separators in a row (`7--9927398713`), `+` and any other character make the text `not a number (only digits, spaces and hyphens are allowed)`, and fewer than two digits make it `not a number (at least 2 digits are required)`.
    *   With one selection, the notification is `Luhn: valid`, `Luhn: invalid` or `Luhn: not a number (…)` with the reason. With 2 to 10 selections, it lists each selection by number without the reason: `Luhn: #1 valid, #2 invalid, #3 not a number`. With 11 or more, it shows only the counts: `Luhn: 12 selections: 5 valid, 4 invalid, 3 not a number`.

> **Limitations of the hash and checksum commands**
> *   **Lone surrogates**: A selection that contains a lone surrogate cannot be converted to UTF-8 and is an error, instead of being hashed as `�` (Luhn Validate reports it as `not a number`). If any selection fails, no selection is changed and no editor is opened.
> *   **Output size**: A run whose results would exceed 10,000,000 characters in total (shared by all selections) is refused with a warning, and nothing is changed or opened. Only Create Hash per Line can get near this limit (64 characters per line).
> *   **Create Hash per Line**: Each line break is kept in the result, but a line break of a single CR may be shown as the line ending of the new editor, because VS Code uses one kind of line ending per editor.
> *   **Performance**: SHA-3, BLAKE2 and HMAC-SHA3-256 run in JavaScript and are much slower than the other hashes (about 0.1 to 0.7 seconds for 10 MB); a very large selection can make VS Code wait for a few seconds.

#### Decoders
*   **JWT**: Decode JSON Web Tokens header/payload.
*   **SAML**: Decode SAML Requests/Responses.
*   **X.509**: View Certificate details.

### 8. Network & Analysis
*   **DNS Lookup**: A, AAAA, MX, NS, TXT, etc.
*   **HAR Visualization**: Convert HTTP Archive (HAR) logs to Mermaid sequence diagrams.

### 9. Generators & Random
*   **UUID**: Generate Random UUID v4.
*   **Password**: Generate strong random passwords.
*   **IP Address**: Random IPv4 / IPv6.
*   **Lorem Ipsum**: Placeholder text.

### 10. Calculation & Numbers

#### Math & Statistics
*   **Evaluate**: `1 + 2 * 3` -> `7`.
*   **Statistics**: Sum, Average, Min, Max of selected numbers.
*   **Base Conversion**: Hex <-> Decimal.

#### Counting & Date
*   **Increment/Decrement**: Increase/decrease numbers (From 1, From N, By 1, By N).
*   **Date Calculation**: Days between dates.
*   **Unit Conversion**:
    *   **Length**: px <-> rem (Base 16).
    *   **Weight**: kg <-> lb.

### 11. Japanese Text Support
*   **Width Conversion**: Full-width <-> Half-width (Alphanumeric + Katakana).
*   **Kana Conversion**: Hiragana <-> Katakana.

### 12. ASCII Art / Fun
*   **ASCII Art**: Wraps text in a balloon with an ASCII character (Cowsay, Tux, Ghost, Meow, Pig, Face, Daemon, Dragon, Stegosaurus, Turkey, Turtle, Elephant, etc.).

**Example:**
*Before:*
```text
Hello World
```
*After:*
```text
 _____________ 
< Hello World >
 ------------- 
        \   ^__^
         \  (oo)\_______
            (__)\       )\/\
                ||----w |
                ||     ||
```


### 13. Date Conversion
Convert selected date strings between various formats.
*   **Formats**: ISO 8601, Locale String, Unix Timestamp (Seconds / Milliseconds).
*   **Japanese Era (Wareki)**: Convert AD Year to Japanese Era (e.g., `2025` <-> `令和7年`).
    *   Supports: Meiji, Taisho, Showa, Heisei, Reiwa.

### 14. Morse Code
Convert text to dots and dashes, and vice versa.
*   **Text to Morse**: Supports Alphanumeric (International) and Japanese Kana (Wabun).
*   **Morse to Text**: Decodes Morse code to text.
*   **Morse to Text (Kana)**: Explicitly decodes as Japanese Kana (Wabun Code) to resolve ambiguities.



## Roadmap & Security

*   **[Roadmap](docs/ROADMAP.md)**: Planned new commands (550+ candidates across 17 categories) that fit the "transform, generate and extract the selected text in place" concept.
*   **[Security Policy](SECURITY.md)**: How to report a vulnerability, and the implementation rules every new command must follow (local processing only, no code/shell execution, no network access, no remote resources in Webviews, no new dependencies by default).
