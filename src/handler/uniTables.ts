/**
 * Constant conversion tables of the UNI-016..030 Unicode commands: the styled letters, the
 * upside-down, superscript and subscript forms, the homoglyphs, the script names and the
 * Cyrillic transliteration. Everything is data kept in the extension (no dependency, no download).
 */

// ---------------------------------------------------------------------------------------------
// UNI-016..018 Mathematical alphanumeric symbols
// ---------------------------------------------------------------------------------------------

/**
 * The first code point of the upper-case letters, the lower-case letters and the digits of a
 * style of the Mathematical Alphanumeric Symbols block (`undefined`: the style has no digits).
 * The letters of each style are consecutive except for the holes listed in `MATH_HOLES`.
 */
export interface MathStyle {
  upper: number;
  lower: number;
  digits?: number;
}

export const MATH_BOLD: MathStyle = { upper: 0x1d400, lower: 0x1d41a, digits: 0x1d7ce };
export const MATH_ITALIC: MathStyle = { upper: 0x1d434, lower: 0x1d44e };
export const MATH_MONOSPACE: MathStyle = { upper: 0x1d670, lower: 0x1d68a, digits: 0x1d7f6 };

/**
 * Letters that are missing from the Mathematical Alphanumeric Symbols block because they were
 * encoded earlier (italic `h` is the Planck constant U+210E), by the code point that would hold them.
 */
export const MATH_HOLES: ReadonlyMap<number, string> = new Map([[0x1d455, 'ℎ']]);

// ---------------------------------------------------------------------------------------------
// UNI-019 Circled letters and digits
// ---------------------------------------------------------------------------------------------

/** Ⓐ..Ⓩ, ⓐ..ⓩ, ⓪ and ①..⑨. */
export const CIRCLED_UPPER = 0x24b6;
export const CIRCLED_LOWER = 0x24d0;
export const CIRCLED_ZERO = 0x24ea;
export const CIRCLED_ONE = 0x2460;

// ---------------------------------------------------------------------------------------------
// UNI-020 Upside-down text
// ---------------------------------------------------------------------------------------------

/**
 * Pairs of a character and the character that looks like it turned by 180 degrees. The table of
 * UNI-020 maps both ways, so turning a text twice gives the text back for these characters.
 */
const UPSIDE_DOWN_PAIRS: readonly (readonly [string, string])[] = [
  ['a', 'ɐ'], ['b', 'q'], ['c', 'ɔ'], ['d', 'p'], ['e', 'ǝ'], ['f', 'ɟ'], ['g', 'ƃ'], ['h', 'ɥ'],
  ['i', 'ᴉ'], ['j', 'ɾ'], ['k', 'ʞ'], ['m', 'ɯ'], ['n', 'u'], ['r', 'ɹ'], ['t', 'ʇ'], ['v', 'ʌ'],
  ['w', 'ʍ'], ['y', 'ʎ'],
  ['A', '∀'], ['B', 'ꓭ'], ['C', 'Ɔ'], ['D', 'ꓷ'], ['E', 'Ǝ'], ['F', 'Ⅎ'], ['G', '⅁'], ['J', 'ſ'],
  ['K', 'ꓘ'], ['L', '⅂'], ['M', 'W'], ['P', 'Ԁ'], ['R', 'ꓤ'], ['T', 'ꓕ'], ['U', '∩'], ['V', 'Λ'],
  ['Y', '⅄'],
  ['1', 'Ɩ'], ['2', 'ᄅ'], ['3', 'Ɛ'], ['4', 'ㄣ'], ['5', 'ϛ'], ['6', '9'], ['7', 'ㄥ'],
  ['.', '˙'], [',', '\''], ['"', '„'], ['?', '¿'], ['!', '¡'], ['(', ')'], ['[', ']'], ['{', '}'],
  ['<', '>'], ['_', '‾'], ['&', '⅋'], [';', '؛'],
];

/** UNI-020: a character → the character that looks like it upside down (both ways). */
export const UPSIDE_DOWN: ReadonlyMap<string, string> = new Map(
  UPSIDE_DOWN_PAIRS.flatMap(([a, b]) => [[a, b], [b, a]] as [string, string][])
);

// ---------------------------------------------------------------------------------------------
// UNI-023 / 024 Superscript and subscript
// ---------------------------------------------------------------------------------------------

/** The digits and the signs `+ - = ( )` (the default choice of UNI-023 / 024). */
export const SUPERSCRIPT_DIGITS: ReadonlyMap<string, string> = new Map(Object.entries({
  '0': '⁰', '1': '¹', '2': '²', '3': '³', '4': '⁴', '5': '⁵', '6': '⁶', '7': '⁷', '8': '⁸', '9': '⁹',
  '+': '⁺', '-': '⁻', '=': '⁼', '(': '⁽', ')': '⁾',
}));

/** The letters that have a superscript form (`q`, `C`, `F`, `Q`, `S`, `X`, `Y`, `Z` have none). */
export const SUPERSCRIPT_LETTERS: ReadonlyMap<string, string> = new Map(Object.entries({
  a: 'ᵃ', b: 'ᵇ', c: 'ᶜ', d: 'ᵈ', e: 'ᵉ', f: 'ᶠ', g: 'ᵍ', h: 'ʰ', i: 'ⁱ', j: 'ʲ', k: 'ᵏ', l: 'ˡ', m: 'ᵐ',
  n: 'ⁿ', o: 'ᵒ', p: 'ᵖ', r: 'ʳ', s: 'ˢ', t: 'ᵗ', u: 'ᵘ', v: 'ᵛ', w: 'ʷ', x: 'ˣ', y: 'ʸ', z: 'ᶻ',
  A: 'ᴬ', B: 'ᴮ', D: 'ᴰ', E: 'ᴱ', G: 'ᴳ', H: 'ᴴ', I: 'ᴵ', J: 'ᴶ', K: 'ᴷ', L: 'ᴸ', M: 'ᴹ', N: 'ᴺ',
  O: 'ᴼ', P: 'ᴾ', R: 'ᴿ', T: 'ᵀ', U: 'ᵁ', V: 'ⱽ', W: 'ᵂ',
}));

export const SUBSCRIPT_DIGITS: ReadonlyMap<string, string> = new Map(Object.entries({
  '0': '₀', '1': '₁', '2': '₂', '3': '₃', '4': '₄', '5': '₅', '6': '₆', '7': '₇', '8': '₈', '9': '₉',
  '+': '₊', '-': '₋', '=': '₌', '(': '₍', ')': '₎',
}));

/** The letters that have a subscript form (lower case only). */
export const SUBSCRIPT_LETTERS: ReadonlyMap<string, string> = new Map(Object.entries({
  a: 'ₐ', e: 'ₑ', h: 'ₕ', i: 'ᵢ', j: 'ⱼ', k: 'ₖ', l: 'ₗ', m: 'ₘ', n: 'ₙ', o: 'ₒ', p: 'ₚ', r: 'ᵣ',
  s: 'ₛ', t: 'ₜ', u: 'ᵤ', v: 'ᵥ', x: 'ₓ',
}));

// ---------------------------------------------------------------------------------------------
// UNI-025 Confusable characters (homoglyphs)
// ---------------------------------------------------------------------------------------------

/**
 * Cyrillic letters that look like a Latin letter, with that letter. Only well-known lookalikes:
 * this is not the full confusables.txt of Unicode.
 */
export const CYRILLIC_HOMOGLYPHS: ReadonlyMap<string, string> = new Map(Object.entries({
  'а': 'a', 'е': 'e', 'о': 'o', 'р': 'p', 'с': 'c', 'у': 'y', 'х': 'x', 'і': 'i', 'ј': 'j', 'ѕ': 's',
  'ԁ': 'd', 'ԛ': 'q', 'ԝ': 'w', 'һ': 'h', 'ӏ': 'l',
  'А': 'A', 'В': 'B', 'Е': 'E', 'К': 'K', 'М': 'M', 'Н': 'H', 'О': 'O', 'Р': 'P', 'С': 'C', 'Т': 'T',
  'У': 'Y', 'Х': 'X', 'І': 'I', 'Ј': 'J', 'Ѕ': 'S',
}));

/** Greek letters that look like a Latin letter, with that letter. */
export const GREEK_HOMOGLYPHS: ReadonlyMap<string, string> = new Map(Object.entries({
  'ο': 'o', 'α': 'a', 'ν': 'v', 'ι': 'i', 'κ': 'k',
  'Α': 'A', 'Β': 'B', 'Ε': 'E', 'Ζ': 'Z', 'Η': 'H', 'Ι': 'I', 'Κ': 'K', 'Μ': 'M', 'Ν': 'N', 'Ο': 'O',
  'Ρ': 'P', 'Τ': 'T', 'Υ': 'Y', 'Χ': 'X',
}));

// ---------------------------------------------------------------------------------------------
// UNI-029 Scripts
// ---------------------------------------------------------------------------------------------

/**
 * The scripts UNI-029 names (Unicode `Script` property values, supported by every V8 with
 * property escapes). A letter of any other script is counted as `Other`.
 */
export const SCRIPT_NAMES: readonly string[] = [
  'Latin', 'Greek', 'Cyrillic', 'Armenian', 'Hebrew', 'Arabic', 'Syriac', 'Thaana', 'Devanagari',
  'Bengali', 'Gurmukhi', 'Gujarati', 'Oriya', 'Tamil', 'Telugu', 'Kannada', 'Malayalam', 'Sinhala',
  'Thai', 'Lao', 'Tibetan', 'Myanmar', 'Georgian', 'Hangul', 'Ethiopic', 'Cherokee', 'Khmer',
  'Mongolian', 'Hiragana', 'Katakana', 'Bopomofo', 'Han', 'Yi',
];

// ---------------------------------------------------------------------------------------------
// UNI-030 Cyrillic to Latin transliteration
// ---------------------------------------------------------------------------------------------

/**
 * Lower-case Cyrillic → ASCII: Russian after a simplified BGN/PCGN with one fixed value per letter
 * (no position-dependent spelling), and the letters Russian lacks from Ukrainian, Belarusian,
 * Serbian and Macedonian. Where the languages read a letter differently the Russian value is used.
 * `ъ` and `ь` are dropped. The decomposed forms (a letter + U+0306 / U+0308) give the same result
 * as the precomposed letter. The upper-case keys are made from these.
 */
export const CYRILLIC_TO_LATIN: ReadonlyMap<string, string> = new Map(Object.entries({
  'а': 'a', 'б': 'b', 'в': 'v', 'г': 'g', 'д': 'd', 'е': 'e', 'ё': 'yo', 'ж': 'zh', 'з': 'z', 'и': 'i',
  'й': 'y', 'к': 'k', 'л': 'l', 'м': 'm', 'н': 'n', 'о': 'o', 'п': 'p', 'р': 'r', 'с': 's', 'т': 't',
  'у': 'u', 'ф': 'f', 'х': 'kh', 'ц': 'ts', 'ч': 'ch', 'ш': 'sh', 'щ': 'shch', 'ъ': '', 'ы': 'y',
  'ь': '', 'э': 'e', 'ю': 'yu', 'я': 'ya',
  // Ukrainian, Belarusian
  'є': 'ye', 'і': 'i', 'ї': 'yi', 'ґ': 'g', 'ў': 'w',
  // Serbian, Macedonian
  'ђ': 'dj', 'ј': 'j', 'љ': 'lj', 'њ': 'nj', 'ћ': 'c', 'џ': 'dz', 'ѓ': 'gj', 'ќ': 'kj', 'ѕ': 'dz',
  // Decomposed forms
  'й': 'y', 'ё': 'yo', 'ї': 'yi', 'ў': 'w', 'ѓ': 'gj', 'ќ': 'kj',
}));
