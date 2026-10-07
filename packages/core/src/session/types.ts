/**
 * How an API keeps the user's session, so that a call made while the
 * application serves that user carries it — on a server, from the request
 * being served; in a browser, by the browser's own cookies.
 *
 * Only what is named here is sent: the application's other cookies, and the
 * headers the request carries for the application itself, stay with it.
 *
 * @example
 * ```ts
 * defineApi({
 *   baseURL: "https://api.example.com",
 *   session: {
 *     cookies: ["sessionid", "logto_*"],
 *     csrf: { cookie: "csrftoken", header: "x-csrftoken" },
 *   },
 *   endpoints,
 * });
 * ```
 */
export interface SessionOptions {
  /**
   * The cookies the API keeps the session in: names, or prefixes written with
   * a trailing `*`, such as `"logto_*"`. Names are matched exactly, as
   * browsers keep them.
   */
  cookies?: readonly string[] | undefined;
  /**
   * A cookie holding a token the API takes as `Authorization: Bearer`. The
   * cookie itself is sent only when `cookies` names it too.
   */
  bearer?: string | undefined;
  /**
   * The double-submit token the API asks a write to repeat: the cookie it
   * keeps the token in, sent with the session, and the header a write sends
   * it back in.
   */
  csrf?: CsrfOptions | undefined;
  /**
   * Pass the session cookies the API sets back to the browser, made for the
   * application's own origin — default true. Off, a session the API renews
   * or ends changes only for the calls of the request being served.
   */
  relay?: boolean | undefined;
  /**
   * Pages on other origins whose requests may make the application write with
   * the user's session, written as the proxy's `allowedOrigins` are. Unset,
   * only the application's own pages may.
   */
  allowedOrigins?: readonly string[] | undefined;
  /**
   * Send the session over plain HTTP to a host on the public internet. Left
   * unset, it travels only over HTTPS, or to the local machine and private
   * networks — a cluster's `http://api:8080` — where nothing else listens in.
   */
  allowHttp?: boolean | undefined;
}

/** A double-submit token: the cookie that holds it and the header it is repeated in. */
export interface CsrfOptions {
  /** The cookie the API keeps the token in */
  cookie: string;
  /** The header a write repeats it in, such as `"x-csrftoken"` */
  header: string;
}

/**
 * The headers a call made while serving a request carries from it, so the
 * API's logs, traces and limits see the user the application serves rather
 * than the application itself.
 *
 * @example
 * ```ts
 * defineApi({ baseURL, forward: { requestId: true, trace: true, clientAddress: true }, endpoints });
 * ```
 */
export interface ForwardOptions {
  /**
   * The id the request being served goes by: its own `x-request-id` when it
   * carries a well-formed one, otherwise one made for it and shared by every
   * call made while serving it. A string names another header.
   */
  requestId?: boolean | string | undefined;
  /**
   * W3C trace context — `traceparent` and `tracestate` — when the request
   * carries a valid one and no tracer in the process propagates it already.
   */
  trace?: boolean | undefined;
  /**
   * The address the user's request came from, as `X-Forwarded-For`: the one
   * the framework vouches for, or the chain the proxy in front recorded —
   * never one the request claims for itself past that proxy.
   */
  clientAddress?: boolean | undefined;
  /** The user's browser, as `User-Agent` */
  userAgent?: boolean | undefined;
  /** The languages the user reads, as `Accept-Language` */
  locale?: boolean | undefined;
  /**
   * Further headers of the request to pass on as they are — a tenant, a
   * region the edge in front of the application added. Credentials and the
   * headers of the connection are never among them.
   */
  headers?: readonly string[] | undefined;
}

/**
 * How one endpoint takes its source's session:
 *  - `false` — never: it answers every user alike, and a call to it does not
 *    read the request being served for the session.
 *  - `"unguarded"` — a write that may carry the session whatever request the
 *    application is serving, a link on another site's page included; for a
 *    write that does no harm when someone else sets it off, such as signing
 *    out.
 */
export type EndpointSession = false | "unguarded";
