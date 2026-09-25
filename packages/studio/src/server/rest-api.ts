import compression from "compression";
import express from "express";

import { apiErrors } from "./api-errors";
import { type ApisRouteDeps, registerApisRoutes } from "./apis-routes";
import { registerMockDeclareRoutes } from "./mock-declare-routes";
import type { MocksEditContext } from "./mocks-edit/mocks-edit-context";
import { createOriginGuard } from "./origin-guard";
import { registerSessionRoutes } from "./session-routes";
import type { StudioOriginPolicy } from "./studio-origin";

/** What the REST API's routes read and change in the running Studio. */
export interface RestApiDeps {
  /** The project the API-import routes answer from. */
  apis: ApisRouteDeps;
  /** The running Studio the mock wizard's edits read and change. */
  mocksEdit: MocksEditContext;
}

/**
 * Mount Studio's REST API: compression, the origin guard, JSON bodies, the
 * health check, the API and session routes, and JSON answers for the errors
 * they raise.
 *
 * @param app - The Studio server's Express app
 * @param policy - Decides who counts as the Studio UI
 * @param deps - What the routes read and change in the running Studio
 *
 * @example
 * ```ts
 * registerRestApi(app, policy, { apis: { project, projectRoot: root }, mocksEdit });
 * ```
 */
export function registerRestApi(
  app: ReturnType<typeof express>,
  policy: StudioOriginPolicy,
  { apis, mocksEdit }: RestApiDeps,
): void {
  app.use(compression());
  /* Before anything reads a body: the API is for the Studio UI, not for every
     page the developer happens to have open. */
  app.use("/api", createOriginGuard(policy));
  app.use(express.json({ limit: "5mb" }));

  app.get("/api/health", (_req, res) => {
    res.json({ status: "ok" });
  });

  registerApisRoutes(app, apis);
  registerSessionRoutes(app);
  registerMockDeclareRoutes(app, mocksEdit);
  app.use("/api", apiErrors);
}
