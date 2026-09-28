import type { Request, Response } from "express-serve-static-core";

/**
 * Answer a request for an API route Studio does not have — an unknown
 * path, or a known one under another method — with a JSON 404. Without it,
 * a GET was answered with the UI's index.html, status 200, and any other
 * method with Express's HTML "Cannot POST" page.
 *
 * @param req - The request, under `/api`
 * @param res - Its response
 * @example
 * ```ts
 * app.use("/api", apiNotFound);
 * ```
 */
export function apiNotFound(req: Request, res: Response): void {
  res.status(404).json({ error: `Studio has no API route ${req.method} ${req.originalUrl}` });
}
