/**
 * DEV-020..022: color codes (vscode-independent).
 *
 * Each line of the selection is converted on its own: empty (or blank) lines stay as they are, the
 * spaces around a color are kept, and one line that is not a color makes the whole selection an
 * error. Every regular expression is a constant anchored at both ends without nested quantifiers,
 * and every function is linear in the length of its input.
 */
import { convertEachLine } from './devCommon';

const HEX_COLOR = /^(#?)([0-9a-f]{3}|[0-9a-f]{4}|[0-9a-f]{6}|[0-9a-f]{8})$/i;

/** The red, green, blue and alpha bytes of a 3, 4, 6 or 8 digit hex color. */
const hexBytes = (digits: string): number[] => {
  const long = digits.length <= 4 ? [...digits].map((d) => d + d).join('') : digits;
  const bytes: number[] = [];
  for (let i = 0; i < long.length; i += 2) {
    bytes.push(parseInt(long.slice(i, i + 2), 16));
  }
  return bytes;
};

/** A number with at most two decimals and no trailing zeros (`0.5`, `1`, `0.25`). */
const shortDecimal = (value: number): string => String(Math.round(value * 100) / 100);

// ---------------------------------------------------------------------------------------------
// DEV-020 hex → HSL
// ---------------------------------------------------------------------------------------------

const hexToHslValue = (value: string): string | undefined => {
  const match = HEX_COLOR.exec(value);
  if (!match) {
    return undefined;
  }
  const [red, green, blue, alpha] = hexBytes(match[2]);
  const r = red / 255;
  const g = green / 255;
  const b = blue / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const lightness = (max + min) / 2;
  let hue = 0;
  let saturation = 0;
  const delta = max - min;
  if (delta !== 0) {
    saturation = lightness > 0.5 ? delta / (2 - max - min) : delta / (max + min);
    if (max === r) {
      hue = (g - b) / delta + (g < b ? 6 : 0);
    } else if (max === g) {
      hue = (b - r) / delta + 2;
    } else {
      hue = (r - g) / delta + 4;
    }
    hue *= 60;
  }
  const h = Math.round(hue) % 360;
  const s = Math.round(saturation * 100);
  const l = Math.round(lightness * 100);
  return alpha === undefined
    ? `hsl(${h}, ${s}%, ${l}%)`
    : `hsla(${h}, ${s}%, ${l}%, ${shortDecimal(alpha / 255)})`;
};

/**
 * DEV-020: `#rgb` / `#rrggbb` (the `#` may be left out) → `hsl(h, s%, l%)`, `#rgba` / `#rrggbbaa`
 * → `hsla(h, s%, l%, a)`. The hue, saturation and lightness are rounded to integers, the alpha to
 * at most two decimals.
 */
export const hexToHsl = (text: string, budget: number): string =>
  convertEachLine(text, budget, hexToHslValue, 'a hex color (#rgb, #rgba, #rrggbb or #rrggbbaa)');

// ---------------------------------------------------------------------------------------------
// DEV-021 HSL → hex
// ---------------------------------------------------------------------------------------------

const NUMBER = '[+-]?(?:[0-9]+(?:\\.[0-9]*)?|\\.[0-9]+)(?:e[+-]?[0-9]+)?';
const HUE = new RegExp(`^(${NUMBER})(deg)?$`, 'i');
const PERCENT = new RegExp(`^(${NUMBER})%$`, 'i');
const ALPHA = new RegExp(`^(${NUMBER})(%)?$`, 'i');
const HSL_START = /^hsla?\(/i;
const SPACES = /[ \t\f]+/;

const clamp = (value: number, min: number, max: number): number => Math.min(max, Math.max(min, value));

/** The parts of `hsl(h, s%, l%[, a])` or `hsl(h s% l%[ / a])`, or undefined. */
const hslParts = (value: string): string[] | undefined => {
  const start = HSL_START.exec(value);
  if (!start || !value.endsWith(')')) {
    return undefined;
  }
  const inner = value.slice(start[0].length, -1).trim();
  if (inner.includes(',')) {
    const parts = inner.split(',').map((part) => part.trim());
    return parts.length === 3 || parts.length === 4 ? parts : undefined;
  }
  const slash = inner.split('/');
  if (slash.length > 2) {
    return undefined;
  }
  const parts = slash[0].trim().split(SPACES);
  if (parts.length !== 3) {
    return undefined;
  }
  if (slash.length === 2) {
    parts.push(slash[1].trim());
  }
  return parts;
};

const toHexByte = (value: number): string => Math.round(clamp(value, 0, 1) * 255).toString(16).padStart(2, '0');

const hslToHexValue = (value: string): string | undefined => {
  const parts = hslParts(value);
  if (!parts) {
    return undefined;
  }
  const hue = HUE.exec(parts[0]);
  const saturation = PERCENT.exec(parts[1]);
  const lightness = PERCENT.exec(parts[2]);
  const alpha = parts.length === 4 ? ALPHA.exec(parts[3]) : undefined;
  if (!hue || !saturation || !lightness || alpha === null) {
    return undefined;
  }
  const numbers = [Number(hue[1]), Number(saturation[1]), Number(lightness[1]), alpha ? Number(alpha[1]) : 1];
  if (!numbers.every(Number.isFinite)) {
    return undefined;
  }
  const h = ((numbers[0] % 360) + 360) % 360;
  const s = clamp(numbers[1], 0, 100) / 100;
  const l = clamp(numbers[2], 0, 100) / 100;
  const a = clamp(alpha && alpha[2] === '%' ? numbers[3] / 100 : numbers[3], 0, 1);
  // https://www.w3.org/TR/css-color-4/#hsl-to-rgb
  const channel = (n: number): number => {
    const k = (n + h / 30) % 12;
    return l - s * Math.min(l, 1 - l) * Math.max(-1, Math.min(k - 3, 9 - k, 1));
  };
  const hex = `#${toHexByte(channel(0))}${toHexByte(channel(8))}${toHexByte(channel(4))}`;
  const alphaByte = toHexByte(a);
  return alphaByte === 'ff' ? hex : hex + alphaByte;
};

/**
 * DEV-021: `hsl()` / `hsla()` with commas or spaces (`hsl(120 100% 25% / 0.5)`), the hue with or
 * without `deg`, the alpha as a number or a percentage → `#rrggbb` (`#rrggbbaa` when the alpha is
 * below 1), in lower case.
 */
export const hslToHex = (text: string, budget: number): string =>
  convertEachLine(text, budget, hslToHexValue, 'an HSL color (hsl(h, s%, l%) or hsla(h, s%, l%, a))');

// ---------------------------------------------------------------------------------------------
// DEV-022 hex short ↔ long
// ---------------------------------------------------------------------------------------------

const toggleHexValue = (value: string): string | undefined => {
  const match = HEX_COLOR.exec(value);
  if (!match) {
    return undefined;
  }
  const [, hash, digits] = match;
  if (digits.length <= 4) {
    return hash + [...digits].map((d) => d + d).join('');
  }
  let short = '';
  for (let i = 0; i < digits.length; i += 2) {
    if (digits[i] !== digits[i + 1]) {
      // Cannot be shortened: kept as it is.
      return value;
    }
    short += digits[i];
  }
  return hash + short;
};

/**
 * DEV-022: `#rrggbb` / `#rrggbbaa` whose digits come in equal pairs → `#rgb` / `#rgba`, and
 * `#rgb` / `#rgba` → `#rrggbb` / `#rrggbbaa`. A long color that cannot be shortened is kept. The
 * case of the digits and the `#` (or its absence) are kept.
 */
export const toggleHexLength = (text: string, budget: number): string =>
  convertEachLine(text, budget, toggleHexValue, 'a hex color (#rgb, #rgba, #rrggbb or #rrggbbaa)');
