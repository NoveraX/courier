import { appendItem } from "../../edit/insert";
import { properties, propertyLiteral } from "../../edit/literal";
import { type SourceScan, scanSource } from "../../edit/source-scan";
import { configObject } from "../../project/configured-sources";
import type { RecipeContext, RecipeEdit } from "../recipe-types";
import { configPathOf } from "../shared/courier-config";

/* Where a property's value that starts at `from` ends: before its comma, or the object's close. */
function valueEnd(scan: SourceScan, from: number, close: number): number {
  let at = from;
  while (at < close && !(scan.code[at] === 1 && scan.text[at] === ",")) {
    const pair = scan.code[at] === 1 ? scan.closer.get(at) : undefined;
    at = pair === undefined ? at + 1 : pair + 1;
  }
  while (at > from && /\s/.test(scan.text[at - 1] ?? "")) at--;
  return at;
}

/* The config with `routes: false` in its `studio`; where its `studio` names its routes already, the config itself — or, replacing, the name set to false. */
function withRoutesOff(text: string, replace: boolean): string | undefined {
  const scan = scanSource(text);
  const config = scan === undefined ? undefined : configObject(scan);
  if (scan === undefined || config === undefined) return undefined;
  const studio = propertyLiteral(scan, config, "studio");
  if (studio === null) return appendItem(scan, config, "studio: { routes: false }");
  if (studio === undefined || text[studio.open] !== "{") return undefined;
  const routes = properties(scan, studio).find((property) => property.key === "routes");
  if (routes === undefined) return appendItem(scan, studio, "routes: false");
  if (!replace) return text;
  const end = valueEnd(scan, routes.value, studio.close);
  return `${text.slice(0, routes.value)}false${text.slice(end)}`;
}

/**
 * Where Courier's plugin builds the pages' routes in, in a project set up
 * already, the edit that keeps Studio from writing courier.routes.ts as it
 * runs — a module no page would import: `routes: false` in the config's
 * `studio`. A config that says where its routes go is left as it is,
 * unless the person moves the project from the file to the plugin.
 *
 * @param ctx - The project, and what is set up in it
 * @param replace - Whether a module the config names is set to `false` too
 * @returns The edit
 * @example
 * ```ts
 * studioRoutesOffEdit(ctx).path; // "courier.config.ts"
 * ```
 */
export function studioRoutesOffEdit(ctx: RecipeContext, replace = false): RecipeEdit {
  const path = ctx.configured?.path ?? configPathOf(ctx);
  return {
    path,
    purpose: "keeps Studio from writing courier.routes.ts: the plugin builds the routes in",
    change: (text) => withRoutesOff(text, replace),
    manual: {
      file: path,
      what: "Keep Studio from writing courier.routes.ts, which no page imports once the plugin builds the routes in: set studio.routes to false",
      lines: ["studio: { routes: false },"],
    },
  };
}
