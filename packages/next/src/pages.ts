import type { IncomingMessage, ServerResponse } from "node:http";
import { nodeIncomingRequest, withIncomingRequest } from "@noverax/courier/node";

/** What `getServerSideProps` is handed: the request and its response among the rest. */
interface PagesContext {
  req: IncomingMessage;
  res: ServerResponse;
}

/**
 * Serve a Pages Router function with its request at hand: `getServerSideProps`
 * or an API route. Every call it makes — through every `await` — carries the
 * session of an API that keeps one, and the headers it `forward`s; the
 * session cookies the API sets reach the browser on the response.
 *
 * The App Router needs none of this: register `nextRequestContext` instead.
 *
 * @param handler - The function, as Next.js calls it
 * @returns The same function, serving its request
 * @example
 * ```ts
 * // pages/account.tsx
 * export const getServerSideProps = withRequestContext(async () => {
 *   return { props: { me: await api.users.me() } };
 * });
 *
 * // pages/api/me.ts
 * export default withRequestContext(async (req, res) => {
 *   res.json(await api.users.me());
 * });
 * ```
 */
export function withRequestContext<TContext extends PagesContext, TResult>(
  handler: (context: TContext) => TResult,
): (context: TContext) => TResult;
export function withRequestContext<
  TRequest extends IncomingMessage,
  TResponse extends ServerResponse,
  TResult,
>(handler: (req: TRequest, res: TResponse) => TResult): (req: TRequest, res: TResponse) => TResult;
export function withRequestContext(
  handler: (...args: unknown[]) => unknown,
): (...args: unknown[]) => unknown {
  return (...args) => {
    const [first, second] = args;
    const { req, res } = isPagesContext(first)
      ? first
      : { req: first as IncomingMessage, res: second as ServerResponse };
    return withIncomingRequest(nodeIncomingRequest(req, res), () => handler(...args));
  };
}

function isPagesContext(value: unknown): value is PagesContext {
  return typeof value === "object" && value !== null && "req" in value && "res" in value;
}
