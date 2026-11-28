import { getSourceName } from "../define/source-name";
import type { AnyDefinedApi } from "../define/types";
import { ConfigurationError } from "../errors/configuration-error";
import { csrfSource } from "../session/csrf-source";
import { sessionCredentials } from "../session/session-credentials";
import { askForToken, askOnce, tokenCall } from "../utils/csrf-prime";
import { callInstruments } from "../utils/execute-studio";
import { ownFields } from "../utils/own";
import { prepareAndRun } from "../utils/prepare-and-run";
import { heldOptionsOf } from "./assert-server-options";
import { provideServerCapabilities } from "./provide-server-capabilities";
import { captureIncomingRequest } from "./session/request-providers";
import { cookieJarFor } from "./session/request-state";

/**
 * Ask the API for the user's double-submit token now, while a request is
 * served, as a write that finds none would: once, with the user's session,
 * through the API's middleware and Studio, and the token handed to the
 * browser with the response being prepared. A request that carries the
 * token already asks nothing — one whose cookie of that name is empty, or
 * holds no token, carries none, as a write reads it — and code that serves
 * no request asks nothing.
 *
 * It is what a page does that writes later, from the browser or while it
 * renders — Django's `ensure_csrf_cookie` — and what a Next.js middleware
 * does, since a page cannot set cookies while it renders. A request
 * another site set off is asked for too: a token decides no write, and the
 * write it would go with is refused by the request's own checks.
 *
 * @param api - The API, whose `session.csrf.from` names where it hands the token out
 * @returns Whether the request carries the token now
 * @throws {ConfigurationError} When the API names no `session.csrf.from`
 * @example
 * ```ts
 * // In a request served with the session at hand
 * await ensureCsrfToken(api);
 * ```
 */
export async function ensureCsrfToken(api: AnyDefinedApi): Promise<boolean> {
  provideServerCapabilities();
  const source = getSourceName(api) ?? "api";
  /* Read once, and what the server holds of it: the session's own, and its address. */
  const { options: sourceOptions, session } = heldOptionsOf(api, source);
  if (session?.csrf?.from === undefined) {
    throw new ConfigurationError(
      "SESSION_OPTIONS_INVALID",
      `[courier] ensureCsrfToken asks where ${source} hands its double-submit token out, and its session.csrf names no "from"`,
    );
  }
  const incoming = await captureIncomingRequest();
  if (incoming === undefined) return false;
  /* Carried as a write reads it: a cookie of its name that is empty, or holds no token, is none. */
  const carried = (): boolean =>
    sessionCredentials(cookieJarFor(incoming), session).csrf !== undefined;
  if (carried()) return true;
  const path = csrfSource(session.csrf.from, (sourceOptions as typeof api.options).baseURL);
  if (path === undefined) return false;
  const call = tokenCall({ source, dataSource: api, sourceOptions }, path);
  const { studio, timing } = callInstruments(undefined);
  await askOnce(incoming.key, `${source} ${path}`, () =>
    askForToken(prepareAndRun(call, studio, timing, ownFields({ incoming })), path, "the page"),
  );
  return carried();
}
