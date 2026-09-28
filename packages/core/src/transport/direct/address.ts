import { endpointPath } from "../../define/address";
import { type AnyProbe, recordWireCall } from "../../define/probe";
import { RealtimeValidationError } from "../../realtime/errors";
import { extractParamNames } from "../../utils/helpers";
import { changesRoute } from "../../utils/url";

/** Where one call to a remote stream or channel goes, relative to its group. */
export interface CallAddress {
  /** The path, with each `:param` filled in. */
  readonly path: string;
  /** The variables the call sends, less those its path took. */
  readonly variables: Record<string, unknown> | undefined;
}

const PARAM = /:([a-zA-Z_][a-zA-Z0-9_]*)/g;

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
 * @throws RealtimeValidationError when a `:param` has no value
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

  const call = recordWireCall(probe, variables);
  return fillParams(call.path || method, asRecord(call.variables));
}

/** The closure addressing a remote endpoint, or nothing for one served here. */
function remoteProbe(endpoint: unknown): AnyProbe | undefined {
  if (typeof endpoint !== "object" || endpoint === null) return undefined;
  const { probe, served } = endpoint as { probe?: unknown; served?: unknown };
  if (served === true || typeof probe !== "function") return undefined;
  return probe as AnyProbe;
}

function fillParams(path: string, variables: Record<string, unknown> | undefined): CallAddress {
  const names = extractParamNames(path);
  if (names.length === 0) return { path, variables };

  const rest = { ...variables };
  const filled = path.replace(PARAM, (_match, name: string) => {
    const value = rest[name];
    if (value === undefined || value === null) {
      throw new RealtimeValidationError(
        `Missing required path parameter "${name}": pass it in the variables`,
      );
    }
    delete rest[name];
    /* Relayed by a proxy, a `..` reached a route above the declared one with
       the server's credentials. */
    const segment = String(value);
    if (changesRoute(segment)) {
      throw new RealtimeValidationError(
        `Path parameter "${name}" cannot be "${segment}": it would change the route`,
      );
    }
    return encodeURIComponent(segment);
  });
  return { path: filled, variables: Object.keys(rest).length > 0 ? rest : undefined };
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return undefined;
  return value as Record<string, unknown>;
}
