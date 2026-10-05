import compression from "compression";
import express from "express";

import { apiErrors } from "./api-errors";
import { apiNotFound } from "./api-not-found";
import { type ApisRouteDeps, registerApisRoutes } from "./apis-routes";
import { registerConfigDeclareRoutes } from "./config-declare-routes";
import type { ConfigEditDeps } from "./config-edit/declare-alone";
import { MAX_MESSAGE_BYTES } from "./max-message-bytes";
import { registerMockDeclareRoutes } from "./mock-declare-routes";
import type { MocksEditContext } from "./mocks-edit/mocks-edit-context";
import { createOriginGuard } from "./origin-guard";
import { registerSessionRoutes, type SessionRouteDeps } from "./session-routes";
import type { StudioOriginPolicy } from "./studio-origin";
import type { StudioToken } from "./studio-token";
import { tokenGuard } from "./token-guard";

/** What the REST API's routes read and change in the running Studio. */
export interface RestApiDeps {
  /** The project the API-import routes answer from. */
  apis: ApisRouteDeps;
  /** The project the import wizard declares an import in, once its files are written. */
  configEdit: ConfigEditDeps;
  /** The running Studio the mock wizard's edits read and change. */
  mocksEdit: MocksEditContext;
  /** The saved sessions, and what the pages show. */
  sessions: SessionRouteDeps;
  /** The token a writing route asks for. */
  token: StudioToken;
}

/**
 * Mount Studio's REST API: compression, the origin guard, the token a
 * writing route asks for, JSON bodies, the health check, the API and session
 * routes, and JSON answers for a route Studio does not have and for the
 * errors the routes raise.
 *
 * @param app - The Studio server's Express app
 * @param policy - Decides who counts as the Studio UI
 * @param deps - What the routes read and change in the running Studio
 *
 * @example
 * ```ts
 * registerRestApi(app, policy, { apis, configEdit, mocksEdit, sessions, token });
 * ```
 */
export function registerRestApi(
  app: ReturnType<typeof express>,
  policy: StudioOriginPolicy,
  { apis, configEdit, mocksEdit, sessions, token }: RestApiDeps,
): void {
  app.use(compression());
  /* Before anything reads a body: the API is for the Studio UI, not for every
     page the developer happens to have open. */
  app.use("/api", createOriginGuard(policy));
  app.use(tokenGuard(token));
  app.use("/api", express.json({ limit: MAX_MESSAGE_BYTES }));

  app.get("/api/health", (_req, res) => {
    res.json({ status: "ok" });
  });

  registerApisRoutes(app, apis);
  registerSessionRoutes(app, sessions);
  registerMockDeclareRoutes(app, mocksEdit);
  registerConfigDeclareRoutes(app, configEdit);
  app.use("/api", apiNotFound);
  app.use("/api", apiErrors);
}
