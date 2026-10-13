import { promises as dns } from "node:dns";

/**
 * How long one query to a name server may take before the resolver gives
 * up on it: a public name is answered in well under a second.
 */
export const PUBLIC_QUERY_MS = 5_000;

/** What resolves a name from DNS, and stops every query it has under way. */
export interface NameResolver {
  resolve4(hostname: string): Promise<string[]>;
  resolve6(hostname: string): Promise<string[]>;
  /** Fail every query under way at once, with `ECANCELLED`. */
  cancel(): void;
}

/**
 * A resolver of its own for one request of a caller that reaches the
 * public internet only. It asks the name servers this machine uses over
 * DNS — never the machine's own resolver, whose lookups cannot be stopped
 * and wait in the few threads every lookup of the process shares — so
 * cancelling it ends its queries, and no one else's.
 *
 * @returns The resolver, asking each name server once
 * @example
 * ```ts
 * const resolver = publicResolver();
 * const addresses = await resolver.resolve4("api.example.com");
 * ```
 */
export function publicResolver(): NameResolver {
  return new dns.Resolver({ timeout: PUBLIC_QUERY_MS, tries: 1 });
}
