/**
 * The routes that change something, and the check that the caller presented
 * Studio's token for them.
 */

import type { NextFunction, Request, RequestHandler, Response } from "express-serve-static-core";

import type { StudioToken } from "./studio-token";

/** The header a page presents the token in. */
export const TOKEN_HEADER = "x-courier-studio-token";

/**
 * The routes that change the project's files, its mocks, or the data every
 * page shows. Every other route reads.
 */
export const WRITING_ROUTES: ReadonlySet<string> = new Set([
  "/api/apis/write",
  "/api/apis/declare/apply",
  "/api/apis/manage/apply",
  "/api/apis/update/apply",
  "/api/apis/imports/remove",
  "/api/mocks/declare/apply",
  "/api/sessions/save",
  "/api/sessions/load",
  "/api/sessions/delete",
  "/api/sessions/import",
  "/api/tests/plan",
  "/api/tests/write",
  "/api/storage/clear",
  "/api/storage/compact",
]);

/** What a caller without the token is told. */
export const TOKEN_REFUSAL =
  "Studio makes changes only for a page opened from the link it printed in its terminal, which carries this project's token.";

/**
 * Refuse a writing route to a caller that did not present the token, with
 * 401 and `STUDIO_TOKEN_REQUIRED`; let everything else through.
 *
 * @param token - The project's token
 * @param refusal - What the caller is told; a public demo tells its visitors why it writes nothing
 * @returns The middleware, mounted before the routes
 * @example
 * ```ts
 * app.use(tokenGuard(studioToken(root)));
 * ```
 */
export function tokenGuard(token: StudioToken, refusal: string = TOKEN_REFUSAL): RequestHandler {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!WRITING_ROUTES.has(req.path) || token.matches(req.get(TOKEN_HEADER))) {
      next();
      return;
    }
    res.status(401).json({ error: refusal, code: "STUDIO_TOKEN_REQUIRED" });
  };
}
