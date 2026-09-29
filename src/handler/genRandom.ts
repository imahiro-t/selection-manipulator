/**
 * Pure (vscode-independent) part of the GEN-001..019 random commands: one function per command
 * and the parsers of the values typed into the input boxes.
 *
 * Every function takes a `GenRandom` (crypto in the extension, a fixed sequence in tests) and
 * returns the text for one selection or cursor. Values are chosen with `GenRandom.below` /
 * `pickInclusive` (unbiased) or taken from `GenRandom.bytes`; `Math.random` is never used.
 * Floating-point arithmetic is never used either: GEN-007 works on decimal strings and safe
 * integers only.
 *
 * Only local processing: no network, files or processes, no `eval` / `new Function`, no new
 * dependency.
 */
import { civilFromDays, formatCivil, pad4 } from './dateCommon';
import {
  assertGenInputLength,
  formatCount,
  GEN_FLOAT_MAX_ABS,
  GEN_FLOAT_MAX_DIGITS,
  GEN_MAX_DICE_COUNT,
  GEN_MAX_DICE_SIDES,
  GEN_MAX_RANDOM_COUNT,
  GEN_MIN_DICE_SIDES,
  GenInputError,
  GenOutputBuffer,
  GenRandom,
  isBlank,
  isCivilDayForm,
  parseCivilDay,
  pickInclusive,
  pickOne,
  quoteText,
  rangeTooWide,
  splitLines,
} from './genCommon';

/** One byte as two lower-case hexadecimal digits. */
const hexByte = (b: number): string => b.toString(16).padStart(2, '0');

const hex = (bytes: Uint8Array): string => Array.from(bytes, hexByte).join('');

/** Throws unless `ms` fits the 48-bit timestamp of a UUID v7 or a ULID (0 ≤ ms < 2^48). */
const assertTimestamp = (ms: number): void => {
  if (!Number.isSafeInteger(ms) || ms < 0 || ms >= 2 ** 48) {
    throw new RangeError('the timestamp is out of range');
  }
};

/** The 48-bit big-endian bytes of a millisecond timestamp (0 ≤ ms < 2^48). */
const timestampBytes = (ms: number): number[] => {
  assertTimestamp(ms);
  const bytes: number[] = [];
  let rest = ms;
  for (let i = 0; i < 6; i++) {
    bytes.unshift(rest % 256);
    rest = Math.floor(rest / 256);
  }
  return bytes;
};

// ---------------------------------------------------------------------------------------------
// GEN-001 UUID v7 / GEN-002 ULID / GEN-003 NanoID / GEN-004 Hex / GEN-005 Base64URL
// ---------------------------------------------------------------------------------------------

/**
 * GEN-001: a UUID version 7 (RFC 9562): 48 bits of Unix time in milliseconds, the version `7`,
 * 12 random bits, the variant `10` and 62 random bits; lower case with hyphens.
 */
export const uuidV7 = (random: GenRandom, ms: number): string => {
  const r = random.bytes(10);
  const b = [...timestampBytes(ms), 0x70 | (r[0] & 0x0f), r[1], 0x80 | (r[2] & 0x3f), ...r.subarray(3, 10)];
  const h = hex(Uint8Array.from(b));
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
};

/** Crockford's Base32 alphabet (no I, L, O, U). */
export const CROCKFORD_BASE32 = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';

/**
 * GEN-002: a ULID: 48 bits of Unix time in milliseconds (10 characters) and 80 random bits
 * (16 characters) in Crockford's Base32, upper case, 26 characters.
 */
export const ulid = (random: GenRandom, ms: number): string => {
  assertTimestamp(ms);
  let time = '';
  let rest = ms;
  for (let i = 0; i < 10; i++) {
    time = CROCKFORD_BASE32[rest % 32] + time;
    rest = Math.floor(rest / 32);
  }
  const bytes = random.bytes(10);
  let text = '';
  let buffer = 0;
  let bits = 0;
  for (const byte of bytes) {
    buffer = (buffer << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      bits -= 5;
      text += CROCKFORD_BASE32[(buffer >> bits) & 31];
    }
    buffer &= (1 << bits) - 1;
  }
  return time + text;
};

/** The 64 characters of a NanoID. */
export const NANOID_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789_-';
export const NANOID_LENGTH = 21;

/** GEN-003: a 21-character NanoID; the low 6 bits of each byte (64 divides 256, so no bias). */
export const nanoid = (random: GenRandom): string =>
  Array.from(random.bytes(NANOID_LENGTH), (b) => NANOID_ALPHABET[b & 63]).join('');

/** GEN-004: `count` random bytes as lower-case hexadecimal (2 × count characters). */
export const randomHex = (random: GenRandom, count: number): string => hex(random.bytes(count));

/** GEN-005: `count` random bytes in Base64URL (`-`, `_`, no padding). */
export const randomBase64Url = (random: GenRandom, count: number): string => Buffer.from(random.bytes(count)).toString('base64url');

// ---------------------------------------------------------------------------------------------
// GEN-006 Integer in Range
// ---------------------------------------------------------------------------------------------

export interface IntegerRange {
  min: number;
  max: number;
}

const INTEGER_RANGE = /^(-?\d+)\s*\.\.\s*(-?\d+)$/;

/**
 * GEN-006: reads `min..max` (decimal integers, both ends included). Both ends must be safe
 * integers, min ≤ max, and the range may hold at most 2^48 − 1 values.
 */
export const parseIntegerRange = (text: string): IntegerRange => {
  const match = INTEGER_RANGE.exec(text.trim());
  if (!match) {
    throw new GenInputError('enter a range of integers such as 1..100');
  }
  const [min, max] = [Number(match[1]), Number(match[2])];
  if (!Number.isSafeInteger(min) || !Number.isSafeInteger(max)) {
    throw new GenInputError(`the ends must be integers from -${Number.MAX_SAFE_INTEGER} to ${Number.MAX_SAFE_INTEGER}`);
  }
  if (min > max) {
    throw new GenInputError('the first number must not be greater than the second');
  }
  if (rangeTooWide(min, max)) {
    throw new GenInputError(`the range holds more than ${formatCount(GEN_MAX_RANDOM_COUNT)} integers`);
  }
  return { min: min === 0 ? 0 : min, max: max === 0 ? 0 : max };
};

/** GEN-006: a random integer of the range (both ends included). */
export const randomInteger = (random: GenRandom, range: IntegerRange): string => String(pickInclusive(random, range.min, range.max));

// ---------------------------------------------------------------------------------------------
// GEN-007 Float in Range
// ---------------------------------------------------------------------------------------------

const DECIMAL = /^(-?)(\d+)(?:\.(\d+))?$/;
const MAX_SAFE_DIGITS = String(Number.MAX_SAFE_INTEGER);
const MAX_ABS_DIGITS = String(GEN_FLOAT_MAX_ABS);

/** Compares two strings of digits without leading zeros as numbers. */
const compareDigits = (a: string, b: string): number => (a.length !== b.length ? a.length - b.length : a < b ? -1 : a > b ? 1 : 0);

const stripZeros = (digits: string): string => digits.replace(/^0+(?=\d)/, '');

interface Decimal {
  negative: boolean;
  integer: string;
  fraction: string;
}

/** One end of a GEN-007 range: a plain decimal (no exponent, no Infinity / NaN) with |x| ≤ 1e9. */
const parseDecimal = (text: string): Decimal => {
  const match = DECIMAL.exec(text);
  if (!match) {
    throw new GenInputError('enter a range of decimal numbers such as 0..1');
  }
  const integer = stripZeros(match[2]);
  const fraction = match[3] ?? '';
  const order = compareDigits(integer, MAX_ABS_DIGITS);
  if (order > 0 || (order === 0 && /[1-9]/.test(fraction))) {
    throw new GenInputError(`the ends must be from -${formatCount(GEN_FLOAT_MAX_ABS)} to ${formatCount(GEN_FLOAT_MAX_ABS)}`);
  }
  return { negative: match[1] === '-', integer, fraction };
};

/**
 * GEN-007: reads `min..max` (decimal numbers such as `0.1..0.3`, both ends included, min ≤ max,
 * absolute values up to 1e9). The number of decimal places is checked by `parseFloatRange`.
 */
export const parseFloatRangeText = (text: string): [Decimal, Decimal] => {
  const parts = text.trim().split('..');
  if (parts.length !== 2) {
    throw new GenInputError('enter a range of decimal numbers such as 0..1');
  }
  return [parseDecimal(parts[0].trim()), parseDecimal(parts[1].trim())];
};

/** The ends of a GEN-007 range as integers scaled by 10^digits, and the number of digits. */
export interface FloatRange {
  lo: number;
  hi: number;
  digits: number;
}

/**
 * `x × 10^digits` as a safe integer, read from the decimal digits (no floating-point
 * multiplication): `0.1` with 3 digits is `100`.
 */
const scaleDecimal = (value: Decimal, digits: number): number => {
  if (value.fraction.length > digits) {
    throw new GenInputError(`the ends have more than ${digits} decimal places`);
  }
  const scaled = stripZeros(value.integer + value.fraction.padEnd(digits, '0'));
  if (compareDigits(scaled, MAX_SAFE_DIGITS) > 0) {
    throw new GenInputError(`the ends times 10^${digits} must be at most ${Number.MAX_SAFE_INTEGER}; use fewer decimal places`);
  }
  const n = Number(scaled);
  return value.negative && n !== 0 ? -n : n;
};

const DIGITS = /^\d{1,2}$/;

/** GEN-007: reads the number of decimal places (0 to 10). */
export const parseFloatDigits = (text: string): number => {
  const trimmed = text.trim();
  const digits = Number(trimmed);
  if (!DIGITS.test(trimmed) || digits > GEN_FLOAT_MAX_DIGITS) {
    throw new GenInputError(`enter a number of decimal places from 0 to ${GEN_FLOAT_MAX_DIGITS}`);
  }
  return digits;
};

/**
 * GEN-007: the range and the number of decimal places together: the ends may not have more
 * decimal places, their absolute values times 10^digits must be safe integers, min ≤ max and the
 * range may hold at most 2^48 − 1 values at that precision.
 */
export const parseFloatRange = (rangeText: string, digitsText: string): FloatRange => {
  const [min, max] = parseFloatRangeText(rangeText);
  const digits = parseFloatDigits(digitsText);
  const lo = scaleDecimal(min, digits);
  const hi = scaleDecimal(max, digits);
  if (lo > hi) {
    throw new GenInputError('the first number must not be greater than the second');
  }
  if (rangeTooWide(lo, hi)) {
    throw new GenInputError(`the range holds more than ${formatCount(GEN_MAX_RANDOM_COUNT)} values at ${digits} decimal places; use fewer decimal places`);
  }
  return { lo, hi, digits };
};

/** `k / 10^digits` written with exactly `digits` decimal places; 0 never gets a minus sign. */
export const formatScaled = (k: number, digits: number): string => {
  const text = String(Math.abs(k)).padStart(digits + 1, '0');
  const body = digits === 0 ? text : `${text.slice(0, text.length - digits)}.${text.slice(text.length - digits)}`;
  return k < 0 ? `-${body}` : body;
};

/** GEN-007: a random number of the range with the given number of decimal places. */
export const randomFloat = (random: GenRandom, range: FloatRange): string =>
  formatScaled(pickInclusive(random, range.lo, range.hi), range.digits);

// ---------------------------------------------------------------------------------------------
// GEN-008 Pick One Line / GEN-009 Pick N Lines
// ---------------------------------------------------------------------------------------------

/** The lines of a selection that are not blank (spaces around them kept). */
export const candidateLines = (text: string): string[] => {
  assertGenInputLength(text);
  return splitLines(text).filter((line) => !isBlank(line));
};

/** GEN-008: one of the non-blank lines of the selection. */
export const pickLine = (random: GenRandom, text: string): string => {
  const lines = candidateLines(text);
  if (lines.length === 0) {
    throw new GenInputError('the selection has no lines to pick from');
  }
  return pickOne(random, lines);
};

/**
 * GEN-009: `count` different non-blank lines of the selection (different positions; equal lines
 * may both be picked) in random order (partial Fisher–Yates), joined with `eol`.
 */
export const sampleLines = (random: GenRandom, text: string, count: number, eol: string, budget: number): string => {
  const lines = candidateLines(text);
  if (count > lines.length) {
    throw new GenInputError(`the selection has only ${formatCount(lines.length)} non-blank line${lines.length === 1 ? '' : 's'}; cannot pick ${formatCount(count)}`);
  }
  const output = new GenOutputBuffer(budget);
  for (let i = 0; i < count; i++) {
    const j = i + random.below(lines.length - i);
    [lines[i], lines[j]] = [lines[j], lines[i]];
    output.push(i === 0 ? lines[i] : eol + lines[i]);
  }
  return output.join();
};

// ---------------------------------------------------------------------------------------------
// GEN-010 MAC Address / GEN-011 Hex Color / GEN-012 Date in Range
// ---------------------------------------------------------------------------------------------

/** GEN-010: a unicast, locally administered MAC address (`x2:…`), lower case, colon-separated. */
export const randomMac = (random: GenRandom): string => {
  const bytes = random.bytes(6);
  bytes[0] = (bytes[0] & 0xfc) | 0x02;
  return Array.from(bytes, hexByte).join(':');
};

/** GEN-011: `#rrggbb`, lower case. */
export const randomColor = (random: GenRandom): string => `#${hex(random.bytes(3))}`;

/** A GEN-012 range as day numbers (days from 1970-01-01). */
export interface DayRange {
  first: number;
  last: number;
}

const DATE_RANGE_FORM_ERROR = 'enter a range of dates such as 2026-01-01..2026-12-31';

/**
 * GEN-012: reads `YYYY-MM-DD..YYYY-MM-DD` (both included, 0001-01-01 to 9999-12-31, start ≤ end).
 * The form of both ends is checked first, then whether they are valid dates, then their order.
 */
export const parseDateRange = (text: string): DayRange => {
  const parts = text.trim().split('..').map((part) => part.trim());
  if (parts.length !== 2 || !parts.every(isCivilDayForm)) {
    throw new GenInputError(DATE_RANGE_FORM_ERROR);
  }
  const [first, last] = parts.map(parseCivilDay);
  if (first === undefined || last === undefined) {
    // Not reached (the form has been checked); narrows the types.
    throw new GenInputError(DATE_RANGE_FORM_ERROR);
  }
  if (first > last) {
    throw new GenInputError('the first date must not be after the second');
  }
  return { first, last };
};

/** GEN-012: a random date of the range as `YYYY-MM-DD`. */
export const randomDate = (random: GenRandom, range: DayRange): string => formatCivil(civilFromDays(pickInclusive(random, range.first, range.last)));

/** GEN-012: the default range, the whole year of `now` (local time). */
export const defaultDateRange = (now: Date): string => {
  const year = pad4(now.getFullYear());
  return `${year}-01-01..${year}-12-31`;
};

// ---------------------------------------------------------------------------------------------
// GEN-013..017 dummy data
// ---------------------------------------------------------------------------------------------

/** GEN-013: the local parts of the dummy e-mail addresses (lower case). */
export const EMAIL_WORDS: readonly string[] = [
  'user', 'test', 'sample', 'demo', 'guest', 'member', 'info', 'contact', 'dev', 'qa',
  'alice', 'bob', 'carol', 'dave', 'erin', 'frank', 'grace', 'heidi', 'ivan', 'judy',
  'mallory', 'oscar', 'peggy', 'trent', 'victor', 'walter', 'taro', 'hanako', 'jiro', 'yuki',
];

/** GEN-014: common English first names. */
export const FIRST_NAMES: readonly string[] = [
  'Emily', 'James', 'Olivia', 'William', 'Sophia', 'Benjamin', 'Emma', 'Lucas', 'Ava', 'Henry',
  'Mia', 'Alexander', 'Charlotte', 'Daniel', 'Amelia', 'Michael', 'Harper', 'Ethan', 'Evelyn', 'Jacob',
  'Abigail', 'Samuel', 'Ella', 'David', 'Grace', 'Joseph', 'Chloe', 'Thomas', 'Lily', 'Andrew',
];

/** GEN-014: common English family names. */
export const LAST_NAMES: readonly string[] = [
  'Smith', 'Johnson', 'Williams', 'Brown', 'Jones', 'Miller', 'Davis', 'Wilson', 'Anderson', 'Taylor',
  'Thomas', 'Moore', 'Martin', 'Jackson', 'Thompson', 'White', 'Harris', 'Clark', 'Lewis', 'Walker',
  'Hall', 'Allen', 'Young', 'King', 'Wright', 'Scott', 'Green', 'Baker', 'Adams', 'Nelson',
];

/** GEN-015: common Japanese family names. */
export const JA_FAMILY_NAMES: readonly string[] = [
  '佐藤', '鈴木', '高橋', '田中', '伊藤', '渡辺', '山本', '中村', '小林', '加藤',
  '吉田', '山田', '佐々木', '山口', '松本', '井上', '木村', '林', '斎藤', '清水',
  '山崎', '森', '池田', '橋本', '阿部', '石川', '山下', '中島', '石井', '小川',
];

/** GEN-015: common Japanese given names. */
export const JA_GIVEN_NAMES: readonly string[] = [
  '花子', '太郎', '一郎', '次郎', '美咲', '陽菜', '結衣', '葵', '翔太', '大輔',
  '健太', '拓也', '直樹', 'さくら', '愛', '優子', '恵', '陽子', '誠', '学',
  '浩', '亮', '悠斗', '蓮', '湊', '結菜', '莉子', '真央', '千尋', '智子',
];

/**
 * GEN-017: neutral dummy sentences; each ends with `。` and holds no other `。`, so the number of
 * `。` of a result is the number of sentences.
 */
export const JA_SENTENCES: readonly string[] = [
  'これはダミーの文章です。',
  '文字の大きさや行間を確認するために使います。',
  '今日は穏やかな天気で、窓の外には青い空が広がっています。',
  '新しい機能の説明文がここに入ります。',
  'この文章に特別な意味はありません。',
  '朝の駅はいつもより少しだけ静かでした。',
  '公園の木々が風に揺れています。',
  'レイアウトの確認が終わったら本文に差し替えてください。',
  '見出しの下には短い説明を置くと読みやすくなります。',
  '小さな川に沿って細い道が続いています。',
  '机の上にはノートと鉛筆が並んでいます。',
  'ここには商品の特徴を簡単に書きます。',
  '週末は図書館で本を読んで過ごしました。',
  '入力欄の幅が十分かどうかを確かめます。',
  '長い文章が折り返されるときの表示も確認しましょう。',
  '山の上から見る景色はとても広く感じられます。',
  '温かいお茶を飲みながら少し休憩しました。',
  'この段落は仮の内容なので後で書き換えます。',
  '季節が変わると街の色も少しずつ変わっていきます。',
  '最後までお読みいただきありがとうございます。',
];

/** GEN-013: `<word><4 digits>@example.com` (RFC 2606 reserved domain only). */
export const randomEmail = (random: GenRandom): string =>
  `${pickOne(random, EMAIL_WORDS)}${String(random.below(10_000)).padStart(4, '0')}@example.com`;

/** GEN-014: `First Last`. */
export const randomName = (random: GenRandom): string => `${pickOne(random, FIRST_NAMES)} ${pickOne(random, LAST_NAMES)}`;

/** GEN-015: `姓 名` (half-width space). */
export const randomNameJa = (random: GenRandom): string => `${pickOne(random, JA_FAMILY_NAMES)} ${pickOne(random, JA_GIVEN_NAMES)}`;

/**
 * GEN-016: a dummy mobile number `090-0xxx-xxxx` (the form of the ROADMAP; not guaranteed to be
 * unassigned).
 */
export const randomPhoneJp = (random: GenRandom): string =>
  `090-0${String(random.below(1_000)).padStart(3, '0')}-${String(random.below(10_000)).padStart(4, '0')}`;

/**
 * GEN-017: `count` sentences, each chosen independently and uniformly (the same sentence may come
 * twice in a row), joined without separators or line breaks.
 */
export const randomTextJa = (random: GenRandom, count: number, budget: number): string => {
  const output = new GenOutputBuffer(budget);
  for (let i = 0; i < count; i++) {
    output.push(pickOne(random, JA_SENTENCES));
  }
  return output.join();
};

// ---------------------------------------------------------------------------------------------
// GEN-018 Boolean / GEN-019 Dice Roll
// ---------------------------------------------------------------------------------------------

/** GEN-018: `true` or `false`. */
export const randomBoolean = (random: GenRandom): string => (random.below(2) === 1 ? 'true' : 'false');

export interface Dice {
  count: number;
  sides: number;
}

const DICE = /^(\d{1,10})[dD](\d{1,10})$/;

/**
 * GEN-019: reads `NdM` (`d` in either case, spaces around ignored): N from 1 to 100 dice with M
 * from 2 to 1,000,000 sides. `source` (the selection) is quoted in the error.
 */
export const parseDice = (text: string, source?: string): Dice => {
  assertGenInputLength(text);
  const match = DICE.exec(text.trim());
  const quoted = source === undefined ? '' : `${quoteText(source)} is not a dice roll: `;
  if (!match) {
    throw new GenInputError(`${quoted}enter dice such as 2d6 (N dice with M sides)`);
  }
  const [count, sides] = [Number(match[1]), Number(match[2])];
  if (count < 1 || count > GEN_MAX_DICE_COUNT) {
    throw new GenInputError(`${quoted}the number of dice must be from 1 to ${GEN_MAX_DICE_COUNT}`);
  }
  if (sides < GEN_MIN_DICE_SIDES || sides > GEN_MAX_DICE_SIDES) {
    throw new GenInputError(`${quoted}the number of sides must be from ${GEN_MIN_DICE_SIDES} to ${formatCount(GEN_MAX_DICE_SIDES)}`);
  }
  return { count, sides };
};

/** GEN-019: `total (a+b+…)`, each die from 1 to M. */
export const rollDice = (random: GenRandom, dice: Dice): string => {
  const rolls: number[] = [];
  for (let i = 0; i < dice.count; i++) {
    rolls.push(pickInclusive(random, 1, dice.sides));
  }
  return `${rolls.reduce((sum, roll) => sum + roll, 0)} (${rolls.join('+')})`;
};
