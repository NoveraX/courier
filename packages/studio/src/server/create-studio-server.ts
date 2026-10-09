/**
 * Main Studio server setup.
 */

import { createServer } from "node:http";
import { findTransformCacheDirectory } from "@noverax/courier-studio-core/config";
import express from "express";
import { BindingTable } from "./catalog/binding-table";
import { createConfigSourceNamer } from "./catalog/config-source-names";
import { closeStudio } from "./close-studio";
import { createAnswerObserver } from "./contract-drift/answer-observer";
import { DEMO_REPLAY_BYTES, demoServing } from "./demo/demo-serving";
import { studioAddressFile } from "./editor/studio-address-file";
import { undoUnfinishedImportWrites } from "./import-files/undo-unfinished-import-writes";
import { MAX_MESSAGE_BYTES } from "./max-message-bytes";
import { createAgentCalls } from "./mcp/agent-calls";
import { createLifecycleCoordinator } from "./mock-manager";
import { createMockRegistry, type MockRegistry } from "./mock-registry";
import { mockStoreFile } from "./mock-store-file";
import { mountStudioHttp } from "./mount-studio-http";
import { createProjectState } from "./project-state/create-project-state";
import { resolvedRoot } from "./resolved-root";
import { setupRuntimeNamespace } from "./runtime-namespace";
import { createRuntimePlaygroundRouter } from "./runtime-playground-router";
import { securityHeaders } from "./security-headers";
import { setupUiNamespace } from "./socket-handlers";
import { createStudioSockets } from "./socket-server";
import { openStudioStores } from "./storage/studio-stores";
import { wireStorage } from "./storage-space/storage-wiring";
import { createStudioOriginPolicy } from "./studio-origin";
import { createStudioStartup } from "./studio-startup";
import { studioToken } from "./studio-token";
import type { StudioServer, StudioServerOptions } from "./types";
import { createWatcherStatus } from "./watcher-status";

/**
 * Start Courier Studio for a project: load and watch the project, serve the
 * UI and its API, take events from runtimes, and run the project's mocks.
 *
 * It returns at once. Studio listens where the options pin it, else where
 * the `studio` block of the project's courier.config says, else at the
 * defaults. Pinned to a host and a port, it listens at once; otherwise once
 * its first load of the project has an outcome, so the config is evaluated
 * only once at start. `onReady` is told when it listens, `onStarted` once it
 * listens and that first load has an outcome, and `onError` when it cannot
 * listen.
 *
 * @param options - Where to listen, the project root, and whom to tell
 * @returns The server's URL and token, and how to close it
 * @example
 * ```ts
 * const studio = createStudioServer({
 *   projectRoot,
 *   onStarted: ({ url }) => console.log(`Studio at ${url}`),
 *   onError: (error) => console.error(error.message),
 * });
 * await studio.close();
 * ```
 */
export function createStudioServer(options: StudioServerOptions = {}): StudioServer {
  const { projectRoot = process.cwd(), extraCorsOrigins = [], demo, ...startupOptions } = options;

  const app = express();
  /* Nothing a caller needs, and it names what to probe for. */
  app.disable("x-powered-by");
  app.use(securityHeaders);
  /* A public demo counts what its visitors send, on the sockets and the API alike. */
  const serving = demo ? demoServing() : undefined;
  if (serving) app.use(serving.httpGuard);
  const httpServer = createServer(serving?.serverOptions ?? {}, app);
  serving?.holdServer(httpServer);
  /* An editor finds the project's Studio by a file in `.courier`. */
  const address = studioAddressFile(() => root, !demo);
  const onReady = address.announcing(startupOptions.onReady);
  const startup = createStudioStartup(httpServer, { ...startupOptions, onReady });
  const policy = createStudioOriginPolicy({
    bindHost: startup.host,
    /* The UI's own dev server proxies to Studio under its own host, which Studio takes as its page. */
    extraOrigins: extraCorsOrigins,
  });
  const { io, uiNamespace, runtimeNamespace } = createStudioSockets(
    httpServer,
    policy,
    serving?.sockets,
  );

  // ── Binding table + /runtime namespace (config-driven routing) ─────────────

  const bindingTable = new BindingTable();
  const playgroundRouter = createRuntimePlaygroundRouter({ bindingTable, uiNamespace });
  const agentCalls = createAgentCalls();
  /* Read on each event, by which time the project below exists. */
  const nameSource = createConfigSourceNamer(() => project.snapshot().running?.config);
  /* The loader resolves links; every path shown is relative to the same root. */
  const root = resolvedRoot(projectRoot);
  const stores = openStudioStores(root, serving && DEMO_REPLAY_BYTES);
  const { requestLog, sessions, view, mockLog, playgroundHistory } = stores;
  const token = studioToken(root);
  setupRuntimeNamespace(runtimeNamespace, {
    bindingTable,
    uiNamespace,
    playgroundRouter,
    nameSource,
    requestLog,
    answers: createAnswerObserver(stores.answers),
    agentCalls,
    token,
    maxMessageBytes: serving?.sockets.maxMessageBytes ?? MAX_MESSAGE_BYTES,
  });

  const watcherStatus = createWatcherStatus(uiNamespace);

  // ── Mock Server Manager ──────────────────────────────────────────────────

  const mockRegistry: MockRegistry = createMockRegistry();
  const mockManager = createLifecycleCoordinator({
    mockRegistry,
    uiNamespace,
    basePort: startup.mockBasePort,
    watcherStatus,
    /* The directory Studio's own loads use, looked up as they look it up. */
    transformCacheDirectory: () => findTransformCacheDirectory(projectRoot),
    storeFile: (mockKey) => mockStoreFile(root, mockKey),
    mockLog,
    conditions: stores.mockConditions,
  });

  const storage = wireStorage({ stores, root, mocks: mockManager, uiNamespace });

  // ── The project Studio runs: loaded, watched and told from one place ──────

  const project = createProjectState({
    projectRoot: root,
    bindingTable,
    uiNamespace,
    watcherStatus,
    mocks: { mockRegistry, mockManager },
    onStartup: startup.configRead,
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
    token,
    demo,
    visitors: serving?.visitors({
      callsInFlight: playgroundRouter.callsInFlight,
      recordsIn: mockManager.recordsIn,
    }),
    databaseSize: storage.databaseSize,
    pageState: stores.pageState,
    pins: stores.pins,
  });

  undoUnfinishedImportWrites(root);

  const http = {
    project,
    root,
    projectRoot,
    startup,
    mockManager,
    stores,
    storage,
    token,
    playgroundRouter,
    agentCalls,
    serving,
  };
  mountStudioHttp(app, policy, http);

  startup.start();

  const held = { root, startup, project, mockManager, playgroundRouter, io, storage, stores };
  const close = () => closeStudio({ ...held, address, httpServer });

  return {
    get url() {
      return startup.url();
    },
    token: token.value,
    close,
  };
}
