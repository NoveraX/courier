import type { ResolvedTransport } from "../../http-client/resolve-transport";
import { createLogger } from "../../logger";
import type { SSEConnectInit } from "../../realtime/sse/sse-types";
import type { CallSession } from "../../session/call-session";
import { keepAnswerCookies } from "../../utils/answer-cookies";
import { streamInitOf } from "./source-transport";
import type { StreamSession } from "./stream-session";

const log = createLogger("SSE");

/** What each connection of a direct caller's stream opens with, and what its answer leaves. */
export interface StreamConnection {
  /** The session's headers as they are now, and what `fetch` is given */
  beforeConnect(): Promise<SSEConnectInit>;
  /** Keep the cookies the connection's answer set, as a call's are kept */
  keepCookies(response: Response): void;
}

/**
 * What each connection of a direct caller's stream is opened with besides
 * its own headers, as a read over HTTP is: the user's session read anew —
 * its cookies and bearer on a server, `credentials: "include"` in a browser
 * or an app, which send the session's cookies themselves — and what the
 * API's own options give a request that stays open, which the session's
 * give way to: its `credentials`, and the stream's transport — the
 * `dispatcher` that carries a client certificate or a proxy on Node, Bun's
 * `proxy` and `tls`, Deno's `client` — from the call, its group or the
 * API. The cookies the stream's answer sets are kept as a call's: handed
 * on to the browser from a server, learned in a React Native app.
 *
 * @param api - The source
 * @param session - What the user's session gives the stream
 * @param transport - The stream's transport: the call's, its group's or its source's
 * @returns How its connections open; `undefined` for a stream that takes
 *   no session, of an API whose options give a stream nothing
 * @example
 * ```ts
 * const connection = streamConnection(api, streamSessionOf(options), transportOf(api, group, options));
 * subscribeSSE(url, { headers, beforeConnect: connection?.beforeConnect });
 * ```
 */
export function streamConnection(
  api: object,
  session: StreamSession | undefined,
  transport: ResolvedTransport,
): StreamConnection | undefined {
  const init = streamInitOf(api, transport);
  if (session === undefined && Object.keys(init).length === 0) return undefined;
  let connected: CallSession | undefined;
  return {
    async beforeConnect() {
      connected = await session?.current();
      return {
        headers: Object.fromEntries(connected?.headers ?? []),
        init: { ...connected?.fetchInit, ...init },
      };
    },
    keepCookies(response) {
      keepAnswerCookies(connected, response.headers).catch((error: unknown) =>
        log.warn("The cookies a stream's answer set could not be kept", error),
      );
    },
  };
}
