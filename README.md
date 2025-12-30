# Selection Manipulator

**The Ultimate Text Processing Toolkit for VS Code**

Selection Manipulator offers over **250 powerful tools** to manipulate, transform, and analyze text directly in your editor. From everyday tasks like sorting and JSON formatting to advanced cryptography, network analysis, and Japanese text conversion, this extension supercharges your workflow.

## ✨ Features

### 📝 Text Manipulation
*   **Sort**: Organize lines or selections by string, number, occurrence, or length (Ascending/Descending).
*   **Unique**: Instantly remove duplicate lines.
*   **Extract**: Filter and extract matching text, lines, emails, URLs, IPs, or lines by length (equal/less/greater) to a new tab or clipboard.
*   **Edit**: Reverse text, shuffle content, remove cursors, separate multi-selections, remove characters from edges, mask text.
*   **Insert**: Date (ISO, Locale, Timestamp), Markdown Link, Enclosed Text (Quotes, Brackets, Japanese Symbols).
*   **Format**: Remove blank rows, zero-pad numbers, and more.
*   **Cleanup**: Remove empty lines, line numbers, join/split lines, trim lines (Start/End/All), normalize whitespace, strip HTML, unsmart quotes, remove duplicate lines.
*   **Advanced Case**: Smart Title Case, SpongeBob Case, Screaming Snake, Humanize, Slugify, Remove Accents.
*   **Math**: Sum, Average, Min, Max, Hex <-> Decimal, Date Calculation.
*   **Unit Conversion**: px <-> rem, kg <-> lb.
*   **CSV**: Convert between CSV and Markdown Table.

### 💻 Developer Utilities
*   **JSON & XML**: Format (Pretty Print), Minify, Stringify, Parse, Flatten/Unflatten JSON, XML<->JSON.
*   **Encoding**: Base64 Encode/Decode/Deflate/Inflate.
*   **Case Conversion**: Switch between Camel, Snake, Kebab, Pascal, Constant, Dot, Path, Sentence, and Title cases.
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
*   **Whois**: Quick domain Whois lookups.
*   **IP Geolocation**: Get location data for IP addresses.
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
*   **Convert to Multi Selection**: Splits a multi-line selection into individual cursors (one per line).

#### Edit & Enclose
*   **Reverse Selections**: Reverses the order of characters in the selection.
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

### 3. Sort, Unique & Shuffle

#### Sort Lines
Sorts selected lines based on various criteria.
*   **Criteria**: String, Number, Line Length, Occurrence Count.
*   **Order**: Ascending, Descending.
*   **Variations**: Sort the entire line or just the selection.

#### Unique & Shuffle
*   **Unique Selections**: Removes duplicate lines.
*   **Shuffle**: Randomly shuffles the selected lines or selections.

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
*   **Whois**: Domain registration info.
*   **IP Geolocation**: Country, City, ISP data.
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

