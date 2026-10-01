/**
 * DEVX-007..009: hex colors to OKLCH, the WCAG contrast ratio of two colors and the inverted color
 * (vscode-independent).
 *
 * Each line of the selection is converted on its own (`convertEachLine`): blank lines and the
 * spaces around a value are kept, and one line that is not a color makes the whole selection an
 * error. Every regular expression is a constant anchored at both ends without nested quantifiers;
 * everything is plain arithmetic, linear in the input.
 */
import { convertEachLine } from './devCommon';
import { HEX_COLOR, hexBytes } from './devColor';

/** A number rounded to `decimals` places, without trailing zeros and never `-0`. */
const round = (value: number, decimals: number): string => {
  const scale = 10 ** decimals;
  const rounded = Math.round(value * scale) / scale;
  return String(rounded === 0 ? 0 : rounded);
};

/** sRGB channel (0..255) → linear light (0..1), as CSS Color 4 and WCAG 2.x define it. */
const linearChannel = (byte: number): number => {
  const c = byte / 255;
  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
};

// ---------------------------------------------------------------------------------------------
// DEVX-007 hex → OKLCH
// ---------------------------------------------------------------------------------------------

/** A chroma below this is shown as 0 with the hue 0 (the hue of a gray is meaningless). */
const ACHROMATIC = 0.0005;

/** OKLab (Björn Ottosson, as in CSS Color 4) of linear sRGB; returns [L, a, b]. */
const linearSrgbToOklab = (r: number, g: number, b: number): [number, number, number] => {
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  return [
    0.2104542553 * l + 0.7936177850 * m - 0.0040720468 * s,
    1.9779984951 * l - 2.4285922050 * m + 0.4505937099 * s,
    0.0259040371 * l + 0.7827717662 * m - 0.8086757660 * s,
  ];
};

const hexToOklchValue = (value: string): string | undefined => {
  const match = HEX_COLOR.exec(value);
  if (!match) {
    return undefined;
  }
  const [red, green, blue, alpha] = hexBytes(match[2]);
  const [lightness, a, b] = linearSrgbToOklab(linearChannel(red), linearChannel(green), linearChannel(blue));
  const chroma = Math.hypot(a, b);
  let hue = 0;
  if (chroma >= ACHROMATIC) {
    hue = (Math.atan2(b, a) * 180) / Math.PI;
    if (hue < 0) {
      hue += 360;
    }
    if (Number(round(hue, 2)) >= 360) {
      hue = 0;
    }
  }
  const l = round(Math.min(Math.max(lightness, 0), 1) * 100, 1);
  const c = chroma >= ACHROMATIC ? round(chroma, 3) : '0';
  const body = `${l}% ${c} ${round(hue, 2)}`;
  return alpha === undefined ? `oklch(${body})` : `oklch(${body} / ${round(alpha / 255, 2)})`;
};

/**
 * DEVX-007: `#rgb` / `#rrggbb` (the `#` may be left out) → `oklch(L% C H)`, `#rgba` / `#rrggbbaa`
 * → `oklch(L% C H / a)`. L has at most one decimal, C three and H two (trailing zeros dropped);
 * a gray has the chroma and hue 0.
 */
export const hexToOklch = (text: string, budget: number): string =>
  convertEachLine(text, budget, hexToOklchValue, 'a hex color (#rgb, #rgba, #rrggbb or #rrggbbaa)');

// ---------------------------------------------------------------------------------------------
// DEVX-008 WCAG contrast ratio
// ---------------------------------------------------------------------------------------------

/** A hex color without alpha: 3 or 6 digits, the `#` optional. */
const OPAQUE_HEX = /^#?(?:[0-9a-f]{3}|[0-9a-f]{6})$/i;
/** The separator of the two colors: a comma (spaces around it allowed) or spaces. */
const PAIR_SEPARATOR = /[ \t]*,[ \t]*|[ \t]+/;

/** WCAG 2.x relative luminance of an opaque hex color. */
const luminance = (color: string): number => {
  const [r, g, b] = hexBytes(color.replace('#', ''));
  return 0.2126 * linearChannel(r) + 0.7152 * linearChannel(g) + 0.0722 * linearChannel(b);
};

/** The WCAG 2.x levels of a contrast ratio (normal text: AA 4.5, AAA 7; large text: AA 3). */
export const contrastLevel = (ratio: number): string => {
  if (ratio >= 7) {
    return 'AAA';
  }
  if (ratio >= 4.5) {
    return 'AA';
  }
  return ratio >= 3 ? 'AA Large' : 'Fail';
};

/**
 * The ratio is judged as computed (WCAG does not round it) with a tolerance for floating point
 * error, and shown cut (not rounded) to two decimals, so the shown ratio never reaches a level
 * the judgement did not.
 */
const contrastValue = (value: string): string | undefined => {
  const colors = value.split(PAIR_SEPARATOR);
  if (colors.length !== 2 || !colors.every((color) => OPAQUE_HEX.test(color))) {
    return undefined;
  }
  const [first, second] = colors.map(luminance);
  const ratio = (Math.max(first, second) + 0.05) / (Math.min(first, second) + 0.05) + 1e-9;
  const shown = Math.floor(ratio * 100) / 100;
  return `${shown}:1 (${contrastLevel(ratio)})`;
};

/**
 * DEVX-008: two colors on a line (`#000000 #ffffff` or `#000, #fff`; 3 or 6 digits, no alpha) →
 * their WCAG 2.x contrast ratio and level: `21:1 (AAA)`. The levels are AAA (≥ 7), AA (≥ 4.5),
 * AA Large (≥ 3, large text only) and Fail.
 */
export const colorContrastRatio = (text: string, budget: number): string =>
  convertEachLine(text, budget, contrastValue, 'two hex colors (e.g. #000000 #ffffff)');

// ---------------------------------------------------------------------------------------------
// DEVX-009 invert
// ---------------------------------------------------------------------------------------------

const invertValue = (value: string): string | undefined => {
  const match = HEX_COLOR.exec(value);
  if (!match) {
    return undefined;
  }
  const [, hash, digits] = match;
  // 3 / 6 digits are all color; the 4th / the 7th and 8th digits are the alpha, kept as it is.
  const colorDigits = digits.length === 4 || digits.length === 8 ? digits.length - digits.length / 4 : digits.length;
  const upper = /[A-F]/.test(digits) && !/[a-f]/.test(digits);
  let inverted = '';
  for (let i = 0; i < colorDigits; i++) {
    const digit = (15 - parseInt(digits[i], 16)).toString(16);
    inverted += upper ? digit.toUpperCase() : digit;
  }
  return hash + inverted + digits.slice(colorDigits);
};

/**
 * DEVX-009: a hex color with each of red, green and blue replaced by 255 minus it (`#112233` →
 * `#eeddcc`). The number of digits, the `#` (or its absence), the alpha and the case are kept (the
 * result is in upper case only when the input has upper case letters and no lower case ones).
 */
export const colorInvert = (text: string, budget: number): string =>
  convertEachLine(text, budget, invertValue, 'a hex color (#rgb, #rgba, #rrggbb or #rrggbbaa)');
