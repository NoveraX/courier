import type { ResolvedEndpointOptions } from "../define/options";
import type { BaseOptions } from "../http-client/types";
import { ownField } from "../utils/own";
import type { ForwardOptions, SessionOptions } from "./types";

/* Verbs that only read, which a double-submit check lets through without its token. */
const SAFE_VERBS: ReadonlySet<string> = new Set(["GET", "HEAD", "OPTIONS", "TRACE", "QUERY"]);

/** A call as the session reads it: what its API keeps, and what its endpoint does. */
export interface SessionTarget {
  /** The API the call is made to, which a server checks the options it reads of */
  readonly api?: object | undefined;
  /** The API's options, as the call read them once: the object a server checks and holds what it reads of */
  readonly options?: object | undefined;
  /** The options of the call's endpoint, which a server checks beside the API's before the call */
  readonly endpoint?: object | undefined;
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
  readonly dataSource: object;
  /** The API's options, as the call read them once */
  readonly options: BaseOptions | undefined;
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
 * sessionTargetOf({ dataSource: api, options: api.options, kind: "mutation", httpMethod: "DELETE", name: "api.items.remove" });
 * ```
 */
export function sessionTargetOf(input: SessionTargetInput): SessionTarget {
  const { options } = input;
  const prefixUrl = ownField(input, "prefixUrl");
  const endpoint = input.endpointOptions;
  /* The fields it needs of the API's and the endpoint's own options, each alone: a server checks
     the options when it is asked, and reads each of them first. */
  const how = ownField(endpoint, "session");
  const writes = input.kind === "mutation";
  const verb = input.httpMethod?.toUpperCase();
  return {
    api: input.dataSource,
    options,
    endpoint,
    session: how === false ? undefined : ownField(options, "session"),
    forward: ownField(endpoint, "forward") === false ? undefined : ownField(options, "forward"),
    writes,
    unsafeMethod: verb === undefined ? writes : !SAFE_VERBS.has(verb),
    unguarded: how === "unguarded",
    url: typeof prefixUrl === "string" ? prefixUrl : ownField(options, "baseURL"),
    credentials: ownField(options, "credentials"),
    name: input.name,
  };
}
