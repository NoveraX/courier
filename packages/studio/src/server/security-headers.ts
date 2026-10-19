import type { NextFunction, Request, Response } from "express-serve-static-core";

/*
 * Studio's page drives the project: it writes files, starts mock servers and
 * sends requests on the developer's behalf. No site may frame it and lure a
 * click onto it: only the editor that shows Studio in a tab of its own —
 * VS Code and the editors built on it, whose windows and webviews no web
 * page can be — by `frame-ancestors`. A page loaded any other way than into
 * a frame is refused one by `X-Frame-Options` too, for a browser that reads
 * no policy; one loaded into a frame is the policy's to judge, as the
 * header would refuse the editor as well. A file is taken for the type
 * Studio gives it, never sniffed, and a link followed from Studio tells the
 * next site nothing of where it came from.
 *
 * The page shows what others wrote — answers of APIs, a mock's records a
 * demo's visitor added, specifications imported — so it runs no script but
 * its own: one injected into what it shows could not load, call out or send
 * a form anywhere. Styles may be inline, as the components it is built from
 * set them.
 *
 * Studio is a tool, not a site: no search engine indexes what it answers or
 * follows its links, a public demo of it included, whose visitors come from
 * the product's own pages.
 */
const POLICY = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self' data:",
  "connect-src 'self'",
  "worker-src 'self' blob:",
  "object-src 'none'",
  "base-uri 'none'",
  "form-action 'self'",
  "frame-ancestors vscode-webview: vscode-file:",
].join("; ");

const HEADERS: ReadonlyArray<readonly [string, string]> = [
  ["Content-Security-Policy", POLICY],
  ["X-Content-Type-Options", "nosniff"],
  ["Referrer-Policy", "no-referrer"],
  ["X-Robots-Tag", "noindex, nofollow"],
];

/**
 * Set the headers every answer of Studio's HTTP server carries: its page, its
 * assets and its API alike.
 *
 * @param request - The request, whose destination says whether it loads into a frame
 * @param response - The answer, before anything is written
 * @param next - Passes on to the route
 * @example
 * ```ts
 * app.use(securityHeaders);
 * ```
 */
export function securityHeaders(request: Request, response: Response, next: NextFunction): void {
  for (const [name, value] of HEADERS) response.setHeader(name, value);
  if (request.headers["sec-fetch-dest"] !== "iframe") response.setHeader("X-Frame-Options", "DENY");
  next();
}
