import "@tanstack/react-start/server-only";
import type { RequestContextProvider } from "@noverax/courier/server";
import { appendResponseHeader, getRequest } from "@tanstack/react-start/server";

import { startRequestContext } from "./request-context";
import { type RequestMiddlewareServer, requestContextOver } from "./request-context-middleware";
import { type CreateServerCaller, serverCallerOver } from "./server-caller";

export type {
  RequestMiddlewareContext,
  RequestMiddlewareServer,
} from "./request-context-middleware";
export type { CreateServerCaller } from "./server-caller";

/**
 * The request TanStack Start for React is serving — a server function's, a
 * page's while the server renders it, a server route's — for the APIs that
 * keep a `session` or `forward` headers, found with its own `getRequest`.
 * The cookies the API sets reach the browser on the response TanStack
 * Start prepares, a redirect's and an error's too.
 *
 * `createServerCaller` and `requestContext` register it as they are made.
 * Registered by hand in a module only the server loads, it serves a call
 * made through `@noverax/courier/client` as well — in a loader, while the
 * server renders the page.
 *
 * @example
 * ```ts
 * // src/server.ts
 * import { registerRequestContext } from "@noverax/courier/server";
 * import { tanstackStartRequestContext } from "@noverax/courier-tanstack-start/react";
 *
 * registerRequestContext(tanstackStartRequestContext);
 * ```
 */
export const tanstackStartRequestContext: RequestContextProvider = startRequestContext({
  getRequest,
  appendResponseHeader,
});

/**
 * A caller for the server code of a TanStack Start app for React — a
 * server function, a server route, a request middleware — whose calls
 * carry the session of an API that keeps one, from the request being
 * served. It registers `tanstackStartRequestContext` as it is made, so
 * nothing else needs setting up.
 *
 * Keep it where only the server loads it: in a server function's handler,
 * a `*.server.ts` module or `createServerOnlyFn`. A loader is no such
 * place: it runs in the browser too, on every navigation after the first.
 * This entry carries TanStack Start's `server-only` marker, so a build
 * whose page takes it stops.
 *
 * @example
 * ```ts
 * // src/api.server.ts
 * import { createServerCaller } from "@noverax/courier-tanstack-start/react";
 * import { api } from "./api";
 *
 * export const server = createServerCaller(api);
 *
 * // src/users.ts
 * import { createServerFn } from "@tanstack/react-start";
 * import { server } from "./api.server";
 *
 * export const getMe = createServerFn().handler(() => server.users.me());
 * ```
 */
export const createServerCaller: CreateServerCaller = serverCallerOver(tanstackStartRequestContext);

/**
 * The server part of a request middleware that serves each request with
 * the user's session at hand, for `createMiddleware().server(…)` in
 * `src/start.ts`. Every call made while the request is served — by a
 * loader the server renders, through `@noverax/courier/client` too, a
 * server function, a server route — takes the request's session. Once the
 * response has left, a cookie the API sets for the request is refused
 * with the reason in the log rather than lost: a page streams, and its
 * headers leave with its first part.
 *
 * It is the middleware's server part, not the middleware: the browser
 * loads `src/start.ts` too, and TanStack Start drops what `.server(…)` is
 * given from the browser's code, this package with it. Keep TanStack
 * Start's own `createCsrfMiddleware` in the list: with `src/start.ts`
 * there, Start no longer adds it to server functions itself.
 *
 * @returns The middleware's server part
 * @example
 * ```ts
 * // src/start.ts
 * import { createCsrfMiddleware, createMiddleware, createStart } from "@tanstack/react-start";
 * import { requestContext } from "@noverax/courier-tanstack-start/react";
 *
 * export const startInstance = createStart(() => ({
 *   requestMiddleware: [
 *     createCsrfMiddleware({ filter: (ctx) => ctx.handlerType === "serverFn" }),
 *     createMiddleware().server(requestContext()),
 *   ],
 * }));
 * ```
 */
export const requestContext: () => RequestMiddlewareServer = requestContextOver(
  tanstackStartRequestContext,
);
