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

/* The session each stream call's options were handed with, beside what the caller set. */
const sessions = new WeakMap<object, StreamSession>();

/**
 * Start finding what the user's session gives a stream or a channel, as the
 * call is made: on a server, the request being served is known only until
 * the call first waits, and the client that opens the stream is loaded
 * after. A stream reads, so it carries the session and `forward` as a read
 * over HTTP does, and repeats no double-submit token.
 *
 * @param api - The source
 * @param group - The endpoint's group, empty for none
 * @param method - The endpoint
 * @param context - The caller's context
 * @returns The session as the stream opens and reopens; `undefined` for an
 *   endpoint that takes neither the session nor `forward`
 * @example
 * ```ts
 * const session = startStreamSession(api, "chat", "room", defaults.context);
 * ```
 */
export function startStreamSession(
  api: object,
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
    dataSource: api as { options?: BaseOptions },
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
 * carrying its session.
 *
 * @param options - The call's options
 * @param session - What its session gives it
 * @returns The options, with the session beside them
 * @example
 * ```ts
 * open(group, method, variables, withStreamSession(options, startStreamSession(api, group, method, context)));
 * ```
 */
export function withStreamSession(
  options: Record<string, unknown>,
  session: StreamSession | undefined,
): Record<string, unknown> {
  if (session === undefined) return options;
  const handed = { ...options };
  sessions.set(handed, session);
  return handed;
}

/**
 * The session a stream call was handed with, if it was.
 *
 * @param options - The call's options
 * @returns Its session, or `undefined`
 * @example
 * ```ts
 * const session = streamSessionOf(options);
 * ```
 */
export function streamSessionOf(options: Record<string, unknown>): StreamSession | undefined {
  return sessions.get(options);
}
