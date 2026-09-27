import type { ParsedSpec } from "../parser/types";

/** The one group an import generated flat is listed under. */
export const FLAT_GROUP = "api";

/**
 * Tell whether an import is generated flat: its endpoints live in its
 * `source.ts`, with no group files.
 *
 * @param options - The import's generation options
 * @returns Whether it is flat
 */
export function isFlatImport(options: { groupBy?: string }): boolean {
  return options.groupBy === "single";
}

/**
 * The specification as a flat import is listed: every endpoint in one
 * group, {@link FLAT_GROUP}, as they are in its `source.ts`.
 *
 * @param spec - The parsed specification
 * @returns The specification with its groups merged into one
 */
export function flatSpec(spec: ParsedSpec): ParsedSpec {
  const endpoints = spec.groups.flatMap((group) => group.endpoints);
  return { ...spec, groups: [{ name: FLAT_GROUP, description: "", prefix: "", endpoints }] };
}

/**
 * Turn endpoints picked in a flat import's one group into the selection the
 * generator takes: by the specification's own groups.
 *
 * @param spec - The parsed specification
 * @param names - The endpoints picked
 * @returns The same endpoints, by the group of the specification each is in
 * @example
 * ```ts
 * specSelection(spec, ["createPet", "listUsers"]); // → { pets: ["createPet"], users: ["listUsers"] }
 * ```
 */
export function specSelection(
  spec: ParsedSpec,
  names: readonly string[],
): Record<string, string[]> {
  const wanted = new Set(names);
  const selection: Record<string, string[]> = {};
  for (const group of spec.groups) {
    const picked = group.endpoints
      .filter((endpoint) => wanted.has(endpoint.name))
      .map((endpoint) => endpoint.name);
    if (picked.length > 0) selection[group.name] = picked;
  }
  return selection;
}
