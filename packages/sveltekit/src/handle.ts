import { withIncomingRequest } from "@noverax/courier/node";

import { type SvelteKitServerEvent, svelteKitIncomingRequest } from "./request-context";

/** A SvelteKit `handle` hook, as far as it reads its input. */
export type RequestContextHandle = <TEvent extends SvelteKitServerEvent, TResponse>(input: {
  event: TEvent;
  resolve: (event: TEvent) => TResponse;
}) => TResponse;

/**
 * A `handle` hook that serves every request with its session and headers at
 * hand: each call the request's hooks, `load` functions, form actions and
 * endpoints make — through every `await` — takes them from it. It works
 * with any SvelteKit 2, on a platform with `AsyncLocalStorage`: Node, Bun,
 * Deno, Cloudflare with `nodejs_als`.
 *
 * @returns The hook, alone or in a `sequence`
 * @example
 * ```ts
 * // src/hooks.server.ts
 * import { requestContextHandle } from "@noverax/courier-sveltekit/handle";
 *
 * export const handle = requestContextHandle();
 * ```
 */
export function requestContextHandle(): RequestContextHandle {
  return ({ event, resolve }) =>
    withIncomingRequest(svelteKitIncomingRequest(event), () => resolve(event));
}
