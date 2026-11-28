/**
 * The call an endpoint's closure makes on its wire, recorded: run with
 * stand-ins for its variables where the endpoint is defined, to read its
 * method and path (`probe.ts`), and with a call's own where a stream or a
 * channel is called (`transport/direct/address.ts`). A module both import
 * by name, so that a page of definitions alone keeps nothing here that only
 * a call takes.
 */

import { ConfigurationError } from "../errors/configuration-error";
import type { HttpMethod } from "../http-client/types";
import { type PathWriter, plainText, writePath } from "./path-tag";
import type { AnyProbe } from "./probe";

/** Every verb an HTTP endpoint may be addressed with: named on the chain, or called by its closure. */
export const HTTP_VERBS: readonly HttpMethod[] = [
  "get",
  "head",
  "options",
  "query",
  "post",
  "put",
  "patch",
  "del",
];

type WireMethod = HttpMethod | "connect";

const WIRE_METHODS: ReadonlySet<string> = new Set<WireMethod>([...HTTP_VERBS, "connect"]);

function isWireMethod(name: string): name is WireMethod {
  return WIRE_METHODS.has(name);
}

/** The call a closure made to address its endpoint. */
export interface WireCallRecord {
  /** The wire method it called — a verb, or `connect` for a channel. */
  readonly name: WireMethod;
  readonly path: string;
  /** What it passed after the path. */
  readonly variables: unknown;
  /** The request's options it passed after those — its body, for one it writes itself. */
  readonly options?: unknown;
}

/**
 * The `path` the recorder that probes an endpoint offers. Probing sends
 * nothing, so each value is written as it is — a call checks it when it
 * sends the path — and a stand-in stays the parameter it stands for.
 *
 * @example
 * ```ts
 * probingPath`files/${".."}`; // → "files/.."
 * ```
 */
const probingPath: PathWriter["path"] = (strings, ...values) =>
  writePath(strings, values, plainText).path;

/**
 * Run a wire closure once against a recording wire and return the call it
 * made to address its endpoint.
 *
 * The closure is expected to make exactly one call. Anything it does with the
 * returned value is irrelevant, so a throw is treated as success provided a
 * call was already recorded.
 *
 * @param probe - the wire closure supplied to a builder terminal
 * @param variables - what the closure is handed as its variables
 * @param path - the `path` the wire offers: for a call that sends the path,
 *   one that refuses a value as the call's parameters are refused
 * @returns the first call the closure made
 * @throws ConfigurationError when the closure records no call at all
 *
 * @example
 * ```ts
 * recordWireCall((sse, vars) => sse.get(`${vars.room}/feed`), { room: "lobby" });
 * // → { name: "get", path: "lobby/feed", variables: undefined }
 * ```
 */
export function recordWireCall(
  probe: AnyProbe | ((...args: never[]) => unknown),
  variables: unknown,
  path: PathWriter["path"] = probingPath,
): WireCallRecord {
  let recorded: WireCallRecord | undefined;
  let refused: ConfigurationError | undefined;

  const recorder = new Proxy(
    {},
    {
      get: (_target, property) => {
        if (typeof property !== "string") return undefined;
        if (property === "path") return path;
        return (...args: unknown[]): unknown => {
          refused ??= refusalOf(property, recorded);
          if (refused) throw refused;
          if (!isWireMethod(property)) return {};
          recorded = {
            name: property,
            path: typeof args[0] === "string" ? args[0] : "",
            variables: args[1],
            options: args[2],
          };
          return {};
        };
      },
    },
  );

  let thrown: unknown;
  try {
    Reflect.apply(probe, undefined, [recorder, variables]);
  } catch (error) {
    // Real variables may be absent, so a closure may still fail after the
    // addressing call has been recorded. Kept in case it was not.
    thrown = error;
  }

  if (refused) throw refused;
  if (recorded) return recorded;
  if (thrown !== undefined) throw thrown;
  throw new ConfigurationError(
    "ENDPOINT_NO_WIRE_CALL",
    '[courier] endpoint closure made no wire call — it must call exactly one of the wire methods, for example (http, vars) => http.get(":id", vars)',
  );
}

/* A closure describes one request: a method the wire does not have
   addresses none, and a second call would send one its shape leaves out. */
function refusalOf(
  method: string,
  recorded: WireCallRecord | undefined,
): ConfigurationError | undefined {
  if (!isWireMethod(method)) {
    return new ConfigurationError(
      "ENDPOINT_UNKNOWN_WIRE_METHOD",
      `[courier] endpoint closure called ${method}, which the wire does not have — call one of ${[...WIRE_METHODS].join(", ")}`,
    );
  }
  if (recorded === undefined) return undefined;
  return new ConfigurationError(
    "ENDPOINT_EXTRA_WIRE_CALL",
    `[courier] endpoint closure called the wire twice, ${recorded.name} and then ${method} — it describes one request, so it must call the wire once`,
  );
}
