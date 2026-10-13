/**
 * The routes a caller may use without Studio's token, and the check that a
 * caller presented the token for every other one.
 */

import type { NextFunction, Request, RequestHandler, Response } from "express-serve-static-core";

import { canonicalRoute } from "./canonical-route";
import type { StudioToken } from "./studio-token";

/** The header a page presents the token in. */
export const TOKEN_HEADER = "x-courier-studio-token";

/**
 * The API routes a caller without the token may use, each by the one path
 * it names: each reads what Studio shows. Every other route under `/api`
 * asks for the token — those that change the project's files, its mocks or
 * what every page shows, and those that read past what Studio shows: a file
 * of the project, the lines of its code or its config, a host the project
 * names. A route added and not listed here asks for the token too, so
 * forgetting to list one refuses a reader instead of letting a writer
 * through.
 */
export const OPEN_ROUTES: ReadonlySet<string> = new Set([
  "/api/health",
  "/api/apis/parse",
  "/api/apis/generate",
  "/api/apis/diff",
  "/api/apis/layout",
  "/api/apis/traffic-spec",
  "/api/openapi/document",
  "/api/sessions/list",
  "/api/sessions/export",
  "/api/sessions/export-live",
  "/api/sessions/file",
  "/api/sessions/environment",
  "/api/contract/report",
  "/api/storage",
  "/api/webhooks/list",
  "/api/editor/requests",
  "/api/editor/mocks",
  "/api/editor/endpoints",
  "/api/editor/calls",
  "/api/editor/findings",
]);

/** What a caller without the token is told. */
export const TOKEN_REFUSAL =
  "Studio makes changes, and reads past what it shows, only for a page opened from the link it printed in its terminal, which carries this project's token.";

/**
 * Whether a request path asks for the token. A path is the API's when it
 * names `/api` as written, or as {@link canonicalRoute} reads it — so no
 * spelling a router or a proxy in front could take for an API route escapes
 * the check — or when it cannot be read within bounds. Such a path is open
 * only when it is one of the {@link OPEN_ROUTES} as written: Express routes
 * a path as written, case and trailing slash included, so that path
 * reaches the open route alone, while a path read otherwise than it is
 * spelled — a parameter climbing out of `/api` by `..%2F`, say — is open to
 * no caller without the token.
 *
 * @param path - The request's path as received, without its query
 * @returns `true` for every API path but the {@link OPEN_ROUTES} as written
 * @example
 * ```ts
 * requiresToken("/api/sessions/list"); // → false
 * requiresToken("/api/sessions/list/"); // → true: no open route is spelled so
 * requiresToken("/x/..%2Fapi/sessions/save"); // → true: read as /api/sessions/save
 * requiresToken("/explorer"); // → false
 * ```
 */
export function requiresToken(path: string): boolean {
  if (OPEN_ROUTES.has(path)) return false;
  if (namesApi(path)) return true;
  const route = canonicalRoute(path);
  return route === undefined || namesApi(route);
}

/**
 * Refuse a path that asks for the token to a caller that did not present
 * it, with 401 and `STUDIO_TOKEN_REQUIRED`, before the request's body is
 * read; let everything else through.
 *
 * @param token - The project's token
 * @param refusal - What the caller is told; a public demo tells its visitors what it does not do for them
 * @returns The middleware, mounted before the routes
 * @example
 * ```ts
 * app.use(tokenGuard(studioToken(root)));
 * ```
 */
export function tokenGuard(token: StudioToken, refusal: string = TOKEN_REFUSAL): RequestHandler {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!requiresToken(`${req.baseUrl}${req.path}`) || token.matches(req.get(TOKEN_HEADER))) {
      next();
      return;
    }
    res.status(401).json({ error: refusal, code: "STUDIO_TOKEN_REQUIRED" });
  };
}

function namesApi(path: string): boolean {
  return path === "/api" || path.startsWith("/api/");
}
