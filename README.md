# Selection Manipulator

**The Ultimate Text Processing Toolkit for VS Code**

Selection Manipulator offers over **250 powerful tools** to manipulate, transform, and analyze text directly in your editor. From everyday tasks like sorting and JSON formatting to advanced cryptography, network analysis, and Japanese text conversion, this extension supercharges your workflow.

## ✨ Features

### 📝 Text Manipulation
*   **Sort**: Organize lines or selections by string, number, or occurrence (Ascending/Descending).
*   **Unique**: Instantly remove duplicate lines.
*   **Extract**: Filter and extract matching text, lines, emails, URLs, IPs, or lines by length (equal/less/greater) to a new tab or clipboard.
*   **Edit**: Reverse text, shuffle content, remove cursors, and separate multi-selections.
*   **Insert**: Date (ISO, Locale, Timestamp), Markdown Link, Enclosed Text (Quotes, Brackets, Japanese Symbols).
*   **Format**: Remove blank rows, zero-pad numbers, and more.
*   **Cleanup**: Remove empty lines, line numbers, join/split lines, trim lines (Start/End/All), normalize whitespace, strip HTML, unsmart quotes, remove duplicate lines.
*   **Advanced Case**: Smart Title Case, SpongeBob Case, Screaming Snake, Humanize, Slugify, Remove Accents.
*   **Math**: Sum, Average, Min, Max, Hex <-> Decimal.
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

#### Zero Padding
Pads numbers with leading zeros.
**Example:**
*Before:*
```text
1
20
300
```
*After:*
```text
001
020
300
```

#### Toggle Quotes
Toggles between single (`'`) and double (`"`) quotes.
**Example:**
*Before:*
```javascript
const a = "Hello";
const b = 'World';
```
*After:*
```javascript
const a = 'Hello';
const b = "World";
```

#### Enclose Text
Encloses selected text with various characters.
*   **Quotes**: `'Single'`, `"Double"`, `` `Backtick` ``
*   **Brackets**: `(Paren)`, `[Square]`, `{Curly}`, `<Angle>`
*   **Japanese**: `「Single」`, `『Double』`, `【Bracket】`, `＜Angle＞`, `（Paren）`, `［Square］`, `｛Curly｝`

#### Markdown Link
Creates a Markdown link from selected text and clipboard URL (or vice versa).
*   **Selection**: `Google` + **Clipboard**: `https://google.com` -> `[Google](https://google.com)`

#### Mask with Asterisk
Masks the selected text with asterisks (`*`).
*   **Selection**: `password123` -> `***********`

#### Insert Date
Inserts current date/time.
*   **ISO 8601**: `2023-12-27T12:00:00.000Z`
*   **Locale String**: `12/27/2023, 12:00:00 PM` (varies by system)
*   **Unix Timestamp**: `1703678400`

*   **Remove Empty Lines**: Removes lines containing only whitespace.
*   **Remove Line Numbers**: Removes leading numbering (e.g., `1.`, `[1]`, `1)`).
*   **Trim All Lines**: Removes leading/trailing whitespace from each line.
*   **Trim Trailing Whitespace**: Removes trailing whitespace from each line.
*   **Remove Duplicate Lines**: Removes textually identical lines (keeps first occurrence).
*   **Join Lines**: Joins selected lines with spaces or commas.
*   **Split Lines**: Splits selected text by spaces or commas into new lines.

### 2. Sort, Unique & Shuffle

#### Sort Lines
Sorts selected lines alphabetically or numerically.
*   **Variations**: String/Number, Ascending/Descending, Sort Lines/Sort Selections.

**Example (Sort Lines String Ascending):**
*Before:*
```text
Banana
Apple
Cherry
```
*After:*
```text
Apple
Banana
Cherry
```

#### Unique Selections
Removes duplicate lines from the selection.

**Example:**
*Before:*
```text
Apple
Banana
Apple
```
*After:*
```text
Apple
Banana
```

#### Shuffle
Randomly shuffles the selected lines or selections.

### 3. Extraction

#### Extract Lines
Extracts lines that satisfy a condition (like regex match) or simply extracts the selected lines to a new tab.

#### Extract Lines by Length
Extracts lines based on character count.
*   **Equal**: Lines with exactly N characters.
*   **Less Than or Equal**: Lines with N or fewer characters.
*   **Greater Than or Equal**: Lines with N or more characters.
*   **Range**: Lines with length between X and Y characters (inclusive). Input format: `min,max` or `min-max`.

#### Extract Specific Data
Extracts specific formats from the text.
*   **Email**: `support@example.com`
*   **URL**: `https://example.com`
*   **IP Address**: `192.168.1.1`

**Example (Extract Email):**
*Before:*
```text
Contact us at support@example.com or sales@test.co.jp.
```
*After:*
```text
support@example.com
sales@test.co.jp
```

### 4. Case Conversion
Converts text between various cases.
*   **Supported Cases**: Camel, Pascal, Snake, Kebab, Upper, Lower, Capital, Sentence, Constant, Dot, Path, Title (Smart), SpongeBob, Screaming Snake, Humanize, Slugify.
*   **Styles**: Remove Accents (Diacritics).

**Example (Snake to Camel):**
*Before:* `user_id`
*After:* `userId`

**Example (Upper):**
*Before:* `hello`
*After:* `HELLO`

**Example (Title Case - Smart):**
*Before:* `the quick brown fox`
*After:* `The Quick Brown Fox`

**Example (SpongeBob):**
*Before:* `hello world`
*After:* `hElLo wOrLd`

**Example (Remove Accents):**
*Before:* `Crème Brûlée`
*After:* `Creme Brulee`

### 5. Data Transformation

#### JSON / XML / YAML
*   **Format (Pretty Print)**: Formats minified code.
*   **Minify**: Compresses code into a single line.
*   **JSON <-> YAML**: Converts between JSON and YAML formats.
*   **Stringify/Parse JSON**: Escapes or unescapes JSON strings.
*   **Flatten/Unflatten**: Converts nested JSON to dot-notation keys and vice versa.
*   **XML to JSON**: Converts XML structure to JSON object.

**Example (JSON to YAML):**
*Before:*
```json
{"name": "John", "age": 30}
```
*After:*
```yaml
name: John
age: 30
```

#### Base64
Encodes or decodes text to/from Base64.
**Example (Encode):**
*Before:* `Hello`
*After:* `SGVsbG8=`

#### URL Encode/Decode
**Example (Encode Component):**
*Before:* `Hello World`
*After:* `Hello%20World`

#### Escape / Unescape
Handles standard string escaping (e.g., newlines, quotes).
**Example (Escape):**
*Before:*
```text
Line 1
Line 2
```
*After:*
```text
Line 1\nLine 2
```

### 6. Cryptography & Security

#### Hash & HMAC
Generates cryptographic hashes.
*   **Algorithms**: MD5, SHA-1, SHA-256, SHA-512.

**Example (SHA-256):**
*Before:* `test`
*After:* `9f86d081884c7d659a2feaa0c55ad015a3bf4f1b2b0b822cd15d6c15b0f00a08`

#### AES Encryption
Encrypts or decrypts text using AES. (Prompts for passphrase).

#### Decode Tokens/Certs
*   **JWT Decode**: Decodes a JSON Web Token to see the payload.
*   **SAML Decode**: Decodes SAML requests/responses.
*   **X.509 Decode**: Displays certificate details.

### 7. Programmatic Conversions

#### Color Conversion (Hex <-> RGB)
**Example:**
*Before:* `#ffffff`
*After:* `rgb(255, 255, 255)`

### 8. Calculation & Numbers

#### Increment / Decrement
Increments or decrements numbers found in the selection.
*   **Variations**: From 1, From N, By 1, By N.

**Example (Increment from 1):**
*Before (Selections):* `item`, `item`, `item`
*After:* `1`, `2`, `3`

#### Calculation
Evaluates mathematical expressions.
**Example:**
*Before:* `1 + 2 * 3`
*After:* `7`



#### Math Statistics
Calculates statistics for numbers found in the selection.
*   **Sum**: Sum of all numbers.
*   **Average**: Average of numbers.
*   **Min**: Minimum number.
*   **Max**: Maximum number.

#### Date Calculation
Converts timestamps to ISO strings or performs simple date math.

### 9. Japanese Text Conversion
*   **Full-width <-> Half-width**: Converts alphanumeric characters.
*   **Hiragana <-> Katakana**: Converts Japanese syllabaries.

**Example (Hiragana to Katakana):**
*Before:* `あいうえお`
*After:* `アイウエオ`

### 10. Network Tools
*   **DNS Lookup**: Performs DNS queries (A, AAAA, MX, TXT, etc.) for selected domains.
*   **Whois**: Retrieves WHOIS information.
*   **IP Geolocation**: Shows geographical info for an IP address.

### 11. Text Cleanup
*   **Remove Empty Lines**
*   **Remove Line Numbers** (e.g. `1. code` -> `code`)
*   **Trim All Lines**
*   **Join Lines** (Space / Comma)
*   **Split Lines** (Space / Comma)
*   **Normalize Whitespace**: `a   b` -> `a b`
*   **Strip HTML Tags**: `<b>bold</b>` -> `bold`
*   **Unsmart Quotes**: `“quote”` -> `"quote"`

### 12. Calculation & Unit
*   **Math Statistics**: Sum, Average, Min, Max.
*   **Base Conversion**: Hex <-> Decimal.
*   **Date**: Calculate days between dates.
*   **Unit Conversion**:
    *   **Length**: px <-> rem (Base 16).
    *   **Weight**: kg <-> lb.

### 13. Other Utilities
*   **Sort**: Sort lines by String, Number, Occurrence, or **Length**.
*   **Random Generators**:
    *   **UUID**: Generates a random UUID v4.
    *   **Password**: Generates a secure 16-character password.
    *   **IPv4 / IPv6**: Generates random IP addresses.
    *   **Lorem Ipsum**: Generates a paragraph of Lorem Ipsum text.
*   **HAR to Mermaid**: Converts HAR (HTTP Archive) text to a Mermaid sequence diagram.
*   **Regex**: Applies a regular expression to the selection.


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

