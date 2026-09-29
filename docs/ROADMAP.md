# Selection Manipulator 機能拡張ロードマップ

> 作成: 2026-09-28（SELEC-00001）／ 対象バージョン: v0.0.42 時点の既存 281 コマンドに対する追加候補

## 目次

1. [目的と思想](#目的と思想)
2. [候補採用の基準](#候補採用の基準)
3. [既存コマンド棚卸し](#既存コマンド棚卸し)
4. [集計表](#集計表)
5. [カテゴリ別の候補表](#カテゴリ別の候補表)
   - [CASE: 大文字小文字・命名規則の変換拡張](#case)
   - [WS: 空白・インデント・改行の整形](#ws)
   - [LINE: 行操作（抽出・フィルタ・重複処理・番号付け）](#line)
   - [SORT: ソート拡張（自然順・ロケール順・キー／列指定など）](#sort)
   - [WRAP: 囲み・引用符・括弧・前後への文字付加](#wrap)
   - [ENC: エンコード／デコード（HTML エンティティ・Unicode エスケープ・Base32/58・Hex・Punycode など）](#enc)
   - [HASH: ハッシュ・チェックサム（ローカル計算のみ）](#hash)
   - [DATA: データ形式変換（JSON / YAML / TOML / INI / Query String など）](#data)
   - [TABLE: CSV / TSV / 表操作（列抽出・転置・整列）](#table)
   - [NUM: 数値・計算・統計（中央値・標準偏差・丸め・進数変換・桁区切り）](#num)
   - [DATE: 日付・時刻（Intl によるタイムゾーン表示・曜日・差分・ISO 週）](#date)
   - [GEN: 連番・生成（英字連番・ローマ数字・ULID / NanoID・ダミーテキスト）](#gen)
   - [JA: 日本語テキスト（ローマ字・漢数字・句読点・旧字体など）](#ja)
   - [UNI: Unicode・文字種（正規化 NFC/NFD/NFKC・不可視文字・コードポイント表示）](#uni)
   - [DEV: プログラミング支援（言語別の文字列リテラル化・SQL/正規表現/シェル向けエスケープなど。変換するだけで実行はしない）](#dev)
   - [MSEL: マルチカーソル・選択操作（分割・n 番目の選択・整列 Align・選択の拡張／縮小）](#msel)
   - [MD: Markdown・ドキュメント整形（見出しレベル・リスト化・リンク化・目次生成）](#md)
6. [子チケット対応表](#子チケット対応表)

## 目的と思想

Selection Manipulator は「**選択範囲（マルチカーソル含む）のテキストをその場で変換・生成・抽出する**」ための拡張機能である。このロードマップは、その思想に合う新しいコマンドの候補を先にバックログとして洗い出し、カテゴリ単位の子チケットとして安全に順次実装できるようにするためのものである。

- コマンド数を現在の 2〜3 倍に増やし、他の拡張や外部ツールに頼らずに済む場面を増やす。
- 機能数・カバー範囲の広さを VS Code Marketplace での差別化ポイントにする。
- 大量に追加しても、v0.0.42 で達成した「安全でない機能の削除・npm audit 0 件」の水準を保つ。実装ルールは [SECURITY.md](../SECURITY.md) に従う。

## 候補採用の基準

### 数え方

- 既存の件数（コマンド ID 単位）に合わせ、**1 候補 = 新しく登録するコマンド ID 1 個**と数える。
- 候補の ID は「カテゴリ ID + 3 桁の連番」（例: `CASE-001`）とする。ID はカテゴリ内で一意であり、子チケットへの割り当てが変わっても変えない。

### 基本と派生

- **派生**とは、同じ ROADMAP 内の基本機能候補について、出力先だけを変えた版（`(Replace)` / `(Clipboard)`）を指す。候補表の `種別` 列に `派生:<元の候補 ID>` と書く。
- 派生を作るのは、同じ種類の既存コマンドにその派生パターンがある場合に限る（例: 既存の `sort-line.*` には `(Clipboard)` 版、`json.*` / `base64.*` / `crypto.hash-*` / `csv.*` / `date.*` / `japanese.*` / `programmatic.*` には `(Replace)` 版がある）。既存に派生パターンがないカテゴリ（CASE・WS・WRAP・NUM・GEN・UNI・MSEL・MD）には派生を置かない。
- 基本機能の出力先は、同じ種類の既存コマンドの既定の動作（結果を新しいエディタに開く、または選択範囲を置き換える）に合わせる。派生はその出力先だけを変えた版である。
- 件数の水増しを防ぐため、次の基準を**すべて**満たすこととする。
  - 派生の件数は候補の合計の **20% 以下**（全体）
  - 各カテゴリ（各子チケットの ID 範囲）でも、派生の件数はそのカテゴリの件数の **20% 以下**
  - 基本機能の件数は **400 以上**

### カテゴリ構成と件数目標

- 17 カテゴリ・合計 550 件を目標とし、1 カテゴリ 20〜40 件に収めて原則 1 カテゴリ = 1 子チケットとする。
- 40 件を超えたカテゴリは ID 範囲で区切って複数チケットに分け（各範囲 20〜40 件）、20 件を下回ったカテゴリは近いカテゴリと 1 チケットにまとめる。変わるのは「チケット ↔ ID 範囲」の対応だけで、候補のカテゴリ ID は変えない。
- カテゴリ構成・件数目標・派生の基準は autopilot 実行の中で決めたものであり、今後人が見直してよい。見直した場合は集計表と子チケット対応表も合わせて更新する。

### 外部通信・依存の方針

- `外部通信` はすべて「なし」とする。外部通信が必要な候補は採用しない。既存の DNS Lookup 系（`dns.*` 14 件）と、Webview で CDN（cdn.jsdelivr.net）から mermaid を読み込む `har-to-image`（1 件）は v0.0.42 時点の既知の例外であり、同じ種類のコマンドは新しく追加しない。
- Webview を使う候補は、リモートのスクリプト・スタイル・画像などを読み込まない（必要なライブラリは拡張に同梱する）。CSP は `default-src 'none'` を基本に nonce 付きのスクリプトだけを許可し、リモートのオリジンや `'unsafe-inline'` を許可しない。`localResourceRoots` は必要なディレクトリに限定し、選択テキストはエスケープしてから埋め込む（[SECURITY.md](../SECURITY.md) 参照）。
- `新規依存` は原則「なし」とする。実装に使う API は Node.js 標準（`crypto`・`zlib`・`Intl`・`String.prototype.normalize`・`node:url` の `domainToASCII` など）と既存の依存（`change-case`・`diff`・`js-yaml`・`xml-formatter`）の範囲にとどめる。
- 依存がどうしても必要になりそうな候補だけ「あり（理由・代替案）」と書く。採否は子チケットで判断し、追加する場合は [SECURITY.md](../SECURITY.md) の手順（必要性・メンテ状況・脆弱性・ライセンスの確認）に従う。
- `eval` / `new Function` による任意コード実行、シェル実行、処理対象以外のファイルアクセスを伴う候補は採用しない。SQL・シェル・curl などを扱う候補は「文字列を変換・生成するだけで実行しない」。
- MD5 / SHA-1 などの弱いアルゴリズムはチェックサム・互換確認の用途に限り、暗号化用途の候補は入れない。

### 表記ルール

- 候補表の列は `ID`・`カテゴリ`・`種別`・`提案コマンド ID`・`タイトル`・`概要`・`入出力例`・`外部通信`・`新規依存` の 9 列とする。
- セルの中の `|` は、コードスパンの中でも外でも `\|` とエスケープする。
- セルの中に改行は入れない。複数行は `⏎`、タブは `⇥`、意味のある空白は `·` で表す。不可視文字は `{U+XXXX}` と書く。
- 例外: 空白やタブを記号に置き換えて可視化するコマンド（WS-015）では出力側の、可視化を元に戻すコマンド（WS-016）では入力側の `·` や `→` が、表記ルールの記号ではなく実際の文字になる。その場合は、行の `概要` にその旨を注記する。
- 出力が文字列リテラルなどの場合、`\n` のようなエスケープ表記は「バックスラッシュ + n」の 2 文字を表す（実際の改行は `⏎`）。
- `<br>` などの HTML タグは使わない。
- `入出力例` は「`入力` → `出力`」の形で書く。入力の後ろの（ ）は、コマンド実行時に入力する値やカーソル数などの補足である。`[a]` は選択範囲、`|` はカーソル位置、「（通知）」は結果を通知で表示することを表す。

## 既存コマンド棚卸し

`package.json` の `contributes.commands` に登録されている既存コマンドは **281 件**（コマンド ID 単位、重複なし）で、`(Replace)` / `(Clipboard)` の出力先違いを 1 つにまとめた**基本機能は 197 件**である。

| # | 基本コマンド ID | タイトル | 出力先違いの版 | 備考 |
|---|---|---|---|---|
| 1 | `remove-cursor-above` | Remove Cursor Above | — |  |
| 2 | `remove-cursor-below` | Remove Cursor Below | — |  |
| 3 | `remove-character-from-each-side` | Remove Character from Each Side | — |  |
| 4 | `show-commands` | Show Selection Manipulator Commands | — |  |
| 5 | `multi-selection` | Convert to Multi Selection | — |  |
| 6 | `extract` | Extract Selections | `.clipboard` |  |
| 7 | `extract-line` | Extract Lines in Selection | `.clipboard` |  |
| 8 | `extract.exclude-blank-rows` | Extract Selections exclude Blank Rows | `.clipboard` |  |
| 9 | `unique` | Unique Selections | `.clipboard` |  |
| 10 | `reverse` | Reverse Selections | `.clipboard` |  |
| 11 | `shuffle` | Shuffle Selections | `.clipboard` |  |
| 12 | `sort.string.ascending` | Sort Selections Ascending by string | `.clipboard` |  |
| 13 | `sort.string.descending` | Sort Selections Descending by string | `.clipboard` |  |
| 14 | `sort.number.ascending` | Sort Selections Ascending by number | `.clipboard` |  |
| 15 | `sort.number.descending` | Sort Selections Descending by number | `.clipboard` |  |
| 16 | `sort-line.string.ascending` | Sort Lines Ascending by string | `.clipboard` |  |
| 17 | `sort-line.string.descending` | Sort Lines Descending by string | `.clipboard` |  |
| 18 | `sort-line.number.ascending` | Sort Lines Ascending by number | `.clipboard` |  |
| 19 | `sort-line.number.descending` | Sort Lines Descending by number | `.clipboard` |  |
| 20 | `sort-line.length.ascending` | Sort Lines Ascending by length | `.clipboard` |  |
| 21 | `sort-line.length.descending` | Sort Lines Descending by length | `.clipboard` |  |
| 22 | `sort-line.occurrence.ascending` | Sort Lines Ascending by occurrence | `.clipboard` |  |
| 23 | `sort-line.occurrence.descending` | Sort Lines Descending by occurrence | `.clipboard` |  |
| 24 | `json.format` | Format JSON (Pretty Print) | `.replace` |  |
| 25 | `json.minify` | Minify JSON | `.replace` |  |
| 26 | `json.parse` | Parse JSON | `.replace` |  |
| 27 | `json.stringify` | Stringify JSON | `.replace` |  |
| 28 | `json.flatten` | Flatten JSON | `.replace` |  |
| 29 | `json.unflatten` | Unflatten JSON | `.replace` |  |
| 30 | `xml.format` | Format XML (Pretty Print) | `.replace` |  |
| 31 | `xml.minify` | Minify XML | `.replace` |  |
| 32 | `xml.to-json` | Convert XML to JSON | `.replace` |  |
| 33 | `base64.encode` | Encode Base64 | `.replace` |  |
| 34 | `base64.decode` | Decode Base64 | `.replace` |  |
| 35 | `base64.deflate` | Deflate Base64 | `.replace` |  |
| 36 | `base64.unzip` | Inflate Base64 | `.replace` |  |
| 37 | `reverse.string` | Reverse Strings in Selection | `.clipboard` |  |
| 38 | `multi-selection.interval` | Convert to Multi Selection (Interval) | — |  |
| 39 | `text.split-lines.custom` | Text - Split Lines (Custom Delimiter) | — |  |
| 40 | `text.join-lines.custom` | Text - Join Lines (Custom Delimiter) | — |  |
| 41 | `text.select-matches` | Text - Select Matches | — |  |
| 42 | `url.parse` | Parse URL to JSON | — |  |
| 43 | `url.parse-params` | Parse URL Parameters to JSON | — |  |
| 44 | `url.encode-uri` | Encode URI | — |  |
| 45 | `url.decode-uri` | Decode URI | — |  |
| 46 | `url.encode-uri-component` | Encode URI Component | — |  |
| 47 | `url.decode-uri-component` | Decode URI Component | — |  |
| 48 | `jwt.decode` | Decode JWT | — |  |
| 49 | `saml.decode` | Decode SAML Request / Response | — |  |
| 50 | `dns.a` | Lookup DNS A Record | — | 既存の例外（外部通信あり: `node:dns/promises`） |
| 51 | `dns.aaaa` | Lookup DNS AAAA Record | — | 既存の例外（外部通信あり: `node:dns/promises`） |
| 52 | `dns.any` | Lookup DNS ANY Record | — | 既存の例外（外部通信あり: `node:dns/promises`） |
| 53 | `dns.caa` | Lookup DNS CAA Record | — | 既存の例外（外部通信あり: `node:dns/promises`） |
| 54 | `dns.cname` | Lookup DNS CNAME Record | — | 既存の例外（外部通信あり: `node:dns/promises`） |
| 55 | `dns.mx` | Lookup DNS MX Record | — | 既存の例外（外部通信あり: `node:dns/promises`） |
| 56 | `dns.naptr` | Lookup DNS NAPTR Record | — | 既存の例外（外部通信あり: `node:dns/promises`） |
| 57 | `dns.ns` | Lookup DNS NS Record | — | 既存の例外（外部通信あり: `node:dns/promises`） |
| 58 | `dns.ptr` | Lookup DNS PTR Record | — | 既存の例外（外部通信あり: `node:dns/promises`） |
| 59 | `dns.soa` | Lookup DNS SOA Record | — | 既存の例外（外部通信あり: `node:dns/promises`） |
| 60 | `dns.srv` | Lookup DNS SRV Record | — | 既存の例外（外部通信あり: `node:dns/promises`） |
| 61 | `dns.txt` | Lookup DNS TXT Record | — | 既存の例外（外部通信あり: `node:dns/promises`） |
| 62 | `dns.lookup` | Lookup DNS IP from Hostname | — | 既存の例外（外部通信あり: `node:dns/promises`） |
| 63 | `dns.reverse` | Lookup DNS Hostname from IP | — | 既存の例外（外部通信あり: `node:dns/promises`） |
| 64 | `count-occurrences.count` | Count Occurrences sorting by count | — |  |
| 65 | `count-occurrences.word` | Count Occurrences sorting by word | — |  |
| 66 | `count-up-list` | Count Up to List | — |  |
| 67 | `har-to-mermaid` | HAR to Sequence Diagram Mermaid | — | 外部通信なし（Mermaid のテキストを新しいエディタに出力するだけ）。ただし `har-to-image` と同じハンドラ `harToMermaidHandler.ts` で実装されている |
| 68 | `har-to-image` | HAR to Sequence Diagram Image | — | 既存の例外（外部通信あり: Webview で cdn.jsdelivr.net から mermaid を読み込む。バージョンはメジャー指定 `@10`・SRI なし、CSP で外部オリジンと `'unsafe-inline'` を許可） |
| 69 | `case.title-smart` | Change Case Title (Smart) | — |  |
| 70 | `case.spongebob` | Change Case SpongeBob | — |  |
| 71 | `case.screaming-snake` | Change Case Screaming Snake (Constant) | — |  |
| 72 | `case.humanize` | Change Case Humanize (Sentence) | — |  |
| 73 | `case.slugify` | Change Case Slugify (Kebab) | — |  |
| 74 | `text.remove-accents` | Text - Remove Accents | — |  |
| 75 | `case.camel` | Change Case Camel | — |  |
| 76 | `case.capital` | Change Case Capital | — |  |
| 77 | `case.constant` | Change Case Constant | — |  |
| 78 | `case.dot` | Change Case Dot | — |  |
| 79 | `case.kebab` | Change Case Kebab | — |  |
| 80 | `case.no` | Change Case No | — |  |
| 81 | `case.pascal` | Change Case Pascal | — |  |
| 82 | `case.path` | Change Case Path | — |  |
| 83 | `case.sentence` | Change Case Sentence | — |  |
| 84 | `case.snake` | Change Case Snake | — |  |
| 85 | `case.train` | Change Case Train | — |  |
| 86 | `case.upper` | Change Case Upper | — |  |
| 87 | `case.lower` | Change Case Lower | — |  |
| 88 | `zero-padding` | Zero Padding | — |  |
| 89 | `increment-from-1` | Increment from 1 | — |  |
| 90 | `increment-from-n` | Increment from N | — |  |
| 91 | `decrement-to-1` | Decrement to 1 | — |  |
| 92 | `decrement-to-n` | Decrement to N | — |  |
| 93 | `increment-by-1` | Increment by 1 | — |  |
| 94 | `increment-by-n` | Increment by N | — |  |
| 95 | `decrement-by-1` | Decrement by 1 | — |  |
| 96 | `decrement-by-n` | Decrement by N | — |  |
| 97 | `calculation` | Calculate Mathematical Expression | — |  |
| 98 | `calculation.date` | Transform to Timestamp and ISO 8601 | — |  |
| 99 | `regex.g` | Regex (/PATTERN/g) | — |  |
| 100 | `regex.gi` | Regex (/PATTERN/gi) | — |  |
| 101 | `crypto.x509` | Decode X509 Certification | — |  |
| 102 | `crypto.hash-sha256` | Create Hash (SHA-256) | `.replace` |  |
| 103 | `crypto.hash-sha512` | Create Hash (SHA-512) | `.replace` |  |
| 104 | `crypto.hash-md5` | Create Hash (MD5) | `.replace` |  |
| 105 | `crypto.hmac-sha256` | Create HMAC (SHA-256) | — |  |
| 106 | `crypto.hmac-sha512` | Create HMAC (SHA-512) | — |  |
| 107 | `crypto.hmac-md5` | Create HMAC (MD5) | — |  |
| 108 | `crypto.encrypt` | Encrypt by AES | `.replace` |  |
| 109 | `crypto.decrypt` | Decrypt by AES | `.replace` |  |
| 110 | `extract.line-by-length.equal` | Extract Lines Equal Length | `.clipboard` |  |
| 111 | `extract.line-by-length.less` | Extract Lines Less Than Length | `.clipboard` |  |
| 112 | `date.to-iso` | Date - Convert to ISO 8601 | `.replace`, `.clipboard` |  |
| 113 | `date.to-locale` | Date - Convert to Locale String | `.replace`, `.clipboard` |  |
| 114 | `date.to-timestamp` | Date - Convert to Timestamp (Seconds) | `.replace`, `.clipboard` |  |
| 115 | `date.to-timestamp-ms` | Date - Convert to Timestamp (Milliseconds) | `.replace`, `.clipboard` |  |
| 116 | `extract.line-by-length.greater` | Extract Lines Greater Than Length | `.clipboard` |  |
| 117 | `extract.line-by-length.range` | Extract Lines Length Range | `.clipboard` |  |
| 118 | `random.uuid` | Random UUID | — |  |
| 119 | `text.escape` | Escape Text (JSON Stringify) | `.replace` |  |
| 120 | `text.unescape` | Text - Unescape Text (JSON Parse) | `.replace` |  |
| 121 | `text.remove-empty-lines` | Text - Remove Empty Lines | — |  |
| 122 | `text.remove-line-numbers` | Text - Remove Line Numbers | — |  |
| 123 | `text.trim-lines` | Text - Trim All Lines | — |  |
| 124 | `text.join-lines.space` | Text - Join Lines (Space) | — |  |
| 125 | `text.join-lines.comma` | Text - Join Lines (Comma) | — |  |
| 126 | `text.split-lines.space` | Text - Split Lines (Space) | — |  |
| 127 | `text.split-lines.comma` | Text - Split Lines (Comma) | — |  |
| 128 | `math.sum` | Math - Sum | — |  |
| 129 | `math.average` | Math - Average | — |  |
| 130 | `math.min` | Math - Min | — |  |
| 131 | `math.max` | Math - Max | — |  |
| 132 | `random.password` | Random - Random Password | — |  |
| 133 | `random.ipv4` | Random - Random IPv4 | — |  |
| 134 | `random.ipv6` | Random - Random IPv6 | — |  |
| 135 | `csv.to-markdown` | CSV - Convert to Markdown Table | `.replace` |  |
| 136 | `csv.from-markdown` | CSV - Convert from Markdown Table | `.replace` |  |
| 137 | `data.env-to-json` | Data - Convert Env to JSON | `.replace` |  |
| 138 | `programmatic.json-to-yaml` | Convert JSON to YAML | `.replace` |  |
| 139 | `programmatic.yaml-to-json` | Convert YAML to JSON | `.replace` |  |
| 140 | `programmatic.hex-to-rgb` | Convert Hex to RGB | `.replace` |  |
| 141 | `programmatic.rgb-to-hex` | Convert RGB to Hex | `.replace` |  |
| 142 | `programmatic.toggle-quotes` | Toggle Quotes (' &lt;-&gt; ") | — |  |
| 143 | `japanese.full-to-half` | Convert Full-width to Half-width | `.replace` |  |
| 144 | `japanese.half-to-full` | Convert Half-width to Full-width | `.replace` |  |
| 145 | `japanese.hiragana-to-katakana` | Convert Hiragana to Katakana | `.replace` |  |
| 146 | `japanese.katakana-to-hiragana` | Convert Katakana to Hiragana | `.replace` |  |
| 147 | `crypto.hash-sha1` | Create Hash (SHA-1) | `.replace` |  |
| 148 | `extract.email` | Extract Email | `.replace` |  |
| 149 | `extract.url` | Extract URL | `.replace` |  |
| 150 | `extract.ip` | Extract IP | `.replace` |  |
| 151 | `ascii.cowsay` | ASCII Art - Cow (cowsay) | `.replace` |  |
| 152 | `ascii.tux` | ASCII Art - Penguin | `.replace` |  |
| 153 | `ascii.ghost` | ASCII Art - Ghost | `.replace` |  |
| 154 | `ascii.meow` | ASCII Art - Cat | `.replace` |  |
| 155 | `ascii.pig` | ASCII Art - Pig | `.replace` |  |
| 156 | `ascii.face` | ASCII Art - Face | `.replace` |  |
| 157 | `quote.single` | Quote: Single ('') | — |  |
| 158 | `quote.double` | Quote: Double ("") | — |  |
| 159 | `quote.backtick` | Quote: Backtick (\`\`) | — |  |
| 160 | `markdown.link` | Markdown: Link | — |  |
| 161 | `insert.date.iso` | Insert Date: ISO 8601 | — |  |
| 162 | `insert.date.locale` | Insert Date: Locale String | — |  |
| 163 | `insert.date.timestamp` | Insert Date: Unix Timestamp | — |  |
| 164 | `random.lorem-ipsum` | Random: Lorem Ipsum | — |  |
| 165 | `text.trim-lines-trailing` | Text: Trim Trailing Whitespace | — |  |
| 166 | `text.remove-duplicate-lines` | Text: Remove Duplicate Lines | — |  |
| 167 | `unit.px-to-rem` | Unit: px to rem | — |  |
| 168 | `unit.rem-to-px` | Unit: rem to px | — |  |
| 169 | `unit.kg-to-lb` | Unit: kg to lb | — |  |
| 170 | `unit.lb-to-kg` | Unit: lb to kg | — |  |
| 171 | `text.normalize-whitespace` | Text: Normalize Whitespace | — |  |
| 172 | `text.strip-html-tags` | Text: Strip HTML Tags | — |  |
| 173 | `text.unsmart-quotes` | Text: Unsmart Quotes | — |  |
| 174 | `text.mask` | Text: Mask with Asterisk (\*) | — |  |
| 175 | `enclose.paren` | Enclose: Parentheses (()) | — |  |
| 176 | `enclose.square` | Enclose: Square Brackets (\[\]) | — |  |
| 177 | `enclose.curly` | Enclose: Curly Brackets ({}) | — |  |
| 178 | `enclose.angle` | Enclose: Angle Brackets (&lt;&gt;) | — |  |
| 179 | `enclose.japanese.quote-single` | Enclose: Japanese Single Quote (「」) | — |  |
| 180 | `enclose.japanese.quote-double` | Enclose: Japanese Double Quote (『』) | — |  |
| 181 | `enclose.japanese.bracket` | Enclose: Japanese Bracket (【】) | — |  |
| 182 | `enclose.japanese.angle` | Enclose: Japanese Angle Bracket (＜＞) | — |  |
| 183 | `enclose.japanese.paren` | Enclose: Japanese Parentheses (（）) | — |  |
| 184 | `enclose.japanese.square` | Enclose: Japanese Square Brackets (［］) | — |  |
| 185 | `enclose.japanese.curly` | Enclose: Japanese Curly Brackets (｛｝) | — |  |
| 186 | `ascii.daemon` | ASCII Art - Daemon | `.replace` |  |
| 187 | `ascii.dragon` | ASCII Art - Dragon | `.replace` |  |
| 188 | `ascii.stegosaurus` | ASCII Art - Stegosaurus | `.replace` |  |
| 189 | `ascii.turkey` | ASCII Art - Turkey | `.replace` |  |
| 190 | `ascii.turtle` | ASCII Art - Turtle | `.replace` |  |
| 191 | `ascii.elephant` | ASCII Art - Elephant | `.replace` |  |
| 192 | `date.era-conversion` | Date - Convert AD &lt;-&gt; Wareki | `.replace` |  |
| 193 | `morse.to-morse` | Morse - Text to Morse Code | `.replace` |  |
| 194 | `morse.from-morse` | Morse - Morse Code to Text | `.replace` |  |
| 195 | `morse.from-morse.kana` | Morse - Morse Code to Text (Kana) | `.replace` |  |
| 196 | `shuffle.character` | Shuffle Characters | `.replace`, `.clipboard` |  |
| 197 | `diff` | Diff Selections | — |  |

> 既存コマンドのうち外部通信を伴うのは次の **15 件**（コマンド ID 単位）である。いずれも v0.0.42 時点の既知の例外であり、同じ種類のコマンドは新しく追加しない。挙動の是正（mermaid の同梱、CSP の nonce 化、`localResourceRoots` の限定など）はこのロードマップの対象外で、別チケットで扱う（[SECURITY.md](../SECURITY.md) 参照）。
>
> - DNS Lookup 系 14 件（`dns.*`）: `node:dns/promises` で DNS に問い合わせる。
> - HAR のシーケンス図の画像表示 1 件（`har-to-image`）: Webview の中で `https://cdn.jsdelivr.net/npm/mermaid@10/dist/mermaid.esm.min.mjs` を読み込んで実行する。
>
> 同じハンドラで実装されている `har-to-mermaid` は Mermaid のテキストをエディタに出力するだけで、外部通信は行わない（`harToMermaidHandler.ts` で Webview を開くのは `image` のときだけ）。

## 集計表

| カテゴリ ID | カテゴリ | 基本機能数 | 派生数 | 小計 |
|---|---|---|---|---|
| CASE | 大文字小文字・命名規則の変換拡張 | 30 | 0 | 30 |
| WS | 空白・インデント・改行の整形 | 35 | 0 | 35 |
| LINE | 行操作（抽出・フィルタ・重複処理・番号付け） | 34 | 6 | 40 |
| SORT | ソート拡張（自然順・ロケール順・キー／列指定など） | 25 | 5 | 30 |
| WRAP | 囲み・引用符・括弧・前後への文字付加 | 30 | 0 | 30 |
| ENC | エンコード／デコード（HTML エンティティ・Unicode エスケープ・Base32/58・Hex・Punycode など） | 34 | 6 | 40 |
| HASH | ハッシュ・チェックサム（ローカル計算のみ） | 17 | 3 | 20 |
| DATA | データ形式変換（JSON / YAML / TOML / INI / Query String など） | 33 | 7 | 40 |
| TABLE | CSV / TSV / 表操作（列抽出・転置・整列） | 25 | 5 | 30 |
| NUM | 数値・計算・統計（中央値・標準偏差・丸め・進数変換・桁区切り） | 40 | 0 | 40 |
| DATE | 日付・時刻（Intl によるタイムゾーン表示・曜日・差分・ISO 週） | 25 | 5 | 30 |
| GEN | 連番・生成（英字連番・ローマ数字・ULID / NanoID・ダミーテキスト） | 30 | 0 | 30 |
| JA | 日本語テキスト（ローマ字・漢数字・句読点・旧字体など） | 29 | 6 | 35 |
| UNI | Unicode・文字種（正規化 NFC/NFD/NFKC・不可視文字・コードポイント表示） | 30 | 0 | 30 |
| DEV | プログラミング支援（言語別の文字列リテラル化・SQL/正規表現/シェル向けエスケープなど。変換するだけで実行はしない） | 29 | 6 | 35 |
| MSEL | マルチカーソル・選択操作（分割・n 番目の選択・整列 Align・選択の拡張／縮小） | 30 | 0 | 30 |
| MD | Markdown・ドキュメント整形（見出しレベル・リスト化・リンク化・目次生成） | 25 | 0 | 25 |
| **合計** | | **501** | **49** | **550** |

- 新規候補の合計: **550 件**（基本機能 501 件・派生 49 件。派生の比率 8.9%）
- 既存と合わせた総数: 281 + 550 = **831 件**（既存の約 3.0 倍）

## カテゴリ別の候補表

### CASE

**大文字小文字・命名規則の変換拡張** — 基本機能 30 件・派生 0 件・小計 30 件

| ID | カテゴリ | 種別 | 提案コマンド ID | タイトル | 概要 | 入出力例 | 外部通信 | 新規依存 |
|---|---|---|---|---|---|---|---|---|
| CASE-001 | CASE | 基本 | `selection-manipulator.case.swap` | Change Case Swap | 大文字と小文字を入れ替える | `Hello World` → `hELLO wORLD` | なし | なし |
| CASE-002 | CASE | 基本 | `selection-manipulator.case.sentence-preserve-acronyms` | Change Case Sentence (Preserve Acronyms) | 文頭だけを大文字にし、全大文字の略語（API・URL など）は小文字にしない（既存 Sentence は略語も小文字にする） | `the API URL is ready` → `The API URL is ready` | なし | なし |
| CASE-003 | CASE | 基本 | `selection-manipulator.case.title-apa` | Change Case Title (APA Style) | APA スタイルのタイトルケース（4 文字以上の単語は前置詞でも大文字） | `a guide through the woods` → `A Guide Through the Woods` | なし | なし |
| CASE-004 | CASE | 基本 | `selection-manipulator.case.upper-first` | Change Case Upper First | 先頭の 1 文字だけを大文字にし、残りは変更しない | `hello World` → `Hello World` | なし | なし |
| CASE-005 | CASE | 基本 | `selection-manipulator.case.lower-first` | Change Case Lower First | 先頭の 1 文字だけを小文字にし、残りは変更しない | `HelloWorld` → `helloWorld` | なし | なし |
| CASE-006 | CASE | 基本 | `selection-manipulator.case.cobol` | Change Case Cobol | 大文字のハイフン区切り（COBOL-CASE）に変換する | `userName` → `USER-NAME` | なし | なし |
| CASE-007 | CASE | 基本 | `selection-manipulator.case.ada` | Change Case Ada | 各単語の先頭を大文字にしたアンダースコア区切り（Ada\_Case）に変換する | `user name` → `User_Name` | なし | なし |
| CASE-008 | CASE | 基本 | `selection-manipulator.case.flat` | Change Case Flat | 区切りを除いてすべて小文字で連結する（flatcase） | `User Name` → `username` | なし | なし |
| CASE-009 | CASE | 基本 | `selection-manipulator.case.upper-flat` | Change Case Upper Flat | 区切りを除いてすべて大文字で連結する（UPPERFLATCASE） | `user name` → `USERNAME` | なし | なし |
| CASE-010 | CASE | 基本 | `selection-manipulator.case.camel-snake` | Change Case Camel Snake | 先頭語は小文字、以降の語は先頭大文字のアンダースコア区切り（camel\_Snake） | `user name id` → `user_Name_Id` | なし | なし |
| CASE-011 | CASE | 基本 | `selection-manipulator.case.pascal-snake` | Change Case Pascal Snake | 各語の先頭を大文字にしたアンダースコア区切り（Pascal\_Snake） | `user name id` → `User_Name_Id` | なし | なし |
| CASE-012 | CASE | 基本 | `selection-manipulator.case.alternating-words` | Change Case Alternating Words | 単語ごとに大文字・小文字を交互に切り替える | `one two three` → `ONE two THREE` | なし | なし |
| CASE-013 | CASE | 基本 | `selection-manipulator.case.acronym` | Change Case Acronym | 各単語の頭文字を大文字で連結して略語を作る | `portable network graphics` → `PNG` | なし | なし |
| CASE-014 | CASE | 基本 | `selection-manipulator.case.detect` | Change Case Detect Style | 選択テキストの命名規則（camel / snake / kebab など）を判定して通知表示する | `user_name` → `snake_case（通知）` | なし | なし |
| CASE-015 | CASE | 基本 | `selection-manipulator.case.cycle` | Change Case Cycle | camel → snake → kebab → Pascal → CONSTANT の順に命名規則を循環させる | `userName` → `user_name` | なし | なし |
| CASE-016 | CASE | 基本 | `selection-manipulator.case.upper-acronyms` | Change Case Uppercase Known Acronyms | id / url / http / json など既知の略語だけを大文字にする（辞書は拡張内に定数で持つ） | `userId apiUrl` → `userID apiURL` | なし | なし |
| CASE-017 | CASE | 基本 | `selection-manipulator.case.sentence-each` | Change Case Sentence (Each Sentence) | 「. ! ?」で区切られた文ごとに先頭を大文字にする（既存 Sentence は全体を 1 文として扱う） | `hello. how are you? fine.` → `Hello. How are you? Fine.` | なし | なし |
| CASE-018 | CASE | 基本 | `selection-manipulator.case.capitalize-lines` | Change Case Capitalize Each Line | 各行の先頭文字だけを大文字にする | `foo bar⏎baz` → `Foo bar⏎Baz` | なし | なし |
| CASE-019 | CASE | 基本 | `selection-manipulator.case.lower-line-start` | Change Case Lowercase Each Line Start | 各行の先頭文字だけを小文字にする | `Foo⏎Bar` → `foo⏎bar` | なし | なし |
| CASE-020 | CASE | 基本 | `selection-manipulator.case.upper-locale` | Change Case Upper (Locale) | 入力したロケールで toLocaleUpperCase を行う（トルコ語の i など） | `istanbul（ロケール: tr）` → `İSTANBUL` | なし | なし |
| CASE-021 | CASE | 基本 | `selection-manipulator.case.lower-locale` | Change Case Lower (Locale) | 入力したロケールで toLocaleLowerCase を行う | `İSTANBUL（ロケール: tr）` → `istanbul` | なし | なし |
| CASE-022 | CASE | 基本 | `selection-manipulator.case.json-keys-camel` | Change Case JSON Keys to Camel | JSON のキーだけを再帰的に camelCase にする（値は変更しない） | `{"user_name":"a_b"}` → `{"userName":"a_b"}` | なし | なし |
| CASE-023 | CASE | 基本 | `selection-manipulator.case.json-keys-snake` | Change Case JSON Keys to Snake | JSON のキーだけを再帰的に snake\_case にする | `{"userName":1}` → `{"user_name":1}` | なし | なし |
| CASE-024 | CASE | 基本 | `selection-manipulator.case.json-keys-kebab` | Change Case JSON Keys to Kebab | JSON のキーだけを再帰的に kebab-case にする | `{"userName":1}` → `{"user-name":1}` | なし | なし |
| CASE-025 | CASE | 基本 | `selection-manipulator.case.json-keys-pascal` | Change Case JSON Keys to Pascal | JSON のキーだけを再帰的に PascalCase にする | `{"user_name":1}` → `{"UserName":1}` | なし | なし |
| CASE-026 | CASE | 基本 | `selection-manipulator.case.css-variable` | Change Case CSS Custom Property | CSS カスタムプロパティ名（--kebab-case）に変換する | `primaryColor` → `--primary-color` | なし | なし |
| CASE-027 | CASE | 基本 | `selection-manipulator.case.bem` | Change Case BEM | 3 語を BEM 記法（block\_\_element--modifier）に変換する | `card title active` → `card__title--active` | なし | なし |
| CASE-028 | CASE | 基本 | `selection-manipulator.case.pluralize` | Change Case Pluralize | 英単語を規則ベース（不規則変化は小さな辞書）で複数形にする | `category⏎child` → `categories⏎children` | なし | なし |
| CASE-029 | CASE | 基本 | `selection-manipulator.case.singularize` | Change Case Singularize | 英単語を規則ベースで単数形にする | `categories⏎children` → `category⏎child` | なし | なし |
| CASE-030 | CASE | 基本 | `selection-manipulator.case.hashtag` | Change Case Hashtag | 先頭に # を付けた PascalCase（ハッシュタグ形式）に変換する | `hello world` → `#HelloWorld` | なし | なし |

### WS

**空白・インデント・改行の整形** — 基本機能 35 件・派生 0 件・小計 35 件

| ID | カテゴリ | 種別 | 提案コマンド ID | タイトル | 概要 | 入出力例 | 外部通信 | 新規依存 |
|---|---|---|---|---|---|---|---|---|
| WS-001 | WS | 基本 | `selection-manipulator.whitespace.tabs-to-spaces-2` | Whitespace: Leading Tabs to Spaces (2) | 行頭のタブを空白 2 個に置き換える | `⇥foo` → `··foo` | なし | なし |
| WS-002 | WS | 基本 | `selection-manipulator.whitespace.tabs-to-spaces-4` | Whitespace: Leading Tabs to Spaces (4) | 行頭のタブを空白 4 個に置き換える | `⇥foo` → `····foo` | なし | なし |
| WS-003 | WS | 基本 | `selection-manipulator.whitespace.spaces-to-tabs-2` | Whitespace: Leading Spaces to Tabs (2) | 行頭の空白 2 個ごとにタブ 1 個へ置き換える | `····foo` → `⇥⇥foo` | なし | なし |
| WS-004 | WS | 基本 | `selection-manipulator.whitespace.spaces-to-tabs-4` | Whitespace: Leading Spaces to Tabs (4) | 行頭の空白 4 個ごとにタブ 1 個へ置き換える | `····foo` → `⇥foo` | なし | なし |
| WS-005 | WS | 基本 | `selection-manipulator.whitespace.reindent-2-to-4` | Whitespace: Re-indent 2 to 4 Spaces | 2 空白単位のインデントを 4 空白単位に変換する | `··a⏎····b` → `····a⏎········b` | なし | なし |
| WS-006 | WS | 基本 | `selection-manipulator.whitespace.reindent-4-to-2` | Whitespace: Re-indent 4 to 2 Spaces | 4 空白単位のインデントを 2 空白単位に変換する | `····a⏎········b` → `··a⏎····b` | なし | なし |
| WS-007 | WS | 基本 | `selection-manipulator.whitespace.dedent` | Whitespace: Remove Common Indent (Dedent) | すべての行に共通する先頭インデントだけを取り除く | `····a⏎······b` → `a⏎··b` | なし | なし |
| WS-008 | WS | 基本 | `selection-manipulator.whitespace.trim-leading` | Whitespace: Trim Leading Whitespace | 各行の先頭の空白だけを取り除く（既存は両端・末尾のみ） | `··a··⏎·b` → `a··⏎b` | なし | なし |
| WS-009 | WS | 基本 | `selection-manipulator.whitespace.collapse-blank-lines` | Whitespace: Collapse Consecutive Blank Lines | 連続する空行を 1 行にまとめる | `a⏎⏎⏎⏎b` → `a⏎⏎b` | なし | なし |
| WS-010 | WS | 基本 | `selection-manipulator.whitespace.remove-all` | Whitespace: Remove All Whitespace | 空白・タブ・改行をすべて取り除く | `a b⇥c⏎d` → `abcd` | なし | なし |
| WS-011 | WS | 基本 | `selection-manipulator.whitespace.unwrap-paragraphs` | Whitespace: Unwrap Paragraphs | 段落内の改行を空白に置き換え、空行による段落区切りは残す | `a⏎b⏎⏎c⏎d` → `a b⏎⏎c d` | なし | なし |
| WS-012 | WS | 基本 | `selection-manipulator.whitespace.hard-wrap-80` | Whitespace: Hard Wrap at 80 Columns | 単語境界で 80 桁ごとに改行を入れる | `（90 文字の 1 行）` → `（80 桁で折り返した 2 行）` | なし | なし |
| WS-013 | WS | 基本 | `selection-manipulator.whitespace.hard-wrap-n` | Whitespace: Hard Wrap at N Columns | 単語境界で入力した桁数ごとに改行を入れる | `aa bb cc（N=5）` → `aa bb⏎cc` | なし | なし |
| WS-014 | WS | 基本 | `selection-manipulator.whitespace.nbsp-to-space` | Whitespace: Special Spaces to Normal Space | NBSP（U+00A0）や細いスペースなど特殊な空白を通常の空白に置き換える | `a{U+00A0}b` → `a b` | なし | なし |
| WS-015 | WS | 基本 | `selection-manipulator.whitespace.visualize` | Whitespace: Visualize Spaces and Tabs | 空白を「·」（U+00B7）、タブを「→」（U+2192）に置き換えて見えるようにする。この行の出力側の `·` と `→` は表記ルールの記号ではなく、実際に挿入される文字である | `a·b⇥c` → `a·b→c` | なし | なし |
| WS-016 | WS | 基本 | `selection-manipulator.whitespace.unvisualize` | Whitespace: Restore Visualized Spaces and Tabs | 「·」（U+00B7）を空白、「→」（U+2192）をタブに戻す（WS-015 の逆変換）。この行の入力側の `·` と `→` は表記ルールの記号ではなく実際の文字（U+00B7・U+2192）であり、出力側の `·` と `⇥` は表記ルールどおり空白とタブを表す。可視化する前から含まれていた `·` `→` も空白・タブに変わるため、WS-015 との往復は可逆ではない | `a·b→c` → `a·b⇥c` | なし | なし |
| WS-017 | WS | 基本 | `selection-manipulator.whitespace.center-align` | Whitespace: Center Align Lines | 最も長い行に合わせて各行を中央寄せする | `a⏎abc` → `·a⏎abc` | なし | なし |
| WS-018 | WS | 基本 | `selection-manipulator.whitespace.right-align` | Whitespace: Right Align Lines | 最も長い行に合わせて各行を右寄せする | `a⏎abc` → `··a⏎abc` | なし | なし |
| WS-019 | WS | 基本 | `selection-manipulator.whitespace.pad-to-longest` | Whitespace: Pad Lines to Same Length | 末尾に空白を足して全行を最長行と同じ長さにする | `a⏎abc` → `a··⏎abc` | なし | なし |
| WS-020 | WS | 基本 | `selection-manipulator.whitespace.align-equals` | Whitespace: Align by Equals Sign (=) | 各行の最初の「=」の位置が揃うように空白を入れる。「=」を含む演算子（`+=` `!=` `<=` `==` `=>` など）は分割せず、その演算子の先頭の位置で揃える。演算子の右側は変えない（`a=1⏎bb = 2` は `a··=1⏎bb = 2` になり、「=」の後ろに空白は入らない） | `a = 1⏎bbb = 2` → `a···= 1⏎bbb = 2` | なし | なし |
| WS-021 | WS | 基本 | `selection-manipulator.whitespace.align-colon` | Whitespace: Align by Colon (:) | 各行の最初の単独の「:」の後ろの値の開始位置を揃える（`::` の中の「:」は区切りにしない）。値が空の行（`key:`）には空白を足さない | `a: 1⏎bbb: 2` → `a:···1⏎bbb: 2` | なし | なし |
| WS-022 | WS | 基本 | `selection-manipulator.whitespace.align-comma` | Whitespace: Align Columns by "," | カンマ区切りの各列の開始位置を揃える | `a,bb,c⏎ccc,d,e` → `a,··bb,c⏎ccc,d,·e` | なし | なし |
| WS-023 | WS | 基本 | `selection-manipulator.whitespace.align-custom` | Whitespace: Align by Custom Delimiter | 入力した区切り文字の位置が揃うように空白を入れる | `a => 1⏎bb => 2（区切り: =>）` → `a··=> 1⏎bb·=> 2` | なし | なし |
| WS-024 | WS | 基本 | `selection-manipulator.whitespace.blank-line-between` | Whitespace: Insert Blank Line Between Lines | 各行の間に空行を入れる | `a⏎b` → `a⏎⏎b` | なし | なし |
| WS-025 | WS | 基本 | `selection-manipulator.whitespace.remove-trailing-blank-lines` | Whitespace: Remove Trailing Blank Lines | 選択範囲の末尾にある空行だけを取り除く | `a⏎b⏎⏎⏎` → `a⏎b` | なし | なし |
| WS-026 | WS | 基本 | `selection-manipulator.whitespace.remove-leading-blank-lines` | Whitespace: Remove Leading Blank Lines | 選択範囲の先頭にある空行だけを取り除く | `⏎⏎a⏎b` → `a⏎b` | なし | なし |
| WS-027 | WS | 基本 | `selection-manipulator.whitespace.collapse-inline` | Whitespace: Collapse Inline Spaces (Keep Indent) | インデントは残したまま、行中の連続空白を 1 個にまとめる | `··a···b` → `··a b` | なし | なし |
| WS-028 | WS | 基本 | `selection-manipulator.whitespace.space-around-operators` | Whitespace: Add Spaces Around Operators | = + - \* / などの演算子の前後に空白を 1 個入れる（文字列リテラル内は対象外） | `a=b+c` → `a = b + c` | なし | なし |
| WS-029 | WS | 基本 | `selection-manipulator.whitespace.remove-space-before-punctuation` | Whitespace: Remove Space Before Punctuation | 「, . ! ? ; :」の直前の空白を取り除く | `hello , world !` → `hello, world!` | なし | なし |
| WS-030 | WS | 基本 | `selection-manipulator.whitespace.space-after-comma` | Whitespace: Ensure Space After Comma | カンマの直後に空白がなければ 1 個入れる | `a,b,c` → `a, b, c` | なし | なし |
| WS-031 | WS | 基本 | `selection-manipulator.whitespace.indent-n` | Whitespace: Indent Lines by N Spaces | 入力した数の空白を各行の先頭に足す | `a⏎b（N=3）` → `···a⏎···b` | なし | なし |
| WS-032 | WS | 基本 | `selection-manipulator.whitespace.outdent-n` | Whitespace: Outdent Lines by N Spaces | 各行の先頭から入力した数までの空白を取り除く | `····a⏎·b（N=2）` → `··a⏎b` | なし | なし |
| WS-033 | WS | 基本 | `selection-manipulator.whitespace.expand-tabs` | Whitespace: Expand All Tabs (Tab Stops) | 行中のタブも含め、タブストップ（4）を考慮して空白に展開する | `a⇥b` → `a···b` | なし | なし |
| WS-034 | WS | 基本 | `selection-manipulator.whitespace.unexpand-tabs` | Whitespace: Unexpand Spaces to Tabs (Tab Stops) | タブストップ（4）境界に揃う連続空白をタブに戻す | `a···b` → `a⇥b` | なし | なし |
| WS-035 | WS | 基本 | `selection-manipulator.whitespace.clear-blank-only-lines` | Whitespace: Clear Whitespace-only Lines | 空白だけの行を中身のない空行にする | `a⏎··⏎b` → `a⏎⏎b` | なし | なし |

### LINE

**行操作（抽出・フィルタ・重複処理・番号付け）** — 基本機能 34 件・派生 6 件・小計 40 件

| ID | カテゴリ | 種別 | 提案コマンド ID | タイトル | 概要 | 入出力例 | 外部通信 | 新規依存 |
|---|---|---|---|---|---|---|---|---|
| LINE-001 | LINE | 基本 | `selection-manipulator.line.filter-contains` | Line: Keep Lines Containing Text | 入力した文字列を含む行だけを残す（大文字小文字を区別するリテラル一致。入力は 1〜1,000 文字で改行を含まない） | `apple⏎banana⏎cherry（an）` → `banana` | なし | なし |
| LINE-002 | LINE | 基本 | `selection-manipulator.line.filter-not-contains` | Line: Remove Lines Containing Text | 入力した文字列を含む行を取り除く（一致の判定と入力は LINE-001 と同じ） | `apple⏎banana⏎cherry（an）` → `apple⏎cherry` | なし | なし |
| LINE-003 | LINE | 基本 | `selection-manipulator.line.filter-regex` | Line: Keep Lines Matching Regex | 入力した正規表現（JavaScript 構文・`u` フラグ・大文字小文字を区別）に一致する行だけを残す。ReDoS 対策として、パターンは 1〜500 文字（構文エラーは入力時に拒否）、対象は全選択範囲の合計 10,000,000 文字までとし、照合は拡張ホストとは別の Worker スレッドで行って 2 秒で打ち切る。打ち切り・上限超過の場合と、照合中に文書が編集された場合は警告を出して変更しない | `a1⏎b⏎c2（\d）` → `a1⏎c2` | なし | なし |
| LINE-004 | LINE | 基本 | `selection-manipulator.line.filter-not-regex` | Line: Remove Lines Matching Regex | 入力した正規表現に一致する行を取り除く（正規表現の構文と制限は LINE-003 と同じ） | `a1⏎b⏎c2（\d）` → `b` | なし | なし |
| LINE-005 | LINE | 基本 | `selection-manipulator.line.add-numbers` | Line: Add Line Numbers | 各行の先頭に「番号: 」を付ける（既存の Remove Line Numbers の逆） | `a⏎b` → `1: a⏎2: b` | なし | なし |
| LINE-006 | LINE | 基本 | `selection-manipulator.line.add-numbers-padded` | Line: Add Line Numbers (Zero Padded) | 行数の桁数に合わせてゼロ埋めした行番号を付ける | `a⏎…⏎j（10 行）` → `01 a⏎…⏎10 j` | なし | なし |
| LINE-007 | LINE | 基本 | `selection-manipulator.line.keep-duplicates` | Line: Keep Only Duplicated Lines | 2 回以上出現する行だけを 1 行ずつ残す | `a⏎b⏎a⏎c⏎b` → `a⏎b` | なし | なし |
| LINE-008 | LINE | 基本 | `selection-manipulator.line.keep-unique-only` | Line: Keep Lines Appearing Once | 1 回しか出現しない行だけを残す | `a⏎b⏎a` → `b` | なし | なし |
| LINE-009 | LINE | 基本 | `selection-manipulator.line.dedupe-ignore-case` | Line: Remove Duplicate Lines (Ignore Case) | 大文字小文字を区別せずに重複行を取り除く（最初の行を残す） | `Apple⏎apple⏎b` → `Apple⏎b` | なし | なし |
| LINE-010 | LINE | 基本 | `selection-manipulator.line.dedupe-ignore-whitespace` | Line: Remove Duplicate Lines (Ignore Whitespace) | 前後の空白を無視して重複行を取り除く（最初の行をそのまま残す。行の途中の空白は区別する） | `a⏎··a⏎b` → `a⏎b` | なし | なし |
| LINE-011 | LINE | 基本 | `selection-manipulator.line.dedupe-adjacent` | Line: Remove Adjacent Duplicate Lines | 隣り合う重複行だけを 1 行にまとめる（uniq 相当） | `a⏎a⏎b⏎a` → `a⏎b⏎a` | なし | なし |
| LINE-012 | LINE | 基本 | `selection-manipulator.line.reverse-words` | Line: Reverse Word Order in Each Line | 各行の中で単語（空白以外の連続）の並びを逆にする。単語の間と行頭・行末の空白は元の位置のまま残す（`··a·b⇥c` → `··c·b⇥a`）。行の順序は変えない（既存 Reverse Selections は行の順序を逆にする） | `a b c⏎d e` → `c b a⏎e d` | なし | なし |
| LINE-013 | LINE | 基本 | `selection-manipulator.line.rotate` | Line: Rotate Lines Down | 最後の行を先頭に移し、ほかの行を 1 行ずつ下にずらす | `a⏎b⏎c` → `c⏎a⏎b` | なし | なし |
| LINE-014 | LINE | 基本 | `selection-manipulator.line.keep-every-nth` | Line: Keep Every Nth Line | N 行ごとに 1 行（1 始まりの行番号が N の倍数の行）だけを残す（N は 1〜1,000,000 の整数、既定値 2） | `a⏎b⏎c⏎d（N=2）` → `b⏎d` | なし | なし |
| LINE-015 | LINE | 基本 | `selection-manipulator.line.remove-every-nth` | Line: Remove Every Nth Line | N 行ごとに 1 行（1 始まりの行番号が N の倍数の行）を取り除く（N は LINE-014 と同じ） | `a⏎b⏎c⏎d（N=2）` → `a⏎c` | なし | なし |
| LINE-016 | LINE | 基本 | `selection-manipulator.line.keep-odd` | Line: Keep Odd Lines | 奇数行だけを残す | `a⏎b⏎c` → `a⏎c` | なし | なし |
| LINE-017 | LINE | 基本 | `selection-manipulator.line.keep-even` | Line: Keep Even Lines | 偶数行だけを残す | `a⏎b⏎c` → `b` | なし | なし |
| LINE-018 | LINE | 基本 | `selection-manipulator.line.head` | Line: Keep First N Lines | 先頭から N 行だけを残す（N は 1〜1,000,000 の整数、既定値 10。N が行数以上なら変えない） | `a⏎b⏎c（N=2）` → `a⏎b` | なし | なし |
| LINE-019 | LINE | 基本 | `selection-manipulator.line.tail` | Line: Keep Last N Lines | 末尾から N 行だけを残す（N は LINE-018 と同じ） | `a⏎b⏎c（N=2）` → `b⏎c` | なし | なし |
| LINE-020 | LINE | 基本 | `selection-manipulator.line.duplicate-each` | Line: Duplicate Each Line | 各行をその直後に複製する | `a⏎b` → `a⏎a⏎b⏎b` | なし | なし |
| LINE-021 | LINE | 基本 | `selection-manipulator.line.swap-pairs` | Line: Swap Adjacent Line Pairs | 1・2 行目、3・4 行目…のように隣り合う 2 行ずつを入れ替える（行数が奇数のときの最終行はそのまま） | `a⏎b⏎c⏎d⏎e` → `b⏎a⏎d⏎c⏎e` | なし | なし |
| LINE-022 | LINE | 基本 | `selection-manipulator.line.join-continuation` | Line: Join Backslash-continued Lines | 行末（改行の直前）に連続するバックスラッシュが奇数個の行だけを継続行（シェルスクリプトや Makefile の継続行）とみなし、最後の 1 個だけを取り除いて、次の行の先頭の空白・タブを詰めて連結する。偶数個（0 個を含む）はエスケープされたリテラルとして連結しない（`a\\⏎b` は変えない、`a\\\⏎b` → `a\\b`）。バックスラッシュの後ろに空白がある行は継続しない。バックスラッシュの前の空白は残し、新しい空白は足さない。継続は連鎖する（`a·\⏎b·\⏎c` → `a·b·c`）。CRLF でも `\r\n` の直前の文字で判定し、単独の CR も改行として扱う。連結しない行の改行コードは元のまま（LF・CRLF・CR の混在も）保つ。選択範囲の最後の行と、選択範囲の末尾の改行の直前の行は、次の行が選択範囲の外にあるため連結しない | `ls·\⏎··-l⏎pwd` → `ls·-l⏎pwd` | なし | なし |
| LINE-023 | LINE | 基本 | `selection-manipulator.line.move-matching-to-top` | Line: Move Lines Containing Text to Top | 入力した文字列を含む行を元の順序のまま先頭に集め、残りの行を元の順序のままその後ろに続ける（一致の判定と入力は LINE-001 と同じ） | `b⏎x1⏎c⏎x2（x）` → `x1⏎x2⏎b⏎c` | なし | なし |
| LINE-024 | LINE | 基本 | `selection-manipulator.line.remove-prefix` | Line: Remove Prefix from Each Line | 入力した文字列で始まる行から、その接頭辞を 1 回だけ取り除く（行頭の字下げは無視しないリテラルの完全一致。大文字小文字を区別する） | `- a⏎- b（- ）` → `a⏎b` | なし | なし |
| LINE-025 | LINE | 基本 | `selection-manipulator.line.remove-suffix` | Line: Remove Suffix from Each Line | 入力した文字列で終わる行から、その接尾辞を 1 回だけ取り除く（行末の空白は無視しないリテラルの完全一致。大文字小文字を区別する） | `a;⏎b;（;）` → `a⏎b` | なし | なし |
| LINE-026 | LINE | 基本 | `selection-manipulator.line.interleave-halves` | Line: Interleave First and Second Half | 前半（`ceil(行数 / 2)` 行）と後半の行を交互に並べる（行数が奇数なら前半の最後の行が末尾に来る） | `a⏎b⏎1⏎2` → `a⏎1⏎b⏎2` | なし | なし |
| LINE-027 | LINE | 基本 | `selection-manipulator.line.join-every-n` | Line: Join Every N Lines (Custom Delimiter) | 1 回目の入力で N（1〜1,000,000 の整数、既定値 2）、2 回目の入力で区切り文字（リテラル 0〜100 文字、改行を含まない、既定値 `,`。空なら区切りなしで連結）を受け取り、N 行ずつ 1 行に連結する（最後のグループは N 行未満でもそのまま連結する） | `a⏎b⏎c⏎d（N=2, 区切り: ,）` → `a,b⏎c,d` | なし | なし |
| LINE-028 | LINE | 基本 | `selection-manipulator.line.split-sentences` | Line: Split Sentences into Lines | 「. ! ?」の連続の後ろに空白が続く位置と「。」の後ろで文を区切り、1 文 1 行にする。区切り位置の空白は取り除き、句読点の直後の閉じ引用符・閉じ括弧（`"` `'` `”` `’` `)` `]` `」` `』`）は前の文に含める。後ろに空白がない `.`（`3.14`）、行末、全角の `？` `！` では区切らない。既存の改行は残す。`e.g.` などの略語の後ろでも区切ってしまう | `Hello. Bye!` → `Hello.⏎Bye!` | なし | なし |
| LINE-029 | LINE | 基本 | `selection-manipulator.line.split-fixed-width` | Line: Split into Fixed-width Lines | 各行をコードポイントで N 文字ごとに分割する（N は 1〜1,000 の整数、既定値 80。行ごとに独立に分割し、空行はそのまま） | `abcdef（N=2）` → `ab⏎cd⏎ef` | なし | なし |
| LINE-030 | LINE | 基本 | `selection-manipulator.line.remove-comment-lines` | Line: Remove Comment Lines | # や // で始まる行（先頭の空白は無視）を取り除く | `# a⏎b⏎// c` → `b` | なし | なし |
| LINE-031 | LINE | 基本 | `selection-manipulator.line.count-stats` | Line: Count Lines, Words and Characters | 行数・単語数・文字数を数えて通知表示する（全選択範囲の合計。エディタは変更しない）。行数は末尾の改行 1 つを数えず、単語は空白以外の連続、文字数はコードポイントで数えて改行（CRLF を含む）を 1 文字とする。1 のときは単数形（`1 line` など）にし、選択範囲が複数のときは末尾に ` (N selections)` を付ける | `a b⏎c` → `2 lines, 3 words, 5 chars（通知）` | なし | なし |
| LINE-032 | LINE | 基本 | `selection-manipulator.line.extract-between-markers` | Line: Extract Lines Between Markers | 1 回目の入力で開始マーカー、2 回目の入力で終了マーカー（どちらもリテラル 1〜1,000 文字、改行を含まない、大文字小文字を区別）を受け取り、マーカー文字列を含む行の間の行を取り出す（マーカー行は含めない）。ブロックが複数あればすべてを順に連結する。開始と終了は同じ文字列でもよい。終了マーカーのないブロックは選択範囲の末尾までとする。開始マーカー行のない選択範囲は変更せず、すべての選択範囲で見つからなければ「No lines were found between the markers」を通知する。行の途中から始まる / 途中で終わる選択範囲の先頭 / 末尾の部分行は、マーカーの判定にも抽出にも使わない | `x⏎BEGIN⏎a⏎END⏎y` → `a` | なし | なし |
| LINE-033 | LINE | 基本 | `selection-manipulator.line.extract-longest` | Line: Extract Longest Line | 最も長い行（コードポイント数）を取り出す（同じ長さなら最初の行） | `a⏎abc⏎ab` → `abc` | なし | なし |
| LINE-034 | LINE | 基本 | `selection-manipulator.line.extract-shortest` | Line: Extract Shortest Line | 最も短い行（コードポイント数）を取り出す（空行と空白だけの行は除く。同じ長さなら最初の行。候補がなければ変えない） | `abc⏎a⏎ab` → `a` | なし | なし |
| LINE-035 | LINE | 派生:LINE-001 | `selection-manipulator.line.filter-contains.clipboard` | Line: Keep Lines Containing Text (Clipboard) | LINE-001 の出力先違いの版。同じ変換を行い、結果をクリップボードにコピーする（エディタの内容は変えない）。クリップボードには選択範囲ごとの結果を文書の改行コードで連結し（末尾に改行は付けない）、結果が空の選択範囲は除く。コピーするものがなければクリップボードを変えずに通知する。選択範囲が行の途中から始まる / 途中で終わるかは考慮せず選択したテキストをそのまま行として扱うため、置換版と結果が異なる場合がある | `apple⏎banana⏎cherry（an）` → `banana` | なし | なし |
| LINE-036 | LINE | 派生:LINE-003 | `selection-manipulator.line.filter-regex.clipboard` | Line: Keep Lines Matching Regex (Clipboard) | LINE-003 の出力先違いの版。同じ変換を行い、結果をクリップボードにコピーする（エディタの内容は変えない）。クリップボードには選択範囲ごとの結果を文書の改行コードで連結し（末尾に改行は付けない）、結果が空の選択範囲は除く。コピーするものがなければクリップボードを変えずに通知する。選択範囲が行の途中から始まる / 途中で終わるかは考慮せず選択したテキストをそのまま行として扱うため、置換版と結果が異なる場合がある | `a1⏎b⏎c2（\d）` → `a1⏎c2` | なし | なし |
| LINE-037 | LINE | 派生:LINE-007 | `selection-manipulator.line.keep-duplicates.clipboard` | Line: Keep Only Duplicated Lines (Clipboard) | LINE-007 の出力先違いの版。同じ変換を行い、結果をクリップボードにコピーする（エディタの内容は変えない）。クリップボードには選択範囲ごとの結果を文書の改行コードで連結し（末尾に改行は付けない）、結果が空の選択範囲は除く。コピーするものがなければクリップボードを変えずに通知する。選択範囲が行の途中から始まる / 途中で終わるかは考慮せず選択したテキストをそのまま行として扱うため、置換版と結果が異なる場合がある | `a⏎b⏎a⏎c⏎b` → `a⏎b` | なし | なし |
| LINE-038 | LINE | 派生:LINE-008 | `selection-manipulator.line.keep-unique-only.clipboard` | Line: Keep Lines Appearing Once (Clipboard) | LINE-008 の出力先違いの版。同じ変換を行い、結果をクリップボードにコピーする（エディタの内容は変えない）。クリップボードには選択範囲ごとの結果を文書の改行コードで連結し（末尾に改行は付けない）、結果が空の選択範囲は除く。コピーするものがなければクリップボードを変えずに通知する。選択範囲が行の途中から始まる / 途中で終わるかは考慮せず選択したテキストをそのまま行として扱うため、置換版と結果が異なる場合がある | `a⏎b⏎a` → `b` | なし | なし |
| LINE-039 | LINE | 派生:LINE-011 | `selection-manipulator.line.dedupe-adjacent.clipboard` | Line: Remove Adjacent Duplicate Lines (Clipboard) | LINE-011 の出力先違いの版。同じ変換を行い、結果をクリップボードにコピーする（エディタの内容は変えない）。クリップボードには選択範囲ごとの結果を文書の改行コードで連結し（末尾に改行は付けない）、結果が空の選択範囲は除く。コピーするものがなければクリップボードを変えずに通知する。選択範囲が行の途中から始まる / 途中で終わるかは考慮せず選択したテキストをそのまま行として扱うため、置換版と結果が異なる場合がある | `a⏎a⏎b⏎a` → `a⏎b⏎a` | なし | なし |
| LINE-040 | LINE | 派生:LINE-032 | `selection-manipulator.line.extract-between-markers.clipboard` | Line: Extract Lines Between Markers (Clipboard) | LINE-032 の出力先違いの版。同じ変換を行い、結果をクリップボードにコピーする（エディタの内容は変えない）。クリップボードには選択範囲ごとの結果を文書の改行コードで連結し（末尾に改行は付けない）、結果が空の選択範囲と開始マーカー行のない選択範囲は除く。コピーするものがなければクリップボードを変えずに通知する。選択範囲が行の途中から始まる / 途中で終わるかは考慮せず選択したテキストをそのまま行として扱うため、置換版と結果が異なる場合がある | `x⏎BEGIN⏎a⏎END⏎y` → `a` | なし | なし |

### SORT

**ソート拡張（自然順・ロケール順・キー／列指定など）** — 基本機能 25 件・派生 5 件・小計 30 件

| ID | カテゴリ | 種別 | 提案コマンド ID | タイトル | 概要 | 入出力例 | 外部通信 | 新規依存 |
|---|---|---|---|---|---|---|---|---|
| SORT-001 | SORT | 基本 | `selection-manipulator.sort-line.natural.ascending` | Sort Lines Ascending by natural order | 数字部分を数値として比較する自然順で行を昇順に並べる | `file10⏎file2` → `file2⏎file10` | なし | なし |
| SORT-002 | SORT | 基本 | `selection-manipulator.sort-line.natural.descending` | Sort Lines Descending by natural order | 自然順で行を降順に並べる | `file2⏎file10` → `file10⏎file2` | なし | なし |
| SORT-003 | SORT | 基本 | `selection-manipulator.sort-line.ignore-case.ascending` | Sort Lines Ascending ignoring case | 大文字小文字を区別せずに行を昇順に並べる | `b⏎A⏎a` → `A⏎a⏎b` | なし | なし |
| SORT-004 | SORT | 基本 | `selection-manipulator.sort-line.ignore-case.descending` | Sort Lines Descending ignoring case | 大文字小文字を区別せずに行を降順に並べる | `A⏎b⏎a` → `b⏎A⏎a` | なし | なし |
| SORT-005 | SORT | 基本 | `selection-manipulator.sort-line.locale.ascending` | Sort Lines Ascending by locale | Intl.Collator（入力したロケール）で行を昇順に並べる | `f⏎é⏎e` → `e⏎é⏎f` | なし | なし |
| SORT-006 | SORT | 基本 | `selection-manipulator.sort-line.locale.descending` | Sort Lines Descending by locale | Intl.Collator（入力したロケール）で行を降順に並べる | `e⏎é⏎f` → `f⏎é⏎e` | なし | なし |
| SORT-007 | SORT | 基本 | `selection-manipulator.sort-line.japanese.ascending` | Sort Lines Ascending by kana order | ひらがなとカタカナを同一視した五十音順で行を並べる | `カ⏎あ⏎き` → `あ⏎カ⏎き` | なし | なし |
| SORT-008 | SORT | 基本 | `selection-manipulator.sort-line.column.ascending` | Sort Lines Ascending by column | 入力した区切り文字（リテラル 1〜100 文字、`\t` はタブ、既定値 `,`）と列番号（1〜1,000、既定値 1）の値（前後の空白を除く）をキーに行を昇順に並べる。数値の値は数値として値の順に、それ以外は自然順で比べ、昇順では数値の行を先、文字列の行を後に置く（数値と文字列が混在しても順序が一貫するように分ける）。列が足りない行は末尾に元の順で置く。引用符付き CSV は解釈しない | `b,2⏎a,1（列 2）` → `a,1⏎b,2` | なし | なし |
| SORT-009 | SORT | 基本 | `selection-manipulator.sort-line.column.descending` | Sort Lines Descending by column | 指定した列の値をキーに行を降順に並べる（入力とキーの規則は SORT-008 と同じで、SORT-008 の順序をそのまま逆にするため文字列の行が先、数値の行が後になる。列が足りない行は降順でも末尾に元の順で置く） | `a,1⏎b,2（列 2）` → `b,2⏎a,1` | なし | なし |
| SORT-010 | SORT | 基本 | `selection-manipulator.sort-line.regex-key.ascending` | Sort Lines Ascending by regex capture | 入力した正規表現の最初のキャプチャ（キャプチャグループがなければ一致全体）をキーに行を並べる。比較は SORT-008 と同じ（数値の行が先で値の順、文字列の行が後で自然順）。一致しない行とグループ 1 が一致に参加しない行は末尾に元の順で置く。正規表現の構文と ReDoS 対策（パターン 1〜500 文字・合計 10,000,000 文字まで・Worker スレッドで 2 秒で打ち切り）は LINE-003 と同じ | `id=10⏎id=9（id=(\d+)）` → `id=9⏎id=10` | なし | なし |
| SORT-011 | SORT | 基本 | `selection-manipulator.sort-line.date.ascending` | Sort Lines Ascending by date | 行に含まれる最初の日付（年が先頭の `YYYY-MM-DD` / `YYYY/MM/DD` / `YYYY.MM.DD`。`T` または空白に続く時刻とタイムゾーン `Z` / `±HH:MM` / `±HHMM` も可）をキーに古い順に並べる。タイムゾーンのない日時と、形の不正なタイムゾーン（`+09:001` など）の付いた日時は UTC とみなす。日付のない行と最初の日付が不正な行（`2026-02-30` など）と、形は正しいが範囲外のタイムゾーン（`+25:00` / `+09:60` など）の付いた行は末尾に元の順で置く | `2026-03-01 b⏎2025-12-31 a` → `2025-12-31 a⏎2026-03-01 b` | なし | なし |
| SORT-012 | SORT | 基本 | `selection-manipulator.sort-line.date.descending` | Sort Lines Descending by date | 行に含まれる日付をキーに新しい順に並べる（日付の規則は SORT-011 と同じ。日付のない行は降順でも末尾） | `2025-12-31 a⏎2026-03-01 b` → `2026-03-01 b⏎2025-12-31 a` | なし | なし |
| SORT-013 | SORT | 基本 | `selection-manipulator.sort-line.semver.ascending` | Sort Lines Ascending by semantic version | セマンティックバージョン（プレリリースを含む）の順に並べる。前後の空白を除いた行全体がバージョン（先頭の `v` / `V` は可）の場合のみキーとし、それ以外の行（`pkg 1.2.0` など）は末尾に元の順で置く | `1.10.0⏎1.2.0⏎1.2.0-rc.1` → `1.2.0-rc.1⏎1.2.0⏎1.10.0` | なし | なし |
| SORT-014 | SORT | 基本 | `selection-manipulator.sort-line.ip.ascending` | Sort Lines Ascending by IP address | IPv4 / IPv6 アドレスを数値として比較して並べる | `10.0.0.10⏎10.0.0.9` → `10.0.0.9⏎10.0.0.10` | なし | なし |
| SORT-015 | SORT | 基本 | `selection-manipulator.sort-line.word-count.ascending` | Sort Lines Ascending by word count | 単語数の少ない順に並べる | `a b c⏎a` → `a⏎a b c` | なし | なし |
| SORT-016 | SORT | 基本 | `selection-manipulator.sort-line.last-word.ascending` | Sort Lines Ascending by last word | 各行の最後の単語をキーに並べる（姓順など） | `Ann Smith⏎Bob Adams` → `Bob Adams⏎Ann Smith` | なし | なし |
| SORT-017 | SORT | 基本 | `selection-manipulator.sort-line.suffix.ascending` | Sort Lines Ascending by reversed string | 行を後ろから読んだ文字列で並べ、末尾（拡張子など）が同じ行をまとめる | `a.ts⏎b.js⏎c.ts` → `b.js⏎a.ts⏎c.ts` | なし | なし |
| SORT-018 | SORT | 基本 | `selection-manipulator.sort-line.unique.ascending` | Sort Lines Ascending and remove duplicates | 昇順に並べたうえで重複行を取り除く（sort -u 相当）。重複とみなすのは完全に同じ行だけで、大文字小文字や Unicode 正規化（NFC / NFD）だけが違う行は残す | `b⏎a⏎b` → `a⏎b` | なし | なし |
| SORT-019 | SORT | 基本 | `selection-manipulator.sort-line.paragraph.ascending` | Sort Paragraphs Ascending | 空行で区切られた段落をブロック単位で並べる。出力では段落の間を空行 1 行にし、先頭・末尾・連続の空行は正規化する | `b⏎b2⏎⏎a⏎a2` → `a⏎a2⏎⏎b⏎b2` | なし | なし |
| SORT-020 | SORT | 基本 | `selection-manipulator.sort-line.indent-block.ascending` | Sort Lines Ascending keeping indented children | インデントされた子行を親行と一緒に動かしながら親行を並べる（インデントが最も浅い非空行を親とし、並べるのは最上位の階層のみ）。最初の親行より前にある行（先頭の空行や、より深くインデントされた行）は出力の先頭に元の順で残す | `b⏎··b1⏎a⏎··a1` → `a⏎··a1⏎b⏎··b1` | なし | なし |
| SORT-021 | SORT | 基本 | `selection-manipulator.sort-line.hex.ascending` | Sort Lines Ascending by hex number | 各行の最初のトークンが全体として 16 進数（0x 付きも可）の場合にその値で並べる。`face` や `bad` のように 16 進数の文字だけからなる単語も数値として扱う。16 進数でない行（`deadline`・`0x` だけ・`0xZZ` など）は末尾に元の順で置く | `0x1F⏎0xA` → `0xA⏎0x1F` | なし | なし |
| SORT-022 | SORT | 基本 | `selection-manipulator.sort.natural.ascending` | Sort Selections Ascending by natural order | 複数選択のテキストを自然順で並べ替える。結果は新しいエディタに出力する（既存の Sort Selections と同じ。空白だけの行は除く） | `[v10] [v2]` → `v2⏎v10` | なし | なし |
| SORT-023 | SORT | 基本 | `selection-manipulator.sort.ignore-case.ascending` | Sort Selections Ascending ignoring case | 複数選択のテキストを大文字小文字を区別せずに並べ替える。結果は新しいエディタに出力する | `[b] [A]` → `A⏎b` | なし | なし |
| SORT-024 | SORT | 基本 | `selection-manipulator.sort.length.ascending` | Sort Selections Ascending by length | 複数選択のテキストを文字数（コードポイント数）の少ない順に並べ替える。結果は新しいエディタに出力する | `[ccc] [a]` → `a⏎ccc` | なし | なし |
| SORT-025 | SORT | 基本 | `selection-manipulator.sort.length.descending` | Sort Selections Descending by length | 複数選択のテキストを文字数（コードポイント数）の多い順に並べ替える。結果は新しいエディタに出力する | `[a] [ccc]` → `ccc⏎a` | なし | なし |
| SORT-026 | SORT | 派生:SORT-001 | `selection-manipulator.sort-line.natural.ascending.clipboard` | Sort Lines Ascending by natural order (Clipboard) | SORT-001 の出力先違いの版。同じ変換を行い、結果をクリップボードにコピーする（エディタの内容は変えない） | `file10⏎file2` → `file2⏎file10` | なし | なし |
| SORT-027 | SORT | 派生:SORT-003 | `selection-manipulator.sort-line.ignore-case.ascending.clipboard` | Sort Lines Ascending ignoring case (Clipboard) | SORT-003 の出力先違いの版。同じ変換を行い、結果をクリップボードにコピーする（エディタの内容は変えない） | `b⏎A⏎a` → `A⏎a⏎b` | なし | なし |
| SORT-028 | SORT | 派生:SORT-008 | `selection-manipulator.sort-line.column.ascending.clipboard` | Sort Lines Ascending by column (Clipboard) | SORT-008 の出力先違いの版。同じ変換を行い、結果をクリップボードにコピーする（エディタの内容は変えない） | `b,2⏎a,1（列 2）` → `a,1⏎b,2` | なし | なし |
| SORT-029 | SORT | 派生:SORT-013 | `selection-manipulator.sort-line.semver.ascending.clipboard` | Sort Lines Ascending by semantic version (Clipboard) | SORT-013 の出力先違いの版。同じ変換（先頭の `v` / `V` を許すバージョン判定を含む）を行い、結果をクリップボードにコピーする（エディタの内容は変えない） | `1.10.0⏎1.2.0⏎1.2.0-rc.1` → `1.2.0-rc.1⏎1.2.0⏎1.10.0` | なし | なし |
| SORT-030 | SORT | 派生:SORT-022 | `selection-manipulator.sort.natural.ascending.clipboard` | Sort Selections Ascending by natural order (Clipboard) | SORT-022 の出力先違いの版。同じ変換を行い、結果をクリップボードにコピーする（エディタの内容は変えない） | `[v10] [v2]` → `v2⏎v10` | なし | なし |

### WRAP

**囲み・引用符・括弧・前後への文字付加** — 基本機能 30 件・派生 0 件・小計 30 件

| ID | カテゴリ | 種別 | 提案コマンド ID | タイトル | 概要 | 入出力例 | 外部通信 | 新規依存 |
|---|---|---|---|---|---|---|---|---|
| WRAP-001 | WRAP | 基本 | `selection-manipulator.enclose.custom` | Enclose: Custom (Prefix / Suffix) | 入力した前置文字列と後置文字列で選択テキストを囲む（前置・後置は各 0〜1,000 文字で改行不可。両方空なら変更しない。空選択ではカーソル位置に組を挿入する） | `abc（<<, >>）` → `<<abc>>` | なし | なし |
| WRAP-002 | WRAP | 基本 | `selection-manipulator.enclose.each-line.custom` | Enclose Each Line: Custom | 各行を入力した前置・後置文字列で囲む（長さ 0 の行はそのまま、空白のみの行は囲む。末尾の改行 1 つは行として数えずに残す。前置・後置の制限は WRAP-001 と同じで、両方空なら変更しない） | `a⏎b（[, ]）` → `[a]⏎[b]` | なし | なし |
| WRAP-003 | WRAP | 基本 | `selection-manipulator.quote.each-line.double` | Quote Each Line: Double ("") | 各行をダブルクォートで囲む（長さ 0 の行はそのまま、空白のみの行は囲む。末尾の改行 1 つは行として数えずに残す） | `a⏎b` → `"a"⏎"b"` | なし | なし |
| WRAP-004 | WRAP | 基本 | `selection-manipulator.quote.each-line.single` | Quote Each Line: Single ('') | 各行をシングルクォートで囲む（空行・末尾改行の扱いは WRAP-003 と同じ） | `a⏎b` → `'a'⏎'b'` | なし | なし |
| WRAP-005 | WRAP | 基本 | `selection-manipulator.quote.each-word.double` | Quote Each Word: Double ("") | 空白区切りの各単語をダブルクォートで囲む（空白以外の文字の連続を単語とし、単語間の空白・改行はそのまま残す） | `a b` → `"a" "b"` | なし | なし |
| WRAP-006 | WRAP | 基本 | `selection-manipulator.quote.list.sql-in` | Quote: SQL IN List | 各行をシングルクォートで囲み、カンマ区切りで括弧に入れる（内部の ' は '' にエスケープ。空行・空白のみの行は除き、行の前後の空白はトリムしない。結果は 1 行で、選択末尾の改行 1 つはリストの後ろに残す。対象行がなければ変更しない） | `a⏎O'Neil` → `('a', 'O''Neil')` | なし | なし |
| WRAP-007 | WRAP | 基本 | `selection-manipulator.quote.list.array` | Quote: Array Literal | 各行をダブルクォートで囲み、配列リテラルにする（内部の \\ と " はエスケープする。空行・空白のみの行と末尾改行の扱いは WRAP-006 と同じ） | `a⏎b` → `["a", "b"]` | なし | なし |
| WRAP-008 | WRAP | 基本 | `selection-manipulator.quote.triple-double` | Quote: Triple Double (""" """) | Python などの三重引用符で囲む | `abc` → `"""abc"""` | なし | なし |
| WRAP-009 | WRAP | 基本 | `selection-manipulator.quote.guillemets` | Quote: Guillemets («») | ギュメ（« »）で囲む | `abc` → `«abc»` | なし | なし |
| WRAP-010 | WRAP | 基本 | `selection-manipulator.quote.smart-double` | Quote: Smart Double (“”) | 曲がった二重引用符で囲む | `abc` → `“abc”` | なし | なし |
| WRAP-011 | WRAP | 基本 | `selection-manipulator.quote.smart-single` | Quote: Smart Single (‘’) | 曲がった一重引用符で囲む | `abc` → `‘abc’` | なし | なし |
| WRAP-012 | WRAP | 基本 | `selection-manipulator.quote.double-escaped` | Quote: Double with Escaping | 内部の " と \\ をエスケープしてからダブルクォートで囲む（改行はエスケープしない） | `say "hi"` → `"say \"hi\""` | なし | なし |
| WRAP-013 | WRAP | 基本 | `selection-manipulator.unquote.each-line` | Unquote Each Line | 各行の両端にある対応した引用符（" ' \`）を取り除く（行の前後の空白を除いた部分の両端が同じ引用符のときだけ 1 組を除き、前後の空白は残す。曲がった引用符は対象外） | `"a"⏎'b'` → `a⏎b` | なし | なし |
| WRAP-014 | WRAP | 基本 | `selection-manipulator.enclose.japanese.white-lenticular` | Enclose: Japanese White Lenticular Bracket (〖〗) | 〖〗で囲む | `注意` → `〖注意〗` | なし | なし |
| WRAP-015 | WRAP | 基本 | `selection-manipulator.enclose.japanese.tortoise-shell` | Enclose: Japanese Tortoise Shell Bracket (〔〕) | 〔〕で囲む | `注` → `〔注〕` | なし | なし |
| WRAP-016 | WRAP | 基本 | `selection-manipulator.enclose.japanese.double-angle` | Enclose: Japanese Double Angle Bracket (《》) | 《》で囲む | `書名` → `《書名》` | なし | なし |
| WRAP-017 | WRAP | 基本 | `selection-manipulator.enclose.japanese.single-angle` | Enclose: Japanese Single Angle Bracket (〈〉) | 〈〉で囲む | `論文` → `〈論文〉` | なし | なし |
| WRAP-018 | WRAP | 基本 | `selection-manipulator.enclose.html-tag` | Enclose: HTML Tag (Custom) | 入力したタグ名の開始タグと終了タグで囲む（タグ名は 1〜64 文字の英数字とハイフンのみ許可し、属性は非対応。選択テキストは HTML エスケープしない） | `abc（b）` → `<b>abc</b>` | なし | なし |
| WRAP-019 | WRAP | 基本 | `selection-manipulator.enclose.html-comment` | Enclose: HTML Comment | HTML コメントで囲む（内部の --> は変換しない） | `abc` → `<!-- abc -->` | なし | なし |
| WRAP-020 | WRAP | 基本 | `selection-manipulator.enclose.block-comment` | Enclose: Block Comment (/\* \*/) | C 系のブロックコメントで囲む（内部の \*/ は変換しない） | `abc` → `/* abc */` | なし | なし |
| WRAP-021 | WRAP | 基本 | `selection-manipulator.enclose.placeholder` | Enclose: Placeholder (${}) | テンプレートリテラルやシェル変数の形式で囲む | `name` → `${name}` | なし | なし |
| WRAP-022 | WRAP | 基本 | `selection-manipulator.enclose.mustache` | Enclose: Mustache ({{ }}) | Mustache / Handlebars のプレースホルダ形式で囲む | `name` → `{{ name }}` | なし | なし |
| WRAP-023 | WRAP | 基本 | `selection-manipulator.enclose.percent` | Enclose: Percent (%%) | Windows の環境変数形式で囲む | `PATH` → `%PATH%` | なし | なし |
| WRAP-024 | WRAP | 基本 | `selection-manipulator.enclose.pipes` | Enclose: Pipes (\|\|) | 縦棒で囲む | `abc` → `\|abc\|` | なし | なし |
| WRAP-025 | WRAP | 基本 | `selection-manipulator.enclose.ascii-box` | Enclose: ASCII Box | テキストを ASCII の枠線で囲む（幅は最長行のコードポイント数で、全角文字・タブの表示幅は考慮しない。短い行は空白で埋める） | `abc` → `+-----+⏎\| abc \|⏎+-----+` | なし | なし |
| WRAP-026 | WRAP | 基本 | `selection-manipulator.enclose.each-word.paren` | Enclose Each Word: Parentheses (()) | 空白区切りの各単語を丸括弧で囲む（単語の区切り方は WRAP-005 と同じ） | `a b` → `(a) (b)` | なし | なし |
| WRAP-027 | WRAP | 基本 | `selection-manipulator.enclose.lines-block` | Enclose: Lines Block (Before / After Lines) | 選択した行群の前後に、入力した行を 1 行ずつ追加する（選択が改行で終わる場合は、後ろの行をその改行の後に置き改行を付けて次の行と連結しない。入力は各 0〜1,000 文字で改行不可、空も可。空選択では何もしない） | `a⏎b（BEGIN, END）` → `BEGIN⏎a⏎b⏎END` | なし | なし |
| WRAP-028 | WRAP | 基本 | `selection-manipulator.enclose.cycle-brackets` | Enclose: Cycle Brackets | 外側の括弧を () → \[\] → {} → () の順に切り替える（先頭と末尾の括弧が対応する場合のみ。対応は同種の括弧だけを数えて判定し、引用符内の括弧も数える。`(a)(b)` などは変更しない） | `(a)` → `[a]` | なし | なし |
| WRAP-029 | WRAP | 基本 | `selection-manipulator.enclose.remove-outer-brackets` | Enclose: Remove Matching Outer Brackets | 両端が対応する括弧の組のときだけ外側の 1 組を取り除く（対象は () \[\] {} <> と全角・日本語括弧 11 種。対応の判定は WRAP-028 と同じ） | `((a))` → `(a)` | なし | なし |
| WRAP-030 | WRAP | 基本 | `selection-manipulator.enclose.markdown-inline-code` | Enclose: Backtick Code (Auto Fence) | 内部に含まれる連続したバッククォートより長いバッククォートで囲む（Markdown のインラインコード用）。内容の先頭か末尾がバッククォートの場合、または先頭と末尾がともに空白・改行で全体が空白ではない場合は、CommonMark の規則に合わせて両側に空白を 1 つ足す。常に 1 個のバッククォートで囲む既存の Quote: Backtick と異なり、内部にバッククォートを含むテキストでも正しいコードスパンになる | ``a`b`` → ``` ``a`b`` ``` | なし | なし |

### ENC

**エンコード／デコード（HTML エンティティ・Unicode エスケープ・Base32/58・Hex・Punycode など）** — 基本機能 34 件・派生 6 件・小計 40 件

| ID | カテゴリ | 種別 | 提案コマンド ID | タイトル | 概要 | 入出力例 | 外部通信 | 新規依存 |
|---|---|---|---|---|---|---|---|---|
| ENC-001 | ENC | 基本 | `selection-manipulator.html.encode` | Encode HTML Entities | &lt; &gt; & " ' を HTML 実体参照に変換する（他の文字は変えない。' は &amp;#39; にする） | `<a href="x">` → `&lt;a href=&quot;x&quot;&gt;` | なし | なし |
| ENC-002 | ENC | 基本 | `selection-manipulator.html.decode` | Decode HTML Entities | 名前付き・数値の HTML 実体参照を文字に戻す（名前付きは XML の 5 種・Latin-1（nbsp〜yuml）・よく使う記号のみ対応し、未対応の名前と ; のない & はそのまま残す。数値参照が 0・サロゲート・U+10FFFF 超ならエラー） | `&lt;b&gt; &#12354;` → `<b> あ` | なし | なし |
| ENC-003 | ENC | 基本 | `selection-manipulator.html.encode-numeric` | Encode All Characters as Numeric Entities | ASCII 以外の文字をすべて数値実体参照（&#N;）にする（タイトルと異なり ASCII はそのまま。コードポイント単位の 10 進参照） | `aあ` → `a&#12354;` | なし | なし |
| ENC-004 | ENC | 基本 | `selection-manipulator.unicode.escape` | Escape Unicode (\\uXXXX) | ASCII 以外の文字を \\uXXXX 形式（サロゲートペアは 2 つ）にする（16 進は小文字 4 桁） | `あ😀` → `\u3042\ud83d\ude00` | なし | なし |
| ENC-005 | ENC | 基本 | `selection-manipulator.unicode.unescape` | Unescape Unicode (\\uXXXX) | \\uXXXX / \\u{…} 形式のエスケープを文字に戻す（\\u{…} は 1〜6 桁。連続する上位・下位サロゲートは 1 文字に結合し、孤立サロゲートと U+10FFFF 超はエラー。形式に合わない \\u はそのまま残す） | `\u3042` → `あ` | なし | なし |
| ENC-006 | ENC | 基本 | `selection-manipulator.unicode.escape-es6` | Escape Unicode (\\u{...}) | ASCII 以外の文字をコードポイント単位の \\u{…} 形式にする（16 進は大文字、先頭ゼロなし） | `😀` → `\u{1F600}` | なし | なし |
| ENC-007 | ENC | 基本 | `selection-manipulator.base64url.encode` | Encode Base64URL | URL セーフな Base64（パディングなし）にエンコードする。孤立サロゲートを含む入力はエラー | `foo?` → `Zm9vPw` | なし | なし |
| ENC-008 | ENC | 基本 | `selection-manipulator.base64url.decode` | Decode Base64URL | Base64URL をデコードする（空白・改行は無視し、正しい = パディングも受け付ける。不正な文字・長さ・パディング、末尾文字の未使用ビットが 0 でない場合、UTF-8 として不正な結果はエラー） | `Zm9vPw` → `foo?` | なし | なし |
| ENC-009 | ENC | 基本 | `selection-manipulator.base32.encode` | Encode Base32 | RFC 4648 の Base32 にエンコードする（自前実装）。孤立サロゲートを含む入力はエラー | `foo` → `MZXW6===` | なし | なし |
| ENC-010 | ENC | 基本 | `selection-manipulator.base32.decode` | Decode Base32 | RFC 4648 の Base32 をデコードする（空白・改行は無視、大小文字不問、パディングは省略可。不正な文字・長さ・パディング・余りビット、UTF-8 として不正な結果はエラー） | `MZXW6===` → `foo` | なし | なし |
| ENC-011 | ENC | 基本 | `selection-manipulator.base58.encode` | Encode Base58 | Bitcoin 方式のアルファベットで Base58 にエンコードする（自前実装。先頭の 0x00 バイトは 1。入力は 10,000 UTF-8 バイトまで）。孤立サロゲートを含む入力はエラー | `hello` → `Cn8eVZg` | なし | なし |
| ENC-012 | ENC | 基本 | `selection-manipulator.base58.decode` | Decode Base58 | Base58 をデコードする（空白・改行は無視、アルファベット外の文字（0 O I l など）はエラー。入力は空白を除いて 14,000 文字まで） | `Cn8eVZg` → `hello` | なし | なし |
| ENC-013 | ENC | 基本 | `selection-manipulator.hex.encode` | Encode Hex (UTF-8 Bytes) | UTF-8 のバイト列を 16 進文字列にする（小文字・区切りなし）。孤立サロゲートを含む入力はエラー | `abc` → `616263` | なし | なし |
| ENC-014 | ENC | 基本 | `selection-manipulator.hex.decode` | Decode Hex (UTF-8 Bytes) | 16 進文字列（空白・0x 区切りも可）を UTF-8 として文字列に戻す（空白・タブ・改行でトークンに区切り、大小文字不問。トークンは接頭辞なしの 16 進数字列か、0x / 0X で始まり各グループが偶数桁のもの（0x610x62 も可）。途中の 0x（100x20）、重複した接頭辞、桁のない 0x、奇数桁、16 進以外の文字、UTF-8 として不正な結果はエラー） | `61 62 63` → `abc` | なし | なし |
| ENC-015 | ENC | 基本 | `selection-manipulator.binary.encode` | Encode Binary (UTF-8 Bytes) | UTF-8 のバイト列を 8 ビットごとの 2 進表記にする（空白 1 つで区切る）。孤立サロゲートを含む入力はエラー | `Hi` → `01001000 01101001` | なし | なし |
| ENC-016 | ENC | 基本 | `selection-manipulator.binary.decode` | Decode Binary (UTF-8 Bytes) | 2 進表記のバイト列を文字列に戻す（空白・改行は無視。0 / 1 以外の文字、8 の倍数でないビット数、UTF-8 として不正な結果はエラー） | `01001000 01101001` → `Hi` | なし | なし |
| ENC-017 | ENC | 基本 | `selection-manipulator.punycode.encode` | Encode Punycode (IDN) | 国際化ドメイン名を Punycode（xn--）に変換する（node:url の domainToASCII を使用。選択全体を前後の空白を除いて 1 つのドメイン名として扱う。途中の改行・タブ、不正なドメイン名はエラー。入力は 1,000 文字まで。UTS #46 のマッピングで ASCII は小文字化され、1 文字が複数文字に展開されることがある（㍿ → xn--6oqv20b1zgzxr）） | `例え.jp` → `xn--r8jz45g.jp` | なし | なし |
| ENC-018 | ENC | 基本 | `selection-manipulator.punycode.decode` | Decode Punycode (IDN) | Punycode のドメイン名を Unicode 表記に戻す（domainToUnicode を使用。入力の扱い・エラー条件・入力長の上限は ENC-017 と同じ。UTS #46 のマッピングで出力が入力より長くなることがある（ﬃ → ffi、㍿ → 株式会社）） | `xn--r8jz45g.jp` → `例え.jp` | なし | なし |
| ENC-019 | ENC | 基本 | `selection-manipulator.quoted-printable.encode` | Encode Quoted-Printable | メール本文向けの Quoted-Printable（UTF-8）にエンコードする（印字可能 ASCII 以外と = は =XX（大文字）、行末のスペース・タブは =20 / =09。76 文字を超える行は =XX を分割せずにソフト改行（= + 文書の改行コード）を入れ、元の改行はそのまま残す）。孤立サロゲートを含む入力はエラー | `café` → `caf=C3=A9` | なし | なし |
| ENC-020 | ENC | 基本 | `selection-manipulator.quoted-printable.decode` | Decode Quoted-Printable | Quoted-Printable をデコードする（RFC 2045 に従い各行の行末のスペース・タブを除いてから、=XX（大小文字不問）とソフト改行を戻す。= の後が 16 進 2 桁でない場合と UTF-8 として不正な結果はエラー） | `caf=C3=A9` → `café` | なし | なし |
| ENC-021 | ENC | 基本 | `selection-manipulator.cipher.rot13` | Cipher: ROT13 | 英字を 13 文字ずらす（難読化用。暗号ではない。ASCII 英字のみ。他の文字は変えない） | `Hello` → `Uryyb` | なし | なし |
| ENC-022 | ENC | 基本 | `selection-manipulator.cipher.rot47` | Cipher: ROT47 | ASCII の記号・数字も含めて 47 文字ずらす（難読化用。コード 33〜126 の文字のみ） | `Hello` → `w6==@` | なし | なし |
| ENC-023 | ENC | 基本 | `selection-manipulator.cipher.caesar` | Cipher: Caesar Shift (N) | 英字を入力した数だけずらす（学習・パズル用。暗号用途ではない。入力は符号付き 1〜9 桁の整数で、負数は逆方向。複数選択でも入力は 1 回。キャンセル時は何もしない） | `abc（N=3）` → `def` | なし | なし |
| ENC-024 | ENC | 基本 | `selection-manipulator.cipher.atbash` | Cipher: Atbash | 英字を逆順のアルファベットに置き換える（パズル用。ASCII 英字のみ） | `abc` → `zyx` | なし | なし |
| ENC-025 | ENC | 基本 | `selection-manipulator.ascii85.encode` | Encode Ascii85 | Ascii85（Adobe 形式）にエンコードする（自前実装。4 バイトすべて 0 のグループは z）。孤立サロゲートを含む入力はエラー | `hi` → `<~BP@~>` | なし | なし |
| ENC-026 | ENC | 基本 | `selection-manipulator.ascii85.decode` | Decode Ascii85 | Ascii85 をデコードする（空白・改行は無視、<~ ~> は省略可。範囲外の文字、グループ途中の z、2^32−1 超のグループ、1 文字だけの端数グループ、UTF-8 として不正な結果はエラー） | `<~BP@~>` → `hi` | なし | なし |
| ENC-027 | ENC | 基本 | `selection-manipulator.base64.gzip` | Gzip Base64 | gzip で圧縮してから Base64 にする（node:zlib。既存の Deflate とは形式が異なる。圧縮レベル 6。同じ入力で常に同じ結果になるよう gzip ヘッダの MTIME=0・XFL=0・OS=0x13 に固定する）。孤立サロゲートを含む入力はエラー | `hi` → `H4sIAAAAAAAAE8vIBACsKpPYAgAAAA==` | なし | なし |
| ENC-028 | ENC | 基本 | `selection-manipulator.base64.gunzip` | Gunzip Base64 | Base64 をデコードしてから gzip を展開する（展開後サイズに上限を設ける。上限は 10 MiB。空白・改行は無視し、不正な Base64・壊れた gzip・UTF-8 として不正な結果はエラー） | `H4sIAAAAAAAAE8vIBACsKpPYAgAAAA==` → `hi` | なし | なし |
| ENC-029 | ENC | 基本 | `selection-manipulator.url.encode-form` | Encode Form (x-www-form-urlencoded) | フォーム送信形式でエンコードする（空白は +。英数字と * - . _ 以外を UTF-8 の %XX（大文字）にする。改行もそのまま %0A などにする）。孤立サロゲートを含む入力はエラー | `a b&c` → `a+b%26c` | なし | なし |
| ENC-030 | ENC | 基本 | `selection-manipulator.url.decode-form` | Decode Form (x-www-form-urlencoded) | フォーム送信形式をデコードする（+ は空白。不正な %XX はエラー） | `a+b%26c` → `a b&c` | なし | なし |
| ENC-031 | ENC | 基本 | `selection-manipulator.base64.encode-each-line` | Encode Base64 (Each Line) | 各行を個別に Base64 エンコードする（空行は空行のまま、改行コード（LF / CRLF）は保持）。孤立サロゲートを含む入力はエラー | `a⏎b` → `YQ==⏎Yg==` | なし | なし |
| ENC-032 | ENC | 基本 | `selection-manipulator.base64.decode-each-line` | Decode Base64 (Each Line) | 各行を個別に Base64 デコードする（各行の前後のスペース・タブは無視、空行は空行のまま。1 行でも不正ならエラー（何行目かを示す）） | `YQ==⏎Yg==` → `a⏎b` | なし | なし |
| ENC-033 | ENC | 基本 | `selection-manipulator.nato.encode` | Text to NATO Phonetic Alphabet | 英数字を NATO フォネティックコードに変換する（英字は大小文字不問で ASCII のみ。トークンは空白 1 つで連結し、行内の空白の連続は / 1 つ、その他の文字はそのまま 1 トークン。各行の前後の空白は捨て、改行は保持） | `ab1` → `Alfa Bravo One` | なし | なし |
| ENC-034 | ENC | 基本 | `selection-manipulator.data-uri.encode-text` | Encode as Data URI (text/plain) | テキストを Base64 の data URI（text/plain;charset=utf-8）にする（本文は標準 Base64）。孤立サロゲートを含む入力はエラー | `hi` → `data:text/plain;charset=utf-8;base64,aGk=` | なし | なし |
| ENC-035 | ENC | 派生:ENC-001 | `selection-manipulator.html.encode.replace` | Encode HTML Entities (Replace) | ENC-001 の出力先違いの版。同じ変換を行い、選択範囲をその場で置き換える | `<a href="x">` → `&lt;a href=&quot;x&quot;&gt;` | なし | なし |
| ENC-036 | ENC | 派生:ENC-002 | `selection-manipulator.html.decode.replace` | Decode HTML Entities (Replace) | ENC-002 の出力先違いの版。同じ変換を行い、選択範囲をその場で置き換える | `&lt;b&gt; &#12354;` → `<b> あ` | なし | なし |
| ENC-037 | ENC | 派生:ENC-004 | `selection-manipulator.unicode.escape.replace` | Escape Unicode (\\uXXXX) (Replace) | ENC-004 の出力先違いの版。同じ変換を行い、選択範囲をその場で置き換える | `あ😀` → `\u3042\ud83d\ude00` | なし | なし |
| ENC-038 | ENC | 派生:ENC-005 | `selection-manipulator.unicode.unescape.replace` | Unescape Unicode (\\uXXXX) (Replace) | ENC-005 の出力先違いの版。同じ変換を行い、選択範囲をその場で置き換える | `\u3042` → `あ` | なし | なし |
| ENC-039 | ENC | 派生:ENC-013 | `selection-manipulator.hex.encode.replace` | Encode Hex (UTF-8 Bytes) (Replace) | ENC-013 の出力先違いの版。同じ変換を行い、選択範囲をその場で置き換える | `abc` → `616263` | なし | なし |
| ENC-040 | ENC | 派生:ENC-014 | `selection-manipulator.hex.decode.replace` | Decode Hex (UTF-8 Bytes) (Replace) | ENC-014 の出力先違いの版。同じ変換を行い、選択範囲をその場で置き換える | `61 62 63` → `abc` | なし | なし |

### HASH

**ハッシュ・チェックサム（ローカル計算のみ）** — 基本機能 17 件・派生 3 件・小計 20 件

| ID | カテゴリ | 種別 | 提案コマンド ID | タイトル | 概要 | 入出力例 | 外部通信 | 新規依存 |
|---|---|---|---|---|---|---|---|---|
| HASH-001 | HASH | 基本 | `selection-manipulator.crypto.hash-sha224` | Create Hash (SHA-224) | node:crypto で SHA-224 ハッシュ（16 進）を計算する（新規エディタに選択テキストを見出しとして結果を出す。選択はトリムせず UTF-8 バイトで計算し、孤立サロゲートはエラー） | `abc` → `23097d223405d822…` | なし | なし |
| HASH-002 | HASH | 基本 | `selection-manipulator.crypto.hash-sha384` | Create Hash (SHA-384) | node:crypto で SHA-384 ハッシュを計算する | `abc` → `cb00753f45a35e8b…` | なし | なし |
| HASH-003 | HASH | 基本 | `selection-manipulator.crypto.hash-sha3-256` | Create Hash (SHA3-256) | SHA3-256 ハッシュを計算する（VS Code の Electron の node:crypto が SHA-3 に対応していないため、FIPS 202 に沿って自前実装する） | `abc` → `3a985da74fe225b2…` | なし | なし |
| HASH-004 | HASH | 基本 | `selection-manipulator.crypto.hash-sha3-512` | Create Hash (SHA3-512) | SHA3-512 ハッシュを計算する（VS Code の Electron の node:crypto が SHA-3 に対応していないため、FIPS 202 に沿って自前実装する） | `abc` → `b751850b1a57168a…` | なし | なし |
| HASH-005 | HASH | 基本 | `selection-manipulator.crypto.hash-sha512-256` | Create Hash (SHA-512/256) | node:crypto で SHA-512/256 ハッシュを計算する | `abc` → `53048e2681941ef9…` | なし | なし |
| HASH-006 | HASH | 基本 | `selection-manipulator.crypto.hash-blake2b512` | Create Hash (BLAKE2b-512) | BLAKE2b-512 ハッシュを計算する（VS Code の Electron の node:crypto が BLAKE2 に対応していないため、RFC 7693 に沿って自前実装する） | `abc` → `ba80a53f981c4d0d…` | なし | なし |
| HASH-007 | HASH | 基本 | `selection-manipulator.crypto.hash-blake2s256` | Create Hash (BLAKE2s-256) | BLAKE2s-256 ハッシュを計算する（VS Code の Electron の node:crypto が BLAKE2 に対応していないため、RFC 7693 に沿って自前実装する） | `abc` → `508c5e8c327c14e2…` | なし | なし |
| HASH-008 | HASH | 基本 | `selection-manipulator.crypto.hmac-sha1` | Create HMAC (SHA-1) | 入力した鍵で HMAC-SHA1 を計算する（既存システムとの互換確認用。新規設計には SHA-256 以上を推奨と README に注記。鍵はパスワード入力で 1 回だけ受け取り、キャンセル時は何もしない。空の鍵と孤立サロゲートを含む鍵は受け付けない。鍵は保存・表示しない） | `abc（鍵: key）` → `4fd0b215276ef12f…` | なし | なし |
| HASH-009 | HASH | 基本 | `selection-manipulator.crypto.hmac-sha384` | Create HMAC (SHA-384) | 入力した鍵で HMAC-SHA384 を計算する（鍵の扱いは HASH-008 と同じ） | `abc（鍵: key）` → `30ddb9c8f347cffb…` | なし | なし |
| HASH-010 | HASH | 基本 | `selection-manipulator.crypto.hmac-sha3-256` | Create HMAC (SHA3-256) | 入力した鍵で HMAC-SHA3-256 を計算する（HMAC-SHA3-256 は自前実装の SHA3-256 を使う。ブロック長 136 バイト。鍵の扱いは HASH-008 と同じ） | `abc（鍵: key）` → `09b6dbab8d11795c…` | なし | なし |
| HASH-011 | HASH | 基本 | `selection-manipulator.checksum.crc32` | Checksum: CRC-32 | CRC-32（IEEE）を計算する。改ざん検知ではなく誤り検出用（自前実装。Node 20.10 の zlib には crc32 がないため。16 進小文字 8 桁） | `hello` → `3610a686` | なし | なし |
| HASH-012 | HASH | 基本 | `selection-manipulator.checksum.adler32` | Checksum: Adler-32 | Adler-32 を計算する（改ざん検知ではなく誤り検出用、自前実装。16 進小文字 8 桁） | `hello` → `062c0215` | なし | なし |
| HASH-013 | HASH | 基本 | `selection-manipulator.checksum.fnv1a-32` | Checksum: FNV-1a 32-bit | FNV-1a（32 ビット）ハッシュを計算する（非暗号用途で改ざん検知には使えない、自前実装。16 進小文字 8 桁） | `hello` → `4f9f2cab` | なし | なし |
| HASH-014 | HASH | 基本 | `selection-manipulator.crypto.hash-sha256-base64` | Create Hash (SHA-256, Base64) | SHA-256 を Base64 で出力する（CSP のハッシュ値などに使う） | `abc` → `ungWv48Bz+pBQUDeXa4iI7ADYaOWF3qctBD/YfIAFa0=` | なし | なし |
| HASH-015 | HASH | 基本 | `selection-manipulator.crypto.sri-sha384` | Create SRI Hash (sha384) | Subresource Integrity の integrity 属性値（sha384-Base64）を作る | `abc` → `sha384-ywB1P0WjXou1oD1pmsZQBycs…` | なし | なし |
| HASH-016 | HASH | 基本 | `selection-manipulator.crypto.hash-sha256-each-line` | Create Hash per Line (SHA-256) | 各行を個別に SHA-256 でハッシュする（行区切り LF・CRLF・CR をそのまま保ち、空行は空のまま残す。見出しなしの新規エディタに出し、複数選択は文書の改行コードで連結する。出力は全選択で 10,000,000 文字まで） | `a⏎b` → `ca978112…⏎3e23e816…` | なし | なし |
| HASH-017 | HASH | 基本 | `selection-manipulator.checksum.luhn` | Checksum: Luhn Validate | Luhn アルゴリズムで数字列のチェックディジットを検証し、結果を通知する（ダミー番号で確認。選択範囲は変えず、番号は通知に出さない。前後の空白・改行は無視し、数字と数字の間に 1 個だけ置いた半角スペースまたはハイフンを区切りとして無視する。先頭・末尾のハイフン、連続した区切り、+ などその他の文字は not a number、数字が 2 桁未満も not a number。選択 1 件は理由付き、2〜10 件は番号付きで理由なし、11 件以上は件数の要約で通知する） | `79927398713` → `valid（通知）` | なし | なし |
| HASH-018 | HASH | 派生:HASH-002 | `selection-manipulator.crypto.hash-sha384.replace` | Create Hash (SHA-384) (Replace) | HASH-002 の出力先違いの版。同じ変換を行い、選択範囲をその場で置き換える | `abc` → `cb00753f45a35e8b…` | なし | なし |
| HASH-019 | HASH | 派生:HASH-003 | `selection-manipulator.crypto.hash-sha3-256.replace` | Create Hash (SHA3-256) (Replace) | HASH-003 の出力先違いの版。同じ変換を行い、選択範囲をその場で置き換える | `abc` → `3a985da74fe225b2…` | なし | なし |
| HASH-020 | HASH | 派生:HASH-006 | `selection-manipulator.crypto.hash-blake2b512.replace` | Create Hash (BLAKE2b-512) (Replace) | HASH-006 の出力先違いの版。同じ変換を行い、選択範囲をその場で置き換える | `abc` → `ba80a53f981c4d0d…` | なし | なし |

### DATA

**データ形式変換（JSON / YAML / TOML / INI / Query String など）** — 基本機能 33 件・派生 7 件・小計 40 件

| ID | カテゴリ | 種別 | 提案コマンド ID | タイトル | 概要 | 入出力例 | 外部通信 | 新規依存 |
|---|---|---|---|---|---|---|---|---|
| DATA-001 | DATA | 基本 | `selection-manipulator.json.sort-keys` | Sort JSON Keys | オブジェクトのキーを再帰的に昇順（UTF-16 コード単位順）に並べ替える。配列の順序は保つ。JSON→JSON の変換は入力の書式を保つ（1 行の選択は 1 行、複数行は 2 スペースインデント。DATA-011 / 022 / 023 / 024 / 033 / 034 も同じ）。整数に見えるキーは JavaScript の仕様で常に先頭に数値順で並ぶ | `{"b":1,"a":{"d":2,"c":3}}` → `{"a":{"c":3,"d":2},"b":1}` | なし | なし |
| DATA-002 | DATA | 基本 | `selection-manipulator.json.to-query-string` | Convert JSON to Query String | フラットな JSON オブジェクトを URL クエリ文字列にする（URLSearchParams を使用。値の配列は同じキーを繰り返し、null は空値、入れ子のオブジェクトはエラー） | `{"a":1,"b":"x y"}` → `a=1&b=x+y` | なし | なし |
| DATA-003 | DATA | 基本 | `selection-manipulator.json.to-env` | Convert JSON to Env | フラットな JSON を KEY=VALUE 形式の .env にする（既存 Env to JSON の逆。キーは英数字・_・.・- のみ。空白・#・=・引用符を含む値は "…"（" を含めば '…'）で囲み、$・バッククォート・\ を含む値はシェル・Docker Compose・dotenv で展開されないよう必ず単一引用符で囲む。それらと ' を両方含む値、改行を含む値、入れ子はエラー。null は空値） | `{"A":"1","B":"x y"}` → `A=1⏎B="x y"` | なし | なし |
| DATA-004 | DATA | 基本 | `selection-manipulator.json.to-xml` | Convert JSON to XML | JSON を XML に変換し、既存の xml-formatter で整形する（自前変換。キーが 1 つのオブジェクトはそのキーをルートに、それ以外は `<root>` で包む。配列は同名要素の繰り返し（配列の中の配列は `<item>`）、null は空要素、空配列は要素を出さない。要素名は ASCII 英数字・_・.・- に限り（先頭は英字か _、xml で始まらない）、非 ASCII・空白・記号を含むキーはエラー。xml-formatter が内部の XML パーサでそれ以外の名前を受け付けないため） | `{"a":{"b":1}}` → `<a>⏎··<b>1</b>⏎</a>` | なし | なし |
| DATA-005 | DATA | 基本 | `selection-manipulator.json.to-toml` | Convert JSON to TOML | JSON を TOML に変換する（自前実装。値を先に、テーブルは `[a.b]`、オブジェクトの配列は `[[a]]` で出し、直接の値を持たないテーブルはヘッダを省略する。null はエラー、±(2^53−1) を超える整数は .0 付きの浮動小数で出す） | `{"a":{"b":1}}` → `[a]⏎b = 1` | なし | なし |
| DATA-006 | DATA | 基本 | `selection-manipulator.toml.to-json` | Convert TOML to JSON | TOML を JSON に変換する。新規依存を追加せず、TOML 1.0 の主要構文を扱う自前サブセットパーサで実装する（eval 不使用・入力 5,000,000 文字まで。コメント、裸 / 引用符 / ドット付きキー、`[table]`・`[[array]]`、インラインテーブル、複数行配列、4 種の文字列と行末 `\`、10 / 16 / 8 / 2 進整数と `_`、浮動小数、真偽値、4 種の日時（書かれたとおりの文字列で出力）に対応。キー・テーブルの重複、インラインテーブル / 静的配列の拡張、`[x]` と `[[x]]` の混用、ヘッダで作られたテーブルを親のドット付きキーで拡張することはエラー。inf / nan・±(2^53−1) を超える整数は未対応でエラー、日付は書式と範囲のみ検査し暦としての妥当性は見ない。エラーは「line L: 理由」で通知） | `[a]⏎b = 1` → `{"a":{"b":1}}` | なし | なし |
| DATA-007 | DATA | 基本 | `selection-manipulator.json.to-ini` | Convert JSON to INI | 2 階層までの JSON を INI 形式にする（最上位の値を先に、オブジェクトを [section] にする。3 階層目・配列・改行を含む値、= [ ] ; # などを含むキーはエラー。前後に空白がある値・; # を含む値・全体が引用符で囲まれた値は "…" で囲み、DATA-008 で読み戻せる） | `{"db":{"host":"x"}}` → `[db]⏎host=x` | なし | なし |
| DATA-008 | DATA | 基本 | `selection-manipulator.ini.to-json` | Convert INI to JSON | INI 形式（セクション・キー・コメント）を JSON にする（自前実装。= または : で分割し、; と # の行はコメント。最初のセクションより前のキーは最上位、値は文字列で全体を囲む引用符は外す。重複キーは後勝ち、同名セクションはマージ、解釈できない行はエラー） | `[db]⏎host=x` → `{"db":{"host":"x"}}` | なし | なし |
| DATA-009 | DATA | 基本 | `selection-manipulator.json.to-properties` | Convert JSON to .properties | ネストした JSON をドット区切りキーの Java .properties 形式にする（配列は name[n]。キーの空白・: = # !、値の先頭空白、\・制御文字をエスケープし、非 ASCII はそのまま（UTF-8 前提）。空オブジェクト / 空配列は出力しないが、配列の要素が空オブジェクト / 空配列の場合は読み戻すと添字がずれるためエラー。キーに . [ ] を含む JSON はエラー） | `{"a":{"b":1}}` → `a.b=1` | なし | なし |
| DATA-010 | DATA | 基本 | `selection-manipulator.properties.to-json` | Convert .properties to JSON | Java .properties 形式をネストした JSON にする（# / ! コメント、= / : / 空白の区切り、行継続、エスケープに対応。name[n] は配列の添字で、既存の長さを超える添字（要素の飛び越し）と、値と親の両方に使われるキーはエラー。値は文字列） | `a.b=1` → `{"a":{"b":"1"}}` | なし | なし |
| DATA-011 | DATA | 基本 | `selection-manipulator.json.remove-nulls` | Remove Null Values from JSON | 値が null のキーと配列要素を再帰的に取り除く（結果として空になったオブジェクト / 配列は残す） | `{"a":null,"b":[1,null]}` → `{"b":[1]}` | なし | なし |
| DATA-012 | DATA | 基本 | `selection-manipulator.json.to-jsonl` | Convert JSON Array to JSON Lines | JSON 配列を 1 行 1 要素の JSON Lines にする | `[{"a":1},{"a":2}]` → `{"a":1}⏎{"a":2}` | なし | なし |
| DATA-013 | DATA | 基本 | `selection-manipulator.jsonl.to-json` | Convert JSON Lines to JSON Array | JSON Lines を 1 つの JSON 配列にする（空行は無視。誤りは「line L, column C: 理由」で通知） | `{"a":1}⏎{"a":2}` → `[{"a":1},{"a":2}]` | なし | なし |
| DATA-014 | DATA | 基本 | `selection-manipulator.jsonc.to-json` | Convert JSONC / JSON5 to JSON | コメント・末尾カンマ・引用符なしキーを含む JSON を標準 JSON にする（自前パーサ。eval は使わない。単一引用符文字列・数値キー・行継続・16 進数・先頭 / 末尾の小数点・+ 符号にも対応。Infinity / NaN / undefined / 識別子の値 / 関数 / 計算プロパティはエラー） | `{a: 1, // c⏎}` → `{"a":1}` | なし | なし |
| DATA-015 | DATA | 基本 | `selection-manipulator.json.get-path` | Extract JSON Value by Path | 入力したパス（a.b\[0\] 形式）の値を取り出す（パスは $・.name・[n]・["任意のキー"] の表記で、$ は省略可。1,000 文字まで。文字列は引用符なしで出し、見つからなければエラー。入力ボックスのキャンセルで何もしない） | `{"a":{"b":[5]}}（a.b[0]）` → `5` | なし | なし |
| DATA-016 | DATA | 基本 | `selection-manipulator.json.list-paths` | List JSON Paths | すべての葉の値へのパスを 1 行ずつ列挙する（葉はスカラー・空オブジェクト・空配列。識別子にならないキーは ["…"]、ルートがスカラーなら $。出力はそのまま DATA-015 に入力できる） | `{"a":{"b":1},"c":[2]}` → `a.b⏎c[0]` | なし | なし |
| DATA-017 | DATA | 基本 | `selection-manipulator.json.keys` | Extract JSON Keys | 最上位のキーを 1 行ずつ取り出す（最上位がオブジェクトでなければエラー） | `{"a":1,"b":2}` → `a⏎b` | なし | なし |
| DATA-018 | DATA | 基本 | `selection-manipulator.json.merge-selections` | Merge JSON Objects (Selections) | 複数選択した JSON オブジェクトを深くマージする（後勝ち。配列は置き換え。文書順にマージして新規エディタ 1 つに出す。空でない選択が 2 つ未満なら警告のみ） | `[{"a":1}] [{"b":2}]` → `{"a":1,"b":2}` | なし | なし |
| DATA-019 | DATA | 基本 | `selection-manipulator.json.validate` | Validate JSON | JSON として正しいかを検査し、誤りがあれば行・列を通知して該当位置を選択する（RFC 8259 の厳密な検査。通知は「Valid JSON」（複数選択は「Valid JSON (n selections)」）または「Invalid JSON at line L, column C: 理由」で、行・列は文書上の位置。誤りの 1 文字を選択し、入力が途中で終わる場合は選択範囲の末尾にカーソルを置く） | `{"a":1,}` → `1 行 8 列目でエラー（通知）` | なし | なし |
| DATA-020 | DATA | 基本 | `selection-manipulator.yaml.format` | Format YAML | YAML を既存の js-yaml で読み込み、インデントを揃えて出力し直す（YAML 1.2 Core スキーマで読み書きし、日時などの値は書き換えない。`<<` は通常のキーのまま、アンカー / エイリアスは参照のまま（名前は `&ref_0` に付け直す）。末尾の改行は選択に合わせる。コメントは失われ、数値表記の 10 進化・null / 真偽値の表記と引用符の付け直しが起こる。整数に見えるキーは引用符付きの文字列キーになり先頭に数値順で並ぶ。Core スキーマにないタグ・複数ドキュメント・コメントだけの選択はエラー。入れ子は js-yaml の上限 100 段、アンカー / エイリアスを含む場合は「マッピングとシーケンスの数 × それらへの参照の数」が 300,000,000 まで） | `a:   {b: 1}` → `a:⏎··b: 1` | なし | なし |
| DATA-021 | DATA | 基本 | `selection-manipulator.yaml.sort-keys` | Sort YAML Keys | YAML のキーを再帰的に昇順に並べ替える（js-yaml の sortKeys を使用。スキーマ・書式・末尾改行・制限は DATA-020 と同じ） | `b: 1⏎a: 2` → `a: 2⏎b: 1` | なし | なし |
| DATA-022 | DATA | 基本 | `selection-manipulator.json.array-unique` | Remove Duplicates in JSON Array | JSON 配列の重複要素を取り除く（オブジェクトは内容で比較し、キーの順序は区別しない。最初の出現を残す） | `[1,2,1,{"a":1},{"a":1}]` → `[1,2,{"a":1}]` | なし | なし |
| DATA-023 | DATA | 基本 | `selection-manipulator.json.pluck` | Pluck Field from JSON Array | オブジェクト配列から入力したフィールドの値だけを取り出す（フィールドは DATA-015 と同じパス表記。値のない要素は null にして位置を保つ） | `[{"id":1},{"id":2}]（id）` → `[1,2]` | なし | なし |
| DATA-024 | DATA | 基本 | `selection-manipulator.json.group-by` | Group JSON Array by Field | オブジェクト配列を入力したフィールドの値でグループ化する（グループ名は文字列ならそのまま、それ以外は JSON 表記なので 1 と "1" は同じグループになる。グループは初出順。フィールドがない要素と、値がオブジェクト / 配列の要素はエラー） | `[{"t":"a","v":1},{"t":"a","v":2}]（t）` → `{"a":[{"t":"a","v":1},{"t":"a","v":2}]}` | なし | なし |
| DATA-025 | DATA | 基本 | `selection-manipulator.json.count` | Count JSON Elements | 配列の要素数・オブジェクトのキー数・全体のノード数を通知表示する（通知は「3 elements (4 nodes in total)」の形。オブジェクトは keys、スカラーは 1 value。複数選択は「Selection 1: …; Selection 2: …」） | `[1,2,3]` → `3 elements（通知）` | なし | なし |
| DATA-026 | DATA | 基本 | `selection-manipulator.json.to-schema` | Generate JSON Schema from JSON | サンプル JSON から JSON Schema（draft 2020-12）の雛形を作る（$schema・type・properties・required（サンプルのキー）、配列の items（要素のスキーマが複数なら anyOf、空配列は {}）、整数は integer。$schema の URL は文字列として出すだけで通信しない） | `{"a":1}` → `{"$schema":"https://json-schema.org/draft/2020-12/schema","type":"object","properties":{"a":{"type":"integer"}},"required":["a"]}` | なし | なし |
| DATA-027 | DATA | 基本 | `selection-manipulator.json.to-js-object` | Convert JSON to JS Object Literal | キーの引用符を必要な場合だけ残す JavaScript のオブジェクトリテラル表記にする（文字列は単一引用符。1 行の入力は 1 行、複数行は 2 スペースインデント。キー `__proto__` は `['__proto__']` と出力する） | `{"a":1,"b-c":2}` → `{ a: 1, 'b-c': 2 }` | なし | なし |
| DATA-028 | DATA | 基本 | `selection-manipulator.js-object.to-json` | Convert JS Object Literal to JSON | JavaScript のオブジェクトリテラル（リテラル値のみ）を JSON にする（自前パーサ。eval / new Function は使わない。DATA-014 の構文に加え、`${` を含まないテンプレートリテラル・数値の `_` 区切り・`0o` / `0b`・`\u{…}`、文字列リテラル 1 つだけの計算プロパティ名（`['__proto__']` など）を受け付ける。それ以外の計算プロパティ・関数・識別子の値・スプレッド・`${}`・BigInt はエラー） | `{ a: 1, 'b': [true] }` → `{"a":1,"b":[true]}` | なし | なし |
| DATA-029 | DATA | 基本 | `selection-manipulator.cookie.to-json` | Parse Cookie Header to JSON | Cookie ヘッダーの値を JSON オブジェクトにする（先頭の Cookie: は除く。値はデコードせず、同名は値の配列にまとめる） | `a=1; b=x` → `{"a":"1","b":"x"}` | なし | なし |
| DATA-030 | DATA | 基本 | `selection-manipulator.set-cookie.to-json` | Parse Set-Cookie to JSON | Set-Cookie の値を名前・値・属性（Path, Secure など）の JSON にする（属性名は大小無視。Max-Age は整数なら数値。未知の属性は小文字のキーで、name / value と衝突する属性はエラー。複数行は 1 行 1 Cookie の配列） | `id=1; Path=/; Secure` → `{"name":"id","value":"1","path":"/","secure":true}` | なし | なし |
| DATA-031 | DATA | 基本 | `selection-manipulator.http-headers.to-json` | Parse HTTP Headers to JSON | 「名前: 値」形式の HTTP ヘッダー行を JSON にする（先頭のリクエスト行 / ステータス行と空行は読み飛ばし、行頭が空白の継続行は直前の値に連結。同名（大小無視）は値の配列。: のない行はエラー） | `Accept: a⏎X-Id: 1` → `{"Accept":"a","X-Id":"1"}` | なし | なし |
| DATA-032 | DATA | 基本 | `selection-manipulator.user-agent.to-json` | Parse User-Agent to JSON | User-Agent 文字列からブラウザ・OS・バージョンを簡易に判別して JSON にする（規則は内蔵。ブラウザは主要バージョンのみ、判別できなければ Unknown。Windows 11 は Windows 10 と区別できない。1 行 2,000 文字まで、複数行は 1 行 1 件の配列） | `Mozilla/5.0 (Windows NT 10.0…) Chrome/120.0` → `{"browser":"Chrome 120","os":"Windows 10"}` | なし | なし |
| DATA-033 | DATA | 基本 | `selection-manipulator.json.parse-nested` | Parse Nested JSON Strings | 値が JSON 文字列になっている箇所を再帰的にオブジェクトへ展開する（{ か [ で始まる文字列だけを展開し、"123" や "true" は文字列のまま。展開後の深さも 500 段まで） | `{"a":"{\"b\":1}"}` → `{"a":{"b":1}}` | なし | なし |
| DATA-034 | DATA | 派生:DATA-001 | `selection-manipulator.json.sort-keys.replace` | Sort JSON Keys (Replace) | DATA-001 の出力先違いの版。同じ変換を行い、選択範囲をその場で置き換える | `{"b":1,"a":{"d":2,"c":3}}` → `{"a":{"c":3,"d":2},"b":1}` | なし | なし |
| DATA-035 | DATA | 派生:DATA-004 | `selection-manipulator.json.to-xml.replace` | Convert JSON to XML (Replace) | DATA-004 の出力先違いの版。同じ変換を行い、選択範囲をその場で置き換える | `{"a":{"b":1}}` → `<a>⏎··<b>1</b>⏎</a>` | なし | なし |
| DATA-036 | DATA | 派生:DATA-005 | `selection-manipulator.json.to-toml.replace` | Convert JSON to TOML (Replace) | DATA-005 の出力先違いの版。同じ変換を行い、選択範囲をその場で置き換える | `{"a":{"b":1}}` → `[a]⏎b = 1` | なし | なし |
| DATA-037 | DATA | 派生:DATA-006 | `selection-manipulator.toml.to-json.replace` | Convert TOML to JSON (Replace) | DATA-006 の出力先違いの版。同じ変換を行い、選択範囲をその場で置き換える | `[a]⏎b = 1` → `{"a":{"b":1}}` | なし | なし |
| DATA-038 | DATA | 派生:DATA-012 | `selection-manipulator.json.to-jsonl.replace` | Convert JSON Array to JSON Lines (Replace) | DATA-012 の出力先違いの版。同じ変換を行い、選択範囲をその場で置き換える | `[{"a":1},{"a":2}]` → `{"a":1}⏎{"a":2}` | なし | なし |
| DATA-039 | DATA | 派生:DATA-013 | `selection-manipulator.jsonl.to-json.replace` | Convert JSON Lines to JSON Array (Replace) | DATA-013 の出力先違いの版。同じ変換を行い、選択範囲をその場で置き換える | `{"a":1}⏎{"a":2}` → `[{"a":1},{"a":2}]` | なし | なし |
| DATA-040 | DATA | 派生:DATA-020 | `selection-manipulator.yaml.format.replace` | Format YAML (Replace) | DATA-020 の出力先違いの版。同じ変換を行い、選択範囲をその場で置き換える | `a:   {b: 1}` → `a:⏎··b: 1` | なし | なし |

### TABLE

**CSV / TSV / 表操作（列抽出・転置・整列）** — 基本機能 25 件・派生 5 件・小計 30 件

| ID | カテゴリ | 種別 | 提案コマンド ID | タイトル | 概要 | 入出力例 | 外部通信 | 新規依存 |
|---|---|---|---|---|---|---|---|---|
| TABLE-001 | TABLE | 基本 | `selection-manipulator.csv.to-json` | CSV - Convert to JSON Array | 1 行目をヘッダーとして CSV をオブジェクトの配列にする（RFC 4180 の引用符に対応。30 コマンドで共有する自前パーサ: `""`・引用符内の区切り文字と改行・CRLF / LF / CR、BOM の除去、空行の読み飛ばし、閉じ引用符の後の空白 / タブは読み飛ばし、それ以外の文字と未閉鎖の引用符は「line L: 理由」のエラー。値は常に文字列、出力は 2 スペースインデントの JSON（例は値として同じ）。見出しより長い行はエラー、短い行の不足は空文字列、見出しの重複はエラー、`__proto__` も通常のキー。見出しだけなら `[]`。全コマンド共通: 0 レコードの選択は `no rows found` のエラー、選択範囲が改行で終わるときだけ結果も改行 1 つで終わる、入力 5,000,000 文字・格子（行数 × 最大列数）10,000,000 セル・出力 10,000,000 文字（全選択で共有）の上限、失敗時は何も変更しない） | `a,b⏎1,2` → `[{"a":"1","b":"2"}]` | なし | なし |
| TABLE-002 | TABLE | 基本 | `selection-manipulator.csv.from-json` | CSV - Convert from JSON Array | オブジェクトの配列を CSV にする（キーの和集合を初出順でヘッダーにする。各オブジェクトの中では整数に見えるキー（`"0"`・`"10"`）が数値順で先に来る（JavaScript のオブジェクトのキー順）が、ヘッダーはその順序のまま初出順に並ぶため、ヘッダーの先頭に来るとは限らない（`[{"b":1},{"0":2,"10":3}]` → ヘッダー `b,0,10`、`[{"b":1,"0":2}]` → ヘッダー `0,b`）。文字列はそのまま、数値・真偽値は JSON 表記、null と欠けたキーは空セル、入れ子はコンパクトな JSON テキスト。入れ子は 500 段まで。要素がオブジェクトでない・空配列・すべての要素がキーを持たない（`the objects have no keys`）・範囲外の数値（`1e400`、入れ子の中も。`element N: a number is out of range`）はエラー。大きな整数は精度が落ち、`1e-400` は 0 になる） | `[{"a":1,"b":2}]` → `a,b⏎1,2` | なし | なし |
| TABLE-003 | TABLE | 基本 | `selection-manipulator.csv.to-tsv` | CSV - Convert to TSV | CSV をタブ区切りにする（タブ・`"`・改行を含むセルは引用符で囲む） | `a,b⏎1,2` → `a⇥b⏎1⇥2` | なし | なし |
| TABLE-004 | TABLE | 基本 | `selection-manipulator.csv.from-tsv` | CSV - Convert from TSV | タブ区切り（Excel からの貼り付けなど。引用符付きセルも可）を CSV にする | `a⇥b⏎1⇥2` → `a,b⏎1,2` | なし | なし |
| TABLE-005 | TABLE | 基本 | `selection-manipulator.csv.transpose` | CSV - Transpose | 行と列を入れ替える（不揃いな行は空セルで埋めてから転置する） | `a,b⏎1,2` → `a,1⏎b,2` | なし | なし |
| TABLE-006 | TABLE | 基本 | `selection-manipulator.csv.extract-column` | CSV - Extract Column | 入力した番号（または見出し名）の列だけを見出し行を含めて取り出す（全コマンド共通の列指定: 数字だけの入力は前後の空白を除いて 1 始まりの列番号、それ以外は見出しのセルとの完全一致（大文字小文字を区別し、入力は trim しない）。範囲外・該当なし・複数の列に一致はエラー。入力ボックスは 1,000 文字まで・制御文字不可で、キャンセルなら何もしない） | `a,b⏎1,2（列 2）` → `b⏎2` | なし | なし |
| TABLE-007 | TABLE | 基本 | `selection-manipulator.csv.remove-column` | CSV - Remove Column | 入力した番号（または見出し名）の列を取り除く（列が 1 つしかない表はエラー。その列を持たない短い行はそのまま） | `a,b,c⏎1,2,3（列 2）` → `a,c⏎1,3` | なし | なし |
| TABLE-008 | TABLE | 基本 | `selection-manipulator.csv.swap-columns` | CSV - Swap Columns | 入力した 2 つの列を入れ替える（入力ボックスを 2 回出し、どちらかのキャンセルで何もしない。同じ列の指定はエラー。不揃いな行は空セルで埋めてから入れ替える） | `a,b⏎1,2（1, 2）` → `b,a⏎2,1` | なし | なし |
| TABLE-009 | TABLE | 基本 | `selection-manipulator.csv.align-columns` | CSV - Align Columns | 各列の幅を揃えるように空白を入れて見やすくする（行の最後以外のセルの後ろに、書き出した形（引用符込み）で最も幅の広いセルまで空白を足す。幅はコードポイント数。引用符内の改行を含むセルでは見た目が揃わない。出力長は事前に見積もる） | `a,bb⏎ccc,d` → `a··,bb⏎ccc,d` | なし | なし |
| TABLE-010 | TABLE | 基本 | `selection-manipulator.csv.trim-cells` | CSV - Trim Cell Padding | 各セルの前後のスペース / タブを取り除く（Align Columns の逆） | `a··,bb⏎ccc,d` → `a,bb⏎ccc,d` | なし | なし |
| TABLE-011 | TABLE | 基本 | `selection-manipulator.csv.to-html-table` | CSV - Convert to HTML Table | CSV を HTML の table 要素にする（セル内容は `& < > " '` を HTML エスケープする。1 行目は `<th>`、以降は `<td>`。出力は 1 行 1 `<tr>` の 2 スペースインデント: `<table>⏎··<tr><th>a</th><th>b</th></tr>⏎··<tr><td>1</td><td>2</td></tr>⏎</table>`。不揃いな行は空セルで埋める） | `a,b⏎1,2` → `<table><tr><th>a</th>…</table>` | なし | なし |
| TABLE-012 | TABLE | 基本 | `selection-manipulator.csv.to-sql-insert` | CSV - Convert to SQL INSERT | 1 行目を列名として INSERT 文を生成する（文字列はエスケープ。SQL は生成するだけで実行しない。標準 SQL で書く: 値はすべて `'` を二重化した文字列リテラル（空セルは `''`、NULL にしない）、表名・列名は `^[A-Za-z_][A-Za-z0-9_]*$`（表名は `.` 区切りの各部分がこれに一致する `schema.table` も可）ならそのまま、それ以外は `"` で囲み `"` を二重化。MySQL / MariaDB の既定モードでは `\` がエスケープとして解釈され安全にできないため、値・列名・表名に `\` を含むとエラー（Windows のパスなども対象）。MySQL で引用付き識別子を使うには ANSI_QUOTES が必要。制御文字（タブ・改行を除く）・空の列名・見出しより長い行・データ行 0 件はエラー、短い行の不足は `''`） | `id,name⏎1,O'Neil（表名: users）` → `INSERT INTO users (id, name) VALUES ('1', 'O''Neil');` | なし | なし |
| TABLE-013 | TABLE | 基本 | `selection-manipulator.csv.dedupe-rows` | CSV - Remove Duplicate Rows | ヘッダーを残したまま重複行を取り除く（データ行の完全一致で最初の 1 行を残す。不揃いな行 `1` と `1,` は別の行） | `a⏎1⏎1` → `a⏎1` | なし | なし |
| TABLE-014 | TABLE | 基本 | `selection-manipulator.csv.filter-rows` | CSV - Filter Rows by Column Value | 入力した列の値が条件（一致・含む）に合う行だけを残す（列を入力 → QuickPick で `Equals` / `Contains` → 値を入力。いずれかのキャンセルで何もしない。大文字小文字を区別し、値は空でもよい。見出し行は常に残す） | `n,v⏎a,1⏎b,2（v = 2）` → `n,v⏎b,2` | なし | なし |
| TABLE-015 | TABLE | 基本 | `selection-manipulator.csv.sum-column` | CSV - Sum Column | 入力した列の数値の合計・平均を通知表示する（数値は前後の空白を除いた 10 進表記 `-1.5`・`.5`・`1e3`。空セルは無視し、非数値は ` (N non-numeric cells skipped)` を付ける（単数は `1 non-numeric cell skipped`）。浮動小数の範囲を超える数値（`1e400`）も非数値として数える。有効桁 15 桁に丸める。数値が 0 件（`no numeric cells in the column`）・合計が浮動小数の範囲外（`the sum is out of range`）は警告。選択範囲は変更しない） | `n,v⏎a,1⏎b,2（v）` → `sum=3, avg=1.5（通知）` | なし | なし |
| TABLE-016 | TABLE | 基本 | `selection-manipulator.csv.add-index` | CSV - Add Index Column | 先頭に `#` 列と 1 からの連番を追加する | `a⏎x⏎y` → `#,a⏎1,x⏎2,y` | なし | なし |
| TABLE-017 | TABLE | 基本 | `selection-manipulator.csv.change-delimiter` | CSV - Change Delimiter | 区切り文字を入力した文字（; や \| など）に変える（「1 文字」は Unicode のコードポイント 1 つ。タブは入力ボックスに直接入れられないため `\t`（2 文字）の表記でだけ指定する。空・2 文字以上・`"`・改行・その他の制御文字・対になっていないサロゲートはエラー。出力の引用符付けは新しい区切り文字で判断する） | `a,b（;）` → `a;b` | なし | なし |
| TABLE-018 | TABLE | 基本 | `selection-manipulator.csv.quote-all` | CSV - Quote All Fields | すべてのセルをダブルクォートで囲む（空セルも `""`） | `a,b` → `"a","b"` | なし | なし |
| TABLE-019 | TABLE | 基本 | `selection-manipulator.csv.unquote` | CSV - Remove Unnecessary Quotes | 区切り文字・改行・引用符を含まないセルの引用符を外す（CSV を出力する他のコマンドも同じ最小限の引用符付けで書き直す。セルのない行・空セル 1 つだけの行は、読み直すと空行として消えるため `""` と書く） | `"a","b,c"` → `a,"b,c"` | なし | なし |
| TABLE-020 | TABLE | 基本 | `selection-manipulator.csv.to-yaml` | CSV - Convert to YAML | 1 行目をヘッダーとして YAML の配列にする（js-yaml を使用。Core schema・noRefs・行幅無制限。値は文字列なので引用される。見出しの重複はエラー、見出しだけなら `[]`） | `a,b⏎1,2` → `- a: '1'⏎··b: '2'` | なし | なし |
| TABLE-021 | TABLE | 基本 | `selection-manipulator.csv.to-ascii-table` | CSV - Convert to ASCII Table | CSV を罫線付きの ASCII 表にする（幅はコードポイント数。セル内の改行とタブは空白 1 つにする（それ以外の制御文字はそのまま幅 1）。見出しだけなら罫線・見出し・罫線の 3 行。出力長は事前に見積もる） | `a,b⏎1,2` → `+---+---+⏎\| a \| b \|⏎+---+---+⏎\| 1 \| 2 \|⏎+---+---+` | なし | なし |
| TABLE-022 | TABLE | 基本 | `selection-manipulator.csv.from-whitespace` | CSV - Convert from Whitespace-separated Table | 連続した空白で区切られた表（コマンド出力など）を CSV にする（前後の空白を除いた各行を 1 つ以上のスペース / タブで分割する。引用符は解釈せず、値の中の空白でも分割される。空行は読み飛ばす） | `NAME···AGE⏎bob····30` → `NAME,AGE⏎bob,30` | なし | なし |
| TABLE-023 | TABLE | 基本 | `selection-manipulator.csv.info` | CSV - Show Row and Column Count | 行数・列数・列ごとの空セル数を通知表示する（データ行数（見出しを除く）× 最大列数。短い行で欠けたセルも空セルに数える。単数・複数を書き分ける（`1 row × 1 col`）。空セルがなければ `, no empty cells`。列名は見出し（空なら `column N`）を 60 文字に短縮し、最大 10 列まで挙げて残りは `…and N more`。選択範囲は変更しない） | `a,b⏎1,⏎2,3` → `2 rows × 2 cols, b: 1 empty（通知）` | なし | なし |
| TABLE-024 | TABLE | 基本 | `selection-manipulator.csv.fill-down` | CSV - Fill Empty Cells from Above | 空のセルを直上の行の値で埋める（全行をデータとして扱う。空白だけのセルは値とみなす。短い行は最大列数まで空セルとして補ってから埋める） | `a,1⏎,2` → `a,1⏎a,2` | なし | なし |
| TABLE-025 | TABLE | 基本 | `selection-manipulator.csv.to-records` | CSV - Convert Rows to Key-Value Records | 各行を「見出し: 値」の縦並びのレコードにする（レコードの間は空行 1 つ。見出しと値の中の改行は空白 1 つにし、1 行が必ず 1 組になる。見出しより長い行・データ行 0 件はエラー） | `a,b⏎1,2` → `a: 1⏎b: 2` | なし | なし |
| TABLE-026 | TABLE | 派生:TABLE-001 | `selection-manipulator.csv.to-json.replace` | CSV - Convert to JSON Array (Replace) | TABLE-001 の出力先違いの版。同じ変換を行い、選択範囲をその場で置き換える | `a,b⏎1,2` → `[{"a":"1","b":"2"}]` | なし | なし |
| TABLE-027 | TABLE | 派生:TABLE-002 | `selection-manipulator.csv.from-json.replace` | CSV - Convert from JSON Array (Replace) | TABLE-002 の出力先違いの版。同じ変換を行い、選択範囲をその場で置き換える | `[{"a":1,"b":2}]` → `a,b⏎1,2` | なし | なし |
| TABLE-028 | TABLE | 派生:TABLE-003 | `selection-manipulator.csv.to-tsv.replace` | CSV - Convert to TSV (Replace) | TABLE-003 の出力先違いの版。同じ変換を行い、選択範囲をその場で置き換える | `a,b⏎1,2` → `a⇥b⏎1⇥2` | なし | なし |
| TABLE-029 | TABLE | 派生:TABLE-005 | `selection-manipulator.csv.transpose.replace` | CSV - Transpose (Replace) | TABLE-005 の出力先違いの版。同じ変換を行い、選択範囲をその場で置き換える | `a,b⏎1,2` → `a,1⏎b,2` | なし | なし |
| TABLE-030 | TABLE | 派生:TABLE-011 | `selection-manipulator.csv.to-html-table.replace` | CSV - Convert to HTML Table (Replace) | TABLE-011 の出力先違いの版。同じ変換を行い、選択範囲をその場で置き換える | `a,b⏎1,2` → `<table><tr><th>a</th>…</table>` | なし | なし |

### NUM

**数値・計算・統計（中央値・標準偏差・丸め・進数変換・桁区切り）** — 基本機能 40 件・派生 0 件・小計 40 件

| ID | カテゴリ | 種別 | 提案コマンド ID | タイトル | 概要 | 入出力例 | 外部通信 | 新規依存 |
|---|---|---|---|---|---|---|---|---|
| NUM-001 | NUM | 基本 | `selection-manipulator.math.median` | Math - Median | 選択した数値の中央値を新しい読み取り専用エディターに開く（偶数個は中央 2 値の平均。NUM-001〜009 共通: 文書は変更せず、1 選択範囲 1 行（文書順・文書の改行コード）で出力する。既存の Sum / Average / Min / Max と違い選択範囲ごとに独立して集計する。数値は選択範囲中の 10 進表記のトークン（`-1.5`・`.5`・`1e3`）で、前が英数字・`_`・`.`・`+`・`-`、後ろが英数字・`_`・「`.`+数字」のものは数値にしない（`10px`・`a1`・`2026-09-29` の `09` / `29`・`1+2` の `2`）。カンマは区切りで `1,234` は 1 と 234。範囲外（`1e400`）はエラー。文字があるのに数値がない選択範囲は全体を中止して警告 `no numbers found`。空白だけの選択範囲はスキップされ結果行を出さないため、結果の行と選択範囲の対応がずれることがある。方針 A: 安全な整数はそのまま、それ以外は有効桁 15 桁で誤差を除く） | `1⏎3⏎2⏎10` → `2.5` | なし | なし |
| NUM-002 | NUM | 基本 | `selection-manipulator.math.mode` | Math - Mode | 最頻値を求める（同数の最頻値は昇順に `, ` 区切り（`1 2 2 3 3` → `2, 3`）。2 個以上ですべて 1 回ずつなら `every number appears once, so there is no mode` のエラー。1 個ならその値。方針 A） | `1⏎2⏎2⏎3` → `2` | なし | なし |
| NUM-003 | NUM | 基本 | `selection-manipulator.math.stddev` | Math - Standard Deviation | 母標準偏差と標本標準偏差を求める（小数点以下 4 桁に 0 から遠い方向へ四捨五入し末尾の 0 を削る（方針 B）。極小値は 0 になる（`1e-200⏎3e-200` → `σ=0, s=0`）。1 個なら `s=n/a`。途中の二乗では溢れない（`1e155⏎-1e155` → `σ=1e+155, …`）） | `2⏎4⏎4⏎4⏎5⏎5⏎7⏎9` → `σ=2, s=2.1381` | なし | なし |
| NUM-004 | NUM | 基本 | `selection-manipulator.math.variance` | Math - Variance | 母分散と標本分散を `母分散 / 標本分散` で求める（方針 B（小数 4 桁）。1 個なら `0 / n/a`。分散そのものが倍精度を超えると `the result is out of range`） | `1⏎2⏎3` → `0.6667 / 1` | なし | なし |
| NUM-005 | NUM | 基本 | `selection-manipulator.math.count` | Math - Count Numbers | 選択範囲に含まれる数値の個数を数える（数値のない選択範囲は警告にせず `0`） | `a 1 b 2.5` → `2` | なし | なし |
| NUM-006 | NUM | 基本 | `selection-manipulator.math.product` | Math - Product | 数値の積を求める（方針 A。倍精度を超えると `the result is out of range`） | `2⏎3⏎4` → `24` | なし | なし |
| NUM-007 | NUM | 基本 | `selection-manipulator.math.range` | Math - Range | 最大値と最小値の差を求める（方針 A） | `3⏎9⏎1` → `8` | なし | なし |
| NUM-008 | NUM | 基本 | `selection-manipulator.math.percentile` | Math - Percentile | 入力したパーセンタイル（0〜100、小数可）の値を線形補間で求める（Excel の PERCENTILE.INC・NumPy の既定と同じ。方針 A） | `1⏎2⏎3⏎4⏎5（90）` → `4.6` | なし | なし |
| NUM-009 | NUM | 基本 | `selection-manipulator.math.summary` | Math - Statistics Summary | 件数・合計・平均・最小・最大・中央値・標準偏差をまとめて出力する（`count=3, sum=6, mean=2, min=1, max=3, median=2, σ=0.8165, s=1`。mean / σ / s は方針 B、他は方針 A、1 個なら `s=n/a`） | `1⏎2⏎3` → `count=3, sum=6, mean=2, …` | なし | なし |
| NUM-010 | NUM | 基本 | `selection-manipulator.math.cumulative-sum` | Math - Cumulative Sum | 各行を累積和に置き換える（NUM-010〜040 共通: 選択範囲を置換し、各行は前後のスペース / タブを除いて数値 1 個であること（前後の空白・空行・LF / CRLF は保持）。1 行でも不正ならコマンド全体を中止し `line N: "…" is not a number` などを通知（引用は 60 文字に短縮）。特に断りがなければ数値は `[-+]?` 付きの 10 進表記で `Infinity`・`0x…`・桁区切り付きは不可。空行は加算しない。累積和が安全な整数の間は厳密、それ以外は方針 A（有効桁 15 桁）なので 2^53 を超えた値や小数の後の 16 桁目以降は丸められる（`9007199254740991⏎1` → 2 行目 `9007199254740990`）） | `1⏎2⏎3` → `1⏎3⏎6` | なし | なし |
| NUM-011 | NUM | 基本 | `selection-manipulator.number.round` | Number - Round | 数値を入力した小数点以下の桁数（0〜15 の整数）に四捨五入する（10 進表記の上で 0 から遠い方向に丸める: `1.005（2）` → `1.01`・`-2.5（0）` → `-3`。末尾の 0 は付けない） | `3.14159（2）` → `3.14` | なし | なし |
| NUM-012 | NUM | 基本 | `selection-manipulator.number.floor` | Number - Floor | 数値を小数点以下切り捨て（負方向）にする（NUM-012〜014 は結果の整数をそのまま出す。2^53 を超える値は倍精度の値どおり（`12345678901234567890` → `12345678901234567000`）、1e21 以上は `1e+21`、`-0` は `0`） | `-2.5⏎2.7` → `-3⏎2` | なし | なし |
| NUM-013 | NUM | 基本 | `selection-manipulator.number.ceil` | Number - Ceil | 数値を小数点以下切り上げにする（`-0.5` → `0`） | `2.1` → `3` | なし | なし |
| NUM-014 | NUM | 基本 | `selection-manipulator.number.truncate` | Number - Truncate | 数値の小数部を 0 方向に切り捨てる | `-2.7` → `-2` | なし | なし |
| NUM-015 | NUM | 基本 | `selection-manipulator.number.abs` | Number - Absolute Value | 数値を絶対値にする（文字列で先頭の `-` / `+` を外すだけで、数字部（先頭の 0・末尾の 0・指数部）は入力のまま: `-1.50` → `1.50`。ゼロは符号を外すだけ: `-0.00` → `0.00`） | `-5` → `5` | なし | なし |
| NUM-016 | NUM | 基本 | `selection-manipulator.number.negate` | Number - Negate | 数値の符号を反転する（文字列で `-` を外すか付ける（`+` は外して `-` を付ける）。数字部は入力のまま: `1.50` → `-1.50`・`007` → `-007`。ゼロには `-` を付けない: `-0.00` → `0.00`・`0e5` → `0e5`） | `5⏎-3` → `-5⏎3` | なし | なし |
| NUM-017 | NUM | 基本 | `selection-manipulator.number.add-separator` | Number - Add Thousands Separator | 3 桁ごとにカンマを入れる（`[-+]?\d+(\.\d+)?` か正しく区切られた入力（冪等）。指数表記は不可。整数部の先頭の 0 は取り除く（`-0012345` → `-12,345`・`000.5` → `0.5`）。`-000` は `-0` になる） | `1234567.89` → `1,234,567.89` | なし | なし |
| NUM-018 | NUM | 基本 | `selection-manipulator.number.remove-separator` | Number - Remove Thousands Separator | 桁区切りのカンマを取り除く（正しい区切り、または区切りなしのみ。`12,34` のような誤った区切りは `has misplaced thousands separators` のエラー） | `1,234,567` → `1234567` | なし | なし |
| NUM-019 | NUM | 基本 | `selection-manipulator.number.format-locale` | Number - Format by Locale | Intl.NumberFormat で入力したロケールの表記にする（ロケールは英数字と `-` の 35 文字以内で Intl が対応していること。`maximumFractionDigits: 20`。fr-FR の U+202F など区切り文字は実行環境の ICU の出力どおり。精度は倍精度の範囲） | `1234.5（de-DE）` → `1.234,5` | なし | なし |
| NUM-020 | NUM | 基本 | `selection-manipulator.number.to-hex` | Number - Decimal to Hex | 10 進数を 16 進数（0x 付き）にする（BigInt 対応。NUM-020 / 022 / 024 共通: 符号付き 10 進整数 1,000 桁まで、小文字、負数は `-0xff`、小数はエラー） | `255` → `0xff` | なし | なし |
| NUM-021 | NUM | 基本 | `selection-manipulator.number.from-hex` | Number - Hex to Decimal | 16 進数を 10 進数にする（NUM-021 / 023 / 025 共通: 接頭辞 `0x` / `0b` / `0o` はあってもなくてもよく、大文字小文字不問、符号可、数字部 1,000 桁まで、BigInt で変換） | `0xff` → `255` | なし | なし |
| NUM-022 | NUM | 基本 | `selection-manipulator.number.to-binary` | Number - Decimal to Binary | 10 進数を 2 進数にする（`0b` 付き） | `10` → `0b1010` | なし | なし |
| NUM-023 | NUM | 基本 | `selection-manipulator.number.from-binary` | Number - Binary to Decimal | 2 進数を 10 進数にする | `0b1010` → `10` | なし | なし |
| NUM-024 | NUM | 基本 | `selection-manipulator.number.to-octal` | Number - Decimal to Octal | 10 進数を 8 進数にする（`0o` 付き） | `8` → `0o10` | なし | なし |
| NUM-025 | NUM | 基本 | `selection-manipulator.number.from-octal` | Number - Octal to Decimal | 8 進数を 10 進数にする | `0o10` → `8` | なし | なし |
| NUM-026 | NUM | 基本 | `selection-manipulator.number.convert-base` | Number - Convert Base (2-36) | 入力した基数（2〜36）の間で整数を変換する（変換元・変換先の基数を順に入力。数字部は変換元基数の文字だけ（大文字小文字不問、接頭辞なし、符号可、1,000 桁まで）。BigInt で変換し小文字・先頭の 0 なしで出力） | `zz（36 → 10）` → `1295` | なし | なし |
| NUM-027 | NUM | 基本 | `selection-manipulator.number.to-scientific` | Number - To Scientific Notation | 数値を指数表記にする（誤差を除いた値の `toExponential()`。`0` → `0e+0`、16 桁の整数も NUM-028 で元に戻る） | `12300` → `1.23e+4` | なし | なし |
| NUM-028 | NUM | 基本 | `selection-manipulator.number.from-scientific` | Number - From Scientific Notation | 指数表記を通常の表記にする（`e` / `E` を含む入力のみ。指数の絶対値は 1,000 まで。文字列で小数点を移動し仮数の桁を保つ（`1.50e1` → `15.0`）） | `1.23e+4` → `12300` | なし | なし |
| NUM-029 | NUM | 基本 | `selection-manipulator.number.to-percent` | Number - To Percent | 小数を百分率の表記にする（指数表記は不可。文字列で小数点を 2 桁右へ移動し桁を保つ: `0.1250` → `12.50%`） | `0.125` → `12.5%` | なし | なし |
| NUM-030 | NUM | 基本 | `selection-manipulator.number.bytes-to-human` | Number - Bytes to Human Readable | バイト数を KiB / MiB などの読みやすい表記にする（0 以上の整数 30 桁まで。1024 未満は `512 B`、以上は KiB〜YiB で小数点以下最大 2 桁（末尾の 0 は削る）。丸めで 1024 に達したら次の単位（`1048575` → `1 MiB`）、YiB を超える値は YiB のまま（`1024 YiB`）） | `1536` → `1.5 KiB` | なし | なし |
| NUM-031 | NUM | 基本 | `selection-manipulator.number.human-to-bytes` | Number - Human Readable to Bytes | KB / MiB などの表記をバイト数にする（`<数値>[空白]<単位>`。単位は `B`、SI の KB〜YB（1000 の累乗）、IEC の KiB〜YiB（1024 の累乗）で大文字小文字不問。数値は非負で 30 桁まで。BigInt で正確に計算し端数は四捨五入。NUM-030 の出力はすべて読める） | `1.5 MiB` → `1572864` | なし | なし |
| NUM-032 | NUM | 基本 | `selection-manipulator.number.to-words-en` | Number - To English Words | 整数を英語の数詞にする（符号可、36 桁まで（decillion まで）。米国式で `and` なし、負数は `minus …`、0 は `zero`。小数はエラー） | `42` → `forty-two` | なし | なし |
| NUM-033 | NUM | 基本 | `selection-manipulator.number.ordinal-en` | Number - Add English Ordinal Suffix | 数値に英語の序数接尾辞を付ける（整数の末尾 2 桁で判定し 11〜13 は `th`。桁と符号はそのまま: `-1` → `-1st`・`0` → `0th`） | `1⏎2⏎11` → `1st⏎2nd⏎11th` | なし | なし |
| NUM-034 | NUM | 基本 | `selection-manipulator.number.to-fraction` | Number - Decimal to Fraction | 小数を既約分数にする（循環小数は近似。指数表記は不可、数字 30 桁まで。有限小数は正確に約分する（`0.1` → `1/10`・`0.500000` → `1/2`）。近似は小数 6 桁以上のときだけで、その桁を四捨五入または切り捨てで与える分数のうち分母が最小で、分母が 99 以下かつ 2 と 5 以外の素因数を持つものがあれば採用する（`0.333333` → `1/3`・`0.666667` → `2/3`、`0.314159` → `314159/1000000`）。偶然一致する入力も近似側になる（`0.123456` → `10/81`）） | `0.75` → `3/4` | なし | なし |
| NUM-035 | NUM | 基本 | `selection-manipulator.unit.celsius-to-fahrenheit` | Unit: Celsius to Fahrenheit | 摂氏を華氏に変換する（NUM-035〜040 共通: 方針 B（小数 4 桁）、単位記号は付けない（既存の kg-to-lb とは異なる）。小数 4 桁未満の値は 0 になる） | `100` → `212` | なし | なし |
| NUM-036 | NUM | 基本 | `selection-manipulator.unit.fahrenheit-to-celsius` | Unit: Fahrenheit to Celsius | 華氏を摂氏に変換する | `212` → `100` | なし | なし |
| NUM-037 | NUM | 基本 | `selection-manipulator.unit.km-to-mile` | Unit: km to mile | キロメートルをマイルに変換する（1 mile = 1.609344 km） | `10` → `6.2137` | なし | なし |
| NUM-038 | NUM | 基本 | `selection-manipulator.unit.mile-to-km` | Unit: mile to km | マイルをキロメートルに変換する（1 mile = 1.609344 km） | `1` → `1.6093` | なし | なし |
| NUM-039 | NUM | 基本 | `selection-manipulator.unit.cm-to-inch` | Unit: cm to inch | センチメートルをインチに変換する（1 inch = 2.54 cm） | `2.54` → `1` | なし | なし |
| NUM-040 | NUM | 基本 | `selection-manipulator.unit.inch-to-cm` | Unit: inch to cm | インチをセンチメートルに変換する（1 inch = 2.54 cm） | `1` → `2.54` | なし | なし |

### DATE

**日付・時刻（Intl によるタイムゾーン表示・曜日・差分・ISO 週）** — 基本機能 25 件・派生 5 件・小計 30 件

| ID | カテゴリ | 種別 | 提案コマンド ID | タイトル | 概要 | 入出力例 | 外部通信 | 新規依存 |
|---|---|---|---|---|---|---|---|---|
| DATE-001 | DATE | 基本 | `selection-manipulator.date.to-utc-string` | Date - Convert to UTC String (RFC 7231) | 日付を HTTP ヘッダー形式（toUTCString）にする（DATE-001〜030 共通: 選択範囲の 1 行 = 1 値（DATE-008 を除く）で、前後の空白・空行・LF / CRLF は保持し、1 行でも不正ならコマンド全体を中止して `line N: "…" is not a date` などを通知（引用は 60 文字に短縮）。日付は `YYYY-MM-DD` / `YYYY/MM/DD`（月・日は 1〜2 桁、年 0001〜9999）に任意で `T` か空白 1 個と `HH:mm[:ss[.SSS]]`、`Z` / `±HH:MM` / `±HHMM` を付けたものだけを厳密に読み、存在しない日付はエラー。DATE-001・002・003・011・026・027 は日付だけを UTC 0 時、オフセットなしの日時を VS Code のローカル時刻として扱い（DATE-011 の日付だけは暦日で比べる）、Unix タイムスタンプ（`-?\d{1,13}`）も読む。出力先は既存の `date.*` と同じく新しい読み取り専用エディターが既定で、置換・クリップボード・通知は各行に記載。空の選択はスキップ、1 選択 1,000,000 文字まで、出力は合計 10,000,000 文字まで） | `2026-09-28` → `Mon, 28 Sep 2026 00:00:00 GMT` | なし | なし |
| DATE-002 | DATE | 基本 | `selection-manipulator.date.to-timezone` | Date - Convert to Time Zone | 入力した IANA タイムゾーン（`[A-Za-z0-9_+\-/]` の 64 文字以内で Intl が対応するもの）での日時を `YYYY-MM-DD HH:mm:ss ±HH:MM` にする（Intl.DateTimeFormat を使用。夏時間を反映し、秒単位のオフセット（LMT）は `±HH:MM:SS`。結果が 0001〜9999 年の外ならエラー） | `2026-09-28T00:00:00Z（Asia/Tokyo）` → `2026-09-28 09:00:00 +09:00` | なし | なし |
| DATE-003 | DATE | 基本 | `selection-manipulator.date.to-timezones` | Date - Show in Multiple Time Zones | 設定 `selection-manipulator.date.timeZones`（1〜20 件、既定 `UTC`・`Asia/Tokyo`・`America/Los_Angeles`）の各タイムゾーンでの時刻を `<IANA 名> HH:mm` で 1 行ずつ出し、UTC と日付が違えば ` (前日)` / ` (翌日)` を付ける（JST・PDT などの略称は Intl で安定して出せないため IANA 名。選択範囲の間は空行 1 行で区切るが、1 選択内の複数の値の間には区切りを入れない） | `2026-09-28T00:00:00Z` → `UTC 00:00⏎Asia/Tokyo 09:00⏎America/Los_Angeles 17:00 (前日)` | なし | なし |
| DATE-004 | DATE | 基本 | `selection-manipulator.date.weekday` | Date - Show Weekday | 日付の曜日を通知表示する（全選択の値を文書順に集め、2 つ以上なら `2026-09-28: Monday（月）, 2026-09-29: Tuesday（火）`。空行は数えず、21 件目以降は `, … and N more`、各値は 60 文字で短縮。エディターは変えない） | `2026-09-28` → `Monday（月）` | なし | なし |
| DATE-005 | DATE | 基本 | `selection-manipulator.date.append-weekday` | Date - Append Weekday | 日付の後ろに曜日を付ける（設定 `selection-manipulator.date.weekdayLanguage` の `ja`（既定、` (月)`）/ `en`（` (Mon)`）。選択範囲を置換し、値の後ろの空白は曜日の後ろに残す） | `2026-09-28` → `2026-09-28 (月)` | なし | なし |
| DATE-006 | DATE | 基本 | `selection-manipulator.date.iso-week` | Date - ISO Week Number | ISO 8601 の週番号にする（週年は暦年と異なることがある: `2027-01-01` → `2026-W53`） | `2026-09-28` → `2026-W40` | なし | なし |
| DATE-007 | DATE | 基本 | `selection-manipulator.date.day-of-year` | Date - Day of Year | その年の通算日にする | `2026-09-28` → `271` | なし | なし |
| DATE-008 | DATE | 基本 | `selection-manipulator.date.diff` | Date - Difference Between Two Dates | 2 つの選択（または 1 行 2 日付）の差を日・時間・分で出す（1 行の区切りはタブ・` / `・`..`・`~`・`〜`・`～`・`,` の最初に見つかったもの。そうでなければちょうど 2 選択で各 1 値。差は「後 − 前」で符号つき、時刻つきは `1 day 1 hour 30 minutes`（秒は切り捨て）。オフセットは両方あるか両方ないこと） | `2026-01-01 / 2026-09-28` → `270 days` | なし | なし |
| DATE-009 | DATE | 基本 | `selection-manipulator.date.add-days` | Date - Add Days | 入力した日数（-1,000,000〜1,000,000 の整数）を足す（選択範囲を置換。区切り `-` / `/`・時刻・オフセットは書かれたまま残し、月・日は 2 桁で書く。結果が 0001〜9999 年の外ならエラー） | `2026-09-28（+5）` → `2026-10-03` | なし | なし |
| DATE-010 | DATE | 基本 | `selection-manipulator.date.add-months` | Date - Add Months | 入力した月数（-120,000〜120,000 の整数）を足す（月末は丸める。選択範囲を置換。書式は DATE-009 と同じ） | `2026-01-31（+1）` → `2026-02-28` | なし | なし |
| DATE-011 | DATE | 基本 | `selection-manipulator.date.to-relative` | Date - Convert to Relative Time | 現在時刻からの相対表現にする（Intl.RelativeTimeFormat の日本語。日付だけの値はローカルの今日との暦日の差で、0 なら `今日`、30 日未満は日、12 か月未満は暦の月、以降は暦の年。時刻つき・タイムスタンプは現在時刻との差で 60 秒未満は秒、60 分未満は分、24 時間未満は時、以降は日付と同じ） | `2026-09-25` → `3 日前` | なし | なし |
| DATE-012 | DATE | 基本 | `selection-manipulator.date.format-pattern` | Date - Format with Pattern | 入力したパターン（1〜100 文字、yyyy/MM/dd HH:mm など）で書式化する（自前実装。トークンは `yyyy` `yy` `MM` `M` `dd` `d` `HH` `H` `hh` `h` `mm` `m` `ss` `s` `SSS` `a` `EEEE` `E`。左から走査し同じ英字の連なりを 1 単位とし、長さが合わないもの（`yyy` `EEE` `MMM` など）はエラー。`'…'` はリテラル、`''` は `'`。定義にない英字（`YYYY` `DD` `T` など）はそのまま出力。値は書かれた暦の日時をそのまま使い、タイムゾーン変換はしない） | `2026-09-28T09:05:00（yyyy/MM/dd HH:mm）` → `2026/09/28 09:05` | なし | なし |
| DATE-013 | DATE | 基本 | `selection-manipulator.date.to-compact` | Date - Convert to Compact (YYYYMMDD) | 日付を区切りなしの 8 桁にする（時刻は捨てる） | `2026-09-28` → `20260928` | なし | なし |
| DATE-014 | DATE | 基本 | `selection-manipulator.date.from-compact` | Date - Convert from Compact (YYYYMMDD) | 8 桁の日付を ISO 8601 の日付にする（存在しない日付はエラー） | `20260928` → `2026-09-28` | なし | なし |
| DATE-015 | DATE | 基本 | `selection-manipulator.date.month-calendar` | Date - Insert Month Calendar | 年月からテキストのカレンダーを作る（`YYYY-MM` / `YYYY/MM` または日付からその月。選択範囲を置換。日曜始まりの `cal` 形式で、各日は 2 桁の右寄せ、日の間は空白 1 個、行末の空白なし、年月の見出しなし） | `2026-09` → `Su Mo Tu We Th Fr Sa⏎·······1··2··3··4··5⏎…` | なし | なし |
| DATE-016 | DATE | 基本 | `selection-manipulator.date.duration-to-human` | Date - ISO 8601 Duration to Human | ISO 8601 の期間表記を読みやすい表記にする（`年` `か月` `週` `日` `時間` `分` `秒`。0 の要素は省き、すべて 0 なら `0 秒`。小数（`.` / `,`）は最後の要素だけ、各数値は 15 桁まで、符号は不可） | `PT1H30M` → `1 時間 30 分` | なし | なし |
| DATE-017 | DATE | 基本 | `selection-manipulator.date.seconds-to-hms` | Date - Seconds to HH:MM:SS | 秒数を時:分:秒にする（安全な整数の範囲。100 時間以上は時の桁が増え、負数は `-01:00:00`） | `3661` → `01:01:01` | なし | なし |
| DATE-018 | DATE | 基本 | `selection-manipulator.date.hms-to-seconds` | Date - HH:MM:SS to Seconds | 時:分:秒を秒数にする（`[-]H:MM:SS` または `[-]M:SS`、分・秒は 2 桁で 0〜59） | `01:01:01` → `3661` | なし | なし |
| DATE-019 | DATE | 基本 | `selection-manipulator.date.to-excel-serial` | Date - Convert to Excel Serial | 日付を Excel のシリアル値（1900 年方式）にする（存在しない 1900-02-29 を数える Excel との互換のため、1900-03-01 以降は 1899-12-30、1900-01-01〜02-28 は 1899-12-31 からの日数。時刻つきは小数 10 桁までの端数を足す。1900-01-01 より前はエラー） | `2026-09-28` → `46293` | なし | なし |
| DATE-020 | DATE | 基本 | `selection-manipulator.date.from-excel-serial` | Date - Convert from Excel Serial | Excel のシリアル値を日付にする（1〜2,958,465（9999-12-31）、小数可。小数部は秒に四捨五入して ` HH:mm:ss` を付け、24:00:00 になる値は翌日の 00:00:00 に繰り上げる（`59.9999999` → `1900-03-01 00:00:00`）。整数部が 60（Excel だけにある 1900-02-29）と、9999-12-31 を超える値はエラー） | `46293` → `2026-09-28` | なし | なし |
| DATE-021 | DATE | 基本 | `selection-manipulator.date.to-japanese` | Date - Convert to Japanese Format | 日付を「YYYY年M月D日」形式にする（ゼロ埋めなし、時刻は捨てる） | `2026-09-28` → `2026年9月28日` | なし | なし |
| DATE-022 | DATE | 基本 | `selection-manipulator.date.range` | Date - Generate Date Range | 開始日と終了日の間の日付を 1 行ずつ列挙する（上限件数あり: 1 範囲 10,000 件まで。区切りは `..`・`~`・`〜`・`～`（前後の空白可）。選択範囲を置換し、開始 > 終了なら降順、書式は開始側の区切りに合わせる。時刻つきはエラー） | `2026-09-28..2026-09-30` → `2026-09-28⏎2026-09-29⏎2026-09-30` | なし | なし |
| DATE-023 | DATE | 基本 | `selection-manipulator.date.age` | Date - Calculate Age | 生年月日から今日時点の満年齢を求める（2/29 生まれはうるう年以外は 3/1 に加算。未来の日付はエラー） | `1990-04-01` → `36` | なし | なし |
| DATE-024 | DATE | 基本 | `selection-manipulator.date.quarter` | Date - Show Quarter and Fiscal Year | 四半期と年度（開始月は設定 `selection-manipulator.date.fiscalYearStartMonth` で指定、既定 4 月）を出す（四半期は暦年、年度は開始月の年で呼び、最初の 6 か月が上期） | `2026-09-28` → `2026 Q3 / FY2026 上期` | なし | なし |
| DATE-025 | DATE | 基本 | `selection-manipulator.date.cron-explain` | Date - Explain Cron Expression | cron 式（5 フィールド）の意味を日本語で説明し、次回実行予定を 5 件出す（名前 `JAN`〜`DEC` / `SUN`〜`SAT`（大小無視）、`,`・`a-b`・`*/n`・`a-b/n`・`a/n`、曜日 0〜7 に対応し、`L` `W` `#` `?`・`@daily` などのマクロ・5 以外のフィールド数はエラー。日と曜日が両方指定されたら OR。次回はローカル時刻の現在より後を 8 年先まで探し（DST は考慮しない）、5 件すべてを `, ` で連結し、なければ `（次回: なし）`。1 行 200 文字まで、全選択の合計 1,000 行まで。選択範囲の間は空行 1 行で区切る） | `0 9 * * 1` → `毎週月曜 09:00（次回: 2026-10-05 09:00 …）` | なし | なし |
| DATE-026 | DATE | 派生:DATE-002 | `selection-manipulator.date.to-timezone.replace` | Date - Convert to Time Zone (Replace) | DATE-002 の出力先違いの版。同じ変換を行い、選択範囲をその場で置き換える | `2026-09-28T00:00:00Z（Asia/Tokyo）` → `2026-09-28 09:00:00 +09:00` | なし | なし |
| DATE-027 | DATE | 派生:DATE-002 | `selection-manipulator.date.to-timezone.clipboard` | Date - Convert to Time Zone (Clipboard) | DATE-002 の出力先違いの版。同じ変換を行い、結果をクリップボードにコピーする（エディタの内容は変えない） | `2026-09-28T00:00:00Z（Asia/Tokyo）` → `2026-09-28 09:00:00 +09:00` | なし | なし |
| DATE-028 | DATE | 派生:DATE-012 | `selection-manipulator.date.format-pattern.replace` | Date - Format with Pattern (Replace) | DATE-012 の出力先違いの版。同じ変換を行い、選択範囲をその場で置き換える | `2026-09-28T09:05:00（yyyy/MM/dd HH:mm）` → `2026/09/28 09:05` | なし | なし |
| DATE-029 | DATE | 派生:DATE-013 | `selection-manipulator.date.to-compact.replace` | Date - Convert to Compact (YYYYMMDD) (Replace) | DATE-013 の出力先違いの版。同じ変換を行い、選択範囲をその場で置き換える | `2026-09-28` → `20260928` | なし | なし |
| DATE-030 | DATE | 派生:DATE-014 | `selection-manipulator.date.from-compact.replace` | Date - Convert from Compact (YYYYMMDD) (Replace) | DATE-014 の出力先違いの版。同じ変換を行い、選択範囲をその場で置き換える | `20260928` → `2026-09-28` | なし | なし |

### GEN

**連番・生成（英字連番・ローマ数字・ULID / NanoID・ダミーテキスト）** — 基本機能 30 件・派生 0 件・小計 30 件

| ID | カテゴリ | 種別 | 提案コマンド ID | タイトル | 概要 | 入出力例 | 外部通信 | 新規依存 |
|---|---|---|---|---|---|---|---|---|
| GEN-001 | GEN | 基本 | `selection-manipulator.random.uuid-v7` | Random - UUID v7 | 時刻順に並ぶ UUID v7 を生成する（crypto.getRandomValues を使用） | `（カーソル）` → `0192f0c1-8e3a-7c4d-9b1e-3f2a…` | なし | なし |
| GEN-002 | GEN | 基本 | `selection-manipulator.random.ulid` | Random - ULID | ULID を生成する | `（カーソル）` → `01J8Z3K5Q7W9X2Y4Z6A8B0C1D2` | なし | なし |
| GEN-003 | GEN | 基本 | `selection-manipulator.random.nanoid` | Random - NanoID | 21 文字の NanoID を生成する（自前実装） | `（カーソル）` → `V1StGXR8_Z5jdHi6B-myT` | なし | なし |
| GEN-004 | GEN | 基本 | `selection-manipulator.random.hex` | Random - Hex String | 入力したバイト数の暗号学的乱数を 16 進で生成する | `（16 バイト）` → `9f86d081884c7d659a2feaa0c55ad015` | なし | なし |
| GEN-005 | GEN | 基本 | `selection-manipulator.random.base64` | Random - Base64 Token | 入力したバイト数の乱数を Base64URL で生成する | `（24 バイト）` → `q3Zp…（32 文字）` | なし | なし |
| GEN-006 | GEN | 基本 | `selection-manipulator.random.integer` | Random - Integer in Range | 入力した範囲の整数を各カーソルに生成する | `（1..6）` → `4` | なし | なし |
| GEN-007 | GEN | 基本 | `selection-manipulator.random.float` | Random - Float in Range | 入力した範囲・桁数の小数を生成する | `（0..1, 3 桁）` → `0.582` | なし | なし |
| GEN-008 | GEN | 基本 | `selection-manipulator.random.pick-line` | Random - Pick One Line | 選択範囲の行からランダムに 1 行を選ぶ | `a⏎b⏎c` → `b` | なし | なし |
| GEN-009 | GEN | 基本 | `selection-manipulator.random.sample-lines` | Random - Pick N Lines | 選択範囲の行から重複なしで N 行を選ぶ | `a⏎b⏎c⏎d（N=2）` → `d⏎a` | なし | なし |
| GEN-010 | GEN | 基本 | `selection-manipulator.random.mac` | Random - MAC Address | ローカル管理ビットを立てた MAC アドレスを生成する | `（カーソル）` → `02:5e:a1:3c:77:0b` | なし | なし |
| GEN-011 | GEN | 基本 | `selection-manipulator.random.color` | Random - Hex Color | ランダムな色コードを生成する | `（カーソル）` → `#3fa2c8` | なし | なし |
| GEN-012 | GEN | 基本 | `selection-manipulator.random.date` | Random - Date in Range | 入力した期間内のランダムな日付を生成する | `（2026-01-01..2026-12-31）` → `2026-05-17` | なし | なし |
| GEN-013 | GEN | 基本 | `selection-manipulator.random.email` | Random - Dummy Email | 予約ドメイン example.com のダミーメールアドレスを生成する | `（カーソル）` → `user4821@example.com` | なし | なし |
| GEN-014 | GEN | 基本 | `selection-manipulator.random.name` | Random - Dummy Name | 内蔵の小さな名簿から英語のダミー氏名を生成する | `（カーソル）` → `Emily Clark` | なし | なし |
| GEN-015 | GEN | 基本 | `selection-manipulator.random.name-ja` | Random - Dummy Japanese Name | 内蔵の小さな名簿から日本語のダミー氏名を生成する | `（カーソル）` → `佐藤 花子` | なし | なし |
| GEN-016 | GEN | 基本 | `selection-manipulator.random.phone-jp` | Random - Dummy Phone Number (JP) | 総務省がドラマ等向けに案内している架空番号帯（例: 090-0xxx）のダミー電話番号を生成する | `（カーソル）` → `090-0123-4567` | なし | なし |
| GEN-017 | GEN | 基本 | `selection-manipulator.random.text-ja` | Random - Japanese Dummy Text | 内蔵のダミー文章から日本語の文章を生成する（Lorem Ipsum の日本語版） | `（3 文）` → `これはダミーの文章です。…` | なし | なし |
| GEN-018 | GEN | 基本 | `selection-manipulator.random.boolean` | Random - Boolean | true / false をランダムに生成する | `（カーソル）` → `true` | なし | なし |
| GEN-019 | GEN | 基本 | `selection-manipulator.random.dice` | Random - Dice Roll | NdM 形式でサイコロを振り、合計と内訳を出す | `2d6` → `7 (3+4)` | なし | なし |
| GEN-020 | GEN | 基本 | `selection-manipulator.generate.alpha-sequence` | Generate - Alphabet Sequence | 各カーソルに a, b, …, z, aa の連番を入れる | `（3 カーソル）` → `a / b / c` | なし | なし |
| GEN-021 | GEN | 基本 | `selection-manipulator.generate.roman-sequence` | Generate - Roman Numeral Sequence | 各カーソルにローマ数字の連番を入れる | `（4 カーソル）` → `I / II / III / IV` | なし | なし |
| GEN-022 | GEN | 基本 | `selection-manipulator.generate.date-sequence` | Generate - Date Sequence | 各カーソルに開始日から 1 日ずつ進めた日付を入れる | `（3 カーソル, 2026-09-28）` → `2026-09-28 / 2026-09-29 / 2026-09-30` | なし | なし |
| GEN-023 | GEN | 基本 | `selection-manipulator.generate.number-range` | Generate - Number Range | 開始・終了・増分から数列を生成する | `1..10 step 3` → `1⏎4⏎7⏎10` | なし | なし |
| GEN-024 | GEN | 基本 | `selection-manipulator.generate.repeat-char` | Generate - Repeat Character to Width | 入力した文字を指定の幅まで繰り返す（区切り線など） | `=（20）` → `====================` | なし | なし |
| GEN-025 | GEN | 基本 | `selection-manipulator.generate.hex-sequence` | Generate - Hex Sequence | 各カーソルに 16 進の連番を入れる | `（3 カーソル, 0x0A から）` → `0x0A / 0x0B / 0x0C` | なし | なし |
| GEN-026 | GEN | 基本 | `selection-manipulator.generate.kana-sequence` | Generate - Kana Sequence | 各カーソルに「あ, い, う…」または「イ, ロ, ハ…」の連番を入れる | `（3 カーソル）` → `あ / い / う` | なし | なし |
| GEN-027 | GEN | 基本 | `selection-manipulator.generate.circled-sequence` | Generate - Circled Number Sequence | 各カーソルに ①②③ の連番を入れる（50 まで） | `（3 カーソル）` → `① / ② / ③` | なし | なし |
| GEN-028 | GEN | 基本 | `selection-manipulator.generate.column-ruler` | Generate - Column Ruler | 桁位置を示すルーラー行を生成する | `（30 桁）` → `·········1·········2·········3⏎123456789012345678901234567890` | なし | なし |
| GEN-029 | GEN | 基本 | `selection-manipulator.generate.guid-braced` | Generate - GUID (Braced Uppercase) | Windows / .NET 形式（波括弧・大文字）の GUID を生成する | `（カーソル）` → `{3F2504E0-4F89-41D3-9A0C-0305E82C3301}` | なし | なし |
| GEN-030 | GEN | 基本 | `selection-manipulator.generate.ipv4-sequence` | Generate - IPv4 Sequence | 各カーソルに開始アドレスから連続する IPv4 アドレスを入れる | `（3 カーソル, 192.0.2.1）` → `192.0.2.1 / 192.0.2.2 / 192.0.2.3` | なし | なし |

### JA

**日本語テキスト（ローマ字・漢数字・句読点・旧字体など）** — 基本機能 29 件・派生 6 件・小計 35 件

| ID | カテゴリ | 種別 | 提案コマンド ID | タイトル | 概要 | 入出力例 | 外部通信 | 新規依存 |
|---|---|---|---|---|---|---|---|---|
| JA-001 | JA | 基本 | `selection-manipulator.japanese.kana-to-romaji` | Japanese - Kana to Romaji (Hepburn) | ひらがな・カタカナをヘボン式ローマ字にする | `しんじゅく` → `shinjuku` | なし | なし |
| JA-002 | JA | 基本 | `selection-manipulator.japanese.romaji-to-hiragana` | Japanese - Romaji to Hiragana | ローマ字（ヘボン式・訓令式の両方）をひらがなにする | `sushi` → `すし` | なし | なし |
| JA-003 | JA | 基本 | `selection-manipulator.japanese.number-to-kanji` | Japanese - Number to Kanji Numeral | 算用数字を漢数字にする | `1234` → `千二百三十四` | なし | なし |
| JA-004 | JA | 基本 | `selection-manipulator.japanese.kanji-to-number` | Japanese - Kanji Numeral to Number | 漢数字（万・億を含む）を算用数字にする | `三億五千万` → `350000000` | なし | なし |
| JA-005 | JA | 基本 | `selection-manipulator.japanese.number-to-daiji` | Japanese - Number to Daiji | 算用数字を大字（壱・弐・参・拾）にする | `123` → `壱百弐拾参` | なし | なし |
| JA-006 | JA | 基本 | `selection-manipulator.japanese.punctuation-to-comma` | Japanese - Punctuation to Comma and Period (，．) | 句読点を公用文・論文向けの「，」「．」にする | `今日は、晴れ。` → `今日は，晴れ．` | なし | なし |
| JA-007 | JA | 基本 | `selection-manipulator.japanese.punctuation-to-touten` | Japanese - Punctuation to Touten and Kuten (、。) | 「，」「．」を「、」「。」にする | `今日は，晴れ．` → `今日は、晴れ。` | なし | なし |
| JA-008 | JA | 基本 | `selection-manipulator.japanese.kyujitai-to-shinjitai` | Japanese - Old Kanji to New (Kyujitai to Shinjitai) | 旧字体を新字体にする（主要な対応表を拡張内に定数で持つ） | `國學` → `国学` | なし | なし |
| JA-009 | JA | 基本 | `selection-manipulator.japanese.shinjitai-to-kyujitai` | Japanese - New Kanji to Old (Shinjitai to Kyujitai) | 新字体を旧字体にする | `国学` → `國學` | なし | なし |
| JA-010 | JA | 基本 | `selection-manipulator.japanese.small-kana-to-normal` | Japanese - Small Kana to Normal | 小書きの仮名（ぁ・っ・ゃ など）を通常の仮名にする | `きゃっと` → `きやつと` | なし | なし |
| JA-011 | JA | 基本 | `selection-manipulator.japanese.manuscript-count` | Japanese - Count Characters (Manuscript Paper) | 文字数と 400 字詰め原稿用紙の換算枚数を通知表示する | `（1,234 字の文章）` → `1,234 字 / 原稿用紙 3.1 枚（通知）` | なし | なし |
| JA-012 | JA | 基本 | `selection-manipulator.japanese.remove-ruby` | Japanese - Remove Ruby Notation | 「漢字《かんじ》」「｜漢字《かんじ》」「漢字（かんじ）」形式のルビを取り除く | `｜東京《とうきょう》` → `東京` | なし | なし |
| JA-013 | JA | 基本 | `selection-manipulator.japanese.ruby-to-html` | Japanese - Ruby Notation to HTML | 「｜漢字《かんじ》」形式のルビを HTML の ruby 要素にする | `｜東京《とうきょう》` → `<ruby>東京<rt>とうきょう</rt></ruby>` | なし | なし |
| JA-014 | JA | 基本 | `selection-manipulator.japanese.fullwidth-alnum-to-half` | Japanese - Full-width Alphanumerics to Half (Keep Kana) | 全角英数字・記号だけを半角にし、仮名はそのまま残す（既存は仮名も変換する） | `ＡＢＣ１２３カナ` → `ABC123カナ` | なし | なし |
| JA-015 | JA | 基本 | `selection-manipulator.japanese.ideographic-space-to-space` | Japanese - Ideographic Space to Space | 全角空白だけを半角空白にする | `東京　大阪` → `東京 大阪` | なし | なし |
| JA-016 | JA | 基本 | `selection-manipulator.japanese.normalize-wave-dash` | Japanese - Normalize Wave Dash | 波ダッシュ（〜 U+301C）と全角チルダ（～ U+FF5E）を指定した一方に統一する | `1〜3、4～5` → `1〜3、4〜5` | なし | なし |
| JA-017 | JA | 基本 | `selection-manipulator.japanese.normalize-hyphens` | Japanese - Normalize Hyphens and Long Vowel Marks | 仮名の後ろのハイフン類を長音符「ー」に、数字の間の長音符をハイフンに統一する | `コ−ヒ− 03ー1234` → `コーヒー 03-1234` | なし | なし |
| JA-018 | JA | 基本 | `selection-manipulator.japanese.extract-kanji` | Japanese - Extract Kanji | 漢字だけを取り出す | `東京タワーへ行く` → `東京行` | なし | なし |
| JA-019 | JA | 基本 | `selection-manipulator.japanese.extract-katakana-words` | Japanese - Extract Katakana Words | カタカナ語を 1 行ずつ取り出す | `東京タワーとスカイツリー` → `タワー⏎スカイツリー` | なし | なし |
| JA-020 | JA | 基本 | `selection-manipulator.japanese.char-type-count` | Japanese - Count by Character Type | ひらがな・カタカナ・漢字・英数字・記号ごとの文字数を通知表示する | `東京タワーへgo` → `漢字 2 / カタカナ 3 / ひらがな 1 / 英数字 2（通知）` | なし | なし |
| JA-021 | JA | 基本 | `selection-manipulator.japanese.circled-number-to-paren` | Japanese - Circled Numbers to Parentheses | 環境依存になりやすい丸数字を (1) 形式にする | `①②` → `(1)(2)` | なし | なし |
| JA-022 | JA | 基本 | `selection-manipulator.japanese.prefecture-code` | Japanese - Prefecture Name to/from JIS Code | 都道府県名と JIS コード（01〜47）を相互に変換する（対応表を内蔵） | `東京都` → `13` | なし | なし |
| JA-023 | JA | 基本 | `selection-manipulator.japanese.postal-code-format` | Japanese - Format Postal Code | 7 桁の郵便番号を「〒123-4567」形式にする（住所検索はしない） | `1000001` → `〒100-0001` | なし | なし |
| JA-024 | JA | 基本 | `selection-manipulator.japanese.hiragana-to-halfwidth-katakana` | Japanese - Hiragana to Half-width Katakana | ひらがなを半角カタカナにする（濁点は分離） | `がっこう` → `ｶﾞｯｺｳ` | なし | なし |
| JA-025 | JA | 基本 | `selection-manipulator.japanese.remove-spaces-between-japanese` | Japanese - Remove Spaces Between Japanese Characters | 日本語の文字どうしの間の空白を取り除く（英単語間の空白は残す） | `日本 語 の hello world` → `日本語の hello world` | なし | なし |
| JA-026 | JA | 基本 | `selection-manipulator.japanese.space-between-ja-en` | Japanese - Add Space Between Japanese and Alphanumerics | 日本語と英数字の境目に半角空白を入れる | `Vue3で開発` → `Vue3 で開発` | なし | なし |
| JA-027 | JA | 基本 | `selection-manipulator.japanese.compose-dakuten` | Japanese - Compose Dakuten | 分離した濁点・半濁点（結合文字・゛゜）を直前の仮名と合成する | `か゛は゜` → `がぱ` | なし | なし |
| JA-028 | JA | 基本 | `selection-manipulator.japanese.kana-to-romaji-kunrei` | Japanese - Kana to Romaji (Kunrei) | ひらがな・カタカナを訓令式ローマ字にする | `しんじゅく` → `sinzyuku` | なし | なし |
| JA-029 | JA | 基本 | `selection-manipulator.japanese.detect-platform-dependent` | Japanese - Detect Platform-dependent Characters | 丸数字・髙などの JIS X 0208 外の文字を検出して選択する | `①髙橋` → `「①」「髙」を選択` | なし | なし |
| JA-030 | JA | 派生:JA-001 | `selection-manipulator.japanese.kana-to-romaji.replace` | Japanese - Kana to Romaji (Hepburn) (Replace) | JA-001 の出力先違いの版。同じ変換を行い、選択範囲をその場で置き換える | `しんじゅく` → `shinjuku` | なし | なし |
| JA-031 | JA | 派生:JA-002 | `selection-manipulator.japanese.romaji-to-hiragana.replace` | Japanese - Romaji to Hiragana (Replace) | JA-002 の出力先違いの版。同じ変換を行い、選択範囲をその場で置き換える | `sushi` → `すし` | なし | なし |
| JA-032 | JA | 派生:JA-003 | `selection-manipulator.japanese.number-to-kanji.replace` | Japanese - Number to Kanji Numeral (Replace) | JA-003 の出力先違いの版。同じ変換を行い、選択範囲をその場で置き換える | `1234` → `千二百三十四` | なし | なし |
| JA-033 | JA | 派生:JA-004 | `selection-manipulator.japanese.kanji-to-number.replace` | Japanese - Kanji Numeral to Number (Replace) | JA-004 の出力先違いの版。同じ変換を行い、選択範囲をその場で置き換える | `三億五千万` → `350000000` | なし | なし |
| JA-034 | JA | 派生:JA-008 | `selection-manipulator.japanese.kyujitai-to-shinjitai.replace` | Japanese - Old Kanji to New (Kyujitai to Shinjitai) (Replace) | JA-008 の出力先違いの版。同じ変換を行い、選択範囲をその場で置き換える | `國學` → `国学` | なし | なし |
| JA-035 | JA | 派生:JA-026 | `selection-manipulator.japanese.space-between-ja-en.replace` | Japanese - Add Space Between Japanese and Alphanumerics (Replace) | JA-026 の出力先違いの版。同じ変換を行い、選択範囲をその場で置き換える | `Vue3で開発` → `Vue3 で開発` | なし | なし |

### UNI

**Unicode・文字種（正規化 NFC/NFD/NFKC・不可視文字・コードポイント表示）** — 基本機能 30 件・派生 0 件・小計 30 件

| ID | カテゴリ | 種別 | 提案コマンド ID | タイトル | 概要 | 入出力例 | 外部通信 | 新規依存 |
|---|---|---|---|---|---|---|---|---|
| UNI-001 | UNI | 基本 | `selection-manipulator.unicode.normalize-nfc` | Unicode - Normalize NFC | String.prototype.normalize で NFC 正規化する | `e{U+0301}` → `é` | なし | なし |
| UNI-002 | UNI | 基本 | `selection-manipulator.unicode.normalize-nfd` | Unicode - Normalize NFD | NFD 正規化（分解）する | `é` → `e{U+0301}` | なし | なし |
| UNI-003 | UNI | 基本 | `selection-manipulator.unicode.normalize-nfkc` | Unicode - Normalize NFKC | NFKC 正規化する（互換文字を統一） | `ｶﾞ①ﬁ` → `ガ1fi` | なし | なし |
| UNI-004 | UNI | 基本 | `selection-manipulator.unicode.normalize-nfkd` | Unicode - Normalize NFKD | NFKD 正規化する | `ﬁ` → `fi` | なし | なし |
| UNI-005 | UNI | 基本 | `selection-manipulator.unicode.remove-zero-width` | Unicode - Remove Zero-width Characters | ZWSP・ZWJ・ZWNJ・BOM などの幅ゼロ文字を取り除く | `a{U+200B}b` → `ab` | なし | なし |
| UNI-006 | UNI | 基本 | `selection-manipulator.unicode.reveal-invisible` | Unicode - Reveal Invisible Characters | 見えない文字や制御文字を &lt;U+XXXX&gt; 表記にして見えるようにする | `a{U+200B}b` → `a<U+200B>b` | なし | なし |
| UNI-007 | UNI | 基本 | `selection-manipulator.unicode.to-codepoints` | Unicode - Show Code Points | 各文字を U+XXXX 表記にする | `あ😀` → `U+3042 U+1F600` | なし | なし |
| UNI-008 | UNI | 基本 | `selection-manipulator.unicode.from-codepoints` | Unicode - Code Points to Text | U+XXXX 表記を文字に戻す | `U+3042 U+1F600` → `あ😀` | なし | なし |
| UNI-009 | UNI | 基本 | `selection-manipulator.unicode.to-utf8-bytes` | Unicode - Show UTF-8 Bytes per Character | 文字ごとに UTF-8 のバイト列を表示する | `aあ` → `a: 61⏎あ: E3 81 82` | なし | なし |
| UNI-010 | UNI | 基本 | `selection-manipulator.unicode.to-utf16-units` | Unicode - Show UTF-16 Code Units | 文字ごとに UTF-16 のコードユニットを表示する | `😀` → `😀: D83D DE00` | なし | なし |
| UNI-011 | UNI | 基本 | `selection-manipulator.unicode.count-graphemes` | Unicode - Count Graphemes | Intl.Segmenter で見た目の文字数（書記素クラスタ数）を数え、length と並べて通知する | `👨‍👩‍👧` → `1 grapheme / length 8（通知）` | なし | なし |
| UNI-012 | UNI | 基本 | `selection-manipulator.unicode.remove-control` | Unicode - Remove Control Characters | 改行・タブ以外の制御文字（C0 / C1）を取り除く | `a{U+0007}b` → `ab` | なし | なし |
| UNI-013 | UNI | 基本 | `selection-manipulator.unicode.remove-non-ascii` | Unicode - Remove Non-ASCII Characters | ASCII 以外の文字を取り除く | `café ☕` → `caf·` | なし | なし |
| UNI-014 | UNI | 基本 | `selection-manipulator.unicode.remove-emoji` | Unicode - Remove Emoji | 絵文字（Extended\_Pictographic と修飾子・ZWJ シーケンス）を取り除く | `ok👍` → `ok` | なし | なし |
| UNI-015 | UNI | 基本 | `selection-manipulator.unicode.extract-emoji` | Unicode - Extract Emoji | 絵文字だけを取り出す | `ok👍 go🚀` → `👍🚀` | なし | なし |
| UNI-016 | UNI | 基本 | `selection-manipulator.unicode.style-bold` | Unicode - Mathematical Bold | 英数字を数学用太字の文字にする（SNS 向け装飾） | `abc` → `𝐚𝐛𝐜` | なし | なし |
| UNI-017 | UNI | 基本 | `selection-manipulator.unicode.style-italic` | Unicode - Mathematical Italic | 英字を数学用斜体の文字にする | `abc` → `𝑎𝑏𝑐` | なし | なし |
| UNI-018 | UNI | 基本 | `selection-manipulator.unicode.style-monospace` | Unicode - Mathematical Monospace | 英数字を数学用等幅の文字にする | `abc` → `𝚊𝚋𝚌` | なし | なし |
| UNI-019 | UNI | 基本 | `selection-manipulator.unicode.style-circled` | Unicode - Circled Letters | 英数字を丸囲み文字にする | `abc` → `ⓐⓑⓒ` | なし | なし |
| UNI-020 | UNI | 基本 | `selection-manipulator.unicode.upside-down` | Unicode - Upside Down Text | 上下を反転した見た目の文字に置き換え、順序を逆にする | `hello` → `ollǝɥ` | なし | なし |
| UNI-021 | UNI | 基本 | `selection-manipulator.unicode.strikethrough` | Unicode - Combining Strikethrough | 各文字の後ろに結合用の取り消し線（U+0336）を付ける | `abc` → `a̶b̶c̶` | なし | なし |
| UNI-022 | UNI | 基本 | `selection-manipulator.unicode.underline` | Unicode - Combining Underline | 各文字の後ろに結合用の下線（U+0332）を付ける | `abc` → `a̲b̲c̲` | なし | なし |
| UNI-023 | UNI | 基本 | `selection-manipulator.unicode.superscript` | Unicode - Superscript | 数字と一部の英字を上付き文字にする | `x2` → `x²` | なし | なし |
| UNI-024 | UNI | 基本 | `selection-manipulator.unicode.subscript` | Unicode - Subscript | 数字と一部の英字を下付き文字にする | `H2O` → `H₂O` | なし | なし |
| UNI-025 | UNI | 基本 | `selection-manipulator.unicode.detect-confusables` | Unicode - Detect Confusable Characters | ラテン文字に似たキリル文字・ギリシャ文字など（ホモグリフ）を検出して選択する | `pаypal（а はキリル文字）` → `「а」を選択（通知）` | なし | なし |
| UNI-026 | UNI | 基本 | `selection-manipulator.unicode.detect-bidi` | Unicode - Detect Bidi Control Characters | Trojan Source 攻撃に使われる双方向制御文字（U+202A〜202E, U+2066〜2069）を検出して選択する | `a{U+202E}b` → `位置を選択（通知）` | なし | なし |
| UNI-027 | UNI | 基本 | `selection-manipulator.unicode.smart-quotes` | Unicode - Convert to Smart Quotes | 直線の引用符を開き・閉じを判別して曲がった引用符にする（既存 Unsmart Quotes の逆） | `"a" it's` → `“a” it’s` | なし | なし |
| UNI-028 | UNI | 基本 | `selection-manipulator.unicode.typographic-punctuation` | Unicode - Typographic Dashes and Ellipsis | 「--」を「—」、「...」を「…」に置き換える | `wait... -- ok` → `wait… — ok` | なし | なし |
| UNI-029 | UNI | 基本 | `selection-manipulator.unicode.detect-scripts` | Unicode - Detect Scripts | 含まれている文字体系（Latin, Hiragana, Han など）と文字数を通知する | `abcあア漢` → `Latin 3, Hiragana 1, Katakana 1, Han 1（通知）` | なし | なし |
| UNI-030 | UNI | 基本 | `selection-manipulator.unicode.transliterate-cyrillic` | Unicode - Transliterate Cyrillic to Latin | キリル文字をラテン文字に翻字する（対応表を内蔵） | `Привет` → `Privet` | なし | なし |

### DEV

**プログラミング支援（言語別の文字列リテラル化・SQL/正規表現/シェル向けエスケープなど。変換するだけで実行はしない）** — 基本機能 29 件・派生 6 件・小計 35 件

| ID | カテゴリ | 種別 | 提案コマンド ID | タイトル | 概要 | 入出力例 | 外部通信 | 新規依存 |
|---|---|---|---|---|---|---|---|---|
| DEV-001 | DEV | 基本 | `selection-manipulator.programmatic.to-js-string` | Convert to JS String Literal | JavaScript のシングルクォート文字列リテラルにする（' \\ 改行をエスケープし、改行は \\n にする） | `it's⏎ok` → `'it\'s\nok'` | なし | なし |
| DEV-002 | DEV | 基本 | `selection-manipulator.programmatic.to-python-string` | Convert to Python String Literal | Python の文字列リテラルにする | `it's` → `"it's"` | なし | なし |
| DEV-003 | DEV | 基本 | `selection-manipulator.programmatic.to-java-string` | Convert to Java String Concatenation | 複数行テキストを Java / C の文字列連結（行ごとの "…\\n" +）にする。改行は文字列リテラルの中では \\n と書き、連結の + の後ろで実際に改行する | `a⏎b` → `"a\n" +⏎"b"` | なし | なし |
| DEV-004 | DEV | 基本 | `selection-manipulator.programmatic.to-go-raw-string` | Convert to Go Raw String | Go のバッククォート文字列にする（内部のバッククォートは連結で逃がす） | `a⏎b` → `` `a⏎b` `` | なし | なし |
| DEV-005 | DEV | 基本 | `selection-manipulator.programmatic.to-template-literal` | Convert to JS Template Literal | JavaScript のテンプレートリテラルにする（\` と ${ をエスケープ） | `cost ${x}` → `` `cost \${x}` `` | なし | なし |
| DEV-006 | DEV | 基本 | `selection-manipulator.programmatic.escape-regex` | Escape Regex Special Characters | 正規表現の特殊文字をエスケープする | `a.b*c?` → `a\.b\*c\?` | なし | なし |
| DEV-007 | DEV | 基本 | `selection-manipulator.programmatic.escape-sql` | Escape SQL String Literal | SQL の文字列リテラル用に ' を '' にする（生成のみで実行しない） | `O'Reilly` → `O''Reilly` | なし | なし |
| DEV-008 | DEV | 基本 | `selection-manipulator.programmatic.quote-posix-shell` | Quote for POSIX Shell | POSIX シェルで安全な単一引用符の形にする（文字列を変換するだけで、シェルは実行しない） | `it's` → `'it'\''s'` | なし | なし |
| DEV-009 | DEV | 基本 | `selection-manipulator.programmatic.quote-powershell` | Quote for PowerShell | PowerShell の単一引用符文字列にする（' を '' にする。実行しない） | `it's` → `'it''s'` | なし | なし |
| DEV-010 | DEV | 基本 | `selection-manipulator.programmatic.escape-csv-field` | Escape CSV Field | CSV の 1 フィールドとして正しく引用・エスケープする | `a,"b"` → `"a,""b"""` | なし | なし |
| DEV-011 | DEV | 基本 | `selection-manipulator.programmatic.escape-markdown` | Escape Markdown Special Characters | Markdown の記号（\* \_ \` # など）をバックスラッシュでエスケープする | `*a* _b_` → `\*a\* \_b\_` | なし | なし |
| DEV-012 | DEV | 基本 | `selection-manipulator.programmatic.json-to-typescript` | Convert JSON to TypeScript Interface | サンプル JSON から TypeScript の interface を生成する | `{"id":1,"tags":["a"]}` → `interface Root { id: number; tags: string[]; }` | なし | なし |
| DEV-013 | DEV | 基本 | `selection-manipulator.programmatic.json-to-go-struct` | Convert JSON to Go Struct | サンプル JSON から json タグ付きの Go 構造体を生成する | `{"user_id":1}` → ``type Root struct { UserID int `json:"user_id"` }`` | なし | なし |
| DEV-014 | DEV | 基本 | `selection-manipulator.programmatic.json-to-python-typeddict` | Convert JSON to Python TypedDict | サンプル JSON から Python の TypedDict 定義を生成する | `{"id":1}` → `class Root(TypedDict):⏎····id: int` | なし | なし |
| DEV-015 | DEV | 基本 | `selection-manipulator.programmatic.sql-format` | Format SQL | 主要なキーワードの前で改行・インデントする簡易 SQL 整形（自前実装。実行しない） | `select a from t where b=1` → `SELECT a⏎FROM t⏎WHERE b = 1` | なし | なし |
| DEV-016 | DEV | 基本 | `selection-manipulator.programmatic.sql-minify` | Minify SQL | SQL のコメントと余分な空白・改行を取り除く | `SELECT a⏎-- c⏎FROM t` → `SELECT a FROM t` | なし | なし |
| DEV-017 | DEV | 基本 | `selection-manipulator.programmatic.sql-uppercase-keywords` | Uppercase SQL Keywords | 文字列リテラル以外の SQL キーワードだけを大文字にする | `select name from users` → `SELECT name FROM users` | なし | なし |
| DEV-018 | DEV | 基本 | `selection-manipulator.programmatic.css-minify` | Minify CSS | CSS のコメントと余分な空白を取り除く（自前実装） | `a {⏎··color: red;⏎}` → `a{color:red}` | なし | なし |
| DEV-019 | DEV | 基本 | `selection-manipulator.programmatic.css-format` | Format CSS | CSS をルールごとに改行・インデントして整形する | `a{color:red}` → `a {⏎··color: red;⏎}` | なし | なし |
| DEV-020 | DEV | 基本 | `selection-manipulator.programmatic.hex-to-hsl` | Convert Hex to HSL | 16 進の色コードを HSL にする | `#ff0000` → `hsl(0, 100%, 50%)` | なし | なし |
| DEV-021 | DEV | 基本 | `selection-manipulator.programmatic.hsl-to-hex` | Convert HSL to Hex | HSL を 16 進の色コードにする | `hsl(120, 100%, 25%)` → `#008000` | なし | なし |
| DEV-022 | DEV | 基本 | `selection-manipulator.programmatic.hex-shorten-expand` | Toggle Hex Color Short / Long | 6 桁の色コードを 3 桁に（可能な場合）、3 桁を 6 桁に切り替える | `#aabbcc` → `#abc` | なし | なし |
| DEV-023 | DEV | 基本 | `selection-manipulator.programmatic.remove-console-log` | Remove console.log Statements | console.log / debug の呼び出しだけの行を取り除く | `a();⏎console.log(x);⏎b();` → `a();⏎b();` | なし | なし |
| DEV-024 | DEV | 基本 | `selection-manipulator.programmatic.sort-imports` | Sort Import Statements | 連続した import 文をモジュール名順に並べ替える | `import b from 'b';⏎import a from 'a';` → `import a from 'a';⏎import b from 'b';` | なし | なし |
| DEV-025 | DEV | 基本 | `selection-manipulator.programmatic.concat-to-template` | Convert String Concatenation to Template Literal | 'a' + x + 'b' 形式の連結をテンプレートリテラルにする | `'Hi ' + name + '!'` → `` `Hi ${name}!` `` | なし | なし |
| DEV-026 | DEV | 基本 | `selection-manipulator.programmatic.curl-to-fetch` | Convert curl Command to fetch | curl コマンドの文字列を解析して fetch() のコードを生成する（テキスト変換のみで、curl も通信も実行しない） | `curl -X POST -d 'a=1' https://example.com` → `fetch('https://example.com', { method: 'POST', body: 'a=1' })` | なし | なし |
| DEV-027 | DEV | 基本 | `selection-manipulator.programmatic.html-to-jsx` | Convert HTML to JSX | class → className、for → htmlFor、style 文字列 → オブジェクトなどの置き換えで HTML を JSX にする | `<label class="a" for="b">` → `<label className="a" htmlFor="b">` | なし | なし |
| DEV-028 | DEV | 基本 | `selection-manipulator.programmatic.semver-bump` | Bump Semantic Version | バージョン番号の patch / minor / major を選んで 1 つ上げる | `1.2.3（minor）` → `1.3.0` | なし | なし |
| DEV-029 | DEV | 基本 | `selection-manipulator.programmatic.chmod-convert` | Convert chmod Numeric / Symbolic | パーミッションの数値表記と記号表記を相互に変換する | `755` → `rwxr-xr-x` | なし | なし |
| DEV-030 | DEV | 派生:DEV-001 | `selection-manipulator.programmatic.to-js-string.replace` | Convert to JS String Literal (Replace) | DEV-001 の出力先違いの版。同じ変換を行い、選択範囲をその場で置き換える | `it's⏎ok` → `'it\'s\nok'` | なし | なし |
| DEV-031 | DEV | 派生:DEV-006 | `selection-manipulator.programmatic.escape-regex.replace` | Escape Regex Special Characters (Replace) | DEV-006 の出力先違いの版。同じ変換を行い、選択範囲をその場で置き換える | `a.b*c?` → `a\.b\*c\?` | なし | なし |
| DEV-032 | DEV | 派生:DEV-007 | `selection-manipulator.programmatic.escape-sql.replace` | Escape SQL String Literal (Replace) | DEV-007 の出力先違いの版。同じ変換を行い、選択範囲をその場で置き換える | `O'Reilly` → `O''Reilly` | なし | なし |
| DEV-033 | DEV | 派生:DEV-012 | `selection-manipulator.programmatic.json-to-typescript.replace` | Convert JSON to TypeScript Interface (Replace) | DEV-012 の出力先違いの版。同じ変換を行い、選択範囲をその場で置き換える | `{"id":1,"tags":["a"]}` → `interface Root { id: number; tags: string[]; }` | なし | なし |
| DEV-034 | DEV | 派生:DEV-015 | `selection-manipulator.programmatic.sql-format.replace` | Format SQL (Replace) | DEV-015 の出力先違いの版。同じ変換を行い、選択範囲をその場で置き換える | `select a from t where b=1` → `SELECT a⏎FROM t⏎WHERE b = 1` | なし | なし |
| DEV-035 | DEV | 派生:DEV-027 | `selection-manipulator.programmatic.html-to-jsx.replace` | Convert HTML to JSX (Replace) | DEV-027 の出力先違いの版。同じ変換を行い、選択範囲をその場で置き換える | `<label class="a" for="b">` → `<label className="a" htmlFor="b">` | なし | なし |

### MSEL

**マルチカーソル・選択操作（分割・n 番目の選択・整列 Align・選択の拡張／縮小）** — 基本機能 30 件・派生 0 件・小計 30 件

| ID | カテゴリ | 種別 | 提案コマンド ID | タイトル | 概要 | 入出力例 | 外部通信 | 新規依存 |
|---|---|---|---|---|---|---|---|---|
| MSEL-001 | MSEL | 基本 | `selection-manipulator.selection.keep-odd` | Selection - Keep Odd Selections | 複数選択のうち奇数番目だけを残す | `[a] [b] [c]` → `[a] [c]` | なし | なし |
| MSEL-002 | MSEL | 基本 | `selection-manipulator.selection.keep-even` | Selection - Keep Even Selections | 複数選択のうち偶数番目だけを残す | `[a] [b] [c]` → `[b]` | なし | なし |
| MSEL-003 | MSEL | 基本 | `selection-manipulator.selection.keep-every-nth` | Selection - Keep Every Nth Selection | N 個ごとに 1 つの選択だけを残す | `[a] [b] [c] [d]（N=2）` → `[b] [d]` | なし | なし |
| MSEL-004 | MSEL | 基本 | `selection-manipulator.selection.remove-first` | Selection - Remove First Selection | 文書順で最初の選択を外す | `[a] [b] [c]` → `[b] [c]` | なし | なし |
| MSEL-005 | MSEL | 基本 | `selection-manipulator.selection.remove-last` | Selection - Remove Last Selection | 文書順で最後の選択を外す | `[a] [b] [c]` → `[a] [b]` | なし | なし |
| MSEL-006 | MSEL | 基本 | `selection-manipulator.selection.keep-matching` | Selection - Keep Selections Matching Regex | 入力した正規表現に一致する選択だけを残す | `[a1] [b] [c2]（\d）` → `[a1] [c2]` | なし | なし |
| MSEL-007 | MSEL | 基本 | `selection-manipulator.selection.remove-matching` | Selection - Remove Selections Matching Regex | 入力した正規表現に一致する選択を外す | `[a1] [b] [c2]（\d）` → `[b]` | なし | なし |
| MSEL-008 | MSEL | 基本 | `selection-manipulator.selection.remove-empty` | Selection - Remove Empty Selections | 空の選択（カーソルのみ）を外す | `[a] [] [b]` → `[a] [b]` | なし | なし |
| MSEL-009 | MSEL | 基本 | `selection-manipulator.selection.remove-duplicate-text` | Selection - Deselect Duplicate Texts | 同じテキストの選択が複数あれば最初の 1 つだけを残す | `[a] [b] [a]` → `[a] [b]` | なし | なし |
| MSEL-010 | MSEL | 基本 | `selection-manipulator.selection.align-cursors` | Selection - Align Cursors | 各カーソルの前に空白を入れて、すべてのカーソルを同じ桁に揃える | `a\|=1⏎bbb\|=2（\| はカーソル）` → `a··\|=1⏎bbb\|=2` | なし | なし |
| MSEL-011 | MSEL | 基本 | `selection-manipulator.selection.expand-to-word` | Selection - Expand to Word | 各カーソルを単語全体の選択に広げる | `he\|llo` → `[hello]` | なし | なし |
| MSEL-012 | MSEL | 基本 | `selection-manipulator.selection.expand-to-quotes` | Selection - Expand to Inside Quotes | 各カーソルを囲んでいる引用符の内側全体の選択に広げる | `"he\|llo"` → `"[hello]"` | なし | なし |
| MSEL-013 | MSEL | 基本 | `selection-manipulator.selection.expand-to-brackets` | Selection - Expand to Inside Brackets | 各カーソルを囲んでいる括弧の内側全体の選択に広げる | `f(a,\|b)` → `f([a,b])` | なし | なし |
| MSEL-014 | MSEL | 基本 | `selection-manipulator.selection.trim` | Selection - Trim Whitespace from Selections | 各選択の前後の空白を選択範囲から外す | `[··ab·]` → `··[ab]·` | なし | なし |
| MSEL-015 | MSEL | 基本 | `selection-manipulator.selection.shrink-both-sides` | Selection - Shrink Selections by One Character | 各選択の両端を 1 文字ずつ内側に縮める（テキストは変更しない） | `["ab"]` → `"[ab]"` | なし | なし |
| MSEL-016 | MSEL | 基本 | `selection-manipulator.selection.extend-to-delimiter` | Selection - Extend to Next Delimiter | 各選択の終端を、入力した区切り文字の直前まで伸ばす | `[a]bc,d（,）` → `[abc],d` | なし | なし |
| MSEL-017 | MSEL | 基本 | `selection-manipulator.selection.split-by-delimiter` | Selection - Split Selections by Delimiter | 1 つの選択を、入力した区切り文字で複数の選択に分ける | `[a,b,c]（,）` → `[a],[b],[c]` | なし | なし |
| MSEL-018 | MSEL | 基本 | `selection-manipulator.selection.split-by-regex` | Selection - Split Selections by Regex | 1 つの選択を、正規表現に一致する部分で分けて複数の選択にする | `[a1b2c]（\d）` → `[a]1[b]2[c]` | なし | なし |
| MSEL-019 | MSEL | 基本 | `selection-manipulator.selection.split-words` | Selection - Split into Words | 各選択を単語ごとの選択に分ける | `[foo bar]` → `[foo] [bar]` | なし | なし |
| MSEL-020 | MSEL | 基本 | `selection-manipulator.selection.cursor-to-line-content-start` | Selection - Cursors to First Non-whitespace | 選択範囲の各行で、最初の空白以外の文字の前にカーソルを置く | `··a⏎····b` → `··\|a⏎····\|b` | なし | なし |
| MSEL-021 | MSEL | 基本 | `selection-manipulator.selection.select-column` | Selection - Select Column N | 各行で、入力した区切り文字の N 列目を選択する | `a,b⏎c,d（列 2）` → `a,[b]⏎c,[d]` | なし | なし |
| MSEL-022 | MSEL | 基本 | `selection-manipulator.selection.select-numbers` | Selection - Select All Numbers | 選択範囲内の数値をすべて選択する | `a1 b22` → `a[1] b[22]` | なし | なし |
| MSEL-023 | MSEL | 基本 | `selection-manipulator.selection.select-strings` | Selection - Select All Quoted Strings | 選択範囲内の引用符で囲まれた文字列の中身をすべて選択する | `f("a", 'b')` → `f("[a]", '[b]')` | なし | なし |
| MSEL-024 | MSEL | 基本 | `selection-manipulator.selection.select-urls` | Selection - Select All URLs | 選択範囲内の URL をすべて選択する（既存 Extract URL は抽出、こちらは選択） | `see https://a.example and https://b.example` → `see [https://a.example] and [https://b.example]` | なし | なし |
| MSEL-025 | MSEL | 基本 | `selection-manipulator.selection.rotate-forward` | Selection - Rotate Texts Forward | 選択どうしのテキストを 1 つ後ろへ循環させる | `[a] [b] [c]` → `[c] [a] [b]` | なし | なし |
| MSEL-026 | MSEL | 基本 | `selection-manipulator.selection.rotate-backward` | Selection - Rotate Texts Backward | 選択どうしのテキストを 1 つ前へ循環させる | `[a] [b] [c]` → `[b] [c] [a]` | なし | なし |
| MSEL-027 | MSEL | 基本 | `selection-manipulator.selection.swap-two` | Selection - Swap Two Selections | 2 つの選択のテキストを入れ替える | `[foo] = [bar]` → `[bar] = [foo]` | なし | なし |
| MSEL-028 | MSEL | 基本 | `selection-manipulator.selection.copy-first-to-all` | Selection - Copy First Selection to All | 最初の選択のテキストを他のすべての選択に書き込む | `[x] [a] [b]` → `[x] [x] [x]` | なし | なし |
| MSEL-029 | MSEL | 基本 | `selection-manipulator.selection.info` | Selection - Show Selection Info | 選択数・各選択の文字数・行番号の一覧を通知表示する | `[ab] [c]` → `2 selections: L1 (2), L3 (1)（通知）` | なし | なし |
| MSEL-030 | MSEL | 基本 | `selection-manipulator.selection.select-indentation` | Selection - Select Leading Indentation | 選択範囲の各行の先頭インデント部分を選択する | `··a⏎····b` → `[··]a⏎[····]b` | なし | なし |

### MD

**Markdown・ドキュメント整形（見出しレベル・リスト化・リンク化・目次生成）** — 基本機能 25 件・派生 0 件・小計 25 件

| ID | カテゴリ | 種別 | 提案コマンド ID | タイトル | 概要 | 入出力例 | 外部通信 | 新規依存 |
|---|---|---|---|---|---|---|---|---|
| MD-001 | MD | 基本 | `selection-manipulator.markdown.heading-increase` | Markdown: Increase Heading Level | 見出しレベルを 1 つ深くする（見出しでない行は見出し 1 にする） | `# a⏎## b` → `## a⏎### b` | なし | なし |
| MD-002 | MD | 基本 | `selection-manipulator.markdown.heading-decrease` | Markdown: Decrease Heading Level | 見出しレベルを 1 つ浅くする（# 1 個の見出しは本文にする） | `## a` → `# a` | なし | なし |
| MD-003 | MD | 基本 | `selection-manipulator.markdown.toc` | Markdown: Generate Table of Contents | 選択範囲（または文書）の見出しからアンカーリンク付きの目次を生成する | `# A⏎## B C` → `- [A](#a)⏎··- [B C](#b-c)` | なし | なし |
| MD-004 | MD | 基本 | `selection-manipulator.markdown.bullet-list` | Markdown: Convert Lines to Bullet List | 各行を「- 」の箇条書きにする | `a⏎b` → `- a⏎- b` | なし | なし |
| MD-005 | MD | 基本 | `selection-manipulator.markdown.numbered-list` | Markdown: Convert Lines to Numbered List | 各行を番号付きリストにする | `a⏎b` → `1. a⏎2. b` | なし | なし |
| MD-006 | MD | 基本 | `selection-manipulator.markdown.task-list` | Markdown: Convert Lines to Task List | 各行を未完了のタスクリストにする | `a⏎b` → `- [ ] a⏎- [ ] b` | なし | なし |
| MD-007 | MD | 基本 | `selection-manipulator.markdown.toggle-task` | Markdown: Toggle Task Checkbox | タスクの完了・未完了を切り替える | `- [ ] a` → `- [x] a` | なし | なし |
| MD-008 | MD | 基本 | `selection-manipulator.markdown.remove-list-markers` | Markdown: Remove List Markers | 箇条書き・番号・チェックボックスの記号を取り除く | `- [ ] a⏎2. b` → `a⏎b` | なし | なし |
| MD-009 | MD | 基本 | `selection-manipulator.markdown.renumber-list` | Markdown: Renumber Ordered List | 番号付きリストの番号を 1 から振り直す（入れ子は階層ごと） | `1. a⏎5. b⏎2. c` → `1. a⏎2. b⏎3. c` | なし | なし |
| MD-010 | MD | 基本 | `selection-manipulator.markdown.bold` | Markdown: Bold | 選択テキストを太字記法で囲む | `abc` → `**abc**` | なし | なし |
| MD-011 | MD | 基本 | `selection-manipulator.markdown.italic` | Markdown: Italic | 選択テキストを斜体記法で囲む | `abc` → `_abc_` | なし | なし |
| MD-012 | MD | 基本 | `selection-manipulator.markdown.strikethrough` | Markdown: Strikethrough | 選択テキストを取り消し線記法で囲む | `abc` → `~~abc~~` | なし | なし |
| MD-013 | MD | 基本 | `selection-manipulator.markdown.setext-to-atx` | Markdown: Convert Setext Headings to ATX | 下線（=== / ---）形式の見出しを # / ## 形式の見出しにする | `Title⏎=====⏎Sub⏎---` → `# Title⏎## Sub` | なし | なし |
| MD-014 | MD | 基本 | `selection-manipulator.markdown.code-block` | Markdown: Wrap in Code Fence | 選択範囲を、入力した言語名付きのコードフェンスで囲む | `a = 1（python）` → ```` ```python⏎a = 1⏎``` ```` | なし | なし |
| MD-015 | MD | 基本 | `selection-manipulator.markdown.blockquote` | Markdown: Blockquote | 各行の先頭に「&gt; 」を付けて引用にする | `a⏎b` → `> a⏎> b` | なし | なし |
| MD-016 | MD | 基本 | `selection-manipulator.markdown.image` | Markdown: Image | URL を画像記法にする（代替テキストは入力） | `https://example.com/a.png` → `![alt](https://example.com/a.png)` | なし | なし |
| MD-017 | MD | 基本 | `selection-manipulator.markdown.linkify-urls` | Markdown: Linkify URLs | 本文中の裸の URL をすべて &lt;URL&gt; 形式の自動リンクにする | `see https://example.com` → `see <https://example.com>` | なし | なし |
| MD-018 | MD | 基本 | `selection-manipulator.markdown.format-table` | Markdown: Format Table | Markdown の表の列幅と区切り行を揃えて整形する（配置指定は保持） | `\|a\|bb\|⏎\|-\|-\|⏎\|ccc\|d\|` → `\| a   \| bb \|⏎\| --- \| -- \|⏎\| ccc \| d  \|` | なし | なし |
| MD-019 | MD | 基本 | `selection-manipulator.markdown.to-html` | Markdown: Convert to HTML | Markdown を HTML にする。完全な CommonMark 準拠は自前実装の負担が大きい | `# a⏎**b**` → `<h1>a</h1>⏎<p><strong>b</strong></p>` | なし | あり（CommonMark 準拠パーサ（例: markdown-it）。代替案: 見出し・強調・リスト・リンクだけのサブセットを自前実装する） |
| MD-020 | MD | 基本 | `selection-manipulator.markdown.strip` | Markdown: Strip Formatting | Markdown の記号を取り除いてプレーンテキストにする | `# A **b** [c](d)` → `A b c` | なし | なし |
| MD-021 | MD | 基本 | `selection-manipulator.markdown.heading-to-anchor` | Markdown: Heading to Anchor Link | 見出しから GitHub 形式のアンカーリンクを作る | `## Hello World!` → `[Hello World!](#hello-world)` | なし | なし |
| MD-022 | MD | 基本 | `selection-manipulator.markdown.footnote` | Markdown: Convert to Footnote | 選択テキストを脚注にし、本文に参照記号を残して末尾へ脚注定義を追加する | `本文（補足）` → `本文[^1] … [^1]: 補足` | なし | なし |
| MD-023 | MD | 基本 | `selection-manipulator.markdown.reference-links` | Markdown: Inline Links to Reference Links | インラインリンクを参照リンクに変換し、定義を末尾にまとめる | `[a](https://x.example)` → `[a][1]⏎⏎[1]: https://x.example` | なし | なし |
| MD-024 | MD | 基本 | `selection-manipulator.markdown.details` | Markdown: Wrap in Details Block | 選択範囲を折りたたみ（details / summary 要素）で囲む | `長い本文（要約: 詳細）` → `<details><summary>詳細</summary>⏎⏎長い本文⏎⏎</details>` | なし | なし |
| MD-025 | MD | 基本 | `selection-manipulator.markdown.front-matter-to-json` | Markdown: Front Matter to JSON | 先頭の YAML フロントマターを js-yaml で読み込み JSON にする | `---⏎title: a⏎---` → `{"title":"a"}` | なし | なし |

## 子チケット対応表

各候補 ID は、次の ID 範囲のうちちょうど 1 つに含まれる。CI 整備は別の子チケットで行う（表の下に記載）。

| チケット ID | カテゴリ | ID 範囲 | 件数 |
|---|---|---|---|
| SELEC-00002 | CASE | CASE-001〜CASE-030 | 30 |
| SELEC-00003 | WS | WS-001〜WS-035 | 35 |
| SELEC-00004 | LINE | LINE-001〜LINE-040 | 40 |
| SELEC-00005 | SORT | SORT-001〜SORT-030 | 30 |
| SELEC-00006 | WRAP | WRAP-001〜WRAP-030 | 30 |
| SELEC-00007 | ENC | ENC-001〜ENC-040 | 40 |
| SELEC-00008 | HASH | HASH-001〜HASH-020 | 20 |
| SELEC-00009 | DATA | DATA-001〜DATA-040 | 40 |
| SELEC-00010 | TABLE | TABLE-001〜TABLE-030 | 30 |
| SELEC-00011 | NUM | NUM-001〜NUM-040 | 40 |
| SELEC-00012 | DATE | DATE-001〜DATE-030 | 30 |
| SELEC-00013 | GEN | GEN-001〜GEN-030 | 30 |
| SELEC-00014 | JA | JA-001〜JA-035 | 35 |
| SELEC-00015 | UNI | UNI-001〜UNI-030 | 30 |
| SELEC-00016 | DEV | DEV-001〜DEV-035 | 35 |
| SELEC-00017 | MSEL | MSEL-001〜MSEL-030 | 30 |
| SELEC-00018 | MD | MD-001〜MD-025 | 25 |

CI 整備（lint・GitHub Actions・Dependabot・CodeQL）: SELEC-00019
