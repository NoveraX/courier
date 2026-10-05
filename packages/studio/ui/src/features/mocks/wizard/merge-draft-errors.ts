import type { DraftErrors } from "./types";

/**
 * The problems to show on each draft: those found while typing, and
 * Studio's where nothing was found on that field while typing.
 *
 * @param local - `validateDrafts` for the drafts as they are
 * @param server - Studio's field errors, by draft position
 * @returns Each draft's problems by position; a draft without any is absent
 *
 * @example
 * ```ts
 * mergeDraftErrors(new Map(), new Map([[0, { key: "courier.mocks.ts already declares api" }]]));
 * // → Map { 0 => { key: "courier.mocks.ts already declares api" } }
 * ```
 */
export function mergeDraftErrors(
  local: ReadonlyMap<number, DraftErrors>,
  server: ReadonlyMap<number, DraftErrors>,
): Map<number, DraftErrors> {
  const merged = new Map<number, DraftErrors>();
  for (const index of new Set([...local.keys(), ...server.keys()])) {
    const typed = local.get(index) ?? {};
    const told = server.get(index) ?? {};
    merged.set(index, {
      source: typed.source ?? told.source,
      key: typed.key ?? told.key,
      port: typed.port ?? told.port,
      seedCount: typed.seedCount ?? told.seedCount,
      endpoints: typed.endpoints ?? told.endpoints,
      fixtures: typed.fixtures ?? told.fixtures,
    });
  }
  return merged;
}
