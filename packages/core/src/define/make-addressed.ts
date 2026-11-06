import { agentOptions } from "../agent/agent-options";
import { ConfigurationError, type ConfigurationErrorCode } from "../errors/configuration-error";
import type { HttpMethod } from "../http-client/types";
import { isReadingMethod, normalizeHttpMethod } from "../utils/helpers";
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
  return `${normalizeHttpMethod(wire.method)} "${wire.path}"`;
}

/* The verbs that change what they address; no declaration makes one a read. */
const CHANGING_VERBS: ReadonlySet<string> = new Set(["put", "patch", "del"]);

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
export function makeAddressed(
  state: BuilderState,
  wire: Wire,
  options: AnyEndpointOptions,
): AnyBuilder {
  const next = (updated: BuilderState): AnyBuilder => makeAddressed(updated, wire, options);
  const endpoint = sealAt(state, wire, options);
  const where = addressOf(wire);
  /* `.reads()` and `.writes()` name the kind, which every call then keeps to. */
  const declared = (kind: "query" | "mutation"): AnyBuilder =>
    next({ ...state, kind, kindNamed: true });
  /* What a read alone takes, refused where it was named on an endpoint that is none. */
  const readOnly = (method: string, code: ConfigurationErrorCode, why: string): void => {
    if (state.kind === "query") return;
    const named = `[courier] ${method} was named on`;
    /* A closure's verb, even a reading one, leaves the endpoint taken to write. */
    const how = isReadingMethod(wire.method) ? ".via()" : `.${wire.method}()`;
    throw new ConfigurationError(
      code,
      state.kind !== "mutation"
        ? `${named} a stream or a channel: only an HTTP read takes it.`
        : state.kindNamed
          ? `${named} an endpoint declared a write with .writes(): ${why}.`
          : `${named} an endpoint addressed with ${how}, which writes: ${why}. Declare a read with .reads() first.`,
    );
  };

  const methods: AnyBuilder = {
    ...refinements(state, next, where),
    cache: (config: CacheConfig) => {
      readOnly(".cache()", "CACHE_ON_WRITE", "a write's answer is never kept");
      return next(withValue(state, "cache", config));
    },
    /* Only `true` turns it on, as `.expose()` opens only for `true`. */
    cancelPrevious: (cancel: unknown = true) => {
      readOnly(
        ".cancelPrevious()",
        "CANCEL_PREVIOUS_ON_WRITE",
        "a cancelled write has usually been applied",
      );
      return next({ ...state, cancelPrevious: cancel === true });
    },
    agent: (given: unknown) => next({ ...state, agent: agentOptions(given, where) }),
    defaults: (values: unknown) =>
      next({
        ...state,
        defaults: { ...state.defaults, ...variableDefaults(values, where) },
      }),
    reads: () => {
      if (CHANGING_VERBS.has(wire.method)) {
        throw new ConfigurationError(
          "READS_ON_CHANGING_VERB",
          `[courier] .reads() was named on an endpoint addressed with .${wire.method}(), which ` +
            "changes what it addresses — served as a read, it would run on every cacheable GET. " +
            "A read that sends a body is addressed with .post().",
        );
      }
      return declared("query");
    },
    writes: () => declared("mutation"),
  };

  for (const [name, method] of Object.entries(methods)) {
    Object.defineProperty(endpoint, name, { value: method, enumerable: false });
  }
  return endpoint;
}
