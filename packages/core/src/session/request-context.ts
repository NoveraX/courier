import { createLogger } from "../logger";
import type { IncomingRequest, RequestContextProvider } from "./incoming-request";

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
 * Tell calls how to find the request the application is serving, so that
 * the APIs that keep a `session`, or `forward` a request's headers, take
 * them from it. Framework adapters provide one; registering it once on the
 * server is enough, and registering the same one again changes nothing.
 * The provider registered last is asked first.
 *
 * @param provider - Finds the request being served, or answers `undefined`
 * @returns A function that removes the provider again
 * @example
 * ```ts
 * // instrumentation.ts
 * import { registerRequestContext } from "@noverax/courier";
 * import { nextRequestContext } from "@noverax/courier-next";
 *
 * export function register() {
 *   registerRequestContext(nextRequestContext);
 * }
 * ```
 */
export function registerRequestContext(provider: RequestContextProvider): () => void {
  const list = providers();
  if (!list.includes(provider)) list.unshift(provider);
  return () => {
    const at = list.indexOf(provider);
    if (at >= 0) list.splice(at, 1);
  };
}

/**
 * Ask a provider before every other: the one that knows the request code
 * was explicitly given to serve, as `withIncomingRequest` gives it, which
 * a framework's provider registered after it must not hide.
 *
 * @param provider - Finds the request being served, or answers `undefined`
 * @example
 * ```ts
 * preferRequestContext(() => store.getStore());
 * ```
 */
export function preferRequestContext(provider: RequestContextProvider): void {
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
  log.debug("A request context provider failed after another one answered", error);
}
