import { AsyncLocalStorage } from "node:async_hooks";
import type { IncomingMessage, ServerResponse } from "node:http";

import { addressedTo } from "./node-origin";
import { appendSetCookie } from "./node-set-cookie";
import type { IncomingRequest, RequestContextProvider } from "./session/incoming-request";
import { preferRequestContext } from "./session/request-context";
import { forwardedChain } from "./utils/forwarded-for";

/* One store and one provider for the process, however many copies of this
   module a bundler loads: a request entered in one is found from another. */
const STORE = Symbol.for("courier.requestContext.node.store");
const PROVIDER = Symbol.for("courier.requestContext.node.provider");

function store(): AsyncLocalStorage<IncomingRequest> {
  const existing: unknown = Reflect.get(globalThis, STORE);
  if (existing instanceof AsyncLocalStorage) return existing as AsyncLocalStorage<IncomingRequest>;
  const created = new AsyncLocalStorage<IncomingRequest>();
  Reflect.set(globalThis, STORE, created);
  return created;
}

function provider(): RequestContextProvider {
  const existing: unknown = Reflect.get(globalThis, PROVIDER);
  if (typeof existing === "function") return existing as RequestContextProvider;
  const created: RequestContextProvider = () => store().getStore();
  Reflect.set(globalThis, PROVIDER, created);
  return created;
}

/**
 * Run code while the application serves a request: every call it makes,
 * through every `await` and callback that follows, takes the user's session
 * and the forwarded headers from that request — for the APIs that keep a
 * `session` or `forward` them.
 *
 * @param incoming - The request being served
 * @param run - The code that serves it
 * @returns What `run` returns
 * @example
 * ```ts
 * createServer((req, res) => withIncomingRequest(nodeIncomingRequest(req, res), () => app(req, res)));
 * ```
 */
export function withIncomingRequest<TResult>(
  incoming: IncomingRequest,
  run: () => TResult,
): TResult {
  /* The request code is given to serve is the one it serves, whatever a framework's provider
     registered since answers: a middleware's own, say, in a process that renders pages too. */
  preferRequestContext(provider());
  return store().run(incoming, run);
}

/**
 * A Node request, as the session reads it.
 *
 * Its origin is the one its client addressed, a local proxy's
 * `X-Forwarded-Proto` and `X-Forwarded-Host` believed as the proxy believes
 * them; its user's address is the socket's peer, after the chain a local
 * proxy recorded. A cookie the API sets is appended to the response while
 * its head has not been sent.
 *
 * @param req - The request
 * @param res - Its response, which then carries the cookies the API sets
 * @returns The request, for `withIncomingRequest`
 * @example
 * ```ts
 * withIncomingRequest(nodeIncomingRequest(req, res), next);
 * ```
 */
export function nodeIncomingRequest(req: IncomingMessage, res?: ServerResponse): IncomingRequest {
  const { protocol, host } = addressedTo(req);
  const origin =
    host && URL.canParse(`${protocol}://${host}`)
      ? new URL(`${protocol}://${host}`).origin
      : undefined;
  return {
    key: req,
    method: req.method ?? "GET",
    origin,
    headers: { get: (name) => headerOf(req, name) },
    clientAddress: forwardedChain(req.socket.remoteAddress, headerOf(req, "x-forwarded-for")),
    setCookie: res ? ({ header }) => appendSetCookie(res, header) : undefined,
  };
}

/**
 * Middleware for Express, Connect and any server built on their signature:
 * the rest of the request is served with its session and headers at hand.
 *
 * @returns The middleware
 * @example
 * ```ts
 * app.use(requestContext());
 * ```
 */
export function requestContext(): (
  req: IncomingMessage,
  res: ServerResponse,
  next: () => void,
) => void {
  return (req, res, next) => withIncomingRequest(nodeIncomingRequest(req, res), next);
}

/* Node keeps a header sent more than once as a list; `Cookie` it joins as a browser would. */
function headerOf(req: IncomingMessage, name: string): string | null {
  const value = req.headers[name.toLowerCase()];
  if (value === undefined) return null;
  return Array.isArray(value) ? value.join(name.toLowerCase() === "cookie" ? "; " : ", ") : value;
}
