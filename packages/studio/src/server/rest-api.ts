import compression from "compression";
import express from "express";

import { apiErrors } from "./api-errors";
import { registerApisRoutes } from "./apis-routes";
import { registerMockDeclareRoutes } from "./mock-declare-routes";
import type { MocksEditContext } from "./mocks-edit/mocks-edit-context";
import { createOriginGuard } from "./origin-guard";
import { registerSessionRoutes } from "./session-routes";
import type { StudioOriginPolicy } from "./studio-origin";

/**
 * Mount Studio's REST API: compression, the origin guard, JSON bodies, the
 * health check, the API and session routes, and JSON answers for the errors
 * they raise.
 *
 * @param app - The Studio server's Express app
 * @param policy - Decides who counts as the Studio UI
 * @param mocksEdit - The running Studio the mock wizard's edits read and change
 */
export function registerRestApi(
  app: ReturnType<typeof express>,
  policy: StudioOriginPolicy,
  mocksEdit: MocksEditContext,
): void {
  app.use(compression());
  /* Before anything reads a body: the API is for the Studio UI, not for every
     page the developer happens to have open. */
  app.use("/api", createOriginGuard(policy));
  app.use(express.json({ limit: "5mb" }));

  app.get("/api/health", (_req, res) => {
    res.json({ status: "ok" });
  });

  registerApisRoutes(app);
  registerSessionRoutes(app);
  registerMockDeclareRoutes(app, mocksEdit);
  app.use("/api", apiErrors);
}
