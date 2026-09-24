import { BlockList, isIPv4, isIPv6 } from "node:net";

/** What an address is to Studio, deciding whether it may fetch from it. */
export type SpecAddressKind = "loopback" | "private" | "public";

/* Ranges that are not the public internet: private networks, shared address
   space (CGNAT, Tailscale), link-local, documentation, relay, multicast,
   reserved and broadcast. The benchmarking range 198.18.0.0/15 is not among
   them: fake-IP proxy tools (Clash, Surge) answer every name with it. */
const PRIVATE_V4: ReadonlyArray<readonly [string, number]> = [
  ["0.0.0.0", 8],
  ["10.0.0.0", 8],
  ["100.64.0.0", 10],
  ["169.254.0.0", 16],
  ["172.16.0.0", 12],
  ["192.0.0.0", 24],
  ["192.0.2.0", 24],
  ["192.88.99.0", 24],
  ["192.168.0.0", 16],
  ["198.51.100.0", 24],
  ["203.0.113.0", 24],
  ["224.0.0.0", 4],
  ["240.0.0.0", 4],
];

/* The old IPv4-compatible block, unique local, link-local, the old
   site-local, multicast, the discard prefix, both documentation prefixes,
   the IETF protocol block (Teredo among it), and NAT64's local-use prefix.
   Addresses that embed an IPv4 address are judged by it instead (see
   embeddedIPv4). */
const PRIVATE_V6: ReadonlyArray<readonly [string, number]> = [
  ["::", 96],
  ["3fff::", 20],
  ["2001::", 23],
  ["fc00::", 7],
  ["fe80::", 10],
  ["fec0::", 10],
  ["ff00::", 8],
  ["100::", 64],
  ["2001:db8::", 32],
  ["64:ff9b:1::", 48],
];

const privateV4 = new BlockList();
for (const [address, prefix] of PRIVATE_V4) privateV4.addSubnet(address, prefix, "ipv4");
const privateV6 = new BlockList();
for (const [address, prefix] of PRIVATE_V6) privateV6.addSubnet(address, prefix, "ipv6");

/**
 * Classify an IP address for fetching a specification from it.
 *
 * An IPv6 address that carries an IPv4 one — mapped (`::ffff:a.b.c.d`),
 * NAT64 (`64:ff9b::/96`) or 6to4 (`2002::/16`) — reaches that IPv4 address,
 * so it is judged as it; written in hex (`[::ffff:a9fe:a9fe]`) it would
 * otherwise slip past a check of dotted IPv4.
 *
 * @param address - An IPv4 or IPv6 address, without brackets or zone
 * @returns Whether it is this machine, a private network, or the public internet
 *
 * @example
 * ```ts
 * specAddressKind("::ffff:a9fe:a9fe"); // → "private" (169.254.169.254)
 * ```
 */
export function specAddressKind(address: string): SpecAddressKind {
  if (isIPv4(address)) return kindOfV4(address);
  if (!isIPv6(address)) return "private";
  const groups = ipv6Groups(address);
  const embedded = embeddedIPv4(groups);
  if (embedded) {
    const kind = kindOfV4(embedded.ipv4);
    /* Only a mapped address is this machine; a translated one leaves it. */
    return kind === "loopback" && !embedded.mapped ? "private" : kind;
  }
  if (groups.every((group, index) => group === (index === 7 ? 1 : 0))) return "loopback";
  if (groups.every((group) => group === 0)) return "private";
  return privateV6.check(address, "ipv6") ? "private" : "public";
}

function kindOfV4(address: string): SpecAddressKind {
  if (address.startsWith("127.")) return "loopback";
  if (address === "255.255.255.255") return "private";
  return privateV4.check(address, "ipv4") ? "private" : "public";
}

/* Mapped (::ffff:0:0/96), SIIT-translated (::ffff:0:0:0/96), NAT64
   (64:ff9b::/96) and 6to4 (2002::/16) addresses carry an IPv4 address. */
function embeddedIPv4(groups: readonly number[]): { ipv4: string; mapped: boolean } | null {
  const [g0 = 0, g1 = 0, g2 = 0, g3 = 0, g4 = 0, g5 = 0, g6 = 0, g7 = 0] = groups;
  const zeroHead = g0 === 0 && g1 === 0 && g2 === 0 && g3 === 0;
  if (zeroHead && g4 === 0 && g5 === 0xffff) return { ipv4: dotted(g6, g7), mapped: true };
  if (zeroHead && g4 === 0xffff && g5 === 0) return { ipv4: dotted(g6, g7), mapped: false };
  if (g0 === 0x64 && g1 === 0xff9b && g2 === 0 && g3 === 0 && g4 === 0 && g5 === 0) {
    return { ipv4: dotted(g6, g7), mapped: false };
  }
  if (g0 === 0x2002) return { ipv4: dotted(g1, g2), mapped: false };
  return null;
}

function dotted(high: number, low: number): string {
  return [high >> 8, high & 0xff, low >> 8, low & 0xff].join(".");
}

/* The eight 16-bit groups of an IPv6 address, a dotted IPv4 tail included. */
function ipv6Groups(address: string): number[] {
  let text = address.toLowerCase();
  const tail = /(\d+\.\d+\.\d+\.\d+)$/.exec(text);
  if (tail?.[1]) {
    const [a = 0, b = 0, c = 0, d = 0] = tail[1].split(".").map(Number);
    text = `${text.slice(0, tail.index)}${((a << 8) | b).toString(16)}:${((c << 8) | d).toString(16)}`;
  }
  const [head = "", rest] = text.split("::");
  const left = head ? head.split(":") : [];
  const right = rest === undefined ? [] : rest ? rest.split(":") : [];
  const fill = rest === undefined ? [] : Array<string>(8 - left.length - right.length).fill("0");
  return [...left, ...fill, ...right].map((group) => Number.parseInt(group, 16));
}
