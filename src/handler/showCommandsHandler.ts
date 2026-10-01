import {
  TextEditor,
  window,
  commands,
} from 'vscode';

export const myCommands = [
  {
    "command": "selection-manipulator.multi-selection",
    "title": "Select - Convert to Multi Selection",
    "canMultiSelection": false
  },
  {
    "command": "selection-manipulator.multi-selection.interval",
    "title": "Select - Convert to Multi Selection (Interval)",
    "canMultiSelection": false
  },
  {
    "command": "selection-manipulator.extract",
    "title": "Extract - Extract Selections",
    "canMultiSelection": true
  },
  {
    "command": "selection-manipulator.extract.clipboard",
    "title": "Extract - Extract Selections (Clipboard)",
    "canMultiSelection": true
  },
  {
    "command": "selection-manipulator.extract.exclude-blank-rows",
    "title": "Extract - Extract Selections exclude Blank Rows",
    "canMultiSelection": true
  },
  {
    "command": "selection-manipulator.extract.exclude-blank-rows.clipboard",
    "title": "Extract - Extract Selections exclude Blank Rows (Clipboard)",
    "canMultiSelection": true
  },
  {
    "command": "selection-manipulator.extract-line",
    "title": "Extract - Extract Lines in Selection",
    "canMultiSelection": true
  },
  {
    "command": "selection-manipulator.extract-line.clipboard",
    "title": "Extract - Extract Lines in Selection (Clipboard)",
    "canMultiSelection": true
  },
  {
    "command": "selection-manipulator.unique",
    "title": "Extract - Unique Selections",
    "canMultiSelection": true
  },
  {
    "command": "selection-manipulator.unique.clipboard",
    "title": "Extract - Unique Selections (Clipboard)",
    "canMultiSelection": true
  },
  {
    "command": "selection-manipulator.reverse",
    "title": "Extract - Reverse Selections",
    "canMultiSelection": true
  },
  {
    "command": "selection-manipulator.reverse.clipboard",
    "title": "Extract - Reverse Selections (Clipboard)",
    "canMultiSelection": true
  },
  {
    "command": "selection-manipulator.reverse.string",
    "title": "Extract - Reverse Strings in Selection",
    "canMultiSelection": true
  },
  {
    "command": "selection-manipulator.reverse.string.clipboard",
    "title": "Extract - Reverse Strings in Selection (Clipboard)",
    "canMultiSelection": true
  },
  {
    "command": "selection-manipulator.shuffle",
    "title": "Extract - Shuffle Selections",
    "canMultiSelection": true
  },
  {
    "command": "selection-manipulator.shuffle.clipboard",
    "title": "Extract - Shuffle Selections (Clipboard)",
    "canMultiSelection": true
  },
  {
    "command": "selection-manipulator.sort.string.ascending",
    "title": "Extract - Sort Selections Ascending by string",
    "canMultiSelection": true
  },
  {
    "command": "selection-manipulator.sort.string.ascending.clipboard",
    "title": "Extract - Sort Selections Ascending by string (Clipboard)",
    "canMultiSelection": true
  },
  {
    "command": "selection-manipulator.sort.string.descending",
    "title": "Extract - Sort Selections Descending by string",
    "canMultiSelection": true
  },
  {
    "command": "selection-manipulator.sort.string.descending.clipboard",
    "title": "Extract - Sort Selections Descending by string (Clipboard)",
    "canMultiSelection": true
  },
  {
    "command": "selection-manipulator.sort.number.ascending",
    "title": "Extract - Sort Selections Ascending by number",
    "canMultiSelection": true
  },
  {
    "command": "selection-manipulator.sort.number.ascending.clipboard",
    "title": "Extract - Sort Selections Ascending by number (Clipboard)",
    "canMultiSelection": true
  },
  {
    "command": "selection-manipulator.sort.number.descending",
    "title": "Extract - Sort Selections Descending by number",
    "canMultiSelection": true
  },
  {
    "command": "selection-manipulator.sort.number.descending.clipboard",
    "title": "Extract - Sort Selections Descending by number (Clipboard)",
    "canMultiSelection": true
  },
  {
    "command": "selection-manipulator.sort-line.string.ascending",
    "title": "Extract - Sort Lines Ascending by string",
    "canMultiSelection": true
  },
  {
    "command": "selection-manipulator.sort-line.string.ascending.clipboard",
    "title": "Extract - Sort Lines Ascending by string (Clipboard)",
    "canMultiSelection": true
  },
  {
    "command": "selection-manipulator.sort-line.string.descending",
    "title": "Extract - Sort Lines Descending by string",
    "canMultiSelection": true
  },
  {
    "command": "selection-manipulator.sort-line.string.descending.clipboard",
    "title": "Extract - Sort Lines Descending by string (Clipboard)",
    "canMultiSelection": true
  },
  {
    "command": "selection-manipulator.sort-line.number.ascending",
    "title": "Extract - Sort Lines Ascending by number",
    "canMultiSelection": true
  },
  {
    "command": "selection-manipulator.sort-line.number.ascending.clipboard",
    "title": "Extract - Sort Lines Ascending by number (Clipboard)",
    "canMultiSelection": true
  },
  {
    "command": "selection-manipulator.sort-line.number.descending",
    "title": "Extract - Sort Lines Descending by number",
    "canMultiSelection": true
  },
  {
    "command": "selection-manipulator.sort-line.number.descending.clipboard",
    "title": "Extract - Sort Lines Descending by number (Clipboard)",
    "canMultiSelection": true
  },
  {
    "command": "selection-manipulator.sort-line.occurrence.ascending",
    "title": "Extract - Sort Lines Ascending by occurrence",
    "canMultiSelection": true
  },
  {
    "command": "selection-manipulator.sort-line.occurrence.ascending.clipboard",
    "title": "Extract - Sort Lines Ascending by occurrence (Clipboard)",
    "canMultiSelection": true
  },
  {
    "command": "selection-manipulator.sort-line.occurrence.descending",
    "title": "Extract - Sort Lines Descending by occurrence",
    "canMultiSelection": true
  },
  {
    "command": "selection-manipulator.sort-line.occurrence.descending.clipboard",
    "title": "Extract - Sort Lines Descending by occurrence (Clipboard)",
    "canMultiSelection": true
  },
  {
    "command": "selection-manipulator.sort-line.natural.ascending",
    "title": "Extract - Sort Lines Ascending by natural order",
    "canMultiSelection": true
  },
  {
    "command": "selection-manipulator.sort-line.natural.descending",
    "title": "Extract - Sort Lines Descending by natural order",
    "canMultiSelection": true
  },
  {
    "command": "selection-manipulator.sort-line.ignore-case.ascending",
    "title": "Extract - Sort Lines Ascending ignoring case",
    "canMultiSelection": true
  },
  {
    "command": "selection-manipulator.sort-line.ignore-case.descending",
    "title": "Extract - Sort Lines Descending ignoring case",
    "canMultiSelection": true
  },
  {
    "command": "selection-manipulator.sort-line.locale.ascending",
    "title": "Extract - Sort Lines Ascending by locale",
    "canMultiSelection": true
  },
  {
    "command": "selection-manipulator.sort-line.locale.descending",
    "title": "Extract - Sort Lines Descending by locale",
    "canMultiSelection": true
  },
  {
    "command": "selection-manipulator.sort-line.japanese.ascending",
    "title": "Extract - Sort Lines Ascending by kana order",
    "canMultiSelection": true
  },
  {
    "command": "selection-manipulator.sort-line.column.ascending",
    "title": "Extract - Sort Lines Ascending by column",
    "canMultiSelection": true
  },
  {
    "command": "selection-manipulator.sort-line.column.descending",
    "title": "Extract - Sort Lines Descending by column",
    "canMultiSelection": true
  },
  {
    "command": "selection-manipulator.sort-line.regex-key.ascending",
    "title": "Extract - Sort Lines Ascending by regex capture",
    "canMultiSelection": true
  },
  {
    "command": "selection-manipulator.sort-line.date.ascending",
    "title": "Extract - Sort Lines Ascending by date",
    "canMultiSelection": true
  },
  {
    "command": "selection-manipulator.sort-line.date.descending",
    "title": "Extract - Sort Lines Descending by date",
    "canMultiSelection": true
  },
  {
    "command": "selection-manipulator.sort-line.semver.ascending",
    "title": "Extract - Sort Lines Ascending by semantic version",
    "canMultiSelection": true
  },
  {
    "command": "selection-manipulator.sort-line.ip.ascending",
    "title": "Extract - Sort Lines Ascending by IP address",
    "canMultiSelection": true
  },
  {
    "command": "selection-manipulator.sort-line.word-count.ascending",
    "title": "Extract - Sort Lines Ascending by word count",
    "canMultiSelection": true
  },
  {
    "command": "selection-manipulator.sort-line.last-word.ascending",
    "title": "Extract - Sort Lines Ascending by last word",
    "canMultiSelection": true
  },
  {
    "command": "selection-manipulator.sort-line.suffix.ascending",
    "title": "Extract - Sort Lines Ascending by reversed string",
    "canMultiSelection": true
  },
  {
    "command": "selection-manipulator.sort-line.unique.ascending",
    "title": "Extract - Sort Lines Ascending and remove duplicates",
    "canMultiSelection": true
  },
  {
    "command": "selection-manipulator.sort-line.paragraph.ascending",
    "title": "Extract - Sort Paragraphs Ascending",
    "canMultiSelection": true
  },
  {
    "command": "selection-manipulator.sort-line.indent-block.ascending",
    "title": "Extract - Sort Lines Ascending keeping indented children",
    "canMultiSelection": true
  },
  {
    "command": "selection-manipulator.sort-line.hex.ascending",
    "title": "Extract - Sort Lines Ascending by hex number",
    "canMultiSelection": true
  },
  {
    "command": "selection-manipulator.sort.natural.ascending",
    "title": "Extract - Sort Selections Ascending by natural order",
    "canMultiSelection": true
  },
  {
    "command": "selection-manipulator.sort.ignore-case.ascending",
    "title": "Extract - Sort Selections Ascending ignoring case",
    "canMultiSelection": true
  },
  {
    "command": "selection-manipulator.sort.length.ascending",
    "title": "Extract - Sort Selections Ascending by length",
    "canMultiSelection": true
  },
  {
    "command": "selection-manipulator.sort.length.descending",
    "title": "Extract - Sort Selections Descending by length",
    "canMultiSelection": true
  },
  {
    "command": "selection-manipulator.sort-line.natural.ascending.clipboard",
    "title": "Extract - Sort Lines Ascending by natural order (Clipboard)",
    "canMultiSelection": true
  },
  {
    "command": "selection-manipulator.sort-line.ignore-case.ascending.clipboard",
    "title": "Extract - Sort Lines Ascending ignoring case (Clipboard)",
    "canMultiSelection": true
  },
  {
    "command": "selection-manipulator.sort-line.column.ascending.clipboard",
    "title": "Extract - Sort Lines Ascending by column (Clipboard)",
    "canMultiSelection": true
  },
  {
    "command": "selection-manipulator.sort-line.semver.ascending.clipboard",
    "title": "Extract - Sort Lines Ascending by semantic version (Clipboard)",
    "canMultiSelection": true
  },
  {
    "command": "selection-manipulator.sort.natural.ascending.clipboard",
    "title": "Extract - Sort Selections Ascending by natural order (Clipboard)",
    "canMultiSelection": true
  },
  {
    "command": "selection-manipulator.json.format",
    "title": "Transform - JSON - Format JSON (Pretty Print)",
    "canMultiSelection": false
  },
  {
    "command": "selection-manipulator.json.minify",
    "title": "Transform - JSON - Minify JSON",
    "canMultiSelection": false
  },
  {
    "command": "selection-manipulator.json.parse",
    "title": "Transform - JSON - Parse JSON",
    "canMultiSelection": false
  },
  {
    "command": "selection-manipulator.json.stringify",
    "title": "Transform - JSON - Stringify JSON",
    "canMultiSelection": false
  },
  {
    "command": "selection-manipulator.json.flatten",
    "title": "Transform - JSON - Flatten JSON",
    "canMultiSelection": false
  },
  {
    "command": "selection-manipulator.json.unflatten",
    "title": "Transform - JSON - Unflatten JSON",
    "canMultiSelection": false
  },
  {
    "command": "selection-manipulator.json.format.replace",
    "title": "Transform - JSON - Format JSON (Pretty Print) (Replace)",
    "canMultiSelection": true
  },
  {
    "command": "selection-manipulator.json.minify.replace",
    "title": "Transform - JSON - Minify JSON (Replace)",
    "canMultiSelection": true
  },
  {
    "command": "selection-manipulator.json.parse.replace",
    "title": "Transform - JSON - Parse JSON (Replace)",
    "canMultiSelection": true
  },
  {
    "command": "selection-manipulator.json.stringify.replace",
    "title": "Transform - JSON - Stringify JSON (Replace)",
    "canMultiSelection": true
  },
  {
    "command": "selection-manipulator.json.flatten.replace",
    "title": "Transform - JSON - Flatten JSON (Replace)",
    "canMultiSelection": true
  },
  {
    "command": "selection-manipulator.json.unflatten.replace",
    "title": "Transform - JSON - Unflatten JSON (Replace)",
    "canMultiSelection": true
  },
  {
    "command": "selection-manipulator.xml.format",
    "title": "Transform - XML - Format XML (Pretty Print)",
    "canMultiSelection": false
  },
  {
    "command": "selection-manipulator.xml.minify",
    "title": "Transform - XML - Minify XML",
    "canMultiSelection": false
  },
  {
    "command": "selection-manipulator.xml.to-json",
    "title": "Transform - XML - Convert XML to JSON",
    "canMultiSelection": false
  },
  {
    "command": "selection-manipulator.xml.format.replace",
    "title": "Transform - XML - Format XML (Pretty Print) (Replace)",
    "canMultiSelection": true
  },
  {
    "command": "selection-manipulator.xml.minify.replace",
    "title": "Transform - XML - Minify XML (Replace)",
    "canMultiSelection": true
  },
  {
    "command": "selection-manipulator.xml.to-json.replace",
    "title": "Transform - XML - Convert XML to JSON (Replace)",
    "canMultiSelection": true
  },
  {
    "command": "selection-manipulator.base64.encode",
    "title": "Transform - Base64 - Encode Base64",
    "canMultiSelection": false
  },
  {
    "command": "selection-manipulator.base64.decode",
    "title": "Transform - Base64 - Decode Base64",
    "canMultiSelection": false
  },
  {
    "command": "selection-manipulator.base64.deflate",
    "title": "Transform - Base64 - Deflate Base64",
    "canMultiSelection": false
  },
  {
    "command": "selection-manipulator.base64.unzip",
    "title": "Transform - Base64 - Inflate Base64",
    "canMultiSelection": false
  },
  {
    "command": "selection-manipulator.base64.encode.replace",
    "title": "Transform - Base64 - Encode Base64 (Replace)",
    "canMultiSelection": true
  },
  {
    "command": "selection-manipulator.base64.decode.replace",
    "title": "Transform - Base64 - Decode Base64 (Replace)",
    "canMultiSelection": true
  },
  {
    "command": "selection-manipulator.base64.deflate.replace",
    "title": "Transform - Base64 - Deflate Base64 (Replace)",
    "canMultiSelection": true
  },
  {
    "command": "selection-manipulator.base64.unzip.replace",
    "title": "Transform - Base64 - Inflate Base64 (Replace)",
    "canMultiSelection": true
  },
  {
    "command": "selection-manipulator.url.parse",
    "title": "Transform - URL - Parse URL to JSON",
    "canMultiSelection": true
  },
  {
    "command": "selection-manipulator.url.parse-params",
    "title": "Transform - URL - Parse URL Parameters to JSON",
    "canMultiSelection": true
  },
  {
    "command": "selection-manipulator.url.encode-uri",
    "title": "Transform - URL - Encode URI",
    "canMultiSelection": true
  },
  {
    "command": "selection-manipulator.url.decode-uri",
    "title": "Transform - URL - Decode URI",
    "canMultiSelection": true
  },
  {
    "command": "selection-manipulator.url.encode-uri-component",
    "title": "Transform - URL - Encode URI Component",
    "canMultiSelection": true
  },
  {
    "command": "selection-manipulator.url.decode-uri-component",
    "title": "Transform - URL - Decode URI Component",
    "canMultiSelection": true
  },
  {
    "command": "selection-manipulator.jwt.decode",
    "title": "Transform - JWT - Decode JWT",
    "canMultiSelection": true
  },
  {
    "command": "selection-manipulator.saml.decode",
    "title": "Transform - SAML - Decode SAML Request / Response",
    "canMultiSelection": true
  },
  {
    "command": "selection-manipulator.crypto.x509",
    "title": "Transform - Crypto - Decode X509 Certification",
    "canMultiSelection": true
  },
  {
    "command": "selection-manipulator.crypto.hash-sha256",
    "title": "Transform - Crypto - Create Hash (SHA-256)",
    "canMultiSelection": true
  },
  {
    "command": "selection-manipulator.crypto.hash-sha512",
    "title": "Transform - Crypto - Create Hash (SHA-512)",
    "canMultiSelection": true
  },
  {
    "command": "selection-manipulator.crypto.hash-md5",
    "title": "Transform - Crypto - Create Hash (MD5)",
    "canMultiSelection": true
  },
  {
    "command": "selection-manipulator.crypto.hmac-sha256",
    "title": "Transform - Crypto - Create HMAC (SHA-256)",
    "canMultiSelection": true
  },
  {
    "command": "selection-manipulator.crypto.hmac-sha512",
    "title": "Transform - Crypto - Create HMAC (SHA-512)",
    "canMultiSelection": true
  },
  {
    "command": "selection-manipulator.crypto.hmac-md5",
    "title": "Transform - Crypto - Create HMAC (MD5)",
    "canMultiSelection": true
  },
  {
    "command": "selection-manipulator.crypto.encrypt",
    "title": "Transform - Crypto - Encrypt by AES",
    "canMultiSelection": false
  },
  {
    "command": "selection-manipulator.crypto.decrypt",
    "title": "Transform - Crypto - Decrypt by AES",
    "canMultiSelection": false
  },
  {
    "command": "selection-manipulator.crypto.encrypt.replace",
    "title": "Transform - Crypto - Encrypt by AES (Replace)",
    "canMultiSelection": true
  },
  {
    "command": "selection-manipulator.crypto.decrypt.replace",
    "title": "Transform - Crypto - Decrypt by AES (Replace)",
    "canMultiSelection": true
  },
  {
    "command": "selection-manipulator.count-occurrences.count",
    "title": "Transform - Count Occurrences sorting by count",
    "canMultiSelection": true
  },
  {
    "command": "selection-manipulator.count-occurrences.word",
    "title": "Transform - Count Occurrences sorting by word",
    "canMultiSelection": true
  },
  {
    "command": "selection-manipulator.count-up-list",
    "title": "Transform - Count Up to List",
    "canMultiSelection": true
  },
  {
    "command": "selection-manipulator.har-to-mermaid",
    "title": "Transform - HAR to Sequence Diagram Mermaid",
    "canMultiSelection": false
  },
  {
    "command": "selection-manipulator.har-to-image",
    "title": "Transform - HAR to Sequence Diagram Image",
    "canMultiSelection": false
  },
  {
    "command": "selection-manipulator.case.camel",
    "title": "Replace - Case - Change Case Camel",
    "canMultiSelection": true
  },
  {
    "command": "selection-manipulator.case.capital",
    "title": "Replace - Case - Change Case Capital",
    "canMultiSelection": true
  },
  {
    "command": "selection-manipulator.case.constant",
    "title": "Replace - Case - Change Case Constant",
    "canMultiSelection": true
  },
  {
    "command": "selection-manipulator.case.dot",
    "title": "Replace - Case - Change Case Dot",
    "canMultiSelection": true
  },
  {
    "command": "selection-manipulator.case.kebab",
    "title": "Replace - Case - Change Case Kebab",
    "canMultiSelection": true
  },
  {
    "command": "selection-manipulator.case.no",
    "title": "Replace - Case - Change Case No",
    "canMultiSelection": true
  },
  {
    "command": "selection-manipulator.case.pascal",
    "title": "Replace - Case - Change Case Pascal",
    "canMultiSelection": true
  },
  {
    "command": "selection-manipulator.case.path",
    "title": "Replace - Case - Change Case Path",
    "canMultiSelection": true
  },
  {
    "command": "selection-manipulator.case.sentence",
    "title": "Replace - Case - Change Case Sentence",
    "canMultiSelection": true
  },
  {
    "command": "selection-manipulator.case.snake",
    "title": "Replace - Case - Change Case Snake",
    "canMultiSelection": true
  },
  {
    "command": "selection-manipulator.case.train",
    "title": "Replace - Case - Change Case Train",
    "canMultiSelection": true
  },
  {
    "command": "selection-manipulator.case.upper",
    "title": "Replace - Case - Change Case Upper",
    "canMultiSelection": true
  },
  {
    "command": "selection-manipulator.case.lower",
    "title": "Replace - Case - Change Case Lower",
    "canMultiSelection": true
  },
  {
    "command": "selection-manipulator.zero-padding",
    "title": "Replace - Number - Zero Padding",
    "canMultiSelection": true
  },
  {
    "command": "selection-manipulator.increment-from-1",
    "title": "Replace - Number - Increment from 1",
    "canMultiSelection": true
  },
  {
    "command": "selection-manipulator.increment-from-n",
    "title": "Replace - Number - Increment from N",
    "canMultiSelection": true
  },
  {
    "command": "selection-manipulator.decrement-to-1",
    "title": "Replace - Number - Decrement to 1",
    "canMultiSelection": true
  },
  {
    "command": "selection-manipulator.decrement-to-n",
    "title": "Replace - Number - Decrement to N",
    "canMultiSelection": true
  },
  {
    "command": "selection-manipulator.increment-by-1",
    "title": "Replace - Number - Increment by 1",
    "canMultiSelection": true
  },
  {
    "command": "selection-manipulator.increment-by-n",
    "title": "Replace - Number - Increment by N",
    "canMultiSelection": true
  },
  {
    "command": "selection-manipulator.decrement-by-1",
    "title": "Replace - Number - Decrement by 1",
    "canMultiSelection": true
  },
  {
    "command": "selection-manipulator.decrement-by-n",
    "title": "Replace - Number - Decrement by N",
    "canMultiSelection": true
  },
  {
    "command": "selection-manipulator.dns.a",
    "title": "Lookup - DNS - A Record",
    "canMultiSelection": true
  },
  {
    "command": "selection-manipulator.dns.aaaa",
    "title": "Lookup - DNS - AAAA Record",
    "canMultiSelection": true
  },
  {
    "command": "selection-manipulator.dns.any",
    "title": "Lookup - DNS - ANY Record",
    "canMultiSelection": true
  },
  {
    "command": "selection-manipulator.dns.caa",
    "title": "Lookup - DNS - CAA Record",
    "canMultiSelection": true
  },
  {
    "command": "selection-manipulator.dns.cname",
    "title": "Lookup - DNS - CNAME Record",
    "canMultiSelection": true
  },
  {
    "command": "selection-manipulator.dns.mx",
    "title": "Lookup - DNS - MX Record",
    "canMultiSelection": true
  },
  {
    "command": "selection-manipulator.dns.naptr",
    "title": "Lookup - DNS - NAPTR Record",
    "canMultiSelection": true
  },
  {
    "command": "selection-manipulator.dns.ns",
    "title": "Lookup - DNS - NS Record",
    "canMultiSelection": true
  },
  {
    "command": "selection-manipulator.dns.ptr",
    "title": "Lookup - DNS - PTR Record",
    "canMultiSelection": true
  },
  {
    "command": "selection-manipulator.dns.soa",
    "title": "Lookup - DNS - SOA Record",
    "canMultiSelection": true
  },
  {
    "command": "selection-manipulator.dns.srv",
    "title": "Lookup - DNS - SRV Record",
    "canMultiSelection": true
  },
  {
    "command": "selection-manipulator.dns.txt",
    "title": "Lookup - DNS - TXT Record",
    "canMultiSelection": true
  },
  {
    "command": "selection-manipulator.dns.lookup",
    "title": "Lookup - DNS - IP from Hostname",
    "canMultiSelection": true
  },
  {
    "command": "selection-manipulator.dns.reverse",
    "title": "Lookup - DNS - Hostname from IP",
    "canMultiSelection": true
  },
  {
    "command": "selection-manipulator.calculation",
    "title": "Calculate - Calculate Mathematical Expression",
    "canMultiSelection": true
  },
  {
    "command": "selection-manipulator.calculation.date",
    "title": "Calculate - Transform to Timestamp and ISO 8601",
    "canMultiSelection": true
  },
  {
    "command": "selection-manipulator.date.to-iso",
    "title": "Date - Convert to ISO 8601",
    "canMultiSelection": true
  },
  {
    "command": "selection-manipulator.date.to-iso.replace",
    "title": "Date - Convert to ISO 8601 (Replace)",
    "canMultiSelection": true
  },
  {
    "command": "selection-manipulator.date.to-iso.clipboard",
    "title": "Date - Convert to ISO 8601 (Clipboard)",
    "canMultiSelection": true
  },
  {
    "command": "selection-manipulator.date.to-locale",
    "title": "Date - Convert to Locale String",
    "canMultiSelection": true
  },
  {
    "command": "selection-manipulator.date.to-locale.replace",
    "title": "Date - Convert to Locale String (Replace)",
    "canMultiSelection": true
  },
  {
    "command": "selection-manipulator.date.to-locale.clipboard",
    "title": "Date - Convert to Locale String (Clipboard)",
    "canMultiSelection": true
  },
  {
    "command": "selection-manipulator.date.to-timestamp",
    "title": "Date - Convert to Timestamp (Seconds)",
    "canMultiSelection": true
  },
  {
    "command": "selection-manipulator.date.to-timestamp.replace",
    "title": "Date - Convert to Timestamp (Seconds) (Replace)",
    "canMultiSelection": true
  },
  {
    "command": "selection-manipulator.date.to-timestamp.clipboard",
    "title": "Date - Convert to Timestamp (Seconds) (Clipboard)",
    "canMultiSelection": true
  },
  {
    "command": "selection-manipulator.date.to-timestamp-ms",
    "title": "Date - Convert to Timestamp (Milliseconds)",
    "canMultiSelection": true
  },
  {
    "command": "selection-manipulator.date.to-timestamp-ms.replace",
    "title": "Date - Convert to Timestamp (Milliseconds) (Replace)",
    "canMultiSelection": true
  },
  {
    "command": "selection-manipulator.date.to-timestamp-ms.clipboard",
    "title": "Date - Convert to Timestamp (Milliseconds) (Clipboard)",
    "canMultiSelection": true
  },
  {
    "command": "selection-manipulator.date.era-conversion",
    "title": "Date - Convert AD <-> Wareki",
    "canMultiSelection": true
  },
  {
    "command": "selection-manipulator.date.era-conversion.replace",
    "title": "Date - Convert AD <-> Wareki (Replace)",
    "canMultiSelection": true
  },
  {
    "command": "selection-manipulator.date.to-utc-string",
    "title": "Date - Convert to UTC String (RFC 7231)",
    "canMultiSelection": true
  },
  {
    "command": "selection-manipulator.date.to-timezone",
    "title": "Date - Convert to Time Zone",
    "canMultiSelection": true
  },
  {
    "command": "selection-manipulator.date.to-timezones",
    "title": "Date - Show in Multiple Time Zones",
    "canMultiSelection": true
  },
  {
    "command": "selection-manipulator.date.weekday",
    "title": "Date - Show Weekday",
    "canMultiSelection": true
  },
  {
    "command": "selection-manipulator.date.append-weekday",
    "title": "Date - Append Weekday",
    "canMultiSelection": true
  },
  {
    "command": "selection-manipulator.date.iso-week",
    "title": "Date - ISO Week Number",
    "canMultiSelection": true
  },
  {
    "command": "selection-manipulator.date.day-of-year",
    "title": "Date - Day of Year",
    "canMultiSelection": true
  },
  {
    "command": "selection-manipulator.date.diff",
    "title": "Date - Difference Between Two Dates",
    "canMultiSelection": true
  },
  {
    "command": "selection-manipulator.date.add-days",
    "title": "Date - Add Days",
    "canMultiSelection": true
  },
  {
    "command": "selection-manipulator.date.add-months",
    "title": "Date - Add Months",
    "canMultiSelection": true
  },
  {
    "command": "selection-manipulator.date.to-relative",
    "title": "Date - Convert to Relative Time",
    "canMultiSelection": true
  },
  {
    "command": "selection-manipulator.date.format-pattern",
    "title": "Date - Format with Pattern",
    "canMultiSelection": true
  },
  {
    "command": "selection-manipulator.date.to-compact",
    "title": "Date - Convert to Compact (YYYYMMDD)",
    "canMultiSelection": true
  },
  {
    "command": "selection-manipulator.date.from-compact",
    "title": "Date - Convert from Compact (YYYYMMDD)",
    "canMultiSelection": true
  },
  {
    "command": "selection-manipulator.date.month-calendar",
    "title": "Date - Insert Month Calendar",
    "canMultiSelection": true
  },
  {
    "command": "selection-manipulator.date.duration-to-human",
    "title": "Date - ISO 8601 Duration to Human",
    "canMultiSelection": true
  },
  {
    "command": "selection-manipulator.date.seconds-to-hms",
    "title": "Date - Seconds to HH:MM:SS",
    "canMultiSelection": true
  },
  {
    "command": "selection-manipulator.date.hms-to-seconds",
    "title": "Date - HH:MM:SS to Seconds",
    "canMultiSelection": true
  },
  {
    "command": "selection-manipulator.date.to-excel-serial",
    "title": "Date - Convert to Excel Serial",
    "canMultiSelection": true
  },
  {
    "command": "selection-manipulator.date.from-excel-serial",
    "title": "Date - Convert from Excel Serial",
    "canMultiSelection": true
  },
  {
    "command": "selection-manipulator.date.to-japanese",
    "title": "Date - Convert to Japanese Format",
    "canMultiSelection": true
  },
  {
    "command": "selection-manipulator.date.range",
    "title": "Date - Generate Date Range",
    "canMultiSelection": true
  },
  {
    "command": "selection-manipulator.date.age",
    "title": "Date - Calculate Age",
    "canMultiSelection": true
  },
  {
    "command": "selection-manipulator.date.quarter",
    "title": "Date - Show Quarter and Fiscal Year",
    "canMultiSelection": true
  },
  {
    "command": "selection-manipulator.date.cron-explain",
    "title": "Date - Explain Cron Expression",
    "canMultiSelection": true
  },
  {
    "command": "selection-manipulator.date.to-timezone.replace",
    "title": "Date - Convert to Time Zone (Replace)",
    "canMultiSelection": true
  },
  {
    "command": "selection-manipulator.date.to-timezone.clipboard",
    "title": "Date - Convert to Time Zone (Clipboard)",
    "canMultiSelection": true
  },
  {
    "command": "selection-manipulator.date.format-pattern.replace",
    "title": "Date - Format with Pattern (Replace)",
    "canMultiSelection": true
  },
  {
    "command": "selection-manipulator.date.to-compact.replace",
    "title": "Date - Convert to Compact (YYYYMMDD) (Replace)",
    "canMultiSelection": true
  },
  {
    "command": "selection-manipulator.date.from-compact.replace",
    "title": "Date - Convert from Compact (YYYYMMDD) (Replace)",
    "canMultiSelection": true
  },
  {
    "command": "selection-manipulator.morse.to-morse",
    "title": "Morse - Text to Morse Code",
    "canMultiSelection": true
  },
  {
    "command": "selection-manipulator.morse.to-morse.replace",
    "title": "Morse - Text to Morse Code (Replace)",
    "canMultiSelection": true
  },
  {
    "command": "selection-manipulator.morse.from-morse",
    "title": "Morse - Morse Code to Text",
    "canMultiSelection": true
  },
  {
    "command": "selection-manipulator.morse.from-morse.replace",
    "title": "Morse - Morse Code to Text (Replace)",
    "canMultiSelection": true
  },
  {
    "command": "selection-manipulator.morse.from-morse.kana",
    "title": "Morse - Morse Code to Text (Kana)",
    "canMultiSelection": true
  },
  {
    "command": "selection-manipulator.morse.from-morse.kana.replace",
    "title": "Morse - Morse Code to Text (Kana) (Replace)",
    "canMultiSelection": true
  },
  {
    "command": "selection-manipulator.regex.g",
    "title": "Regular Expression - Regex (/PATTERN/g)",
    "canMultiSelection": true
  },
  {
    "command": "selection-manipulator.regex.gi",
    "title": "Regular Expression - Regex (/PATTERN/gi)",
    "canMultiSelection": true
  },
  {
    "command": "selection-manipulator.random.uuid",
    "title": "Random - Random UUID",
    "canMultiSelection": true
  },
  {
    "command": "selection-manipulator.text.escape",
    "title": "Text - Escape Text (JSON Stringify)",
    "canMultiSelection": false
  },
  {
    "command": "selection-manipulator.text.unescape",
    "title": "Text - Unescape Text (JSON Parse)",
    "canMultiSelection": false
  },
  {
    "command": "selection-manipulator.text.escape.replace",
    "title": "Text - Escape Text (JSON Stringify) (Replace)",
    "canMultiSelection": true
  },
  {
    "command": "selection-manipulator.extract.line-by-length.equal",
    "title": "Extract - Extract Lines Equal Length",
    "canMultiSelection": true
  },
  {
    "command": "selection-manipulator.extract.line-by-length.equal.clipboard",
    "title": "Extract - Extract Lines Equal Length (Clipboard)",
    "canMultiSelection": true
  },
  {
    "command": "selection-manipulator.extract.line-by-length.less",
    "title": "Extract - Extract Lines Less Than Length",
    "canMultiSelection": true
  },
  {
    "command": "selection-manipulator.extract.line-by-length.less.clipboard",
    "title": "Extract - Extract Lines Less Than Length (Clipboard)",
    "canMultiSelection": true
  },
  {
    "command": "selection-manipulator.extract.line-by-length.greater",
    "title": "Extract - Extract Lines Greater Than Length",
    "canMultiSelection": true
  },
  {
    "command": "selection-manipulator.extract.line-by-length.greater.clipboard",
    "title": "Extract - Extract Lines Greater Than Length (Clipboard)",
    "canMultiSelection": true
  },
  {
    "command": "selection-manipulator.extract.line-by-length.range",
    "title": "Extract - Extract Lines Length Range",
    "canMultiSelection": true
  },
  {
    "command": "selection-manipulator.extract.line-by-length.range.clipboard",
    "title": "Extract - Extract Lines Length Range (Clipboard)",
    "canMultiSelection": true
  },
  {
    "command": "selection-manipulator.text.unescape.replace",
    "title": "Text - Unescape Text (JSON Parse) (Replace)",
    "canMultiSelection": true
  },
  {
    "command": "selection-manipulator.remove-cursor-above",
    "title": "Edit - Remove Cursor Above",
    "canMultiSelection": true
  },
  {
    "command": "selection-manipulator.remove-cursor-below",
    "title": "Edit - Remove Cursor Below",
    "canMultiSelection": true
  },
  {
    "command": "selection-manipulator.remove-character-from-each-side",
    "title": "Edit - Remove Character from Each Side",
    "canMultiSelection": true
  },
  {
    "command": "selection-manipulator.extract.email",
    "title": "Extract - Extract Email",
    "canMultiSelection": true
  },
  {
    "command": "selection-manipulator.extract.email.replace",
    "title": "Extract - Extract Email (Replace)",
    "canMultiSelection": true
  },
  {
    "command": "selection-manipulator.extract.url",
    "title": "Extract - Extract URL",
    "canMultiSelection": true
  },
  {
    "command": "selection-manipulator.extract.url.replace",
    "title": "Extract - Extract URL (Replace)",
    "canMultiSelection": true
  },
  {
    "command": "selection-manipulator.extract.ip",
    "title": "Extract - Extract IP",
    "canMultiSelection": true
  },
  {
    "command": "selection-manipulator.extract.ip.replace",
    "title": "Extract - Extract IP (Replace)",
    "canMultiSelection": true
  },
  {
    "command": "selection-manipulator.ascii.cowsay",
    "title": "ASCII Art - Cow (cowsay)",
    "canMultiSelection": true
  },
  {
    "command": "selection-manipulator.ascii.cowsay.replace",
    "title": "ASCII Art - Cow (cowsay) (Replace)",
    "canMultiSelection": true
  },
  {
    "command": "selection-manipulator.ascii.tux",
    "title": "ASCII Art - Penguin",
    "canMultiSelection": true
  },
  {
    "command": "selection-manipulator.ascii.tux.replace",
    "title": "ASCII Art - Penguin (Replace)",
    "canMultiSelection": true
  },
  {
    "command": "selection-manipulator.ascii.ghost",
    "title": "ASCII Art - Ghost",
    "canMultiSelection": true
  },
  {
    "command": "selection-manipulator.ascii.ghost.replace",
    "title": "ASCII Art - Ghost (Replace)",
    "canMultiSelection": true
  },
  {
    "command": "selection-manipulator.ascii.meow",
    "title": "ASCII Art - Cat",
    "canMultiSelection": true
  },
  {
    "command": "selection-manipulator.ascii.meow.replace",
    "title": "ASCII Art - Cat (Replace)",
    "canMultiSelection": true
  },
  {
    "command": "selection-manipulator.ascii.pig",
    "title": "ASCII Art - Pig",
    "canMultiSelection": true
  },
  {
    "command": "selection-manipulator.ascii.pig.replace",
    "title": "ASCII Art - Pig (Replace)",
    "canMultiSelection": true
  },
  {
    "command": "selection-manipulator.ascii.face",
    "title": "ASCII Art - Face",
    "canMultiSelection": true
  },
  {
    "command": "selection-manipulator.ascii.face.replace",
    "title": "ASCII Art - Face (Replace)",
    "canMultiSelection": true
  },
  {
    "command": "selection-manipulator.ascii.daemon",
    "title": "ASCII Art - Daemon",
    "canMultiSelection": true
  },
  {
    "command": "selection-manipulator.ascii.daemon.replace",
    "title": "ASCII Art - Daemon (Replace)",
    "canMultiSelection": true
  },
  {
    "command": "selection-manipulator.ascii.dragon",
    "title": "ASCII Art - Dragon",
    "canMultiSelection": true
  },
  {
    "command": "selection-manipulator.ascii.dragon.replace",
    "title": "ASCII Art - Dragon (Replace)",
    "canMultiSelection": true
  },
  {
    "command": "selection-manipulator.ascii.stegosaurus",
    "title": "ASCII Art - Stegosaurus",
    "canMultiSelection": true
  },
  {
    "command": "selection-manipulator.ascii.stegosaurus.replace",
    "title": "ASCII Art - Stegosaurus (Replace)",
    "canMultiSelection": true
  },
  {
    "command": "selection-manipulator.ascii.turkey",
    "title": "ASCII Art - Turkey",
    "canMultiSelection": true
  },
  {
    "command": "selection-manipulator.ascii.turkey.replace",
    "title": "ASCII Art - Turkey (Replace)",
    "canMultiSelection": true
  },
  {
    "command": "selection-manipulator.ascii.turtle",
    "title": "ASCII Art - Turtle",
    "canMultiSelection": true
  },
  {
    "command": "selection-manipulator.ascii.turtle.replace",
    "title": "ASCII Art - Turtle (Replace)",
    "canMultiSelection": true
  },
  {
    "command": "selection-manipulator.ascii.elephant",
    "title": "ASCII Art - Elephant",
    "canMultiSelection": true
  },
  {
    "command": "selection-manipulator.ascii.elephant.replace",
    "title": "ASCII Art - Elephant (Replace)",
    "canMultiSelection": true
  },
  {
    "command": "selection-manipulator.text.remove-empty-lines",
    "title": "Text - Remove Empty Lines",
    "canMultiSelection": true
  },
  {
    "command": "selection-manipulator.text.remove-line-numbers",
    "title": "Text - Remove Line Numbers",
    "canMultiSelection": true
  },
  {
    "command": "selection-manipulator.text.trim-lines",
    "title": "Text - Trim All Lines",
    "canMultiSelection": true
  },
  {
    "command": "selection-manipulator.text.join-lines.space",
    "title": "Text - Join Lines (Space)",
    "canMultiSelection": true
  },
  {
    "command": "selection-manipulator.text.join-lines.comma",
    "title": "Text - Join Lines (Comma)",
    "canMultiSelection": true
  },
  {
    "command": "selection-manipulator.text.join-lines.custom",
    "title": "Text - Join Lines (Custom Delimiter)",
    "canMultiSelection": true
  },
  {
    "command": "selection-manipulator.text.split-lines.space",
    "title": "Text - Split Lines (Space)",
    "canMultiSelection": true
  },
  {
    "command": "selection-manipulator.text.split-lines.comma",
    "title": "Text - Split Lines (Comma)",
    "canMultiSelection": true
  },
  {
    "command": "selection-manipulator.text.split-lines.custom",
    "title": "Text - Split Lines (Custom Delimiter)",
    "canMultiSelection": true
  },
  {
    "command": "selection-manipulator.math.sum",
    "title": "Math - Sum",
    "canMultiSelection": true
  },
  {
    "command": "selection-manipulator.math.average",
    "title": "Math - Average",
    "canMultiSelection": true
  },
  {
    "command": "selection-manipulator.math.min",
    "title": "Math - Min",
    "canMultiSelection": true
  },
  {
    "command": "selection-manipulator.math.max",
    "title": "Math - Max",
    "canMultiSelection": true
  },
  {
    "command": "selection-manipulator.random.password",
    "title": "Random - Random Password",
    "canMultiSelection": true
  },
  {
    "command": "selection-manipulator.random.ipv4",
    "title": "Random - Random IPv4",
    "canMultiSelection": true
  },
  {
    "command": "selection-manipulator.random.ipv6",
    "title": "Random - Random IPv6",
    "canMultiSelection": true
  },
  {
    "command": "selection-manipulator.csv.to-markdown",
    "title": "Transform - CSV - Convert to Markdown Table",
    "canMultiSelection": false
  },
  {
    "command": "selection-manipulator.csv.to-markdown.replace",
    "title": "Transform - CSV - Convert to Markdown Table (Replace)",
    "canMultiSelection": true
  },
  {
    "command": "selection-manipulator.csv.from-markdown",
    "title": "Transform - CSV - Convert from Markdown Table",
    "canMultiSelection": false
  },
  {
    "command": "selection-manipulator.csv.from-markdown.replace",
    "title": "Transform - CSV - Convert from Markdown Table (Replace)",
    "canMultiSelection": true
  },
  {
    "command": "selection-manipulator.data.env-to-json",
    "title": "Transform - Data - Convert Env to JSON",
    "canMultiSelection": false
  },
  {
    "command": "selection-manipulator.data.env-to-json.replace",
    "title": "Transform - Data - Convert Env to JSON (Replace)",
    "canMultiSelection": true
  },
  {
    "command": "selection-manipulator.case.title-smart",
    "title": "Change Case Title (Smart)",
    "canMultiSelection": true
  },
  {
    "command": "selection-manipulator.case.spongebob",
    "title": "Change Case SpongeBob",
    "canMultiSelection": true
  },
  {
    "command": "selection-manipulator.case.screaming-snake",
    "title": "Change Case Screaming Snake (Constant)",
    "canMultiSelection": true
  },
  {
    "command": "selection-manipulator.case.humanize",
    "title": "Change Case Humanize (Sentence)",
    "canMultiSelection": true
  },
  {
    "command": "selection-manipulator.case.slugify",
    "title": "Change Case Slugify (Kebab)",
    "canMultiSelection": true
  },
  {
    "command": "selection-manipulator.case.swap",
    "title": "Change Case Swap",
    "canMultiSelection": true
  },
  {
    "command": "selection-manipulator.case.sentence-preserve-acronyms",
    "title": "Change Case Sentence (Preserve Acronyms)",
    "canMultiSelection": true
  },
  {
    "command": "selection-manipulator.case.title-apa",
    "title": "Change Case Title (APA Style)",
    "canMultiSelection": true
  },
  {
    "command": "selection-manipulator.case.upper-first",
    "title": "Change Case Upper First",
    "canMultiSelection": true
  },
  {
    "command": "selection-manipulator.case.lower-first",
    "title": "Change Case Lower First",
    "canMultiSelection": true
  },
  {
    "command": "selection-manipulator.case.cobol",
    "title": "Change Case Cobol",
    "canMultiSelection": true
  },
  {
    "command": "selection-manipulator.case.ada",
    "title": "Change Case Ada",
    "canMultiSelection": true
  },
  {
    "command": "selection-manipulator.case.flat",
    "title": "Change Case Flat",
    "canMultiSelection": true
  },
  {
    "command": "selection-manipulator.case.upper-flat",
    "title": "Change Case Upper Flat",
    "canMultiSelection": true
  },
  {
    "command": "selection-manipulator.case.camel-snake",
    "title": "Change Case Camel Snake",
    "canMultiSelection": true
  },
  {
    "command": "selection-manipulator.case.pascal-snake",
    "title": "Change Case Pascal Snake",
    "canMultiSelection": true
  },
  {
    "command": "selection-manipulator.case.alternating-words",
    "title": "Change Case Alternating Words",
    "canMultiSelection": true
  },
  {
    "command": "selection-manipulator.case.acronym",
    "title": "Change Case Acronym",
    "canMultiSelection": true
  },
  {
    "command": "selection-manipulator.case.detect",
    "title": "Change Case Detect Style",
    "canMultiSelection": true
  },
  {
    "command": "selection-manipulator.case.cycle",
    "title": "Change Case Cycle",
    "canMultiSelection": true
  },
  {
    "command": "selection-manipulator.case.upper-acronyms",
    "title": "Change Case Uppercase Known Acronyms",
    "canMultiSelection": true
  },
  {
    "command": "selection-manipulator.case.sentence-each",
    "title": "Change Case Sentence (Each Sentence)",
    "canMultiSelection": true
  },
  {
    "command": "selection-manipulator.case.capitalize-lines",
    "title": "Change Case Capitalize Each Line",
    "canMultiSelection": true
  },
  {
    "command": "selection-manipulator.case.lower-line-start",
    "title": "Change Case Lowercase Each Line Start",
    "canMultiSelection": true
  },
  {
    "command": "selection-manipulator.case.upper-locale",
    "title": "Change Case Upper (Locale)",
    "canMultiSelection": true
  },
  {
    "command": "selection-manipulator.case.lower-locale",
    "title": "Change Case Lower (Locale)",
    "canMultiSelection": true
  },
  {
    "command": "selection-manipulator.case.json-keys-camel",
    "title": "Change Case JSON Keys to Camel",
    "canMultiSelection": true
  },
  {
    "command": "selection-manipulator.case.json-keys-snake",
    "title": "Change Case JSON Keys to Snake",
    "canMultiSelection": true
  },
  {
    "command": "selection-manipulator.case.json-keys-kebab",
    "title": "Change Case JSON Keys to Kebab",
    "canMultiSelection": true
  },
  {
    "command": "selection-manipulator.case.json-keys-pascal",
    "title": "Change Case JSON Keys to Pascal",
    "canMultiSelection": true
  },
  {
    "command": "selection-manipulator.case.css-variable",
    "title": "Change Case CSS Custom Property",
    "canMultiSelection": true
  },
  {
    "command": "selection-manipulator.case.bem",
    "title": "Change Case BEM",
    "canMultiSelection": true
  },
  {
    "command": "selection-manipulator.case.pluralize",
    "title": "Change Case Pluralize",
    "canMultiSelection": true
  },
  {
    "command": "selection-manipulator.case.singularize",
    "title": "Change Case Singularize",
    "canMultiSelection": true
  },
  {
    "command": "selection-manipulator.case.hashtag",
    "title": "Change Case Hashtag",
    "canMultiSelection": true
  },
  {
    "command": "selection-manipulator.text.remove-accents",
    "title": "Text - Remove Accents",
    "canMultiSelection": true
  },
  {
    "command": "selection-manipulator.unit.px-to-rem",
    "title": "Unit - Px to Rem",
    "canMultiSelection": true
  },
  {
    "command": "selection-manipulator.unit.rem-to-px",
    "title": "Unit - Rem to Px",
    "canMultiSelection": true
  },
  {
    "command": "selection-manipulator.unit.kg-to-lb",
    "title": "Unit - Kg to Lb",
    "canMultiSelection": true
  },
  {
    "command": "selection-manipulator.unit.lb-to-kg",
    "title": "Unit - Lb to Kg",
    "canMultiSelection": true
  },
  {
    "command": "selection-manipulator.programmatic.hex-to-decimal",
    "title": "Math - Hex to Decimal",
    "canMultiSelection": true
  },
  {
    "command": "selection-manipulator.programmatic.hex-to-decimal.replace",
    "title": "Math - Hex to Decimal (Replace)",
    "canMultiSelection": true
  },
  {
    "command": "selection-manipulator.programmatic.decimal-to-hex",
    "title": "Math - Decimal to Hex",
    "canMultiSelection": true
  },
  {
    "command": "selection-manipulator.programmatic.decimal-to-hex.replace",
    "title": "Math - Decimal to Hex (Replace)",
    "canMultiSelection": true
  },
  {
    "command": "selection-manipulator.text.normalize-whitespace",
    "title": "Text - Normalize Whitespace",
    "canMultiSelection": true
  },
  {
    "command": "selection-manipulator.text.strip-html-tags",
    "title": "Text - Strip HTML Tags",
    "canMultiSelection": true
  },
  {
    "command": "selection-manipulator.text.unsmart-quotes",
    "title": "Text - Unsmart Quotes",
    "canMultiSelection": true
  },
  {
    "command": "selection-manipulator.text.mask",
    "title": "Text - Mask with Asterisk (*)",
    "canMultiSelection": true
  },
  {
    "command": "selection-manipulator.sort-line.length.ascending",
    "title": "Sort Lines Ascending by length",
    "canMultiSelection": true
  },
  {
    "command": "selection-manipulator.sort-line.length.descending",
    "title": "Sort Lines Descending by length",
    "canMultiSelection": true
  },
  {
    "command": "selection-manipulator.quote.single",
    "title": "Enclose - Enclose in Single Quotes",
    "canMultiSelection": true
  },
  {
    "command": "selection-manipulator.quote.double",
    "title": "Enclose - Enclose in Double Quotes",
    "canMultiSelection": true
  },
  {
    "command": "selection-manipulator.quote.backtick",
    "title": "Enclose - Enclose in Backticks",
    "canMultiSelection": true
  },
  {
    "command": "selection-manipulator.enclose.paren",
    "title": "Enclose - Enclose in Parentheses (())",
    "canMultiSelection": true
  },
  {
    "command": "selection-manipulator.enclose.square",
    "title": "Enclose - Enclose in Square Brackets ([])",
    "canMultiSelection": true
  },
  {
    "command": "selection-manipulator.enclose.curly",
    "title": "Enclose - Enclose in Curly Brackets ({})",
    "canMultiSelection": true
  },
  {
    "command": "selection-manipulator.enclose.angle",
    "title": "Enclose - Enclose in Angle Brackets (<>)",
    "canMultiSelection": true
  },
  {
    "command": "selection-manipulator.enclose.japanese.quote-single",
    "title": "Enclose - Enclose in Japanese Single Quote (「」)",
    "canMultiSelection": true
  },
  {
    "command": "selection-manipulator.enclose.japanese.quote-double",
    "title": "Enclose - Enclose in Japanese Double Quote (『』)",
    "canMultiSelection": true
  },
  {
    "command": "selection-manipulator.enclose.japanese.bracket",
    "title": "Enclose - Enclose in Japanese Bracket (【】)",
    "canMultiSelection": true
  },
  {
    "command": "selection-manipulator.enclose.japanese.angle",
    "title": "Enclose - Enclose in Japanese Angle Bracket (＜＞)",
    "canMultiSelection": true
  },
  {
    "command": "selection-manipulator.enclose.japanese.paren",
    "title": "Enclose - Enclose in Japanese Parentheses (（）)",
    "canMultiSelection": true
  },
  {
    "command": "selection-manipulator.enclose.japanese.square",
    "title": "Enclose - Enclose in Japanese Square Brackets (［］)",
    "canMultiSelection": true
  },
  {
    "command": "selection-manipulator.enclose.japanese.curly",
    "title": "Enclose - Enclose in Japanese Curly Brackets (｛｝)",
    "canMultiSelection": true
  },
  {
    "command": "selection-manipulator.enclose.custom",
    "title": "Enclose - Enclose: Custom (Prefix / Suffix)",
    "canMultiSelection": true
  },
  {
    "command": "selection-manipulator.enclose.each-line.custom",
    "title": "Enclose - Enclose Each Line: Custom",
    "canMultiSelection": true
  },
  {
    "command": "selection-manipulator.quote.each-line.double",
    "title": "Enclose - Quote Each Line: Double (\"\")",
    "canMultiSelection": true
  },
  {
    "command": "selection-manipulator.quote.each-line.single",
    "title": "Enclose - Quote Each Line: Single ('')",
    "canMultiSelection": true
  },
  {
    "command": "selection-manipulator.quote.each-word.double",
    "title": "Enclose - Quote Each Word: Double (\"\")",
    "canMultiSelection": true
  },
  {
    "command": "selection-manipulator.quote.list.sql-in",
    "title": "Enclose - Quote: SQL IN List",
    "canMultiSelection": true
  },
  {
    "command": "selection-manipulator.quote.list.array",
    "title": "Enclose - Quote: Array Literal",
    "canMultiSelection": true
  },
  {
    "command": "selection-manipulator.quote.triple-double",
    "title": "Enclose - Quote: Triple Double (\"\"\" \"\"\")",
    "canMultiSelection": true
  },
  {
    "command": "selection-manipulator.quote.guillemets",
    "title": "Enclose - Quote: Guillemets («»)",
    "canMultiSelection": true
  },
  {
    "command": "selection-manipulator.quote.smart-double",
    "title": "Enclose - Quote: Smart Double (“”)",
    "canMultiSelection": true
  },
  {
    "command": "selection-manipulator.quote.smart-single",
    "title": "Enclose - Quote: Smart Single (‘’)",
    "canMultiSelection": true
  },
  {
    "command": "selection-manipulator.quote.double-escaped",
    "title": "Enclose - Quote: Double with Escaping",
    "canMultiSelection": true
  },
  {
    "command": "selection-manipulator.unquote.each-line",
    "title": "Enclose - Unquote Each Line",
    "canMultiSelection": true
  },
  {
    "command": "selection-manipulator.enclose.japanese.white-lenticular",
    "title": "Enclose - Enclose: Japanese White Lenticular Bracket (〖〗)",
    "canMultiSelection": true
  },
  {
    "command": "selection-manipulator.enclose.japanese.tortoise-shell",
    "title": "Enclose - Enclose: Japanese Tortoise Shell Bracket (〔〕)",
    "canMultiSelection": true
  },
  {
    "command": "selection-manipulator.enclose.japanese.double-angle",
    "title": "Enclose - Enclose: Japanese Double Angle Bracket (《》)",
    "canMultiSelection": true
  },
  {
    "command": "selection-manipulator.enclose.japanese.single-angle",
    "title": "Enclose - Enclose: Japanese Single Angle Bracket (〈〉)",
    "canMultiSelection": true
  },
  {
    "command": "selection-manipulator.enclose.html-tag",
    "title": "Enclose - Enclose: HTML Tag (Custom)",
    "canMultiSelection": true
  },
  {
    "command": "selection-manipulator.enclose.html-comment",
    "title": "Enclose - Enclose: HTML Comment",
    "canMultiSelection": true
  },
  {
    "command": "selection-manipulator.enclose.block-comment",
    "title": "Enclose - Enclose: Block Comment (/* */)",
    "canMultiSelection": true
  },
  {
    "command": "selection-manipulator.enclose.placeholder",
    "title": "Enclose - Enclose: Placeholder (${})",
    "canMultiSelection": true
  },
  {
    "command": "selection-manipulator.enclose.mustache",
    "title": "Enclose - Enclose: Mustache ({{ }})",
    "canMultiSelection": true
  },
  {
    "command": "selection-manipulator.enclose.percent",
    "title": "Enclose - Enclose: Percent (%%)",
    "canMultiSelection": true
  },
  {
    "command": "selection-manipulator.enclose.pipes",
    "title": "Enclose - Enclose: Pipes (||)",
    "canMultiSelection": true
  },
  {
    "command": "selection-manipulator.enclose.ascii-box",
    "title": "Enclose - Enclose: ASCII Box",
    "canMultiSelection": true
  },
  {
    "command": "selection-manipulator.enclose.each-word.paren",
    "title": "Enclose - Enclose Each Word: Parentheses (())",
    "canMultiSelection": true
  },
  {
    "command": "selection-manipulator.enclose.lines-block",
    "title": "Enclose - Enclose: Lines Block (Before / After Lines)",
    "canMultiSelection": true
  },
  {
    "command": "selection-manipulator.enclose.cycle-brackets",
    "title": "Enclose - Enclose: Cycle Brackets",
    "canMultiSelection": true
  },
  {
    "command": "selection-manipulator.enclose.remove-outer-brackets",
    "title": "Enclose - Enclose: Remove Matching Outer Brackets",
    "canMultiSelection": true
  },
  {
    "command": "selection-manipulator.enclose.markdown-inline-code",
    "title": "Enclose - Enclose: Backtick Code (Auto Fence)",
    "canMultiSelection": true
  },
  {
    "command": "selection-manipulator.markdown.link",
    "title": "Markdown - Create Link",
    "canMultiSelection": true
  },
  {
    "command": "selection-manipulator.insert.date.iso",
    "title": "Insert - Date (ISO 8601)",
    "canMultiSelection": true
  },
  {
    "command": "selection-manipulator.insert.date.locale",
    "title": "Insert - Date (Locale String)",
    "canMultiSelection": true
  },
  {
    "command": "selection-manipulator.insert.date.timestamp",
    "title": "Insert - Date (Unix Timestamp)",
    "canMultiSelection": true
  },
  {
    "command": "selection-manipulator.random.lorem-ipsum",
    "title": "Random - Lorem Ipsum",
    "canMultiSelection": true
  },
  {
    "command": "selection-manipulator.text.trim-lines-trailing",
    "title": "Text Cleanup - Trim Trailing Whitespace",
    "canMultiSelection": true
  },
  {
    "command": "selection-manipulator.text.remove-duplicate-lines",
    "title": "Text Cleanup - Remove Duplicate Lines",
    "canMultiSelection": true
  },
  {
    "command": "selection-manipulator.shuffle.character",
    "title": "Extract - Shuffle Characters",
    "canMultiSelection": true
  },
  {
    "command": "selection-manipulator.shuffle.character.replace",
    "title": "Extract - Shuffle Characters (Replace)",
    "canMultiSelection": true
  },
  {
    "command": "selection-manipulator.shuffle.character.clipboard",
    "title": "Extract - Shuffle Characters (Clipboard)",
    "canMultiSelection": true
  },
  {
    "command": "selection-manipulator.diff",
    "title": "Diff - Diff Selections",
    "canMultiSelection": true
  },
  {
    "command": "selection-manipulator.text.select-matches",
    "title": "Text - Select Matches",
    "canMultiSelection": true
  },
  {
    "command": "selection-manipulator.whitespace.tabs-to-spaces-2",
    "title": "Whitespace: Leading Tabs to Spaces (2)",
    "canMultiSelection": true
  },
  {
    "command": "selection-manipulator.whitespace.tabs-to-spaces-4",
    "title": "Whitespace: Leading Tabs to Spaces (4)",
    "canMultiSelection": true
  },
  {
    "command": "selection-manipulator.whitespace.spaces-to-tabs-2",
    "title": "Whitespace: Leading Spaces to Tabs (2)",
    "canMultiSelection": true
  },
  {
    "command": "selection-manipulator.whitespace.spaces-to-tabs-4",
    "title": "Whitespace: Leading Spaces to Tabs (4)",
    "canMultiSelection": true
  },
  {
    "command": "selection-manipulator.whitespace.reindent-2-to-4",
    "title": "Whitespace: Re-indent 2 to 4 Spaces",
    "canMultiSelection": true
  },
  {
    "command": "selection-manipulator.whitespace.reindent-4-to-2",
    "title": "Whitespace: Re-indent 4 to 2 Spaces",
    "canMultiSelection": true
  },
  {
    "command": "selection-manipulator.whitespace.dedent",
    "title": "Whitespace: Remove Common Indent (Dedent)",
    "canMultiSelection": true
  },
  {
    "command": "selection-manipulator.whitespace.trim-leading",
    "title": "Whitespace: Trim Leading Whitespace",
    "canMultiSelection": true
  },
  {
    "command": "selection-manipulator.whitespace.collapse-blank-lines",
    "title": "Whitespace: Collapse Consecutive Blank Lines",
    "canMultiSelection": true
  },
  {
    "command": "selection-manipulator.whitespace.remove-all",
    "title": "Whitespace: Remove All Whitespace",
    "canMultiSelection": true
  },
  {
    "command": "selection-manipulator.whitespace.unwrap-paragraphs",
    "title": "Whitespace: Unwrap Paragraphs",
    "canMultiSelection": true
  },
  {
    "command": "selection-manipulator.whitespace.hard-wrap-80",
    "title": "Whitespace: Hard Wrap at 80 Columns",
    "canMultiSelection": true
  },
  {
    "command": "selection-manipulator.whitespace.hard-wrap-n",
    "title": "Whitespace: Hard Wrap at N Columns",
    "canMultiSelection": true
  },
  {
    "command": "selection-manipulator.whitespace.nbsp-to-space",
    "title": "Whitespace: Special Spaces to Normal Space",
    "canMultiSelection": true
  },
  {
    "command": "selection-manipulator.whitespace.visualize",
    "title": "Whitespace: Visualize Spaces and Tabs",
    "canMultiSelection": true
  },
  {
    "command": "selection-manipulator.whitespace.unvisualize",
    "title": "Whitespace: Restore Visualized Spaces and Tabs",
    "canMultiSelection": true
  },
  {
    "command": "selection-manipulator.whitespace.center-align",
    "title": "Whitespace: Center Align Lines",
    "canMultiSelection": true
  },
  {
    "command": "selection-manipulator.whitespace.right-align",
    "title": "Whitespace: Right Align Lines",
    "canMultiSelection": true
  },
  {
    "command": "selection-manipulator.whitespace.pad-to-longest",
    "title": "Whitespace: Pad Lines to Same Length",
    "canMultiSelection": true
  },
  {
    "command": "selection-manipulator.whitespace.align-equals",
    "title": "Whitespace: Align by Equals Sign (=)",
    "canMultiSelection": true
  },
  {
    "command": "selection-manipulator.whitespace.align-colon",
    "title": "Whitespace: Align by Colon (:)",
    "canMultiSelection": true
  },
  {
    "command": "selection-manipulator.whitespace.align-comma",
    "title": "Whitespace: Align Columns by \",\"",
    "canMultiSelection": true
  },
  {
    "command": "selection-manipulator.whitespace.align-custom",
    "title": "Whitespace: Align by Custom Delimiter",
    "canMultiSelection": true
  },
  {
    "command": "selection-manipulator.whitespace.blank-line-between",
    "title": "Whitespace: Insert Blank Line Between Lines",
    "canMultiSelection": true
  },
  {
    "command": "selection-manipulator.whitespace.remove-trailing-blank-lines",
    "title": "Whitespace: Remove Trailing Blank Lines",
    "canMultiSelection": true
  },
  {
    "command": "selection-manipulator.whitespace.remove-leading-blank-lines",
    "title": "Whitespace: Remove Leading Blank Lines",
    "canMultiSelection": true
  },
  {
    "command": "selection-manipulator.whitespace.collapse-inline",
    "title": "Whitespace: Collapse Inline Spaces (Keep Indent)",
    "canMultiSelection": true
  },
  {
    "command": "selection-manipulator.whitespace.space-around-operators",
    "title": "Whitespace: Add Spaces Around Operators",
    "canMultiSelection": true
  },
  {
    "command": "selection-manipulator.whitespace.remove-space-before-punctuation",
    "title": "Whitespace: Remove Space Before Punctuation",
    "canMultiSelection": true
  },
  {
    "command": "selection-manipulator.whitespace.space-after-comma",
    "title": "Whitespace: Ensure Space After Comma",
    "canMultiSelection": true
  },
  {
    "command": "selection-manipulator.whitespace.indent-n",
    "title": "Whitespace: Indent Lines by N Spaces",
    "canMultiSelection": true
  },
  {
    "command": "selection-manipulator.whitespace.outdent-n",
    "title": "Whitespace: Outdent Lines by N Spaces",
    "canMultiSelection": true
  },
  {
    "command": "selection-manipulator.whitespace.expand-tabs",
    "title": "Whitespace: Expand All Tabs (Tab Stops)",
    "canMultiSelection": true
  },
  {
    "command": "selection-manipulator.whitespace.unexpand-tabs",
    "title": "Whitespace: Unexpand Spaces to Tabs (Tab Stops)",
    "canMultiSelection": true
  },
  {
    "command": "selection-manipulator.whitespace.clear-blank-only-lines",
    "title": "Whitespace: Clear Whitespace-only Lines",
    "canMultiSelection": true
  },
  {
    "command": "selection-manipulator.line.filter-contains",
    "title": "Line: Keep Lines Containing Text",
    "canMultiSelection": true
  },
  {
    "command": "selection-manipulator.line.filter-not-contains",
    "title": "Line: Remove Lines Containing Text",
    "canMultiSelection": true
  },
  {
    "command": "selection-manipulator.line.filter-regex",
    "title": "Line: Keep Lines Matching Regex",
    "canMultiSelection": true
  },
  {
    "command": "selection-manipulator.line.filter-not-regex",
    "title": "Line: Remove Lines Matching Regex",
    "canMultiSelection": true
  },
  {
    "command": "selection-manipulator.line.add-numbers",
    "title": "Line: Add Line Numbers",
    "canMultiSelection": true
  },
  {
    "command": "selection-manipulator.line.add-numbers-padded",
    "title": "Line: Add Line Numbers (Zero Padded)",
    "canMultiSelection": true
  },
  {
    "command": "selection-manipulator.line.keep-duplicates",
    "title": "Line: Keep Only Duplicated Lines",
    "canMultiSelection": true
  },
  {
    "command": "selection-manipulator.line.keep-unique-only",
    "title": "Line: Keep Lines Appearing Once",
    "canMultiSelection": true
  },
  {
    "command": "selection-manipulator.line.dedupe-ignore-case",
    "title": "Line: Remove Duplicate Lines (Ignore Case)",
    "canMultiSelection": true
  },
  {
    "command": "selection-manipulator.line.dedupe-ignore-whitespace",
    "title": "Line: Remove Duplicate Lines (Ignore Whitespace)",
    "canMultiSelection": true
  },
  {
    "command": "selection-manipulator.line.dedupe-adjacent",
    "title": "Line: Remove Adjacent Duplicate Lines",
    "canMultiSelection": true
  },
  {
    "command": "selection-manipulator.line.reverse-words",
    "title": "Line: Reverse Word Order in Each Line",
    "canMultiSelection": true
  },
  {
    "command": "selection-manipulator.line.rotate",
    "title": "Line: Rotate Lines Down",
    "canMultiSelection": true
  },
  {
    "command": "selection-manipulator.line.keep-every-nth",
    "title": "Line: Keep Every Nth Line",
    "canMultiSelection": true
  },
  {
    "command": "selection-manipulator.line.remove-every-nth",
    "title": "Line: Remove Every Nth Line",
    "canMultiSelection": true
  },
  {
    "command": "selection-manipulator.line.keep-odd",
    "title": "Line: Keep Odd Lines",
    "canMultiSelection": true
  },
  {
    "command": "selection-manipulator.line.keep-even",
    "title": "Line: Keep Even Lines",
    "canMultiSelection": true
  },
  {
    "command": "selection-manipulator.line.head",
    "title": "Line: Keep First N Lines",
    "canMultiSelection": true
  },
  {
    "command": "selection-manipulator.line.tail",
    "title": "Line: Keep Last N Lines",
    "canMultiSelection": true
  },
  {
    "command": "selection-manipulator.line.duplicate-each",
    "title": "Line: Duplicate Each Line",
    "canMultiSelection": true
  },
  {
    "command": "selection-manipulator.line.swap-pairs",
    "title": "Line: Swap Adjacent Line Pairs",
    "canMultiSelection": true
  },
  {
    "command": "selection-manipulator.line.join-continuation",
    "title": "Line: Join Backslash-continued Lines",
    "canMultiSelection": true
  },
  {
    "command": "selection-manipulator.line.move-matching-to-top",
    "title": "Line: Move Lines Containing Text to Top",
    "canMultiSelection": true
  },
  {
    "command": "selection-manipulator.line.remove-prefix",
    "title": "Line: Remove Prefix from Each Line",
    "canMultiSelection": true
  },
  {
    "command": "selection-manipulator.line.remove-suffix",
    "title": "Line: Remove Suffix from Each Line",
    "canMultiSelection": true
  },
  {
    "command": "selection-manipulator.line.interleave-halves",
    "title": "Line: Interleave First and Second Half",
    "canMultiSelection": true
  },
  {
    "command": "selection-manipulator.line.join-every-n",
    "title": "Line: Join Every N Lines (Custom Delimiter)",
    "canMultiSelection": true
  },
  {
    "command": "selection-manipulator.line.split-sentences",
    "title": "Line: Split Sentences into Lines",
    "canMultiSelection": true
  },
  {
    "command": "selection-manipulator.line.split-fixed-width",
    "title": "Line: Split into Fixed-width Lines",
    "canMultiSelection": true
  },
  {
    "command": "selection-manipulator.line.remove-comment-lines",
    "title": "Line: Remove Comment Lines",
    "canMultiSelection": true
  },
  {
    "command": "selection-manipulator.line.count-stats",
    "title": "Line: Count Lines, Words and Characters",
    "canMultiSelection": true
  },
  {
    "command": "selection-manipulator.line.extract-between-markers",
    "title": "Line: Extract Lines Between Markers",
    "canMultiSelection": true
  },
  {
    "command": "selection-manipulator.line.extract-longest",
    "title": "Line: Extract Longest Line",
    "canMultiSelection": true
  },
  {
    "command": "selection-manipulator.line.extract-shortest",
    "title": "Line: Extract Shortest Line",
    "canMultiSelection": true
  },
  {
    "command": "selection-manipulator.line.filter-contains.clipboard",
    "title": "Line: Keep Lines Containing Text (Clipboard)",
    "canMultiSelection": true
  },
  {
    "command": "selection-manipulator.line.filter-regex.clipboard",
    "title": "Line: Keep Lines Matching Regex (Clipboard)",
    "canMultiSelection": true
  },
  {
    "command": "selection-manipulator.line.keep-duplicates.clipboard",
    "title": "Line: Keep Only Duplicated Lines (Clipboard)",
    "canMultiSelection": true
  },
  {
    "command": "selection-manipulator.line.keep-unique-only.clipboard",
    "title": "Line: Keep Lines Appearing Once (Clipboard)",
    "canMultiSelection": true
  },
  {
    "command": "selection-manipulator.line.dedupe-adjacent.clipboard",
    "title": "Line: Remove Adjacent Duplicate Lines (Clipboard)",
    "canMultiSelection": true
  },
  {
    "command": "selection-manipulator.line.extract-between-markers.clipboard",
    "title": "Line: Extract Lines Between Markers (Clipboard)",
    "canMultiSelection": true
  }
,
  {
    "command": "selection-manipulator.html.encode",
    "title": "Transform - Encode - Encode HTML Entities",
    "canMultiSelection": true
  },
  {
    "command": "selection-manipulator.html.decode",
    "title": "Transform - Encode - Decode HTML Entities",
    "canMultiSelection": true
  },
  {
    "command": "selection-manipulator.html.encode-numeric",
    "title": "Transform - Encode - Encode All Characters as Numeric Entities",
    "canMultiSelection": true
  },
  {
    "command": "selection-manipulator.unicode.escape",
    "title": "Transform - Encode - Escape Unicode (\\uXXXX)",
    "canMultiSelection": true
  },
  {
    "command": "selection-manipulator.unicode.unescape",
    "title": "Transform - Encode - Unescape Unicode (\\uXXXX)",
    "canMultiSelection": true
  },
  {
    "command": "selection-manipulator.unicode.escape-es6",
    "title": "Transform - Encode - Escape Unicode (\\u{...})",
    "canMultiSelection": true
  },
  {
    "command": "selection-manipulator.base64url.encode",
    "title": "Transform - Encode - Encode Base64URL",
    "canMultiSelection": true
  },
  {
    "command": "selection-manipulator.base64url.decode",
    "title": "Transform - Encode - Decode Base64URL",
    "canMultiSelection": true
  },
  {
    "command": "selection-manipulator.base32.encode",
    "title": "Transform - Encode - Encode Base32",
    "canMultiSelection": true
  },
  {
    "command": "selection-manipulator.base32.decode",
    "title": "Transform - Encode - Decode Base32",
    "canMultiSelection": true
  },
  {
    "command": "selection-manipulator.base58.encode",
    "title": "Transform - Encode - Encode Base58",
    "canMultiSelection": true
  },
  {
    "command": "selection-manipulator.base58.decode",
    "title": "Transform - Encode - Decode Base58",
    "canMultiSelection": true
  },
  {
    "command": "selection-manipulator.hex.encode",
    "title": "Transform - Encode - Encode Hex (UTF-8 Bytes)",
    "canMultiSelection": true
  },
  {
    "command": "selection-manipulator.hex.decode",
    "title": "Transform - Encode - Decode Hex (UTF-8 Bytes)",
    "canMultiSelection": true
  },
  {
    "command": "selection-manipulator.binary.encode",
    "title": "Transform - Encode - Encode Binary (UTF-8 Bytes)",
    "canMultiSelection": true
  },
  {
    "command": "selection-manipulator.binary.decode",
    "title": "Transform - Encode - Decode Binary (UTF-8 Bytes)",
    "canMultiSelection": true
  },
  {
    "command": "selection-manipulator.punycode.encode",
    "title": "Transform - Encode - Encode Punycode (IDN)",
    "canMultiSelection": true
  },
  {
    "command": "selection-manipulator.punycode.decode",
    "title": "Transform - Encode - Decode Punycode (IDN)",
    "canMultiSelection": true
  },
  {
    "command": "selection-manipulator.quoted-printable.encode",
    "title": "Transform - Encode - Encode Quoted-Printable",
    "canMultiSelection": true
  },
  {
    "command": "selection-manipulator.quoted-printable.decode",
    "title": "Transform - Encode - Decode Quoted-Printable",
    "canMultiSelection": true
  },
  {
    "command": "selection-manipulator.cipher.rot13",
    "title": "Transform - Encode - Cipher: ROT13",
    "canMultiSelection": true
  },
  {
    "command": "selection-manipulator.cipher.rot47",
    "title": "Transform - Encode - Cipher: ROT47",
    "canMultiSelection": true
  },
  {
    "command": "selection-manipulator.cipher.caesar",
    "title": "Transform - Encode - Cipher: Caesar Shift (N)",
    "canMultiSelection": true
  },
  {
    "command": "selection-manipulator.cipher.atbash",
    "title": "Transform - Encode - Cipher: Atbash",
    "canMultiSelection": true
  },
  {
    "command": "selection-manipulator.ascii85.encode",
    "title": "Transform - Encode - Encode Ascii85",
    "canMultiSelection": true
  },
  {
    "command": "selection-manipulator.ascii85.decode",
    "title": "Transform - Encode - Decode Ascii85",
    "canMultiSelection": true
  },
  {
    "command": "selection-manipulator.base64.gzip",
    "title": "Transform - Encode - Gzip Base64",
    "canMultiSelection": true
  },
  {
    "command": "selection-manipulator.base64.gunzip",
    "title": "Transform - Encode - Gunzip Base64",
    "canMultiSelection": true
  },
  {
    "command": "selection-manipulator.url.encode-form",
    "title": "Transform - Encode - Encode Form (x-www-form-urlencoded)",
    "canMultiSelection": true
  },
  {
    "command": "selection-manipulator.url.decode-form",
    "title": "Transform - Encode - Decode Form (x-www-form-urlencoded)",
    "canMultiSelection": true
  },
  {
    "command": "selection-manipulator.base64.encode-each-line",
    "title": "Transform - Encode - Encode Base64 (Each Line)",
    "canMultiSelection": true
  },
  {
    "command": "selection-manipulator.base64.decode-each-line",
    "title": "Transform - Encode - Decode Base64 (Each Line)",
    "canMultiSelection": true
  },
  {
    "command": "selection-manipulator.nato.encode",
    "title": "Transform - Encode - Text to NATO Phonetic Alphabet",
    "canMultiSelection": true
  },
  {
    "command": "selection-manipulator.data-uri.encode-text",
    "title": "Transform - Encode - Encode as Data URI (text/plain)",
    "canMultiSelection": true
  },
  {
    "command": "selection-manipulator.html.encode.replace",
    "title": "Transform - Encode - Encode HTML Entities (Replace)",
    "canMultiSelection": true
  },
  {
    "command": "selection-manipulator.html.decode.replace",
    "title": "Transform - Encode - Decode HTML Entities (Replace)",
    "canMultiSelection": true
  },
  {
    "command": "selection-manipulator.unicode.escape.replace",
    "title": "Transform - Encode - Escape Unicode (\\uXXXX) (Replace)",
    "canMultiSelection": true
  },
  {
    "command": "selection-manipulator.unicode.unescape.replace",
    "title": "Transform - Encode - Unescape Unicode (\\uXXXX) (Replace)",
    "canMultiSelection": true
  },
  {
    "command": "selection-manipulator.hex.encode.replace",
    "title": "Transform - Encode - Encode Hex (UTF-8 Bytes) (Replace)",
    "canMultiSelection": true
  },
  {
    "command": "selection-manipulator.hex.decode.replace",
    "title": "Transform - Encode - Decode Hex (UTF-8 Bytes) (Replace)",
    "canMultiSelection": true
  },
  {
    "command": "selection-manipulator.crypto.hash-sha224",
    "title": "Transform - Crypto - Create Hash (SHA-224)",
    "canMultiSelection": true
  },
  {
    "command": "selection-manipulator.crypto.hash-sha384",
    "title": "Transform - Crypto - Create Hash (SHA-384)",
    "canMultiSelection": true
  },
  {
    "command": "selection-manipulator.crypto.hash-sha3-256",
    "title": "Transform - Crypto - Create Hash (SHA3-256)",
    "canMultiSelection": true
  },
  {
    "command": "selection-manipulator.crypto.hash-sha3-512",
    "title": "Transform - Crypto - Create Hash (SHA3-512)",
    "canMultiSelection": true
  },
  {
    "command": "selection-manipulator.crypto.hash-sha512-256",
    "title": "Transform - Crypto - Create Hash (SHA-512/256)",
    "canMultiSelection": true
  },
  {
    "command": "selection-manipulator.crypto.hash-blake2b512",
    "title": "Transform - Crypto - Create Hash (BLAKE2b-512)",
    "canMultiSelection": true
  },
  {
    "command": "selection-manipulator.crypto.hash-blake2s256",
    "title": "Transform - Crypto - Create Hash (BLAKE2s-256)",
    "canMultiSelection": true
  },
  {
    "command": "selection-manipulator.crypto.hmac-sha1",
    "title": "Transform - Crypto - Create HMAC (SHA-1)",
    "canMultiSelection": true
  },
  {
    "command": "selection-manipulator.crypto.hmac-sha384",
    "title": "Transform - Crypto - Create HMAC (SHA-384)",
    "canMultiSelection": true
  },
  {
    "command": "selection-manipulator.crypto.hmac-sha3-256",
    "title": "Transform - Crypto - Create HMAC (SHA3-256)",
    "canMultiSelection": true
  },
  {
    "command": "selection-manipulator.checksum.crc32",
    "title": "Transform - Checksum - Checksum: CRC-32",
    "canMultiSelection": true
  },
  {
    "command": "selection-manipulator.checksum.adler32",
    "title": "Transform - Checksum - Checksum: Adler-32",
    "canMultiSelection": true
  },
  {
    "command": "selection-manipulator.checksum.fnv1a-32",
    "title": "Transform - Checksum - Checksum: FNV-1a 32-bit",
    "canMultiSelection": true
  },
  {
    "command": "selection-manipulator.crypto.hash-sha256-base64",
    "title": "Transform - Crypto - Create Hash (SHA-256, Base64)",
    "canMultiSelection": true
  },
  {
    "command": "selection-manipulator.crypto.sri-sha384",
    "title": "Transform - Crypto - Create SRI Hash (sha384)",
    "canMultiSelection": true
  },
  {
    "command": "selection-manipulator.crypto.hash-sha256-each-line",
    "title": "Transform - Crypto - Create Hash per Line (SHA-256)",
    "canMultiSelection": true
  },
  {
    "command": "selection-manipulator.checksum.luhn",
    "title": "Transform - Checksum - Checksum: Luhn Validate",
    "canMultiSelection": true
  },
  {
    "command": "selection-manipulator.crypto.hash-sha384.replace",
    "title": "Transform - Crypto - Create Hash (SHA-384) (Replace)",
    "canMultiSelection": true
  },
  {
    "command": "selection-manipulator.crypto.hash-sha3-256.replace",
    "title": "Transform - Crypto - Create Hash (SHA3-256) (Replace)",
    "canMultiSelection": true
  },
  {
    "command": "selection-manipulator.crypto.hash-blake2b512.replace",
    "title": "Transform - Crypto - Create Hash (BLAKE2b-512) (Replace)",
    "canMultiSelection": true
  },
  {
    "command": "selection-manipulator.json.sort-keys",
    "title": "Transform - Data Format - Sort JSON Keys",
    "canMultiSelection": true
  },
  {
    "command": "selection-manipulator.json.to-query-string",
    "title": "Transform - Data Format - Convert JSON to Query String",
    "canMultiSelection": true
  },
  {
    "command": "selection-manipulator.json.to-env",
    "title": "Transform - Data Format - Convert JSON to Env",
    "canMultiSelection": true
  },
  {
    "command": "selection-manipulator.json.to-xml",
    "title": "Transform - Data Format - Convert JSON to XML",
    "canMultiSelection": true
  },
  {
    "command": "selection-manipulator.json.to-toml",
    "title": "Transform - Data Format - Convert JSON to TOML",
    "canMultiSelection": true
  },
  {
    "command": "selection-manipulator.toml.to-json",
    "title": "Transform - Data Format - Convert TOML to JSON",
    "canMultiSelection": true
  },
  {
    "command": "selection-manipulator.json.to-ini",
    "title": "Transform - Data Format - Convert JSON to INI",
    "canMultiSelection": true
  },
  {
    "command": "selection-manipulator.ini.to-json",
    "title": "Transform - Data Format - Convert INI to JSON",
    "canMultiSelection": true
  },
  {
    "command": "selection-manipulator.json.to-properties",
    "title": "Transform - Data Format - Convert JSON to .properties",
    "canMultiSelection": true
  },
  {
    "command": "selection-manipulator.properties.to-json",
    "title": "Transform - Data Format - Convert .properties to JSON",
    "canMultiSelection": true
  },
  {
    "command": "selection-manipulator.json.remove-nulls",
    "title": "Transform - Data Format - Remove Null Values from JSON",
    "canMultiSelection": true
  },
  {
    "command": "selection-manipulator.json.to-jsonl",
    "title": "Transform - Data Format - Convert JSON Array to JSON Lines",
    "canMultiSelection": true
  },
  {
    "command": "selection-manipulator.jsonl.to-json",
    "title": "Transform - Data Format - Convert JSON Lines to JSON Array",
    "canMultiSelection": true
  },
  {
    "command": "selection-manipulator.jsonc.to-json",
    "title": "Transform - Data Format - Convert JSONC / JSON5 to JSON",
    "canMultiSelection": true
  },
  {
    "command": "selection-manipulator.json.get-path",
    "title": "Transform - Data Format - Extract JSON Value by Path",
    "canMultiSelection": true
  },
  {
    "command": "selection-manipulator.json.list-paths",
    "title": "Transform - Data Format - List JSON Paths",
    "canMultiSelection": true
  },
  {
    "command": "selection-manipulator.json.keys",
    "title": "Transform - Data Format - Extract JSON Keys",
    "canMultiSelection": true
  },
  {
    "command": "selection-manipulator.json.merge-selections",
    "title": "Transform - Data Format - Merge JSON Objects (Selections)",
    "canMultiSelection": true
  },
  {
    "command": "selection-manipulator.json.validate",
    "title": "Transform - Data Format - Validate JSON",
    "canMultiSelection": true
  },
  {
    "command": "selection-manipulator.yaml.format",
    "title": "Transform - Data Format - Format YAML",
    "canMultiSelection": true
  },
  {
    "command": "selection-manipulator.yaml.sort-keys",
    "title": "Transform - Data Format - Sort YAML Keys",
    "canMultiSelection": true
  },
  {
    "command": "selection-manipulator.json.array-unique",
    "title": "Transform - Data Format - Remove Duplicates in JSON Array",
    "canMultiSelection": true
  },
  {
    "command": "selection-manipulator.json.pluck",
    "title": "Transform - Data Format - Pluck Field from JSON Array",
    "canMultiSelection": true
  },
  {
    "command": "selection-manipulator.json.group-by",
    "title": "Transform - Data Format - Group JSON Array by Field",
    "canMultiSelection": true
  },
  {
    "command": "selection-manipulator.json.count",
    "title": "Transform - Data Format - Count JSON Elements",
    "canMultiSelection": true
  },
  {
    "command": "selection-manipulator.json.to-schema",
    "title": "Transform - Data Format - Generate JSON Schema from JSON",
    "canMultiSelection": true
  },
  {
    "command": "selection-manipulator.json.to-js-object",
    "title": "Transform - Data Format - Convert JSON to JS Object Literal",
    "canMultiSelection": true
  },
  {
    "command": "selection-manipulator.js-object.to-json",
    "title": "Transform - Data Format - Convert JS Object Literal to JSON",
    "canMultiSelection": true
  },
  {
    "command": "selection-manipulator.cookie.to-json",
    "title": "Transform - Data Format - Parse Cookie Header to JSON",
    "canMultiSelection": true
  },
  {
    "command": "selection-manipulator.set-cookie.to-json",
    "title": "Transform - Data Format - Parse Set-Cookie to JSON",
    "canMultiSelection": true
  },
  {
    "command": "selection-manipulator.http-headers.to-json",
    "title": "Transform - Data Format - Parse HTTP Headers to JSON",
    "canMultiSelection": true
  },
  {
    "command": "selection-manipulator.user-agent.to-json",
    "title": "Transform - Data Format - Parse User-Agent to JSON",
    "canMultiSelection": true
  },
  {
    "command": "selection-manipulator.json.parse-nested",
    "title": "Transform - Data Format - Parse Nested JSON Strings",
    "canMultiSelection": true
  },
  {
    "command": "selection-manipulator.json.sort-keys.replace",
    "title": "Transform - Data Format - Sort JSON Keys (Replace)",
    "canMultiSelection": true
  },
  {
    "command": "selection-manipulator.json.to-xml.replace",
    "title": "Transform - Data Format - Convert JSON to XML (Replace)",
    "canMultiSelection": true
  },
  {
    "command": "selection-manipulator.json.to-toml.replace",
    "title": "Transform - Data Format - Convert JSON to TOML (Replace)",
    "canMultiSelection": true
  },
  {
    "command": "selection-manipulator.toml.to-json.replace",
    "title": "Transform - Data Format - Convert TOML to JSON (Replace)",
    "canMultiSelection": true
  },
  {
    "command": "selection-manipulator.json.to-jsonl.replace",
    "title": "Transform - Data Format - Convert JSON Array to JSON Lines (Replace)",
    "canMultiSelection": true
  },
  {
    "command": "selection-manipulator.jsonl.to-json.replace",
    "title": "Transform - Data Format - Convert JSON Lines to JSON Array (Replace)",
    "canMultiSelection": true
  },
  {
    "command": "selection-manipulator.yaml.format.replace",
    "title": "Transform - Data Format - Format YAML (Replace)",
    "canMultiSelection": true
  }
,
  {
    "command": "selection-manipulator.csv.to-json",
    "title": "Transform - CSV - Convert to JSON Array",
    "canMultiSelection": true
  },
  {
    "command": "selection-manipulator.csv.from-json",
    "title": "Transform - CSV - Convert from JSON Array",
    "canMultiSelection": true
  },
  {
    "command": "selection-manipulator.csv.to-tsv",
    "title": "Transform - CSV - Convert to TSV",
    "canMultiSelection": true
  },
  {
    "command": "selection-manipulator.csv.from-tsv",
    "title": "Transform - CSV - Convert from TSV",
    "canMultiSelection": true
  },
  {
    "command": "selection-manipulator.csv.transpose",
    "title": "Transform - CSV - Transpose",
    "canMultiSelection": true
  },
  {
    "command": "selection-manipulator.csv.extract-column",
    "title": "Transform - CSV - Extract Column",
    "canMultiSelection": true
  },
  {
    "command": "selection-manipulator.csv.remove-column",
    "title": "Transform - CSV - Remove Column",
    "canMultiSelection": true
  },
  {
    "command": "selection-manipulator.csv.swap-columns",
    "title": "Transform - CSV - Swap Columns",
    "canMultiSelection": true
  },
  {
    "command": "selection-manipulator.csv.align-columns",
    "title": "Transform - CSV - Align Columns",
    "canMultiSelection": true
  },
  {
    "command": "selection-manipulator.csv.trim-cells",
    "title": "Transform - CSV - Trim Cell Padding",
    "canMultiSelection": true
  },
  {
    "command": "selection-manipulator.csv.to-html-table",
    "title": "Transform - CSV - Convert to HTML Table",
    "canMultiSelection": true
  },
  {
    "command": "selection-manipulator.csv.to-sql-insert",
    "title": "Transform - CSV - Convert to SQL INSERT",
    "canMultiSelection": true
  },
  {
    "command": "selection-manipulator.csv.dedupe-rows",
    "title": "Transform - CSV - Remove Duplicate Rows",
    "canMultiSelection": true
  },
  {
    "command": "selection-manipulator.csv.filter-rows",
    "title": "Transform - CSV - Filter Rows by Column Value",
    "canMultiSelection": true
  },
  {
    "command": "selection-manipulator.csv.sum-column",
    "title": "Transform - CSV - Sum Column",
    "canMultiSelection": true
  },
  {
    "command": "selection-manipulator.csv.add-index",
    "title": "Transform - CSV - Add Index Column",
    "canMultiSelection": true
  },
  {
    "command": "selection-manipulator.csv.change-delimiter",
    "title": "Transform - CSV - Change Delimiter",
    "canMultiSelection": true
  },
  {
    "command": "selection-manipulator.csv.quote-all",
    "title": "Transform - CSV - Quote All Fields",
    "canMultiSelection": true
  },
  {
    "command": "selection-manipulator.csv.unquote",
    "title": "Transform - CSV - Remove Unnecessary Quotes",
    "canMultiSelection": true
  },
  {
    "command": "selection-manipulator.csv.to-yaml",
    "title": "Transform - CSV - Convert to YAML",
    "canMultiSelection": true
  },
  {
    "command": "selection-manipulator.csv.to-ascii-table",
    "title": "Transform - CSV - Convert to ASCII Table",
    "canMultiSelection": true
  },
  {
    "command": "selection-manipulator.csv.from-whitespace",
    "title": "Transform - CSV - Convert from Whitespace-separated Table",
    "canMultiSelection": true
  },
  {
    "command": "selection-manipulator.csv.info",
    "title": "Transform - CSV - Show Row and Column Count",
    "canMultiSelection": true
  },
  {
    "command": "selection-manipulator.csv.fill-down",
    "title": "Transform - CSV - Fill Empty Cells from Above",
    "canMultiSelection": true
  },
  {
    "command": "selection-manipulator.csv.to-records",
    "title": "Transform - CSV - Convert Rows to Key-Value Records",
    "canMultiSelection": true
  },
  {
    "command": "selection-manipulator.csv.to-json.replace",
    "title": "Transform - CSV - Convert to JSON Array (Replace)",
    "canMultiSelection": true
  },
  {
    "command": "selection-manipulator.csv.from-json.replace",
    "title": "Transform - CSV - Convert from JSON Array (Replace)",
    "canMultiSelection": true
  },
  {
    "command": "selection-manipulator.csv.to-tsv.replace",
    "title": "Transform - CSV - Convert to TSV (Replace)",
    "canMultiSelection": true
  },
  {
    "command": "selection-manipulator.csv.transpose.replace",
    "title": "Transform - CSV - Transpose (Replace)",
    "canMultiSelection": true
  },
  {
    "command": "selection-manipulator.csv.to-html-table.replace",
    "title": "Transform - CSV - Convert to HTML Table (Replace)",
    "canMultiSelection": true
  },
  {
    "command": "selection-manipulator.math.median",
    "title": "Math - Median",
    "canMultiSelection": true
  },
  {
    "command": "selection-manipulator.math.mode",
    "title": "Math - Mode",
    "canMultiSelection": true
  },
  {
    "command": "selection-manipulator.math.stddev",
    "title": "Math - Standard Deviation",
    "canMultiSelection": true
  },
  {
    "command": "selection-manipulator.math.variance",
    "title": "Math - Variance",
    "canMultiSelection": true
  },
  {
    "command": "selection-manipulator.math.count",
    "title": "Math - Count Numbers",
    "canMultiSelection": true
  },
  {
    "command": "selection-manipulator.math.product",
    "title": "Math - Product",
    "canMultiSelection": true
  },
  {
    "command": "selection-manipulator.math.range",
    "title": "Math - Range",
    "canMultiSelection": true
  },
  {
    "command": "selection-manipulator.math.percentile",
    "title": "Math - Percentile",
    "canMultiSelection": true
  },
  {
    "command": "selection-manipulator.math.summary",
    "title": "Math - Statistics Summary",
    "canMultiSelection": true
  },
  {
    "command": "selection-manipulator.math.cumulative-sum",
    "title": "Math - Cumulative Sum",
    "canMultiSelection": true
  },
  {
    "command": "selection-manipulator.number.round",
    "title": "Replace - Number - Round",
    "canMultiSelection": true
  },
  {
    "command": "selection-manipulator.number.floor",
    "title": "Replace - Number - Floor",
    "canMultiSelection": true
  },
  {
    "command": "selection-manipulator.number.ceil",
    "title": "Replace - Number - Ceil",
    "canMultiSelection": true
  },
  {
    "command": "selection-manipulator.number.truncate",
    "title": "Replace - Number - Truncate",
    "canMultiSelection": true
  },
  {
    "command": "selection-manipulator.number.abs",
    "title": "Replace - Number - Absolute Value",
    "canMultiSelection": true
  },
  {
    "command": "selection-manipulator.number.negate",
    "title": "Replace - Number - Negate",
    "canMultiSelection": true
  },
  {
    "command": "selection-manipulator.number.add-separator",
    "title": "Replace - Number - Add Thousands Separator",
    "canMultiSelection": true
  },
  {
    "command": "selection-manipulator.number.remove-separator",
    "title": "Replace - Number - Remove Thousands Separator",
    "canMultiSelection": true
  },
  {
    "command": "selection-manipulator.number.format-locale",
    "title": "Replace - Number - Format by Locale",
    "canMultiSelection": true
  },
  {
    "command": "selection-manipulator.number.to-hex",
    "title": "Replace - Number - Decimal to Hex",
    "canMultiSelection": true
  },
  {
    "command": "selection-manipulator.number.from-hex",
    "title": "Replace - Number - Hex to Decimal",
    "canMultiSelection": true
  },
  {
    "command": "selection-manipulator.number.to-binary",
    "title": "Replace - Number - Decimal to Binary",
    "canMultiSelection": true
  },
  {
    "command": "selection-manipulator.number.from-binary",
    "title": "Replace - Number - Binary to Decimal",
    "canMultiSelection": true
  },
  {
    "command": "selection-manipulator.number.to-octal",
    "title": "Replace - Number - Decimal to Octal",
    "canMultiSelection": true
  },
  {
    "command": "selection-manipulator.number.from-octal",
    "title": "Replace - Number - Octal to Decimal",
    "canMultiSelection": true
  },
  {
    "command": "selection-manipulator.number.convert-base",
    "title": "Replace - Number - Convert Base (2-36)",
    "canMultiSelection": true
  },
  {
    "command": "selection-manipulator.number.to-scientific",
    "title": "Replace - Number - To Scientific Notation",
    "canMultiSelection": true
  },
  {
    "command": "selection-manipulator.number.from-scientific",
    "title": "Replace - Number - From Scientific Notation",
    "canMultiSelection": true
  },
  {
    "command": "selection-manipulator.number.to-percent",
    "title": "Replace - Number - To Percent",
    "canMultiSelection": true
  },
  {
    "command": "selection-manipulator.number.bytes-to-human",
    "title": "Replace - Number - Bytes to Human Readable",
    "canMultiSelection": true
  },
  {
    "command": "selection-manipulator.number.human-to-bytes",
    "title": "Replace - Number - Human Readable to Bytes",
    "canMultiSelection": true
  },
  {
    "command": "selection-manipulator.number.to-words-en",
    "title": "Replace - Number - To English Words",
    "canMultiSelection": true
  },
  {
    "command": "selection-manipulator.number.ordinal-en",
    "title": "Replace - Number - Add English Ordinal Suffix",
    "canMultiSelection": true
  },
  {
    "command": "selection-manipulator.number.to-fraction",
    "title": "Replace - Number - Decimal to Fraction",
    "canMultiSelection": true
  },
  {
    "command": "selection-manipulator.unit.celsius-to-fahrenheit",
    "title": "Unit - Celsius to Fahrenheit",
    "canMultiSelection": true
  },
  {
    "command": "selection-manipulator.unit.fahrenheit-to-celsius",
    "title": "Unit - Fahrenheit to Celsius",
    "canMultiSelection": true
  },
  {
    "command": "selection-manipulator.unit.km-to-mile",
    "title": "Unit - km to mile",
    "canMultiSelection": true
  },
  {
    "command": "selection-manipulator.unit.mile-to-km",
    "title": "Unit - mile to km",
    "canMultiSelection": true
  },
  {
    "command": "selection-manipulator.unit.cm-to-inch",
    "title": "Unit - cm to inch",
    "canMultiSelection": true
  },
  {
    "command": "selection-manipulator.unit.inch-to-cm",
    "title": "Unit - inch to cm",
    "canMultiSelection": true
  },
  {
    "command": "selection-manipulator.random.uuid-v7",
    "title": "Random - UUID v7",
    "canMultiSelection": true
  },
  {
    "command": "selection-manipulator.random.ulid",
    "title": "Random - ULID",
    "canMultiSelection": true
  },
  {
    "command": "selection-manipulator.random.nanoid",
    "title": "Random - NanoID",
    "canMultiSelection": true
  },
  {
    "command": "selection-manipulator.random.hex",
    "title": "Random - Hex String",
    "canMultiSelection": true
  },
  {
    "command": "selection-manipulator.random.base64",
    "title": "Random - Base64 Token",
    "canMultiSelection": true
  },
  {
    "command": "selection-manipulator.random.integer",
    "title": "Random - Integer in Range",
    "canMultiSelection": true
  },
  {
    "command": "selection-manipulator.random.float",
    "title": "Random - Float in Range",
    "canMultiSelection": true
  },
  {
    "command": "selection-manipulator.random.pick-line",
    "title": "Random - Pick One Line",
    "canMultiSelection": true
  },
  {
    "command": "selection-manipulator.random.sample-lines",
    "title": "Random - Pick N Lines",
    "canMultiSelection": true
  },
  {
    "command": "selection-manipulator.random.mac",
    "title": "Random - MAC Address",
    "canMultiSelection": true
  },
  {
    "command": "selection-manipulator.random.color",
    "title": "Random - Hex Color",
    "canMultiSelection": true
  },
  {
    "command": "selection-manipulator.random.date",
    "title": "Random - Date in Range",
    "canMultiSelection": true
  },
  {
    "command": "selection-manipulator.random.email",
    "title": "Random - Dummy Email",
    "canMultiSelection": true
  },
  {
    "command": "selection-manipulator.random.name",
    "title": "Random - Dummy Name",
    "canMultiSelection": true
  },
  {
    "command": "selection-manipulator.random.name-ja",
    "title": "Random - Dummy Japanese Name",
    "canMultiSelection": true
  },
  {
    "command": "selection-manipulator.random.phone-jp",
    "title": "Random - Dummy Phone Number (JP)",
    "canMultiSelection": true
  },
  {
    "command": "selection-manipulator.random.text-ja",
    "title": "Random - Japanese Dummy Text",
    "canMultiSelection": true
  },
  {
    "command": "selection-manipulator.random.boolean",
    "title": "Random - Boolean",
    "canMultiSelection": true
  },
  {
    "command": "selection-manipulator.random.dice",
    "title": "Random - Dice Roll",
    "canMultiSelection": true
  },
  {
    "command": "selection-manipulator.generate.alpha-sequence",
    "title": "Generate - Alphabet Sequence",
    "canMultiSelection": true
  },
  {
    "command": "selection-manipulator.generate.roman-sequence",
    "title": "Generate - Roman Numeral Sequence",
    "canMultiSelection": true
  },
  {
    "command": "selection-manipulator.generate.date-sequence",
    "title": "Generate - Date Sequence",
    "canMultiSelection": true
  },
  {
    "command": "selection-manipulator.generate.number-range",
    "title": "Generate - Number Range",
    "canMultiSelection": true
  },
  {
    "command": "selection-manipulator.generate.repeat-char",
    "title": "Generate - Repeat Character to Width",
    "canMultiSelection": true
  },
  {
    "command": "selection-manipulator.generate.hex-sequence",
    "title": "Generate - Hex Sequence",
    "canMultiSelection": true
  },
  {
    "command": "selection-manipulator.generate.kana-sequence",
    "title": "Generate - Kana Sequence",
    "canMultiSelection": true
  },
  {
    "command": "selection-manipulator.generate.circled-sequence",
    "title": "Generate - Circled Number Sequence",
    "canMultiSelection": true
  },
  {
    "command": "selection-manipulator.generate.column-ruler",
    "title": "Generate - Column Ruler",
    "canMultiSelection": true
  },
  {
    "command": "selection-manipulator.generate.guid-braced",
    "title": "Generate - GUID (Braced Uppercase)",
    "canMultiSelection": true
  },
  {
    "command": "selection-manipulator.generate.ipv4-sequence",
    "title": "Generate - IPv4 Sequence",
    "canMultiSelection": true
  },
  {
    "command": "selection-manipulator.japanese.kana-to-romaji",
    "title": "Japanese - Kana to Romaji (Hepburn)",
    "canMultiSelection": true
  },
  {
    "command": "selection-manipulator.japanese.romaji-to-hiragana",
    "title": "Japanese - Romaji to Hiragana",
    "canMultiSelection": true
  },
  {
    "command": "selection-manipulator.japanese.number-to-kanji",
    "title": "Japanese - Number to Kanji Numeral",
    "canMultiSelection": true
  },
  {
    "command": "selection-manipulator.japanese.kanji-to-number",
    "title": "Japanese - Kanji Numeral to Number",
    "canMultiSelection": true
  },
  {
    "command": "selection-manipulator.japanese.number-to-daiji",
    "title": "Japanese - Number to Daiji",
    "canMultiSelection": true
  },
  {
    "command": "selection-manipulator.japanese.punctuation-to-comma",
    "title": "Japanese - Punctuation to Comma and Period (，．)",
    "canMultiSelection": true
  },
  {
    "command": "selection-manipulator.japanese.punctuation-to-touten",
    "title": "Japanese - Punctuation to Touten and Kuten (、。)",
    "canMultiSelection": true
  },
  {
    "command": "selection-manipulator.japanese.kyujitai-to-shinjitai",
    "title": "Japanese - Old Kanji to New (Kyujitai to Shinjitai)",
    "canMultiSelection": true
  },
  {
    "command": "selection-manipulator.japanese.shinjitai-to-kyujitai",
    "title": "Japanese - New Kanji to Old (Shinjitai to Kyujitai)",
    "canMultiSelection": true
  },
  {
    "command": "selection-manipulator.japanese.small-kana-to-normal",
    "title": "Japanese - Small Kana to Normal",
    "canMultiSelection": true
  },
  {
    "command": "selection-manipulator.japanese.manuscript-count",
    "title": "Japanese - Count Characters (Manuscript Paper)",
    "canMultiSelection": true
  },
  {
    "command": "selection-manipulator.japanese.remove-ruby",
    "title": "Japanese - Remove Ruby Notation",
    "canMultiSelection": true
  },
  {
    "command": "selection-manipulator.japanese.ruby-to-html",
    "title": "Japanese - Ruby Notation to HTML",
    "canMultiSelection": true
  },
  {
    "command": "selection-manipulator.japanese.fullwidth-alnum-to-half",
    "title": "Japanese - Full-width Alphanumerics to Half (Keep Kana)",
    "canMultiSelection": true
  },
  {
    "command": "selection-manipulator.japanese.ideographic-space-to-space",
    "title": "Japanese - Ideographic Space to Space",
    "canMultiSelection": true
  },
  {
    "command": "selection-manipulator.japanese.normalize-wave-dash",
    "title": "Japanese - Normalize Wave Dash",
    "canMultiSelection": true
  },
  {
    "command": "selection-manipulator.japanese.normalize-hyphens",
    "title": "Japanese - Normalize Hyphens and Long Vowel Marks",
    "canMultiSelection": true
  },
  {
    "command": "selection-manipulator.japanese.extract-kanji",
    "title": "Japanese - Extract Kanji",
    "canMultiSelection": true
  },
  {
    "command": "selection-manipulator.japanese.extract-katakana-words",
    "title": "Japanese - Extract Katakana Words",
    "canMultiSelection": true
  },
  {
    "command": "selection-manipulator.japanese.char-type-count",
    "title": "Japanese - Count by Character Type",
    "canMultiSelection": true
  },
  {
    "command": "selection-manipulator.japanese.circled-number-to-paren",
    "title": "Japanese - Circled Numbers to Parentheses",
    "canMultiSelection": true
  },
  {
    "command": "selection-manipulator.japanese.prefecture-code",
    "title": "Japanese - Prefecture Name to/from JIS Code",
    "canMultiSelection": true
  },
  {
    "command": "selection-manipulator.japanese.postal-code-format",
    "title": "Japanese - Format Postal Code",
    "canMultiSelection": true
  },
  {
    "command": "selection-manipulator.japanese.hiragana-to-halfwidth-katakana",
    "title": "Japanese - Hiragana to Half-width Katakana",
    "canMultiSelection": true
  },
  {
    "command": "selection-manipulator.japanese.remove-spaces-between-japanese",
    "title": "Japanese - Remove Spaces Between Japanese Characters",
    "canMultiSelection": true
  },
  {
    "command": "selection-manipulator.japanese.space-between-ja-en",
    "title": "Japanese - Add Space Between Japanese and Alphanumerics",
    "canMultiSelection": true
  },
  {
    "command": "selection-manipulator.japanese.compose-dakuten",
    "title": "Japanese - Compose Dakuten",
    "canMultiSelection": true
  },
  {
    "command": "selection-manipulator.japanese.kana-to-romaji-kunrei",
    "title": "Japanese - Kana to Romaji (Kunrei)",
    "canMultiSelection": true
  },
  {
    "command": "selection-manipulator.japanese.detect-platform-dependent",
    "title": "Japanese - Detect Platform-dependent Characters",
    "canMultiSelection": true
  },
  {
    "command": "selection-manipulator.japanese.kana-to-romaji.replace",
    "title": "Japanese - Kana to Romaji (Hepburn) (Replace)",
    "canMultiSelection": true
  },
  {
    "command": "selection-manipulator.japanese.romaji-to-hiragana.replace",
    "title": "Japanese - Romaji to Hiragana (Replace)",
    "canMultiSelection": true
  },
  {
    "command": "selection-manipulator.japanese.number-to-kanji.replace",
    "title": "Japanese - Number to Kanji Numeral (Replace)",
    "canMultiSelection": true
  },
  {
    "command": "selection-manipulator.japanese.kanji-to-number.replace",
    "title": "Japanese - Kanji Numeral to Number (Replace)",
    "canMultiSelection": true
  },
  {
    "command": "selection-manipulator.japanese.kyujitai-to-shinjitai.replace",
    "title": "Japanese - Old Kanji to New (Kyujitai to Shinjitai) (Replace)",
    "canMultiSelection": true
  },
  {
    "command": "selection-manipulator.japanese.space-between-ja-en.replace",
    "title": "Japanese - Add Space Between Japanese and Alphanumerics (Replace)",
    "canMultiSelection": true
  },
  {
    "command": "selection-manipulator.unicode.normalize-nfc",
    "title": "Unicode - Normalize NFC",
    "canMultiSelection": true
  },
  {
    "command": "selection-manipulator.unicode.normalize-nfd",
    "title": "Unicode - Normalize NFD",
    "canMultiSelection": true
  },
  {
    "command": "selection-manipulator.unicode.normalize-nfkc",
    "title": "Unicode - Normalize NFKC",
    "canMultiSelection": true
  },
  {
    "command": "selection-manipulator.unicode.normalize-nfkd",
    "title": "Unicode - Normalize NFKD",
    "canMultiSelection": true
  },
  {
    "command": "selection-manipulator.unicode.remove-zero-width",
    "title": "Unicode - Remove Zero-width Characters",
    "canMultiSelection": true
  },
  {
    "command": "selection-manipulator.unicode.reveal-invisible",
    "title": "Unicode - Reveal Invisible Characters",
    "canMultiSelection": true
  },
  {
    "command": "selection-manipulator.unicode.to-codepoints",
    "title": "Unicode - Show Code Points",
    "canMultiSelection": true
  },
  {
    "command": "selection-manipulator.unicode.from-codepoints",
    "title": "Unicode - Code Points to Text",
    "canMultiSelection": true
  },
  {
    "command": "selection-manipulator.unicode.to-utf8-bytes",
    "title": "Unicode - Show UTF-8 Bytes per Character",
    "canMultiSelection": true
  },
  {
    "command": "selection-manipulator.unicode.to-utf16-units",
    "title": "Unicode - Show UTF-16 Code Units",
    "canMultiSelection": true
  },
  {
    "command": "selection-manipulator.unicode.count-graphemes",
    "title": "Unicode - Count Graphemes",
    "canMultiSelection": true
  },
  {
    "command": "selection-manipulator.unicode.remove-control",
    "title": "Unicode - Remove Control Characters",
    "canMultiSelection": true
  },
  {
    "command": "selection-manipulator.unicode.remove-non-ascii",
    "title": "Unicode - Remove Non-ASCII Characters",
    "canMultiSelection": true
  },
  {
    "command": "selection-manipulator.unicode.remove-emoji",
    "title": "Unicode - Remove Emoji",
    "canMultiSelection": true
  },
  {
    "command": "selection-manipulator.unicode.extract-emoji",
    "title": "Unicode - Extract Emoji",
    "canMultiSelection": true
  },
  {
    "command": "selection-manipulator.unicode.style-bold",
    "title": "Unicode - Mathematical Bold",
    "canMultiSelection": true
  },
  {
    "command": "selection-manipulator.unicode.style-italic",
    "title": "Unicode - Mathematical Italic",
    "canMultiSelection": true
  },
  {
    "command": "selection-manipulator.unicode.style-monospace",
    "title": "Unicode - Mathematical Monospace",
    "canMultiSelection": true
  },
  {
    "command": "selection-manipulator.unicode.style-circled",
    "title": "Unicode - Circled Letters",
    "canMultiSelection": true
  },
  {
    "command": "selection-manipulator.unicode.upside-down",
    "title": "Unicode - Upside Down Text",
    "canMultiSelection": true
  },
  {
    "command": "selection-manipulator.unicode.strikethrough",
    "title": "Unicode - Combining Strikethrough",
    "canMultiSelection": true
  },
  {
    "command": "selection-manipulator.unicode.underline",
    "title": "Unicode - Combining Underline",
    "canMultiSelection": true
  },
  {
    "command": "selection-manipulator.unicode.superscript",
    "title": "Unicode - Superscript",
    "canMultiSelection": true
  },
  {
    "command": "selection-manipulator.unicode.subscript",
    "title": "Unicode - Subscript",
    "canMultiSelection": true
  },
  {
    "command": "selection-manipulator.unicode.detect-confusables",
    "title": "Unicode - Detect Confusable Characters",
    "canMultiSelection": true
  },
  {
    "command": "selection-manipulator.unicode.detect-bidi",
    "title": "Unicode - Detect Bidi Control Characters",
    "canMultiSelection": true
  },
  {
    "command": "selection-manipulator.unicode.smart-quotes",
    "title": "Unicode - Convert to Smart Quotes",
    "canMultiSelection": true
  },
  {
    "command": "selection-manipulator.unicode.typographic-punctuation",
    "title": "Unicode - Typographic Dashes and Ellipsis",
    "canMultiSelection": true
  },
  {
    "command": "selection-manipulator.unicode.detect-scripts",
    "title": "Unicode - Detect Scripts",
    "canMultiSelection": true
  },
  {
    "command": "selection-manipulator.unicode.transliterate-cyrillic",
    "title": "Unicode - Transliterate Cyrillic to Latin",
    "canMultiSelection": true
  },
  {
    "command": "selection-manipulator.programmatic.to-js-string",
    "title": "Convert to JS String Literal",
    "canMultiSelection": true
  },
  {
    "command": "selection-manipulator.programmatic.to-python-string",
    "title": "Convert to Python String Literal",
    "canMultiSelection": true
  },
  {
    "command": "selection-manipulator.programmatic.to-java-string",
    "title": "Convert to Java String Concatenation",
    "canMultiSelection": true
  },
  {
    "command": "selection-manipulator.programmatic.to-go-raw-string",
    "title": "Convert to Go Raw String",
    "canMultiSelection": true
  },
  {
    "command": "selection-manipulator.programmatic.to-template-literal",
    "title": "Convert to JS Template Literal",
    "canMultiSelection": true
  },
  {
    "command": "selection-manipulator.programmatic.escape-regex",
    "title": "Escape Regex Special Characters",
    "canMultiSelection": true
  },
  {
    "command": "selection-manipulator.programmatic.escape-sql",
    "title": "Escape SQL String Literal",
    "canMultiSelection": true
  },
  {
    "command": "selection-manipulator.programmatic.quote-posix-shell",
    "title": "Quote for POSIX Shell",
    "canMultiSelection": true
  },
  {
    "command": "selection-manipulator.programmatic.quote-powershell",
    "title": "Quote for PowerShell",
    "canMultiSelection": true
  },
  {
    "command": "selection-manipulator.programmatic.escape-csv-field",
    "title": "Escape CSV Field",
    "canMultiSelection": true
  },
  {
    "command": "selection-manipulator.programmatic.escape-markdown",
    "title": "Escape Markdown Special Characters",
    "canMultiSelection": true
  },
  {
    "command": "selection-manipulator.programmatic.json-to-typescript",
    "title": "Convert JSON to TypeScript Interface",
    "canMultiSelection": true
  },
  {
    "command": "selection-manipulator.programmatic.json-to-go-struct",
    "title": "Convert JSON to Go Struct",
    "canMultiSelection": true
  },
  {
    "command": "selection-manipulator.programmatic.json-to-python-typeddict",
    "title": "Convert JSON to Python TypedDict",
    "canMultiSelection": true
  },
  {
    "command": "selection-manipulator.programmatic.sql-format",
    "title": "Format SQL",
    "canMultiSelection": true
  },
  {
    "command": "selection-manipulator.programmatic.sql-minify",
    "title": "Minify SQL",
    "canMultiSelection": true
  },
  {
    "command": "selection-manipulator.programmatic.sql-uppercase-keywords",
    "title": "Uppercase SQL Keywords",
    "canMultiSelection": true
  },
  {
    "command": "selection-manipulator.programmatic.css-minify",
    "title": "Minify CSS",
    "canMultiSelection": true
  },
  {
    "command": "selection-manipulator.programmatic.css-format",
    "title": "Format CSS",
    "canMultiSelection": true
  },
  {
    "command": "selection-manipulator.programmatic.hex-to-hsl",
    "title": "Convert Hex to HSL",
    "canMultiSelection": true
  },
  {
    "command": "selection-manipulator.programmatic.hsl-to-hex",
    "title": "Convert HSL to Hex",
    "canMultiSelection": true
  },
  {
    "command": "selection-manipulator.programmatic.hex-shorten-expand",
    "title": "Toggle Hex Color Short / Long",
    "canMultiSelection": true
  },
  {
    "command": "selection-manipulator.programmatic.remove-console-log",
    "title": "Remove console.log Statements",
    "canMultiSelection": true
  },
  {
    "command": "selection-manipulator.programmatic.sort-imports",
    "title": "Sort Import Statements",
    "canMultiSelection": true
  },
  {
    "command": "selection-manipulator.programmatic.concat-to-template",
    "title": "Convert String Concatenation to Template Literal",
    "canMultiSelection": true
  },
  {
    "command": "selection-manipulator.programmatic.curl-to-fetch",
    "title": "Convert curl Command to fetch",
    "canMultiSelection": true
  },
  {
    "command": "selection-manipulator.programmatic.html-to-jsx",
    "title": "Convert HTML to JSX",
    "canMultiSelection": true
  },
  {
    "command": "selection-manipulator.programmatic.semver-bump",
    "title": "Bump Semantic Version",
    "canMultiSelection": true
  },
  {
    "command": "selection-manipulator.programmatic.chmod-convert",
    "title": "Convert chmod Numeric / Symbolic",
    "canMultiSelection": true
  },
  {
    "command": "selection-manipulator.programmatic.to-js-string.replace",
    "title": "Convert to JS String Literal (Replace)",
    "canMultiSelection": true
  },
  {
    "command": "selection-manipulator.programmatic.escape-regex.replace",
    "title": "Escape Regex Special Characters (Replace)",
    "canMultiSelection": true
  },
  {
    "command": "selection-manipulator.programmatic.escape-sql.replace",
    "title": "Escape SQL String Literal (Replace)",
    "canMultiSelection": true
  },
  {
    "command": "selection-manipulator.programmatic.json-to-typescript.replace",
    "title": "Convert JSON to TypeScript Interface (Replace)",
    "canMultiSelection": true
  },
  {
    "command": "selection-manipulator.programmatic.sql-format.replace",
    "title": "Format SQL (Replace)",
    "canMultiSelection": true
  },
  {
    "command": "selection-manipulator.programmatic.html-to-jsx.replace",
    "title": "Convert HTML to JSX (Replace)",
    "canMultiSelection": true
  },
  {
    "command": "selection-manipulator.selection.keep-odd",
    "title": "Selection - Keep Odd Selections",
    "canMultiSelection": true
  },
  {
    "command": "selection-manipulator.selection.keep-even",
    "title": "Selection - Keep Even Selections",
    "canMultiSelection": true
  },
  {
    "command": "selection-manipulator.selection.keep-every-nth",
    "title": "Selection - Keep Every Nth Selection",
    "canMultiSelection": true
  },
  {
    "command": "selection-manipulator.selection.remove-first",
    "title": "Selection - Remove First Selection",
    "canMultiSelection": true
  },
  {
    "command": "selection-manipulator.selection.remove-last",
    "title": "Selection - Remove Last Selection",
    "canMultiSelection": true
  },
  {
    "command": "selection-manipulator.selection.keep-matching",
    "title": "Selection - Keep Selections Matching Regex",
    "canMultiSelection": true
  },
  {
    "command": "selection-manipulator.selection.remove-matching",
    "title": "Selection - Remove Selections Matching Regex",
    "canMultiSelection": true
  },
  {
    "command": "selection-manipulator.selection.remove-empty",
    "title": "Selection - Remove Empty Selections",
    "canMultiSelection": true
  },
  {
    "command": "selection-manipulator.selection.remove-duplicate-text",
    "title": "Selection - Deselect Duplicate Texts",
    "canMultiSelection": true
  },
  {
    "command": "selection-manipulator.selection.align-cursors",
    "title": "Selection - Align Cursors",
    "canMultiSelection": true
  },
  {
    "command": "selection-manipulator.selection.expand-to-word",
    "title": "Selection - Expand to Word",
    "canMultiSelection": true
  },
  {
    "command": "selection-manipulator.selection.expand-to-quotes",
    "title": "Selection - Expand to Inside Quotes",
    "canMultiSelection": true
  },
  {
    "command": "selection-manipulator.selection.expand-to-brackets",
    "title": "Selection - Expand to Inside Brackets",
    "canMultiSelection": true
  },
  {
    "command": "selection-manipulator.selection.trim",
    "title": "Selection - Trim Whitespace from Selections",
    "canMultiSelection": true
  },
  {
    "command": "selection-manipulator.selection.shrink-both-sides",
    "title": "Selection - Shrink Selections by One Character",
    "canMultiSelection": true
  },
  {
    "command": "selection-manipulator.selection.extend-to-delimiter",
    "title": "Selection - Extend to Next Delimiter",
    "canMultiSelection": true
  },
  {
    "command": "selection-manipulator.selection.split-by-delimiter",
    "title": "Selection - Split Selections by Delimiter",
    "canMultiSelection": true
  },
  {
    "command": "selection-manipulator.selection.split-by-regex",
    "title": "Selection - Split Selections by Regex",
    "canMultiSelection": true
  },
  {
    "command": "selection-manipulator.selection.split-words",
    "title": "Selection - Split into Words",
    "canMultiSelection": true
  },
  {
    "command": "selection-manipulator.selection.cursor-to-line-content-start",
    "title": "Selection - Cursors to First Non-whitespace",
    "canMultiSelection": true
  },
  {
    "command": "selection-manipulator.selection.select-column",
    "title": "Selection - Select Column N",
    "canMultiSelection": true
  },
  {
    "command": "selection-manipulator.selection.select-numbers",
    "title": "Selection - Select All Numbers",
    "canMultiSelection": true
  },
  {
    "command": "selection-manipulator.selection.select-strings",
    "title": "Selection - Select All Quoted Strings",
    "canMultiSelection": true
  },
  {
    "command": "selection-manipulator.selection.select-urls",
    "title": "Selection - Select All URLs",
    "canMultiSelection": true
  },
  {
    "command": "selection-manipulator.selection.rotate-forward",
    "title": "Selection - Rotate Texts Forward",
    "canMultiSelection": true
  },
  {
    "command": "selection-manipulator.selection.rotate-backward",
    "title": "Selection - Rotate Texts Backward",
    "canMultiSelection": true
  },
  {
    "command": "selection-manipulator.selection.swap-two",
    "title": "Selection - Swap Two Selections",
    "canMultiSelection": true
  },
  {
    "command": "selection-manipulator.selection.copy-first-to-all",
    "title": "Selection - Copy First Selection to All",
    "canMultiSelection": true
  },
  {
    "command": "selection-manipulator.selection.info",
    "title": "Selection - Show Selection Info",
    "canMultiSelection": true
  },
  {
    "command": "selection-manipulator.selection.select-indentation",
    "title": "Selection - Select Leading Indentation",
    "canMultiSelection": true
  },
  {
    "command": "selection-manipulator.markdown.heading-increase",
    "title": "Markdown: Increase Heading Level",
    "canMultiSelection": true
  },
  {
    "command": "selection-manipulator.markdown.heading-decrease",
    "title": "Markdown: Decrease Heading Level",
    "canMultiSelection": true
  },
  {
    "command": "selection-manipulator.markdown.toc",
    "title": "Markdown: Generate Table of Contents",
    "canMultiSelection": true
  },
  {
    "command": "selection-manipulator.markdown.bullet-list",
    "title": "Markdown: Convert Lines to Bullet List",
    "canMultiSelection": true
  },
  {
    "command": "selection-manipulator.markdown.numbered-list",
    "title": "Markdown: Convert Lines to Numbered List",
    "canMultiSelection": true
  },
  {
    "command": "selection-manipulator.markdown.task-list",
    "title": "Markdown: Convert Lines to Task List",
    "canMultiSelection": true
  },
  {
    "command": "selection-manipulator.markdown.toggle-task",
    "title": "Markdown: Toggle Task Checkbox",
    "canMultiSelection": true
  },
  {
    "command": "selection-manipulator.markdown.remove-list-markers",
    "title": "Markdown: Remove List Markers",
    "canMultiSelection": true
  },
  {
    "command": "selection-manipulator.markdown.renumber-list",
    "title": "Markdown: Renumber Ordered List",
    "canMultiSelection": true
  },
  {
    "command": "selection-manipulator.markdown.bold",
    "title": "Markdown: Bold",
    "canMultiSelection": true
  },
  {
    "command": "selection-manipulator.markdown.italic",
    "title": "Markdown: Italic",
    "canMultiSelection": true
  },
  {
    "command": "selection-manipulator.markdown.strikethrough",
    "title": "Markdown: Strikethrough",
    "canMultiSelection": true
  },
  {
    "command": "selection-manipulator.markdown.setext-to-atx",
    "title": "Markdown: Convert Setext Headings to ATX",
    "canMultiSelection": true
  },
  {
    "command": "selection-manipulator.markdown.code-block",
    "title": "Markdown: Wrap in Code Fence",
    "canMultiSelection": true
  },
  {
    "command": "selection-manipulator.markdown.blockquote",
    "title": "Markdown: Blockquote",
    "canMultiSelection": true
  },
  {
    "command": "selection-manipulator.markdown.image",
    "title": "Markdown: Image",
    "canMultiSelection": true
  },
  {
    "command": "selection-manipulator.markdown.linkify-urls",
    "title": "Markdown: Linkify URLs",
    "canMultiSelection": true
  },
  {
    "command": "selection-manipulator.markdown.format-table",
    "title": "Markdown: Format Table",
    "canMultiSelection": true
  },
  {
    "command": "selection-manipulator.markdown.to-html",
    "title": "Markdown: Convert to HTML",
    "canMultiSelection": true
  },
  {
    "command": "selection-manipulator.markdown.strip",
    "title": "Markdown: Strip Formatting",
    "canMultiSelection": true
  },
  {
    "command": "selection-manipulator.markdown.heading-to-anchor",
    "title": "Markdown: Heading to Anchor Link",
    "canMultiSelection": true
  },
  {
    "command": "selection-manipulator.markdown.footnote",
    "title": "Markdown: Convert to Footnote",
    "canMultiSelection": true
  },
  {
    "command": "selection-manipulator.markdown.reference-links",
    "title": "Markdown: Inline Links to Reference Links",
    "canMultiSelection": true
  },
  {
    "command": "selection-manipulator.markdown.details",
    "title": "Markdown: Wrap in Details Block",
    "canMultiSelection": true
  },
  {
    "command": "selection-manipulator.markdown.front-matter-to-json",
    "title": "Markdown: Front Matter to JSON",
    "canMultiSelection": true
  },
  {
    "command": "selection-manipulator.text.repeat",
    "title": "Text - Repeat Selection N Times",
    "canMultiSelection": true
  },
  {
    "command": "selection-manipulator.text.truncate",
    "title": "Text - Truncate to N Characters",
    "canMultiSelection": true
  },
  {
    "command": "selection-manipulator.text.truncate-middle",
    "title": "Text - Shorten in the Middle",
    "canMultiSelection": true
  },
  {
    "command": "selection-manipulator.text.pad-start",
    "title": "Text - Pad Start to Width (Custom Character)",
    "canMultiSelection": true
  },
  {
    "command": "selection-manipulator.text.pad-end",
    "title": "Text - Pad End to Width (Custom Character)",
    "canMultiSelection": true
  },
  {
    "command": "selection-manipulator.text.insert-every-n",
    "title": "Text - Insert Separator Every N Characters",
    "canMultiSelection": true
  },
  {
    "command": "selection-manipulator.text.translate-chars",
    "title": "Text - Translate Characters (tr)",
    "canMultiSelection": true
  },
  {
    "command": "selection-manipulator.text.delete-chars",
    "title": "Text - Delete Characters in Set",
    "canMultiSelection": true
  },
  {
    "command": "selection-manipulator.text.squeeze-chars",
    "title": "Text - Squeeze Repeated Characters",
    "canMultiSelection": true
  },
  {
    "command": "selection-manipulator.text.remove-digits",
    "title": "Text - Remove Digits",
    "canMultiSelection": true
  },
  {
    "command": "selection-manipulator.text.remove-punctuation",
    "title": "Text - Remove Punctuation",
    "canMultiSelection": true
  },
  {
    "command": "selection-manipulator.text.keep-digits",
    "title": "Text - Keep Digits Only",
    "canMultiSelection": true
  },
  {
    "command": "selection-manipulator.text.reverse-each-word",
    "title": "Text - Reverse Each Word",
    "canMultiSelection": true
  },
  {
    "command": "selection-manipulator.text.sort-words",
    "title": "Text - Sort Words in Selection",
    "canMultiSelection": true
  },
  {
    "command": "selection-manipulator.text.unique-words",
    "title": "Text - Remove Duplicate Words",
    "canMultiSelection": true
  },
  {
    "command": "selection-manipulator.text.sort-characters",
    "title": "Text - Sort Characters",
    "canMultiSelection": true
  },
  {
    "command": "selection-manipulator.text.unique-characters",
    "title": "Text - Remove Duplicate Characters",
    "canMultiSelection": true
  },
  {
    "command": "selection-manipulator.text.word-frequency",
    "title": "Text - Word Frequency Table",
    "canMultiSelection": true
  },
  {
    "command": "selection-manipulator.text.char-frequency",
    "title": "Text - Character Frequency Table",
    "canMultiSelection": true
  },
  {
    "command": "selection-manipulator.text.remove-urls",
    "title": "Text - Remove URLs",
    "canMultiSelection": true
  },
  {
    "command": "selection-manipulator.text.mask-keep-last",
    "title": "Text - Mask Except Last N Characters",
    "canMultiSelection": true
  },
  {
    "command": "selection-manipulator.text.leetspeak",
    "title": "Text - Leetspeak",
    "canMultiSelection": true
  },
  {
    "command": "selection-manipulator.text.remove-between",
    "title": "Text - Remove Text Between Delimiters",
    "canMultiSelection": true
  },
  {
    "command": "selection-manipulator.line.keep-range",
    "title": "Line: Keep Lines N to M",
    "canMultiSelection": true
  },
  {
    "command": "selection-manipulator.line.drop-first-n",
    "title": "Line: Remove First N Lines",
    "canMultiSelection": true
  },
  {
    "command": "selection-manipulator.line.drop-last-n",
    "title": "Line: Remove Last N Lines",
    "canMultiSelection": true
  },
  {
    "command": "selection-manipulator.line.blank-every-n",
    "title": "Line: Insert Blank Line Every N Lines",
    "canMultiSelection": true
  },
  {
    "command": "selection-manipulator.line.cut-chars",
    "title": "Line: Cut Character Range of Each Line",
    "canMultiSelection": true
  },
  {
    "command": "selection-manipulator.line.paste-columns",
    "title": "Line: Paste Selections Side by Side",
    "canMultiSelection": true
  },
  {
    "command": "selection-manipulator.line.dedupe-keep-last",
    "title": "Line: Remove Duplicate Lines (Keep Last)",
    "canMultiSelection": true
  },
  {
    "command": "selection-manipulator.line.split-by-regex",
    "title": "Line: Split into Lines by Regex",
    "canMultiSelection": true
  },
  {
    "command": "selection-manipulator.line.join-natural-list",
    "title": "Line: Join as Natural Language List",
    "canMultiSelection": true
  },
  {
    "command": "selection-manipulator.line.intersect-selections",
    "title": "Line: Lines Common to Two Selections",
    "canMultiSelection": true
  },
  {
    "command": "selection-manipulator.line.subtract-selections",
    "title": "Line: Lines Only in First Selection",
    "canMultiSelection": true
  },
  {
    "command": "selection-manipulator.line.symmetric-difference",
    "title": "Line: Lines in Only One Selection",
    "canMultiSelection": true
  },
  {
    "command": "selection-manipulator.line.number-nonblank",
    "title": "Line: Add Numbers to Non-blank Lines",
    "canMultiSelection": true
  },
  {
    "command": "selection-manipulator.line.fold-to-columns",
    "title": "Line: Arrange Lines into N Columns",
    "canMultiSelection": true
  },
  {
    "command": "selection-manipulator.selection.select-emails",
    "title": "Selection - Select All Email Addresses",
    "canMultiSelection": true
  },
  {
    "command": "selection-manipulator.selection.select-ips",
    "title": "Selection - Select All IP Addresses",
    "canMultiSelection": true
  },
  {
    "command": "selection-manipulator.selection.select-hex-colors",
    "title": "Selection - Select All Hex Colors",
    "canMultiSelection": true
  },
  {
    "command": "selection-manipulator.selection.select-uuids",
    "title": "Selection - Select All UUIDs",
    "canMultiSelection": true
  },
  {
    "command": "selection-manipulator.selection.select-dates",
    "title": "Selection - Select All ISO Dates",
    "canMultiSelection": true
  },
  {
    "command": "selection-manipulator.selection.expand-to-sentence",
    "title": "Selection - Expand to Sentence",
    "canMultiSelection": true
  },
  {
    "command": "selection-manipulator.selection.expand-to-paragraph",
    "title": "Selection - Expand to Paragraph",
    "canMultiSelection": true
  },
  {
    "command": "selection-manipulator.selection.keep-duplicate-text",
    "title": "Selection - Keep Only Duplicate Texts",
    "canMultiSelection": true
  },
  {
    "command": "selection-manipulator.selection.join-into-first",
    "title": "Selection - Join All Selections into First",
    "canMultiSelection": true
  },
  {
    "command": "selection-manipulator.base32.encode-hex",
    "title": "Transform - Encode - Encode Base32hex (RFC 4648 §7)",
    "canMultiSelection": true
  },
  {
    "command": "selection-manipulator.base32.decode-hex",
    "title": "Transform - Encode - Decode Base32hex (RFC 4648 §7)",
    "canMultiSelection": true
  },
  {
    "command": "selection-manipulator.base45.encode",
    "title": "Transform - Encode - Encode Base45 (RFC 9285)",
    "canMultiSelection": true
  },
  {
    "command": "selection-manipulator.base45.decode",
    "title": "Transform - Encode - Decode Base45 (RFC 9285)",
    "canMultiSelection": true
  },
  {
    "command": "selection-manipulator.base62.encode",
    "title": "Transform - Encode - Encode Base62",
    "canMultiSelection": true
  },
  {
    "command": "selection-manipulator.base62.decode",
    "title": "Transform - Encode - Decode Base62",
    "canMultiSelection": true
  },
  {
    "command": "selection-manipulator.uu.encode",
    "title": "Transform - Encode - Encode uuencode",
    "canMultiSelection": true
  },
  {
    "command": "selection-manipulator.uu.decode",
    "title": "Transform - Encode - Decode uuencode",
    "canMultiSelection": true
  },
  {
    "command": "selection-manipulator.url.encode-all",
    "title": "Transform - URL - Encode All Characters as Percent-encoding",
    "canMultiSelection": true
  },
  {
    "command": "selection-manipulator.escape.css-identifier",
    "title": "Escape CSS Identifier",
    "canMultiSelection": true
  },
  {
    "command": "selection-manipulator.escape.ldap-filter",
    "title": "Escape LDAP Filter Value (RFC 4515)",
    "canMultiSelection": true
  },
  {
    "command": "selection-manipulator.escape.ldap-dn",
    "title": "Escape LDAP DN Value (RFC 4514)",
    "canMultiSelection": true
  },
  {
    "command": "selection-manipulator.escape.xpath-literal",
    "title": "Convert to XPath String Literal",
    "canMultiSelection": true
  },
  {
    "command": "selection-manipulator.escape.c-string",
    "title": "Convert to C String Literal",
    "canMultiSelection": true
  },
  {
    "command": "selection-manipulator.escape.c-unescape",
    "title": "Unescape C / Java Style Escapes",
    "canMultiSelection": true
  },
  {
    "command": "selection-manipulator.crypto.hash-sha3-384",
    "title": "Transform - Crypto - Create Hash (SHA3-384)",
    "canMultiSelection": true
  },
  {
    "command": "selection-manipulator.crypto.hash-shake256",
    "title": "Transform - Crypto - Create Hash (SHAKE256, Output Length N)",
    "canMultiSelection": true
  },
  {
    "command": "selection-manipulator.crypto.hmac-sha3-512",
    "title": "Transform - Crypto - Create HMAC (SHA3-512)",
    "canMultiSelection": true
  },
  {
    "command": "selection-manipulator.checksum.crc16",
    "title": "Transform - Checksum - Checksum: CRC-16/CCITT-FALSE",
    "canMultiSelection": true
  },
  {
    "command": "selection-manipulator.checksum.crc32c",
    "title": "Transform - Checksum - Checksum: CRC-32C (Castagnoli)",
    "canMultiSelection": true
  },
  {
    "command": "selection-manipulator.checksum.iban",
    "title": "Transform - Checksum - Checksum: IBAN Validate",
    "canMultiSelection": true
  },
  {
    "command": "selection-manipulator.checksum.isbn",
    "title": "Transform - Checksum - Checksum: ISBN-10 / ISBN-13 Validate",
    "canMultiSelection": true
  },
  {
    "command": "selection-manipulator.json.sort-array",
    "title": "Transform - Data Format - Sort JSON Array",
    "canMultiSelection": true
  },
  {
    "command": "selection-manipulator.json.filter-array",
    "title": "Transform - Data Format - Filter JSON Array by Field Value",
    "canMultiSelection": true
  },
  {
    "command": "selection-manipulator.json.pick-keys",
    "title": "Transform - Data Format - Pick Keys from JSON Object",
    "canMultiSelection": true
  },
  {
    "command": "selection-manipulator.json.omit-keys",
    "title": "Transform - Data Format - Omit Keys from JSON",
    "canMultiSelection": true
  },
  {
    "command": "selection-manipulator.json.rename-key",
    "title": "Transform - Data Format - Rename JSON Key",
    "canMultiSelection": true
  },
  {
    "command": "selection-manipulator.json.remove-empty",
    "title": "Transform - Data Format - Remove Empty Values from JSON",
    "canMultiSelection": true
  },
  {
    "command": "selection-manipulator.json.to-markdown-table",
    "title": "Transform - Data Format - Convert JSON Array to Markdown Table",
    "canMultiSelection": true
  },
  {
    "command": "selection-manipulator.json.chunk-array",
    "title": "Transform - Data Format - Split JSON Array into Chunks",
    "canMultiSelection": true
  },
  {
    "command": "selection-manipulator.json.array-to-object",
    "title": "Transform - Data Format - Convert JSON Array to Object by Key",
    "canMultiSelection": true
  },
  {
    "command": "selection-manipulator.json.object-to-entries",
    "title": "Transform - Data Format - Convert JSON Object to Key-Value Array",
    "canMultiSelection": true
  },
  {
    "command": "selection-manipulator.json.set-path",
    "title": "Transform - Data Format - Set JSON Value at Path",
    "canMultiSelection": true
  },
  {
    "command": "selection-manipulator.yaml.to-flow",
    "title": "Transform - Data Format - Convert YAML to Flow Style",
    "canMultiSelection": true
  },
  {
    "command": "selection-manipulator.yaml.validate",
    "title": "Transform - Data Format - Validate YAML",
    "canMultiSelection": true
  },
  {
    "command": "selection-manipulator.yaml.multi-doc-to-json",
    "title": "Transform - Data Format - Convert Multi-document YAML to JSON Array",
    "canMultiSelection": true
  },
  {
    "command": "selection-manipulator.toml.format",
    "title": "Transform - Data Format - Format TOML",
    "canMultiSelection": true
  },
  {
    "command": "selection-manipulator.xml.validate",
    "title": "Transform - Data Format - Validate XML (Well-formedness)",
    "canMultiSelection": true
  },
  {
    "command": "selection-manipulator.xml.list-paths",
    "title": "Transform - Data Format - List XML Element Paths",
    "canMultiSelection": true
  },
  {
    "command": "selection-manipulator.csv.reorder-columns",
    "title": "Transform - CSV - Reorder Columns",
    "canMultiSelection": true
  },
  {
    "command": "selection-manipulator.csv.merge-columns",
    "title": "Transform - CSV - Merge Two Columns",
    "canMultiSelection": true
  },
  {
    "command": "selection-manipulator.csv.split-column",
    "title": "Transform - CSV - Split Column by Delimiter",
    "canMultiSelection": true
  },
  {
    "command": "selection-manipulator.csv.group-count",
    "title": "Transform - CSV - Count Rows by Column Value",
    "canMultiSelection": true
  },
  {
    "command": "selection-manipulator.csv.fill-empty",
    "title": "Transform - CSV - Fill Empty Cells with Value",
    "canMultiSelection": true
  },
  {
    "command": "selection-manipulator.ltsv.to-json",
    "title": "Transform - Data Format - Convert LTSV to JSON",
    "canMultiSelection": true
  },
  {
    "command": "selection-manipulator.json.to-ltsv",
    "title": "Transform - Data Format - Convert JSON to LTSV",
    "canMultiSelection": true
  }
];

export const showCommandsHandler: (textEditor: TextEditor) => void = async (textEditor) => {
  if (textEditor.selections.length === 0) {
    return;
  }
  const isMultiSelection = textEditor.selections.length > 1;
  const options = { title: "Selection Manipulator Commands", canPickMany: false };
  const commandTitles = myCommands
    .filter(command => isMultiSelection ? command.canMultiSelection : true)
    .map(command => command.title);
  const selectedCommandTitle = await window.showQuickPick(commandTitles, options);
  if (!selectedCommandTitle) {
    return;
  }
  const selectedCommand = myCommands.find(command => command.title === selectedCommandTitle);
  if (selectedCommand) {
    commands.executeCommand(selectedCommand.command);
  }
};
