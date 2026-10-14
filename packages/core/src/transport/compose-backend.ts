import type { ExecuteBackend } from "../client/types";
import { ConfigurationError } from "../errors/configuration-error";
import { isChannelSchema } from "../realtime/is-channel-schema";
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
/** How exhaustively the descriptor describes what may be called. */
export interface ComposeOptions {
  /** What lists every endpoint the client may call, when something does: its routes, or a boundary. */
  exhaustive?: "routes" | "boundary" | undefined;
}

export function composeBackend(
  apiSource: Record<string, unknown> | undefined,
  http: HTTPExecutor,
  streaming: StreamingFactories = {},
  options?: ComposeOptions,
): ExecuteBackend {
  const { sse, wsChannel, wsPush } = streaming;

  return function backend(group, method, variables, callOptions, raw) {
    if (apiSource) {
      const { endpoint, schema } = resolveEndpoint(apiSource, group, method);

      /* Routes or a boundary list every endpoint this client may call, so one they do
         not name is a mistake rather than an HTTP call waiting to happen.
         Left to fall through, a stream would reach the HTTP executor and fail
         later as "sub is not async iterable", which names neither the
         endpoint nor the reason. */
      if (options?.exhaustive && typeof endpoint !== "function") {
        throw notListed(options.exhaustive, formatEndpoint(group, method));
      }

      if (schema?.transport === "sse") {
        if (!sse) {
          throw new ConfigurationError(
            "STREAM_TRANSPORT_NOT_CONFIGURED",
            `[courier] SSE factory not configured but endpoint "${formatEndpoint(group, method)}" is declared as transport: "sse".`,
          );
        }
        return sse(group, method, variables, callOptions);
      }

      if (schema?.transport === "ws") {
        if (isChannelSchema(schema)) {
          if (!wsChannel) {
            throw new ConfigurationError(
              "STREAM_TRANSPORT_NOT_CONFIGURED",
              `[courier] WS channel factory not configured but endpoint "${formatEndpoint(group, method)}" is declared as a bidirectional WS channel.`,
            );
          }
          return wsChannel(group, method, variables, callOptions);
        }
        if (!wsPush) {
          throw new ConfigurationError(
            "STREAM_TRANSPORT_NOT_CONFIGURED",
            `[courier] WS push factory not configured but endpoint "${formatEndpoint(group, method)}" is declared as a server-push WS endpoint.`,
          );
        }
        return wsPush(group, method, variables, callOptions);
      }
    }
    return http(group, method, variables, callOptions, raw);
  };
}

function formatEndpoint(group: string, method: string): string {
  return group ? `${group}.${method}` : method;
}

/* Why a client that lists its endpoints refuses one it does not: the proxy would refuse it too. */
function notListed(listedIn: "routes" | "boundary", endpoint: string): ConfigurationError {
  if (listedIn === "boundary") {
    return new ConfigurationError(
      "ENDPOINT_NOT_IN_BOUNDARY",
      `[courier] "${endpoint}" is not in this client's boundary. ` +
        "Add it to `expose` to call it from the browser.",
    );
  }
  return new ConfigurationError(
    "ENDPOINT_NOT_IN_ROUTES",
    `[courier] "${endpoint}" is not among this client's routes, so the proxy refuses it. ` +
      "Mark it with .expose() where it is defined, and write the routes again.",
  );
}
