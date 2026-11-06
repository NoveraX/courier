import type { HttpMethod } from "../http-client/types";
import { assertNoFragment } from "./assert-no-fragment";
import type { BuilderState } from "./builder";
import { assertServedTopicKey, withTopicKey } from "./channel-topic";
import { kindFor, sealHandler } from "./descriptor";
import { makeAddressed } from "./make-addressed";
import type { AnyEndpointOptions, TopicKeyReader } from "./options";
import { type AnyProbe, HTTP_VERBS, type HttpWire, probeWire } from "./probe";
import { type AnyBuilder, refinements } from "./refinements";

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
  /* The verb decides the kind, whether named on the chain or called by a closure. */
  const address = (
    method: HttpMethod,
    path: string,
    probe: AnyProbe,
    options: AnyEndpointOptions,
    where: string,
  ): AnyBuilder => {
    assertNoFragment(path, where);
    return makeAddressed(
      { ...state, kind: kindFor(state.kind, method) },
      { method, path, probe, served: false },
      options,
    );
  };
  /* A HEAD's second argument is its fetch options, not its variables: handed
     them, `{ body }` or `{ prefixUrl }` shaped the request. The variables it
     was forwarded fill its path and query instead. */
  const verb =
    (method: HttpMethod, terminal: string = method) =>
    (path = "", options = {}) => {
      assertServedTopicKey(state, terminal);
      const probe = (w: HttpWire, v: unknown) =>
        method === "head" ? w.head(path) : w[method](path, v);
      return address(method, path, probe, options, `.${terminal}(${JSON.stringify(path)})`);
    };

  const verbs: AnyBuilder = {};
  for (const method of HTTP_VERBS) verbs[method] = verb(method);
  verbs.connect = verb("get", "connect");

  /* An HTTP endpoint describes its answer only once a verb has said there is
     one, so of its slots only `.variables()` — which a closure has to be
     written against — is offered before it, beside the methods that leave
     the answer alone: `.expose()` among them, so a head opened once opens
     every endpoint made from it. A stream or a channel has no verb to
     choose, so it keeps every slot. */
  const all = refinements(state, next);
  const { response, send, ...beforeVerb } = all;
  const available = state.kind === "query" || state.kind === "mutation" ? beforeVerb : all;
  /* Only a channel has subscribers to share a topic. */
  const keyed =
    state.kind === "channel"
      ? { topic: (key: TopicKeyReader) => next(withTopicKey(state, key)) }
      : {};

  return {
    ...available,
    ...keyed,
    ...verbs,
    /* Every call keeps to the kind the closure's verb gives here, so one that reads now writes on no call. */
    via: (probe: AnyProbe, options: AnyEndpointOptions = {}) => {
      assertServedTopicKey(state, "via");
      const { method, path } = probeWire(probe);
      return address(
        method,
        path,
        probe,
        options,
        `The path ${JSON.stringify(path)} that .via() addresses`,
      );
    },
    implement: (handler: AnyProbe, options: AnyEndpointOptions = {}) =>
      sealHandler(state, handler, options),
  };
}
