/**
 * Shared by the commands that write standard SQL string literals (`'` doubled): TABLE-012
 * CSV - Convert to SQL INSERT, WRAP-006 Quote: SQL IN List and DEV-007 Escape SQL String Literal
 * (vscode-independent, no imports).
 */

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
 * The reason `text` cannot go into a generated SQL literal or quoted name (a backslash, or a
 * yen sign that becomes one when saved), or undefined when it can. A backslash is reported first.
 */
export const sqlUnsafeCharacterReason = (text: string): string | undefined => {
  if (text.includes('\\')) {
    return SQL_BACKSLASH_REASON;
  }
  if (text.includes('¥')) {
    return SQL_YEN_SIGN_REASON;
  }
  return undefined;
};
