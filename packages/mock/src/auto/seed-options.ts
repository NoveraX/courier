import type { AutoScenarioOptions } from "./auto-seed";
import type { SeedConfig } from "./prefix-mappings";
import { parseSeedConfig } from "./prefix-mappings";

/** Records per collection when a mock declares no `seed.count` */
export const DEFAULT_SEED_COUNT = 20;

/**
 * The seeding a mock declares: `seed.count` records in every collection
 * (20 unless set), and the count under a group's name for that group.
 *
 * A mock is seeded this way when it starts, and again whenever its store is
 * reset or re-seeded without a count of its own — by `/__admin/reset` or from
 * Studio alike.
 *
 * @param seed - The mock's `seed` option
 * @returns The options `seedAllCollections` takes
 * @example
 * ```ts
 * seedAllCollections(routes, store, seedOptionsOf({ count: 6, pets: 25 }));
 * ```
 */
export function seedOptionsOf(seed?: SeedConfig): Required<AutoScenarioOptions> {
  return {
    seedCount: seed?.count ?? DEFAULT_SEED_COUNT,
    seedOverrides: parseSeedConfig(seed),
  };
}
