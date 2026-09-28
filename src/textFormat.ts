/**
 * Pure (vscode-independent) text formatting helpers shared by several command categories.
 */

/**
 * Quotes `text` like `JSON.stringify` for use in an error message, cutting it off
 * after `maxLength` characters of the escaped form and appending `…` inside the
 * quotes when it was cut. Text that fits is returned exactly as `JSON.stringify(text)`.
 *
 * The limit counts UTF-16 code units of the escaped text (so `\n` counts as 2 and
 * `\u0001` as 6), which keeps the result bounded even for text full of control
 * characters; surrogate pairs and escape sequences are never split. Only the first
 * few code points are examined, so huge text costs constant time.
 */
export const quoteForDisplay = (text: string, maxLength: number): string => {
  let shown = '';
  for (const ch of text) {
    const escaped = JSON.stringify(ch).slice(1, -1);
    if (shown.length + escaped.length > maxLength) {
      return `"${shown}…"`;
    }
    shown += escaped;
  }
  return `"${shown}"`;
};
