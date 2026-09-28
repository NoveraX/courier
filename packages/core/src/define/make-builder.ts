import type { HttpMethod } from "../http-client/types";
import type { BuilderState } from "./builder";
import { kindFor, sealHandler } from "./descriptor";
import { makeAddressed } from "./make-addressed";
import type { AnyEndpointOptions } from "./options";
import type { AnyProbe } from "./probe";
import { probeWire } from "./probe";
import { type AnyBuilder, refinements } from "./refinements";

/** Every verb that may begin a chain, plus the one a channel connects with. */
const VERBS: readonly HttpMethod[] = ["get", "head", "options", "post", "put", "patch", "del"];

/**
 * An endpoint that has not yet said where it is.
 *
 * Naming a verb moves it to the addressed half; every other method returns
 * another of these, so the slots may be named on either side of the verb.
 *
 * @param state - The builder so far
 * @returns The builder, with the verbs, `.via()` and `.implement()` on it
 *
 * @example
 * ```ts
 * const endpoint = makeBuilder(initialState("query", {}));
 * endpoint.get(":id"); // an addressed endpoint
 * ```
 */
export function makeBuilder(state: BuilderState): AnyBuilder {
  const next = (updated: BuilderState): AnyBuilder => makeBuilder(updated);
  const address = (method: HttpMethod, path: string, options: AnyEndpointOptions): AnyBuilder =>
    makeAddressed(
      { ...state, kind: kindFor(state.kind, method) },
      {
        method,
        path,
        /* A HEAD's second argument is its fetch options, not its variables:
           handed them, `{ body }` or `{ prefixUrl }` shaped the request.
           The variables it was forwarded fill its path and query instead. */
        probe: ((w: Record<string, (...a: unknown[]) => unknown>, v: unknown) =>
          method === "head" ? w.head?.(path) : w[method]?.(path, v)) as unknown as AnyProbe,
        served: false,
      },
      options,
    );

  const verbs: AnyBuilder = {};
  for (const method of VERBS) {
    verbs[method] = (path = "", options: AnyEndpointOptions = {}) => address(method, path, options);
  }
  verbs.connect = (path = "", options: AnyEndpointOptions = {}) => address("get", path, options);

  /* An HTTP endpoint describes its answer only once a verb has said there is
     one, so nothing but `.variables()` — which a closure has to be written
     against — is offered before it. A stream or a channel has no verb to
     choose, so it keeps every slot. */
  const all = refinements(state, next);
  const { variables, use, headers, timeout, retry, meta } = all;
  const available =
    state.kind === "query" || state.kind === "mutation"
      ? { variables, use, headers, timeout, retry, meta }
      : all;

  return {
    ...available,
    ...verbs,
    via: (probe: AnyProbe, options: AnyEndpointOptions = {}) => {
      const shape = probeWire(probe);
      /* The closure hides its verb, so the endpoint is taken to write until
         `.reads()` says otherwise — a write served over a cacheable GET is the
         dangerous mistake, not the reverse. */
      return makeAddressed(
        { ...state, kind: state.kind === "query" ? "mutation" : state.kind },
        { method: shape.method, path: shape.path, probe, served: false },
        options,
      );
    },
    implement: (handler: AnyProbe, options: AnyEndpointOptions = {}) =>
      sealHandler(state, handler, options),
  };
}
