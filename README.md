# Selection Manipulator

**Selection Manipulator** is a powerful VS Code extension offering over 100 tools for text processing, data transformation, cryptography, and network analysis. Extract, sort, encode, encrypt, and visualize your data directly within the editor.

## ✨ Features

### 📝 Text Processing & Manipulation
*   **Sort**: Sort selections or lines by string, number, or occurrence (Ascending/Descending).
*   **Unique / Deduplicate**: Remove duplicate lines from selections.
*   **Extract**: Extract matching text or lines (optionally excluding blank rows) to a new tab or clipboard.
*   **Edit**: Reverse text, shuffle content, remove cursors, and convert single selection to multi-selection.

### 🔄 Formatting & Transformation
*   **JSON & XML**: Format (Pretty Print), Minify, Stringify, and Parse.
*   **Case Conversion**: Convert between Camel, Snake, Kebab, Pascal, Constant, Dot, Path, Sentence, and Title cases.
*   **Numbers**: Zero padding, Increment/Decrement (from 1, from N, by 1, by N).
*   **Date & Time**: Convert Unix timestamps to ISO 8601 and vice-versa. Includes milliseconds support.
*   **Math**: Calculate mathematical expressions instantly.

### 🔐 Encoding, Decoding & Cryptography
*   **Base64**: Encode, Decode, Deflate, and Inflate.
*   **URL**: Encode and Decode URI components.
*   **Security**: Decode JWT (JSON Web Tokens), SAML Requests/Responses, and X.509 Certificates.
*   **Hashing**: Generate SHA-256, SHA-512, and MD5 hashes.
*   **HMAC**: Create HMAC-SHA256, HMAC-SHA512, and HMAC-MD5.
*   **Encryption**: AES Encryption and Decryption.

### 🌐 Network Tools
*   **DNS Lookup**: Query A, AAAA, CNAME, MX, NS, PTR, SOA, SRV, TXT, CAA, and NAPTR records.
*   **WHOIS**: Perform WHOIS lookups for domains.
*   **IP Geolocation**: Lookup geolocation data for IP addresses.

### 📊 Visualization & Utilities
*   **HAR Visualization**: Convert HAR (HTTP Archive) text to Mermaid Sequence Diagrams or Images.
*   **Regular Expressions**: Test regex patterns (`/g`, `/gi`) against selections.
*   **OAuth**: Helper for Client Credentials Flow text generation.
*   **Random Data**: Generate Random UUIDs.
*   **Text Escape**: Escape and Unescape text (JSON stringify/parse).

## 🚀 Usage

1.  Select the text you want to process.
2.  Open the **Command Palette** (`Cmd+Shift+P` on Mac / `Ctrl+Shift+P` on Windows).
3.  Type `Selection Manipulator` to see all available commands.
4.  Alternatively, right-click the selection and choose **Selection Manipulator** from the context menu.

### Programmatic & Japanese Support
*   **Programmatic**: Convert JSON<->YAML, RGB<->Hex, Toggle Quotes.
*   **Japanese**: Convert Full/Half width, Hiragana/Katakana.

### Enhanced Crypto & Extraction
*   **Hashing**: MD5, SHA1, SHA256, SHA512 (Insert or Replace).
*   **Extraction**: Emails, URLs, IPs (New Tab or Replace).

## ⌨️ Key Commands

| Category | Command Example | Description |
| :--- | :--- | :--- |
| **Sort** | `Sort Lines Ascending` | Sorts selected lines alphabetically. |
| **JSON** | `Format JSON` | Prettifies minified JSON. |
| **Crypto** | `Create Hash (SHA-256)` | Replaces selection with its SHA-256 hash. |
| **Random** | `Random UUID` | Generates a random UUID. |
| **Escape** | `Escape Text` | Escapes special characters (e.g. quotes, newlines). |
| **Net** | `Lookup DNS A Record` | Performs a DNS lookup for the selected domain. |
| **Vis** | `HAR to Sequence Diagram` | Generates a Mermaid diagram from HAR data. |

## 📅 Release Notes

## 0.0.27

- ✨ Add Random UUID generation
- ✨ Add Text Escape and Unescape tools (JSON style)

## 0.0.28

- ✨ Add SHA1, SHA256, SHA512, MD5 Hash generation (with Replace option)
- ✨ Add Email, URL, IP Extraction tools (with Replace option)
- ✨ Add Japanese Text Conversion (Full/Half width, Hiragana/Katakana)
- ✨ Add Programmatic Tools (JSON<->YAML, Hex<->RGB, Toggle Quotes)

## 0.0.27

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
