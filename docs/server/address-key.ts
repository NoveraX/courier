import { isIP } from "node:net"

/**
 * Whom a call's address counts as for a budget: an IPv4 address as it is,
 * an IPv6 one by its /64 network, which one subscriber is given whole and
 * could spend address by address — as Courier's own limit counts them —
 * and one caller, `unknown`, for every call that names none.
 *
 * @param address - The header's value, as the call carried it
 * @returns The key
 * @example
 * ```ts
 * addressKey("2001:db8:1:2::7") // "2001:db8:1:2::/64"
 * ```
 */
export function addressKey(address: string | string[] | undefined): string {
  if (typeof address !== "string") return "unknown"
  const family = isIP(address)
  if (family === 4) return address
  if (family !== 6) return "unknown"
  return `${networkOf(address).join(":")}::/64`
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
