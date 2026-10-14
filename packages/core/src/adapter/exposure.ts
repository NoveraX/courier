/**
 * Whether the browser may reach an endpoint at all.
 *
 * The proxy addresses endpoints by name — `?_s=api&_g=admin&_m=exportPayouts`
 * — and resolves that name in the process-global registry. Every source the
 * application declared is in there, including the ones only server code was
 * ever meant to call, and the registry cannot tell the two apart. So an
 * endpoint written for a cron job is reachable from a page, and reachable
 * *with the server's credentials*, which is the whole point of the proxy.
 *
 * The definition answers it, where each endpoint is written: `.expose()` on
 * the endpoint, `expose` on a group or on the API, the nearest one that says
 * deciding — so a group may be open with one endpoint in it shut, and an
 * API shut with one group in it open. What no mark opens is kept from every
 * page: a new endpoint is the server's until someone marks it.
 *
 * A refused call is answered exactly as an unknown name is. Saying "forbidden"
 * would confirm that the endpoint exists, which is the one thing a caller
 * guessing names is trying to learn.
 */

import { GROUP_PATH_SEPARATOR, groupChain, groupNames } from "../define/group-tree";
import { isRecord } from "../utils/is-record";
import type { SchemaMetadata } from "../validation";

/** Whether a page may reach an endpoint, and the mark that decided it. */
export interface ExposureDecision {
  /** Whether the proxy serves the endpoint to a page. */
  readonly exposed: boolean;
  /** The mark that decided: the endpoint's `.expose()`, a group's `expose`, the API's, or none. */
  readonly by: "endpoint" | "group" | "api" | "none";
  /** The path of the group whose mark decided: `billing.invoices`. */
  readonly group?: string;
}

const UNMARKED: ExposureDecision = { exposed: false, by: "none" };

/**
 * Decide whether a named endpoint may be served to a caller off the wire,
 * and by which mark: its own, the nearest group's that sets one, the API's,
 * or none, which keeps it the server's.
 *
 * @param dataSource - The source as it sits in the registry
 * @param group - The group's path from the request, when it named one
 * @param schema - The endpoint's metadata, carrying its own `.expose()`
 * @returns Whether the proxy may serve it, and the mark that says so
 *
 * @example
 * ```ts
 * exposureOf(api, "billing.invoices", schema); // { exposed: false, by: "group", group: "billing" }
 * ```
 */
export function exposureOf(
  dataSource: unknown,
  group: string | undefined,
  schema?: SchemaMetadata,
): ExposureDecision {
  const options =
    isRecord(dataSource) && isRecord(dataSource.options) ? dataSource.options : undefined;
  if (!options) return UNMARKED;

  const own = exposeFlag(schema?.expose);
  if (own !== undefined) return { exposed: own, by: "endpoint" };

  const byGroup = group === undefined ? undefined : groupExposureOf(dataSource, group);
  if (byGroup) return byGroup;

  const api = exposeFlag(options.expose);
  return api === undefined ? UNMARKED : { exposed: api, by: "api" };
}

/**
 * Decide whether a named endpoint may be served to a caller off the wire.
 *
 * @param dataSource - The source as it sits in the registry
 * @param group - The group's path from the request, when it named one
 * @param schema - The endpoint's metadata, carrying its own `.expose()`
 * @returns Whether the proxy may serve it: only where a mark opens it
 *
 * @example
 * ```ts
 * defineApi({ expose: false, groups: { public: defineGroup({ expose: true, … }) } });
 * ```
 */
export function isExposedToWire(
  dataSource: unknown,
  group: string | undefined,
  schema?: SchemaMetadata,
): boolean {
  return exposureOf(dataSource, group, schema).exposed;
}

/* A flag set to anything but `true` shuts off what it is set on, so one
   misspelt in a JavaScript config — `expose: "false"`, `expose: 0` — fails
   closed rather than open. */
function exposeFlag(value: unknown): boolean | undefined {
  return value === undefined ? undefined : value === true;
}

/* The group the path names, then each group above it: the first that sets the flag decides. */
function groupExposureOf(dataSource: unknown, group: string): ExposureDecision | undefined {
  const chain = groupChain(dataSource, group) ?? [];
  const names = groupNames(group);
  for (let depth = chain.length; depth > 0; depth--) {
    const flag = exposeFlag(chain[depth - 1]?.options?.expose);
    if (flag === undefined) continue;
    return { exposed: flag, by: "group", group: names.slice(0, depth).join(GROUP_PATH_SEPARATOR) };
  }
  return undefined;
}
