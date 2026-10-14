import type { Sources } from "@noverax/courier/define";
import { type ExposureDecision, eachEndpoint, exposureOf } from "@noverax/courier/internal";

/** Whether a page may call an endpoint through the proxy, and the mark that says so, as Studio shows it. */
export interface PageMark {
  /** Whether the proxy serves the endpoint to a page. */
  exposed: boolean;
  /** The mark that decided, as the definition writes it: `marked .expose()`, `expose: false on billing`. */
  reason: string;
}

/**
 * Whether a page may call each endpoint of the project's sources through
 * the proxy, by its call under its source — `shop.orders.cancel` — as the
 * proxy decides it: by the nearest mark, on the endpoint, a group or the
 * API, and where none says, kept to the server.
 *
 * @param sources - The sources the config declares
 * @returns The marks, by each endpoint's call
 * @example
 * ```ts
 * pageMarks(config.sources).get("shop.orders.list"); // { exposed: true, reason: "expose: true on orders" }
 * ```
 */
export function pageMarks(sources: Sources | undefined): Map<string, PageMark> {
  const marks = new Map<string, PageMark>();
  for (const [source, api] of Object.entries(sources ?? {})) {
    if (typeof api !== "object" || api === null) continue;
    for (const endpoint of eachEndpoint(api)) {
      const group = endpoint.group === "" ? undefined : endpoint.group;
      const decision = exposureOf(api, group, endpoint.schemas);
      marks.set(`${source}.${endpoint.id}`, {
        exposed: decision.exposed,
        reason: reasonOf(decision),
      });
    }
  }
  return marks;
}

function reasonOf({ exposed, by, group }: ExposureDecision): string {
  if (by === "none") return "nothing marks it .expose()";
  if (by === "endpoint") return exposed ? "marked .expose()" : "marked .expose(false)";
  return `expose: ${exposed} on ${by === "group" ? group : "the API"}`;
}
