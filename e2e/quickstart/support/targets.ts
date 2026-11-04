import { readFileSync } from "node:fs";
import { join } from "node:path";

/** Where the quick start is checked: a framework, how its dev server starts, and the page that shows Courier. */
export interface QuickstartTarget {
  /** The check's name: the framework, as `--framework` names it, unless `framework` does. */
  readonly id: string;
  /** The framework, where the check sets it up otherwise than by default: `next` for `next-file`. */
  readonly framework?: string;
  /** What the setup is run with besides: `["--routes", "file"]`. */
  readonly args?: readonly string[];
  /** Where the page takes its routes: Courier's plugin, or courier.routes.ts; left out where it calls the API directly. */
  readonly routes?: "plugin" | "file";
  /** The command that starts the app while you develop; `{port}` stands for its port, which PORT carries too. */
  readonly start: readonly string[];
  /** The command that builds it for production, as its user ships it. */
  readonly build: readonly string[];
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
    "build" in value &&
    Array.isArray(value.build) &&
    "page" in value &&
    typeof value.page === "string" &&
    (!("framework" in value) || typeof value.framework === "string") &&
    (!("args" in value) ||
      (Array.isArray(value.args) && value.args.every((arg) => typeof arg === "string"))) &&
    (!("routes" in value) || value.routes === "plugin" || value.routes === "file")
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
