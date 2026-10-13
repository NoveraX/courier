import { agentOptions } from "../agent/agent-options";
import { ConfigurationError } from "../errors/configuration-error";
import type { HttpMethod } from "../http-client/types";
import type { CacheConfig } from "../validation";
import type { BuilderState } from "./builder";
import { withValue } from "./builder";
import { sealAt } from "./descriptor";
import type { AnyEndpointOptions } from "./options";
import type { AnyProbe } from "./probe";
import { type AnyBuilder, refinements } from "./refinements";
import { variableDefaults } from "./variable-defaults";

/** Where an endpoint sits, once a verb has said so. */
export interface Wire {
  readonly method: HttpMethod;
  readonly path: string;
  readonly probe: AnyProbe;
  readonly served: boolean;
}

/** How a message names an endpoint: `GET ":id"`, `DELETE "files/:id"`. */
function addressOf(wire: Wire): string {
  return `${wire.method === "del" ? "DELETE" : wire.method.toUpperCase()} "${wire.path}"`;
}

/**
 * An endpoint that has said where it is.
 *
 * It is a finished descriptor and a builder at once: every consumer can read
 * it as it stands, and naming a schema or an option returns another one. The
 * methods are hidden from enumeration so the descriptor reads as data.
 *
 * @param state - The builder so far
 * @param wire - The verb, path and closure that address the endpoint
 * @param options - The options the verb was given
 * @returns The descriptor, with the builder's methods on it
 *
 * @example
 * ```ts
 * makeAddressed(state, { method: "get", path: ":id", probe, served: false }, {});
 * ```
 */
/* The verbs that change what they address; no declaration makes one a read. */
const CHANGING_VERBS: ReadonlySet<string> = new Set(["put", "patch", "del"]);

export function makeAddressed(
  state: BuilderState,
  wire: Wire,
  options: AnyEndpointOptions,
): AnyBuilder {
  const next = (updated: BuilderState): AnyBuilder => makeAddressed(updated, wire, options);
  const endpoint = sealAt(state, wire, options);

  const methods: AnyBuilder = {
    ...refinements(state, next, addressOf(wire)),
    cache: (config: CacheConfig) => {
      if (state.kind !== "query") {
        throw new ConfigurationError(
          "CACHE_ON_WRITE",
          `[courier] .cache() was named on an endpoint addressed with .${wire.method}(), which ` +
            "writes — remove it, or declare the endpoint a read with .reads()",
        );
      }
      return next(withValue(state, "cache", config));
    },
    reads: () => {
      if (CHANGING_VERBS.has(wire.method)) {
        throw new ConfigurationError(
          "READS_ON_CHANGING_VERB",
          `[courier] .reads() was named on an endpoint addressed with .${wire.method}(), which ` +
            "changes what it addresses — served as a read, it would run on every cacheable GET. " +
            "A read that sends a body is addressed with .post().",
        );
      }
      return next({ ...state, kind: "query" });
    },
    agent: (given: unknown) => next({ ...state, agent: agentOptions(given, addressOf(wire)) }),
    defaults: (values: unknown) =>
      next({
        ...state,
        defaults: { ...state.defaults, ...variableDefaults(values, addressOf(wire)) },
      }),
  };

  for (const [name, method] of Object.entries(methods)) {
    Object.defineProperty(endpoint, name, { value: method, enumerable: false });
  }
  return endpoint;
}
