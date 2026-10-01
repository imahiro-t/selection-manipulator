/**
 * DEVX-019..023: UUID format, CIDR ranges, IPv6 expansion / compression and IPv4 ↔ integer
 * (vscode-independent).
 *
 * Addresses are parsed by hand (no `net` module, no name resolution, nothing is sent anywhere) and
 * only computed: a range is described by its ends and its size, never listed. Each line is
 * converted on its own; every regular expression is a constant anchored at both ends without
 * nested quantifiers.
 */
import { convertEachLine } from './devCommon';

// ---------------------------------------------------------------------------------------------
// DEVX-019 UUID
// ---------------------------------------------------------------------------------------------

const UUID_HYPHENATED = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const UUID_PLAIN = /^[0-9a-f]{32}$/i;
const URN_PREFIX = 'urn:uuid:';

const normalizeUuid = (value: string): string | undefined => {
  let body = value;
  if (body.toLowerCase().startsWith(URN_PREFIX)) {
    body = body.slice(URN_PREFIX.length);
  } else if (body.startsWith('{') && body.endsWith('}')) {
    body = body.slice(1, -1);
  }
  if (!UUID_HYPHENATED.test(body) && !UUID_PLAIN.test(body)) {
    return undefined;
  }
  const digits = body.replace(/-/g, '').toLowerCase();
  return `${digits.slice(0, 8)}-${digits.slice(8, 12)}-${digits.slice(12, 16)}-${digits.slice(16, 20)}-${digits.slice(20)}`;
};

/**
 * DEVX-019: a UUID in braces, as a URN (`urn:uuid:…`), without hyphens or with them in the
 * standard places, in any case → lower case `8-4-4-4-12`. Hyphens in other places are an error.
 */
export const uuidNormalize = (text: string, budget: number): string =>
  convertEachLine(text, budget, normalizeUuid, 'a UUID (32 hex digits, optionally with hyphens, braces or urn:uuid:)');

// ---------------------------------------------------------------------------------------------
// Addresses
// ---------------------------------------------------------------------------------------------

/** A decimal octet: 0..255 without leading zeros (`01` could be read as octal). */
const OCTET = /^(?:0|[1-9][0-9]{0,2})$/;
const HEX_GROUP = /^[0-9a-f]{1,4}$/i;
const ZONE_ID = /^[A-Za-z0-9_.-]{1,64}$/;
const PREFIX_LENGTH = /^(?:0|[1-9][0-9]{0,2})$/;

/** A dotted IPv4 address as an unsigned 32-bit number, or undefined. */
const parseIpv4 = (text: string): number | undefined => {
  const parts = text.split('.');
  if (parts.length !== 4 || !parts.every((part) => OCTET.test(part) && Number(part) <= 255)) {
    return undefined;
  }
  return parts.reduce((value, part) => value * 256 + Number(part), 0);
};

const formatIpv4 = (value: number): string => [value >>> 24, (value >>> 16) & 0xff, (value >>> 8) & 0xff, value & 0xff].join('.');

/** An IPv6 address split into its eight 16-bit groups, with the zone ID and prefix length it had. */
interface Ipv6 {
  groups: number[];
  /** `%eth0` or `''`. */
  zone: string;
  /** `/64` or `''`. */
  prefix: string;
}

/** The groups of one side of `::` (an IPv4 address may end the last side), or undefined. */
const parseGroups = (text: string, last: boolean): number[] | undefined => {
  if (text === '') {
    return [];
  }
  const parts = text.split(':');
  const groups: number[] = [];
  for (const [i, part] of parts.entries()) {
    if (last && i === parts.length - 1 && part.includes('.')) {
      const ipv4 = parseIpv4(part);
      if (ipv4 === undefined) {
        return undefined;
      }
      groups.push(ipv4 >>> 16, ipv4 & 0xffff);
    } else if (HEX_GROUP.test(part)) {
      groups.push(parseInt(part, 16));
    } else {
      return undefined;
    }
  }
  return groups;
};

/** Parses an IPv6 address (`::` at most once, an embedded IPv4 at the end, `%zone`, `/prefix`). */
const parseIpv6 = (value: string): Ipv6 | undefined => {
  let address = value;
  let prefix = '';
  const slash = address.indexOf('/');
  if (slash >= 0) {
    const length = address.slice(slash + 1);
    if (!PREFIX_LENGTH.test(length) || Number(length) > 128) {
      return undefined;
    }
    prefix = `/${length}`;
    address = address.slice(0, slash);
  }
  let zone = '';
  const percent = address.indexOf('%');
  if (percent >= 0) {
    if (!ZONE_ID.test(address.slice(percent + 1))) {
      return undefined;
    }
    zone = address.slice(percent);
    address = address.slice(0, percent);
  }
  const halves = address.split('::');
  if (halves.length > 2) {
    return undefined;
  }
  if (halves.length === 1) {
    const groups = parseGroups(address, true);
    return groups !== undefined && groups.length === 8 ? { groups, zone, prefix } : undefined;
  }
  const head = parseGroups(halves[0], false);
  const tail = parseGroups(halves[1], true);
  if (head === undefined || tail === undefined || head.length + tail.length > 7) {
    return undefined;
  }
  return { groups: [...head, ...new Array<number>(8 - head.length - tail.length).fill(0), ...tail], zone, prefix };
};

/** RFC 5952: lower case, no leading zeros, the longest run of two or more zero groups (the first of equal ones) as `::`. */
const compressGroups = (groups: readonly number[]): string => {
  let bestStart = -1;
  let bestLength = 1;
  for (let i = 0; i < groups.length;) {
    if (groups[i] !== 0) {
      i++;
      continue;
    }
    let end = i;
    while (end < groups.length && groups[end] === 0) {
      end++;
    }
    if (end - i > bestLength) {
      bestStart = i;
      bestLength = end - i;
    }
    i = end;
  }
  const hex = groups.map((group) => group.toString(16));
  if (bestStart < 0) {
    return hex.join(':');
  }
  return `${hex.slice(0, bestStart).join(':')}::${hex.slice(bestStart + bestLength).join(':')}`;
};

const expandGroups = (groups: readonly number[]): string => groups.map((group) => group.toString(16).padStart(4, '0')).join(':');

// ---------------------------------------------------------------------------------------------
// DEVX-020 CIDR
// ---------------------------------------------------------------------------------------------

const ipv4CidrInfo = (address: number, length: number): string => {
  const hostBits = 32 - length;
  const mask = length === 0 ? 0 : (0xffffffff << hostBits) >>> 0;
  const network = (address & mask) >>> 0;
  const broadcast = (network | (~mask >>> 0)) >>> 0;
  if (length === 32) {
    return `network ${formatIpv4(network)} / first ${formatIpv4(network)} / last ${formatIpv4(network)} / hosts 1`;
  }
  if (length === 31) {
    // RFC 3021: both addresses of a point-to-point link are hosts; there is no broadcast address.
    return `network ${formatIpv4(network)} / first ${formatIpv4(network)} / last ${formatIpv4(broadcast)} / hosts 2`;
  }
  return `network ${formatIpv4(network)} / broadcast ${formatIpv4(broadcast)} / first ${formatIpv4(network + 1)}`
    + ` / last ${formatIpv4(broadcast - 1)} / hosts ${2 ** hostBits - 2}`;
};

const groupsToBigInt = (groups: readonly number[]): bigint => groups.reduce((value, group) => (value << 16n) | BigInt(group), 0n);

const bigIntToGroups = (value: bigint): number[] => {
  const groups: number[] = [];
  for (let i = 7; i >= 0; i--) {
    groups.push(Number((value >> BigInt(i * 16)) & 0xffffn));
  }
  return groups;
};

const cidrInfoValue = (value: string): string | undefined => {
  const slash = value.indexOf('/');
  if (slash < 0) {
    return undefined;
  }
  const length = value.slice(slash + 1);
  if (!PREFIX_LENGTH.test(length)) {
    return undefined;
  }
  const bits = Number(length);
  const ipv4 = parseIpv4(value.slice(0, slash));
  if (ipv4 !== undefined) {
    return bits <= 32 ? ipv4CidrInfo(ipv4, bits) : undefined;
  }
  const ipv6 = parseIpv6(value);
  if (ipv6 === undefined || ipv6.zone !== '') {
    return undefined;
  }
  const hostBits = BigInt(128 - bits);
  const all = (1n << 128n) - 1n;
  const hostMask = (1n << hostBits) - 1n;
  const network = groupsToBigInt(ipv6.groups) & (all ^ hostMask);
  const last = network | hostMask;
  return `network ${compressGroups(bigIntToGroups(network))} / last ${compressGroups(bigIntToGroups(last))} / addresses ${(1n << hostBits).toString()}`;
};

/**
 * DEVX-020: an IPv4 (`/0`..`/32`) or IPv6 (`/0`..`/128`) CIDR block → its network, broadcast,
 * first and last host and number of hosts (`192.168.1.0/24` → `network 192.168.1.0 / broadcast
 * 192.168.1.255 / first 192.168.1.1 / last 192.168.1.254 / hosts 254`). A /31 has two hosts and no
 * broadcast (RFC 3021), a /32 one host. IPv6 has no broadcast: the network, the last address and
 * the number of addresses. The address may have host bits set. Nothing is listed.
 */
export const cidrInfo = (text: string, budget: number): string =>
  convertEachLine(text, budget, cidrInfoValue, 'a CIDR block (e.g. 192.168.1.0/24 or 2001:db8::/32)');

// ---------------------------------------------------------------------------------------------
// DEVX-021..022 IPv6 expand / compress
// ---------------------------------------------------------------------------------------------

const expandIpv6Value = (value: string): string | undefined => {
  const ipv6 = parseIpv6(value);
  return ipv6 === undefined ? undefined : `${expandGroups(ipv6.groups)}${ipv6.zone}${ipv6.prefix}`;
};

const compressIpv6Value = (value: string): string | undefined => {
  const ipv6 = parseIpv6(value);
  return ipv6 === undefined ? undefined : `${compressGroups(ipv6.groups)}${ipv6.zone}${ipv6.prefix}`;
};

/**
 * DEVX-021: an IPv6 address → eight groups of four lower-case hex digits (`2001:db8::1` →
 * `2001:0db8:0000:0000:0000:0000:0000:0001`); an embedded IPv4 address becomes hex too. A zone ID
 * and a prefix length are kept.
 */
export const ipv6Expand = (text: string, budget: number): string =>
  convertEachLine(text, budget, expandIpv6Value, 'an IPv6 address');

/**
 * DEVX-022: an IPv6 address → its RFC 5952 form (lower case, leading zeros dropped, the longest run
 * of two or more zero groups as `::`, the first one when runs are equal). Only hex is written (an
 * embedded IPv4 address too). A zone ID and a prefix length are kept.
 */
export const ipv6Compress = (text: string, budget: number): string =>
  convertEachLine(text, budget, compressIpv6Value, 'an IPv6 address');

// ---------------------------------------------------------------------------------------------
// DEVX-023 IPv4 ↔ integer
// ---------------------------------------------------------------------------------------------

const UNSIGNED_32 = /^(?:0|[1-9][0-9]{0,9})$/;

const ipIntegerValue = (value: string): string | undefined => {
  const ipv4 = parseIpv4(value);
  if (ipv4 !== undefined) {
    return String(ipv4);
  }
  if (UNSIGNED_32.test(value) && Number(value) <= 0xffffffff) {
    return formatIpv4(Number(value));
  }
  return undefined;
};

/**
 * DEVX-023: a dotted IPv4 address → its unsigned 32-bit number (`192.168.0.1` → `3232235521`), and
 * a number from 0 to 4294967295 → the dotted address; each line is recognized on its own. Octets
 * with leading zeros (octal in some tools) and values out of range are errors.
 */
export const ipToInteger = (text: string, budget: number): string =>
  convertEachLine(text, budget, ipIntegerValue, 'an IPv4 address or an integer from 0 to 4294967295');
