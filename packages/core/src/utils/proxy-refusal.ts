import { isExposedToWire } from "../adapter/exposure";
import { resolveEndpoint } from "./execute-resolve";
import { refuseWireCall, type WireRefusal } from "./wire-refusal";

/** A call a stand-in for the proxy received: the endpoint it names, and how it came. */
export interface StandInCall {
  /** The source's name, as the call names it */
  source: string;
  /** The endpoint's group path; `""` for one of the source's own */
  group: string;
  /** The endpoint's name in its group */
  method: string;
  /** How it came: an HTTP call by GET or POST, or a stream opened at the proxy's SSE route */
  via: "GET" | "POST" | "sse";
}

/**
 * How a Courier proxy refuses a call before it runs it — to an endpoint the
 * source keeps from a browser, by GET to one that is not a read, or by GET
 * to a read whose variables stay out of the address — for a stand-in that
 * serves the source in the proxy's place, a mock server, to refuse alike,
 * with the status and the message the proxy answers with. A name the
 * source does not define is the stand-in's own to answer.
 *
 * @param source - The API the stand-in serves, as `defineApi` returns it
 * @param call - The endpoint the call names, and how it came
 * @returns The refusal, or `undefined` when the proxy would run the call
 * @example
 * ```ts
 * proxyRefusal(api, { source: "api", group: "admin", method: "purge", via: "POST" });
 * // → { status: 400, message: "[api][admin][purge]: method not found" } for an endpoint kept from browsers
 * ```
 */
export function proxyRefusal(
  source: Record<string, unknown>,
  call: StandInCall,
): WireRefusal | undefined {
  const group = call.group === "" ? undefined : call.group;
  const resolved = resolveEndpoint(source, group, call.method);
  if (typeof resolved.endpoint !== "function") return undefined;
  if (call.via === "sse") {
    if (isExposedToWire(source, group, resolved.schema)) return undefined;
    return {
      status: 400,
      message: `[${call.source}][${call.group}][${call.method}]: method not found`,
    };
  }
  const methodPath = group ? `[${group}][${call.method}]` : `[${call.method}]`;
  return refuseWireCall({
    dataSource: source,
    group,
    method: call.method,
    schema: resolved.schema,
    stream: undefined,
    proxyMethod: call.via,
    sensitiveVariables: resolved.options?.sensitiveVariables === true,
    endpoint: `[${call.source}]${methodPath}`,
  });
}
