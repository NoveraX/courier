/** An IPv4 or IPv6 address as a range compares it: its family and its bits. */
export interface ParsedAddress {
  readonly family: 4 | 6;
  readonly value: bigint;
}

/** An address range, such as `198.51.100.0/24`: the bits its addresses share. */
export interface AddressRange extends ParsedAddress {
  readonly bits: number;
}

const OCTET = /^(?:0|[1-9]\d{0,2})$/;
const GROUP = /^[\da-f]{1,4}$/i;
const IPV4_WITH_PORT = /^(\d{1,3}(?:\.\d{1,3}){3}):\d{1,5}$/;
const BRACKETED = /^\[([^\]]+)\](?::\d{1,5})?$/;
const MAPPED_PREFIX = 0xffffn << 32n;

/**
 * An address as a header or a socket writes it, reduced to the address:
 * without the brackets and port an IPv6 address may come in, the port some
 * load balancers append to an IPv4 one, or an IPv6 zone.
 *
 * @param text - The address as written
 * @returns The address alone, trimmed
 * @example
 * ```ts
 * plainAddress("[2001:db8::1]:443"); // → "2001:db8::1"
 * plainAddress("203.0.113.7:51234"); // → "203.0.113.7"
 * ```
 */
export function plainAddress(text: string): string {
  const trimmed = text.trim();
  const inBrackets = BRACKETED.exec(trimmed)?.[1] ?? trimmed;
  const withoutPort = IPV4_WITH_PORT.exec(inBrackets)?.[1] ?? inBrackets;
  return withoutPort.split("%")[0] ?? withoutPort;
}

/**
 * Read an IPv4 or IPv6 address; an IPv4 address IPv6 maps, `::ffff:a.b.c.d`,
 * is read as the IPv4 address it is.
 *
 * @param text - The address, as `plainAddress` leaves it
 * @returns The address, or `undefined` for anything that is not one
 * @example
 * ```ts
 * parseAddress("::ffff:10.0.0.7"); // → { family: 4, value: 167772167n }
 * ```
 */
export function parseAddress(text: string): ParsedAddress | undefined {
  const v4 = parseIPv4(text);
  if (v4 !== undefined) return { family: 4, value: v4 };
  const v6 = parseIPv6(text);
  if (v6 === undefined) return undefined;
  if (v6 >> 32n === MAPPED_PREFIX >> 32n) return { family: 4, value: v6 & 0xffffffffn };
  return { family: 6, value: v6 };
}

/**
 * Read an address range — an address with the number of bits its network
 * takes, or an address alone, a range of one.
 *
 * @param text - Such as `198.51.100.0/24`, `2001:db8::/32` or `203.0.113.7`
 * @returns The range, or `undefined` for anything that is not one
 * @example
 * ```ts
 * parseRange("198.51.100.0/24"); // → { family: 4, value: 3325256704n, bits: 24 }
 * ```
 */
export function parseRange(text: string): AddressRange | undefined {
  const [address = "", bits, ...rest] = text.trim().split("/");
  if (rest.length > 0) return undefined;
  const parsed = parseAddress(address);
  if (parsed === undefined) return undefined;
  const width = parsed.family === 4 ? 32 : 128;
  if (bits === undefined) return { ...parsed, bits: width };
  if (!/^\d{1,3}$/.test(bits) || Number(bits) > width) return undefined;
  return { ...parsed, bits: Number(bits) };
}

/**
 * Whether an address lies in a range.
 *
 * @param address - The address
 * @param range - The range
 * @returns `true` when both are of one family and share the range's bits
 * @example
 * ```ts
 * inRange(parseAddress("198.51.100.7")!, parseRange("198.51.100.0/24")!); // → true
 * ```
 */
export function inRange(address: ParsedAddress, range: AddressRange): boolean {
  if (address.family !== range.family) return false;
  const shift = BigInt((range.family === 4 ? 32 : 128) - range.bits);
  return address.value >> shift === range.value >> shift;
}

function parseIPv4(text: string): bigint | undefined {
  const octets = text.split(".");
  if (octets.length !== 4) return undefined;
  let value = 0n;
  for (const octet of octets) {
    if (!OCTET.test(octet) || Number(octet) > 255) return undefined;
    value = (value << 8n) | BigInt(octet);
  }
  return value;
}

function parseIPv6(text: string): bigint | undefined {
  const halves = text.split("::");
  if (halves.length > 2) return undefined;
  const head = groupsOf(halves[0] ?? "");
  const tail = halves.length === 2 ? groupsOf(halves[1] ?? "") : [];
  if (head === undefined || tail === undefined) return undefined;
  const missing = 8 - head.length - tail.length;
  if (halves.length === 2 ? missing < 1 : missing !== 0) return undefined;
  const groups = [...head, ...Array<number>(halves.length === 2 ? missing : 0).fill(0), ...tail];
  return groups.reduce((value, group) => (value << 16n) | BigInt(group), 0n);
}

/* The 16-bit groups of one side of `::`, an IPv4 address last counting as two. */
function groupsOf(side: string): number[] | undefined {
  if (side === "") return [];
  const parts = side.split(":");
  const groups: number[] = [];
  for (const [index, part] of parts.entries()) {
    const v4 = index === parts.length - 1 ? parseIPv4(part) : undefined;
    if (v4 !== undefined) groups.push(Number(v4 >> 16n), Number(v4 & 0xffffn));
    else if (GROUP.test(part)) groups.push(Number.parseInt(part, 16));
    else return undefined;
  }
  return groups;
}
