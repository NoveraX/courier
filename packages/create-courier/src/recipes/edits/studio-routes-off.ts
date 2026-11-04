import { appendItem } from "../../edit/insert";
import { properties, propertyLiteral } from "../../edit/literal";
import { scanSource } from "../../edit/source-scan";
import { configObject } from "../../project/configured-sources";
import type { RecipeContext, RecipeEdit } from "../recipe-types";
import { configPathOf } from "../shared/courier-config";

/* The config with `routes: false` in its `studio`; the config itself where its `studio` names its routes already. */
function withRoutesOff(text: string): string | undefined {
  const scan = scanSource(text);
  const config = scan === undefined ? undefined : configObject(scan);
  if (scan === undefined || config === undefined) return undefined;
  const studio = propertyLiteral(scan, config, "studio");
  if (studio === null) return appendItem(scan, config, "studio: { routes: false }");
  if (studio === undefined || text[studio.open] !== "{") return undefined;
  if (properties(scan, studio).some((property) => property.key === "routes")) return text;
  return appendItem(scan, studio, "routes: false");
}

/**
 * Where Courier's plugin builds the pages' routes in, in a project set up
 * already, the edit that keeps Studio from writing courier.routes.ts as it
 * runs — a module no page would import: `routes: false` in the config's
 * `studio`. A config that says where its routes go is left as it is.
 *
 * @param ctx - The project, and what is set up in it
 * @returns The edit
 * @example
 * ```ts
 * studioRoutesOffEdit(ctx).path; // "courier.config.ts"
 * ```
 */
export function studioRoutesOffEdit(ctx: RecipeContext): RecipeEdit {
  const path = ctx.configured?.path ?? configPathOf(ctx);
  return {
    path,
    purpose: "keeps Studio from writing courier.routes.ts: the plugin builds the routes in",
    change: withRoutesOff,
    manual: {
      file: path,
      what: "Keep Studio from writing courier.routes.ts, which no page imports once the plugin builds the routes in: set studio.routes to false",
      lines: ["studio: { routes: false },"],
    },
  };
}
