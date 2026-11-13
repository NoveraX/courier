import { callerKeyOf } from "@noverax/courier/server"

/** The one caller every call that names no address counts as, by Courier's key for it. */
export const UNKNOWN_ADDRESS = callerKeyOf(undefined)

/**
 * Whom a call's address counts as for a budget: the key Courier's own
 * limit counts it by — an IPv4 address as it is, an IPv6 one by its /64,
 * which one subscriber is given whole and could spend address by address —
 * or, for a budget of a network, an IPv6 address by its /48, the most one
 * subscriber may be given; and one caller, `unknown`, for every call that
 * names none.
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
  const key = callerKeyOf(typeof address === "string" ? address : undefined)
  if (prefix === 64 || !key.endsWith("::/64")) return key
  return `${key.split(":").slice(0, 3).join(":")}::/48`
}
