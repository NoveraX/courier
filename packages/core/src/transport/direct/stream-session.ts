import { getSourceName } from "../../define/api";
import type { BaseOptions, Context } from "../../http-client/types";
import { type CallSession, sameRequestContext, sessionFor } from "../../session/call-session";
import { sessionTargetOf } from "../../session/session-target";
import { resolveEndpoint } from "../../utils/execute-resolve";

/** What the user's session gives a stream or a channel a direct caller opens. */
export interface StreamSession {
  /** The session as it was when the call was made */
  readonly found: Promise<CallSession | undefined>;
  /** The session now, read anew for a connection opened again */
  current(): Promise<CallSession | undefined>;
  /** What the endpoint takes of it — the session, `forward` — which a socket opened for one is kept to */
  readonly takes: string;
}

/** What a stream or a channel a direct caller opens was made with, as its call read it. */
export interface StreamCall {
  /** The source's options, read once as the call was made: where it opens, and with what */
  readonly options: BaseOptions | undefined;
  /** What the user's session gives it; none for one that takes neither the session nor `forward` */
  readonly session: StreamSession | undefined;
}

/* What each stream call's options were handed with, beside what the caller set. */
const calls = new WeakMap<object, StreamCall>();

/**
 * Start finding what the user's session gives a stream or a channel, as the
 * call is made: on a server, the request being served is known only until
 * the call first waits, and the client that opens the stream is loaded
 * after. A stream reads, so it carries the session and `forward` as a read
 * over HTTP does, and repeats no double-submit token.
 *
 * @param api - The source
 * @param options - The source's options, as the call read them once
 * @param group - The endpoint's group, empty for none
 * @param method - The endpoint
 * @param context - The caller's context
 * @returns The session as the stream opens and reopens; `undefined` for an
 *   endpoint that takes neither the session nor `forward`
 * @example
 * ```ts
 * const session = startStreamSession(api, api.options, "chat", "room", defaults.context);
 * ```
 */
export function startStreamSession(
  api: object,
  options: BaseOptions | undefined,
  group: string,
  method: string,
  context: Context | undefined,
): StreamSession | undefined {
  const { options: endpointOptions } = resolveEndpoint(
    api as Record<string, unknown>,
    group,
    method,
  );
  const target = sessionTargetOf({
    dataSource: api,
    options,
    endpointOptions,
    kind: "query",
    httpMethod: "GET",
    name: [getSourceName(api), group, method].filter(Boolean).join("."),
  });
  if (target.session === undefined && target.forward === undefined) return undefined;
  /* Asked for before anything waits; what it fails with is the stream's,
     told where a connection waits for it. */
  const found = (async () => await sessionFor(context, target))();
  found.catch(() => undefined);
  return {
    found,
    current: async () => {
      const was = await found;
      return was === undefined ? undefined : sessionFor(sameRequestContext(context, was), target);
    },
    takes: `${target.session ? "session" : ""} ${target.forward ? "forward" : ""}`,
  };
}

/**
 * The options a stream call is handed to the client that opens it with,
 * carrying what the call was made with: the source's options it read, and
 * its session.
 *
 * @param options - The call's options
 * @param sourceOptions - The source's options, as the call read them once
 * @param session - What its session gives it
 * @returns The options, with the call beside them
 * @example
 * ```ts
 * open(group, method, variables, withStreamCall(options, api.options, session));
 * ```
 */
export function withStreamCall(
  options: Record<string, unknown>,
  sourceOptions: BaseOptions | undefined,
  session: StreamSession | undefined,
): Record<string, unknown> {
  const handed = { ...options };
  calls.set(handed, { options: sourceOptions, session });
  return handed;
}

/**
 * What a stream call was handed with: none for a stream its caller did not make.
 *
 * @param options - The call's options
 * @returns What it was made with, or `undefined`
 * @example
 * ```ts
 * const session = streamCallOf(options)?.session;
 * ```
 */
export function streamCallOf(options: Record<string, unknown>): StreamCall | undefined {
  return calls.get(options);
}
