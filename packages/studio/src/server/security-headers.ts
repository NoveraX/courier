import type { NextFunction, Request, Response } from "express-serve-static-core";

/*
 * Studio's page drives the project: it writes files, starts mock servers and
 * sends requests on the developer's behalf. No other site may frame it and
 * lure a click onto it — `X-Frame-Options`, and `frame-ancestors` for the
 * browsers that read only the policy. A file is taken for the type Studio
 * gives it, never sniffed, and a link followed from Studio tells the next
 * site nothing of where it came from.
 */
const HEADERS: ReadonlyArray<readonly [string, string]> = [
  ["X-Frame-Options", "DENY"],
  ["Content-Security-Policy", "frame-ancestors 'none'"],
  ["X-Content-Type-Options", "nosniff"],
  ["Referrer-Policy", "no-referrer"],
];

/**
 * Set the headers every answer of Studio's HTTP server carries: its page, its
 * assets and its API alike.
 *
 * @param _request - The request, unread
 * @param response - The answer, before anything is written
 * @param next - Passes on to the route
 * @example
 * ```ts
 * app.use(securityHeaders);
 * ```
 */
export function securityHeaders(_request: Request, response: Response, next: NextFunction): void {
  for (const [name, value] of HEADERS) response.setHeader(name, value);
  next();
}
