/**
 * Main Studio server setup.
 */

import { createServer } from "node:http";
import { STUDIO_DEFAULT_PORT } from "@noverax/courier/config";
import { findTransformCacheDirectory } from "@noverax/courier-studio-core/config";
import express from "express";
import { setProjectRoot } from "../context";
import { BindingTable } from "./catalog/binding-table";
import { createConfigSourceNamer } from "./catalog/config-source-names";
import { undoUnfinishedImportWrites } from "./import-files/undo-unfinished-import-writes";
import { listenStudio } from "./listen-studio";
import { createLifecycleCoordinator } from "./mock-manager";
import { createMockRegistry, type MockRegistry } from "./mock-registry";
import { EDIT_FINISH_BUDGET_MS } from "./mocks-edit/edit-timing";
import { createProjectState } from "./project-state/create-project-state";
import { createRequestLog } from "./request-log";
import { resolvedRoot } from "./resolved-root";
import { registerRestApi } from "./rest-api";
import { setupRuntimeNamespace } from "./runtime-namespace";
import { clearStudioServerState } from "./runtime-namespace-state";
import { createRuntimePlaygroundRouter } from "./runtime-playground-router";
import { securityHeaders } from "./security-headers";
import { serveStudioUi } from "./serve-ui";
import { setupUiNamespace } from "./socket-handlers";
import { createStudioSockets } from "./socket-server";
import { createMockLog } from "./storage/mock-log";
import { createPlaygroundHistory } from "./storage/playground-history";
import { createSessionStore } from "./storage/session-rows";
import { openStudioDb } from "./storage/studio-db";
import { createStudioView } from "./storage/studio-view";
import { createStudioOriginPolicy } from "./studio-origin";
import type { StudioServer, StudioServerOptions } from "./types";
import { createWatcherStatus } from "./watcher-status";

/** Where mock-server port allocation starts when nothing says otherwise. */
const DEFAULT_MOCK_BASE_PORT = 7001;

export function createStudioServer(options: StudioServerOptions = {}): StudioServer {
  const {
    port = STUDIO_DEFAULT_PORT,
    host = "localhost",
    projectRoot = process.cwd(),
    mockBasePort = DEFAULT_MOCK_BASE_PORT,
    onReady,
    onError,
    extraCorsOrigins = [],
  } = options;

  setProjectRoot(projectRoot);

  const app = express();
  /* Nothing a caller needs, and it names what to probe for. */
  app.disable("x-powered-by");
  app.use(securityHeaders);
  const httpServer = createServer(app);
  const policy = createStudioOriginPolicy({
    bindHost: host,
    /* The UI's own dev server proxies to Studio under its own host, which Studio takes as its page. */
    extraOrigins: extraCorsOrigins,
  });
  const { io, uiNamespace, runtimeNamespace } = createStudioSockets(httpServer, policy);

  // ── Binding table + /runtime namespace (config-driven routing) ─────────────

  const bindingTable = new BindingTable();
  const playgroundRouter = createRuntimePlaygroundRouter({ bindingTable, uiNamespace });
  /* Read on each event, by which time the project below exists. */
  const nameSource = createConfigSourceNamer(() => project.snapshot().running?.config);
  /* The loader resolves links; every path shown is relative to the same root. */
  const root = resolvedRoot(projectRoot);
  const storage = openStudioDb(root);
  const requestLog = createRequestLog(storage.db);
  const sessions = createSessionStore(storage.db);
  const view = createStudioView(storage.db);
  const mockLog = createMockLog(storage.db);
  const playgroundHistory = createPlaygroundHistory(storage.db);
  setupRuntimeNamespace(runtimeNamespace, {
    bindingTable,
    uiNamespace,
    playgroundRouter,
    nameSource,
    requestLog,
  });

  // ── Watcher Status (unified hot reload indicator) ──────────────────────────

  const watcherStatus = createWatcherStatus(uiNamespace);

  // ── Mock Server Manager ──────────────────────────────────────────────────

  const mockRegistry: MockRegistry = createMockRegistry();
  const mockManager = createLifecycleCoordinator({
    mockRegistry,
    uiNamespace,
    basePort: mockBasePort,
    watcherStatus,
    /* The directory Studio's own loads use, looked up as they look it up. */
    transformCacheDirectory: () => findTransformCacheDirectory(projectRoot),
    mockLog,
  });

  // ── The project Studio runs: loaded, watched and told from one place ──────

  const project = createProjectState({
    projectRoot: root,
    bindingTable,
    uiNamespace,
    watcherStatus,
    mocks: { mockRegistry, mockManager },
  });

  setupUiNamespace({
    uiNamespace,
    bindingTable,
    project,
    projectRoot: root,
    mockManager,
    watcherStatus,
    playgroundRouter,
    requestLog,
    sessions,
    view,
    mockLog,
    playgroundHistory,
  });

  undoUnfinishedImportWrites(root);

  registerRestApi(app, policy, {
    apis: { project, projectRoot: root },
    mocksEdit: {
      projectRoot,
      mockBasePort,
      project,
      studioPort: () => address.port(),
      mockSummaries: mockManager.summarizeServers,
    },
    sessions: { sessions, view },
  });
  serveStudioUi(app);

  // ── Start ────────────────────────────────────────────────────────────────────

  const address = listenStudio(httpServer, { port, host, onReady, onError });

  const close = async () => {
    await project.finishEdits(EDIT_FINISH_BUDGET_MS);
    await mockManager.stop();
    project.stop();
    playgroundRouter.dispose();
    clearStudioServerState();
    io.close();
    requestLog.close();
    mockLog.close();
    storage.close();
    if (!httpServer.listening) return;
    return new Promise<void>((resolve, reject) => {
      httpServer.close((err) => (err ? reject(err) : resolve()));
    });
  };

  return {
    get url() {
      return address.url();
    },
    close,
  };
}
