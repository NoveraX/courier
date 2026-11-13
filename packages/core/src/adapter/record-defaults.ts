import { probeOptions } from "../define/probe";
import { getSources } from "../registered-sources";
import { resolveEndpoint } from "../utils/execute-resolve";
import type { HandlerConfig } from "./handler-config";
import type { ProxyRouting } from "./read-routing";

/* Whether an endpoint's closure names its own body, read once from the closure. */
const NAMES_ITS_BODY = new WeakMap<object, boolean>();

/**
 * The fields a record upload sent on as it arrives is written with ahead of
 * its own: its source's `defaultBody`, which a direct call merges under a
 * record it builds the body from, and which a record kept gets as the call
 * builds its body. An endpoint whose closure names its own body takes none,
 * as it takes none from a direct call; nor does an upload kept, a form, or
 * an endpoint the server answers itself.
 *
 * @param config - The handler's upload mode, and the sources it serves
 * @param routing - The endpoint the call names
 * @returns The fields, or `undefined` for none
 * @example
 * ```ts
 * const read = await readEnvelope(request, config, recordDefaults(config, routing));
 * ```
 */
export function recordDefaults(
  config: HandlerConfig | undefined,
  routing: ProxyRouting,
): Readonly<Record<string, unknown>> | undefined {
  if (config?.uploadMode !== "stream") return undefined;
  const sources = config.sources ?? getSources();
  const source =
    sources && Object.hasOwn(sources, routing.source) ? sources[routing.source] : undefined;
  const defaults = source?.options?.defaultBody;
  if (source === undefined || defaults === undefined || Object.keys(defaults).length === 0) {
    return undefined;
  }
  const { endpoint, served } = resolveEndpoint(source, routing.group, routing.method);
  return endpoint === undefined || served || namesItsBody(endpoint) ? undefined : defaults;
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
