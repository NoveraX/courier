import { createLogger } from "../logger";
import {
  type AddressRange,
  inRange,
  parseAddress,
  parseRange,
  plainAddress,
} from "../utils/ip-address";

const log = createLogger("Proxy");

/* A header's name, as HTTP spells one. */
const HEADER_NAME = /^[!#$%&'*+.^_`|~0-9A-Za-z-]+$/;

/**
 * The proxies a deployment is reached through beyond its own network — a
 * CDN, a WAF, a DDoS filter — whose word about the user's address Courier
 * takes, as `COURIER_TRUSTED_PROXIES` and `COURIER_CLIENT_ADDRESS_HEADER`
 * name them.
 */
export interface AddressTrust {
  /**
   * Whether an address is one of those proxies.
   *
   * @param address - An address as a socket or `X-Forwarded-For` gives it
   * @returns `true` for an address in one of their ranges
   */
  has(address: string): boolean;
  /**
   * The header they name the address that connected to them in, such as
   * DDoS-Guard's `ddg-connecting-ip` or Cloudflare's `cf-connecting-ip`,
   * lower-cased.
   */
  readonly header?: string | undefined;
}

/** No proxy beyond the deployment's own network: the default. */
export const NO_TRUSTED_PROXIES: AddressTrust = { has: () => false };

/**
 * The proxies named by their addresses and ranges, IPv4 and IPv6, and the
 * header they name the user's address in.
 *
 * @param entries - Addresses, such as `203.0.113.7`, and ranges, such as `198.51.100.0/24`
 * @param header - The header those proxies set to the address that connected to them
 * @returns The trust, and the entries that are neither an address nor a range — a
 * range of every address among them, which would let anyone name any address
 * @example
 * ```ts
 * const { trust } = addressTrust(["198.51.100.0/24"], "DDG-Connecting-IP");
 * trust.has("198.51.100.9"); // → true
 * ```
 */
export function addressTrust(
  entries: readonly string[],
  header?: string,
): { trust: AddressTrust; invalid: string[] } {
  const ranges: AddressRange[] = [];
  const invalid: string[] = [];
  for (const entry of entries.map((text) => text.trim()).filter(Boolean)) {
    const range = parseRange(entry);
    if (range === undefined || range.bits === 0) invalid.push(entry);
    else ranges.push(range);
  }
  const name = header?.trim().toLowerCase() || undefined;
  if (name !== undefined && !HEADER_NAME.test(name)) invalid.push(name);
  const trust: AddressTrust = {
    has(address) {
      const parsed = parseAddress(plainAddress(address));
      return parsed !== undefined && ranges.some((range) => inRange(parsed, range));
    },
    header: name !== undefined && HEADER_NAME.test(name) && ranges.length > 0 ? name : undefined,
  };
  return { trust: ranges.length > 0 ? trust : NO_TRUSTED_PROXIES, invalid };
}

let cached: { key: string; trust: AddressTrust } | undefined;

/**
 * The deployment's trusted proxies, read from `COURIER_TRUSTED_PROXIES` — a
 * comma-separated list of addresses and ranges — and
 * `COURIER_CLIENT_ADDRESS_HEADER`. An entry that is neither an address nor
 * a range is left out, and the log says so once: a mistyped range trusts
 * nobody rather than everybody.
 *
 * @returns The trust; none where the variables are unset, or the runtime has no environment
 * @example
 * ```ts
 * // COURIER_TRUSTED_PROXIES=192.0.2.0/24 COURIER_CLIENT_ADDRESS_HEADER=DDG-Connecting-IP
 * deploymentTrust().has("192.0.2.17"); // → true
 * ```
 */
export function deploymentTrust(): AddressTrust {
  const env = typeof process === "undefined" ? undefined : process.env;
  const list = env?.COURIER_TRUSTED_PROXIES ?? "";
  const header = env?.COURIER_CLIENT_ADDRESS_HEADER ?? "";
  const key = `${list}\n${header}`;
  if (cached?.key === key) return cached.trust;
  const { trust, invalid } = addressTrust(list.split(","), header);
  if (invalid.length > 0) {
    log.warn(
      `Left out of COURIER_TRUSTED_PROXIES and COURIER_CLIENT_ADDRESS_HEADER: ${invalid.join(", ")}. Name addresses, such as 203.0.113.7, ranges short of every address, such as 198.51.100.0/24, and a header's name, such as DDG-Connecting-IP.`,
    );
  }
  if (header.trim() !== "" && trust === NO_TRUSTED_PROXIES && invalid.length === 0) {
    log.warn(
      "COURIER_CLIENT_ADDRESS_HEADER is read only from requests the proxies COURIER_TRUSTED_PROXIES names passed on, and it names none.",
    );
  }
  cached = { key, trust };
  return trust;
}
