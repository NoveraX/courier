import type { ExecuteBackend } from "../client/types";
import { resolveEndpoint } from "../utils/execute-resolve";
import type { HTTPExecutor, SSEFactory, WSChannelFactory, WSPushFactory } from "./types";

/** Optional bundle of streaming primitives — passed together to keep the call site tidy */
export interface StreamingFactories {
  sse?: SSEFactory;
  wsChannel?: WSChannelFactory;
  wsPush?: WSPushFactory;
}

/**
 * Compose an `ExecuteBackend` from an HTTP executor and optional streaming
 * factories, plus an optional API source for transport detection.
 *
 * Resolution rules:
 * - When `apiSource` is provided, the backend resolves the endpoint schema
 *   to detect the declared transport.
 * - **Strict for SSE/WS**: if the schema declares `transport: "sse"` or
 *   `"ws"` and the matching factory was not provided, an explicit error is
 *   thrown — silently falling back to HTTP would mask configuration bugs.
 * - **Soft for HTTP**: when the schema is missing or declares HTTP, calls
 *   route through the HTTP executor. This preserves pass-through behaviour
 *   for generic admin endpoints and dynamic dispatch use cases.
 *
 * @param apiSource - API definition object for schema resolution (direct mode
 *   always passes this; proxy mode passes the optional `source` from defaults)
 * @param http - HTTP executor primitive
 * @param streaming - SSE / WS channel / WS push factories (optional)
 */
export function composeBackend(
  apiSource: Record<string, unknown> | undefined,
  http: HTTPExecutor,
  streaming: StreamingFactories = {},
): ExecuteBackend {
  const { sse, wsChannel, wsPush } = streaming;

  return function backend(group, method, variables, options, raw) {
    if (apiSource) {
      const { schema } = resolveEndpoint(apiSource, group, method);

      if (schema?.transport === "sse") {
        if (!sse) {
          throw new Error(
            `[nexus] SSE factory not configured but endpoint "${formatEndpoint(group, method)}" is declared as transport: "sse".`,
          );
        }
        return sse(group, method, variables, options);
      }

      if (schema?.transport === "ws") {
        const isBidirectional = !!schema.receive;
        if (isBidirectional) {
          if (!wsChannel) {
            throw new Error(
              `[nexus] WS channel factory not configured but endpoint "${formatEndpoint(group, method)}" is declared as a bidirectional WS channel.`,
            );
          }
          return wsChannel(group, method, variables, options);
        }
        if (!wsPush) {
          throw new Error(
            `[nexus] WS push factory not configured but endpoint "${formatEndpoint(group, method)}" is declared as a server-push WS endpoint.`,
          );
        }
        return wsPush(group, method, variables, options);
      }
    }
    return http(group, method, variables, options, raw);
  };
}

function formatEndpoint(group: string, method: string): string {
  return group ? `${group}.${method}` : method;
}
