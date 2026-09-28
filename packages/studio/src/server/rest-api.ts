import compression from "compression";
import express from "express";

import { apiErrors } from "./api-errors";
import { apiNotFound } from "./api-not-found";
import { type ApisRouteDeps, registerApisRoutes } from "./apis-routes";
import { MAX_MESSAGE_BYTES } from "./max-message-bytes";
import { registerMockDeclareRoutes } from "./mock-declare-routes";
import type { MocksEditContext } from "./mocks-edit/mocks-edit-context";
import { createOriginGuard } from "./origin-guard";
import { registerSessionRoutes, type SessionRouteDeps } from "./session-routes";
import type { StudioOriginPolicy } from "./studio-origin";

/** What the REST API's routes read and change in the running Studio. */
export interface RestApiDeps {
  /** The project the API-import routes answer from. */
  apis: ApisRouteDeps;
  /** The running Studio the mock wizard's edits read and change. */
  mocksEdit: MocksEditContext;
  /** The saved sessions, and what the pages show. */
  sessions: SessionRouteDeps;
}

/**
 * Mount Studio's REST API: compression, the origin guard, JSON bodies, the
 * health check, the API and session routes, and JSON answers for a route
 * Studio does not have and for the errors the routes raise.
 *
 * @param app - The Studio server's Express app
 * @param policy - Decides who counts as the Studio UI
 * @param deps - What the routes read and change in the running Studio
 *
 * @example
 * ```ts
 * registerRestApi(app, policy, { apis: { project, projectRoot: root }, mocksEdit, sessions });
 * ```
 */
export function registerRestApi(
  app: ReturnType<typeof express>,
  policy: StudioOriginPolicy,
  { apis, mocksEdit, sessions }: RestApiDeps,
): void {
  app.use(compression());
  /* Before anything reads a body: the API is for the Studio UI, not for every
     page the developer happens to have open. */
  app.use("/api", createOriginGuard(policy));
  app.use(express.json({ limit: MAX_MESSAGE_BYTES }));

  app.get("/api/health", (_req, res) => {
    res.json({ status: "ok" });
  });

  registerApisRoutes(app, apis);
  registerSessionRoutes(app, sessions);
  registerMockDeclareRoutes(app, mocksEdit);
  app.use("/api", apiNotFound);
  app.use("/api", apiErrors);
}
