import { endpointPath } from "../../define/address";
import { pathWriter } from "../../define/path-tag";
import { type AnyProbe, recordWireCall } from "../../define/probe";
import { RealtimeValidationError } from "../../realtime/errors";
import { isRecord } from "../../utils/is-record";
import {
  encodePathValue,
  fillPathParams,
  pathParamNames,
  routeChangingPart,
} from "../../utils/path-template";
import { FRAGMENT_IN_PATH } from "../../utils/url";

/** Where one call to a remote stream or channel goes, relative to its group. */
export interface CallAddress {
  /** The path, with each `:param` filled in. */
  readonly path: string;
  /** The variables the call sends, less those its path took. */
  readonly variables: Record<string, unknown> | undefined;
}

/* A value the closure puts into its path is refused, where it would change the route, as a parameter is. */
const callPath = pathWriter((message) => new RealtimeValidationError(message));

/**
 * Work out where one call to a remote stream or channel goes.
 *
 * The endpoint's closure runs with this call's variables, so a path it builds
 * from them addresses this call rather than the stand-ins it was probed with
 * when it was defined. A `:param` in the path is then filled from the
 * variables the closure passed and taken out of them, as an HTTP call does.
 *
 * An endpoint served by the process that defines it addressed nothing, and
 * is reached by its name with the call's variables.
 *
 * @param endpoint - The endpoint's descriptor
 * @param method - The endpoint's name in its group
 * @param variables - The call's variables
 * @returns The path and the variables left to send
 * @throws RealtimeValidationError when a `:param` has no value, a value would change the route, or the path holds a #
 *
 * @example
 * ```ts
 * // stream.variables<{ room: string; since: number }>().get(":room/events")
 * addressCall(events, "events", { room: "lobby", since: 3 });
 * // → { path: "lobby/events", variables: { since: 3 } }
 * ```
 */
export function addressCall(endpoint: unknown, method: string, variables: unknown): CallAddress {
  const probe = remoteProbe(endpoint);
  if (!probe) return { path: endpointPath(endpoint, method), variables: asRecord(variables) };

  const call = recordWireCall(probe, variables, callPath);
  return fillParams(call.path || method, asRecord(call.variables));
}

/** The closure addressing a remote endpoint, or nothing for one served here. */
function remoteProbe(endpoint: unknown): AnyProbe | undefined {
  if (typeof endpoint !== "object" || endpoint === null) return undefined;
  const probe = "probe" in endpoint ? endpoint.probe : undefined;
  const served = "served" in endpoint ? endpoint.served : undefined;
  if (served === true || !isProbe(probe)) return undefined;
  return probe;
}

/* What a closure takes cannot be read where it is held: it is run against
   a recorder, which takes any call. */
function isProbe(value: unknown): value is AnyProbe {
  return typeof value === "function";
}

function fillParams(path: string, variables: Record<string, unknown> | undefined): CallAddress {
  if (path.includes("#")) throw new RealtimeValidationError(FRAGMENT_IN_PATH);
  const filled = fillPathParams(path, (name, { keepsSlashes }) =>
    segmentOf(name, variables?.[name], keepsSlashes),
  );
  const names = pathParamNames(path);
  if (names.length === 0) return { path: filled, variables };

  const rest = { ...variables };
  for (const name of names) delete rest[name];
  return { path: filled, variables: Object.keys(rest).length > 0 ? rest : undefined };
}

/* One parameter's place in the path, from its value: a segment, or segments for `{+name}`. */
function segmentOf(name: string, value: unknown, keepsSlashes: boolean): string {
  if (value === undefined || value === null) {
    throw new RealtimeValidationError(
      `Missing required path parameter "${name}": pass it in the variables`,
    );
  }
  /* Relayed by a proxy, a `..` reached a route above the declared one with
     the server's credentials. */
  const text = String(value);
  const part = routeChangingPart(text, keepsSlashes);
  if (part !== undefined) {
    const which = part === text ? "it" : `its part "${part}"`;
    throw new RealtimeValidationError(
      `Path parameter "${name}" cannot be "${text}": ${which} would change the route`,
    );
  }
  return encodePathValue(text, keepsSlashes);
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return isRecord(value) ? value : undefined;
}
