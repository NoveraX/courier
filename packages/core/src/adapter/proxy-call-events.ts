import { describeFormData } from "../studio/describe-form-data";
import type { StudioHooks } from "../studio/hooks";
import { generateRequestId } from "../studio/singleton";
import type { ProxyRouting } from "./read-routing";

/** What Studio is told about one proxied HTTP call, as it happens. */
export interface ProxyCallEvents {
  /** The id Studio knows the call by; `undefined` while Studio is not listening. */
  readonly requestId: string | undefined;
  /** The call's variables were read. */
  parsed(variables: unknown): void;
  /** The call was refused before it ran, which ends it for Studio. */
  refused(status: number, message: string): void;
  /** The proxy answered. */
  responded(status: number): void;
}

/**
 * Tell Studio a proxied call has arrived, before its body is read.
 *
 * The call is announced with `request:start` as soon as it names its
 * endpoint, so an upload shows while it is still arriving, and a call refused
 * before it runs — an upload over the limit, a body that will not parse —
 * ends with `request:error` rather than never showing at all. The request
 * runs under the same id, and its own `request:start` fills in what only the
 * body could say.
 *
 * @param dt - The Studio hooks
 * @param proxyMethod - How the call reached the proxy
 * @param routing - The endpoint the call names
 * @param namedId - The Studio request id the caller sent, which the call is
 *   shown under instead of a fresh one (see `studioRequestIdOf`)
 * @param studioPass - Whether `browsersOnly` let the call through on Studio's pass
 * @returns The events for the rest of the call
 *
 * @example
 * ```ts
 * const call = announceProxyCall(studioHooks, "POST", routing);
 * const read = await readEnvelope(request, config);
 * if (!read.ok) call.refused(read.status, read.message);
 * ```
 */
export function announceProxyCall(
  dt: StudioHooks,
  proxyMethod: "GET" | "POST",
  routing: ProxyRouting,
  namedId?: string,
  studioPass?: boolean,
): ProxyCallEvents {
  const requestId = dt.onRequestStart ? (namedId ?? generateRequestId()) : undefined;
  dt.onProxyReceive?.({ proxyMethod, ...routing, requestId, timestamp: Date.now() });
  if (requestId) {
    dt.onRequestStart?.({
      id: requestId,
      ...routing,
      variables: undefined,
      mode: "proxy",
      middlewareCount: 0,
      hasValidation: { variables: false, response: false },
      ...(studioPass && { studioPass: true }),
      timestamp: Date.now(),
    });
  }

  const responded = (status: number) =>
    dt.onProxyRespond?.({ proxyMethod, ...routing, status, requestId, timestamp: Date.now() });

  return {
    requestId,
    parsed: (variables) =>
      dt.onProxyParse?.({
        ...routing,
        /* Studio receives events as JSON, where a FormData would arrive as `{}`. */
        variables: variables instanceof FormData ? describeFormData(variables) : variables,
        requestId,
        timestamp: Date.now(),
      }),
    refused: (status, message) => {
      if (requestId) {
        dt.onRequestError?.({
          id: requestId,
          error: { type: "http", status, message },
          timestamp: Date.now(),
        });
      }
      responded(status);
    },
    responded,
  };
}
