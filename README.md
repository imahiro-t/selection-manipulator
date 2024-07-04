# Selection Manipulator

Processing tools for selected text: extract unique lines, sort lines, count occurrences, format JSON or XML, case chang, encode or decode Base64, decode JWT, SAML assertion, X509, lookup WHOIS or GEO IP, DNS...

## Features

Processing tools for selected text.

We currently offer almost 80+ features, but we plan to add more gradually.

### sample - increment and zero padding

![sample - increment and zero padding](images/sample-increment-zero-padding.gif)

### sample - DNS

![sample - DNS](images/sample-dns.gif)

## Commands

| TITLE                                | DESCRIPTION                                                                          | ID                                             |
| ------------------------------------ | ------------------------------------------------------------------------------------ | ---------------------------------------------- |
| Remove Cursor Above                  | Remove Cursor Above                                                                  | selection-manipulator.remove-cursor-above      |
| Remove Cursor Below                  | Remove Cursor Below                                                                  | selection-manipulator.remove-cursor-below      |
| Remove One Character from Each Side  | Remove One Character from Each Side                                                  | remove-character-from-each-side                |
| Show Selection Manipulation Commands | Show Selection Manipulation Commands                                                 | selection-manipulator.show-commands            |
| Convert to Multi Selection           | Convert to multi selections (cursors) from single selection                          | selection-manipulator.multi-selection          |
| Extract Lines                        | Extract selected text to a new editor page                                           | selection-manipulator.extract                  |
| Extract Lines exclude Blank Rows     | Extract selected text to exclude blank rows to a new editor page                     | selection-manipulator.extract                  |
| Unique Lines                         | Unique selected text to a new editor page                                            | selection-manipulator.unique                   |
| Reverse Lines                        | Reverse selected text to a new editor page                                           | selection-manipulator.reverse                  |
| Shuffle Lines                        | Shuffle selected text to a new editor page                                           | selection-manipulator.shuffle                  |
| Sort Lines Ascending by string       | Sort lines ascending by string to a new editor page                                  | selection-manipulator.sort.string.ascending    |
| Sort Lines Descending by string      | Sort lines descending by string to a new editor page                                 | selection-manipulator.sort.string.descending   |
| Sort Lines Ascending by number       | Sort lines ascending by number to a new editor page                                  | selection-manipulator.sort.number.ascending    |
| Sort Lines Descending by number      | Sort lines descending by number to a new editor page                                 | selection-manipulator.sort.number.descending   |
| Format JSON                          | Format JSON to a new editor page                                                     | selection-manipulator.json.format              |
| Minify JSON                          | Minify JSON to a new editor page                                                     | selection-manipulator.json.minify              |
| Parse JSON                           | Parse JSON to a new editor page                                                      | selection-manipulator.json.parse               |
| Stringify JSON                       | Stringify JSON to a new editor page                                                  | selection-manipulator.json.stringify           |
| Format XML                           | Format XML to a new editor page                                                      | selection-manipulator.xml.format               |
| Minify XML                           | Minify XML to a new editor page                                                      | selection-manipulator.xml.minify               |
| Encode Base64                        | Encode Base64 to a new editor page                                                   | selection-manipulator.base64.encode            |
| Decode Base64                        | Decode Base64 to a new editor page                                                   | selection-manipulator.base64.decode            |
| Deflate Base64                       | Deflate Base64 to a new editor page                                                  | selection-manipulator.base64.deflate           |
| Inflate Base64                       | Inflate Base64 to a new editor page                                                  | selection-manipulator.base64.inflate           |
| Parse URL to JSON                    | Parse URL to JSON to a new editor page                                               | selection-manipulator.url.parse                |
| Encode URI                           | Encode URI to a new editor page                                                      | selection-manipulator.url.encode-uri           |
| Decode URI                           | Decode URI to a new editor page                                                      | selection-manipulator.url.decode-uri           |
| Encode URI Component                 | Encode URI Component to a new editor page                                            | selection-manipulator.url.encode-uri-component |
| Decode URI Component                 | Decode URI Component to a new editor page                                            | selection-manipulator.url.decode-uri-component |
| Decode JWT                           | Decode JWT to a new editor page                                                      | selection-manipulator.jwt.decode               |
| Decode SAML Request / Response       | Decode SAML Request / Response to a new editor page                                  | selection-manipulator.saml.decode              |
| Decode X509 Certification            | Decode X509 Certification to a new editor page                                       | selection-manipulator.crypto.x509              |
| Create Hash (SHA-256)                | Create Hash (SHA-256) to a new editor page                                           | selection-manipulator.crypto.hash-sha256       |
| Create Hash (SHA-512)                | Create Hash (SHA-512) to a new editor page                                           | selection-manipulator.crypto.hash-sha512       |
| Create Hash (MD5)                    | Create Hash (MD5) to a new editor page                                               | selection-manipulator.crypto.hash-md5          |
| Create HMAC (SHA-256)                | Create HMAC (SHA-256) to a new editor page                                           | selection-manipulator.crypto.hmac-sha256       |
| Create HMAC (SHA-512)                | Create HMAC (SHA-512) to a new editor page                                           | selection-manipulator.crypto.hmac-sha512       |
| Create HMAC (MD5)                    | Create HMAC (MD5) to a new editor page                                               | selection-manipulator.crypto.hmac-md5          |
| Count Occurrences sorting by count   | Count occurrences sorting by count to a new editor page                              | selection-manipulator.count-occurrences.count  |
| Count Occurrences sorting by word    | Count occurrences sorting by word to a new editor page                               | selection-manipulator.count-occurrences.word   |
| Count Up to List                     | Count up number and make list to a new editor page                                   | selection-manipulator.count-up-list            |
| HAR to Sequence Diagram Mermaid      | HAR (HTTP Archive) to Sequence Diagram Mermaid to a new editor page                  | selection-manipulator.har-to-mermaid           |
| HAR to Sequence Diagram Image        | HAR to Sequence Diagram Image to a new editor page                                   | selection-manipulator.har-to-mermaid           |
| Change Case Camel                    | Change Case Camel                                                                    | selection-manipulator.case.camel               |
| Change Case Capital                  | Change Case Capital                                                                  | selection-manipulator.case.capital             |
| Change Case Constant                 | Change Case Constant                                                                 | selection-manipulator.case.constant            |
| Change Case Dot                      | Change Case Dot                                                                      | selection-manipulator.case.dot                 |
| Change Case Kebab                    | Change Case Kebab                                                                    | selection-manipulator.case.kebab               |
| Change Case No                       | Change Case No                                                                       | selection-manipulator.case.no                  |
| Change Case Pascal                   | Change Case Pascal                                                                   | selection-manipulator.case.pascal              |
| Change Case Path                     | Change Case Path                                                                     | selection-manipulator.case.path                |
| Change Case Sentence                 | Change Case Sentence                                                                 | selection-manipulator.case.sentence            |
| Change Case Snake                    | Change Case Snake                                                                    | selection-manipulator.case.snake               |
| Change Case Train                    | Change Case Train                                                                    | selection-manipulator.case.train               |
| Change Case Upper                    | Change Case Upper                                                                    | selection-manipulator.case.upper               |
| Change Case Lower                    | Change Case Lower                                                                    | selection-manipulator.case.lower               |
| Zero Padding                         | Zero padding to a new editor page                                                    | selection-manipulator.zero-padding             |
| Increment from 1                     | Increment from 1                                                                     | selection-manipulator.increment-from-1         |
| Increment from N                     | Increment from N                                                                     | selection-manipulator.increment-from-n         |
| Decrement to 1                       | Decrement to 1                                                                       | selection-manipulator.decrement-to-1           |
| Decrement to N                       | Decrement to N                                                                       | selection-manipulator.decrement-to-n           |
| Increment by 1                       | Increment by 1                                                                       | selection-manipulator.increment-by-1           |
| Increment by N                       | Increment by N                                                                       | selection-manipulator.increment-by-n           |
| Decrement by 1                       | Decrement by 1                                                                       | selection-manipulator.decrement-by-1           |
| Decrement by N                       | Decrement by N                                                                       | selection-manipulator.decrement-by-n           |
| Lookup WHOIS                         | Lookup WHOIS to a new editor page                                                    | selection-manipulator.whois                    |
| Lookup IP Geolocation                | Lookup IP Geolocation to a new editor page                                           | selection-manipulator.geo-ip                   |
| Lookup DNS A Record                  | Lookup DNS A Record to a new editor page                                             | selection-manipulator.dns.a                    |
| Lookup DNS AAAA Record               | Lookup DNS AAAA Record to a new editor page                                          | selection-manipulator.dns.aaaa                 |
| Lookup DNS ANY Record                | Lookup DNS ANY Record to a new editor page                                           | selection-manipulator.dns.any                  |
| Lookup DNS CAA Record                | Lookup DNS CAA Record to a new editor page                                           | selection-manipulator.dns.caa                  |
| Lookup DNS CNAME Record              | Lookup DNS CNAME Record to a new editor page                                         | selection-manipulator.dns.cname                |
| Lookup DNS MX Record                 | Lookup DNS MX Record to a new editor page                                            | selection-manipulator.dns.mx                   |
| Lookup DNS NAPTR Record              | Lookup DNS NAPTR Record to a new editor page                                         | selection-manipulator.dns.naptr                |
| Lookup DNS NS Record                 | Lookup DNS NS Record to a new editor page                                            | selection-manipulator.dns.ns                   |
| Lookup DNS PTR Record                | Lookup DNS PTR Record to a new editor page                                           | selection-manipulator.dns.ptr                  |
| Lookup DNS SOA Record                | Lookup DNS SOA Record to a new editor page                                           | selection-manipulator.dns.soa                  |
| Lookup DNS SRV Record                | Lookup DNS SRV Record to a new editor page                                           | selection-manipulator.dns.srv                  |
| Lookup DNS TXT Record                | Lookup DNS TXT Record to a new editor page                                           | selection-manipulator.dns.txt                  |
| Lookup DNS IP from Hostname          | Lookup DNS IP from Hostname to a new editor page                                     | selection-manipulator.dns.lookup               |
| Lookup DNS Hostname from IP          | Lookup DNS Hostname from IP to a new editor page                                     | selection-manipulator.dns.reverse              |
| Calculate Mathematical Expression    | Calculate Mathematical Expression to a new editor page                               | selection-manipulator.calculation              |
| Transform to Timestamp and ISO 8601  | Convert to timestamp and ISO 8601 from timestamp or date format to a new editor page | selection-manipulator.calculation.date         |
| Regular Expression (/PATTERN/g)      | Regular Expression to a new editor page (/PATTERN/g)                                 | selection-manipulator.regex.g                  |
| Regular Expression (/PATTERN/gi)     | Regular Expression to a new editor page (/PATTERN/gi)                                | selection-manipulator.regex.gi                 |

## Release Notes

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
