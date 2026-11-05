import { isIP } from "node:net"

/** The one caller every call that names no address counts as. */
export const UNKNOWN_ADDRESS = "unknown"

/**
 * Whom a call's address counts as for a budget: an IPv4 address as it is,
 * an IPv6 one by its network — its /64, which one subscriber is given whole
 * and could spend address by address, as Courier's own limit counts them,
 * or its /48, the most one subscriber may be given — and one caller,
 * `unknown`, for every call that names none.
 *
 * @param address - The header's value, as the call carried it
 * @param prefix - The IPv6 network's length
 * @returns The key
 * @example
 * ```ts
 * addressKey("2001:db8:1:2::7") // "2001:db8:1:2::/64"
 * addressKey("2001:db8:1:2::7", 48) // "2001:db8:1::/48"
 * ```
 */
export function addressKey(address: string | string[] | undefined, prefix: 48 | 64 = 64): string {
  if (typeof address !== "string") return UNKNOWN_ADDRESS
  const family = isIP(address)
  if (family === 4) return address
  if (family !== 6) return UNKNOWN_ADDRESS
  const groups = networkOf(address).slice(0, prefix / 16)
  return `${groups.join(":")}::/${prefix}`
}

/* The first four groups of an IPv6 address, written out: what `::` stands for, filled in. */
function networkOf(address: string): string[] {
  const [head = "", tail] = address.split("::")
  const left = head === "" ? [] : head.split(":")
  if (tail === undefined) return left.slice(0, 4).map(group)
  const right = tail === "" ? [] : tail.split(":")
  /* An IPv4 address at the end, as in ::ffff:192.0.2.1, takes two groups' room. */
  const taken = right.reduce((count, part) => count + (part.includes(".") ? 2 : 1), 0)
  const zeros = Array.from({ length: 8 - left.length - taken }, () => "0")
  return [...left, ...zeros, ...right].slice(0, 4).map(group)
}

function group(hex: string): string {
  return Number.parseInt(hex, 16).toString(16)
}
