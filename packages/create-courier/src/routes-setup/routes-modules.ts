import { projectCode } from "../project/project-code";
import type { Project } from "../project/read-project";

/* What a routes module Courier writes says at its top, within its first characters. */
const ROUTES_MARK = "Written by Courier from";
const MARK_WITHIN = 512;
/* `export const apiRoutes: CourierRoutes<…> = {\n  source: "api",` — typed, or as JavaScript writes it. */
const EXPORTED =
  /export\s+const\s+([A-Za-z_$][\w$]*)\s*(?::[^=]*)?=\s*\{\s*source:\s*("(?:[^"\\]|\\.)*")/g;

/** A routes module Courier wrote, and the source each of its exports holds the routes of. */
export interface RoutesModule {
  /** Relative to the root, `/`-separated. */
  readonly path: string;
  /** Each export's name, and its source's: `apiRoutes` → `api`. */
  readonly sources: ReadonlyMap<string, string>;
}

/**
 * Whether a file's text is a routes module Courier wrote, as its first
 * line says.
 *
 * @param text - The file
 * @returns Whether it is
 * @example
 * ```ts
 * isRoutesModule("// Written by Courier from courier.config.ts. Do not edit it:\n…"); // true
 * ```
 */
export function isRoutesModule(text: string): boolean {
  return text.slice(0, MARK_WITHIN).includes(ROUTES_MARK);
}

/**
 * The routes modules Courier wrote in the project — beside the config, or
 * where `studio.routes` puts one — each with the source its exports hold
 * the routes of.
 *
 * @param project - The project
 * @returns The modules
 * @example
 * ```ts
 * routesModules(project); // [{ path: "courier.routes.ts", sources: Map { "apiRoutes" => "api" } }]
 * ```
 */
export function routesModules(project: Project): RoutesModule[] {
  return projectCode(project)
    .filter((file) => isRoutesModule(file.scan.text))
    .map((file) => {
      const sources = new Map<string, string>();
      for (const match of file.scan.text.matchAll(EXPORTED)) {
        const source: unknown = JSON.parse(match[2] ?? '""');
        if (match[1] !== undefined && typeof source === "string") sources.set(match[1], source);
      }
      return { path: file.path, sources };
    });
}
