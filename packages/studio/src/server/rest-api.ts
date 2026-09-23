import compression from "compression";
import express from "express";

import { registerApisRoutes } from "./apis-routes";
import { createOriginGuard } from "./origin-guard";
import { registerSessionRoutes } from "./session-routes";

/**
 * Mount Studio's REST API: compression, the origin guard, JSON bodies, the
 * health check, and the API and session routes.
 *
 * @param app - The Studio server's Express app
 * @param corsOrigins - Origins the Studio UI is served from
 */
export function registerRestApi(
  app: ReturnType<typeof express>,
  corsOrigins: readonly string[],
): void {
  app.use(compression());
  /* Before anything reads a body: the API is for the Studio UI, not for every
     page the developer happens to have open. */
  app.use("/api", createOriginGuard(corsOrigins));
  app.use(express.json({ limit: "5mb" }));

  app.get("/api/health", (_req, res) => {
    res.json({ status: "ok" });
  });

  registerApisRoutes(app);
  registerSessionRoutes(app);
}
