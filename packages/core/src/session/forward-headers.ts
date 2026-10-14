import { randomId } from "../utils/random-id";
import { addressHeaders } from "./forward-address";
import type { IncomingRequest } from "./incoming-request";
import { isRequestId, REQUEST_ID_HEADER } from "./request-id";
import { requestIdFor } from "./request-state";
import type { ForwardOptions } from "./types";

/* version-traceid-parentid-flags, neither id all zeros, as W3C Trace Context writes it. */
const TRACEPARENT = /^(?!ff)[\da-f]{2}-(?!0{32})[\da-f]{32}-(?!0{16})[\da-f]{16}-[\da-f]{2}$/;
/* OpenTelemetry's API keeps itself here once anything registers it. */
const OPEN_TELEMETRY = Symbol.for("opentelemetry.js.api.1");

/**
 * The headers a call carries from the request being served, as `forward`
 * names them. A header the request lacks, or carries malformed, is left
 * out — the request id excepted, which is then made once for the request
 * and shared by every call made while serving it.
 *
 * @param incoming - The request being served
 * @param forward - Which of its headers to carry
 * @returns The headers, by name
 * @example
 * ```ts
 * forwardedHeaders(incoming, { requestId: true, locale: true });
 * // [["x-request-id", "5f0c…"], ["accept-language", "en-GB,en;q=0.8"]]
 * ```
 */
export function forwardedHeaders(
  incoming: IncomingRequest,
  forward: ForwardOptions,
): Array<[string, string]> {
  const headers: Array<[string, string]> = [];
  const take = (name: string, value: string | null | undefined): void => {
    if (value) headers.push([name, value]);
  };
  if (forward.requestId) {
    const names = headerNames(forward.requestId, REQUEST_ID_HEADER);
    const id = requestIdOf(incoming, names);
    for (const name of names) take(name, id);
  }
  if (forward.trace) for (const [name, value] of traceContext(incoming)) take(name, value);
  if (forward.clientAddress) {
    for (const [name, value] of addressHeaders(incoming, forward.clientAddress)) take(name, value);
  }
  if (forward.userAgent) take("user-agent", incoming.headers.get("user-agent"));
  if (forward.locale) take("accept-language", incoming.headers.get("accept-language"));
  for (const name of forward.headers ?? []) take(name.toLowerCase(), incoming.headers.get(name));
  return headers;
}

/* The request's id: the first of the named headers that carries one, or one made for it. */
function requestIdOf(incoming: IncomingRequest, names: readonly string[]): string {
  return requestIdFor(incoming, () => {
    for (const name of names) {
      const given = incoming.headers.get(name)?.trim();
      if (given && isRequestId(given)) return given;
    }
    return randomId();
  });
}

/* An option's header names, lower-cased and each once: `true` names the default. */
function headerNames(option: true | string | readonly string[], fallback: string): string[] {
  const names = option === true ? [fallback] : typeof option === "string" ? [option] : option;
  return [...new Set(names.map((name) => name.toLowerCase()))];
}

/* The request's trace context, when it carries a valid one. */
function traceContext(incoming: IncomingRequest): Array<[string, string | undefined]> {
  if (tracerPropagates()) return [];
  const parent = incoming.headers.get("traceparent")?.trim().toLowerCase();
  if (!parent || !TRACEPARENT.test(parent)) return [];
  return [
    ["traceparent", parent],
    ["tracestate", traceState(incoming.headers.get("tracestate"))],
  ];
}

/* A tracer that is running injects its own context into each call, as a
   child of its span; another copy would name the wrong parent. */
function tracerPropagates(): boolean {
  return Reflect.get(globalThis, OPEN_TELEMETRY) !== undefined;
}

/* At most 32 members of at most 512 characters, as W3C Trace Context bounds it. */
function traceState(value: string | null): string | undefined {
  const state = value?.trim();
  if (!state || state.length > 512 || state.split(",").length > 32) return undefined;
  return /^[ -~]+$/.test(state) ? state : undefined;
}
