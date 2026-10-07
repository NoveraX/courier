import type { CallSession } from "../session/call-session";

/**
 * Keep the cookies an API's answer set, as the session the call took says.
 * A React Native app keeps the ones a page could read, for its calls to
 * come; a server keeps the session's for the rest of the request being
 * served, and carries them on to the browser. A browser keeps its cookies
 * itself, and never loads what carries them on.
 *
 * @param session - What the call carried
 * @param upstream - The headers the API answered with
 * @returns The `Set-Cookie` headers a `Response` of the call's own has to carry
 * @example
 * ```ts
 * const cookies = await keepAnswerCookies(call.session, result.headers);
 * ```
 */
export async function keepAnswerCookies(
  session: CallSession | undefined,
  upstream: Headers | undefined,
): Promise<string[]> {
  if (session?.learnsFrom !== undefined) {
    const { learnCookies } = await import("../session/learned-cookies");
    learnCookies(upstream, session.options, session.learnsFrom);
    return [];
  }
  if (session?.incoming === undefined) return [];
  const { relayCookies } = await import("../session/relay");
  return relayCookies(upstream, session, session.toResponse);
}
