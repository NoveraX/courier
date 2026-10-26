import { type SegmentTemplate, segmentTemplate } from "./segment-template";

/** Where a mock server routes a path, and how the path's parameters are read from the route. */
export interface RoutePath {
  /** The route, as Hono takes it */
  readonly route: string;
  /** The path's parameters, from the values Hono captured for the route */
  readonly params: (captured: Record<string, string>) => Record<string, string>;
}

/* No parameter's name holds a dash, so no route parameter named so stands for one. */
const SEGMENT = "courier-segment-";

/**
 * The route a mock server serves a path an endpoint declares at.
 *
 * Hono reads a parameter only as a whole segment that starts with `:`, so a
 * segment that holds a parameter beside text — Google's `:name::cancel`, a
 * range's `:from-:to` — or text that starts with a colon is routed by a
 * pattern that matches the segment whole, under a name no parameter takes;
 * its parameters are then split out of the value the request gave it. A
 * `{+name}` alone in its segment is routed by a pattern that takes the
 * segments its value spans. A path whose segments are text or one
 * parameter each is routed as written.
 *
 * @param path - The path, prefix included: `v4/spreadsheets/:spreadsheetId::batchUpdate`
 * @returns The route and the reader of its parameters
 * @example
 * ```ts
 * const { route, params } = routePath("v1/:name::cancel");
 * // route: "/v1/:courier-segment-1{[^/]+\u003acancel}"
 * params({ "courier-segment-1": "op-1:cancel" }); // → { name: "op-1" }
 * ```
 */
export function routePath(path: string): RoutePath {
  const patterned = new Map<string, SegmentTemplate>();
  const segments = path
    .split("/")
    .filter(Boolean)
    .map((segment, at) => {
      const template = segmentTemplate(segment);
      if (template.kind === "param") return `:${template.name}`;
      if (template.kind === "spans") return `:${template.name}{${template.pattern}}`;
      if (template.kind === "text" && !template.text.startsWith(":")) return template.text;
      const key = `${SEGMENT}${at}`;
      patterned.set(key, template);
      return `:${key}{${template.pattern}}`;
    });
  return {
    route: `/${segments.join("/")}`,
    params: (captured) => (patterned.size === 0 ? captured : spreadOut(captured, patterned)),
  };
}

function spreadOut(
  captured: Record<string, string>,
  patterned: ReadonlyMap<string, SegmentTemplate>,
): Record<string, string> {
  const params = Object.fromEntries(
    Object.entries(captured).filter(([name]) => !patterned.has(name)),
  );
  for (const [key, template] of patterned) {
    const values = template.match(captured[key] ?? "") ?? [];
    for (const [at, name] of template.names.entries()) {
      const value = values[at];
      if (value !== undefined) params[name] = value;
    }
  }
  return params;
}
