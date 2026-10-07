import { createLogger } from "../../logger";
import type { SSEConnectInit } from "../../realtime/sse/sse-types";
import type { CallSession } from "../../session/call-session";
import { keepAnswerCookies } from "../../utils/answer-cookies";
import { fieldOf, textOf } from "./read-definition";
import type { StreamSession } from "./stream-session";

const log = createLogger("SSE");

const CREDENTIALS: ReadonlySet<string> = new Set(["include", "omit", "same-origin"]);

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
 * or an app, which send the session's cookies themselves — and the API's
 * own `credentials`, which the session's give way to. The cookies the
 * stream's answer sets are kept as a call's: handed on to the browser from
 * a server, learned in a React Native app.
 *
 * @param api - The source
 * @param session - What the user's session gives the stream
 * @returns How its connections open; `undefined` for a stream that takes
 *   no session, of an API that sets no `credentials`
 * @example
 * ```ts
 * const connection = streamConnection(api, streamSessionOf(options));
 * subscribeSSE(url, { headers, beforeConnect: connection?.beforeConnect });
 * ```
 */
export function streamConnection(
  api: object,
  session: StreamSession | undefined,
): StreamConnection | undefined {
  const credentials = credentialsOf(api);
  if (session === undefined && credentials === undefined) return undefined;
  let connected: CallSession | undefined;
  return {
    async beforeConnect() {
      connected = await session?.current();
      return {
        headers: Object.fromEntries(connected?.headers ?? []),
        init: { ...connected?.fetchInit, ...(credentials && { credentials }) },
      };
    },
    keepCookies(response) {
      keepAnswerCookies(connected, response.headers).catch((error: unknown) =>
        log.warn("The cookies a stream's answer set could not be kept", error),
      );
    },
  };
}

function credentialsOf(api: object): RequestCredentials | undefined {
  const credentials = textOf(fieldOf(api, "options"), "credentials");
  return isCredentials(credentials) ? credentials : undefined;
}

function isCredentials(value: string): value is RequestCredentials {
  return CREDENTIALS.has(value);
}
