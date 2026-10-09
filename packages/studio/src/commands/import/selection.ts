import type { CourierImportEntry, CourierImportSelector } from "@noverax/courier/config";

import type { GenerateOptions, ParsedSpec } from "../../apis";
import { filterSpec } from "../../apis/filter-spec";
import { SELECTOR_KEYS } from "../../server/selector-text";

function canonical(selector: CourierImportSelector | undefined): string {
  return JSON.stringify(SELECTOR_KEYS.map((key) => [...(selector?.[key] ?? [])].sort()));
}

/**
 * The endpoints a write generates when the command names some with
 * `--include` or `--exclude`, picked as Import API's Select step picks
 * them; the import's declaration records the selectors, which every update
 * applies again.
 *
 * @param spec - The specification as parsed
 * @param options - The options, with the selectors the command named
 * @returns The endpoints by group, or `null` for every endpoint
 * @throws {Error} When the selectors leave no endpoint
 * @example
 * ```ts
 * selectedBy(spec, { ...options, include: { tags: ["pets"] } }); // { pets: ["list", "get"] }
 * ```
 */
export function selectedBy(
  spec: ParsedSpec,
  options: GenerateOptions,
): Record<string, string[]> | null {
  if (options.include === undefined && options.exclude === undefined) return null;
  const kept = filterSpec(spec, options.include, options.exclude);
  if (kept.groups.length === 0) {
    throw new Error("--include and --exclude leave none of the specification's endpoints");
  }
  return Object.fromEntries(
    kept.groups.map((group) => [group.name, group.endpoints.map((endpoint) => endpoint.name)]),
  );
}

/**
 * Refuse selectors other than those the import is declared with: an update
 * generates from the declaration, so the files would change back at the
 * next one. A selector the command does not name is the declaration's.
 *
 * @param name - The import's name
 * @param declared - Its entry under `imports`, when the config has one
 * @param options - The options, with the selectors the command named
 * @throws {Error} When a selector differs from the declared one
 * @example
 * ```ts
 * checkDeclaredSelectors("pets", config.imports?.pets, options);
 * ```
 */
export function checkDeclaredSelectors(
  name: string,
  declared: CourierImportEntry | undefined,
  options: GenerateOptions,
): void {
  if (declared === undefined) return;
  for (const key of ["include", "exclude"] as const) {
    if (options[key] === undefined || canonical(options[key]) === canonical(declared[key]))
      continue;
    throw new Error(
      `courier.config.ts declares ${name} with another ${key}: change it there, or leave --${key} out`,
    );
  }
}
