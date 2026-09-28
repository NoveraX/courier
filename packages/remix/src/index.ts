import { createHandler, type HandlerConfig } from "@noverax/courier";
import { announceWhenRegistered } from "@noverax/courier/announce";

/**
 * Create a Remix resource route handler for the courier proxy.
 *
 * Sources are read from the core global registry populated by
 * `attachRuntime()` — call `await attachRuntime()` in your server
 * bootstrap before the first request.
 *
 * On its first request it tells an attached Studio which sources it serves,
 * so the Playground can run them in this process.
 *
 * @param config - Handler options, including the `allowedOrigins` the SSE
 *   transport checks against. Omit it to accept the defaults.
 *
 * @example
 * ```ts
 * // app/routes/api.request.ts
 * import { courierHandler } from "@noverax/courier-remix";
 *
 * const handler = courierHandler();
 * export const loader = handler;
 * export const action = handler;
 * ```
 */
export function courierHandler(
  config?: HandlerConfig,
): (args: { request: Request }) => Promise<Response> {
  const { handle } = createHandler(config);
  const announce = announceWhenRegistered({ transports: ["http", "sse"], framework: "remix" });
  return ({ request }: { request: Request }) => {
    announce();
    return handle(request);
  };
}
