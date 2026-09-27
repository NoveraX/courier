import type { Program } from "oxc-parser";
import type { ConfigSpecifiers } from "./config-specifiers";
import { findConfigLocals } from "./find-config-locals";
import { firstFreeName } from "./first-free-name";
import type { ModuleBindings } from "./module-bindings";

/** The name a mocks file reads the config under, and the import that binds it. */
export interface ConfigImport {
  local: string;
  /** The module specifier of that import: the existing one's, or the one to add. */
  specifier: string;
  /** Whether the import has to be added. */
  add: boolean;
}

/* The name a new import of the config takes, when it is free. */
const CONFIG_LOCAL = "courierConfig";

/**
 * Decide the name the config's default export is read under: the first
 * value import of it by an accepted specifier is reused under its own name;
 * otherwise a new import by the preferred specifier takes the first free of
 * `courierConfig`, `courierConfig2`, …
 *
 * @param program - The parsed mocks file
 * @param bindings - Every name the file binds at its top level
 * @param specifiers - The specifiers that import the config, and the one a new import uses
 * @returns The local name, the specifier it is imported by, and whether that import has to be added
 *
 * @example
 * ```ts
 * // const courierConfig = 1;
 * resolveConfigImport(program, bindings, configSpecifiers("courier.config.ts", false));
 * // → { local: "courierConfig2", specifier: "./courier.config", add: true }
 * ```
 */
export function resolveConfigImport(
  program: Program,
  bindings: ModuleBindings,
  specifiers: ConfigSpecifiers,
): ConfigImport {
  const [existing] = findConfigLocals(program, specifiers.accepted);
  if (existing !== undefined) {
    return { local: existing.name, specifier: existing.specifier, add: false };
  }
  const local = firstFreeName(CONFIG_LOCAL, bindings);
  return { local, specifier: specifiers.preferred, add: true };
}
