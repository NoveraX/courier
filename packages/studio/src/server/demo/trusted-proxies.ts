import { BlockList, isIP } from "node:net";
import { CourierError } from "@noverax/courier";

/** The proxies before the one in front of Studio — a CDN, a DDoS filter — whose `X-Forwarded-For` entries Studio reads past. */
export interface TrustedProxies {
  /**
   * Whether an address is one of them.
   *
   * @param address - An address as a socket or `X-Forwarded-For` gives it
   * @returns `true` for a trusted proxy's address
   */
  has(address: string): boolean;
  /**
   * The header these proxies set to the address that connected to them —
   * `ddg-connecting-ip`, `cf-connecting-ip` — lower-cased as Node gives
   * headers, when the demo names one.
   */
  readonly addressHeader?: string | undefined;
}

/** No proxy but Studio's own, which needs no naming: it is on this machine or a private network. */
export const NO_TRUSTED_PROXIES: TrustedProxies = { has: () => false };

const MAPPED_V4 = /^::ffff:(\d{1,3}(?:\.\d{1,3}){3})$/i;
const RANGE = /^([^/]+)(?:\/(\d{1,3}))?$/;
/* A header's name, as HTTP spells a token. */
const HEADER_NAME = /^[!#$%&'*+.^_`|~0-9A-Za-z-]+$/;

/**
 * The proxies a public demo is reached through — a CDN, a WAF, a DDoS
 * filter in front of the proxy on Studio's own network — from their
 * addresses and CIDR ranges, IPv4 and IPv6.
 *
 * @param entries - Addresses, such as `203.0.113.7`, and ranges, such as `198.51.100.0/24`
 * @param addressHeader - The header they set to the address that connected to them, if any
 * @returns What tells their addresses, and names the header
 * @throws {CourierError} `STUDIO_DEMO_PROXY_INVALID` for an entry that is neither, or a
 * range that takes in every address, or a header that is no header's name
 * @example
 * ```ts
 * const trusted = trustedProxies(["198.51.100.0/24", "2001:db8:100::/48"]);
 * trusted.has("198.51.100.7"); // true
 * ```
 */
export function trustedProxies(
  entries: readonly string[] = [],
  addressHeader?: string,
): TrustedProxies {
  const header = headerName(addressHeader);
  if (entries.length === 0) return NO_TRUSTED_PROXIES;
  const list = new BlockList();
  for (const entry of entries) add(list, entry.trim());
  return {
    has(address) {
      const plain = plainAddress(address);
      const family = isIP(plain);
      return family !== 0 && list.check(plain, family === 6 ? "ipv6" : "ipv4");
    },
    addressHeader: header,
  };
}

function headerName(raw: string | undefined): string | undefined {
  const name = raw?.trim();
  if (name === undefined || name === "") return undefined;
  if (!HEADER_NAME.test(name)) {
    throw invalid("addressHeader", name, "is no header's name, such as DDG-Connecting-IP");
  }
  return name.toLowerCase();
}

/**
 * An address as the checks compare it: without brackets or a zone, and an
 * IPv4 address IPv6 maps as itself.
 *
 * @param address - As a socket or a header gives it
 * @returns The address alone
 * @example
 * ```ts
 * plainAddress("[::ffff:10.0.1.4]"); // "10.0.1.4"
 * ```
 */
export function plainAddress(address: string): string {
  const bare = address.replace(/^\[|\]$/g, "").split("%")[0] ?? address;
  return MAPPED_V4.exec(bare)?.[1] ?? bare;
}

function add(list: BlockList, entry: string): void {
  const [, address = "", bits] = RANGE.exec(entry) ?? [];
  const family = isIP(address);
  const prefix = bits === undefined ? undefined : Number(bits);
  if (family === 0 || (prefix !== undefined && prefix > (family === 6 ? 128 : 32))) {
    throw invalid(
      "trustedProxies",
      entry,
      "is neither an address nor a range of them, such as 203.0.113.7 or 198.51.100.0/24",
    );
  }
  if (prefix === 0) {
    throw invalid(
      "trustedProxies",
      entry,
      "takes in every address, so any a visitor writes in X-Forwarded-For would count",
    );
  }
  const type = family === 6 ? "ipv6" : "ipv4";
  if (prefix === undefined) list.addAddress(address, type);
  else list.addSubnet(address, prefix, type);
}

function invalid(option: string, entry: string, problem: string): CourierError {
  return new CourierError(`"${entry}" in the demo's ${option} ${problem}.`, {
    code: "STUDIO_DEMO_PROXY_INVALID",
    context: { entry },
  });
}
