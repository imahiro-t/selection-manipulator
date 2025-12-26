# Selection Manipulator

**The Ultimate Text Processing Toolkit for VS Code**

Selection Manipulator offers over **150 powerful tools** to manipulate, transform, and analyze text directly in your editor. From everyday tasks like sorting and JSON formatting to advanced cryptography, network analysis, and Japanese text conversion, this extension supercharges your workflow.

## ✨ Features

### 📝 Text Manipulation
*   **Sort**: Organize lines or selections by string, number, or occurrence (Ascending/Descending).
*   **Unique**: Instantly remove duplicate lines.
*   **Extract**: Filter and extract matching text, lines, emails, URLs, or IPs to a new tab or clipboard.
*   **Edit**: Reverse text, shuffle content, remove cursors, and separate multi-selections.
*   **Format**: Remove blank rows, zero-pad numbers, and more.

### 💻 Developer Utilities
*   **JSON & XML**: Format (Pretty Print), Minify, Stringify, and Parse with ease.
*   **Encoding**: Base64 Encode/Decode/Deflate/Inflate.
*   **Case Conversion**: Switch between Camel, Snake, Kebab, Pascal, Constant, Dot, Path, Sentence, and Title cases.
*   **Escaping**: Escape/Unescape text (JSON stringify/parse compatibility).
*   **Programmatic**: Convert between JSON<->YAML, Hex<->RGB, and toggle quotes.

### 🔐 Cryptography & Security
*   **Hashing**: Generate MD5, SHA-1, SHA-256, and SHA-512 hashes.
*   **HMAC**: Create HMAC-SHA256, HMAC-SHA512, and HMAC-MD5 signatures.
*   **Encryption**: Securely Encrypt and Decrypt text using AES.
*   **Decoders**: Decode JWT, SAML Request/Response, and X.509 Certificates.

### 🌐 Network & Analysis
*   **DNS**: Perform comprehensive DNS lookups (A, AAAA, MX, NS, TXT, etc.).
*   **Whois**: Quick domain Whois lookups.
*   **IP Geolocation**: Get location data for IP addresses.
*   **HAR Visualization**: Visualize HTTP Archive (HAR) logs as Mermaid Sequence Diagrams.

### 🇯🇵 Japanese Text Support
*   **Width Conversion**: Convert between Full-width and Half-width characters (including Katakana).
*   **Kana Conversion**: Convert between Hiragana and Katakana.

### 🎨 Fun & Generators
*   **Mock Data**: Generate Random UUIDs.
*   **ASCII Art**: Generate "Cowsay" speech bubbles.
*   **Math**: Evaluate mathematical expressions instantly.

## 🚀 Key Usage

1.  **Select** the text you want to process.
2.  Open **Command Palette** (`Cmd+Shift+P` / `Ctrl+Shift+P`).
3.  Type `Selection Manipulator` to explore all commands.
4.  (Or right-click and use the context menu).

> **Pro Tip**: Commands that generate output in a new tab (e.g., Base64 Encode) now open a **Read-Only** tab. This prevents the "Save changes?" prompt when closing the tab. These tabs persist until manually closed.

## ⌨️ Shortcuts Reference

| Task | Command | Description |
| :--- | :--- | :--- |
| **Sort** | `Sort Lines Ascending` | Alphabetize your selection. |
| **Format** | `Format JSON` | Prettify minified JSON. |
| **Hash** | `Create Hash (SHA-256)` | Hash your selection. |
| **UUID** | `Random UUID` | Insert a new UUID. |
| **Escape** | `Escape Text` | Make text JSON-safe. |
| **DNS** | `Lookup DNS A Record` | Get IP for a domain. |

## 📅 Release Notes

## 0.0.30

- 🐛 Fix Half-width Katakana conversion
- 💄 Suppress "Save changes?" confirmation for result tabs
- 💄 Ensure result tabs persist (disable preview mode)

## 0.0.29

- ✨ Add ASCII Art (Cowsay) generation
- ✨ Enhance full-width to half-width conversion to support Kana

## 0.0.28

- ✨ Add SHA1, SHA256, SHA512, MD5 Hash generation (with Replace option)
- ✨ Add Email, URL, IP Extraction tools (with Replace option)
- ✨ Add Japanese Text Conversion (Full/Half width, Hiragana/Katakana)
- ✨ Add Programmatic Tools (JSON<->YAML, Hex<->RGB, Toggle Quotes)

## 0.0.27

- ✨ Add Random UUID generation
- ✨ Add Text Escape and Unescape tools (JSON style)

## 0.0.26

- ✨ Add Unix timestamp (seconds) to date calculation output

## 0.0.24

- ✨ Add tool to copy to clipboard instead of open other document

## 0.0.23

- ✨ Add tool to sort line by occurrence

## 0.0.22

- ✨ Add tool to encrypt or decrypt by AES

## 0.0.21

- 💄 no header or no footer accepted for decoding X509 Certification

## 0.0.20

- ✨ Add tool to get token with Client Credentials Flow

## 0.0.19

- ✨ Add tool to replace mode for json, xml and base64

## 0.0.18

- ✨ Add tool to extract lines in selection

## 0.0.17

- ✨ Add tool to sort line (not selection)

## 0.0.16

- ✨ Add tool for IP Geolocation lookup

## 0.0.15

- ✨ Add tool to remove one character from each side

## 0.0.14

- ✨ Add tool to remove cursor above or below

## 0.0.13

- ✨ Add tool to decode X509 Certification
- ✨ Add tool to create Hash
- ✨ Add tool to create HMAC

## 0.0.12

- 🎨 Adjust second timestamp to millisecond timestamp

## 0.0.11

- ✨ Add tool to transform HAR to Sequence Diagram

## 0.0.10

- ✨ Add tool for DNS Lookup

## 0.0.9

- ⚡️ Bundling Extensions

## 0.0.8

- ✨ Add tools for WHOIS

## 0.0.7

- ✨ Add tools for URL
- ✨ Add tool to decode JWT
- ✨ Add tool to decode SAML Request / Response

## 0.0.6

- 💄 Commands that cannot be used in multiple selection mode are now hidden
- 💄 In base64, only single selection is allowed

## 0.0.5

- 🐛 Fix Case tools to work
- ✨ Add tool to show command list at command pallet
- ✨ Add tools for DNS
- 💄 Change zero padding behavior to replace
- 💄 Open a new document in the beside column only when the first column is operated
- 💄 Change regex title decoration
- 💄 Change calculation output format

## 0.0.4

- 💥 Remove select others tools (instead use ⇧⌘L)
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

## 0.0.3

- ✨ Add base64 tools
- ✨ Add regex check tool
- 💄 Change to open editor beside
- 💄 Change application name

### 0.0.2

- ✨ Add transformer for JSON

### 0.0.1

- 🎉 Initial release
