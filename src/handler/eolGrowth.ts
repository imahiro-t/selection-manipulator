/**
 * How many characters replacing every line break of a text with the document's line break adds.
 *
 * Shared by the WS and WRAP commands, which count the characters they add (not the net change:
 * removed characters are not subtracted) to keep a result within their output limit. Replacing a
 * line break with `eol` adds `max(0, eol.length - its length)` characters: in a CRLF document a
 * `\n` or a lone `\r` becomes `\r\n` (one more character), while `\r\n` stays as it is; in an LF
 * document nothing grows (a `\r\n` that becomes `\n` is shorter, which is not subtracted).
 */
export const countEolGrowth = (text: string, eol: string): number => {
  if (eol.length <= 1) {
    // No line break is shorter than one character.
    return 0;
  }
  let growth = 0;
  for (let i = 0; i < text.length; i++) {
    const code = text.charCodeAt(i);
    if (code === 0x0d) {
      if (text.charCodeAt(i + 1) === 0x0a) {
        growth += Math.max(0, eol.length - 2);
        i++;
      } else {
        growth += eol.length - 1;
      }
    } else if (code === 0x0a) {
      growth += eol.length - 1;
    }
  }
  return growth;
};
