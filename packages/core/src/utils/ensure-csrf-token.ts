import { getSourceName } from "../define/api";
import type { AnyDefinedApi } from "../define/types";
import { ConfigurationError } from "../errors/configuration-error";
import { csrfSource } from "../session/csrf-source";
import { captureIncomingRequest } from "../session/request-context";
import { cookieJarFor } from "../session/request-state";
import { askForToken, askOnce, tokenCall } from "./csrf-prime";
import { callInstruments } from "./execute-studio";
import { prepareAndRun } from "./prepare-and-run";

/**
 * Ask the API for the user's double-submit token now, while a request is
 * served, as a write that finds none would: once, with the user's session,
 * through the API's middleware and Studio, and the token handed to the
 * browser with the response being prepared. A request that carries the
 * token already asks nothing, and code that serves no request asks nothing.
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
  const csrf = api.options.session?.csrf;
  const source = getSourceName(api) ?? "api";
  if (csrf?.from === undefined) {
    throw new ConfigurationError(
      "SESSION_OPTIONS_INVALID",
      `[courier] ensureCsrfToken asks where ${source} hands its double-submit token out, and its session.csrf names no "from"`,
    );
  }
  const incoming = await captureIncomingRequest();
  if (incoming === undefined) return false;
  if (cookieJarFor(incoming).has(csrf.cookie)) return true;
  const path = csrfSource(csrf.from, api.options.baseURL);
  if (path === undefined) return false;
  const call = tokenCall({ source, dataSource: api }, path);
  const { studio, timing } = callInstruments(undefined);
  await askOnce(incoming.key, `${source} ${path}`, () =>
    askForToken(prepareAndRun(call, studio, timing, { incoming }), path, "the page"),
  );
  return cookieJarFor(incoming).has(csrf.cookie);
}
