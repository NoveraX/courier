import type { IncomingMessage } from "node:http";

/**
 * The body NestJS's own parser read before the middleware ran, as a request
 * body the proxy can read again.
 *
 * `NestFactory.create` mounts Express's JSON and URL-encoded parsers across
 * the whole application, ahead of every middleware, and a route cannot opt
 * out; turning them off empties every `@Body()` in the app. So the proxy
 * takes the body from where the parser left it:
 *
 * - the exact bytes, when the app is created with `{ rawBody: true }`;
 * - otherwise the parsed JSON, serialized again. A Courier client's body is
 *   itself `JSON.stringify` output, so this yields the same value.
 *
 * Anything else the parser consumed — a URL-encoded form — cannot be
 * rebuilt faithfully, and is left for the caller to report.
 *
 * @param req - The request the middleware received
 * @returns The body, or `undefined` when there is nothing faithful to send
 *
 * @example
 * ```ts
 * const request = toWebRequest(req, res, () => bodyNestParsed(req));
 * ```
 */
export function bodyNestParsed(req: IncomingMessage): BodyInit | undefined {
  if ("rawBody" in req && req.rawBody instanceof Uint8Array) return Uint8Array.from(req.rawBody);
  if (!isJson(req.headers["content-type"])) return undefined;
  if (!("body" in req) || req.body === undefined) return undefined;
  return JSON.stringify(req.body);
}

/** Does the content type name JSON — `application/json` or a `+json` type? */
function isJson(contentType: string | undefined): boolean {
  const mediaType = contentType?.split(";")[0]?.trim().toLowerCase();
  return mediaType === "application/json" || mediaType?.endsWith("+json") === true;
}
