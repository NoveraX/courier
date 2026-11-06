import { createLogger } from "../../logger";
import type { IncomingRequest, RequestContextProvider } from "../../session/incoming-request";

const log = createLogger("Session");

/* Kept on the global object: a bundler may load this module twice — once for
   the server's routes, once for its instrumentation — and both must see the
   adapter the application registered. */
const PROVIDERS = Symbol.for("courier.requestContext.providers");

function providers(): RequestContextProvider[] {
  const existing: unknown = Reflect.get(globalThis, PROVIDERS);
  if (Array.isArray(existing)) return existing as RequestContextProvider[];
  const created: RequestContextProvider[] = [];
  Reflect.set(globalThis, PROVIDERS, created);
  return created;
}

/**
 * Add a provider of the request being served, asked before the ones added
 * earlier; adding the same one again changes nothing.
 *
 * @param provider - Finds the request being served, or answers `undefined`
 * @returns A function that removes the provider again
 * @example
 * ```ts
 * const remove = addRequestContextProvider(provider);
 * ```
 */
export function addRequestContextProvider(provider: RequestContextProvider): () => void {
  const list = providers();
  if (!list.includes(provider)) list.unshift(provider);
  return () => {
    const at = list.indexOf(provider);
    if (at >= 0) list.splice(at, 1);
  };
}

/**
 * Ask a provider before every other, wherever it stood.
 *
 * @param provider - Finds the request being served, or answers `undefined`
 * @example
 * ```ts
 * preferRequestContextProvider(() => store.getStore());
 * ```
 */
export function preferRequestContextProvider(provider: RequestContextProvider): void {
  const list = providers();
  if (list[0] === provider) return;
  const at = list.indexOf(provider);
  if (at >= 0) list.splice(at, 1);
  list.unshift(provider);
}

/**
 * The request being served, asked of the registered providers in turn and
 * synchronously — some frameworks know it only until the calling code first
 * waits. The first provider that answers wins; one that answers with a
 * promise is waited for in its turn, and what it rejects with is the call's
 * failure: a framework stops a render that way.
 *
 * @returns The request, a promise of it, or `undefined` when none is being served
 * @example
 * ```ts
 * const incoming = await captureIncomingRequest();
 * ```
 */
export function captureIncomingRequest():
  | IncomingRequest
  | Promise<IncomingRequest | undefined>
  | undefined {
  const list = providers();
  const pending: Promise<IncomingRequest | undefined>[] = [];
  for (const provider of list) {
    const answer = provider();
    if (answer === undefined) continue;
    if (!isPromise(answer)) {
      return pending.length === 0 ? answer : firstOf([...pending, Promise.resolve(answer)]);
    }
    pending.push(answer);
  }
  return pending.length === 0 ? undefined : firstOf(pending);
}

async function firstOf(
  answers: readonly Promise<IncomingRequest | undefined>[],
): Promise<IncomingRequest | undefined> {
  for (const [at, answer] of answers.entries()) {
    let incoming: IncomingRequest | undefined;
    try {
      incoming = await answer;
    } catch (error) {
      settleRest(answers, at);
      throw error;
    }
    if (incoming === undefined) continue;
    settleRest(answers, at);
    return incoming;
  }
  return undefined;
}

/**
 * Whether a request is being served as a call starts, as the registered
 * providers say: one answers with it, or with a promise — Next.js's does,
 * inside a request and out — and so counts as serving one.
 *
 * @returns `true` while a provider answers
 * @example
 * ```ts
 * const shared = !requestBeingServed();
 * ```
 */
export function requestBeingServed(): boolean {
  const found = captureIncomingRequest();
  /* Asked only whether one answers: the call that reads the request asks again, and fails with
     what that fails with. */
  if (found !== undefined && isPromise(found)) found.catch(ignoredFailure);
  return found !== undefined;
}

/* The answers after the one that decided are not needed; a failure among
   them must not surface as an unhandled rejection. */
function settleRest(answers: readonly Promise<unknown>[], decided: number): void {
  for (const rest of answers.slice(decided + 1)) rest.catch(ignoredFailure);
}

/**
 * Whether a provider answered with a promise rather than the request itself.
 *
 * @param answer - What the provider answered
 * @returns `true` for a promise
 * @example
 * ```ts
 * if (isPromise(found)) found = await found;
 * ```
 */
export function isPromise(
  answer: IncomingRequest | Promise<IncomingRequest | undefined>,
): answer is Promise<IncomingRequest | undefined> {
  return typeof Reflect.get(answer, "then") === "function";
}

function ignoredFailure(error: unknown): void {
  log.debug("A request context provider failed where its answer was not needed", error);
}
