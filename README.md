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
*   **Case Conversion**: Switch between Camel, Snake, Kebab, Pascal, Constant, Dot, Path, Sentence, Title, Cobol, Ada, Flat, Camel_Snake, Pascal_Snake, CSS Custom Property, BEM and Hashtag cases. Convert only the keys of a JSON document (Camel/Snake/Kebab/Pascal).
*   **Escaping**: Escape/Unescape text (JSON stringify/parse compatibility).
*   **Programmatic**: Convert between JSON<->YAML, Hex<->RGB, Toggle quotes, Env file to JSON.

### 🔐 Cryptography & Security
*   **Hashing**: Generate MD5, SHA-1, SHA-256, and SHA-512 hashes.
*   **HMAC**: Create HMAC-SHA256, HMAC-SHA512, and HMAC-MD5 signatures.
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
    *   **Semantic Version**: SemVer 2.0.0 precedence, with an optional leading `v`. The whole line (ignoring leading and trailing whitespace) must be a version; a line such as `pkg 1.2.0` or `1.2.0 release` has no key: `1.10.0⏎1.2.0⏎1.2.0-rc.1` -> `1.2.0-rc.1⏎1.2.0⏎1.10.0`. Build metadata (`+build`) does not change the order.
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

### 7. Cryptography & Security

#### Hashing & Encryption
*   **Hash**: MD5, SHA-1, SHA-256, SHA-512.
*   **HMAC**: Keyed-hash for the above algorithms.
*   **AES Encryption**: Encrypt/Decrypt text with a passphrase.

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
