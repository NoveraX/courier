import type { ResolvedEndpointOptions } from "../define/options";
import type { BaseOptions } from "../http-client/types";
import type { ForwardOptions, SessionOptions } from "./types";

/* Verbs that only read, which a double-submit check lets through without its token. */
const SAFE_VERBS: ReadonlySet<string> = new Set(["GET", "HEAD", "OPTIONS", "TRACE", "QUERY"]);

/** A call as the session reads it: what its API keeps, and what its endpoint does. */
export interface SessionTarget {
  /** The API's session, unless the endpoint takes none */
  readonly session?: SessionOptions | undefined;
  /** The API's forwarded headers, unless the endpoint takes none */
  readonly forward?: ForwardOptions | undefined;
  /** Whether the endpoint writes */
  readonly writes: boolean;
  /** Whether its verb is one a double-submit check guards */
  readonly unsafeMethod: boolean;
  /** Whether its writes may carry the session whatever request is served */
  readonly unguarded: boolean;
  /** Where the call goes */
  readonly url?: string | undefined;
  /** The `credentials` the API set for `fetch` itself, if it did */
  readonly credentials?: RequestCredentials | undefined;
  /** The endpoint, as messages name it: `api.users.delete` */
  readonly name: string;
}

/** What a call is resolved to, as far as the session reads it. */
export interface SessionTargetInput {
  readonly dataSource: { options?: BaseOptions | undefined };
  readonly endpointOptions?: ResolvedEndpointOptions | undefined;
  readonly kind?: "query" | "mutation" | undefined;
  readonly httpMethod?: string | undefined;
  /** The call's own `prefixUrl`, which takes it somewhere other than the API's `baseURL` */
  readonly prefixUrl?: unknown;
  readonly name: string;
}

/**
 * A call as the session reads it.
 *
 * @param input - The call's API, endpoint and verb
 * @returns What the session needs to know of it
 * @example
 * ```ts
 * sessionTargetOf({ dataSource: api, kind: "mutation", httpMethod: "DELETE", name: "api.items.remove" });
 * ```
 */
export function sessionTargetOf(input: SessionTargetInput): SessionTarget {
  const options = input.dataSource.options;
  const endpoint = input.endpointOptions;
  const writes = input.kind === "mutation";
  const verb = input.httpMethod?.toUpperCase();
  return {
    session: endpoint?.session === false ? undefined : options?.session,
    forward: endpoint?.forward === false ? undefined : options?.forward,
    writes,
    unsafeMethod: verb === undefined ? writes : !SAFE_VERBS.has(verb),
    unguarded: endpoint?.session === "unguarded",
    url: typeof input.prefixUrl === "string" ? input.prefixUrl : options?.baseURL,
    credentials: options?.credentials,
    name: input.name,
  };
}
