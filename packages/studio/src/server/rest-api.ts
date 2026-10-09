import compression from "compression";
import express from "express";

import { apiErrors } from "./api-errors";
import { apiNotFound } from "./api-not-found";
import { type ApisRouteDeps, registerApisRoutes } from "./apis-routes";
import { registerConfigDeclareRoutes } from "./config-declare-routes";
import type { ConfigEditDeps } from "./config-edit/declare-alone";
import { type ContractRouteDeps, registerContractRoutes } from "./contract-drift/contract-routes";
import type { DemoLimits } from "./demo/demo-limits";
import { DEMO_WRITE_REFUSAL } from "./demo/demo-refusals";
import { DEMO_MAX_BODY, demoRestGuard } from "./demo/demo-rest-guard";
import { type EditorRouteDeps, registerEditorRoutes } from "./editor/editor-routes";
import { MAX_MESSAGE_BYTES } from "./max-message-bytes";
import { registerMockDeclareRoutes } from "./mock-declare-routes";
import type { MocksEditContext } from "./mocks-edit/mocks-edit-context";
import { registerOpenApiExportRoutes } from "./openapi-export/openapi-export-routes";
import { createOriginGuard } from "./origin-guard";
import {
  type RecordedTestRouteDeps,
  registerRecordedTestRoutes,
} from "./recorded-tests/recorded-test-routes";
import type { RouteRequest } from "./route-types";
import {
  registerSessionFileRoutes,
  type SessionFileDeps,
} from "./session-file/session-file-routes";
import { registerSessionRoutes, type SessionRouteDeps } from "./session-routes";
import { registerStorageRoutes, type StorageRouteDeps } from "./storage-space/storage-routes";
import type { StudioOriginPolicy } from "./studio-origin";
import type { StudioToken } from "./studio-token";
import { TOKEN_HEADER, tokenGuard } from "./token-guard";
import { registerTrafficSpecRoutes } from "./traffic-spec/traffic-spec-routes";

/** What the REST API's routes read and change in the running Studio. */
export interface RestApiDeps {
  /** The project the API-import routes answer from. */
  apis: ApisRouteDeps;
  /** The project the import wizard declares an import in, once its files are written. */
  configEdit: ConfigEditDeps;
  /** The running Studio the mock wizard's edits read and change. */
  mocksEdit: MocksEditContext;
  /** The saved sessions, and what the pages show. */
  sessions: SessionRouteDeps & Pick<SessionFileDeps, "environment">;
  /** What Studio keeps, which the Storage settings size and clear. */
  storage: StorageRouteDeps;
  /** The project and the sessions a session's calls are saved as a test from. */
  tests: RecordedTestRouteDeps;
  /** The project, and what its endpoints' answers were seen to hold. */
  contract: ContractRouteDeps;
  /** The project and its requests an editor reads beside its calls; none on a public demo. */
  editor?: EditorRouteDeps | undefined;
  /** The token a writing route asks for. */
  token: StudioToken;
  /** The visitors' counts, when Studio serves a public demo. */
  demo?: { limits: DemoLimits } | undefined;
}

/**
 * Mount Studio's REST API: compression, the origin guard, the token a
 * writing route asks for, JSON bodies, the health check, the API and session
 * routes, and JSON answers for a route Studio does not have and for the
 * errors the routes raise. A public demo also counts its visitors' requests,
 * reads smaller bodies, and tells a visitor why it writes nothing.
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
  {
    apis,
    configEdit,
    mocksEdit,
    sessions,
    storage,
    tests,
    contract,
    editor,
    token,
    demo,
  }: RestApiDeps,
): void {
  app.use(compression());
  /* Before anything reads a body: the API is for the Studio UI, not for every
     page the developer happens to have open. */
  app.use("/api", createOriginGuard(policy));
  if (demo) app.use("/api", demoRestGuard(token, demo.limits));
  app.use(tokenGuard(token, demo ? DEMO_WRITE_REFUSAL : undefined));
  app.use("/api", express.json({ limit: demo ? DEMO_MAX_BODY : MAX_MESSAGE_BYTES }));

  app.get("/api/health", (_req, res) => {
    res.json({ status: "ok" });
  });

  /* A demo's visitor has Studio read no file of its own and no private host. */
  const isDemoVisitor = (req: RouteRequest) => !token.matches(req.get?.(TOKEN_HEADER));
  registerApisRoutes(app, demo ? { ...apis, isDemoVisitor } : apis);
  registerSessionRoutes(app, sessions);
  registerSessionFileRoutes(app, sessions);
  registerRecordedTestRoutes(app, tests);
  registerContractRoutes(app, contract);
  registerTrafficSpecRoutes(app);
  registerOpenApiExportRoutes(app, { project: apis.project });
  if (editor) registerEditorRoutes(app, editor);
  registerStorageRoutes(app, storage);
  registerMockDeclareRoutes(app, mocksEdit);
  registerConfigDeclareRoutes(app, configEdit);
  app.use("/api", apiNotFound);
  app.use("/api", apiErrors);
}
