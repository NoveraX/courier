import { codeMatches } from "../../edit/source-scan";
import { projectCode } from "../../project/project-code";
import type { RecipeContext } from "../recipe-types";

/* An endpoint marked with `.expose()`, or a group or an API that opens its endpoints with `expose: true`. */
const EXPOSE = /\.expose\s*\(|\bexpose\s*:\s*true\b/g;

/**
 * Whether a setup gives the pages their routes — Courier's plugin, or the
 * `routes` script and the CLI that runs it: in a project it sets up from
 * nothing, whose example opens its endpoints to a page, or in one that has
 * a routes module already or opens an endpoint — `.expose()`, or
 * `expose: true` on a group or an API. A project set up already with none
 * of them would only get a dev dependency it does not use.
 *
 * @param ctx - The project, and what is set up in it
 * @returns Whether it does
 * @example
 * ```ts
 * wantsRoutes(ctx); // false in a configured project whose code marks no endpoint
 * ```
 */
export function wantsRoutes(ctx: RecipeContext): boolean {
  if (ctx.configured === undefined) return true;
  const { project } = ctx;
  if (project.exists("courier.routes.ts") || project.exists("courier.routes.js")) return true;
  return projectCode(project).some((file) => codeMatches(file.scan, EXPOSE).length > 0);
}
