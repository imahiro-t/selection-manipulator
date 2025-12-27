import {
  TextEditor,
  window,
  commands,
} from 'vscode';

const myCommands = [
  {
    "command": "selection-manipulator.multi-selection",
    "title": "Select - Convert to Multi Selection",
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
    "command": "selection-manipulator.whois",
    "title": "Lookup - WHOIS - whois",
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
    "command": "selection-manipulator.geo-ip",
    "title": "IP Geolocation",
    "canMultiSelection": true
  },
  {
    "command": "selection-manipulator.client-credentials-flow",
    "title": "Client Credentials Flow",
    "canMultiSelection": false
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
    "title": "ASCII Art - Cowsay",
    "canMultiSelection": true
  },
  {
    "command": "selection-manipulator.ascii.cowsay.replace",
    "title": "ASCII Art - Cowsay (Replace)",
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
    "command": "selection-manipulator.text.remove-accents",
    "title": "Text - Remove Accents",
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
