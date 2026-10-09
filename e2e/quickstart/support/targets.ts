import { readFileSync } from "node:fs";
import { join } from "node:path";

/** Where the quick start is checked: a framework, how its dev server starts, and the page that shows Courier. */
export interface QuickstartTarget {
  /** The framework, as `--framework` names it. */
  readonly id: string;
  /** The command that starts the app while you develop; `{port}` stands for its port, which PORT carries too. */
  readonly start: readonly string[];
  /** The page Courier's setup adds. */
  readonly page: string;
  /** Where a template writes its port down, for the check to run the app on its own. */
  readonly port?: { readonly file: string; readonly from: string; readonly to: string };
}

function isTarget(value: unknown): value is QuickstartTarget {
  return (
    typeof value === "object" &&
    value !== null &&
    "id" in value &&
    typeof value.id === "string" &&
    "start" in value &&
    Array.isArray(value.start) &&
    "page" in value &&
    typeof value.page === "string"
  );
}

/**
 * The frameworks the quick start is checked with, as `targets.json` lists
 * them.
 *
 * @returns The targets, in order
 * @throws {Error} When the file lists something that is not a target
 * @example
 * ```ts
 * quickstartTargets().map((target) => target.id); // ["next", "nuxt", …]
 * ```
 */
export function quickstartTargets(): QuickstartTarget[] {
  const parsed: unknown = JSON.parse(
    readFileSync(join(import.meta.dirname, "../targets.json"), "utf8"),
  );
  if (!Array.isArray(parsed) || !parsed.every(isTarget)) {
    throw new Error("e2e/quickstart/targets.json is not a list of targets");
  }
  return parsed;
}

/**
 * The target a run checks: the one `COURIER_QUICKSTART` names.
 *
 * @param id - Its id
 * @returns The target
 * @throws {Error} When no target has the id
 * @example
 * ```ts
 * quickstartTarget("next").page; // "/courier"
 * ```
 */
export function quickstartTarget(id: string | undefined): QuickstartTarget {
  const targets = quickstartTargets();
  const found = targets.find((target) => target.id === id);
  if (found) return found;
  throw new Error(
    `COURIER_QUICKSTART takes one of ${targets.map((target) => target.id).join(", ")}, not "${id}"`,
  );
}
