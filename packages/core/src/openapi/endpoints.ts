import { eachGroup, GROUP_PATH_SEPARATOR, groupOptionsOf } from "../define/group-tree";
import type { ResolvedEndpointOptions } from "../define/options";
import type { AnyProbe } from "../define/probe";
import { isEndpointEntry } from "../utils/execute-helpers";
import { ENDPOINT_SCHEMA, type SchemaMetadata } from "../validation";

/** An endpoint of an API, where its definition puts it. */
export interface PlacedEndpoint {
  /** Its call in the client: `billing.invoices.list` */
  readonly id: string;
  /** The groups above it, `billing.invoices`, or `""` at the top */
  readonly group: string;
  /** What it does: reads, writes, streams or holds a channel */
  readonly kind: "query" | "mutation" | "stream" | "channel";
  /** The wire method: a verb, `del` for DELETE, or `get` for a stream or a channel */
  readonly method: string;
  /** Its path under the API's address: the groups' prefixes, then its own */
  readonly path: string;
  /** Served by the application itself, so it has no address of its own */
  readonly served: boolean;
  readonly schemas: SchemaMetadata;
  readonly options: Partial<ResolvedEndpointOptions>;
  /** The closure that addresses it, which a stand-in call reads the body's form from */
  readonly probe: AnyProbe;
}

/**
 * Every endpoint an API defines, its top-level ones first and then each
 * group's, nested groups under their parents, in the order written.
 *
 * @param api - The API, as `defineApi` returns it
 * @returns The endpoints, placed
 * @example
 * ```ts
 * for (const endpoint of eachEndpoint(api)) console.log(endpoint.id, endpoint.path);
 * ```
 */
export function* eachEndpoint(api: object): Generator<PlacedEndpoint> {
  yield* endpointsIn(api, "", "");
  for (const { path, group, chain } of eachGroup(api)) {
    yield* endpointsIn(group, path, groupOptionsOf(chain).prefix ?? "");
  }
}

function* endpointsIn(holder: object, group: string, prefix: string): Generator<PlacedEndpoint> {
  const entries: Array<[string, unknown]> = Object.entries(holder);
  for (const [name, value] of entries) {
    if (name === "options" || !isEndpointEntry(value)) continue;
    const entry = value as typeof value & Record<string | symbol, unknown>;
    yield {
      id: group === "" ? name : `${group}${GROUP_PATH_SEPARATOR}${name}`,
      group,
      kind: kindOf(entry.kind),
      method: typeof entry.method === "string" ? entry.method : "get",
      path: joined(prefix, typeof entry.path === "string" ? entry.path : ""),
      served: entry.served === true,
      schemas: (entry[ENDPOINT_SCHEMA] as SchemaMetadata | undefined) ?? {},
      options: (entry.options as Partial<ResolvedEndpointOptions> | undefined) ?? {},
      probe: entry.probe as AnyProbe,
    };
  }
}

function kindOf(kind: unknown): PlacedEndpoint["kind"] {
  return kind === "mutation" || kind === "stream" || kind === "channel" ? kind : "query";
}

/* An absolute path stays as written: it names an address of its own. */
function joined(prefix: string, path: string): string {
  if (/^https?:\/\//i.test(path)) return path;
  return [prefix, path]
    .filter((part) => part !== "")
    .join("/")
    .replace(/\/+/g, "/")
    .replace(/^\//, "");
}
