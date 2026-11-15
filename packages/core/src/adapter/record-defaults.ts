import { probeOptions } from "../define/probe";
import { getSources } from "../registered-sources";
import { resolveEndpoint } from "../utils/execute-resolve";
import type { HandlerConfig } from "./handler-config";
import type { ProxyRouting } from "./read-routing";

/* Whether an endpoint's closure names its own body, read once from the closure. */
const NAMES_ITS_BODY = new WeakMap<object, boolean>();

/** What a record upload sent on as it arrives is written with besides its own fields. */
export interface RecordDefaults {
  /** Its source's `defaultBody`, under the form. */
  readonly body?: Readonly<Record<string, unknown>> | undefined;
  /** Its endpoint's `.defaults()`, filled into the record where it leaves a variable out. */
  readonly variables?: Readonly<Record<string, unknown>> | undefined;
}

/**
 * What a record upload sent on as it arrives is written with, as a direct
 * call writes it: its endpoint's `.defaults()`, filled into the record
 * where it leaves a variable out, as they are into a direct call's
 * variables, and its source's `defaultBody` under the form, which a direct
 * call merges under a record it builds the body from. An endpoint whose
 * closure names its own body takes no `defaultBody`, as it takes none from
 * a direct call. An upload kept, whose call is given both as any call is, a
 * form, which takes neither, and an endpoint the server answers itself are
 * written with nothing.
 *
 * @param config - The handler's upload mode, and the sources it serves
 * @param routing - The endpoint the call names
 * @returns The defaults, or `undefined` for none
 * @example
 * ```ts
 * const read = await readEnvelope(request, config, recordDefaults(config, routing));
 * ```
 */
export function recordDefaults(
  config: HandlerConfig | undefined,
  routing: ProxyRouting,
): RecordDefaults | undefined {
  if (config?.uploadMode !== "stream") return undefined;
  const sources = config.sources ?? getSources();
  const source =
    sources && Object.hasOwn(sources, routing.source) ? sources[routing.source] : undefined;
  if (source === undefined) return undefined;
  const { endpoint, schema, served } = resolveEndpoint(source, routing.group, routing.method);
  if (endpoint === undefined || served) return undefined;
  const defaultBody = someOf(source.options?.defaultBody);
  const body = defaultBody === undefined || namesItsBody(endpoint) ? undefined : defaultBody;
  const variables = someOf(schema?.defaults);
  return body === undefined && variables === undefined ? undefined : { body, variables };
}

/* Fields, where there are any. */
function someOf(
  fields: Readonly<Record<string, unknown>> | undefined,
): Readonly<Record<string, unknown>> | undefined {
  return fields === undefined || Object.keys(fields).length === 0 ? undefined : fields;
}

function namesItsBody(probe: (...args: never[]) => unknown): boolean {
  let named = NAMES_ITS_BODY.get(probe);
  if (named === undefined) {
    const options = probeOptions(probe);
    named =
      typeof options === "object" &&
      options !== null &&
      (Reflect.get(options, "body") != null || Reflect.get(options, "json") !== undefined);
    NAMES_ITS_BODY.set(probe, named);
  }
  return named;
}
