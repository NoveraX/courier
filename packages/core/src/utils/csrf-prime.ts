import type { Context, HttpMethods } from "../http-client/types";
import { createLogger } from "../logger";
import { type CallSession, sameRequestContext, sessionFor } from "../session/call-session";
import { csrfSource } from "../session/csrf-source";
import { abortReason } from "./abort-reason";
import { callSessionTarget } from "./execute-session";
import type { CallTarget } from "./execute-target";

const log = createLogger("Session");

/** Runs a call as every call runs: its session, its API's middleware, and Studio's view of it. */
export type CallRunner = (target: CallTarget, context: Context | undefined) => Promise<unknown>;

/** A write that found no double-submit token, and what asks for one. */
export interface PrimeCall {
  readonly target: CallTarget;
  readonly context: Context | undefined;
  /** What the write carried, with `primeFrom` set */
  readonly session: CallSession;
  readonly run: CallRunner;
}

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
 * API says it comes from, then read the write's session again. The request
 * is a call like any other — the user's session, the API's middleware,
 * Studio's view of it — marked `purpose: "csrf-token"`, since it is none of
 * the API's endpoints; the cookies its answer sets are kept as any answer's
 * are. Writes waiting on the same user's token share one request, and one
 * whose signal aborts stops waiting without stopping it. A request that
 * fails, or whose answer sets no token, leaves the write to go without, and
 * the API to refuse it as it would.
 *
 * @param call - The write, and what runs the request for its token
 * @param signal - The write's signal: aborted, the write stops waiting for the token
 * @returns The write's session read again, and the cookies the answer set
 * @example
 * ```ts
 * const { session, primed } = await primeCsrfToken({ target, context, session: found, run }, signal);
 * ```
 */
export async function primeCsrfToken(
  call: PrimeCall,
  signal: AbortSignal | undefined,
): Promise<PrimedSession> {
  const { target, session } = call;
  const from = session.primeFrom ?? "";
  const path = csrfSource(from, target.dataSource.options?.baseURL);
  if (path === undefined) {
    warnOnce(
      from,
      `csrf.from ${from} is a path from the root of an origin, and the API's address names none`,
    );
    return { session, primed: [] };
  }
  const again = sameRequestContext(call.context, session);
  const key = `${String(target.source)} ${path}`;
  const asked = once(session.incoming?.key ?? ONE_USER, key, () =>
    askForToken(call.run(tokenCall(target, path), again), path),
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

/* The request for the token: a GET of the API's, which none of its endpoints describes. */
function tokenCall(target: CallTarget, path: string): CallTarget {
  return {
    source: target.source,
    group: undefined,
    method: "csrf token",
    variables: undefined,
    options: undefined,
    dataSource: target.dataSource,
    endpoint: (http: unknown) => (http as Pick<HttpMethods, "get">).get(path),
    endpointGroup: undefined,
    schema: undefined,
    endpointOptions: undefined,
    httpMethod: "GET",
    purpose: "csrf-token",
  };
}

/* The cookies the answer set that a Response of the write's own carries; the
   call kept them already where nothing carries them on. */
async function askForToken(answer: Promise<unknown>, path: string): Promise<readonly string[]> {
  try {
    const answered = await answer;
    if (!(answered instanceof Response)) return [];
    if (!answered.ok)
      log.warn(`Asking ${path} for the double-submit token was answered ${answered.status}`);
    return answered.headers.getSetCookie();
  } catch (error) {
    log.warn(`Asking ${path} for the double-submit token failed; the write goes without it`, error);
    return [];
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

/* A write whose signal aborts stops waiting; the request it shared goes on for the others. */
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
