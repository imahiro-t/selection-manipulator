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
