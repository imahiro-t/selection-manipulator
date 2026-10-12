/**
 * Shared by the commands that write standard SQL string literals (`'` doubled): TABLE-012
 * CSV - Convert to SQL INSERT, WRAP-006 Quote: SQL IN List and DEV-007 Escape SQL String Literal
 * (vscode-independent, no imports). All three refuse the same characters, checked here: control
 * characters other than tab, CR and LF, a backslash and a yen sign.
 */

/**
 * Control characters other than tab, CR and LF: U+0000..U+0008, U+000B, U+000C, U+000E..U+001F
 * and DEL (U+007F), NUL included. Tabs and line breaks are valid inside an SQL string literal and
 * stay allowed; the others are invisible in most editors and would go into the query unnoticed.
 * This is about consistency and catching stray characters, not injection: none of them can end a
 * literal. A single character class without quantifiers or the `g` flag (linear, no lastIndex).
 */
export const SQL_CONTROL_CHARACTER = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/;

/** The reason for SQL_CONTROL_CHARACTER (TABLE-012's messages read `… contains a control character`). */
export const SQL_CONTROL_CHARACTER_REASON = 'a control character';

/**
 * Why a backslash is refused: the literals and quoted names are standard SQL, where `\` is an
 * ordinary character, but MySQL / MariaDB in their default mode (without NO_BACKSLASH_ESCAPES)
 * read `\'` / `\"` as an escaped quote, so a value could end the literal and inject SQL there.
 * Refusing is safe for every dialect; escaping `\` as `\\` would be wrong for standard SQL.
 */
export const SQL_BACKSLASH_REASON = "a backslash (\\), which is not safe in MySQL's default mode (the SQL is written as standard SQL)";

/**
 * Why a yen sign (U+00A5) is refused too: VS Code (iconv-lite) saves it as the byte 0x5C, the
 * backslash, in Shift_JIS, CP932 and EUC-JP, so the saved SQL has the same `\'` problem even
 * though the editor shows `¥`. No other character is encoded as a lone 0x5C in the encodings
 * VS Code offers.
 */
export const SQL_YEN_SIGN_REASON =
  "a yen sign (¥), which is saved as a backslash in Shift_JIS, CP932 and EUC-JP and is not safe in MySQL's default mode (the SQL is written as standard SQL)";

/**
 * The reason `text` cannot go into a generated SQL literal or quoted name (a control character
 * other than tab, CR and LF, a backslash, or a yen sign that becomes one when saved), or undefined
 * when it can. A control character is reported first, then a backslash, then a yen sign.
 */
export const sqlUnsafeCharacterReason = (text: string): string | undefined => {
  if (SQL_CONTROL_CHARACTER.test(text)) {
    return SQL_CONTROL_CHARACTER_REASON;
  }
  if (text.includes('\\')) {
    return SQL_BACKSLASH_REASON;
  }
  if (text.includes('¥')) {
    return SQL_YEN_SIGN_REASON;
  }
  return undefined;
};
