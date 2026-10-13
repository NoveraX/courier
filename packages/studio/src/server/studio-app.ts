import express from "express";

/**
 * Studio's Express app, set before anything is mounted on it: each route
 * answers the one path it names, in that case and without a trailing slash,
 * so no spelling reaches a route the token guard reads as another; and no
 * response names the framework, which only tells a caller what to probe for.
 *
 * @returns The app, with nothing mounted yet
 * @example
 * ```ts
 * const app = studioApp();
 * app.post("/api/sessions/save", save); // "/api/sessions/save/" and "/API/sessions/save" reach nothing
 * ```
 */
export function studioApp(): ReturnType<typeof express> {
  const app = express();
  app.enable("case sensitive routing");
  app.enable("strict routing");
  app.disable("x-powered-by");
  return app;
}
