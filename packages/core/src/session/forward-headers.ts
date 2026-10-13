import { randomId } from "../utils/random-id";
import type { IncomingRequest } from "./incoming-request";
import { requestIdFor } from "./request-state";
import type { ForwardOptions } from "./types";

/** The header a request's id travels in unless `requestId` names another. */
export const REQUEST_ID_HEADER = "x-request-id";

/* An id a log can hold as one word: what request ids are made of. */
const REQUEST_ID = /^[\w.:\-+/=]{1,128}$/;
/* version-traceid-parentid-flags, neither id all zeros, as W3C Trace Context writes it. */
const TRACEPARENT = /^(?!ff)[\da-f]{2}-(?!0{32})[\da-f]{32}-(?!0{16})[\da-f]{16}-[\da-f]{2}$/;
/* One address, or a forwarding chain of them, as a header carries it. */
const ADDRESSES = /^[\u0020-\u007e]{1,512}$/;
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
    const name = typeof forward.requestId === "string" ? forward.requestId : REQUEST_ID_HEADER;
    take(name, requestIdOf(incoming, name));
  }
  if (forward.trace) for (const [name, value] of traceContext(incoming)) take(name, value);
  const address = incoming.clientAddress?.trim();
  if (forward.clientAddress && address && ADDRESSES.test(address)) take("x-forwarded-for", address);
  if (forward.userAgent) take("user-agent", incoming.headers.get("user-agent"));
  if (forward.locale) take("accept-language", incoming.headers.get("accept-language"));
  for (const name of forward.headers ?? []) take(name.toLowerCase(), incoming.headers.get(name));
  return headers;
}

/**
 * Whether a header value is a request id: one word a log can hold, of at
 * most 128 letters, digits and the punctuation ids are written with.
 *
 * @param value - The header's value
 * @returns `true` for a well-formed id
 * @example
 * ```ts
 * isRequestId("req_01H8Z:7f/+="); // → true
 * isRequestId("a b"); // → false
 * ```
 */
export function isRequestId(value: string): boolean {
  return REQUEST_ID.test(value);
}

function requestIdOf(incoming: IncomingRequest, name: string): string {
  return requestIdFor(incoming, () => {
    const given = incoming.headers.get(name)?.trim();
    return given && isRequestId(given) ? given : randomId();
  });
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
