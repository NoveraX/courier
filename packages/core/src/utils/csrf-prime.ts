import { isHTTPError } from "../errors/http-error";
import type { Context } from "../http-client/types";
import { createLogger } from "../logger";
import { type CallSession, sameRequestContext, sessionFor } from "../session/call-session";
import { csrfSource } from "../session/csrf-source";
import { sessionTargetOf } from "../session/session-target";
import { abortReason } from "./abort-reason";
import { keepAnswerCookies } from "./answer-cookies";
import { clientForCall } from "./execute-helpers";
import { applyCallSession, callSessionTarget } from "./execute-session";
import type { CallTarget } from "./execute-target";

const log = createLogger("Session");

/** What a write goes on with once its token was asked for. */
export interface PrimedSession {
  /** Its session, read again with what the answer set */
  readonly session: CallSession | undefined;
  /** The cookies the answer set, for a `Response` of the write's own to carry */
  readonly primed: readonly string[];
}

/* Who the token is asked for: the request being served, or the one user a browser or an app serves. */
const ONE_USER: object = {};
const asking = new WeakMap<object, Map<string, Promise<readonly string[]>>>();
const warned = new Set<string>();

/**
 * Ask the API for the double-submit token a write found none of, where the
 * API says it comes from, then read the write's session again. The call
 * goes as the API's calls go — its address, headers and `fetch` — with the
 * user's session, and the cookies its answer sets are kept as any answer's
 * are. Writes waiting on the same user's token share one call; one that
 * fails, or whose answer sets no token, leaves the write to go without, and
 * the API to refuse it as it would.
 *
 * @param target - The write
 * @param context - Its context
 * @param session - What it carried, with `primeFrom` set
 * @param signal - The write's signal: aborted, the write stops waiting for the token
 * @returns The write's session read again, and the cookies the answer set
 * @example
 * ```ts
 * const { session, primed } = await primeCsrfToken(target, context, found, signal);
 * ```
 */
export async function primeCsrfToken(
  target: CallTarget,
  context: Context | undefined,
  session: CallSession,
  signal: AbortSignal | undefined,
): Promise<PrimedSession> {
  const from = session.primeFrom ?? "";
  const path = csrfSource(from, target.dataSource.options?.baseURL);
  if (path === undefined) {
    warnOnce(
      from,
      `csrf.from ${from} is a path from the root of an origin, and the API's address names none`,
    );
    return { session, primed: [] };
  }
  const again = sameRequestContext(context, session);
  const key = `${String(target.source)} ${path}`;
  const asked = once(session.incoming?.key ?? ONE_USER, key, () =>
    askForToken(target, again, path),
  );
  const primed = await unlessAborted(asked, signal);
  const reread = await sessionFor(again, callSessionTarget(target));
  if (reread?.primeFrom !== undefined) {
    warnOnce(
      key,
      `The answer at ${path} set no ${session.options?.csrf?.cookie} this call can read, so the write goes without its double-submit token`,
    );
  }
  return { session: reread, primed };
}

/* The writes waiting on it share the call, so none of their signals stops it. */
async function askForToken(
  target: CallTarget,
  context: Context | undefined,
  path: string,
): Promise<readonly string[]> {
  const read = sessionTargetOf({
    dataSource: target.dataSource,
    kind: "query",
    httpMethod: "GET",
    name: `${String(target.source)} csrf token`,
  });
  const session = await sessionFor(context, read);
  const carrier = { headers: new Headers() };
  const options = applyCallSession(session, carrier, {}, target.dataSource.options);
  const methods = clientForCall(target.dataSource, context).createMethods({
    ...options,
    headers: carrier.headers,
  });
  try {
    const answer = await methods.get(path);
    return await keepAnswerCookies(session, answer.headers);
  } catch (error) {
    log.warn(`Asking ${path} for the double-submit token failed; the write goes without it`, error);
    return keepAnswerCookies(session, isHTTPError(error) ? error.headers : undefined);
  }
}

function once(
  scope: object,
  key: string,
  ask: () => Promise<readonly string[]>,
): Promise<readonly string[]> {
  let pending = asking.get(scope);
  if (pending === undefined) {
    pending = new Map();
    asking.set(scope, pending);
  }
  const running = pending.get(key);
  if (running !== undefined) return running;
  const started = ask().finally(() => pending.delete(key));
  pending.set(key, started);
  return started;
}

/* A write whose signal aborts stops waiting; the call it shared goes on for the others. */
function unlessAborted<TValue>(
  work: Promise<TValue>,
  signal: AbortSignal | undefined,
): Promise<TValue> {
  if (signal === undefined) return work;
  if (signal.aborted) return Promise.reject(abortReason(signal));
  return new Promise<TValue>((resolve, reject) => {
    const stop = (): void => reject(abortReason(signal));
    signal.addEventListener("abort", stop, { once: true });
    work.then(resolve, reject).finally(() => signal.removeEventListener("abort", stop));
  });
}

function warnOnce(key: string, message: string): void {
  if (warned.has(key)) return;
  warned.add(key);
  log.warn(message);
}
