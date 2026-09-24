import type { ModuleBindings } from "./module-bindings";

/**
 * The first of `base`, `base2`, `base3`, … that the module does not bind.
 *
 * @param base - The preferred name
 * @param bindings - The names the module binds at its top level
 * @returns A name free to import under
 *
 * @example
 * ```ts
 * firstFreeName("courierConfig", new Map([["courierConfig", 7]])); // → "courierConfig2"
 * ```
 */
export function firstFreeName(base: string, bindings: ModuleBindings): string {
  if (!bindings.has(base)) return base;
  let suffix = 2;
  while (bindings.has(`${base}${suffix}`)) suffix += 1;
  return `${base}${suffix}`;
}
