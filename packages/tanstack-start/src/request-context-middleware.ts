import { type RequestContextProvider, registerRequestContext } from "@noverax/courier/server";

import { markAnswered } from "./request-context";

/** What `createMiddleware().server(…)` hands the function it is given, as far as this reads it. */
export interface RequestMiddlewareContext<TResult> {
  /** The request being served */
  readonly request: Request;
  /** Serve the rest of the request: the middleware after this one, then what answers it */
  next(): TResult | Promise<TResult>;
}

/** A function for `createMiddleware().server(…)`: it gives back what the rest of the request gave. */
export type RequestMiddlewareServer = <TResult>(
  context: RequestMiddlewareContext<TResult>,
) => Promise<TResult>;

/**
 * `requestContext` for one entry: the server part of a request middleware
 * that registers the entry's provider of the request being served as it
 * is made, and marks each request answered once the rest of it has given
 * its response back.
 *
 * @param provider - Finds the request TanStack Start is serving
 * @returns `requestContext`
 * @example
 * ```ts
 * export const requestContext = requestContextOver(tanstackStartRequestContext);
 * ```
 */
export function requestContextOver(
  provider: RequestContextProvider,
): () => RequestMiddlewareServer {
  return () => {
    registerRequestContext(provider);
    return async (context) => {
      try {
        return await context.next();
      } finally {
        markAnswered(context.request);
      }
    };
  };
}
