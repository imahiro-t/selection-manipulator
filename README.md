# Selection Manipulator

**The Ultimate Text Processing Toolkit for VS Code**

Selection Manipulator offers over **200 powerful tools** to manipulate, transform, and analyze text directly in your editor. From everyday tasks like sorting and JSON formatting to advanced cryptography, network analysis, and Japanese text conversion, this extension supercharges your workflow.

## ✨ Features

### 📝 Text Manipulation
*   **Sort**: Organize lines or selections by string, number, or occurrence (Ascending/Descending).
*   **Unique**: Instantly remove duplicate lines.
*   **Extract**: Filter and extract matching text, lines, emails, URLs, IPs, or lines by length (equal/less/greater) to a new tab or clipboard.
*   **Edit**: Reverse text, shuffle content, remove cursors, and separate multi-selections.
*   **Insert**: Date (ISO, Locale, Timestamp), Markdown Link, Quoted Text (Single, Double, Backtick).
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

## ⌨️ Shortcuts Reference

| Task | Command | Description |
| :--- | :--- | :--- |
| **Case** | `Change Case ...` | Camel, Snake, Kebab, Pascal, Title (Smart), SpongeBob, etc. |
| **Sort** | `Sort Lines ...` | Ascending/Descending by String, Number, Occurrence, Length. |
| **Format** | `Format JSON` | Prettify minified JSON. |
| **Hash** | `Create Hash (SHA-256)` | Hash your selection. |
| **UUID** | `Random UUID` | Insert a new UUID. |
| **Escape** | `Escape Text` | Make text JSON-safe. |
| **DNS** | `Lookup DNS A Record` | Get IP for a domain. |

