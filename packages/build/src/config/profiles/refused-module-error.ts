import { CourierError } from "@noverax/courier";

import type { FrameworkMarker } from "../frameworks";

/** The import a profile refused, and the framework whose rule refused it. */
export interface RefusedModuleContext extends Record<string, unknown> {
  readonly specifier: string;
  /** The framework, as its users name it. */
  readonly framework: string | undefined;
}

/**
 * A module of the project imported one its framework refuses where
 * definitions run — Next's `client-only` — so the config did not load.
 *
 * @example
 * ```ts
 * throw new RefusedModuleError("client-only", rule, nextMarker);
 * ```
 */
export class RefusedModuleError extends CourierError<"MODULE_REFUSED"> {
  declare readonly context: RefusedModuleContext;
  /** Why the framework refuses it, worded to follow the import: `is the marker of …`. */
  readonly reason: string;
  /** What to do about it, worded as an instruction. */
  readonly remedy: string;

  /**
   * @param specifier - The import, as written
   * @param rule - Why the framework refuses it, and what to do
   * @param framework - The framework whose rule it is
   */
  constructor(
    specifier: string,
    rule: { readonly reason: string; readonly remedy: string },
    framework: FrameworkMarker | undefined,
  ) {
    super(`${specifier} ${rule.reason}. ${rule.remedy}.`, {
      code: "MODULE_REFUSED",
      context: { specifier, framework: framework?.label },
    });
    this.reason = rule.reason;
    this.remedy = rule.remedy;
  }
}
